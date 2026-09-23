const channelCount = 3;
const operatorCount = 4;
const masterClockHz = 2000000;
const defaultPrescaler = 72;
const keyOnRegister = 0x28;
const timerModeRegister = 0x27;
const detuneMultiBase = 0x30;
const totalLevelBase = 0x40;
const attackRateBase = 0x50;
const decayRateBase = 0x60;
const sustainRateBase = 0x70;
const sustainReleaseBase = 0x80;
const ssgEnvelopeBase = 0x90;
const fnumLowBase = 0xA0;
const fnumHighBase = 0xA4;
const channel3FnumLowBase = 0xA8;
const channel3FnumHighBase = 0xAC;
const algorithmBase = 0xB0;
const sineSteps = 1024;
const phaseFraction = 1 << 16;
const phaseCycle = sineSteps * phaseFraction;
const modulationScale = 1 << 28;
const powerResolution = 256;
const powerTableLength = 13 * 2 * powerResolution;
const envelopeQuiet = 832;
const envelopeMax = 1023;
const envelopeSsgEnd = 512;
const envelopeOff = 0;
const envelopeAttack = 1;
const envelopeDecay = 2;
const envelopeSustain = 3;
const envelopeRelease = 4;

const keycodeNote = Uint8Array.of(
    0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 3,
);
const detuneTable = [
    Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    Uint8Array.of(0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 8, 8),
    Uint8Array.of(1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13, 14, 16, 16, 16, 16),
    Uint8Array.of(2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20, 22, 22, 22, 22),
];
const envelopeIncrement = Uint8Array.of(
    0, 1, 0, 1, 0, 1, 0, 1,
    0, 1, 0, 1, 1, 1, 0, 1,
    0, 1, 1, 1, 0, 1, 1, 1,
    0, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 2, 1, 1, 1, 2,
    1, 2, 1, 2, 1, 2, 1, 2,
    1, 2, 2, 2, 1, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 4, 2, 2, 2, 4,
    2, 4, 2, 4, 2, 4, 2, 4,
    2, 4, 4, 4, 2, 4, 4, 4,
    4, 4, 4, 4, 4, 4, 4, 4,
    4, 4, 4, 8, 4, 4, 4, 8,
    4, 8, 4, 8, 4, 8, 4, 8,
    4, 8, 8, 8, 4, 8, 8, 8,
    8, 8, 8, 8, 8, 8, 8, 8,
    16, 16, 16, 16, 16, 16, 16, 16,
    0, 0, 0, 0, 0, 0, 0, 0,
);
const operatorSlot = Uint8Array.of(0, 2, 1, 3);
const specialSlot = Uint8Array.of(1, 2, 0);
const feedbackScale = Uint32Array.of(
    0, 0x100000, 0x200000, 0x400000, 0x800000, 0x1000000, 0x2000000, 0x4000000,
);
const fmPrescaler = Uint8Array.of(24, 24, 72, 36);
const ssgTickRate = Uint32Array.of(500000, 500000, 125000, 250000);
const powerTable = new Float64Array(powerTableLength);
const sineAttenuation = new Uint16Array(sineSteps);

for (let x = 0; x < powerResolution; x += 1) {
    let n = Math.floor(65536 / Math.pow(2, (x + 1) / 256));
    n >>= 4;
    if ((n & 1) !== 0) {
        n = (n >> 1) + 1;
    } else {
        n >>= 1;
    }
    n <<= 2;
    powerTable[x * 2] = n / 8192;
    powerTable[x * 2 + 1] = -n / 8192;
    for (let shift = 1; shift < 13; shift += 1) {
        const at = x * 2 + shift * 2 * powerResolution;
        powerTable[at] = (n >> shift) / 8192;
        powerTable[at + 1] = -(n >> shift) / 8192;
    }
}
for (let i = 0; i < sineSteps; i += 1) {
    const sine = Math.sin((i * 2 + 1) * Math.PI / sineSteps);
    const logarithm = 256 * Math.log2(1 / Math.abs(sine));
    let sign = 1;
    if (sine >= 0) {
        sign = 0;
    }
    sineAttenuation[i] = Math.round(logarithm) * 2 + sign;
}

