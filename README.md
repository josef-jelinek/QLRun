# QLRun

Try it live: <https://josef-jelinek.github.io/QLRun/>

QLRun is a browser emulator for the Sinclair QL. It loads the bundled JS or
JSU system ROM, or the bundled Minerva ROM, from `roms/`, paints the ZX8301
display, talks to the ZX8302 IPC for keyboard, beeper, and Microdrive, and
emulates the original AY-3-8910 QSound card and the YM2203-compatible QSound2.
It also mounts writable QLWA `.win` hard disk images as `WIN1_` and writable
QL5A/QL5B `.img` floppy images as `FLP1_`, connects the host mouse as the PS/2
mouse of a QIMSI ROM-port interface or as the Pointer Environment pointer, and
connects SER1 and SER2 to host serial ports through Web Serial.

No build, package manager, or external library is required. The page uses
plain JavaScript. `tsconfig.json` is only for optional static checking during
development (`tsc --noEmit` or `npx --yes tsc --noEmit`). ES modules cannot
be loaded from `file://`, so serve the repository root with a static file
server and open `index.html` in a modern browser. From the project directory:

```text
go run server.go
```

or:

```text
python3 -m http.server
```

Either command accepts an optional port; the default is 8000:

```text
go run server.go 8080
python3 -m http.server 8080
```

Then visit `http://127.0.0.1:8000/` (or the port you chose).

The machine initializes 128 KiB of RAM by default and starts without a ROM, then
tries `roms/<name>.rom` (up to 48 KiB). The default `<name>` is `js`, or `jsu`
when `?ntsc=1` selects US timing; an explicit `?rom=` overrides that choice, for
example `?rom=minerva` for the bundled Minerva 1.98a1. If a ROM fetch fails, the
system ROM's **Load** on the ROMs tab still accepts a raw `.rom` or `.bin` file.
Three optional 16 KiB extension-ROM slots are available: the cartridge window at
`0x0C000`, I/O ROM 1 at `0x10000`, and I/O ROM 2 at `0x14000`. `?cart=<name>`
loads `roms/<name>.rom` into the cartridge slot, for example `?cart=tk2` for the
bundled Toolkit II v2.36.

The UI controls can also be initialized through URL parameters. Use `0` to
disable a switch and `1` to enable it. `qsound` accepts `0` for no card, `1`
for QSound, or `2` for QSound2. RAM accepts `128`, `384`, `640`, or `896`.
`mouse` accepts `0` for no mouse, `qimsi` for the QIMSI PS/2 mouse, or `pe`
for the host pointer in the Pointer Environment.
`mspeed` accepts `1`, `2`, or `4` mouse counts per displayed 512-mode pixel.
Missing or invalid parameters keep the normal defaults:

| Parameter | Default |
| --- | --- |
| `keyboard` | `0` |
| `crt` | `1` |
| `qsound` | `1` |
| `stereo` | `0` |
| `muted` | `0` |
| `ntsc` | `0` |
| `ram` | `128` |
| `mouse` | `0` |
| `mspeed` | `1` |
| `mcursor` | `0` |
| `turbo` | `1` |
| `stretch` | `0` |

For example, `?crt=0&keyboard=1&ntsc=1&ram=640&rom=jsu` starts with the CRT
filter off, the onscreen keyboard shown, the US machine with `jsu.rom` chosen
explicitly, and 640 KiB of RAM.
Fullscreen is not exposed as a URL parameter. Changing a listed control updates
its parameter without reloading the page or adding a browser-history entry;
changing it back to the default in the table removes the parameter. Choosing
Minerva sets `rom=minerva`, and selecting or dropping a local ROM, or returning
to the automatic one, removes `rom`. Choosing Toolkit II sets `cart=tk2`, and
loading a local cartridge ROM, ejecting it, or choosing the QIMSI mouse removes
`cart`. Loading, dropping, creating, or ejecting a Microdrive in MDV1 removes
`url`. Other parameters and the URL fragment are preserved.

## Emulator page

`index.html` is the standalone emulator. A QLAY `.mdv` or a ZIP containing one
can be fetched into MDV1 at startup with the `url` parameter. Encode the file
URL with `encodeURIComponent`:

```text
?url=https%3A%2F%2Fexample.com%2Fdemo.mdv
?url=https%3A%2F%2Fexample.com%2Fgames.zip%23folder%2Fgame.mdv
```

