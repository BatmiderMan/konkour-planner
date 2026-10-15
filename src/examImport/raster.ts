// Pixel helpers shared by the institute report readers. Pure TypeScript, no DOM needed (so it can be tested in node).

export interface Raster { width: number; height: number; data: Uint8ClampedArray | Uint8Array } // RGBA, like ImageData
export interface Box { x: number; y: number; w: number; h: number }

export const lumAt = (r: Raster, x: number, y: number): number => {
  const i = (y * r.width + x) * 4;
  return 0.299 * r.data[i] + 0.587 * r.data[i + 1] + 0.114 * r.data[i + 2];
};

/** Group consecutive indices where `on(i)` is true; gaps up to `gap` are bridged. */
export function runs(n: number, on: (i: number) => boolean, gap = 0, minLen = 1): [number, number][] {
  const out: [number, number][] = [];
  let s = -1; let last = -1;
  for (let i = 0; i < n; i++) {
    if (on(i)) { if (s < 0) s = i; last = i; }
    else if (s >= 0 && i - last > gap) { if (last - s + 1 >= minLen) out.push([s, last + 1]); s = -1; }
  }
  if (s >= 0 && last - s + 1 >= minLen) out.push([s, last + 1]);
  return out;
}

export interface Glyph { box: Box; area: number; mask: Uint8Array } // mask is box.w*box.h, 1 = ink

/** 8-connected components of the ink inside `region` (ink(x,y) decides). Sorted left → right. */
export function components(region: Box, ink: (x: number, y: number) => boolean, minArea: number): Glyph[] {
  const { x: X, y: Y, w, h } = region;
  const seen = new Uint8Array(w * h);
  const on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) on[y * w + x] = ink(X + x, Y + y) ? 1 : 0;
  const out: Glyph[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!on[i] || seen[i]) continue;
    const px: number[] = [];
    stack.push(i); seen[i] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (stack.length) {
      const p = stack.pop() as number; px.push(p);
      const px_ = p % w, py_ = (p / w) | 0;
      if (px_ < x0) x0 = px_; if (px_ > x1) x1 = px_; if (py_ < y0) y0 = py_; if (py_ > y1) y1 = py_;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px_ + dx, ny = py_ + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (on[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (px.length < minArea) continue;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const mask = new Uint8Array(bw * bh);
    px.forEach((p) => { mask[((((p / w) | 0) - y0) * bw) + (p % w) - x0] = 1; });
    out.push({ box: { x: X + x0, y: Y + y0, w: bw, h: bh }, area: px.length, mask });
  }
  return out.sort((a, b) => a.box.x - b.box.x);
}

/** Area-averaged resize of a binary mask to gw×gh, values 0..9 as a string. */
export function bitmapOf(g: Glyph, gw: number, gh: number): string {
  let s = '';
  const { w, h } = g.box;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const xa = (i * w) / gw, xb = ((i + 1) * w) / gw, ya = (j * h) / gh, yb = ((j + 1) * h) / gh;
    let sum = 0, cnt = 0;
    for (let y = Math.floor(ya); y < Math.ceil(yb); y++) for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
      const wx = Math.min(x + 1, xb) - Math.max(x, xa), wy = Math.min(y + 1, yb) - Math.max(y, ya);
      const wt = Math.max(0, wx) * Math.max(0, wy);
      sum += wt * (g.mask[Math.min(h - 1, y) * w + Math.min(w - 1, x)] || 0); cnt += wt;
    }
    s += String(Math.min(9, Math.round((cnt ? sum / cnt : 0) * 9)));
  }
  return s;
}
