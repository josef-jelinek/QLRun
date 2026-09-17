const volume = Float64Array.of(
    0.0000,
    0.0137,
    0.0205,
    0.0291,
    0.0423,
    0.0618,
    0.0847,
    0.1369,
    0.1691,
    0.2647,
    0.3527,
    0.4499,
    0.5704,
    0.6873,
    0.8482,
    1.0000,
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
 * Return the chip to its power-on state at the supplied CPU cycle.
 *
 * @param {State} state
 * @param {number} t
 */
export function reset(state, t) {
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

/** @param {State} state */
function tick(state) {
    const clock16 = !state.clockDividerPhase;
    state.clockDividerPhase = !state.clockDividerPhase;
    for (let channel = 0; channel < 3; channel += 1) {
        if (state.toneCounter[channel] === 0) {
            state.toneLevel[channel] ^= 1;
            state.toneCounter[channel] = tonePeriod(state, channel) - 1;
        } else {
            state.toneCounter[channel] -= 1;
        }
    }
    if (!clock16) {
        return;
    }
    if (state.noiseCounter === 0) {
        state.noiseCounter = noisePeriod(state) - 1;
        const feedback = (state.noiseLfsr ^ (state.noiseLfsr >> 3)) & 1;
        state.noiseLfsr = (state.noiseLfsr >> 1) | (feedback << 16);
        state.noiseLevel = state.noiseLfsr & 1;
    } else {
        state.noiseCounter -= 1;
    }
    if (state.env.counter === 0) {
        state.env.counter = envelopePeriod(state) - 1;
        stepEnvelope(state);
    } else {
        state.env.counter -= 1;
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
        }
        state.out[channel] = volume[amp];
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

/** @param {State} state */
function stepEnvelope(state) {
    if (state.env.holding) {
        return;
    }
    if (state.env.step < 15) {
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
            state.env.level = 15;
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
        state.env.level = 15 - state.env.step;
    }
}

/** @param {State} state @param {number} channel @returns {number} */
function tonePeriod(state, channel) {
    return Math.max((state.regs[channel * 2 + 1] & 0x0F) << 8 | state.regs[channel * 2], 1);
}

/** @param {State} state @returns {number} */
function noisePeriod(state) {
    return Math.max(state.regs[regNoise] & 0x1F, 1);
}

/** @param {State} state @returns {number} */
function envelopePeriod(state) {
    return Math.max(state.regs[regEnvFine] | state.regs[regEnvCoarse] << 8, 1);
}
