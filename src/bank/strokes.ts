/** Drawing engine (pure, no React): vector strokes in width-relative units, smooth rendering, erasing, snapping. */
import type React from 'react';
export type StrokeKind = 'pen' | 'hl' | 'er' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'poly';
export interface Pt { x: number; y: number; p: number }          // x, y: fraction of the stage width · p: pressure 0..1
export interface Stroke { id: string; t: StrokeKind; c: string; w: number; pts: Pt[] }   // w: px at a 1000px-wide stage
export type Bg = 'blank' | 'grid' | 'dots' | 'lines';
export interface DrawDoc { v: 1; strokes: Stroke[]; extra: number; bg: Bg }   // extra: height of the free space under the question, as a fraction of the width
export const EMPTY_DOC: DrawDoc = { v: 1, strokes: [], extra: 0, bg: 'blank' };
export const sid = () => Math.random().toString(36).slice(2, 9);

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: (a.p + b.p) / 2 });
const constP = (pts: Pt[]) => pts.every((p) => Math.abs(p.p - pts[0].p) < 0.02);

/** paint one stroke with quadratic smoothing through the mid points (the «ink» look) */
export function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke, W: number) {
  const pts = s.pts; if (!pts.length) return;
  const k = W / 1000, X = (p: Pt) => p.x * W, Y = (p: Pt) => p.y * W;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
  if (s.t === 'er') ctx.globalCompositeOperation = 'destination-out';
  if (s.t === 'hl') { ctx.globalAlpha = 0.38; ctx.lineCap = 'butt'; }
  const lw = Math.max(0.6, s.w * k);
  if (s.t === 'pen' || s.t === 'hl' || s.t === 'er') {
    if (pts.length === 1) { ctx.beginPath(); ctx.arc(X(pts[0]), Y(pts[0]), (s.t === 'pen' ? lw * (0.4 + 0.6 * pts[0].p) : lw) / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
    if (s.t !== 'pen' || constP(pts)) {   // one path = no seams, no double alpha
      ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(X(pts[0]), Y(pts[0]));
      for (let i = 1; i < pts.length - 1; i++) { const m = mid(pts[i], pts[i + 1]); ctx.quadraticCurveTo(X(pts[i]), Y(pts[i]), X(m), Y(m)); }
      ctx.lineTo(X(pts[pts.length - 1]), Y(pts[pts.length - 1])); ctx.stroke();
    } else {                              // pressure: width changes along the line
      let prev = pts[0];
      for (let i = 1; i < pts.length; i++) {
        const a = i === 1 ? pts[0] : mid(pts[i - 1], pts[i]), b = i === pts.length - 1 ? pts[i] : mid(pts[i], pts[i + 1]);
        ctx.lineWidth = lw * (0.35 + 0.65 * ((a.p + pts[i].p + b.p) / 3));
        ctx.beginPath(); ctx.moveTo(X(a), Y(a)); ctx.quadraticCurveTo(X(pts[i]), Y(pts[i]), X(b), Y(b)); ctx.stroke(); prev = pts[i];
      }
      void prev;
    }
  } else {
    const a = pts[0], b = pts[pts.length - 1]; ctx.lineWidth = lw; ctx.beginPath();
    if (s.t === 'line' || s.t === 'arrow') {
      ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); ctx.stroke();
      if (s.t === 'arrow') {
        const ang = Math.atan2(Y(b) - Y(a), X(b) - X(a)), L = Math.max(10 * k * 1.6, lw * 4);
        ctx.beginPath(); ctx.moveTo(X(b), Y(b)); ctx.lineTo(X(b) - L * Math.cos(ang - 0.45), Y(b) - L * Math.sin(ang - 0.45));
        ctx.moveTo(X(b), Y(b)); ctx.lineTo(X(b) - L * Math.cos(ang + 0.45), Y(b) - L * Math.sin(ang + 0.45)); ctx.stroke();
      }
    } else if (s.t === 'rect') { ctx.rect(Math.min(X(a), X(b)), Math.min(Y(a), Y(b)), Math.abs(X(b) - X(a)), Math.abs(Y(b) - Y(a))); ctx.stroke(); }
    else if (s.t === 'poly') { ctx.moveTo(X(pts[0]), Y(pts[0])); for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i]), Y(pts[i])); ctx.closePath(); ctx.stroke(); }
    else { ctx.ellipse((X(a) + X(b)) / 2, (Y(a) + Y(b)) / 2, Math.max(0.5, Math.abs(X(b) - X(a)) / 2), Math.max(0.5, Math.abs(Y(b) - Y(a)) / 2), 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}
export function paintAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], W: number, H: number, dpr: number, offY = 0) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.setTransform(dpr, 0, 0, dpr, 0, offY * dpr);
  for (const s of strokes) paintStroke(ctx, s, W);
}

