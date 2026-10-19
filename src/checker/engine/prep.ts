/**
 * prep.ts — pre-processing that makes a weak photo / screenshot readable for KeyScan (keyScan.ts is never edited by this file):
 *
 *   enlarge()    sharp (Catmull-Rom) enlargement, so a 7-px digit does not turn into a grey smudge the way bilinear does
 *   normalize()  local contrast normalisation: every neighbourhood is stretched to «darkest ink … paper», so faint columns,
 *                a shaded side of the page and thin number glyphs become as dark as the rest, and coloured cell backgrounds vanish.
 *
 * Both work on plain Uint8 grey rasters (no DOM) so they run in the app and in the offline test harness alike.
 */

import { KeyScan as KS } from './keyScan';

/** no raster handed to the reader may exceed this many pixels (a 4x enlarged phone photo would need gigabytes) */
export const MAX_PIXELS = 14e6;

/** typical height of a digit on the page, in pixels (same idea as the first step of KeyScan.scan) */
export function glyphHeightOf(gray: Uint8Array, W: number, H: number): number {
  const ink = KS.sauvola(gray, W, H, 31, 0.3), cs = KS.label(ink, W, H), hist = new Float32Array(122);
  cs.forEach((c: any) => { if (c.n >= 10 && c.h >= 6 && c.h <= 100 && c.w <= 2 * c.h) hist[c.h]++; });
  let bv = -1, best = 6;
  for (let z = 6; z <= 100; z++) { const s = hist[z - 1] + 2 * hist[z] + hist[z + 1]; if (s > bv) { bv = s; best = z; } }
  return best;
}

/** Catmull-Rom cubic weight */
function cr(t: number): number {
  const a = Math.abs(t);
  if (a < 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
  if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
  return 0;
}

/** separable bicubic enlargement (scale >= 1) */
export function enlarge(g: Uint8Array, w: number, h: number, s: number): { g: Uint8Array; w: number; h: number } {
  if (s <= 1.001) return { g, w, h };
  const nw = Math.round(w * s), nh = Math.round(h * s);
  // horizontal pass -> float rows
  const tmp = new Float32Array(nw * h);
  const xi = new Int32Array(nw), xw = new Float32Array(nw * 4);
  for (let x = 0; x < nw; x++) {
    const fx = (x + 0.5) / s - 0.5, x0 = Math.floor(fx), t = fx - x0;
    xi[x] = x0;
    for (let k = 0; k < 4; k++) xw[x * 4 + k] = cr(t - (k - 1));
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < nw; x++) {
      let v = 0;
      for (let k = 0; k < 4; k++) {
        let xx = xi[x] + k - 1; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
        v += g[row + xx] * xw[x * 4 + k];
      }
      tmp[y * nw + x] = v;
    }
  }
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const fy = (y + 0.5) / s - 0.5, y0 = Math.floor(fy), t = fy - y0;
    const wk = [cr(t + 1), cr(t), cr(t - 1), cr(t - 2)];
    const ys = [0, 1, 2, 3].map((k) => Math.min(h - 1, Math.max(0, y0 + k - 1)));
    for (let x = 0; x < nw; x++) {
      const v = tmp[ys[0] * nw + x] * wk[0] + tmp[ys[1] * nw + x] * wk[1] + tmp[ys[2] * nw + x] * wk[2] + tmp[ys[3] * nw + x] * wk[3];
      out[y * nw + x] = v < 0 ? 0 : v > 255 ? 255 : (v + 0.5) | 0;
    }
  }
  return { g: out, w: nw, h: nh };
}

/** running min (or max) over a window of 2r+1 along one axis, van Herk / Gil-Werman style via a monotone deque */
function slide(src: Uint8Array, dst: Uint8Array, w: number, h: number, r: number, horizontal: boolean, isMax: boolean): void {
  const len = horizontal ? w : h, lines = horizontal ? h : w;
  const stride = horizontal ? 1 : w, lineStride = horizontal ? w : 1;
  const dq = new Int32Array(len);
  for (let l = 0; l < lines; l++) {
    const base = l * lineStride;
    let head = 0, tail = 0;
    const get = (i: number) => src[base + i * stride];
    // window for output i is [i-r, i+r]
    let next = 0;
    for (let i = 0; i < len; i++) {
      const hi = Math.min(len - 1, i + r);
      while (next <= hi) {
        const v = get(next);
        while (tail > head && (isMax ? get(dq[tail - 1]) <= v : get(dq[tail - 1]) >= v)) tail--;
        dq[tail++] = next; next++;
      }
      while (dq[head] < i - r) head++;
      dst[base + i * stride] = get(dq[head]);
    }
  }
}

function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const W1 = w + 1, I = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let rs = 0; for (let x = 0; x < w; x++) { rs += src[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + rs; } }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      out[y * w + x] = ((I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0)) + 0.5) | 0;
    }
  }
  return out;
}

/**
 * Local contrast normalisation. `hg` = typical glyph height in pixels of THIS raster.
 * paper level = local max, ink level = local min (both smoothed); a neighbourhood with too little contrast is plain paper.
 */
export function normalize(g: Uint8Array, w: number, h: number, hg: number): Uint8Array {
  const r = Math.max(4, Math.round(hg * 0.9));
  const tmp = new Uint8Array(w * h), mx = new Uint8Array(w * h), mn = new Uint8Array(w * h);
  slide(g, tmp, w, h, r, true, true); slide(tmp, mx, w, h, r, false, true);
  slide(g, tmp, w, h, r, true, false); slide(tmp, mn, w, h, r, false, false);
  const sr = Math.max(2, Math.round(r * 0.8));
  const MX = boxBlur(mx, w, h, sr), MN = boxBlur(mn, w, h, sr);
  const out = new Uint8Array(w * h);
  // global contrast reference: a neighbourhood needs a decent fraction of it to count as holding ink
  const spans: number[] = [];
  for (let i = 0; i < w * h; i += 53) spans.push(MX[i] - MN[i]);
  spans.sort((a, b) => a - b);
  const ref = spans[Math.floor(spans.length * 0.9)] || 100;
  const minSpan = Math.max(28, 0.28 * ref);
  for (let i = 0; i < out.length; i++) {
    const hi = MX[i], lo = MN[i], span = hi - lo;
    if (span < minSpan) { out[i] = 255; continue; }
    const t = (g[i] - lo) / span;
    // a little gamma toward ink so thin strokes keep weight
    const v = t <= 0 ? 0 : t >= 1 ? 255 : 255 * t;
    out[i] = v;
  }
  return out;
}
