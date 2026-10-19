/**
 * Typed doorway to the scanning engine. Everything the UI needs from the photo readers goes through here,
 * so the engine files (keyScan.ts, legacy.ts) stay exactly as they were written and are never edited by hand.
 */
import { KeyScan as KS } from './keyScan';
import { invertBadges } from './badges';
import { refineKeyScan } from './headers';
import { replacePills } from './pills';
import { enlarge, normalize, glyphHeightOf, MAX_PIXELS } from './prep';
import { repairLanes } from './lanes';
import {
  decideMarks, detectSheet, homography, applyH, WW, WH, BC, BR,
  ksBuiltin, ksLearned, ksGray, ksFromImage, ksTurn, KS_LEARN,
  readExplanation, orderBoxes, learnDigit, classify
} from './legacy';

export { homography, applyH, ksFromImage, ksTurn, readExplanation, orderBoxes, learnDigit, KS };

/* ---------------------------------------------------------------- answer sheet (bubbles) */
export const SHEET_W = WW, SHEET_H = WH, SHEET_COLS = BC, SHEET_ROWS = BR; // warped size, block columns, block rows
export const SHEET_QUESTIONS = 300;

export interface SheetGeom { c: [number, number][]; q: number; p: number }
export interface SheetScan { G: Uint8Array; geom: SheetGeom[]; scores: number[][] }
export interface SheetMarks { ans: number[]; dbl: boolean[]; last: number; marked: number }
export type Corners = [number, number][];

/** Warp the photo with the 4 corners and measure how dark every bubble is. */
export function scanSheet(img: HTMLImageElement, corners: Corners): SheetScan {
  return detectSheet(img, img.naturalWidth, img.naturalHeight, corners) as SheetScan;
}
/** Turn bubble darkness into one answer per question (0 = blank) or a double mark. `sensitivity` is the 20..70 slider. */
export function marksFromScan(scores: number[][], sensitivity: number): SheetMarks {
  return decideMarks(scores, sensitivity);
}

/* ---------------------------------------------------------------- key list photo (KeyScan) */
export const keyPageCanvas = (im: HTMLImageElement, quarter: number): HTMLCanvasElement => ksFromImage(im, quarter);
export function keyPageGray(cv: HTMLCanvasElement): Uint8Array { return ksGray(cv); }

/** options for a scan of a grey image that a pre-step already enlarged by `scale` (so the reader must not enlarge it a second time) */
const upOpt = (rtl: boolean, scale: number): any => (scale > 1 ? { rtl, _up: scale } : { rtl });

/** cells that were found with a digit and are not flagged as doubtful */
const confidentCells = (R: any): number => R.seq.filter((p: any) => p.d && !p.low).length;

export function runKeyScan(cv: HTMLCanvasElement, rtl: boolean): { R: any; names: number[] } {
  return runKeyScanGray(ksGray(cv), cv.width, cv.height, rtl);
}

/* ---------------------------------------------------------------- how complete is a reading?
   A key page is a table: every column except the one read last has the same number of rows. A reading that breaks this
   lost or invented cells (and the numbering after them shifts), so it is worse than one that does not, whatever the digits look like. */
export interface GridStats { ncol: number; M: number; dev: number; lastOver: number; lastShort: number; missing: number; confident: number; cells: number }
export function gridStats(R: any): GridStats {
  const by: Record<number, any[]> = {};
  (R && R.seq || []).forEach((p: any) => { (by[p.col] = by[p.col] || []).push(p); });
  const lens = Object.keys(by).map(Number).sort((a, b) => a - b).map((c) => by[c].length);
  const cnt: Record<number, number> = {}; let M = 0, best = 0;
  lens.forEach((l) => { cnt[l] = (cnt[l] || 0) + 1; if (cnt[l] > best || (cnt[l] === best && l > M)) { best = cnt[l]; M = l; } });
  let dev = 0, lastOver = 0, lastShort = 0;
  lens.forEach((l, i) => {
    if (i < lens.length - 1) dev += Math.abs(l - M);
    else { lastOver = Math.max(0, l - M); lastShort = Math.max(0, M - l); }
  });
  const seq = (R && R.seq) || [];
  return { ncol: lens.length, M, dev, lastOver, lastShort, missing: seq.filter((p: any) => !p.d).length, confident: seq.filter((p: any) => p.d && !p.low).length, cells: seq.length };
}
export function readingScore(R: any): number {
  if (!R || !R.km) return -1e9;
  const g = gridStats(R);
  return g.confident - 4 * g.dev - 4 * g.lastOver - 1 * g.lastShort - 1.5 * g.missing;
}
/** true when the reading is a regular table with nothing missing (or too small a page to judge) */
export function readingIsGood(R: any): boolean {
  if (!R || !R.km) return false;
  const g = gridStats(R);
  if (g.cells < 24) return false;
  if (g.ncol < 3) return g.missing === 0;
  return g.dev === 0 && g.lastOver === 0 && g.missing === 0 && g.lastShort <= Math.max(2, 0.5 * g.M);
}

