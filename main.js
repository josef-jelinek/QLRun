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
const activityHoldMs = 50;
const turboMultiplier = 8;
const sectorsPerMebibyte = 2048;
const sectorBytes = 512;
const guestColumns = 512;
const guestRows = 256;
const ntscCrtRows = 192;
const wheelPixelsPerStep = 100;
const wheelLinesPerStep = 3;
const maxFrameStepMs = 80;
const maxFramesPerRefresh = 4;
const fullRamKb = 896;
const ramBesideSoundCardKb = 640;
/**
 * Page defaults of the URL parameters that the controls write back. A control
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

/**
 * One drive card: its status line, meter, activity light, and file actions.
 *
 * @typedef {{
 *   card: HTMLElement,
 *   info: HTMLElement,
 *   modified: HTMLElement,
 *   led: HTMLElement,
 *   statusLed: HTMLElement,
 *   meter: HTMLElement,
 *   meterBar: HTMLElement,
 *   size: HTMLElement,
 *   free: HTMLElement,
 *   load: HTMLButtonElement,
 *   file: HTMLInputElement,
 *   download: HTMLButtonElement,
 *   eject: HTMLButtonElement,
 * }} DriveControls
 */

/**
 * What a drive card last showed, so unchanged drives leave the DOM alone, and
 * the transfer counts behind its activity light. `spaceWrites` is the write
 * count the space meter shows, or -1 to redraw it; `state` and `lit` are the
 * light's activity and whether a medium is in, and `until` holds a brief
 * transfer visible. `driverReady` and `generation` apply to the hard disk and
 * floppy only.
 *
 * @typedef {{
 *   inserted: boolean,
 *   name: string,
 *   modified: boolean,
 *   driverReady: boolean,
 *   generation: number,
 *   readCount: number,
 *   writeCount: number,
 *   spaceWrites: number,
 *   until: number,
 *   state: string,
 *   lit: boolean,
 * }} DriveStatus
 */

const ui = {
    chipVideoMain:    /** @type {HTMLElement} */       (document.getElementById("chip-video-main")),
    chipVideoSub:     /** @type {HTMLElement} */       (document.getElementById("chip-video-sub")),
    chipRamMain:      /** @type {HTMLElement} */       (document.getElementById("chip-ram-main")),
    chipSoundMain:    /** @type {HTMLElement} */       (document.getElementById("chip-sound-main")),
    chipRomMain:      /** @type {HTMLElement} */       (document.getElementById("chip-rom-main")),
    chipRomSub:       /** @type {HTMLElement} */       (document.getElementById("chip-rom-sub")),
    chipMouse:        /** @type {HTMLElement} */       (document.getElementById("chip-mouse")),
    chipMouseMain:    /** @type {HTMLElement} */       (document.getElementById("chip-mouse-main")),
    tabs: [
        /** @type {HTMLInputElement} */ (document.getElementById("tab-media")),
        /** @type {HTMLInputElement} */ (document.getElementById("tab-roms")),
        /** @type {HTMLInputElement} */ (document.getElementById("tab-hardware")),
        /** @type {HTMLInputElement} */ (document.getElementById("tab-display")),
    ],
    tabPanels:        /** @type {HTMLElement} */       (document.getElementById("tab-panels")),
    initInfo:         /** @type {HTMLElement} */       (document.getElementById("init-info")),
    qsoundInfo:       /** @type {HTMLElement} */       (document.getElementById("qsound-info")),
    audioInfo:        /** @type {HTMLElement} */       (document.getElementById("audio-info")),
    startupFileInfo:  /** @type {HTMLElement} */       (document.getElementById("startup-file-info")),
    dropInfo:         /** @type {HTMLElement} */       (document.getElementById("drop-info")),
    fps:              /** @type {HTMLElement} */       (document.getElementById("fps")),
    cut:              /** @type {HTMLElement} */       (document.getElementById("cut")),
    gap:              /** @type {HTMLElement} */       (document.getElementById("gap")),
    mdv: [
        driveControls("mdv1", "led-mdv1"),
        driveControls("mdv2", "led-mdv2"),
    ],
    newMdv: [
        /** @type {HTMLButtonElement} */ (document.getElementById("new-mdv1")),
        /** @type {HTMLButtonElement} */ (document.getElementById("new-mdv2")),
    ],
    hdd:              driveControls("hdd", "led-win1"),
    newHddMenu:       /** @type {HTMLDetailsElement} */ (document.getElementById("new-hdd-menu")),
    newHdd4:          /** @type {HTMLButtonElement} */ (document.getElementById("new-hdd-4")),
    newHdd16:         /** @type {HTMLButtonElement} */ (document.getElementById("new-hdd-16")),
    fdd:              driveControls("fdd", "led-flp1"),
    newFddMenu:       /** @type {HTMLDetailsElement} */ (document.getElementById("new-fdd-menu")),
    newFddDd:         /** @type {HTMLButtonElement} */ (document.getElementById("new-fdd-dd")),
    newFddHd:         /** @type {HTMLButtonElement} */ (document.getElementById("new-fdd-hd")),
    loadRom:          /** @type {HTMLButtonElement} */ (document.getElementById("load-rom")),
    fileRom:          /** @type {HTMLInputElement} */  (document.getElementById("file-rom")),
    romInfo:          /** @type {HTMLElement} */       (document.getElementById("rom-info")),
    romMinerva:       /** @type {HTMLButtonElement} */ (document.getElementById("rom-minerva")),
    romToolkit2:      /** @type {HTMLButtonElement} */ (document.getElementById("rom-toolkit2")),
    romAuto:          /** @type {HTMLButtonElement} */ (document.getElementById("rom-auto")),
    romAutoBadge:     /** @type {HTMLElement} */       (document.getElementById("rom-auto-badge")),
    romSlots: [
        {
            card:     /** @type {HTMLElement} */       (document.getElementById("rom-cart-card")),
            map:      /** @type {HTMLElement} */       (document.getElementById("map-cart")),
            load:     /** @type {HTMLButtonElement} */ (document.getElementById("load-rom-cart")),
            file:     /** @type {HTMLInputElement} */  (document.getElementById("file-rom-cart")),
            eject:    /** @type {HTMLButtonElement} */ (document.getElementById("eject-rom-cart")),
            info:     /** @type {HTMLElement} */       (document.getElementById("rom-cart-info")),
        },
        {
            card:     /** @type {HTMLElement} */       (document.getElementById("rom-io1-card")),
            map:      /** @type {HTMLElement} */       (document.getElementById("map-io1")),
            load:     /** @type {HTMLButtonElement} */ (document.getElementById("load-rom-io1")),
            file:     /** @type {HTMLInputElement} */  (document.getElementById("file-rom-io1")),
            eject:    /** @type {HTMLButtonElement} */ (document.getElementById("eject-rom-io1")),
            info:     /** @type {HTMLElement} */       (document.getElementById("rom-io1-info")),
        },
        {
            card:     /** @type {HTMLElement} */       (document.getElementById("rom-io2-card")),
            map:      /** @type {HTMLElement} */       (document.getElementById("map-io2")),
            load:     /** @type {HTMLButtonElement} */ (document.getElementById("load-rom-io2")),
            file:     /** @type {HTMLInputElement} */  (document.getElementById("file-rom-io2")),
            eject:    /** @type {HTMLButtonElement} */ (document.getElementById("eject-rom-io2")),
            info:     /** @type {HTMLElement} */       (document.getElementById("rom-io2-info")),
        },
    ],
    paused:           /** @type {HTMLInputElement} */  (document.getElementById("paused")),
    reset:            /** @type {HTMLButtonElement} */ (document.getElementById("reset")),
    monitor:          /** @type {HTMLElement} */       (document.getElementById("monitor")),
    screenInfo:       /** @type {HTMLElement} */       (document.getElementById("screen-info")),
    screenSlot:       /** @type {HTMLElement} */       (document.getElementById("screen-slot")),
    screen:           /** @type {HTMLCanvasElement} */ (document.getElementById("screen")),
    mouseHint:        /** @type {HTMLElement} */       (document.getElementById("mouse-hint")),
    keyboardPanel:    /** @type {HTMLElement} */       (document.getElementById("keyboard-panel")),
    keyboardSplit:    /** @type {HTMLElement} */       (document.getElementById("keyboard-split")),
    keyboard:         /** @type {HTMLElement} */       (document.getElementById("keyboard")),
    keyboardToggle:   /** @type {HTMLInputElement} */  (document.getElementById("keyboard-toggle")),
    crt:              /** @type {HTMLInputElement} */  (document.getElementById("crt")),
    pal:              /** @type {HTMLInputElement} */  (document.getElementById("pal")),
    ntsc:             /** @type {HTMLInputElement} */  (document.getElementById("ntsc")),
    videoDesc:        /** @type {HTMLElement} */       (document.getElementById("video-desc")),
    ram: [
        {kb: 128, input: /** @type {HTMLInputElement} */ (document.getElementById("ram-128"))},
        {kb: 384, input: /** @type {HTMLInputElement} */ (document.getElementById("ram-384"))},
        {kb: 640, input: /** @type {HTMLInputElement} */ (document.getElementById("ram-640"))},
        {kb: 896, input: /** @type {HTMLInputElement} */ (document.getElementById("ram-896"))},
    ],
    ramNote:          /** @type {HTMLElement} */       (document.getElementById("ram-note")),
    qsoundOff:        /** @type {HTMLInputElement} */  (document.getElementById("qsound-off")),
    qsound:           /** @type {HTMLInputElement} */  (document.getElementById("qsound")),
    qsound2:          /** @type {HTMLInputElement} */  (document.getElementById("qsound2")),
    qsoundRomState:   /** @type {HTMLElement} */       (document.getElementById("qsound-rom-state")),
    soundDesc:        /** @type {HTMLElement} */       (document.getElementById("sound-desc")),
    soundNote:        /** @type {HTMLElement} */       (document.getElementById("sound-note")),
    stereo:           /** @type {HTMLInputElement} */  (document.getElementById("stereo")),
    muted:            /** @type {HTMLInputElement} */  (document.getElementById("muted")),
    mouseOff:         /** @type {HTMLInputElement} */  (document.getElementById("mouse-off")),
    mouseQimsi:       /** @type {HTMLInputElement} */  (document.getElementById("mouse-qimsi")),
    mousePe:          /** @type {HTMLInputElement} */  (document.getElementById("mouse-pe")),
    mouseDesc:        /** @type {HTMLElement} */       (document.getElementById("mouse-desc")),
    mouseCursor:      /** @type {HTMLInputElement} */  (document.getElementById("mouse-cursor")),
    turbo:            /** @type {HTMLInputElement} */  (document.getElementById("turbo")),
    stretch:          /** @type {HTMLInputElement} */  (document.getElementById("stretch")),
    fullscreenToggle: /** @type {HTMLButtonElement} */ (document.getElementById("fullscreen-toggle")),
    fullscreenQuick:  /** @type {HTMLButtonElement} */ (document.getElementById("fullscreen-quick")),
    fullscreenCtrl:   /** @type {HTMLButtonElement} */ (document.getElementById("fullscreen-ctrl")),
    drop:             /** @type {HTMLElement} */       (document.getElementById("drop")),
};

