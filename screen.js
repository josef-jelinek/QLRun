// Frame size is duplicated with machine.js. The decoded texture is always
// 512x256. Both modes use the same square output: Mode 4 expands rows, while
// Mode 8 also combines each pair of columns.
const frameW = 512;
const frameH = 256;
const crtViewW = 512;
const crtViewH = 384;

/**
 * @typedef {{
 *   vert: string,
 *   frag: string,
 * }} Shaders
 */

/**
 * The program and texture stay bound for the life of the context. Cache the
 * uploaded frame separately from display invalidation to avoid redundant work.
 *
 * @typedef {{
 *   gl: WebGL2RenderingContext,
 *   pixels: Uint8Array | null,
 *   frameVersion: number,
 *   dirty: boolean,
 *   crtOn: boolean,
 *   stretchOn: boolean,
 *   ntscOn: boolean,
 *   pixelRatio: number,
 *   crtLoc: WebGLUniformLocation,
 *   ntscLoc: WebGLUniformLocation,
 * }} Gfx
 */

/**
 * Create the WebGL2 display and report context loss or initialization failure.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Shaders} shaders
 * @param {function(string | null, Gfx | null): void} onGfx
 */
export function init(canvas, shaders, onGfx) {

    canvas.addEventListener("webglcontextlost", function (e) {
        e.preventDefault();
        onGfx("WebGL2 context lost.", null);
    });

    canvas.addEventListener("webglcontextrestored", function () {
        console.info("WebGL2 context restored");
        initGfx();
    });

    initGfx();

    function initGfx() {
        const gfx = createGfx(canvas, shaders.vert, shaders.frag);
        if (gfx === null) {
            onGfx("Failed to create WebGL2 context.", null);
            return;
        }
        resize(gfx);
        onGfx(null, gfx);
    }
}

/**
 * Enable or disable CRT filtering and update the canvas dimensions.
 *
 * @param {Gfx} gfx
 * @param {boolean} on
 */
export function setCrt(gfx, on) {
    if (gfx.crtOn !== on) {
        gfx.crtOn = on;
        gfx.gl.uniform1i(gfx.crtLoc, Number(on));
        gfx.dirty = true;
    }
    const canvas = /** @type {HTMLCanvasElement} */ (gfx.gl.canvas);
    if (gfx.crtOn) {
        canvas.classList.add("crt");
    } else {
        canvas.classList.remove("crt");
    }
    resize(gfx);
}

/**
 * Enable or disable full-slot stretching and update the canvas dimensions.
 *
 * @param {Gfx} gfx
 * @param {boolean} on
 */
export function setStretch(gfx, on) {
    if (gfx.stretchOn !== on) {
        gfx.stretchOn = on;
        gfx.dirty = true;
    }
    resize(gfx);
}

/**
 * Fit the canvas to its available slot using stretched, filtered, or integer scaling.
 *
 * @param {Gfx} gfx
 */
export function resize(gfx) {
    const canvas = /** @type {HTMLCanvasElement} */ (gfx.gl.canvas);
    const workspace = canvas.parentElement;
    const pixelRatio = window.devicePixelRatio;
    if (gfx.pixelRatio !== pixelRatio) {
        gfx.dirty = true;
    }
    gfx.pixelRatio = pixelRatio;
    // Fit the content box so padding on the slot stays around the canvas.
    let slotW = crtViewW;
    let slotH = crtViewH;
    if (workspace !== null) {
        const style = getComputedStyle(workspace);
        const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
        const padY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
        slotW = workspace.clientWidth;
        slotH = workspace.clientHeight;
        if (Number.isFinite(padX)) {
            slotW -= padX;
        }
        if (Number.isFinite(padY)) {
            slotH -= padY;
        }
    }
    let width = Math.max(slotW, 1);
    let height = Math.max(slotH, 1);
    let bufferWidth = Math.max(Math.round(width * pixelRatio), 1);
    let bufferHeight = Math.max(Math.round(height * pixelRatio), 1);
    if (gfx.crtOn && !gfx.stretchOn) {
        height = Math.floor(width * crtViewH / crtViewW);
        if (height > slotH) {
            height = slotH;
            width = Math.floor(height * crtViewW / crtViewH);
        }
        width = Math.max(width, 1);
        height = Math.max(height, 1);
        const crtPixelRatio = Math.max(pixelRatio, 1);
        bufferWidth = Math.max(Math.round(width * crtPixelRatio), 1);
        bufferHeight = Math.max(Math.round(height * crtPixelRatio), 1);
    } else if (!gfx.stretchOn) {
        const fitX = Math.floor(Math.floor(slotW * pixelRatio) / frameW);
        const fitY = Math.floor(Math.floor(slotH * pixelRatio) / frameW);
        bufferWidth = frameW * Math.max(1, Math.min(fitX, fitY));
        bufferHeight = bufferWidth;
        width = bufferWidth / pixelRatio;
        height = bufferHeight / pixelRatio;
    }
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    if (canvas.width !== bufferWidth) {
        canvas.width = bufferWidth;
        gfx.dirty = true;
    }
    if (canvas.height !== bufferHeight) {
        canvas.height = bufferHeight;
        gfx.dirty = true;
    }
    gfx.gl.viewport(0, 0, bufferWidth, bufferHeight);
}

