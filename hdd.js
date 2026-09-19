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
const qdosPollMaskAddr = 0x28030;
const qdosPdbTableAddr = 0x28100;
const qdosMdvDriverLinkAddr = 0x28140;
const qdosDriverCloseEntryAddr = 0xC2;
const qdosMdvCloseEntryAddr = 0xD4;
const driverIoAddr = 0x1C000;
const driverOpenAddr = driverIoAddr + 2;
const driverCloseAddr = driverOpenAddr + 2;
const driverFormatAddr = driverCloseAddr + 4;
const romInitOpcode = 0xAAA0;
const driverIoOpcode = 0xAAA1;
const driverOpenOpcode = 0xAAA2;
const driverCloseOpcode = 0xAAA3;
const driverSlaveOpcode = 0xAAA4;
const driverFormatOpcode = 0xAAA5;
const originalRomInitOpcode = 0x0C93;
const guestCallShortLimit = 20000;
const guestCallMediumLimit = 200000;
const qdosHeapAllocCall = 0x18;
const qdosLinkFileDriverCall = 0x22;
const qdosFileLength = 0;
const qdosFileType = 5;
const qdosFileName = 14;
const qdosFileUpdate = 52;
const fileVersion = 0x38;
const fileIdOffset = 0x3A;
const fileBackupDate = 0x3C;
const directoryType = 0xFF;
const sectorsPerClusterOffset = 0x22;
const clusterCountOffset = 0x2A;
const freeClusterCountOffset = 0x2C;
const mapSectorCountOffset = 0x2E;
const firstFreeClusterOffset = 0x32;
const rootClusterOffset = 0x34;
const rootLengthOffset = 0x36;
const fatOffset = 0x40;
const updateCountOffset = 16;
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
const openShare = 1;
const openNew = 2;
const openOverwrite = 3;
const openDirectory = 4;
let handlersInstalled = false;

/**
 * @typedef {import("./cpu.js").Cpu} Cpu
 * @typedef {import("./cpu.js").CpuBus} CpuBus
 */

/**
 * Mutable single-drive QLWA state.
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
 *   modified: boolean,
 *   generation: number,
 *   romInitAddr: number,
 *   driverReady: boolean,
 *   channels: Map<number, Channel>,
 *   sectorsPerCluster: number,
 *   clusterCount: number,
 *   mapSectors: number,
 *   rootCluster: number,
 * }} State
 */

/**
 * Empty unmounted drive. Opcode handlers are installed once per page load.
 *
 * @returns {State}
 */
export function create() {
    installHandlers();
    return {
        image: new Uint8Array(0),
        name: "",
        inserted: false,
        modified: false,
        generation: 1,
        romInitAddr: -1,
        driverReady: false,
        channels: new Map(),
        sectorsPerCluster: 0,
        clusterCount: 0,
        mapSectors: 0,
        rootCluster: 0,
    };
}

/**
 * Find and patch the QDOS ROM initialization hook without rejecting unknown ROMs.
 *
 * @param {State} state
 * @param {Uint8Array} mem
 */
export function patchRom(state, mem) {
    state.romInitAddr = -1;
    state.driverReady = false;
    for (let addr = 0x4A00; addr + 6 <= 0xC000; addr += 2) {
        if (cpu.readPointerWord(mem, addr) === originalRomInitOpcode && cpu.readPointerWord(mem, addr + 2) === 0x4AFB) {
            state.romInitAddr = addr;
            break;
        }
    }
    if (state.romInitAddr < 0) {
        for (let addr = 0; addr + 6 <= 0xC000; addr += 2) {
            if (
                cpu.readPointerWord(mem, addr) === originalRomInitOpcode &&
                cpu.readPointerWord(mem, addr + 2) === 0x4AFB &&
                cpu.readPointerWord(mem, addr + 4) === 1
            ) {
                state.romInitAddr = addr;
                break;
            }
        }
    }
    prepareReset(state, mem);
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
    if (state.romInitAddr >= 0) {
        cpu.writePointerWord(mem, state.romInitAddr, romInitOpcode);
    }
    cpu.writePointerWord(mem, driverIoAddr, driverIoOpcode);
    cpu.writePointerWord(mem, driverOpenAddr, driverOpenOpcode);
    cpu.writePointerWord(mem, driverCloseAddr, driverCloseOpcode);
    cpu.writePointerWord(mem, driverCloseAddr + 2, driverSlaveOpcode);
    cpu.writePointerWord(mem, driverFormatAddr, driverFormatOpcode);
}

