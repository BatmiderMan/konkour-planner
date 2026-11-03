/**
 * Pure logic of the virtual answer sheet (no DOM, no storage): which question is next under a 2x/3x plan,
 * what a key press does, and the time bookkeeping. Kept apart so it can be tested on its own.
 */
import { SHEET_N, onStep, setAnswer } from './model';

export type KeyAction =
  | { t: 'answer'; v: 1 | 2 | 3 | 4 }
  | { t: 'blank' }            // 0: leave this question empty and go on
  | { t: 'clear' }            // Backspace / Delete: empty this question and stay
  | { t: 'move'; dir: 1 | -1; any: boolean }
  | { t: 'home' }
  | { t: 'end' }
  | { t: 'pause' };

interface KeyLike { key: string; code?: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

/** the digit a key press stands for: works with Persian / Arabic keyboards and the numpad */
export function digitOf(e: KeyLike): number | null {
  const k = e.key || '';
  if (k.length === 1) {
    if (k >= '0' && k <= '9') return +k;
    const f = FA.indexOf(k); if (f >= 0) return f;
    const a = AR.indexOf(k); if (a >= 0) return a;
  }
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
  return m ? +m[1] : null;
}

export function keyToAction(e: KeyLike): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const d = digitOf(e);
  if (d !== null) {
    if (d >= 1 && d <= 4) return { t: 'answer', v: d as 1 | 2 | 3 | 4 };
    if (d === 0) return { t: 'blank' };
    return null;
  }
  switch (e.key) {
    case 'ArrowDown': case 'ArrowRight': return { t: 'move', dir: 1, any: !!e.shiftKey };
    case 'ArrowUp': case 'ArrowLeft': return { t: 'move', dir: -1, any: !!e.shiftKey };
    case 'Backspace': case 'Delete': return { t: 'clear' };
    case 'Home': return { t: 'home' };
    case 'End': return { t: 'end' };
    case ' ': case 'Spacebar': return { t: 'pause' };
    default: return null;
  }
}

export interface Plan { size: number; step: number; off: number }

/** next question in a direction; with `any` the 2x/3x plan is ignored. Stays put at the ends. */
export function stepFrom(q: number, dir: 1 | -1, p: Plan, any = false): number {
  for (let n = q + dir; n >= 1 && n <= p.size; n += dir) if (any || onStep(n, p.step, p.off)) return n;
  return q;
}
export function firstOn(p: Plan): number {
  for (let n = 1; n <= p.size; n++) if (onStep(n, p.step, p.off)) return n;
  return 1;
}
export function lastOn(p: Plan): number {
  for (let n = p.size; n >= 1; n--) if (onStep(n, p.step, p.off)) return n;
  return p.size;
}

export interface SheetCursor { sheet: string; q: number }
export interface KeyResult extends SheetCursor { changed: boolean; atEnd: boolean }

/** what one key press does to the sheet (answers string) and the selected question */
export function applyAction(cur: SheetCursor, a: KeyAction, p: Plan, autoNext = true): KeyResult {
  const q = Math.min(Math.max(1, cur.q), Math.min(p.size, SHEET_N));
  switch (a.t) {
    case 'answer':
    case 'blank': {
      const sheet = setAnswer(cur.sheet, q, a.t === 'answer' ? a.v : 0);
      const nq = autoNext ? stepFrom(q, 1, p) : q;
      return { sheet, q: nq, changed: sheet !== cur.sheet, atEnd: autoNext && nq === q };
    }
    case 'clear': {
      const sheet = setAnswer(cur.sheet, q, 0);
      return { sheet, q, changed: sheet !== cur.sheet, atEnd: false };
    }
    case 'move': return { sheet: cur.sheet, q: stepFrom(q, a.dir, p, a.any), changed: false, atEnd: false };
    case 'home': return { sheet: cur.sheet, q: firstOn(p), changed: false, atEnd: false };
    case 'end': return { sheet: cur.sheet, q: lastOn(p), changed: false, atEnd: false };
    default: return { ...cur, q, changed: false, atEnd: false };
  }
}

/** how many questions belong to the plan (the ones that must be answered) */
export function planCount(p: Plan): number {
  let n = 0; for (let q = 1; q <= p.size; q++) if (onStep(q, p.step, p.off)) n++; return n;
}

/** answered questions that belong to the plan / all answered */
export function answeredIn(sheet: string, p: Plan): { onPlan: number; extra: number } {
  let onPlan = 0, extra = 0;
  for (let q = 1; q <= p.size; q++) { const c = sheet[q - 1]; if (c && c !== '0') { if (onStep(q, p.step, p.off)) onPlan++; else extra++; } }
  return { onPlan, extra };
}

/** «۱۲۸۵ تا ۱۳۰۰» in the text of a planner card → first number and how many questions */
export function rangeFromText(text: string | undefined): { from: number; count: number } | null {
  if (!text) return null;
  const t = text.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  const m = /(\d{1,5})\s*(?:تا|الی|-|–|—|to)\s*(\d{1,5})/.exec(t);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  return b > a && b - a < SHEET_N ? { from: a, count: b - a + 1 } : null;
}
