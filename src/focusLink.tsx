import React from 'react';
import { useSyncExternalStore } from 'react';
import { liveKind, useLivePlan } from './livePlan';
import { getMusicState, musicFadeOut, musicPause, musicResume } from './musicStore';
import { FocusLink, LinkState, decideLink } from './focusLinkRules';

export type { FocusLink };

// "Focus link": the study timer and the music player work together (all options are opt-in).
const KEY = 'planex_focus_link_v1';
const DEFAULT: FocusLink = { autoPlay: false, pauseOnPause: false, pauseOnBreak: false, fadeOnFinish: false };

function load(): FocusLink {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (m && typeof m === 'object') {
      return {
        autoPlay: !!m.autoPlay, pauseOnPause: !!m.pauseOnPause, pauseOnBreak: !!m.pauseOnBreak, fadeOnFinish: !!m.fadeOnFinish
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT };
}
let link = load();
const listeners = new Set<() => void>();
export const getFocusLink = () => link;
export function setFocusLink(p: Partial<FocusLink>): void {
  link = { ...link, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(link)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
export function useFocusLink(): FocusLink {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, getFocusLink, getFocusLink);
}

/** mount once: watches the live session and drives the music player according to the options */
export const FocusLinkEffects: React.FC = () => {
  const live = useLivePlan();
  const kind = live ? liveKind(live) : null;
  const id = live ? `${live.dateKey}|${live.item.id}|${live.startedAtClock}|${kind}` : null;
  const running = !!live && live.running;
  const prev = React.useRef<LinkState | null>(null);
  const pausedByTimer = React.useRef(false);

  React.useEffect(() => {
    const p = prev.current;
    prev.current = { id, kind, running };
    if (!p) return; // first render: just remember the state
    const r = decideLink(p, { id, kind, running }, getFocusLink(), getMusicState().playing, pausedByTimer.current);
    pausedByTimer.current = r.pausedByTimer;
    if (r.action === 'pause') musicPause();
    else if (r.action === 'resume') musicResume();
    else if (r.action === 'fade') musicFadeOut();
  }, [id, kind, running]);
  return null;
};
