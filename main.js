import * as boot from "./boot.js";
import * as io from "./io.js";
import * as keyboard from "./keyboard.js";
import * as load from "./load.js";
import * as machine from "./machine.js";
import * as media from "./media.js";
import * as screen from "./screen.js";
import * as sound from "./sound.js";

const statsWindowMs = 1000;
const carryFloorMs = -80;
const mdvActivityHoldMs = 50;

const ui = {
    pageHeader:       /** @type {HTMLElement} */       (document.getElementById("page-header")),
    initInfo:         /** @type {HTMLElement} */       (document.getElementById("init-info")),
    qsoundInfo:       /** @type {HTMLElement} */       (document.getElementById("qsound-info")),
    soundInfo:        /** @type {HTMLElement} */       (document.getElementById("sound-info")),
    startupFileInfo:  /** @type {HTMLElement} */       (document.getElementById("startup-file-info")),
    loadMdv:          /** @type {HTMLButtonElement} */ (document.getElementById("load-mdv")),
    fileMdv:          /** @type {HTMLInputElement} */  (document.getElementById("file-mdv")),
    ejectMdv:         /** @type {HTMLButtonElement} */ (document.getElementById("eject-mdv")),
    mdvInfo:          /** @type {HTMLElement} */       (document.getElementById("mdv-info")),
    loadRom:          /** @type {HTMLButtonElement} */ (document.getElementById("load-rom")),
    fileRom:          /** @type {HTMLInputElement} */  (document.getElementById("file-rom")),
    romInfo:          /** @type {HTMLElement} */       (document.getElementById("rom-info")),
    reset:            /** @type {HTMLButtonElement} */ (document.getElementById("reset")),
    screenSlot:       /** @type {HTMLElement} */       (document.getElementById("screen-slot")),
    screen:           /** @type {HTMLCanvasElement} */ (document.getElementById("screen")),
    keyboardSplit:    /** @type {HTMLElement} */       (document.getElementById("keyboard-split")),
    keyboard:         /** @type {HTMLElement} */       (document.getElementById("keyboard")),
    keyboardToggle:   /** @type {HTMLInputElement} */  (document.getElementById("keyboard-toggle")),
    crt:              /** @type {HTMLInputElement} */  (document.getElementById("crt")),
    qsound:           /** @type {HTMLInputElement} */  (document.getElementById("qsound")),
    stereo:           /** @type {HTMLInputElement} */  (document.getElementById("stereo")),
    ntsc:             /** @type {HTMLInputElement} */  (document.getElementById("ntsc")),
    fullscreenToggle: /** @type {HTMLButtonElement} */ (document.getElementById("fullscreen-toggle")),
};

const query = new URLSearchParams(window.location.search);
const configuredRomName = query.get("rom") ?? "";
const keys = {
    rows: new Uint8Array(8),
    shift: false,
    ctrl: false,
    alt: false,
    queue: [],
};
const ql = machine.create(keys);
const kbd = keyboard.init(ui.keyboard, keys);

/** @type {import("./screen.js").Gfx | null} */
let gfx = null;
/** @type {import("./sound.js").Sfx | null} */
let sfx = null;
/** @type {(function(): void) | null} */
let abortLoadRom = null;
/** @type {(function(): void) | null} */
let abortLoadStartupFile = null;
/** @type {string | null} */
let startupFileName = null;
/** @type {ArrayBuffer | null} */
let startupFileBytes = null;
let startupRomReady = false;
let defaultRomSelected = configuredRomName === "";
let lastNow = 0;
let carryMs = 0;
let framesRun = 0;
let statsAt = 0;
let statsCut = 0;
let statsGap = 0;
let mdvReadCount = 0;
let mdvWriteCount = 0;
let mdvActivityUntil = 0;
let mdvActivityState = "idle";
let keyboardVisible = false;
let screenOnly = false;
let screenOnlyFallback = false;

const ntscOn = (query.get("ntsc") ?? "") === "1";
ui.ntsc.checked = ntscOn;
machine.setNtsc(ql, ntscOn);
let frameMs = 1000 / machine.frameHz(ql);

applySwitchParamValue(ui.keyboardToggle, query.get("keyboard") ?? "");
applySwitchParamValue(ui.crt, query.get("crt") ?? "");
applySwitchParamValue(ui.qsound, query.get("qsound") ?? "");
applySwitchParamValue(ui.stereo, query.get("stereo") ?? "");
setKeyboardVisibility(ui.keyboardToggle.checked);

