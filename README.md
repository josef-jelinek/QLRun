# QLRun

Try it live: <https://josef-jelinek.github.io/QLRun/>

QLRun is a browser emulator for the Sinclair QL. It loads a JS or JSU
system ROM from `roms/` when those files are available, paints the ZX8301
display, talks to the ZX8302 IPC for keyboard, beeper, and Microdrive, and
emulates the original AY-3-8910 QSound card.

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

The machine initializes 128 KiB of RAM and starts without a ROM, then tries
`roms/<name>.rom` (up to 48 KiB). The default `<name>` is `js`, or `jsu` when
`?ntsc=1` selects US timing; an explicit `?rom=` overrides that choice. If a
ROM fetch fails, **Load ROM** still accepts a raw `.rom` or `.bin` file.

The UI switches can also be initialized through URL parameters. Use `0` to
disable a switch and `1` to enable it. Missing or invalid parameters keep the
normal defaults:

| Parameter | Default |
| --- | --- |
| `keyboard` | `0` |
| `crt` | `1` |
| `qsound` | `1` |
| `stereo` | `0` |
| `ntsc` | `0` |

For example, `?crt=0&keyboard=1&ntsc=1&rom=jsu` starts with the CRT filter
off, the onscreen keyboard shown, and the US machine. Fullscreen is not
exposed as a URL parameter. Toggling a listed switch updates its parameter to
an explicit `0` or `1` without reloading the page or adding a browser-history
entry; other parameters and the URL fragment are preserved.

## Emulator page

`index.html` is the standalone emulator. A QLAY `.mdv` or a ZIP containing one
can be fetched and loaded at startup with the `url` parameter. Encode the file
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
- Stereo - spread QSound channels A, B, and C across the stereo image. Off
  reproduces the card's summed mono output; the IPC beeper stays centred.
- NTSC - US QL clocks (7.552445 MHz CPU from a 15.10489 MHz crystal). The
  312-line monitor field stays near 50.4 Hz; JSU TV mode (F2) sets ZX8301
  bit 6 for the 262-line field at about 60.05 Hz. Starting with `?ntsc=1`
  loads `roms/jsu.rom` unless `?rom=` is set. While using the automatic ROM,
  changing the switch reloads `js.rom` or `jsu.rom`; an explicit or locally
  loaded ROM stays selected.
- Fullscreen - show only the fullscreen emulator canvas (also F11).
- Load MDV1 - insert a raw QLAY `.mdv` into physical microdrive 1. The
  machine is not reset; swap tapes and `LRUN mdv1_BOOT` as on a real QL. Its
  indicator is outlined while the motor runs, green during reads, white during
  writes, and dark while idle. The indicator pulses whenever the drive is
  active.
- Eject - unplug that cartridge without resetting.
- Load ROM - replace the 48 KiB system ROM and reset.

F1 and F2 reach the emulated machine (monitor/TV select on the JS ROM). F11
is the page fullscreen shortcut.

The host keyboard is mapped onto the QL IPC matrix. Letters and digits match
the keycaps. Shift, Ctrl, and Alt are the QL modifiers. Backspace is
Ctrl+Left; Delete is Ctrl+Right.

## Sound

The ZX8302 IPC beeper and QSound's AY-3-8910 are mixed in the browser. The
beeper implements both pitches, gradient timing, wrapping, random pitch, fuzz,
finite duration, and continuous sounds. QSound follows the QL E clock: 750 kHz
on PAL machines and 755,244.5 Hz on NTSC machines. A click or key may be
required before anything is audible.

Two to three video frames of samples are kept queued: the audio thread asks for
one more whenever the queue falls below two, and the machine runs a frame only
once a frame has been played. Chip clocks continue while browser audio is
suspended, so envelopes and finite sounds do not pause with the host device.

## Display

The visible picture is the ZX8301 output: 512x256 mode-4 pixels or 256x256
logical pixels in mode 8. Without CRT filtering, both modes fill a square
display using integer-sized blocks of physical display pixels. Mode 4 pixels
are twice as tall as they are wide; Mode 8's duplicate texture columns collapse
back to its logical width and its logical pixels are square. Both modes use the
same canvas size, so changing modes does not resize the display. The optional
CRT mode fills the available 4:3 area. Palette bits are blue, red, green as on
the QL.

## Repository files

- `README.md` - project overview and user documentation.
- `index.html` - emulator page markup and page-specific styles.
- `favicon.ico` - browser tab icon.
- `main.js` - emulator page, session, display, sound, controls, and file loading.
- `boot.js` - shader and default ROM fetch.
- `load.js` - MDV or ZIP fetch for `index.html?url=`.
- `io.js` - HTTP GET and local file reads.
- `machine.js` - CPU ownership, memory map, ZX8301/ZX8302, Microdrive, and frame run.
- `cpu.js` - MC68008 state and execution core.
- `ay.js` - AY-3-8910 synthesis used by the original QSound card.
- `keyboard.js` - host keyboard mapping and the overlay.
- `zip.js` - ZIP listing and entry extraction.
- `media.js` - Microdrive, ROM, and junk file-name rules.
- `sound.js` - Web Audio host and worklet loader.
- `sound.worklet.js` - mixes beeper and optional PSG planes on the audio thread.
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