/**
 * Validate and insert a writable QLWA image.
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
    state.sectorsPerCluster = 0;
    state.clusterCount = 0;
    state.mapSectors = 0;
    state.rootCluster = 0;
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

function installHandlers() {
    if (handlersInstalled) {
        return;
    }
    handlersInstalled = true;
    cpu.setOpcode(romInitOpcode, romInit);
    cpu.setOpcode(driverIoOpcode, driverIo);
    cpu.setOpcode(driverOpenOpcode, driverOpen);
    cpu.setOpcode(driverCloseOpcode, driverClose);
    cpu.setOpcode(driverSlaveOpcode, returnFromDriver);
    cpu.setOpcode(driverFormatOpcode, driverFormat);
}

/** @param {Cpu} c @param {CpuBus} bus */
function romInit(c, bus) {
    const state = bus.hdd;
    if (state.romInitAddr < 0) {
        return;
    }
    cpu.writePointerWord(bus.mem, state.romInitAddr, originalRomInitOpcode);
    const saved = new Int32Array(c.reg);
    const savedPollMask = cpu.readPointerWord(bus.mem, qdosPollMaskAddr);
    cpu.writePointerWord(bus.mem, qdosPollMaskAddr, 0);
    const name = "WIN";
    const linkSize = 38;
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
    cpu.writePointerWord(bus.mem, qdosPollMaskAddr, savedPollMask);
    c.reg.set(saved);
    cpu.executeOpcode(c, bus, originalRomInitOpcode);
}

