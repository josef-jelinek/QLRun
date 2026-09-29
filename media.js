const mdvExt = /\.mdv$/i;
const zipExt = /\.zip$/i;
const winExt = /\.win$/i;
const imgExt = /\.img$/i;
const romExt = /\.(rom|bin)$/i;

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isMdvName(name) {
    return mdvExt.test(name);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isZipName(name) {
    return zipExt.test(name);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isWinName(name) {
    return winExt.test(name);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isImgName(name) {
    return imgExt.test(name);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isRomName(name) {
    return romExt.test(name);
}

/**
 * Dotfiles, including the `._` resource forks macOS adds to ZIP archives.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isJunkName(name) {
    const leaf = name.split("/").pop() ?? name;
    return leaf.startsWith(".");
}
