import * as io from "./io.js";

const maxShaderSize = 65536;
export const qsoundRomName = "Qsound_V1.94";

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
     * @returns {(function(): void) | null}
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
                    onDone(err ?? "Could not load \"" + url + "\": Empty read.", null);
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
 * Fetch the bundled ROM image `roms/<name>.rom`, as named by the page or its
 * URL. It may be shorter than `maxBytes` and is padded with zeros by the
 * machine; it must not be empty or larger. Returns the abort operation, or
 * null when `onDone` has already run.
 *
 * @param {string} name
 * @param {number} maxBytes
 * @param {function(string | null, ArrayBuffer | null): void} onDone
 * @returns {(function(): void) | null} abort
 */
export function loadRom(name, maxBytes, onDone) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.]*$/.test(name)) {
        onDone("Invalid ROM name: " + name + ".", null);
        return null;
    }
    return io.httpGet("roms/" + name + ".rom", "arraybuffer", maxBytes, onDone);
}
