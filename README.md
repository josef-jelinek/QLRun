# QLRun

Try it live: <https://josef-jelinek.github.io/QLRun/>

QLRun is a browser emulator for the Sinclair QL. It loads a JS or JSU
system ROM from `roms/` when those files are available, paints the ZX8301
display, talks to the ZX8302 IPC for keyboard, beeper, and Microdrive, and
emulates the original AY-3-8910 QSound card and the YM2203-compatible QSound2.
It also mounts writable QLWA `.win` hard disk images as `WIN1_` and read-only
QL5A/QL5B `.img` floppy images as `FLP1_`.

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

The machine initializes 128 KiB of RAM by default and starts without a ROM,
then tries `roms/<name>.rom` (up to 48 KiB). The default `<name>` is `js`, or
`jsu` when `?ntsc=1` selects US timing; an explicit `?rom=` overrides that
choice. If a ROM fetch fails, **Load ROM** still accepts a raw `.rom` or `.bin`
file. Three optional 16 KiB extension-ROM slots are available: the cartridge
window at `0x0C000`, I/O ROM 1 at `0x10000`, and I/O ROM 2 at `0x14000`.

The UI controls can also be initialized through URL parameters. Use `0` to
disable a switch and `1` to enable it. `qsound` accepts `0` for no card, `1`
for QSound, or `2` for QSound2. RAM accepts `128`, `384`, `640`, or `896`.
Missing or invalid parameters keep the normal defaults:

| Parameter | Default |
| --- | --- |
| `keyboard` | `0` |
| `crt` | `1` |
| `qsound` | `1` |
| `stereo` | `0` |
| `ntsc` | `0` |
| `ram` | `128` |
| `turbo` | `1` |
| `stretch` | `0` |

For example, `?crt=0&keyboard=1&ntsc=1&ram=640&rom=jsu` starts with the CRT
filter off, the onscreen keyboard shown, the US machine, and 640 KiB of RAM.
Fullscreen is not exposed as a URL parameter. Changing a listed control
updates its parameter without reloading the page or adding a browser-history
entry. Selecting a local ROM removes `rom`, and selecting a local Microdrive
image removes `url`; other parameters and the URL fragment are preserved.

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

### Command bar

- Reset - restart the 68008 from the ROM reset vector. A Microdrive cartridge
  is kept.
- Keyboard - show or hide the QL keyboard under the screen.
- CRT - fit the display continuously and add rounded pixels and scanlines.
  When off, the display is square and pixel dimensions are integer-scaled in
  physical display pixels. Both video modes use the same 512-device-pixel size
  steps, and the canvas may therefore use fractional CSS dimensions.
- QSound - connect the original MC6821/AY-3-8910 card and its bundled extension
  ROM. Changing the switch resets the machine. It is enabled by default.
- QSound2 - connect the mutually exclusive YM2203-compatible card, using the
  same extension ROM. Its PSG and three-channel FM synthesizer run from a fixed
  2 MHz master clock. Changing the switch resets the machine.
- Stereo - spread either card's PSG channels A, B, and C across the stereo
  image. Off reproduces the card's summed mono output; QSound2 FM and the IPC
  beeper stay centred.
- NTSC - US QL clocks (7.552445 MHz CPU from a 15.10489 MHz crystal). The
  312-line monitor field stays near 50.4 Hz; JSU TV mode (F2) sets ZX8301
  bit 6 for the 262-line field at about 60.05 Hz. CRT output then displays its
  192 active scan lines; non-CRT output also exposes rows 192–255 as an
  end-of-field diagnostic memory view, not scanned TV output. Field geometry
  is latched at field start. Starting with `?ntsc=1` loads `roms/jsu.rom` unless
  `?rom=` is set. While using the automatic ROM, changing the switch reloads
  `js.rom` or `jsu.rom`; an explicit or locally loaded ROM stays selected.
- +256K / +512K - independently add either RAM expansion to the stock 128 KiB.
  Selecting both provides 896 KiB. Changing either switch initializes the
  selected memory and resets the machine. Because either sound card occupies
  `0xC0000`, it conflicts with the top 256 KiB of this configuration. Selecting
  the second RAM expansion turns the card off; selecting either card with both
  expansions active turns +256K off, leaving 640 KiB. The selected card wins
  the same conflict during startup when its ROM is available.
- Stretch - fill the entire available display area, disregarding aspect ratio
  and integer scaling. It applies with CRT enabled or disabled and in both
  fullscreen and windowed modes.