ui.reset.onclick = function () {
    resetSystem();
};

ui.keyboardToggle.onchange = function () {
    updateSwitchParam("keyboard", ui.keyboardToggle.checked);
    setKeyboardVisibility(ui.keyboardToggle.checked);
};

ui.crt.onchange = function () {
    updateSwitchParam("crt", ui.crt.checked);
    if (gfx !== null) {
        screen.setCrt(gfx, ui.crt.checked);
    }
};

ui.stereo.onchange = function () {
    updateSwitchParam("stereo", ui.stereo.checked);
    if (sfx !== null) {
        sound.setStereo(sfx, ui.stereo.checked);
    }
};

ui.qsound.onchange = function () {
    updateSwitchParam("qsound", ui.qsound.checked);
    machine.enableQsound(ql, ui.qsound.checked);
    resetSystem();
};

ui.ntsc.onchange = function () {
    updateSwitchParam("ntsc", ui.ntsc.checked);
    machine.setNtsc(ql, ui.ntsc.checked);
    resetSystem();
    syncFrameTiming();
    if (defaultRomSelected) {
        loadSystemRom();
    }
};

ui.fullscreenToggle.onclick = function () {
    toggleCanvasFullscreen();
};

ui.keyboardSplit.onpointerdown = function (/** @type {PointerEvent} */ e) {
    if (e.button !== 0) {
        return;
    }
    e.preventDefault();
    document.body.classList.add("keyboard-splitting");
    keyboard.scaleFromY(ui.keyboard, ui.keyboardSplit, e.clientY);
    resize();
    ui.keyboardSplit.setPointerCapture(e.pointerId);
};

ui.keyboardSplit.onpointermove = function (/** @type {PointerEvent} */ e) {
    if (!ui.keyboardSplit.hasPointerCapture(e.pointerId)) {
        return;
    }
    keyboard.scaleFromY(ui.keyboard, ui.keyboardSplit, e.clientY);
    resize();
};

ui.keyboardSplit.onpointerup = function (/** @type {PointerEvent} */ e) {
    endKeyboardSplit(e.pointerId);
};

ui.keyboardSplit.onpointercancel = function (/** @type {PointerEvent} */ e) {
    endKeyboardSplit(e.pointerId);
};

new ResizeObserver(function () {
    resize();
}).observe(ui.screenSlot);

document.onfullscreenchange = function () {
    setScreenOnly(document.fullscreenElement !== null || screenOnlyFallback);
};

window.onkeydown = function (e) {
    if (sfx !== null) {
        sound.resume(sfx);
    }
    if (e.code === "F11") {
        e.preventDefault();
        if (!e.repeat) {
            toggleCanvasFullscreen();
        }
        return;
    }
    keyboard.handleKeyDown(kbd, e);
};

window.onpointerdown = function () {
    if (sfx !== null) {
        sound.resume(sfx);
    }
};

window.onkeyup = function (e) {
    if (e.code === "F11") {
        e.preventDefault();
        return;
    }
    keyboard.handleKeyUp(kbd, e);
};

window.onblur = function () {
    keyboard.handleBlur(kbd);
};

ui.loadMdv.onclick = function () {
    ui.fileMdv.click();
};

ui.fileMdv.onchange = function () {
    const file = ui.fileMdv.files?.[0];
    ui.fileMdv.value = "";
    if (file === undefined) {
        return;
    }
    cancelStartupFile();
    io.readFile(file, "arraybuffer", function (err, buf) {
        if (err !== null) {
            showError(ui.mdvInfo, err);
            return;
        }
        if (!(buf instanceof ArrayBuffer)) {
            showError(ui.mdvInfo, "Empty read.");
            return;
        }
        const mdvErr = machine.insertMdv(ql, 0, buf, file.name);
        if (mdvErr !== null) {
            showError(ui.mdvInfo, mdvErr);
            return;
        }
        showInfo(ui.mdvInfo, file.name);
        showInfo(ui.startupFileInfo, "");
    });
};

ui.ejectMdv.onclick = function () {
    machine.ejectMdv(ql, 0);
    showInfo(ui.mdvInfo, "No cartridge.");
};

ui.loadRom.onclick = function () {
    ui.fileRom.click();
};

