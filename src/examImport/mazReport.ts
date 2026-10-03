// Reader for the «کارنامه آزمون ماز» analytical report card (the PDF / screenshot the Maz site exports).
// The card is a fixed grid of grey tiles, so tiles are found by position and numbers are read with digits.ts.
import { Box, Raster, components, lumAt, runs } from './raster';
import { Ink, classify, featOf, makeInk, readLine } from './digits';
import { GLYPHS } from './mazGlyphs';

export interface MazSection {
  index: number; headingBox: Box; sig: string;
  level: number | null; correct: number | null; wrong: number | null; blank: number | null;
  countryRank: number | null; levelChange: number | null; dispersion: number | null;
}
export interface MazReport {
  stage: number | null; date: string | null; time: string | null;
  avgLevel: number | null; level: number | null; levelChange: number | null; countryRank: number | null; regionRank: number | null;
  participants: number | null; absent: number | null;
  correct: number | null; wrong: number | null; blank: number | null;
  sections: MazSection[]; warnings: string[];
}
interface Tile { box: Box; bg: number }

const CARD_BG = 246;

function findRows(r: Raster, s: number): { y0: number; y1: number }[] {
  const near = (x: number, y: number) => Math.abs(lumAt(r, x, y) - CARD_BG) <= 4;
  const step = Math.max(1, Math.round(2 * s));
  const prof: number[] = [];
  for (let y = 0; y < r.height; y++) { let c = 0, n = 0; for (let x = 0; x < r.width; x += step) { n++; if (near(x, y)) c++; } prof.push(c / n); }
  return runs(r.height, (y) => prof[y] > 0.25, 2, Math.round(80 * s)).map(([a, b]) => ({ y0: a, y1: b }));
}

function findTiles(r: Raster, row: { y0: number; y1: number }, s: number): Tile[] {
  const h = row.y1 - row.y0;
  // sample thin strips near the top and bottom edge (labels/values never reach them); a column counts if either strip is card-coloured
  const strips = [[0.05, 0.09], [0.91, 0.95]].map(([a, b]) => [row.y0 + Math.round(h * a), row.y0 + Math.round(h * b)]);
  const colOn = (x: number) => strips.some(([ya, yb]) => { let c = 0, n = 0; for (let y = ya; y < yb; y++) { n++; if (Math.abs(lumAt(r, x, y) - CARD_BG) <= 5) c++; } return c / n > 0.7; });
  return runs(r.width, colOn, Math.round(3 * s), Math.round(60 * s)).map(([a, b]) => ({ box: { x: a, y: row.y0, w: b - a, h }, bg: CARD_BG })).sort((p, q) => q.box.x - p.box.x); // right → left
}

/** ink line bands inside a tile; the last one is the value, the ones before are the label */
function tileLines(r: Raster, t: Tile, ink: Ink, s: number): { x0: number; x1: number; y0: number; y1: number }[] {
  const { x, y, w, h } = t.box; const m = Math.round(6 * s);
  const rowInk = (yy: number) => { for (let xx = x + m; xx < x + w - m; xx++) if (ink(xx, yy)) return true; return false; };
  return runs(h - 2 * m, (i) => rowInk(y + m + i), Math.round(5 * s), Math.round(4 * s)).map(([a, b]) => ({ x0: x + m, x1: x + w - m, y0: y + m + a, y1: y + m + b }));
}

function readInt(r: Raster, t: Tile, ink: Ink, s: number): { v: number | null; text: string } {
  const lines = tileLines(r, t, ink, s); const L = lines[lines.length - 1];
  if (!L) return { v: null, text: '' };
  const res = readLine(r, { x: L.x0, y: L.y0, w: L.x1 - L.x0, h: L.y1 - L.y0 }, t.box, ink, s);
  const neg = /-/.test(res.text);
  const digits = res.text.replace(/[^0-9]/g, '');
  if (!digits || /\?/.test(res.text)) return { v: null, text: res.text };
  return { v: (neg ? -1 : 1) * parseInt(digits, 10), text: res.text };
}

