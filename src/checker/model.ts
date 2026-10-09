/** Pure data model of the answer checker: keys, books, scans, grading. No DOM, no storage — easy to test. */

export type Opt = 0 | 1 | 2 | 3 | 4; // 0 = unknown / blank

/* ================================================================ keys */
/** A run of consecutive question numbers: `d[i]` is the key of question `from + i` ('1'..'4'). One character per key. */
export interface KeySeg { from: number; d: string }

export class KeyMap {
  private m = new Map<number, number>();
  static fromSegs(segs: KeySeg[] | undefined): KeyMap {
    const k = new KeyMap();
    (segs || []).forEach((s) => { for (let i = 0; i < s.d.length; i++) { const v = s.d.charCodeAt(i) - 48; if (v >= 1 && v <= 4) k.m.set(s.from + i, v); } });
    return k;
  }
  static fromRecord(r: Record<string | number, number>): KeyMap {
    const k = new KeyMap();
    Object.keys(r).forEach((n) => { const v = Number(r[n]), q = Number(n); if (q >= 1 && v >= 1 && v <= 4) k.m.set(q, v); });
    return k;
  }
  clone(): KeyMap { const k = new KeyMap(); this.m.forEach((v, n) => k.m.set(n, v)); return k; }
  get size(): number { return this.m.size; }
  get(n: number): number | undefined { return this.m.get(n); }
  has(n: number): boolean { return this.m.has(n); }
  set(n: number, v: number): void { if (v >= 1 && v <= 4) this.m.set(n, v); else this.m.delete(n); }
  delete(n: number): void { this.m.delete(n); }
  assign(rec: Record<number, number>): void { Object.keys(rec).forEach((n) => this.set(Number(n), rec[Number(n)])); }
  sorted(): number[] { return Array.from(this.m.keys()).sort((a, b) => a - b); }
  range(): [number, number] | null { if (!this.m.size) return null; const s = this.sorted(); return [s[0], s[s.length - 1]]; }
  toSegs(): KeySeg[] {
    const out: KeySeg[] = []; let cur: KeySeg | null = null, prev = -9;
    this.sorted().forEach((n) => {
      if (cur && n === prev + 1) cur.d += String(this.m.get(n));
      else { cur = { from: n, d: String(this.m.get(n)) }; out.push(cur); }
      prev = n;
    });
    return out;
  }
  /** how many keys fall into [a,b] */
  countIn(a: number, b: number): number { let c = 0; this.m.forEach((_, n) => { if (n >= a && n <= b) c++; }); return c; }
}

/* ================================================================ books */
export interface BookMeta {
  id: string;
  title: string;
  lesson?: string;   // planner lesson this book belongs to (e.g. «حسابان ۲»)
  source?: string;   // planner book name it is linked to
  color: string;
  count: number; min: number; max: number; weakCount: number;
  createdAt: number; updatedAt: number;
}
export interface Book extends BookMeta {
  segs: KeySeg[];
  weak: number[];    // question numbers whose key was not confirmed by the person
}

export const BOOK_COLORS = ['#2447d8', '#0fb5a4', '#f5a524', '#8a6fe8', '#d9534f', '#4caf7d', '#e0719a', '#5b7bd9'];
export const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function metaOf(b: Book): BookMeta {
  const { segs, weak, ...meta } = b; void segs; void weak; return meta;
}
export function makeBook(title: string, keys: KeyMap, extra: Partial<Book> = {}): Book {
  const now = Date.now();
  const b: Book = {
    id: newId('bk_'), title, color: BOOK_COLORS[Math.floor(Math.random() * BOOK_COLORS.length)],
    count: 0, min: 0, max: 0, weakCount: 0, createdAt: now, updatedAt: now, segs: [], weak: [], ...extra
  };
  return withKeys(b, keys, b.weak);
}
/** returns the book with segs/meta recomputed from a key map */
export function withKeys(b: Book, keys: KeyMap, weak: number[]): Book {
  const r = keys.range();
  const w = Array.from(new Set(weak)).filter((n) => keys.has(n) || true).sort((a, c) => a - c);
  return { ...b, segs: keys.toSegs(), weak: w, count: keys.size, min: r ? r[0] : 0, max: r ? r[1] : 0, weakCount: w.length, updatedAt: Date.now() };
}

