const mdvExt = /\.mdv$/i;
const zipExt = /\.zip$/i;
const romExt = /\.(rom|bin)$/i;
const winExt = /\.win$/i;
const imgExt = /\.img$/i;

/** @param {string} name */
export function isMdvName(name) {
    return mdvExt.test(name);
}

/** @param {string} name */
export function isZipName(name) {
    return zipExt.test(name);
}

/** @param {string} name */
export function isRomName(name) {
    return romExt.test(name);
}

/** @param {string} name */
export function isWinName(name) {
    return winExt.test(name);
}

/** @param {string} name */
export function isImgName(name) {
    return imgExt.test(name);
}

/** @param {string} name */
export function isJunkName(name) {
    const leaf = name.split("/").pop() ?? name;
    if (leaf.startsWith(".")) {
        return true;
    }
    if (leaf.startsWith("__MACOSX")) {
        return true;
    }
    return leaf === "Thumbs.db" || leaf === "desktop.ini";
}