/** 32×8 shape signature of the heading ink, used to remember which exam section a heading means */
function signature(r: Raster, b: Box, ink: Ink): string {
  let bits = ''; const gw = 32, gh = 8; const vals: number[] = [];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let c = 0, n = 0;
    for (let y = b.y + Math.floor((j * b.h) / gh); y < b.y + Math.max(Math.floor(((j + 1) * b.h) / gh), Math.floor((j * b.h) / gh) + 1); y++)
      for (let x = b.x + Math.floor((i * b.w) / gw); x < b.x + Math.max(Math.floor(((i + 1) * b.w) / gw), Math.floor((i * b.w) / gw) + 1); x++) { n++; if (ink(x, y)) c++; }
    vals.push(n ? c / n : 0);
  }
  const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
  vals.forEach((v) => { bits += v > mean ? '1' : '0'; });
  return `${Math.round((b.w / Math.max(1, b.h)) * 10)}:${bits}`;
}
export function sigDistance(a: string, b: string): number {
  const [ra, ba] = a.split(':'), [rb, bb] = b.split(':');
  if (!ba || !bb || ba.length !== bb.length || Math.abs(+ra - +rb) > Math.max(3, +ra * 0.12)) return 1;
  let d = 0; for (let i = 0; i < ba.length; i++) if (ba[i] !== bb[i]) d++;
  return d / ba.length;
}

function parseDateTime(r: Raster, t: Tile, ink: Ink, s: number): { date: string | null; time: string | null } {
  const lines = tileLines(r, t, ink, s); const L = lines[lines.length - 1];
  if (!L) return { date: null, time: null };
  const box = { x: L.x0, y: L.y0, w: L.x1 - L.x0, h: L.y1 - L.y0 };
  const txt = readLine(r, box, t.box, ink, s).text; // visual left → right, e.g. "1405/07/10-11:25" or the reverse
  const groups = txt.split('-').map((g) => g.replace(/[^0-9]/g, '')).filter(Boolean);
  const d8 = groups.find((g) => g.length === 8), t4 = groups.find((g) => g.length === 4);
  const pick = (d: string) => {
    for (const x of [d, d.split('').reverse().join('')]) {
      const y = +x.slice(0, 4), m = +x.slice(4, 6), dd = +x.slice(6, 8);
      if (y >= 1380 && y <= 1500 && m >= 1 && m <= 12 && dd >= 1 && dd <= 31) return `${y}/${String(m).padStart(2, '0')}/${String(dd).padStart(2, '0')}`;
    }
    return null;
  };
  const tm = (t: string) => { const h = +t.slice(0, 2), m = +t.slice(2, 4); return h < 24 && m < 60 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null; };
  return { date: d8 ? pick(d8) : null, time: t4 ? tm(t4) : null };
}

