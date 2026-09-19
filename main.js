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
const turboMultiplier = 4;

const ui = {
    pageHeader:       /** @type {HTMLElement} */       (document.getElementById("page-header")),
    initInfo:         /** @type {HTMLElement} */       (document.getElementById("init-info")),
    qsoundInfo:       /** @type {HTMLElement} */       (document.getElementById("qsound-info")),
    soundInfo:        /** @type {HTMLElement} */       (document.getElementById("sound-info")),
    startupFileInfo:  /** @type {HTMLElement} */       (document.getElementById("startup-file-info")),
    mdv: [
        {
            newMdv:   /** @type {HTMLButtonElement} */ (document.getElementById("new-mdv1")),
            load:     /** @type {HTMLButtonElement} */ (document.getElementById("load-mdv1")),
            file:     /** @type {HTMLInputElement} */  (document.getElementById("file-mdv1")),
            download: /** @type {HTMLButtonElement} */ (document.getElementById("download-mdv1")),
            eject:    /** @type {HTMLButtonElement} */ (document.getElementById("eject-mdv1")),
            info:     /** @type {HTMLElement} */       (document.getElementById("mdv1-info")),
        },
        {
            newMdv:   /** @type {HTMLButtonElement} */ (document.getElementById("new-mdv2")),
            load:     /** @type {HTMLButtonElement} */ (document.getElementById("load-mdv2")),
            file:     /** @type {HTMLInputElement} */  (document.getElementById("file-mdv2")),
            download: /** @type {HTMLButtonElement} */ (document.getElementById("download-mdv2")),
            eject:    /** @type {HTMLButtonElement} */ (document.getElementById("eject-mdv2")),
            info:     /** @type {HTMLElement} */       (document.getElementById("mdv2-info")),
        },
    ],
    loadRom:          /** @type {HTMLButtonElement} */ (document.getElementById("load-rom")),
    fileRom:          /** @type {HTMLInputElement} */  (document.getElementById("file-rom")),
    romInfo:          /** @type {HTMLElement} */       (document.getElementById("rom-info")),
    loadRomCartridge: /** @type {HTMLButtonElement} */ (document.getElementById("load-rom-cartridge")),
    fileRomCartridge: /** @type {HTMLInputElement} */  (document.getElementById("file-rom-cartridge")),
    ejectRomCartridge: /** @type {HTMLButtonElement} */ (document.getElementById("eject-rom-cartridge")),
    romCartridgeInfo: /** @type {HTMLElement} */       (document.getElementById("rom-cartridge-info")),
    loadHdd:          /** @type {HTMLButtonElement} */ (document.getElementById("load-hdd")),
    fileHdd:          /** @type {HTMLInputElement} */  (document.getElementById("file-hdd")),
    downloadHdd:      /** @type {HTMLButtonElement} */ (document.getElementById("download-hdd")),
    ejectHdd:         /** @type {HTMLButtonElement} */ (document.getElementById("eject-hdd")),
    hddInfo:          /** @type {HTMLElement} */       (document.getElementById("hdd-info")),
    reset:            /** @type {HTMLButtonElement} */ (document.getElementById("reset")),
    screenSlot:       /** @type {HTMLElement} */       (document.getElementById("screen-slot")),
    screen:           /** @type {HTMLCanvasElement} */ (document.getElementById("screen")),
    keyboardSplit:    /** @type {HTMLElement} */       (document.getElementById("keyboard-split")),
    keyboard:         /** @type {HTMLElement} */       (document.getElementById("keyboard")),
    keyboardToggle:   /** @type {HTMLInputElement} */  (document.getElementById("keyboard-toggle")),
    crt:              /** @type {HTMLInputElement} */  (document.getElementById("crt")),
    qsound:           /** @type {HTMLInputElement} */  (document.getElementById("qsound")),
    qsound2:          /** @type {HTMLInputElement} */  (document.getElementById("qsound2")),
    stereo:           /** @type {HTMLInputElement} */  (document.getElementById("stereo")),
    ntsc:             /** @type {HTMLInputElement} */  (document.getElementById("ntsc")),
    ram256:           /** @type {HTMLInputElement} */  (document.getElementById("ram-256")),
    ram512:           /** @type {HTMLInputElement} */  (document.getElementById("ram-512")),
    turbo:            /** @type {HTMLInputElement} */  (document.getElementById("turbo")),
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
const configuredRamKb = ramKbFromParam(query.get("ram") ?? "");
machine.setRamKb(ql, configuredRamKb);
ui.ram256.checked = configuredRamKb === 384 || configuredRamKb === 896;
ui.ram512.checked = configuredRamKb === 640 || configuredRamKb === 896;
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
const mdvActivity = [
    {readCount: 0, writeCount: 0, until: 0, state: "idle", inserted: false, name: "", modified: false},
    {readCount: 0, writeCount: 0, until: 0, state: "idle", inserted: false, name: "", modified: false},
];
const hddStatus = {inserted: false, name: "", modified: false, driverReady: false};
let keyboardVisible = false;
let screenOnly = false;
let screenOnlyFallback = false;

const ntscOn = (query.get("ntsc") ?? "") === "1";
ui.ntsc.checked = ntscOn;
machine.setNtsc(ql, ntscOn);
let frameMs = 1000 / machine.frameHz(ql);

applySwitchParamValue(ui.keyboardToggle, query.get("keyboard") ?? "");
applySwitchParamValue(ui.crt, query.get("crt") ?? "");
applyQsoundParamValue(query.get("qsound") ?? "");
applySwitchParamValue(ui.stereo, query.get("stereo") ?? "");
applySwitchParamValue(ui.turbo, query.get("turbo") ?? "");
setKeyboardVisibility(ui.keyboardToggle.checked);

ui.reset.onclick = function () {
    resetSystem();
};

ui.keyboardToggle.onchange = function () {
    updateUrlParam("keyboard", ui.keyboardToggle.checked);
    setKeyboardVisibility(ui.keyboardToggle.checked);
};

ui.crt.onchange = function () {
    updateUrlParam("crt", ui.crt.checked);
    if (gfx !== null) {
        screen.setCrt(gfx, ui.crt.checked);
    }
};

ui.stereo.onchange = function () {
    updateUrlParam("stereo", ui.stereo.checked);
    if (sfx !== null) {
        sound.setStereo(sfx, ui.stereo.checked);
    }
};

ui.qsound.onchange = function () {
    updateQsoundSelection(ui.qsound, machine.qsoundOriginal);
};

ui.qsound2.onchange = function () {
    updateQsoundSelection(ui.qsound2, machine.qsound2);
};

ui.ntsc.onchange = function () {
    updateUrlParam("ntsc", ui.ntsc.checked);
    machine.setNtsc(ql, ui.ntsc.checked);
    resetSystem();
    syncFrameTiming();
    if (defaultRomSelected) {
        loadSystemRom();
    }
};

ui.ram256.onchange = updateRamSize;
ui.ram512.onchange = updateRamSize;

ui.turbo.onchange = function () {
    updateUrlParam("turbo", ui.turbo.checked);
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

for (let drive = 0; drive < ui.mdv.length; drive += 1) {
    const controls = ui.mdv[drive];
    controls.newMdv.onclick = function () {
        if (drive === 0) {
            updateUrlParam("url", null);
            cancelStartupFile();
        }
        const name = "mdv" + (drive + 1) + ".mdv";
        const mdvErr = machine.insertBlankMdv(ql, drive, name);
        if (mdvErr !== null) {
            showError(controls.info, mdvErr);
            return;
        }
        showInfo(controls.info, name);
        showInfo(ui.startupFileInfo, "");
    };
    controls.load.onclick = function () {
        controls.file.click();
    };
    controls.file.onchange = function () {
        const file = controls.file.files?.[0];
        controls.file.value = "";
        if (file === undefined) {
            return;
        }
        if (drive === 0) {
            updateUrlParam("url", null);
            cancelStartupFile();
        }
        io.readFile(file, "arraybuffer", function (err, buf) {
            if (err !== null) {
                showError(controls.info, err);
                return;
            }
            if (!(buf instanceof ArrayBuffer)) {
                showError(controls.info, "Empty read.");
                return;
            }
            const mdvErr = machine.insertMdv(ql, drive, buf, file.name);
            if (mdvErr !== null) {
                showError(controls.info, mdvErr);
                return;
            }
            showInfo(controls.info, file.name);
            showInfo(ui.startupFileInfo, "");
        });
    };
    controls.download.onclick = function () {
        const saved = machine.saveMdv(ql, drive);
        if (saved === null) {
            return;
        }
        let name = saved.name.split("/").pop() ?? "";
        name = name.split("\\").pop() ?? "";
        if (name === "") {
            name = "mdv" + (drive + 1) + ".mdv";
        } else if (!media.isMdvName(name)) {
            name += ".mdv";
        }
        const buffer = /** @type {ArrayBuffer} */ (saved.bytes.buffer);
        const url = URL.createObjectURL(new Blob([buffer], {type: "application/octet-stream"}));
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.click();
        URL.revokeObjectURL(url);
    };
    controls.eject.onclick = function () {
        if (drive === 0) {
            updateUrlParam("url", null);
            cancelStartupFile();
        }
        machine.ejectMdv(ql, drive);
        showInfo(controls.info, "No cartridge.");
    };
}

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
    updateUrlParam("rom", null);
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

ui.loadRomCartridge.onclick = function () {
    ui.fileRomCartridge.click();
};

ui.fileRomCartridge.onchange = function () {
    const file = ui.fileRomCartridge.files?.[0];
    ui.fileRomCartridge.value = "";
    if (file === undefined) {
        return;
    }
    io.readFile(file, "arraybuffer", function (err, buf) {
        if (err !== null) {
            showError(ui.romCartridgeInfo, err);
            return;
        }
        if (!(buf instanceof ArrayBuffer)) {
            showError(ui.romCartridgeInfo, "Empty read.");
            return;
        }
        const cartridgeErr = machine.insertRomCartridge(ql, buf);
        if (cartridgeErr !== null) {
            showError(ui.romCartridgeInfo, cartridgeErr);
            return;
        }
        ui.ejectRomCartridge.disabled = false;
        resetSystem();
        showInfo(ui.romCartridgeInfo, file.name);
    });
};

ui.ejectRomCartridge.onclick = function () {
    machine.ejectRomCartridge(ql);
    ui.ejectRomCartridge.disabled = true;
    resetSystem();
    showInfo(ui.romCartridgeInfo, "No cartridge.");
};

ui.loadHdd.onclick = function () {
    ui.fileHdd.click();
};

ui.fileHdd.onchange = function () {
    const file = ui.fileHdd.files?.[0];
    ui.fileHdd.value = "";
    if (file === undefined) {
        return;
    }
    io.readFile(file, "arraybuffer", function (err, buf) {
        if (err !== null) {
            showError(ui.hddInfo, err);
            return;
        }
        if (!(buf instanceof ArrayBuffer)) {
            showError(ui.hddInfo, "Empty read.");
            return;
        }
        const hddErr = machine.insertHdd(ql, buf, file.name);
        if (hddErr !== null) {
            showError(ui.hddInfo, hddErr);
            return;
        }
        refreshHddStatus();
    });
};

ui.downloadHdd.onclick = function () {
    const saved = machine.saveHdd(ql);
    if (saved === null) {
        return;
    }
    let name = saved.name.split("/").pop() ?? "";
    name = name.split("\\").pop() ?? "";
    if (name === "") {
        name = "win1.win";
    } else if (!media.isWinName(name)) {
        name += ".win";
    }
    const buffer = /** @type {ArrayBuffer} */ (saved.bytes.buffer);
    const url = URL.createObjectURL(new Blob([buffer], {type: "application/octet-stream"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    refreshHddStatus();
};

ui.ejectHdd.onclick = function () {
    machine.ejectHdd(ql);
    refreshHddStatus();
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
        ui.qsound2.checked = false;
        let message = "QSound ROM unavailable.";
        if (err !== null) {
            message = err;
        }
        showError(ui.qsoundInfo, message);
    } else {
        const romErr = machine.setQsoundRom(ql, rom);
        if (romErr !== null) {
            ui.qsound.checked = false;
            ui.qsound2.checked = false;
            showError(ui.qsoundInfo, "QSound: " + romErr);
        } else {
            if (selectedQsoundModel() !== machine.qsoundOff && ui.ram256.checked && ui.ram512.checked) {
                ui.ram256.checked = false;
                applyRamSize();
            }
            machine.setQsoundModel(ql, selectedQsoundModel());
            ui.qsound.disabled = false;
            ui.qsound2.disabled = false;
        }
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
 * Apply the three-valued sound-card URL option while retaining its default.
 *
 * @param {string} value
 */
function applyQsoundParamValue(value) {
    switch (value) {
    case "0":
        ui.qsound.checked = false;
        ui.qsound2.checked = false;
        break;
    case "1":
        ui.qsound.checked = true;
        ui.qsound2.checked = false;
        break;
    case "2":
        ui.qsound.checked = false;
        ui.qsound2.checked = true;
        break;
    }
}

/**
 * Set a control parameter or remove a superseded startup source from the URL.
 *
 * @param {string} name
 * @param {boolean | number | null} value
 */
function updateUrlParam(name, value) {
    const url = new URL(window.location.href);
    if (value === null) {
        url.searchParams.delete(name);
    } else {
        let encoded = String(value);
        if (typeof value === "boolean") {
            encoded = "0";
            if (value) {
                encoded = "1";
            }
        }
        url.searchParams.set(name, encoded);
    }
    window.history.replaceState(null, "", url);
}

/**
 * Accept a supported whole-KiB RAM size and otherwise use the stock size.
 *
 * @param {string} value
 * @returns {number}
 */
function ramKbFromParam(value) {
    switch (value) {
    case "384":
        return 384;
    case "640":
        return 640;
    case "896":
        return 896;
    case "128":
    default:
        return machine.defaultRamKb;
    }
}

/** Apply the selected RAM expansions, update the URL, and restart the QL. */
function updateRamSize() {
    if (ui.ram256.checked && ui.ram512.checked && selectedQsoundModel() !== machine.qsoundOff) {
        ui.qsound.checked = false;
        ui.qsound2.checked = false;
        machine.setQsoundModel(ql, machine.qsoundOff);
        updateUrlParam("qsound", machine.qsoundOff);
    }
    applyRamSize();
    resetSystem();
}

/**
 * Apply one card switch, including mutual exclusion and the expansion conflict.
 *
 * @param {HTMLInputElement} changed
 * @param {number} model
 */
function updateQsoundSelection(changed, model) {
    if (changed.checked) {
        ui.qsound.checked = model === machine.qsoundOriginal;
        ui.qsound2.checked = model === machine.qsound2;
        if (ui.ram256.checked && ui.ram512.checked) {
            ui.ram256.checked = false;
            applyRamSize();
        }
    }
    const selected = selectedQsoundModel();
    updateUrlParam("qsound", selected);
    machine.setQsoundModel(ql, selected);
    resetSystem();
}

/** Apply the selected RAM expansions and reflect their total in the URL. */
function applyRamSize() {
    let ramKb = machine.defaultRamKb;
    if (ui.ram256.checked) {
        ramKb += 256;
    }
    if (ui.ram512.checked) {
        ramKb += 512;
    }
    machine.setRamKb(ql, ramKb);
    updateUrlParam("ram", ramKb);
}

/** @returns {number} */
function selectedQsoundModel() {
    if (ui.qsound2.checked) {
        return machine.qsound2;
    }
    if (ui.qsound.checked) {
        return machine.qsoundOriginal;
    }
    return machine.qsoundOff;
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
 * Load a URL-supplied Microdrive image after any prerequisite ROM load.
 *
 * @param {string} name
 * @param {ArrayBuffer} bytes
 */
function applyStartupFile(name, bytes) {
    if (media.isMdvName(name)) {
        const mdvErr = machine.insertMdv(ql, 0, bytes, name);
        if (mdvErr !== null) {
            showError(ui.mdv[0].info, mdvErr);
            return;
        }
        showInfo(ui.mdv[0].info, name);
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
            document.exitFullscreen().then(
                function () {},
                function () {
                    setScreenOnly(false);
                },
            );
            return;
        }
        setScreenOnly(false);
        return;
    }

    const slot = ui.screen.parentElement;
    if (slot === null || slot.requestFullscreen === undefined) {
        screenOnlyFallback = true;
        setScreenOnly(true);
        return;
    }
    slot.requestFullscreen().then(
        function () {},
        function () {
            screenOnlyFallback = true;
            setScreenOnly(true);
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
        stepTurboGroup();
        syncFrameTiming();
        carryMs -= period;
        ran += 1;
    }
    if (ran < 4) {
        fillSoundQueue();
    }
    refreshMdvActivity(now);
    refreshHddStatus();
    refreshSoundStatus(now);
    if (gfx !== null) {
        screen.draw(gfx, ql.pixels, ql.displayNtsc);
    }
}

function fillSoundQueue() {
    if (sfx === null || !sound.isRunning(sfx)) {
        return;
    }
    for (let ran = 0; ran < 4 && sound.wantsFrame(sfx); ran += 1) {
        const period = frameMs;
        stepTurboGroup();
        syncFrameTiming();
        carryMs = Math.max(carryMs - period, carryFloorMs);
    }
}

/** Run hidden fields while either Microdrive remains in an active read, then one visible field. */
function stepTurboGroup() {
    for (let frame = 1; frame < turboMultiplier; frame += 1) {
        if (!turboReading()) {
            break;
        }
        stepMachine(false);
    }
    stepMachine(true);
}

/** @returns {boolean} */
function turboReading() {
    if (!ui.turbo.checked) {
        return false;
    }
    for (let drive = 0; drive < ui.mdv.length; drive += 1) {
        if (machine.mdvInfo(ql, drive).reading) {
            return true;
        }
    }
    return false;
}

/**
 * Keep brief transfers visible, then show the current motor state.
 *
 * @param {number} now
 */
function refreshMdvActivity(now) {
    for (let drive = 0; drive < ui.mdv.length; drive += 1) {
        const controls = ui.mdv[drive];
        const activity = mdvActivity[drive];
        const info = machine.mdvInfo(ql, drive);
        let state = activity.state;
        if (info.writing || info.writeCount !== activity.writeCount) {
            state = "write";
            activity.until = now + mdvActivityHoldMs;
        } else if (info.readCount !== activity.readCount) {
            state = "read";
            activity.until = now + mdvActivityHoldMs;
        } else if (now >= activity.until) {
            state = "idle";
            if (info.motorOn) {
                state = "motor";
            }
        }
        activity.readCount = info.readCount;
        activity.writeCount = info.writeCount;
        if (
            info.inserted !== activity.inserted ||
            info.name !== activity.name ||
            info.modified !== activity.modified
        ) {
            let label = "No cartridge.";
            if (info.inserted) {
                label = info.name;
                if (info.modified) {
                    label += " (modified)";
                }
            }
            showInfo(controls.info, label);
            controls.download.disabled = !info.inserted;
            controls.eject.disabled = !info.inserted;
            activity.inserted = info.inserted;
            activity.name = info.name;
            activity.modified = info.modified;
        }
        if (state === activity.state) {
            continue;
        }
        controls.info.classList.remove("mdv-motor", "mdv-read", "mdv-write");
        let title = "Microdrive " + (drive + 1) + " idle";
        switch (state) {
        case "motor":
            controls.info.classList.add("mdv-motor");
            title = "Microdrive " + (drive + 1) + " motor running";
            break;
        case "read":
            controls.info.classList.add("mdv-read");
            title = "Microdrive " + (drive + 1) + " reading";
            break;
        case "write":
            controls.info.classList.add("mdv-write");
            title = "Microdrive " + (drive + 1) + " writing";
            break;
        default:
            break;
        }
        controls.info.title = title;
        activity.state = state;
    }
}

/** Keep hard disk controls synchronized with the mounted writable image. */
function refreshHddStatus() {
    const info = machine.hddInfo(ql);
    if (
        info.inserted === hddStatus.inserted &&
        info.name === hddStatus.name &&
        info.modified === hddStatus.modified &&
        info.driverReady === hddStatus.driverReady
    ) {
        return;
    }
    let label = "No hard disk.";
    if (info.inserted) {
        label = info.name;
        if (info.modified) {
            label += " (modified)";
        }
        if (!info.driverReady) {
            label += " (WIN1 unavailable)";
        }
    }
    showInfo(ui.hddInfo, label);
    ui.downloadHdd.disabled = !info.inserted;
    ui.ejectHdd.disabled = !info.inserted;
    hddStatus.inserted = info.inserted;
    hddStatus.name = info.name;
    hddStatus.modified = info.modified;
    hddStatus.driverReady = info.driverReady;
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

/**
 * Run one field, suppressing costly host output for an intermediate Turbo field.
 *
 * @param {boolean} visible
 */
function stepMachine(visible) {
    machine.setVideoOn(ql, visible);
    let hasSound = false;
    if (visible && sfx !== null) {
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
