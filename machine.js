import * as ay from "./ay.js";
import * as cpu from "./cpu.js";
import * as disk from "./disk.js";
import * as fm from "./fm.js";

export const sysRomSize = 0xC000;
export const qsoundRomSize = 0x2000;
export const qsoundOff = 0;
export const qsoundOriginal = 1;
export const qsound2 = 2;
export const defaultRamKb = 128;

const romCartridgeSize = 0x4000;
const frameW = 512;
const frameH = 256;
const screenLineBytes = 128;
const screenBytes = screenLineBytes * frameH;
const screenBase = cpu.qdosUserRamBase;
const secondScreenBase = screenBase + screenBytes;
const qdosUnixEpochDelta = 283996800;

const qdosClockBaseAddr = cpu.internalIoBase;
const ipcWriteAddr = qdosClockBaseAddr + 3;
const ipcReadAddr = qdosClockBaseAddr + 0x20;
const interruptStatusAddr = ipcReadAddr + 1;
const microdriveTrack1Addr = interruptStatusAddr + 1;
const microdriveTrack2Addr = microdriveTrack1Addr + 1;
const displayControlAddr = 0x018063;
const displayControlBlankBit = 0x02;
const displayControlMode8 = 0x08;
const displayControlNtscBit = 0x40;
const displayControlScreenBit = 0x80;
const interruptClearMask = 0x1F;
const ipcReadMarker = 0xA50000;
const ipcReadSetMarker = 0xA58000;
const ipcReadDoneMarker = 0xA5;
const ipcReadIdleValue = 0;
const ipcWireTransferReady = 0x0C;
const ipcWireCommandReadyBit = 0x10;
const ipcWireCommandMask = 0x0F;
const ipcWireStatusCommand = 0x01;
const ipcWireReadKeysCommand = 0x08;
const ipcWireKeyboardRowCommand = 0x09;
const ipcWireSoundCommand = 0x0A;
const ipcWireKillSoundCommand = 0x0B;
const ipcWireNoResponseCommand = 0x0D;
const ipcWireSoundNibbleCount = 16;
const ipcWireKeyboardRowResponseBits = 8;
const ipcWireStatusResponseBits = 8;
const ipcWireDefaultResponseBits = 4;
const ipcWireReadKeysCountBits = 4;
const maxIpcQueuedKeys = 7;
const audioCap = 8192;
const qlaySectorSize = 686;
const microdriveUnitCount = 2;
const blankMdvSectorCount = 255;
const microdriveBitRateHz = 100000;
const microdriveBitsPerPair = 8;
const microdriveSelectDataBit = 0x01;
const microdriveSelectClockBit = 0x02;
const microdriveReadWriteBit = 0x04;
const microdriveEraseBit = 0x08;
const microdriveStatusTransmitFullBit = 0x02;
const microdriveStatusReadReadyBit = 0x04;
const microdriveStatusGapBit = 0x08;
const microdriveGapInterruptBit = 0x01;
const microdriveMaxImageBytes = 2 * 1024 * 1024;
const microdriveHeaderGapEndOffset = 6;
const qlaySectorHeaderOffset = 12;
const qlayBlockPreambleOffset = 28;
const qlayBlockGapEndOffset = 34;
const qlayBlockHeaderOffset = 40;
const qlayDataPreambleOffset = 44;
const qlayDataOffset = 52;
const qlayGapOffset = 566;
const qlayFormatGapOffset = 652;
const microdriveEmptyGapPairs = (qlaySectorSize - qlayGapOffset) / 2;
const qlayBadFileId = 0xFF;
const soundIpcTickHz = 22917;
const soundPitchFractionScale = 10;
const soundPitchBaseUnits = 106;
const soundPitchDivisor = soundIpcTickHz * soundPitchFractionScale;
const soundNibbleMax = 0x0F;
const soundSignedNibbleMax = 7;
const soundSignedNibbleBias = 16;
const soundPitchWrapDelta = 8;
const romCartridgeBase = sysRomSize;
const qsoundBase = 0xC0000;
const qsoundBytes = 0x4000;
const qsoundPiaBase = qsoundBase + qsoundRomSize;
const qsound2PiaBytes = 0x1000;
const qsound2DirectBase = qsoundPiaBase + qsound2PiaBytes;
const qsoundDataSelectBit = 0x04;
const qsoundAddressSelect = 0x05;
const qsoundDataWrite = 0x04;
const qsoundSelectMask = 0x05;
const qsoundAyTickCycles = 80;
const qsound2SsgTickHz = 125000;
const qsoundRegisterMasks = Uint8Array.of(
    0xFF, 0x0F, 0xFF, 0x0F, 0xFF, 0x0F, 0x1F, 0xFF,
    0x1F, 0x1F, 0x1F, 0xFF, 0xFF, 0x0F, 0xFF, 0xFF,
);
const mode4Lut = new Uint8Array(16 * 16 * 4);
const mode8Lut = new Uint8Array(16 * 16 * 4);

for (let ink = 0; ink < 16; ink += 1) {
    for (let paper = 0; paper < 16; paper += 1) {
        const base = (ink * 16 + paper) * 4;
        for (let bit = 3; bit >= 0; bit -= 1) {
            const p1 = (ink >> bit) & 1;
            const p2 = (paper >> bit) & 1;
            mode4Lut[base + (3 - bit)] = (p1 << 2) | (p2 << 1) | (p1 & p2);
        }
        for (let bit = 2; bit >= 0; bit -= 2) {
            const p1 = (ink >> bit) & 3;
            const p2 = (paper >> bit) & 3;
            const color = ((p1 & 2) << 1) | p2;
            const pixel = 2 - bit;
            mode8Lut[base + pixel] = color;
            mode8Lut[base + pixel + 1] = color;
        }
    }
}

/**
 * @typedef {{
 *   n: number,
 *   beep: Float32Array,
 *   a: Float32Array,
 *   b: Float32Array,
 *   c: Float32Array,
 *   fm: Float32Array,
 * }} AudioChunk
 */

/**
 * @typedef {{
 *   image: Uint8Array,
 *   imageLen: number,
 *   byteOffset: number,
 *   inserted: boolean,
 *   name: string,
 *   unformatted: boolean,
 *   formatVerifying: boolean,
 *   formatVerified: boolean,
 *   modified: boolean,
 *   readCount: number,
 *   writeCount: number,
 * }} MicrodriveCartridge
 */

/**
 * @typedef {{
 *   mem: Uint8Array,
 *   cpu: import("./cpu.js").Cpu,
 *   cpuBus: import("./cpu.js").CpuBus,
 *   pixels: Uint8Array,
 *   keys: import("./keyboard.js").KeyState,
 *   theInt: number,
 *   guestRamTop: number,
 *   romLoaded: boolean,
 *   ntscMachine: boolean,
 *   displayNtsc: boolean,
 *   displayBlank: boolean,
 *   displayMode8: boolean,
 *   displaySecondScreen: boolean,
 *   flashFrame: number,
 *   videoOn: boolean,
 *   soundOn: boolean,
 *   sampleRate: number,
 *   sampleAcc: number,
 *   sampleT: number,
 *   sampleEndT: number,
 *   audio: AudioChunk,
 *   ipcRead: number,
 *   ipcReceived: number,
 *   ipcWait: boolean,
 *   ipcSoundNibblesLeft: number,
 *   ipcSoundNibblePos: number,
 *   ipcSoundDecoded: Uint8Array,
 *   ipcKeyboardRowPending: boolean,
 *   ipcResponse: Uint8Array,
 *   ipcResponseBits: number,
 *   ipcResponseSent: number,
 *   beep: {
 *     active: boolean,
 *     pitch1: number,
 *     pitch: number,
 *     pitch2: number,
 *     grdX: number,
 *     grdY: number,
 *     length: number,
 *     wrap: number,
 *     randomAmount: number,
 *     fuzzAmount: number,
 *     random: number,
 *     fuzz: number,
 *     randomState: number,
 *     left: number,
 *     pitchLeft: number,
 *     pitchSpan: number,
 *     halfCycle: number,
 *     cyclePoint: number,
 *     waveState: number,
 *     wrapCount: number,
 *     direction: number,
 *   },
 *   qsound: {
 *     model: number,
 *     rom: Uint8Array,
 *     selectedRegister: number,
 *     pia: Uint8Array,
 *     dataDirectionA: number,
 *     dataDirectionB: number,
 *     ay: import("./ay.js").State,
 *     fm: import("./fm.js").State,
 *   },
 *   disks: import("./disk.js").Disks,
 *   mdv: {
 *     cartridges: MicrodriveCartridge[],
 *     selectedMask: number,
 *     readingMask: number,
 *     control: number,
 *     latchedByteOffset: number,
 *     latchedTracks: number,
 *     transmitFullUntil: number,
 *     formattingUnit: number,
 *     formatWriteOffset: number,
 *     formatBurstBytes: number,
 *     gapActive: boolean,
 *     dataReady: boolean,
 *     cycleAnchor: number,
 *     pairCycles: number,
 *   },
 * }} Machine
 */