/**
 * Second family of attempts, used only when the plain reading is not a clean table: the grey image is enlarged with a sharp filter
 * and normalised locally (prep.ts), which rescues low-resolution screenshots, faint or shaded columns and thin question numbers.
 * The same fallbacks as before (badges, capsules) are tried on the cleaned image. The best reading by readingScore wins.
 */
function preppedChain(gray: Uint8Array, W: number, H: number, rtl: boolean, accept: (R: any) => void): void {
  const hm = glyphHeightOf(gray, W, H);
  if (hm < 5) return;
  let sc = hm < 26 ? Math.min(4, Math.ceil(26 / hm * 10) / 10) : 1;
  sc = Math.max(1, Math.min(sc, Math.sqrt(MAX_PIXELS / (W * H))));
  const E = enlarge(gray, W, H, sc), up = E.w / W > 1.001 ? E.w / W : 1;
  const hg = Math.round(hm * up);
  const g = normalize(E.g, E.w, E.h, hg);
  const finish = (gr: Uint8Array, w: number, h: number, extra: number, tag: any): any => {
    const total = up * extra, R0 = KS.scan(gr, w, h, total > 1.001 ? { rtl, _up: total } : { rtl });
    R0.scale = total > 1.001 ? total : undefined;
    const R = refineKeyScan(R0, rtl); Object.assign(R, tag); R.laneFixes = repairLanes(R); return R;
  };
  let best: any = null;
  const take = (R: any) => { accept(R); if (!best || readingScore(R) > readingScore(best)) best = R; };
  try { take(finish(g, E.w, E.h, 1, { prep: true })); } catch (e) { /* next */ }
  if (!best || !readingIsGood(best)) {
    try { const b = replacePills(g, E.w, E.h, hg); if (b) take(finish(b.gray, b.W, b.H, b.scale, { prep: true, pills: b.count })); } catch (e) { /* next */ }
  }
  if (!best || !readingIsGood(best)) {
    try { const b = invertBadges(g, E.w, E.h); if (b) take(finish(b.gray, b.W, b.H, b.scale, { prep: true, badges: b.count })); } catch (e) { /* next */ }
  }
}

/** the same reader on a plain grey raster (used by runKeyScan and by the offline test harness) */
export function runKeyScanGray(gray: Uint8Array, W: number, H: number, rtl: boolean): { R: any; names: number[] } {
  let R: any = null, firstError: any = null;
  try { R = plainChain(gray, W, H, rtl); if (R) R.laneFixes = repairLanes(R); } catch (e) { firstError = e; }
  if (!readingIsGood(R)) {
    let cands: any[] = [];
    try { preppedChain(gray, W, H, rtl, (c) => { cands.push(c); }); } catch (e) { if (!R) firstError = firstError || e; }
    cands.forEach((c) => { if (!R || readingScore(c) > readingScore(R)) R = c; });
  }
  if (!R) throw firstError || new Error('خواندن عکس ممکن نشد');
  const perm = R.km && R.km.C ? KS.nameClusters(R.km.C, ksLearned().concat(ksBuiltin())) : null;
  return { R, names: perm || [1, 2, 3, 4] };
}

