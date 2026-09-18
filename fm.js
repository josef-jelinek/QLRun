const channelCount = 3;
const operatorCount = 4;
const masterClockHz = 2000000;
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
const phaseClockDivisor = 144;
const phaseFnumScale = 1 << 20;
const envelopeCalibrationHz = 24000;
const modulationIndex = 8 * Math.PI;
const envelopeSilence = 0.0001;
const envelopeOff = 0;
const envelopeAttack = 1;
const envelopeDecay = 2;
const envelopeSustain = 3;
const envelopeRelease = 4;

const totalLevelAttenuation = new Float64Array(128);
for (let level = 0; level < totalLevelAttenuation.length; level += 1) {
    totalLevelAttenuation[level] = Math.pow(2, -level / 8);
}

const keycodeNote = Uint8Array.of(
    0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 3,
);
const detuneTable = [
    Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3),
    Uint8Array.of(1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10),
    Uint8Array.of(2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 10, 11, 12, 13, 15, 16, 18, 20, 22, 24),
];
const operatorSlot = Uint8Array.of(0, 2, 1, 3);
const specialSlot = Uint8Array.of(1, 2, 0);

/**
 * Floating-point YM2203 FM state. Operators are channel-major.
 *
 * @typedef {{
 *   phase: number,
 *   envelope: number,
 *   lastOutput: number,
 *   previousOutput: number,
 *   stage: number,
 *   keyOn: boolean,
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
 *   operators: Operator[],
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
        operators,
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
    for (const op of state.operators) {
        op.phase = 0;
        op.envelope = 0;
        op.lastOutput = 0;
        op.previousOutput = 0;
        op.stage = envelopeOff;
        op.keyOn = false;
    }
}

/** @param {State} state @param {number} reg @returns {number} */
export function readReg(state, reg) {
    return state.registers[reg & 0xFF];
}

/**
 * Write a YM2203 register and update its frequency or key latch side effects.
 *
 * @param {State} state
 * @param {number} reg
 * @param {number} value
 */
export function writeReg(state, reg, value) {
    const addr = reg & 0xFF;
    const data = value & 0xFF;
    state.registers[addr] = data;
    if (addr >= fnumHighBase && addr < fnumHighBase + channelCount) {
        state.fnumLatch = data;
        return;
    }
    if (addr >= fnumLowBase && addr < fnumLowBase + channelCount) {
        const channel = addr - fnumLowBase;
        state.channelFnum[channel] = ((state.fnumLatch & 7) << 8) | data;
        state.channelBlock[channel] = (state.fnumLatch >> 3) & 7;
        return;
    }
    if (addr >= channel3FnumHighBase && addr < channel3FnumHighBase + channelCount) {
        state.channel3FnumLatch = data;
        return;
    }
    if (addr >= channel3FnumLowBase && addr < channel3FnumLowBase + channelCount) {
        const slot = addr - channel3FnumLowBase;
        state.channel3Fnum[slot] = ((state.channel3FnumLatch & 7) << 8) | data;
        state.channel3Block[slot] = (state.channel3FnumLatch >> 3) & 7;
        return;
    }
    if (addr === keyOnRegister) {
        keyOperators(state, data);
    }
}

/**
 * Advance all FM operators by one host sample and return the centred mono mix.
 *
 * @param {State} state
 * @param {number} sampleRate
 * @returns {number}
 */
export function takeSample(state, sampleRate) {
    let sample = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
        sample += channelSample(state, channel, sampleRate);
    }
    return sample / channelCount;
}

/** @returns {Operator} */
function createOperator() {
    return {
        phase: 0,
        envelope: 0,
        lastOutput: 0,
        previousOutput: 0,
        stage: envelopeOff,
        keyOn: false,
    };
}

/** @param {State} state @param {number} value */
function keyOperators(state, value) {
    const channel = value & 3;
    if (channel >= channelCount) {
        return;
    }
    for (let opIndex = 0; opIndex < operatorCount; opIndex += 1) {
        const keyOn = (value & (0x10 << opIndex)) !== 0;
        keyOperator(operator(state, channel, opIndex), keyOn);
    }
}

/** @param {Operator} op @param {boolean} keyOn */
function keyOperator(op, keyOn) {
    if (op.keyOn === keyOn) {
        return;
    }
    op.keyOn = keyOn;
    if (keyOn) {
        op.phase = 0;
        op.stage = envelopeAttack;
        return;
    }
    if (op.stage !== envelopeOff) {
        op.stage = envelopeRelease;
    }
}

/**
 * @param {State} state
 * @param {number} channel
 * @param {number} sampleRate
 * @returns {number}
 */
