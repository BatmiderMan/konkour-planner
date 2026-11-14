// Pure rules of «حالت بیست» (Beast mode). No browser APIs here: everything is unit-tested in tools/beast-rules.test.ts.
//
//  • A signed day is a list of PARTS with fixed wall-clock start and end. A part starts and ends on the clock, never later.
//  • While a part runs, every second is put in exactly one bucket: present / away / distracted / unverified / excused.
//  • Leaving for less than the grace period is forgiven; longer counts from the moment you left.
//  • credited time = present + half of unverified; score = credited / (planned − excused).
import { PlannerItem, PlannerScheduleSettings, RestBlock } from '../types';
import { computeDayPlan, minToTime } from '../plannerSchedule';

export type Obs = 'present' | 'away' | 'distracted' | 'blind';
export type PartStatus = 'pending' | 'running' | 'done' | 'missed' | 'forfeit';

export interface BeastSettings {
  on: boolean;
  camera: boolean; // verify presence with the camera (on this device only)
  graceSec: number; // away / distracted shorter than this is forgiven
  excuseSec: number; // excused time per part (water, toilet …) that is not held against you
  maxExcuses: number; // how many separate excused breaks per part
  minPct: number; // a day counts for the streak at this score or more
  doneAtPct: number; // a planner card is ticked as done when its part reaches this score
}

export const DEFAULT_BEAST: BeastSettings = { on: false, camera: true, graceSec: 10, excuseSec: 120, maxExcuses: 2, minPct: 85, doneAtPct: 70 };
export const UNVERIFIED_CREDIT = 0.5; // time the camera could not verify earns half
export const GRACE_CHOICES = [5, 10, 20, 30];
export const EXCUSE_CHOICES = [60, 120, 180, 300];
export const MIN_PCT_CHOICES = [70, 80, 85, 90, 95];
export const DONE_PCT_CHOICES = [50, 70, 90];

const clampInt = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
export function normalizeSettings(raw: any): BeastSettings {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    on: !!r.on,
    camera: r.camera !== false,
    graceSec: clampInt(r.graceSec, 3, 120, DEFAULT_BEAST.graceSec),
    excuseSec: clampInt(r.excuseSec, 0, 900, DEFAULT_BEAST.excuseSec),
    maxExcuses: clampInt(r.maxExcuses, 0, 10, DEFAULT_BEAST.maxExcuses),
    minPct: clampInt(r.minPct, 10, 100, DEFAULT_BEAST.minPct),
    doneAtPct: clampInt(r.doneAtPct, 10, 100, DEFAULT_BEAST.doneAtPct)
  };
}

// ---------------------------------------------------------------- presence accounting with grace
export interface PresState { badKind: 'away' | 'distracted' | null; badMs: number }
export const freshPres = (): PresState => ({ badKind: null, badMs: 0 });
export interface Credits { present: number; away: number; distracted: number; unverified: number }
const zero = (): Credits => ({ present: 0, away: 0, distracted: 0, unverified: 0 });

/**
 * Put `dtMs` of observation `obs` in the right bucket.
 *  – present: it is yours (plus the short absence that was still inside the grace period → forgiven)
 *  – away / distracted: held back (pending) while inside the grace period; once it is longer, the WHOLE stretch counts
 *  – blind (camera could not say): unverified, a pending absence stays pending
 */
export function stepPresence(st: PresState, obs: Obs, dtMs: number, graceMs: number): { st: PresState; credits: Credits } {
  const c = zero();
  if (dtMs <= 0) return { st, credits: c };
  if (obs === 'present') {
    const forgiven = st.badKind && st.badMs <= graceMs ? st.badMs : 0;
    c.present = dtMs + forgiven;
    return { st: freshPres(), credits: c };
  }
  if (obs === 'blind') {
    c.unverified = dtMs;
    return { st, credits: c };
  }
  const was = st.badMs;
  const bad = was + dtMs;
  if (was > graceMs) { c[obs] = dtMs; return { st: { badKind: obs, badMs: bad }, credits: c }; } // already counting
  if (bad > graceMs) { c[obs] = bad; return { st: { badKind: obs, badMs: bad }, credits: c }; } // just crossed: the whole stretch counts
  return { st: { badKind: obs, badMs: bad }, credits: c }; // still inside the grace period
}