const query = new URLSearchParams(window.location.search);
let configuredRomName = query.get("rom") ?? "";
const configuredCartName = query.get("cart") ?? "";
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
for (const option of ui.ram) {
    option.input.checked = option.kb === configuredRamKb;
}
const kbd = keyboard.init(ui.keyboard, keys);

/** @type {import("./screen.js").Gfx | null} */
let gfx = null;
/** @type {import("./sound.js").Sfx | null} */
let sfx = null;
/** @type {(function(): void) | null} */
let abortLoadRom = null;
/**
 * Bumped when a system ROM fetch starts or is canceled, so that a canceled
 * fetch finishes silently.
 */
let systemRomLoads = 0;
/** @type {(function(): void) | null} */
let abortLoadStartupFile = null;
let startupFileCanceled = false;
/** @type {string | null} */
let startupFileName = null;
/** @type {ArrayBuffer | null} */
let startupFileBytes = null;
let startupRomReady = false;
let systemRomFromFile = false;
let systemRomName = "";
let lastNow = 0;
let carryMs = 0;
let framesRun = 0;
let statsAt = 0;
let statsCut = 0;
let statsGap = 0;
/** @type {DriveStatus[]} */
const mdvStatus = [newDriveStatus(), newDriveStatus()];
const hddStatus = newDriveStatus();
const fddStatus = newDriveStatus();
/**
 * Per extension-ROM slot: the image's name, its load error, a generation that
 * makes superseded loads finish silently, and the `roms/` name of a bundled
 * image, or "".
 */
const romSlotStates = [
    {name: "", error: "", generation: 0, bundled: ""},
    {name: "", error: "", generation: 0, bundled: ""},
    {name: "", error: "", generation: 0, bundled: ""},
];
const cartridgeSlot = 0;
let wheelSteps = 0;
let screenOnly = false;
let screenOnlyFallback = false;
let shownMode8 = false;
let dragDepth = 0;
let splitStartY = 0;
let splitStartHeight = 0;
let splitMaxHeight = 0;

const ntscOn = (query.get("ntsc") ?? "") === "1";
ui.ntsc.checked = ntscOn;
ui.pal.checked = !ntscOn;
machine.setNtsc(ql, ntscOn);
let frameMs = 1000 / machine.frameHz(ql);

