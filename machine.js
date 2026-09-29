import * as ay from "./ay.js";
import * as cpu from "./cpu.js";
import * as disk from "./disk.js";
import * as fm from "./fm.js";
import * as pe from "./pe.js";
import * as qimsi from "./qimsi.js";

export const sysRomSize = 0xC000;
export const romCartridgeSize = 0x4000;
export const qsoundRomSize = 0x2000;
export const qsoundOff = 0;
export const qsoundOriginal = 1;
export const qsound2 = 2;
export const mouseOff = 0;
export const mouseQimsi = 1;
export const mousePe = 2;
export const defaultRamKb = 128;

const romSlotCount = 3;
const frameW = 512;
const frameH = 256;
const ntscFrameH = 192;
const initialFieldCapacity = 2048;
const screenLineClocks = cpu.zx8301TimingChunkClocks * cpu.zx8301TimingChunksPerLine;
const screenChunkPixels = frameW / cpu.zx8301DisplayChunksPerLine;
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
const interruptEnableMask = 0xE0;
const interruptGapEnableBit = 0x20;
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
const qlaySectorHeaderFlag = 0xFF;
const qlayBlockPreambleOffset = 28;
const qlayBlockGapEndOffset = 34;
const qlayBlockHeaderOffset = 40;
const qlayDataPreambleOffset = 44;
const qlayDataOffset = 52;
const qlayGapOffset = 566;
const qlayFormatGapOffset = 652;
/**
 * Where the splice cuts the record written just before it during a FORMAT:
 * halfway through the block data, so the header stays but the block is bad.
 */
const microdriveSpliceCutOffset = qlayDataOffset + 256;
const microdriveEmptyGapPairs = (qlaySectorSize - qlayGapOffset) / 2;
/**
 * How many byte pairs the tape waits for the CPU to read the second track of
 * a pair it has started. A read abandoned mid-pair loses the byte, as on tape.
 */
const microdriveLatchHoldPairs = 4;
const qlayBadFileId = 0xFF;
const qlayFreeFileId = 0xFD;
const qlayMapFileId = 0xF8;
const qlayMapEntries = 255;
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
 * A QLAY cartridge in a drive. `unformatted` marks a New cartridge until a
 * FORMAT of it ends. `formatting` is set while a FORMAT writes or verifies it,
 * matching `mdv.formattingUnit`, and `formatVerifying` and `formatVerified`
 * follow that format's verify pass and catalog. The counts grow with each
 * track byte, so a rise shows activity.
 *
 * @typedef {{
 *   image: Uint8Array,
 *   byteOffset: number,
 *   inserted: boolean,
 *   name: string,
 *   unformatted: boolean,
 *   formatting: boolean,
 *   formatVerifying: boolean,
 *   formatVerified: boolean,
 *   modified: boolean,
 *   readCount: number,
 *   writeCount: number,
 * }} MicrodriveCartridge
 */

/**
 * `interruptMask` holds the ZX8302 interrupt enables, bits 7..5 of the last
 * write to its interrupt register. In `mdv`, `formattingUnit` is the drive a
 * FORMAT is laying out, or -1, and `formatWriteOffset` where its next record
 * goes. `burstStart` and `burstBytes` describe the write burst in progress,
 * and `silentPairs` counts the byte pairs the head has spent on erased tape.
 * `latchedAt` is when the CPU read the first track of the pair in
 * `latchedTracks`.
 *
 * @typedef {{
 *   mem: Uint8Array,
 *   cpu: import("./cpu.js").Cpu,
 *   cpuBus: import("./cpu.js").CpuBus,
 *   pixels: Uint8Array,
 *   frameVersion: number,
 *   frameNtsc: boolean,
 *   video: {
 *     pixels: Uint8Array,
 *     completed: Uint8Array,
 *     completedNtsc: boolean,
 *     ready: boolean,
 *     fieldStart: number,
 *     fieldEnd: number,
 *     ntsc: boolean,
 *     chunk: number,
 *     flashOn: boolean,
 *     flashBackground: number,
 *     fieldEnds: Float64Array,
 *     fieldClocks: Uint32Array,
 *     fieldHead: number,
 *     fieldTail: number,
 *   },
 *   keys: import("./keyboard.js").KeyState,
 *   theInt: number,
 *   interruptMask: number,
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
 *     grdY: number,
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
 *     addressValid: boolean,
 *     pinSelect: number,
 *     pinData: number,
 *     busyUntil: number,
 *     busActive: boolean,
 *     busAddress: number,
 *     busWrite: boolean,
 *     busData: number,
 *     pia: Uint8Array,
 *     dataDirectionA: number,
 *     dataDirectionB: number,
 *     ay: import("./ay.js").State,
 *     fm: import("./fm.js").State,
 *   },
 *   mouseModel: number,
 *   qimsi: import("./qimsi.js").State,
 *   pe: import("./pe.js").State,
 *   disks: import("./disk.js").Disks,
 *   mdv: {
 *     cartridges: MicrodriveCartridge[],
 *     selectedMask: number,
 *     readingMask: number,
 *     control: number,
 *     latchedByteOffset: number,
 *     latchedTracks: number,
 *     latchedAt: number,
 *     transmitFullUntil: number,
 *     formattingUnit: number,
 *     formatWriteOffset: number,
 *     burstStart: number,
 *     burstBytes: number,
 *     gapActive: boolean,
 *     silentPairs: number,
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
    const ramTop = cpu.qdosUserRamBase + defaultRamKb * 1024;
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
            guestRamTop: ramTop,
            qimsiBase: 0,
            qimsiEnd: 0,
            qsoundBase: 0,
            qsoundEnd: 0,
            isEClocked: function (addr) {
                return qsoundContains(m, addr);
            },
            beginHwAccess: function (addr, write, data) {
                beginQsoundAccess(m, addr, write, data);
            },
            endHwAccess: function () {
                endQsoundAccess(m);
            },
            readHwByte: function (addr) {
                if (m.qsound.busActive) {
                    return readHwByte(m, addr);
                }
                beginQsoundAccess(m, addr, false, 0);
                const value = readHwByte(m, addr);
                endQsoundAccess(m);
                return value;
            },
            readHwLongClock: readQdosClock,
            writeHwByte: function (addr, d) {
                if (m.qsound.busActive) {
                    writeHwByte(m, addr, d);
                    return;
                }
                beginQsoundAccess(m, addr, true, d);
                writeHwByte(m, addr, d);
                endQsoundAccess(m);
            },
            beforeMemoryWrite: function (addr, length) {
                let base = screenBase;
                if (m.displaySecondScreen) {
                    base = secondScreenBase;
                }
                if (addr < base + screenBytes && addr + length > base) {
                    renderVideoTo(m, m.cpu.cycleCount);
                }
            },
            executeHostOpcode: function (c, opcode) {
                disk.executeOpcode(m.disks, c, m.cpuBus, opcode);
            },
            afterInstruction: function () {
                if (m.mdv.selectedMask !== 0) {
                    microdriveAdvanceActive(m);
                }
            },
            resetHardware: function () {
                resetIpc(m);
                m.mdv.selectedMask = 0;
                m.mdv.control = microdriveSelectClockBit | microdriveReadWriteBit;
                microdriveCancelTransfer(m);
                stopBeep(m);
                // A ROM restarting itself, as Minerva does to switch screens,
                // runs its ROM scan again, so the disk drivers link again too.
                disk.prepareReset(m.disks, m.mem);
            },
        },
        pixels: new Uint8Array(frameW * frameH),
        frameVersion: 0,
        frameNtsc: false,
        video: {
            pixels: new Uint8Array(frameW * frameH),
            completed: new Uint8Array(frameW * frameH),
            completedNtsc: false,
            ready: false,
            fieldStart: 0,
            fieldEnd: 0,
            ntsc: false,
            chunk: 0,
            flashOn: false,
            flashBackground: 0,
            fieldEnds: new Float64Array(initialFieldCapacity),
            fieldClocks: new Uint32Array(initialFieldCapacity),
            fieldHead: 0,
            fieldTail: 0,
        },
        keys,
        theInt: 0,
        interruptMask: 0,
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
            beep: new Float32Array(audioCap),
            a: new Float32Array(audioCap),
            b: new Float32Array(audioCap),
            c: new Float32Array(audioCap),
            fm: new Float32Array(audioCap),
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
            grdY: 0,
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
            addressValid: false,
            pinSelect: 0,
            pinData: 0,
            busyUntil: 0,
            busActive: false,
            busAddress: 0,
            busWrite: false,
            busData: 0,
            pia: new Uint8Array(4),
            dataDirectionA: 0,
            dataDirectionB: 0,
            ay: ay.create(qsoundAyTickCycles),
            fm: fm.create(),
        },
        mouseModel: mouseOff,
        qimsi: qimsi.create(),
        pe: pe.create(),
        disks: disk.create(),
        mdv: {
            cartridges,
            selectedMask: 0,
            readingMask: 0,
            control: microdriveSelectClockBit | microdriveReadWriteBit,
            latchedByteOffset: 0,
            latchedTracks: 0,
            latchedAt: 0,
            transmitFullUntil: 0,
            formattingUnit: -1,
            formatWriteOffset: 0,
            burstStart: 0,
            burstBytes: 0,
            gapActive: false,
            silentPairs: 0,
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
    m.cpuBus.resetHardware();
    m.displayBlank = false;
    m.displayMode8 = false;
    m.displaySecondScreen = false;
    m.displayNtsc = false;
    m.flashFrame = 0;
    m.audio.n = 0;
    m.theInt = 0;
    m.interruptMask = 0;
    cpu.reset(m.cpu, m.cpuBus);
    qimsi.reset(m.qimsi, cpuClockHz(m));
    pe.reset(m.pe);
    resetQsound(m);
    resetAudioClock(m);
    resetVideo(m);
    decodeScreen(m);
}

/**
 * Replace the system ROM, patched for the disk drivers, and fill RAM with
 * power-on noise. The CPU keeps its state, so callers reset the machine to
 * boot the new ROM.
 *
 * @param {Machine} m
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {string | null}
 */