/** drop points that add nothing (keeps files small, curves smooth) */
export function simplify(pts: Pt[], W: number, tol = 0.35): Pt[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]]; let last = pts[0];
  for (let i = 1; i < pts.length - 1; i++) { if (Math.hypot((pts[i].x - last.x) * W, (pts[i].y - last.y) * W) >= tol) { out.push(pts[i]); last = pts[i]; } }
  out.push(pts[pts.length - 1]);
  return out.map((p) => ({ x: Math.round(p.x * 1e4) / 1e4, y: Math.round(p.y * 1e4) / 1e4, p: Math.round(p.p * 100) / 100 }));
}

const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
/** does a circle (cx, cy in width fractions, r in px) touch the stroke? */
export function hits(s: Stroke, cx: number, cy: number, r: number, W: number): boolean {
  if (s.t === 'er') return false;
  const rr = r + (s.w * W) / 2000, P = s.pts;
  if (P.length === 1) return Math.hypot((P[0].x - cx) * W, (P[0].y - cy) * W) <= rr;
  if (s.t === 'rect' || s.t === 'ellipse') {
    const a = P[0], b = P[P.length - 1], x0 = Math.min(a.x, b.x) * W, x1 = Math.max(a.x, b.x) * W, y0 = Math.min(a.y, b.y) * W, y1 = Math.max(a.y, b.y) * W, px = cx * W, py = cy * W;
    const edge = Math.min(Math.abs(px - x0), Math.abs(px - x1)), edgeY = Math.min(Math.abs(py - y0), Math.abs(py - y1));
    const inX = px >= x0 - rr && px <= x1 + rr, inY = py >= y0 - rr && py <= y1 + rr;
    return (inX && inY) && (edgeY <= rr || edge <= rr || s.t === 'ellipse' && Math.abs(Math.hypot((px - (x0 + x1) / 2) / Math.max(1, (x1 - x0) / 2), (py - (y0 + y1) / 2) / Math.max(1, (y1 - y0) / 2)) - 1) * Math.min(x1 - x0, y1 - y0) / 2 <= rr);
  }
  const pts = s.t === 'line' || s.t === 'arrow' ? [P[0], P[P.length - 1]] : s.t === 'poly' ? [...P, P[0]] : P;
  for (let i = 0; i < pts.length - 1; i++) if (segDist(cx * W, cy * W, pts[i].x * W, pts[i].y * W, pts[i + 1].x * W, pts[i + 1].y * W) <= rr) return true;
  return false;
}

/** the background pattern of the free space (CSS) */
export const bgCss = (bg: Bg, W: number): React.CSSProperties => {
  const g = Math.max(14, W / 30);
  if (bg === 'grid') return { backgroundImage: 'linear-gradient(#c8d2ea 1px,transparent 1px),linear-gradient(90deg,#c8d2ea 1px,transparent 1px)', backgroundSize: `${g}px ${g}px` };
  if (bg === 'dots') return { backgroundImage: 'radial-gradient(#9aa8cc 1.3px,transparent 1.6px)', backgroundSize: `${g}px ${g}px` };
  if (bg === 'lines') return { backgroundImage: 'linear-gradient(#c8d2ea 1px,transparent 1px)', backgroundSize: `100% ${g * 1.3}px` };
  return {};
};