ui.fileRom.onchange = function () {
    if (abortLoadRom !== null) {
        abortLoadRom();
        abortLoadRom = null;
    }
    const file = ui.fileRom.files?.[0];
    ui.fileRom.value = "";
    if (file === undefined) {
        return;
    }
    io.readFile(file, "arraybuffer", function (err, buf) {
        if (err !== null) {
            showError(ui.romInfo, err);
            return;
        }
        if (!(buf instanceof ArrayBuffer)) {
            showError(ui.romInfo, "Empty read.");
            return;
        }
        const romErr = machine.setSysRom(ql, buf);
        if (romErr !== null) {
            showError(ui.romInfo, romErr);
            return;
        }
        defaultRomSelected = false;
        resetSystem();
        showInfo(ui.romInfo, file.name);
    });
};

boot.loadShaders(function (err, shaders) {
    if (err !== null) {
        showError(ui.initInfo, err);
        return;
    }
    if (shaders === null) {
        showError(ui.initInfo, "No shaders.");
        return;
    }
    screen.init(
        ui.screen,
        shaders,
        function (initErr, initializedGfx) {
            gfx = initializedGfx;
            if (initErr !== null) {
                showError(ui.initInfo, initErr);
                return;
            }
            if (initializedGfx === null) {
                showError(ui.initInfo, "No graphics context.");
                return;
            }
            screen.setCrt(initializedGfx, ui.crt.checked);
            showInfo(ui.initInfo, "Ready.");
        },
    );
});

sound.init(machine.frameHz(ql), function (err, initializedSfx) {
    if (err !== null) {
        showError(ui.soundInfo, "No sound: " + err);
        return;
    }
    if (initializedSfx === null) {
        showError(ui.soundInfo, "No sound.");
        return;
    }
    sfx = initializedSfx;
    sound.setNeedCallback(initializedSfx, fillSoundQueue);
    sound.setStereo(initializedSfx, ui.stereo.checked);
    machine.setSoundRate(ql, initializedSfx.context.sampleRate);
    sound.setStateCallback(initializedSfx, function (running) {
        machine.enableSound(ql, running);
    });
    machine.enableSound(ql, sound.isRunning(initializedSfx));
});

boot.loadQsoundRom(machine.qsoundRomSize, function (err, rom) {
    if (rom === null) {
        ui.qsound.checked = false;
        showError(ui.qsoundInfo, "QSound ROM unavailable.");
    } else {
        const romErr = machine.setQsoundRom(ql, rom);
        if (romErr !== null) {
            ui.qsound.checked = false;
            showError(ui.qsoundInfo, "QSound: " + romErr);
        } else {
            machine.enableQsound(ql, ui.qsound.checked);
            ui.qsound.disabled = false;
        }
    }
    if (err !== null) {
        console.error(err);
    }
    loadSystemRom();
});

const startupFileUrl = query.get("url") ?? "";
if (startupFileUrl !== "") {
    abortLoadStartupFile = load.fromUrl(
        startupFileUrl,
        function (err, name, bytes) {
            abortLoadStartupFile = null;
            if (err !== null) {
                showError(ui.startupFileInfo, err);
                return;
            }
            if (startupRomReady && name !== null && bytes !== null) {
                applyStartupFile(name, bytes);
                return;
            }
            startupFileName = name;
            startupFileBytes = bytes;
        },
    );
}

requestAnimationFrame(onFrame);

/** Fetch and install the selected system ROM after QSound configuration. */
function loadSystemRom() {
    if (abortLoadRom !== null) {
        abortLoadRom();
        abortLoadRom = null;
    }
    let romName = configuredRomName;
    if (romName === "") {
        romName = "js";
        if (ui.ntsc.checked) {
            romName = "jsu";
        }
    }
    abortLoadRom = boot.loadStartupRom(
        romName,
        machine.sysRomSize,
        function (err, name, rom) {
            abortLoadRom = null;
            startupRomReady = true;
            if (rom !== null) {
                const romErr = machine.setSysRom(ql, rom);
                if (romErr === null) {
                    resetSystem();
                    showInfo(ui.romInfo, name);
                } else {
                    showError(ui.romInfo, romErr);
                }
            } else if (err !== null) {
                showError(ui.romInfo, err);
            }
            if (startupFileName !== null && startupFileBytes !== null) {
                applyStartupFile(startupFileName, startupFileBytes);
            }
        },
    );
}

/**
 * Set informational text and clear its error presentation.
 *
 * @param {HTMLElement} el
 * @param {string} text
 */
function showInfo(el, text) {
    el.textContent = text;
    el.classList.remove("error");
}

