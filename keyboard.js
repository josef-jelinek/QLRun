/**
 * One key of an onscreen keyboard row, `units` 1U keys wide. `legend` is the
 * shifted character printed above the label.
 *
 * @typedef {{
 *   label: string,
 *   code: number,
 *   codes: string[],
 *   units: number,
 *   legend?: string,
 * }} OverlayRowKey
 */

/**
 * A placed onscreen key, in board units. `className` marks the function keys
 * and the L-shaped ENTER.
 *
 * @typedef {{
 *   label: string,
 *   code: number,
 *   codes: string[],
 *   x: number,
 *   y: number,
 *   w: number,
 *   h: number,
 *   legend: string,
 *   className: string,
 * }} OverlayKeySpec
 */

/**
 * @typedef {{
 *   el: HTMLElement,
 *   code: number,
 * }} OverlayKey
 */

/**
 * A pointer holding an onscreen key since `at`, in `Date.now()` milliseconds.
 *
 * @typedef {{
 *   id: number,
 *   code: number,
 *   at: number,
 * }} PointerHold
 */

/**
 * A key kept pressed until `until`, in `Date.now()` milliseconds, so a quick
 * tap still reaches the QL.
 *
 * @typedef {{
 *   code: number,
 *   until: number,
 * }} KeyPulse
 */

/**
 * Shared with the machine: 8x8 IPC matrix plus a press queue for read-keys.
 *
 * @typedef {{
 *   rows: Uint8Array,
 *   shift: boolean,
 *   ctrl: boolean,
 *   alt: boolean,
 *   queue: {modifiers: number, code: number}[],
 * }} KeyState
 */

/**
 * Onscreen keyboard state: the host keys and pointers holding QL keys, the
 * rendered keys, and the pulses that keep quick taps pressed.
 *
 * @typedef {{
 *   keys: KeyState,
 *   hostHeld: string[],
 *   pointerHeld: PointerHold[],
 *   overlayKeys: OverlayKey[],
 *   pulses: KeyPulse[],
 *   pulseRaf: number,
 * }} Keyboard
 */

// Modifiers as they travel in the IPC read-keys reply.
const keyModAlt = 1;
const keyModCtrl = 2;
const keyModShift = 4;

// Overlay pseudo-codes for the modifiers, which have no matrix code of their
// own and are held in the same pressed set as the character keys.
const keyShift = -1;
const keyCtrl = -2;
const keyAlt = -3;

const letterA = 0x1C;
const letterB = 0x2C;
const letterC = 0x2B;
const letterD = 0x1E;
const letterE = 0x0C;
const letterF = 0x24;
const letterG = 0x26;
const letterH = 0x1A;
const letterI = 0x12;
const letterJ = 0x1F;
const letterK = 0x22;
const letterL = 0x18;
const letterM = 0x2E;
const letterN = 0x06;
const letterO = 0x17;
const letterP = 0x1D;
const letterQ = 0x0B;
const letterR = 0x14;
const letterS = 0x23;
const letterT = 0x0E;
const letterU = 0x0F;
const letterV = 0x04;
const letterW = 0x11;
const letterX = 0x03;
const letterY = 0x16;
const letterZ = 0x29;

const key0 = 0x0D;
const key1 = 0x1B;
const key2 = 0x09;
const key3 = 0x19;
const key4 = 0x3E;
const key5 = 0x3A;
const key6 = 0x0A;
const key7 = 0x3F;
const key8 = 0x08;
const key9 = 0x10;

const keyF1 = 0x39;
const keyF2 = 0x3B;
const keyF3 = 0x3C;
const keyF4 = 0x38;
const keyF5 = 0x3D;

const keyUp = 0x32;
const keyDown = 0x37;
const keyLeft = 0x31;
const keyRight = 0x34;

