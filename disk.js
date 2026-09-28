import * as cpu from "./cpu.js";

const sectorSize = 512;
const fileHeaderSize = 64;
const headersPerSector = sectorSize / fileHeaderSize;
const maxNameLength = 36;
const channelDataOffset = 0x1E;
const channelDataSize = 130;
const channelNameOffset = 20;
const channelPositionOffset = 2;
const channelEofOffset = 6;
const channelKeyOffset = 72;
const channelDriveOffset = 74;
const channelDirectoryOffset = 76;
const channelOpenOffset = 78;
const channelFileIdOffset = 82;
const qdosChannelMask = 0x00FFFFFE;
const qdosPollMaskAddr = 0x28030;
const qdosPdbTableAddr = 0x28100;
const qdosMdvDriverLinkAddr = 0x28140;
const qdosDriverCloseEntryAddr = 0xC2;
const qdosMdvCloseEntryAddr = 0xD4;
const qdosHeapAllocCall = 0x18;
const qdosLinkFileDriverCall = 0x22;
const guestCallShortLimit = 20000;
const guestCallMediumLimit = 200000;
const romInitOpcode = 0xAAA0;
const originalRomInitOpcode = 0x0C93;
const winTrampolineAddr = 0x1C000;
const winOpcodeBase = 0xAAA1;
const flpTrampolineAddr = 0x1C010;
const flpOpcodeBase = 0xAAA6;
const driverEntryCount = 5;
const driverLinkSize = 38;
const qdosFileLength = 0;
const qdosFileType = 5;
const qdosFileName = 14;
const qdosFileUpdate = 52;
const fileVersion = 0x38;
const fileIdOffset = 0x3A;
const fileBackupDate = 0x3C;
const directoryType = 0xFF;
const mediumNameSize = 10;
const flpUpdateCountOffset = 0x10;
const winNameLengthOffset = 0x04;
const winNameOffset = 0x06;
const winNameSize = 20;
const winUpdateCheckOffset = 0x1C;
// SuperBASIC DIR prints the medium sector counts as signed words.
const qdosMaxSectorCount = 0x7FFF;
const winSectorsPerClusterOffset = 0x22;
const winClusterCountOffset = 0x2A;
const winFreeClusterCountOffset = 0x2C;
const winMapSectorCountOffset = 0x2E;
const winMapCountOffset = 0x30;
const winFirstFreeClusterOffset = 0x32;
const winRootClusterOffset = 0x34;
const winRootLengthOffset = 0x36;
const winFatOffset = 0x40;
const winMinSectorsPerCluster = 4;
const winSectorsPerClusterStep = 0x10000;
/** Sectors of the largest new hard disk whose counts QDOS reports exactly. */
export const maxReportedSectors = qdosMaxSectorCount - qdosMaxSectorCount % winMinSectorsPerCluster;
const flpHeaderIdOffset = 2;
const flpMediumNameOffset = 4;
const flpRandomOffset = 0x0E;
const flpFreeSectorsOffset = 20;
const flpGoodSectorsOffset = 0x16;
const flpTotalSectorsOffset = 24;
const flpSectorsPerTrackOffset = 26;
const flpSectorsPerClusterOffset = 28;
const flpCylindersOffset = 0x1E;
const flpSectorsPerBlockOffset = 32;
const flpRootDirSectorsOffset = 34;
const flpRootDirBytesOffset = 36;
const flpInterleaveOffset = 38;
const flpTrackMapOffset = 40;
const flpTrackMapSize = 36;
const flpSpareOffset = 0x4C;
const flpFileMapOffset = 96;
const flpFileMapSlotSize = 3;
const flpFileMapFree = 0xFD;
const flpFileMapFreeSlot = 0xFDFFFF;
const flpFileMapBlockBits = 12;
const flpFileMapBlockMask = (1 << flpFileMapBlockBits) - 1;
const flpFileMapFirstSpecialId = 0xF80;
const flpSubdirectoryIdBit = 0x800;
const flpMapFileSlot = 0xF80000;
const flpBlankCylinders = 80;
const flpBlankSides = 2;
const flpBlankSectorsPerGroup = 3;
const qerrBf = -5;
const qerrNo = -6;
const qerrNf = -7;
const qerrEx = -8;
const qerrIu = -9;
const qerrEof = -10;
const qerrDf = -11;
const qerrBp = -15;
const qerrBm = -16;
const qerrOv = -18;
const qerrNi = -19;
const qerrRo = -20;
const openDelete = -1;
const openOld = 0;
const openShare = 1;
const openNew = 2;
const openOverwrite = 3;
const openDirectory = 4;
const defaultDdTrackMap = Uint8Array.of(
    0, 3, 6, 0x80, 0x83, 0x86, 1, 4,
    7, 0x81, 0x84, 0x87, 2, 5, 8, 0x82,
    0x85, 0x88, 0, 6, 12, 1, 7, 13,
    2, 8, 14, 3, 9, 15, 4, 10,
    16, 5, 11, 17,
);
const defaultHdTrackMap = Uint8Array.of(
    0, 2, 4, 6, 8, 10, 12, 14, 16, 0x80, 0x82, 0x84,
    0x86, 0x88, 0x8A, 0x8C, 0x8E, 0x90, 1, 3, 5, 7, 9, 11,
    13, 15, 17, 0x81, 0x83, 0x85, 0x87, 0x89, 0x8B, 0x8D, 0x8F, 0x91,
);

let opcodeHooksReady = false;

/**
 * @typedef {import("./cpu.js").Cpu} Cpu
 * @typedef {import("./cpu.js").CpuBus} CpuBus
 */

/**
 * `file` is the QLWA first cluster or the QL5A/QL5B file-map id; `entry` is
 * the header index inside `parent`, or -1 for the root directory itself.
 *
 * @typedef {{parent: number, file: number, entry: number}} FileId
 * @typedef {{
 *   generation: number,
 *   file: FileId,
 *   key: number,
 *   isDirectory: boolean,
 *   position: number,
 *   eof: number,
 * }} Channel
 */

/**
 * One mounted drive. `floppy` selects the QL5A/QL5B file map over the QLWA
 * cluster chain. Both layouts accept guest writes; unused geometry stays zero.
 *
 * @typedef {{
 *   floppy: boolean,
 *   driver: string,
 *   trampolineAddr: number,
 *   opcodeBase: number,
 *   image: Uint8Array,
 *   name: string,
 *   inserted: boolean,
 *   modified: boolean,
 *   generation: number,
 *   driverReady: boolean,
 *   channels: Map<number, Channel>,
 *   totalSectors: number,
 *   sectorsPerCluster: number,
 *   rootFile: number,
 *   clusterCount: number,
 *   mapSectors: number,
 *   doubleDensity: boolean,
 *   sectorsPerTrack: number,
 *   sectorsPerBlock: number,
 *   interleave: number,
 *   fatSectors: number,
 *   rootLength: number,
 *   fileMap: Map<number, number>,
 * }} State
 */

/**
 * The QDOS ROM initialization hook shared by the WIN1_ and FLP1_ host drivers.
 *
 * @typedef {{romInitAddr: number, win: State, flp: State}} Disks
 */

/**
 * Create both empty drives and initialize their shared host pseudo-ops.
 *
 * @returns {Disks}
 */
export function create() {
    ensureOpcodeHooks();
    return {
        romInitAddr: -1,
        win: createDrive(false, "WIN", winTrampolineAddr, winOpcodeBase),
        flp: createDrive(true, "FLP", flpTrampolineAddr, flpOpcodeBase),
    };
}

/**
 * Dispatch a host pseudo-op using the disk state owned by the executing machine.
 *
 * @param {Disks} disks
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @param {number} opcode
 */
export function executeOpcode(disks, c, bus, opcode) {
    if (opcode === romInitOpcode) {
        romInit(disks, c, bus);
        return;
    }
    let state = disks.win;
    if (opcode >= flpOpcodeBase) {
        state = disks.flp;
    }
    switch (opcode - state.opcodeBase) {
    case 0:
        driverIo(state, c, bus);
        return;
    case 1:
        c.reg[0] = openChannel(state, c, bus);
        break;
    case 2:
        driverClose(state, c, bus);
        return;
    case 3:
        break;
    case 4:
        c.reg[0] = qerrNi;
        break;
    default:
        return;
    }
    returnFromDriver(c, bus);
}

/**
 * Find and patch the QDOS ROM initialization hook without rejecting unknown ROMs.
 *
 * @param {Disks} disks
 * @param {Uint8Array} mem
 */
export function patchRom(disks, mem) {
    disks.romInitAddr = -1;
    for (let addr = 0x4A00; addr + 6 <= 0xC000; addr += 2) {
        if (cpu.readPointerWord(mem, addr) === originalRomInitOpcode && cpu.readPointerWord(mem, addr + 2) === 0x4AFB) {
            disks.romInitAddr = addr;
            break;
        }
    }
    if (disks.romInitAddr < 0) {
        for (let addr = 0; addr + 6 <= 0xC000; addr += 2) {
            if (
                cpu.readPointerWord(mem, addr) === originalRomInitOpcode &&
                cpu.readPointerWord(mem, addr + 2) === 0x4AFB &&
                cpu.readPointerWord(mem, addr + 4) === 1
            ) {
                disks.romInitAddr = addr;
                break;
            }
        }
    }
    prepareReset(disks, mem);
}