function channelSample(state, channel, sampleRate) {
    const algorithm = state.registers[algorithmBase + channel] & 7;
    const feedback = feedbackSample(state, channel);
    const op0 = operatorOutput(state, channel, 0, feedback, sampleRate);
    let op1 = 0;
    let op2 = 0;
    let op3 = 0;
    switch (algorithm) {
    case 0:
        op1 = operatorOutput(state, channel, 1, op0 * modulationIndex, sampleRate);
        op2 = operatorOutput(state, channel, 2, op1 * modulationIndex, sampleRate);
        return operatorOutput(state, channel, 3, op2 * modulationIndex, sampleRate);
    case 1:
        op1 = operatorOutput(state, channel, 1, 0, sampleRate);
        op2 = operatorOutput(state, channel, 2, (op0 + op1) * modulationIndex, sampleRate);
        return operatorOutput(state, channel, 3, op2 * modulationIndex, sampleRate);
    case 2:
        op1 = operatorOutput(state, channel, 1, 0, sampleRate);
        op2 = operatorOutput(state, channel, 2, op1 * modulationIndex, sampleRate);
        return operatorOutput(state, channel, 3, (op0 + op2) * modulationIndex, sampleRate);
    case 3:
        op1 = operatorOutput(state, channel, 1, op0 * modulationIndex, sampleRate);
        op2 = operatorOutput(state, channel, 2, 0, sampleRate);
        return operatorOutput(state, channel, 3, (op1 + op2) * modulationIndex, sampleRate);
    case 4:
        op1 = operatorOutput(state, channel, 1, op0 * modulationIndex, sampleRate);
        op2 = operatorOutput(state, channel, 2, 0, sampleRate);
        op3 = operatorOutput(state, channel, 3, op2 * modulationIndex, sampleRate);
        return (op1 + op3) * 0.5;
    case 5:
        op1 = operatorOutput(state, channel, 1, op0 * modulationIndex, sampleRate);
        op2 = operatorOutput(state, channel, 2, op0 * modulationIndex, sampleRate);
        op3 = operatorOutput(state, channel, 3, op0 * modulationIndex, sampleRate);
        return (op1 + op2 + op3) / 3;
    case 6:
        op1 = operatorOutput(state, channel, 1, op0 * modulationIndex, sampleRate);
        op2 = operatorOutput(state, channel, 2, 0, sampleRate);
        op3 = operatorOutput(state, channel, 3, 0, sampleRate);
        return (op1 + op2 + op3) / 3;
    default:
        op1 = operatorOutput(state, channel, 1, 0, sampleRate);
        op2 = operatorOutput(state, channel, 2, 0, sampleRate);
        op3 = operatorOutput(state, channel, 3, 0, sampleRate);
        return (op0 + op1 + op2 + op3) * 0.25;
    }
}

/**
 * @param {State} state
 * @param {number} channel
 * @param {number} opIndex
 * @param {number} modulation
 * @param {number} sampleRate
 * @returns {number}
 */
function operatorOutput(state, channel, opIndex, modulation, sampleRate) {
    const op = operator(state, channel, opIndex);
    advanceEnvelope(state, channel, opIndex, sampleRate);
    if (op.stage === envelopeOff) {
        op.previousOutput = op.lastOutput;
        op.lastOutput = 0;
        return 0;
    }
    const frequency = operatorFrequency(state, channel, opIndex);
    op.phase += 2 * Math.PI * frequency / sampleRate;
    if (op.phase >= 2 * Math.PI) {
        op.phase %= 2 * Math.PI;
    }
    const level = operatorReg(state, channel, opIndex, totalLevelBase) & 0x7F;
    const output = Math.sin(op.phase + modulation) * op.envelope * totalLevelAttenuation[level];
    op.previousOutput = op.lastOutput;
    op.lastOutput = output;
    return output;
}

/** @param {State} state @param {number} channel @param {number} opIndex @param {number} sampleRate */
function advanceEnvelope(state, channel, opIndex, sampleRate) {
    const op = operator(state, channel, opIndex);
    if (op.stage === envelopeOff) {
        op.envelope = 0;
        return;
    }
    const attackReg = operatorReg(state, channel, opIndex, attackRateBase);
    const keyScale = attackReg >> 6;
    const keycode = envelopeKeycode(state, channel, opIndex);
    const ssg = operatorReg(state, channel, opIndex, ssgEnvelopeBase);
    const ssgLoop = (ssg & 0x08) !== 0 && (ssg & 0x01) === 0;
    if (op.stage === envelopeAttack) {
        const rate = effectiveRate(attackReg & 0x1F, keycode, keyScale);
        op.envelope += (1 - op.envelope) * attackCoefficient(rate, sampleRate);
        if (op.envelope >= 0.999) {
            op.envelope = 1;
            op.stage = envelopeDecay;
        }
        return;
    }
    if (op.stage === envelopeDecay) {
        const rate = operatorReg(state, channel, opIndex, decayRateBase) & 0x1F;
        const sustain = sustainLevel(operatorReg(state, channel, opIndex, sustainReleaseBase));
        op.envelope *= decayFactor(effectiveRate(rate, keycode, keyScale), sampleRate);
        if (finishOrLoopEnvelope(op, ssgLoop)) {
            return;
        }
        if (op.envelope <= sustain) {
            op.envelope = sustain;
            op.stage = envelopeSustain;
        }
        return;
    }
    if (op.stage === envelopeSustain) {
        const rate = operatorReg(state, channel, opIndex, sustainRateBase) & 0x1F;
        op.envelope *= decayFactor(effectiveRate(rate, keycode, keyScale), sampleRate);
        finishOrLoopEnvelope(op, ssgLoop);
        return;
    }
    const release = operatorReg(state, channel, opIndex, sustainReleaseBase) & 0x0F;
    const rate = effectiveRate(release * 2 + 1, keycode, keyScale);
    op.envelope *= decayFactor(rate, sampleRate);
    if (op.envelope <= envelopeSilence) {
        op.envelope = 0;
        op.stage = envelopeOff;
    }
}

