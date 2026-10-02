/**
 * AY-3-8910 DAC levels measured on a real chip by Introspec, as published in
 * ayumi, normalized to the top level. The small step from 7 to 8 between two
 * large ones is part of the chip's curve.
 */
const ayVolume = Float64Array.of(
    0.0000, 0.0100, 0.0145, 0.0211,
    0.0307, 0.0455, 0.0645, 0.1074,
    0.1266, 0.2050, 0.2922, 0.3728,
    0.4925, 0.6353, 0.8056, 1.0000,
);

/**
 * YM2149 DAC levels measured on a real chip by Introspec, as published in
 * ayumi, normalized to the top level. They rise in linear runs of four rather
 * than in even decibel steps, and the bottom two levels are both silent.
 */
const ymVolume = Float64Array.of(
    0.0000, 0.0000, 0.0047, 0.0077, 0.0110, 0.0140, 0.0170, 0.0200,
    0.0244, 0.0297, 0.0351, 0.0404, 0.0485, 0.0583, 0.0681, 0.0778,
    0.0925, 0.1111, 0.1297, 0.1485, 0.1767, 0.2116, 0.2464, 0.2811,
    0.3337, 0.4004, 0.4674, 0.5344, 0.6352, 0.7580, 0.8799, 1.0000,
);

const regNoise = 6;
const regMixer = 7;
const regAmpA = 8;
const regEnvFine = 11;
const regEnvCoarse = 12;
const regEnvShape = 13;
const ampEnvMode = 0x10;

/**
 * `t` is the CPU cycle integrated up to; channel areas accumulate level times
 * duration until the machine takes the next output sample.
 *
 * @typedef {{
 *   tickT: number,
 *   ymStyle: boolean,
 *   levelMax: number,
 *   t: number,
 *   nextTickT: number,
 *   regs: Uint8Array,
 *   toneCounter: Uint32Array,
 *   toneLevel: Uint8Array,
 *   noiseLfsr: number,
 *   noiseCounter: number,
 *   noiseLevel: number,
 *   env: {
 *     counter: number,
 *     step: number,
 *     attack: boolean,
 *     holding: boolean,
 *     level: number,
 *   },
 *   clockDividerPhase: boolean,
 *   out: Float64Array,
 *   areaA: number,
 *   areaB: number,
 *   areaC: number,
 * }} State
 */

/**
 * Create an AY-3-8910 whose internal divider advances every `tickT` CPU cycles.
 *
 * @param {number} tickT
 * @returns {State}
 */
export function create(tickT) {
    /** @type {State} */
    const state = {
        tickT,
        ymStyle: false,
        levelMax: 15,
        t: 0,
        nextTickT: tickT,
        regs: new Uint8Array(16),
        toneCounter: new Uint32Array(3),
        toneLevel: new Uint8Array(3),
        noiseLfsr: 1,
        noiseCounter: 0,
        noiseLevel: 0,
        env: {counter: 0, step: 0, attack: false, holding: false, level: 0},
        clockDividerPhase: false,
        out: new Float64Array(3),
        areaA: 0,
        areaB: 0,
        areaC: 0,
    };
    reset(state, 0);
    return state;
}

/**
 * Select the chip timing and DAC/envelope style, then reset it at `t`.
 *
 * @param {State} state
 * @param {number} tickT
 * @param {boolean} ymStyle
 * @param {number} t
 */
export function configure(state, tickT, ymStyle, t) {
    state.tickT = tickT;
    state.ymStyle = ymStyle;
    state.levelMax = 15;
    if (ymStyle) {
        state.levelMax = 31;
    }
    reset(state, t);
}

/**
 * Re-anchor the internal divider after a YM2203 prescaler selection.
 *
 * @param {State} state
 * @param {number} tickT
 * @param {number} t
 */
export function setTickPeriod(state, tickT, t) {
    state.tickT = tickT;
    state.nextTickT = t + tickT;
}

/**
 * Return the chip to its power-on state at the supplied CPU cycle.
 *
 * @param {State} state
 * @param {number} t
 */
function reset(state, t) {
    state.regs.fill(0);
    state.regs[regMixer] = 0x3F;
    state.toneCounter.fill(0);
    state.toneLevel.fill(0);
    state.noiseLfsr = 1;
    state.noiseCounter = 0;
    state.noiseLevel = 0;
    state.env.counter = 0;
    state.env.step = 0;
    state.env.attack = false;
    state.env.holding = false;
    state.env.level = 0;
    state.clockDividerPhase = false;
    state.out.fill(0);
    state.areaA = 0;
    state.areaB = 0;
    state.areaC = 0;
    state.t = t;
    state.nextTickT = t + state.tickT;
    refreshLevels(state);
}

/**
 * Re-anchor output collection without changing the running chip state.
 *
 * @param {State} state
 * @param {number} t
 */
export function seek(state, t) {
    if (state.t !== t) {
        state.t = t;
        state.nextTickT = t + state.tickT;
    }
    state.areaA = 0;
    state.areaB = 0;
    state.areaC = 0;
}

/**
 * Update one register after the caller has advanced the chip to the write time.
 *
 * @param {State} state
 * @param {number} reg
 * @param {number} value
 */
export function writeReg(state, reg, value) {
    const addr = reg & 0x0F;
    state.regs[addr] = value & 0xFF;
    if (addr === regEnvShape) {
        resetEnvelope(state);
    }
    refreshLevels(state);
}

/**
 * @param {State} state
 * @param {number} reg
 * @returns {number}
 */
export function readReg(state, reg) {
    return state.regs[reg & 0x0F];
}

/**
 * Advance while accumulating exact time-weighted channel levels.
 *
 * @param {State} state
 * @param {number} t
 */