- Fullscreen - show only the fullscreen emulator canvas (also F11).
- MDV1 / MDV2 - each physical Microdrive has independent New, Load, Download,
  and Eject controls. Load inserts a raw QLAY `.mdv` without resetting the
  machine. New inserts an unformatted 255-sector cartridge named `mdv1.mdv` or
  `mdv2.mdv`; format it inside the QL with a command such as
  `FORMAT mdv2_work`. Guest erase and track writes update the in-memory image.
  Download saves its current contents, while Eject discards them. A changed
  image is labelled `(modified)` until it is downloaded.
- The drive indicator is outlined while its motor runs, green during reads,
  white during writes or erasure, and dark while idle. It pulses during reads
  and writes.
- Turbo - run the machine at up to four times normal speed while either
  Microdrive is transferring a read in the current field. It is enabled by
  default. Intermediate video fields are assembled but not presented or
  uploaded, and their audio samples are not collected. A motor left spinning
  after the last read, writes, and other execution stay at normal speed.
- Load ROM - replace the 48 KiB system ROM and reset.
- Cart / IO 1 / IO 2 - select one ROM slot; tooltips show its full name and
  address (`0x0C000`, `0x10000`, or `0x14000`). Load accepts a raw `.rom` or
  `.bin` image of 1 to 16 KiB; Eject removes that slot's image. Short images
  are padded with zeroes. Each slot retains its own image and filename.
  Changing the selection does not reset the machine; loading or ejecting
  does, so QDOS detects the change. Images survive resets and system-ROM
  replacement.
  These slots provide ROM storage only, not any additional peripheral
  hardware a particular expansion ROM may require.
- FLP1 - Load mounts a QL5A or QL5B floppy `.img` without resetting the
  machine. The image is read-only to the guest. Download saves the mounted
  copy; Eject discards it. The bundled JS and JSU ROMs expose it as `FLP1_`;
  an unsupported ROM is reported in the media row.
- WIN1 - Load mounts a QLWA `.win` hard disk image without resetting the
  machine. Guest file creation, deletion, truncation, and writes update its
  in-memory image. Download saves the current image and clears the
  `(modified)` label; Eject discards the mounted copy. The bundled JS and JSU
  ROMs expose it as `WIN1_`; an unsupported ROM is reported in the media row.

F1 and F2 reach the emulated machine (monitor/TV select on the JS ROM). F11
is the page fullscreen shortcut.

The host keyboard is mapped onto the QL IPC matrix. Letters and digits match
the keycaps. Shift, Ctrl, and Alt are the QL modifiers. Backspace is
Ctrl+Left; Delete is Ctrl+Right.

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

Two to three video frames of samples are kept queued: the audio thread asks for
one more whenever the queue falls below two, and the machine runs a frame only
once a frame has been played. Chip clocks continue while browser audio is
suspended, so envelopes and finite sounds do not pause with the host device.

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
- `load.js` - MDV or ZIP fetch for `index.html?url=`.
- `io.js` - HTTP GET and local file reads.
- `machine.js` - CPU ownership, memory map, ZX8301/ZX8302, Microdrive, QSound/QSound2, and frame run.
- `cpu.js` - MC68008 state and execution core.
- `disk.js` - writable QLWA hard disk and read-only QL5A/QL5B floppy images with their QDOS `WIN1_` and `FLP1_` host drivers.
- `ay.js` - AY-3-8910/YM2149 PSG synthesis used by the sound cards.
- `fm.js` - YM2203 FM synthesis used by QSound2.
- `keyboard.js` - host keyboard mapping and the overlay.
- `zip.js` - ZIP listing and entry extraction.
- `media.js` - Microdrive, floppy, hard disk, ZIP, and junk file-name rules.
- `sound.js` - Web Audio host and worklet loader.
- `sound.worklet.js` - mixes beeper and sound-card planes on the audio thread.
- `audioworklet.d.ts` - check-only declarations for the AudioWorklet globals.
- `screen.js` - WebGL2 display renderer.
- `screen.vert.glsl` / `screen.frag.glsl` - display shaders.
- `server.go` - optional local static file server (`go run server.go`).
- `tsconfig.json` - check-only TypeScript config (`noEmit`).
- `roms/` - default machine ROM files.
- `roms/Qsound_V1.94.rom` - bundled original-QSound extension ROM.
- `roms/Qsound_NOTICE.txt` / `roms/Qsound_CERN-OHL-S-2.0.txt` - QSound ROM
  provenance, notice, and license.

ROM images in `roms/` are not owned by this project. `Qsound_V1.94.rom` is the
8 KiB image identified in `Qsound_NOTICE.txt` (SHA-256
`d6caabb6c96e32a4c5c6dfd443b7c2b30835755b9519b04b61ee52e5f17b8082`) and
is distributed with its upstream CERN-OHL-S-2.0 notice and license.

## License

Project-owned emulator sources and documentation are under the MIT license in
`LICENSE`. ROM images in `roms/` are excluded from that grant.