/** end of a part / start of an excused break: a short pending absence is forgiven */
export function flushPresence(st: PresState, graceMs: number): { st: PresState; present: number } {
  if (st.badKind && st.badMs <= graceMs) return { st: freshPres(), present: st.badMs };
  return { st: freshPres(), present: 0 };
}

/** 0 = fine · 1 = leaving (soft chime) · 2 = away for real (alarm) */
export function awayLevel(st: PresState, graceMs: number): 0 | 1 | 2 {
  if (!st.badKind) return 0;
  if (st.badMs > graceMs) return 2;
  return st.badMs >= graceMs * 0.5 ? 1 : 0;
}

// ---------------------------------------------------------------- parts
export interface BeastPart {
  id: string; // planner card id
  item: PlannerItem; // snapshot: the contract survives edits / deletes of the card
  startMin: number; // minutes since midnight
  endMin: number;
  status: PartStatus;
  lateSec: number; // seconds that had already passed when the part began (the student was late / the app was closed)
  presentMs: number;
  awayMs: number;
  distractedMs: number;
  unverifiedMs: number;
  excusedMs: number;
  excuses: number; // excused breaks taken
  excuseOn: boolean;
  pend: PresState;
  lastAt: number; // ms timestamp up to which the time was accounted
  alarms: number; // how many times the away alarm fired
}

export interface BeastDay {
  dateKey: string;
  signedAt: number;
  parts: BeastPart[];
  closed: boolean;
}

export const plannedMs = (p: Pick<BeastPart, 'startMin' | 'endMin'>): number => Math.max(0, (p.endMin - p.startMin) * 60000);
export const creditedMs = (p: BeastPart): number => Math.round(p.presentMs + p.unverifiedMs * UNVERIFIED_CREDIT);
/** excused time is taken off the part's length (it is never more than the allowance) */
export const requiredMs = (p: BeastPart, excuseCapMs = Infinity): number => Math.max(1, plannedMs(p) - Math.min(p.excusedMs, excuseCapMs));
export function partScore(p: BeastPart): number {
  if (p.status === 'missed') return 0;
  return Math.max(0, Math.min(1, creditedMs(p) / requiredMs(p)));
}
export const partPct = (p: BeastPart): number => Math.round(partScore(p) * 100);

export function newPart(item: PlannerItem, startMin: number, endMin: number): BeastPart {
  return {
    id: item.id, item: { ...item }, startMin, endMin, status: 'pending', lateSec: 0,
    presentMs: 0, awayMs: 0, distractedMs: 0, unverifiedMs: 0, excusedMs: 0, excuses: 0, excuseOn: false,
    pend: freshPres(), lastAt: 0, alarms: 0
  };
}

export function applyCredits(p: BeastPart, c: Credits): void {
  p.presentMs += c.present;
  p.awayMs += c.away;
  p.distractedMs += c.distracted;
  p.unverifiedMs += c.unverified;
}

/**
 * The contract of a day: the planner's cards laid out in time (the same layout the planner shows).
 * Cards that are done, already over, or squeezed to nothing by the next part are left out.
 * A part that is already running keeps its real start (the student is late and pays for it).
 */
export function buildParts(items: PlannerItem[], dateKey: string, schedule: PlannerScheduleSettings, dayRests: RestBlock[] | undefined, nowMin: number): BeastPart[] {
  const plan = computeDayPlan(items, dateKey, schedule, dayRests);
  const raw = items
    .map((it, i) => ({ it, a: plan.slots[i].startMin, b: plan.slots[i].endMin }))
    .filter((x) => !x.it.done && x.a >= 0 && x.a < 1440)
    .sort((x, y) => x.a - y.a);
  const out: BeastPart[] = [];
  raw.forEach((x, i) => {
    let b = Math.min(x.b, 1440);
    const next = raw[i + 1];
    if (next && next.a < b) b = next.a; // pinned cards that overlap: the earlier one ends where the next begins
    if (b - x.a < 5 || b <= nowMin) return;
    out.push(newPart(x.it, x.a, b));
  });
  return out;
}

export const partLabel = (p: BeastPart): string => `${minToTime(p.startMin)}–${minToTime(p.endMin)}`;

