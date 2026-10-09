import { useSyncExternalStore } from 'react';
import { PlannerItem } from './types';
import { gradeColor, loadPlannerData } from './plannerStore';
import { itemMinutes } from './plannerSchedule';
import { confirmDialog } from './dialog';
import { unlockAudio } from './tickSound';

// A "live" session = a planner card that is being studied right now, with its own
// timer. It is timestamp based (not interval based) so it stays correct when the
// phone sleeps, the tab is in the background, or the app is closed and reopened.

export const LIVE_PLAN_KEY = 'konkour_live_plan_v1';

export type LiveKind = 'plan' | 'free' | 'break';

export interface LivePlanSession {
  kind?: LiveKind; // missing = 'plan' (sessions stored by older versions)
  color?: string; // accent for free / break sessions (plan sessions use the grade color)
  warned?: boolean; // the «one minute left» heads-up already played
  dateKey: string; // jalali "YYYY/MM/DD" of the planner day the card belongs to
  item: PlannerItem; // snapshot, so the session survives edits/deletes of the card
  plannedSeconds: number; // planned length of this card (0 = free stopwatch, counts up)
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
  return s.plannedSeconds > 0 ? s.plannedSeconds + s.extraSeconds : 0;
}

export const liveKind = (s: LivePlanSession): LiveKind => s.kind || 'plan';
export const liveColor = (s: LivePlanSession): string => s.color || gradeColor(s.item.grade);

function baseSession(dateKey: string, item: PlannerItem, kind: LiveKind, plannedSeconds: number, extra: Partial<LivePlanSession> = {}): LivePlanSession {
  const now = new Date();
  return {
    kind,
    dateKey,
    item,
    plannedSeconds,
    extraSeconds: 0,
    startedAtClock: clock(now),
    running: true,
    runStartedAt: now.getTime(),
    accumulatedMs: 0,
    alerted: false,
    warned: false,
    pauses: 0,
    ...extra
  };
}

export function startLivePlan(dateKey: string, item: PlannerItem): void {
  const data = loadPlannerData();
  const minutes = itemMinutes(item, data.schedule);
  write(baseSession(dateKey, { ...item }, 'plan', Math.max(1, minutes) * 60, { color: gradeColor(item.grade) }));
}

export interface FreeStartOptions {
  title?: string;
  minutes?: number; // 0 / undefined = stopwatch
}

export function startFreeLive(dateKey: string, o: FreeStartOptions = {}): void {
  const item: PlannerItem = { id: 'free-' + Date.now().toString(36), subject: (o.title || '').trim() || 'مطالعه آزاد', detail: '', grade: 'دوازدهم', done: false };
  write(baseSession(dateKey, item, 'free', Math.max(0, Math.round((o.minutes || 0) * 60)), { color: '#35e0c4' }));
}

export function startBreakLive(dateKey: string, minutes: number): void {
  const item: PlannerItem = { id: 'break-' + Date.now().toString(36), subject: 'استراحت', detail: '', grade: 'دوازدهم', done: false };
  write(baseSession(dateKey, item, 'break', Math.max(1, Math.round(minutes)) * 60, { color: '#7ee8a8' }));
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

/** +/- minutes on the planned time (never below one minute; a free stopwatch has no planned time) */
export function extendLivePlan(minutes: number): void {
  const s = getSnapshot();
  if (!s || !s.plannedSeconds) return;
  const extra = Math.max(60 - s.plannedSeconds, s.extraSeconds + minutes * 60);
  const total = s.plannedSeconds + extra;
  const el = liveElapsedMs(s) / 1000;
  write({ ...s, extraSeconds: extra, alerted: el < total ? false : s.alerted, warned: total - el > 60 ? false : s.warned });
}

export function markLiveWarned(): void {
  const s = getSnapshot();
  if (!s || s.warned) return;
  write({ ...s, warned: true });
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

// UI entry points: ask before replacing a session that is already running.
async function confirmReplace(sameKey?: boolean): Promise<boolean> {
  const cur = getSnapshot();
  if (!cur) return true;
  if (sameKey) return false;
  const name = liveKind(cur) === 'break' ? 'استراحت' : `«${cur.item.subject}»`;
  return confirmDialog(`یک پلن زنده (${name}) در حال اجراست. آن را لغو و این پارت را شروع کنیم؟`);
}

export async function requestLiveStart(dateKey: string, item: PlannerItem): Promise<void> {
  unlockAudio(); // still inside the tap that started the session: lets the tick sound play on phones
  const cur = getSnapshot();
  if (cur && liveKind(cur) === 'plan' && cur.dateKey === dateKey && cur.item.id === item.id) return;
  if (!(await confirmReplace())) return;
  startLivePlan(dateKey, item);
}

export async function requestFreeStart(dateKey: string, o: FreeStartOptions = {}): Promise<boolean> {
  unlockAudio();
  if (!(await confirmReplace())) return false;
  startFreeLive(dateKey, o);
  return true;
}

export function requestBreakStart(dateKey: string, minutes: number): void {
  unlockAudio();
  startBreakLive(dateKey, minutes);
}
