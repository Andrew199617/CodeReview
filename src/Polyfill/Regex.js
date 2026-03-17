
/**
 * @description Escapes a string for safe insertion into a RegExp pattern.
 * @param {string} value Raw string to escape.
 * @returns {string} Escaped string safe for new RegExp().
 */
export function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\/]/g, (rawChar) => `\\${rawChar}`);
}