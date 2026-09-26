import * as io from "./io.js";
import * as zip from "./zip.js";
import * as media from "./media.js";

const maxMediaBytes = 2 * 1024 * 1024;
const maxZipBytes = 8 * 1024 * 1024;

/**
 * Fetch a Microdrive image, or a ZIP containing one, for `index.html?url=`.
 *
 * @param {string} urlParam
 * @param {function(string | null, string | null, ArrayBuffer | null): void} onDone
 * @returns {(function(): void) | null}
 */
export function fromUrl(urlParam, onDone) {
    /** @type {URL | null} */
    let url = null;
    try {
        url = new URL(urlParam, window.location.href);
    } catch {
        onDone("Invalid startup file URL.", null, null);
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        onDone("A startup file protocol must be http(s).", null, null);
        return null;
    }
    let member = url.hash.slice(1);
    try {
        member = decodeURIComponent(member);
    } catch {
        // Not percent-encoded after all.
    }
    const name = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
    const isZip = media.isZipName(url.pathname);
    if (!isZip && !media.isMdvName(url.pathname)) {
        onDone("Unsupported startup file type: " + url.pathname + ".", null, null);
        return null;
    }
    const requestUrl = url.origin + url.pathname + url.search;
    let maxBytes = maxMediaBytes;
    if (isZip) {
        maxBytes = maxZipBytes;
    }
    let done = false;
    const abort = io.httpGet(
        requestUrl,
        "arraybuffer",
        maxBytes,
        function (err, buf) {
            if (done) {
                return;
            }
            if (err !== null) {
                done = true;
                onDone(err, null, null);
                return;
            }
            if (!(buf instanceof ArrayBuffer)) {
                done = true;
                onDone("Could not load " + requestUrl + ": empty response.", null, null);
                return;
            }
            if (!isZip) {
                done = true;
                onDone(null, name, buf);
                return;
            }
            pickZipMember(buf, member, function (extractErr, extractName, extractBytes) {
                if (done) {
                    return;
                }
                done = true;
                onDone(extractErr, extractName, extractBytes);
            });
        },
    );
    if (abort === null) {
        return null;
    }
    return function () {
        if (done) {
            return;
        }
        done = true;
        abort();
        onDone("Aborted.", null, null);
    };
}

/**
 * Select one `.mdv` member and extract it as an ArrayBuffer.
 *
 * @param {ArrayBuffer} buf
 * @param {string} member
 * @param {function(string | null, string | null, ArrayBuffer | null): void} onDone
 */
function pickZipMember(buf, member, onDone) {
    const listing = zip.list(buf);
    if (listing.err !== null || listing.entries === null) {
        let err = "Could not read ZIP.";
        if (listing.err !== null) {
            err = listing.err;
        }
        onDone(err, null, null);
        return;
    }
    /** @type {import("./zip.js").ZipEntry | null} */
    let chosen = null;
    if (member !== "") {
        for (let i = 0; i < listing.entries.length; i += 1) {
            if (listing.entries[i].name === member) {
                chosen = listing.entries[i];
                break;
            }
        }
        if (chosen === null) {
            onDone("ZIP member not found: " + member + ".", null, null);
            return;
        }
        if (!media.isMdvName(chosen.name)) {
            onDone("ZIP entry " + chosen.name + " is not a Microdrive image.", null, null);
            return;
        }
    } else {
        for (let i = 0; i < listing.entries.length; i += 1) {
            const entry = listing.entries[i];
            const stored = entry.method === 0;
            const deflated = entry.method === 8 && typeof DecompressionStream !== "undefined";
            if (
                media.isJunkName(entry.name) ||
                !media.isMdvName(entry.name) ||
                entry.encrypted ||
                (!stored && !deflated) ||
                entry.size > maxMediaBytes
            ) {
                continue;
            }
            if (chosen === null || entry.name < chosen.name) {
                chosen = entry;
            }
        }
        if (chosen === null) {
            onDone("ZIP contains no .mdv image.", null, null);
            return;
        }
    }
    if (chosen.size > maxMediaBytes) {
        onDone("ZIP entry " + chosen.name + " is larger than " + maxMediaBytes + " bytes.", null, null);
        return;
    }
    zip.readEntry(buf, chosen, function (extractErr, bytes) {
        if (extractErr !== null) {
            onDone(extractErr, chosen.name, null);
            return;
        }
        if (!(bytes instanceof ArrayBuffer)) {
            onDone("Could not extract ZIP member.", chosen.name, null);
            return;
        }
        onDone(null, chosen.name, bytes);
    });
}