/**
 * Create a powered-off QL hardware state connected to the supplied IPC keys.
 *
 * @param {import("./keyboard.js").KeyState} keys
 * @returns {Machine}
 */
export function create(keys) {
    const audioN = audioCap;
    const mem = new Uint8Array(cpu.addressSpaceBytes);
    /** @type {MicrodriveCartridge[]} */
    const cartridges = [];
    for (let i = 0; i < microdriveUnitCount; i += 1) {
        cartridges.push(emptyCartridge());
    }
    /** @type {Machine} */
    const m = {
        mem,
        cpu: cpu.create(),
        cpuBus: {
            mem,
            isUnmapped: function (addr) {
                return isUnmapped(m, addr);
            },
            isHw: function (addr) {
                return hardwareIsMapped(m, addr);
            },
            readHwByte: function (addr) {
                return readHwByte(m, addr);
            },
            readHwLongClock: readQdosClock,
            writeHwByte: function (addr, d) {
                writeHwByte(m, addr, d);
            },
            afterInstruction: function () {
                microdriveAdvanceActive(m);
            },
            resetHardware: function () {
                resetIpc(m);
                microdriveResetHardware(m);
                stopBeep(m);
            },
        },
        pixels: new Uint8Array(frameW * frameH),
        keys,
        theInt: 0,
        guestRamTop: cpu.qdosUserRamBase + defaultRamKb * 1024,
        ntscMachine: false,
        displayNtsc: false,
        displayBlank: false,
        displayMode8: false,
        displaySecondScreen: false,
        flashFrame: 0,
        videoOn: true,
        soundOn: false,
        sampleRate: 48000,
        sampleAcc: 0,
        sampleT: 0,
        sampleEndT: 0,
        audio: {
            n: 0,
            beep: new Float32Array(audioN),
            a: new Float32Array(audioN),
            b: new Float32Array(audioN),
            c: new Float32Array(audioN),
            fm: new Float32Array(audioN),
        },
        ipcRead: 0,
        ipcReceived: 1,
        ipcWait: true,
        ipcSoundNibblesLeft: 0,
        ipcSoundNibblePos: 0,
        ipcSoundDecoded: new Uint8Array(8),
        ipcKeyboardRowPending: false,
        ipcResponse: new Uint8Array(16),
        ipcResponseBits: 0,
        ipcResponseSent: 0,
        beep: {
            active: false,
            pitch1: 0,
            pitch: 0,
            pitch2: 0,
            grdX: 0,
            grdY: 0,
            length: 0,
            wrap: 0,
            randomAmount: 0,
            fuzzAmount: 0,
            random: 0,
            fuzz: 0,
            randomState: 1,
            left: -1,
            pitchLeft: 0,
            pitchSpan: 0,
            halfCycle: 1,
            cyclePoint: 0,
            waveState: 0,
            wrapCount: 0,
            direction: 1,
        },
        qsound: {
            model: qsoundOff,
            rom: new Uint8Array(qsoundRomSize),
            selectedRegister: 0,
            pia: new Uint8Array(4),
            dataDirectionA: 0,
            dataDirectionB: 0,
            ay: ay.create(qsoundAyTickCycles),
            fm: fm.create(),
        },
        disks: disk.create(),
        mdv: {
            cartridges,
            selectedMask: 0,
            readingMask: 0,
            control: microdriveSelectClockBit | microdriveReadWriteBit,
            latchedByteOffset: 0,
            latchedTracks: 0,
            transmitFullUntil: 0,
            formattingUnit: -1,
            formatWriteOffset: 0,
            formatBurstBytes: 0,
            gapActive: false,
            dataReady: false,
            cycleAnchor: 0,
            pairCycles: 0,
        },
        romLoaded: false,
    };
    setNtsc(m, false);
    fillRam(m);
    resetAudioClock(m);
    return m;
}

/**
 * Reset the hardware and CPU while preserving loaded ROM and cartridges.
 *
 * @param {Machine} m
 */
export function reset(m) {
    resetIpc(m);
    microdriveResetHardware(m);
    m.displayBlank = false;
    m.displayMode8 = false;
    m.displaySecondScreen = false;
    m.displayNtsc = false;
    m.flashFrame = 0;
    m.audio.n = 0;
    m.theInt = 0;
    stopBeep(m);
    disk.prepareReset(m.disks, m.mem);
    cpu.reset(m.cpu, m.cpuBus);
    resetQsound(m);
    resetAudioClock(m);
    decodeScreen(m);
}

/**
 * Replace the system ROM, clear RAM, and leave execution stopped until reset.
 *
 * @param {Machine} m
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {string | null}
 */
export function setSysRom(m, bytes) {
    let src = bytes;
    if (!(src instanceof Uint8Array)) {
        src = new Uint8Array(src);
    }
    if (src.byteLength === 0 || src.byteLength > sysRomSize) {
        return "Expected 1 to " + sysRomSize + ", got " + src.byteLength + " bytes.";
    }
    fillRam(m);
    m.mem.fill(0, 0, sysRomSize);
    m.mem.set(src, 0);
    m.romLoaded = true;
    disk.patchRom(m.disks, m.mem);
    return null;
}

/**
 * Select the contiguous QL RAM size and initialize its mapped contents.
 *
 * @param {Machine} m
 * @param {number} ramKb
 * @returns {boolean}
 */
export function setRamKb(m, ramKb) {
    switch (ramKb) {
    case 128:
    case 384:
    case 640:
    case 896:
        break;
    default:
        return false;
    }
    m.guestRamTop = cpu.qdosUserRamBase + ramKb * 1024;
    fillRam(m);
    return true;
}

/**
 * Insert a read-only ROM-port cartridge, padded to its 16 KiB window.
 *
 * @param {Machine} m
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {string | null}
 */
export function insertRomCartridge(m, bytes) {
    let src = bytes;
    if (!(src instanceof Uint8Array)) {
        src = new Uint8Array(src);
    }
    if (src.byteLength === 0 || src.byteLength > romCartridgeSize) {
        return "Expected 1 to " + romCartridgeSize + ", got " + src.byteLength + " bytes.";
    }
    m.mem.fill(0, romCartridgeBase, romCartridgeBase + romCartridgeSize);
    m.mem.set(src, romCartridgeBase);
    return null;
}

/**
 * Clear the external ROM-port cartridge without changing the running CPU.
 *
 * @param {Machine} m
 */
export function ejectRomCartridge(m) {
    m.mem.fill(0, romCartridgeBase, romCartridgeBase + romCartridgeSize);
}

/**
 * Install the QSound extension ROM shared by both card models.
 *
 * @param {Machine} m
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {string | null}
 */
export function setQsoundRom(m, bytes) {
    let src = bytes;
    if (!(src instanceof Uint8Array)) {
        src = new Uint8Array(src);
    }
    if (src.byteLength === 0 || src.byteLength > qsoundRomSize) {
        return "Expected 1 to " + qsoundRomSize + ", got " + src.byteLength + " bytes.";
    }
    m.qsound.rom.fill(0);
    m.qsound.rom.set(src);
    return null;
}

/**
 * Select no sound card, original QSound, or QSound2.
 *
 * @param {Machine} m
 * @param {number} model
 * @returns {boolean}
 */
export function setQsoundModel(m, model) {
    if (model !== qsoundOff && model !== qsoundOriginal && model !== qsound2) {
        return false;
    }
    m.qsound.model = model;
    resetQsound(m);
    return true;
}

