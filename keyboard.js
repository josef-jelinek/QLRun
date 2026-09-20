/**
 * @typedef {{
 *   label: string,
 *   code: number,
 *   codes: string[],
 *   x: number,
 *   y: number,
 *   w: number,
 *   h: number,
 * }} OverlayKeySpec
 */

/**
 * @typedef {{
 *   el: HTMLElement,
 *   code: number,
 * }} OverlayKey
 */

/**
 * @typedef {{
 *   id: number,
 *   code: number,
 *   at: number,
 * }} PointerHold
 */

/**
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
 * @typedef {{
 *   keys: KeyState,
 *   hostHeld: string[],
 *   pointerHeld: PointerHold[],
 *   overlayKeys: OverlayKey[],
 *   pulses: KeyPulse[],
 *   pulseRaf: number,
 * }} Keyboard
 */

export const keyModAlt = 1;
export const keyModCtrl = 2;
export const keyModShift = 4;

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

const keyArtW = 768;
const keyArtH = 180;
const minPointerHoldMs = 50;
const maxQueuedKeys = 50;

/** @type {OverlayKeySpec[]} */
const overlayKeys = [
    {label: "F1", code: keyF1, codes: ["F1"], x: 8, y: 8, w: 40, h: 28},
    {label: "F2", code: keyF2, codes: ["F2"], x: 8, y: 42, w: 40, h: 28},
    {label: "F3", code: keyF3, codes: ["F3"], x: 8, y: 76, w: 40, h: 28},
    {label: "F4", code: keyF4, codes: ["F4"], x: 8, y: 110, w: 40, h: 28},
    {label: "F5", code: keyF5, codes: ["F5"], x: 8, y: 144, w: 40, h: 28},

    {label: "ESC", code: keyEscape, codes: ["Escape"], x: 64, y: 8, w: 40, h: 28},
    {label: "1", code: key1, codes: ["Digit1", "Numpad1"], x: 108, y: 8, w: 40, h: 28},
    {label: "2", code: key2, codes: ["Digit2", "Numpad2"], x: 152, y: 8, w: 40, h: 28},
    {label: "3", code: key3, codes: ["Digit3", "Numpad3"], x: 196, y: 8, w: 40, h: 28},
    {label: "4", code: key4, codes: ["Digit4", "Numpad4"], x: 240, y: 8, w: 40, h: 28},
    {label: "5", code: key5, codes: ["Digit5", "Numpad5"], x: 284, y: 8, w: 40, h: 28},
    {label: "6", code: key6, codes: ["Digit6", "Numpad6"], x: 328, y: 8, w: 40, h: 28},
    {label: "7", code: key7, codes: ["Digit7", "Numpad7"], x: 372, y: 8, w: 40, h: 28},
    {label: "8", code: key8, codes: ["Digit8", "Numpad8"], x: 416, y: 8, w: 40, h: 28},
    {label: "9", code: key9, codes: ["Digit9", "Numpad9"], x: 460, y: 8, w: 40, h: 28},
    {label: "0", code: key0, codes: ["Digit0", "Numpad0"], x: 504, y: 8, w: 40, h: 28},
    {label: "-", code: keyMinus, codes: ["Minus", "NumpadSubtract"], x: 548, y: 8, w: 40, h: 28},
    {label: "=", code: keyEqual, codes: ["Equal"], x: 592, y: 8, w: 40, h: 28},
    {label: "\u00A3", code: keyPound, codes: ["Backquote"], x: 636, y: 8, w: 40, h: 28},
    {label: "\\", code: keyBackslash, codes: ["Backslash"], x: 680, y: 8, w: 40, h: 28},

    {label: "TAB", code: keyTab, codes: ["Tab"], x: 64, y: 42, w: 62, h: 28},
    {label: "Q", code: letterQ, codes: ["KeyQ"], x: 130, y: 42, w: 40, h: 28},
    {label: "W", code: letterW, codes: ["KeyW"], x: 174, y: 42, w: 40, h: 28},
    {label: "E", code: letterE, codes: ["KeyE"], x: 218, y: 42, w: 40, h: 28},
    {label: "R", code: letterR, codes: ["KeyR"], x: 262, y: 42, w: 40, h: 28},
    {label: "T", code: letterT, codes: ["KeyT"], x: 306, y: 42, w: 40, h: 28},
    {label: "Y", code: letterY, codes: ["KeyY"], x: 350, y: 42, w: 40, h: 28},
    {label: "U", code: letterU, codes: ["KeyU"], x: 394, y: 42, w: 40, h: 28},
    {label: "I", code: letterI, codes: ["KeyI"], x: 438, y: 42, w: 40, h: 28},
    {label: "O", code: letterO, codes: ["KeyO"], x: 482, y: 42, w: 40, h: 28},
    {label: "P", code: letterP, codes: ["KeyP"], x: 526, y: 42, w: 40, h: 28},
    {label: "[", code: keyLBracket, codes: ["BracketLeft"], x: 570, y: 42, w: 40, h: 28},
    {label: "]", code: keyRBracket, codes: ["BracketRight"], x: 614, y: 42, w: 40, h: 28},

    {label: "CAPS", code: keyCapsLock, codes: ["CapsLock"], x: 64, y: 76, w: 73, h: 28},
    {label: "A", code: letterA, codes: ["KeyA"], x: 141, y: 76, w: 40, h: 28},
    {label: "S", code: letterS, codes: ["KeyS"], x: 185, y: 76, w: 40, h: 28},
    {label: "D", code: letterD, codes: ["KeyD"], x: 229, y: 76, w: 40, h: 28},
    {label: "F", code: letterF, codes: ["KeyF"], x: 273, y: 76, w: 40, h: 28},
    {label: "G", code: letterG, codes: ["KeyG"], x: 317, y: 76, w: 40, h: 28},
    {label: "H", code: letterH, codes: ["KeyH"], x: 361, y: 76, w: 40, h: 28},
    {label: "J", code: letterJ, codes: ["KeyJ"], x: 405, y: 76, w: 40, h: 28},
    {label: "K", code: letterK, codes: ["KeyK"], x: 449, y: 76, w: 40, h: 28},
    {label: "L", code: letterL, codes: ["KeyL"], x: 493, y: 76, w: 40, h: 28},
    {label: ";", code: keySemicolon, codes: ["Semicolon"], x: 537, y: 76, w: 40, h: 28},
    {label: "'", code: keyQuote, codes: ["Quote"], x: 581, y: 76, w: 40, h: 28},
    {label: "ENTER", code: keyEnter, codes: ["Enter", "NumpadEnter"], x: 625, y: 76, w: 73, h: 28},

    {label: "SHIFT", code: -1, codes: ["ShiftLeft"], x: 64, y: 110, w: 95, h: 28},
    {label: "Z", code: letterZ, codes: ["KeyZ"], x: 163, y: 110, w: 40, h: 28},
    {label: "X", code: letterX, codes: ["KeyX"], x: 207, y: 110, w: 40, h: 28},
    {label: "C", code: letterC, codes: ["KeyC"], x: 251, y: 110, w: 40, h: 28},
    {label: "V", code: letterV, codes: ["KeyV"], x: 295, y: 110, w: 40, h: 28},
    {label: "B", code: letterB, codes: ["KeyB"], x: 339, y: 110, w: 40, h: 28},
    {label: "N", code: letterN, codes: ["KeyN"], x: 383, y: 110, w: 40, h: 28},
    {label: "M", code: letterM, codes: ["KeyM"], x: 427, y: 110, w: 40, h: 28},
    {label: ",", code: keyComma, codes: ["Comma"], x: 471, y: 110, w: 40, h: 28},
    {label: ".", code: keyPeriod, codes: ["Period", "NumpadDecimal"], x: 515, y: 110, w: 40, h: 28},
    {label: "/", code: keySlash, codes: ["Slash", "NumpadDivide"], x: 559, y: 110, w: 40, h: 28},
    {label: "SHIFT", code: -1, codes: ["ShiftRight"], x: 603, y: 110, w: 95, h: 28},

    {label: "CTRL", code: -2, codes: ["ControlLeft", "ControlRight"], x: 64, y: 144, w: 73, h: 28},
    {label: "\u2190", code: keyLeft, codes: ["ArrowLeft"], x: 141, y: 144, w: 40, h: 28},
    {label: "\u2192", code: keyRight, codes: ["ArrowRight"], x: 185, y: 144, w: 40, h: 28},
    {label: "SPACE", code: keySpace, codes: ["Space"], x: 229, y: 144, w: 304, h: 28},
    {label: "\u2191", code: keyUp, codes: ["ArrowUp"], x: 537, y: 144, w: 40, h: 28},
    {label: "\u2193", code: keyDown, codes: ["ArrowDown"], x: 581, y: 144, w: 40, h: 28},
    {label: "ALT", code: -3, codes: ["AltLeft", "AltRight"], x: 625, y: 144, w: 73, h: 28},
];

