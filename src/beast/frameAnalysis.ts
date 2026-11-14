// Pure image maths for the presence detector (no DOM): unit-tested with synthetic frames in tools/beast-tests.
// Nothing here stores or sends a picture; a frame is reduced to a few numbers and thrown away.
//
// Two kinds of "where is the student" measurements share one Blob shape:
//   'face'        – a face box from a real detector (MediaPipe / the browser's FaceDetector), maybe with the head-turn (yaw)
//   'silhouette'  – whatever is NEW in front of the camera compared with the empty room (no model, no skin colour, works for everyone)
import type { Obs } from './beastRules';

export type BlobKind = 'face' | 'silhouette';
export interface Blob { area: number; cx: number; cy: number; top: number; x0: number; y0: number; x1: number; y1: number; yaw?: number } // everything is a 0..1 fraction of the frame
export interface Baseline { kind: BlobKind; area: number; cx: number; cy: number; top: number }

export const lumaOf = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

export function meanLuma(d: Uint8ClampedArray): number {
  let s = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) s += lumaOf(d[i], d[i + 1], d[i + 2]);
  return n ? s / n : 0;
}

/** mean absolute luma difference of two frames of the same size (0 = identical) */
export function frameDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length || !a.length) return 255;
  let s = 0; const n = a.length / 4;
  for (let i = 0; i < a.length; i += 4) s += Math.abs(lumaOf(a[i], a[i + 1], a[i + 2]) - lumaOf(b[i], b[i + 1], b[i + 2]));
  return s / n;
}

// ---------------------------------------------------------------- the empty room
export interface Background { w: number; h: number; rgb: Float32Array; luma: number; edge: number; noise: number }

/** average of several frames of the EMPTY scene; null if something moved in front of the camera while it was captured */
export function makeBackground(frames: Uint8ClampedArray[], w: number, h: number): Background | null {
  if (frames.length < 3) return null;
  const n = w * h;
  const rgb = new Float32Array(n * 3);
  frames.forEach((f) => { for (let p = 0; p < n; p++) { rgb[p * 3] += f[p * 4]; rgb[p * 3 + 1] += f[p * 4 + 1]; rgb[p * 3 + 2] += f[p * 4 + 2]; } });
  for (let i = 0; i < rgb.length; i++) rgb[i] /= frames.length;
  let dev = 0;
  frames.forEach((f) => { for (let p = 0; p < n; p++) dev += Math.abs(f[p * 4] - rgb[p * 3]) + Math.abs(f[p * 4 + 1] - rgb[p * 3 + 1]) + Math.abs(f[p * 4 + 2] - rgb[p * 3 + 2]); });
  const noise = dev / (frames.length * n); // mean abs deviation per pixel, summed over the 3 channels
  if (noise > 14) return null; // not an empty, steady scene
  let l = 0; for (let p = 0; p < n; p++) l += lumaOf(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]);
  return { w, h, rgb, luma: l / n, edge: edgeLuma(rgb, w, h), noise };
}

/** brightness of the frame border where nobody sits (top rows + sides above the shoulders): used to cancel auto-exposure changes */
function edgeLuma(rgb: Float32Array | Uint8ClampedArray, w: number, h: number, stride = rgb instanceof Float32Array ? 3 : 4): number {
  let s = 0, c = 0;
  for (let y = 0; y < h * 0.7; y++) for (let x = 0; x < w; x++) {
    if (y > h * 0.14 && x > w * 0.08 && x < w * 0.92) continue;
    const i = (y * w + x) * stride; s += lumaOf(rgb[i], rgb[i + 1], rgb[i + 2]); c++;
  }
  return c ? s / c : 0;
}

interface Comp { n: number; sx: number; sy: number; x0: number; y0: number; x1: number; y1: number; rows: Int32Array }
function components(mask: Uint8Array, w: number, h: number): Comp[] {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const out: Comp[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    let n = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    const rows = new Int32Array(h);
    stack.length = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop() as number;
      const x = p % w, y = (p - x) / w;
      n++; sx += x; sy += y; rows[y]++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    out.push({ n, sx, sy, x0, y0, x1, y1, rows });
  }
  return out;
}

/**
 * The student as one blob: the biggest patch plus the other sizeable patches around the same vertical axis
 * (hair, shoulders and a face that happens to match the wall are often separate patches).
 */
export function largestComponent(mask: Uint8Array, w: number, h: number): { n: number; sx: number; sy: number; x0: number; y0: number; x1: number; y1: number; top: number } | null {
  const all = components(mask, w, h);
  if (!all.length) return null;
  const best = all.reduce((a, b) => (b.n > a.n ? b : a));
  const bx = best.sx / best.n;
  const group = all.filter((c) => c === best || (c.n >= 10 && Math.abs(c.sx / c.n - bx) < w * 0.3));
  let n = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  const rows = new Int32Array(h);
  group.forEach((c) => { n += c.n; sx += c.sx; sy += c.sy; x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1); for (let y = 0; y < h; y++) rows[y] += c.rows[y]; });
  let top = y0;
  for (let y = y0; y <= y1; y++) if (rows[y] >= 3) { top = y; break; } // first row with a real width: ignores stray pixels above the head
  return { n, sx, sy, x0, y0, x1, y1, top };
}