/**
 * Select PAL or US machine clocks without changing the current display field.
 * Microdrive pair timing follows the CPU clock and the sound card is reset so
 * its PSG divider follows it too.
 *
 * @param {Machine} m
 * @param {boolean} ntsc
 */
export function setNtsc(m, ntsc) {
    m.ntscMachine = ntsc;
    m.mdv.pairCycles = Math.round(cpuClockHz(m) / microdriveBitRateHz * microdriveBitsPerPair);
    resetQsound(m);
}

/**
 * Return the ZX8301 clocks in the currently selected display field.
 *
 * @param {Machine} m
 * @returns {number}
 */
export function clocksPerFrame(m) {
    if (m.ntscMachine && m.displayNtsc) {
        return cpu.zx8301NtscClocksPerFrame;
    }
    return cpu.zx8301PalClocksPerFrame;
}

/**
 * Return the CPU clock selected for this machine instance.
 *
 * @param {Machine} m
 * @returns {number}
 */
export function cpuClockHz(m) {
    if (m.ntscMachine) {
        return cpu.qlNtscClockHz;
    }
    return cpu.qlPalClockHz;
}

/**
 * Field rate of the current ZX8301 raster. US chips stay near 50 Hz in
 * the 312-line monitor field and near 60 Hz when bit 6 of `$18063` selects
 * the 262-line TV field.
 *
 * @param {Machine} m
 * @returns {number}
 */
export function frameHz(m) {
    return cpuClockHz(m) / clocksPerFrame(m);
}

/**
 * Execute one current PAL or NTSC display field and update host outputs.
 *
 * @param {Machine} m
 */
export function runFrame(m) {
    if (!m.romLoaded) {
        m.pixels.fill(0);
        return;
    }
    const frameClocks = clocksPerFrame(m);
    // The cumulative CPU budget carries complete-instruction overshoot into
    // the next field, keeping guest time aligned with the display raster.
    cpu.executeCycleBudget(m.cpu, m.cpuBus, frameClocks);
    if (m.videoOn) {
        decodeScreen(m);
    }
    m.flashFrame = (m.flashFrame + 1) & 63;
    renderAudioTo(m, m.cpu.cycleCount);
    m.theInt |= cpu.frameInterruptStatusBit;
    cpu.frameInterrupt(m.cpu, m.cpuBus);
}

/**
 * Enable or suppress sample generation while the CPU runs.
 *
 * @param {Machine} m
 * @param {boolean} on
 */
export function enableSound(m, on) {
    if (m.soundOn === on) {
        return;
    }
    m.soundOn = on;
    m.audio.n = 0;
    resetAudioClock(m);
}

/**
 * @param {Machine} m
 * @param {number} sampleRate
 */
export function setSoundRate(m, sampleRate) {
    m.sampleRate = sampleRate;
    resetAudioClock(m);
}

/**
 * Insert a QLAY image. Does not reset the CPU or the MDV select chain.
 *
 * @param {Machine} m
 * @param {number} drive
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {string} name
 * @returns {string | null}
 */
export function insertMdv(m, drive, bytes, name) {
    if (drive < 0 || drive >= microdriveUnitCount) {
        return "Invalid microdrive.";
    }
    let src = bytes;
    if (!(src instanceof Uint8Array)) {
        src = new Uint8Array(src);
    }
    if (src.byteLength === 0 || src.byteLength > microdriveMaxImageBytes || src.byteLength % qlaySectorSize !== 0) {
        return "Not a QLAY .mdv image (need a multiple of " + qlaySectorSize + " bytes).";
    }
    const cart = emptyCartridge();
    cart.image = new Uint8Array(src);
    cart.imageLen = src.byteLength;
    cart.inserted = true;
    cart.name = name;
    m.mdv.cartridges[drive] = cart;
    microdriveOnMediumChange(m);
    return null;
}

/**
 * Insert a zero-filled, unformatted cartridge with standard maximum capacity.
 *
 * @param {Machine} m
 * @param {number} drive
 * @param {string} name
 * @returns {string | null}
 */
export function insertBlankMdv(m, drive, name) {
    const error = insertMdv(m, drive, new Uint8Array(blankMdvSectorCount * qlaySectorSize), name);
    if (error === null) {
        m.mdv.cartridges[drive].unformatted = true;
    }
    return error;
}

/**
 * Copy the current cartridge for download and mark that revision as saved.
 *
 * @param {Machine} m
 * @param {number} drive
 * @returns {{name: string, bytes: Uint8Array} | null}
 */
export function saveMdv(m, drive) {
    if (drive < 0 || drive >= microdriveUnitCount) {
        return null;
    }
    const cart = m.mdv.cartridges[drive];
    if (!cart.inserted) {
        return null;
    }
    const bytes = cart.image.slice(0, cart.imageLen);
    cart.modified = false;
    return {name: cart.name, bytes};
}

/**
 * Unplug a cartridge. Does not reset the CPU or the MDV select chain.
 *
 * @param {Machine} m
 * @param {number} drive
 */
export function ejectMdv(m, drive) {
    if (drive < 0 || drive >= microdriveUnitCount) {
        return;
    }
    m.mdv.cartridges[drive] = emptyCartridge();
    microdriveOnMediumChange(m);
}

/**
 * Return the user-visible medium, motor, and transfer state for one Microdrive.
 *
 * @param {Machine} m
 * @param {number} drive
 * @returns {{
 *   inserted: boolean,
 *   name: string,
 *   motorOn: boolean,
 *   reading: boolean,
 *   writing: boolean,
 *   modified: boolean,
 *   readCount: number,
 *   writeCount: number,
 * }}
 */
export function mdvInfo(m, drive) {
    const cart = m.mdv.cartridges[drive];
    const motorOn = (m.mdv.selectedMask & (1 << drive)) !== 0;
    const reading = cart.inserted && motorOn && (m.mdv.readingMask & (1 << drive)) !== 0;
    const writing = cart.inserted && motorOn && (m.mdv.control & microdriveEraseBit) !== 0;
    return {
        inserted: cart.inserted,
        name: cart.name,
        motorOn,
        reading,
        writing,
        modified: cart.modified,
        readCount: cart.readCount,
        writeCount: cart.writeCount,
    };
}

/** @returns {MicrodriveCartridge} */
function emptyCartridge() {
    return {
        image: new Uint8Array(0),
        imageLen: 0,
        byteOffset: 0,
        inserted: false,
        name: "",
        unformatted: false,
        formatVerifying: false,
        formatVerified: false,
        modified: false,
        readCount: 0,
        writeCount: 0,
    };
}

/** @param {Machine} m */
function fillRam(m) {
    let seed = (Math.floor(Math.random() * 0xFFFFFFFF) ^ Date.now()) >>> 0;
    if (seed === 0) {
        seed = 1;
    }
    for (let offset = cpu.qdosUserRamBase; offset < m.guestRamTop; offset += 4) {
        seed = xorshift32(seed);
        cpu.writePointerLong(m.mem, offset, seed);
    }
}

/** @param {number} seed @returns {number} */
function xorshift32(seed) {
    let value = seed >>> 0;
    value ^= value << 13;
    value >>>= 0;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
}

/**
 * @param {Machine} m
 * @param {number} addr
 * @returns {boolean}
 */
function isUnmapped(m, addr) {
    if (addr < 0) {
        return true;
    }
    if (qsoundContains(m, addr)) {
        return false;
    }
    if (addr < m.guestRamTop) {
        return false;
    }
    return addr < screenBase || addr >= secondScreenBase;
}

/**
 * ZX8302 I/O window and the selected QSound card occupy hardware, not RAM.
 *
 * @param {Machine} m
 * @param {number} addr
 * @returns {boolean}
 */
function hardwareIsMapped(m, addr) {
    if (addr >= cpu.internalIoBase && addr < cpu.internalIoEnd) {
        return true;
    }
    return qsoundContains(m, addr);
}

/** @param {Machine} m */
function resetIpc(m) {
    m.ipcRead = 0;
    m.ipcReceived = 1;
    m.ipcWait = true;
    m.ipcResponseBits = 0;
    m.ipcResponseSent = 0;
    m.ipcSoundNibblesLeft = 0;
    m.ipcSoundNibblePos = 0;
    m.ipcKeyboardRowPending = false;
}

