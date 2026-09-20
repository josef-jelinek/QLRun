import * as cpu from "./cpu.js";

const sectorSize = 512;
const fileHeaderSize = 64;
const headersPerSector = sectorSize / fileHeaderSize;
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
const qdosPdbTableAddr = 0x28100;
const qdosMdvDriverLinkAddr = 0x28140;
const qdosDriverCloseEntryAddr = 0xC2;
const qdosMdvCloseEntryAddr = 0xD4;
const driverIoAddr = 0x1C010;
const driverOpenAddr = driverIoAddr + 2;
const driverCloseAddr = driverOpenAddr + 2;
const driverFormatAddr = driverCloseAddr + 4;
const driverIoOpcode = 0xAAA6;
const driverOpenOpcode = 0xAAA7;
const driverCloseOpcode = 0xAAA8;
const driverSlaveOpcode = 0xAAA9;
const driverFormatOpcode = 0xAAAA;
const guestCallShortLimit = 20000;
const guestCallMediumLimit = 200000;
const qdosHeapAllocCall = 0x18;
const qdosLinkFileDriverCall = 0x22;
const qdosFileType = 5;
const qdosFileName = 14;
const qdosFileUpdate = 52;
const fileVersion = 0x38;
const fileBackupDate = 0x3C;
const directoryType = 0xFF;
const headerIdOffset = 2;
const mediumNameOffset = 4;
const mediumNameSize = 10;
const updateCountOffset = 16;
const freeSectorsOffset = 20;
const totalSectorsOffset = 24;
const sectorsPerTrackOffset = 26;
const sectorsPerClusterOffset = 28;
const sectorsPerBlockOffset = 32;
const rootDirSectorsOffset = 34;
const rootDirBytesOffset = 36;
const interleaveOffset = 38;
const trackMapOffset = 40;
const trackMapSize = 36;
const fileMapOffset = 96;
const fileMapSlotSize = 3;
const fileMapFree = 0xFD;
const fileMapBlockBits = 12;
const fileMapBlockMask = (1 << fileMapBlockBits) - 1;
const qerrBf = -5;
const qerrNo = -6;
const qerrNf = -7;
const qerrEof = -10;
const qerrBp = -15;
const qerrBm = -16;
const qerrOv = -18;
const qerrNi = -19;
const qerrRo = -20;
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
let handlersInstalled = false;

/**
 * @typedef {import("./cpu.js").Cpu} Cpu
 * @typedef {import("./cpu.js").CpuBus} CpuBus
 */

/**
 * Mutable single-drive QL5A/QL5B state.
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
 * @typedef {{
 *   image: Uint8Array,
 *   name: string,
 *   inserted: boolean,
 *   driverReady: boolean,
 *   generation: number,
 *   doubleDensity: boolean,
 *   totalSectors: number,
 *   sectorsPerTrack: number,
 *   sectorsPerCluster: number,
 *   sectorsPerBlock: number,
 *   interleave: number,
 *   fatSectors: number,
 *   rootLength: number,
 *   channels: Map<number, Channel>,
 * }} State
 */

/**
 * Empty unmounted floppy. Opcode handlers are installed once per page load.
 *
 * @returns {State}
 */
export function create() {
    installHandlers();
    return emptyState();
}

/**
 * Allocate and link the FLP_ host driver during QDOS ROM initialization.
 *
 * @param {Cpu} c
 * @param {CpuBus} bus
 */
export function linkDriver(c, bus) {
    const state = bus.fdd;
    const name = "FLP";
    const linkSize = 38;
    const saved = new Int32Array(c.reg);
    c.reg[1] = 4 + linkSize;
    c.reg[2] = 0;
    cpu.callTrap(c, bus, 1, qdosHeapAllocCall, guestCallMediumLimit);
    if (c.exception === 0 && c.reg[0] === 0) {
        const base = c.reg[8] & qdosChannelMask;
        if (base >= cpu.qdosUserRamBase && base + 4 + linkSize <= bus.mem.length) {
            const link = base + 4;
            bus.mem.fill(0, link, link + linkSize);
            cpu.writePointerLong(bus.mem, link, driverIoAddr);
            cpu.writePointerLong(bus.mem, link + 4, driverOpenAddr);
            cpu.writePointerLong(bus.mem, link + 8, driverCloseAddr);
            cpu.writePointerLong(bus.mem, link + 12, driverCloseAddr + 2);
            cpu.writePointerLong(bus.mem, link + 24, driverFormatAddr);
            cpu.writePointerLong(bus.mem, link + 28, 36);
            cpu.writePointerWord(bus.mem, link + 32, name.length);
            for (let i = 0; i < name.length; i += 1) {
                bus.mem[link + 34 + i] = name.charCodeAt(i);
            }
            cpu.callTrap(c, bus, 1, qdosLinkFileDriverCall, guestCallShortLimit);
            state.driverReady = c.exception === 0 && c.reg[0] === 0;
        }
    }
    c.reg.set(saved);
}

