import React from 'react';

/**
 * Drag a handle / header downwards to dismiss a bottom sheet (touch & pen only — a mouse uses the buttons).
 * Spread `bind` on the grab zone and apply `style` to the sheet so it follows the finger.
 */
export function useSwipeDown(onClose: () => void, threshold = 90) {
  const start = React.useRef<number | null>(null);
  const [dy, setDy] = React.useState(0);
  const end = (commit: boolean) => {
    const d = dy;
    start.current = null; setDy(0);
    if (commit && d > threshold) onClose();
  };
  const bind = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      start.current = e.clientY;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => { if (start.current !== null) setDy(Math.max(0, e.clientY - start.current)); },
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false)
  };
  const style: React.CSSProperties | undefined = dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined;
  return { bind, style, dragging: dy > 0 };
}