Cross-origin URLs must allow the browser to read them through CORS. For a ZIP,
the alphabetically first `.mdv` member is loaded unless a `#member` fragment
selects another.

### Page layout

The page is a QL Pointer Environment desktop in the four mode-4 colours: a top
bar, the `#1 SCREEN` window with the optional `KEYBOARD` window under it, the
`SETTINGS` window with Media, ROMs, Hardware, and Display tabs, and the `#0`
status bar. Media is selected when the page opens; the tab is not a URL
parameter. Below 900 px the settings stack under the screen.

- Summary - the top bar names the video standard with its current field rate,
  memory, sound card, system ROM, and mouse; selecting one opens its tab.
- Pause - stop the emulated machine; Resume, here or over the dimmed screen
  (also in fullscreen), continues from the same point. Sound falls silent,
  and the status reads 0 fps with no audio gap. Reset and media changes still
  apply while paused. It has no URL parameter and is off when the page opens.
- Reset - restart the 68008 from the ROM reset vector. Inserted media stay.
- Mute, Keyboard, and Fullscreen buttons beside them mirror the Mute,
  Onscreen keyboard, and Fullscreen settings.
- The screen window's title bar has `(=)` CRT filter, `<->` Stretch, and `[ ]`
  Fullscreen controls that mirror those settings; CRT filter and Stretch light
  green when on.
- The status bar shows messages on the left, then each drive's activity light,
  SER1 and SER2 activity lights where the browser has Web Serial, the frame
  rate, and the last second's audio cut and gap in ms.

Files dropped anywhere on the page go where their names say: `.mdv` into MDV1,
or MDV2 while MDV1 holds a cartridge; the first `.mdv` in a `.zip` likewise;
`.win` into WIN1; `.img` into FLP1; and `.rom` or `.bin` in place of the
system ROM, which resets the machine. Other files are reported in the status
bar.

#### Media

Each drive has a card with its medium name, a `modified` badge while the image
holds unsaved changes, an activity light, and a meter of free and usable
sectors as `DIR` reports them. The light is dotted while the drive is empty,
white while a Microdrive motor runs, green during reads, and red during writes.
An empty card shows a dotted outline.

- MDV1 / MDV2 - Load inserts a raw QLAY `.mdv` without resetting the machine.
  New inserts an unformatted 255-sector cartridge named `mdv1.mdv` or
  `mdv2.mdv`; format it inside the QL with a command such as `FORMAT mdv2_work`.
  Until then it reads as erased tape, so a boot with it in MDV1 soon stops
  looking for `mdv1_boot`; a format stopped by Reset can be run again. FORMAT
  lays the records out like a real loop of tape, with a splice in the last slot
  that spoils the record before it, so a formatted cartridge has 250 to 252
  good sectors. Its meter appears once QDOS has formatted it, since the counts
  come from the cartridge's sector map. Guest erase and track writes update the
  in-memory image. Save downloads its current contents and clears the badge,
  while Eject discards them.
- Turbo - run the machine at up to eight times normal speed while either
  Microdrive is transferring a read in the current field. It is enabled by
  default. Intermediate video fields are assembled but not presented or
  uploaded, and their audio samples are not collected. A motor left spinning
  after the last read, writes, and other execution stay at normal speed.
- WIN1 - Load mounts a QLWA `.win` hard disk image without resetting the
  machine. New offers 4 MB and 16 MB, which insert an empty, formatted QLWA
  image named `win1.win`, laid out as SMSQ/E formats it: 4 MiB, or 32764
  sectors (just under 16 MiB), the largest disk whose free and total sectors
  QDOS can report exactly. SuperBASIC `DIR` prints those counts as signed
  16-bit numbers, so the drive reports at most 32767 of each; larger images
  still work, but show the capped counts. Guest file creation, deletion,
  truncation, and writes update its in-memory image. Save downloads the
  current image and clears the badge; Eject discards the mounted copy. The
  bundled system ROMs expose it as `WIN1_`; an unsupported ROM is reported on
  the card.
- FLP1 - Load mounts a QL5A or QL5B floppy `.img` without resetting the
  machine. New offers DD and HD, which insert an empty, formatted 720 KiB
  QL5A or 1440 KiB QL5B image named `flp1.img`, laid out as SMSQ/E formats
  them. Guest file creation, deletion, truncation, and writes update its
  in-memory image. Save downloads the current image and clears the badge;
  Eject discards the mounted copy. The bundled system ROMs expose it as
  `FLP1_`; an unsupported ROM is reported on the card.