/** @type {Object<string, number>} */
const hostCodes = {};
for (let i = 0; i < overlayKeys.length; i += 1) {
    const spec = overlayKeys[i];
    for (let c = 0; c < spec.codes.length; c += 1) {
        hostCodes[spec.codes[c]] = spec.code;
    }
}
hostCodes.Backspace = keyLeft;
hostCodes.Delete = keyRight;
hostCodes.Home = keyLeft;
hostCodes.End = keyRight;
hostCodes.PageUp = keyUp;
hostCodes.PageDown = keyDown;
hostCodes.NumpadAdd = keyEqual;
hostCodes.NumpadMultiply = key8;

/**
 * Extra QL modifiers forced by a host key, ORed with held Shift/Ctrl/Alt.
 *
 * @type {Object<string, number>}
 */
const hostForcedMods = {};
hostForcedMods.Backspace = keyModCtrl;
hostForcedMods.Delete = keyModCtrl;

/**
 * Bind host and pointer input to the QL matrix and onscreen keyboard.
 *
 * @param {HTMLElement} el
 * @param {KeyState} keys
 * @returns {Keyboard}
 */
export function init(el, keys) {
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
    window.addEventListener("pointerup", function (e) {
        releasePointerSoon(kbd, e.pointerId);
    }, true);
    window.addEventListener("pointercancel", function (e) {
        releasePointer(kbd, e.pointerId);
        syncKeys(kbd);
    }, true);
    const face = el.querySelector(".keyboard-face");
    if (face !== null) {
        for (let i = 0; i < overlayKeys.length; i += 1) {
            face.appendChild(makeHit(kbd, overlayKeys[i]));
        }
        setScale(el, 1);
    }
    syncKeys(kbd);
    return kbd;
}