/**
 * Drop open channels and re-apply the host-driver trampolines for the next boot.
 *
 * @param {Disks} disks
 * @param {Uint8Array} mem
 */
export function prepareReset(disks, mem) {
    if (disks.romInitAddr >= 0) {
        cpu.writePointerWord(mem, disks.romInitAddr, romInitOpcode);
    }
    for (const state of [disks.win, disks.flp]) {
        state.channels.clear();
        state.driverReady = false;
        for (let i = 0; i < driverEntryCount; i += 1) {
            cpu.writePointerWord(mem, state.trampolineAddr + i * 2, state.opcodeBase + i);
        }
    }
}

/**
 * Mount an empty, formatted QL5A (720 KiB DD) or QL5B (1440 KiB HD) floppy,
 * laid out as SMSQ/E's formatter does: the map in the first groups, the root
 * directory in the next group, and every other group free.
 *
 * @param {State} state
 * @param {boolean} highDensity
 * @param {string} name
 * @returns {string | null}
 */
export function insertBlankFloppy(state, highDensity, name) {
    let sectorsPerTrack = 9;
    let formatId = 0x3541;
    let skew = 5;
    let mapGroups = 1;
    let trackMap = defaultDdTrackMap;
    if (highDensity) {
        sectorsPerTrack = 18;
        formatId = 0x3542;
        skew = 2;
        mapGroups = 2;
        trackMap = defaultHdTrackMap;
    }
    const sectorsPerCylinder = sectorsPerTrack * flpBlankSides;
    const totalSectors = sectorsPerCylinder * flpBlankCylinders;
    const groups = totalSectors / flpBlankSectorsPerGroup;
    const image = new Uint8Array(totalSectors * sectorSize);
    image.set([0x51, 0x4C]);
    cpu.writePointerWord(image, flpHeaderIdOffset, formatId);
    image.fill(0x20, flpMediumNameOffset, flpMediumNameOffset + mediumNameSize);
    cpu.writePointerWord(image, flpRandomOffset, Math.floor(Math.random() * 0x10000));
    cpu.writePointerWord(image, flpFreeSectorsOffset, totalSectors - (mapGroups + 1) * flpBlankSectorsPerGroup);
    cpu.writePointerWord(image, flpGoodSectorsOffset, totalSectors);
    cpu.writePointerWord(image, flpTotalSectorsOffset, totalSectors);
    cpu.writePointerWord(image, flpSectorsPerTrackOffset, sectorsPerTrack);
    cpu.writePointerWord(image, flpSectorsPerClusterOffset, sectorsPerCylinder);
    cpu.writePointerWord(image, flpCylindersOffset, flpBlankCylinders);
    cpu.writePointerWord(image, flpSectorsPerBlockOffset, flpBlankSectorsPerGroup);
    cpu.writePointerWord(image, flpRootDirBytesOffset, fileHeaderSize);
    cpu.writePointerWord(image, flpInterleaveOffset, skew);
    image.set(trackMap, flpTrackMapOffset);
    image.fill(0xFF, flpSpareOffset, flpFileMapOffset);
    const error = insert(state, image, name);
    if (error !== null) {
        return error;
    }
    // The map sectors are scattered by the track map, so write them logically.
    const mapEnd = mapGroups * flpBlankSectorsPerGroup * sectorSize;
    for (let offset = flpFileMapOffset; offset < mapEnd; offset += 1) {
        state.image[mapByteOffset(state, offset)] = 0xFF;
    }
    for (let slot = 0; slot < groups; slot += 1) {
        let value = flpFileMapFreeSlot;
        if (slot < mapGroups) {
            value = flpMapFileSlot | slot;
        } else if (slot === mapGroups) {
            value = 0;
        }
        writeMapSlot(state, slot, value);
    }
    readGeometry(state);
    state.modified = false;
    return null;
}

/**
 * Mount an empty, formatted QLWA hard disk of `totalSectors` 512-byte sectors,
 * laid out as SMSQ/E's formatter does: the map in the first groups, the root
 * directory in the next group, and every other group on one free chain. A
 * container has no physical geometry, so interleave, track and cylinder fields
 * stay zero.
 *
 * @param {State} state
 * @param {number} totalSectors
 * @param {string} name
 * @returns {string | null}
 */
export function insertBlankHardDisk(state, totalSectors, name) {
    const sectorsPerCluster = Math.max(Math.floor(totalSectors / winSectorsPerClusterStep) + 1, winMinSectorsPerCluster);
    const clusters = Math.floor(totalSectors / sectorsPerCluster);
    const mapSectors = Math.floor((winFatOffset - 1 + clusters * 2) / sectorSize) + 1;
    const mapClusters = Math.floor((mapSectors - 1) / sectorsPerCluster) + 1;
    const root = mapClusters;
    const firstFree = root + 1;
    const image = new Uint8Array(totalSectors * sectorSize);
    image.set([0x51, 0x4C, 0x57, 0x41]);
    cpu.writePointerWord(image, winNameLengthOffset, 0);
    image.fill(0x20, winNameOffset, winNameOffset + winNameSize);
    cpu.writePointerWord(image, winUpdateCheckOffset, Math.floor(Math.random() * 0x10000));
    cpu.writePointerWord(image, winSectorsPerClusterOffset, sectorsPerCluster);
    cpu.writePointerWord(image, winClusterCountOffset, clusters);
    cpu.writePointerWord(image, winFreeClusterCountOffset, clusters - firstFree);
    cpu.writePointerWord(image, winMapSectorCountOffset, mapSectors);
    cpu.writePointerWord(image, winMapCountOffset, 1);
    cpu.writePointerWord(image, winFirstFreeClusterOffset, firstFree);
    cpu.writePointerWord(image, winRootClusterOffset, root);
    cpu.writePointerLong(image, winRootLengthOffset, fileHeaderSize);
    for (let cluster = 0; cluster + 1 < mapClusters; cluster += 1) {
        cpu.writePointerWord(image, winFatOffset + cluster * 2, cluster + 1);
    }
    for (let cluster = firstFree; cluster + 1 < clusters; cluster += 1) {
        cpu.writePointerWord(image, winFatOffset + cluster * 2, cluster + 1);
    }
    return insert(state, image, name);
}

/**
 * Validate and insert an image of the drive's format.
 *
 * @param {State} state
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {string} name
 * @returns {string | null}
 */
export function insert(state, bytes, name) {
    let source = bytes;
    if (!(source instanceof Uint8Array)) {
        source = new Uint8Array(source);
    }
    let error = validateWinImage(source);
    if (state.floppy) {
        error = validateFlpImage(source);
    }
    if (error !== null) {
        return error;
    }
    state.image = new Uint8Array(source);
    state.name = name;
    state.inserted = true;
    state.modified = false;
    state.generation += 1;
    state.channels.clear();
    readGeometry(state);
    return null;
}

/**
 * Copy the mounted image for download and clear the modified flag.
 *
 * @param {State} state
 * @returns {{name: string, bytes: Uint8Array} | null}
 */
export function save(state) {
    if (!state.inserted) {
        return null;
    }
    state.modified = false;
    return {name: state.name, bytes: state.image.slice()};
}

/**
 * Unmount the image and invalidate open channels.
 *
 * @param {State} state
 */
export function eject(state) {
    state.image = new Uint8Array(0);
    state.name = "";
    state.inserted = false;
    state.modified = false;
    state.generation += 1;
    state.channels.clear();
    state.totalSectors = 0;
    state.sectorsPerCluster = 0;
    state.rootFile = 0;
    state.clusterCount = 0;
    state.mapSectors = 0;
    state.doubleDensity = false;
    state.sectorsPerTrack = 0;
    state.sectorsPerBlock = 0;
    state.interleave = 0;
    state.fatSectors = 0;
    state.rootLength = 0;
    state.fileMap.clear();
}

/**
 * User-visible mount name, dirty flag, and whether QDOS accepted the driver.
 *
 * @param {State} state
 * @returns {{inserted: boolean, name: string, modified: boolean, driverReady: boolean}}
 */
export function info(state) {
    return {
        inserted: state.inserted,
        name: state.name,
        modified: state.modified,
        driverReady: state.driverReady,
    };
}

/**
 * @param {boolean} floppy
 * @param {string} driver
 * @param {number} trampolineAddr
 * @param {number} opcodeBase
 * @returns {State}
 */
function createDrive(floppy, driver, trampolineAddr, opcodeBase) {
    /** @type {State} */
    const state = {
        floppy,
        driver,
        trampolineAddr,
        opcodeBase,
        image: new Uint8Array(0),
        name: "",
        inserted: false,
        modified: false,
        generation: 1,
        driverReady: false,
        channels: new Map(),
        totalSectors: 0,
        sectorsPerCluster: 0,
        rootFile: 0,
        clusterCount: 0,
        mapSectors: 0,
        doubleDensity: false,
        sectorsPerTrack: 0,
        sectorsPerBlock: 0,
        interleave: 0,
        fatSectors: 0,
        rootLength: 0,
        fileMap: new Map(),
    };
    return state;
}