const keySpace = 0x36;
const keyTab = 0x13;
const keyEnter = 0x30;
const keyEscape = 0x33;
const keyCapsLock = 0x21;
const keyLBracket = 0x20;
const keyRBracket = 0x28;
const keySemicolon = 0x27;
const keyComma = 0x07;
const keyPeriod = 0x2A;
const keySlash = 0x05;
const keyBackslash = 0x35;
const keyQuote = 0x2F;
const keyPound = 0x2D;
const keyMinus = 0x15;
const keyEqual = 0x25;

// Onscreen keyboard in board units: 1U keys are 28 square with a 6 gap both
// ways, F1-F5 stand in their own column, and the main block starts at x 48.
// ENTER is a mirrored L whose upright fills the 1U left over at the end of
// the TAB row; the stylesheet draws the upright, so its box is the 1.75U foot.
const keyUnit = 28;
const keyGap = 6;
const keyPitch = keyUnit + keyGap;
const keyArtW = 560;
const keyArtH = 180;
const keyArtMargin = 8;
const mainBlockX = 48;
const minPointerHoldMs = 50;
const maxQueuedKeys = 50;

/** @type {OverlayRowKey[]} */
const functionKeys = [
    {label: "F1", code: keyF1, codes: ["F1"], units: 1},
    {label: "F2", code: keyF2, codes: ["F2"], units: 1},
    {label: "F3", code: keyF3, codes: ["F3"], units: 1},
    {label: "F4", code: keyF4, codes: ["F4"], units: 1},
    {label: "F5", code: keyF5, codes: ["F5"], units: 1},
];