/** @returns {number} */
function readQdosClock() {
    const unix = Math.floor(Date.now() / 1000);
    const zone = -new Date().getTimezoneOffset() * 60;
    return (unix + qdosUnixEpochDelta + zone) >>> 0;
}

/**
 * @param {Uint8Array} buffer
 * @param {number} maxBytes
 * @param {number} bitPos
 * @param {number} value
 * @param {number} count
 * @returns {number}
 */
function ipcAppendBits(buffer, maxBytes, bitPos, value, count) {
    for (let i = 0; i < count; i += 1) {
        if ((bitPos >> 3) >= maxBytes) {
            return bitPos;
        }
        if (((value >> (count - 1 - i)) & 1) !== 0) {
            buffer[bitPos >> 3] |= 1 << (7 - (bitPos & 7));
        }
        bitPos += 1;
    }
    return bitPos;
}

/**
 * @param {Machine} m
 * @param {Uint8Array} bytes
 * @param {number} length
 * @param {number} bits
 */
function ipcBeginResponse(m, bytes, length, bits) {
    const n = Math.min(length, m.ipcResponse.length);
    m.ipcResponse.fill(0);
    for (let i = 0; i < n; i += 1) {
        m.ipcResponse[i] = bytes[i];
    }
    m.ipcResponseBits = bits;
    m.ipcResponseSent = 0;
}

/**
 * @param {Machine} m
 * @returns {number}
 */
function ipcSerialStatus(m) {
    let status = 0;
    if (m.keys.queue.length > 0) {
        status |= 1;
    }
    if (m.beep.active) {
        status |= 2;
    }
    return status;
}

/**
 * @param {Machine} m
 * @param {Uint8Array} buffer
 * @returns {number}
 */
function ipcSerialReadKeys(m, buffer) {
    let count = m.keys.queue.length;
    if (count > maxIpcQueuedKeys) {
        count = maxIpcQueuedKeys;
    }
    buffer.fill(0);
    let bitPos = ipcAppendBits(buffer, buffer.length, 0, count, ipcWireReadKeysCountBits);
    for (let i = 0; i < count; i += 1) {
        const key = m.keys.queue[i];
        bitPos = ipcAppendBits(buffer, buffer.length, bitPos, key.modifiers, 4);
        bitPos = ipcAppendBits(buffer, buffer.length, bitPos, key.code, 8);
    }
    m.keys.queue.splice(0, count);
    return bitPos;
}

/**
 * @param {Machine} m
 * @param {number} row
 * @returns {number}
 */
function keyboardRow(m, row) {
    if (row < 0 || row >= 8) {
        return 0;
    }
    return m.keys.rows[row];
}

/**
 * @param {Machine} m
 * @param {number} d
 */
function ipcWrite(m, d) {
    if (!m.ipcWait) {
        m.ipcRead = 0;
        if (m.ipcResponseSent >= m.ipcResponseBits) {
            m.ipcWait = true;
            return;
        }
        const byte = m.ipcResponse[m.ipcResponseSent >> 3];
        const bit = 7 - (m.ipcResponseSent & 7);
        m.ipcRead = ipcReadMarker;
        if (((byte >> bit) & 1) !== 0) {
            m.ipcRead = ipcReadSetMarker;
        }
        m.ipcResponseSent += 1;
        if (m.ipcResponseSent >= m.ipcResponseBits) {
            m.ipcWait = true;
        }
        return;
    }
    if ((d & ipcWireTransferReady) !== ipcWireTransferReady) {
        return;
    }
    m.ipcReceived <<= 1;
    if (d !== ipcWireTransferReady) {
        m.ipcReceived |= 1;
    }
    if ((m.ipcReceived & ipcWireCommandReadyBit) === 0) {
        return;
    }
    const command = m.ipcReceived & ipcWireCommandMask;
    m.ipcReceived = 1;
    if (m.ipcSoundNibblesLeft > 0) {
        if ((m.ipcSoundNibblePos & 1) === 0) {
            m.ipcSoundDecoded[m.ipcSoundNibblePos >> 1] = (command << 4) & 0xFF;
        } else {
            m.ipcSoundDecoded[m.ipcSoundNibblePos >> 1] |= command & ipcWireCommandMask;
        }
        m.ipcSoundNibblePos += 1;
        m.ipcSoundNibblesLeft -= 1;
        if (m.ipcSoundNibblesLeft === 0) {
            startBeep(m, m.ipcSoundDecoded);
        }
        m.ipcWait = true;
        return;
    }
    if (m.ipcKeyboardRowPending) {
        m.ipcKeyboardRowPending = false;
        const rowState = new Uint8Array([keyboardRow(m, command)]);
        ipcBeginResponse(m, rowState, 1, ipcWireKeyboardRowResponseBits);
        m.ipcWait = false;
        return;
    }
    m.ipcWait = false;
    switch (command) {
    case ipcWireStatusCommand: {
        const status = new Uint8Array([ipcSerialStatus(m)]);
        ipcBeginResponse(m, status, 1, ipcWireStatusResponseBits);
        break;
    }
    case ipcWireReadKeysCommand: {
        const bytes = new Uint8Array(m.ipcResponse.length);
        let bits = ipcSerialReadKeys(m, bytes);
        if (bits === 0) {
            bits = ipcWireReadKeysCountBits;
        }
        ipcBeginResponse(m, bytes, Math.ceil(bits / 8), bits);
        break;
    }
    case ipcWireKeyboardRowCommand:
        m.ipcKeyboardRowPending = true;
        m.ipcWait = true;
        break;
    case ipcWireSoundCommand:
        m.ipcSoundNibblesLeft = ipcWireSoundNibbleCount;
        m.ipcSoundNibblePos = 0;
        m.ipcWait = true;
        break;
    case ipcWireKillSoundCommand:
        renderAudioTo(m, m.cpu.cycleCount);
        stopBeep(m);
        m.ipcWait = true;
        break;
    case ipcWireNoResponseCommand:
        m.ipcWait = true;
        break;
    default: {
        const zero = new Uint8Array([0]);
        ipcBeginResponse(m, zero, 1, ipcWireDefaultResponseBits);
        break;
    }
    }
}

/**
 * @param {Machine} m
 * @param {number} addr
 * @param {number} d
 */
function writeHwByte(m, addr, d) {
    if (qsoundContains(m, addr)) {
        writeQsound(m, addr, d);
        return;
    }
    switch (addr) {
    case displayControlAddr:
        m.displayBlank = (d & displayControlBlankBit) !== 0;
        m.displayNtsc = m.ntscMachine && (d & displayControlNtscBit) !== 0;
        m.displayMode8 = (d & displayControlMode8) !== 0;
        m.displaySecondScreen = (d & displayControlScreenBit) !== 0;
        break;
    case qdosClockBaseAddr:
    case qdosClockBaseAddr + 1:
    case qdosClockBaseAddr + 2:
        break;
    case ipcReadAddr:
        microdriveControlWrite(m, d);
        break;
    case ipcWriteAddr:
        ipcWrite(m, d);
        break;
    case interruptStatusAddr:
        if (microdriveHasMedia(m) || m.mdv.selectedMask !== 0) {
            microdriveAdvanceActive(m);
        }
        m.theInt = m.theInt & ~(d & interruptClearMask);
        break;
    case microdriveTrack1Addr:
    case microdriveTrack2Addr:
        microdriveWriteTrackByte(m, addr, d);
        break;
    }
}

/**
 * @param {Machine} m
 * @param {number} addr
 * @returns {number}
 */