function ensureOpcodeHooks() {
    if (opcodeHooksReady) {
        return;
    }
    cpu.setOpcode(romInitOpcode, executeHostOpcode);
    for (const opcodeBase of [winOpcodeBase, flpOpcodeBase]) {
        for (let entry = 0; entry < driverEntryCount; entry += 1) {
            cpu.setOpcode(opcodeBase + entry, executeHostOpcode);
        }
    }
    opcodeHooksReady = true;
}

/** @param {Cpu} c @param {CpuBus} bus */
function executeHostOpcode(c, bus) {
    bus.executeHostOpcode(c, c.code);
}

/**
 * Link both host drivers, then finish the ROM instruction that was patched.
 *
 * @param {Disks} disks
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function romInit(disks, c, bus) {
    if (disks.romInitAddr < 0) {
        return;
    }
    cpu.writePointerWord(bus.mem, disks.romInitAddr, originalRomInitOpcode);
    const saved = new Int32Array(c.reg);
    const savedPollMask = cpu.readPointerWord(bus.mem, qdosPollMaskAddr);
    bus.beforeMemoryWrite(qdosPollMaskAddr, 2);
    cpu.writePointerWord(bus.mem, qdosPollMaskAddr, 0);
    linkDriver(disks.win, c, bus);
    linkDriver(disks.flp, c, bus);
    bus.beforeMemoryWrite(qdosPollMaskAddr, 2);
    cpu.writePointerWord(bus.mem, qdosPollMaskAddr, savedPollMask);
    c.reg.set(saved);
    cpu.executeOpcode(c, bus, originalRomInitOpcode);
}

/**
 * Allocate a QDOS directory-driver link block pointing at the drive's
 * trampolines and hand it to the ROM.
 *
 * @param {State} state
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
function linkDriver(state, c, bus) {
    c.reg[1] = 4 + driverLinkSize;
    c.reg[2] = 0;
    cpu.callTrap(c, bus, 1, qdosHeapAllocCall, guestCallMediumLimit);
    if (c.exception !== 0 || c.reg[0] !== 0) {
        return;
    }
    const base = c.reg[8] & qdosChannelMask;
    if (base < cpu.qdosUserRamBase || base + 4 + driverLinkSize > bus.mem.length) {
        return;
    }
    const link = base + 4;
    const t = state.trampolineAddr;
    bus.beforeMemoryWrite(link, driverLinkSize);
    bus.mem.fill(0, link, link + driverLinkSize);
    cpu.writePointerLong(bus.mem, link, t);
    cpu.writePointerLong(bus.mem, link + 4, t + 2);
    cpu.writePointerLong(bus.mem, link + 8, t + 4);
    cpu.writePointerLong(bus.mem, link + 12, t + 6);
    cpu.writePointerLong(bus.mem, link + 24, t + 8);
    cpu.writePointerLong(bus.mem, link + 28, 36);
    cpu.writePointerWord(bus.mem, link + 32, state.driver.length);
    for (let i = 0; i < state.driver.length; i += 1) {
        bus.mem[link + 34 + i] = state.driver.charCodeAt(i);
    }
    cpu.callTrap(c, bus, 1, qdosLinkFileDriverCall, guestCallShortLimit);
    state.driverReady = c.exception === 0 && c.reg[0] === 0;
}

/**
 * Open, create, or delete a file for the channel block in A0 and return the
 * QDOS status for D0.
 *
 * @param {State} state
 * @param {Cpu} c
 * @param {CpuBus} bus
 * @returns {number}
 */
function openChannel(state, c, bus) {
    if (!state.inserted) {
        return qerrNf;
    }
    const channelBase = c.reg[8] & qdosChannelMask;
    const data = channelBase + channelDataOffset;
    if (data < cpu.qdosUserRamBase || data + channelDataSize > bus.mem.length) {
        return qerrOv;
    }
    const pdb = c.reg[9] & qdosChannelMask;
    if (pdb < cpu.qdosUserRamBase || pdb + 0x15 > bus.mem.length || bus.mem[pdb + 0x14] !== 1) {
        return qerrNf;
    }
    const name = readQdosName(bus.mem, data + channelNameOffset);
    let key = signed8(bus.mem[channelBase + 28]);
    if (name === "" && (key === openOld || key === openShare)) {
        key = openDirectory;
    }
    if (name === null || (key !== openDelete && (key < openOld || key > openDirectory))) {
        return qerrBp;
    }
    let file = findFile(state, name, key === openDirectory);
    if (key === openDelete) {
        return deleteFile(state, file);
    }
    if (file !== null && key === openNew) {
        return qerrEx;
    }
    if (file === null && key >= openNew && key !== openDirectory) {
        file = createFile(state, name, bus.readHwLongClock());
    }
    if (file === null) {
        return qerrNf;
    }
    const header = fileHeader(state, file);
    const isDirectory = file.entry < 0 || (header >= 0 && state.image[header + qdosFileType] === directoryType);
    if (key === openDirectory && !isDirectory) {
        return qerrNf;
    }
    if (key === openOverwrite && !isDirectory) {
        truncateFile(state, file, fileHeaderSize);
    }
    const channel = {
        generation: state.generation,
        file,
        key,
        isDirectory,
        position: fileHeaderSize,
        eof: fileLength(state, file) + fileHeaderSize,
    };
    state.channels.set(channelBase, channel);
    bus.beforeMemoryWrite(data, channelDataSize);
    cpu.writePointerLong(bus.mem, data + channelPositionOffset, channel.position);
    cpu.writePointerLong(bus.mem, data + channelEofOffset, channel.eof);
    cpu.writePointerWord(bus.mem, data + channelKeyOffset, key);
    cpu.writePointerWord(bus.mem, data + channelDriveOffset, 0);
    cpu.writePointerWord(bus.mem, data + channelDirectoryOffset, Number(isDirectory));
    cpu.writePointerWord(bus.mem, data + channelOpenOffset, 1);
    cpu.writePointerLong(bus.mem, data + channelFileIdOffset, file.file);
    return 0;
}

/** @param {State} state @param {Cpu} c @param {CpuBus} bus */
function driverClose(state, c, bus) {
    const channelBase = c.reg[8] & qdosChannelMask;
    state.channels.delete(channelBase);
    const data = channelBase + channelDataOffset;
    bus.beforeMemoryWrite(data, channelDataSize);
    cpu.writePointerWord(bus.mem, data + channelOpenOffset, 0);
    cpu.writePointerLong(bus.mem, data + channelFileIdOffset, 0);
    const pdb = cpu.readPointerLong(bus.mem, qdosPdbTableAddr + 4);
    if (pdb >= cpu.qdosUserRamBase && pdb + 0x23 <= bus.mem.length && bus.mem[pdb + 0x22] > 0) {
        bus.beforeMemoryWrite(pdb + 0x22, 1);
        bus.mem[pdb + 0x22] -= 1;
    }
    const savedA0 = c.reg[8];
    c.reg[8] = channelBase + 0x18;
    c.reg[9] = qdosMdvDriverLinkAddr;
    const mdvCloseEntry = cpu.readPointerWord(bus.mem, qdosMdvCloseEntryAddr);
    if (mdvCloseEntry !== 0) {
        cpu.callSubroutine(c, bus, mdvCloseEntry, guestCallShortLimit);
    }
    c.reg[8] = savedA0;
    const driverCloseEntry = cpu.readPointerWord(bus.mem, qdosDriverCloseEntryAddr);
    if (driverCloseEntry !== 0) {
        cpu.callSubroutine(c, bus, driverCloseEntry, guestCallShortLimit);
    }
    returnFromDriver(c, bus);
}