export function setSysRom(m, bytes) {
    const src = toBytes(bytes);
    const sizeErr = sizeError(src, sysRomSize);
    if (sizeErr !== null) {
        return sizeErr;
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
    m.cpuBus.guestRamTop = cpu.qdosUserRamBase + ramKb * 1024;
    fillRam(m);
    return true;
}

/**
 * Insert a read-only cartridge or I/O ROM, padded to its 16 KiB window.
 *
 * @param {Machine} m
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {number} slot Cartridge = 0, I/O ROM 1 = 1, I/O ROM 2 = 2.
 * @returns {string | null}
 */
export function insertRomCartridge(m, bytes, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= romSlotCount) {
        return "Invalid ROM slot.";
    }
    const src = toBytes(bytes);
    const sizeErr = sizeError(src, romCartridgeSize);
    if (sizeErr !== null) {
        return sizeErr;
    }
    const base = romCartridgeBase + slot * romCartridgeSize;
    m.mem.set(src, base);
    m.mem.fill(0, base + src.byteLength, base + romCartridgeSize);
    return null;
}

/**
 * Clear one ROM slot without changing the running CPU or other slots.
 *
 * @param {Machine} m
 * @param {number} slot Cartridge = 0, I/O ROM 1 = 1, I/O ROM 2 = 2.
 */
export function ejectRomCartridge(m, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= romSlotCount) {
        return;
    }
    const base = romCartridgeBase + slot * romCartridgeSize;
    m.mem.fill(0, base, base + romCartridgeSize);
}

/**
 * Install the QSound extension ROM shared by both card models.
 *
 * @param {Machine} m
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {string | null}
 */