applySwitchParam(ui.keyboardToggle, "keyboard");
applySwitchParam(ui.crt, "crt");
switch (query.get("qsound") ?? "") {
case "0":
    ui.qsoundOff.checked = true;
    break;
case "2":
    ui.qsound2.checked = true;
    break;
default:
    break;
}
applySwitchParam(ui.stereo, "stereo");
applySwitchParam(ui.muted, "muted");
ui.mouseQimsi.checked = configuredMouseModel === machine.mouseQimsi;
ui.mousePe.checked = configuredMouseModel === machine.mousePe;
ui.mouseOff.checked = configuredMouseModel === machine.mouseOff;
applySwitchParam(ui.mouseCursor, "mcursor");
applySwitchParam(ui.turbo, "turbo");
applySwitchParam(ui.stretch, "stretch");
ui.paused.checked = false;
applyVisibility();
machine.setMouseModel(ql, configuredMouseModel);
refreshSummary();
refreshSystemRom();

ui.reset.onclick = resetSystem;

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

ui.qsoundOff.onchange = selectSoundCard;
ui.qsound.onchange = selectSoundCard;
ui.qsound2.onchange = selectSoundCard;
ui.pal.onchange = selectVideoStandard;
ui.ntsc.onchange = selectVideoStandard;
for (const option of ui.ram) {
    option.input.onchange = selectRamSize;
}
ui.mouseOff.onchange = selectMouse;
ui.mouseQimsi.onchange = selectMouse;
ui.mousePe.onchange = selectMouse;

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

ui.fullscreenToggle.onclick = toggleCanvasFullscreen;
ui.fullscreenQuick.onclick = toggleCanvasFullscreen;
ui.fullscreenCtrl.onclick = toggleCanvasFullscreen;

ui.screen.onmousedown = function (/** @type {MouseEvent} */ e) {
    // Keys go to the QL after a click on the screen, even where the mouse
    // models below keep the click from moving the page focus.
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
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
    // Dragging up by a pixel grows the face by a pixel, down to a minimum
    // screen window above it.
    splitStartY = e.clientY;
    splitStartHeight = keyboard.faceHeight(ui.keyboard);
    const monitorSlack = ui.monitor.getBoundingClientRect().height - parseFloat(getComputedStyle(ui.monitor).minHeight);
    splitMaxHeight = splitStartHeight + Math.max(monitorSlack, 0);
    ui.keyboardSplit.setPointerCapture(e.pointerId);
};

ui.keyboardSplit.onpointermove = function (/** @type {PointerEvent} */ e) {
    if (ui.keyboardSplit.hasPointerCapture(e.pointerId)) {
        keyboard.setFaceHeight(ui.keyboard, splitStartHeight + splitStartY - e.clientY, splitMaxHeight);
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
    if (!isTabKey(e)) {
        keyboard.handleKeyDown(kbd, e);
    }
};

window.onpointerdown = function (e) {
    if (sfx !== null) {
        sound.resume(sfx);
    }
    closeMenuOutside(ui.newHddMenu, e.target);
    closeMenuOutside(ui.newFddMenu, e.target);
};

window.onkeyup = function (e) {
    if (e.code === "F11") {
        e.preventDefault();
        return;
    }
    if (!isTabKey(e) || kbd.hostHeld.includes(e.code)) {
        keyboard.handleKeyUp(kbd, e);
    }
};

window.onblur = function () {
    keyboard.handleBlur(kbd);
};

window.ondragenter = function (e) {
    if (!carriesFiles(e)) {
        return;
    }
    e.preventDefault();
    dragDepth += 1;
    ui.drop.classList.add("on");
};

window.ondragover = function (e) {
    if (!carriesFiles(e)) {
        return;
    }
    e.preventDefault();
    if (e.dataTransfer !== null) {
        e.dataTransfer.dropEffect = "copy";
    }
};

window.ondragleave = function (e) {
    if (!carriesFiles(e)) {
        return;
    }
    dragDepth = Math.max(dragDepth - 1, 0);
    if (dragDepth === 0) {
        ui.drop.classList.remove("on");
    }
};

window.ondrop = function (e) {
    if (!carriesFiles(e) || e.dataTransfer === null) {
        return;
    }
    e.preventDefault();
    dragDepth = 0;
    ui.drop.classList.remove("on");
    if (e.dataTransfer.files.length > 0) {
        loadDroppedFile(e.dataTransfer.files[0]);
    }
};

for (let drive = 0; drive < ui.mdv.length; drive += 1) {
    const controls = ui.mdv[drive];
    ui.newMdv[drive].onclick = function () {
        if (drive === 0) {
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
        const chosen = readChosenFile(
            controls.file,
            0,
            function (file, err, buf) {
                if (err !== null || buf === null) {
                    showReadError(controls.info, err);
                    return;
                }
                insertMdvFile(drive, file.name, buf);
            },
        );
        if (chosen && drive === 0) {
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
            cancelStartupFile();
        }
        machine.ejectMdv(ql, drive);
    };
}

ui.loadRom.onclick = function () {
    ui.fileRom.click();
};

ui.fileRom.onchange = function () {
    readChosenFile(
        ui.fileRom,
        0,
        function (file, err, buf) {
            if (err !== null || buf === null) {
                showReadError(ui.romInfo, err);
                return;
            }
            installSystemRomFile(file.name, buf);
        },
    );
};

ui.romMinerva.onclick = function () {
    configuredRomName = "minerva";
    systemRomFromFile = false;
    updateUrlParam("rom", configuredRomName);
    refreshSystemRom();
    loadSystemRom();
};

ui.romAuto.onclick = function () {
    configuredRomName = "";
    systemRomFromFile = false;
    updateUrlParam("rom", null);
    refreshSystemRom();
    loadSystemRom();
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
        readChosenFile(
            controls.file,
            machine.romCartridgeSize,
            function (file, err, buf) {
                if (state.generation !== generation) {
                    return;
                }
                if (err === null && buf !== null) {
                    err = machine.insertRomCartridge(ql, buf, slot);
                }
                if (err === null) {
                    state.error = "";
                    state.name = file.name;
                    forgetBundledRom(slot);
                    resetSystem();
                } else {
                    state.error = err;
                }
                refreshRomSlotStatus(slot);
            },
        );
    };
    controls.eject.onclick = function () {
        state.generation += 1;
        machine.ejectRomCartridge(ql, slot);
        state.name = "";
        state.error = "";
        forgetBundledRom(slot);
        resetSystem();
        refreshRomSlotStatus(slot);
    };
    refreshRomSlotStatus(slot);
}

ui.romToolkit2.onclick = function () {
    updateUrlParam("cart", "tk2");
    loadBundledCartridge("tk2");
};

if (configuredCartName !== "") {
    loadBundledCartridge(configuredCartName);
}

ui.newHdd4.onclick = function () {
    ui.newHddMenu.open = false;
    insertNewHardDisk(4 * sectorsPerMebibyte);
};

ui.newHdd16.onclick = function () {
    ui.newHddMenu.open = false;
    insertNewHardDisk(disk.maxReportedSectors);
};

ui.newFddDd.onclick = function () {
    ui.newFddMenu.open = false;
    insertNewFloppy(false);
};

ui.newFddHd.onclick = function () {
    ui.newFddMenu.open = false;
    insertNewFloppy(true);
};

const diskDrives = [
    {state: ql.disks.win, controls: ui.hdd, menu: ui.newHddMenu, fallbackName: "win1.win", isName: media.isWinName, extension: ".win"},
    {state: ql.disks.flp, controls: ui.fdd, menu: ui.newFddMenu, fallbackName: "flp1.img", isName: media.isImgName, extension: ".img"},
];
for (const drive of diskDrives) {
    const controls = drive.controls;
    drive.menu.ontoggle = function () {
        placeMenu(drive.menu);
    };
    controls.load.onclick = function () {
        controls.file.click();
    };
    controls.file.onchange = function () {
        readChosenFile(
            controls.file,
            0,
            function (file, err, buf) {
                if (err !== null || buf === null) {
                    showReadError(controls.info, err);
                    return;
                }
                insertDiskFile(drive.state, controls, file.name, buf);
            },
        );
    };
    controls.download.onclick = function () {
        const saved = disk.save(drive.state);
        if (saved === null) {
            return;
        }
        downloadBytes(saved.name, saved.bytes, drive.fallbackName, drive.isName, drive.extension);
    };
    controls.eject.onclick = function () {
        disk.eject(drive.state);
    };
}

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
    function (err, initializedSfx) {
        if (err !== null) {
            showError(ui.audioInfo, "No sound: " + err);
            return;
        }
        if (initializedSfx === null) {
            showError(ui.audioInfo, "No sound.");
            return;
        }
        sfx = initializedSfx;
        sound.setStereo(initializedSfx, ui.stereo.checked);
        sound.setMuted(initializedSfx, ui.muted.checked);
        machine.setSoundRate(ql, initializedSfx.context.sampleRate);
    },
);