/** @param {State} state @param {Cpu} c @param {CpuBus} bus */
function driverIo(state, c, bus) {
    const channelBase = c.reg[8] & qdosChannelMask;
    const channel = state.channels.get(channelBase);
    if (channel === undefined || channel.generation !== state.generation || !state.inserted) {
        c.reg[0] = qerrNo;
        returnFromDriver(c, bus);
        return;
    }
    const op = signed8(c.reg[0] & 0xFF);
    c.reg[0] = 0;
    switch (op) {
    case 0:
        if (channel.position >= channel.eof) {
            c.reg[0] = qerrEof;
        }
        break;
    case 1: {
        const value = readFileByte(state, channel.file, channel.position);
        if (value < 0 || channel.position >= channel.eof) {
            c.reg[0] = qerrEof;
        } else {
            c.reg[1] = (c.reg[1] & ~0xFF) | value;
            channel.position += 1;
        }
        break;
    }
    case 2:
        transferRead(state, channel, c, bus, true, c.reg[2] & 0xFFFF);
        break;
    case 3:
        transferRead(state, channel, c, bus, false, c.reg[2] & 0xFFFF);
        break;
    case 5:
        if (!channelWritable(channel)) {
            c.reg[0] = qerrRo;
        } else {
            c.reg[0] = writeFileByte(state, channel, c.reg[1] & 0xFF);
        }
        break;
    case 7:
        transferWrite(state, channel, c, bus, c.reg[2] & 0xFFFF, true);
        break;
    case 0x40:
    case 0x41:
        break;
    case 0x42:
    case 0x43: {
        let position = c.reg[1];
        if (op === 0x43) {
            position += channel.position - fileHeaderSize;
        }
        position = Math.min(Math.max(position, 0), Math.max(channel.eof - fileHeaderSize, 0));
        channel.position = position + fileHeaderSize;
        c.reg[1] = position;
        break;
    }
    case 0x45:
        mediumInfo(state, c, bus);
        break;
    case 0x46:
        setFileHeader(state, channel, c, bus);
        break;
    case 0x47:
        readFileHeader(state, channel, c, bus);
        break;
    case 0x48:
        transferRead(state, channel, c, bus, false, Math.max(c.reg[2], 0));
        break;
    case 0x49:
        transferWrite(state, channel, c, bus, Math.max(c.reg[2], 0), false);
        break;
    case 0x4B:
        if (!channelWritable(channel)) {
            c.reg[0] = qerrRo;
        } else {
            c.reg[0] = truncateFile(state, channel.file, channel.position);
            channel.eof = channel.position;
        }
        break;
    case 0x4C:
        fileDate(state, channel, c, bus);
        break;
    case 0x4E:
        fileVersionOp(state, channel, c);
        break;
    case 0x4F:
        extendedInfo(state, c, bus);
        break;
    default:
        c.reg[0] = qerrBp;
        break;
    }
    const data = channelBase + channelDataOffset;
    bus.beforeMemoryWrite(data, channelDataSize);
    cpu.writePointerLong(bus.mem, data + channelPositionOffset, channel.position);
    cpu.writePointerLong(bus.mem, data + channelEofOffset, channel.eof);
    returnFromDriver(c, bus);
}

/** @param {Cpu} c @param {CpuBus} bus */
function returnFromDriver(c, bus) {
    cpu.executeOpcode(c, bus, 0x4E75);
}

/** @param {Uint8Array} image @returns {string | null} */
function validateWinImage(image) {
    if (image.length < sectorSize || image.length % sectorSize !== 0) {
        return "Not a QLWA .win image (size must be a non-zero multiple of 512 bytes).";
    }
    if (image[0] !== 0x51 || image[1] !== 0x4C || image[2] !== 0x57 || image[3] !== 0x41) {
        return "Not a QLWA .win image (missing QLWA signature).";
    }
    const sectorsPerCluster = cpu.readPointerWord(image, winSectorsPerClusterOffset);
    const clusterCount = cpu.readPointerWord(image, winClusterCountOffset);
    const mapSectors = cpu.readPointerWord(image, winMapSectorCountOffset);
    const rootCluster = cpu.readPointerWord(image, winRootClusterOffset);
    const expectedBytes = sectorsPerCluster * clusterCount * sectorSize;
    if (
        sectorsPerCluster === 0 || clusterCount === 0 || mapSectors === 0 ||
        rootCluster >= clusterCount || expectedBytes > image.length ||
        winFatOffset + clusterCount * 2 > mapSectors * sectorSize
    ) {
        return "Invalid or truncated QLWA disk geometry.";
    }
    return null;
}

/** @param {Uint8Array} image @returns {string | null} */
function validateFlpImage(image) {
    if (image.length < sectorSize || image.length % sectorSize !== 0) {
        return "Not a QL floppy .img (size must be a non-zero multiple of 512 bytes).";
    }
    const id = cpu.readPointerWord(image, flpHeaderIdOffset);
    if (image[0] !== 0x51 || image[1] !== 0x4C || (id !== 0x3541 && id !== 0x3542)) {
        return "Not a QL floppy .img (missing QL5A/QL5B signature).";
    }
    const totalSectors = cpu.readPointerWord(image, flpTotalSectorsOffset);
    const sectorsPerTrack = cpu.readPointerWord(image, flpSectorsPerTrackOffset);
    const sectorsPerCluster = cpu.readPointerWord(image, flpSectorsPerClusterOffset);
    const sectorsPerBlock = cpu.readPointerWord(image, flpSectorsPerBlockOffset);
    const interleave = signed16(cpu.readPointerWord(image, flpInterleaveOffset));
    if (
        totalSectors <= 0 ||
        sectorsPerTrack <= 0 ||
        sectorsPerCluster <= 0 ||
        sectorsPerCluster > flpTrackMapSize ||
        sectorsPerBlock <= 0 ||
        interleave <= 0 ||
        totalSectors * sectorSize > image.length
    ) {
        return "Invalid or truncated QL floppy geometry.";
    }
    return null;
}

/** @param {State} state */
function readGeometry(state) {
    const image = state.image;
    state.fileMap.clear();
    if (!state.floppy) {
        state.sectorsPerCluster = cpu.readPointerWord(image, winSectorsPerClusterOffset);
        state.clusterCount = cpu.readPointerWord(image, winClusterCountOffset);
        state.mapSectors = cpu.readPointerWord(image, winMapSectorCountOffset);
        state.rootFile = cpu.readPointerWord(image, winRootClusterOffset);
        state.totalSectors = state.clusterCount * state.sectorsPerCluster;
        return;
    }
    state.doubleDensity = cpu.readPointerWord(image, flpHeaderIdOffset) === 0x3541;
    state.totalSectors = cpu.readPointerWord(image, flpTotalSectorsOffset);
    state.sectorsPerTrack = cpu.readPointerWord(image, flpSectorsPerTrackOffset);
    state.sectorsPerCluster = cpu.readPointerWord(image, flpSectorsPerClusterOffset);
    state.sectorsPerBlock = cpu.readPointerWord(image, flpSectorsPerBlockOffset);
    state.interleave = signed16(cpu.readPointerWord(image, flpInterleaveOffset));
    state.rootFile = 0;
    const fatBytes = flpFileMapSlotSize * Math.floor(state.totalSectors / state.sectorsPerBlock) + flpFileMapOffset;
    let fatSectors = Math.floor((fatBytes + sectorSize - 1) / sectorSize);
    if (!state.doubleDensity) {
        fatSectors *= 2;
    }
    state.fatSectors = fatSectors;
    state.rootLength =
        cpu.readPointerWord(image, flpRootDirSectorsOffset) * sectorSize +
        cpu.readPointerWord(image, flpRootDirBytesOffset);
    if (fixLogical(image.subarray(flpTrackMapOffset, flpTrackMapOffset + flpTrackMapSize), state.doubleDensity)) {
        state.modified = true;
    }
    const slotCount = mapSlotCount(state);
    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
        const slot = readMapSlot(state, slotIndex);
        if (slot < 0 || (slot >>> 16) === flpFileMapFree) {
            continue;
        }
        if (!state.fileMap.has(slot)) {
            state.fileMap.set(slot, slotIndex * state.sectorsPerBlock);
        }
    }
}

/**
 * Replace a track map that does not name every sector once with the default.
 *
 * @param {Uint8Array} trackMap
 * @param {boolean} doubleDensity
 * @returns {boolean} Whether the mounted image changed.
 */
function fixLogical(trackMap, doubleDensity) {
    let sides = 18;
    let logicalMap = defaultHdTrackMap;
    if (doubleDensity) {
        sides = 9;
        logicalMap = defaultDdTrackMap;
    }
    const count = sides * 2;
    const used = new Uint8Array(flpTrackMapSize);
    for (let i = 0; i < count; i += 1) {
        let x = trackMap[i] & 127;
        if (x < sides) {
            if ((trackMap[i] & 0x80) !== 0) {
                x += sides;
            }
            if (x < used.length && used[x] === 0) {
                used[x] = 1;
                continue;
            }
        }
        trackMap.set(logicalMap);
        return true;
    }
    return false;
}

/**
 * Image offset of a floppy logical sector after track-map and interleave mapping.
 *
 * @param {State} state
 * @param {number} sector
 * @returns {number}
 */
function logicalSectorOffset(state, sector) {
    if (sector < 0 || sector >= state.totalSectors) {
        return -1;
    }
    const entry = state.image[flpTrackMapOffset + sector % state.sectorsPerCluster];
    const track = Math.floor(sector / state.sectorsPerCluster);
    const trackSector = entry & 0x7F;
    const side = entry >> 7;
    if (trackSector >= state.sectorsPerTrack) {
        return -1;
    }
    const physicalSector = (track * state.interleave + trackSector) % state.sectorsPerTrack;
    const index = track * state.sectorsPerCluster + physicalSector + side * state.sectorsPerTrack;
    if (index < 0 || index >= state.totalSectors) {
        return -1;
    }
    const offset = index * sectorSize;
    if (offset + sectorSize > state.image.length) {
        return -1;
    }
    return offset;
}

/** @param {State} state @returns {number} */
function mapSlotCount(state) {
    if (state.sectorsPerBlock <= 0) {
        return 0;
    }
    const byteCount = state.fatSectors * sectorSize - flpFileMapOffset;
    if (byteCount <= 0) {
        return 0;
    }
    const slotCount = Math.min(
        Math.floor(state.totalSectors / state.sectorsPerBlock),
        Math.floor(byteCount / flpFileMapSlotSize),
    );
    return slotCount - slotCount % 2;
}