/** «مرحله ۵» — the last glyph of the title, if it looks like a digit */
function readStage(r: Raster, firstRowY: number, s: number): number | null {
  const dark = (x: number, y: number) => lumAt(r, x, y) < 110;
  const rowDark = (y: number) => { for (let x = 0; x < r.width; x += 2) if (dark(x, y)) return true; return false; };
  const segs = runs(firstRowY, rowDark, Math.round(4 * s), 4).filter(([a, b]) => b - a >= 20 * s && b - a <= 90 * s);
  if (!segs.length) return null;
  const [a, b] = segs[0];
  let x0 = r.width, x1 = 0;
  for (let y = a; y < b; y++) for (let x = 0; x < r.width; x++) if (dark(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  const box = { x: x0, y: a, w: x1 - x0 + 1, h: b - a };
  const inkT = (x: number, y: number) => lumAt(r, x, y) < 140;
  // the digit is the left-most glyph of the title (right-to-left text); match its shape only, sizes differ from the tiles
  const gs = components({ x: box.x, y: box.y, w: Math.round(box.h * 1.4), h: box.h }, inkT, Math.max(6, Math.round(20 * s * s)));
  const g = gs[0];
  if (!g || g.box.h < box.h * 0.45) return null;
  const m = classify(featOf(g, box), GLYPHS, true);
  return m.d < 0.25 && /[0-9]/.test(m.ch) ? +m.ch : null;
}

export function parseMazReport(r: Raster): MazReport {
  const s = r.width / 2400;
  const warnings: string[] = [];
  const rows = findRows(r, s);
  const tiles = rows.map((row) => findTiles(r, row, s));
  const counts = tiles.map((t) => t.length);
  // expected: 7 info tiles, 7 status tiles, 3 totals, then (6 + 4) per exam section, then 2 strength/weakness tiles
  if (counts[0] !== 7 || counts[1] !== 7 || counts[2] !== 3) throw new Error('layout');
  const blocks: [Tile[], Tile[]][] = [];
  let i = 3;
  while (i + 1 < tiles.length && counts[i] === 6 && counts[i + 1] === 4) { blocks.push([tiles[i], tiles[i + 1]]); i += 2; }
  if (!blocks.length) throw new Error('layout');

  const ink = makeInk(r, CARD_BG, 0.2);
  const int = (t: Tile) => readInt(r, t, ink, s).v;
  const A = tiles[0], B = tiles[1], C = tiles[2];
  const dt = parseDateTime(r, A[5], ink, s);
  const inkPage = (x: number, y: number) => lumAt(r, x, y) < 140;

  const sections: MazSection[] = blocks.map(([six, four], k) => {
    // heading = last ink band between the previous tile row and this block
    const prevRowIdx = 3 + k * 2 - 1; const prevBottom = rows[prevRowIdx].y1; const top = six[0].box.y;
    const bands = runs(top - prevBottom, (j) => { for (let x = 0; x < r.width; x += 2) if (inkPage(x, prevBottom + j)) return true; return false; }, Math.round(4 * s), Math.round(10 * s));
    const [ha, hb] = bands[bands.length - 1] || [0, 0];
    let x0 = r.width, x1 = 0;
    for (let y = prevBottom + ha; y < prevBottom + hb; y++) for (let x = 0; x < r.width; x++) if (inkPage(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const headingBox = { x: x0, y: prevBottom + ha, w: Math.max(1, x1 - x0 + 1), h: Math.max(1, hb - ha) };
    return {
      index: k, headingBox, sig: signature(r, headingBox, inkPage),
      level: int(six[0]), correct: int(six[3]), wrong: int(six[4]), blank: int(six[5]),
      levelChange: int(four[1]), dispersion: int(four[2]), countryRank: int(four[3])
    };
  });

  const out: MazReport = {
    stage: readStage(r, rows[0].y0, s), date: dt.date, time: dt.time,
    avgLevel: int(A[6]), level: int(B[0]), levelChange: int(B[1]), countryRank: int(B[2]), regionRank: int(B[3]), participants: int(B[5]), absent: int(B[6]),
    correct: int(C[0]), wrong: int(C[1]), blank: int(C[2]), sections, warnings
  };
  if (!out.date) warnings.push('تاریخ آزمون خوانده نشد.');
  const sum = (f: (x: MazSection) => number | null) => sections.reduce((a, x) => a + (f(x) ?? NaN), 0);
  if (out.correct !== null && out.wrong !== null && out.blank !== null) {
    if (sum((x) => x.correct) !== out.correct || sum((x) => x.wrong) !== out.wrong || sum((x) => x.blank) !== out.blank) warnings.push('جمع درس‌ها با جمع کل کارنامه نمی‌خواند؛ اعداد را بررسی کن.');
  }
  sections.forEach((x) => { if (x.correct === null || x.wrong === null || x.blank === null) warnings.push(`اعداد درس ${x.index + 1} کامل خوانده نشد.`); });
  return out;
}

export const _internals = { findRows, findTiles, tileLines };