/** the original chain: plain scan, header clean-up, then the badge and capsule fallbacks */
function plainChain(gray: Uint8Array, W: number, H: number, rtl: boolean): any {
  const cv = { width: W, height: H };
  let R: any = null, firstError: any = null;
  try { R = KS.scan(gray, cv.width, cv.height, { rtl }); } catch (e) { firstError = e; }
  // Tables with a printed header row (سؤال | پاسخ) and pages whose first column has one-digit question numbers: headers.ts
  if (R) R = refineKeyScan(R, rtl);
  // Books that print the option digit LIGHT on a dark badge (white digit in a purple rounded box) are invisible to the reader above:
  // it finds nothing or a handful of cells. Only then try again with every badge turned into "dark digit on white" (badges.ts),
  // and keep that reading only if it is clearly better. Ordinary books never reach this branch.
  const poor = !R || !R.km || R.seq.length < 60 || R.seq.filter((p: any) => p.low || !p.d).length > 0.3 * R.seq.length;
  if (poor) {
    try {
      const b = invertBadges(gray, cv.width, cv.height);
      if (b) {
        const R2 = KS.scan(b.gray, b.W, b.H, upOpt(rtl, b.scale)); R2.scale = b.scale > 1 ? b.scale : undefined;
        if (R2.km && (!R || confidentCells(R2) > confidentCells(R))) { R2.badges = b.count; R = refineKeyScan(R2, rtl); }
      }
    } catch (e) { /* keep the plain reading */ }
  }
  // Question numbers printed light on dark capsules (pills.ts): a third attempt, kept only if clearly better
  const stillPoor = !R || !R.km || R.seq.length < 60 || R.seq.filter((p: any) => p.low || !p.d).length > 0.3 * R.seq.length || R.seq.length < 0.8 * (R.ncol || 1) * Math.max(...R.seq.map((p: any) => p.row + 1), 1);
  if (stillPoor) {
    try {
      const b = replacePills(gray, cv.width, cv.height);
      if (b) {
        const R3x = KS.scan(b.gray, b.W, b.H, upOpt(rtl, b.scale)); R3x.scale = b.scale > 1 ? b.scale : undefined;
        const R3 = refineKeyScan(R3x, rtl);
        if (R3.km && (!R || confidentCells(R3) > confidentCells(R))) { R3.pills = b.count; R = R3; }
      }
    } catch (e) { /* keep the previous reading */ }
  }
  if (!R) throw firstError || new Error('خواندن عکس ممکن نشد');
  return R;
}

/** Remember what the four shapes of a confirmed page are called, so the next book in the same font needs no help. */
export function rememberKeyShapes(R: any, names: number[]): void {
  if (!R || !R.km) return;
  try {
    const a = JSON.parse(localStorage.getItem(KS_LEARN) || '[]');
    R.km.C.forEach((c: any, i: number) => { a.push({ l: names[i], f: Array.from(c as ArrayLike<number>).map((v: number) => Math.round(v * 1000) / 1000) }); });
    localStorage.setItem(KS_LEARN, JSON.stringify(a.slice(-40)));
  } catch (e) { /* ignore */ }
}
export function forgetKeyShapes(): void { try { localStorage.removeItem(KS_LEARN); } catch (e) { /* ignore */ } }

/* ---------------------------------------------------------------- explanation page */
export interface ExplRow { num: number; key: number; detected: number; gl: any; why: string; box: { x: number; y: number; w: number; h: number }; learned?: boolean }

export function scanExplanation(img: HTMLImageElement, forcedRot: number | undefined, firstNumber: number): { res: any; rows: ExplRow[] } {
  const res: any = readExplanation(img, forcedRot);
  const items = orderBoxes(res.items);
  const rows: ExplRow[] = items.map((it: any, i: number) => {
    let why = '';
    if (!it.key) why = 'گزینه نامشخص';
    else if (it.d2 / Math.max(it.d1, 1e-6) < 1.4 || it.d1 > 40) why = 'گزینه نامطمئن';
    return { num: firstNumber ? firstNumber + i : 0, key: it.key, detected: it.key, gl: it.gl, why, box: it.box };
  });
  return { res, rows };
}
export { classify };