export function setQsoundRom(m, bytes) {
    const src = toBytes(bytes);
    const sizeErr = sizeError(src, qsoundRomSize);
    if (sizeErr !== null) {
        return sizeErr;
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
    m.cpuBus.qsoundBase = 0;
    m.cpuBus.qsoundEnd = 0;
    if (model !== qsoundOff) {
        m.cpuBus.qsoundBase = qsoundBase;
        m.cpuBus.qsoundEnd = qsoundBase + qsoundBytes;
    }
    resetQsound(m);
    return true;
}

/**
 * Select no mouse, the QIMSI mouse registers at `0xFED0`-`0xFEDF`, or the host
 * pointer written into a loaded Pointer Environment. QIMSI covers those bytes
 * of the cartridge slot while it is selected.
 *
 * @param {Machine} m
 * @param {number} model
 * @returns {boolean}
 */
export function setMouseModel(m, model) {
    if (model !== mouseOff && model !== mouseQimsi && model !== mousePe) {
        return false;
    }
    m.mouseModel = model;
    m.cpuBus.qimsiBase = 0;
    m.cpuBus.qimsiEnd = 0;
    if (model === mouseQimsi) {
        m.cpuBus.qimsiBase = qimsi.registerBase;
        m.cpuBus.qimsiEnd = qimsi.registerEnd;
    }
    qimsi.reset(m.qimsi, cpuClockHz(m));
    return true;
}

/**
 * Select PAL or US machine clocks without changing the current display field.
 * Microdrive pair timing follows the CPU clock, and the sound card and QIMSI
 * mouse are reset so their clock dividers follow it too.
 *
 * @param {Machine} m
 * @param {boolean} ntsc
 */
export function setNtsc(m, ntsc) {
    renderVideoTo(m, m.cpu.cycleCount);
    m.ntscMachine = ntsc;
    m.mdv.pairCycles = Math.round(cpuClockHz(m) / microdriveBitRateHz * microdriveBitsPerPair);
    qimsi.reset(m.qimsi, cpuClockHz(m));
    resetQsound(m);
}

/**
 * Field rate of the current ZX8301 raster. US chips stay near 50 Hz in
 * the 312-line monitor field and near 60 Hz when bit 6 of `0x18063` selects
 * the 262-line TV field.
 *
 * @param {Machine} m
 * @returns {number}
 */
export function frameHz(m) {
    return cpuClockHz(m) / clocksPerFrame(m);
}

/**
 * Return the ZX8301 clocks in the currently selected display field.
 *
 * @param {Machine} m
 * @returns {number}
 */
export function clocksPerFrame(m) {
    const video = m.video;
    if (video.fieldHead < video.fieldTail) {
        return video.fieldClocks[video.fieldHead];
    }
    if (video.fieldEnd > video.fieldStart) {
        return video.fieldEnd - video.fieldStart;
    }
    if (m.ntscMachine && m.displayNtsc) {
        return cpu.zx8301NtscClocksPerFrame;
    }
    return cpu.zx8301PalClocksPerFrame;
}

/**
 * Execute one current PAL or NTSC display field and update host outputs.
 *
 * @param {Machine} m
 */
export function runFrame(m) {
    if (!m.romLoaded) {
        resetVideo(m);
        m.pixels.fill(0);
        m.frameVersion += 1;
        return;
    }
    if (m.mouseModel === mousePe) {
        pe.update(m.pe, m.cpuBus, cpu.qdosSysvarBase(m.cpu, m.mem));
    }
    renderVideoTo(m, m.cpu.cycleCount);
    const video = m.video;
    while (video.fieldHead < video.fieldTail && video.fieldEnds[video.fieldHead] <= m.cpu.cycleBudget) {
        video.fieldHead += 1;
    }
    if (video.fieldHead === video.fieldTail && video.fieldEnd === 0) {
        beginVideoField(m);
    }
    let fieldEnd = video.fieldEnd;
    if (video.fieldHead < video.fieldTail) {
        fieldEnd = video.fieldEnds[video.fieldHead];
    }
    // The cumulative CPU budget carries complete-instruction overshoot into
    // the next field, keeping guest time aligned with the display raster.
    cpu.executeCycleBudget(m.cpu, m.cpuBus, fieldEnd - m.cpu.cycleBudget);
    renderVideoTo(m, m.cpu.cycleCount);
    renderAudioTo(m, m.cpu.cycleCount);
    m.theInt |= cpu.frameInterruptStatusBit;
    cpu.frameInterrupt(m.cpu, m.cpuBus);
    renderVideoTo(m, m.cpu.cycleCount);
    video.fieldHead += 1;
    if (video.fieldHead * 2 >= video.fieldTail) {
        compactFieldQueue(video);
    }
    if (m.videoOn && video.ready) {
        const pixels = m.pixels;
        m.pixels = video.completed;
        video.completed = pixels;
        video.ready = false;
        m.frameNtsc = video.completedNtsc;
        m.frameVersion += 1;
    }
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
 * Change the host sample rate and restart the audio clock at the current
 * cycle.
 *
 * @param {Machine} m
 * @param {number} sampleRate
 */
export function setSoundRate(m, sampleRate) {
    m.sampleRate = sampleRate;
    resetAudioClock(m);
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
    const src = toBytes(bytes);
    if (src.byteLength === 0 || src.byteLength > microdriveMaxImageBytes || src.byteLength % qlaySectorSize !== 0) {
        return "Not a QLAY .mdv image (need a multiple of " + qlaySectorSize + " bytes).";
    }
    const cart = emptyCartridge();
    cart.image = new Uint8Array(src);
    cart.inserted = true;
    cart.name = name;
    m.mdv.cartridges[drive] = cart;
    microdriveCancelTransfer(m);
    return null;
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
    const bytes = cart.image.slice();
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
    microdriveCancelTransfer(m);
}

/**
 * Report whether a Microdrive read was in progress and clear that flag.
 *
 * The mask is set only while a selected cartridge is supplying track bytes,
 * and eject or deselect already clears it.
 *
 * @param {Machine} m
 * @returns {boolean}
 */
export function takeMdvReading(m) {
    const reading = m.mdv.readingMask !== 0;
    m.mdv.readingMask = 0;
    return reading;
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
 *   writing: boolean,
 *   modified: boolean,
 *   readCount: number,
 *   writeCount: number,
 * }}
 */
export function mdvInfo(m, drive) {
    const cart = m.mdv.cartridges[drive];
    const motorOn = (m.mdv.selectedMask & (1 << drive)) !== 0;
    const writing = cart.inserted && motorOn && (m.mdv.control & microdriveEraseBit) !== 0;
    return {
        inserted: cart.inserted,
        name: cart.name,
        motorOn,
        writing,
        modified: cart.modified,
        readCount: cart.readCount,
        writeCount: cart.writeCount,
    };
}

/**
 * Free and usable sectors as QDOS `DIR` reports them, read from the
 * cartridge's sector map: vacant entries are free, and every entry not marked
 * bad is usable. A blank cartridge not yet formatted by QDOS has no map.
 *
 * @param {Machine} m
 * @param {number} drive
 * @returns {{free: number, good: number} | null}
 */
export function mdvSpace(m, drive) {
    const cart = m.mdv.cartridges[drive];
    if (!cart.inserted || (cart.unformatted && !cart.formatVerified)) {
        return null;
    }
    const mapSector = microdriveMapSector(cart);
    if (mapSector < 0 || cart.image[mapSector + qlayDataOffset] !== qlayMapFileId) {
        return null;
    }
    let free = 0;
    let good = 0;
    for (let sector = 0; sector < qlayMapEntries; sector += 1) {
        const fileId = cart.image[mapSector + qlayDataOffset + sector * 2];
        if (fileId === qlayFreeFileId) {
            free += 1;
        }
        if (fileId !== qlayBadFileId) {
            good += 1;
        }
    }
    return {free, good};
}

/** @returns {MicrodriveCartridge} */
function emptyCartridge() {
    return {
        image: new Uint8Array(0),
        byteOffset: 0,
        inserted: false,
        name: "",
        unformatted: false,
        formatting: false,
        formatVerifying: false,
        formatVerified: false,
        modified: false,
        readCount: 0,
        writeCount: 0,
    };
}

/** @param {Machine} m */
function fillRam(m) {
    renderVideoTo(m, m.cpu.cycleCount);
    let seed = (Math.floor(Math.random() * 0xFFFFFFFF) ^ Date.now()) >>> 0;
    if (seed === 0) {
        seed = 1;
    }
    for (let offset = cpu.qdosUserRamBase; offset < m.cpuBus.guestRamTop; offset += 4) {
        seed = xorshift32(seed);
        cpu.writePointerLong(m.mem, offset, seed);
    }
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

/**
 * Write a ZX8302 or ZX8301 register or a QSound card; writes to the real-time
 * clock and other addresses are ignored.
 *
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
        renderVideoTo(m, m.cpu.cycleCount);
        m.displayBlank = (d & displayControlBlankBit) !== 0;
        m.displayNtsc = m.ntscMachine && (d & displayControlNtscBit) !== 0;
        m.displayMode8 = (d & displayControlMode8) !== 0;
        m.displaySecondScreen = (d & displayControlScreenBit) !== 0;
        break;
    case ipcReadAddr:
        microdriveControlWrite(m, d);
        break;
    case ipcWriteAddr:
        ipcWrite(m, d);
        break;
    case interruptStatusAddr:
        if (m.mdv.selectedMask !== 0) {
            microdriveAdvanceActive(m);
        }
        m.theInt = m.theInt & ~(d & interruptClearMask);
        m.interruptMask = d & interruptEnableMask;
        break;
    case microdriveTrack1Addr:
    case microdriveTrack2Addr:
        microdriveWriteTrackByte(m, addr, d);
        break;
    }
}

/**
 * One ZX8302 write to the IPC link. While a response is being sent, each
 * write clocks out its next bit for the following read. Otherwise the write
 * shifts in a command bit, and each complete nibble is a command, a keyboard
 * row argument, or the next sound parameter nibble.
 *
 * @param {Machine} m
 * @param {number} d
 */
function ipcWrite(m, d) {
    if (!m.ipcWait) {
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
            m.ipcSoundDecoded[m.ipcSoundNibblePos >> 1] = command << 4;
        } else {
            m.ipcSoundDecoded[m.ipcSoundNibblePos >> 1] |= command;
        }
        m.ipcSoundNibblePos += 1;
        m.ipcSoundNibblesLeft -= 1;
        if (m.ipcSoundNibblesLeft === 0) {
            startBeep(m, m.ipcSoundDecoded);
        }
        return;
    }
    if (m.ipcKeyboardRowPending) {
        m.ipcKeyboardRowPending = false;
        m.ipcResponse.fill(0);
        // The nibble names the row, and only rows 0-7 exist.
        if (command < 8) {
            m.ipcResponse[0] = m.keys.rows[command];
        }
        ipcBeginResponse(m, ipcWireKeyboardRowResponseBits);
        return;
    }
    switch (command) {
    case ipcWireStatusCommand:
        // Bit 0 reports waiting keys and bit 1 a playing beep.
        let status = 0;
        if (m.keys.queue.length > 0) {
            status |= 1;
        }
        if (m.beep.active) {
            status |= 2;
        }
        m.ipcResponse.fill(0);
        m.ipcResponse[0] = status;
        ipcBeginResponse(m, ipcWireStatusResponseBits);
        break;
    case ipcWireReadKeysCommand:
        ipcBeginResponse(m, ipcSerialReadKeys(m, m.ipcResponse));
        break;
    case ipcWireKeyboardRowCommand:
        m.ipcKeyboardRowPending = true;
        break;
    case ipcWireSoundCommand:
        m.ipcSoundNibblesLeft = ipcWireSoundNibbleCount;
        m.ipcSoundNibblePos = 0;
        break;
    case ipcWireKillSoundCommand:
        renderAudioTo(m, m.cpu.cycleCount);
        stopBeep(m);
        break;
    case ipcWireNoResponseCommand:
        break;
    default:
        m.ipcResponse.fill(0);
        ipcBeginResponse(m, ipcWireDefaultResponseBits);
        break;
    }
}

/**
 * Start sending `bits` from `ipcResponse`, which the caller has already filled.
 *
 * @param {Machine} m
 * @param {number} bits
 */
function ipcBeginResponse(m, bits) {
    m.ipcResponseBits = bits;
    m.ipcResponseSent = 0;
    m.ipcWait = false;
}

/**
 * Answer the IPC read-keys command: a 4-bit count, then 4 modifier and 8 code
 * bits for each of up to seven queued keys, which leave the queue. Returns the
 * response length in bits.
 *
 * @param {Machine} m
 * @param {Uint8Array} buffer
 * @returns {number}
 */
function ipcSerialReadKeys(m, buffer) {
    const count = Math.min(m.keys.queue.length, maxIpcQueuedKeys);
    buffer.fill(0);
    let bitPos = ipcAppendBits(buffer, 0, count, ipcWireReadKeysCountBits);
    for (let i = 0; i < count; i += 1) {
        const key = m.keys.queue[i];
        bitPos = ipcAppendBits(buffer, bitPos, key.modifiers, 4);
        bitPos = ipcAppendBits(buffer, bitPos, key.code, 8);
    }
    m.keys.queue.splice(0, count);
    return bitPos;
}

/**
 * Append the low `count` bits of `value` to `buffer` from `bitPos`, most
 * significant first, and return the next bit position.
 *
 * @param {Uint8Array} buffer
 * @param {number} bitPos
 * @param {number} value
 * @param {number} count
 * @returns {number}
 */
function ipcAppendBits(buffer, bitPos, value, count) {
    for (let i = 0; i < count; i += 1) {
        if (((value >> (count - 1 - i)) & 1) !== 0) {
            buffer[bitPos >> 3] |= 1 << (7 - (bitPos & 7));
        }
        bitPos += 1;
    }
    return bitPos;
}

/**
 * Read a ZX8302 register, a QSound card, or the QIMSI window. The real-time
 * clock reads host time, and other hardware addresses read 0.
 *
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
    case qdosClockBaseAddr + 3:
        const t = readQdosClock();
        const shift = (qdosClockBaseAddr + 3 - addr) * 8;
        return (t >>> shift) & 0xFF;
    case ipcReadAddr:
        let byte = ipcReadIdleValue;
        if (m.ipcRead !== 0) {
            byte = m.ipcRead & 0xFF;
            m.ipcRead >>>= 8;
            if (m.ipcRead === ipcReadDoneMarker) {
                m.ipcRead = 0;
            }
        }
        if (microdriveReportsStatus(m)) {
            byte |= microdriveStatusBits(m);
        }
        return byte;
    case interruptStatusAddr:
        if (m.mdv.selectedMask !== 0) {
            microdriveAdvanceActive(m);
        }
        return m.theInt & 0xFF;
    case microdriveTrack1Addr:
    case microdriveTrack2Addr:
        return microdriveReadTrackByte(m, addr);
    default:
        if (addr >= m.cpuBus.qimsiBase && addr < m.cpuBus.qimsiEnd) {
            return qimsi.read(m.qimsi, addr, m.cpu.cycleCount);
        }
        return 0;
    }
}

let cachedQdosSecond = -1;
let cachedQdosClock = 0;

/**
 * Host wall time as a QDOS second, reused until that unix second changes.
 *
 * @returns {number}
 */
function readQdosClock() {
    const unix = Math.floor(Date.now() / 1000);
    if (unix !== cachedQdosSecond) {
        const zone = -new Date().getTimezoneOffset() * 60;
        cachedQdosSecond = unix;
        cachedQdosClock = (unix + qdosUnixEpochDelta + zone) >>> 0;
    }
    return cachedQdosClock;
}

/** @param {Machine} m */
function resetVideo(m) {
    const video = m.video;
    video.fieldStart = 0;
    video.fieldEnd = 0;
    video.ntsc = false;
    video.chunk = 0;
    video.flashOn = false;
    video.flashBackground = 0;
    video.fieldHead = 0;
    video.fieldTail = 0;
    video.ready = false;
    video.completedNtsc = false;
    m.frameNtsc = false;
}

/**
 * Decode the display up to CPU cycle `time` as the beam would, so screen
 * writes during a field land where the hardware shows them. Each finished
 * field becomes `completed` and queues its end for frame pacing.
 *
 * @param {Machine} m
 * @param {number} time
 */
function renderVideoTo(m, time) {
    if (!m.romLoaded) {
        return;
    }
    const video = m.video;
    const chunksPerLine = cpu.zx8301DisplayChunksPerLine;
    while (time > video.fieldStart) {
        if (video.fieldEnd === 0) {
            beginVideoField(m);
        }
        let height = frameH;
        if (video.ntsc) {
            height = ntscFrameH;
        }
        const elapsed = Math.min(time, video.fieldEnd) - video.fieldStart;
        const line = Math.floor(elapsed / screenLineClocks);
        const column = Math.min(chunksPerLine, Math.ceil((elapsed % screenLineClocks) / cpu.zx8301TimingChunkClocks));
        const end = Math.min(height * chunksPerLine, line * chunksPerLine + column);
        while (video.chunk < end) {
            const take = Math.min(end - video.chunk, chunksPerLine - video.chunk % chunksPerLine);
            const start = video.chunk * screenChunkPixels;
            decodeScreenSpan(m, video.pixels, start, start + take * screenChunkPixels);
            video.chunk += take;
        }
        if (time < video.fieldEnd) {
            return;
        }
        for (let y = height; y < frameH; y += 1) {
            decodeScreenSpan(m, video.pixels, y * frameW, (y + 1) * frameW);
        }
        const completed = video.completed;
        video.completed = video.pixels;
        video.pixels = completed;
        video.completedNtsc = video.ntsc;
        video.ready = true;
        if (video.fieldTail === video.fieldEnds.length) {
            if (video.fieldHead > 0) {
                compactFieldQueue(video);
            } else {
                const capacity = video.fieldEnds.length * 2;
                const ends = new Float64Array(capacity);
                const clocks = new Uint32Array(capacity);
                ends.set(video.fieldEnds);
                clocks.set(video.fieldClocks);
                video.fieldEnds = ends;
                video.fieldClocks = clocks;
            }
        }
        video.fieldEnds[video.fieldTail] = video.fieldEnd;
        video.fieldClocks[video.fieldTail] = video.fieldEnd - video.fieldStart;
        video.fieldTail += 1;
        video.fieldStart = video.fieldEnd;
        video.fieldEnd = 0;
        video.chunk = 0;
        m.flashFrame = (m.flashFrame + 1) & 63;
    }
}

/**
 * Move the queued field ends that are still ahead down to the start.
 *
 * @param {Machine["video"]} video
 */
function compactFieldQueue(video) {
    video.fieldEnds.copyWithin(0, video.fieldHead, video.fieldTail);
    video.fieldClocks.copyWithin(0, video.fieldHead, video.fieldTail);
    video.fieldTail -= video.fieldHead;
    video.fieldHead = 0;
}

/** @param {Machine} m */
function beginVideoField(m) {
    const video = m.video;
    video.ntsc = m.ntscMachine && m.displayNtsc;
    let clocks = cpu.zx8301PalClocksPerFrame;
    if (video.ntsc) {
        clocks = cpu.zx8301NtscClocksPerFrame;
    }
    video.fieldEnd = video.fieldStart + clocks;
}

/** @param {Machine} m */
function decodeScreen(m) {
    for (let y = 0; y < frameH; y += 1) {
        decodeScreenSpan(m, m.pixels, y * frameW, (y + 1) * frameW);
    }
    m.frameVersion += 1;
}

/**
 * Decode screen memory for pixels `start` to `end` of the field in the current
 * mode, bank, blanking, and flash phase. A span that starts a line resets the
 * mode-8 flash state.
 *
 * @param {Machine} m
 * @param {Uint8Array} pixels
 * @param {number} start
 * @param {number} end
 */
function decodeScreenSpan(m, pixels, start, end) {
    if (start % frameW === 0) {
        m.video.flashOn = false;
        m.video.flashBackground = 0;
    }
    const flash = m.displayMode8 && (m.flashFrame & 32) !== 0;
    if (m.displayBlank && !flash) {
        pixels.fill(0, start, end);
        return;
    }
    let src = screenBase + start / 4;
    if (m.displaySecondScreen) {
        src += screenBytes;
    }
    if (flash) {
        decodeMode8Flash(m, src, pixels, start, end);
        return;
    }
    let lut = mode4Lut;
    if (m.displayMode8) {
        lut = mode8Lut;
    }
    const mem = m.mem;
    for (let di = start; di < end; di += 8) {
        const first = mem[src];
        const second = mem[src + 1];
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
        src += 2;
    }
}

/**
 * Decode mode-8 pixels in the flash phase that hides flashing text: from a
 * pixel with its flash bit set to the next one, the line shows the first
 * pixel's colour.
 *
 * @param {Machine} m
 * @param {number} src
 * @param {Uint8Array} pixels
 * @param {number} start
 * @param {number} end
 */
function decodeMode8Flash(m, src, pixels, start, end) {
    const mem = m.mem;
    const video = m.video;
    for (let di = start; di < end; di += 8) {
        const first = mem[src];
        const second = mem[src + 1];
        for (let shift = 6; shift >= 0; shift -= 2) {
            const p1 = (first >> shift) & 3;
            const p2 = (second >> shift) & 3;
            const flashBit = (p1 & 1) !== 0;
            let color = ((p1 & 2) << 1) | p2;
            if (video.flashOn) {
                color = video.flashBackground;
            }
            if (flashBit) {
                if (!video.flashOn) {
                    video.flashBackground = color;
                }
                video.flashOn = !video.flashOn;
            }
            if (m.displayBlank) {
                color = 0;
            }
            const at = di + 6 - shift;
            pixels[at] = color;
            pixels[at + 1] = color;
        }
        src += 2;
    }
}

/**
 * Start an IPC BEEP from its 8-byte parameter block: pitch 1 and pitch 2, the
 * 15-bit time between pitch steps (grad_x) and duration, then nibbles for the
 * signed pitch step (grad_y) and wrap count, and for random and fuzz.
 *
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
    const grdX = decoded[2] | ((decoded[3] & 0x7F) << 8);
    const length = decoded[4] | ((decoded[5] & 0x7F) << 8);
    beep.active = true;
    beep.pitch1 = decoded[0];
    beep.pitch = beep.pitch1;
    beep.pitch2 = decoded[1];
    beep.grdY = grdY;
    beep.randomAmount = (decoded[7] >> 4) & soundNibbleMax;
    beep.fuzzAmount = decoded[7] & soundNibbleMax;
    beep.random = 0;
    beep.fuzz = 0;
    beep.left = Math.floor(length * m.sampleRate / soundIpcTickHz);
    beep.pitchSpan = Math.floor(grdX * m.sampleRate / soundIpcTickHz);
    beep.wrapCount = decoded[6] & soundNibbleMax;
    beep.direction = 1;
    beep.cyclePoint = 0;
    beep.waveState = 0;
    if (beep.grdY < 0) {
        beep.pitch = beep.pitch2;
    }
    startPitchStep(beep);
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
function resetQsound(m) {
    const qsound = m.qsound;
    qsound.selectedRegister = 0;
    qsound.addressValid = false;
    qsound.pinSelect = 0;
    qsound.pinData = 0;
    qsound.busyUntil = 0;
    qsound.busActive = false;
    qsound.busAddress = 0;
    qsound.busWrite = false;
    qsound.busData = 0;
    qsound.pia.fill(0);
    qsound.dataDirectionA = 0;
    qsound.dataDirectionB = 0;
    // Original QSound follows a fixed E-clock divider; QSound2's PSG follows 125 kHz.
    let tickCycles = qsoundAyTickCycles;
    if (qsound.model === qsound2) {
        tickCycles = cpuClockHz(m) / qsound2SsgTickHz;
    }
    ay.configure(qsound.ay, tickCycles, qsound.model === qsound2, m.cpu.cycleCount);
    fm.reset(qsound.fm);
}

/**
 * Keep the CPU data strobe distinct from the later PIA register transfer.
 *
 * @param {Machine} m
 * @param {number} addr
 * @param {boolean} write
 * @param {number} data
 */
function beginQsoundAccess(m, addr, write, data) {
    const qsound = m.qsound;
    qsound.busActive = true;
    qsound.busAddress = addr;
    qsound.busWrite = write;
    qsound.busData = data & 0xFF;
    if (qsound.model === qsound2) {
        updateQsoundPins(m);
    }
}

/** @param {Machine} m */
function endQsoundAccess(m) {
    m.qsound.busActive = false;
    if (m.qsound.model === qsound2) {
        updateQsoundPins(m);
    }
}

/**
 * Read the QSound card: its ROM, the MC6821 PIA registers with port A on the
 * PSG bus, or QSound2's direct ports.
 *
 * @param {Machine} m
 * @param {number} addr
 * @returns {number}
 */
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
        return readQsoundPortA(m);
    case 1:
        return m.qsound.pia[1];
    case 2:
        if ((m.qsound.pia[3] & qsoundDataSelectBit) === 0) {
            return m.qsound.dataDirectionB;
        }
        return m.qsound.pia[2] & m.qsound.dataDirectionB;
    default:
        return m.qsound.pia[3];
    }
}