/** @param {State} state @param {number} cluster @param {number} sector @returns {number} */
function clusterSectorOffset(state, cluster, sector) {
    if (cluster < 0 || cluster >= state.clusterCount || sector < 0 || sector >= state.sectorsPerCluster) {
        return -1;
    }
    const offset = (cluster * state.sectorsPerCluster + sector) * sectorSize;
    if (offset < 0 || offset + sectorSize > state.image.length) {
        return -1;
    }
    return offset;
}

/** @param {State} state @param {number} cluster @returns {number} */
function nextCluster(state, cluster) {
    if (cluster < 0 || cluster >= state.clusterCount) {
        return -1;
    }
    const next = cpu.readPointerWord(state.image, winFatOffset + cluster * 2);
    if (next >= state.clusterCount) {
        return -1;
    }
    return next;
}

/** @param {State} state @param {number} first @param {number} links @returns {number} */
function walkChain(state, first, links) {
    let cluster = first;
    if (cluster <= 0 || cluster >= state.clusterCount || links < 0 || links >= state.clusterCount) {
        return -1;
    }
    for (let i = 0; i < links; i += 1) {
        cluster = nextCluster(state, cluster);
        if (cluster <= 0) {
            return -1;
        }
    }
    return cluster;
}

/**
 * Image offset of the `sector`th 512-byte sector of a file, or -1.
 *
 * @param {State} state
 * @param {FileId} file
 * @param {number} sector
 * @param {{cluster: number, index: number} | null} cursor
 * @returns {number}
 */
function fileSectorOffset(state, file, sector, cursor) {
    if (sector < 0) {
        return -1;
    }
    if (!state.floppy) {
        const index = Math.floor(sector / state.sectorsPerCluster);
        if (index >= state.clusterCount) {
            return -1;
        }
        let first = file.file;
        let links = index;
        if (cursor !== null && cursor.index <= index) {
            first = cursor.cluster;
            links -= cursor.index;
        }
        const cluster = walkChain(state, first, links);
        if (cluster < 0) {
            return -1;
        }
        if (cursor !== null) {
            cursor.cluster = cluster;
            cursor.index = index;
        }
        return clusterSectorOffset(state, cluster, sector % state.sectorsPerCluster);
    }
    const block = Math.floor(sector / state.sectorsPerBlock);
    if (file.file < 0 || file.file > flpFileMapBlockMask || block > flpFileMapBlockMask) {
        return -1;
    }
    const want = (file.file << flpFileMapBlockBits) | block;
    const firstSector = state.fileMap.get(want);
    if (firstSector === undefined) {
        return -1;
    }
    return logicalSectorOffset(state, firstSector + sector % state.sectorsPerBlock);
}

/** @param {State} state @param {FileId} directory @param {number} entry @returns {number} */
function directoryHeader(state, directory, entry) {
    const base = fileSectorOffset(state, directory, Math.floor(entry / headersPerSector), null);
    if (base < 0) {
        return -1;
    }
    return base + entry % headersPerSector * fileHeaderSize;
}

/** @param {State} state @param {FileId} file @returns {number} */
function fileHeader(state, file) {
    if (file.entry < 0) {
        return -1;
    }
    return directoryHeader(state, {parent: 0, file: file.parent, entry: -1}, file.entry);
}

/** @param {State} state @param {FileId} file @returns {number} */
function storedFileLength(state, file) {
    if (file.entry < 0) {
        if (state.floppy) {
            return state.rootLength;
        }
        return cpu.readPointerLong(state.image, winRootLengthOffset);
    }
    const header = fileHeader(state, file);
    if (header < 0) {
        return 0;
    }
    return cpu.readPointerLong(state.image, header + qdosFileLength);
}

/** @param {State} state @param {FileId} file @returns {number} */
function fileLength(state, file) {
    return Math.max(storedFileLength(state, file) - fileHeaderSize, 0);
}

/** @param {State} state @param {string} name @param {boolean} directory @returns {FileId | null} */
function findFile(state, name, directory) {
    const root = {parent: 0, file: state.rootFile, entry: -1};
    if (name === "") {
        if (directory) {
            return root;
        }
        return null;
    }
    return findInDirectory(state, root, name.toUpperCase(), directory, new Set());
}

/**
 * @param {State} state
 * @param {FileId} directory
 * @param {string} name
 * @param {boolean} directoriesOnly
 * @param {Set<number>} seen
 * @returns {FileId | null}
 */
function findInDirectory(state, directory, name, directoriesOnly, seen) {
    if (seen.has(directory.file)) {
        return null;
    }
    seen.add(directory.file);
    const entries = Math.floor(storedFileLength(state, directory) / fileHeaderSize);
    for (let entry = 1; entry < entries; entry += 1) {
        const header = directoryHeader(state, directory, entry);
        if (header < 0 || cpu.readPointerLong(state.image, header) === 0) {
            continue;
        }
        const entryName = readHeaderName(state.image, header).toUpperCase();
        const isDirectory = state.image[header + qdosFileType] === directoryType;
        const file = {parent: directory.file, file: directoryEntryId(state, directory, entry, header), entry};
        if (entryName === name && (!directoriesOnly || isDirectory)) {
            return file;
        }
        if (isDirectory && name.startsWith(entryName + "_")) {
            const found = findInDirectory(state, file, name, directoriesOnly, seen);
            if (found !== null) {
                return found;
            }
        }
    }
    return null;
}

/** @param {State} state @param {string} name @param {number} now @returns {FileId | null} */
function createFile(state, name, now) {
    if (state.floppy) {
        return createFloppyFile(state, name, now);
    }
    const parent = findParentDirectory(state, name);
    const allocated = allocateCluster(state);
    if (allocated < 0) {
        return null;
    }
    const entries = Math.floor(storedFileLength(state, parent) / fileHeaderSize);
    let entry = 1;
    for (; entry < entries; entry += 1) {
        const header = directoryHeader(state, parent, entry);
        if (header >= 0 && cpu.readPointerLong(state.image, header) === 0) {
            break;
        }
    }
    if (entry >= entries) {
        const newLength = (entry + 1) * fileHeaderSize;
        if (!ensureFileCapacity(state, parent, newLength)) {
            releaseChain(state, allocated);
            return null;
        }
        setStoredLength(state, parent, newLength);
    }
    const header = directoryHeader(state, parent, entry);
    const data = clusterSectorOffset(state, allocated, 0);
    if (header < 0 || data < 0) {
        releaseChain(state, allocated);
        return null;
    }
    state.image.fill(0, header, header + fileHeaderSize);
    state.image.fill(0, data, data + fileHeaderSize);
    cpu.writePointerLong(state.image, header, fileHeaderSize);
    writeHeaderName(state.image, header, name);
    cpu.writePointerLong(state.image, header + qdosFileUpdate, now);
    cpu.writePointerWord(state.image, header + fileIdOffset, allocated);
    cpu.writePointerLong(state.image, header + fileBackupDate, now);
    markModified(state);
    return {parent: parent.file, file: allocated, entry};
}

/**
 * The deepest directory whose `NAME_` prefix the new file name carries.
 *
 * @param {State} state
 * @param {string} name
 * @returns {FileId}
 */
function findParentDirectory(state, name) {
    const folded = name.toUpperCase();
    let best = {parent: 0, file: state.rootFile, entry: -1};
    let bestLength = 0;
    const stack = [best];
    const seen = new Set();
    while (stack.length > 0) {
        const directory = stack.pop();
        if (directory === undefined || seen.has(directory.file)) {
            continue;
        }
        seen.add(directory.file);
        const entries = Math.floor(storedFileLength(state, directory) / fileHeaderSize);
        for (let entry = 1; entry < entries; entry += 1) {
            const header = directoryHeader(state, directory, entry);
            if (
                header < 0 ||
                cpu.readPointerLong(state.image, header) === 0 ||
                state.image[header + qdosFileType] !== directoryType
            ) {
                continue;
            }
            const dirName = readHeaderName(state.image, header);
            const file = {
                parent: directory.file,
                file: directoryEntryId(state, directory, entry, header),
                entry,
            };
            stack.push(file);
            if (folded.startsWith(dirName.toUpperCase() + "_") && dirName.length > bestLength) {
                best = file;
                bestLength = dirName.length;
            }
        }
    }
    return best;
}

/**
 * File id of directory entry `entry`, whose header is at `header`. QLWA stores
 * the first cluster. QL5A/QL5B root entries use their position; entries in
 * subdirectories store the map id plus one, as SMSQ/E does.
 *
 * @param {State} state
 * @param {FileId} directory
 * @param {number} entry
 * @param {number} header
 * @returns {number}
 */
function directoryEntryId(state, directory, entry, header) {
    const stored = cpu.readPointerWord(state.image, header + fileIdOffset);
    if (!state.floppy) {
        return stored;
    }
    if (directory.entry < 0) {
        return entry;
    }
    return stored - 1;
}