/**
 * Native-rate YM2203 FM operator. Envelope volume is attenuation from 0 to
 * 1023; phase is a 16.16 index into the 1024-step sine table.
 *
 * @typedef {{
 *   phase: number,
 *   volume: number,
 *   lastOutput: number,
 *   previousOutput: number,
 *   stage: number,
 *   keyOn: boolean,
 *   csmOn: boolean,
 *   ssgInvert: boolean,
 * }} Operator
 *
 * @typedef {{
 *   registers: Uint8Array,
 *   fnumLatch: number,
 *   channel3FnumLatch: number,
 *   channelFnum: Uint16Array,
 *   channelBlock: Uint8Array,
 *   channel3Fnum: Uint16Array,
 *   channel3Block: Uint8Array,
 *   channelMemory: Float64Array,
 *   operators: Operator[],
 *   prescalerSelect: number,
 *   prescaler: number,
 *   resampleAccumulator: number,
 *   previousSample: number,
 *   currentSample: number,
 *   nativeSampleCount: number,
 *   envelopeCounter: number,
 *   timerA: number,
 *   timerB: number,
 *   timerACounter: number,
 *   timerBCounter: number,
 *   status: number,
 *   csmKeyOff: boolean,
 * }} State
 */

/** @returns {State} */
export function create() {
    /** @type {Operator[]} */
    const operators = [];
    for (let i = 0; i < channelCount * operatorCount; i += 1) {
        operators.push(createOperator());
    }
    const state = {
        registers: new Uint8Array(256),
        fnumLatch: 0,
        channel3FnumLatch: 0,
        channelFnum: new Uint16Array(channelCount),
        channelBlock: new Uint8Array(channelCount),
        channel3Fnum: new Uint16Array(channelCount),
        channel3Block: new Uint8Array(channelCount),
        channelMemory: new Float64Array(channelCount),
        operators,
        prescalerSelect: 2,
        prescaler: defaultPrescaler,
        resampleAccumulator: 0,
        previousSample: 0,
        currentSample: 0,
        nativeSampleCount: 0,
        envelopeCounter: 0,
        timerA: 0,
        timerB: 0,
        timerACounter: 0,
        timerBCounter: 0,
        status: 0,
        csmKeyOff: false,
    };
    reset(state);
    return state;
}

/** @param {State} state */
export function reset(state) {
    state.registers.fill(0);
    state.fnumLatch = 0;
    state.channel3FnumLatch = 0;
    state.channelFnum.fill(0);
    state.channelBlock.fill(0);
    state.channel3Fnum.fill(0);
    state.channel3Block.fill(0);
    state.channelMemory.fill(0);
    state.prescalerSelect = 2;
    state.prescaler = defaultPrescaler;
    state.resampleAccumulator = 0;
    state.previousSample = 0;
    state.currentSample = 0;
    state.nativeSampleCount = 0;
    state.envelopeCounter = 0;
    state.timerA = 0;
    state.timerB = 0;
    state.timerACounter = 0;
    state.timerBCounter = 0;
    state.status = 0;
    state.csmKeyOff = false;
    for (const op of state.operators) {
        op.phase = 0;
        op.volume = envelopeMax;
        op.lastOutput = 0;
        op.previousOutput = 0;
        op.stage = envelopeOff;
        op.keyOn = false;
        op.csmOn = false;
        op.ssgInvert = false;
    }
}

/**
 * Select an address, including the address-triggered OPN prescaler controls.
 *
 * @param {State} state
 * @param {number} value
 */
export function writeAddress(state, value) {
    const address = value & 0xFF;
    switch (address) {
    case 0x2D:
        state.prescalerSelect |= 2;
        break;
    case 0x2E:
        state.prescalerSelect |= 1;
        break;
    case 0x2F:
        state.prescalerSelect = 0;
        break;
    default:
        return;
    }
    state.prescaler = fmPrescaler[state.prescalerSelect & 3];
    state.resampleAccumulator = 0;
    state.previousSample = state.currentSample;
}

/** @param {State} state @returns {number} */
export function getSsgTickRate(state) {
    return ssgTickRate[state.prescalerSelect & 3];
}

/** @param {State} state @returns {number} */
export function readStatus(state) {
    return state.status;
}

