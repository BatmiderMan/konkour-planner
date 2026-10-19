import React from 'react';

// Phones: the Back button / back-swipe should close the open sheet instead of leaving the app.
// Each open sheet pushes one history entry; closing it with a button removes that entry again.
let selfBack = 0; // history.back() calls we made ourselves (their popstate must not close anything)

export function useBackToClose(open: boolean, onClose: () => void): void {
  const cb = React.useRef(onClose);
  cb.current = onClose;
  React.useEffect(() => {
    if (!open) return;
    let pushed = true;
    try { history.pushState({ planexSheet: true }, ''); } catch { return; }
    const onPop = () => {
      if (selfBack > 0) { selfBack--; return; }
      pushed = false;
      cb.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (pushed) { selfBack++; try { history.back(); } catch { selfBack--; } }
    };
  }, [open]);
}