/** @param {State} state @returns {number} */
function allocateCluster(state) {
    const freeCount = cpu.readPointerWord(state.image, winFreeClusterCountOffset);
    const cluster = cpu.readPointerWord(state.image, winFirstFreeClusterOffset);
    if (freeCount === 0 || cluster <= 0 || cluster >= state.clusterCount) {
        return -1;
    }
    const next = nextCluster(state, cluster);
    if (next < 0) {
        return -1;
    }
    cpu.writePointerWord(state.image, winFirstFreeClusterOffset, next);
    cpu.writePointerWord(state.image, winFreeClusterCountOffset, freeCount - 1);
    cpu.writePointerWord(state.image, winFatOffset + cluster * 2, 0);
    markModified(state);
    return cluster;
}

/** @param {State} state @param {number} first */
function releaseChain(state, first) {
    const chain = [];
    let cluster = first;
    const seen = new Set();
    while (cluster > 0 && cluster < state.clusterCount && !seen.has(cluster)) {
        seen.add(cluster);
        chain.push(cluster);
        cluster = nextCluster(state, cluster);
    }
    if (chain.length === 0) {
        return;
    }
    const freeCount = cpu.readPointerWord(state.image, winFreeClusterCountOffset);
    cpu.writePointerWord(state.image, winFatOffset + chain[chain.length - 1] * 2, cpu.readPointerWord(state.image, winFirstFreeClusterOffset));
    cpu.writePointerWord(state.image, winFirstFreeClusterOffset, chain[0]);
    cpu.writePointerWord(state.image, winFreeClusterCountOffset, Math.min(freeCount + chain.length, 0xFFFF));
    markModified(state);
}

/** @param {State} state @param {FileId | null} file @returns {number} */
function deleteFile(state, file) {
    if (file === null || file.entry < 0) {
        return qerrNf;
    }
    const header = fileHeader(state, file);
    if (header < 0 || state.image[header + qdosFileType] === directoryType) {
        return qerrIu;
    }
    for (const channel of state.channels.values()) {
        if (channel.generation === state.generation && channel.file.parent === file.parent && channel.file.entry === file.entry) {
            return qerrIu;
        }
    }
    if (state.floppy) {
        if (!releaseFloppyBlocks(state, file.file, 0)) {
            return qerrBm;
        }
        state.image.fill(0, header, header + fileHeaderSize);
        markModified(state);
        return 0;
    }
    releaseChain(state, file.file);
    state.image.fill(0, header, header + fileHeaderSize);
    markModified(state);
    return 0;
}

/** @param {State} state @param {FileId} file @param {number} byteLength @returns {boolean} */
function ensureFileCapacity(state, file, byteLength) {
    if (state.floppy) {
        return ensureFloppyCapacity(state, file, byteLength);
    }
    const neededClusters = Math.max(Math.ceil(byteLength / (state.sectorsPerCluster * sectorSize)), 1);
    let cluster = file.file;
    const seen = new Set();
    for (let count = 1; count < neededClusters; count += 1) {
        if (seen.has(cluster)) {
            return false;
        }
        seen.add(cluster);
        const next = nextCluster(state, cluster);
        if (next < 0) {
            return false;
        }
        if (next > 0) {
            cluster = next;
            continue;
        }
        const allocated = allocateCluster(state);
        if (allocated < 0) {
            return false;
        }
        cpu.writePointerWord(state.image, winFatOffset + cluster * 2, allocated);
        markModified(state);
        cluster = allocated;
    }
    return true;
}

/** @param {State} state @param {FileId} file @param {number} length */
function setStoredLength(state, file, length) {
    if (file.entry < 0) {
        if (state.floppy) {
            cpu.writePointerWord(state.image, flpRootDirSectorsOffset, Math.floor(length / sectorSize));
            cpu.writePointerWord(state.image, flpRootDirBytesOffset, length % sectorSize);
            state.rootLength = length;
        } else {
            cpu.writePointerLong(state.image, winRootLengthOffset, length);
        }
    } else {
        const header = fileHeader(state, file);
        if (header >= 0) {
            cpu.writePointerLong(state.image, header, length);
        }
    }
    markModified(state);
}

/** @param {State} state @param {FileId} file @param {number} position @returns {number} */
function truncateFile(state, file, position) {
    const length = Math.max(position, fileHeaderSize);
    if (state.floppy) {
        const blockBytes = state.sectorsPerBlock * sectorSize;
        let tailBlock = Math.floor(length / blockBytes);
        if (length % blockBytes !== 0) {
            tailBlock += 1;
        }
        if (!releaseFloppyBlocks(state, file.file, tailBlock)) {
            return qerrBm;
        }
        setStoredLength(state, file, length);
        return 0;
    }
    const keepClusters = Math.max(Math.ceil(position / (state.sectorsPerCluster * sectorSize)), 1);
    let cluster = file.file;
    for (let i = 1; i < keepClusters; i += 1) {
        cluster = nextCluster(state, cluster);
        if (cluster <= 0) {
            break;
        }
    }
    if (cluster > 0) {
        const tail = nextCluster(state, cluster);
        cpu.writePointerWord(state.image, winFatOffset + cluster * 2, 0);
        if (tail > 0) {
            releaseChain(state, tail);
        }
    }
    setStoredLength(state, file, length);
    return 0;
}

/**
 * Create a QL5A/QL5B file. A root entry's position is its implicit id, as in
 * SMSQ/E; elsewhere the id is `0x800` plus the group holding block 0, stored
 * plus one at `hdr_flid`, so it cannot clash with ids in other directories.
 * Block 0 and any directory growth are claimed before the new length and
 * header are published, and released again when either cannot be.
 *
 * @param {State} state
 * @param {string} name
 * @param {number} now
 * @returns {FileId | null}
 */
function createFloppyFile(state, name, now) {
    const blockBytes = state.sectorsPerBlock * sectorSize;
    if (blockBytes <= 0) {
        return null;
    }
    const parent = findParentDirectory(state, name);
    const oldLength = storedFileLength(state, parent);
    const entries = Math.floor(oldLength / fileHeaderSize);
    let entry = 1;
    for (; entry < entries; entry += 1) {
        const existing = directoryHeader(state, parent, entry);
        if (existing >= 0 && cpu.readPointerLong(state.image, existing) === 0) {
            break;
        }
    }
    let fileId = entry;
    let slot = -1;
    if (parent.entry >= 0) {
        // `sectorsPerCluster` holds sectors per cylinder; cylinder 0 keeps the map.
        slot = findFreeFloppySlot(state, Math.floor(state.sectorsPerCluster / state.sectorsPerBlock));
        if (slot < 0) {
            return null;
        }
        fileId = flpSubdirectoryIdBit | slot;
    } else if (entry >= flpSubdirectoryIdBit) {
        return null;
    }
    // Slots left for an id whose entry was cleared elsewhere would shadow its blocks.
    if (!floppyFileIdValid(fileId) || !releaseFloppyBlocks(state, fileId, 0)) {
        return null;
    }
    let claimed = false;
    if (slot >= 0) {
        claimed = claimFloppySlot(state, slot, fileId, 0);
    } else {
        claimed = allocateFloppyBlock(state, fileId, 0);
    }
    if (!claimed) {
        return null;
    }
    const created = {parent: parent.file, file: fileId, entry};
    const newLength = Math.max(oldLength, (entry + 1) * fileHeaderSize);
    let header = -1;
    let data = -1;
    if (ensureFloppyCapacity(state, parent, newLength)) {
        header = directoryHeader(state, parent, entry);
        data = fileSectorOffset(state, created, 0, null);
    }
    if (header < 0 || data < 0) {
        if (newLength > oldLength) {
            releaseFloppyBlocks(state, parent.file, Math.ceil(oldLength / blockBytes));
        }
        releaseFloppyBlocks(state, fileId, 0);
        return null;
    }
    if (newLength > oldLength) {
        setStoredLength(state, parent, newLength);
    }
    state.image.fill(0, header, header + fileHeaderSize);
    state.image.fill(0, data, data + fileHeaderSize);
    cpu.writePointerLong(state.image, header, fileHeaderSize);
    writeHeaderName(state.image, header, name);
    cpu.writePointerLong(state.image, header + qdosFileUpdate, now);
    if (parent.entry >= 0) {
        cpu.writePointerWord(state.image, header + fileIdOffset, fileId + 1);
    }
    cpu.writePointerLong(state.image, header + fileBackupDate, now);
    markModified(state);
    return created;
}

/**
 * Map every block that a `byteLength`-byte file needs. Blocks below the stored
 * length are already mapped, so only its last block and new ones are checked.
 *
 * @param {State} state
 * @param {FileId} file
 * @param {number} byteLength
 * @returns {boolean}
 */
function ensureFloppyCapacity(state, file, byteLength) {
    const blockBytes = state.sectorsPerBlock * sectorSize;
    if (blockBytes <= 0 || !floppyFileIdValid(file.file)) {
        return false;
    }
    const needed = Math.max(Math.ceil(byteLength / blockBytes), 1);
    for (let block = Math.floor(storedFileLength(state, file) / blockBytes); block < needed; block += 1) {
        if (state.fileMap.has((file.file << flpFileMapBlockBits) | block)) {
            continue;
        }
        if (!allocateFloppyBlock(state, file.file, block)) {
            return false;
        }
    }
    return true;
}

