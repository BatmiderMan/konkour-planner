/**
 * Sub-questions of a grouped quiz are printed "N-k" in a book. A pack stores them as ONE integer: n = N*100 + k
 * (e.g. 668-4 -> 66804). Every ordinary book has n < 10000, so for those packs nothing below changes.
 */
const SUB_MIN = 10000;
/** the printed number a student sees: 66804 -> "668-4", 668 -> "668" */
export const qno = (n: number): string => (n >= SUB_MIN && n % 100 !== 0 ? Math.floor(n / 100) + '-' + (n % 100) : String(n));
/** the book number this question belongs to (for chapter ranges): 66804 -> 668 */
export const bn = (n: number): number => (n >= SUB_MIN && n % 100 !== 0 ? Math.floor(n / 100) : n);
/** sort: by book number, then by n (668 < 668-1 < 668-2 < 669) */
export const byQno = (a: number, b: number): number => bn(a) - bn(b) || a - b;