/** @param {Cpu} c @param {CpuBus} bus */
function driverOpen(c, bus) {
    const state = bus.hdd;
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
    if (name === "" && key === openShare) {
        key = openDirectory;
    }
    if (name === null || (key !== openDelete && (key < openShare || key > openDirectory))) {
        c.reg[0] = qerrBp;
        returnFromDriver(c, bus);
        return;
    }
    let file = findFile(state, name, key === openDirectory);
    if (key === openDelete) {
        c.reg[0] = deleteFile(state, file);
        returnFromDriver(c, bus);
        return;
    }
    if (file !== null && key === openNew) {
        c.reg[0] = qerrEx;
        returnFromDriver(c, bus);
        return;
    }
    if (file === null && key >= openNew && key !== openDirectory) {
        file = createFile(state, name, bus.readHwLongClock());
    }
    if (file === null) {
        c.reg[0] = qerrNf;
        returnFromDriver(c, bus);
        return;
    }
    const header = fileHeader(state, file);
    const isDirectory = file.file === state.rootCluster || (header !== null && state.image[header + qdosFileType] === directoryType);
    if (key === openDirectory && !isDirectory) {
        c.reg[0] = qerrNf;
        returnFromDriver(c, bus);
        return;
    }
    if (key === openOverwrite && !isDirectory) {
        truncateFile(state, file, fileHeaderSize);
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
    const state = bus.hdd;
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
    const state = bus.hdd;
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
            const one = Uint8Array.of(c.reg[1] & 0xFF);
            c.reg[0] = writeFileBytes(state, channel, one, 0, 1);
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

/** @param {Uint8Array} image @returns {string | null} */
function validateImage(image) {
    if (image.length < sectorSize || image.length % sectorSize !== 0) {
        return "Not a QLWA .win image (size must be a non-zero multiple of 512 bytes).";
    }
    if (image[0] !== 0x51 || image[1] !== 0x4C || image[2] !== 0x57 || image[3] !== 0x41) {
        return "Not a QLWA .win image (missing QLWA signature).";
    }
    const sectorsPerCluster = cpu.readPointerWord(image, sectorsPerClusterOffset);
    const clusterCount = cpu.readPointerWord(image, clusterCountOffset);
    const mapSectors = cpu.readPointerWord(image, mapSectorCountOffset);
    const rootCluster = cpu.readPointerWord(image, rootClusterOffset);
    const expectedBytes = sectorsPerCluster * clusterCount * sectorSize;
    if (
        sectorsPerCluster === 0 || clusterCount === 0 || mapSectors === 0 ||
        rootCluster >= clusterCount || expectedBytes > image.length ||
        fatOffset + clusterCount * 2 > mapSectors * sectorSize
    ) {
        return "Invalid or truncated QLWA disk geometry.";
    }
    return null;
}

/** @param {State} state */
function readGeometry(state) {
    state.sectorsPerCluster = cpu.readPointerWord(state.image, sectorsPerClusterOffset);
    state.clusterCount = cpu.readPointerWord(state.image, clusterCountOffset);
    state.mapSectors = cpu.readPointerWord(state.image, mapSectorCountOffset);
    state.rootCluster = cpu.readPointerWord(state.image, rootClusterOffset);
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
    const next = cpu.readPointerWord(state.image, fatOffset + cluster * 2);
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

/** @param {State} state @param {FileId} file @param {number} sector @returns {number} */
function fileSectorOffset(state, file, sector) {
    if (sector < 0) {
        return -1;
    }
    const group = Math.floor(sector / state.sectorsPerCluster);
    const cluster = walkChain(state, file.file, group);
    if (cluster < 0) {
        return -1;
    }
    return clusterSectorOffset(state, cluster, sector % state.sectorsPerCluster);
}

/** @param {State} state @param {FileId} file @returns {number | null} */
function fileHeader(state, file) {
    if (file.file === state.rootCluster) {
        return null;
    }
    const parent = {parent: 0, file: file.parent, entry: -1};
    const sector = Math.floor(file.entry / headersPerSector);
    const base = fileSectorOffset(state, parent, sector);
    if (base < 0) {
        return null;
    }
    return base + (file.entry % headersPerSector) * fileHeaderSize;
}

/** @param {State} state @param {FileId} file @returns {number} */
function storedFileLength(state, file) {
    if (file.file === state.rootCluster) {
        return cpu.readPointerLong(state.image, rootLengthOffset);
    }
    const header = fileHeader(state, file);
    if (header === null) {
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
    if (name === "") {
        if (directory) {
            return {parent: 0, file: state.rootCluster, entry: -1};
        }
        return null;
    }
    const root = {parent: 0, file: state.rootCluster, entry: -1};
    return findInDirectory(state, root, name.toUpperCase(), directory, new Set());
}

/** @param {State} state @param {FileId} directory @param {string} name @param {boolean} directoriesOnly @param {Set<number>} seen @returns {FileId | null} */
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
        const entryName = readHeaderName(state.image, header);
        const isDirectory = state.image[header + qdosFileType] === directoryType;
        const file = {
            parent: directory.file,
            file: cpu.readPointerWord(state.image, header + fileIdOffset),
            entry,
        };
        const foldedEntryName = entryName.toUpperCase();
        if (foldedEntryName === name && (!directoriesOnly || isDirectory)) {
            return file;
        }
        if (isDirectory && name.startsWith(foldedEntryName + "_")) {
            const found = findInDirectory(state, file, name, directoriesOnly, seen);
            if (found !== null) {
                return found;
            }
        }
    }
    return null;
}

/** @param {State} state @param {FileId} directory @param {number} entry @returns {number} */
function directoryHeader(state, directory, entry) {
    const base = fileSectorOffset(state, directory, Math.floor(entry / headersPerSector));
    if (base < 0) {
        return -1;
    }
    return base + entry % headersPerSector * fileHeaderSize;
}

/** @param {State} state @param {string} name @param {number} now @returns {FileId | null} */
function createFile(state, name, now) {
    const parent = findParentDirectory(state, name);
    if (parent === null) {
        return null;
    }
    const allocated = allocateCluster(state);
    if (allocated < 0) {
        return null;
    }
    let entries = Math.floor(storedFileLength(state, parent) / fileHeaderSize);
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
        entries = entry + 1;
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

/** @param {State} state @param {string} name @returns {FileId | null} */
function findParentDirectory(state, name) {
    let best = {parent: 0, file: state.rootCluster, entry: -1};
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
                file: cpu.readPointerWord(state.image, header + fileIdOffset),
                entry,
            };
            stack.push(file);
            if (name.toUpperCase().startsWith(dirName.toUpperCase() + "_") && dirName.length > bestLength) {
                best = file;
                bestLength = dirName.length;
            }
        }
    }
    return best;
}

