/**
 * Review session for a key-list photo. The reader (KeyScan) finds a row of cells; this class is the hand-correction layer on top:
 * fix a digit, remove a cell, add a missed one, undo. The rules are ported 1:1 from the original ks* functions.
 */
import { KS, runKeyScan, rememberKeyShapes } from './index';

export class KeyPageSession {
  R: any;
  names: number[];
  sel: any = null;
  private undoStack: { seq: any[]; fix: (number | undefined)[] }[] = [];

  constructor(public cv: HTMLCanvasElement, R: any, names: number[]) { this.R = R; this.names = names; }

  static run(cv: HTMLCanvasElement, rtl: boolean): KeyPageSession {
    const { R, names } = runKeyScan(cv, rtl);
    return new KeyPageSession(cv, R, names);
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get hasShapes(): boolean { return !!this.R.km; }

  label(i: number): number {
    const p = this.R.seq[i];
    if (p.fix !== undefined) return p.fix;
    return p.cl >= 0 ? this.names[p.cl] : 0;
  }
  xy(u: number, v: number): [number, number] { const R = this.R; return [u * R.cosS - v * R.sinS, u * R.sinS + v * R.cosS]; }
  center(p: any): [number, number] {
    if (p.d) { const b = p.d.g[0]; return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
    return this.xy(p.x, p.y);
  }

  private push(): void {
    this.undoStack.push({ seq: this.R.seq.slice(), fix: this.R.seq.map((p: any) => p.fix) });
    if (this.undoStack.length > 60) this.undoStack.shift();
  }
  undo(): void {
    const u = this.undoStack.pop();
    if (!u) return;
    this.R.seq = u.seq;
    this.R.seq.forEach((p: any, i: number) => { p.fix = u.fix[i]; });
    this.sel = null;
  }

  /** which printed digit shape is called what (the labels are only a guess) */
  setShapeName(cluster: number, value: number): void {
    const o = this.names.indexOf(value);
    if (o >= 0 && o !== cluster) this.names[o] = this.names[cluster];
    this.names[cluster] = value;
  }
  bestTileOfShape(c: number): any | null {
    let best: any = null;
    this.R.seq.forEach((p: any) => { if (p.cl === c && p.d && (!best || p.d1 < best.d1)) best = p; });
    return best;
  }

  fix(i: number, l: number): void { this.push(); this.R.seq[i].fix = l; }
  reviewList(): number[] {
    const list: number[] = [];
    this.R.seq.forEach((p: any, i: number) => { if (p.fix === undefined && (p.low || p.cl < 0)) list.push(i); });
    return list;
  }

  summary(start: number) {
    const R = this.R; let low = 0, miss = 0;
    R.seq.forEach((p: any) => { if (p.fix === undefined && (p.low || p.cl < 0)) low++; if (!p.d && p.fix === undefined) miss++; });
    return { n: R.seq.length, ncol: R.ncol, low, miss, headers: R.headers || 0, titles: R.titles || 0, headerRows: R.headerRows || 0, filled: R.filled || 0, first: start, last: start + R.seq.length - 1 };
  }

  private resort(): void { // rebuild reading order: columns first, then top to bottom
    const R = this.R, by: Record<number, any[]> = {}, cs: any[][] = [];
    R.seq.forEach((p: any) => { (by[p.col] = by[p.col] || []).push(p); });
    Object.keys(by).map(Number).sort((a, b) => a - b).forEach((c) => { by[c].sort((a, b) => a.y - b.y); cs.push(by[c]); });
    R.seq = ([] as any[]).concat(...cs);
  }
  private colOf(x: number): number {
    const R = this.R; let best = 0, bd = 1e18; const by: Record<number, number[]> = {};
    R.seq.forEach((p: any) => { (by[p.col] = by[p.col] || []).push(p.x); });
    Object.keys(by).forEach((c) => { const a = by[+c].sort((p, q) => p - q), m = a[a.length >> 1]; if (Math.abs(m - x) < bd) { bd = Math.abs(m - x); best = +c; } });
    return best;
  }
  hit(x: number, y: number): number {
    const R = this.R, m = .35 * R.h0; let best = -1, bd = 1e18;
    R.seq.forEach((p: any, i: number) => {
      let cx: number, cy: number, hw: number, hh: number;
      if (p.d) { const b = p.d.g[0]; cx = (b.x0 + b.x1) / 2; cy = (b.y0 + b.y1) / 2; hw = b.w / 2 + m; hh = b.h / 2 + m; }
      else { const q = this.xy(p.x, p.y); cx = q[0]; cy = q[1]; hw = .6 * R.h0 + m; hh = .7 * R.h0 + m; }
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      if (dx <= hw && dy <= hh && dx + dy < bd) { bd = dx + dy; best = i; }
    });
    return best;
  }
  select(i: number): void { this.sel = i >= 0 ? this.R.seq[i] : null; }
  get selIndex(): number { return this.sel ? this.R.seq.indexOf(this.sel) : -1; }

  /** tap on an empty spot: look for a missed digit right there (or leave an empty slot) */
  add(x: number, y: number): string {
    const R = this.R; this.push();
    let e = KS.localFind(R, x, y), u: number, v: number;
    if (e) { u = e.x; v = e.y; }
    else { u = x * R.cosS + y * R.sinS; v = y * R.cosS - x * R.sinS; e = { d: null, n: null, dx: 0, x: u, y: v, added: true, cl: -1, low: true, missing: true }; }
    e.col = this.colOf(u);
    const pitch = R.pitch || 3 * R.h0; // a new entry replaces whatever was read in the same row of that column
    R.seq = R.seq.filter((p: any) => !(p.col === e.col && Math.abs(p.y - e.y) < .55 * pitch));
    R.seq.push(e); this.resort(); this.sel = e;
    return (e.d ? 'یک خانه این‌جا اضافه شد' : 'عددی پیدا نشد؛ یک خانه‌ی خالی اضافه شد') + ': پایین بررسی‌اش کن. شماره‌ی سؤال‌های بعد از آن یکی جلو رفت.';
  }
  /** set the selected cell: 1-4, 0 = keep the slot but blank */
  setSelected(v: number): void { const i = this.selIndex; if (i < 0) return; this.push(); this.R.seq[i].fix = v; }
  removeSelected(): string {
    const i = this.selIndex; if (i < 0) return '';
    this.push(); this.R.seq.splice(i, 1); this.sel = null;
    return 'حذف شد. شماره‌ی سؤال‌های بعد از آن یکی عقب آمد.';
  }

  /** what "Add these keys" will write: key per question number, plus which of them are not confirmed */
  collect(start: number): { keys: Record<number, number>; remove: number[]; weak: number[]; confirmed: number[]; edited: number[] } {
    const keys: Record<number, number> = {}, remove: number[] = [], weak: number[] = [], confirmed: number[] = [], edited: number[] = [];
    this.R.seq.forEach((p: any, i: number) => {
      const num = start + i, lab = this.label(i), fixed = p.fix !== undefined;
      if (lab) { keys[num] = lab; if (fixed) { confirmed.push(num); edited.push(num); } else if (!p.low) confirmed.push(num); else weak.push(num); }
      else { remove.push(num); if (!fixed) weak.push(num); }
    });
    return { keys, remove, weak, confirmed, edited };
  }
  learn(): void { rememberKeyShapes(this.R, this.names); }
}

/* ---- drawing helpers (canvas only) ---- */
export function drawKeyPage(s: KeyPageSession, canvas: HTMLCanvasElement, start: number): void {
  const R = s.R; if (!R || !canvas) return;
  canvas.width = R.W; canvas.height = R.H;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(s.cv, 0, 0, R.W, R.H);
  const lw = Math.max(2, R.h0 / 8), fs = Math.round(R.h0 * .8);
  ctx.font = 'bold ' + fs + 'px sans-serif'; ctx.lineWidth = lw;
  R.seq.forEach((p: any, i: number) => {
    const lab = s.label(i), fixed = p.fix !== undefined, col = fixed ? '#1f6feb' : (p.low || p.cl < 0) ? (p.d ? '#e69500' : '#d62d20') : '#1a9c4a';
    ctx.strokeStyle = col; ctx.fillStyle = col;
    let xy: [number, number];
    if (p.d) { const b = p.d.g[0]; ctx.strokeRect(b.x0 - 2, b.y0 - 2, b.w + 4, b.h + 4); xy = [b.x0 - fs * .9, b.y1]; }
    else { const q = s.xy(p.x, p.y); ctx.setLineDash([6, 4]); ctx.strokeRect(q[0] - R.h0 * .5, q[1] - R.h0 * .6, R.h0, R.h0 * 1.2); ctx.setLineDash([]); xy = [q[0] - R.h0 * 1.6, q[1] + R.h0 * .5]; }
    if (lab) ctx.fillText(String(lab), xy[0], xy[1]);
    if (s.sel === p) { ctx.strokeStyle = '#1f6feb'; ctx.lineWidth = lw * 1.6; const sb = p.d ? p.d.g[0] : null; if (sb) ctx.strokeRect(sb.x0 - R.h0 * .35, sb.y0 - R.h0 * .35, sb.w + R.h0 * .7, sb.h + R.h0 * .7); ctx.lineWidth = lw; }
    if (p.n) { const g = p.n.g[0]; ctx.fillStyle = 'rgba(31,111,235,.9)'; ctx.font = 'bold ' + Math.round(fs * .7) + 'px sans-serif'; ctx.fillText(String(start + i), g.x0, g.y0 - 3); ctx.font = 'bold ' + fs + 'px sans-serif'; }
  });
}
/** crop of the scanned page around (cx,cy): lets the person compare a cell with the digit the app chose */
export function drawTile(R: any, cv: HTMLCanvasElement, cx: number, cy: number, hw: number, hh: number, wpx: number): void {
  const w = Math.round(2 * hw), h = Math.round(2 * hh), x0 = Math.round(cx - hw), y0 = Math.round(cy - hh);
  cv.width = w; cv.height = h; cv.style.width = (wpx || 64) + 'px'; cv.style.background = '#fff';
  const ctx = cv.getContext('2d')!, im = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y; let v = 255;
    if (X >= 0 && Y >= 0 && X < R.W && Y < R.H) v = R.gray[Y * R.W + X];
    const q = (y * w + x) * 4; im.data[q] = im.data[q + 1] = im.data[q + 2] = v; im.data[q + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}
