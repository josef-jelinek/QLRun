import * as boot from "./boot.js";
import * as disk from "./disk.js";
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
    romSlots: [
        /** @type {HTMLInputElement} */ (document.getElementById("rom-cart")),
        /** @type {HTMLInputElement} */ (document.getElementById("rom-io1")),
        /** @type {HTMLInputElement} */ (document.getElementById("rom-io2")),
    ],
    loadRomCartridge: /** @type {HTMLButtonElement} */ (document.getElementById("load-rom-cartridge")),
    fileRomCartridge: /** @type {HTMLInputElement} */  (document.getElementById("file-rom-cartridge")),
    ejectRomCartridge: /** @type {HTMLButtonElement} */ (document.getElementById("eject-rom-cartridge")),
    romCartridgeInfo: /** @type {HTMLElement} */       (document.getElementById("rom-cartridge-info")),
    loadHdd:          /** @type {HTMLButtonElement} */ (document.getElementById("load-hdd")),
    fileHdd:          /** @type {HTMLInputElement} */  (document.getElementById("file-hdd")),
    downloadHdd:      /** @type {HTMLButtonElement} */ (document.getElementById("download-hdd")),
    ejectHdd:         /** @type {HTMLButtonElement} */ (document.getElementById("eject-hdd")),
    hddInfo:          /** @type {HTMLElement} */       (document.getElementById("hdd-info")),
    loadFdd:          /** @type {HTMLButtonElement} */ (document.getElementById("load-fdd")),
    fileFdd:          /** @type {HTMLInputElement} */  (document.getElementById("file-fdd")),
    downloadFdd:      /** @type {HTMLButtonElement} */ (document.getElementById("download-fdd")),
    ejectFdd:         /** @type {HTMLButtonElement} */ (document.getElementById("eject-fdd")),
    fddInfo:          /** @type {HTMLElement} */       (document.getElementById("fdd-info")),
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
    stretch:          /** @type {HTMLInputElement} */  (document.getElementById("stretch")),
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
const fddStatus = {inserted: false, name: "", driverReady: false};
const romSlotStates = [
    {name: "", error: "", generation: 0},
    {name: "", error: "", generation: 0},
    {name: "", error: "", generation: 0},
];
let keyboardVisible = false;
let screenOnly = false;
let screenOnlyFallback = false;

const ntscOn = (query.get("ntsc") ?? "") === "1";
ui.ntsc.checked = ntscOn;
machine.setNtsc(ql, ntscOn);
let frameMs = 1000 / machine.frameHz(ql);

applySwitchParam(ui.keyboardToggle, "keyboard", "1", "01");
applySwitchParam(ui.crt, "crt", "1", "01");
applySwitchParam(ui.qsound, "qsound", "1", "012");
applySwitchParam(ui.qsound2, "qsound", "2", "012");
applySwitchParam(ui.stereo, "stereo", "1", "01");
applySwitchParam(ui.turbo, "turbo", "1", "01");
applySwitchParam(ui.stretch, "stretch", "1", "01");
keyboardVisible = ui.keyboardToggle.checked;
applyVisibility();

ui.reset.onclick = function () {
    resetSystem();
};