/** @param {State} state @returns {number} */
function allocateCluster(state) {
    const freeCount = cpu.readPointerWord(state.image, freeClusterCountOffset);
    const cluster = cpu.readPointerWord(state.image, firstFreeClusterOffset);
    if (freeCount === 0 || cluster <= 0 || cluster >= state.clusterCount) {
        return -1;
    }
    const next = nextCluster(state, cluster);
    if (next < 0) {
        return -1;
    }
    cpu.writePointerWord(state.image, firstFreeClusterOffset, next);
    cpu.writePointerWord(state.image, freeClusterCountOffset, freeCount - 1);
    cpu.writePointerWord(state.image, fatOffset + cluster * 2, 0);
    markModified(state);
    return cluster;
}

/** @param {State} state @param {number} first */
function releaseChain(state, first) {
    if (first <= 0 || first >= state.clusterCount) {
        return;
    }
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
    cpu.writePointerWord(state.image, fatOffset + chain[chain.length - 1] * 2, cpu.readPointerWord(state.image, firstFreeClusterOffset));
    cpu.writePointerWord(state.image, firstFreeClusterOffset, chain[0]);
    cpu.writePointerWord(state.image, freeClusterCountOffset, Math.min(cpu.readPointerWord(state.image, freeClusterCountOffset) + chain.length, 0xFFFF));
    markModified(state);
}

/** @param {State} state @param {FileId | null} file @returns {number} */
function deleteFile(state, file) {
    if (file === null || file.file === state.rootCluster) {
        return qerrNf;
    }
    const header = fileHeader(state, file);
    if (header === null || state.image[header + qdosFileType] === directoryType) {
        return qerrIu;
    }
    releaseChain(state, file.file);
    state.image.fill(0, header, header + fileHeaderSize);
    markModified(state);
    return 0;
}

/** @param {State} state @param {FileId} file @param {number} byteLength @returns {boolean} */
function ensureFileCapacity(state, file, byteLength) {
    const neededClusters = Math.max(Math.ceil(byteLength / (state.sectorsPerCluster * sectorSize)), 1);
    let cluster = file.file;
    const seen = new Set();
    let count = 1;
    while (count < neededClusters) {
        if (seen.has(cluster)) {
            return false;
        }
        seen.add(cluster);
        const next = nextCluster(state, cluster);
        if (next === 0) {
            const allocated = allocateCluster(state);
            if (allocated < 0) {
                return false;
            }
            cpu.writePointerWord(state.image, fatOffset + cluster * 2, allocated);
            markModified(state);
            cluster = allocated;
        } else if (next < 0) {
            return false;
        } else {
            cluster = next;
        }
        count += 1;
    }
    return true;
}

/** @param {State} state @param {FileId} file @param {number} length */
function setStoredLength(state, file, length) {
    if (file.file === state.rootCluster) {
        cpu.writePointerLong(state.image, rootLengthOffset, length);
    } else {
        const header = fileHeader(state, file);
        if (header !== null) {
            cpu.writePointerLong(state.image, header, length);
        }
    }
    markModified(state);
}