/**
 * Write the QSound card's MC6821 PIA registers, then drive the PSG bus from the
 * port pins.
 *
 * @param {Machine} m
 * @param {number} addr
 * @param {number} value
 */
function writeQsound(m, addr, value) {
    if (!qsoundPiaContains(m, addr)) {
        return;
    }
    value &= 0xFF;
    const reg = (addr - qsoundPiaBase) & 3;
    switch (reg) {
    case 0:
        if ((m.qsound.pia[1] & qsoundDataSelectBit) === 0) {
            m.qsound.dataDirectionA = value;
        } else {
            m.qsound.pia[0] = value;
        }
        break;
    case 1:
        m.qsound.pia[1] = value & 0x3F;
        break;
    case 2:
        if ((m.qsound.pia[3] & qsoundDataSelectBit) === 0) {
            m.qsound.dataDirectionB = value;
        } else {
            m.qsound.pia[2] = value;
        }
        break;
    default:
        m.qsound.pia[3] = value & 0x3F;
    }
    updateQsoundPins(m);
}

/**
 * Resolve PA's driven bits and input pull-ups, including the PSG's read bus.
 * Undriven PB controls are treated as inactive; electrical contention is not modeled.
 *
 * @param {Machine} m
 * @returns {number}
 */
function readQsoundPortA(m) {
    const qsound = m.qsound;
    let data = qsound.pia[0] | (~qsound.dataDirectionA & 0xFF);
    const select = qsound.pia[2] & qsound.dataDirectionB & qsoundSelectMask;
    const active = qsound.model === qsoundOriginal || (qsound.busActive && qsoundPiaContains(m, qsound.busAddress));
    if (active && select === 1 && qsound.addressValid) {
        let value = 0;
        if (qsound.selectedRegister < 16) {
            value = ay.readReg(qsound.ay, qsound.selectedRegister);
        }
        data &= value;
    }
    return data;
}