export function runTo(state, t) {
    advanceTo(state, t, true);
}

/**
 * Advance counters and envelopes while discarding output.
 *
 * @param {State} state
 * @param {number} t
 */
export function runSilent(state, t) {
    advanceTo(state, t, false);
}

/**
 * Store and clear the average channel levels for one output-sample period.
 *
 * @param {State} state
 * @param {number} period
 * @param {Float32Array} channelA
 * @param {Float32Array} channelB
 * @param {Float32Array} channelC
 * @param {number} at
 */
export function takeSample(state, period, channelA, channelB, channelC, at) {
    channelA[at] = state.areaA / period;
    channelB[at] = state.areaB / period;
    channelC[at] = state.areaC / period;
    state.areaA = 0;
    state.areaB = 0;
    state.areaC = 0;
}

/**
 * @param {State} state
 * @param {number} t
 * @param {boolean} collect
 */
function advanceTo(state, t, collect) {
    while (t > state.t) {
        const next = Math.min(state.nextTickT, t);
        const duration = next - state.t;
        if (collect) {
            state.areaA += state.out[0] * duration;
            state.areaB += state.out[1] * duration;
            state.areaC += state.out[2] * duration;
        }
        state.t = next;
        if (state.t === state.nextTickT) {
            tick(state);
            refreshLevels(state);
            state.nextTickT += state.tickT;
        }
    }
}

/**
 * One PSG clock after the input divider: the tones step on every tick, the
 * noise on every other one, and the envelope on every other one too, except on
 * a YM2149, where it steps on every tick.
 *
 * @param {State} state
 */
function tick(state) {
    const clock16 = !state.clockDividerPhase;
    state.clockDividerPhase = !state.clockDividerPhase;
    for (let channel = 0; channel < 3; channel += 1) {
        if (state.toneCounter[channel] === 0) {
            state.toneLevel[channel] ^= 1;
            // A zero period counts as one.
            const period = ((state.regs[channel * 2 + 1] & 0x0F) << 8) | state.regs[channel * 2];
            state.toneCounter[channel] = Math.max(period, 1) - 1;
        } else {
            state.toneCounter[channel] -= 1;
        }
    }
    if (clock16) {
        if (state.noiseCounter === 0) {
            state.noiseCounter = Math.max(state.regs[regNoise] & 0x1F, 1) - 1;
            const feedback = (state.noiseLfsr ^ (state.noiseLfsr >> 3)) & 1;
            state.noiseLfsr = (state.noiseLfsr >> 1) | (feedback << 16);
            state.noiseLevel = state.noiseLfsr & 1;
        } else {
            state.noiseCounter -= 1;
        }
    }
    if (clock16 || state.ymStyle) {
        if (state.env.counter === 0) {
            state.env.counter = envelopePeriod(state) - 1;
            stepEnvelope(state);
        } else {
            state.env.counter -= 1;
        }
    }
}

/** @param {State} state */
function refreshLevels(state) {
    const mixer = state.regs[regMixer];
    for (let channel = 0; channel < 3; channel += 1) {
        const toneHigh = state.toneLevel[channel] !== 0 || (mixer & (1 << channel)) !== 0;
        const noiseHigh = state.noiseLevel !== 0 || (mixer & (1 << (channel + 3))) !== 0;
        if (!toneHigh || !noiseHigh) {
            state.out[channel] = 0;
            continue;
        }
        const ampReg = state.regs[regAmpA + channel];
        let amp = ampReg & 0x0F;
        if ((ampReg & ampEnvMode) !== 0) {
            amp = state.env.level;
        } else if (state.ymStyle) {
            // A fixed amplitude N drives DAC level 2N + 1, so 0 shares the
            // silence of level 1 and 15 meets the envelope's top level 31.
            amp = amp * 2 + 1;
        }
        if (state.ymStyle) {
            state.out[channel] = ymVolume[amp];
        } else {
            state.out[channel] = ayVolume[amp];
        }
    }
}

/** @param {State} state */
function resetEnvelope(state) {
    state.env.attack = (state.regs[regEnvShape] & 0x04) !== 0;
    state.env.step = 0;
    state.env.holding = false;
    state.env.counter = envelopePeriod(state) - 1;
    setEnvelopeLevel(state);
}

/**
 * Advance the envelope one level. At the end of a ramp the shape either holds
 * at 0 or at the top level, or starts another ramp, reversing when it
 * alternates.
 *
 * @param {State} state
 */
function stepEnvelope(state) {
    if (state.env.holding) {
        return;
    }
    if (state.env.step < state.levelMax) {
        state.env.step += 1;
        setEnvelopeLevel(state);
        return;
    }
    const shape = state.regs[regEnvShape] & 0x0F;
    if ((shape & 0x08) === 0) {
        state.env.holding = true;
        state.env.level = 0;
        return;
    }
    if ((shape & 0x01) !== 0) {
        state.env.holding = true;
        if ((shape & 0x02) !== 0) {
            state.env.attack = !state.env.attack;
        }
        if (state.env.attack) {
            state.env.level = state.levelMax;
        } else {
            state.env.level = 0;
        }
        return;
    }
    if ((shape & 0x02) !== 0) {
        state.env.attack = !state.env.attack;
    }
    state.env.step = 0;
    setEnvelopeLevel(state);
}

/** @param {State} state */
function setEnvelopeLevel(state) {
    if (state.env.attack) {
        state.env.level = state.env.step;
    } else {
        state.env.level = state.levelMax - state.env.step;
    }
}

/**
 * @param {State} state
 * @returns {number}
 */
function envelopePeriod(state) {
    return Math.max(state.regs[regEnvFine] | state.regs[regEnvCoarse] << 8, 1);
}
