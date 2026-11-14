import { useSyncExternalStore } from 'react';
import { shiftDateKey } from '../plannerStore';
import { BeastDay, BeastPart, BeastSettings, DEFAULT_BEAST, DaySummary, Streak, emptyStreak, nextStreak, normalizeSettings, summarizeDay } from './beastRules';

// Two keys on purpose:
//  planex_beast_v1      settings + streak + finished-day summaries  → synced and backed up like the other settings
//  planex_beast_run_v1  the live accounting of today's contract     → this device only (it is rewritten every few seconds)
const KEY = 'planex_beast_v1';
const RUN_KEY = 'planex_beast_run_v1';

interface Persisted { settings: BeastSettings; history: Record<string, DaySummary>; streak: Streak; unseen: string }
interface Run { days: Record<string, BeastDay> }

const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* full / private mode: memory copy keeps working */ } };

function loadMain(): Persisted {
  try {
    const o = JSON.parse(lsGet(KEY) || 'null');
    if (o && typeof o === 'object') {
      return {
        settings: normalizeSettings(o.settings),
        history: o.history && typeof o.history === 'object' ? o.history : {},
        streak: o.streak && typeof o.streak.count === 'number' ? { count: o.streak.count | 0, best: o.streak.best | 0, last: String(o.streak.last || '') } : emptyStreak(),
        unseen: typeof o.unseen === 'string' ? o.unseen : ''
      };
    }
  } catch { /* ignore */ }
  return { settings: { ...DEFAULT_BEAST }, history: {}, streak: emptyStreak(), unseen: '' };
}
function loadRun(): Run {
  try {
    const o = JSON.parse(lsGet(RUN_KEY) || 'null');
    if (o && typeof o === 'object' && o.days && typeof o.days === 'object') return { days: o.days };
  } catch { /* ignore */ }
  return { days: {} };
}

let main = loadMain();
let run = loadRun();
let mainVer = 0;
let runVer = 0;
const mainLs = new Set<() => void>();
const runLs = new Set<() => void>();

function saveMain() { lsSet(KEY, JSON.stringify(main)); mainVer++; mainLs.forEach((l) => l()); }

// ---- settings / history (React state: changes rarely)
export const getBeast = (): Persisted => main;
export const useBeast = (): Persisted => {
  useSyncExternalStore((l) => { mainLs.add(l); return () => { mainLs.delete(l); }; }, () => mainVer, () => 0);
  return main;
};
export function setBeastSettings(patch: Partial<BeastSettings>): void {
  main = { ...main, settings: normalizeSettings({ ...main.settings, ...patch }) };
  saveMain();
}

// ---- the running contract (mutated in place by the engine; `emitRun` tells React when something visible changed)
export const getRun = (): Run => run;
export const useBeastRun = (): Run => {
  useSyncExternalStore((l) => { runLs.add(l); return () => { runLs.delete(l); }; }, () => runVer, () => 0);
  return run;
};
export const getDay = (dateKey: string): BeastDay | undefined => run.days[dateKey];
/** a signed, not yet finished day: the planner cards of that day are part of the contract */
export const isDayLocked = (dateKey: string): boolean => { const d = run.days[dateKey]; return !!main.settings.on && !!d && !d.closed; };

let persistTimer: ReturnType<typeof setTimeout> | null = null;
export function persistRunNow(): void {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  lsSet(RUN_KEY, JSON.stringify(run));
}
/** the numbers changed: write them to storage soon (throttled) without re-rendering everything */
export function touchRun(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => { persistTimer = null; lsSet(RUN_KEY, JSON.stringify(run)); }, 3000);
}
export function emitRun(): void { runVer++; runLs.forEach((l) => l()); persistRunNow(); }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistRunNow);
  window.addEventListener('beforeunload', persistRunNow);
}

export function signDay(dateKey: string, parts: BeastPart[]): BeastDay {
  const day: BeastDay = { dateKey, signedAt: Date.now(), parts, closed: false };
  run = { days: { ...run.days, [dateKey]: day } };
  emitRun();
  return day;
}

/** all parts are finished: summarize, update the streak, queue the verdict card */
export function closeDay(dateKey: string): DaySummary | null {
  const day = run.days[dateKey];
  if (!day || day.closed) return null;
  const sum = summarizeDay(day);
  day.closed = true;
  const streak = nextStreak(main.streak, dateKey, sum.pct, main.settings.minPct, main.streak.last === shiftDateKey(dateKey, -1));
  sum.streakAfter = streak.count;
  const history = { ...main.history, [dateKey]: sum };
  const keys = Object.keys(history).sort();
  while (keys.length > 90) delete history[keys.shift() as string];
  main = { ...main, history, streak, unseen: dateKey };
  // keep only the last few contract days on this device
  const dk = Object.keys(run.days).sort();
  while (dk.length > 4) { const k = dk.shift() as string; if (run.days[k].closed) delete run.days[k]; else break; }
  saveMain();
  emitRun();
  return sum;
}

export function ackVerdict(): void {
  if (!main.unseen) return;
  main = { ...main, unseen: '' };
  saveMain();
}

// ---- tiny bus: any button (settings, the floating chip) asks the host to open the contract sheet
export const OPEN_BEAST_EVENT = 'planex:beast-open';
export const openBeast = (): void => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_BEAST_EVENT)); };