/**
 * Drop open channels and re-apply the host-driver trampolines for the next boot.
 *
 * @param {State} state
 * @param {Uint8Array} mem
 */
export function prepareReset(state, mem) {
    state.channels.clear();
    state.driverReady = false;
    cpu.writePointerWord(mem, driverIoAddr, driverIoOpcode);
    cpu.writePointerWord(mem, driverOpenAddr, driverOpenOpcode);
    cpu.writePointerWord(mem, driverCloseAddr, driverCloseOpcode);
    cpu.writePointerWord(mem, driverCloseAddr + 2, driverSlaveOpcode);
    cpu.writePointerWord(mem, driverFormatAddr, driverFormatOpcode);
}

/**
 * Validate and insert a QL5A or QL5B dump. The image is read-only to the guest.
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
    const error = validateImage(source);
    if (error !== null) {
        return error;
    }
    state.image = new Uint8Array(source);
    state.name = name;
    state.inserted = true;
    state.generation += 1;
    state.channels.clear();
    readGeometry(state);
    return null;
}

/**
 * Copy the mounted image for download.
 *
 * @param {State} state
 * @returns {{name: string, bytes: Uint8Array} | null}
 */
export function save(state) {
    if (!state.inserted) {
        return null;
    }
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
    state.generation += 1;
    state.channels.clear();
    state.doubleDensity = false;
    state.totalSectors = 0;
    state.sectorsPerTrack = 0;
    state.sectorsPerCluster = 0;
    state.sectorsPerBlock = 0;
    state.interleave = 0;
    state.fatSectors = 0;
    state.rootLength = 0;
}

/**
 * User-visible mount name and whether QDOS accepted the driver.
 *
 * @param {State} state
 * @returns {{inserted: boolean, name: string, driverReady: boolean}}
 */
export function info(state) {
    return {
        inserted: state.inserted,
        name: state.name,
        driverReady: state.driverReady,
    };
}

/**
 * Look up a root-relative QDOS name on the mounted image.
 *
 * @param {State} state
 * @param {string} name
 * @returns {boolean}
 */
export function hasFile(state, name) {
    return findFile(state, name, false) !== null;
}

function installHandlers() {
    if (handlersInstalled) {
        return;
    }
    handlersInstalled = true;
    cpu.setOpcode(driverIoOpcode, driverIo);
    cpu.setOpcode(driverOpenOpcode, driverOpen);
    cpu.setOpcode(driverCloseOpcode, driverClose);
    cpu.setOpcode(driverSlaveOpcode, returnFromDriver);
    cpu.setOpcode(driverFormatOpcode, driverFormat);
}

