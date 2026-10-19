import { useSyncExternalStore } from 'react';

// «صدای تیک»: a repeating sound while a live plan runs, e.g. every 60 s, so that during a test you
// know when the time of one question (or one block) is over without looking at the screen.

export type TickStyle = 'tick' | 'soft' | 'wood' | 'bell';
export const TICK_STYLES: { id: TickStyle; label: string }[] = [
  { id: 'tick', label: 'تیک کوتاه' },
  { id: 'soft', label: 'نرم' },
  { id: 'wood', label: 'چوبی' },
  { id: 'bell', label: 'زنگ' }
];
export interface TickPrefs { on: boolean; seconds: number; style: TickStyle; vibrate: boolean; volume: number }

export const TICK_KEY = 'konkour_tick_pref_v1';
export const TICK_MIN = 5;
export const TICK_MAX = 3600;
export const TICK_PRESETS = [30, 60, 90, 120, 180];
export const defaultTickPrefs = (): TickPrefs => ({ on: false, seconds: 60, style: 'tick', vibrate: false, volume: 0.8 });
const clampVolume = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0.1, v)) : 0.8);

export function clampSeconds(n: number): number {
  if (!Number.isFinite(n)) return 60;
  return Math.min(TICK_MAX, Math.max(TICK_MIN, Math.round(n)));
}

// ---------------------------------------------------------------- preferences (remembered between sessions)
type Listener = () => void;
const listeners = new Set<Listener>();
let cache: TickPrefs | undefined;

function read(): TickPrefs {
  const d = defaultTickPrefs();
  try {
    const raw = localStorage.getItem(TICK_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      const style: TickStyle = TICK_STYLES.some((x) => x.id === o.style) ? o.style : 'tick';
      return { on: !!o.on, seconds: clampSeconds(+o.seconds || d.seconds), style, vibrate: !!o.vibrate, volume: clampVolume(o.volume ?? d.volume) };
    }
  } catch { /* ignore */ }
  return d;
}
export const getTickPrefs = (): TickPrefs => (cache ??= read());
export function setTickPrefs(patch: Partial<TickPrefs>): void {
  const next = { ...getTickPrefs(), ...patch };
  next.seconds = clampSeconds(next.seconds);
  next.volume = clampVolume(next.volume);
  cache = next;
  try { localStorage.setItem(TICK_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useTickPrefs = (): TickPrefs => useSyncExternalStore(subscribe, getTickPrefs, defaultTickPrefs);

// ---------------------------------------------------------------- when to tick (pure, unit-testable)
/**
 * `elapsedMs` is the ACTIVE time of the session (pauses excluded), `last` the index of the last tick that
 * was already played (tick k happens at k × interval). Returns whether to play one now / soon and how far
 * ahead. If we fell behind (screen was off) only ONE catch-up tick is played, never a burst.
 */
export function tickStep(elapsedMs: number, last: number, intervalMs: number, lookaheadMs: number): { fire: boolean; delayMs: number; last: number } {
  const idxNow = Math.floor(elapsedMs / intervalMs);
  if (idxNow > last) return { fire: true, delayMs: 0, last: idxNow };
  const dueIn = (last + 1) * intervalMs - elapsedMs;
  if (dueIn <= lookaheadMs) return { fire: true, delayMs: Math.max(0, dueIn), last: last + 1 };
  return { fire: false, delayMs: 0, last };
}
export const secondsLabel = (s: number): string => (s % 60 === 0 && s >= 120 ? `${s / 60} دقیقه` : `${s} ثانیه`);

// ---------------------------------------------------------------- audio (one shared context, unlocked by a tap)
let ctx: AudioContext | null = null;
export function getAudio(): AudioContext | null {
  try {
    if (!ctx) {
      const C = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    return ctx;
  } catch { return null; }
}
/** call from inside a click/tap handler: browsers (iOS especially) only allow sound after a gesture */
export function unlockAudio(): void {
  const c = getAudio();
  if (!c) return;
  try { const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch { /* ignore */ }
}
if (typeof window !== 'undefined') {
  const once = () => { unlockAudio(); window.removeEventListener('pointerdown', once, true); window.removeEventListener('keydown', once, true); };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}

function blip(c: AudioContext, at: number, freq: number, dur: number, peak: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator(); const g = c.createGain();
  const vol = getTickPrefs().volume;
  o.type = type; o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * vol), at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(c.destination);
  o.start(at); o.stop(at + dur + 0.05);
}
/** play one tick `inSeconds` from now (the audio clock keeps it exact even if the UI timer jitters) */
export function playTick(style: TickStyle, inSeconds = 0): void {
  const c = getAudio();
  if (!c) return;
  const at = c.currentTime + Math.max(0, inSeconds);
  if (style === 'bell') { blip(c, at, 1318, 0.7, 0.4); blip(c, at, 1976, 0.5, 0.18); blip(c, at + 0.18, 1568, 0.7, 0.3); }
  else if (style === 'soft') { blip(c, at, 660, 0.22, 0.38); blip(c, at, 990, 0.16, 0.12); }
  else if (style === 'wood') { blip(c, at, 420, 0.05, 0.5, 'square'); blip(c, at, 210, 0.11, 0.42); blip(c, at + 0.045, 840, 0.04, 0.12, 'triangle'); }
  else { blip(c, at, 1800, 0.07, 0.5, 'triangle'); blip(c, at, 900, 0.09, 0.3); }
}
/** the «planned time is over» alarm (three beeps) */
export function playAlarm(): void {
  const c = getAudio();
  if (!c) return;
  [0, 0.5, 1].forEach((d) => blip(c, c.currentTime + d, 880, 0.35, 0.25));
}
/** gentle two-note heads-up («one minute left») */
export function playHeadsUp(): void {
  const c = getAudio();
  if (!c) return;
  blip(c, c.currentTime, 740, 0.28, 0.22); blip(c, c.currentTime + 0.2, 988, 0.4, 0.22);
}
/** tiny confirmation pop when a question is marked */
export function playPop(skip = false): void {
  const c = getAudio();
  if (!c) return;
  if (skip) { blip(c, c.currentTime, 330, 0.09, 0.2, 'triangle'); }
  else { blip(c, c.currentTime, 880, 0.07, 0.2, 'triangle'); blip(c, c.currentTime + 0.06, 1320, 0.09, 0.18, 'triangle'); }
}
/** rising chord when a rest is over / a session is saved */
export function playDone(): void {
  const c = getAudio();
  if (!c) return;
  [523, 659, 784].forEach((f, i) => blip(c, c.currentTime + i * 0.12, f, 0.5, 0.22));
}