/**
 * Write a YM2203 register and apply its latch, key, timer, or mode side effects.
 *
 * @param {State} state
 * @param {number} reg
 * @param {number} value
 */
export function writeReg(state, reg, value) {
    const addr = reg & 0xFF;
    const data = value & 0xFF;
    const previousMode = state.registers[timerModeRegister];
    state.registers[addr] = data;
    switch (addr) {
    case 0x24:
        state.timerA = (state.timerA & 3) | (data << 2);
        return;
    case 0x25:
        state.timerA = (state.timerA & 0x3FC) | (data & 3);
        return;
    case 0x26:
        state.timerB = data;
        return;
    case timerModeRegister:
        writeTimerMode(state, previousMode, data);
        return;
    case keyOnRegister:
        keyOperators(state, data);
        return;
    }
    if (addr >= fnumHighBase && addr < fnumHighBase + channelCount) {
        state.fnumLatch = data & 0x3F;
        return;
    }
    if (addr >= fnumLowBase && addr < fnumLowBase + channelCount) {
        const channel = addr - fnumLowBase;
        state.channelFnum[channel] = ((state.fnumLatch & 7) << 8) | data;
        state.channelBlock[channel] = (state.fnumLatch >> 3) & 7;
        return;
    }
    if (addr >= channel3FnumHighBase && addr < channel3FnumHighBase + channelCount) {
        state.channel3FnumLatch = data & 0x3F;
        return;
    }
    if (addr >= channel3FnumLowBase && addr < channel3FnumLowBase + channelCount) {
        const slot = addr - channel3FnumLowBase;
        state.channel3Fnum[slot] = ((state.channel3FnumLatch & 7) << 8) | data;
        state.channel3Block[slot] = (state.channel3FnumLatch >> 3) & 7;
    }
}

/**
 * Resample the native OPN output to one host sample.
 *
 * @param {State} state
 * @param {number} sampleRate
 * @returns {number}
 */
export function takeSample(state, sampleRate) {
    const nativeRate = masterClockHz / state.prescaler;
    state.resampleAccumulator += nativeRate;
    while (state.resampleAccumulator >= sampleRate) {
        state.resampleAccumulator -= sampleRate;
        state.previousSample = state.currentSample;
        state.currentSample = nativeSample(state);
    }
    const mix = state.resampleAccumulator / sampleRate;
    return state.previousSample + (state.currentSample - state.previousSample) * mix;
}

/** @returns {Operator} */
function createOperator() {
    return {
        phase: 0,
        volume: envelopeMax,
        lastOutput: 0,
        previousOutput: 0,
        stage: envelopeOff,
        keyOn: false,
        csmOn: false,
        ssgInvert: false,
    };
}

/** @param {State} state @param {number} previous @param {number} value */
function writeTimerMode(state, previous, value) {
    if ((value & 0x10) !== 0) {
        state.status &= ~1;
    }
    if ((value & 0x20) !== 0) {
        state.status &= ~2;
    }
    if ((value & 1) !== 0 && (previous & 1) === 0) {
        state.timerACounter = 1024 - state.timerA;
    } else if ((value & 1) === 0) {
        state.timerACounter = 0;
    }
    if ((value & 2) !== 0 && (previous & 2) === 0) {
        state.timerBCounter = (256 - state.timerB) * 16;
    } else if ((value & 2) === 0) {
        state.timerBCounter = 0;
    }
    if ((value & 0xC0) !== 0x80 && state.csmKeyOff) {
        releaseCsmOperators(state);
        state.csmKeyOff = false;
    }
}

/** @param {State} state @param {number} value */
function keyOperators(state, value) {
    const channel = value & 3;
    if (channel >= channelCount) {
        return;
    }
    for (let opIndex = 0; opIndex < operatorCount; opIndex += 1) {
        const op = operator(state, channel, opIndex);
        const keyOn = (value & (0x10 << opIndex)) !== 0;
        if (op.keyOn === keyOn) {
            continue;
        }
        op.keyOn = keyOn;
        if (keyOn) {
            op.csmOn = false;
            startOperator(state, channel, opIndex);
        } else if (!op.csmOn) {
            releaseOperator(state, channel, opIndex);
        }
    }
}

