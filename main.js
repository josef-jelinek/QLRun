import * as boot from "./boot.js";
import * as disk from "./disk.js";
import * as io from "./io.js";
import * as keyboard from "./keyboard.js";
import * as load from "./load.js";
import * as machine from "./machine.js";
import * as media from "./media.js";
import * as pe from "./pe.js";
import * as qimsi from "./qimsi.js";
import * as screen from "./screen.js";
import * as sound from "./sound.js";

const statsWindowMs = 1000;
const carryFloorMs = -80;
const mdvActivityHoldMs = 50;
const turboMultiplier = 8;
const sectorsPerMebibyte = 2048;
const guestColumns = 512;
const guestRows = 256;
const ntscCrtRows = 192;
const wheelPixelsPerStep = 100;
const wheelLinesPerStep = 3;
/**
 * Page defaults of the URL parameters that controls write back. A control
 * changed to its default removes its parameter instead of repeating it.
 *
 * @type {Record<string, string>}
 */
const urlParamDefaults = {
    keyboard: "0",
    crt: "1",
    qsound: "1",
    stereo: "0",
    muted: "0",
    ntsc: "0",
    ram: String(machine.defaultRamKb),
    mouse: "0",
    mcursor: "0",
    turbo: "1",
    stretch: "0",
};

const ui = {
    pageHeader:       /** @type {HTMLElement} */       (document.getElementById("page-header")),
    tabs: [
        /** @type {HTMLInputElement} */ (document.getElementById("tab-media")),
        /** @type {HTMLInputElement} */ (document.getElementById("tab-roms")),
        /** @type {HTMLInputElement} */ (document.getElementById("tab-hardware")),
        /** @type {HTMLInputElement} */ (document.getElementById("tab-display")),
    ],
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
        {
            load:     /** @type {HTMLButtonElement} */ (document.getElementById("load-rom-cart")),
            file:     /** @type {HTMLInputElement} */  (document.getElementById("file-rom-cart")),
            eject:    /** @type {HTMLButtonElement} */ (document.getElementById("eject-rom-cart")),
            info:     /** @type {HTMLElement} */       (document.getElementById("rom-cart-info")),
        },
        {
            load:     /** @type {HTMLButtonElement} */ (document.getElementById("load-rom-io1")),
            file:     /** @type {HTMLInputElement} */  (document.getElementById("file-rom-io1")),
            eject:    /** @type {HTMLButtonElement} */ (document.getElementById("eject-rom-io1")),
            info:     /** @type {HTMLElement} */       (document.getElementById("rom-io1-info")),
        },
        {
            load:     /** @type {HTMLButtonElement} */ (document.getElementById("load-rom-io2")),
            file:     /** @type {HTMLInputElement} */  (document.getElementById("file-rom-io2")),
            eject:    /** @type {HTMLButtonElement} */ (document.getElementById("eject-rom-io2")),
            info:     /** @type {HTMLElement} */       (document.getElementById("rom-io2-info")),
        },
    ],
    newHdd4:          /** @type {HTMLButtonElement} */ (document.getElementById("new-hdd-4")),
    newHdd16:         /** @type {HTMLButtonElement} */ (document.getElementById("new-hdd-16")),
    loadHdd:          /** @type {HTMLButtonElement} */ (document.getElementById("load-hdd")),
    fileHdd:          /** @type {HTMLInputElement} */  (document.getElementById("file-hdd")),
    downloadHdd:      /** @type {HTMLButtonElement} */ (document.getElementById("download-hdd")),
    ejectHdd:         /** @type {HTMLButtonElement} */ (document.getElementById("eject-hdd")),
    hddInfo:          /** @type {HTMLElement} */       (document.getElementById("hdd-info")),
    newFddDd:         /** @type {HTMLButtonElement} */ (document.getElementById("new-fdd-dd")),
    newFddHd:         /** @type {HTMLButtonElement} */ (document.getElementById("new-fdd-hd")),
    loadFdd:          /** @type {HTMLButtonElement} */ (document.getElementById("load-fdd")),
    fileFdd:          /** @type {HTMLInputElement} */  (document.getElementById("file-fdd")),
    downloadFdd:      /** @type {HTMLButtonElement} */ (document.getElementById("download-fdd")),
    ejectFdd:         /** @type {HTMLButtonElement} */ (document.getElementById("eject-fdd")),
    fddInfo:          /** @type {HTMLElement} */       (document.getElementById("fdd-info")),
    paused:           /** @type {HTMLInputElement} */  (document.getElementById("paused")),
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
    muted:            /** @type {HTMLInputElement} */  (document.getElementById("muted")),
    ntsc:             /** @type {HTMLInputElement} */  (document.getElementById("ntsc")),
    ram256:           /** @type {HTMLInputElement} */  (document.getElementById("ram-256")),
    ram512:           /** @type {HTMLInputElement} */  (document.getElementById("ram-512")),
    mouseQimsi:       /** @type {HTMLInputElement} */  (document.getElementById("mouse-qimsi")),
    mousePe:          /** @type {HTMLInputElement} */  (document.getElementById("mouse-pe")),
    mouseCursor:      /** @type {HTMLInputElement} */  (document.getElementById("mouse-cursor")),
    turbo:            /** @type {HTMLInputElement} */  (document.getElementById("turbo")),
    stretch:          /** @type {HTMLInputElement} */  (document.getElementById("stretch")),
    fullscreenToggle: /** @type {HTMLButtonElement} */ (document.getElementById("fullscreen-toggle")),
};