/* ================================================================ text keys */
export const faDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));

/** "1285- گزینه 2" lines, "1285,2" pairs, or only digits 1-4 (then numbered from `start`) */
export function parseKeyText(text: string, start: number): { out: Record<number, number>; count: number; mode: 'digits' | 'pairs' } {
  const t = faDigits(text).replace(/[\u200c\u200f\u200e]/g, '');
  const out: Record<number, number> = {}; let count = 0;
  if (/^[\s,;1-4]+$/.test(t) && /[1-4]/.test(t)) {
    const d = t.replace(/[^1-4]/g, '');
    for (let i = 0; i < d.length; i++) { out[start + i] = +d[i]; count++; }
    return { out, count, mode: 'digits' };
  }
  const re = /(\d{1,5})\s*[-–—:.)/,،]*\s*(?:گزینه\s*)?([1-4])(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) { out[+m[1]] = +m[2]; count++; }
  return { out, count, mode: 'pairs' };
}

/* ================================================================ matching with the planner */
export const normName = (s: string) =>
  faDigits(s || '').replace(/[\u200c\u200f\u200e\s]+/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ًٌٍَُِّْ]/g, '').toLowerCase();

export interface BookHint { source?: string; lesson?: string; text?: string }
/** best library book for a planner card / report part: same book name first, then same lesson. */
export function matchBook(books: BookMeta[], h: BookHint): BookMeta | null {
  const src = normName(h.source || ''), les = normName(h.lesson || '');
  let best: BookMeta | null = null, bs = 0;
  books.forEach((b) => {
    let s = 0;
    const bsrc = normName(b.source || ''), btitle = normName(b.title);
    if (src && (bsrc === src || btitle === src)) s += 10;
    else if (src && (btitle.includes(src) || src.includes(btitle) || (bsrc && (bsrc.includes(src) || src.includes(bsrc))))) s += 6;
    if (les && normName(b.lesson || '') === les) s += 3;
    else if (les && btitle.includes(les.replace(/\d+$/, ''))) s += 1;
    if (s > bs) { bs = s; best = b; }
  });
  return bs >= 3 ? best : null;
}

/** «تست ۱۲۸۵ تا ۱۳۰۰» in a card's text → a likely question range. Only trusted when the book really has those keys. */
export function rangeHint(text: string | undefined, keys: KeyMap | null): { from: number; to: number } | null {
  if (!text || !keys || !keys.size) return null;
  const t = faDigits(text); const re = /(\d{1,5})\s*(?:تا|الی|-|–|—|to)\s*(\d{1,5})/g; let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const a = +m[1], b = +m[2];
    if (b > a && b - a < 300 && keys.countIn(a, b) >= 0.6 * (b - a + 1)) return { from: a, to: b };
  }
  return null;
}

/* ================================================================ sheet answers + grading */
export const SHEET_N = 300;
export interface RawRead { ans: number[]; dbl: boolean[] } // from the scanner, 1-based
export type Manual = Record<number, number>;               // person's corrections, 1-based; 0 = blank

export interface GradeSettings { startQ: number; from: number; to: number; penalty: 0 | 3 | 4; dblWrong: boolean }
export type Status = 'ok' | 'bad' | 'blank' | 'dbl' | 'nokey';
export interface GradedRow { q: number; bq: number; key?: number; mine: number; dbl: boolean; edited: boolean; st: Status }
export interface Grade {
  rows: GradedRow[]; correct: number; wrong: number; blank: number; double: number;
  graded: number; nokey: number; pct: number;
}

export function effective(read: RawRead, manual: Manual, q: number): { v: number; dbl: boolean; edited: boolean } {
  if (manual[q] !== undefined) return { v: manual[q], dbl: false, edited: true };
  return { v: read.ans[q] || 0, dbl: !!read.dbl[q], edited: false };
}

