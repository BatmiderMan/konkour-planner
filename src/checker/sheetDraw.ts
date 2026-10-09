import { SHEET_H, SHEET_W, SheetScan } from './engine';
import { Manual, RawRead, effective } from './model';

/** The straightened sheet with a ring on every answer that was read (green = one answer, orange = double mark). Ported from the original drawWarp. */
export function drawSheetPreview(canvas: HTMLCanvasElement, scan: SheetScan, read: RawRead, manual: Manual, sensitivity: number, showGrid: boolean): void {
  const WW = SHEET_W, WH = SHEET_H;
  canvas.width = WW; canvas.height = WH;
  const c = canvas.getContext('2d')!, id = c.createImageData(WW, WH), G = scan.G;
  for (let i = 0, j = 0; i < G.length; i++, j += 4) { id.data[j] = id.data[j + 1] = id.data[j + 2] = G[i]; id.data[j + 3] = 255; }
  c.putImageData(id, 0, 0);
  const thr = sensitivity / 100;
  for (let q = 1; q <= 300; q++) {
    const gm = scan.geom[q]; if (!gm) continue;
    if (showGrid) { c.strokeStyle = 'rgba(29,70,200,.7)'; c.lineWidth = 2; for (let o = 0; o < 4; o++) { const p = gm.c[o]; c.strokeRect(p[0] - gm.q * .27, p[1] - gm.p * .27, gm.q * .54, gm.p * .54); } }
    const a = effective(read, manual, q);
    if (a.dbl) { c.strokeStyle = '#e08a00'; c.lineWidth = 4; for (let o2 = 0; o2 < 4; o2++) if (scan.scores[q][o2] >= thr) { const pp = gm.c[o2]; c.beginPath(); c.ellipse(pp[0], pp[1], gm.q * .48, gm.p * .42, 0, 0, 7); c.stroke(); } }
    else if (a.v) { const pt = gm.c[a.v - 1]; c.strokeStyle = a.edited ? '#1f6feb' : '#12a36f'; c.lineWidth = 5; c.beginPath(); c.ellipse(pt[0], pt[1], gm.q * .48, gm.p * .42, 0, 0, 7); c.stroke(); }
  }
}