const query = new URLSearchParams(window.location.search);
const configuredRomName = query.get("rom") ?? "";
/** PS/2 counts per displayed 512-mode pixel; at 1, QIMSI's PE driver follows the host 1:1. */
const mouseCountsPerPixel = mouseSpeedFromParam(query.get("mspeed") ?? "");
const configuredMouseModel = mouseFromParam(query.get("mouse") ?? "");
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
/**
 * @typedef {{
 *   inserted: boolean,
 *   name: string,
 *   modified: boolean,
 *   driverReady: boolean,
 *   generation: number,
 * }} DriveStatus
 */
const hddStatus = {inserted: false, name: "", modified: false, driverReady: false, generation: 1};
const fddStatus = {inserted: false, name: "", modified: false, driverReady: false, generation: 1};
const romSlotStates = [
    {name: "", error: "", generation: 0},
    {name: "", error: "", generation: 0},
    {name: "", error: "", generation: 0},
];
let wheelSteps = 0;
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
applySwitchParam(ui.muted, "muted", "1", "01");
ui.mouseQimsi.checked = configuredMouseModel === machine.mouseQimsi;
ui.mousePe.checked = configuredMouseModel === machine.mousePe;
applySwitchParam(ui.mouseCursor, "mcursor", "1", "01");
applySwitchParam(ui.turbo, "turbo", "1", "01");
applySwitchParam(ui.stretch, "stretch", "1", "01");
ui.paused.checked = false;
keyboardVisible = ui.keyboardToggle.checked;
applyVisibility();
machine.setMouseModel(ql, configuredMouseModel);

ui.reset.onclick = function () {
    resetSystem();
};

