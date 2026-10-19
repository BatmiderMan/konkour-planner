/**
 * badges.ts — pre-processing for key lists whose option digit is printed LIGHT on a DARK badge
 * (e.g. a white «۲» inside a solid purple rounded square, with the question number in an outlined pill next to it).
 *
 * KeyScan (keyScan.ts, never edited) only understands dark ink on light paper: for such a book the digit is invisible
 * (it is a hole in the badge) and the badge itself is too big to be taken for a glyph. Instead of touching the scanner,
 * this file finds the light digits that sit inside solid dark badges and paints each badge as "dark digit on white"
 * in a copy of the grey image BEFORE the scan.
 *
 * Detection is based on the digit, not on the badge outline: the badge usually touches the outline of the number's pill,
 * so its blob is not clean, but a small light mark with solid dark ink on all sides is unmistakable.
 *
 * It is only used as a second attempt (see runKeyScan in index.ts): books with ordinary dark digits are read as before.
 */
import { KeyScan as KS } from './keyScan';

const odd = (n: number) => Math.max(3, Math.round(n)) | 1;

/** sum of a (2r+1)² window around every pixel, from an integral image (outside the image counts as 0) */
function boxSum(m: Uint8Array, w: number, h: number, r: number): Int32Array {
  const W1 = w + 1, I = new Int32Array(W1 * (h + 1)), out = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    let rs = 0;
    for (let x = 0; x < w; x++) { rs += m[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + rs; }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      out[y * w + x] = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
    }
  }
  return out;
}
function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const s = boxSum(m, w, h, r), o = new Uint8Array(w * h);
  for (let i = 0; i < o.length; i++) if (s[i] > 0) o[i] = 1;
  return o;
}

/** typical glyph height of the page (same idea as the first step of KeyScan.scan) */
function glyphHeight(gray: Uint8Array, W: number, H: number): number {
  let win = 31, best = 8;
  for (let pass = 0; pass < 2; pass++) {
    const ink = KS.sauvola(gray, W, H, win, 0.3), cs = KS.label(ink, W, H), hist = new Float32Array(122);
    cs.forEach((c: any) => { if (c.n >= 10 && c.h >= 6 && c.h <= 100 && c.w <= 2 * c.h) hist[c.h]++; });
    let bv = -1; best = 8;
    for (let z = 6; z <= 100; z++) { const s = hist[z - 1] + 2 * hist[z] + hist[z + 1]; if (s > bv) { bv = s; best = z; } }
    const nwin = Math.max(15, Math.round(2.6 * best)) | 1;
    if (Math.abs(nwin - win) <= 8) break;
    win = nwin;
  }
  return best;
}

export interface BadgeResult { gray: Uint8Array; W: number; H: number; count: number; hg: number; scale: number }

/**
 * Returns a copy of the grey image in which every dark badge with a light digit is inverted (dark digit on white),
 * or null when the page has no such badges (then the normal scan is the right one).
 */