function readHwByte(m, addr) {
    if (qsoundContains(m, addr)) {
        return readQsound(m, addr);
    }
    switch (addr) {
    case qdosClockBaseAddr:
    case qdosClockBaseAddr + 1:
    case qdosClockBaseAddr + 2:
    case qdosClockBaseAddr + 3: {
        const t = readQdosClock();
        const shift = (qdosClockBaseAddr + 3 - addr) * 8;
        return (t >>> shift) & 0xFF;
    }
    case ipcReadAddr:
        if (m.ipcRead !== 0) {
            let retByte = m.ipcRead & 0xFF;
            m.ipcRead >>>= 8;
            if (m.ipcRead === ipcReadDoneMarker) {
                m.ipcRead = 0;
            }
            if (microdriveHasMedia(m) || m.mdv.selectedMask !== 0) {
                retByte |= microdriveStatusBits(m);
            }
            return retByte;
        }
        let idle = ipcReadIdleValue;
        if (microdriveHasMedia(m) || m.mdv.selectedMask !== 0) {
            idle |= microdriveStatusBits(m);
        }
        return idle;
    case interruptStatusAddr:
        if (microdriveHasMedia(m) || m.mdv.selectedMask !== 0) {
            microdriveAdvanceActive(m);
        }
        return m.theInt & 0xFF;
    case microdriveTrack1Addr:
    case microdriveTrack2Addr:
        return microdriveReadTrackByte(m, addr);
    default:
        return 0;
    }
}

/** @param {Machine} m */
function decodeScreen(m) {
    if (m.displayBlank) {
        m.pixels.fill(0);
        return;
    }
    let src = screenBase;
    if (m.displaySecondScreen) {
        src = secondScreenBase;
    }
    const flash = m.displayMode8 && (m.flashFrame & 32) !== 0;
    if (flash) {
        decodeMode8Flash(m, src);
        return;
    }
    let lut = mode4Lut;
    if (m.displayMode8) {
        lut = mode8Lut;
    }
    const pixels = m.pixels;
    const mem = m.mem;
    let di = 0;
    for (let y = 0; y < frameH; y += 1) {
        const line = src + y * screenLineBytes;
        for (let x = 0; x < screenLineBytes; x += 2) {
            const first = mem[line + x];
            const second = mem[line + x + 1];
            const hi = ((first >> 4) * 16 + (second >> 4)) * 4;
            pixels[di] = lut[hi];
            pixels[di + 1] = lut[hi + 1];
            pixels[di + 2] = lut[hi + 2];
            pixels[di + 3] = lut[hi + 3];
            const lo = ((first & 0x0F) * 16 + (second & 0x0F)) * 4;
            pixels[di + 4] = lut[lo];
            pixels[di + 5] = lut[lo + 1];
            pixels[di + 6] = lut[lo + 2];
            pixels[di + 7] = lut[lo + 3];
            di += 8;
        }
    }
}

/**
 * @param {Machine} m
 * @param {number} src
 */
function decodeMode8Flash(m, src) {
    const pixels = m.pixels;
    const mem = m.mem;
    let di = 0;
    for (let y = 0; y < frameH; y += 1) {
        const line = src + y * screenLineBytes;
        let logicalX = 0;
        let flashBackground = 0;
        let flashOn = false;
        for (let x = 0; x < screenLineBytes; x += 2) {
            const first = mem[line + x];
            const second = mem[line + x + 1];
            for (let shift = 6; shift >= 0; shift -= 2) {
                const p1 = (first >> shift) & 3;
                const p2 = (second >> shift) & 3;
                const flashBit = (p1 & 1) !== 0;
                let color = ((p1 & 2) << 1) | p2;
                if (flashOn) {
                    color = flashBackground;
                }
                pixels[di] = color;
                pixels[di + 1] = color;
                di += 2;
                if (flashBit) {
                    if (!flashOn) {
                        flashBackground = color;
                    }
                    flashOn = !flashOn;
                }
                logicalX += 1;
                if (logicalX === 256) {
                    logicalX = 0;
                    flashBackground = 0;
                    flashOn = false;
                }
            }
        }
    }
}

/**
 * @param {Machine} m
 * @param {Uint8Array} decoded
 */
function startBeep(m, decoded) {
    renderAudioTo(m, m.cpu.cycleCount);
    const beep = m.beep;
    let grdY = (decoded[6] >> 4) & soundNibbleMax;
    if (grdY > soundSignedNibbleMax) {
        grdY -= soundSignedNibbleBias;
    }
    const randomState = beep.randomState;
    beep.active = true;
    beep.pitch1 = decoded[0];
    beep.pitch = beep.pitch1;
    beep.pitch2 = decoded[1];
    beep.grdX = decoded[2] | ((decoded[3] & 0x7F) << 8);
    beep.grdY = grdY;
    beep.length = decoded[4] | ((decoded[5] & 0x7F) << 8);
    beep.wrap = decoded[6] & soundNibbleMax;
    beep.randomAmount = (decoded[7] >> 4) & soundNibbleMax;
    beep.fuzzAmount = decoded[7] & soundNibbleMax;
    beep.random = 0;
    beep.fuzz = 0;
    beep.randomState = randomState;
    beep.left = Math.floor(beep.length * m.sampleRate / soundIpcTickHz);
    beep.pitchSpan = Math.floor(beep.grdX * m.sampleRate / soundIpcTickHz);
    beep.pitchLeft = beep.pitchSpan;
    beep.wrapCount = beep.wrap;
    beep.direction = 1;
    beep.cyclePoint = 0;
    beep.waveState = 0;
    if (beep.grdY < 0) {
        beep.pitch = beep.pitch2;
    }
    if (beep.left !== 0 && (beep.pitchLeft === 0 || beep.pitchLeft > beep.left)) {
        beep.pitchLeft = beep.left;
    }
    if (beep.fuzzAmount > soundSignedNibbleMax) {
        beep.fuzz = activeRandomNibble(beep, beep.fuzzAmount);
    }
    beep.halfCycle = beepHalfSampleCount(m, beep);
}

/** @param {Machine} m */
function stopBeep(m) {
    m.beep.active = false;
    m.beep.left = -1;
    m.beep.waveState = 0;
    m.beep.cyclePoint = 0;
}

/**
 * @param {Machine} m
 * @param {number} untilCycle
 */
function renderAudioTo(m, untilCycle) {
    const chunk = m.audio;
    while (m.sampleEndT <= untilCycle) {
        const period = m.sampleEndT - m.sampleT;
        const collect = m.soundOn && chunk.n < audioCap;
        if (collect) {
            ay.runTo(m.qsound.ay, m.sampleEndT);
            chunk.beep[chunk.n] = renderBeepSample(m);
            ay.takeSample(m.qsound.ay, period, chunk.a, chunk.b, chunk.c, chunk.n);
            chunk.fm[chunk.n] = renderFmSample(m);
            chunk.n += 1;
        } else {
            ay.runSilent(m.qsound.ay, m.sampleEndT);
            renderBeepSample(m);
            renderFmSample(m);
        }
        nextSampleWindow(m);
    }
    if (m.soundOn && chunk.n < audioCap) {
        ay.runTo(m.qsound.ay, untilCycle);
    } else {
        ay.runSilent(m.qsound.ay, untilCycle);
        ay.seek(m.qsound.ay, m.qsound.ay.t);
    }
}

/** @param {Machine} m */
function resetAudioClock(m) {
    const now = m.cpu.cycleCount;
    ay.seek(m.qsound.ay, now);
    m.sampleAcc = 0;
    m.sampleT = now;
    m.sampleEndT = now;
    nextSampleWindow(m);
}

/** @param {Machine} m */
function nextSampleWindow(m) {
    m.sampleT = m.sampleEndT;
    m.sampleAcc += cpuClockHz(m);
    const step = Math.floor(m.sampleAcc / m.sampleRate);
    m.sampleAcc -= step * m.sampleRate;
    m.sampleEndT += step;
}

/** @param {Machine} m @returns {number} */
function renderFmSample(m) {
    if (m.qsound.model !== qsound2) {
        return 0;
    }
    return fm.takeSample(m.qsound.fm, m.sampleRate);
}

/**
 * Advance the complete ZX8302 sound descriptor by one output sample.
 *
 * @param {Machine} m
 * @returns {number}
 */
