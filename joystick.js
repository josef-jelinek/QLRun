// The QL joystick sockets are five plain switch contacts wired in parallel with
// keyboard keys, so a host gamepad is reduced to the same thing: a direction is
// closed past a deadzone or when the matching d-pad button is down, and every
// action button is the one fire contact. Each stick is a byte of closed
// contacts, one bit each, and keyboard.js turns them into QL keys.
export const up = 0x01;
export const down = 0x02;
export const left = 0x04;
export const right = 0x08;
export const fire = 0x10;

// Standard Gamepad mapping. A pad reporting some other mapping is read the same
// way, since its axes are usually still the left stick even when the button
// numbering is not the standard one.
const padUp = 12;
const padDown = 13;
const padLeft = 14;
const padRight = 15;
const padFireFirst = 0;
const padFireLast = 7;
const padAxisX = 0;
const padAxisY = 1;
// How far an analog stick travels before it counts as a closed contact.
const padDeadzone = 0.5;

/**
 * Read the host gamepads into the two contact bytes. The Gamepad API only hands
 * out snapshots, so this polls rather than listening, and the caller does it
 * once per animation frame. The first two connected pads become stick 1 and
 * stick 2 whichever slots they occupy, so one pad always drives stick 1.
 * `padIds` gets the browser's id of the pad on each stick, or "" for none.
 *
 * @param {Uint8Array} contacts
 * @param {string[]} padIds
 */
export function poll(contacts, padIds) {
    contacts[0] = 0;
    contacts[1] = 0;
    padIds[0] = "";
    padIds[1] = "";
    if (typeof navigator.getGamepads !== "function") {
        return;
    }
    const pads = navigator.getGamepads();
    let stick = 0;
    for (let i = 0; i < pads.length && stick < 2; i += 1) {
        const pad = pads[i];
        if (pad === null || !pad.connected) {
            continue;
        }
        contacts[stick] = padContacts(pad);
        padIds[stick] = pad.id;
        stick += 1;
    }
}

/**
 * A gamepad id short enough to show on a stick: without the mapping and
 * vendor details Chrome appends in parentheses, and without the hex vendor and
 * product prefix Firefox puts in front.
 *
 * @param {string} id
 * @returns {string}
 */
export function label(id) {
    const name = id
        .replace(/\s*\([^()]*(?:STANDARD GAMEPAD|Vendor:)[^()]*\)\s*$/i, "")
        .replace(/^[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, "")
        .trim();
    if (name === "") {
        return id;
    }
    return name;
}

/**
 * @param {Gamepad} pad
 * @returns {number}
 */
function padContacts(pad) {
    const axisX = padAxis(pad, padAxisX);
    const axisY = padAxis(pad, padAxisY);
    let bits = 0;
    if (axisY <= -padDeadzone || padPressed(pad, padUp)) {
        bits |= up;
    }
    if (axisY >= padDeadzone || padPressed(pad, padDown)) {
        bits |= down;
    }
    if (axisX <= -padDeadzone || padPressed(pad, padLeft)) {
        bits |= left;
    }
    if (axisX >= padDeadzone || padPressed(pad, padRight)) {
        bits |= right;
    }
    for (let b = padFireFirst; b <= padFireLast; b += 1) {
        if (padPressed(pad, b)) {
            bits |= fire;
            break;
        }
    }
    return bits;
}

/**
 * @param {Gamepad} pad
 * @param {number} index
 * @returns {boolean}
 */
function padPressed(pad, index) {
    if (index >= pad.buttons.length) {
        return false;
    }
    return pad.buttons[index].pressed;
}

/**
 * @param {Gamepad} pad
 * @param {number} index
 * @returns {number}
 */
function padAxis(pad, index) {
    if (index >= pad.axes.length) {
        return 0;
    }
    return pad.axes[index];
}
