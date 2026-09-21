import * as io from "./io.js";

const maxShaderSize = 65536;
export const qsoundRomUrl = "roms/Qsound_V1.94.rom";

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
                    onDone("Failed to load \"" + url + "\".", null);
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
 * Fetch a ROM image. It may be shorter than `maxBytes` and is padded with
 * zeros by the machine; it must not be empty or larger.
 *
 * @param {string} url
 * @param {number} maxBytes
 * @param {function(string | null, ArrayBuffer | null): void} onDone
 * @returns {(function(): void) | null} abort
 */
export function loadRom(url, maxBytes, onDone) {
    return io.httpGet(
        url,
        "arraybuffer",
        maxBytes,
        function (err, buf) {
            if (err !== null) {
                onDone(err, null);
                return;
            }
            if (!(buf instanceof ArrayBuffer) || buf.byteLength === 0 || buf.byteLength > maxBytes) {
                const length = buf?.byteLength ?? 0;
                const detail = "Expected 1 to " + maxBytes + ", got " + length + " bytes.";
                onDone("Could not load \"" + url + "\": " + detail, null);
                return;
            }
            onDone(null, buf);
        },
    );
}
