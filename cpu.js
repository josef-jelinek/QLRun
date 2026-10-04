export const addressSpaceBytes = 0x100000;
const addrMask = addressSpaceBytes - 1;
export const qdosUserRamBase = 0x20000;
/** Where the QDOS system variables start unless the ROM moves them. */
const qdosSysvarDefaultBase = 0x28000;
/** The long at the start of the QDOS system variables. */
export const qdosSysvarIdent = 0xD2540000;
export const internalIoBase = 0x18000;
const internalIoEnd = 0x1C000;
const zx8301OnboardRamEnd = 0x40000;
const busCycleClocks = 4;
const peripheralEClocks = 10;
const peripheralELowClocks = 6;
const byteBusCycles = 1;
const wordBusCycles = 2;
const longBusCycles = 4;
export const zx8301TimingChunkClocks = 12;
export const zx8301TimingChunksPerLine = 40;
export const zx8301DisplayChunksPerLine = 32;
const zx8301BusSlotsPerChunk = zx8301TimingChunkClocks / busCycleClocks;
const zx8301BusSlotsPerLine = zx8301TimingChunksPerLine * zx8301BusSlotsPerChunk;
const zx8301DisplayBusSlots = zx8301DisplayChunksPerLine * zx8301BusSlotsPerChunk;
const zx8301CpuDisplaySlot = zx8301BusSlotsPerChunk - 1;
const addressErrorVector = 3;
const illegalInstructionVector = 4;
const divideByZeroVector = 5;
const chkVector = 6;
const trapvVector = 7;
const privilegeViolationVector = 8;
const traceVector = 9;
const line1010Vector = 10;
const line1111Vector = 11;
const interruptLevelMask = 7;
const nonmaskableInterruptLevel = 7;
/** Every ZX8302 interrupt, frame and Microdrive gap alike, reaches the 68008 at this level. */
export const qlInterruptLevel = 2;
const interruptExceptionClocks = 72;
const exceptionFrameSize = 6;
const exceptionFramePcOffset = 2;
const busErrorFrameSize = 8;
const busErrorFrameOpcodeOffset = 6;
const autovectorBase = 24;
const byteSize = 1;
const wordSize = 2;
const longSize = 4;
const qdosTrap0Vector = 32;
const qdosTrap4Vector = 36;
const qdosTrap15Vector = 47;
const qdosExceptionStateSysvarOffset = 0x50;
const qdosSysvarBlockMask = 0xF8000;
const addressRegisterBase = 8;
const registerCount = 16;
const stackRegisterIndex = 15;
const stackAddressRegister = 7;
const operandByte = 0;
const operandWord = 1;
const operandLong = 2;
const sizeFieldShift = 6;
const sizeFieldMask = 3;
const invalidSizeField = 3;
const opcodeBitCount = 16;
const opcodeTableEntries = 65536;
const opcodeHostCycleBias = 1;
const opcodeClassSelectBit = 0x4000;
const eaDestinationBit = 0x0100;
const rewriteInvalidTarget = -1;
const rewriteRegisterTargetBase = addrMask + 1;
const maxLinearLongAddr = addrMask - (longSize - 1);

/**
 * Machine-owned memory and hardware operations used by the CPU core.
 *
 * `guestRamTop` and the QSound window let ordinary ROM and RAM accesses stay
 * in this module. `qsoundEnd` is 0 when no card is selected, and the card's
 * window is the one E-clocked by VPA. The QIMSI window lies in the ROM port
 * below `internalIoBase`, starts at an even address, and has an even length;
 * `qimsiEnd` is 0 when it is disconnected. Hardware-window reads and writes
 * still go through the callbacks.
 *
 * @typedef {{
 *   mem: Uint8Array,
 *   guestRamTop: number,
 *   qimsiBase: number,
 *   qimsiEnd: number,
 *   qsoundBase: number,
 *   qsoundEnd: number,
 *   beginHwAccess: function(number, boolean, number): void,
 *   endHwAccess: function(): void,
 *   readHwByte: function(number): number,
 *   readHwLongClock: function(): number,
 *   writeHwByte: function(number, number): void,
 *   beforeMemoryWrite: function(number, number): void,
 *   executeHostOpcode: function(Cpu, number): void,
 *   afterInstruction: function(): void,
 *   resetHardware: function(): void,
 * }} CpuBus
 */

/**
 * Mutable MC68008 execution state, independent of the surrounding machine.
 *
 * @typedef {{
 *   reg: Int32Array,
 *   pc: number,
 *   usp: number,
 *   ssp: number,
 *   code: number,
 *   interruptMask: number,
 *   trace: boolean,
 *   supervisor: boolean,
 *   xflag: boolean,
 *   negative: boolean,
 *   zero: boolean,
 *   overflow: boolean,
 *   carry: boolean,
 *   exception: number,
 *   exceptionPc: number,
 *   currentInstructionPc: number,
 *   pendingInterrupt: number,
 *   stopped: boolean,
 *   extraFlag: boolean,
 *   doTrace: boolean,
 *   nInst: number,
 *   nInst2: number,
 *   cycleCount: number,
 *   cycleLimit: number,
 *   accessActive: boolean,
 *   peripheralWaitCycles: number,
 *   instructionCycleOverride: number,
 *   cycleBudget: number,
 *   rewriteTarget: number,
 *   badAddress: number,
 *   badReadAccess: boolean,
 *   badCodeAddress: boolean,
 * }} Cpu
 */

const operandSizes = [
    {byteCount: 1, signBit: 0x80, valueMask: 0xFF},
    {byteCount: 2, signBit: 0x8000, valueMask: 0xFFFF},
    {byteCount: 4, signBit: 0x80000000, valueMask: 0xFFFFFFFF},
];

const moveOperandSizes = [operandLong, operandByte, operandLong, operandWord];

/** @type {(function(Cpu, CpuBus): void)[]} */
const opcodeTable = new Array(opcodeTableEntries);
const opcodeBaseCycles = new Int16Array(opcodeTableEntries);
let opcodeTableReady = false;

const branchConditionAlways = 0;
const branchConditionSubroutine = 1;
const conditionCodeMask = 15;

const bitOpTest = 0;
const bitOpChange = 1;
const bitOpClear = 2;
const bitOpSet = 3;
const bitOperationMask = 3;

const immediateLogicalAndOp = 1;
const immediateLogicalEorOp = 5;
const immediateCompareOp = 6;

const shiftOperationArithmetic = 0;
const shiftOperationLogical = 1;
const shiftOperationRotateExtend = 2;
const shiftOperationRotate = 3;
const shiftOperationMask = 3;
const shiftRotateLeftBit = 0x100;
const dataRegisterShiftCountRegisterBit = 0x20;
const dataRegisterShiftOperationShift = 3;
const memoryShiftOperationShift = 9;

const opcodeQuickValueShift = 9;
const opcodeQuickValueMask = 7;
const opcodeQuickZeroValue = 8;
const addressArithmeticLongBit = 0x0100;
const immediateAddBit = 0x200;
const quickSubtractBit = 0x100;
const extendArithmeticAddBit = 0x4000;
const extendArithmeticMemoryBit = 8;
const immediateStatusOpcodeMask = 0xF1BF;
const immediateStatusOpcode = 0x003C;
const immediateStatusSrBit = 0x0040;
const movemLongBit = 0x0040;
const movemLoadBit = 0x0400;
const movepLongBit = 0x0040;
const movepRegisterToMemoryBit = 0x0080;
const divideSignedBit = 0x0100;
const multiplySignedBit = 0x0100;
const extLongBit = 0x40;
const jumpWithoutReturnBit = 0x0040;
const moveToStatusSrBit = 0x0200;
const moveUspFromBit = 0x0008;
const moveaWordBit = 0x1000;
const negWithoutExtendBit = 0x0400;
const bitDynamicSourceBit = 0x0100;
const exgFormMask = 0x00F8;
const exgAddressAddressForm = 0x0048;
const exgDataAddressForm = 0x0088;

/**
 * Create an MC68008 execution state with power-on defaults.
 *
 * @returns {Cpu}
 */
export function create() {
    ensureOpcodeTable();
    return {
        reg: new Int32Array(registerCount),
        pc: 0,
        usp: 0,
        ssp: 0,
        code: 0,
        interruptMask: interruptLevelMask,
        trace: false,
        supervisor: true,
        xflag: false,
        negative: false,
        zero: false,
        overflow: false,
        carry: false,
        exception: 0,
        exceptionPc: -1,
        currentInstructionPc: -1,
        pendingInterrupt: 0,
        stopped: false,
        extraFlag: false,
        doTrace: false,
        nInst: 0,
        nInst2: 0,
        cycleCount: 0,
        cycleLimit: 0,
        accessActive: false,
        peripheralWaitCycles: 0,
        instructionCycleOverride: -1,
        cycleBudget: 0,
        rewriteTarget: rewriteInvalidTarget,
        badAddress: 0,
        badReadAccess: false,
        badCodeAddress: false,
    };
}

/**
 * Add a host cycle budget and execute complete instructions until it is spent.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} cycles
 */
