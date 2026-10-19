// Pure rules for the timer ↔ music link (no browser APIs, easy to test)
export interface FocusLink {
  autoPlay: boolean; // a study session starts -> music plays
  pauseOnPause: boolean; // the timer is paused -> music pauses (and continues with it)
  pauseOnBreak: boolean; // a break starts -> music pauses
  fadeOnFinish: boolean; // the session is finished / cancelled -> music fades out
}

export interface LinkState { id: string | null; kind: string | null; running: boolean }
export type LinkAction = 'resume' | 'pause' | 'fade' | null;
/** the rules, as a pure function: what to do with the music when the live session changes */
export function decideLink(p: LinkState, c: LinkState, o: FocusLink, playing: boolean, pausedByTimer: boolean): { action: LinkAction; pausedByTimer: boolean } {
  if (c.id && c.id !== p.id) {
    if (c.kind === 'break') {
      if (o.pauseOnBreak && playing) return { action: 'pause', pausedByTimer: true };
    } else if ((o.autoPlay || pausedByTimer) && !playing) return { action: 'resume', pausedByTimer: false };
  } else if (c.id && c.id === p.id && c.kind !== 'break') {
    if (p.running && !c.running && o.pauseOnPause && playing) return { action: 'pause', pausedByTimer: true };
    if (!p.running && c.running && pausedByTimer && !playing) return { action: 'resume', pausedByTimer: false };
  } else if (!c.id && p.id) {
    if (o.fadeOnFinish && p.kind !== 'break' && playing) return { action: 'fade', pausedByTimer: false };
    return { action: null, pausedByTimer: false };
  }
  return { action: null, pausedByTimer };
}

