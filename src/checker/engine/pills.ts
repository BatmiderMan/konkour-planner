/**
 * pills.ts — pre-processing for key lists where the QUESTION NUMBER is printed light on a dark rounded "pill"
 * (white «۵۵» in a purple capsule) and the option digit is plain dark ink beside it.
 * KeyScan (never edited) cannot see the white number, so it finds no number to pair each option digit with.
 * The number is only a witness for the pairing (the option digit is the answer, the order of the rows gives the numbering),
 * so every pill is replaced in a COPY of the grey image by two dark outlined boxes the size of a digit: KeyScan reads them as a
 * two-digit number and does everything else as usual. Only used as a fallback (see runKeyScan in index.ts).
 */
import { KeyScan as KS } from './keyScan';

export interface PillResult { gray: Uint8Array; W: number; H: number; count: number; scale: number }

function glyphHeight(gray: Uint8Array, W: number, H: number): number {
  const ink = KS.sauvola(gray, W, H, 31, 0.3), cs = KS.label(ink, W, H), hist = new Float32Array(122);
  cs.forEach((c: any) => { if (c.n >= 10 && c.h >= 6 && c.h <= 100 && c.w <= 2 * c.h) hist[c.h]++; });
  let bv = -1, best = 8;
  for (let z = 6; z <= 100; z++) { const s = hist[z - 1] + 2 * hist[z] + hist[z + 1]; if (s > bv) { bv = s; best = z; } }
  return best;
}

/** `hgHint` = the option-digit height of this raster when the caller already knows it (the estimate below can latch onto the pills themselves on a cleaned-up image) */
export function replacePills(gray0: Uint8Array, W0: number, H0: number, hgHint?: number): PillResult | null {
  let gray = gray0, W = W0, H = H0, scale = 1;
  const hg0 = hgHint || glyphHeight(gray0, W0, H0);
  if (hg0 < 5) return null;
  if (hg0 < 22) { scale = Math.min(4, Math.ceil(26 / hg0 * 10) / 10); const R = KS.resize(gray0, W0, H0, scale); gray = R.g; W = R.w; H = R.h; }
  const hg = Math.round(hg0 * scale);
  const ink: Uint8Array = KS.sauvola(gray, W, H, (Math.round(6 * hg)) | 1, 0.1);
  // close the light strokes of the white number horizontally so the pill becomes one solid blob (rows stay separate)
  const maxRun = Math.max(2, Math.round(0.5 * hg));
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (ink[y * W + x]) { x++; continue; }
      let e = x; while (e < W && !ink[y * W + e]) e++;
      if (x > 0 && e < W && e - x <= maxRun) for (let k = x; k < e; k++) ink[y * W + k] = 1;
      x = e;
    }
  }
  const comps: any[] = KS.label(ink, W, H).filter((c: any) => c.w >= 1.6 * hg && c.w <= 5 * hg && c.h >= 0.8 * hg && c.h <= 2.8 * hg && c.n / (c.w * c.h) > 0.6);
  // a dark option digit next to the pill can be glued to it by the closing: the pill proper is the longest run of columns that are solid ink top to bottom
  comps.forEach((c: any) => {
    const cnt = new Int32Array(c.w);
    c.px.forEach((q: number) => { cnt[(q % W) - c.x0]++; });
    let bs = 0, bl = 0, st = -1;
    for (let i = 0; i <= c.w; i++) {
      const ok = i < c.w && cnt[i] >= 0.75 * c.h;
      if (ok && st < 0) st = i;
      if (!ok && st >= 0) { if (i - st > bl) { bl = i - st; bs = st; } st = -1; }
    }
    c.px = null; c.x1 = c.x0 + bs + bl - 1; c.x0 = c.x0 + bs; c.w = bl;
  });
  const pills = comps.filter((c: any) => c.w >= 1.6 * hg);
  if (pills.length < 20) return null;
  const out = gray.slice(), gw = Math.round(0.55 * hg), gap = Math.max(2, Math.round(0.15 * hg)), th = Math.max(2, Math.round(0.18 * hg));
  pills.forEach((c: any) => {
    for (let y = c.y0 - 1; y <= c.y1 + 1; y++) for (let x = c.x0 - 1; x <= c.x1 + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = 255;
    const cx = (c.x0 + c.x1) >> 1, cy = (c.y0 + c.y1) >> 1;
    for (let g = 0; g < 2; g++) {
      const x0 = cx - gw - (gap >> 1) + g * (gw + gap), y0 = cy - (hg >> 1);
      for (let y = y0; y < y0 + hg; y++) for (let x = x0; x < x0 + gw; x++) {
        const edge = x < x0 + th || x >= x0 + gw - th || y < y0 + th || y >= y0 + hg - th;
        if (edge && x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = 20;
      }
    }
  });
  return { gray: out, W, H, count: pills.length, scale };
}
