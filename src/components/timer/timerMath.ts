export type Phase = 'calm' | 'warn' | 'over' | 'free' | 'rest';

export interface DialModel {
  progress: number; // 0..1 of the main arc
  notches: number; // number of marks on the outer ring
  lit: number; // how many of them are already passed
  phase: Phase;
  cycle: number; // 0..1 — position inside the current tick (or question) interval
  shown: number; // seconds shown in the middle
  remaining: number; // seconds until the planned end (never negative; 0 for a stopwatch)
  over: boolean;
}

export const fmtClock = (totalSec: number): string => {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/**
 * Everything the dial needs, from plain numbers.
 *  elapsed  active seconds of the session        total  planned seconds (0 = stopwatch)
 *  tickOn / tickSec  the tick sound settings      isBreak  rest sessions are calm and green
 * With the tick on, each notch of the outer ring IS one tick, so the ring doubles as the tick counter.
 */
export function dialModel(elapsed: number, total: number, tickOn: boolean, tickSec: number, isBreak = false): DialModel {
  const free = total <= 0;
  const over = !free && elapsed > total;
  const remaining = free ? 0 : Math.max(0, total - elapsed);
  const warnAt = Math.min(300, total * 0.15);

  let phase: Phase = 'calm';
  if (isBreak) phase = over ? 'over' : 'rest';
  else if (free) phase = 'free';
  else if (over) phase = 'over';
  else if (remaining <= warnAt) phase = 'warn';

  const progress = free ? (elapsed % 3600) / 3600 : Math.min(1, elapsed / total);

  let notches = 60;
  let lit = free ? Math.floor((elapsed % 3600) / 60) : Math.floor(progress * 60);
  if (tickOn && tickSec > 0) {
    const span = free ? 3600 : total;
    const n = Math.ceil(span / tickSec);
    if (n >= 2 && n <= 90) {
      notches = n;
      lit = Math.min(n, Math.floor((free ? elapsed % 3600 : elapsed) / tickSec));
    }
  }
  const cycle = tickOn && tickSec > 0 ? (elapsed % tickSec) / tickSec : (elapsed % 60) / 60;
  return { progress, notches, lit, phase, cycle, shown: free ? elapsed : over ? elapsed - total : remaining, remaining, over };
}

/** point on a circle, angle 0 = top, clockwise (for the glowing head of the arc) */
export function pointOnCircle(r: number, progress: number): { x: number; y: number } {
  const a = progress * Math.PI * 2;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}
