/**
 * headers.ts — clean-up around KeyScan for key tables that have a printed HEADER ROW above every column
 * (e.g. «سؤال | پاسخ» in a coloured band). Like badges.ts it works around the scanner (keyScan.ts is never edited):
 *
 *  1. findHeaderBand / wipeBand — KeyScan cannot tell a word from a digit pair. The «پا» of «پاسخ» looks like an option digit
 *     and «سؤال» like a question number, so every column got a bogus first cell. That shifted the numbering by one per column
 *     and wasted one of the four shape clusters on the header glyphs (so real digits were mixed up). We find the band from the
 *     first scan, paint it out in a copy of the grey image and scan again.
 *  2. fillShortColumns — a column that is clearly shorter than its neighbours (typically the first column of a book page whose
 *     question numbers 1..9 have ONE digit: KeyScan only treats 2+ digit marks as question numbers) gets the missing rows back
 *     by looking for the option digit at the place where the neighbouring column has that row. Unfindable rows stay as empty
 *     slots so the numbering cannot shift.
 *
 * Pages without a header row, or with a full set of columns, are returned untouched.
 */
import { KeyScan as KS } from './keyScan';

const med = (a: number[]): number => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };

export interface HeaderBand { v: number; pitch: number; cols: number }

/** columns of the reading sequence, in order */
function columnsOf(R: any): any[][] {
  const by: Record<number, any[]> = {};
  R.seq.forEach((p: any) => { (by[p.col] = by[p.col] || []).push(p); });
  return Object.keys(by).map(Number).sort((a, b) => a - b).map((c) => by[c].sort((p: any, q: any) => p.y - q.y));
}

/**
 * A header cell is the first cell of a column that looks unlike the rows below it. Three independent signals:
 * the digit sits at a different distance from its "number" (a word is not laid out like digit + number), the "number" has
 * taller glyphs (letters), and the digit falls in a rare / doubtful shape cluster. Two of three on the first cell of most
 * columns, all on one line, is a header row.
 */
export function findHeaderBand(R: any): HeaderBand | null {
  if (!R || !R.km || !R.seq || R.seq.length < 24) return null;
  const h0 = R.h0, seq = R.seq;
  const withN = seq.filter((p: any) => p.d && p.n);
  if (withN.length < 20) return null;
  const mdx = med(withN.map((p: any) => p.dx));
  const mad = med(withN.map((p: any) => Math.abs(p.dx - mdx)));
  const mH = med(withN.map((p: any) => Math.max(...p.n.g.map((g: any) => g.h))));
  const pop = [0, 0, 0, 0]; seq.forEach((p: any) => { if (p.cl >= 0) pop[p.cl]++; });
  const signals = (p: any): number => {
    if (!p.d || !p.n) return 0;
    let s = 0;
    if (Math.abs(p.dx - mdx) > Math.max(0.9 * h0, 4 * mad)) s++;
    if (Math.max(...p.n.g.map((g: any) => g.h)) > 1.12 * mH) s++;
    if ((p.cl >= 0 && pop[p.cl] < 0.08 * seq.length) || p.low) s++;
    return s;
  };
  const cols = columnsOf(R).filter((c) => c.length >= 5);
  if (cols.length < 2) return null;
  const flagged = cols.map((c) => c[0]).filter((p) => signals(p) >= 2);
  if (flagged.length < 2 || flagged.length < 0.6 * cols.length) return null;
  const pitch = R.pitch || 3 * h0, v = med(flagged.map((p: any) => p.y));
  if (flagged.some((p: any) => Math.abs(p.y - v) > 0.6 * pitch)) return null; // not one line: no band
  // the band must sit above the rest of the table
  const restTop = med(cols.map((c) => c[1].y));
  if (!(v < restTop - 0.5 * pitch)) return null;
  return { v, pitch, cols: flagged.length };
}

/** copy of the grey image with the header band painted over with paper colour */
export function wipeBand(R: any, band: HeaderBand): Uint8Array {
  const { gray, W, H, cosS, sinS } = R;
  const out: Uint8Array = gray.slice();
  const lo = band.v - 0.55 * band.pitch, hi = band.v + 0.45 * band.pitch;
  const hist = new Uint32Array(256); let n = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const v = y * cosS - x * sinS;
    if (v > lo && v < hi) { hist[gray[y * W + x]]++; n++; }
  }
  if (!n) return out;
  let acc = 0, fill = 255; const target = 0.9 * n;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) { fill = i; break; } }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = y * cosS - x * sinS;
    if (v > lo && v < hi) out[y * W + x] = fill;
  }
  return out;
}