export function gradeSheet(read: RawRead, manual: Manual, keys: KeyMap | null, s: GradeSettings): Grade {
  const from = Math.max(1, s.from), to = Math.min(SHEET_N, s.to);
  const rows: GradedRow[] = []; let C = 0, W = 0, B = 0, D = 0, N = 0, X = 0;
  for (let q = from; q <= to; q++) {
    const bq = s.startQ + q - 1, key = keys ? keys.get(bq) : undefined, a = effective(read, manual, q);
    let st: Status;
    if (key === undefined) st = 'nokey';
    else if (a.dbl) st = s.dblWrong ? 'bad' : 'dbl';
    else if (!a.v) st = 'blank';
    else st = a.v === key ? 'ok' : 'bad';
    if (st === 'ok') C++; else if (st === 'bad') W++; else if (st === 'blank') B++; else if (st === 'dbl') D++; else X++;
    if (st !== 'nokey') N++;
    rows.push({ q, bq, key, mine: a.v, dbl: a.dbl, edited: a.edited, st });
  }
  const pts = C - (s.penalty ? W / s.penalty : 0);
  return { rows, correct: C, wrong: W, blank: B, double: D, graded: N, nokey: X, pct: N ? Math.round((pts / N) * 1000) / 10 : 0 };
}

/** what goes into a report part: total graded, wrong, blank (a double mark counts as blank unless it was graded wrong) */
export const toPartCounts = (g: Grade) => ({ total: g.graded, wrong: g.wrong, blank: g.blank + g.double });

/** index of the last marked question, used as the default end of the graded range */
export function lastMarked(read: RawRead, manual: Manual): number {
  let last = 0;
  for (let q = 1; q <= SHEET_N; q++) { const a = effective(read, manual, q); if (a.v || a.dbl) last = q; }
  return last;
}

/* ================================================================ scan history */
export interface ScanLink { dateKey?: string; dayId?: string; blockIndex?: number; plannerItemId?: string; lesson?: string; label?: string; sheetId?: string }
export interface ScanRecord {
  id: string; at: number;
  bookId?: string; bookTitle?: string;
  startQ: number; from: number; to: number;
  sheet: string;                          // 300 chars, effective answers: '0' blank, '1'-'4', 'd' double mark
  penalty: 0 | 3 | 4; dblWrong: boolean;
  total: number; correct: number; wrong: number; blank: number; double: number; pct: number;
  miss: [number, number, number][];       // [book question, my answer (0 blank, 5 double), key] for everything not correct
  link?: ScanLink;
}

export function packSheet(read: RawRead, manual: Manual): string {
  let s = '';
  for (let q = 1; q <= SHEET_N; q++) { const a = effective(read, manual, q); s += a.dbl ? 'd' : String(a.v || 0); }
  return s;
}
export function unpackSheet(s: string): RawRead {
  const ans = new Array(SHEET_N + 1).fill(0), dbl = new Array(SHEET_N + 1).fill(false);
  for (let q = 1; q <= SHEET_N; q++) { const c = s[q - 1]; if (c === 'd') dbl[q] = true; else ans[q] = c ? c.charCodeAt(0) - 48 : 0; }
  return { ans, dbl };
}

export function makeRecord(read: RawRead, manual: Manual, g: Grade, s: GradeSettings, book: BookMeta | null, link?: ScanLink): ScanRecord {
  const miss: [number, number, number][] = [];
  g.rows.forEach((r) => { if (r.st === 'bad' || r.st === 'blank' || r.st === 'dbl') miss.push([r.bq, r.dbl ? 5 : r.mine, r.key || 0]); });
  return {
    id: newId('sc_'), at: Date.now(), bookId: book?.id, bookTitle: book?.title,
    startQ: s.startQ, from: s.from, to: s.to, sheet: packSheet(read, manual), penalty: s.penalty, dblWrong: s.dblWrong,
    total: g.graded, correct: g.correct, wrong: g.wrong, blank: g.blank, double: g.double, pct: g.pct, miss, link
  };
}
/** grade the same sheet again, e.g. after a wrong key was corrected in the library */
export function regrade(rec: ScanRecord, keys: KeyMap): ScanRecord {
  const read = unpackSheet(rec.sheet);
  const s: GradeSettings = { startQ: rec.startQ, from: rec.from, to: rec.to, penalty: rec.penalty, dblWrong: rec.dblWrong };
  const g = gradeSheet(read, {}, keys, s);
  const fresh = makeRecord(read, {}, g, s, rec.bookId ? { id: rec.bookId, title: rec.bookTitle || '' } as BookMeta : null, rec.link);
  return { ...fresh, id: rec.id, at: rec.at };
}