/** @param {State} state @param {number} channel @param {number} opIndex */
function startOperator(state, channel, opIndex) {
    const op = operator(state, channel, opIndex);
    op.phase = 0;
    op.ssgInvert = false;
    const attack = operatorRate(state, channel, opIndex, attackRateBase);
    if (attack >= 94) {
        op.volume = 0;
        enterDecay(state, channel, opIndex);
        return;
    }
    const sustain = sustainAttenuation(operatorReg(state, channel, opIndex, sustainReleaseBase));
    if (op.volume <= 0) {
        op.stage = envelopeDecay;
        if (sustain === 0) {
            op.stage = envelopeSustain;
        }
    } else {
        op.stage = envelopeAttack;
    }
}

/** @param {State} state @param {number} channel @param {number} opIndex */
function releaseOperator(state, channel, opIndex) {
    const op = operator(state, channel, opIndex);
    if (op.stage === envelopeOff || op.stage === envelopeRelease) {
        return;
    }
    op.stage = envelopeRelease;
    const ssg = operatorReg(state, channel, opIndex, ssgEnvelopeBase) & 0x0F;
    if ((ssg & 8) === 0) {
        return;
    }
    if (op.ssgInvert !== ((ssg & 4) !== 0)) {
        op.volume = (envelopeSsgEnd - op.volume) & envelopeMax;
    }
    if (op.volume >= envelopeSsgEnd) {
        op.volume = envelopeMax;
        op.stage = envelopeOff;
    }
}

/** @param {State} state @returns {number} */
function nativeSample(state) {
    updateSsgEnvelopes(state);
    let sample = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
        sample += channelSample(state, channel);
    }
    state.nativeSampleCount += 1;
    if (state.nativeSampleCount % 3 === 0) {
        state.envelopeCounter += 1;
        advanceEnvelopes(state);
    }
    const csmKeyOff = state.csmKeyOff;
    state.csmKeyOff = false;
    advanceTimers(state);
    if (csmKeyOff && !state.csmKeyOff) {
        releaseCsmOperators(state);
    }
    return sample / channelCount;
}

/** @param {State} state @param {number} channel @returns {number} */
function channelSample(state, channel) {
    const algorithm = state.registers[algorithmBase + channel] & 7;
    const op0 = operatorOutput(state, channel, 0, feedbackSample(state, channel));
    let op1 = 0;
    let op2 = 0;
    let op3 = 0;
    let result = 0;
    switch (algorithm) {
    case 0:
        op1 = operatorOutput(state, channel, 1, op0 * modulationScale);
        op2 = operatorOutput(state, channel, 2, state.channelMemory[channel] * modulationScale);
        op3 = operatorOutput(state, channel, 3, op2 * modulationScale);
        state.channelMemory[channel] = op1;
        result = op3;
        break;
    case 1:
        op1 = operatorOutput(state, channel, 1, 0);
        op2 = operatorOutput(state, channel, 2, state.channelMemory[channel] * modulationScale);
        op3 = operatorOutput(state, channel, 3, op2 * modulationScale);
        state.channelMemory[channel] = op0 + op1;
        result = op3;
        break;
    case 2:
        op1 = operatorOutput(state, channel, 1, 0);
        op2 = operatorOutput(state, channel, 2, state.channelMemory[channel] * modulationScale);
        op3 = operatorOutput(state, channel, 3, (op0 + op2) * modulationScale);
        state.channelMemory[channel] = op1;
        result = op3;
        break;
    case 3:
        op1 = operatorOutput(state, channel, 1, op0 * modulationScale);
        op2 = operatorOutput(state, channel, 2, 0);
        op3 = operatorOutput(state, channel, 3, (state.channelMemory[channel] + op2) * modulationScale);
        state.channelMemory[channel] = op1;
        result = op3;
        break;
    case 4:
        op1 = operatorOutput(state, channel, 1, op0 * modulationScale);
        op2 = operatorOutput(state, channel, 2, 0);
        op3 = operatorOutput(state, channel, 3, op2 * modulationScale);
        state.channelMemory[channel] = 0;
        result = op1 + op3;
        break;
    case 5:
        op1 = operatorOutput(state, channel, 1, op0 * modulationScale);
        op2 = operatorOutput(state, channel, 2, state.channelMemory[channel] * modulationScale);
        op3 = operatorOutput(state, channel, 3, op0 * modulationScale);
        state.channelMemory[channel] = op0;
        result = op1 + op2 + op3;
        break;
    case 6:
        op1 = operatorOutput(state, channel, 1, op0 * modulationScale);
        op2 = operatorOutput(state, channel, 2, 0);
        op3 = operatorOutput(state, channel, 3, 0);
        state.channelMemory[channel] = 0;
        result = op1 + op2 + op3;
        break;
    default:
        op1 = operatorOutput(state, channel, 1, 0);
        op2 = operatorOutput(state, channel, 2, 0);
        op3 = operatorOutput(state, channel, 3, 0);
        state.channelMemory[channel] = 0;
        result = op0 + op1 + op2 + op3;
    }
    advancePhases(state, channel);
    return result;
}