// ---------------------------------------------------------------- the day
export interface PartSummary { id: string; subject: string; detail: string; start: string; end: string; pct: number; status: PartStatus; presentMin: number; awayMin: number; distractedMin: number; excusedMin: number }
export interface DaySummary {
  dateKey: string;
  pct: number; // credited / required over the whole day
  plannedMin: number;
  creditedMin: number;
  missed: number;
  forfeited: number;
  parts: PartSummary[];
  bestId?: string;
  worstId?: string;
  streakAfter?: number;
  closedAt: number;
}
const min = (ms: number): number => Math.round(ms / 60000);

export function summarizeDay(day: BeastDay, closedAt = Date.now()): DaySummary {
  let req = 0, cred = 0, planned = 0;
  const parts: PartSummary[] = day.parts.map((p) => {
    planned += plannedMs(p);
    req += p.status === 'missed' ? plannedMs(p) : requiredMs(p);
    cred += p.status === 'missed' ? 0 : Math.min(creditedMs(p), requiredMs(p));
    return {
      id: p.id, subject: p.item.subject, detail: p.item.detail || '', start: minToTime(p.startMin), end: minToTime(p.endMin),
      pct: partPct(p), status: p.status, presentMin: min(p.presentMs + p.unverifiedMs), awayMin: min(p.awayMs), distractedMin: min(p.distractedMs), excusedMin: min(p.excusedMs)
    };
  });
  const played = parts.filter((p) => p.status !== 'missed');
  const best = played.length ? played.reduce((a, b) => (b.pct > a.pct ? b : a)) : undefined;
  const worst = parts.length ? parts.reduce((a, b) => (b.pct < a.pct ? b : a)) : undefined;
  return {
    dateKey: day.dateKey,
    pct: req > 0 ? Math.round((cred / req) * 100) : 0,
    plannedMin: min(planned),
    creditedMin: min(cred),
    missed: day.parts.filter((p) => p.status === 'missed').length,
    forfeited: day.parts.filter((p) => p.status === 'forfeit').length,
    parts,
    bestId: best?.id,
    worstId: worst && worst.id !== best?.id ? worst.id : undefined,
    closedAt
  };
}

export interface Streak { count: number; best: number; last: string }
export const emptyStreak = (): Streak => ({ count: 0, best: 0, last: '' });
/** a day at or above `minPct` continues the streak when it is the day after the last good one; anything else resets it */
export function nextStreak(s: Streak, dateKey: string, pct: number, minPct: number, isNextDay: boolean): Streak {
  if (pct < minPct) return { count: 0, best: s.best, last: s.last };
  const count = s.last && isNextDay ? s.count + 1 : 1;
  return { count, best: Math.max(s.best, count), last: dateKey };
}

export interface Verdict { title: string; line: string; tone: 'gold' | 'good' | 'ok' | 'bad' | 'fail' }
export function verdictFor(pct: number): Verdict {
  if (pct >= 95) return { title: 'بیست واقعی 🔥', line: 'تقریباً بی‌نقص. امروز قرارداد را قورت دادی.', tone: 'gold' };
  if (pct >= 85) return { title: 'قوی بود', line: 'سر وقت نشستی و بیشترِ زمان واقعاً درس خواندی.', tone: 'good' };
  if (pct >= 70) return { title: 'قابل قبول', line: 'پایه خوب است، اما فاصله با بیست هنوز همین جاست.', tone: 'ok' };
  if (pct >= 50) return { title: 'ضعیف', line: 'نیمی از وقتت هدر رفت. فردا همان ساعت اول را درست شروع کن.', tone: 'bad' };
  return { title: 'شکست', line: 'امروز قرارداد را شکستی. تا فردا فرصت جبران داری.', tone: 'fail' };
}

// ---------------------------------------------------------------- the clock of a part
export type Phase = 'before' | 'running' | 'after';
export function phaseOf(startAbs: number, endAbs: number, now: number): Phase {
  if (now < startAbs) return 'before';
  return now < endAbs ? 'running' : 'after';
}

/** report block of a finished part: it starts when the part was due and lasts as long as the CREDITED time */
export function reportTimes(p: BeastPart): { start: string; end: string; minutes: number } {
  const minutes = Math.round(Math.min(creditedMs(p), plannedMs(p)) / 60000);
  return { start: minToTime(p.startMin), end: minToTime(p.startMin + minutes), minutes };
}