/** put missing rows back at the top or bottom of columns that are shorter than the rest */
export function fillShortColumns(R: any): number {
  const cols = columnsOf(R);
  if (cols.length < 3) return 0;
  const lens = cols.map((c) => c.length), cnt: Record<number, number> = {};
  let M = 0, best = 0;
  lens.forEach((l) => { cnt[l] = (cnt[l] || 0) + 1; if (cnt[l] > best || (cnt[l] === best && l > M)) { best = cnt[l]; M = l; } });
  if (best < 3 || M < 8) return 0;
  const full = cols.filter((c) => c.length === M);
  const pitch = R.pitch || 3 * R.h0, h0 = R.h0;
  const cs = R.cosS, sn = R.sinS;
  let added = 0;
  const mkRow = (ref: any[], idx: number, off: number, offX: number, col: number): any => {
    const u = ref[idx].x + offX, v = ref[idx].y + off, X = u * cs - v * sn, Y = v * cs + u * sn;
    let e: any = KS.localFind(R, X, Y);
    if (e && Math.abs(e.x - u) > 1.0 * h0) e = null;
    if (!e) e = { d: null, n: null, dx: 0, x: u, y: v, cl: -1, low: true, missing: true };
    e.col = col; e.rec = true;
    return e;
  };
  const last = cols.length - 1;
  cols.forEach((c, ci) => {
    const need = M - c.length;
    const isLast = ci === last; // the column read last may legitimately end early: only its top and inner gaps are repaired, never its bottom
    if (need < 1 || need > M / 2 || c.length < 5) return;
    const cx = med(c.map((p: any) => p.x));
    const ref = full.slice().sort((a, b) => Math.abs(med(a.map((p: any) => p.x)) - cx) - Math.abs(med(b.map((p: any) => p.x)) - cx))[0];
    const refTop = med(full.map((f) => f[0].y)), refBot = med(full.map((f) => f[M - 1].y));
    // rows missing INSIDE the column (a pill or digit the scanner lost): only filled when they add up exactly to what the column lacks
    const gaps: { k: number; n: number }[] = []; let gr = 0;
    for (let k = 1; k < c.length; k++) { const n = Math.round((c[k].y - c[k - 1].y) / pitch); if (n >= 2) { gaps.push({ k, n }); gr += n - 1; } }
    if (isLast ? (gr > 0 && gr <= need) : gr === need) {
      const addIn: any[] = []; let ins = 0;
      gaps.forEach((g) => {
        const a = c[g.k - 1], base = g.k - 1 + ins, b = full[0] && ref[base];
        if (!b) return;
        for (let j = 1; j < g.n; j++) addIn.push(mkRow(ref, base + j, a.y - b.y, a.x - b.x, c[0].col));
        ins += g.n - 1;
      });
      addIn.forEach((e) => c.push(e)); c.sort((p: any, q: any) => p.y - q.y); added += addIn.length;
      return;
    }
    const topGap = Math.round((c[0].y - refTop) / pitch), botGap = Math.round((refBot - c[c.length - 1].y) / pitch);
    const addTop = Math.max(0, Math.min(need, topGap)), addBot = isLast ? 0 : need - addTop;
    if (addBot > Math.max(0, botGap)) return; // the picture does not explain the gap: leave it to the person
    const mk = (idx: number, off: number, offX: number): any => mkRow(ref, idx, off, offX, c[0].col);
    const add: any[] = [];
    // same text line, same lane: every missing row is placed like the neighbouring column's row, shifted by the offset measured at the nearest known row (the photo is never perfectly flat)
    if (addTop) { const a = c[0], b = ref[addTop]; for (let r = 0; r < addTop; r++) add.push(mk(r, a.y - b.y, a.x - b.x)); }
    if (addBot) { const li = c.length + addTop - 1, a = c[c.length - 1], b = ref[li]; for (let r = li + 1; r < M; r++) add.push(mk(r, a.y - b.y, a.x - b.x)); }
    add.forEach((e) => c.push(e));
    c.sort((p: any, q: any) => p.y - q.y);
    added += add.length;
  });
  if (added) {
    R.seq = ([] as any[]).concat(...cols);
    const by: Record<number, number> = {};
    R.seq.forEach((p: any) => { by[p.col] = (by[p.col] || 0); p.row = by[p.col]++; });
    R.holes = (R.holes || 0) + added;
    R.filled = added;
  }
  return added;
}


/**
 * A column that is ONE cell longer than its neighbours has a stray cell at its top or bottom (typically a header word of a
 * header row that was only caught in this column, or a page-number / footer mark). Drop the end cell that sits farthest outside
 * the extent of the full columns, but only when it clearly sits outside (more than half a row), so a real row is never lost.
 */
export function trimOverlong(R: any): number {
  const cols = columnsOf(R);
  if (cols.length < 3) return 0;
  const cnt: Record<number, number> = {}; let M = 0, best = 0;
  cols.forEach((c) => { const l = c.length; cnt[l] = (cnt[l] || 0) + 1; if (cnt[l] > best || (cnt[l] === best && l > M)) { best = cnt[l]; M = l; } });
  if (best < 0.5 * cols.length || M < 8) return 0;
  const full = cols.filter((c) => c.length === M);
  const pitch = R.pitch || 3 * R.h0;
  const refTop = med(full.map((c) => c[0].y)), refBot = med(full.map((c) => c[M - 1].y));
  let dropped = 0;
  cols.forEach((c) => {
    if (c.length !== M + 1) return;
    const dTop = refTop - c[0].y, dBot = c[c.length - 1].y - refBot; // how far outside the reference extent each end sits
    if (dTop >= dBot && dTop > 0.5 * pitch) { c.shift(); dropped++; }
    else if (dBot > dTop && dBot > 0.5 * pitch) { c.pop(); dropped++; }
  });
  if (dropped) {
    R.seq = ([] as any[]).concat(...cols);
    const by: Record<number, number> = {};
    R.seq.forEach((p: any) => { by[p.col] = (by[p.col] || 0); p.row = by[p.col]++; });
    R.titles = (R.titles || 0) + dropped;
  }
  return dropped;
}

/** everything above in one call: header band → rescan, then short columns */
export function refineKeyScan(R: any, rtl: boolean): any {
  let cur = R;
  try {
    const band = findHeaderBand(cur);
    if (band) {
      const g = wipeBand(cur, band), opt: any = { rtl };
      if (cur.scale) opt._up = cur.scale;
      const R2: any = KS.scan(g, cur.W, cur.H, opt);
      if (R2.km && R2.seq.length >= 0.8 * cur.seq.length && !findHeaderBand(R2)) {
        R2.scale = cur.scale; R2.headerRows = band.cols; cur = R2;
      }
    }
  } catch (e) { /* keep the plain reading */ }
  try { fillShortColumns(cur); } catch (e) { /* keep as is */ }
  try { trimOverlong(cur); } catch (e) { /* keep as is */ }
  return cur;
}