Both drives keep SMSQ/E's level-2 directories, which Toolkit II commands use:
`MAKE_DIR` turns a new file into a directory and moves the files named after it
and `_` into it, `RENAME` can move a file to another directory, a directory
open with a trailing `_` or a longer name reaches the nearest existing
directory, and an empty directory can be deleted.

#### ROMs

The address map at the top marks the extension slots that hold an image.

- System ROM - Load replaces the 48 KiB system ROM and resets. The `auto` badge
  shows the automatic `js.rom` or `jsu.rom` that follows the video standard;
  after a local or `?rom=` ROM, Auto returns to it. Minerva switches to the
  bundled Minerva 1.98a1 ROM, `minerva.rom`, which stays selected when the video
  standard changes. Its dual-screen start (F3 or F4) moves the system
  variables above the second screen; `WIN1_`, `FLP1_`, and the PE pointer
  follow them.
- Cartridge ROM / I/O ROM 1 / I/O ROM 2 - Load a raw `.rom` or `.bin` image of
  1 to 16 KiB into the cartridge window at `0x0C000`, I/O ROM 1 at `0x10000`,
  or I/O ROM 2 at `0x14000`; Eject removes that slot's image. Short images are
  padded with zeroes. Each slot shows its own filename. Loading or ejecting
  resets the machine, so QDOS detects the change. Images survive resets and
  system-ROM replacement. The QIMSI interface plugs into the ROM port, so, as
  on a real QL, it cannot share it with a cartridge ROM: installing one, also
  through `cart=`, switches the QIMSI mouse off, and a note says so. These
  slots provide ROM storage only, not any additional peripheral hardware a
  particular expansion ROM may require.
- Toolkit II - the cartridge card's button loads the bundled Toolkit II v2.36,
  `tk2.rom`, and sets `cart=tk2`; a local image or Eject replaces it.

#### Hardware

Choices marked `*` reset the machine when changed.

- Video standard - PAL, or NTSC for US QL clocks (7.552445 MHz CPU from a
  15.10489 MHz crystal). The 312-line monitor field stays near 50.4 Hz; JSU TV
  mode (F2) sets ZX8301 bit 6 for the 262-line field at about 60.05 Hz. CRT
  output then displays its 192 active scan lines; non-CRT output also exposes
  rows 192–255 as an end-of-field diagnostic memory view, not scanned TV
  output. Field geometry is latched at field start. Starting with `?ntsc=1`
  loads `roms/jsu.rom` unless `?rom=` is set. While using the automatic ROM,
  changing the standard reloads `js.rom` or `jsu.rom`; an explicit or locally
  loaded ROM stays selected. Minerva does not set bit 6, so it keeps the
  312-line field on NTSC clocks.
- Memory - 128K, or 384K, 640K, and 896K with the 256 KiB, 512 KiB, or both
  expansions. Changing it initializes the selected memory. Because either sound
  card occupies `0xC0000`, it conflicts with the top 256 KiB of 896K: choosing
  896K removes the card, and choosing a card at 896K reduces memory to 640K. A
  note says which happened. The selected card wins the same conflict during
  startup when its ROM is available.
- Sound card - None, the original MC6821/AY-3-8910 QSound card, or the
  YM2203-compatible QSound2 card. Both use the bundled extension ROM, and
  QSound2's PSG and three-channel FM synthesizer run from a fixed 2 MHz master
  clock. QSound is fitted by default.
- Stereo - spread either card's PSG channels A, B, and C across the stereo
  image. Off reproduces the card's summed mono output; QSound2 FM and the IPC
  beeper stay centred. It needs a sound card.
- Mute - silence the beeper and either sound card. The machine keeps running
  at the same speed, and the switch takes effect without a reset.
- Pointer device - None, QIMSI, or PE connects the host mouse as one of two
  models. The `mouse` parameter follows the selection.
  - QIMSI connects the host mouse as the PS/2 mouse of a QIMSI interface, whose
    registers occupy `0x0FED0`–`0x0FEDF` in the ROM port. Choosing it ejects a
    cartridge ROM, and a note says so. While it is on, click the screen to
    capture the mouse; Esc releases it, so press Esc again to send it to the QL.
    Moving across the displayed screen width sends 512 counts times the Mouse
    speed. At the default 1×, Pointer Environment software using the QIMSI mouse
    driver follows the host one pixel per count; 2× or 4× help software that
    scales counts down and drops slow movement. The mouse reports itself as an
    IntelliMouse with left, right, and middle buttons and a wheel. Only the
    mouse is emulated, not the QIMSI ROM, microSD card, keyboard, serial link,
    or sound.
  - PE places the Pointer Environment pointer under the host cursor over the
    screen, as QPC and uQLX do, with no capture. The left and right buttons
    are HIT and DO. It needs the Pointer Environment (`ptr_gen` with the
    `PTR2` linkage) loaded in the QL and does nothing until then; the Mouse
    speed does not apply.
