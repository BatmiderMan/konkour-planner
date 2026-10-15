import React from 'react';
import { FxKind } from './timerLook';

// Ambient background effects drawn on one light canvas behind the timer (≈30 fps, paused while the tab is hidden).
interface P { x: number; y: number; r: number; v: number; a: number; ph: number; s: number; l: number }
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const COUNT: Record<Exclude<FxKind, 'none'>, [number, number, number]> = {
  stars: [70, 140, 260], particles: [18, 34, 60], fireflies: [10, 20, 36], rain: [60, 130, 240], snow: [40, 90, 170]
};

export const FocusFx: React.FC<{ kind: FxKind; level: 1 | 2 | 3 }> = ({ kind, level }) => {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (kind === 'none') return;
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, last = 0, lastDraw = 0, colTime = -1e9;
    let colA = '#6b8cff', colB = '#35e0c4';
    let ps: P[] = [];
    let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    const k = kind as Exclude<FxKind, 'none'>;

    const spawn = (init: boolean): P => {
      const p: P = { x: rnd(0, w), y: rnd(0, h), r: 1, v: 0, a: 1, ph: rnd(0, 6.283), s: 1, l: 0 };
      if (k === 'stars') { p.r = rnd(.4, 1.5); p.s = rnd(.6, 2.2); p.a = rnd(.4, 1); }
      else if (k === 'particles') { p.r = rnd(2, 9); p.v = rnd(6, 22); p.a = rnd(.05, .2); p.y = init ? p.y : h + 20; }
      else if (k === 'fireflies') { p.r = rnd(1.6, 3.2); p.v = rnd(8, 24); p.s = rnd(.6, 1.8); }
      else if (k === 'rain') { p.x = rnd(-100, w + 100); p.v = rnd(700, 1100); p.l = rnd(10, 26); p.a = rnd(.08, .22); p.y = init ? p.y : rnd(-120, -10); }
      else { p.r = rnd(1, 3.2); p.v = rnd(25, 70); p.a = rnd(.45, .9); p.s = rnd(.4, 1.2); p.y = init ? p.y : rnd(-30, -5); }
      return p;
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(COUNT[k][level - 1] * clamp((w * h) / (1280 * 720), .45, 2));
      ps = Array.from({ length: n }, () => spawn(true));
    };
    const readColors = (t: number) => {
      if (t - colTime < 2) return;
      colTime = t;
      const cs = getComputedStyle(cv);
      colA = cs.getPropertyValue('--tm-a').trim() || colA;
      colB = cs.getPropertyValue('--tm-b').trim() || colB;
    };

    const draw = (dt: number, t: number) => {
      readColors(t);
      ctx.clearRect(0, 0, w, h);
      if (k === 'stars') {
        ctx.fillStyle = '#fff';
        for (const p of ps) {
          ctx.globalAlpha = clamp(p.a * (.45 + .55 * Math.sin(t * p.s + p.ph)), 0, 1);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }
        if (level >= 2 && !shoot && Math.random() < dt * (level === 3 ? .22 : .1)) {
          shoot = { x: rnd(w * .2, w), y: rnd(0, h * .4), vx: -rnd(500, 800), vy: rnd(200, 360), life: 1 };
        }
        if (shoot) {
          const s = shoot;
          s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.6;
          const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * .12, s.y - s.vy * .12);
          g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = clamp(s.life, 0, 1); ctx.strokeStyle = g; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * .12, s.y - s.vy * .12); ctx.stroke();
          if (s.life <= 0) shoot = null;
        }
      } else if (k === 'particles') {
        ctx.fillStyle = colA;
        for (const p of ps) {
          p.y -= p.v * dt; p.x += Math.sin(t * .4 + p.ph) * 6 * dt;
          if (p.y < -20) Object.assign(p, spawn(false));
          ctx.globalAlpha = p.a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          ctx.globalAlpha = p.a * .35; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.9, 0, 6.283); ctx.fill();
        }
      } else if (k === 'fireflies') {
        for (const p of ps) {
          p.ph += (Math.sin(t * .3 + p.s * 5) * .9) * dt;
          p.x += Math.cos(p.ph) * p.v * dt; p.y += Math.sin(p.ph) * p.v * dt;
          if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
          const pulse = .5 + .5 * Math.sin(t * p.s * 1.4 + p.s * 9);
          ctx.fillStyle = colB;
          ctx.globalAlpha = .08 + .16 * pulse; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 6.283); ctx.fill();
          ctx.globalAlpha = .35 + .6 * pulse; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }
      } else if (k === 'rain') {
        ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = 1; ctx.lineCap = 'round';
        for (const p of ps) {
          p.y += p.v * dt; p.x += p.v * .18 * dt;
          if (p.y > h + 30) { p.y = rnd(-140, -10); p.x = rnd(-100, w + 100); }
          ctx.globalAlpha = p.a;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.l * .18, p.y - p.l); ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#fff';
        for (const p of ps) {
          p.y += p.v * dt; p.x += Math.sin(t * p.s + p.ph) * 18 * dt;
          if (p.y > h + 10) { p.y = rnd(-30, -5); p.x = rnd(0, w); }
          ctx.globalAlpha = p.a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    resize();
    window.addEventListener('resize', resize);
    if (reduce) {
      draw(0, 0); // one still frame, no motion
    } else {
      const frame = (ms: number) => {
        raf = requestAnimationFrame(frame);
        if (document.hidden || ms - lastDraw < 32) { if (document.hidden) last = ms; return; }
        const dt = Math.min(.06, last ? (ms - last) / 1000 : .033);
        last = ms; lastDraw = ms;
        draw(dt, ms / 1000);
      };
      raf = requestAnimationFrame(frame);
    }
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [kind, level]);

  if (kind === 'none') return null;
  return <canvas ref={ref} className="tm-fx" aria-hidden="true" />;
};
