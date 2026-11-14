// The clock of Beast mode. Called once a second by BeastHost (and right when the page is left / returned to).
// It starts every signed part exactly on time, accounts every second while a part runs, ends it exactly on time
// and closes the day. It never waits for the student.
import { StudyBlock, PlannerItem } from '../types';
import { createEmptyBlock, toPersianDigits as P } from '../utils';
import { minToTime } from '../plannerSchedule';
import { dateKeyOf, patchPlannerItem, todayGregorian } from '../plannerStore';
import { cancelLivePlan, getLivePlan, startBeastLive } from '../livePlan';
import { playAlarm, playDone, playHeadsUp } from '../tickSound';
import { haptic } from '../focusBus';
import { BeastDay, BeastPart, Obs, applyCredits, awayLevel, creditedMs, flushPresence, partPct, plannedMs, reportTimes, stepPresence } from './beastRules';
import { closeDay, emitRun, getBeast, getRun, touchRun } from './beastStore';
import { getPresence } from './presence';

export interface EngineEnv {
  save: (dateKey: string, item: PlannerItem, block: StudyBlock) => void; // puts a finished part into the day's report
  notify: (text: string) => void;
}
let env: EngineEnv = { save: () => undefined, notify: () => undefined };
export const setEngineEnv = (e: EngineEnv): void => { env = e; };