- Mouse speed - 1×, 2×, or 4× QIMSI counts per displayed pixel, for the QIMSI
  mouse only. It applies to the next movement without a reset, and the
  `mspeed` parameter follows it.
- Host cursor - show the host cursor over the screen while PE is selected. It
  is off by default, so only the QL pointer is visible over the screen; the
  host cursor still shows elsewhere on the page. QIMSI hides the host cursor
  through its pointer capture instead.
- Serial ports - SER1 and SER2 each have a card whose Connect button attaches a
  host serial port through the Web Serial API, available in Chromium-based
  browsers such as Chrome, Edge, and Opera, on pages served over `https://` or
  from `localhost`. Elsewhere the cards stay disabled under a note saying why.
  A port can serve one QL port at a time and is chosen again after the page
  reloads; Disconnect, or unplugging it, frees the QL port.
  - Output goes through the ZX8302 transmitter at the QL's rate, eleven bits a
    byte with two stop bits, and input through the IPC, which takes a byte per
    ten bit times into its 23-byte buffer for QDOS to read. The host port runs
    with 8 data bits, 2 stop bits, and no parity, as QDOS adds any parity
    itself, and is reopened whenever `BAUD` changes the rate; Minerva's split
    per-port rates are timed, but the host port follows `BAUD`. The card's
    badge shows the rate.
  - The device's CTS line drives the QL's handshake input, DTR on SER1 and CTS
    on SER2, so a device without it holds QL output back; `OPEN` the port as
    `ser1i` or `ser2i` to ignore the handshake. The QL raises the host's RTS
    and DTR while its port is open and its input is keeping up, and drops them
    while more than 256 received bytes wait, which the browser and emulator
    then hold. Bytes that arrive while the QL port is closed are dropped.
  - With nothing connected, output is discarded and the handshake reads as
    ready. The JS ROM sends a NUL on SER1 as it starts. Reset closes
    the QL ports and drops their bytes; a connected host port stays connected.

#### Display

- CRT filter - fit the display continuously and add rounded pixels and
  scanlines. When off, the display is square and pixel dimensions are
  integer-scaled in physical display pixels. Both video modes use the same
  512-device-pixel size steps, and the canvas may therefore use fractional CSS
  dimensions.
- Stretch - fill the entire available display area, disregarding aspect ratio
  and integer scaling. It applies with the CRT filter on or off and in both
  fullscreen and windowed modes.
- Onscreen keyboard - show or hide the QL keyboard under the screen. Drag the
  keyboard window's title bar to resize it. Below 900 px, where the windows
  stack, it switches to a compact ten-column layout with larger keys, attached
  under the screen window without a title bar: ESC and F1 to F5 above the
  digits, and SHIFT, TAB, CAPS, ENTER, and the bottom row under the letters.
- Fullscreen - show only the emulator screen (also F11). If the browser refuses
  fullscreen or has none, as on an iPhone, the page shows only the screen and
  its title bar until F11 or the bar's `[ ]` is pressed again.

F1 to F5 reach the emulated machine; F1 and F2 select monitor or TV mode on the
JS and Minerva start screens, and Minerva's F3 and F4 their dual-screen
versions. F11 is the page fullscreen shortcut. While a settings tab has focus,
the arrow keys, Space, Enter, and Tab keep their browser behavior instead of
reaching the QL.

The host keyboard is mapped onto the QL IPC matrix. Letters, digits, and
punctuation match the keycaps, and Backquote is the £ key. Shift, Ctrl, and
Alt are the QL modifiers. Backspace is Ctrl+Left and Delete is Ctrl+Right;
Home and End are Left and Right, and Page Up and Page Down are Up and Down.
The keypad types its digits, `.`, `/`, `-`, `+`, and `*`, and its Enter is
ENTER. As on a QL, the IPC queues up to seven keys and ignores more, and it
reports when the last key is still held, which QDOS repeats after its
`SV_ARDEL` delay (0.6 s) at its `SV_ARFRQ` rate; the browser's own key repeat
is not used.

