import * as cpu from "./cpu.js";

// Pointer Environment linkage fields follow the SMSQ/E `keys/con` names, which
// ptr_gen 2.x shares. Offsets are from the block that `sys_clnk` points to.
const sysChannelTableOffset = 0x78;
const sysPointerLinkageOffset = 0xC4;
const channelDriverOffset = 4;
const linkageIodOffset = 0x18;
const linkageSize = 0x130;
const xicntOffset = 0x2E;
const nposOffset = 0x38;
const wakeOffset = 0x4C;
const schfgOffset = 0x52;
const lstufOffset = 0x8C;
const offscrOffset = 0x8F;
const bpollOffset = 0xAF;
const identOffset = 0x128;
const pointerIdent = 0x50545232;
const buttonMask = 0x03;
const bothButtons = 0x03;
const minHoldFrames = 3;
const maxQueuedButtons = 4;

/**
 * Host pointer state for the QL Pointer Environment. `x`/`y` are the host
 * position in guest pixels and `lastX`/`lastY` the one last written. Button
 * levels (1 left, 2 right) wait in `queuedButtons` so each lasts at least
 * three frames: the PE samples buttons once per frame and needs two to
 * release. `armed` stays false after a reset until detection has failed once,
 * so a stale linkage left in RAM is never written.
 *
 * @typedef {{
 *   x: number,
 *   y: number,
 *   lastX: number,
 *   lastY: number,
 *   positioned: boolean,
 *   moved: boolean,
 *   buttons: number,
 *   queuedButtons: number[],
 *   heldFrames: number,
 *   buttonsDirty: boolean,
 *   armed: boolean,
 * }} State
 */

/** @returns {State} */
export function create() {
    return {
        x: 0,
        y: 0,
        lastX: 0,
        lastY: 0,
        positioned: false,
        moved: false,
        buttons: 0,
        queuedButtons: [],
        heldFrames: minHoldFrames,
        buttonsDirty: false,
        armed: false,
    };
}

/**
 * Wait for the reset guest to drop its old linkage, then resend the host state.
 *
 * @param {State} p
 */
export function reset(p) {
    p.armed = false;
    p.moved = p.positioned;
    p.buttonsDirty = p.buttons !== 0;
}

/**
 * Place the pointer at guest pixel `x` (0-511), `y` (0-255).
 *
 * @param {State} p
 * @param {number} x
 * @param {number} y
 */
export function move(p, x, y) {
    if (p.positioned && x === p.x && y === p.y) {
        return;
    }
    p.x = x;
    p.y = y;
    p.positioned = true;
    p.moved = true;
}

/**
 * Set the host buttons: bit 0 left (HIT), bit 1 right (DO). Both together keep
 * the previous level, as the PE has no both-button level.
 *
 * @param {State} p
 * @param {number} mask
 */
export function setButtons(p, mask) {
    const n = p.queuedButtons.length;
    let last = p.buttons;
    if (n > 0) {
        last = p.queuedButtons[n - 1];
    }
    let level = mask & buttonMask;
    if (level === bothButtons) {
        level = last;
    }
    if (level === last) {
        return;
    }
    if (n === maxQueuedButtons) {
        p.queuedButtons[n - 1] = level;
        return;
    }
    p.queuedButtons.push(level);
}

/**
 * Write pending host pointer changes into a detected PE linkage. Called once
 * per field before the CPU runs, so the PE scheduler sees at most one button
 * level per frame tick. Moves raise the interrupt count as QPC's driver does,
 * which also wakes a pointer suppressed while a job reads keys. `sysvars` is
 * the base of the QDOS system variables.
 *
 * @param {State} p
 * @param {import("./cpu.js").CpuBus} bus
 * @param {number} sysvars
 */
export function update(p, bus, sysvars) {
    const mem = bus.mem;
    const linkage = findLinkage(mem, bus.guestRamTop, sysvars);
    if (linkage === 0) {
        p.armed = true;
        const n = p.queuedButtons.length;
        if (n > 0) {
            p.buttons = p.queuedButtons[n - 1];
            p.queuedButtons.length = 0;
            p.buttonsDirty = true;
        }
        return;
    }
    if (!p.armed) {
        return;
    }
    p.heldFrames = Math.min(p.heldFrames + 1, minHoldFrames);
    if (p.heldFrames >= minHoldFrames) {
        const next = p.queuedButtons.shift();
        if (next !== undefined) {
            p.buttons = next;
            p.heldFrames = 0;
            p.buttonsDirty = true;
        }
    }
    if (!p.moved && !p.buttonsDirty) {
        return;
    }
    bus.beforeMemoryWrite(linkage + xicntOffset, bpollOffset - xicntOffset + 1);
    if (p.moved) {
        const distance = Math.abs(p.x - p.lastX) + Math.abs(p.y - p.lastY);
        const count = cpu.readPointerWord(mem, linkage + xicntOffset);
        const wake = mem[linkage + wakeOffset];
        const wakeCount = ((((distance + count) >> 1) + wake) >> 1) + 1;
        cpu.writePointerWord(mem, linkage + xicntOffset, wakeCount & 0xFFFF);
        cpu.writePointerWord(mem, linkage + nposOffset, p.x);
        cpu.writePointerWord(mem, linkage + nposOffset + 2, p.y);
        mem[linkage + offscrOffset] = 0;
        p.lastX = p.x;
        p.lastY = p.y;
        p.moved = false;
    }
    if (p.buttonsDirty) {
        mem[linkage + bpollOffset] = p.buttons;
        mem[linkage + lstufOffset] = 0;
        p.buttonsDirty = false;
    }
    mem[linkage + schfgOffset] = 0;
}

/**
 * Return the PE linkage when QDOS system variables name a `PTR2` linkage that
 * also drives console channel 0, or 0 when there is none to write.
 *
 * @param {Uint8Array} mem
 * @param {number} ramTop
 * @param {number} sysvars
 * @returns {number}
 */
function findLinkage(mem, ramTop, sysvars) {
    if (cpu.readPointerLong(mem, sysvars) !== cpu.qdosSysvarIdent) {
        return 0;
    }
    const linkage = cpu.readPointerLong(mem, sysvars + sysPointerLinkageOffset);
    if ((linkage & 1) !== 0 || linkage < sysvars || linkage + linkageSize > ramTop) {
        return 0;
    }
    if (cpu.readPointerLong(mem, linkage + identOffset) !== pointerIdent) {
        return 0;
    }
    const table = cpu.readPointerLong(mem, sysvars + sysChannelTableOffset);
    if (table < sysvars || table + 4 > ramTop) {
        return 0;
    }
    const channel = cpu.readPointerLong(mem, table);
    if (channel < sysvars || channel + channelDriverOffset + 4 > ramTop) {
        return 0;
    }
    if (cpu.readPointerLong(mem, channel + channelDriverOffset) !== linkage + linkageIodOffset) {
        return 0;
    }
    return linkage;
}