/** @param {Cpu} c @param {CpuBus} bus */
function driverOpen(c, bus) {
    const state = bus.fdd;
    if (!state.inserted) {
        c.reg[0] = qerrNf;
        returnFromDriver(c, bus);
        return;
    }
    const channelBase = c.reg[8] & qdosChannelMask;
    const data = channelBase + channelDataOffset;
    if (data < cpu.qdosUserRamBase || data + channelDataSize > bus.mem.length) {
        c.reg[0] = qerrOv;
        returnFromDriver(c, bus);
        return;
    }
    const pdb = c.reg[9] & qdosChannelMask;
    if (pdb < cpu.qdosUserRamBase || pdb + 0x15 > bus.mem.length || bus.mem[pdb + 0x14] !== 1) {
        c.reg[0] = qerrNf;
        returnFromDriver(c, bus);
        return;
    }
    const name = readQdosName(bus.mem, data + channelNameOffset);
    let key = signed8(bus.mem[channelBase + 28]);
    if (name === "" && (key === openOld || key === openShare)) {
        key = openDirectory;
    }
    if (name === null || key < openOld || key > openDirectory) {
        c.reg[0] = qerrBp;
        returnFromDriver(c, bus);
        return;
    }
    if (key === openNew || key === openOverwrite) {
        c.reg[0] = qerrRo;
        returnFromDriver(c, bus);
        return;
    }
    const file = findFile(state, name, key === openDirectory);
    if (file === null) {
        c.reg[0] = qerrNf;
        returnFromDriver(c, bus);
        return;
    }
    const header = fileHeader(state, file);
    const isDirectory = file.file === 0 || (header !== null && state.image[header + qdosFileType] === directoryType);
    if (key === openDirectory && !isDirectory) {
        c.reg[0] = qerrNf;
        returnFromDriver(c, bus);
        return;
    }
    const length = fileLength(state, file) + fileHeaderSize;
    const channel = {
        generation: state.generation,
        file,
        key,
        isDirectory,
        position: fileHeaderSize,
        eof: length,
    };
    state.channels.set(channelBase, channel);
    cpu.writePointerLong(bus.mem, data + channelPositionOffset, channel.position);
    cpu.writePointerLong(bus.mem, data + channelEofOffset, channel.eof);
    cpu.writePointerWord(bus.mem, data + channelKeyOffset, key);
    cpu.writePointerWord(bus.mem, data + channelDriveOffset, 0);
    let directoryFlag = 0;
    if (isDirectory) {
        directoryFlag = 1;
    }
    cpu.writePointerWord(bus.mem, data + channelDirectoryOffset, directoryFlag);
    cpu.writePointerWord(bus.mem, data + channelOpenOffset, 1);
    cpu.writePointerLong(bus.mem, data + channelFileIdOffset, file.file);
    c.reg[0] = 0;
    returnFromDriver(c, bus);
}