boot.loadRom(
    boot.qsoundRomUrl,
    machine.qsoundRomSize,
    function (err, rom) {
        if (rom === null) {
            ui.qsoundOff.checked = true;
            let message = "QSound ROM unavailable.";
            if (err !== null) {
                message = err;
            }
            showError(ui.qsoundInfo, message);
            showError(ui.qsoundRomState, "ROM unavailable");
        } else {
            const romErr = machine.setQsoundRom(ql, rom);
            if (romErr !== null) {
                ui.qsoundOff.checked = true;
                showError(ui.qsoundInfo, "QSound: " + romErr);
                showError(ui.qsoundRomState, "ROM unusable");
            } else {
                fitRamBesideSoundCard();
                machine.setQsoundModel(ql, selectedQsoundModel());
                ui.qsound.disabled = false;
                ui.qsound2.disabled = false;
                showInfo(ui.qsoundRomState, "ROM loaded");
            }
        }
        refreshSummary();
        if (systemRomFromFile) {
            resetSystem();
        } else {
            loadSystemRom();
        }
    },
);

const startupFileUrl = query.get("url") ?? "";
if (startupFileUrl !== "") {
    abortLoadStartupFile = load.fromUrl(
        startupFileUrl,
        function (err, name, bytes) {
            abortLoadStartupFile = null;
            if (startupFileCanceled) {
                return;
            }
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

/**
 * Collect one drive card's elements around its base id, for example
 * `mdv1-info` and `load-mdv1`, plus its light in the status bar.
 *
 * @param {string} base
 * @param {string} statusLedId
 * @returns {DriveControls}
 */
function driveControls(base, statusLedId) {
    const prefix = base + "-";
    const suffix = "-" + base;
    return {
        card: /** @type {HTMLElement} */ (document.getElementById(base + "-card")),
        info: /** @type {HTMLElement} */ (document.getElementById(prefix + "info")),
        modified: /** @type {HTMLElement} */ (document.getElementById(prefix + "modified")),
        led: /** @type {HTMLElement} */ (document.getElementById(prefix + "led")),
        statusLed: /** @type {HTMLElement} */ (document.getElementById(statusLedId)),
        meter: /** @type {HTMLElement} */ (document.getElementById(prefix + "meter")),
        meterBar: /** @type {HTMLElement} */ (document.getElementById(prefix + "meter-bar")),
        size: /** @type {HTMLElement} */ (document.getElementById(prefix + "size")),
        free: /** @type {HTMLElement} */ (document.getElementById(prefix + "free")),
        load: /** @type {HTMLButtonElement} */ (document.getElementById("load" + suffix)),
        file: /** @type {HTMLInputElement} */ (document.getElementById("file" + suffix)),
        download: /** @type {HTMLButtonElement} */ (document.getElementById("download" + suffix)),
        eject: /** @type {HTMLButtonElement} */ (document.getElementById("eject" + suffix)),
    };
}

/** @returns {DriveStatus} */
function newDriveStatus() {
    return {
        inserted: false,
        name: "",
        modified: false,
        driverReady: false,
        generation: 1,
        readCount: 0,
        writeCount: 0,
        spaceWrites: -1,
        until: 0,
        state: "idle",
        lit: false,
    };
}

/**
 * Report whether a key belongs to a focused tab switch: the arrows, Space,
 * Enter, and Tab keep their native behavior, and other keys reach the QL.
 *
 * @param {KeyboardEvent} e
 * @returns {boolean}
 */
function isTabKey(e) {
    if (!ui.tabs.includes(/** @type {HTMLInputElement} */ (e.target))) {
        return false;
    }
    switch (e.code) {
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown":
    case "Space":
    case "Enter":
    case "Tab":
        return true;
    default:
        return false;
    }
}

/**
 * Fetch `roms/<name>.rom` into the cartridge slot and restart the QL, for
 * `?cart=` and the Toolkit II button. A later load or Eject there makes the
 * fetch finish silently.
 *
 * @param {string} name
 */
function loadBundledCartridge(name) {
    const state = romSlotStates[cartridgeSlot];
    state.generation += 1;
    const generation = state.generation;
    const fileName = name + ".rom";
    if (!/^[A-Za-z0-9]+$/.test(name)) {
        state.error = "Invalid cartridge ROM name.";
        refreshRomSlotStatus(cartridgeSlot);
        return;
    }
    boot.loadRom(
        "roms/" + fileName,
        machine.romCartridgeSize,
        function (err, rom) {
            if (state.generation !== generation) {
                return;
            }
            let error = err;
            if (error === null && rom !== null) {
                error = machine.insertRomCartridge(ql, rom, cartridgeSlot);
            }
            if (error === null) {
                state.error = "";
                state.name = fileName;
                state.bundled = name;
                resetSystem();
            } else {
                state.error = error;
            }
            refreshRomSlotStatus(cartridgeSlot);
        },
    );
}

/**
 * A local image or Eject replaces a bundled ROM, and for the cartridge slot
 * drops `cart` from the URL.
 *
 * @param {number} slot
 */
function forgetBundledRom(slot) {
    romSlotStates[slot].bundled = "";
    if (slot === cartridgeSlot) {
        updateUrlParam("cart", null);
    }
}

/**
 * Show a ROM slot's state: its name or error, whether it can be ejected, and
 * whether the address map shows it filled.
 *
 * @param {number} slot
 */
function refreshRomSlotStatus(slot) {
    const controls = ui.romSlots[slot];
    const state = romSlotStates[slot];
    controls.eject.disabled = state.name === "";
    if (slot === cartridgeSlot) {
        ui.romToolkit2.disabled = state.bundled === "tk2";
    }
    if (state.name === "") {
        controls.card.classList.add("empty");
        controls.map.classList.remove("full");
    } else {
        controls.card.classList.remove("empty");
        controls.map.classList.add("full");
    }
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
    readLocalFile(
        file,
        maxBytes,
        function (err, buf) {
            onFile(file, err, buf);
        },
    );
    return true;
}

/**
 * Route a dropped file to the drive or ROM its name belongs to: `.mdv` to
 * MDV1, or MDV2 while MDV1 holds a cartridge; the first `.mdv` in a `.zip`
 * likewise; `.win` to WIN1; `.img` to FLP1; `.rom` and `.bin` to the system ROM.
 *
 * @param {File} file
 */
function loadDroppedFile(file) {
    const name = file.name;
    showInfo(ui.dropInfo, "");
    const zip = media.isZipName(name);
    if (!zip && !media.isMdvName(name) && !media.isWinName(name) && !media.isImgName(name) && !media.isRomName(name)) {
        showError(ui.dropInfo, "Unsupported file type: " + name + ".");
        return;
    }
    let maxBytes = 0;
    if (zip) {
        maxBytes = load.maxZipBytes;
    }
    readLocalFile(
        file,
        maxBytes,
        function (err, buf) {
            if (err !== null || buf === null) {
                showReadError(ui.dropInfo, err);
                return;
            }
            if (zip) {
                load.zipMember(
                    buf,
                    "",
                    function (zipErr, memberName, bytes) {
                        if (zipErr !== null || memberName === null || bytes === null) {
                            showReadError(ui.dropInfo, zipErr);
                            return;
                        }
                        insertDroppedMdv(memberName, bytes);
                    },
                );
            } else if (media.isMdvName(name)) {
                insertDroppedMdv(name, buf);
            } else if (media.isWinName(name)) {
                insertDiskFile(ql.disks.win, ui.hdd, name, buf);
            } else if (media.isImgName(name)) {
                insertDiskFile(ql.disks.flp, ui.fdd, name, buf);
            } else {
                installSystemRomFile(name, buf);
            }
        },
    );
}

/**
 * Read a local file from a picker or a drop, with the same size checks.
 *
 * @param {File} file
 * @param {number} maxBytes
 * @param {function(string | null, ArrayBuffer | null): void} onDone
 */
function readLocalFile(file, maxBytes, onDone) {
    if (file.size === 0 || (maxBytes > 0 && file.size > maxBytes)) {
        let err = "Empty read.";
        if (maxBytes > 0) {
            err = "Expected 1 to " + maxBytes + ", got " + file.size + " bytes.";
        }
        onDone(err, null);
        return;
    }
    io.readFile(file, onDone);
}

/**
 * @param {HTMLElement} el
 * @param {string | null} err
 */
function showReadError(el, err) {
    let message = "Empty read.";
    if (err !== null) {
        message = err;
    }
    showError(el, message);
}

/**
 * Mount a hard disk or floppy image without resetting the machine.
 *
 * @param {import("./disk.js").State} state
 * @param {DriveControls} controls
 * @param {string} name
 * @param {ArrayBuffer} buf
 */
function insertDiskFile(state, controls, name, buf) {
    const diskErr = disk.insert(state, buf, name);
    if (diskErr !== null) {
        showError(controls.info, diskErr);
    }
}

/**
 * Install a local system ROM in place of the automatic one, then restart.
 *
 * @param {string} name
 * @param {ArrayBuffer} buf
 */
function installSystemRomFile(name, buf) {
    const romErr = machine.setSysRom(ql, buf);
    if (romErr !== null) {
        showError(ui.romInfo, romErr);
        return;
    }
    cancelSystemRomLoad();
    updateUrlParam("rom", null);
    systemRomFromFile = true;
    resetSystem();
    showSystemRom(name);
    markSystemRomReady();
}

/**
 * Insert a dropped Microdrive image into MDV1, or MDV2 while MDV1 holds a
 * cartridge. The drive is chosen once the image is read, so quick successive
 * drops fill both drives.
 *
 * @param {string} name
 * @param {ArrayBuffer} buf
 */
function insertDroppedMdv(name, buf) {
    let drive = 0;
    if (machine.mdvInfo(ql, 0).inserted) {
        drive = 1;
    }
    if (drive === 0) {
        cancelStartupFile();
    }
    insertMdvFile(drive, name, buf);
}

/**
 * @param {DragEvent} e
 * @returns {boolean}
 */
function carriesFiles(e) {
    return e.dataTransfer !== null && e.dataTransfer.types.includes("Files");
}

/**
 * Open a New menu upward when the settings panel has no room below it.
 *
 * @param {HTMLDetailsElement} menu
 */
function placeMenu(menu) {
    menu.classList.remove("up");
    if (!menu.open) {
        return;
    }
    const list = menu.lastElementChild;
    if (list === null) {
        return;
    }
    if (list.getBoundingClientRect().bottom > ui.tabPanels.getBoundingClientRect().bottom) {
        menu.classList.add("up");
    }
}

/**
 * @param {HTMLDetailsElement} menu
 * @param {EventTarget | null} target
 */
function closeMenuOutside(menu, target) {
    if (menu.open && !(target instanceof Node && menu.contains(target))) {
        menu.open = false;
    }
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
 * Set a switch from its URL parameter: `1` turns it on, `0` off, and an absent
 * or invalid value keeps the page default.
 *
 * @param {HTMLInputElement} input
 * @param {string} name
 */
function applySwitchParam(input, name) {
    const value = query.get(name) ?? "";
    if (value === "0" || value === "1") {
        input.checked = value === "1";
    }
}

/**
 * Accept a supported whole-KiB RAM size and otherwise use the stock size.
 *
 * @param {string} value
 * @returns {number}
 */
function ramKbFromParam(value) {
    for (const option of ui.ram) {
        if (String(option.kb) === value) {
            return option.kb;
        }
    }
    return machine.defaultRamKb;
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
    default:
        return machine.mouseOff;
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
    default:
        return 1;
    }
}

/** Switch PAL/NTSC timing, reset, and follow it with the automatic ROM. */
function selectVideoStandard() {
    updateUrlParam("ntsc", ui.ntsc.checked);
    machine.setNtsc(ql, ui.ntsc.checked);
    resetSystem();
    syncFrameTiming();
    refreshSummary();
    // Only the automatic system ROM follows the video standard.
    if (configuredRomName === "" && !systemRomFromFile) {
        loadSystemRom();
    }
}

/**
 * Fetch and install the `?rom=` or automatic system ROM: at startup once the
 * sound card is set up, after Auto, and when the video standard changes it.
 */
function loadSystemRom() {
    cancelSystemRomLoad();
    const romLoad = systemRomLoads;
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
        if (romLoad !== systemRomLoads) {
            return;
        }
        abortLoadRom = null;
        if (rom !== null) {
            const romErr = machine.setSysRom(ql, rom);
            if (romErr === null) {
                resetSystem();
                showSystemRom(name);
            } else {
                showError(ui.romInfo, romErr);
            }
        } else if (err !== null) {
            showError(ui.romInfo, err);
        }
        markSystemRomReady();
    }
}

/** Stop a system ROM fetch that a local ROM or a newer choice replaces. */
function cancelSystemRomLoad() {
    systemRomLoads += 1;
    if (abortLoadRom !== null) {
        abortLoadRom();
        abortLoadRom = null;
    }
}

/**
 * Let a waiting `?url=` Microdrive image in once the system ROM load has
 * settled, installed or failed.
 */
function markSystemRomReady() {
    startupRomReady = true;
    if (startupFileName !== null && startupFileBytes !== null) {
        applyStartupFile(startupFileName, startupFileBytes);
    }
}

/**
 * Show the installed system ROM, which also names the summary chip.
 *
 * @param {string} name
 */
function showSystemRom(name) {
    systemRomName = name;
    showInfo(ui.romInfo, name);
    refreshSystemRom();
}

/** Reflect whether the system ROM follows PAL/NTSC, is Minerva, or was chosen. */
function refreshSystemRom() {
    const automatic = configuredRomName === "" && !systemRomFromFile;
    ui.romAutoBadge.hidden = !automatic;
    ui.romAuto.disabled = automatic;
    ui.romMinerva.disabled = configuredRomName === "minerva" && !systemRomFromFile;
    let name = systemRomName;
    if (name === "") {
        name = "no ROM";
    }
    ui.chipRomMain.textContent = name;
    ui.chipRomSub.hidden = !automatic;
}

/**
 * Apply the chosen memory size and restart the QL. 896K reaches the sound
 * card's 0xC0000, so it removes a fitted card.
 */
function selectRamSize() {
    ui.ramNote.hidden = true;
    ui.soundNote.hidden = true;
    if (selectedRamKb() === fullRamKb && selectedQsoundModel() !== machine.qsoundOff) {
        ui.qsoundOff.checked = true;
        machine.setQsoundModel(ql, machine.qsoundOff);
        updateUrlParam("qsound", machine.qsoundOff);
        ui.ramNote.hidden = false;
    }
    applyRamSize();
    refreshSummary();
    resetSystem();
}

/**
 * Fit the chosen sound card and restart the QL. A card needs 0xC0000, so 896K
 * drops to 640K.
 */
function selectSoundCard() {
    ui.ramNote.hidden = true;
    ui.soundNote.hidden = true;
    fitRamBesideSoundCard();
    const selected = selectedQsoundModel();
    updateUrlParam("qsound", selected);
    machine.setQsoundModel(ql, selected);
    refreshSummary();
    resetSystem();
}

/** Connect the chosen mouse model, releasing any capture, and restart. */
function selectMouse() {
    const selected = selectedMouseModel();
    updateUrlParam("mouse", mouseParam(selected));
    machine.setMouseModel(ql, selected);
    if (document.pointerLockElement === ui.screen) {
        document.exitPointerLock();
    }
    refreshSummary();
    resetSystem();
}

/**
 * Keep the summary chips, screen title, and choice descriptions in step with
 * the hardware controls.
 */
function refreshSummary() {
    let standard = "PAL";
    ui.videoDesc.textContent = "UK/European 50 Hz timing, and js.rom while the system ROM is automatic.";
    if (ui.ntsc.checked) {
        standard = "NTSC";
        ui.videoDesc.textContent = "US clocks with 60 Hz fields in TV mode (F2), and jsu.rom while the system ROM is automatic.";
    }
    ui.chipVideoMain.textContent = standard;
    ui.chipRamMain.textContent = selectedRamKb() + "K";
    const soundModel = selectedQsoundModel();
    switch (soundModel) {
    case machine.qsoundOriginal:
        ui.chipSoundMain.textContent = "QSound";
        ui.soundDesc.textContent = "MC6821 and AY-3-8910 PSG: three square-wave channels and noise.";
        break;
    case machine.qsound2:
        ui.chipSoundMain.textContent = "QSound2";
        ui.soundDesc.textContent = "YM2203: the same PSG plus three FM channels from a 2 MHz clock.";
        break;
    default:
        ui.chipSoundMain.textContent = "No card";
        ui.soundDesc.textContent = "No sound card; only the IPC beeper plays.";
        break;
    }
    ui.stereo.disabled = soundModel === machine.qsoundOff;
    const mouse = selectedMouseModel();
    ui.mouseCursor.disabled = mouse !== machine.mousePe;
    ui.chipMouse.hidden = mouse === machine.mouseOff;
    ui.mouseHint.hidden = mouse === machine.mouseOff;
    switch (mouse) {
    case machine.mouseQimsi:
        ui.chipMouseMain.textContent = "QIMSI";
        ui.mouseDesc.textContent = "A PS/2 mouse on the QIMSI registers in the ROM port.";
        ui.mouseHint.textContent = "Click the screen to capture the mouse; Esc releases it.";
        break;
    case machine.mousePe:
        ui.chipMouseMain.textContent = "PE";
        ui.mouseDesc.textContent = "The Pointer Environment pointer follows the host cursor, with no capture.";
        ui.mouseHint.textContent = "The QL pointer follows your cursor once the Pointer Environment is loaded.";
        break;
    default:
        ui.mouseDesc.textContent = "No mouse is connected.";
        break;
    }
    refreshScreenInfo();
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

/**
 * A fitted sound card needs 0xC0000, so 896K drops to 640K, and the note says so.
 */
function fitRamBesideSoundCard() {
    if (selectedQsoundModel() === machine.qsoundOff || selectedRamKb() !== fullRamKb) {
        return;
    }
    for (const option of ui.ram) {
        option.input.checked = option.kb === ramBesideSoundCardKb;
    }
    applyRamSize();
    ui.soundNote.hidden = false;
}

/** Apply the chosen memory size and reflect it in the URL. */
function applyRamSize() {
    const ramKb = selectedRamKb();
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

/** Drop the `?url=` startup file, fetched or still loading, and its parameter. */
function cancelStartupFile() {
    updateUrlParam("url", null);
    startupFileCanceled = true;
    if (abortLoadStartupFile !== null) {
        abortLoadStartupFile();
        abortLoadStartupFile = null;
    }
    startupFileName = null;
    startupFileBytes = null;
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
 * Insert the URL-supplied Microdrive image into MDV1 once the system ROM load
 * has settled; `load.fromUrl` only delivers `.mdv` images.
 *
 * @param {string} name
 * @param {ArrayBuffer} bytes
 */
function applyStartupFile(name, bytes) {
    startupFileName = null;
    startupFileBytes = null;
    insertMdvFile(0, name, bytes);
}

/**
 * Insert a Microdrive image and show its name; the next frame refreshes the
 * rest of the card.
 *
 * @param {number} drive
 * @param {string} name
 * @param {ArrayBuffer} buf
 */
function insertMdvFile(drive, name, buf) {
    const mdvErr = machine.insertMdv(ql, drive, buf, name);
    if (mdvErr !== null) {
        showError(ui.mdv[drive].info, mdvErr);
        return;
    }
    showInfo(ui.mdv[drive].info, name);
    showInfo(ui.startupFileInfo, "");
}

/**
 * Enter or leave fullscreen with the screen slot. Where fullscreen is missing
 * or refused, the page shows only the screen instead.
 */
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

    if (ui.screenSlot.requestFullscreen === undefined) {
        screenOnlyFallback = true;
        screenOnly = true;
        applyVisibility();
        return;
    }
    ui.screenSlot.requestFullscreen().then(
        function () {},
        function () {
            screenOnlyFallback = true;
            screenOnly = true;
            applyVisibility();
        },
    );
}

/**
 * Show only the screen in screen-only mode, and the keyboard window while it
 * is switched on. The screen slot's ResizeObserver refits the canvas.
 */
function applyVisibility() {
    if (screenOnly) {
        document.body.classList.add("screen-only");
    } else {
        document.body.classList.remove("screen-only");
    }
    ui.keyboardPanel.hidden = screenOnly || !ui.keyboardToggle.checked;
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

/**
 * Run fields at the ZX8301 field rate on each display refresh: the elapsed
 * time, capped at `maxFrameStepMs`, runs up to `maxFramesPerRefresh` fields
 * and carries at most one field's time over. The audio queue may ask for
 * more; then the cards, stats, and screen are refreshed.
 *
 * @param {number} now
 */
function onFrame(now) {
    requestAnimationFrame(onFrame);
    if (lastNow === 0) {
        lastNow = now;
        carryMs = frameMs;
    }
    const dt = Math.min(now - lastNow, maxFrameStepMs);
    lastNow = now;
    let ran = 0;
    if (!ui.paused.checked) {
        carryMs += dt;
        while (carryMs >= frameMs && ran < maxFramesPerRefresh) {
            stepTurboGroup();
            carryMs -= frameMs;
            ran += 1;
        }
        // Past one field, time the refresh cap left over is dropped rather than
        // replayed later.
        carryMs = Math.min(carryMs, frameMs);
    }
    syncFrameTiming();
    if (ran < maxFramesPerRefresh) {
        fillSoundQueue();
    }
    refreshMdvCards(now);
    refreshDiskCard(ql.disks.win, hddStatus, ui.hdd, now, "No hard disk.", "WIN1");
    refreshDiskCard(ql.disks.flp, fddStatus, ui.fdd, now, "No floppy.", "FLP1");
    refreshStats(now);
    if (ql.displayMode8 !== shownMode8) {
        refreshScreenInfo();
    }
    if (gfx !== null) {
        screen.draw(gfx, ql.pixels, ql.frameNtsc, ql.frameVersion);
    }
}

/** Name the display mode, timing, and memory in the screen window title. */
function refreshScreenInfo() {
    shownMode8 = ql.displayMode8;
    let mode = "MODE 4";
    if (shownMode8) {
        mode = "MODE 8";
    }
    let standard = "PAL";
    if (ui.ntsc.checked) {
        standard = "NTSC";
    }
    ui.screenInfo.textContent = mode + " · " + standard + " · " + selectedRamKb() + "K";
}

/** @returns {number} */
function selectedRamKb() {
    for (const option of ui.ram) {
        if (option.input.checked) {
            return option.kb;
        }
    }
    return machine.defaultRamKb;
}

/** Follow the current PAL or US ZX8301 field rate, and show it on the video chip. */
function syncFrameTiming() {
    const hz = machine.frameHz(ql);
    frameMs = 1000 / hz;
    if (sfx !== null) {
        sound.setFrameRate(sfx, hz);
    }
    const label = Math.round(hz) + " Hz";
    if (ui.chipVideoSub.textContent !== label) {
        ui.chipVideoSub.textContent = label;
    }
}

/**
 * Run up to `maxFramesPerRefresh` frames ahead of the display clock while the
 * audio queue wants more, on each request from the audio thread and after each
 * refresh. The borrowed time comes out of the frame carry, which may run
 * negative down to its floor.
 */
function fillSoundQueue() {
    if (sfx === null || sfx.context.state !== "running" || ui.paused.checked) {
        return;
    }
    for (let ran = 0; ran < maxFramesPerRefresh && sound.wantsFrame(sfx); ran += 1) {
        stepTurboGroup();
        carryMs = Math.max(carryMs - frameMs, carryFloorMs);
    }
}

/**
 * Run one visible field, after `turboMultiplier - 1` hidden ones when Turbo is
 * on and a Microdrive read happened during the previous group. Taking the
 * read flag clears it, so Turbo stops with the last transfer.
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
 * Keep both Microdrive cards aligned with their cartridges, holding brief
 * transfers visible on the activity lights.
 *
 * @param {number} now
 */
function refreshMdvCards(now) {
    for (let drive = 0; drive < ui.mdv.length; drive += 1) {
        const controls = ui.mdv[drive];
        const status = mdvStatus[drive];
        const info = machine.mdvInfo(ql, drive);
        // The counts restart with each cartridge, so only a rise is activity.
        let activity = status.state;
        if (info.writing || info.writeCount > status.writeCount) {
            activity = "write";
            status.until = now + activityHoldMs;
        } else if (info.readCount > status.readCount) {
            activity = "read";
            status.until = now + activityHoldMs;
        } else if (now >= status.until) {
            activity = "idle";
            if (info.motorOn) {
                activity = "motor";
            }
        }
        status.readCount = info.readCount;
        if (
            info.inserted !== status.inserted ||
            info.name !== status.name ||
            info.modified !== status.modified
        ) {
            showDrive(controls, info.inserted, info.name, info.modified, "No cartridge.");
            status.inserted = info.inserted;
            status.name = info.name;
            status.modified = info.modified;
            status.spaceWrites = -1;
        }
        if (status.spaceWrites !== info.writeCount && activity !== "write") {
            const space = machine.mdvSpace(ql, drive);
            if (space === null) {
                showSpace(controls, 0, 0);
            } else {
                showSpace(controls, space.free, space.good);
            }
            status.spaceWrites = info.writeCount;
        }
        status.writeCount = info.writeCount;
        showActivity(controls, status, activity, info.inserted, "MDV" + (drive + 1));
    }
}

/**
 * Mount an empty formatted floppy in FLP1 without resetting the machine.
 *
 * @param {boolean} highDensity
 */
function insertNewFloppy(highDensity) {
    disk.insertBlankFloppy(ql.disks.flp, highDensity, "flp1.img");
}

/**
 * Mount an empty formatted hard disk in WIN1 without resetting the machine.
 *
 * @param {number} sectors
 */
function insertNewHardDisk(sectors) {
    disk.insertBlankHardDisk(ql.disks.win, sectors, "win1.win");
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
 * Keep one hard disk or floppy card aligned with its image. Unchanged fields
 * leave the DOM alone; the meter follows writes once they settle.
 *
 * @param {import("./disk.js").State} state
 * @param {DriveStatus} status
 * @param {DriveControls} controls
 * @param {number} now
 * @param {string} emptyLabel
 * @param {string} driveName
 */
function refreshDiskCard(state, status, controls, now, emptyLabel, driveName) {
    const info = disk.info(state);
    let activity = status.state;
    if (info.writeCount !== status.writeCount) {
        activity = "write";
        status.until = now + activityHoldMs;
    } else if (info.readCount !== status.readCount) {
        activity = "read";
        status.until = now + activityHoldMs;
    } else if (now >= status.until) {
        activity = "idle";
    }
    status.readCount = info.readCount;
    status.writeCount = info.writeCount;
    if (
        info.inserted !== status.inserted ||
        info.name !== status.name ||
        info.modified !== status.modified ||
        info.driverReady !== status.driverReady ||
        info.generation !== status.generation
    ) {
        let name = info.name;
        if (info.inserted && !info.driverReady) {
            name += " (" + driveName + " unavailable)";
        }
        showDrive(controls, info.inserted, name, info.modified, emptyLabel);
        status.inserted = info.inserted;
        status.name = info.name;
        status.modified = info.modified;
        status.driverReady = info.driverReady;
        status.generation = info.generation;
        status.spaceWrites = -1;
    }
    if (status.spaceWrites !== info.writeCount && activity !== "write") {
        showSpace(controls, info.freeSectors, info.totalSectors);
        status.spaceWrites = info.writeCount;
    }
    showActivity(controls, status, activity, info.inserted, driveName);
}

/**
 * Show a drive's medium name, modified badge, and empty state.
 *
 * @param {DriveControls} controls
 * @param {boolean} inserted
 * @param {string} name
 * @param {boolean} modified
 * @param {string} emptyLabel
 */
function showDrive(controls, inserted, name, modified, emptyLabel) {
    let label = emptyLabel;
    if (inserted) {
        label = name;
        controls.card.classList.remove("empty");
    } else {
        controls.card.classList.add("empty");
    }
    showInfo(controls.info, label);
    controls.modified.hidden = !(inserted && modified);
    controls.download.disabled = !inserted;
    controls.eject.disabled = !inserted;
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
 * Show free and usable sectors on a drive's meter, or hide it without them.
 *
 * @param {DriveControls} controls
 * @param {number} free
 * @param {number} total
 */
function showSpace(controls, free, total) {
    if (total <= 0) {
        controls.meter.hidden = true;
        return;
    }
    controls.meter.hidden = false;
    const used = Math.min(Math.max(total - free, 0), total);
    controls.meterBar.style.width = (used * 100 / total) + "%";
    const kib = total * sectorBytes / 1024;
    let size = Math.round(kib) + " KB";
    if (kib >= 1024) {
        size = (kib / 1024).toFixed(1) + " MB";
    }
    controls.size.textContent = size;
    controls.free.textContent = free + "/" + total + " sectors free";
}

/**
 * Light a drive's card and status-bar activity lights for its state:
 * `idle`, `motor`, `read`, or `write`.
 *
 * @param {DriveControls} controls
 * @param {DriveStatus} status
 * @param {string} state
 * @param {boolean} inserted
 * @param {string} driveName
 */
function showActivity(controls, status, state, inserted, driveName) {
    if (state === status.state && inserted === status.lit) {
        return;
    }
    status.state = state;
    status.lit = inserted;
    let title = driveName + " idle";
    switch (state) {
    case "motor":
        title = driveName + " motor running";
        break;
    case "read":
        title = driveName + " reading";
        break;
    case "write":
        title = driveName + " writing";
        break;
    default:
        break;
    }
    for (const led of [controls.led, controls.statusLed]) {
        led.classList.remove("on", "motor", "read", "write");
        if (inserted) {
            led.classList.add("on");
        }
        if (state !== "idle") {
            led.classList.add(state);
        }
        led.title = title;
    }
}

/**
 * Once a second, show the frame rate, and the audio cut and gap when there is
 * sound.
 *
 * @param {number} now
 */
function refreshStats(now) {
    if (statsAt === 0) {
        statsAt = now;
        framesRun = 0;
        return;
    }
    const span = now - statsAt;
    if (span < statsWindowMs) {
        return;
    }
    ui.fps.textContent = (framesRun * 1000 / span).toFixed(1);
    statsAt = now;
    framesRun = 0;
    if (sfx === null) {
        return;
    }
    const stats = sfx.stats;
    ui.cut.textContent = String(Math.round(stats.cut - statsCut));
    ui.gap.textContent = String(Math.round(stats.gap - statsGap));
    statsCut = stats.cut;
    statsGap = stats.gap;
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
    if (chunk.n > 0 && sfx !== null) {
        sound.push(sfx, chunk);
    }
    chunk.n = 0;
}