/**
 * Follow transparent AY latches and the QSound2 GAL's DS-qualified bus controls.
 * Only changed data or a newly asserted write strobe produces a register write.
 *
 * @param {Machine} m
 */
function updateQsoundPins(m) {
    const qsound = m.qsound;
    let select = qsound.pia[2] & qsound.dataDirectionB & qsoundSelectMask;
    let data = qsound.pia[0] | (~qsound.dataDirectionA & 0xFF);
    if (qsound.model === qsound2) {
        if (!qsound.busActive || !qsoundContains(m, qsound.busAddress)) {
            select = 0;
        } else if (!qsoundPiaContains(m, qsound.busAddress)) {
            select = 0;
            if (qsound.busAddress >= qsound2DirectBase && qsound.busWrite) {
                select = qsoundAddressSelect;
                if ((qsound.busAddress & 2) !== 0) {
                    select = qsoundDataWrite;
                }
                data = qsound.busData;
            }
        }
    }
    const changed = select !== qsound.pinSelect || data !== qsound.pinData;
    qsound.pinSelect = select;
    qsound.pinData = data;
    if (!changed) {
        return;
    }
    if (select === qsoundAddressSelect) {
        if (qsound.model === qsound2) {
            writeQsound2Direct(m, qsound2DirectBase, data);
        } else {
            qsound.addressValid = (data & 0xF0) === 0;
            if (qsound.addressValid) {
                qsound.selectedRegister = data;
            }
        }
        return;
    }
    if (select !== qsoundDataWrite || !qsound.addressValid) {
        return;
    }
    if (qsound.model === qsound2) {
        writeQsound2Direct(m, qsound2DirectBase + 2, data);
        return;
    }
    renderAudioTo(m, m.cpu.cycleCount);
    const reg = qsound.selectedRegister;
    ay.writeReg(qsound.ay, reg, data & qsoundRegisterMasks[reg]);
}

