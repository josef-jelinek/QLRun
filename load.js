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
    } catch (ex) {
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
    } catch (ex) {
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
    return io.httpGet(
        requestUrl,
        "arraybuffer",
        maxBytes,
        function (err, buf) {
            if (err !== null) {
                onDone(err, null, null);
                return;
            }
            if (!(buf instanceof ArrayBuffer)) {
                onDone("Could not load " + requestUrl + ": empty response.", null, null);
                return;
            }
            if (!isZip) {
                onDone(null, name, buf);
                return;
            }
            pickZipMember(buf, member, onDone);
        },
    );
}

/**
 * @param {ArrayBuffer} buf
 * @param {string} member
 * @param {function(string | null, string | null, ArrayBuffer | null): void} onDone
 */
function pickZipMember(buf, member, onDone) {
    const listing = zip.list(buf);
    if (listing.err !== null || listing.entries === null) {
        onDone(listing.err ?? "Could not read ZIP.", null, null);
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
            onDone("ZIP member not found: " + member, null, null);
            return;
        }
    } else {
        const names = [];
        for (let i = 0; i < listing.entries.length; i += 1) {
            const entry = listing.entries[i];
            if (!media.isJunkName(entry.name) && media.isMdvName(entry.name)) {
                names.push(entry);
            }
        }
        names.sort(function (a, b) {
            if (a.name < b.name) {
                return -1;
            }
            if (a.name > b.name) {
                return 1;
            }
            return 0;
        });
        if (names.length === 0) {
            onDone("ZIP contains no .mdv image.", null, null);
            return;
        }
        chosen = names[0];
    }
    zip.readEntry(buf, chosen, function (extractErr, bytes) {
        if (extractErr !== null || !(bytes instanceof Uint8Array)) {
            onDone(extractErr ?? "Could not extract ZIP member.", chosen.name, null);
            return;
        }
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        onDone(null, chosen.name, copy.buffer);
    });
}
