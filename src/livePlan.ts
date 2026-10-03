import { useSyncExternalStore } from 'react';
import { PlannerItem } from './types';
import { loadPlannerData } from './plannerStore';
import { itemMinutes } from './plannerSchedule';
import { confirmDialog } from './dialog';

// A "live" session = a planner card that is being studied right now, with its own
// timer. It is timestamp based (not interval based) so it stays correct when the
// phone sleeps, the tab is in the background, or the app is closed and reopened.

export const LIVE_PLAN_KEY = 'konkour_live_plan_v1';

export interface LivePlanSession {
  dateKey: string; // jalali "YYYY/MM/DD" of the planner day the card belongs to
  item: PlannerItem; // snapshot, so the session survives edits/deletes of the card
  plannedSeconds: number; // planned length of this card
  extraSeconds: number; // "+5 min" additions
  startedAtClock: string; // "HH:MM" wall-clock time of the very first start
  running: boolean;
  runStartedAt: number | null; // ms timestamp of the current running stretch
  accumulatedMs: number; // active time of the finished stretches (pauses excluded)
  alerted: boolean; // planned time reached notification already fired
  pauses: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: LivePlanSession | null | undefined;

function read(): LivePlanSession | null {
  try {
    const raw = localStorage.getItem(LIVE_PLAN_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.item || !s.dateKey) return null;
    return s as LivePlanSession;
  } catch {
    return null;
  }
}

function getSnapshot(): LivePlanSession | null {
  if (cache === undefined) cache = read();
  return cache;
}

function write(s: LivePlanSession | null) {
  cache = s;
  try {
    if (s) localStorage.setItem(LIVE_PLAN_KEY, JSON.stringify(s));
    else localStorage.removeItem(LIVE_PLAN_KEY);
  } catch {
    // ignore storage errors, the in-memory copy keeps working
  }
  listeners.forEach((l) => l());
}

function subscribe(l: Listener) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LIVE_PLAN_KEY) {
      cache = undefined;
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

export function useLivePlan(): LivePlanSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function getLivePlan(): LivePlanSession | null {
  return getSnapshot();
}

const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function liveElapsedMs(s: LivePlanSession, now = Date.now()): number {
  return s.accumulatedMs + (s.running && s.runStartedAt ? Math.max(0, now - s.runStartedAt) : 0);
}

export function liveTotalPlannedSeconds(s: LivePlanSession): number {
  return s.plannedSeconds + s.extraSeconds;
}

export function startLivePlan(dateKey: string, item: PlannerItem): void {
  const data = loadPlannerData();
  const minutes = itemMinutes(item, data.schedule);
  const now = new Date();
  write({
    dateKey,
    item: { ...item },
    plannedSeconds: Math.max(1, minutes) * 60,
    extraSeconds: 0,
    startedAtClock: clock(now),
    running: true,
    runStartedAt: now.getTime(),
    accumulatedMs: 0,
    alerted: false,
    pauses: 0
  });
}

export function pauseLivePlan(): void {
  const s = getSnapshot();
  if (!s || !s.running) return;
  write({ ...s, running: false, accumulatedMs: liveElapsedMs(s), runStartedAt: null, pauses: s.pauses + 1 });
}

export function resumeLivePlan(): void {
  const s = getSnapshot();
  if (!s || s.running) return;
  write({ ...s, running: true, runStartedAt: Date.now() });
}

export function extendLivePlan(minutes: number): void {
  const s = getSnapshot();
  if (!s) return;
  write({ ...s, extraSeconds: s.extraSeconds + minutes * 60, alerted: false });
}

export function markLiveAlerted(): void {
  const s = getSnapshot();
  if (!s || s.alerted) return;
  write({ ...s, alerted: true });
}

export function cancelLivePlan(): void {
  write(null);
}

export const clearLivePlan = cancelLivePlan;

export interface LiveResult {
  session: LivePlanSession;
  activeSeconds: number;
  start: string; // "HH:MM"
  end: string; // "HH:MM" = start + active time (pauses excluded)
  wallEnd: string; // "HH:MM" real clock time at finish
}

// Freeze the session for the finish form. The session stays stored until it is saved or cancelled.
export function freezeLivePlan(): LiveResult | null {
  const s = getSnapshot();
  if (!s) return null;
  const now = new Date();
  const frozen = s.running ? { ...s, running: false, accumulatedMs: liveElapsedMs(s, now.getTime()), runStartedAt: null } : s;
  if (frozen !== s) write(frozen);
  const activeSeconds = Math.max(60, Math.round(frozen.accumulatedMs / 1000));
  const [h, m] = frozen.startedAtClock.split(':').map(Number);
  const startMin = h * 60 + m;
  const endMin = (startMin + Math.round(activeSeconds / 60)) % 1440;
  return {
    session: frozen,
    activeSeconds,
    start: frozen.startedAtClock,
    end: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
    wallEnd: clock(now)
  };
}

// UI entry point: asks before replacing a session that is already running.
export async function requestLiveStart(dateKey: string, item: PlannerItem): Promise<void> {
  const cur = getSnapshot();
  if (cur) {
    if (cur.dateKey === dateKey && cur.item.id === item.id) return;
    const ok = await confirmDialog(`یک پلن زنده («${cur.item.subject}») در حال اجراست. آن را لغو و این پارت را شروع کنیم؟`);
    if (!ok) return;
  }
  startLivePlan(dateKey, item);
}
