import * as io from "./io.js";

const maxShaderSize = 65536;
const qsoundRomUrl = "roms/Qsound_V1.94.rom";

/**
 * Load the display vertex and fragment shader sources.
 *
 * @param {function(string | null, import("./screen.js").Shaders | null): void} onDone
 */
export function loadShaders(onDone) {
    const shaders = ["", ""];
    let done = false;
    /** @type {((function(): void) | null)[]} */
    const aborts = [null, null];
    aborts[0] = getShader(0, "screen.vert.glsl");
    if (done) { // in a case getShader errs synchronously
        return;
    }
    aborts[1] = getShader(1, "screen.frag.glsl");

    /**
     * @param {number} slot
     * @param {string} url
     */
    function getShader(slot, url) {
        return io.httpGet(
            url,
            "text",
            maxShaderSize,
            function (err, text) {
                if (done) {
                    return;
                }
                if (err !== null || typeof text !== "string" || text === "") {
                    done = true;
                    aborts[0]?.();
                    aborts[1]?.();
                    onDone("Failed to load \"" + url + "\"", null);
                    return;
                }
                shaders[slot] = text;
                if (shaders[0] !== "" && shaders[1] !== "") {
                    onDone(null, {vert: shaders[0], frag: shaders[1]});
                }
            },
        );
    }
}

/**
 * Fetch a system ROM from `roms/<name>.rom`. Empty `name` uses `js`. Invalid
 * names fail synchronously and return no abort. The image may be shorter than
 * `maxBytes` and is padded with zeros by the machine; it must not be larger.
 *
 * @param {string} name
 * @param {number} maxBytes
 * @param {function(string | null, string, ArrayBuffer | null): void} onDone
 * @returns {(function(): void) | null} abort
 */
export function loadStartupRom(name, maxBytes, onDone) {
    if (name === "") {
        name = "js";
    }
    if (!/^[A-Za-z0-9]+$/.test(name)) {
        onDone("Invalid ROM name.", "", null);
        return null;
    }

    const romName = name + ".rom";
    const url = "roms/" + romName;
    let done = false;
    const abortLoad = io.httpGet(
        url,
        "arraybuffer",
        maxBytes,
        function (err, buf) {
            if (done) {
                return;
            }
            done = true;
            if (err !== null) {
                onDone(err, romName, null);
                return;
            }
            if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0 || buf.byteLength > maxBytes) {
                const s = "Expected 1 to " + maxBytes + ", got " + (buf?.byteLength ?? 0) + " bytes.";
                onDone("Could not load \"" + url + "\": " + s, romName, null);
                return;
            }
            onDone(null, romName, buf);
        },
    );

    return function () {
        if (!done) {
            abortLoad?.();
        }
    };
}

/**
 * Fetch the bundled original-QSound extension ROM.
 *
 * @param {number} maxBytes
 * @param {function(string | null, ArrayBuffer | null): void} onDone
 * @returns {function(): void}
 */
export function loadQsoundRom(maxBytes, onDone) {
    let done = false;
    const abortLoad = io.httpGet(
        qsoundRomUrl,
        "arraybuffer",
        maxBytes,
        function (err, buf) {
            if (done) {
                return;
            }
            done = true;
            if (err !== null) {
                onDone(err, null);
                return;
            }
            if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0 || buf.byteLength > maxBytes) {
                const length = buf?.byteLength ?? 0;
                const detail = "Expected 1 to " + maxBytes + ", got " + length + " bytes.";
                onDone("Could not load \"" + qsoundRomUrl + "\": " + detail, null);
                return;
            }
            onDone(null, buf);
        },
    );
    return function () {
        if (!done) {
            abortLoad?.();
        }
    };
}