/**
 * What is in front of the camera now that was not there in the empty room.
 * The frame is first scaled so its border matches the empty room's border (auto-exposure / a cloud passing), then every pixel
 * that differs by more than the room's own noise counts; specks are removed and the biggest patch is the student.
 */
export function foreground(d: Uint8ClampedArray, w: number, h: number, bg: Background): { blob: Blob | null; frac: number } {
  if (w !== bg.w || h !== bg.h) return { blob: null, frac: 1 };
  const n = w * h;
  const cur = edgeLuma(d, w, h);
  const gain = cur > 1 ? Math.max(0.5, Math.min(2, bg.edge / cur)) : 1;
  const T = Math.max(34, bg.noise * 4.5);
  const raw = new Uint8Array(n);
  let cnt = 0;
  for (let p = 0; p < n; p++) {
    const dr = Math.abs(d[p * 4] * gain - bg.rgb[p * 3]), dg = Math.abs(d[p * 4 + 1] * gain - bg.rgb[p * 3 + 1]), db = Math.abs(d[p * 4 + 2] * gain - bg.rgb[p * 3 + 2]);
    if (dr + dg + db > T) { raw[p] = 1; cnt++; }
  }
  const frac = cnt / n;
  const mask = new Uint8Array(n); // erode: a pixel stays only when most of its neighbours are foreground too
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if (!raw[p]) continue;
    const k = raw[p - 1] + raw[p + 1] + raw[p - w] + raw[p + w] + raw[p - w - 1] + raw[p - w + 1] + raw[p + w - 1] + raw[p + w + 1];
    if (k >= 5) mask[p] = 1;
  }
  const c = largestComponent(mask, w, h);
  if (!c || c.n < 12) return { blob: null, frac };
  return { blob: { area: c.n / n, cx: c.sx / c.n / w, cy: c.sy / c.n / h, top: c.top / h, x0: c.x0 / w, y0: c.y0 / h, x1: (c.x1 + 1) / w, y1: (c.y1 + 1) / h }, frac };
}

// ---------------------------------------------------------------- a face box from a detector
export const blobOfBox = (x: number, y: number, bw: number, bh: number, w: number, h: number, yaw?: number): Blob => ({
  area: (bw * bh) / (w * h), cx: (x + bw / 2) / w, cy: (y + bh / 2) / h, top: y / h, x0: x / w, y0: y / h, x1: (x + bw) / w, y1: (y + bh) / h, yaw
});

/** head turn from 3 landmarks (0 = looking straight at the camera, ±1 = nose over the ear): nose position relative to the eyes */
export function yawOf(rightEye: { x: number }, leftEye: { x: number }, nose: { x: number }): number {
  const mid = (rightEye.x + leftEye.x) / 2;
  const dist = Math.abs(rightEye.x - leftEye.x);
  return dist < 1e-6 ? 0 : (nose.x - mid) / dist;
}

/**
 * Compare what the camera sees now with how the student sat during calibration.
 *  – nothing there / far too small ............ away
 *  – smaller / turned / far to the side / dropped low (head down, phone in the lap) ... distracted
 */
export function classify(b: Blob | null, base: Baseline): Obs {
  if (!b) return 'away';
  const ratio = b.area / Math.max(1e-6, base.area);
  const dx = Math.abs(b.cx - base.cx);
  if (base.kind === 'face') {
    if (ratio < 0.2) return 'away';
    if (ratio < 0.5) return 'distracted'; // much further from the screen
    if (dx > 0.25) return 'distracted';
    if (b.cy - base.cy > 0.18) return 'distracted'; // head dropped
    if (b.yaw !== undefined && Math.abs(b.yaw) > 0.55) return 'distracted'; // turned away from the screen
    return 'present';
  }
  // silhouette: head + shoulders
  if (ratio < 0.3) return 'away';
  if (ratio < 0.6) return 'distracted';
  if (dx > 0.22) return 'distracted';
  if (b.top - base.top > 0.1) return 'distracted'; // the top of the head sank: looking down
  return 'present';
}

/** the last few observations vote, so one bad frame does not flip the state */
export function majority(list: Obs[]): Obs {
  if (!list.length) return 'blind';
  const n: Record<string, number> = {};
  list.forEach((o) => { n[o] = (n[o] || 0) + 1; });
  let best: Obs = list[list.length - 1], c = 0;
  (Object.keys(n) as Obs[]).forEach((k) => { if (n[k] > c || (n[k] === c && k === list[list.length - 1])) { best = k; c = n[k]; } });
  return best;
}