export function executeCycleBudget(c, bus, cycles) {
    if (cycles <= 0) {
        return;
    }
    c.cycleBudget += cycles;
    while (c.cycleCount < c.cycleBudget) {
        const remaining = c.cycleBudget - c.cycleCount;
        executeCycleChunk(c, bus, Math.min(remaining, 0x7FFFFFFF));
        if (c.stopped) {
            c.cycleCount = c.cycleBudget;
            return;
        }
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} cycles
 */
function executeCycleChunk(c, bus, cycles) {
    if (!prepareExecuteChunk(c, bus)) {
        return;
    }
    c.cycleLimit = c.cycleCount + cycles;
    executeTimedLoop(c, bus);
}

/**
 * Run instructions until the cycle limit or the chunk's instruction count,
 * entering exceptions and interrupts between them.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function executeTimedLoop(c, bus) {
    for (;;) {
        while (c.nInst > 0) {
            c.nInst -= 1;
            executeTimedPcInstruction(c, bus);
            if (c.cycleCount >= c.cycleLimit) {
                c.nInst = 0;
                break;
            }
        }
        if (!c.extraFlag) {
            return;
        }
        c.nInst = c.nInst2;
        exceptionProcessing(c, bus);
        if (c.nInst <= 0) {
            return;
        }
    }
}

/**
 * Raise the ZX8301 frame interrupt at the next CPU execution boundary.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
export function frameInterrupt(c, bus) {
    requestInterrupt(c, qlInterruptLevel);
    processInterrupts(c, bus);
}

/**
 * Queue an interrupt level for service at the next execution boundary.
 *
 * @param {Cpu} c
 * @param {number} level
 */
export function requestInterrupt(c, level) {
    c.pendingInterrupt = level;
    c.extraFlag = true;
    c.nInst2 = c.nInst;
    c.nInst = 0;
}

/**
 * Reset CPU state and load the initial stack pointer and program counter.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
export function reset(c, bus) {
    for (let i = 0; i < registerCount; i += 1) {
        c.reg[i] = 0;
    }
    c.reg[stackRegisterIndex] = readPointerLong(bus.mem, 0) | 0;
    c.ssp = c.reg[stackRegisterIndex];
    setPc(c, readPointerLong(bus.mem, longSize) | 0);
    c.code = 0;
    c.usp = 0;
    c.interruptMask = interruptLevelMask;
    c.supervisor = true;
    c.doTrace = false;
    c.trace = false;
    c.xflag = false;
    c.negative = false;
    c.zero = false;
    c.overflow = false;
    c.carry = false;
    c.nInst = 0;
    c.nInst2 = 0;
    c.exception = 0;
    c.exceptionPc = -1;
    c.currentInstructionPc = -1;
    c.accessActive = false;
    c.peripheralWaitCycles = 0;
    c.cycleCount = 0;
    c.cycleLimit = 0;
    c.instructionCycleOverride = -1;
    c.cycleBudget = 0;
    c.badAddress = 0;
    c.badReadAccess = false;
    c.rewriteTarget = rewriteInvalidTarget;
    c.extraFlag = false;
    c.pendingInterrupt = 0;
    c.stopped = false;
    c.badCodeAddress = false;
}

/**
 * Replace one opcode slot after the table is built for ROM pseudo-ops.
 * Line-A/F host hooks are charged as a trap-sized 62 clocks.
 *
 * @param {number} opcode
 * @param {function(Cpu, CpuBus): void} handler
 */
export function setOpcode(opcode, handler) {
    ensureOpcodeTable();
    opcodeTable[opcode] = handler;
    let hostCycles = mc68008StaticInstructionCycles(opcode);
    const opcodeClass = opcode & 0xF000;
    if (hostCycles <= 0 && (opcodeClass === 0xA000 || opcodeClass === 0xF000)) {
        hostCycles = 62;
    }
    opcodeBaseCycles[opcode] = -hostCycles - opcodeHostCycleBias;
}

/**
 * Run a handler without fetching an opcode word, leaving PC on any immediate.
 * Used to finish a ROM instruction after a patched opcode has been restored,
 * and by the disk drivers to return from a host call with RTS.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} opcode
 */
export function executeOpcode(c, bus, opcode) {
    const instructionCycleStart = c.cycleCount;
    const savedPeripheralWaitCycles = c.peripheralWaitCycles;
    c.peripheralWaitCycles = 0;
    c.currentInstructionPc = c.pc;
    executeLoadedOpcode(c, bus, opcode, instructionCycleStart);
    c.peripheralWaitCycles = savedPeripheralWaitCycles;
}

/** Build the shared opcode dispatch and base-cycle tables once. */
function ensureOpcodeTable() {
    if (opcodeTableReady) {
        return;
    }
    for (let i = 0; i < opcodeTableEntries; i += 1) {
        opcodeTable[i] = raiseIllegalInstruction;
    }
    setOpcodeHandler("0000x0x0xxxxxxxx", immediateLogicalOp);
    setOpcodeHandler("0000x0x011xxxxxx", raiseIllegalInstruction);
    setOpcodeHandler("0000x0x00x111100", immediateLogicalOp);
    setOpcodeHandler("00001000xxxxxxxx", bitOp);
    setOpcodeHandler("0000xxx1xxxxxxxx", bitOp);
    setOpcodeHandler("0000xxx1xx001xxx", movepOp);
    setOpcodeHandler("000001x0xxxxxxxx", immediateAddSubtractOp);
    setOpcodeHandler("000001x011xxxxxx", raiseIllegalInstruction);
    setOpcodeHandler("00001100xxxxxxxx", cmpiOp);
    setOpcodeHandler("0000110011xxxxxx", raiseIllegalInstruction);
    setOpcodeHandler("0001xxxxxxxxxxxx", moveOp);
    setOpcodeHandler("001xxxxxxxxxxxxx", moveOp);
    setOpcodeHandler("001xxxx001xxxxxx", moveaOp);
    setOpcodeHandler("01000000xxxxxxxx", negOp);
    setOpcodeHandler("0100000011xxxxxx", moveFromSr);
    setOpcodeHandler("0100xxx110xxxxxx", chkOp);
    setOpcodeHandler("0100xxx111xxxxxx", leaOp);
    setOpcodeHandler("01000010xxxxxxxx", clrOp);
    setOpcodeHandler("0100001011xxxxxx", raiseIllegalInstruction);
    setOpcodeHandler("01000100xxxxxxxx", negOp);
    setOpcodeHandler("0100010011xxxxxx", moveToStatus);
    setOpcodeHandler("01000110xxxxxxxx", notOp);
    setOpcodeHandler("0100011011xxxxxx", moveToStatus);
    setOpcodeHandler("0100100000xxxxxx", nbcdOp);
    setOpcodeHandler("0100100001xxxxxx", peaOp);
    setOpcodeHandler("0100100001000xxx", swapOp);
    setOpcodeHandler("010010001xxxxxxx", movemOp);
    setOpcodeHandler("0100100010000xxx", extOp);
    setOpcodeHandler("0100100011000xxx", extOp);
    setOpcodeHandler("01001010xxxxxxxx", tstOp);
    setOpcodeHandler("0100101011xxxxxx", tasOp);
    setOpcodeHandler("0100101011111xxx", raiseIllegalInstruction);
    setOpcodeHandler("010010101111100x", tasOp);
    setOpcodeHandler("010011001xxxxxxx", movemOp);
    setOpcodeHandler("010011100100xxxx", trapOp);
    setOpcodeHandler("0100111001010xxx", linkOp);
    setOpcodeHandler("0100111001011xxx", unlkOp);
    setOpcodeHandler("010011100110xxxx", moveUsp);
    setOpcodeHandler("0100111001110000", resetOp);
    setOpcodeHandler("0100111001110001", nopOp);
    setOpcodeHandler("0100111001110010", stopOp);
    setOpcodeHandler("0100111001110011", rteOp);
    setOpcodeHandler("0100111001110101", rtsOp);
    setOpcodeHandler("0100111001110110", trapvOp);
    setOpcodeHandler("0100111001110111", rtrOp);
    setOpcodeHandler("010011101xxxxxxx", jumpOp);
    setOpcodeHandler("0101xxxxxxxxxxxx", quickDataAlterable);
    setOpcodeHandler("0101xxx001001xxx", quickAddressRegister);
    setOpcodeHandler("0101xxx010001xxx", quickAddressRegister);
    setOpcodeHandler("0101xxxx11xxxxxx", sccOp);
    setOpcodeHandler("0101xxxx11001xxx", dbccOp);
    setOpcodeHandler("0101xxx101001xxx", quickAddressRegister);
    setOpcodeHandler("0101xxx110001xxx", quickAddressRegister);
    setOpcodeHandler("0110xxxxxxxxxxxx", branchOp);
    setOpcodeHandler("0111xxx0xxxxxxxx", moveqOp);
    setOpcodeHandler("1000xxxxxxxxxxxx", logicalRegisterOp);
    setOpcodeHandler("1000xxxx11xxxxxx", divideOp);
    setOpcodeHandler("1000xxx10000xxxx", bcdOp);
    setOpcodeHandler("1001xxxxxxxxxxxx", addSubtractOp);
    setOpcodeHandler("1001xxxx11xxxxxx", addressArithmeticOp);
    setOpcodeHandler("1001xxx10000xxxx", extendArithmeticOp);
    setOpcodeHandler("1001xxx10100xxxx", extendArithmeticOp);
    setOpcodeHandler("1001xxx11000xxxx", extendArithmeticOp);
    setOpcodeHandler("1011xxx0xxxxxxxx", cmpOp);
    setOpcodeHandler("1011xxx1xxxxxxxx", logicalRegisterOp);
    setOpcodeHandler("1011xxx1xx001xxx", cmpmOp);
    setOpcodeHandler("1011xxxx11xxxxxx", cmpOp);
    setOpcodeHandler("1100xxxxxxxxxxxx", logicalRegisterOp);
    setOpcodeHandler("1100xxxx11xxxxxx", multiplyOp);
    setOpcodeHandler("1100xxx10000xxxx", bcdOp);
    setOpcodeHandler("1100xxx10100xxxx", exgOp);
    setOpcodeHandler("1100xxx110001xxx", exgOp);
    setOpcodeHandler("1101xxxxxxxxxxxx", addSubtractOp);
    setOpcodeHandler("1101xxxx11xxxxxx", addressArithmeticOp);
    setOpcodeHandler("1101xxx10000xxxx", extendArithmeticOp);
    setOpcodeHandler("1101xxx10100xxxx", extendArithmeticOp);
    setOpcodeHandler("1101xxx11000xxxx", extendArithmeticOp);
    setOpcodeHandler("1110xxxx0xxxxxxx", shiftRotateDataRegister);
    setOpcodeHandler("1110xxxx10xxxxxx", shiftRotateDataRegister);
    setOpcodeHandler("11100xxx11xxxxxx", shiftRotateMemoryWord);
    setOpcodeHandler("1010xxxxxxxxxxxx", lineEmulatorException);
    setOpcodeHandler("1111xxxxxxxxxxxx", lineEmulatorException);
    for (let i = 0; i < opcodeTableEntries; i += 1) {
        let baseCycles = 0;
        if (opcodeTable[i] !== raiseIllegalInstruction) {
            baseCycles = mc68008StaticInstructionCycles(i);
        }
        opcodeBaseCycles[i] = baseCycles;
    }
    opcodeTableReady = true;
}

/**
 * The opcode table's default handler, so it takes the shared handler
 * signature; other code raises the vector directly.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function raiseIllegalInstruction(c, bus) {
    raiseInstructionException(c, illegalInstructionVector);
}

/**
 * MC68008 clocks known from the opcode alone. Bcc, DBcc, and Scc Dn get the
 * time when they do not branch or set, which their handlers override when
 * they do; register-count shifts, MOVEM, and MULU/MULS are timed by their
 * handlers. 0 leaves an opcode untimed.
 *
 * @param {number} opcode
 * @returns {number}
 */
function mc68008StaticInstructionCycles(opcode) {
    const opcodeClass = opcode & 0xF000;
    const eaMode = (opcode >> 3) & 7;
    const eaReg = opcode & 7;
    const sizeField = (opcode >> sizeFieldShift) & sizeFieldMask;
    const standardSize = operandSizeFromBits(sizeField);

    switch (opcodeClass) {
    case 0x1000:
    case 0x2000:
    case 0x3000:
        const sizeCode = (opcode >> 12) & sizeFieldMask;
        const size = moveOperandSizes[sizeCode];
        const destMode = (opcode >> 6) & 7;
        const destReg = (opcode >> 9) & 7;
        return 8 + cpuEaReadCycles(eaMode, eaReg, size) + cpuEaWriteCycles(destMode, destReg, size);
    case 0x7000:
        if ((opcode & 0x0100) === 0) {
            return 8;
        }
        break;
    case 0x6000:
        switch ((opcode >> 8) & conditionCodeMask) {
        case branchConditionSubroutine:
            return 34;
        case branchConditionAlways:
            return 18;
        }
        // A taken Bcc overrides this with 18.
        if ((opcode & 0xFF) === 0) {
            return 20;
        }
        return 12;
    case 0x0000:
        if ((opcode & 0xF138) === 0x0108) {
            if ((opcode & movepLongBit) !== 0) {
                return 32;
            }
            return 24;
        }
        switch (opcode & 0xFFBF) {
        case 0x003C:
        case 0x023C:
        case 0x0A3C:
            return 32;
        }
        const staticBitOp = (opcode & 0xFF00) === 0x0800;
        const dynamicBitOp = (opcode & 0x0100) !== 0 && (opcode & 0x0038) !== 0x0008;
        if (staticBitOp || dynamicBitOp) {
            const operation = (opcode >> 6) & bitOperationMask;
            // BTST and BCLR swap their MC68008 times here, and BCHG Dn has
            // BCLR's. The Microdrive's whole-pair reads need the ROM's BTST
            // polls this slow.
            let baseCycles = 12;
            if (operation === bitOpClear) {
                baseCycles = 8;
                if (eaMode === 0) {
                    baseCycles = 10;
                }
            } else if (eaMode === 0 && operation === bitOpChange) {
                baseCycles = 14;
            }
            if (staticBitOp) {
                baseCycles += 8;
            }
            if (eaMode === 0) {
                return baseCycles;
            }
            return baseCycles + cpuEaReadCycles(eaMode, eaReg, operandByte);
        }
        const operation = (opcode >> 9) & 7;
        if (eaMode === 0) {
            if (operation === immediateCompareOp && standardSize === operandLong) {
                return 26;
            }
            return cpuCyclesForSize(standardSize, 16, 16, 28);
        }
        if (operation === immediateCompareOp) {
            return cpuCyclesForSize(standardSize, 16, 16, 24) + cpuEaReadCycles(eaMode, eaReg, standardSize);
        }
        return cpuCyclesForSize(standardSize, 20, 24, 40) + cpuEaReadCycles(eaMode, eaReg, standardSize);
    case 0x5000:
        if ((opcode & 0x00F8) === 0x00C8) {
            // DBcc with a true condition; dbccOp overrides the other paths.
            return 20;
        }
        if (sizeField === invalidSizeField) {
            if ((opcode & 0x0038) === 0) {
                // Scc Dn false; sccOp overrides a true one with 10.
                return 8;
            }
            return 12 + cpuEaWriteCycles(eaMode, eaReg, operandByte);
        }
        switch (eaMode) {
        case 0:
            return cpuCyclesForSize(standardSize, 8, 8, 12);
        case 1:
            return 12;
        default:
            return cpuCyclesForSize(standardSize, 12, 16, 24) + cpuEaReadCycles(eaMode, eaReg, standardSize);
        }
    case 0x8000:
        if ((opcode & 0xF1F0) === 0x8100) {
            if ((opcode & 8) !== 0) {
                return 22;
            }
            return 10;
        }
        // DIVU and DIVS take their documented maximum, unlike MULU and MULS,
        // whose handlers count the operand bits.
        if (sizeField === invalidSizeField && (opcode & 0x0100) === 0) {
            return 144 + cpuEaReadCycles(eaMode, eaReg, operandWord);
        }
        if (sizeField === invalidSizeField) {
            return 162 + cpuEaReadCycles(eaMode, eaReg, operandWord);
        }
        if ((opcode & 0x0100) !== 0) {
            return cpuCyclesForSize(standardSize, 12, 16, 24) + cpuEaReadCycles(eaMode, eaReg, standardSize);
        }
        return cpuStandardEaToDnCycles(eaMode, eaReg, standardSize);
    case 0x9000:
    case 0xB000:
    case 0xD000:
        if (sizeField === invalidSizeField) {
            let addressSize = operandWord;
            if ((opcode & addressArithmeticLongBit) !== 0) {
                addressSize = operandLong;
            }
            let baseCycles = 10;
            const direct = eaMode === 0 || eaMode === 1 || (eaMode === 7 && eaReg === 4);
            if (opcodeClass !== 0xB000 && (addressSize === operandWord || direct)) {
                baseCycles = 12;
            }
            return baseCycles + cpuEaReadCycles(eaMode, eaReg, addressSize);
        }
        if (opcodeClass === 0xB000 && (opcode & 0x0138) === 0x0108) {
            return cpuCyclesForSize(standardSize, 16, 24, 40);
        }
        if (opcodeClass !== 0xB000 && (opcode & 0x0130) === 0x0100) {
            if ((opcode & 8) !== 0) {
                return cpuCyclesForSize(standardSize, 22, 34, 58);
            }
            return cpuCyclesForSize(standardSize, 8, 8, 12);
        }
        if ((opcode & 0x0100) !== 0) {
            if (eaMode === 0) {
                // EOR Dn,Dn
                return cpuCyclesForSize(standardSize, 8, 8, 12);
            }
            return cpuCyclesForSize(standardSize, 12, 16, 24) + cpuEaReadCycles(eaMode, eaReg, standardSize);
        }
        if (opcodeClass === 0xB000) {
            // CMP has no extra long clocks for a register or immediate source.
            return cpuCyclesForSize(standardSize, 8, 8, 10) + cpuEaReadCycles(eaMode, eaReg, standardSize);
        }
        return cpuStandardEaToDnCycles(eaMode, eaReg, standardSize);
    case 0xC000:
        const opcodeF1f8 = opcode & 0xF1F8;
        if (opcodeF1f8 === 0xC140 || opcodeF1f8 === 0xC148 || opcodeF1f8 === 0xC188) {
            return 10;
        }
        if ((opcode & 0xF1F0) === 0xC100) {
            if ((opcode & 8) !== 0) {
                return 22;
            }
            return 10;
        }
        if (sizeField === invalidSizeField) {
            return 74 + cpuEaReadCycles(eaMode, eaReg, operandWord);
        }
        if ((opcode & 0x0100) !== 0) {
            return cpuCyclesForSize(standardSize, 12, 16, 24) + cpuEaReadCycles(eaMode, eaReg, standardSize);
        }
        return cpuStandardEaToDnCycles(eaMode, eaReg, standardSize);
    case 0xE000:
        if (sizeField === invalidSizeField) {
            return 16 + cpuEaReadCycles(eaMode, eaReg, operandWord);
        }
        if ((opcode & dataRegisterShiftCountRegisterBit) !== 0) {
            return 0;
        }
        return cpuShiftCycles(opcode, opcodeQuickValue(opcode));
    }
    const opcodeFfc0 = opcode & 0xFFC0;
    switch (opcodeFfc0 & 0xF9C0) {
    case 0x4000:
        return cpuSingleOperandCycles(eaMode, eaReg, operandByte, 8);
    case 0x4040:
        return cpuSingleOperandCycles(eaMode, eaReg, operandWord, 8);
    case 0x4080:
        return cpuSingleOperandCycles(eaMode, eaReg, operandLong, 10);
    }
    if ((opcodeFfc0 & 0xFF00) === 0x4A00 && sizeField !== invalidSizeField) {
        return 8 + cpuEaReadCycles(eaMode, eaReg, standardSize);
    }
    switch (opcodeFfc0) {
    case 0x40C0:
        // MOVE from SR
        if ((opcode & 0x0038) === 0) {
            return 10;
        }
        return 16 + cpuEaWriteCycles(eaMode, eaReg, operandWord);
    case 0x44C0:
    case 0x46C0:
        // MOVE to CCR and SR
        if ((opcode & 0x0038) === 0) {
            return 18;
        }
        return 18 + cpuEaReadCycles(eaMode, eaReg, operandWord);
    case 0x4800:
        return cpuSingleOperandCycles(eaMode, eaReg, operandByte, 10);
    case 0x4AC0:
        if ((opcode & 0x0038) === 0) {
            return 8;
        }
        return 14 + cpuEaReadCycles(eaMode, eaReg, operandByte);
    case 0x4840:
        // SWAP Dn, then PEA
        if ((opcode & 0x0038) === 0) {
            return 8;
        }
        return cpuJumpCycles(eaMode, eaReg, 24, 32, 36);
    case 0x4E80:
        return cpuJumpCycles(eaMode, eaReg, 32, 34, 38);
    case 0x4EC0:
        return cpuJumpCycles(eaMode, eaReg, 16, 18, 22);
    }
    const opcodeFff8 = opcode & 0xFFF8;
    if ((opcodeFff8 & 0xFFBF) === 0x4880) {
        return 8;
    }
    const movemGroup = opcodeFfc0 & 0xFB80;
    if (movemGroup === 0x4880) {
        return 0;
    }
    switch (opcode & 0xF1C0) {
    case 0x4180:
        return 14 + cpuEaReadCycles(eaMode, eaReg, operandWord);
    case 0x41C0:
        return cpuJumpCycles(eaMode, eaReg, 8, 16, 20);
    }
    switch (opcode) {
    case 0x4E70:
        return 136;
    case 0x4E71:
    case 0x4E76:
        return 8;
    case 0x4E72:
        return 4;
    case 0x4E73:
    case 0x4E77:
        return 40;
    case 0x4E75:
        return 32;
    }
    switch (opcode & 0xFFF0) {
    case 0x4E40:
        return 62;
    case 0x4E60:
        return 8;
    }
    switch (opcodeFff8) {
    case 0x4E50:
        return 32;
    case 0x4E58:
        return 24;
    }
    return 0;
}

/**
 * @param {number} mode
 * @param {number} r
 * @param {number} size
 * @returns {number}
 */
function cpuEaWriteCycles(mode, r, size) {
    switch (mode) {
    case 0:
    case 1:
        return 0;
    case 2:
    case 3:
    case 4:
        return cpuCyclesForSize(size, 4, 8, 16);
    case 5:
        return cpuCyclesForSize(size, 12, 16, 24);
    case 6:
        return cpuCyclesForSize(size, 14, 18, 26);
    case 7:
        switch (r) {
        case 0:
            return cpuCyclesForSize(size, 12, 16, 24);
        case 1:
            return cpuCyclesForSize(size, 20, 24, 32);
        }
        break;
    }
    return 0;
}

/**
 * @param {number} mode
 * @param {number} r
 * @param {number} size
 * @returns {number}
 */
function cpuStandardEaToDnCycles(mode, r, size) {
    let baseCycles = cpuCyclesForSize(size, 8, 8, 10);
    if (size === operandLong && (mode === 0 || mode === 1 || (mode === 7 && r === 4))) {
        baseCycles = 12;
    }
    return baseCycles + cpuEaReadCycles(mode, r, size);
}

/**
 * Clocks for a single-operand instruction: `registerCycles` on a data
 * register, otherwise its memory form for the size plus the operand fetch.
 *
 * @param {number} mode
 * @param {number} r
 * @param {number} size
 * @param {number} registerCycles
 * @returns {number}
 */
function cpuSingleOperandCycles(mode, r, size, registerCycles) {
    if (mode === 0) {
        return registerCycles;
    }
    return cpuCyclesForSize(size, 12, 16, 24) + cpuEaReadCycles(mode, r, size);
}

/**
 * @param {number} mode
 * @param {number} r
 * @param {number} anCycles
 * @param {number} dispCycles
 * @param {number} indexCycles
 * @returns {number}
 */
function cpuJumpCycles(mode, r, anCycles, dispCycles, indexCycles) {
    if (mode === 2) {
        return anCycles;
    }
    if (mode === 5 || (mode === 7 && (r === 0 || r === 2))) {
        return dispCycles;
    }
    if (mode === 6 || (mode === 7 && r === 3)) {
        return indexCycles;
    }
    if (mode === 7 && r === 1) {
        return dispCycles + 6;
    }
    return 0;
}

/**
 * Install a handler for every opcode that matches a 16-character pattern,
 * most significant bit first: `0` and `1` are fixed bits and `x` matches both.
 *
 * @param {string} pattern
 * @param {function(Cpu, CpuBus): void} handler
 */
function setOpcodeHandler(pattern, handler) {
    let fixedBits = 0;
    let floatingBits = 0;
    for (let i = 0; i < opcodeBitCount; i += 1) {
        const bit = 1 << (opcodeBitCount - 1 - i);
        switch (pattern[i]) {
        case "1":
            fixedBits |= bit;
            break;
        case "x":
            floatingBits |= bit;
            break;
        }
    }
    let floatingVariant = floatingBits;
    for (;;) {
        opcodeTable[fixedBits | floatingVariant] = handler;
        if (floatingVariant === 0) {
            break;
        }
        floatingVariant = (floatingVariant - 1) & floatingBits;
    }
}

/**
 * Run a QDOS trap synchronously from a host pseudo-op, returning when the
 * guest handler reaches the pseudo-op's continuation PC or the limit expires.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} trap
 * @param {number} callId
 * @param {number} instructionLimit
 */
export function callTrap(c, bus, trap, callId, instructionLimit) {
    if (c.stopped || instructionLimit <= 0) {
        return;
    }
    c.reg[0] = callId;
    c.exception = qdosTrap0Vector + trap;
    c.extraFlag = true;
    runGuestCall(c, bus, c.pc, instructionLimit);
}

/**
 * Call a guest subroutine synchronously from a host pseudo-op.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} address
 * @param {number} instructionLimit
 */
export function callSubroutine(c, bus, address, instructionLimit) {
    if (c.stopped || instructionLimit <= 0 || (address & 1) !== 0) {
        return;
    }
    const returnPc = c.pc;
    if (!pushLongToStack(c, bus, returnPc)) {
        return;
    }
    setPc(c, address | 0);
    c.extraFlag = false;
    runGuestCall(c, bus, returnPc, instructionLimit);
}

/**
 * Execute a bounded nested guest call without disturbing the outer loop. It
 * runs until back at `returnPc`, through any interrupt taken on the way, and
 * ends early after `instructionLimit` instructions or where exception
 * processing or a STOP halts the run.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} returnPc
 * @param {number} instructionLimit
 */
function runGuestCall(c, bus, returnPc, instructionLimit) {
    const savedCode = c.code;
    const savedInstructionPc = c.currentInstructionPc;
    const savedAccess = c.accessActive;
    const savedPeripheralWaitCycles = c.peripheralWaitCycles;
    const savedOverride = c.instructionCycleOverride;
    const savedNInst = c.nInst;
    const savedNInst2 = c.nInst2;
    c.accessActive = false;
    if (!c.extraFlag) {
        c.exception = 0;
    }
    let remaining = instructionLimit;
    c.nInst = remaining;
    if (c.extraFlag) {
        c.nInst2 = c.nInst;
        c.nInst = 0;
    }
    for (;;) {
        while (c.nInst > 0 && remaining > 0 && c.pc !== returnPc) {
            c.nInst -= 1;
            remaining -= 1;
            executeTimedPcInstruction(c, bus);
        }
        // Out of instructions, an exception the last one raised is still
        // taken, so none is left for the outer loop.
        if (c.nInst > 0 || (remaining <= 0 && c.exception === 0)) {
            break;
        }
        if (c.extraFlag) {
            c.nInst = c.nInst2;
            exceptionProcessing(c, bus);
        }
        // STOP and an aborting exception clear both counters. Otherwise a spent
        // count only ends a chunk, as after an interrupt taken or one left
        // pending under the mask, and the call goes on.
        if (c.nInst <= 0 && (c.nInst2 <= 0 || !prepareExecuteChunk(c, bus))) {
            break;
        }
    }
    c.nInst = savedNInst;
    c.nInst2 = savedNInst2;
    c.code = savedCode;
    c.currentInstructionPc = savedInstructionPc;
    c.accessActive = savedAccess;
    c.peripheralWaitCycles = savedPeripheralWaitCycles;
    c.instructionCycleOverride = savedOverride;
}

/**
 * Take a pending interrupt and set the instruction counters for the next
 * chunk; false while the CPU stays stopped.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @returns {boolean}
 */
function prepareExecuteChunk(c, bus) {
    c.extraFlag = false;
    processInterrupts(c, bus);
    if (c.stopped) {
        return false;
    }
    c.exception = 0;
    c.extraFlag =
        c.trace ||
        c.doTrace ||
        c.pendingInterrupt === nonmaskableInterruptLevel ||
        c.pendingInterrupt > c.interruptMask;
    c.nInst = 0x7FFFFFFF;
    if (c.extraFlag) {
        c.nInst2 = c.nInst;
        c.nInst = 0;
    }
    return true;
}

/**
 * Enter a pending interrupt, then a raised exception, then a trace exception,
 * and set the instruction counters for the next check. Address errors get the
 * longer group 0 frame.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function exceptionProcessing(c, bus) {
    if (c.pendingInterrupt !== 0 && !c.doTrace) {
        processInterrupts(c, bus);
    }
    if (c.exception !== 0) {
        if (c.exception < qdosTrap0Vector || c.exception > qdosTrap4Vector) {
            c.extraFlag =
                (c.exception > traceVector && c.exception < qdosTrap0Vector) ||
                c.exception > qdosTrap15Vector;
            if (!c.extraFlag) {
                const sysvars = qdosSysvarBase(c, bus.mem);
                c.extraFlag = readPointerLong(bus.mem, sysvars + qdosExceptionStateSysvarOffset) === 0;
            }
            if (c.extraFlag) {
                c.nInst2 = 0;
                c.nInst = 0;
            }
        }
        let stackedPc = c.pc;
        if (c.exceptionPc >= 0) {
            stackedPc = c.exceptionPc;
        }
        const vector = c.exception;
        const handlerPc = readPointerLong(bus.mem, vector * longSize) | 0;
        pushCpuExceptionFrame(c, bus, stackedPc);
        setPc(c, handlerPc);
        if (vector === addressErrorVector) {
            c.reg[stackRegisterIndex] = addressOffset(c.reg[stackRegisterIndex], -busErrorFrameSize);
            writeWord(c, bus, addressOffset(c.reg[stackRegisterIndex], busErrorFrameOpcodeOffset), c.code);
            writeLong(c, bus, addressOffset(c.reg[stackRegisterIndex], exceptionFramePcOffset), c.badAddress >>> 0);
            const busErrorFrame = 9 + 16 * Number(c.badReadAccess) + Number(c.badCodeAddress) + 4 * Number(c.supervisor);
            writeWord(c, bus, c.reg[stackRegisterIndex], busErrorFrame);
            c.badCodeAddress = false;
        }
        c.exception = 0;
        c.exceptionPc = -1;
        c.extraFlag = false;
        c.supervisor = true;
        c.trace = false;
    }
    if (c.doTrace) {
        pushCpuExceptionFrame(c, bus, c.pc);
        setPc(c, readPointerLong(bus.mem, traceVector * longSize) | 0);
        if (c.nInst === 0) {
            c.exception = traceVector;
        }
        c.supervisor = true;
        c.trace = false;
        c.extraFlag = false;
        c.stopped = false;
    }
    c.doTrace = c.trace;
    if (c.doTrace) {
        c.nInst2 = c.nInst;
        c.nInst = 1;
    }
    if (c.pendingInterrupt !== 0 && !c.doTrace) {
        c.extraFlag = true;
        c.nInst2 = c.nInst;
        c.nInst = 0;
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function executeTimedPcInstruction(c, bus) {
    const instructionCycleStart = c.cycleCount;
    c.peripheralWaitCycles = 0;
    c.currentInstructionPc = c.pc;
    c.accessActive = true;
    const opcode = readDecodedWord(c, bus, c.pc);
    c.pc = cpuAddressOffset(c.pc, wordSize);
    executeLoadedOpcode(c, bus, opcode, instructionCycleStart);
}

/**
 * Run one opcode and pad the clock to its MC68008 time: the handler's
 * override, the timing of an exception it raised, or the table's static or
 * dynamic count. Interrupts are taken after the instruction.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} opcode
 * @param {number} instructionCycleStart
 */
function executeLoadedOpcode(c, bus, opcode, instructionCycleStart) {
    const baseCycles = opcodeBaseCycles[opcode];
    c.accessActive = baseCycles >= 0;
    c.instructionCycleOverride = -1;
    c.code = opcode;
    opcodeTable[opcode](c, bus);

    let expectedCycles = c.instructionCycleOverride;
    if (expectedCycles < 0) {
        expectedCycles = baseCycles;
        if (c.exception !== 0) {
            expectedCycles = 62;
            const eaMode = (opcode >> 3) & 7;
            const eaReg = opcode & 7;
            switch (c.exception) {
            case addressErrorVector:
                expectedCycles = 94;
                break;
            case divideByZeroVector:
                expectedCycles = 66 + cpuEaReadCycles(eaMode, eaReg, operandWord);
                break;
            case chkVector:
                expectedCycles = 68 + cpuEaReadCycles(eaMode, eaReg, operandWord);
                break;
            case trapvVector:
                expectedCycles = 66;
                break;
            }
        }
        if (expectedCycles < 0) {
            expectedCycles = -expectedCycles - opcodeHostCycleBias;
        }
    }
    if (expectedCycles > 0) {
        expectedCycles += c.peripheralWaitCycles;
        c.cycleCount = Math.max(c.cycleCount, instructionCycleStart + expectedCycles);
    }
    c.accessActive = false;
    c.currentInstructionPc = -1;
    bus.afterInstruction();
    processInterrupts(c, bus);
}

/**
 * Enter the pending interrupt when its level is above the mask, or is the
 * non-maskable level 7, unless an exception or trace comes first. The entry
 * takes at least 72 clocks.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function processInterrupts(c, bus) {
    if (
        c.exception !== 0 ||
        (c.pendingInterrupt !== nonmaskableInterruptLevel && c.pendingInterrupt <= c.interruptMask) ||
        c.doTrace
    ) {
        return;
    }
    const interruptCycleStart = c.cycleCount;
    const savedCpuAccessActive = c.accessActive;
    const savedPeripheralWaitCycles = c.peripheralWaitCycles;
    c.peripheralWaitCycles = 0;
    c.accessActive = true;
    pushCpuExceptionFrame(c, bus, c.pc);
    const vectorAddr = (autovectorBase + c.pendingInterrupt) * longSize;
    setPc(c, readLong(c, bus, vectorAddr) | 0);
    c.interruptMask = c.pendingInterrupt;
    c.pendingInterrupt = 0;
    c.supervisor = true;
    c.trace = false;
    c.stopped = false;
    c.extraFlag = false;
    c.accessActive = savedCpuAccessActive;
    const expectedCycles = interruptExceptionClocks + c.peripheralWaitCycles;
    c.peripheralWaitCycles = savedPeripheralWaitCycles;
    c.cycleCount = Math.max(c.cycleCount, interruptCycleStart + expectedCycles);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} stackedPc
 */
function pushCpuExceptionFrame(c, bus, stackedPc) {
    if (!c.supervisor) {
        c.usp = c.reg[stackRegisterIndex];
        c.reg[stackRegisterIndex] = c.ssp;
    }
    c.reg[stackRegisterIndex] = addressOffset(c.reg[stackRegisterIndex], -exceptionFrameSize);
    writeLong(c, bus, addressOffset(c.reg[stackRegisterIndex], exceptionFramePcOffset), stackedPc >>> 0);
    writeWord(c, bus, c.reg[stackRegisterIndex], getSr(c));
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function bcdOp(c, bus) {
    const code = c.code;
    const subtract = (code & opcodeClassSelectBit) === 0;
    const sx = code & 7;
    const dx = (code >> 9) & 7;
    const memoryMode = (code & 8) !== 0;
    let s = c.reg[sx] & 0xFF;
    let d = c.reg[dx] & 0xFF;
    if (memoryMode) {
        s = getFromEaSized(c, bus, operandByte, 4, sx);
        d = modifyAtEaSized(c, bus, operandByte, 4, dx);
    }
    if (c.exception !== 0) {
        return;
    }
    let result;
    let newCarry;
    if (subtract) {
        const lo = (d & 0x0F) - (s & 0x0F) - Number(c.xflag);
        const hi = (d & 0xF0) - (s & 0xF0);
        result = hi + lo;
        let bcdAdjust = 0;
        if ((lo & 0xF0) !== 0) {
            result -= 6;
            bcdAdjust = 6;
        }
        const adjustedDiff = d - s - Number(c.xflag);
        if ((adjustedDiff & 0x100) > 0xFF) {
            result -= 0x60;
        }
        newCarry = ((adjustedDiff - bcdAdjust) & 0x300) > 0xFF;
    } else {
        const lo = (s & 0x0F) + (d & 0x0F) + Number(c.xflag);
        const hi = (s & 0xF0) + (d & 0xF0);
        result = hi + lo;
        if (lo > 9) {
            result += 6;
        }
        newCarry = (result & 0x3F0) > 0x90;
        if (newCarry) {
            result += 0x60;
        }
    }
    const resultByte = result & 0xFF;
    if (memoryMode) {
        if (!rewriteEaSized(c, bus, operandByte, resultByte)) {
            return;
        }
    } else {
        writeDataRegisterSized(c, dx, operandByte, resultByte);
    }
    c.carry = newCarry;
    c.xflag = c.carry;
    c.zero = c.zero && resultByte === 0;
    c.negative = (resultByte & 0x80) !== 0;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function addSubtractOp(c, bus) {
    const code = c.code;
    const subtract = (code & opcodeClassSelectBit) === 0;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    const index = (code >> 9) & 7;
    const size = operandSizeFromBits(code >> sizeFieldShift);
    let source = c.reg[index] >>> 0;
    let target = source;
    const eaDestination = (code & eaDestinationBit) !== 0;
    if (eaDestination) {
        if (!ensureEa(c, eaIsMemoryAlterable(eaMode, eaReg))) {
            return;
        }
        target = modifyAtEaSized(c, bus, size, eaMode, eaReg);
    } else {
        if (!ensureEa(c, eaIsSizedSource(eaMode, eaReg, size))) {
            return;
        }
        source = getFromEaSized(c, bus, size, eaMode, eaReg);
    }
    if (c.exception !== 0) {
        return;
    }
    let result = target + source;
    if (subtract) {
        result = target - source;
    }
    if (eaDestination) {
        if (!rewriteEaSized(c, bus, size, result)) {
            return;
        }
    } else {
        writeDataRegisterSized(c, index, size, result);
    }
    setAddSubtractFlags(c, subtract, target, source, result, size);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function addressArithmeticOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsValid(eaMode, eaReg))) {
        return;
    }
    let size = operandWord;
    if ((code & addressArithmeticLongBit) !== 0) {
        size = operandLong;
    }
    let source = getFromEaSized(c, bus, size, eaMode, eaReg) | 0;
    if (size === operandWord) {
        source = asI16(source);
    }
    if (c.exception !== 0) {
        return;
    }
    const addressIndex = addressRegisterBase + ((code >> 9) & 7);
    if ((code & opcodeClassSelectBit) !== 0) {
        c.reg[addressIndex] = addressOffset(c.reg[addressIndex], source);
        return;
    }
    c.reg[addressIndex] = addressOffset(c.reg[addressIndex], -source);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function immediateAddSubtractOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    const subtract = (code & immediateAddBit) === 0;
    const size = operandSizeFromBits(code >> sizeFieldShift);
    const source = readPcImmediateSized(c, bus, size);
    const target = modifyAtEaSized(c, bus, size, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    let result = target + source;
    if (subtract) {
        result = target - source;
    }
    if (!rewriteEaSized(c, bus, size, result)) {
        return;
    }
    setAddSubtractFlags(c, subtract, target, source, result, size);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function quickDataAlterable(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    const subtract = (code & quickSubtractBit) !== 0;
    const size = operandSizeFromBits(code >> sizeFieldShift);
    const target = modifyAtEaSized(c, bus, size, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    const source = opcodeQuickValue(code);
    let result = target + source;
    if (subtract) {
        result = target - source;
    }
    if (!rewriteEaSized(c, bus, size, result)) {
        return;
    }
    setAddSubtractFlags(c, subtract, target, source, result, size);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function quickAddressRegister(c, bus) {
    const code = c.code;
    const addressIndex = addressRegisterBase + (code & 7);
    let delta = opcodeQuickValue(code);
    if ((code & quickSubtractBit) !== 0) {
        delta = -delta;
    }
    c.reg[addressIndex] = addressOffset(c.reg[addressIndex], delta);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function extendArithmeticOp(c, bus) {
    const code = c.code;
    const sourceReg = code & 7;
    const destReg = (code >> 9) & 7;
    const size = operandSizeFromBits(code >> sizeFieldShift);
    const subtract = (code & extendArithmeticAddBit) === 0;
    const memoryMode = (code & extendArithmeticMemoryBit) !== 0;
    const oldZero = c.zero;
    let source = c.reg[sourceReg] >>> 0;
    let target = c.reg[destReg] >>> 0;
    if (memoryMode) {
        source = getFromEaSized(c, bus, size, 4, sourceReg);
        if (c.exception !== 0) {
            return;
        }
        target = modifyAtEaSized(c, bus, size, 4, destReg);
    }
    if (c.exception !== 0) {
        return;
    }
    let result = target + source + Number(c.xflag);
    if (subtract) {
        result = target - source - Number(c.xflag);
    }
    if (memoryMode) {
        if (!rewriteEaSized(c, bus, size, result)) {
            return;
        }
    } else {
        writeDataRegisterSized(c, destReg, size, result);
    }
    setAddSubtractFlags(c, subtract, target, source, result, size);
    c.zero = oldZero && c.zero;
}

/**
 * @param {Cpu} c
 * @param {boolean} subtract
 * @param {number} target
 * @param {number} source
 * @param {number} result
 * @param {number} size
 */
function setAddSubtractFlags(c, subtract, target, source, result, size) {
    if (subtract) {
        setCompareFlagsResult(c, target, source, result, size);
        c.xflag = c.carry;
        return;
    }
    const info = operandSizes[size];
    const signBit = info.signBit;
    const valueMask = info.valueMask;
    target &= valueMask;
    source &= valueMask;
    result &= valueMask;
    c.negative = (result & signBit) !== 0;
    c.zero = result === 0;
    c.carry = (((target & source) | ((target | source) & ~result)) & signBit) !== 0;
    c.overflow = (~(target ^ source) & (target ^ result) & signBit) !== 0;
    c.xflag = c.carry;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function logicalRegisterOp(c, bus) {
    const code = c.code;
    const opcodeClass = code & 0xF000;
    const exclusiveOr = opcodeClass === 0xB000;
    const andOp = (code & opcodeClassSelectBit) !== 0;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    const index = (code >> 9) & 7;
    const size = operandSizeFromBits(code >> sizeFieldShift);
    let source = c.reg[index] >>> 0;
    let target = source;
    const eaDestination = exclusiveOr || (code & eaDestinationBit) !== 0;
    if (eaDestination) {
        let validEa = eaIsMemoryAlterable(eaMode, eaReg);
        if (exclusiveOr) {
            validEa = eaIsDataAlterable(eaMode, eaReg);
        }
        if (!ensureEa(c, validEa)) {
            return;
        }
        target = modifyAtEaSized(c, bus, size, eaMode, eaReg);
    } else {
        if (!ensureEa(c, eaIsData(eaMode, eaReg))) {
            return;
        }
        source = getFromEaSized(c, bus, size, eaMode, eaReg);
    }
    if (c.exception !== 0) {
        return;
    }
    let result = target | source;
    if (andOp) {
        result = target & source;
    } else if (exclusiveOr) {
        result = target ^ source;
    }
    if (eaDestination) {
        if (!rewriteEaSized(c, bus, size, result)) {
            return;
        }
    } else {
        writeDataRegisterSized(c, index, size, result);
    }
    setNzClearCv(c, result, size);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function immediateLogicalOp(c, bus) {
    const code = c.code;
    const statusDestination = (code & immediateStatusOpcodeMask) === immediateStatusOpcode;
    const statusRegister = (code & immediateStatusSrBit) !== 0;
    if (statusDestination && statusRegister && !ensureSupervisor(c)) {
        return;
    }
    const operation = (code >> 9) & 7;
    if (statusDestination) {
        const target = getSr(c);
        const source = readPcWord(c, bus);
        if (c.exception !== 0) {
            return;
        }
        const result = immediateLogicalResult(operation, target, source);
        if (statusRegister) {
            putSr(c, result);
            return;
        }
        putCcr(c, result);
        return;
    }
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    const size = operandSizeFromBits(code >> sizeFieldShift);
    const source = readPcImmediateSized(c, bus, size);
    const target = modifyAtEaSized(c, bus, size, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    const result = immediateLogicalResult(operation, target, source);
    if (!rewriteEaSized(c, bus, size, result)) {
        return;
    }
    setNzClearCv(c, result, size);
}

/**
 * @param {number} operation
 * @param {number} target
 * @param {number} source
 * @returns {number}
 */
function immediateLogicalResult(operation, target, source) {
    switch (operation) {
    case immediateLogicalAndOp:
        return target & source;
    case immediateLogicalEorOp:
        return target ^ source;
    default:
        return target | source;
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function branchOp(c, bus) {
    const code = c.code;
    const base = c.pc;
    let returnPc = c.pc;
    let displ = asI8(code);
    if ((code & 0xFF) === 0) {
        displ = asI16(readPcWord(c, bus));
        returnPc = c.pc;
        if (c.exception !== 0) {
            return;
        }
    }
    const condition = (code >> 8) & conditionCodeMask;
    if (condition === branchConditionSubroutine) {
        if (!pushLongToStack(c, bus, returnPc)) {
            return;
        }
        setPc(c, addressOffset(base, displ));
        return;
    }
    if (conditionIsTrue(c, condition)) {
        setPc(c, addressOffset(base, displ));
        if (c.exception === 0) {
            c.instructionCycleOverride = 18;
        }
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function bitOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    const operation = (code >> 6) & bitOperationMask;
    const staticBit = (code & bitDynamicSourceBit) === 0;
    let eaValid = eaIsDataAlterable(eaMode, eaReg);
    if (operation === bitOpTest) {
        // BTST also reads PC-relative operands, but a static bit number takes no immediate.
        eaValid = eaIsData(eaMode, eaReg) && (!staticBit || eaMode !== 7 || eaReg !== 4);
    }
    if (!ensureEa(c, eaValid)) {
        return;
    }
    let bit = c.reg[(code >> 9) & 7];
    if (staticBit) {
        bit = readPcWord(c, bus);
        if (c.exception !== 0) {
            return;
        }
    }
    if (eaMode === 0) {
        const mask = (1 << (bit & 31)) >>> 0;
        let value = c.reg[eaReg] >>> 0;
        c.zero = (value & mask) === 0;
        switch (operation) {
        case bitOpTest:
            return;
        case bitOpChange:
            value ^= mask;
            break;
        case bitOpClear:
            value &= ~mask;
            break;
        case bitOpSet:
            value |= mask;
            break;
        }
        c.reg[eaReg] = value | 0;
        return;
    }
    const mask = 1 << (bit & 7);
    if (operation === bitOpTest) {
        const value = getFromEaSized(c, bus, operandByte, eaMode, eaReg);
        if (c.exception !== 0) {
            return;
        }
        c.zero = (value & mask) === 0;
        return;
    }
    let value = modifyAtEaSized(c, bus, operandByte, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    const testedBitWasZero = (value & mask) === 0;
    switch (operation) {
    case bitOpChange:
        value ^= mask;
        break;
    case bitOpClear:
        value &= ~mask;
        break;
    case bitOpSet:
        value |= mask;
        break;
    }
    if (!rewriteEaSized(c, bus, operandByte, value)) {
        return;
    }
    c.zero = testedBitWasZero;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function chkOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsData(eaMode, eaReg))) {
        return;
    }
    const d = asI16(c.reg[(code >> 9) & 7]);
    const ea = asI16(getFromEaSized(c, bus, operandWord, eaMode, eaReg));
    if (c.exception !== 0) {
        return;
    }
    if (d < 0) {
        c.negative = true;
        coreRaiseException(c, chkVector);
        return;
    }
    if (d > ea) {
        c.negative = false;
        coreRaiseException(c, chkVector);
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function clrOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    const size = operandSizeFromBits(code >> sizeFieldShift);
    modifyAtEaSized(c, bus, size, eaMode, eaReg);
    if (c.exception !== 0 || !rewriteEaSized(c, bus, size, 0)) {
        return;
    }
    setNzClearCv(c, 0, size);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function cmpOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    const index = (code >> 9) & 7;
    const opmode = (code >> 6) & 7;
    let size = operandSizeFromBits(code >> sizeFieldShift);
    const addressRegisterTarget = opmode === 3 || opmode === 7;
    if (addressRegisterTarget) {
        if (!ensureEa(c, eaIsValid(eaMode, eaReg))) {
            return;
        }
        if (opmode === 3) {
            size = operandWord;
        }
    } else if (!ensureEa(c, eaIsSizedSource(eaMode, eaReg, size))) {
        return;
    }
    let source = getFromEaSized(c, bus, size, eaMode, eaReg);
    if (addressRegisterTarget && size === operandWord) {
        source = asI16(source) >>> 0;
    }
    if (c.exception !== 0) {
        return;
    }
    let target = c.reg[index] >>> 0;
    if (addressRegisterTarget) {
        target = c.reg[addressRegisterBase + index] >>> 0;
        size = operandLong;
    }
    setCompareFlagsResult(c, target, source, target - source, size);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function cmpiOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    const size = operandSizeFromBits(code >> sizeFieldShift);
    const source = readPcImmediateSized(c, bus, size);
    if (c.exception !== 0) {
        return;
    }
    const target = getFromEaSized(c, bus, size, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    setCompareFlagsResult(c, target, source, target - source, size);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function cmpmOp(c, bus) {
    const code = c.code;
    const size = operandSizeFromBits(code >> sizeFieldShift);
    const sourceReg = code & 7;
    const destReg = (code >> 9) & 7;
    const source = getFromEaSized(c, bus, size, 3, sourceReg);
    if (c.exception !== 0) {
        return;
    }
    const target = getFromEaSized(c, bus, size, 3, destReg);
    if (c.exception !== 0) {
        return;
    }
    setCompareFlagsResult(c, target, source, target - source, size);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function dbccOp(c, bus) {
    const code = c.code;
    const condition = (code >> 8) & conditionCodeMask;
    if (conditionIsTrue(c, condition)) {
        readPcWord(c, bus);
        return;
    }
    const base = c.pc;
    const displ = asI16(readPcWord(c, bus));
    if (c.exception !== 0) {
        return;
    }
    const counterReg = code & 7;
    const oldCounter = c.reg[counterReg] & 0xFFFF;
    writeDataRegisterSized(c, counterReg, operandWord, oldCounter - 1);
    if (oldCounter === 0) {
        c.instructionCycleOverride = 26;
        return;
    }
    setPc(c, addressOffset(base, displ));
    if (c.exception === 0) {
        c.instructionCycleOverride = 18;
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function divideOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsData(eaMode, eaReg))) {
        return;
    }
    const index = (code >> 9) & 7;
    const source = getFromEaSized(c, bus, operandWord, eaMode, eaReg) & 0xFFFF;
    if (c.exception !== 0) {
        return;
    }
    if (source === 0) {
        coreRaiseException(c, divideByZeroVector);
        return;
    }
    if ((code & divideSignedBit) !== 0) {
        const signedSource = asI16(source);
        const dividend = c.reg[index];
        const quotient = Math.trunc(dividend / signedSource);
        if (quotient < -32768 || quotient > 32767) {
            c.carry = false;
            c.overflow = true;
            return;
        }
        const quotientWord = quotient & 0xFFFF;
        setNzClearCv(c, quotientWord, operandWord);
        const remainder = dividend - quotient * signedSource;
        c.reg[index] = (((remainder & 0xFFFF) << 16) | quotientWord) | 0;
        return;
    }
    const dividend = c.reg[index] >>> 0;
    const quotient = Math.floor(dividend / source);
    if (quotient > 0xFFFF) {
        c.carry = false;
        c.overflow = true;
        return;
    }
    const quotientWord = quotient & 0xFFFF;
    setNzClearCv(c, quotientWord, operandWord);
    const remainder = dividend - quotient * source;
    c.reg[index] = (((remainder & 0xFFFF) << 16) | quotientWord) | 0;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function exgOp(c, bus) {
    const code = c.code;
    let leftIndex = (code >> 9) & 7;
    let rightIndex = code & 7;
    // EXG Dx,Dy keeps both indices; only the three forms reach here.
    switch (code & exgFormMask) {
    case exgAddressAddressForm:
        leftIndex += addressRegisterBase;
        rightIndex += addressRegisterBase;
        break;
    case exgDataAddressForm:
        rightIndex += addressRegisterBase;
        break;
    }
    const value = c.reg[leftIndex];
    c.reg[leftIndex] = c.reg[rightIndex];
    c.reg[rightIndex] = value;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function extOp(c, bus) {
    const code = c.code;
    const index = code & 7;
    if ((code & extLongBit) === 0) {
        const value = asI8(c.reg[index]) >>> 0;
        writeDataRegisterSized(c, index, operandWord, value);
        setNzClearCv(c, value, operandWord);
        return;
    }
    const signedValue = asI16(c.reg[index]);
    c.reg[index] = signedValue;
    setNzClearCv(c, signedValue >>> 0, operandLong);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function jumpOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsControl(eaMode, eaReg))) {
        return;
    }
    const ea = getEa(c, bus, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    if ((code & jumpWithoutReturnBit) === 0 && !pushLongToStack(c, bus, c.pc)) {
        return;
    }
    setPc(c, ea);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function leaOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsControl(eaMode, eaReg))) {
        return;
    }
    const ea = getEa(c, bus, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    c.reg[addressRegisterBase + ((code >> 9) & 7)] = ea;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function linkOp(c, bus) {
    const code = c.code;
    const index = addressRegisterBase + (code & 7);
    const displacement = asI16(readPcWord(c, bus));
    let saved = c.reg[index];
    if (index === stackRegisterIndex) {
        // LINK A7 saves A7 as already decremented by its own push.
        saved = addressOffset(saved, -longSize);
    }
    if (c.exception !== 0 || !pushLongToStack(c, bus, saved)) {
        return;
    }
    c.reg[index] = c.reg[stackRegisterIndex];
    c.reg[stackRegisterIndex] = addressOffset(c.reg[stackRegisterIndex], displacement);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function moveOp(c, bus) {
    const code = c.code;
    const sourceMode = (code >> 3) & 7;
    const sourceReg = code & 7;
    const destMode = (code >> 6) & 7;
    const destReg = (code >> 9) & 7;
    const sizeCode = (code >> 12) & sizeFieldMask;
    const size = moveOperandSizes[sizeCode];
    if (!ensureEa(c, eaIsDataAlterable(destMode, destReg)) || !ensureEa(c, eaIsSizedSource(sourceMode, sourceReg, size))) {
        return;
    }
    const value = getFromEaSized(c, bus, size, sourceMode, sourceReg);
    if (c.exception !== 0) {
        return;
    }
    putToEaSized(c, bus, size, destMode, destReg, value);
    if (c.exception !== 0) {
        return;
    }
    setNzClearCv(c, value, size);
}

/**
 * @param {number} mode
 * @param {number} r
 * @param {number} size
 * @returns {boolean}
 */
function eaIsSizedSource(mode, r, size) {
    return eaIsValid(mode, r) && (size !== operandByte || mode !== 1);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function moveToStatus(c, bus) {
    const code = c.code;
    const moveToSr = (code & moveToStatusSrBit) !== 0;
    if (moveToSr && !ensureSupervisor(c)) {
        return;
    }
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsData(eaMode, eaReg))) {
        return;
    }
    const x = getFromEaSized(c, bus, operandWord, eaMode, eaReg) & 0xFFFF;
    if (c.exception !== 0) {
        return;
    }
    if (moveToSr) {
        putSr(c, x);
        return;
    }
    putCcr(c, x);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function moveFromSr(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    putToEaSized(c, bus, operandWord, eaMode, eaReg, getSr(c));
}

/**
 * Pack the current supervisor, interrupt-mask, and condition flags into SR.
 *
 * @param {Cpu} c
 * @returns {number}
 */
function getSr(c) {
    let sr = (c.interruptMask & 7) << 8;
    if (c.trace) {
        sr |= 0x8000;
    }
    if (c.supervisor) {
        sr |= 0x2000;
    }
    if (c.xflag) {
        sr |= 0x0010;
    }
    if (c.negative) {
        sr |= 0x0008;
    }
    if (c.zero) {
        sr |= 0x0004;
    }
    if (c.overflow) {
        sr |= 0x0002;
    }
    if (c.carry) {
        sr |= 0x0001;
    }
    return sr;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function moveUsp(c, bus) {
    const code = c.code;
    if (!ensureSupervisor(c)) {
        return;
    }
    const index = addressRegisterBase + (code & 7);
    if ((code & moveUspFromBit) !== 0) {
        c.reg[index] = c.usp;
        return;
    }
    c.usp = c.reg[index];
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function moveaOp(c, bus) {
    const code = c.code;
    const sourceMode = (code >> 3) & 7;
    const sourceReg = code & 7;
    if (!ensureEa(c, eaIsValid(sourceMode, sourceReg))) {
        return;
    }
    const destIndex = addressRegisterBase + ((code >> 9) & 7);
    let size = operandLong;
    if ((code & moveaWordBit) !== 0) {
        size = operandWord;
    }
    let d = getFromEaSized(c, bus, size, sourceMode, sourceReg) | 0;
    if (size === operandWord) {
        d = asI16(d);
    }
    if (c.exception !== 0) {
        return;
    }
    c.reg[destIndex] = d;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function movemOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    const load = (code & movemLoadBit) !== 0;
    let size = operandWord;
    if ((code & movemLongBit) !== 0) {
        size = operandLong;
    }
    const step = operandSizes[size].byteCount;
    const valueMask = operandSizes[size].valueMask;
    if (load && eaMode !== 3 && !ensureEa(c, eaIsControl(eaMode, eaReg))) {
        return;
    }
    if (!load && eaMode !== 4 && (!eaIsControl(eaMode, eaReg) || (eaMode === 7 && eaReg > 1))) {
        raiseInstructionException(c, illegalInstructionVector);
        return;
    }
    let mask = readPcWord(c, bus);
    if (c.exception !== 0) {
        return;
    }
    let movemCycles = 8 * popcount(mask);
    if (size === operandLong) {
        movemCycles *= 2;
    }
    // MC68008 base clocks by mode; a store saves a load's extra read.
    if (eaMode === 2 || eaMode === 3 || eaMode === 4) {
        movemCycles += 24;
    } else if (eaMode === 5 || (eaMode === 7 && (eaReg === 0 || eaReg === 2))) {
        movemCycles += 32;
    } else if (eaMode === 6 || (eaMode === 7 && eaReg === 3)) {
        movemCycles += 34;
    } else if (eaMode === 7 && eaReg === 1) {
        movemCycles += 40;
    }
    if (!load) {
        movemCycles -= 8;
    }
    if (load) {
        let ea = c.reg[addressRegisterBase + eaReg];
        if (eaMode !== 3) {
            ea = getEa(c, bus, eaMode, eaReg);
            if (c.exception !== 0) {
                return;
            }
        }
        if ((ea & 1) !== 0) {
            readMemorySized(c, bus, size, ea);
            return;
        }
        for (let i = 0; mask !== 0; i += 1) {
            if ((mask & 1) !== 0) {
                let value = readMemorySized(c, bus, size, ea);
                if (size === operandWord) {
                    value = asI16(value);
                }
                if (c.exception !== 0) {
                    return;
                }
                c.reg[i] = value;
                ea = addressOffset(ea, step);
            }
            mask >>= 1;
        }
        if (eaMode === 3) {
            c.reg[addressRegisterBase + eaReg] = ea;
        }
        c.instructionCycleOverride = movemCycles;
        return;
    }
    if (eaMode === 4) {
        let ea = c.reg[addressRegisterBase + eaReg];
        if ((ea & 1) !== 0) {
            writeMemorySized(c, bus, size, ea, 0);
            return;
        }
        for (let i = registerCount - 1; mask !== 0; i -= 1) {
            if ((mask & 1) !== 0) {
                ea = addressOffset(ea, -step);
                writeMemorySized(c, bus, size, ea, (c.reg[i] & valueMask) >>> 0);
                if (c.exception !== 0) {
                    return;
                }
            }
            mask >>= 1;
        }
        c.reg[addressRegisterBase + eaReg] = ea;
        c.instructionCycleOverride = movemCycles;
        return;
    }
    let ea = getEa(c, bus, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    if ((ea & 1) !== 0) {
        writeMemorySized(c, bus, size, ea, 0);
        return;
    }
    for (let i = 0; mask !== 0; i += 1) {
        if ((mask & 1) !== 0) {
            writeMemorySized(c, bus, size, ea, (c.reg[i] & valueMask) >>> 0);
            if (c.exception !== 0) {
                return;
            }
            ea = addressOffset(ea, step);
        }
        mask >>= 1;
    }
    c.instructionCycleOverride = movemCycles;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function movepOp(c, bus) {
    const code = c.code;
    const dataIndex = (code >> 9) & 7;
    const ea = addressOffset(c.reg[addressRegisterBase + (code & 7)], asI16(readPcWord(c, bus)));
    if (c.exception !== 0) {
        return;
    }
    if ((code & movepRegisterToMemoryBit) === 0) {
        const highByte = readByte(c, bus, ea);
        const lowByte = readByte(c, bus, addressOffset(ea, wordSize));
        let value = (highByte << 8) | lowByte;
        if ((code & movepLongBit) !== 0) {
            const high2 = readByte(c, bus, addressOffset(ea, 2 * wordSize));
            const low2 = readByte(c, bus, addressOffset(ea, 3 * wordSize));
            value = (value << 16) | (high2 << 8) | low2;
            writeDataRegisterSized(c, dataIndex, operandLong, value);
            return;
        }
        writeDataRegisterSized(c, dataIndex, operandWord, value);
        return;
    }
    const value = c.reg[dataIndex] >>> 0;
    if ((code & movepLongBit) !== 0) {
        writeByte(c, bus, ea, value >>> 24);
        writeByte(c, bus, addressOffset(ea, wordSize), value >>> 16);
        writeByte(c, bus, addressOffset(ea, 2 * wordSize), value >>> 8);
        writeByte(c, bus, addressOffset(ea, 3 * wordSize), value);
        return;
    }
    writeByte(c, bus, ea, value >>> 8);
    writeByte(c, bus, addressOffset(ea, wordSize), value);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function moveqOp(c, bus) {
    const code = c.code;
    const index = (code >> 9) & 7;
    const signedValue = asI8(code);
    c.reg[index] = signedValue;
    setNzClearCv(c, signedValue >>> 0, operandLong);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function multiplyOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsData(eaMode, eaReg))) {
        return;
    }
    const index = (code >> 9) & 7;
    const source = getFromEaSized(c, bus, operandWord, eaMode, eaReg) & 0xFFFF;
    if (c.exception !== 0) {
        return;
    }
    const signedMultiply = (code & multiplySignedBit) !== 0;
    let cycleBits = source;
    if (signedMultiply) {
        // MULS counts 01 and 10 pairs with a zero appended below bit 0.
        cycleBits = (source ^ (source << 1)) & 0xFFFF;
    }
    c.instructionCycleOverride = 42 + 2 * popcount(cycleBits) + cpuEaReadCycles(eaMode, eaReg, operandWord);
    let result;
    if (signedMultiply) {
        result = (asI16(c.reg[index]) * asI16(source)) >>> 0;
    } else {
        result = ((c.reg[index] & 0xFFFF) * source) >>> 0;
    }
    c.reg[index] = result | 0;
    setNzClearCv(c, result, operandLong);
}

/**
 * @param {number} x
 * @returns {number}
 */
function popcount(x) {
    let v = x >>> 0;
    v -= (v >>> 1) & 0x55555555;
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

/**
 * @param {number} mode
 * @param {number} r
 * @returns {boolean}
 */
function eaIsData(mode, r) {
    return eaIsValid(mode, r) && mode !== 1;
}

/**
 * @param {number} mode
 * @param {number} r
 * @param {number} size
 * @returns {number}
 */
function cpuEaReadCycles(mode, r, size) {
    switch (mode) {
    case 0:
    case 1:
        return 0;
    case 2:
    case 3:
        return cpuCyclesForSize(size, 4, 8, 16);
    case 4:
        return cpuCyclesForSize(size, 6, 10, 18);
    case 5:
        return cpuCyclesForSize(size, 12, 16, 24);
    case 6:
        return cpuCyclesForSize(size, 14, 18, 26);
    case 7:
        switch (r) {
        case 0:
        case 2:
            return cpuCyclesForSize(size, 12, 16, 24);
        case 1:
            return cpuCyclesForSize(size, 20, 24, 32);
        case 3:
            return cpuCyclesForSize(size, 14, 18, 26);
        case 4:
            return cpuCyclesForSize(size, 8, 8, 16);
        }
        break;
    }
    return 0;
}

/**
 * @param {number} size
 * @param {number} byteCycles
 * @param {number} wordCycles
 * @param {number} longCycles
 * @returns {number}
 */
function cpuCyclesForSize(size, byteCycles, wordCycles, longCycles) {
    switch (size) {
    case operandByte:
        return byteCycles;
    case operandWord:
        return wordCycles;
    default:
        return longCycles;
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function nbcdOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    const d = modifyAtEaSized(c, bus, operandByte, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    let nbcdLo = 0 - (d & 0x0F) - Number(c.xflag);
    const nbcdHi = 0 - (d & 0xF0);
    if (nbcdLo < 0) {
        nbcdLo -= 6;
    }
    let nbcdRes = nbcdHi + nbcdLo;
    const nbcdCarry = (nbcdRes & 0x1F0) > 0x90;
    if (nbcdCarry) {
        nbcdRes -= 0x60;
    }
    const resultByte = nbcdRes & 0xFF;
    if (!rewriteEaSized(c, bus, operandByte, resultByte)) {
        return;
    }
    c.zero = c.zero && resultByte === 0;
    c.negative = (resultByte & 0x80) !== 0;
    c.carry = nbcdCarry;
    c.xflag = c.carry;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function negOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    const size = operandSizeFromBits(code >> sizeFieldShift);
    const extend = (code & negWithoutExtendBit) === 0;
    const chainedZero = c.zero;
    const target = modifyAtEaSized(c, bus, size, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    let result = 0 - target;
    if (extend) {
        result -= Number(c.xflag);
    }
    if (!rewriteEaSized(c, bus, size, result)) {
        return;
    }
    setCompareFlagsResult(c, 0, target, result, size);
    c.xflag = c.carry;
    if (extend) {
        c.zero = chainedZero && c.zero;
    }
}

/**
 * @param {Cpu} c
 * @param {number} target
 * @param {number} source
 * @param {number} result
 * @param {number} size
 */
function setCompareFlagsResult(c, target, source, result, size) {
    const info = operandSizes[size];
    const signBit = info.signBit;
    const valueMask = info.valueMask;
    target &= valueMask;
    source &= valueMask;
    result &= valueMask;
    c.negative = (result & signBit) !== 0;
    c.zero = result === 0;
    c.carry = (((~target & source) | (result & (~target | source))) & signBit) !== 0;
    c.overflow = ((target ^ source) & (target ^ result) & signBit) !== 0;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function nopOp(c, bus) {
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function notOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    const size = operandSizeFromBits(code >> sizeFieldShift);
    const target = modifyAtEaSized(c, bus, size, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    if (!rewriteEaSized(c, bus, size, ~target)) {
        return;
    }
    setNzClearCv(c, ~target, size);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function lineEmulatorException(c, bus) {
    let vector = line1010Vector;
    if ((c.code & opcodeClassSelectBit) !== 0) {
        vector = line1111Vector;
    }
    raiseInstructionException(c, vector);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function peaOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsControl(eaMode, eaReg))) {
        return;
    }
    const ea = getEa(c, bus, eaMode, eaReg);
    pushLongToStack(c, bus, ea);
}

/**
 * @param {number} mode
 * @param {number} r
 * @returns {boolean}
 */
function eaIsControl(mode, r) {
    return mode === 2 || mode === 5 || mode === 6 || (mode === 7 && r <= 3);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} mode
 * @param {number} r
 * @returns {number}
 */
function getEa(c, bus, mode, r) {
    switch (mode) {
    case 2:
        return c.reg[addressRegisterBase + r];
    case 5:
        return addressOffset(c.reg[addressRegisterBase + r], asI16(readPcWord(c, bus)));
    case 6:
        return indexedAddress(c, c.reg[addressRegisterBase + r], readPcWord(c, bus));
    default:
        // Mode 7: the callers accept only control modes.
        return getEaM7(c, bus, r);
    }
}

/**
 * Push a long onto the active stack; false when an exception is pending or
 * the write raised one.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} value
 * @returns {boolean}
 */
function pushLongToStack(c, bus, value) {
    if (c.exception !== 0) {
        return false;
    }
    c.reg[stackRegisterIndex] = addressOffset(c.reg[stackRegisterIndex], -longSize);
    writeLong(c, bus, c.reg[stackRegisterIndex], value >>> 0);
    return c.exception === 0;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function resetOp(c, bus) {
    if (!ensureSupervisor(c)) {
        return;
    }
    bus.resetHardware();
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function shiftRotateMemoryWord(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsMemoryAlterable(eaMode, eaReg))) {
        return;
    }
    const left = (code & shiftRotateLeftBit) !== 0;
    const operation = (code >> memoryShiftOperationShift) & shiftOperationMask;
    const value = modifyAtEaSized(c, bus, operandWord, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    // Rewriting the operand just read cannot fault, so the flags can go first.
    rewriteEaSized(c, bus, operandWord, shiftRotate(c, operation, left, value, 1, 16));
}

/**
 * @param {number} mode
 * @param {number} r
 * @returns {boolean}
 */
function eaIsMemoryAlterable(mode, r) {
    return mode !== 0 && eaIsDataAlterable(mode, r);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function rteOp(c, bus) {
    if (!ensureSupervisor(c)) {
        return;
    }
    const stack = c.reg[stackRegisterIndex];
    const sr = readWord(c, bus, stack);
    if (c.exception !== 0) {
        return;
    }
    const returnPc = readLong(c, bus, addressOffset(stack, exceptionFramePcOffset)) | 0;
    if (c.exception !== 0) {
        return;
    }
    setPc(c, returnPc);
    if (c.exception !== 0) {
        return;
    }
    c.reg[stackRegisterIndex] = addressOffset(stack, exceptionFrameSize);
    putSr(c, sr);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function rtrOp(c, bus) {
    const stack = c.reg[stackRegisterIndex];
    const cc = readWord(c, bus, stack);
    if (c.exception !== 0) {
        return;
    }
    const returnPc = readLong(c, bus, addressOffset(stack, exceptionFramePcOffset)) | 0;
    if (c.exception !== 0) {
        return;
    }
    setPc(c, returnPc);
    if (c.exception !== 0) {
        return;
    }
    c.reg[stackRegisterIndex] = addressOffset(stack, exceptionFrameSize);
    putCcr(c, cc);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function rtsOp(c, bus) {
    const stack = c.reg[stackRegisterIndex];
    const returnAddr = readLong(c, bus, stack) | 0;
    if (c.exception !== 0) {
        return;
    }
    setPc(c, returnAddr);
    if (c.exception !== 0) {
        return;
    }
    c.reg[stackRegisterIndex] = addressOffset(stack, longSize);
}

/**
 * @param {Cpu} c
 * @param {number} addr
 */
function setPc(c, addr) {
    if ((addr & 1) !== 0) {
        raiseAddressError(c, addr, true, true);
        return;
    }
    c.pc = addr & addrMask;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function sccOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    let conditionValue = 0;
    const condition = (code >> 8) & conditionCodeMask;
    if (conditionIsTrue(c, condition)) {
        conditionValue = 0xFF;
        if (eaMode === 0) {
            c.instructionCycleOverride = 10;
        }
    }
    putToEaSized(c, bus, operandByte, eaMode, eaReg, conditionValue);
}

/**
 * @param {Cpu} c
 * @param {number} condition
 * @returns {boolean}
 */
function conditionIsTrue(c, condition) {
    switch (condition) {
    case 0:
        return true;
    case 1:
        return false;
    case 2:
        return !c.carry && !c.zero;
    case 3:
        return c.carry || c.zero;
    case 4:
        return !c.carry;
    case 5:
        return c.carry;
    case 6:
        return !c.zero;
    case 7:
        return c.zero;
    case 8:
        return !c.overflow;
    case 9:
        return c.overflow;
    case 10:
        return !c.negative;
    case 11:
        return c.negative;
    case 12:
        return c.negative === c.overflow;
    case 13:
        return c.negative !== c.overflow;
    case 14:
        return !c.zero && c.negative === c.overflow;
    case 15:
        return c.zero || c.negative !== c.overflow;
    }
    return false;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} size
 * @param {number} mode
 * @param {number} r
 * @param {number} value
 */
function putToEaSized(c, bus, size, mode, r, value) {
    if (c.exception !== 0) {
        return;
    }
    if (mode === 0) {
        writeDataRegisterSized(c, r, size, value);
        return;
    }
    const addr = memoryEaAddr(c, bus, mode, r, operandSizes[size].byteCount);
    if (c.exception !== 0) {
        return;
    }
    writeMemorySized(c, bus, size, addr, value);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function stopOp(c, bus) {
    if (!ensureSupervisor(c)) {
        return;
    }
    const sr = readPcWord(c, bus);
    if (c.exception !== 0) {
        return;
    }
    putSr(c, sr);
    c.stopped = true;
    c.nInst2 = 0;
    c.nInst = 0;
}

/**
 * Apply SR and swap active stack pointers when supervisor state changes.
 *
 * @param {Cpu} c
 * @param {number} sr
 */
function putSr(c, sr) {
    const oldSuper = c.supervisor;
    c.trace = (sr & 0x8000) !== 0;
    c.extraFlag = c.doTrace || c.trace || c.exception !== 0;
    if (c.extraFlag) {
        c.nInst2 = c.nInst;
        c.nInst = 0;
    }
    c.supervisor = (sr & 0x2000) !== 0;
    putCcr(c, sr);
    c.interruptMask = (sr >> 8) & interruptLevelMask;
    if (oldSuper !== c.supervisor) {
        if (c.supervisor) {
            c.usp = c.reg[stackRegisterIndex];
            c.reg[stackRegisterIndex] = c.ssp;
        } else {
            c.ssp = c.reg[stackRegisterIndex];
            c.reg[stackRegisterIndex] = c.usp;
        }
    }
}

/**
 * Replace the condition-code flags from the low byte of a status value.
 *
 * @param {Cpu} c
 * @param {number} cc
 */
function putCcr(c, cc) {
    c.xflag = (cc & 0x0010) !== 0;
    c.negative = (cc & 0x0008) !== 0;
    c.zero = (cc & 0x0004) !== 0;
    c.overflow = (cc & 0x0002) !== 0;
    c.carry = (cc & 0x0001) !== 0;
}

/**
 * @param {Cpu} c
 * @returns {boolean}
 */
function ensureSupervisor(c) {
    if (c.supervisor) {
        return true;
    }
    raiseInstructionException(c, privilegeViolationVector);
    return false;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function swapOp(c, bus) {
    const index = c.code & 7;
    let value = c.reg[index] >>> 0;
    value = ((value << 16) | (value >>> 16)) >>> 0;
    c.reg[index] = value | 0;
    setNzClearCv(c, value, operandLong);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function tasOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    const value = modifyAtEaSized(c, bus, operandByte, eaMode, eaReg);
    if (c.exception !== 0 || !rewriteEaSized(c, bus, operandByte, value | 0x80)) {
        return;
    }
    setNzClearCv(c, value, operandByte);
}

/**
 * Read the operand of a read-modify-write instruction and remember where it
 * came from for `rewriteEaSized`: a data register as `rewriteRegisterTargetBase`
 * plus its number, memory as its address.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} size
 * @param {number} mode
 * @param {number} r
 * @returns {number}
 */
function modifyAtEaSized(c, bus, size, mode, r) {
    c.rewriteTarget = rewriteInvalidTarget;
    if (c.exception !== 0) {
        return 0;
    }
    if (mode === 0) {
        c.rewriteTarget = rewriteRegisterTargetBase + r;
        return c.reg[r] & operandSizes[size].valueMask;
    }
    const addr = memoryEaAddr(c, bus, mode, r, operandSizes[size].byteCount);
    if (c.exception !== 0) {
        return 0;
    }
    c.rewriteTarget = addr & addrMask;
    return readMemorySized(c, bus, size, addr);
}

/**
 * Store a read-modify-write result where `modifyAtEaSized` read the operand;
 * false when that read raised an exception.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} size
 * @param {number} value
 * @returns {boolean}
 */
function rewriteEaSized(c, bus, size, value) {
    const target = c.rewriteTarget;
    c.rewriteTarget = rewriteInvalidTarget;
    if (c.exception !== 0 || target < 0) {
        return false;
    }
    if (target >= rewriteRegisterTargetBase) {
        writeDataRegisterSized(c, target - rewriteRegisterTargetBase, size, value);
        return true;
    }
    // The read of the same address and size already succeeded.
    writeMemorySized(c, bus, size, target, value);
    return true;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} size
 * @param {number} addr
 * @param {number} value
 */
function writeMemorySized(c, bus, size, addr, value) {
    switch (size) {
    case operandByte:
        writeByte(c, bus, addr, value);
        break;
    case operandWord:
        writeWord(c, bus, addr, value);
        break;
    default:
        writeLong(c, bus, addr, value);
        break;
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} addr
 * @param {number} d
 */
function writeWord(c, bus, addr, d) {
    if (cpuWordOrLongFaultIfNeeded(c, addr, false)) {
        addCpuBusCycles(c, addr, wordBusCycles);
        return;
    }
    addr &= addrMask;
    writeDecodedWord(c, bus, addr, d);
}

/**
 * Write a long straight to memory when neither word is hardware, leaving ROM
 * words alone, or otherwise as two decoded word writes.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} addr
 * @param {number} d
 */
function writeLong(c, bus, addr, d) {
    if (cpuWordOrLongFaultIfNeeded(c, addr, false)) {
        addCpuBusCycles(c, addr, longBusCycles);
        return;
    }
    addr &= addrMask;
    const lowAddr = (addr + wordSize) & addrMask;
    if (isDirectRamLongAccess(bus, addr, lowAddr)) {
        addCpuBusCycles(c, addr, longBusCycles);
        if (addr >= qdosUserRamBase) {
            bus.beforeMemoryWrite(addr, longSize);
            writePointerLong(bus.mem, addr, d);
            return;
        }
        if (lowAddr >= qdosUserRamBase) {
            bus.beforeMemoryWrite(lowAddr, wordSize);
            writePointerWord(bus.mem, lowAddr, d & 0xFFFF);
        }
        return;
    }
    writeDecodedWord(c, bus, addr, (d >>> 16) & 0xFFFF);
    writeDecodedWord(c, bus, lowAddr, d & 0xFFFF);
}

/**
 * Big-endian long stored straight into a byte array. Guest RAM written this way
 * bypasses the bus, so callers notify it first with `beforeMemoryWrite`.
 *
 * @param {Uint8Array} mem
 * @param {number} addr
 * @param {number} v
 */
export function writePointerLong(mem, addr, v) {
    mem[addr] = (v >>> 24) & 0xFF;
    mem[addr + 1] = (v >>> 16) & 0xFF;
    mem[addr + 2] = (v >>> 8) & 0xFF;
    mem[addr + 3] = v & 0xFF;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} addr
 * @param {number} d
 */
function writeDecodedWord(c, bus, addr, d) {
    const next = (addr + 1) & addrMask;
    if (addressIsHardware(bus, addr) || ((addr & 1) !== 0 && (next === 0 || addressIsHardware(bus, next)))) {
        writeByte(c, bus, addr, (d >> 8) & 0xFF);
        writeByte(c, bus, next, d & 0xFF);
        return;
    }
    addCpuBusCycles(c, addr, wordBusCycles);
    if (!addressIsMapped(bus, addr)) {
        return;
    }
    if (addr >= qdosUserRamBase) {
        bus.beforeMemoryWrite(addr, wordSize);
        writePointerWord(bus.mem, addr, d);
    }
}

/**
 * Big-endian word stored straight into a byte array. Guest RAM written this way
 * bypasses the bus, so callers notify it first with `beforeMemoryWrite`.
 *
 * @param {Uint8Array} mem
 * @param {number} addr
 * @param {number} v
 */
export function writePointerWord(mem, addr, v) {
    mem[addr] = (v >> 8) & 0xFF;
    mem[addr + 1] = v & 0xFF;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} addr
 * @param {number} d
 */
function writeByte(c, bus, addr, d) {
    addr &= addrMask;
    const mapped = addressIsMapped(bus, addr);
    if (mapped && (!c.accessActive || c.exception === 0) && addressIsHardware(bus, addr)) {
        accessHardwareByte(c, bus, addr, true, d & 0xFF);
        return;
    }
    addCpuBusCycles(c, addr, byteBusCycles);
    if (!mapped || (c.accessActive && c.exception !== 0)) {
        return;
    }
    if (addr >= qdosUserRamBase) {
        bus.beforeMemoryWrite(addr, byteSize);
        bus.mem[addr] = d & 0xFF;
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function trapOp(c, bus) {
    coreRaiseException(c, qdosTrap0Vector + (c.code & 15));
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function trapvOp(c, bus) {
    if (c.overflow) {
        coreRaiseException(c, trapvVector);
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function tstOp(c, bus) {
    const code = c.code;
    const eaMode = (code >> 3) & 7;
    const eaReg = code & 7;
    if (!ensureEa(c, eaIsDataAlterable(eaMode, eaReg))) {
        return;
    }
    const size = operandSizeFromBits(code >> sizeFieldShift);
    const value = getFromEaSized(c, bus, size, eaMode, eaReg);
    if (c.exception !== 0) {
        return;
    }
    setNzClearCv(c, value, size);
}

/**
 * @param {Cpu} c
 * @param {number} value
 * @param {number} size
 */
function setNzClearCv(c, value, size) {
    const info = operandSizes[size];
    const masked = value & info.valueMask;
    c.negative = (masked & info.signBit) !== 0;
    c.zero = masked === 0;
    c.overflow = false;
    c.carry = false;
}

/**
 * @param {Cpu} c
 * @param {boolean} valid
 * @returns {boolean}
 */
function ensureEa(c, valid) {
    if (valid) {
        return true;
    }
    raiseInstructionException(c, illegalInstructionVector);
    return false;
}

/**
 * @param {number} mode
 * @param {number} r
 * @returns {boolean}
 */
function eaIsDataAlterable(mode, r) {
    return mode === 0 || (mode >= 2 && mode <= 6) || (mode === 7 && r <= 1);
}

/**
 * @param {number} mode
 * @param {number} r
 * @returns {boolean}
 */
function eaIsValid(mode, r) {
    return mode !== 7 || r <= 4;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} size
 * @param {number} mode
 * @param {number} r
 * @returns {number}
 */
function getFromEaSized(c, bus, size, mode, r) {
    if (mode === 0) {
        return c.reg[r] & operandSizes[size].valueMask;
    }
    if (mode === 1 && size !== operandByte) {
        return c.reg[addressRegisterBase + r] & operandSizes[size].valueMask;
    }
    if (mode === 7 && r === 4) {
        return readPcImmediateSized(c, bus, size);
    }
    const addr = memoryEaAddr(c, bus, mode, r, operandSizes[size].byteCount);
    if (c.exception !== 0) {
        return 0;
    }
    return readMemorySized(c, bus, size, addr);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} size
 * @returns {number}
 */
function readPcImmediateSized(c, bus, size) {
    if (size === operandLong) {
        return readPcLong(c, bus);
    }
    return readPcWord(c, bus) & operandSizes[size].valueMask;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} size
 * @param {number} addr
 * @returns {number}
 */
function readMemorySized(c, bus, size, addr) {
    switch (size) {
    case operandByte:
        return readByte(c, bus, addr);
    case operandWord:
        return readWord(c, bus, addr);
    default:
        return readLong(c, bus, addr);
    }
}

/**
 * Address of a memory operand, stepping (An)+ and -(An), where a byte step on
 * A7 stays a word. Callers pass only memory modes their instruction accepts.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} mode
 * @param {number} r
 * @param {number} byteCount
 * @returns {number}
 */
function memoryEaAddr(c, bus, mode, r, byteCount) {
    switch (mode) {
    case 2:
        return c.reg[addressRegisterBase + r];
    case 3:
    case 4:
        let step = byteCount;
        if (byteCount === byteSize && r === stackAddressRegister) {
            step = wordSize;
        }
        if (mode === 3) {
            const addr = c.reg[addressRegisterBase + r];
            c.reg[addressRegisterBase + r] = addressOffset(addr, step);
            return addr;
        }
        const addr = addressOffset(c.reg[addressRegisterBase + r], -step);
        c.reg[addressRegisterBase + r] = addr;
        return addr;
    case 5:
        return addressOffset(c.reg[addressRegisterBase + r], asI16(readPcWord(c, bus)));
    case 6:
        return indexedAddress(c, c.reg[addressRegisterBase + r], readPcWord(c, bus));
    default:
        // Mode 7: the callers have already checked the addressing mode.
        return getEaM7(c, bus, r);
    }
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} r
 * @returns {number}
 */
function getEaM7(c, bus, r) {
    switch (r) {
    case 0:
        return asI16(readPcWord(c, bus));
    case 1:
        return readPcLong(c, bus) | 0;
    case 2: {
        const base = c.pc;
        return addressOffset(base, asI16(readPcWord(c, bus)));
    }
    default:
        // (d8,PC,Xn); the callers have already rejected r above 3.
        const base = c.pc;
        return indexedAddress(c, base, readPcWord(c, bus));
    }
}

/**
 * Raise an exception that stacks the address of the faulting instruction, as
 * illegal opcodes, privilege violations, and Line-A/F do. `coreRaiseException`
 * keeps the current PC.
 *
 * @param {Cpu} c
 * @param {number} vector
 */
function raiseInstructionException(c, vector) {
    c.exceptionPc = c.pc;
    if (c.currentInstructionPc >= 0) {
        c.exceptionPc = c.currentInstructionPc;
    }
    coreRaiseException(c, vector);
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @returns {number}
 */
function readPcLong(c, bus) {
    const highWord = readPcWord(c, bus);
    if (c.exception !== 0) {
        return 0;
    }
    const lowWord = readPcWord(c, bus);
    if (c.exception !== 0) {
        return 0;
    }
    return ((highWord << 16) | lowWord) >>> 0;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @returns {number}
 */
function readPcWord(c, bus) {
    if (c.exception !== 0) {
        return 0;
    }
    const value = readWord(c, bus, c.pc);
    if (c.exception !== 0) {
        return 0;
    }
    c.pc = cpuAddressOffset(c.pc, wordSize);
    return value;
}

/**
 * Offset within the 1 MiB address space, wrapping at 20 bits like the
 * 68008's address bus.
 *
 * @param {number} base
 * @param {number} offset
 * @returns {number}
 */
function cpuAddressOffset(base, offset) {
    return (base + offset) & addrMask;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} addr
 * @returns {number}
 */
function readWord(c, bus, addr) {
    if (cpuWordOrLongFaultIfNeeded(c, addr, true)) {
        addCpuBusCycles(c, addr, wordBusCycles);
        return 0;
    }
    addr &= addrMask;
    return readDecodedWord(c, bus, addr);
}

/**
 * @param {Cpu} c
 * @param {number} baseAddr
 * @param {number} extension
 * @returns {number}
 */
function indexedAddress(c, baseAddr, extension) {
    let index = c.reg[(extension >> 12) & 0x0F];
    if ((extension & 0x0800) === 0) {
        index = asI16(index);
    }
    return addressOffset(addressOffset(baseAddr, index), asI8(extension));
}

/**
 * Sign-extend the low byte.
 *
 * @param {number} value
 * @returns {number}
 */
export function asI8(value) {
    return (value << 24) >> 24;
}

/**
 * Sign-extend the low word.
 *
 * @param {number} value
 * @returns {number}
 */
export function asI16(value) {
    return (value << 16) >> 16;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function unlkOp(c, bus) {
    const index = addressRegisterBase + (c.code & 7);
    const stack = c.reg[index];
    c.reg[stackRegisterIndex] = stack;
    const restored = readLong(c, bus, stack) | 0;
    if (c.exception !== 0) {
        return;
    }
    c.reg[stackRegisterIndex] = addressOffset(stack, longSize);
    // UNLK A7 leaves A7 holding the loaded long.
    c.reg[index] = restored;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} addr
 * @returns {number}
 */
function readLong(c, bus, addr) {
    if (cpuWordOrLongFaultIfNeeded(c, addr, true)) {
        addCpuBusCycles(c, addr, longBusCycles);
        return 0;
    }
    addr &= addrMask;
    if (addr === internalIoBase) {
        addCpuBusCycles(c, addr, longBusCycles);
        return bus.readHwLongClock();
    }
    const lowAddr = (addr + wordSize) & addrMask;
    if (isDirectRamLongAccess(bus, addr, lowAddr)) {
        addCpuBusCycles(c, addr, longBusCycles);
        return readPointerLong(bus.mem, addr);
    }
    const highWord = readDecodedWord(c, bus, addr);
    const lowWord = readDecodedWord(c, bus, lowAddr);
    return ((highWord << 16) | lowWord) >>> 0;
}

/**
 * Raise an address error for an odd word or long access. True means skip the
 * access, which also follows an earlier exception; untimed accesses never
 * fault.
 *
 * @param {Cpu} c
 * @param {number} addr
 * @param {boolean} readAccess
 * @returns {boolean}
 */
function cpuWordOrLongFaultIfNeeded(c, addr, readAccess) {
    if (!c.accessActive) {
        return false;
    }
    if (c.exception !== 0) {
        return true;
    }
    if ((addr & 1) !== 0) {
        raiseAddressError(c, addr, readAccess, false);
        return true;
    }
    return false;
}

/**
 * @param {Cpu} c
 * @param {number} addr
 * @param {boolean} readAccess
 * @param {boolean} instructionAccess
 */
function raiseAddressError(c, addr, readAccess, instructionAccess) {
    coreRaiseException(c, addressErrorVector);
    c.badReadAccess = readAccess;
    c.badAddress = addr;
    c.badCodeAddress = instructionAccess;
}

/**
 * Stop the current instruction chunk and schedule a CPU exception vector.
 *
 * @param {Cpu} c
 * @param {number} vector
 */
function coreRaiseException(c, vector) {
    c.exception = vector;
    c.extraFlag = true;
    c.nInst2 = c.nInst;
    c.nInst = 0;
}

/**
 * @param {CpuBus} bus
 * @param {number} addr
 * @param {number} lowAddr
 * @returns {boolean}
 */
function isDirectRamLongAccess(bus, addr, lowAddr) {
    return addr <= maxLinearLongAddr &&
        addressIsMapped(bus, addr) &&
        addressIsMapped(bus, lowAddr) &&
        !addressIsHardware(bus, addr) &&
        !addressIsHardware(bus, lowAddr);
}

/**
 * Base of the QDOS system variables: the 32 KiB block that holds the
 * supervisor stack, where Minerva finds them too, as its dual-screen mode
 * moves them above the second screen. Until that block starts with the QDOS
 * identification, the default base.
 *
 * @param {Cpu} c
 * @param {Uint8Array} mem
 * @returns {number}
 */
export function qdosSysvarBase(c, mem) {
    let ssp = c.ssp;
    if (c.supervisor) {
        ssp = c.reg[stackRegisterIndex];
    }
    const base = ssp & qdosSysvarBlockMask;
    if (base >= qdosUserRamBase && base + 4 <= mem.length && readPointerLong(mem, base) === qdosSysvarIdent) {
        return base;
    }
    return qdosSysvarDefaultBase;
}

/**
 * Big-endian unsigned long read straight from a byte array, without bus timing
 * or hardware decode.
 *
 * @param {Uint8Array} mem
 * @param {number} addr
 * @returns {number}
 */
export function readPointerLong(mem, addr) {
    return ((mem[addr] << 24) | (mem[addr + 1] << 16) | (mem[addr + 2] << 8) | mem[addr + 3]) >>> 0;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} addr
 * @returns {number}
 */
function readDecodedWord(c, bus, addr) {
    const next = (addr + 1) & addrMask;
    if (addressIsHardware(bus, addr) || ((addr & 1) !== 0 && (next === 0 || addressIsHardware(bus, next)))) {
        const highByte = readByte(c, bus, addr);
        const lowByte = readByte(c, bus, next);
        return ((highByte << 8) | lowByte) & 0xFFFF;
    }
    addCpuBusCycles(c, addr, wordBusCycles);
    if (!addressIsMapped(bus, addr)) {
        return 0;
    }
    return readPointerWord(bus.mem, addr);
}

/**
 * Big-endian unsigned word read straight from a byte array, without bus timing
 * or hardware decode.
 *
 * @param {Uint8Array} mem
 * @param {number} addr
 * @returns {number}
 */
export function readPointerWord(mem, addr) {
    return (mem[addr] << 8) | mem[addr + 1];
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} addr
 * @returns {number}
 */
function readByte(c, bus, addr) {
    addr &= addrMask;
    const mapped = addressIsMapped(bus, addr);
    if (mapped && (!c.accessActive || c.exception === 0) && addressIsHardware(bus, addr)) {
        return accessHardwareByte(c, bus, addr, false, 0);
    }
    addCpuBusCycles(c, addr, byteBusCycles);
    if (!mapped || (c.accessActive && c.exception !== 0)) {
        return 0;
    }
    return bus.mem[addr];
}

/**
 * @param {Cpu} c
 * @param {number} addr
 * @param {number} busCycles
 */
function addCpuBusCycles(c, addr, busCycles) {
    if (!c.accessActive) {
        return;
    }
    // Only the onboard RAM shares its bus with the ZX8301.
    const first = addr & addrMask;
    if (first >= zx8301OnboardRamEnd || first + busCycles <= qdosUserRamBase) {
        c.cycleCount += busCycles * busCycleClocks;
        return;
    }
    for (let i = 0; i < busCycles; i += 1) {
        const address = (addr + i) & addrMask;
        if (address >= qdosUserRamBase && address < zx8301OnboardRamEnd) {
            zx8301WaitForCpuRamSlot(c);
        }
        c.cycleCount += busCycleClocks;
    }
}

/**
 * Full 32-bit address arithmetic, as held in an address register; the bus
 * masks the result to 20 bits when it is used.
 *
 * @param {number} base
 * @param {number} offset
 * @returns {number}
 */
function addressOffset(base, offset) {
    return (base + offset) | 0;
}

/**
 * Hold a CPU access to onboard RAM until the ZX8301 leaves a bus slot free:
 * any slot after the display fetch, or the CPU slot of a display chunk.
 *
 * @param {Cpu} c
 */
function zx8301WaitForCpuRamSlot(c) {
    const alignment = c.cycleCount % busCycleClocks;
    if (alignment !== 0) {
        c.cycleCount += busCycleClocks - alignment;
    }
    const slot = Math.floor(c.cycleCount / busCycleClocks) % zx8301BusSlotsPerLine;
    if (slot < zx8301DisplayBusSlots) {
        c.cycleCount += (zx8301CpuDisplaySlot - slot % zx8301BusSlotsPerChunk) * busCycleClocks;
    }
}

/**
 * Report whether `addr` is ROM, RAM, or the selected QSound window.
 *
 * @param {CpuBus} bus
 * @param {number} addr
 * @returns {boolean}
 */
export function addressIsMapped(bus, addr) {
    if (addr >= 0 && addr < bus.guestRamTop) {
        return true;
    }
    return addr >= bus.qsoundBase && addr < bus.qsoundEnd;
}

/**
 * Report whether `addr` is the QIMSI, ZX8302, or selected QSound window.
 * ROM addresses below the ZX8302 window need only the QIMSI test.
 *
 * @param {CpuBus} bus
 * @param {number} addr
 * @returns {boolean}
 */
export function addressIsHardware(bus, addr) {
    if (addr < internalIoBase) {
        return addr < bus.qimsiEnd && addr >= bus.qimsiBase;
    }
    if (addr < internalIoEnd) {
        return true;
    }
    return addr >= bus.qsoundBase && addr < bus.qsoundEnd;
}

/**
 * Sequence DS, the device transfer, and bus completion without moving time back.
 * E falls half a clock before multiples of ten; E-qualified VPA is sampled at
 * the end of S4, then a complete E-high transfer must finish before S7 ends.
 * Extra peripheral clocks are kept outside the instruction's internal padding.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} addr
 * @param {boolean} write
 * @param {number} data
 * @returns {number}
 */
function accessHardwareByte(c, bus, addr, write, data) {
    if (!c.accessActive) {
        if (write) {
            bus.writeHwByte(addr, data);
            return 0;
        }
        return bus.readHwByte(addr);
    }
    const start = c.cycleCount;
    let end = start + busCycleClocks;
    const peripheral = addr >= bus.qsoundBase && addr < bus.qsoundEnd;
    if (peripheral) {
        let sync = start + 3;
        const phase = sync % peripheralEClocks;
        if (phase >= peripheralELowClocks) {
            sync += peripheralEClocks - phase;
        }
        end = sync + peripheralEClocks - sync % peripheralEClocks;
        c.peripheralWaitCycles += end - start - busCycleClocks;
    }
    c.cycleCount = start + 1 + Number(write);
    bus.beginHwAccess(addr, write, data);
    let transfer = end;
    if (peripheral) {
        transfer -= 1 - Number(write) * 0.5;
    }
    c.cycleCount = transfer;
    let value = 0;
    if (write) {
        bus.writeHwByte(addr, data);
    } else {
        value = bus.readHwByte(addr);
    }
    if (peripheral) {
        c.cycleCount = end - 0.5;
    }
    bus.endHwAccess();
    c.cycleCount = end;
    return value;
}

/**
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function shiftRotateDataRegister(c, bus) {
    const code = c.code;
    const left = (code & shiftRotateLeftBit) !== 0;
    const size = operandSizeFromBits(code >> sizeFieldShift);
    let count = opcodeQuickValue(code);
    if ((code & dataRegisterShiftCountRegisterBit) !== 0) {
        count = c.reg[(code >> 9) & 7] & 63;
        // Timed here, from the count before the shift can overwrite it.
        c.instructionCycleOverride = cpuShiftCycles(code, count);
    }
    const operation = (code >> dataRegisterShiftOperationShift) & shiftOperationMask;
    const index = code & 7;
    const value = c.reg[index] & operandSizes[size].valueMask;
    writeDataRegisterSized(c, index, size, shiftRotate(c, operation, left, value, count, 8 << size));
}

/**
 * Shift or rotate `value` by `count` bits of `width`, set the flags, and
 * return the result.
 *
 * @param {Cpu} c
 * @param {number} operation
 * @param {boolean} left
 * @param {number} value
 * @param {number} count
 * @param {number} width
 * @returns {number}
 */
function shiftRotate(c, operation, left, value, count, width) {
    const signBit = (1 << (width - 1)) >>> 0;
    c.carry = false;
    let newOverflow = false;
    if (count !== 0) {
        switch (operation) {
        case shiftOperationArithmetic:
        case shiftOperationLogical:
            if (count <= width) {
                let carryBit = 1 << (count - 1);
                if (left) {
                    carryBit = signBit >>> (count - 1);
                }
                c.carry = (value & carryBit) !== 0;
            } else if (operation === shiftOperationArithmetic && !left) {
                // Every bit shifted out past the operand is a copy of the sign.
                c.carry = (value & signBit) !== 0;
            }
            if (operation === shiftOperationArithmetic && left) {
                newOverflow = arithmeticShiftOverflows(value, count, width);
            }
            if (operation === shiftOperationArithmetic && !left) {
                value = arithmeticShiftRight(value, count, width);
            } else {
                value = logicalShift(value, count, width, left);
            }
            break;
        case shiftOperationRotateExtend:
            c.carry = rotateExtendFlag(value, count, width, c.xflag, left);
            value = rotateExtend(value, count, width, c.xflag, left);
            break;
        case shiftOperationRotate:
            value = rotateBits(value, count, width, left);
            if (left) {
                c.carry = (value & 1) !== 0;
            } else {
                c.carry = (value & signBit) !== 0;
            }
            break;
        }
        if (operation !== shiftOperationRotate) {
            c.xflag = c.carry;
        }
    } else if (operation === shiftOperationRotateExtend) {
        c.carry = c.xflag;
    }
    c.negative = (value & signBit) !== 0;
    c.zero = value === 0;
    c.overflow = newOverflow;
    return value;
}

/**
 * @param {number} opcode
 * @param {number} count
 * @returns {number}
 */
function cpuShiftCycles(opcode, count) {
    if (operandSizeFromBits(opcode >> sizeFieldShift) === operandLong) {
        return 12 + 2 * count;
    }
    return 10 + 2 * count;
}

/**
 * @param {number} bits
 * @returns {number}
 */
function operandSizeFromBits(bits) {
    const sizeField = bits & sizeFieldMask;
    if (sizeField === invalidSizeField) {
        return operandLong;
    }
    return sizeField;
}

/**
 * @param {number} opcode
 * @returns {number}
 */
function opcodeQuickValue(opcode) {
    const value = (opcode >> opcodeQuickValueShift) & opcodeQuickValueMask;
    if (value === 0) {
        return opcodeQuickZeroValue;
    }
    return value;
}

/**
 * Shift right, copying the sign bit in; `count` must be at least 1.
 *
 * @param {number} value
 * @param {number} count
 * @param {number} width
 * @returns {number}
 */
function arithmeticShiftRight(value, count, width) {
    const valueMask = bitWidthMask(width);
    value &= valueMask;
    const signBit = 1 << (width - 1);
    if (count >= width) {
        if ((value & signBit) !== 0) {
            return valueMask;
        }
        return 0;
    }
    let shifted = value >>> count;
    if ((value & signBit) !== 0) {
        shifted |= valueMask << (width - count);
    }
    return shifted & valueMask;
}

/**
 * ASL's overflow: whether the sign bit changes at any step. ASL shifts the
 * value as LSL does.
 *
 * @param {number} value
 * @param {number} count
 * @param {number} width
 * @returns {boolean}
 */
function arithmeticShiftOverflows(value, count, width) {
    const valueMask = bitWidthMask(width);
    value &= valueMask;
    if (count >= width) {
        return value !== 0;
    }
    const signBit = 1 << (width - 1);
    let shiftedOutMask = valueMask << (width - 1 - count);
    shiftedOutMask &= valueMask;
    let expected = 0;
    if ((value & signBit) !== 0) {
        expected = shiftedOutMask;
    }
    return (value & shiftedOutMask) !== expected;
}

/**
 * @param {number} value
 * @param {number} count
 * @param {number} width
 * @param {boolean} left
 * @returns {number}
 */
function rotateBits(value, count, width, left) {
    const valueMask = bitWidthMask(width);
    value &= valueMask;
    count %= width;
    if (count === 0) {
        return value;
    }
    const otherCount = width - count;
    if (left) {
        return ((value << count) | (value >>> otherCount)) & valueMask;
    }
    return ((value >>> count) | (value << otherCount)) & valueMask;
}

/**
 * Rotate through X.
 *
 * @param {number} value
 * @param {number} count
 * @param {number} width
 * @param {boolean} oldX
 * @param {boolean} left
 * @returns {number}
 */
function rotateExtend(value, count, width, oldX, left) {
    const valueMask = bitWidthMask(width);
    const signBit = 1 << (width - 1);
    value &= valueMask;
    count %= width + 1;
    let x = oldX;
    for (let i = 0; i < count; i += 1) {
        if (left) {
            const newX = (value & signBit) !== 0;
            value = ((value << 1) | Number(x)) & valueMask;
            x = newX;
        } else {
            const newX = (value & 1) !== 0;
            value = value >>> 1;
            if (x) {
                value |= signBit;
            }
            x = newX;
        }
    }
    return value;
}

/**
 * The X bit a rotate through X leaves: the last bit rotated out of `value`.
 *
 * @param {number} value
 * @param {number} count
 * @param {number} width
 * @param {boolean} oldX
 * @param {boolean} left
 * @returns {boolean}
 */
function rotateExtendFlag(value, count, width, oldX, left) {
    count %= width + 1;
    if (count === 0) {
        return oldX;
    }
    if (left) {
        return ((value >>> (width - count)) & 1) !== 0;
    }
    return ((value >>> (count - 1)) & 1) !== 0;
}

/**
 * @param {number} value
 * @param {number} count
 * @param {number} width
 * @param {boolean} left
 * @returns {number}
 */
function logicalShift(value, count, width, left) {
    if (count >= width) {
        return 0;
    }
    const valueMask = bitWidthMask(width);
    value &= valueMask;
    if (left) {
        return (value << count) & valueMask;
    }
    return value >>> count;
}

/**
 * Low `width` bits set, for widths of 1 to 32.
 *
 * @param {number} width
 * @returns {number}
 */
function bitWidthMask(width) {
    return 0xFFFFFFFF >>> (32 - width);
}

/**
 * Replace the low byte, word, or all of a data register; skipped while an
 * exception is pending.
 *
 * @param {Cpu} c
 * @param {number} index
 * @param {number} size
 * @param {number} value
 */
function writeDataRegisterSized(c, index, size, value) {
    if (c.exception !== 0) {
        return;
    }
    const valueMask = operandSizes[size].valueMask;
    c.reg[index] = (c.reg[index] & ~valueMask) | (value & valueMask);
}