function renderBeepSample(m) {
    const beep = m.beep;
    if (!beep.active || beep.left < 0) {
        beep.active = false;
        beep.waveState = 0;
        beep.cyclePoint = 0;
        return 0;
    }
    if (beep.pitchLeft < 0) {
        updateBeepPitch(m, beep);
        beep.pitchLeft = beep.pitchSpan;
        if (beep.left !== 0 && (beep.pitchLeft === 0 || beep.pitchLeft > beep.left)) {
            beep.pitchLeft = beep.left;
        }
    }
    if (beep.pitchLeft > 1) {
        beep.pitchLeft -= 1;
        if (beep.left !== 0) {
            beep.left -= 1;
        }
    } else if (beep.pitchLeft > 0) {
        if (beep.left > 1) {
            beep.left -= 1;
        } else if (beep.left !== 0) {
            beep.left = -1;
        }
        beep.pitchLeft = -1;
    }
    if (beep.waveState === 0) {
        beep.waveState = -1;
        if (beep.fuzzAmount > soundSignedNibbleMax) {
            beep.fuzz = activeRandomNibble(beep, beep.fuzzAmount);
            beep.halfCycle = beepHalfSampleCount(m, beep);
        }
        beep.cyclePoint = 0;
    }
    const sample = beep.waveState;
    beep.cyclePoint += 1;
    if (beep.cyclePoint >= beep.halfCycle) {
        beep.waveState *= -1;
        if (beep.fuzzAmount > soundSignedNibbleMax) {
            beep.fuzz = activeRandomNibble(beep, beep.fuzzAmount);
            beep.halfCycle = beepHalfSampleCount(m, beep);
        }
        beep.cyclePoint = 0;
    }
    return sample;
}

/**
 * Step the IPC pitch. Wrap 0 holds the far end of the sweep; wrap 1-14 restarts; wrap 15 loops.
 *
 * @param {Machine} m
 * @param {Machine["beep"]} beep
 */
function updateBeepPitch(m, beep) {
    const change = beep.grdY;
    if (change === -soundPitchWrapDelta) {
        beep.pitch = (beep.pitch - soundPitchWrapDelta) & 0xFF;
    } else if (change !== 0 && beep.direction !== 0) {
        const step = change * beep.direction;
        const tryPitch = beep.pitch + step;
        const lo = Math.min(beep.pitch1, beep.pitch2);
        const hi = Math.max(beep.pitch1, beep.pitch2);
        if (tryPitch >= lo && tryPitch <= hi) {
            beep.pitch = tryPitch;
        } else if (beep.wrapCount > 0) {
            beep.pitch = beep.pitch1;
            if (step < 0) {
                beep.pitch = beep.pitch2;
            }
            if (beep.wrapCount !== soundNibbleMax) {
                beep.wrapCount -= 1;
            }
        } else {
            beep.pitch = lo;
            if (step > 0) {
                beep.pitch = hi;
            }
            beep.direction = 0;
        }
    }
    if (beep.randomAmount > soundSignedNibbleMax) {
        beep.random = activeRandomNibble(beep, beep.randomAmount);
    }
    beep.halfCycle = beepHalfSampleCount(m, beep);
    if (beep.cyclePoint + 1 < beep.halfCycle) {
        beep.cyclePoint += 1;
    } else {
        beep.cyclePoint -= 1;
    }
}

/** @param {Machine} m @param {Machine["beep"]} beep @returns {number} */
function beepHalfSampleCount(m, beep) {
    let pitch = beep.pitch + beep.random + beep.fuzz;
    if (pitch < 0) {
        pitch = 0;
    }
    const units = pitch * soundPitchFractionScale + soundPitchBaseUnits;
    return Math.max(Math.round(m.sampleRate * units / soundPitchDivisor), 1);
}

/** @param {Machine["beep"]} beep @param {number} value @returns {number} */
function activeRandomNibble(beep, value) {
    let state = beep.randomState;
    if (state === 0) {
        state = 1;
    }
    state = xorshift32(state);
    beep.randomState = state;
    const bitCount = (value & soundSignedNibbleMax) + 1;
    return state & ((1 << bitCount) - 1);
}

/** @param {Machine} m @param {number} addr @returns {boolean} */
function qsoundContains(m, addr) {
    return m.qsound.model !== qsoundOff && addr >= qsoundBase && addr < qsoundBase + qsoundBytes;
}

/** @param {Machine} m */
function resetQsound(m) {
    const qsound = m.qsound;
    qsound.selectedRegister = 0;
    qsound.pia.fill(0);
    qsound.dataDirectionA = 0;
    qsound.dataDirectionB = 0;
    ay.configure(qsound.ay, qsoundTickCycles(m), qsound.model === qsound2, m.cpu.cycleCount);
    fm.reset(qsound.fm);
}

/**
 * Original QSound follows a fixed E-clock divider; QSound2's PSG follows 125 kHz.
 *
 * @param {Machine} m
 * @returns {number}
 */
function qsoundTickCycles(m) {
    if (m.qsound.model === qsound2) {
        return cpuClockHz(m) / qsound2SsgTickHz;
    }
    return qsoundAyTickCycles;
}

/** @param {Machine} m @param {number} addr @returns {number} */
function readQsound(m, addr) {
    if (addr < qsoundPiaBase) {
        return m.qsound.rom[addr - qsoundBase];
    }
    if (!qsoundPiaContains(m, addr)) {
        return readQsound2Direct(m, addr);
    }
    const reg = (addr - qsoundPiaBase) & 3;
    switch (reg) {
    case 0:
        if ((m.qsound.pia[1] & qsoundDataSelectBit) === 0) {
            return m.qsound.dataDirectionA;
        }
        return m.qsound.pia[0];
    case 1:
        return m.qsound.pia[1];
    case 2:
        if ((m.qsound.pia[3] & qsoundDataSelectBit) === 0) {
            return m.qsound.dataDirectionB;
        }
        return m.qsound.pia[2];
    default:
        return m.qsound.pia[3];
    }
}

/** @param {Machine} m @param {number} addr @param {number} value */
function writeQsound(m, addr, value) {
    if (addr < qsoundPiaBase) {
        return;
    }
    if (!qsoundPiaContains(m, addr)) {
        writeQsound2Direct(m, addr, value);
        return;
    }
    const reg = (addr - qsoundPiaBase) & 3;
    switch (reg) {
    case 0:
        if ((m.qsound.pia[1] & qsoundDataSelectBit) === 0) {
            m.qsound.dataDirectionA = value;
        } else {
            m.qsound.pia[0] = value;
        }
        return;
    case 1:
        m.qsound.pia[1] = value;
        return;
    case 2:
        if ((m.qsound.pia[3] & qsoundDataSelectBit) === 0) {
            m.qsound.dataDirectionB = value;
            return;
        }
        m.qsound.pia[2] = value;
        updateQsoundAy(m, value);
        return;
    default:
        m.qsound.pia[3] = value;
    }
}

/** @param {Machine} m @param {number} value */
function updateQsoundAy(m, value) {
    const select = value & qsoundSelectMask;
    if (select === qsoundAddressSelect) {
        m.qsound.selectedRegister = m.qsound.pia[0] & 0x0F;
        return;
    }
    if (select !== qsoundDataWrite) {
        return;
    }
    renderAudioTo(m, m.cpu.cycleCount);
    const reg = m.qsound.selectedRegister;
    const masked = m.qsound.pia[0] & qsoundRegisterMasks[reg];
    ay.writeReg(m.qsound.ay, reg, masked);
}

/** @param {Machine} m @param {number} addr @returns {boolean} */
function qsoundPiaContains(m, addr) {
    if (addr < qsoundPiaBase) {
        return false;
    }
    if (m.qsound.model === qsoundOriginal) {
        return addr < qsoundBase + qsoundBytes;
    }
    return addr < qsoundPiaBase + qsound2PiaBytes;
}

/** @param {Machine} m @param {number} addr @returns {number} */
function readQsound2Direct(m, addr) {
    if (m.qsound.model !== qsound2 || addr < qsound2DirectBase) {
        return 0;
    }
    if (((addr - qsound2DirectBase) & 2) === 0) {
        renderAudioTo(m, m.cpu.cycleCount);
        return fm.readStatus(m.qsound.fm);
    }
    const reg = m.qsound.selectedRegister;
    if (reg < 16) {
        return ay.readReg(m.qsound.ay, reg);
    }
    return 0;
}