/** @type {OverlayRowKey[][]} */
const overlayRows = [
    [
        {label: "ESC", code: keyEscape, codes: ["Escape"], units: 1, legend: "\u00A9"},
        {label: "1", code: key1, codes: ["Digit1", "Numpad1"], units: 1, legend: "!"},
        {label: "2", code: key2, codes: ["Digit2", "Numpad2"], units: 1, legend: "@"},
        {label: "3", code: key3, codes: ["Digit3", "Numpad3"], units: 1, legend: "#"},
        {label: "4", code: key4, codes: ["Digit4", "Numpad4"], units: 1, legend: "$"},
        {label: "5", code: key5, codes: ["Digit5", "Numpad5"], units: 1, legend: "%"},
        {label: "6", code: key6, codes: ["Digit6", "Numpad6"], units: 1, legend: "^"},
        {label: "7", code: key7, codes: ["Digit7", "Numpad7"], units: 1, legend: "&"},
        {label: "8", code: key8, codes: ["Digit8", "Numpad8"], units: 1, legend: "*"},
        {label: "9", code: key9, codes: ["Digit9", "Numpad9"], units: 1, legend: "("},
        {label: "0", code: key0, codes: ["Digit0", "Numpad0"], units: 1, legend: ")"},
        {label: "-", code: keyMinus, codes: ["Minus", "NumpadSubtract"], units: 1, legend: "_"},
        {label: "=", code: keyEqual, codes: ["Equal"], units: 1, legend: "+"},
        {label: "\u00A3", code: keyPound, codes: ["Backquote"], units: 1, legend: "~"},
        {label: "\\", code: keyBackslash, codes: ["Backslash"], units: 1, legend: "|"},
    ],
    [
        {label: "TAB", code: keyTab, codes: ["Tab"], units: 1.5},
        {label: "Q", code: letterQ, codes: ["KeyQ"], units: 1},
        {label: "W", code: letterW, codes: ["KeyW"], units: 1},
        {label: "E", code: letterE, codes: ["KeyE"], units: 1},
        {label: "R", code: letterR, codes: ["KeyR"], units: 1},
        {label: "T", code: letterT, codes: ["KeyT"], units: 1},
        {label: "Y", code: letterY, codes: ["KeyY"], units: 1},
        {label: "U", code: letterU, codes: ["KeyU"], units: 1},
        {label: "I", code: letterI, codes: ["KeyI"], units: 1},
        {label: "O", code: letterO, codes: ["KeyO"], units: 1},
        {label: "P", code: letterP, codes: ["KeyP"], units: 1},
        {label: "[", code: keyLBracket, codes: ["BracketLeft"], units: 1, legend: "{"},
        {label: "]", code: keyRBracket, codes: ["BracketRight"], units: 1, legend: "}"},
    ],
    [
        {label: "CAPS", code: keyCapsLock, codes: ["CapsLock"], units: 1.75},
        {label: "A", code: letterA, codes: ["KeyA"], units: 1},
        {label: "S", code: letterS, codes: ["KeyS"], units: 1},
        {label: "D", code: letterD, codes: ["KeyD"], units: 1},
        {label: "F", code: letterF, codes: ["KeyF"], units: 1},
        {label: "G", code: letterG, codes: ["KeyG"], units: 1},
        {label: "H", code: letterH, codes: ["KeyH"], units: 1},
        {label: "J", code: letterJ, codes: ["KeyJ"], units: 1},
        {label: "K", code: letterK, codes: ["KeyK"], units: 1},
        {label: "L", code: letterL, codes: ["KeyL"], units: 1},
        {label: ";", code: keySemicolon, codes: ["Semicolon"], units: 1, legend: ":"},
        {label: "'", code: keyQuote, codes: ["Quote"], units: 1, legend: "\""},
        {label: "ENTER", code: keyEnter, codes: ["Enter", "NumpadEnter"], units: 1.75},
    ],
    [
        {label: "SHIFT", code: keyShift, codes: ["ShiftLeft"], units: 2.25},
        {label: "Z", code: letterZ, codes: ["KeyZ"], units: 1},
        {label: "X", code: letterX, codes: ["KeyX"], units: 1},
        {label: "C", code: letterC, codes: ["KeyC"], units: 1},
        {label: "V", code: letterV, codes: ["KeyV"], units: 1},
        {label: "B", code: letterB, codes: ["KeyB"], units: 1},
        {label: "N", code: letterN, codes: ["KeyN"], units: 1},
        {label: "M", code: letterM, codes: ["KeyM"], units: 1},
        {label: ",", code: keyComma, codes: ["Comma"], units: 1, legend: "<"},
        {label: ".", code: keyPeriod, codes: ["Period", "NumpadDecimal"], units: 1, legend: ">"},
        {label: "/", code: keySlash, codes: ["Slash", "NumpadDivide"], units: 1, legend: "?"},
        {label: "SHIFT", code: keyShift, codes: ["ShiftRight"], units: 2.25},
    ],
    [
        {label: "CTRL", code: keyCtrl, codes: ["ControlLeft", "ControlRight"], units: 1.75},
        {label: "\u2190", code: keyLeft, codes: ["ArrowLeft"], units: 1},
        {label: "\u2192", code: keyRight, codes: ["ArrowRight"], units: 1},
        {label: "", code: keySpace, codes: ["Space"], units: 7},
        {label: "\u2191", code: keyUp, codes: ["ArrowUp"], units: 1},
        {label: "\u2193", code: keyDown, codes: ["ArrowDown"], units: 1},
        {label: "ALT", code: keyAlt, codes: ["AltLeft", "AltRight"], units: 1.75},
    ],
];

const overlayKeys = layoutOverlayKeys();

/**
 * Host key codes to QL matrix codes: every overlay key, plus host-only editing
 * keys mapped onto QL cursor combinations and keypad + and * mapped onto the
 * keys that carry them.
 *
 * @type {Object<string, number>}
 */
const hostCodes = {
    Backspace: keyLeft,
    Delete: keyRight,
    Home: keyLeft,
    End: keyRight,
    PageUp: keyUp,
    PageDown: keyDown,
    NumpadAdd: keyEqual,
    NumpadMultiply: key8,
};
for (let i = 0; i < overlayKeys.length; i += 1) {
    const spec = overlayKeys[i];
    for (let c = 0; c < spec.codes.length; c += 1) {
        hostCodes[spec.codes[c]] = spec.code;
    }
}