/** @param {State} state @param {number} channel @param {number} opIndex @param {number} modulation */
function operatorOutput(state, channel, opIndex, modulation) {
    const op = operator(state, channel, opIndex);
    let output = 0;
    if (op.stage !== envelopeOff) {
        const level = operatorReg(state, channel, opIndex, totalLevelBase) & 0x7F;
        const attenuation = outputAttenuation(state, channel, opIndex) + level * 8;
        if (attenuation < envelopeQuiet) {
            const phase = Math.floor((op.phase + modulation) / phaseFraction);
            const powerIndex = attenuation * 8 + sineAttenuation[phase & (sineSteps - 1)];
            if (powerIndex < powerTableLength) {
                output = powerTable[powerIndex];
            }
        }
    }
    op.previousOutput = op.lastOutput;
    op.lastOutput = output;
    return output;
}

/** @param {State} state @param {number} channel */
function advancePhases(state, channel) {
    for (let opIndex = 0; opIndex < operatorCount; opIndex += 1) {
        const op = operator(state, channel, opIndex);
        op.phase += operatorPhaseStep(state, channel, opIndex);
        if (op.phase >= phaseCycle || op.phase < 0) {
            op.phase %= phaseCycle;
            if (op.phase < 0) {
                op.phase += phaseCycle;
            }
        }
    }
}

/** @param {State} state */
function advanceEnvelopes(state) {
    for (let channel = 0; channel < channelCount; channel += 1) {
        for (let opIndex = 0; opIndex < operatorCount; opIndex += 1) {
            advanceEnvelope(state, channel, opIndex);
        }
    }
}

/** @param {State} state @param {number} channel @param {number} opIndex */
function advanceEnvelope(state, channel, opIndex) {
    const op = operator(state, channel, opIndex);
    if (op.stage === envelopeOff) {
        return;
    }
    let rate = 0;
    if (op.stage === envelopeAttack) {
        rate = operatorRate(state, channel, opIndex, attackRateBase);
    } else if (op.stage === envelopeDecay) {
        rate = operatorRate(state, channel, opIndex, decayRateBase);
    } else if (op.stage === envelopeSustain) {
        rate = operatorRate(state, channel, opIndex, sustainRateBase);
    } else {
        const value = operatorReg(state, channel, opIndex, sustainReleaseBase);
        rate = 34 + (value & 0x0F) * 4 + keyScaleRate(state, channel, opIndex);
    }
    const increment = rateIncrement(Math.min(rate, 127), state.envelopeCounter);
    if (increment === 0) {
        return;
    }
    if (op.stage === envelopeAttack) {
        op.volume += ((~op.volume) * increment) >> 4;
        if (op.volume <= 0) {
            op.volume = 0;
            enterDecay(state, channel, opIndex);
        }
        return;
    }
    const ssg = operatorReg(state, channel, opIndex, ssgEnvelopeBase) & 0x0F;
    if ((ssg & 8) !== 0 && op.stage !== envelopeAttack
        && op.stage !== envelopeRelease && op.volume >= envelopeSsgEnd) {
        return;
    }
    let step = increment;
    if ((ssg & 8) !== 0) {
        step *= 4;
    }
    op.volume += step;
    if (op.stage === envelopeDecay) {
        const sustain = sustainAttenuation(operatorReg(state, channel, opIndex, sustainReleaseBase));
        if (op.volume >= sustain) {
            op.stage = envelopeSustain;
        }
        return;
    }
    if (op.stage === envelopeRelease) {
        let end = envelopeMax;
        if ((ssg & 8) !== 0) {
            end = envelopeSsgEnd;
        }
        if (op.volume >= end) {
            op.volume = envelopeMax;
            op.stage = envelopeOff;
        }
    } else if ((ssg & 8) === 0 && op.volume >= envelopeMax) {
        op.volume = envelopeMax;
    }
}