/**
 * @param {Machine} m
 * @param {number} addr
 * @returns {boolean}
 */
function qsoundContains(m, addr) {
    return m.qsound.model !== qsoundOff && addr >= qsoundBase && addr < qsoundBase + qsoundBytes;
}

/**
 * @param {Machine} m
 * @param {number} addr
 * @returns {boolean}
 */
function qsoundPiaContains(m, addr) {
    if (addr < qsoundPiaBase) {
        return false;
    }
    if (m.qsound.model === qsoundOriginal) {
        return addr < qsoundBase + qsoundBytes;
    }
    return addr < qsoundPiaBase + qsound2PiaBytes;
}

/**
 * Read QSound2's direct YM2203 ports: with address bit 1 clear the status and
 * BUSY, with it set the selected PSG register.
 *
 * @param {Machine} m
 * @param {number} addr
 * @returns {number}
 */
function readQsound2Direct(m, addr) {
    if (((addr - qsound2DirectBase) & 2) === 0) {
        renderAudioTo(m, m.cpu.cycleCount);
        let status = fm.readStatus(m.qsound.fm);
        if (m.cpu.cycleCount < m.qsound.busyUntil) {
            status |= 0x80;
        }
        return status;
    }
    const reg = m.qsound.selectedRegister;
    if (reg < 16) {
        return ay.readReg(m.qsound.ay, reg);
    }
    return 0;
}

/**
 * Write QSound2's direct YM2203 ports: with address bit 1 clear select a
 * register, with it set write the selected one and start BUSY.
 *
 * @param {Machine} m
 * @param {number} addr
 * @param {number} value
 */
function writeQsound2Direct(m, addr, value) {
    if (((addr - qsound2DirectBase) & 2) === 0) {
        // Writing a prescaler address changes the SSG clock at once.
        const prescaler = value >= 0x2D && value <= 0x2F;
        if (prescaler) {
            renderAudioTo(m, m.cpu.cycleCount);
        }
        m.qsound.selectedRegister = value;
        m.qsound.addressValid = true;
        fm.writeAddress(m.qsound.fm, value);
        if (prescaler) {
            const tickT = cpuClockHz(m) / fm.getSsgTickRate(m.qsound.fm);
            ay.setTickPeriod(m.qsound.ay, tickT, m.cpu.cycleCount);
        }
        return;
    }
    renderAudioTo(m, m.cpu.cycleCount);
    m.qsound.busyUntil = m.cpu.cycleCount + fm.getBusyCycles(m.qsound.fm, cpuClockHz(m));
    const reg = m.qsound.selectedRegister;
    if (reg < 16) {
        ay.writeReg(m.qsound.ay, reg, value & qsoundRegisterMasks[reg]);
        return;
    }
    fm.writeReg(m.qsound.fm, reg, value);
}

/**
 * Advance the beeper, PSG, and FM chips to CPU cycle `untilCycle`, collecting
 * a host sample at each sample boundary while sound is on and the chunk has
 * room.
 *
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
function nextSampleWindow(m) {
    m.sampleT = m.sampleEndT;
    m.sampleAcc += cpuClockHz(m);
    const step = Math.floor(m.sampleAcc / m.sampleRate);
    m.sampleAcc -= step * m.sampleRate;
    m.sampleEndT += step;
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
 * @param {Machine} m
 * @returns {number}
 */
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
        startPitchStep(beep);
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
        applyFuzz(m, beep);
        beep.cyclePoint = 0;
    }
    const sample = beep.waveState;
    beep.cyclePoint += 1;
    if (beep.cyclePoint >= beep.halfCycle) {
        beep.cyclePoint = Math.min(beep.cyclePoint - beep.halfCycle, 1);
        beep.waveState *= -1;
        applyFuzz(m, beep);
        return sample * (1 - 2 * beep.cyclePoint);
    }
    return sample;
}

/**
 * Count the samples to the next pitch step, ending no later than a timed
 * beep.
 *
 * @param {Machine["beep"]} beep
 */
function startPitchStep(beep) {
    beep.pitchLeft = beep.pitchSpan;
    if (beep.left !== 0 && (beep.pitchLeft === 0 || beep.pitchLeft > beep.left)) {
        beep.pitchLeft = beep.left;
    }
}

/**
 * Draw a new fuzz offset and retime the half cycle while fuzz is on.
 *
 * @param {Machine} m
 * @param {Machine["beep"]} beep
 */
