/** Spaced-repetition rules of the question vault (pure functions, no browser APIs). */
export const DAY = 864e5;
/** Leitner boxes: how many days until the next review after each box (box 0 = 5 hours, i.e. «later today») */
export const INTERVALS = [0.2, 1, 3, 7, 14, 30];

export interface SrsFields { tries: number; wins: number; box: number; due: number; last: number; lastOk?: boolean }

export function nextSrs(q: SrsFields, win: boolean, now = Date.now()): SrsFields {
  const box = win ? Math.min(INTERVALS.length - 1, (q.box || 0) + 1) : 0;
  return { tries: (q.tries || 0) + 1, wins: (q.wins || 0) + (win ? 1 : 0), box, last: now, lastOk: win, due: now + INTERVALS[box] * DAY };
}
/** has been practised and its review time has come */
export const isDue = (q: SrsFields, now = Date.now()): boolean => !!q.tries && (q.due || 0) <= now;
/** answered wrong again and again — deserves extra attention */
export const isLeech = (q: SrsFields): boolean => q.tries - q.wins >= 3 && q.wins / Math.max(1, q.tries) < 0.5;