/**
 * QL modifier a host key holds along with its mapped key: Ctrl turns the
 * cursor keys into Backspace and Delete, and Shift gives keypad + and *.
 *
 * @type {Object<string, number>}
 */
const hostForcedMods = {Backspace: keyCtrl, Delete: keyCtrl, NumpadAdd: keyShift, NumpadMultiply: keyShift};

/**
 * Build the onscreen keyboard and bind its pointer input to the QL matrix.
 * Host key events reach the matrix through `handleKeyDown`, `handleKeyUp`,
 * and `handleBlur`.
 *
 * @param {HTMLElement} el
 * @param {KeyState} keys
 * @returns {Keyboard}
 */
export function init(el, keys) {
    /** @type {Keyboard} */
    const kbd = {
        keys,
        hostHeld: [],
        pointerHeld: [],
        overlayKeys: [],
        pulses: [],
        pulseRaf: 0,
    };
    el.oncontextmenu = function (e) {
        e.preventDefault();
    };
    window.addEventListener(
        "pointerup",
        function (e) {
            releasePointerSoon(kbd, e.pointerId);
        },
        true,
    );
    window.addEventListener(
        "pointercancel",
        function (e) {
            // Drop the hold at once, with no pulse.
            for (let i = 0; i < kbd.pointerHeld.length; i += 1) {
                if (kbd.pointerHeld[i].id === e.pointerId) {
                    kbd.pointerHeld.splice(i, 1);
                    syncKeys(kbd);
                    return;
                }
            }
        },
        true,
    );
    const face = el.querySelector(".keyboard-face");
    if (face !== null) {
        for (let i = 0; i < overlayKeys.length; i += 1) {
            face.appendChild(makeHit(kbd, overlayKeys[i]));
        }
    }
    return kbd;
}

/**
 * Rendered height of the keyboard face in CSS pixels.
 *
 * @param {HTMLElement} el
 * @returns {number}
 */
export function faceHeight(el) {
    const face = el.querySelector(".keyboard-face");
    if (!(face instanceof HTMLElement)) {
        return 0;
    }
    return face.getBoundingClientRect().height;
}

/**
 * Size the keyboard face to a height, between 45 CSS pixels and `maxHeight`.
 * The stylesheet still keeps it within the available width.
 *
 * @param {HTMLElement} el
 * @param {number} height
 * @param {number} maxHeight
 */
export function setFaceHeight(el, height, maxHeight) {
    const face = el.querySelector(".keyboard-face");
    if (!(face instanceof HTMLElement)) {
        return;
    }
    const minHeight = keyArtH * 0.25;
    const clamped = Math.min(Math.max(height, minHeight), Math.max(minHeight, maxHeight));
    face.style.width = (clamped * keyArtW / keyArtH) + "px";
}

/**
 * Press a mapped host key and queue its QL character code once.
 *
 * @param {Keyboard} kbd
 * @param {KeyboardEvent} e
 */
export function handleKeyDown(kbd, e) {
    if (hostCodes[e.code] === undefined) {
        return;
    }
    e.preventDefault();
    if (e.repeat) {
        return;
    }
    holdHost(kbd, e.code);
    syncKeys(kbd);
}

/**
 * Release a mapped host key and update the QL matrix.
 *
 * @param {Keyboard} kbd
 * @param {KeyboardEvent} e
 */
export function handleKeyUp(kbd, e) {
    if (hostCodes[e.code] === undefined) {
        return;
    }
    e.preventDefault();
    releaseHost(kbd, e.code);
    syncKeys(kbd);
}

/**
 * Release every host and pointer key when the browser loses focus.
 *
 * @param {Keyboard} kbd
 */