/**
 * Upload new pixel versions and redraw when the frame or display state changes.
 *
 * @param {Gfx} gfx
 * @param {Uint8Array} pixels
 * @param {boolean} ntsc
 * @param {number} frameVersion Advances whenever the pixel buffer is rewritten.
 */
export function draw(gfx, pixels, ntsc, frameVersion) {
    if (gfx.pixelRatio !== window.devicePixelRatio) {
        resize(gfx);
    }
    const gl = gfx.gl;
    if (gfx.ntscOn !== ntsc) {
        gl.uniform1i(gfx.ntscLoc, Number(ntsc));
        gfx.ntscOn = ntsc;
        gfx.dirty = true;
    }
    if (gfx.pixels !== pixels || gfx.frameVersion !== frameVersion) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, frameW, frameH, gl.RED_INTEGER, gl.UNSIGNED_BYTE, pixels);
        gfx.pixels = pixels;
        gfx.frameVersion = frameVersion;
        gfx.dirty = true;
    }
    if (gfx.dirty) {
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gfx.dirty = false;
    }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} vertGLSL
 * @param {string} fragGLSL
 * @returns {Gfx | null}
 */
function createGfx(canvas, vertGLSL, fragGLSL) {
    const gl = canvas.getContext("webgl2", {alpha: false, antialias: false});
    if (gl === null) {
        return null;
    }
    const program = createProgram(gl, vertGLSL, fragGLSL);
    if (program === null) {
        return null;
    }
    const tex = gl.createTexture();
    if (tex === null) {
        return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, frameW, frameH, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
    const texLoc = gl.getUniformLocation(program, "u_tex");
    if (texLoc === null) {
        return null;
    }
    const crtLoc = gl.getUniformLocation(program, "u_crt");
    if (crtLoc === null) {
        return null;
    }
    const ntscLoc = gl.getUniformLocation(program, "u_ntsc");
    if (ntscLoc === null) {
        return null;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.useProgram(program);
    gl.uniform1i(texLoc, 0);
    gl.uniform1i(crtLoc, 0);
    gl.uniform1i(ntscLoc, 0);
    gl.viewport(0, 0, frameW, frameH);
    return {
        gl,
        pixels: null,
        frameVersion: -1,
        dirty: true,
        crtOn: false,
        stretchOn: false,
        ntscOn: false,
        pixelRatio: 0,
        crtLoc,
        ntscLoc,
    };
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {string} vertGLSL
 * @param {string} fragGLSL
 * @returns {WebGLProgram | null}
 */
function createProgram(gl, vertGLSL, fragGLSL) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (vs === null) {
        return null;
    }
    gl.shaderSource(vs, vertGLSL);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (fs === null) {
        return null;
    }
    gl.shaderSource(fs, fragGLSL);
    gl.compileShader(fs);
    const p = gl.createProgram();
    if (p === null) {
        return null;
    }
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error((gl.getProgramInfoLog(p) ?? "").replace(/\0/g, "\n").trim());
        gl.deleteProgram(p);
        return null;
    }
    return p;
}