export function invertBadges(gray0: Uint8Array, W0: number, H0: number): BadgeResult | null {
  let gray = gray0, W = W0, H = H0, scale = 1;
  const hg0 = glyphHeight(gray0, W0, H0);
  if (hg0 < 5) return null;
  // a light digit inside a badge is only 1-3 px wide in a normal phone photo: enlarge like KeyScan does (so every glyph has ~26 px)
  if (hg0 < 22) {
    scale = Math.min(4, Math.ceil(26 / hg0 * 10) / 10);
    const R = KS.resize(gray0, W0, H0, scale); gray = R.g; W = R.w; H = R.h;
  }
  const hg = Math.round(hg0 * scale);
  const N = W * H;
  // dark ink relative to a wide neighbourhood (wide, so that a big solid badge is still "dark")
  const ink = KS.sauvola(gray, W, H, odd(6 * hg), 0.3);
  // light mask; ink is grown by one pixel first so that a digit touching the badge rim by a hair is still a closed island
  const inkD = dilate(ink, W, H, 1);
  // integral image of ink: how solid is the surrounding of a candidate?
  const W1 = W + 1, I = new Int32Array(W1 * (H + 1));
  for (let y = 0; y < H; y++) { let rs = 0; for (let x = 0; x < W; x++) { rs += ink[y * W + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + rs; } }
  const rect = (x0: number, y0: number, x1: number, y1: number) => { // ink count in [x0,x1]x[y0,y1] inclusive, clipped
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    return I[(y1 + 1) * W1 + x1 + 1] - I[y0 * W1 + x1 + 1] - I[(y1 + 1) * W1 + x0] + I[y0 * W1 + x0];
  };

  // 4-connected components of the light mask; keep the small ones that are surrounded by solid ink
  const lab = new Int32Array(N), stack: number[] = [];
  const maxArea = Math.round(1.3 * hg * hg), minArea = Math.max(3, Math.round(0.04 * hg * hg));
  const e = Math.max(2, Math.round(0.5 * hg));
  const mark = new Uint8Array(N); // pixels of accepted digit islands
  let nIsl = 0;
  for (let i0 = 0; i0 < N; i0++) {
    if (inkD[i0] || lab[i0]) continue;
    let area = 0, x0 = W, x1 = -1, y0 = H, y1 = -1, big = false;
    const px: number[] = [];
    lab[i0] = 1; stack.push(i0);
    while (stack.length) {
      const p = stack.pop() as number, x = p % W, y = (p / W) | 0;
      area++; if (!big) { px.push(p); if (area > maxArea) { big = true; px.length = 0; } }
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !inkD[p - 1] && !lab[p - 1]) { lab[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && !inkD[p + 1] && !lab[p + 1]) { lab[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && !inkD[p - W] && !lab[p - W]) { lab[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && !inkD[p + W] && !lab[p + W]) { lab[p + W] = 1; stack.push(p + W); }
    }
    if (big || area < minArea) continue;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bh > 1.3 * hg || bw > 1.3 * hg || bh < 0.25 * hg) continue;
    if (x0 <= e || y0 <= e || x1 >= W - 1 - e || y1 >= H - 1 - e) continue;
    // ring around the island: must be solid dark ink
    const outer = (bw + 2 * e) * (bh + 2 * e), ringInk = rect(x0 - e, y0 - e, x1 + e, y1 + e) - rect(x0, y0, x1, y1);
    const ringN = outer - bw * bh;
    if (ringInk < 0.72 * ringN) continue;
    px.forEach((p) => { mark[p] = 1; });
    nIsl++;
  }
  if (nIsl < 8) return null;

  // islands of one digit (a digit can be made of several pieces) -> one badge each
  const near = dilate(mark, W, H, Math.max(1, Math.round(0.3 * hg)));
  const groups: any[] = KS.label(near, W, H);
  const out = gray.slice();
  const half = Math.round(1.2 * hg); // a badge is about 2.2 digit-heights wide; the next row / the number start further away than this
  let count = 0;
  groups.forEach((g: any) => {
    // bbox of the real island pixels inside this group
    let x0 = W, x1 = -1, y0 = H, y1 = -1, any = 0;
    g.px.forEach((p: number) => { if (!mark[p]) return; const x = p % W, y = (p / W) | 0; any++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
    if (any < minArea) return;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bh < 0.55 * hg || bh > 1.5 * hg || bw > 1.5 * hg) return;
    const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
    const rx0 = Math.max(0, cx - half), rx1 = Math.min(W - 1, cx + half), ry0 = Math.max(0, cy - half), ry1 = Math.min(H - 1, cy + half);
    // grey levels: badge colour = median of the dark pixels of the rect, "digit white" = bright end of the island pixels
    const darkV: number[] = [], lightV: number[] = [];
    for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
      const k = y * W + x; if (ink[k]) darkV.push(gray[k]); else if (mark[k]) lightV.push(gray[k]);
    }
    if (darkV.length < 10 || lightV.length < 3) return;
    darkV.sort((a, b) => a - b); lightV.sort((a, b) => a - b);
    const bg = darkV[darkV.length >> 1], mx = lightV[Math.floor(lightV.length * 0.9)];
    if (mx - bg < 40) return; // the "light" mark is not really lighter than the badge
    // pixels near an island pixel carry the digit (with its anti-aliased edge); everything else of the rect becomes paper
    const dg = new Uint8Array((rx1 - rx0 + 1) * (ry1 - ry0 + 1));
    const rw = rx1 - rx0 + 1;
    for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) if (mark[y * W + x]) dg[(y - ry0) * rw + x - rx0] = 1;
    const dd = dilate(dg, rw, ry1 - ry0 + 1, 1);
    for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
      const k = y * W + x;
      if (!dd[(y - ry0) * rw + x - rx0]) { out[k] = 255; continue; }
      const t = Math.max(0, Math.min(1, (gray[k] - bg) / (mx - bg)));
      out[k] = Math.round(255 * (1 - t)); // badge colour -> white, light digit -> black
    }
    count++;
  });
  return count >= 8 ? { gray: out, W, H, count, hg, scale } : null;
}