ui.paused.onchange = function () {
    if (sfx === null) {
        return;
    }
    if (!ui.paused.checked) {
        // Queue accounting went stale while nothing was sent. Restart it, and
        // queue the next frames before gap counting resumes, so the refill
        // itself is not reported as an underrun.
        sound.reset(sfx);
        fillSoundQueue();
    }
    sound.setPaused(sfx, ui.paused.checked);
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

ui.muted.onchange = function () {
    updateUrlParam("muted", ui.muted.checked);
    if (sfx !== null) {
        sound.setMuted(sfx, ui.muted.checked);
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

ui.mouseQimsi.onchange = function () {
    updateMouseSelection(ui.mouseQimsi, machine.mouseQimsi);
};

ui.mousePe.onchange = function () {
    updateMouseSelection(ui.mousePe, machine.mousePe);
};

ui.mouseCursor.onchange = function () {
    updateUrlParam("mcursor", ui.mouseCursor.checked);
};

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

ui.screen.onmousedown = function (/** @type {MouseEvent} */ e) {
    switch (ql.mouseModel) {
    case machine.mousePe:
        e.preventDefault();
        movePePointer(e);
        pe.setButtons(ql.pe, e.buttons);
        break;
    case machine.mouseQimsi:
        e.preventDefault();
        if (document.pointerLockElement === ui.screen) {
            qimsi.setButtons(ql.qimsi, e.buttons);
            break;
        }
        // The capturing click stays on the host. Chrome refuses a new lock
        // shortly after Esc released the previous one; the next click retries.
        const request = ui.screen.requestPointerLock();
        if (request !== undefined) {
            request.then(function () {}, function () {});
        }
        break;
    default:
        break;
    }
};

ui.screen.onmouseup = function (/** @type {MouseEvent} */ e) {
    if (ql.mouseModel === machine.mousePe) {
        movePePointer(e);
        pe.setButtons(ql.pe, e.buttons);
        return;
    }
    if (document.pointerLockElement === ui.screen) {
        qimsi.setButtons(ql.qimsi, e.buttons);
    }
};

ui.screen.onmouseleave = function () {
    if (ql.mouseModel === machine.mousePe) {
        pe.setButtons(ql.pe, 0);
    }
};

ui.screen.onmousemove = function (/** @type {MouseEvent} */ e) {
    if (ql.mouseModel === machine.mousePe) {
        movePePointer(e);
        return;
    }
    const width = ui.screen.clientWidth;
    if (document.pointerLockElement !== ui.screen || width <= 0) {
        return;
    }
    const scale = mouseCountsPerPixel * guestColumns / width;
    qimsi.move(ql.qimsi, e.movementX * scale, e.movementY * scale);
};

ui.screen.onwheel = function (/** @type {WheelEvent} */ e) {
    if (document.pointerLockElement !== ui.screen) {
        return;
    }
    e.preventDefault();
    let steps = e.deltaY;
    switch (e.deltaMode) {
    case WheelEvent.DOM_DELTA_PIXEL:
        steps /= wheelPixelsPerStep;
        break;
    case WheelEvent.DOM_DELTA_LINE:
        steps /= wheelLinesPerStep;
        break;
    default:
        break;
    }
    wheelSteps += steps;
    const whole = Math.trunc(wheelSteps);
    wheelSteps -= whole;
    if (whole !== 0) {
        qimsi.scroll(ql.qimsi, whole);
    }
};

ui.screen.oncontextmenu = function (/** @type {MouseEvent} */ e) {
    if (ql.mouseModel !== machine.mouseOff) {
        e.preventDefault();
    }
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

document.onpointerlockchange = function () {
    if (document.pointerLockElement !== ui.screen) {
        qimsi.setButtons(ql.qimsi, 0);
        wheelSteps = 0;
    }
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
    const selectingSwitch = isSwitchTarget(e.target);
    if (!selectingSwitch || e.code.startsWith("F")) {
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
    const selectingSwitch = isSwitchTarget(e.target);
    if (!selectingSwitch || kbd.hostHeld.includes(e.code)) {
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
        const chosen = readChosenFile(controls.file, 0, function (file, err, buf) {
            if (err !== null || buf === null) {
                let message = "Empty read.";
                if (err !== null) {
                    message = err;
                }
                showError(controls.info, message);
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
        if (chosen && drive === 0) {
            updateUrlParam("url", null);
            cancelStartupFile();
        }
    };
    controls.download.onclick = function () {
        const saved = machine.saveMdv(ql, drive);
        if (saved === null) {
            return;
        }
        downloadBytes(saved.name, saved.bytes, "mdv" + (drive + 1) + ".mdv", media.isMdvName, ".mdv");
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
    const files = ui.fileRom.files;
    if (files === null || files.length === 0) {
        ui.fileRom.value = "";
        return;
    }
    if (abortLoadRom !== null) {
        abortLoadRom();
        abortLoadRom = null;
    }
    updateUrlParam("rom", null);
    readChosenFile(ui.fileRom, 0, function (file, err, buf) {
        if (err !== null || buf === null) {
            let message = "Empty read.";
            if (err !== null) {
                message = err;
            }
            showError(ui.romInfo, message);
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

for (let slot = 0; slot < ui.romSlots.length; slot += 1) {
    const controls = ui.romSlots[slot];
    const state = romSlotStates[slot];
    controls.load.onclick = function () {
        controls.file.click();
    };
    controls.file.onchange = function () {
        const files = controls.file.files;
        if (files === null || files.length === 0) {
            controls.file.value = "";
            return;
        }
        state.generation += 1;
        const generation = state.generation;
        readChosenFile(controls.file, machine.romCartridgeSize, function (file, err, buf) {
            if (state.generation !== generation) {
                return;
            }
            if (err === null && buf !== null) {
                err = machine.insertRomCartridge(ql, buf, slot);
            }
            state.error = "";
            if (err !== null) {
                state.error = err;
            }
            if (err === null) {
                state.name = file.name;
                resetSystem();
            }
            refreshRomSlotStatus(slot);
        });
    };
    controls.eject.onclick = function () {
        state.generation += 1;
        machine.ejectRomCartridge(ql, slot);
        state.name = "";
        state.error = "";
        resetSystem();
        refreshRomSlotStatus(slot);
    };
    refreshRomSlotStatus(slot);
}

ui.newHdd4.onclick = function () {
    insertNewHardDisk(4 * sectorsPerMebibyte);
};

ui.newHdd16.onclick = function () {
    insertNewHardDisk(disk.maxReportedSectors);
};

ui.loadHdd.onclick = function () {
    ui.fileHdd.click();
};

ui.fileHdd.onchange = function () {
    readChosenFile(ui.fileHdd, 0, function (file, err, buf) {
        if (err !== null || buf === null) {
            let message = "Empty read.";
            if (err !== null) {
                message = err;
            }
            showError(ui.hddInfo, message);
            return;
        }
        const hddErr = disk.insert(ql.disks.win, buf, file.name);
        if (hddErr !== null) {
            showError(ui.hddInfo, hddErr);
            return;
        }
        refreshMountedDrives();
    });
};

ui.downloadHdd.onclick = function () {
    const saved = disk.save(ql.disks.win);
    if (saved === null) {
        return;
    }
    downloadBytes(saved.name, saved.bytes, "win1.win", media.isWinName, ".win");
    refreshMountedDrives();
};

ui.ejectHdd.onclick = function () {
    disk.eject(ql.disks.win);
    refreshMountedDrives();
};

ui.newFddDd.onclick = function () {
    insertNewFloppy(false);
};

ui.newFddHd.onclick = function () {
    insertNewFloppy(true);
};

ui.loadFdd.onclick = function () {
    ui.fileFdd.click();
};

ui.fileFdd.onchange = function () {
    readChosenFile(ui.fileFdd, 0, function (file, err, buf) {
        if (err !== null || buf === null) {
            let message = "Empty read.";
            if (err !== null) {
                message = err;
            }
            showError(ui.fddInfo, message);
            return;
        }
        const fddErr = disk.insert(ql.disks.flp, buf, file.name);
        if (fddErr !== null) {
            showError(ui.fddInfo, fddErr);
            return;
        }
        refreshMountedDrives();
    });
};

ui.downloadFdd.onclick = function () {
    const saved = disk.save(ql.disks.flp);
    if (saved === null) {
        return;
    }
    downloadBytes(saved.name, saved.bytes, "flp1.img", media.isImgName, ".img");
    refreshMountedDrives();
};

ui.ejectFdd.onclick = function () {
    disk.eject(ql.disks.flp);
    refreshMountedDrives();
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
        sound.setMuted(initializedSfx, ui.muted.checked);
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

/**
 * Report whether a key event targets a tab switch, whose arrow, Space, and
 * Enter keys keep their native selection behavior.
 *
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
function isSwitchTarget(target) {
    return ui.tabs.includes(/** @type {HTMLInputElement} */ (target));
}

/** @param {number} slot */
function refreshRomSlotStatus(slot) {
    const controls = ui.romSlots[slot];
    const state = romSlotStates[slot];
    controls.eject.disabled = state.name === "";
    if (state.error !== "") {
        showError(controls.info, state.error);
        return;
    }
    let name = state.name;
    if (name === "") {
        name = "No ROM.";
    }
    showInfo(controls.info, name);
}

/**
 * Read one chosen local file. An empty picker does nothing. A zero-length
 * file, or a file larger than `maxBytes` when that limit is positive, is
 * reported without reading.
 *
 * @param {HTMLInputElement} input
 * @param {number} maxBytes
 * @param {function(File, string | null, ArrayBuffer | null): void} onFile
 * @returns {boolean} Whether a file was chosen.
 */
function readChosenFile(input, maxBytes, onFile) {
    const files = input.files;
    if (files === null || files.length === 0) {
        input.value = "";
        return false;
    }
    // Clearing the value empties Chrome's live FileList, so keep the File
    // first. Clearing lets the same file be chosen again.
    const file = files[0];
    input.value = "";
    if (file.size === 0 || (maxBytes > 0 && file.size > maxBytes)) {
        let err = "Empty read.";
        if (maxBytes > 0) {
            err = "Expected 1 to " + maxBytes + ", got " + file.size + " bytes.";
        }
        onFile(file, err, null);
        return true;
    }
    io.readFile(file, function (err, buf) {
        if (err !== null) {
            onFile(file, err, null);
            return;
        }
        onFile(file, null, /** @type {ArrayBuffer} */ (buf));
    });
    return true;
}

/**
 * Download image bytes, using `fallback` when the saved name has no leaf.
 *
 * @param {string} savedName
 * @param {Uint8Array} bytes
 * @param {string} fallback
 * @param {function(string): boolean} isName
 * @param {string} extension
 */
function downloadBytes(savedName, bytes, fallback, isName, extension) {
    let name = leafName(savedName);
    if (name === "") {
        name = fallback;
    } else if (!isName(name)) {
        name += extension;
    }
    const buffer = /** @type {ArrayBuffer} */ (bytes.buffer);
    const url = URL.createObjectURL(new Blob([buffer], {type: "application/octet-stream"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
}

/**
 * Last path segment, accepting both URL and Windows separators.
 *
 * @param {string} path
 * @returns {string}
 */
function leafName(path) {
    let name = path;
    const slash = name.lastIndexOf("/");
    if (slash >= 0) {
        name = name.substring(slash + 1);
    }
    const back = name.lastIndexOf("\\");
    if (back >= 0) {
        name = name.substring(back + 1);
    }
    return name;
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
 * Strings are stored as given; switches and numbers are stored as digits.
 * A value equal to the page default removes the parameter.
 *
 * @param {string} name
 * @param {boolean | number | string | null} value
 */
function updateUrlParam(name, value) {
    const url = new URL(window.location.href);
    let text = null;
    if (typeof value === "string") {
        text = value;
    } else if (value !== null) {
        text = String(Number(value));
    }
    if (text === null || text === urlParamDefaults[name]) {
        url.searchParams.delete(name);
    } else {
        url.searchParams.set(name, text);
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

/**
 * Accept a supported mouse model and otherwise leave the mouse disconnected.
 *
 * @param {string} value
 * @returns {number}
 */
function mouseFromParam(value) {
    switch (value) {
    case "qimsi":
        return machine.mouseQimsi;
    case "pe":
        return machine.mousePe;
    case "0":
    default:
        return machine.mouseOff;
    }
}

/**
 * @param {number} model
 * @returns {string}
 */
function mouseParam(model) {
    switch (model) {
    case machine.mouseQimsi:
        return "qimsi";
    case machine.mousePe:
        return "pe";
    default:
        return "0";
    }
}

/**
 * Accept a supported count rate per displayed 512-mode pixel, defaulting to 1.
 *
 * @param {string} value
 * @returns {number}
 */
function mouseSpeedFromParam(value) {
    switch (value) {
    case "2":
        return 2;
    case "4":
        return 4;
    case "1":
    default:
        return 1;
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

/**
 * Apply one mouse switch: at most one model is connected, like the sound cards.
 *
 * @param {HTMLInputElement} changed
 * @param {number} model
 */
function updateMouseSelection(changed, model) {
    if (changed.checked) {
        ui.mouseQimsi.checked = model === machine.mouseQimsi;
        ui.mousePe.checked = model === machine.mousePe;
    }
    const selected = selectedMouseModel();
    updateUrlParam("mouse", mouseParam(selected));
    machine.setMouseModel(ql, selected);
    if (document.pointerLockElement === ui.screen) {
        document.exitPointerLock();
    }
    resetSystem();
}

/** @returns {number} */
function selectedMouseModel() {
    if (ui.mousePe.checked) {
        return machine.mousePe;
    }
    if (ui.mouseQimsi.checked) {
        return machine.mouseQimsi;
    }
    return machine.mouseOff;
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

/**
 * Place the Pointer Environment pointer under the host cursor. The canvas
 * spans 512 columns and 256 rows, or rows 0-191 of a CRT-filtered NTSC field.
 *
 * @param {MouseEvent} e
 */
function movePePointer(e) {
    const rect = ui.screen.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return;
    }
    let rows = guestRows;
    if (ui.crt.checked && ql.frameNtsc) {
        rows = ntscCrtRows;
    }
    const x = Math.floor((e.clientX - rect.left) * guestColumns / rect.width);
    const y = Math.floor((e.clientY - rect.top) * rows / rect.height);
    pe.move(ql.pe, Math.min(Math.max(x, 0), guestColumns - 1), Math.min(Math.max(y, 0), rows - 1));
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
    let ran = 0;
    if (!ui.paused.checked) {
        carryMs += dt;
        while (carryMs >= frameMs && ran < 4) {
            stepTurboGroup();
            carryMs -= frameMs;
            ran += 1;
        }
    }
    syncFrameTiming();
    if (ran < 4) {
        fillSoundQueue();
    }
    refreshMdvActivity(now);
    refreshMountedDrives();
    refreshSoundStatus(now);
    if (gfx !== null) {
        screen.draw(gfx, ql.pixels, ql.frameNtsc, ql.frameVersion);
    }
}

function fillSoundQueue() {
    if (sfx === null || sfx.context.state !== "running" || ui.paused.checked) {
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
    const reading = machine.takeMdvReading(ql);
    const burst = ui.turbo.checked && reading;
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

/**
 * Mount an empty formatted floppy in FLP1 without resetting the machine.
 *
 * @param {boolean} highDensity
 */
function insertNewFloppy(highDensity) {
    const error = disk.insertBlankFloppy(ql.disks.flp, highDensity, "flp1.img");
    if (error !== null) {
        showError(ui.fddInfo, error);
        return;
    }
    refreshMountedDrives();
}

/**
 * Mount an empty formatted hard disk in WIN1 without resetting the machine.
 *
 * @param {number} sectors
 */
function insertNewHardDisk(sectors) {
    const error = disk.insertBlankHardDisk(ql.disks.win, sectors, "win1.win");
    if (error !== null) {
        showError(ui.hddInfo, error);
        return;
    }
    refreshMountedDrives();
}

/** Keep both mounted-drive rows aligned with their images. */
function refreshMountedDrives() {
    refreshDriveStatus(
        ql.disks.win,
        hddStatus,
        ui.hddInfo,
        ui.downloadHdd,
        ui.ejectHdd,
        "No hard disk.",
        "WIN1",
    );
    refreshDriveStatus(
        ql.disks.flp,
        fddStatus,
        ui.fddInfo,
        ui.downloadFdd,
        ui.ejectFdd,
        "No floppy.",
        "FLP1",
    );
}

/**
 * Keep one drive row aligned with its image. Unchanged fields leave the DOM alone.
 *
 * @param {import("./disk.js").State} state
 * @param {DriveStatus} status
 * @param {HTMLElement} infoEl
 * @param {HTMLButtonElement} download
 * @param {HTMLButtonElement} eject
 * @param {string} emptyLabel
 * @param {string} unavailableLabel
 */
function refreshDriveStatus(state, status, infoEl, download, eject, emptyLabel, unavailableLabel) {
    if (
        state.inserted === status.inserted &&
        state.name === status.name &&
        state.modified === status.modified &&
        state.driverReady === status.driverReady &&
        state.generation === status.generation
    ) {
        return;
    }
    let label = emptyLabel;
    if (state.inserted) {
        label = state.name;
        if (state.modified) {
            label += " (modified)";
        }
        if (!state.driverReady) {
            label += " (" + unavailableLabel + " unavailable)";
        }
    }
    showInfo(infoEl, label);
    download.disabled = !state.inserted;
    eject.disabled = !state.inserted;
    status.inserted = state.inserted;
    status.name = state.name;
    status.modified = state.modified;
    status.driverReady = state.driverReady;
    status.generation = state.generation;
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