/**
 * 1 is one image pixel per CSS pixel.
 *
 * @param {HTMLElement} el
 * @param {number} scale
 */
export function setScale(el, scale) {
    const face = el.querySelector(".keyboard-face");
    if (!(face instanceof HTMLElement)) {
        return;
    }
    let s = scale;
    if (s < 0.25) {
        s = 0.25;
    }
    if (s > 8) {
        s = 8;
    }
    face.style.width = (keyArtW * s) + "px";
}

/**
 * Set scale from a vertical drag of the bar above the keyboard.
 *
 * @param {HTMLElement} keyboardEl
 * @param {HTMLElement} splitEl
 * @param {number} clientY
 */
export function scaleFromY(keyboardEl, splitEl, clientY) {
    const parent = keyboardEl.parentElement;
    if (parent === null) {
        return;
    }
    const parentRect = parent.getBoundingClientRect();
    const splitRect = splitEl.getBoundingClientRect();
    const style = getComputedStyle(keyboardEl);
    const padTop = Number.parseFloat(style.paddingTop);
    const padBot = Number.parseFloat(style.paddingBottom);
    let padY = 0;
    if (Number.isFinite(padTop)) {
        padY += padTop;
    }
    if (Number.isFinite(padBot)) {
        padY += padBot;
    }
    const minRemain = 80;
    const minH = keyArtH * 0.25;
    let imgH = parentRect.bottom - clientY - splitRect.height - padY;
    const maxH = parentRect.height - minRemain - splitRect.height - padY;
    imgH = Math.min(Math.max(imgH, minH), Math.max(minH, maxH));
    setScale(keyboardEl, imgH / keyArtH);
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
 * @param {Keyboard} kbd
 * @param {OverlayKeySpec} spec
 * @returns {HTMLElement}
 */
function makeHit(kbd, spec) {
    const hit = document.createElement("div");
    hit.className = "keyboard-hit";
    hit.style.left = (spec.x * 100 / keyArtW) + "%";
    hit.style.top = (spec.y * 100 / keyArtH) + "%";
    hit.style.width = (spec.w * 100 / keyArtW) + "%";
    hit.style.height = (spec.h * 100 / keyArtH) + "%";
    hit.textContent = spec.label;
    kbd.overlayKeys.push({el: hit, code: spec.code});
    hit.oncontextmenu = function (e) {
        e.preventDefault();
    };
    hit.addEventListener("touchstart", function (e) {
        e.preventDefault();
    }, {passive: false});
    hit.addEventListener("touchend", function (e) {
        e.preventDefault();
    }, {passive: false});
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
    hit.onpointerup = function (e) {
        releasePointerSoon(kbd, e.pointerId);
    };
    hit.onpointercancel = function (e) {
        releasePointer(kbd, e.pointerId);
        syncKeys(kbd);
    };
    hit.onlostpointercapture = function (e) {
        releasePointerSoon(kbd, e.pointerId);
    };
    return hit;
}

/** @param {Keyboard} kbd */
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
 * Include a host key's QL code and any forced modifiers in the pressed set.
 *
 * @param {number[]} pressed
 * @param {string} hostCode
 */
function addHostHeld(pressed, hostCode) {
    addPressed(pressed, hostCodes[hostCode]);
    const extraMods = hostForcedMods[hostCode];
    if (extraMods === undefined) {
        return;
    }
    if ((extraMods & keyModShift) !== 0) {
        addPressed(pressed, -1);
    }
    if ((extraMods & keyModCtrl) !== 0) {
        addPressed(pressed, -2);
    }
    if ((extraMods & keyModAlt) !== 0) {
        addPressed(pressed, -3);
    }
}

/**
 * @param {KeyState} keys
 * @param {number[]} pressed
 */
function applyPressed(keys, pressed) {
    for (let i = 0; i < pressed.length; i += 1) {
        const code = pressed[i];
        switch (code) {
        case -1:
            keys.shift = true;
            continue;
        case -2:
            keys.ctrl = true;
            continue;
        case -3:
            keys.alt = true;
            continue;
        default:
            setMatrixBit(keys, code, true);
            break;
        }
    }
    if (keys.shift) {
        keys.rows[7] |= 1;
    }
    if (keys.ctrl) {
        keys.rows[7] |= 2;
    }
    if (keys.alt) {
        keys.rows[7] |= 4;
    }
}

/**
 * @param {KeyState} keys
 * @param {number} code
 * @param {boolean} down
 */
function setMatrixBit(keys, code, down) {
    if (code < 0 || code >= 64) {
        return;
    }
    const row = 7 - Math.floor(code / 8);
    const col = 1 << (code % 8);
    if (down) {
        keys.rows[row] |= col;
    } else {
        keys.rows[row] &= ~col;
    }
}

/**
 * Queue a newly pressed character key for the IPC read-keys command.
 *
 * @param {KeyState} keys
 * @param {number} code
 */
function queueKey(keys, code) {
    if (code < 0) {
        return;
    }
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
    if (qlCode !== undefined && qlCode >= 0) {
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
        applyPressed(kbd.keys, [code]);
        queueKey(kbd.keys, code);
    }
}

/**
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
 * @param {Keyboard} kbd
 * @param {number} id
 */
function releasePointer(kbd, id) {
    for (let i = 0; i < kbd.pointerHeld.length; i += 1) {
        if (kbd.pointerHeld[i].id === id) {
            kbd.pointerHeld.splice(i, 1);
            return;
        }
    }
}

/** @param {Keyboard} kbd */
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
 * @param {PointerEvent} e
 * @returns {boolean}
 */
function isContactPointer(e) {
    if (isCompatMouse(e)) {
        return false;
    }
    if (e.pointerType === "mouse") {
        if (e.buttons !== 0) {
            return true;
        }
        if (e.width > 1 || e.height > 1) {
            return true;
        }
        return false;
    }
    if (e.pointerType === "pen") {
        return e.buttons !== 0;
    }
    return true;
}

/**
 * @param {PointerEvent} e
 * @returns {boolean}
 */
function isCompatMouse(e) {
    if (e.pointerType !== "mouse") {
        return false;
    }
    return eventFromTouch(e);
}

/**
 * @param {Event} e
 * @returns {boolean}
 */
function eventFromTouch(e) {
    const rec = /** @type {{sourceCapabilities?: {firesTouchEvents: boolean} | null}} */ (e);
    const caps = rec.sourceCapabilities;
    if (caps === undefined || caps === null) {
        return false;
    }
    return caps.firesTouchEvents;
}