## Sound

The ZX8302 IPC beeper and the selected card are mixed in the browser. The
beeper implements both pitches, gradient timing, wrapping, random pitch, fuzz,
finite duration, and continuous sounds. Its oscillator uses fractional periods
and time-averaged transitions within output samples. QSound follows the QL E
clock: 750 kHz on PAL machines and 755,244.5 Hz on NTSC machines. QSound2 provides a
YM2149-style PSG clocked at 1 MHz and centred three-channel YM2203 FM audio
from its 2 MHz master clock. Its SSG uses the YM2149 DAC curve and is mixed with
the FM output at unity gain, matching the fixed QSound2 hardware path. The FM
core runs at the selected native prescaler rate and implements the OPN feedback,
MEM, envelope, SSG-EG, timer, CSM, channel-3, and status-port behaviour, including
a prescaler-aware BUSY flag timed in CPU cycles. Writes issued while busy are
still accepted immediately. A click or key may be required before anything is
audible.

Enabled sound-card ROM, PIA, and direct-port accesses use phase-dependent
MC68008 E/VPA synchronization. Their word/long transfers have individual byte
timestamps, and peripheral waits are additional to instruction timing.
E remains free-running at CPU/10; the deterministic model places its falling
edges half a CPU clock before multiples of ten after reset. PIA direction
registers govern driven pins and input readback. Original QSound follows Port A
changes while the AY address/write controls remain asserted; QSound2 uses
separate CPU-data-strobe-qualified chip accesses. PSG volume changes retain
their time-weighted contribution within each output sample.

This is a digital bus/interface model, not a fully cycle-exact CPU or chip.
CPU prefetch/internal sequencing, chip-internal write timing, propagation and
setup/hold effects, full PIA handshakes/interrupts, and analogue response remain
approximate. The model has not been calibrated against physical bus traces.

About two to three video frames of samples stay queued, and audio beyond four
frames is cut as an overrun. Fields run at the ZX8301 field rate from the
display clock; whenever the queue falls below two frames, the audio thread asks
for more, and up to four fields run ahead of the display, borrowing that time
from later refreshes. Chip clocks continue while browser audio is suspended, so
envelopes and finite sounds do not pause with the host device.

## Display

Video follows guest CPU time in 16-column, 12-clock chunks. Screen-memory,
mode, blanking, and screen-base writes preserve chunks already sampled, so
within-field raster changes and tearing are visible rather than collapsed
into the final RAM contents. Mode 8 flash state persists across partial line
updates. Only completed fields are presented, with versioned texture uploads
avoiding redundant work between guest fields. This remains a chunk-level
model: individual RAM bus-byte timing, exact video-fetch latency, and measured
interrupt-to-beam phase alignment are not reproduced.

The visible picture is the ZX8301 output: 512x256 mode-4 pixels or 256x256
logical pixels in mode 8. Without CRT filtering, both modes fill a square
display using integer-sized blocks of physical display pixels. Mode 4 pixels
are twice as tall as they are wide; Mode 8's duplicate texture columns collapse
back to its logical width and its logical pixels are square. Both modes use the
same canvas size, so changing modes does not resize the display. The optional
CRT mode fills the available 4:3 area. Its beam filtering and intensity modulation
operate in linear light, with sRGB encoding at output. Stretch mode overrides both
layouts and fills the complete display slot. Palette bits are blue, red, green as
on the QL.

## Repository files