function applyFuzz(m, beep) {
    if (beep.fuzzAmount <= soundSignedNibbleMax) {
        return;
    }
    beep.fuzz = activeRandomNibble(beep, beep.fuzzAmount);
    beep.halfCycle = beepHalfSampleCount(m, beep);
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

/**
 * @param {Machine} m
 * @param {Machine["beep"]} beep
 * @returns {number}
 */
function beepHalfSampleCount(m, beep) {
    const pitch = Math.max(beep.pitch + beep.random + beep.fuzz, 0);
    const units = pitch * soundPitchFractionScale + soundPitchBaseUnits;
    return Math.max(m.sampleRate * units / soundPitchDivisor, 1);
}

/**
 * Next pseudo-random value for the beeper's random or fuzz step, as wide as
 * the low three bits of `value` plus one.
 *
 * @param {Machine["beep"]} beep
 * @param {number} value
 * @returns {number}
 */
function activeRandomNibble(beep, value) {
    // Seeded with 1, and xorshift never returns to 0.
    const state = xorshift32(beep.randomState);
    beep.randomState = state;
    const bitCount = (value & soundSignedNibbleMax) + 1;
    return state & ((1 << bitCount) - 1);
}

/**
 * @param {number} seed
 * @returns {number}
 */
function xorshift32(seed) {
    let value = seed >>> 0;
    value ^= value << 13;
    value >>>= 0;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
}

/**
 * Mounted media keeps the idle GAP indication. A selected empty drive does too,
 * so its silence can still time out. Tape motion itself stays gated elsewhere.
 *
 * @param {Machine} m
 * @returns {boolean}
 */
function microdriveReportsStatus(m) {
    if (m.mdv.selectedMask !== 0) {
        return true;
    }
    for (let i = 0; i < microdriveUnitCount; i += 1) {
        if (m.mdv.cartridges[i].inserted) {
            return true;
        }
    }
    return false;
}

/**
 * Cancel the transfer in flight, a format included, and restart the tape
 * timing. The select chain is kept, so a cartridge change leaves its drive
 * selected. A cartridge whose format stops unfinished reads with the ordinary
 * layout and can be formatted again.
 *
 * @param {Machine} m
 */
function microdriveCancelTransfer(m) {
    m.mdv.readingMask = 0;
    m.mdv.latchedByteOffset = 0;
    m.mdv.latchedTracks = 0;
    m.mdv.transmitFullUntil = 0;
    if (m.mdv.formattingUnit >= 0) {
        const cartridge = m.mdv.cartridges[m.mdv.formattingUnit];
        cartridge.formatting = false;
        cartridge.formatVerifying = false;
        cartridge.formatVerified = false;
    }
    m.mdv.formattingUnit = -1;
    m.mdv.formatWriteOffset = 0;
    m.mdv.burstBytes = 0;
    m.mdv.gapActive = false;
    m.mdv.silentPairs = 0;
    m.mdv.dataReady = false;
    m.mdv.cycleAnchor = m.cpu.cycleCount;
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
 * Apply a ZX8302 Microdrive control write. It follows the erase and write
 * phases QDOS takes an unformatted cartridge through while formatting it, and
 * each falling select clock shifts the select bit along the drive chain.
 * Deselecting every drive ends a format and finalizes a verified one.
 *
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
    if (unit >= 0 && enteringWrite) {
        const cartridge = m.mdv.cartridges[unit];
        if (m.mdv.formattingUnit === unit && !cartridge.formatVerified) {
            // A running format writes its records back to back.
            cartridge.byteOffset = m.mdv.formatWriteOffset;
        } else {
            // Any other write replaces the block record after the header just
            // read. QLAY stores it without the gap the ROM waits out on a tape.
            let sectorStart = cartridge.byteOffset - cartridge.byteOffset % qlaySectorSize;
            if (cartridge.byteOffset - sectorStart < qlaySectorHeaderOffset) {
                sectorStart = (sectorStart + cartridge.image.length - qlaySectorSize) % cartridge.image.length;
            }
            cartridge.byteOffset = sectorStart + qlayBlockPreambleOffset;
        }
        m.mdv.burstStart = cartridge.byteOffset;
        m.mdv.burstBytes = 0;
        m.mdv.transmitFullUntil = 0;
        m.mdv.cycleAnchor = m.cpu.cycleCount;
    }
    if (
        unit >= 0 &&
        leavingWrite &&
        m.mdv.formattingUnit === unit &&
        !m.mdv.cartridges[unit].formatVerified
    ) {
        // A header record is followed at once by its block; a block by the gap,
        // and at the splice in the last slot the tape comes round to the start.
        if (m.mdv.burstBytes !== qlayBlockPreambleOffset) {
            m.mdv.formatWriteOffset += qlaySectorSize - qlayFormatGapOffset;
            if (m.mdv.formatWriteOffset >= m.mdv.cartridges[unit].image.length - qlaySectorSize) {
                m.mdv.formatWriteOffset = 0;
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
    const oldClock = (oldControl & microdriveSelectClockBit) !== 0;
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
                formatted.formatting = false;
                formatted.formatVerifying = false;
                formatted.formatVerified = false;
                m.mdv.formattingUnit = -1;
                m.mdv.formatWriteOffset = 0;
                m.mdv.burstBytes = 0;
            }
            m.mdv.selectedMask = nextMask;
            m.mdv.readingMask &= nextMask;
            m.mdv.latchedTracks = 0;
            m.mdv.transmitFullUntil = 0;
            m.mdv.dataReady = false;
            m.mdv.gapActive = false;
            m.mdv.silentPairs = 0;
            m.mdv.cycleAnchor = m.cpu.cycleCount;
        }
    }
    if (((oldControl ^ data) & microdriveReadWriteBit) !== 0) {
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
    const sectorCount = Math.floor(cartridge.image.length / qlaySectorSize);
    const mapOffset = microdriveMapSector(cartridge);
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
 * A CPU write to the Microdrive track register in write mode: the byte goes
 * onto the selected cartridge's tape, and the transmit buffer stays full for
 * half a byte pair.
 *
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
    const formatting = m.mdv.formattingUnit === unit && !cartridge.formatVerified;
    const sectorOffset = cartridge.byteOffset % qlaySectorSize;
    let stored = value;
    if (
        formatting &&
        cartridge.byteOffset - sectorOffset === cartridge.image.length - 2 * qlaySectorSize &&
        sectorOffset >= microdriveSpliceCutOffset
    ) {
        // The splice cuts the record laid out just before it.
        stored = 0;
    }
    microdriveWriteImageByte(cartridge, cartridge.byteOffset, stored);
    cartridge.byteOffset += 1;
    if (cartridge.byteOffset >= cartridge.image.length) {
        cartridge.byteOffset = 0;
    }
    m.mdv.readingMask &= ~(1 << unit);
    cartridge.writeCount += 1;
    m.mdv.burstBytes += 1;
    if (formatting) {
        m.mdv.formatWriteOffset = cartridge.byteOffset;
    } else if (m.mdv.burstBytes === qlaySectorHeaderOffset + 1 && value === qlaySectorHeaderFlag) {
        microdriveStartFormat(m, unit);
    }
    m.mdv.dataReady = false;
    m.mdv.transmitFullUntil = m.cpu.cycleCount + m.mdv.pairCycles / 2;
    m.mdv.cycleAnchor = m.mdv.transmitFullUntil;
}

/**
 * Start laying out a FORMAT, recognized by its first sector header record:
 * records go back to back from the start of the image, as QLAY stores them.
 * The part of the header already written moves there. The last slot stands
 * for the tape's splice: it is erased and skipped, so on a standard image
 * the last records overwrite the first, as on a real loop of tape, and the
 * record before it is cut.
 *
 * @param {Machine} m
 * @param {number} unit
 */
function microdriveStartFormat(m, unit) {
    if (m.mdv.formattingUnit >= 0 && m.mdv.formattingUnit !== unit) {
        const other = m.mdv.cartridges[m.mdv.formattingUnit];
        other.formatting = false;
        other.formatVerifying = false;
        other.formatVerified = false;
    }
    const cartridge = m.mdv.cartridges[unit];
    m.mdv.formattingUnit = unit;
    cartridge.formatting = true;
    cartridge.formatVerifying = false;
    cartridge.formatVerified = false;
    cartridge.image.copyWithin(0, m.mdv.burstStart, m.mdv.burstStart + m.mdv.burstBytes);
    const spliceStart = cartridge.image.length - qlaySectorSize;
    if (spliceStart > 0) {
        cartridge.image.fill(0, spliceStart);
    }
    cartridge.byteOffset = m.mdv.burstBytes;
    m.mdv.formatWriteOffset = m.mdv.burstBytes;
}

/**
 * A CPU read of a Microdrive track register: the byte under the head on that
 * track. Reading both tracks completes the pair, and the next waits for the
 * tape; after one track the tape holds briefly for the other.
 *
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
    if (!m.mdv.dataReady || microdriveOffsetIsGap(cartridge, cartridge.byteOffset)) {
        return 0;
    }
    const trackBit = 1 << track;
    if (m.mdv.latchedTracks === 0 || (m.mdv.latchedTracks & trackBit) !== 0) {
        m.mdv.latchedByteOffset = cartridge.byteOffset;
        m.mdv.latchedTracks = 0;
        m.mdv.latchedAt = m.cpu.cycleCount;
    }
    let offset = m.mdv.latchedByteOffset + track;
    if (offset >= cartridge.image.length) {
        offset -= cartridge.image.length;
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

/**
 * Move the selected cartridge's tape up to the current cycle, raising the gap
 * interrupt where a gap starts. With drives selected but none holding a
 * cartridge, or with the head on erased tape, a long enough silence also
 * counts as a gap. While the CPU has read one track of a pair, the tape waits
 * up to `microdriveLatchHoldPairs` pair periods for it to read the other.
 *
 * @param {Machine} m
 */
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
    const steps = Math.floor(elapsed / pairCycles);
    if (steps === 0) {
        return;
    }
    if (m.mdv.latchedTracks !== 0) {
        if (m.cpu.cycleCount - m.mdv.latchedAt < pairCycles * microdriveLatchHoldPairs) {
            m.mdv.cycleAnchor = m.cpu.cycleCount;
            return;
        }
        m.mdv.latchedTracks = 0;
    }
    for (let step = 0; step < steps; step += 1) {
        const oldGap = microdriveOffsetIsGap(cartridge, cartridge.byteOffset);
        if ((m.mdv.control & microdriveEraseBit) !== 0) {
            // The erase head clears both interleaved track bytes under it.
            microdriveWriteImageByte(cartridge, cartridge.byteOffset, 0);
            microdriveWriteImageByte(cartridge, (cartridge.byteOffset + 1) % cartridge.image.length, 0);
            m.mdv.readingMask &= ~(1 << unit);
        }
        cartridge.byteOffset += 2;
        if (cartridge.byteOffset >= cartridge.image.length) {
            cartridge.byteOffset -= cartridge.image.length;
        }
        const newGap = microdriveOffsetIsGap(cartridge, cartridge.byteOffset);
        const erased = microdriveTapeIsErased(cartridge, cartridge.byteOffset);
        if (erased) {
            m.mdv.silentPairs += 1;
        } else {
            m.mdv.silentPairs = 0;
        }
        if (!newGap) {
            m.mdv.gapActive = false;
        } else if (!m.mdv.gapActive) {
            // Like an empty drive, erased tape interrupts only after a stretch of
            // silence, so a select chain passing through does not see it.
            if (!oldGap || m.mdv.silentPairs >= microdriveEmptyGapPairs) {
                microdriveRaiseGapInterrupt(m);
                m.mdv.gapActive = true;
            } else if (!erased) {
                m.mdv.gapActive = true;
            }
        }
        m.mdv.dataReady = !newGap && !microdriveOffsetIsPreamble(cartridge, cartridge.byteOffset);
    }
    m.mdv.cycleAnchor += steps * pairCycles;
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

/**
 * Whether a tape offset lies in a gap: on erased tape, before a sector's
 * header, between header and block, or after the block, which ends later
 * while a format is writing or verifying the cartridge.
 *
 * @param {MicrodriveCartridge} cartridge
 * @param {number} byteOffset
 * @returns {boolean}
 */
function microdriveOffsetIsGap(cartridge, byteOffset) {
    if (microdriveTapeIsErased(cartridge, byteOffset)) {
        return true;
    }
    const sectorOffset = byteOffset % qlaySectorSize;
    if (sectorOffset < microdriveHeaderGapEndOffset) {
        return true;
    }
    if (sectorOffset >= qlayBlockPreambleOffset && sectorOffset < qlayBlockGapEndOffset) {
        return true;
    }
    if (cartridge.formatting && !cartridge.formatVerified) {
        return sectorOffset >= qlayFormatGapOffset;
    }
    return sectorOffset >= qlayGapOffset;
}

/**
 * Whether the sector under `byteOffset` has no header flag byte: never
 * written, as on a blank cartridge, or cleared by the erase head or as a bad
 * sector. Erased tape carries no signal, so it reads as one long gap.
 *
 * @param {MicrodriveCartridge} cartridge
 * @param {number} byteOffset
 * @returns {boolean}
 */
function microdriveTapeIsErased(cartridge, byteOffset) {
    return cartridge.image[byteOffset - byteOffset % qlaySectorSize + qlaySectorHeaderOffset] !== qlaySectorHeaderFlag;
}

/**
 * Whether a tape offset lies in a record preamble: written sync bytes, not a
 * gap, that hold back read-ready so a read starts on the first real byte. A
 * running format writes its blocks without the data preamble.
 *
 * @param {MicrodriveCartridge} cartridge
 * @param {number} byteOffset
 * @returns {boolean}
 */
function microdriveOffsetIsPreamble(cartridge, byteOffset) {
    const sectorOffset = byteOffset % qlaySectorSize;
    if (sectorOffset >= microdriveHeaderGapEndOffset && sectorOffset < qlaySectorHeaderOffset) {
        return true;
    }
    if (sectorOffset >= qlayBlockGapEndOffset && sectorOffset < qlayBlockHeaderOffset) {
        return true;
    }
    if (cartridge.formatting && !cartridge.formatVerified) {
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
    cartridge.image[offset] = value;
    cartridge.modified = true;
}

/**
 * Report a gap the head has reached, unless the gap interrupt is masked: a
 * gap that starts while it is masked goes unreported, as Minerva relies on
 * when it reads a file with interrupts briefly enabled.
 *
 * @param {Machine} m
 */
function microdriveRaiseGapInterrupt(m) {
    if ((m.interruptMask & interruptGapEnableBit) === 0) {
        return;
    }
    m.theInt |= microdriveGapInterruptBit;
    cpu.requestInterrupt(m.cpu, cpu.qlInterruptLevel);
}

/**
 * Image offset of the sector numbered 0, which holds the cartridge's sector
 * map, or -1 when there is none.
 *
 * @param {MicrodriveCartridge} cartridge
 * @returns {number}
 */
function microdriveMapSector(cartridge) {
    const sectorCount = Math.floor(cartridge.image.length / qlaySectorSize);
    for (let physical = 0; physical < sectorCount; physical += 1) {
        const base = physical * qlaySectorSize;
        if (cartridge.image[base + qlaySectorHeaderOffset + 1] === 0) {
            return base;
        }
    }
    return -1;
}

/**
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {Uint8Array}
 */
function toBytes(bytes) {
    if (bytes instanceof Uint8Array) {
        return bytes;
    }
    return new Uint8Array(bytes);
}

/**
 * Reject an empty image or one larger than `maxBytes`.
 *
 * @param {Uint8Array} src
 * @param {number} maxBytes
 * @returns {string | null}
 */
function sizeError(src, maxBytes) {
    if (src.byteLength === 0 || src.byteLength > maxBytes) {
        return "Expected 1 to " + maxBytes + ", got " + src.byteLength + " bytes.";
    }
    return null;
}