/**
 * Map `block` of `fileId` to a free group. Like SMSQ/E, the search starts after
 * the file's previous block, or after cylinder 0 for block 0.
 *
 * @param {State} state
 * @param {number} fileId
 * @param {number} block
 * @returns {boolean}
 */
function allocateFloppyBlock(state, fileId, block) {
    // `sectorsPerCluster` holds sectors per cylinder; cylinder 0 keeps the map.
    let start = Math.floor(state.sectorsPerCluster / state.sectorsPerBlock);
    if (block > 0) {
        const previous = state.fileMap.get(((fileId << flpFileMapBlockBits) | block) - 1);
        if (previous !== undefined) {
            start = previous / state.sectorsPerBlock + 1;
        }
    }
    const slot = findFreeFloppySlot(state, start);
    if (slot < 0) {
        return false;
    }
    return claimFloppySlot(state, slot, fileId, block);
}

/**
 * Free every map slot of `fileId` from `firstBlock` on, as `$FDFFFF`.
 *
 * @param {State} state
 * @param {number} fileId
 * @param {number} firstBlock
 * @returns {boolean}
 */
function releaseFloppyBlocks(state, fileId, firstBlock) {
    const released = [];
    const slotCount = mapSlotCount(state);
    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
        const slot = readMapSlot(state, slotIndex);
        if (slot < 0 || (slot >>> 16) === flpFileMapFree) {
            continue;
        }
        if ((slot >>> flpFileMapBlockBits) === fileId && (slot & flpFileMapBlockMask) >= firstBlock) {
            released.push({slotIndex, slot});
        }
    }
    if (released.length === 0) {
        return true;
    }
    const free = cpu.readPointerWord(state.image, flpFreeSectorsOffset) + released.length * state.sectorsPerBlock;
    if (free > 0xFFFF) {
        return false;
    }
    for (const item of released) {
        writeMapSlot(state, item.slotIndex, flpFileMapFreeSlot);
        state.fileMap.delete(item.slot);
    }
    cpu.writePointerWord(state.image, flpFreeSectorsOffset, free);
    markModified(state);
    return true;
}

/**
 * First free map slot from `start` on, wrapping round to slot 0, or -1.
 *
 * @param {State} state
 * @param {number} start
 * @returns {number}
 */
function findFreeFloppySlot(state, start) {
    const slotCount = mapSlotCount(state);
    for (let i = 0; i < slotCount; i += 1) {
        const slotIndex = (start + i) % slotCount;
        const offset = mapByteOffset(state, flpFileMapOffset + slotIndex * flpFileMapSlotSize);
        if (offset >= 0 && state.image[offset] === flpFileMapFree) {
            return slotIndex;
        }
    }
    return -1;
}

/**
 * Give free map slot `slotIndex` to `block` of `fileId`. A block that is
 * already mapped keeps its slot: remounting keeps the first slot for a block,
 * so a second one would change what the file reads after a download.
 *
 * @param {State} state
 * @param {number} slotIndex
 * @param {number} fileId
 * @param {number} block
 * @returns {boolean}
 */
function claimFloppySlot(state, slotIndex, fileId, block) {
    const value = (fileId << flpFileMapBlockBits) | block;
    if (state.fileMap.has(value)) {
        return true;
    }
    const free = cpu.readPointerWord(state.image, flpFreeSectorsOffset);
    if (!floppyFileIdValid(fileId) || block > flpFileMapBlockMask || free < state.sectorsPerBlock) {
        return false;
    }
    const current = readMapSlot(state, slotIndex);
    if (current < 0 || (current >>> 16) !== flpFileMapFree || !writeMapSlot(state, slotIndex, value)) {
        return false;
    }
    state.fileMap.set(value, slotIndex * state.sectorsPerBlock);
    cpu.writePointerWord(state.image, flpFreeSectorsOffset, free - state.sectorsPerBlock);
    markModified(state);
    return true;
}

/**
 * The 24-bit map slot, or -1 when one of its bytes lies outside the image.
 *
 * @param {State} state
 * @param {number} slotIndex
 * @returns {number}
 */
function readMapSlot(state, slotIndex) {
    let value = 0;
    for (let i = 0; i < flpFileMapSlotSize; i += 1) {
        const offset = mapByteOffset(state, flpFileMapOffset + slotIndex * flpFileMapSlotSize + i);
        if (offset < 0) {
            return -1;
        }
        value = (value << 8) | state.image[offset];
    }
    return value;
}

/**
 * Write all three bytes of a map slot, which may span two sectors, or none
 * when one of them lies outside the image.
 *
 * @param {State} state
 * @param {number} slotIndex
 * @param {number} value
 * @returns {boolean}
 */
function writeMapSlot(state, slotIndex, value) {
    const offsets = [];
    for (let i = 0; i < flpFileMapSlotSize; i += 1) {
        const offset = mapByteOffset(state, flpFileMapOffset + slotIndex * flpFileMapSlotSize + i);
        if (offset < 0) {
            return false;
        }
        offsets.push(offset);
    }
    for (let i = 0; i < offsets.length; i += 1) {
        state.image[offsets[i]] = (value >> ((flpFileMapSlotSize - 1 - i) * 8)) & 0xFF;
    }
    return true;
}

/**
 * Image offset of file-map byte `offset`; the map fills logical sectors from 0.
 *
 * @param {State} state
 * @param {number} offset
 * @returns {number}
 */
function mapByteOffset(state, offset) {
    const base = logicalSectorOffset(state, Math.floor(offset / sectorSize));
    if (base < 0) {
        return -1;
    }
    return base + offset % sectorSize;
}

/**
 * Report whether `fileId` can own map slots. From `0xF80` a slot's first byte
 * would read as the map (`$F8`), free (`$FD`), bad (`$FE`) or `$FF` marker.
 *
 * @param {number} fileId
 * @returns {boolean}
 */
function floppyFileIdValid(fileId) {
    return fileId >= 0 && fileId < flpFileMapFirstSpecialId;
}

/** @param {State} state @param {FileId} file @param {number} position @returns {number} */
function readFileByte(state, file, position) {
    const base = fileSectorOffset(state, file, Math.floor(position / sectorSize), null);
    if (base < 0) {
        return -1;
    }
    return state.image[base + position % sectorSize];
}

/**
 * Store one byte at the channel position and advance it.
 *
 * @param {State} state
 * @param {Channel} channel
 * @param {number} value
 * @returns {number}
 */
function writeFileByte(state, channel, value) {
    if (channel.position > 0x7FFFFFFF - 1 || !ensureFileCapacity(state, channel.file, channel.position + 1)) {
        return qerrDf;
    }
    const base = fileSectorOffset(state, channel.file, Math.floor(channel.position / sectorSize), null);
    if (base < 0) {
        return qerrBm;
    }
    state.image[base + channel.position % sectorSize] = value & 0xFF;
    channel.position += 1;
    if (channel.position > channel.eof) {
        channel.eof = channel.position;
        setStoredLength(state, channel.file, channel.eof);
    }
    markModified(state);
    return 0;
}

/** @param {State} state @param {Channel} channel @param {Uint8Array} source @param {number} sourceOffset @param {number} count @returns {number} */
function writeFileBytes(state, channel, source, sourceOffset, count) {
    if (channel.position > 0x7FFFFFFF - count || !ensureFileCapacity(state, channel.file, channel.position + count)) {
        return qerrDf;
    }
    const cursor = {cluster: channel.file.file, index: 0};
    for (let i = 0; i < count;) {
        const base = fileSectorOffset(state, channel.file, Math.floor(channel.position / sectorSize), cursor);
        if (base < 0) {
            return qerrBm;
        }
        const offset = channel.position % sectorSize;
        const take = Math.min(count - i, sectorSize - offset);
        state.image.set(source.subarray(sourceOffset + i, sourceOffset + i + take), base + offset);
        channel.position += take;
        i += take;
    }
    if (channel.position > channel.eof) {
        channel.eof = channel.position;
        setStoredLength(state, channel.file, channel.eof);
    }
    markModified(state);
    return 0;
}

/** @param {State} state @param {Channel} channel @param {Cpu} c @param {CpuBus} bus @param {boolean} line @param {number} requested */
function transferRead(state, channel, c, bus, line, requested) {
    let address = c.reg[9] & 0xFFFFFF;
    let count = 0;
    let status = 0;
    const cursor = {cluster: channel.file.file, index: 0};
    while (count < requested) {
        if (channel.position >= channel.eof) {
            status = qerrEof;
            break;
        }
        if (address < cpu.qdosUserRamBase || address >= bus.mem.length) {
            status = qerrBp;
            break;
        }
        const base = fileSectorOffset(state, channel.file, Math.floor(channel.position / sectorSize), cursor);
        if (base < 0) {
            status = qerrBm;
            break;
        }
        const offset = channel.position % sectorSize;
        const start = base + offset;
        let take = Math.min(
            requested - count,
            channel.eof - channel.position,
            bus.mem.length - address,
            sectorSize - offset,
        );
        if (line) {
            for (let i = 0; i < take; i += 1) {
                if (state.image[start + i] === 10) {
                    take = i + 1;
                    break;
                }
            }
        }
        bus.beforeMemoryWrite(address, take);
        bus.mem.set(state.image.subarray(start, start + take), address);
        address += take;
        channel.position += take;
        count += take;
        if (line && state.image[start + take - 1] === 10) {
            break;
        }
    }
    if (!line && count > 0) {
        status = 0;
    } else if (line && status === 0 && count === requested) {
        status = qerrBf;
    }
    c.reg[0] = status;
    c.reg[1] = count;
    c.reg[9] = address;
}