export function handleBlur(kbd) {
    kbd.hostHeld.length = 0;
    kbd.pointerHeld.length = 0;
    kbd.pulses.length = 0;
    for (let i = 0; i < kbd.overlayKeys.length; i += 1) {
        kbd.overlayKeys[i].el.classList.remove("hover");
    }
    if (kbd.pulseRaf !== 0) {
        cancelAnimationFrame(kbd.pulseRaf);
        kbd.pulseRaf = 0;
    }
    syncKeys(kbd);
}

/**
 * Create one onscreen key, placed in percent of the board, with its legends.
 * A left click holds the key until release, and a pointer in contact holds a
 * key it enters: a mouse with a button down, a touch, or a pen.
 *
 * @param {Keyboard} kbd
 * @param {OverlayKeySpec} spec
 * @returns {HTMLElement}
 */
function makeHit(kbd, spec) {
    const hit = document.createElement("div");
    hit.className = "keyboard-hit";
    if (spec.className !== "") {
        hit.classList.add(spec.className);
    }
    hit.style.left = (spec.x * 100 / keyArtW) + "%";
    hit.style.top = (spec.y * 100 / keyArtH) + "%";
    hit.style.width = (spec.w * 100 / keyArtW) + "%";
    hit.style.height = (spec.h * 100 / keyArtH) + "%";
    const legend = document.createElement("small");
    legend.textContent = spec.legend;
    const label = document.createElement("span");
    label.textContent = spec.label;
    hit.append(legend, label);
    kbd.overlayKeys.push({el: hit, code: spec.code});
    hit.addEventListener(
        "touchstart",
        function (e) {
            e.preventDefault();
        },
        {passive: false},
    );
    hit.addEventListener(
        "touchend",
        function (e) {
            e.preventDefault();
        },
        {passive: false},
    );
    hit.onpointerenter = function (e) {
        if (isCompatMouse(e)) {
            return;
        }
        if (isContactPointer(e)) {
            holdPointer(kbd, e.pointerId, spec.code);
            syncKeys(kbd);
            return;
        }
        if (e.pointerType === "mouse") {
            hit.classList.add("hover");
        }
    };
    hit.onpointerleave = function (e) {
        hit.classList.remove("hover");
        releasePointerSoon(kbd, e.pointerId);
    };
    hit.onpointerdown = function (e) {
        if (isCompatMouse(e)) {
            return;
        }
        if (e.pointerType === "mouse" && e.button !== 0) {
            return;
        }
        e.preventDefault();
        holdPointer(kbd, e.pointerId, spec.code);
        if (e.pointerType === "mouse") {
            hit.setPointerCapture(e.pointerId);
        }
        syncKeys(kbd);
    };
    return hit;
}

/**
 * Hold a host key and queue its QL code once, with any forced modifier
 * applied first.
 *
 * @param {Keyboard} kbd
 * @param {string} code
 */
function holdHost(kbd, code) {
    for (let i = 0; i < kbd.hostHeld.length; i += 1) {
        if (kbd.hostHeld[i] === code) {
            return;
        }
    }
    kbd.hostHeld.push(code);
    const qlCode = hostCodes[code];
    if (qlCode >= 0) {
        /** @type {number[]} */
        const pressed = [];
        addHostHeld(pressed, code);
        applyPressed(kbd.keys, pressed);
        queueKey(kbd.keys, qlCode);
    }
}

/**
 * @param {Keyboard} kbd
 * @param {string} code
 */
function releaseHost(kbd, code) {
    for (let i = 0; i < kbd.hostHeld.length; i += 1) {
        if (kbd.hostHeld[i] === code) {
            kbd.hostHeld.splice(i, 1);
            return;
        }
    }
}

/**
 * Hold an onscreen key for a pointer and queue its code. A pointer already
 * holding a key moves the hold without queueing again.
 *
 * @param {Keyboard} kbd
 * @param {number} id
 * @param {number} code
 */