export const todayKey = (): string => dateKeyOf(todayGregorian());
export function absMs(min: number, base = new Date()): number {
  const d = new Date(base.getTime());
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------- leaving the page
let leftAt: number | null = typeof document !== 'undefined' && (document.hidden || !document.hasFocus()) ? Date.now() : null;
export const isLeft = (): boolean => leftAt !== null;
/** time spent away is accounted BEFORE the flag is cleared, so the gap lands in the right bucket */
export function pageLeft(): void { if (leftAt === null) { leftAt = Date.now(); } }
export function pageBack(): void { if (leftAt !== null) { tick(Date.now()); leftAt = null; } }
let alarmLevel: 0 | 1 | 2 = 0;
let lastAlarmAt = 0;
export const getAlarmLevel = (): 0 | 1 | 2 => alarmLevel;

function observe(): Obs {
  if (leftAt !== null) return 'away';
  if (!getBeast().settings.camera) return 'present';
  const c = getPresence();
  if (c.status !== 'ready' || !c.calibrated) return 'blind';
  return c.obs;
}

// ---------------------------------------------------------------- a part
function startPart(day: BeastDay, part: BeastPart, a: number, b: number, now: number): void {
  const cur = getLivePlan();
  if (cur && cur.beast?.partId !== part.id) cancelLivePlan(); // a Beast part wins over anything else that was running
  const late = Math.max(0, now - a);
  part.status = 'running';
  part.lastAt = late > 4000 ? now : a; // a few seconds of timer jitter still count as on time; real lateness was booked as away above
  part.pend = { badKind: null, badMs: 0 };
  if (late > 4000) { part.awayMs += late; part.lateSec = Math.round(late / 1000); }
  startBeastLive(day.dateKey, part.item, minToTime(part.startMin), (b - a) / 1000, b, part.id, now - a);
  playHeadsUp();
  haptic([70, 40, 70]);
  env.notify(late > 4000 ? `دیر رسیدی؛ ${P(Math.round(late / 1000))} ثانیه‌ی این پارت سوخت.` : 'وقت شروع! سرِ درس.');
  emitRun();
}

function account(part: BeastPart, now: number, b: number): void {
  const s = getBeast().settings;
  const to = Math.min(now, b);
  let dt = to - part.lastAt;
  if (dt <= 0) return;
  part.lastAt = to;
  const grace = s.graceSec * 1000;
  if (part.excuseOn) {
    const room = Math.max(0, s.excuseSec * 1000 - part.excusedMs);
    if (dt < room) { part.excusedMs += dt; touchRun(); return; }
    part.excusedMs += room;
    part.excuseOn = false;
    dt -= room;
    env.notify('وقت استراحتِ مجاز تمام شد؛ برگرد سر درس.');
    playHeadsUp();
    emitRun();
    if (dt <= 0) return;
  }
  const r = stepPresence(part.pend, observe(), dt, grace);
  part.pend = r.st;
  applyCredits(part, r.credits);

  // escalating alerts: soft chime when you are about to be counted away, then an alarm while you are
  const level = awayLevel(part.pend, grace);
  if (level !== alarmLevel) {
    if (level === 1) { playHeadsUp(); haptic(40); }
    if (level === 2) { part.alarms++; playAlarm(); haptic([200, 100, 200, 100, 200]); lastAlarmAt = now; emitRun(); }
    if (level === 0 && alarmLevel === 2) emitRun();
    alarmLevel = level;
  } else if (level === 2 && now - lastAlarmAt > 12000) {
    lastAlarmAt = now; playAlarm(); haptic([200, 100, 200]);
  }
  touchRun();
}

export function finishPart(day: BeastDay, part: BeastPart, how: 'done' | 'forfeit' | 'missed'): void {
  const s = getBeast().settings;
  if (part.status === 'running') {
    const f = flushPresence(part.pend, s.graceSec * 1000);
    part.pend = f.st;
    part.presentMs += f.present;
  }
  part.excuseOn = false;
  part.status = how;
  alarmLevel = 0;
  const live = getLivePlan();
  if (live && live.beast && live.beast.partId === part.id) cancelLivePlan();
  if (how === 'missed') {
    env.notify(`پارتِ «${part.item.subject}» از دست رفت؛ برای امروز هیچ اعتباری ندارد.`);
    emitRun();
    return;
  }
  const rt = reportTimes(part);
  const pct = partPct(part);
  if (rt.minutes >= 1) {
    const verified = Math.round((part.presentMs + part.unverifiedMs) / 60000);
    const block: StudyBlock = {
      ...createEmptyBlock(),
      lesson: part.item.subject,
      subject: part.item.detail || '',
      start: rt.start,
      end: rt.end,
      desc: `🔥 حالت بیست · ${P(pct)}٪ — ${P(verified)} دقیقه‌ی تأییدشده از ${P(Math.round(plannedMs(part) / 60000))}${part.lateSec ? ` · ${P(part.lateSec)} ثانیه دیر` : ''}${how === 'forfeit' ? ' · تسلیم' : ''}`,
      study: true
    };
    env.save(day.dateKey, part.item, block);
  }
  if (how === 'done' && pct >= s.doneAtPct) patchPlannerItem(day.dateKey, part.id, { done: true, sentToReport: true });
  if (pct >= 85) { playDone(); haptic([30, 60, 30]); } else playHeadsUp();
  env.notify(`پارتِ «${part.item.subject}» تمام شد · ${P(pct)}٪${how === 'forfeit' ? ' (تسلیم)' : ''}`);
  emitRun();
}

/** an excused break (water, toilet): not held against you, but limited */
export function startExcuse(): boolean {
  const s = getBeast().settings;
  const live = getLivePlan();
  const day = getRun().days[todayKey()];
  const part = day && live && live.beast ? day.parts.find((p) => p.id === live.beast!.partId) : undefined;
  if (!part || part.status !== 'running' || part.excuseOn) return false;
  if (part.excuses >= s.maxExcuses || part.excusedMs >= s.excuseSec * 1000) return false;
  tick(Date.now());
  const f = flushPresence(part.pend, s.graceSec * 1000);
  part.pend = f.st; part.presentMs += f.present;
  part.excuseOn = true; part.excuses++;
  alarmLevel = 0;
  emitRun();
  return true;
}
export function endExcuse(): void {
  const live = getLivePlan();
  const day = getRun().days[todayKey()];
  const part = day && live && live.beast ? day.parts.find((p) => p.id === live.beast!.partId) : undefined;
  if (!part || !part.excuseOn) return;
  tick(Date.now());
  part.excuseOn = false;
  emitRun();
}
export function forfeitRunning(): void {
  const live = getLivePlan();
  const day = getRun().days[todayKey()];
  const part = day && live && live.beast ? day.parts.find((p) => p.id === live.beast!.partId) : undefined;
  if (!part || part.status !== 'running') return;
  tick(Date.now());
  finishPart(day!, part, 'forfeit');
  settleDay(day!);
}

// ---------------------------------------------------------------- the day
function settleDay(day: BeastDay): void {
  if (day.closed) return;
  if (day.parts.some((p) => p.status === 'pending' || p.status === 'running')) return;
  closeDay(day.dateKey);
}

export function tick(now = Date.now()): void {
  if (!getBeast().settings.on) return;
  const today = todayKey();
  const days = getRun().days;
  Object.keys(days).forEach((k) => {
    const day = days[k];
    if (day.closed) return;
    if (k < today) { // a day that was never finished (the app was closed all night): settle it
      day.parts.forEach((p) => { if (p.status === 'running') finishPart(day, p, 'done'); else if (p.status === 'pending') finishPart(day, p, 'missed'); });
      settleDay(day);
      return;
    }
    if (k !== today) return; // a contract for tomorrow just waits
    day.parts.forEach((part) => {
      const a = absMs(part.startMin), b = absMs(part.endMin);
      if (part.status === 'pending') {
        if (now >= b) finishPart(day, part, 'missed');
        else if (now >= a) startPart(day, part, a, b, now);
      }
      if (part.status === 'running') {
        account(part, now, b);
        if (now >= b) finishPart(day, part, 'done');
      }
    });
    settleDay(day);
  });
}

/** numbers for the HUD */
export function partLive(part: BeastPart, now = Date.now()): { elapsedMs: number; creditedMs: number; pct: number; pendingMs: number } {
  const a = absMs(part.startMin);
  const elapsedMs = Math.max(0, Math.min(now, absMs(part.endMin)) - a);
  const c = creditedMs(part);
  return { elapsedMs, creditedMs: c, pct: elapsedMs > 0 ? Math.max(0, Math.min(100, Math.round((c / Math.max(1, elapsedMs - part.excusedMs)) * 100))) : 100, pendingMs: part.pend.badMs };
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pageLeft(); else pageBack(); });
  window.addEventListener('blur', pageLeft);
  window.addEventListener('focus', pageBack);
}