/* ---------------------------------------------------------------- shape recognition: hold the pen still after a rough shape and it becomes a clean one */
type XY = { x: number; y: number };
const dist2 = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
function dp(pts: XY[], eps: number): XY[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1]; let mx = 0, mi = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y); if (d > mx) { mx = d; mi = i; } }
  if (mx <= eps) return [a, b];
  const l = dp(pts.slice(0, mi + 1), eps), r = dp(pts.slice(mi), eps); return [...l.slice(0, -1), ...r];
}
function resample(pts: XY[], n: number): XY[] {
  let L = 0; for (let i = 1; i < pts.length; i++) L += dist2(pts[i], pts[i - 1]);
  const step = L / (n - 1), out: XY[] = [pts[0]]; let acc = 0, prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i], d = dist2(prev, cur);
    while (acc + d >= step && d > 0) { const t = (step - acc) / d; const q = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t }; out.push(q); prev = q; d = dist2(prev, cur); acc = 0; }
    acc += d; prev = cur;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out.slice(0, n);
}
export interface Shape { t: StrokeKind; pts: Pt[] }
/** raw: the stroke's points (width fractions). lineOnly: only straighten (highlighter). Returns a clean shape, or null when the path is not clearly one. */
export function recognizeShape(raw: Pt[], W: number, lineOnly = false): Shape | null {
  if (raw.length < 7) return null;
  const p: XY[] = raw.map((q) => ({ x: q.x * W, y: q.y * W }));
  let L = 0; for (let i = 1; i < p.length; i++) L += dist2(p[i], p[i - 1]);
  if (L < 30) return null;
  const mk = (t: StrokeKind, a: XY[]): Shape => ({ t, pts: a.map((q) => ({ x: Math.round((q.x / W) * 1e4) / 1e4, y: Math.round((q.y / W) * 1e4) / 1e4, p: 0.5 })) });
  const first = p[0], last = p[p.length - 1], chord = dist2(first, last);
  // ---- straight line
  let dev = 0; for (const q of p) dev = Math.max(dev, segDist(q.x, q.y, first.x, first.y, last.x, last.y));
  if (chord > 24 && L < 1.22 * chord && dev < 0.09 * chord) return mk('line', [first, last]);
  if (lineOnly) return null;
  // ---- closed shapes
  if (!(chord < 0.3 * L && L > 70)) return null;
  const rs = resample([...p, first], 80);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of rs) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const bw = x1 - x0, bh = y1 - y0; if (bw < 14 || bh < 14) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // polygon? (Douglas-Peucker on the closed loop)
  const simp = dp(rs, 0.034 * L); const poly = simp.slice(0, -1); const k = poly.length;
  if (k === 3) {
    const area = Math.abs((poly[1].x - poly[0].x) * (poly[2].y - poly[0].y) - (poly[2].x - poly[0].x) * (poly[1].y - poly[0].y)) / 2;
    return area > 0.04 * bw * bh ? mk('poly', poly) : null;
  }
  if (k === 4) {
    const ang = (i: number) => { const a = poly[(i + 3) % 4], b = poly[i], c = poly[(i + 1) % 4]; const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y }; return Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1)))) * 180 / Math.PI; };
    const sd = [0, 1, 2, 3].map((i) => dist2(poly[i], poly[(i + 1) % 4]));
    const rect = [0, 1, 2, 3].every((i) => Math.abs(ang(i) - 90) < 30) && Math.min(sd[0], sd[2]) / Math.max(sd[0], sd[2]) > 0.55 && Math.min(sd[1], sd[3]) / Math.max(sd[1], sd[3]) > 0.55;
    if (!rect) return mk('poly', poly);
    // dominant direction of the edges, folded into (-45°, 45°]
    let sx = 0, sy = 0; for (let i = 0; i < 4; i++) { const a = Math.atan2(poly[(i + 1) % 4].y - poly[i].y, poly[(i + 1) % 4].x - poly[i].x) * 4; sx += Math.cos(a); sy += Math.sin(a); }
    const th = Math.atan2(sy, sx) / 4;
    if (Math.abs(th) < (14 * Math.PI) / 180) {                       // upright: a clean rectangle (a square when it is nearly one)
      let w = bw, h = bh; if (Math.abs(w - h) / Math.max(w, h) < 0.14) { w = h = (w + h) / 2; }
      return mk('rect', [{ x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy + h / 2 }]);
    }
    const u = { x: Math.cos(th), y: Math.sin(th) }, v = { x: -u.y, y: u.x }; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const q of rs) { const pu = (q.x - cx) * u.x + (q.y - cy) * u.y, pv = (q.x - cx) * v.x + (q.y - cy) * v.y; a0 = Math.min(a0, pu); a1 = Math.max(a1, pu); b0 = Math.min(b0, pv); b1 = Math.max(b1, pv); }
    let w = a1 - a0, h = b1 - b0; const ma = (a0 + a1) / 2, mb = (b0 + b1) / 2; if (Math.abs(w - h) / Math.max(w, h) < 0.14) { w = h = (w + h) / 2; }
    const c0 = { x: cx + ma * u.x + mb * v.x, y: cy + ma * u.y + mb * v.y };
    return mk('poly', [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: c0.x + (i * w / 2) * u.x + (j * h / 2) * v.x, y: c0.y + (i * w / 2) * u.y + (j * h / 2) * v.y })));
  }
  // ellipse / circle: how far is every point from the bounding ellipse?
  const a = bw / 2, b = bh / 2; const rr = rs.map((q) => Math.hypot((q.x - cx) / a, (q.y - cy) / b));
  const m = rr.reduce((s2, v2) => s2 + v2, 0) / rr.length, sdv = Math.sqrt(rr.reduce((s2, v2) => s2 + (v2 - m) ** 2, 0) / rr.length);
  if (k >= 5 && sdv / m < 0.15 && m > 0.82 && m < 1.18) {
    let ea = a, eb = b; if (Math.abs(a - b) / Math.max(a, b) < 0.15) { ea = eb = (a + b) / 2; }
    return mk('ellipse', [{ x: cx - ea, y: cy - eb }, { x: cx + ea, y: cy + eb }]);
  }
  return null;
}
