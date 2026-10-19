import React, { useEffect, useRef } from 'react';
import { Corners, applyH, homography } from './engine';

/** Photo with four draggable corner dots and a thin grid that shows where the bubble table is assumed to be. */
export const CornerPicker: React.FC<{ img: HTMLImageElement; corners: Corners; rev: number; cols: number; rows: number; onDone: (c: Corners) => void }> = ({ img, corners, rev, cols, rows, onDone }) => {
  const cv = useRef<HTMLCanvasElement>(null);
  const pts = useRef<Corners>([]);
  const done = useRef(onDone); done.current = onDone;

  useEffect(() => {
    const canvas = cv.current!, wrap = canvas.parentElement!;
    pts.current = corners.map((p) => [p[0], p[1]] as [number, number]);
    const o = { w: img.naturalWidth, h: img.naturalHeight };
    const ctx = canvas.getContext('2d')!;
    let view = { sc: 1, pad: 0, w: 0, h: 0 }, drag = -1;
    const NAMES = ['1', '2', '3', '4'];
    const layout = () => {
      const cw = wrap.clientWidth || 600, pad = Math.round(cw * .07), sc = (cw - 2 * pad) / o.w, ch = Math.round(o.h * sc + 2 * pad), dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); canvas.style.height = ch + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); view = { sc, pad, w: cw, h: ch };
    };
    const i2c = (p: number[]) => [p[0] * view.sc + view.pad, p[1] * view.sc + view.pad];
    const c2i = (p: number[]) => [(p[0] - view.pad) / view.sc, (p[1] - view.pad) / view.sc];
    const draw = () => {
      if (!wrap.clientWidth) return;
      layout();
      const cs = getComputedStyle(document.documentElement);
      ctx.fillStyle = cs.getPropertyValue('--tint-2').trim() || '#dde'; ctx.fillRect(0, 0, view.w, view.h);
      ctx.drawImage(img, view.pad, view.pad, o.w * view.sc, o.h * view.sc);
      const acc = cs.getPropertyValue('--primary').trim() || '#2447d8', q = pts.current.map(i2c);
      const M = homography([[0, 0], [1, 0], [1, 1], [0, 1]], q);
      ctx.lineWidth = 1; ctx.strokeStyle = acc; ctx.globalAlpha = .85;
      for (let i = 0; i <= cols; i++) { ctx.beginPath(); for (let t = 0; t <= 1.0001; t += .1) { const p = applyH(M, i / cols, t); t === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); } ctx.stroke(); }
      for (let j = 0; j <= rows; j++) { ctx.beginPath(); for (let t = 0; t <= 1.0001; t += .1) { const p = applyH(M, t, j / rows); t === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); } ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.beginPath(); q.forEach((p, i) => { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.stroke();
      q.forEach((p, i) => {
        ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(p[0], p[1], 12, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(NAMES[i], p[0], p[1]);
      });
    };
    const evPos = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = (e: PointerEvent) => {
      const p = evPos(e); let best = -1, bd = 1e9;
      pts.current.forEach((k, i) => { const c = i2c(k), d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d < bd) { bd = d; best = i; } });
      if (bd < 44) { drag = best; canvas.setPointerCapture(e.pointerId); e.preventDefault(); }
    };
    const move = (e: PointerEvent) => {
      if (drag < 0) return; const p = c2i(evPos(e));
      p[0] = Math.max(-o.w * .07, Math.min(o.w * 1.07, p[0])); p[1] = Math.max(-o.h * .04, Math.min(o.h * 1.04, p[1]));
      pts.current[drag] = [p[0], p[1]]; draw();
    };
    const end = () => { if (drag >= 0) { drag = -1; done.current(pts.current.map((p) => [p[0], p[1]] as [number, number])); } };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    const ro = new ResizeObserver(draw); ro.observe(wrap);
    draw();
    return () => { ro.disconnect(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', end); canvas.removeEventListener('pointercancel', end); };
  }, [img, rev, cols, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="ck-pick"><canvas ref={cv} /></div>;
};
