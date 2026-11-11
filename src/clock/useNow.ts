import React from 'react';

/**
 * A "now" that changes exactly once per displayed second.
 *
 * The old clocks polled every 250–500 ms, which re-rendered whole screens 2–4× more often than the digits
 * could change. This schedules the next update for the moment the seconds digit actually flips
 * (`phase()` = how many ms into the current second the clock is, default: wall time), which is cheaper AND
 * keeps the digit flip and the progress arc perfectly in step.
 */
export function useNow(active: boolean, phase?: () => number, win: Window = window): number {
  const [now, setNow] = React.useState(() => Date.now());
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;
  React.useEffect(() => {
    if (!active) return;
    let t = 0;
    const step = () => {
      const n = Date.now();
      setNow(n);
      const p = phaseRef.current ? phaseRef.current() : n % 1000;
      t = win.setTimeout(step, Math.max(40, 1000 - (p % 1000) + 6));
    };
    step();
    // timers are throttled in background tabs: re-sync the moment the tab is visible again
    const onVis = () => { win.clearTimeout(t); step(); };
    win.document.addEventListener('visibilitychange', onVis);
    return () => { win.clearTimeout(t); win.document.removeEventListener('visibilitychange', onVis); };
  }, [active, win]);
  return now;
}