/** @param {State} state @param {FileId} file @param {number} position @returns {number} */
function truncateFile(state, file, position) {
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
        cpu.writePointerWord(state.image, fatOffset + cluster * 2, 0);
        if (tail > 0) {
            releaseChain(state, tail);
        }
    }
    setStoredLength(state, file, Math.max(position, fileHeaderSize));
    return 0;
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

/** @param {State} state @param {Channel} channel @param {Uint8Array} source @param {number} sourceOffset @param {number} count @returns {number} */
function writeFileBytes(state, channel, source, sourceOffset, count) {
    if (channel.position > 0x7FFFFFFF - count || !ensureFileCapacity(state, channel.file, channel.position + count)) {
        return qerrDf;
    }
    for (let i = 0; i < count; i += 1) {
        const sector = Math.floor(channel.position / sectorSize);
        const base = fileSectorOffset(state, channel.file, sector);
        if (base < 0) {
            return qerrBm;
        }
        state.image[base + channel.position % sectorSize] = source[sourceOffset + i];
        channel.position += 1;
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

/** @param {State} state @param {Cpu} c @param {CpuBus} bus */
function mediumInfo(state, c, bus) {
    const address = c.reg[9] & 0xFFFFFF;
    if (address < cpu.qdosUserRamBase || address + 10 > bus.mem.length) {
        c.reg[0] = qerrBp;
        return;
    }
    const freeSectors = cpu.readPointerWord(state.image, freeClusterCountOffset) * state.sectorsPerCluster;
    const totalSectors = state.clusterCount * state.sectorsPerCluster;
    c.reg[1] = ((freeSectors & 0xFFFF) << 16) | (totalSectors & 0xFFFF);
    bus.mem.set(state.image.subarray(10, 20), address);
    c.reg[9] = address + 10;
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

/** @param {State} state @param {Channel} channel @param {Cpu} c @param {CpuBus} bus */
function setFileHeader(state, channel, c, bus) {
    if (!channelWritable(channel)) {
        c.reg[0] = qerrRo;
        return;
    }
    const header = fileHeader(state, channel.file);
    const address = c.reg[9] & 0xFFFFFF;
    if (header === null || address < cpu.qdosUserRamBase || address + 14 > bus.mem.length) {
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
    if (header === null) {
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
    bus.mem.fill(0xFF, address, address + 64);
    const mountLength = Math.min(state.name.length, 20);
    cpu.writePointerWord(bus.mem, address, mountLength);
    for (let i = 0; i < mountLength; i += 1) {
        bus.mem[address + 2 + i] = state.name.charCodeAt(i);
    }
    cpu.writePointerWord(bus.mem, address + 22, 3);
    bus.mem.set(Uint8Array.of(0x57, 0x49, 0x4E), address + 24);
    bus.mem[address + 28] = 1;
    bus.mem[address + 29] = 0;
    cpu.writePointerWord(bus.mem, address + 30, 1024);
    cpu.writePointerLong(bus.mem, address + 32, state.clusterCount * state.sectorsPerCluster / 2);
    cpu.writePointerLong(bus.mem, address + 36, cpu.readPointerWord(state.image, freeClusterCountOffset) * state.sectorsPerCluster / 2);
    cpu.writePointerLong(bus.mem, address + 40, fileHeaderSize);
}

/** @param {State} state */
function markModified(state) {
    state.modified = true;
    cpu.writePointerLong(state.image, updateCountOffset, (cpu.readPointerLong(state.image, updateCountOffset) + 1) >>> 0);
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

/** @param {Uint8Array} bytes @param {number} header @param {string} name */
function writeHeaderName(bytes, header, name) {
    const length = Math.min(name.length, 36);
    cpu.writePointerWord(bytes, header + qdosFileName, length);
    for (let i = 0; i < length; i += 1) {
        bytes[header + qdosFileName + 2 + i] = name.charCodeAt(i);
    }
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