/** @param {Machine} m @param {number} addr @param {number} value */
function writeQsound2Direct(m, addr, value) {
    if (m.qsound.model !== qsound2 || addr < qsound2DirectBase) {
        return;
    }
    if (((addr - qsound2DirectBase) & 2) === 0) {
        if (value >= 0x2D && value <= 0x2F) {
            renderAudioTo(m, m.cpu.cycleCount);
        }
        m.qsound.selectedRegister = value;
        fm.writeAddress(m.qsound.fm, value);
        if (value >= 0x2D && value <= 0x2F) {
            const tickT = cpuClockHz(m) / fm.getSsgTickRate(m.qsound.fm);
            ay.setTickPeriod(m.qsound.ay, tickT, m.cpu.cycleCount);
        }
        return;
    }
    renderAudioTo(m, m.cpu.cycleCount);
    const reg = m.qsound.selectedRegister;
    if (reg < 16) {
        ay.writeReg(m.qsound.ay, reg, value & qsoundRegisterMasks[reg]);
        return;
    }
    fm.writeReg(m.qsound.fm, reg, value);
}

/**
 * @param {Machine} m
 * @returns {boolean}
 */
function microdriveHasMedia(m) {
    return m.mdv.cartridges[0].inserted || m.mdv.cartridges[1].inserted;
}

/**
 * @param {Machine} m
 * @returns {number}
 */
function microdriveActiveUnit(m) {
    for (let i = 0; i < microdriveUnitCount; i += 1) {
        const mask = 1 << i;
        if ((m.mdv.selectedMask & mask) !== 0 && m.mdv.cartridges[i].inserted) {
            return i;
        }
    }
    return -1;
}

/** @param {Machine} m */
function microdriveResetHardware(m) {
    m.mdv.selectedMask = 0;
    m.mdv.control = microdriveSelectClockBit | microdriveReadWriteBit;
    microdriveOnMediumChange(m);
}

/**
 * Keep the select chain; only drop in-flight track bytes for the new medium.
 *
 * @param {Machine} m
 */
function microdriveOnMediumChange(m) {
    m.mdv.readingMask = 0;
    m.mdv.latchedByteOffset = 0;
    m.mdv.latchedTracks = 0;
    m.mdv.transmitFullUntil = 0;
    m.mdv.formattingUnit = -1;
    m.mdv.formatWriteOffset = 0;
    m.mdv.formatBurstBytes = 0;
    m.mdv.gapActive = false;
    m.mdv.dataReady = false;
    m.mdv.cycleAnchor = m.cpu.cycleCount;
}

/**
 * @param {MicrodriveCartridge} cartridge
 * @param {number} byteOffset
 * @returns {boolean}
 */
function microdriveOffsetIsGap(cartridge, byteOffset) {
    if (cartridge.imageLen === 0) {
        return false;
    }
    const sectorOffset = byteOffset % qlaySectorSize;
    if (sectorOffset < microdriveHeaderGapEndOffset) {
        return true;
    }
    if (sectorOffset >= qlayBlockPreambleOffset && sectorOffset < qlayBlockGapEndOffset) {
        return true;
    }
    if (cartridge.unformatted && !cartridge.formatVerified) {
        return sectorOffset >= qlayFormatGapOffset;
    }
    return sectorOffset >= qlayGapOffset;
}

/**
 * @param {MicrodriveCartridge} cartridge
 * @param {number} byteOffset
 * @returns {boolean}
 */
function microdriveOffsetIsPreamble(cartridge, byteOffset) {
    if (cartridge.imageLen === 0) {
        return false;
    }
    const sectorOffset = byteOffset % qlaySectorSize;
    if (sectorOffset >= microdriveHeaderGapEndOffset && sectorOffset < qlaySectorHeaderOffset) {
        return true;
    }
    if (sectorOffset >= qlayBlockGapEndOffset && sectorOffset < qlayBlockHeaderOffset) {
        return true;
    }
    if (cartridge.unformatted && !cartridge.formatVerified) {
        return false;
    }
    return sectorOffset >= qlayDataPreambleOffset && sectorOffset < qlayDataOffset;
}

/**
 * Change one cartridge byte and retain that change for a later download.
 *
 * @param {MicrodriveCartridge} cartridge
 * @param {number} offset
 * @param {number} value
 */
function microdriveWriteImageByte(cartridge, offset, value) {
    if (offset < 0 || offset >= cartridge.imageLen) {
        return;
    }
    cartridge.image[offset] = value;
    cartridge.modified = true;
}

/**
 * Apply the active erase line to both interleaved track bytes at the head.
 *
 * @param {MicrodriveCartridge} cartridge
 */
function microdriveEraseCurrentPair(cartridge) {
    if (cartridge.imageLen === 0) {
        return;
    }
    microdriveWriteImageByte(cartridge, cartridge.byteOffset, 0);
    let second = cartridge.byteOffset + 1;
    if (second >= cartridge.imageLen) {
        second = 0;
    }
    microdriveWriteImageByte(cartridge, second, 0);
}

/**
 * @param {Machine} m
 */
function microdriveRaiseGapInterrupt(m) {
    m.theInt |= microdriveGapInterruptBit;
    cpu.requestInterrupt(m.cpu, 2);
}

/** @param {Machine} m */
function microdriveAdvanceActive(m) {
    const unit = microdriveActiveUnit(m);
    if (unit < 0) {
        m.mdv.dataReady = false;
        if (m.mdv.selectedMask === 0) {
            m.mdv.cycleAnchor = m.cpu.cycleCount;
            m.mdv.gapActive = false;
            return;
        }
        // Treat sustained silence as a gap without interrupting a slow select chain.
        if (m.cpu.cycleCount - m.mdv.cycleAnchor < m.mdv.pairCycles * microdriveEmptyGapPairs) {
            return;
        }
        if (!m.mdv.gapActive) {
            m.mdv.gapActive = true;
            microdriveRaiseGapInterrupt(m);
        }
        return;
    }
    const cartridge = m.mdv.cartridges[unit];
    if (cartridge.imageLen === 0) {
        m.mdv.cycleAnchor = m.cpu.cycleCount;
        return;
    }
    if (m.cpu.cycleCount < m.mdv.cycleAnchor) {
        return;
    }
    if (
        m.mdv.formattingUnit === unit &&
        (m.mdv.control & microdriveEraseBit) !== 0 &&
        (m.mdv.control & microdriveReadWriteBit) === 0
    ) {
        m.mdv.cycleAnchor = m.cpu.cycleCount;
        return;
    }
    const elapsed = m.cpu.cycleCount - m.mdv.cycleAnchor;
    const pairCycles = m.mdv.pairCycles;
    let steps = Math.floor(elapsed / pairCycles);
    if (steps === 0) {
        return;
    }
    if (m.mdv.latchedTracks !== 0) {
        m.mdv.cycleAnchor = m.cpu.cycleCount;
        return;
    }
    const completed = steps;
    while (steps > 0) {
        const oldGap = microdriveOffsetIsGap(cartridge, cartridge.byteOffset);
        if ((m.mdv.control & microdriveEraseBit) !== 0) {
            microdriveEraseCurrentPair(cartridge);
            m.mdv.readingMask &= ~(1 << unit);
        }
        cartridge.byteOffset += 2;
        if (cartridge.byteOffset >= cartridge.imageLen) {
            cartridge.byteOffset -= cartridge.imageLen;
        }
        const newGap = microdriveOffsetIsGap(cartridge, cartridge.byteOffset);
        if (newGap && !oldGap && !m.mdv.gapActive) {
            microdriveRaiseGapInterrupt(m);
        }
        m.mdv.gapActive = newGap;
        m.mdv.dataReady = !newGap && !microdriveOffsetIsPreamble(cartridge, cartridge.byteOffset);
        steps -= 1;
    }
    m.mdv.cycleAnchor += completed * pairCycles;
}

/**
 * @param {Machine} m
 * @returns {number}
 */
function microdriveStatusBits(m) {
    microdriveAdvanceActive(m);
    let status = 0;
    if (m.cpu.cycleCount < m.mdv.transmitFullUntil) {
        status |= microdriveStatusTransmitFullBit;
    }
    const unit = microdriveActiveUnit(m);
    if (unit < 0) {
        return status | microdriveStatusGapBit;
    }
    const cartridge = m.mdv.cartridges[unit];
    if (microdriveOffsetIsGap(cartridge, cartridge.byteOffset)) {
        return status | microdriveStatusGapBit;
    }
    if (!m.mdv.dataReady) {
        return status;
    }
    return status | microdriveStatusReadReadyBit;
}

/**
 * @param {Machine} m
 * @param {number} data
 */