ui.keyboardToggle.onchange = function () {
    updateUrlParam("keyboard", ui.keyboardToggle.checked);
    keyboardVisible = ui.keyboardToggle.checked;
    applyVisibility();
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

ui.stretch.onchange = function () {
    updateUrlParam("stretch", ui.stretch.checked);
    if (gfx !== null) {
        screen.setStretch(gfx, ui.stretch.checked);
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
    ui.keyboardSplit.setPointerCapture(e.pointerId);
};

ui.keyboardSplit.onpointermove = function (/** @type {PointerEvent} */ e) {
    if (ui.keyboardSplit.hasPointerCapture(e.pointerId)) {
        keyboard.scaleFromY(ui.keyboard, ui.keyboardSplit, e.clientY);
    }
};

ui.keyboardSplit.onpointerup = function (/** @type {PointerEvent} */ e) {
    endKeyboardSplit(e.pointerId);
};

ui.keyboardSplit.onpointercancel = function (/** @type {PointerEvent} */ e) {
    endKeyboardSplit(e.pointerId);
};

new ResizeObserver(function () {
    if (gfx !== null) {
        screen.resize(gfx);
    }
}).observe(ui.screenSlot);

document.onfullscreenchange = function () {
    screenOnly = document.fullscreenElement !== null || screenOnlyFallback;
    applyVisibility();
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
    const selectingRom = ui.romSlots.includes(/** @type {HTMLInputElement} */ (e.target));
    if (!selectingRom || e.code.startsWith("F")) {
        keyboard.handleKeyDown(kbd, e);
    }
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
    const selectingRom = ui.romSlots.includes(/** @type {HTMLInputElement} */ (e.target));
    if (!selectingRom || kbd.hostHeld.includes(e.code)) {
        keyboard.handleKeyUp(kbd, e);
    }
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
        io.readFile(file, function (err, buf) {
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
    io.readFile(file, function (err, buf) {
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

for (const control of ui.romSlots) {
    control.onchange = refreshRomSlotStatus;
}

ui.loadRomCartridge.onclick = function () {
    ui.fileRomCartridge.click();
};

ui.fileRomCartridge.onchange = function () {
    const file = ui.fileRomCartridge.files?.[0];
    ui.fileRomCartridge.value = "";
    if (file === undefined) {
        return;
    }
    const slot = selectedRomSlot();
    const state = romSlotStates[slot];
    state.generation += 1;
    const generation = state.generation;
    if (file.size === 0 || file.size > machine.romCartridgeSize) {
        state.error = "Expected 1 to " + machine.romCartridgeSize + ", got " + file.size + " bytes.";
        refreshRomSlotStatus();
        return;
    }
    io.readFile(file, function (err, buf) {
        if (state.generation !== generation) {
            return;
        }
        if (err === null && !(buf instanceof ArrayBuffer)) {
            err = "Empty read.";
        }
        if (err === null) {
            err = machine.insertRomCartridge(ql, buf, slot);
        }
        state.error = err ?? "";
        if (err === null) {
            state.name = file.name;
            resetSystem();
        }
        refreshRomSlotStatus();
    });
};

ui.ejectRomCartridge.onclick = function () {
    const slot = selectedRomSlot();
    const state = romSlotStates[slot];
    state.generation += 1;
    machine.ejectRomCartridge(ql, slot);
    state.name = "";
    state.error = "";
    resetSystem();
    refreshRomSlotStatus();
};

refreshRomSlotStatus();

ui.loadHdd.onclick = function () {
    ui.fileHdd.click();
};

ui.fileHdd.onchange = function () {
    const file = ui.fileHdd.files?.[0];
    ui.fileHdd.value = "";
    if (file === undefined) {
        return;
    }
    io.readFile(file, function (err, buf) {
        if (err !== null) {
            showError(ui.hddInfo, err);
            return;
        }
        if (!(buf instanceof ArrayBuffer)) {
            showError(ui.hddInfo, "Empty read.");
            return;
        }
        const hddErr = disk.insert(ql.disks.win, buf, file.name);
        if (hddErr !== null) {
            showError(ui.hddInfo, hddErr);
            return;
        }
        refreshHddStatus();
    });
};

ui.downloadHdd.onclick = function () {
    const saved = disk.save(ql.disks.win);
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
    disk.eject(ql.disks.win);
    refreshHddStatus();
};

ui.loadFdd.onclick = function () {
    ui.fileFdd.click();
};

ui.fileFdd.onchange = function () {
    const file = ui.fileFdd.files?.[0];
    ui.fileFdd.value = "";
    if (file === undefined) {
        return;
    }
    io.readFile(file, function (err, buf) {
        if (err !== null) {
            showError(ui.fddInfo, err);
            return;
        }
        if (!(buf instanceof ArrayBuffer)) {
            showError(ui.fddInfo, "Empty read.");
            return;
        }
        const fddErr = disk.insert(ql.disks.flp, buf, file.name);
        if (fddErr !== null) {
            showError(ui.fddInfo, fddErr);
            return;
        }
        refreshFddStatus();
    });
};

ui.downloadFdd.onclick = function () {
    const saved = disk.save(ql.disks.flp);
    if (saved === null) {
        return;
    }
    let name = saved.name.split("/").pop() ?? "";
    name = name.split("\\").pop() ?? "";
    if (name === "") {
        name = "flp1.img";
    } else if (!media.isImgName(name)) {
        name += ".img";
    }
    const buffer = /** @type {ArrayBuffer} */ (saved.bytes.buffer);
    const url = URL.createObjectURL(new Blob([buffer], {type: "application/octet-stream"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
};

ui.ejectFdd.onclick = function () {
    disk.eject(ql.disks.flp);
    refreshFddStatus();
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
            screen.setStretch(initializedGfx, ui.stretch.checked);
            showInfo(ui.initInfo, "Ready.");
        },
    );
});

sound.init(
    machine.frameHz(ql),
    fillSoundQueue,
    function (running) {
        machine.enableSound(ql, running);
    },
    function (err, initializedSfx) {
        if (err !== null) {
            showError(ui.soundInfo, "No sound: " + err);
            return;
        }
        if (initializedSfx === null) {
            showError(ui.soundInfo, "No sound.");
            return;
        }
        sfx = initializedSfx;
        sound.setStereo(initializedSfx, ui.stereo.checked);
        machine.setSoundRate(ql, initializedSfx.context.sampleRate);
        machine.enableSound(ql, initializedSfx.context.state === "running");
    },
);

boot.loadRom(boot.qsoundRomUrl, machine.qsoundRomSize, function (err, rom) {
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
    const name = romName + ".rom";
    if (!/^[A-Za-z0-9]+$/.test(romName)) {
        onRom("Invalid ROM name.", null);
        return;
    }
    abortLoadRom = boot.loadRom("roms/" + name, machine.sysRomSize, onRom);

    /**
     * @param {string | null} err
     * @param {ArrayBuffer | null} rom
     */
    function onRom(err, rom) {
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
    }
}

function refreshRomSlotStatus() {
    const state = romSlotStates[selectedRomSlot()];
    ui.ejectRomCartridge.disabled = state.name === "";
    if (state.error !== "") {
        showError(ui.romCartridgeInfo, state.error);
        return;
    }
    let name = state.name;
    if (name === "") {
        name = "No ROM.";
    }
    showInfo(ui.romCartridgeInfo, name);
}

function selectedRomSlot() {
    for (let slot = 0; slot < ui.romSlots.length; slot += 1) {
        if (ui.romSlots[slot].checked) {
            return slot;
        }
    }
    return 0;
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
 * Set a switch from its URL parameter: `on` selects it, any other digit in
 * `values` clears it, and an absent or invalid value keeps the page default.
 *
 * @param {HTMLInputElement} input
 * @param {string} name
 * @param {string} on
 * @param {string} values
 */
function applySwitchParam(input, name, on, values) {
    const value = query.get(name) ?? "";
    if (value.length === 1 && values.includes(value)) {
        input.checked = value === on;
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
        url.searchParams.set(name, String(Number(value)));
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
    startupFileName = null;
    startupFileBytes = null;
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

function toggleCanvasFullscreen() {
    if (document.fullscreenElement !== null || screenOnlyFallback) {
        screenOnlyFallback = false;
        if (document.fullscreenElement !== null && document.exitFullscreen !== undefined) {
            document.exitFullscreen().then(
                function () {},
                function () {
                    screenOnly = false;
                    applyVisibility();
                },
            );
            return;
        }
        screenOnly = false;
        applyVisibility();
        return;
    }

    const slot = ui.screen.parentElement;
    if (slot === null || slot.requestFullscreen === undefined) {
        screenOnlyFallback = true;
        screenOnly = true;
        applyVisibility();
        return;
    }
    slot.requestFullscreen().then(
        function () {},
        function () {
            screenOnlyFallback = true;
            screenOnly = true;
            applyVisibility();
        },
    );
}

/**
 * Hide or show the page chrome and keyboard. Clearing the inline display
 * lets the stylesheet rule apply again; the screen slot's ResizeObserver
 * refits the canvas.
 */
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
}

/** @param {number} pointerId */
function endKeyboardSplit(pointerId) {
    if (ui.keyboardSplit.hasPointerCapture(pointerId)) {
        ui.keyboardSplit.releasePointerCapture(pointerId);
    }
    document.body.classList.remove("keyboard-splitting");
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
    if (lastNow === 0) {
        lastNow = now;
        carryMs = frameMs;
    }
    const dt = Math.min(now - lastNow, 80);
    lastNow = now;
    carryMs += dt;
    let ran = 0;
    while (carryMs >= frameMs && ran < 4) {
        stepTurboGroup();
        carryMs -= frameMs;
        ran += 1;
    }
    syncFrameTiming();
    if (ran < 4) {
        fillSoundQueue();
    }
    refreshMdvActivity(now);
    refreshHddStatus();
    refreshFddStatus();
    refreshSoundStatus(now);
    if (gfx !== null) {
        screen.draw(gfx, ql.pixels, ql.frameNtsc, ql.frameVersion);
    }
}

function fillSoundQueue() {
    if (sfx === null || sfx.context.state !== "running") {
        return;
    }
    for (let ran = 0; ran < 4 && sound.wantsFrame(sfx); ran += 1) {
        stepTurboGroup();
        carryMs = Math.max(carryMs - frameMs, carryFloorMs);
    }
}

/**
 * Run hidden fields while either Microdrive remains in an active read, then
 * one visible field. The per-field read flag is consumed so Turbo does not
 * stay on after the last transfer.
 */
function stepTurboGroup() {
    const burst = ui.turbo.checked && (machine.mdvInfo(ql, 0).reading || machine.mdvInfo(ql, 1).reading);
    ql.mdv.readingMask = 0;
    if (burst) {
        for (let frame = 1; frame < turboMultiplier; frame += 1) {
            stepMachine(false);
        }
    }
    stepMachine(true);
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
    const info = disk.info(ql.disks.win);
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

/** Keep floppy controls synchronized with the mounted QL5A/QL5B image. */
function refreshFddStatus() {
    const info = disk.info(ql.disks.flp);
    if (
        info.inserted === fddStatus.inserted &&
        info.name === fddStatus.name &&
        info.driverReady === fddStatus.driverReady
    ) {
        return;
    }
    let label = "No disk.";
    if (info.inserted) {
        label = info.name;
        if (!info.driverReady) {
            label += " (FLP1 unavailable)";
        }
    }
    showInfo(ui.fddInfo, label);
    ui.downloadFdd.disabled = !info.inserted;
    ui.ejectFdd.disabled = !info.inserted;
    fddStatus.inserted = info.inserted;
    fddStatus.name = info.name;
    fddStatus.driverReady = info.driverReady;
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
    const stats = sfx.stats;
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
    ql.videoOn = visible;
    let hasSound = false;
    if (visible && sfx !== null) {
        hasSound = sfx.context.state === "running";
    }
    machine.enableSound(ql, hasSound);
    machine.runFrame(ql);
    framesRun += 1;
    const chunk = ql.audio;
    if (chunk.n > 0 && sfx !== null && (sfx.context.state === "running" || sound.wantsFrame(sfx))) {
        sound.push(sfx, chunk);
    }
    chunk.n = 0;
}