function holdPointer(kbd, id, code) {
    for (let i = 0; i < kbd.pointerHeld.length; i += 1) {
        const p = kbd.pointerHeld[i];
        if (p.id === id) {
            p.code = code;
            p.at = Date.now();
            return;
        }
    }
    kbd.pointerHeld.push({id, code, at: Date.now()});
    if (code >= 0) {
        queueKey(kbd.keys, code);
    }
}

/**
 * Queue a newly pressed character key for the IPC read-keys command.
 *
 * @param {KeyState} keys
 * @param {number} code
 */
function queueKey(keys, code) {
    let modifiers = 0;
    if (keys.shift) {
        modifiers |= keyModShift;
    }
    if (keys.ctrl) {
        modifiers |= keyModCtrl;
    }
    if (keys.alt) {
        modifiers |= keyModAlt;
    }
    keys.queue.push({modifiers, code});
    if (keys.queue.length > maxQueuedKeys) {
        keys.queue.shift();
    }
}

/**
 * Release a pointer's key, keeping it pressed as a pulse until it has been
 * held for `minPointerHoldMs`, so the QL sees a quick tap.
 *
 * @param {Keyboard} kbd
 * @param {number} id
 */
function releasePointerSoon(kbd, id) {
    for (let i = 0; i < kbd.pointerHeld.length; i += 1) {
        const p = kbd.pointerHeld[i];
        if (p.id !== id) {
            continue;
        }
        const remain = minPointerHoldMs - (Date.now() - p.at);
        if (remain > 0) {
            kbd.pulses.push({code: p.code, until: Date.now() + remain});
            watchPulses(kbd);
        }
        kbd.pointerHeld.splice(i, 1);
        syncKeys(kbd);
        return;
    }
}

/**
 * Expire key pulses on animation frames until none remain.
 *
 * @param {Keyboard} kbd
 */
function watchPulses(kbd) {
    if (kbd.pulseRaf !== 0) {
        return;
    }
    kbd.pulseRaf = requestAnimationFrame(function tick() {
        kbd.pulseRaf = 0;
        const now = Date.now();
        let expired = 0;
        for (let i = kbd.pulses.length - 1; i >= 0; i -= 1) {
            if (kbd.pulses[i].until <= now) {
                kbd.pulses.splice(i, 1);
                expired += 1;
            }
        }
        if (expired !== 0) {
            syncKeys(kbd);
        }
        if (kbd.pulses.length !== 0) {
            kbd.pulseRaf = requestAnimationFrame(tick);
        }
    });
}

/**
 * Rebuild the matrix and modifiers from every host key, pointer, and pulse
 * holding a QL key. The overlay shows the held keys, without the pulses.
 *
 * @param {Keyboard} kbd
 */
function syncKeys(kbd) {
    const keys = kbd.keys;
    for (let i = 0; i < 8; i += 1) {
        keys.rows[i] = 0;
    }
    keys.shift = false;
    keys.ctrl = false;
    keys.alt = false;

    /** @type {number[]} */
    const pressed = [];
    for (let i = 0; i < kbd.hostHeld.length; i += 1) {
        addHostHeld(pressed, kbd.hostHeld[i]);
    }
    for (let i = 0; i < kbd.pointerHeld.length; i += 1) {
        addPressed(pressed, kbd.pointerHeld[i].code);
    }
    paintOverlay(kbd, pressed);
    for (let i = 0; i < kbd.pulses.length; i += 1) {
        addPressed(pressed, kbd.pulses[i].code);
    }
    applyPressed(keys, pressed);
}

/**
 * Include a host key's QL code and any forced modifier in the pressed set.
 *
 * @param {number[]} pressed
 * @param {string} hostCode
 */
function addHostHeld(pressed, hostCode) {
    addPressed(pressed, hostCodes[hostCode]);
    addPressed(pressed, hostForcedMods[hostCode]);
}

/**
 * @param {number[]} pressed
 * @param {number | undefined} code
 */