/** @param {Operator} op @param {boolean} loop @returns {boolean} */
function finishOrLoopEnvelope(op, loop) {
    if (op.envelope > envelopeSilence) {
        return false;
    }
    if (loop) {
        op.envelope = 1;
        op.stage = envelopeDecay;
    } else {
        op.envelope = 0;
        op.stage = envelopeOff;
    }
    return true;
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {number} */
function operatorFrequency(state, channel, opIndex) {
    const fnum = channelFnum(state, channel, opIndex);
    if (fnum === 0) {
        return 0;
    }
    const block = channelBlock(state, channel, opIndex);
    const multiReg = operatorReg(state, channel, opIndex, detuneMultiBase);
    const multiple = multiReg & 0x0F;
    let multiplier = multiple;
    if (multiple === 0) {
        multiplier = 0.5;
    }
    const octave = 1 << block;
    let frequency = masterClockHz * fnum * octave * multiplier / (phaseClockDivisor * phaseFnumScale);
    const detune = (multiReg >> 4) & 7;
    const magnitude = detune & 3;
    const increment = fnum * octave / 2;
    if (magnitude !== 0 && increment > 0) {
        const keycode = (block << 2) | keycodeNote[(fnum >> 7) & 0x0F];
        let ratio = detuneTable[magnitude][keycode] / increment;
        if ((detune & 4) !== 0) {
            ratio = -ratio;
        }
        frequency *= 1 + ratio;
    }
    return frequency;
}

/** @param {State} state @param {number} channel @returns {number} */
function feedbackSample(state, channel) {
    const feedback = (state.registers[algorithmBase + channel] >> 3) & 7;
    if (feedback === 0) {
        return 0;
    }
    const op = operator(state, channel, 0);
    const gain = modulationIndex * 0.5 * Math.pow(2, feedback - 7);
    return (op.lastOutput + op.previousOutput) * 0.5 * gain;
}

/** @param {number} rate @param {number} keycode @param {number} keyScale @returns {number} */
function effectiveRate(rate, keycode, keyScale) {
    if (rate === 0) {
        return 0;
    }
    return Math.min(2 * rate + (keycode >> (3 - keyScale)), 63);
}

/** @param {number} rate @param {number} sampleRate @returns {number} */
function decayFactor(rate, sampleRate) {
    if (rate === 0) {
        return 1;
    }
    const halvings = Math.pow(2, rate * 0.25 - 20) * envelopeCalibrationHz / sampleRate;
    return Math.pow(2, -halvings);
}

/** @param {number} rate @param {number} sampleRate @returns {number} */
function attackCoefficient(rate, sampleRate) {
    if (rate === 0) {
        return 0;
    }
    return Math.min(Math.pow(2, rate * 0.25 - 15) * envelopeCalibrationHz / sampleRate, 1);
}

/** @param {number} value @returns {number} */
function sustainLevel(value) {
    const sustain = value >> 4;
    if (sustain >= 15) {
        return 0;
    }
    return Math.pow(10, -0.15 * sustain);
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {number} */
function envelopeKeycode(state, channel, opIndex) {
    const block = channelBlock(state, channel, opIndex);
    const fnum = channelFnum(state, channel, opIndex);
    return (block << 2) | keycodeNote[(fnum >> 7) & 0x0F];
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {number} */
function channelFnum(state, channel, opIndex) {
    if (channel === 2 && (state.registers[timerModeRegister] & 0x40) !== 0 && opIndex < 3) {
        return state.channel3Fnum[specialSlot[opIndex]];
    }
    return state.channelFnum[channel];
}

/** @param {State} state @param {number} channel @param {number} opIndex @returns {number} */
function channelBlock(state, channel, opIndex) {
    if (channel === 2 && (state.registers[timerModeRegister] & 0x40) !== 0 && opIndex < 3) {
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
