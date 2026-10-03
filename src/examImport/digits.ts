// Digit reader for rendered (screenshot) reports. The institutes draw numbers with one web font, so a small
// nearest-neighbour matcher over glyph shapes is enough — no OCR engine, works offline.
import { Box, Glyph, Raster, bitmapOf, components, lumAt } from './raster';
import { GLYPHS } from './mazGlyphs';

export interface GlyphFeat { ch: string; hr: number; wr: number; yc: number; bm: string }
const GW = 12, GH = 12;

/** shape features of one component relative to the text line it sits in */
export function featOf(g: Glyph, line: Box): Omit<GlyphFeat, 'ch'> {
  const H = Math.max(1, line.h);
  return { hr: g.box.h / H, wr: g.box.w / H, yc: (g.box.y + g.box.h / 2 - line.y) / H, bm: bitmapOf(g, GW, GH) };
}
const dist = (a: Omit<GlyphFeat, 'ch'>, b: Omit<GlyphFeat, 'ch'>): number => {
  let d = 0;
  for (let i = 0; i < a.bm.length; i++) { const t = (a.bm.charCodeAt(i) - b.bm.charCodeAt(i)) / 9; d += t * t; }
  d /= a.bm.length;
  return d + 1.2 * ((a.hr - b.hr) ** 2 + (a.wr - b.wr) ** 2 + (a.yc - b.yc) ** 2);
};
export interface Match { ch: string; d: number }
export function classify(f: Omit<GlyphFeat, 'ch'>, set: GlyphFeat[] = GLYPHS, shapeOnly = false): Match {
  let best: Match = { ch: '?', d: 9 };
  for (const t of set) {
    if (shapeOnly && !/[0-9]/.test(t.ch)) continue;
    const d = shapeOnly ? dist({ ...f, hr: 0, wr: 0, yc: 0 }, { ...t, hr: 0, wr: 0, yc: 0 }) : dist(f, t);
    if (d < best.d) best = { ch: t.ch, d };
  }
  return best;
}
export const MAX_DIST = 0.25; // above this a glyph is "not a known character"

export interface Ink { (x: number, y: number): boolean }
export const makeInk = (r: Raster, bgLum: number, thr = 0.3): Ink => (x, y) => (bgLum - lumAt(r, x, y)) / bgLum > thr;

/** merge ':'-style dot pairs (two small components stacked in the same column) into one pseudo glyph */
export function mergeDotPairs(gs: Glyph[]): Glyph[] {
  const tall = gs.reduce((m, g) => Math.max(m, g.box.h), 0);
  const small = (g: Glyph) => g.box.h < tall * 0.45 && g.box.w < tall * 0.45;
  const out: Glyph[] = [];
  for (let i = 0; i < gs.length; i++) {
    const a = gs[i], b = gs[i + 1];
    if (b && small(a) && small(b) && Math.abs(a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2)) < tall * 0.3 && Math.abs(a.box.y - b.box.y) > tall * 0.3 && a.box.w === a.box.w) {
      const x0 = Math.min(a.box.x, b.box.x), y0 = Math.min(a.box.y, b.box.y);
      const x1 = Math.max(a.box.x + a.box.w, b.box.x + b.box.w), y1 = Math.max(a.box.y + a.box.h, b.box.y + b.box.h);
      const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const mask = new Uint8Array(box.w * box.h);
      [a, b].forEach((g) => { for (let y = 0; y < g.box.h; y++) for (let x = 0; x < g.box.w; x++) if (g.mask[y * g.box.w + x]) mask[(g.box.y - y0 + y) * box.w + (g.box.x - x0 + x)] = 1; });
      out.push({ box, area: a.area + b.area, mask }); i++;
    } else out.push(a);
  }
  return out;
}

/** touching digits (low-resolution screenshots) come out as one wide blob: cut it where the ink is thinnest */
export function splitTouching(gs: Glyph[]): Glyph[] {
  const tall = gs.reduce((m, g) => Math.max(m, g.box.h), 0);
  const out: Glyph[] = [];
  for (const g of gs) {
    const { w, h } = g.box;
    if (h < tall * 0.6 || w <= tall * 1.3) { out.push(g); continue; }
    const k = Math.max(2, Math.round(w / (0.8 * tall)));
    const col = (x: number) => { let c = 0; for (let y = 0; y < h; y++) c += g.mask[y * w + x]; return c; };
    const cuts = [0];
    for (let j = 1; j < k; j++) {
      const mid = Math.round((j * w) / k), span = Math.max(1, Math.round(w / k / 4));
      let bx = mid, bv = Infinity;
      for (let x = Math.max(cuts[cuts.length - 1] + 1, mid - span); x <= Math.min(w - 2, mid + span); x++) { const v = col(x); if (v < bv) { bv = v; bx = x; } }
      cuts.push(bx);
    }
    cuts.push(w);
    for (let j = 0; j < cuts.length - 1; j++) {
      const a = cuts[j], b = cuts[j + 1], bw = b - a;
      if (bw <= 0) continue;
      // trim empty rows so the sub-glyph box is tight
      let y0 = h, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = a; x < b; x++) if (g.mask[y * w + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (y1 < 0) continue;
      const bh = y1 - y0 + 1, mask = new Uint8Array(bw * bh); let area = 0;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const v = g.mask[(y0 + y) * w + a + x]; mask[y * bw + x] = v; area += v; }
      out.push({ box: { x: g.box.x + a, y: g.box.y + y0, w: bw, h: bh }, area, mask });
    }
  }
  return out;
}

/** read the characters inside `band` left → right; '?' marks unknown shapes */
export function readLine(r: Raster, band: Box, ref: Box, ink: Ink, s: number): { text: string; glyphs: Glyph[]; worst: number } {
  // `band` is where to look for glyphs; `ref` is the box glyph sizes/positions are measured against (the whole tile, so a lone «۰» is not mistaken for a full-height digit)
  const gs = splitTouching(mergeDotPairs(components(band, ink, Math.max(3, Math.round(6 * s * s)))));
  let text = ''; let worst = 0;
  for (const g of gs) {
    const m = classify(featOf(g, ref));
    if (m.d > MAX_DIST) { text += '?'; worst = Math.max(worst, m.d); } else { text += m.ch; worst = Math.max(worst, m.d); }
  }
  return { text, glyphs: gs, worst };
}