function addPressed(pressed, code) {
    if (code === undefined) {
        return;
    }
    for (let i = 0; i < pressed.length; i += 1) {
        if (pressed[i] === code) {
            return;
        }
    }
    pressed.push(code);
}

/**
 * Set the matrix bits and modifier flags for the pressed set. Row 7 holds the
 * modifiers in bits 0-2, which is also where the machine reads them.
 *
 * @param {KeyState} keys
 * @param {number[]} pressed
 */
function applyPressed(keys, pressed) {
    for (let i = 0; i < pressed.length; i += 1) {
        const code = pressed[i];
        switch (code) {
        case keyShift:
            keys.shift = true;
            keys.rows[7] |= 1;
            break;
        case keyCtrl:
            keys.ctrl = true;
            keys.rows[7] |= 2;
            break;
        case keyAlt:
            keys.alt = true;
            keys.rows[7] |= 4;
            break;
        default:
            // Matrix codes 0-63 count rows from the bottom, eight keys to a row.
            if (code >= 0 && code < 64) {
                keys.rows[7 - Math.floor(code / 8)] |= 1 << (code % 8);
            }
            break;
        }
    }
}

/**
 * @param {Keyboard} kbd
 * @param {number[]} pressed
 */
function paintOverlay(kbd, pressed) {
    for (let i = 0; i < kbd.overlayKeys.length; i += 1) {
        const k = kbd.overlayKeys[i];
        let on = false;
        for (let p = 0; p < pressed.length; p += 1) {
            if (pressed[p] === k.code) {
                on = true;
                break;
            }
        }
        if (on) {
            k.el.classList.add("on");
        } else {
            k.el.classList.remove("on");
        }
    }
}

/**
 * Whether a pointer entering a key presses it: a touch always, a pen in
 * contact, and a mouse with a button down or a touch-sized contact area.
 *
 * @param {PointerEvent} e
 * @returns {boolean}
 */
function isContactPointer(e) {
    switch (e.pointerType) {
    case "mouse":
        return e.buttons !== 0 || e.width > 1 || e.height > 1;
    case "pen":
        return e.buttons !== 0;
    default:
        return true;
    }
}

/**
 * A mouse event the browser made from a touch, which the touch handling
 * already covers.
 *
 * @param {PointerEvent} e
 * @returns {boolean}
 */
function isCompatMouse(e) {
    if (e.pointerType !== "mouse") {
        return false;
    }
    const rec = /** @type {{sourceCapabilities?: {firesTouchEvents: boolean} | null}} */ (e);
    const caps = rec.sourceCapabilities;
    return caps !== undefined && caps !== null && caps.firesTouchEvents;
}

/**
 * Place the F-key column and the main rows on the board, left to right.
 *
 * @returns {OverlayKeySpec[]}
 */
function layoutOverlayKeys() {
    /** @type {OverlayKeySpec[]} */
    const specs = [];
    for (let row = 0; row < overlayRows.length; row += 1) {
        const y = keyArtMargin + row * keyPitch;
        const fn = functionKeys[row];
        specs.push({
            label: fn.label,
            code: fn.code,
            codes: fn.codes,
            x: keyArtMargin,
            y,
            w: keySpan(fn.units),
            h: keyUnit,
            legend: "",
            className: "fn",
        });
        let x = mainBlockX;
        for (const key of overlayRows[row]) {
            const w = keySpan(key.units);
            let className = "";
            if (key.code === keyEnter) {
                className = "enter";
            }
            let legend = "";
            if (key.legend !== undefined) {
                legend = key.legend;
            }
            specs.push({label: key.label, code: key.code, codes: key.codes, x, y, w, h: keyUnit, legend, className});
            x += w + keyGap;
        }
    }
    return specs;
}

/**
 * Width of a key `units` 1U keys wide, including the gaps it spans.
 *
 * @param {number} units
 * @returns {number}
 */
function keySpan(units) {
    return units * keyUnit + (units - 1) * keyGap;
}