- `README.md` - project overview and user documentation.
- `LICENSE` - MIT terms for project-owned sources.
- `index.html` - emulator page markup and page-specific styles.
- `favicon.ico` - browser tab icon.
- `main.js` - emulator page, session, display, sound, controls, and file loading.
- `boot.js` - shader and default ROM fetch.
- `load.js` - MDV or ZIP fetch for `index.html?url=`, and ZIP member extraction for drops.
- `io.js` - HTTP GET and local file reads.
- `machine.js` - CPU ownership, memory map, ZX8301/ZX8302, Microdrive, serial ports, QSound/QSound2, QIMSI window, and frame run.
- `cpu.js` - MC68008 state and execution core.
- `disk.js` - writable QLWA hard disk and QL5A/QL5B floppy images with their QDOS `WIN1_` and `FLP1_` host drivers.
- `ay.js` - AY-3-8910/YM2149 PSG synthesis used by the sound cards.
- `fm.js` - YM2203 FM synthesis used by QSound2.
- `qimsi.js` - QIMSI mouse registers and the PS/2 mouse behind them.
- `pe.js` - host pointer written into the QL Pointer Environment.
- `keyboard.js` - host keyboard mapping and the overlay.
- `zip.js` - ZIP listing and entry extraction.
- `media.js` - Microdrive, floppy, hard disk, ROM, ZIP, and junk file-name rules.
- `serial.js` - Web Serial host ports, with callbacks around their Promises.
- `sound.js` - Web Audio host and worklet loader.
- `sound.worklet.js` - mixes beeper and sound-card planes on the audio thread.
- `audioworklet.d.ts` - check-only declarations for the AudioWorklet globals.
- `webserial.d.ts` - check-only declarations for the Web Serial API.
- `screen.js` - WebGL2 display renderer.
- `screen.vert.glsl` / `screen.frag.glsl` - display shaders.
- `server.go` - optional local static file server (`go run server.go`).
- `tsconfig.json` - check-only TypeScript config (`noEmit`).
- `roms/` - default machine ROM files.
- `roms/js.rom` / `roms/jsu.rom` - Sinclair JS and US JSU system ROMs, the
  automatic choice for the PAL and NTSC machines.
- `roms/minerva.rom` - bundled Minerva 1.98a1 system ROM.
- `roms/Minerva_NOTICE.txt` / `roms/Minerva_GPL-2.0.txt` - Minerva ROM
  provenance, notice, and license.
- `roms/tk2.rom` - bundled Toolkit II v2.36 cartridge ROM.
- `roms/TK2_NOTICE.txt` / `roms/TK2_SMSQE_LICENCE.txt` - Toolkit II ROM
  provenance, notice, and license.
- `roms/Qsound_V1.94.rom` - bundled original-QSound extension ROM.
- `roms/Qsound_NOTICE.txt` / `roms/Qsound_CERN-OHL-S-2.0.txt` - QSound ROM
  provenance, notice, and license.
- `examples/castle.mdv` / `examples/xenon.mdv` - example Microdrive images that
  play music converted from VGM rips.

ROM images in `roms/` are not owned by this project. `js.rom` and `jsu.rom` are
the 48 KiB JS and JSU images (SHA-256
`fc6a683e44570d7e4a144580729e25ff4b3bd293a9eff5313cfdae11520d5efc` and
`e0077f96c1883a13772cc0a3e3222c854203e7ed76aa618879c0bed32ebc7b8d`) from
<https://sinclairql.net/djw/qlrom/index.html>; Paul Holmgren granted the use
of the JSU ROM in QLRun. `Qsound_V1.94.rom` is the
8 KiB image identified in `Qsound_NOTICE.txt` (SHA-256
`d6caabb6c96e32a4c5c6dfd443b7c2b30835755b9519b04b61ee52e5f17b8082`) and
is distributed with its upstream CERN-OHL-S-2.0 notice and license.
`minerva.rom` is the 48 KiB Minerva 1.98a1 image identified in
`Minerva_NOTICE.txt` (SHA-256
`bc954b7b5fb12b1ed98cc54d8cf13f425d97b79997e9bc967a8715f1ccbf5555`) and is
distributed under its upstream GPL-2.0 license; its source is at
<https://github.com/MarcelKilgus/Minerva>. `tk2.rom` is the 16 KiB Toolkit II
v2.36 image identified in `TK2_NOTICE.txt` (SHA-256
`d3d088df26527505fd8cd06e98a861f212a60c7a252b998e1b0a21f89a9c8b1d`), built
from the SMSQ/E sources and distributed with the SMSQ/E BSD 2-clause licence.

The example Microdrive images play music converted from VGM rips published at
vgmrips.net: `castle.mdv` from the
[Sorcerian (NEC PC-8801)](https://vgmrips.net/packs/pack/sorcerian-nec-pc-8801)
pack, and `xenon.mdv` from the
[Xenon: Mugen no Shitai (NEC PC-9801)](https://vgmrips.net/packs/pack/xenon-mugen-no-shitai-nec-pc-9801)
pack. The music belongs to its original rights holders.

## License

Project-owned emulator sources and documentation are under the MIT license in
`LICENSE`. ROM images in `roms/` and the music in the `examples/` Microdrive
images are excluded from that grant.