/**
 * Set error text and apply its error presentation.
 *
 * @param {HTMLElement} el
 * @param {string} text
 */
function showError(el, text) {
    el.textContent = text;
    el.classList.add("error");
}

/**
 * Apply a valid URL switch value while leaving invalid values unchanged.
 *
 * @param {HTMLInputElement} input
 * @param {string} value
 */
function applySwitchParamValue(input, value) {
    switch (value) {
    case "0":
        input.checked = false;
        break;
    case "1":
        input.checked = true;
        break;
    }
}

/**
 * Keep a switch's explicit state in the shareable URL without adding history.
 *
 * @param {string} name
 * @param {boolean} on
 */
function updateSwitchParam(name, on) {
    let value = "0";
    if (on) {
        value = "1";
    }
    const url = new URL(window.location.href);
    url.searchParams.set(name, value);
    window.history.replaceState(null, "", url);
}

/** Reset machine and audio state, then resume available sound. */
function resetSystem() {
    if (sfx === null) {
        machine.reset(ql);
        return;
    }
    sound.reset(sfx);
    machine.reset(ql);
    sound.resume(sfx);
}

function cancelStartupFile() {
    if (abortLoadStartupFile !== null) {
        abortLoadStartupFile();
        abortLoadStartupFile = null;
    }
    startupFileName = null;
    startupFileBytes = null;
}

/**
 * Load a URL-supplied cartridge or ROM after any prerequisite ROM load.
 *
 * @param {string} name
 * @param {ArrayBuffer} bytes
 */
function applyStartupFile(name, bytes) {
    if (media.isMdvName(name)) {
        const mdvErr = machine.insertMdv(ql, 0, bytes, name);
        if (mdvErr !== null) {
            showError(ui.mdvInfo, mdvErr);
            return;
        }
        showInfo(ui.mdvInfo, name);
        return;
    }
    if (media.isRomName(name)) {
        const romErr = machine.setSysRom(ql, bytes);
        if (romErr !== null) {
            showError(ui.romInfo, romErr);
            return;
        }
        defaultRomSelected = false;
        resetSystem();
        showInfo(ui.romInfo, name);
        return;
    }
    showError(ui.startupFileInfo, "Unsupported startup file type: " + name + ".");
}

/** @param {boolean} visible */
function setKeyboardVisibility(visible) {
    keyboardVisible = visible;
    ui.keyboardToggle.checked = visible;
    applyVisibility();
}

function toggleCanvasFullscreen() {
    if (document.fullscreenElement !== null || screenOnlyFallback) {
        screenOnlyFallback = false;
        if (document.fullscreenElement !== null && document.exitFullscreen !== undefined) {
            exitFullscreen(function (err) {
                if (err !== null) {
                    setScreenOnly(false);
                }
            });
            return;
        }
        setScreenOnly(false);
        return;
    }

    const slot = ui.screen.parentElement;
    if (slot?.requestFullscreen === undefined) {
        screenOnlyFallback = true;
        setScreenOnly(true);
        return;
    }
    enterFullscreen(slot, function (err) {
        if (err !== null) {
            screenOnlyFallback = true;
            setScreenOnly(true);
        }
    });
}

/**
 * Adapt a browser fullscreen request to the callback convention.
 *
 * @param {HTMLElement} el
 * @param {function(string | null): void} onDone
 */
function enterFullscreen(el, onDone) {
    el.requestFullscreen().then(
        function () {
            onDone(null);
        },
        function () {
            onDone("Could not enter fullscreen.");
        },
    );
}

/**
 * Adapt a browser fullscreen exit to the callback convention.
 *
 * @param {function(string | null): void} onDone
 */
function exitFullscreen(onDone) {
    document.exitFullscreen().then(
        function () {
            onDone(null);
        },
        function () {
            onDone("Could not exit fullscreen.");
        },
    );
}

/** @param {boolean} on */
function setScreenOnly(on) {
    screenOnly = on;
    applyVisibility();
}

function applyVisibility() {
    let chromeDisplay = "";
    if (screenOnly) {
        chromeDisplay = "none";
    }
    let keyboardDisplay = "";
    if (screenOnly || !keyboardVisible) {
        keyboardDisplay = "none";
    }
    ui.pageHeader.style.display = chromeDisplay;
    ui.keyboardSplit.style.display = keyboardDisplay;
    ui.keyboard.style.display = keyboardDisplay;
    resize();
}