/* ================================================================ one batch of keys coming from a reader */
export interface KeyBatch {
  keys: Record<number, number>;  // question number -> option
  remove?: number[];             // slots the reader decided are empty
  weak: number[];                // not confirmed by the person (shown red)
  edited?: number[];             // changed by hand
  first: number;                 // where to scroll the grid to
}


/* ================================================================ saved answer sheets (my own answers — no key needed) */
/**
 * A sheet of the person's own answers, kept apart from the answer keys. It comes from a photo of the paper sheet
 * (mode 'scan') or is typed on the virtual sheet during the test (mode 'live'). It can be compared with any book
 * later — as often as wanted — or just stay in the list for review.
 */
export interface SavedSheet {
  id: string; title: string;
  mode: 'scan' | 'live';
  state: 'open' | 'done';          // a live sheet is 'open' until the person finishes the test
  createdAt: number; updatedAt: number;
  sheet: string;                   // SHEET_N chars, same packing as ScanRecord.sheet: '0' blank, '1'-'4', 'd' double mark
  size: number;                    // how many questions the virtual sheet shows
  answered: number;
  startQ?: number;                 // question 1 of this sheet = this question of the book (remembered after a comparison)
  spentMs?: number;                // time spent on the virtual sheet
  bookId?: string; bookTitle?: string; // book of the last comparison
  scanId?: string; pct?: number;       // history record + percent of the last comparison
  lesson?: string; note?: string;
}

export const emptySheetString = () => '0'.repeat(SHEET_N);
export function countAnswered(sheet: string): number {
  let n = 0; for (let i = 0; i < SHEET_N; i++) { const c = sheet[i]; if (c && c !== '0') n++; } return n;
}
/** index (1-based) of the last answered question, 0 if none */
export function lastAnswered(sheet: string): number {
  for (let q = SHEET_N; q >= 1; q--) { const c = sheet[q - 1]; if (c && c !== '0') return q; } return 0;
}
/** a copy of the packed sheet with question q set to v (0 = blank) */
export function setAnswer(sheet: string, q: number, v: number): string {
  if (q < 1 || q > SHEET_N) return sheet;
  const base = sheet.length === SHEET_N ? sheet : (sheet + emptySheetString()).slice(0, SHEET_N);
  return base.slice(0, q - 1) + String(v >= 1 && v <= 4 ? v : 0) + base.slice(q);
}
/** how many rows a scanned sheet needs on the virtual sheet: up to the last answer, rounded up to 5, at least 25 */
export const sizeForScan = (sheet: string) => Math.min(SHEET_N, Math.max(25, Math.ceil(lastAnswered(sheet) / 5) * 5));

export function makeSavedSheet(title: string, mode: SavedSheet['mode'], sheet: string, extra: Partial<SavedSheet> = {}): SavedSheet {
  const now = Date.now();
  return {
    id: newId('sh_'), title, mode, state: mode === 'live' ? 'open' : 'done', createdAt: now, updatedAt: now,
    sheet, size: mode === 'live' ? 50 : sizeForScan(sheet), answered: countAnswered(sheet), ...extra
  };
}
/** returns the sheet with a new packed answer string; counters follow */
export function withAnswers(s: SavedSheet, packed: string, extra: Partial<SavedSheet> = {}): SavedSheet {
  return { ...s, ...extra, sheet: packed, answered: countAnswered(packed), updatedAt: Date.now() };
}
