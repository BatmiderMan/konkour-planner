import React from 'react';
import { haptic } from '../../focusBus';

export type GestureKind = 'done' | 'skip' | null;
export interface GestureState { mode: 'idle' | 'swipe' | 'reorder'; dx: number; dy: number; kind: GestureKind; rows: number }
const IDLE: GestureState = { mode: 'idle', dx: 0, dy: 0, kind: null, rows: 0 };
const TRIGGER = 84; // px of horizontal drag that commits an action

/**
 * Touch gestures for a planner card (phones): swipe right = done · swipe left = tomorrow · long-press then drag up/down = reorder.
 * Vertical page scrolling stays native until a long-press (or a horizontal swipe) has been recognised.
 */
export function useCardGestures(
  ref: React.RefObject<HTMLElement>,
  enabled: boolean,
  h: { onDone: () => void; onSkip: () => void; onReorder: (steps: number) => void }
): GestureState {
  const [st, setSt] = React.useState<GestureState>(IDLE);
  const hr = React.useRef(h);
  hr.current = h;

  React.useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let x0 = 0, y0 = 0, mode: 'none' | 'swipe' | 'reorder' | 'scroll' = 'none', timer = 0, rowH = 70, lastRows = 0, lastKind: GestureKind = null;

    const reset = () => { window.clearTimeout(timer); mode = 'none'; lastRows = 0; lastKind = null; setSt(IDLE); };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if ((e.target as HTMLElement).closest('.pl-chk, .pl-item-actions, button, a, input')) { mode = 'scroll'; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; mode = 'none';
      rowH = Math.max(48, el.getBoundingClientRect().height + 8);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (mode !== 'none') return;
        mode = 'reorder'; haptic(20);
        setSt({ mode: 'reorder', dx: 0, dy: 0, kind: null, rows: 0 });
      }, 420);
    };
    const move = (e: TouchEvent) => {
      if (mode === 'scroll') return;
      const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
      if (mode === 'none') {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) { window.clearTimeout(timer); mode = 'swipe'; }
        else if (Math.abs(dy) > 9 || Math.abs(dx) > 9) { window.clearTimeout(timer); mode = 'scroll'; return; }
        else return;
      }
      if (e.cancelable) e.preventDefault(); // we own the gesture now: do not scroll the page
      if (mode === 'swipe') {
        const eased = Math.sign(dx) * Math.min(150, Math.abs(dx) * (Math.abs(dx) > TRIGGER ? 0.72 : 1));
        const kind: GestureKind = dx > TRIGGER ? 'done' : dx < -TRIGGER ? 'skip' : null;
        if (kind !== lastKind) { if (kind) haptic(14); lastKind = kind; }
        setSt({ mode: 'swipe', dx: eased, dy: 0, kind, rows: 0 });
      } else if (mode === 'reorder') {
        const rows = Math.round(dy / rowH);
        if (rows !== lastRows) { haptic(8); lastRows = rows; }
        setSt({ mode: 'reorder', dx: 0, dy, kind: null, rows });
      }
    };
    const end = (e: TouchEvent) => {
      window.clearTimeout(timer);
      const m = mode;
      const dx = (e.changedTouches[0]?.clientX ?? x0) - x0, dy = (e.changedTouches[0]?.clientY ?? y0) - y0;
      const rows = Math.round(dy / rowH);
      reset();
      if (m === 'swipe') { if (dx > TRIGGER) hr.current.onDone(); else if (dx < -TRIGGER) hr.current.onSkip(); }
      else if (m === 'reorder' && rows !== 0) hr.current.onReorder(rows);
    };
    // a long-press must not open the browser's context menu / text selection on the card
    const ctxm = (e: Event) => { if (mode === 'reorder') e.preventDefault(); };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });
    el.addEventListener('contextmenu', ctxm);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', reset); el.removeEventListener('contextmenu', ctxm);
    };
  }, [enabled, ref]);

  return st;
}