/** @param {Cpu} c @param {CpuBus} bus */
function driverClose(c, bus) {
    const state = bus.fdd;
    const channelBase = c.reg[8] & qdosChannelMask;
    state.channels.delete(channelBase);
    const data = channelBase + channelDataOffset;
    cpu.writePointerWord(bus.mem, data + channelOpenOffset, 0);
    cpu.writePointerLong(bus.mem, data + channelFileIdOffset, 0);
    const pdb = cpu.readPointerLong(bus.mem, qdosPdbTableAddr + 4);
    if (pdb >= cpu.qdosUserRamBase && pdb + 0x23 <= bus.mem.length && bus.mem[pdb + 0x22] > 0) {
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

/** @param {Cpu} c @param {CpuBus} bus */
function driverIo(c, bus) {
    const state = bus.fdd;
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
    case 7:
    case 0x46:
    case 0x49:
    case 0x4B:
        c.reg[0] = qerrRo;
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
    case 0x47:
        readFileHeader(state, channel, c, bus);
        break;
    case 0x48:
        transferRead(state, channel, c, bus, false, Math.max(c.reg[2], 0));
        break;
    case 0x4C:
        fileDate(state, channel, c);
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
    cpu.writePointerLong(bus.mem, data + channelPositionOffset, channel.position);
    cpu.writePointerLong(bus.mem, data + channelEofOffset, channel.eof);
    returnFromDriver(c, bus);
}

/** @param {Cpu} c @param {CpuBus} bus */
function driverFormat(c, bus) {
    c.reg[0] = qerrNi;
    returnFromDriver(c, bus);
}

/** @param {Cpu} c @param {CpuBus} bus */
function returnFromDriver(c, bus) {
    cpu.executeOpcode(c, bus, 0x4E75);
}

/** @returns {State} */
function emptyState() {
    return {
        image: new Uint8Array(0),
        name: "",
        inserted: false,
        driverReady: false,
        generation: 1,
        doubleDensity: false,
        totalSectors: 0,
        sectorsPerTrack: 0,
        sectorsPerCluster: 0,
        sectorsPerBlock: 0,
        interleave: 0,
        fatSectors: 0,
        rootLength: 0,
        channels: new Map(),
    };
}

/** @param {Uint8Array} image @returns {string | null} */
function validateImage(image) {
    if (image.length < sectorSize || image.length % sectorSize !== 0) {
        return "Not a QL floppy .img (size must be a non-zero multiple of 512 bytes).";
    }
    if (image[0] !== 0x51 || image[1] !== 0x4C) {
        return "Not a QL floppy .img (missing QL5A/QL5B signature).";
    }
    const id = cpu.readPointerWord(image, headerIdOffset);
    if (id !== 0x3541 && id !== 0x3542) {
        return "Not a QL floppy .img (missing QL5A/QL5B signature).";
    }
    const totalSectors = cpu.readPointerWord(image, totalSectorsOffset);
    const sectorsPerTrack = cpu.readPointerWord(image, sectorsPerTrackOffset);
    const sectorsPerCluster = cpu.readPointerWord(image, sectorsPerClusterOffset);
    const sectorsPerBlock = cpu.readPointerWord(image, sectorsPerBlockOffset);
    const interleave = signed16(cpu.readPointerWord(image, interleaveOffset));
    if (
        totalSectors <= 0 ||
        sectorsPerTrack <= 0 ||
        sectorsPerCluster <= 0 ||
        sectorsPerCluster > trackMapSize ||
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
    state.doubleDensity = cpu.readPointerWord(image, headerIdOffset) === 0x3541;
    state.totalSectors = cpu.readPointerWord(image, totalSectorsOffset);
    state.sectorsPerTrack = cpu.readPointerWord(image, sectorsPerTrackOffset);
    state.sectorsPerCluster = cpu.readPointerWord(image, sectorsPerClusterOffset);
    state.sectorsPerBlock = cpu.readPointerWord(image, sectorsPerBlockOffset);
    state.interleave = signed16(cpu.readPointerWord(image, interleaveOffset));
    const fatBytes = fileMapSlotSize * Math.floor(state.totalSectors / state.sectorsPerBlock) + fileMapOffset;
    let fatSectors = Math.floor((fatBytes + sectorSize - 1) / sectorSize);
    if (!state.doubleDensity) {
        fatSectors *= 2;
    }
    state.fatSectors = fatSectors;
    state.rootLength =
        cpu.readPointerWord(image, rootDirSectorsOffset) * sectorSize +
        cpu.readPointerWord(image, rootDirBytesOffset);
    fixLogical(image.subarray(trackMapOffset, trackMapOffset + trackMapSize), state.doubleDensity);
}

/**
 * @param {Uint8Array} trackMap
 * @param {boolean} doubleDensity
 */
function fixLogical(trackMap, doubleDensity) {
    let sides = 18;
    let logicalMap = defaultHdTrackMap;
    if (doubleDensity) {
        sides = 9;
        logicalMap = defaultDdTrackMap;
    }
    const count = sides * 2;
    const used = new Uint8Array(trackMapSize);
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
        return;
    }
}

/**
 * @param {State} state
 * @param {number} sector
 * @returns {number}
 */
function logicalSectorOffset(state, sector) {
    if (sector < 0 || sector >= state.totalSectors) {
        return -1;
    }
    const trackMap = state.image.subarray(trackMapOffset, trackMapOffset + trackMapSize);
    const entry = trackMap[sector % state.sectorsPerCluster];
    const track = Math.floor(sector / state.sectorsPerCluster);
    const trackSector = entry & 0x7F;
    const side = entry >> 7;
    if (trackSector >= state.sectorsPerTrack) {
        return -1;
    }
    const interleaved = track * state.interleave + trackSector;
    const physicalSector = interleaved % state.sectorsPerTrack;
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

/**
 * @param {State} state
 * @param {number} offset
 * @returns {number}
 */
function mapByte(state, offset) {
    const sector = Math.floor(offset / sectorSize);
    const base = logicalSectorOffset(state, sector);
    if (base < 0) {
        return 0;
    }
    return state.image[base + offset % sectorSize];
}

/** @param {State} state @returns {number} */
function mapSlotCount(state) {
    if (state.sectorsPerBlock <= 0) {
        return 0;
    }
    let slotCount = Math.floor(state.totalSectors / state.sectorsPerBlock);
    const byteCount = state.fatSectors * sectorSize - fileMapOffset;
    if (byteCount <= 0) {
        return 0;
    }
    const available = Math.floor(byteCount / fileMapSlotSize);
    if (available < slotCount) {
        slotCount = available;
    }
    return slotCount - slotCount % 2;
}

/**
 * @param {State} state
 * @param {number} slotIndex
 * @returns {number}
 */
function mapSlot(state, slotIndex) {
    const offset = fileMapOffset + slotIndex * fileMapSlotSize;
    return (mapByte(state, offset) << 16) | (mapByte(state, offset + 1) << 8) | mapByte(state, offset + 2);
}

/**
 * @param {State} state
 * @param {FileId} file
 * @param {number} sector
 * @returns {number}
 */
function fileSectorOffset(state, file, sector) {
    if (sector < 0 || file.file < 0 || file.file > fileMapBlockMask) {
        return -1;
    }
    const block = Math.floor(sector / state.sectorsPerBlock);
    if (block > fileMapBlockMask) {
        return -1;
    }
    const want = (file.file << fileMapBlockBits) | block;
    const slotCount = mapSlotCount(state);
    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
        if (mapByte(state, fileMapOffset + slotIndex * fileMapSlotSize) === fileMapFree) {
            continue;
        }
        if (mapSlot(state, slotIndex) === want) {
            return logicalSectorOffset(state, slotIndex * state.sectorsPerBlock + sector % state.sectorsPerBlock);
        }
    }
    return -1;
}

/** @param {State} state @param {FileId} file @returns {number | null} */
function fileHeader(state, file) {
    if (file.file === 0 || file.entry < 0) {
        return null;
    }
    const parent = {parent: 0, file: file.parent, entry: -1};
    return directoryHeader(state, parent, file.entry);
}

/** @param {State} state @param {FileId} directory @param {number} entry @returns {number | null} */
function directoryHeader(state, directory, entry) {
    const base = fileSectorOffset(state, directory, Math.floor(entry / headersPerSector));
    if (base < 0) {
        return null;
    }
    return base + entry % headersPerSector * fileHeaderSize;
}

/** @param {State} state @param {FileId} file @returns {number} */
function storedFileLength(state, file) {
    if (file.file === 0) {
        return state.rootLength;
    }
    const header = fileHeader(state, file);
    if (header === null) {
        return 0;
    }
    return cpu.readPointerLong(state.image, header);
}

/** @param {State} state @param {FileId} file @returns {number} */
function fileLength(state, file) {
    return Math.max(storedFileLength(state, file) - fileHeaderSize, 0);
}

/** @param {State} state @param {string} name @param {boolean} directory @returns {FileId | null} */
function findFile(state, name, directory) {
    if (name === "") {
        if (directory) {
            return {parent: 0, file: 0, entry: -1};
        }
        return null;
    }
    return findInDirectory(state, {parent: 0, file: 0, entry: -1}, name.toUpperCase(), directory, new Set());
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
        if (header === null || cpu.readPointerLong(state.image, header) === 0) {
            continue;
        }
        const entryName = readHeaderName(state.image, header).toUpperCase();
        const isDirectory = state.image[header + qdosFileType] === directoryType;
        const file = {parent: directory.file, file: entry, entry};
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

/** @param {State} state @param {FileId} file @param {number} position @returns {number} */
function readFileByte(state, file, position) {
    const sector = Math.floor(position / sectorSize);
    const base = fileSectorOffset(state, file, sector);
    if (base < 0) {
        return -1;
    }
    return state.image[base + position % sectorSize];
}

/** @param {State} state @param {Channel} channel @param {Cpu} c @param {CpuBus} bus @param {boolean} line @param {number} requested */
function transferRead(state, channel, c, bus, line, requested) {
    let address = c.reg[9] & 0xFFFFFF;
    let count = 0;
    let status = 0;
    for (; count < requested; count += 1) {
        if (channel.position >= channel.eof) {
            status = qerrEof;
            break;
        }
        if (address < cpu.qdosUserRamBase || address >= bus.mem.length) {
            status = qerrBp;
            break;
        }
        const value = readFileByte(state, channel.file, channel.position);
        if (value < 0) {
            status = qerrBm;
            break;
        }
        bus.mem[address] = value;
        address += 1;
        channel.position += 1;
        if (line && value === 10) {
            count += 1;
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

/** @param {State} state @param {Cpu} c @param {CpuBus} bus */
function mediumInfo(state, c, bus) {
    const address = c.reg[9] & 0xFFFFFF;
    if (address < cpu.qdosUserRamBase || address + mediumNameSize > bus.mem.length) {
        c.reg[0] = qerrBp;
        return;
    }
    const freeSectors = cpu.readPointerWord(state.image, freeSectorsOffset);
    c.reg[1] = ((freeSectors & 0xFFFF) << 16) | (state.totalSectors & 0xFFFF);
    bus.mem.set(state.image.subarray(mediumNameOffset, mediumNameOffset + mediumNameSize), address);
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
    if (header === null) {
        cpu.writePointerLong(result, 0, fileLength(state, channel.file));
        result[qdosFileType] = directoryType;
    } else {
        result.set(state.image.subarray(header, header + fileHeaderSize));
        cpu.writePointerLong(result, 0, fileLength(state, channel.file));
    }
    bus.mem.set(result.subarray(0, count), address);
    c.reg[1] = count;
    c.reg[9] = address + count;
}

/** @param {State} state @param {Channel} channel @param {Cpu} c */
function fileDate(state, channel, c) {
    const header = fileHeader(state, channel.file);
    if (header === null) {
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
    c.reg[0] = qerrRo;
}

/** @param {State} state @param {Channel} channel @param {Cpu} c */
function fileVersionOp(state, channel, c) {
    const header = fileHeader(state, channel.file);
    if (header === null) {
        c.reg[0] = qerrBp;
        return;
    }
    if (c.reg[1] === 0) {
        c.reg[1] = signed16(cpu.readPointerWord(state.image, header + fileVersion));
        return;
    }
    c.reg[0] = qerrRo;
}

/** @param {State} state @param {Cpu} c @param {CpuBus} bus */
function extendedInfo(state, c, bus) {
    const address = c.reg[9] & 0xFFFFFF;
    if (address < cpu.qdosUserRamBase || address + 64 > bus.mem.length) {
        c.reg[0] = qerrBp;
        return;
    }
    bus.mem.fill(0xFF, address, address + 64);
    const mountLength = Math.min(state.name.length, 20);
    cpu.writePointerWord(bus.mem, address, mountLength);
    for (let i = 0; i < mountLength; i += 1) {
        bus.mem[address + 2 + i] = state.name.charCodeAt(i);
    }
    cpu.writePointerWord(bus.mem, address + 22, 3);
    bus.mem.set(Uint8Array.of(0x46, 0x4C, 0x50), address + 24);
    bus.mem[address + 28] = 1;
    bus.mem[address + 29] = 0;
    cpu.writePointerWord(bus.mem, address + 30, 512);
    cpu.writePointerLong(bus.mem, address + 32, state.totalSectors / 2);
    cpu.writePointerLong(bus.mem, address + 36, cpu.readPointerWord(state.image, freeSectorsOffset) / 2);
    cpu.writePointerLong(bus.mem, address + 40, fileHeaderSize);
}

/** @param {Uint8Array} bytes @param {number} offset @returns {string | null} */
function readQdosName(bytes, offset) {
    if (offset < 0 || offset + 2 > bytes.length) {
        return null;
    }
    const length = cpu.readPointerWord(bytes, offset);
    if (length > 36 || offset + 2 + length > bytes.length) {
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
    const length = Math.min(cpu.readPointerWord(bytes, header + qdosFileName), 36);
    let name = "";
    for (let i = 0; i < length; i += 1) {
        name += String.fromCharCode(bytes[header + qdosFileName + 2 + i]);
    }
    return name;
}

/** @param {number} value @returns {number} */
function signed8(value) {
    if ((value & 0x80) !== 0) {
        return value - 0x100;
    }
    return value;
}

/** @param {number} value @returns {number} */
function signed16(value) {
    if ((value & 0x8000) !== 0) {
        return value - 0x10000;
    }
    return value;
}