/** @param {State} state @param {Channel} channel @param {Cpu} c @param {CpuBus} bus @param {number} requested @param {boolean} wordCount */
function transferWrite(state, channel, c, bus, requested, wordCount) {
    if (!channelWritable(channel)) {
        c.reg[0] = qerrRo;
        return;
    }
    const address = c.reg[9] & 0xFFFFFF;
    const available = Math.max(Math.min(requested, bus.mem.length - address), 0);
    if (address < cpu.qdosUserRamBase || available !== requested) {
        c.reg[0] = qerrBp;
        return;
    }
    c.reg[0] = writeFileBytes(state, channel, bus.mem, address, available);
    if (wordCount) {
        c.reg[1] = available;
    }
    c.reg[9] = address + available;
}

/** @param {Channel} channel @returns {boolean} */
function channelWritable(channel) {
    return !channel.isDirectory && channel.key !== openShare;
}

/** @param {State} state @returns {number} */
function freeSectors(state) {
    if (state.floppy) {
        return cpu.readPointerWord(state.image, flpFreeSectorsOffset);
    }
    return cpu.readPointerWord(state.image, winFreeClusterCountOffset) * state.sectorsPerCluster;
}

/** @param {State} state @param {Cpu} c @param {CpuBus} bus */
function mediumInfo(state, c, bus) {
    const address = c.reg[9] & 0xFFFFFF;
    if (address < cpu.qdosUserRamBase || address + mediumNameSize > bus.mem.length) {
        c.reg[0] = qerrBp;
        return;
    }
    let nameOffset = winNameOffset;
    if (state.floppy) {
        nameOffset = flpMediumNameOffset;
    }
    const free = Math.min(freeSectors(state), qdosMaxSectorCount);
    const total = Math.min(state.totalSectors, qdosMaxSectorCount);
    c.reg[1] = (free << 16) | total;
    bus.beforeMemoryWrite(address, mediumNameSize);
    bus.mem.set(state.image.subarray(nameOffset, nameOffset + mediumNameSize), address);
    c.reg[9] = address + mediumNameSize;
}

/** @param {State} state @param {Channel} channel @param {Cpu} c @param {CpuBus} bus */
function readFileHeader(state, channel, c, bus) {
    const count = Math.min(Math.max(c.reg[2] & 0xFFFE, 4), fileHeaderSize);
    const address = c.reg[9] & 0xFFFFFF;
    if (address < cpu.qdosUserRamBase || address + count > bus.mem.length) {
        c.reg[0] = qerrBp;
        return;
    }
    const result = new Uint8Array(fileHeaderSize);
    const header = fileHeader(state, channel.file);
    if (header < 0) {
        result[qdosFileType] = directoryType;
    } else {
        result.set(state.image.subarray(header, header + fileHeaderSize));
    }
    cpu.writePointerLong(result, 0, fileLength(state, channel.file));
    bus.beforeMemoryWrite(address, count);
    bus.mem.set(result.subarray(0, count), address);
    c.reg[1] = count;
    c.reg[9] = address + count;
}

/** @param {State} state @param {Channel} channel @param {Cpu} c @param {CpuBus} bus */
function setFileHeader(state, channel, c, bus) {
    if (!channelWritable(channel)) {
        c.reg[0] = qerrRo;
        return;
    }
    const header = fileHeader(state, channel.file);
    const address = c.reg[9] & 0xFFFFFF;
    if (header < 0 || address < cpu.qdosUserRamBase || address + 14 > bus.mem.length) {
        c.reg[0] = qerrBp;
        return;
    }
    state.image.set(bus.mem.subarray(address + 4, address + 14), header + 4);
    c.reg[1] = (c.reg[1] & ~0xFFFF) | 14;
    markModified(state);
}

/** @param {State} state @param {Channel} channel @param {Cpu} c @param {CpuBus} bus */
function fileDate(state, channel, c, bus) {
    const header = fileHeader(state, channel.file);
    if (header < 0) {
        c.reg[0] = qerrBp;
        return;
    }
    let offset = fileBackupDate;
    if ((c.reg[2] & 0xFF) === 0) {
        offset = qdosFileUpdate;
    }
    if (c.reg[1] < 0) {
        c.reg[1] = cpu.readPointerLong(state.image, header + offset) | 0;
        return;
    }
    if (!channelWritable(channel)) {
        c.reg[0] = qerrRo;
        return;
    }
    let date = c.reg[1];
    if (date === 0) {
        date = bus.readHwLongClock();
    }
    cpu.writePointerLong(state.image, header + offset, date);
    c.reg[1] = date;
    markModified(state);
}

/** @param {State} state @param {Channel} channel @param {Cpu} c */
function fileVersionOp(state, channel, c) {
    const header = fileHeader(state, channel.file);
    if (header < 0) {
        c.reg[0] = qerrBp;
        return;
    }
    let version = signed16(cpu.readPointerWord(state.image, header + fileVersion));
    if (c.reg[1] === 0) {
        c.reg[1] = version;
        return;
    }
    if (!channelWritable(channel)) {
        c.reg[0] = qerrRo;
        return;
    }
    if (c.reg[1] < 0) {
        version += 1;
    } else {
        version = c.reg[1];
    }
    cpu.writePointerWord(state.image, header + fileVersion, version);
    c.reg[1] = signed16(version & 0xFFFF);
    markModified(state);
}

/** @param {State} state @param {Cpu} c @param {CpuBus} bus */
function extendedInfo(state, c, bus) {
    const address = c.reg[9] & 0xFFFFFF;
    if (address < cpu.qdosUserRamBase || address + 64 > bus.mem.length) {
        c.reg[0] = qerrBp;
        return;
    }
    bus.beforeMemoryWrite(address, 64);
    bus.mem.fill(0xFF, address, address + 64);
    const mountLength = Math.min(state.name.length, 20);
    cpu.writePointerWord(bus.mem, address, mountLength);
    for (let i = 0; i < mountLength; i += 1) {
        bus.mem[address + 2 + i] = state.name.charCodeAt(i);
    }
    cpu.writePointerWord(bus.mem, address + 22, state.driver.length);
    for (let i = 0; i < state.driver.length; i += 1) {
        bus.mem[address + 24 + i] = state.driver.charCodeAt(i);
    }
    bus.mem[address + 28] = 1;
    bus.mem[address + 29] = 0;
    let allocationBytes = state.sectorsPerCluster * sectorSize;
    if (state.floppy) {
        allocationBytes = sectorSize;
    }
    cpu.writePointerWord(bus.mem, address + 30, allocationBytes);
    cpu.writePointerLong(bus.mem, address + 32, state.totalSectors / 2);
    cpu.writePointerLong(bus.mem, address + 36, freeSectors(state) / 2);
    cpu.writePointerLong(bus.mem, address + 40, fileHeaderSize);
}

/** @param {State} state */
function markModified(state) {
    state.modified = true;
    let offset = winUpdateCheckOffset;
    if (state.floppy) {
        offset = flpUpdateCountOffset;
    }
    cpu.writePointerLong(state.image, offset, (cpu.readPointerLong(state.image, offset) + 1) >>> 0);
}

/** @param {Uint8Array} bytes @param {number} offset @returns {string | null} */
function readQdosName(bytes, offset) {
    if (offset < 0 || offset + 2 > bytes.length) {
        return null;
    }
    const length = cpu.readPointerWord(bytes, offset);
    if (length > maxNameLength || offset + 2 + length > bytes.length) {
        return null;
    }
    let name = "";
    for (let i = 0; i < length; i += 1) {
        name += String.fromCharCode(bytes[offset + 2 + i]);
    }
    return name;
}

/** @param {Uint8Array} bytes @param {number} header @returns {string} */
function readHeaderName(bytes, header) {
    const length = Math.min(cpu.readPointerWord(bytes, header + qdosFileName), maxNameLength);
    let name = "";
    for (let i = 0; i < length; i += 1) {
        name += String.fromCharCode(bytes[header + qdosFileName + 2 + i]);
    }
    return name;
}

/** @param {Uint8Array} bytes @param {number} header @param {string} name */
function writeHeaderName(bytes, header, name) {
    const length = Math.min(name.length, maxNameLength);
    cpu.writePointerWord(bytes, header + qdosFileName, length);
    for (let i = 0; i < length; i += 1) {
        bytes[header + qdosFileName + 2 + i] = name.charCodeAt(i);
    }
}

/** @param {number} value @returns {number} */
function signed8(value) {
    return (value << 24) >> 24;
}

/** @param {number} value @returns {number} */
function signed16(value) {
    return (value << 16) >> 16;
}
