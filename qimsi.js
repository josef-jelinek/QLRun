// The QIMSI registers sit in the ROM port, which has no write strobe, so every
// register is a read. Only the mouse is emulated; its PS/2 side reports an
// IntelliMouse in stream mode, as QIMSI firmware leaves it after power-up.
export const registerBase = 0xFED0;
export const registerEnd = 0xFEE0;

const mouseCodeAddr = 0xFEDD;
const mouseUnlockAddr = 0xFEDE;
const mouseStatusAddr = 0xFEDF;
const statusReceived = 0x01;
const statusWheel = 0x10;
const packetAlwaysSet = 0x08;
const packetXSign = 0x10;
const packetYSign = 0x20;
const packetLength = 4;
const buttonMask = 0x07;
const ps2ClockHz = 12000;
const ps2FrameBits = 11;
const sampleHz = 100;
const maxPacketMove = 127;
const maxPendingMove = 255;
const minWheel = -8;
const maxWheel = 7;
const maxQueuedButtons = 4;

/**
 * One PS/2 byte is latched for the QL at a time. `pos` indexes the next byte
 * of `packet`, which becomes readable at CPU cycle `readyAt`; the mouse sends
 * it one PS/2 frame after the previous unlock. `code` keeps the last byte
 * received. Host motion accumulates in `dx`/`dy` (screen direction, +y down)
 * and `dz` until a packet is sampled no earlier than `sampleAt`. `buttons` is
 * the host state and `queuedButtons` holds changes not yet reported, so a
 * click shorter than one sample still produces a press and a release.
 *
 * @typedef {{
 *   byteCycles: number,
 *   sampleCycles: number,
 *   packet: Uint8Array,
 *   pos: number,
 *   len: number,
 *   code: number,
 *   readyAt: number,
 *   sampleAt: number,
 *   dx: number,
 *   dy: number,
 *   dz: number,
 *   buttons: number,
 *   reportedButtons: number,
 *   queuedButtons: number[],
 * }} State
 */

/** @returns {State} */
export function create() {
    /** @type {State} */
    const q = {
        byteCycles: 0,
        sampleCycles: 0,
        packet: new Uint8Array(packetLength),
        pos: 0,
        len: 0,
        code: 0,
        readyAt: 0,
        sampleAt: 0,
        dx: 0,
        dy: 0,
        dz: 0,
        buttons: 0,
        reportedButtons: 0,
        queuedButtons: [],
    };
    return q;
}

/**
 * Drop latched data and pending motion, restarting timing at CPU cycle 0.
 * A host button still held is reported again with the next packet.
 *
 * @param {State} q
 * @param {number} clockHz
 */
export function reset(q, clockHz) {
    q.byteCycles = Math.round(clockHz * ps2FrameBits / ps2ClockHz);
    q.sampleCycles = Math.round(clockHz / sampleHz);
    q.packet.fill(0);
    q.pos = 0;
    q.len = 0;
    q.code = 0;
    q.readyAt = 0;
    q.sampleAt = 0;
    q.dx = 0;
    q.dy = 0;
    q.dz = 0;
    q.reportedButtons = 0;
    q.queuedButtons.length = 0;
    if (q.buttons !== 0) {
        q.queuedButtons.push(q.buttons);
    }
}

/**
 * Read one register byte at CPU cycle `now`. Reading `MOUSE_UNLOCK` releases
 * the latched byte; the other registers in the block read as idle.
 *
 * @param {State} q
 * @param {number} addr
 * @param {number} now
 * @returns {number}
 */
export function read(q, addr, now) {
    if (q.pos >= q.len && now >= q.sampleAt) {
        samplePacket(q, now);
    }
    const ready = q.pos < q.len && now >= q.readyAt;
    switch (addr) {
    case mouseCodeAddr:
        if (ready) {
            q.code = q.packet[q.pos];
        }
        return q.code;
    case mouseUnlockAddr:
        if (ready) {
            q.code = q.packet[q.pos];
            q.pos += 1;
            q.readyAt = now + q.byteCycles;
        }
        return 0;
    case mouseStatusAddr:
        if (ready) {
            return statusWheel | statusReceived;
        }
        return statusWheel;
    default:
        return 0;
    }
}

/**
 * Add host motion in mouse counts, with +dy pointing down the screen.
 * The totals saturate like PS/2 counters while the QL is not reading.
 *
 * @param {State} q
 * @param {number} dx
 * @param {number} dy
 */
export function move(q, dx, dy) {
    q.dx = Math.min(Math.max(q.dx + dx, -maxPendingMove), maxPendingMove);
    q.dy = Math.min(Math.max(q.dy + dy, -maxPendingMove), maxPendingMove);
}

/**
 * Add whole wheel steps, positive towards the user.
 *
 * @param {State} q
 * @param {number} dz
 */
export function scroll(q, dz) {
    q.dz = Math.min(Math.max(q.dz + dz, minWheel), maxWheel);
}

/**
 * Set the host buttons: bit 0 left, bit 1 right, bit 2 middle.
 *
 * @param {State} q
 * @param {number} mask
 */
export function setButtons(q, mask) {
    const buttons = mask & buttonMask;
    q.buttons = buttons;
    const n = q.queuedButtons.length;
    let last = q.reportedButtons;
    if (n > 0) {
        last = q.queuedButtons[n - 1];
    }
    if (buttons === last) {
        return;
    }
    if (n === maxQueuedButtons) {
        q.queuedButtons[n - 1] = buttons;
        return;
    }
    q.queuedButtons.push(buttons);
}

/**
 * Latch the next stream packet when there is motion or a button change.
 * Movement is limited to 8-bit values so readers ignoring the sign bits agree.
 *
 * @param {State} q
 * @param {number} now
 */
function samplePacket(q, now) {
    const dx = Math.trunc(q.dx);
    const dy = -Math.trunc(q.dy);
    if (dx === 0 && dy === 0 && q.dz === 0 && q.queuedButtons.length === 0) {
        return;
    }
    let buttons = q.reportedButtons;
    const queued = q.queuedButtons.shift();
    if (queued !== undefined) {
        buttons = queued;
    }
    const moveX = Math.min(Math.max(dx, -maxPacketMove), maxPacketMove);
    const moveY = Math.min(Math.max(dy, -maxPacketMove), maxPacketMove);
    const moveZ = q.dz;
    q.dx -= moveX;
    q.dy += moveY;
    q.dz = 0;
    let head = packetAlwaysSet | buttons;
    if (moveX < 0) {
        head |= packetXSign;
    }
    if (moveY < 0) {
        head |= packetYSign;
    }
    q.packet[0] = head;
    q.packet[1] = moveX & 0xFF;
    q.packet[2] = moveY & 0xFF;
    q.packet[3] = moveZ & 0xFF;
    q.reportedButtons = buttons;
    q.pos = 0;
    q.len = packetLength;
    q.sampleAt = now + q.sampleCycles;
}
