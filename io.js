/**
 * Completion callback used by local and HTTP reads.
 *
 * @callback OnDone
 * @param {string | null} err
 * @param {*} result
 */

/**
 * Fetch a bounded HTTP resource and return a callback-driven abort operation,
 * or null when the request could not start and `onDone` has already run.
 * Aborting reports "Canceled." through `onDone`. An array buffer must hold 1
 * to `maxBytes` bytes.
 *
 * @param {string} url
 * @param {XMLHttpRequestResponseType} responseType
 * @param {number} maxBytes
 * @param {OnDone} onDone
 * @returns {(function(): void) | null} abort
 */
export function httpGet(url, responseType, maxBytes, onDone) {
    const errLead = "Could not load \"" + url + "\"";
    /** @type {XMLHttpRequest | null} */
    let xhr = new XMLHttpRequest();

    xhr.onprogress = function (e) {
        const tooLarge = (Number.isFinite(e.total) && e.total > maxBytes) || (Number.isFinite(e.loaded) && e.loaded > maxBytes);
        if (xhr === null || !tooLarge) {
            return;
        }
        const r = xhr;
        xhr = null; // set to null before abort as onabort is called immediately
        r.abort();
        onDone(errLead + ": Response is larger than " + maxBytes + " bytes.", null);
    };

    xhr.onload = function () {
        if (xhr === null) {
            return;
        }
        const status = xhr.status;
        const response = xhr.response;
        xhr = null;
        if (status !== 200 && status !== 0) {
            onDone(errLead + " (HTTP " + status + ").", null);
            return;
        }
        if (responseType === "arraybuffer") {
            checkBytes(errLead, response, maxBytes, onDone);
            return;
        }
        onDone(null, response);
    };

    xhr.onerror = function () {
        if (xhr === null) {
            return;
        }
        xhr = null;
        onDone(errLead + ".", null);
    };

    xhr.onabort = function () {
        if (xhr === null) {
            return;
        }
        xhr = null;
        onDone(errLead + ": Canceled.", null);
    };

    try {
        // A malformed URL throws from open().
        xhr.open("GET", url);
        xhr.responseType = responseType;
        xhr.send();
    } catch (ex) {
        xhr = null;
        onDone(errorText(errLead, ex), null);
        return null; // synchronous onDone, no abort
    }

    return function () {
        if (xhr !== null) {
            xhr.abort();
        }
    };
}

/**
 * Read a local browser file as an array buffer of 1 to `maxBytes` bytes, or
 * of any nonzero size when `maxBytes` is 0. A file of the wrong size is not
 * read at all.
 *
 * @param {File} file
 * @param {number} maxBytes
 * @param {OnDone} onDone
 */
export function readFile(file, maxBytes, onDone) {
    const errLead = "Could not load \"" + file.name + "\"";
    let limit = maxBytes;
    if (limit <= 0) {
        limit = Infinity;
    }
    if (file.size === 0 || file.size > limit) {
        onDone(errLead + ": " + sizeError(limit, file.size), null);
        return;
    }
    const reader = new FileReader();

    reader.onload = function () {
        checkBytes(errLead, reader.result, limit, onDone);
    };

    reader.onerror = function () {
        onDone(errorText(errLead, reader.error), null);
    };

    reader.onabort = function () {
        onDone(errLead + ": Canceled.", null);
    };

    try {
        reader.readAsArrayBuffer(file);
    } catch (ex) {
        onDone(errorText(errLead, ex), null);
    }
}

/**
 * Pass on an array buffer of 1 to `maxBytes` bytes, or report what came.
 *
 * @param {string} errLead
 * @param {*} result
 * @param {number} maxBytes
 * @param {OnDone} onDone
 */
function checkBytes(errLead, result, maxBytes, onDone) {
    if (!(result instanceof ArrayBuffer)) {
        onDone(errLead + ": Empty read.", null);
        return;
    }
    if (result.byteLength === 0 || result.byteLength > maxBytes) {
        onDone(errLead + ": " + sizeError(maxBytes, result.byteLength), null);
        return;
    }
    onDone(null, result);
}

/**
 * @param {number} maxBytes
 * @param {number} size
 * @returns {string}
 */
function sizeError(maxBytes, size) {
    if (maxBytes === Infinity) {
        return "Empty read.";
    }
    return "Expected 1 to " + maxBytes + ", got " + size + " bytes.";
}

/**
 * An error message from its lead and whatever was thrown or reported, which
 * may be an Error, a DOMException, or anything else; one full stop ends it.
 *
 * @param {string} lead
 * @param {*} ex
 * @returns {string}
 */
function errorText(lead, ex) {
    let err = lead;
    if (typeof ex?.message === "string" && ex.message !== "") {
        err += ": " + ex.message.replace(/\.$/, "");
    }
    return err + ".";
}