/** @param {State} state @param {number} channel @param {number} opIndex */
function enterDecay(state, channel, opIndex) {
    const op = operator(state, channel, opIndex);
    const sustain = sustainAttenuation(operatorReg(state, channel, opIndex, sustainReleaseBase));
    op.stage = envelopeDecay;
    if (sustain === 0) {
        op.stage = envelopeSustain;
    }
}

/** @param {State} state */
function updateSsgEnvelopes(state) {
    for (let channel = 0; channel < channelCount; channel += 1) {
        for (let opIndex = 0; opIndex < operatorCount; opIndex += 1) {
            const op = operator(state, channel, opIndex);
            const ssg = operatorReg(state, channel, opIndex, ssgEnvelopeBase) & 0x0F;
            if ((ssg & 8) === 0 || op.volume < envelopeSsgEnd
                || op.stage === envelopeOff || op.stage === envelopeRelease) {
                continue;
            }
            if ((ssg & 1) !== 0) {
                if ((ssg & 2) !== 0) {
                    op.ssgInvert = true;
                }
                if (op.stage !== envelopeAttack && op.ssgInvert === ((ssg & 4) !== 0)) {
                    op.volume = envelopeMax;
                }
            } else {
                if ((ssg & 2) !== 0) {
                    op.ssgInvert = !op.ssgInvert;
                } else {
                    op.phase = 0;
                }
                if (op.stage !== envelopeAttack) {
                    const attack = operatorRate(state, channel, opIndex, attackRateBase);
                    if (attack >= 94) {
                        op.volume = 0;
                        enterDecay(state, channel, opIndex);
                    } else if (op.volume <= 0) {
                        enterDecay(state, channel, opIndex);
                    } else {
                        op.stage = envelopeAttack;
                    }
                }
            }
        }
    }
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {number} */
function outputAttenuation(state, channel, opIndex) {
    const op = operator(state, channel, opIndex);
    const ssg = operatorReg(state, channel, opIndex, ssgEnvelopeBase) & 0x0F;
    if ((ssg & 8) !== 0 && op.stage !== envelopeOff && op.stage !== envelopeRelease
        && op.ssgInvert !== ((ssg & 4) !== 0)) {
        return (envelopeSsgEnd - op.volume) & envelopeMax;
    }
    return op.volume;
}

/** @param {number} rate @param {number} counter @returns {number} */
function rateIncrement(rate, counter) {
    let shift = 11;
    let group = 18;
    if (rate >= 32) {
        const effective = rate - 32;
        shift = Math.max(11 - (effective >> 2), 0);
        if (effective < 2) {
            group = 18;
        } else if (effective < 4) {
            group = effective;
        } else if (effective >= 4 && effective < 48) {
            group = effective & 3;
        } else if (effective < 52) {
            group = 4 + (effective & 3);
        } else if (effective < 56) {
            group = 8 + (effective & 3);
        } else if (effective < 60) {
            group = 12 + (effective & 3);
        } else {
            group = 16;
        }
    }
    if ((counter & ((1 << shift) - 1)) !== 0) {
        return 0;
    }
    return envelopeIncrement[group * 8 + ((counter >> shift) & 7)];
}

/** @param {State} state @param {number} channel @param {number} opIndex @param {number} base @returns {number} */
function operatorRate(state, channel, opIndex, base) {
    const value = operatorReg(state, channel, opIndex, base) & 0x1F;
    if (value === 0) {
        return 0;
    }
    return 32 + value * 2 + keyScaleRate(state, channel, opIndex);
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {number} */
function keyScaleRate(state, channel, opIndex) {
    const value = operatorReg(state, channel, opIndex, attackRateBase);
    const shift = 3 - (value >> 6);
    return envelopeKeycode(state, channel, opIndex) >> shift;
}

/** @param {number} value @returns {number} */
function sustainAttenuation(value) {
    const sustain = value >> 4;
    if (sustain >= 15) {
        return 31 * 32;
    }
    return sustain * 32;
}

/** @param {State} state @param {number} channel @returns {number} */
function feedbackSample(state, channel) {
    const feedback = (state.registers[algorithmBase + channel] >> 3) & 7;
    if (feedback === 0) {
        return 0;
    }
    const op = operator(state, channel, 0);
    return (op.lastOutput + op.previousOutput) * feedbackScale[feedback];
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {number} */
function operatorPhaseStep(state, channel, opIndex) {
    const fnum = channelFnum(state, channel, opIndex);
    const block = channelBlock(state, channel, opIndex);
    const multiReg = operatorReg(state, channel, opIndex, detuneMultiBase);
    const multiple = multiReg & 0x0F;
    let multiplier = multiple;
    if (multiple === 0) {
        multiplier = 0.5;
    }
    const keycode = (block << 2) | keycodeNote[(fnum >> 7) & 0x0F];
    const detune = (multiReg >> 4) & 7;
    let detuneIncrement = detuneTable[detune & 3][keycode];
    if ((detune & 4) !== 0) {
        detuneIncrement = -detuneIncrement;
    }
    let increment = fnum * (1 << block) / 2 + detuneIncrement;
    if (increment < 0) {
        increment += 0x20000;
    }
    return Math.floor(increment * multiplier * 64);
}

/** @param {State} state */
function advanceTimers(state) {
    const mode = state.registers[timerModeRegister];
    if (state.timerACounter > 0) {
        state.timerACounter -= 1;
        if (state.timerACounter <= 0) {
            state.timerACounter = 1024 - state.timerA;
            if ((mode & 4) !== 0) {
                state.status |= 1;
            }
            if ((mode & 0xC0) === 0x80) {
                triggerCsmOperators(state);
                state.csmKeyOff = true;
            }
        }
    }
    if (state.timerBCounter > 0) {
        state.timerBCounter -= 1;
        if (state.timerBCounter <= 0) {
            state.timerBCounter = (256 - state.timerB) * 16;
            if ((mode & 8) !== 0) {
                state.status |= 2;
            }
        }
    }
}

/** @param {State} state */
function triggerCsmOperators(state) {
    for (let opIndex = 0; opIndex < operatorCount; opIndex += 1) {
        const op = operator(state, 2, opIndex);
        if (!op.keyOn && !op.csmOn) {
            op.csmOn = true;
            startOperator(state, 2, opIndex);
        }
    }
}

/** @param {State} state */
function releaseCsmOperators(state) {
    for (let opIndex = 0; opIndex < operatorCount; opIndex += 1) {
        const op = operator(state, 2, opIndex);
        if (op.csmOn) {
            op.csmOn = false;
            if (!op.keyOn) {
                releaseOperator(state, 2, opIndex);
            }
        }
    }
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {number} */
function envelopeKeycode(state, channel, opIndex) {
    const block = channelBlock(state, channel, opIndex);
    const fnum = channelFnum(state, channel, opIndex);
    return (block << 2) | keycodeNote[(fnum >> 7) & 0x0F];
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {number} */
function channelFnum(state, channel, opIndex) {
    if (channel === 2 && (state.registers[timerModeRegister] & 0xC0) !== 0 && opIndex < 3) {
        return state.channel3Fnum[specialSlot[opIndex]];
    }
    return state.channelFnum[channel];
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {number} */
function channelBlock(state, channel, opIndex) {
    if (channel === 2 && (state.registers[timerModeRegister] & 0xC0) !== 0 && opIndex < 3) {
        return state.channel3Block[specialSlot[opIndex]];
    }
    return state.channelBlock[channel];
}

/** @param {State} state @param {number} channel @param {number} opIndex @param {number} base @returns {number} */
function operatorReg(state, channel, opIndex, base) {
    return state.registers[base + channel + operatorSlot[opIndex] * operatorCount];
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {Operator} */
function operator(state, channel, opIndex) {
    return state.operators[channel * operatorCount + opIndex];
}