/** @param {number} pointerId */
function endKeyboardSplit(pointerId) {
    if (ui.keyboardSplit.hasPointerCapture(pointerId)) {
        ui.keyboardSplit.releasePointerCapture(pointerId);
    }
    document.body.classList.remove("keyboard-splitting");
}

function resize() {
    if (gfx !== null) {
        screen.resize(gfx);
    }
}

/** Follow the current PAL or US ZX8301 field rate. */
function syncFrameTiming() {
    const hz = machine.frameHz(ql);
    frameMs = 1000 / hz;
    if (sfx !== null) {
        sound.setFrameRate(sfx, hz);
    }
}

/** @param {number} now */
function onFrame(now) {
    requestAnimationFrame(onFrame);
    syncFrameTiming();
    if (lastNow === 0) {
        lastNow = now;
        carryMs = frameMs;
    }
    let dt = now - lastNow;
    lastNow = now;
    if (dt > 80) {
        dt = 80;
    }
    carryMs += dt;
    let ran = 0;
    while (carryMs >= frameMs && ran < 4) {
        const period = frameMs;
        stepMachine();
        syncFrameTiming();
        carryMs -= period;
        ran += 1;
    }
    if (ran < 4) {
        fillSoundQueue();
    }
    refreshMdvActivity(now);
    refreshSoundStatus(now);
    if (gfx !== null) {
        screen.draw(gfx, ql.pixels);
    }
}

function fillSoundQueue() {
    if (sfx === null || !sound.isRunning(sfx)) {
        return;
    }
    for (let ran = 0; ran < 4 && sound.wantsFrame(sfx); ran += 1) {
        const period = frameMs;
        stepMachine();
        syncFrameTiming();
        carryMs = Math.max(carryMs - period, carryFloorMs);
    }
}

/**
 * Keep brief transfers visible, then show the current motor state.
 *
 * @param {number} now
 */
function refreshMdvActivity(now) {
    const info = machine.mdvInfo(ql, 0);
    let state = mdvActivityState;
    if (info.writeCount !== mdvWriteCount) {
        state = "write";
        mdvActivityUntil = now + mdvActivityHoldMs;
    } else if (info.readCount !== mdvReadCount) {
        state = "read";
        mdvActivityUntil = now + mdvActivityHoldMs;
    } else if (now >= mdvActivityUntil) {
        state = "idle";
        if (info.motorOn) {
            state = "motor";
        }
    }
    mdvReadCount = info.readCount;
    mdvWriteCount = info.writeCount;
    if (state === mdvActivityState) {
        return;
    }
    ui.mdvInfo.classList.remove("mdv-motor", "mdv-read", "mdv-write");
    let title = "Microdrive 1 idle";
    switch (state) {
    case "motor":
        ui.mdvInfo.classList.add("mdv-motor");
        title = "Microdrive 1 motor running";
        break;
    case "read":
        ui.mdvInfo.classList.add("mdv-read");
        title = "Microdrive 1 reading";
        break;
    case "write":
        ui.mdvInfo.classList.add("mdv-write");
        title = "Microdrive 1 writing";
        break;
    default:
        break;
    }
    ui.mdvInfo.title = title;
    mdvActivityState = state;
}

/** @param {number} now */
function refreshSoundStatus(now) {
    if (sfx === null) {
        return;
    }
    if (statsAt === 0) {
        statsAt = now;
        framesRun = 0;
        return;
    }
    const span = now - statsAt;
    if (span < statsWindowMs) {
        return;
    }
    const stats = sound.stats(sfx);
    const fps = framesRun * 1000 / span;
    const cut = Math.round(stats.cut - statsCut);
    const gap = Math.round(stats.gap - statsGap);
    statsAt = now;
    framesRun = 0;
    statsCut = stats.cut;
    statsGap = stats.gap;
    showInfo(ui.soundInfo, fps.toFixed(1) + " fps, cut " + cut + " ms, gap " + gap + " ms");
}

function stepMachine() {
    machine.setVideoOn(ql, true);
    let hasSound = false;
    if (sfx !== null) {
        hasSound = sound.isRunning(sfx);
    }
    machine.enableSound(ql, hasSound);
    machine.runFrame(ql);
    framesRun += 1;
    const chunk = machine.takeAudio(ql);
    if (chunk.n > 0 && sfx !== null && (sound.isRunning(sfx) || sound.wantsFrame(sfx))) {
        sound.push(sfx, chunk);
    }
}