function microdriveControlWrite(m, data) {
    microdriveAdvanceActive(m);
    const oldControl = m.mdv.control;
    const unit = microdriveActiveUnit(m);
    const enteringWrite =
        (oldControl & microdriveEraseBit) !== 0 &&
        (oldControl & microdriveReadWriteBit) === 0 &&
        (data & microdriveReadWriteBit) !== 0;
    const leavingWrite =
        (oldControl & microdriveReadWriteBit) !== 0 &&
        (data & microdriveEraseBit) !== 0 &&
        (data & microdriveReadWriteBit) === 0;
    const verifyingFormat =
        unit >= 0 &&
        m.mdv.formattingUnit === unit &&
        (oldControl & microdriveEraseBit) !== 0 &&
        (data & (microdriveEraseBit | microdriveReadWriteBit)) === 0;
    const startingCatalog =
        unit >= 0 &&
        m.mdv.formattingUnit === unit &&
        m.mdv.cartridges[unit].formatVerifying &&
        (oldControl & (microdriveEraseBit | microdriveReadWriteBit)) === 0 &&
        (data & microdriveEraseBit) !== 0;
    if (unit >= 0 && enteringWrite && m.mdv.cartridges[unit].unformatted) {
        if (m.mdv.formattingUnit !== unit) {
            m.mdv.formattingUnit = unit;
            m.mdv.formatWriteOffset = 0;
        }
        if (!m.mdv.cartridges[unit].formatVerified) {
            m.mdv.cartridges[unit].byteOffset = m.mdv.formatWriteOffset;
        }
        m.mdv.formatBurstBytes = 0;
        m.mdv.transmitFullUntil = 0;
        m.mdv.cycleAnchor = m.cpu.cycleCount;
    }
    if (
        unit >= 0 &&
        leavingWrite &&
        m.mdv.formattingUnit === unit &&
        !m.mdv.cartridges[unit].formatVerified
    ) {
        if (m.mdv.formatBurstBytes !== 28) {
            m.mdv.formatWriteOffset += 34;
            if (m.mdv.formatWriteOffset >= m.mdv.cartridges[unit].imageLen) {
                m.mdv.formatWriteOffset -= m.mdv.cartridges[unit].imageLen;
            }
        }
        m.mdv.cartridges[unit].byteOffset = m.mdv.formatWriteOffset;
        m.mdv.cycleAnchor = m.cpu.cycleCount;
    }
    if (verifyingFormat) {
        m.mdv.cartridges[unit].formatVerifying = true;
        m.mdv.cycleAnchor = m.cpu.cycleCount;
    }
    if (startingCatalog) {
        m.mdv.cartridges[unit].formatVerifying = false;
        m.mdv.cartridges[unit].formatVerified = true;
        m.mdv.cycleAnchor = m.cpu.cycleCount;
    }
    const oldClock = (m.mdv.control & microdriveSelectClockBit) !== 0;
    const newClock = (data & microdriveSelectClockBit) !== 0;
    if (oldClock && !newClock) {
        let previousSelected = (data & microdriveSelectDataBit) !== 0;
        let nextMask = 0;
        for (let i = 0; i < microdriveUnitCount; i += 1) {
            const currentMask = 1 << i;
            const wasSelected = (m.mdv.selectedMask & currentMask) !== 0;
            if (previousSelected) {
                nextMask |= currentMask;
            }
            previousSelected = wasSelected;
        }
        if (nextMask !== m.mdv.selectedMask) {
            if (nextMask === 0 && m.mdv.formattingUnit >= 0) {
                const formatted = m.mdv.cartridges[m.mdv.formattingUnit];
                if (formatted.formatVerified) {
                    microdriveFinalizeFormat(formatted);
                }
                formatted.unformatted = false;
                formatted.formatVerifying = false;
                formatted.formatVerified = false;
                m.mdv.formattingUnit = -1;
                m.mdv.formatWriteOffset = 0;
                m.mdv.formatBurstBytes = 0;
            }
            m.mdv.selectedMask = nextMask;
            m.mdv.readingMask &= nextMask;
            m.mdv.latchedTracks = 0;
            m.mdv.transmitFullUntil = 0;
            m.mdv.dataReady = false;
            m.mdv.gapActive = false;
            m.mdv.cycleAnchor = m.cpu.cycleCount;
        }
    }
    if (((m.mdv.control ^ data) & microdriveReadWriteBit) !== 0) {
        m.mdv.latchedTracks = 0;
        m.mdv.transmitFullUntil = 0;
    }
    m.mdv.control = data;
}

/**
 * Make the physical QLAY records agree with the bad sectors selected by FORMAT.
 *
 * @param {MicrodriveCartridge} cartridge
 */
function microdriveFinalizeFormat(cartridge) {
    const sectorCount = Math.floor(cartridge.imageLen / qlaySectorSize);
    let mapOffset = -1;
    for (let physical = 0; physical < sectorCount; physical += 1) {
        const base = physical * qlaySectorSize;
        if (cartridge.image[base + qlaySectorHeaderOffset + 1] === 0) {
            mapOffset = base;
            break;
        }
    }
    if (mapOffset < 0) {
        return;
    }
    for (let physical = 0; physical < sectorCount; physical += 1) {
        const base = physical * qlaySectorSize;
        const logical = cartridge.image[base + qlaySectorHeaderOffset + 1];
        if (cartridge.image[mapOffset + qlayDataOffset + logical * 2] === qlayBadFileId) {
            microdriveWriteImageByte(cartridge, base + qlaySectorHeaderOffset, 0);
        }
    }
}

/**
 * @param {Machine} m
 * @param {number} addr
 * @param {number} value
 */
function microdriveWriteTrackByte(m, addr, value) {
    microdriveAdvanceActive(m);
    const unit = microdriveActiveUnit(m);
    if (
        addr !== microdriveTrack1Addr ||
        unit < 0 ||
        (m.mdv.control & microdriveReadWriteBit) === 0 ||
        m.cpu.cycleCount < m.mdv.transmitFullUntil
    ) {
        return;
    }
    const cartridge = m.mdv.cartridges[unit];
    if (cartridge.imageLen === 0) {
        return;
    }
    microdriveWriteImageByte(cartridge, cartridge.byteOffset, value);
    cartridge.byteOffset += 1;
    if (cartridge.byteOffset >= cartridge.imageLen) {
        cartridge.byteOffset = 0;
    }
    m.mdv.readingMask &= ~(1 << unit);
    cartridge.writeCount += 1;
    if (m.mdv.formattingUnit === unit && !cartridge.formatVerified) {
        m.mdv.formatWriteOffset = cartridge.byteOffset;
        m.mdv.formatBurstBytes += 1;
    }
    m.mdv.dataReady = false;
    m.mdv.transmitFullUntil = m.cpu.cycleCount + m.mdv.pairCycles / 2;
    m.mdv.cycleAnchor = m.mdv.transmitFullUntil;
}

/**
 * @param {Machine} m
 * @param {number} addr
 * @returns {number}
 */
function microdriveReadTrackByte(m, addr) {
    microdriveAdvanceActive(m);
    const track = addr - microdriveTrack1Addr;
    const unit = microdriveActiveUnit(m);
    if (unit < 0) {
        return 0;
    }
    const cartridge = m.mdv.cartridges[unit];
    if (cartridge.imageLen === 0 || !m.mdv.dataReady || microdriveOffsetIsGap(cartridge, cartridge.byteOffset)) {
        return 0;
    }
    const trackBit = 1 << track;
    if (m.mdv.latchedTracks === 0 || (m.mdv.latchedTracks & trackBit) !== 0) {
        m.mdv.latchedByteOffset = cartridge.byteOffset;
        m.mdv.latchedTracks = 0;
    }
    let offset = m.mdv.latchedByteOffset + track;
    if (offset >= cartridge.imageLen) {
        offset -= cartridge.imageLen;
    }
    const value = cartridge.image[offset];
    m.mdv.readingMask |= 1 << unit;
    cartridge.readCount += 1;
    m.mdv.latchedTracks |= trackBit;
    if (m.mdv.latchedTracks === 0x03) {
        m.mdv.latchedTracks = 0;
        m.mdv.dataReady = false;
        m.mdv.cycleAnchor = m.cpu.cycleCount;
    }
    return value;
}
