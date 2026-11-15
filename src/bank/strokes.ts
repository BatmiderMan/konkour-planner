/** Drawing engine (pure, no React): vector strokes in width-relative units, smooth rendering, erasing, snapping. */
import type React from 'react';
export type StrokeKind = 'pen' | 'hl' | 'er' | 'line' | 'arrow' | 'rect' | 'ellipse';
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
    else { ctx.ellipse((X(a) + X(b)) / 2, (Y(a) + Y(b)) / 2, Math.max(0.5, Math.abs(X(b) - X(a)) / 2), Math.max(0.5, Math.abs(Y(b) - Y(a)) / 2), 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}
export function paintAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], W: number, H: number, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
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
  const pts = s.t === 'line' || s.t === 'arrow' ? [P[0], P[P.length - 1]] : P;
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
