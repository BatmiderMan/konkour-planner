import { PlannerItem, PlannerScheduleSettings, RestBlock } from './types';
import { jalaliToGregorian, parseJalaliDate } from './jalali';

export const DEFAULT_SCHEDULE: PlannerScheduleSettings = {
  partMinutes: 60,
  breakMinutes: 10,
  longBreakEvery: 0,
  longBreakMinutes: 25,
  days: Array.from({ length: 7 }, () => ({ start: '08:00', end: '20:00' })),
  rests: []
};

// One-tap presets offered in settings / the day bar
export const REST_PRESETS: { label: string; icon: string; start: string; end: string }[] = [
  { label: 'ناهار', icon: '🍽', start: '13:00', end: '14:00' },
  { label: 'نماز و استراحت', icon: '🕌', start: '12:30', end: '13:00' },
  { label: 'چرت', icon: '😴', start: '14:00', end: '14:30' },
  { label: 'شام', icon: '🌙', start: '20:00', end: '20:45' },
  { label: 'ورزش', icon: '🏃', start: '18:00', end: '18:45' },
  { label: 'مدرسه / کلاس', icon: '🏫', start: '08:00', end: '13:00' }
];

export function newRestId(): string {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function normalizeRest(r: any): RestBlock | null {
  if (!r || typeof r !== 'object') return null;
  const a = timeToMin(r.start);
  const b = timeToMin(r.end);
  if (a == null || b == null || b <= a) return null;
  const days = Array.isArray(r.days) ? r.days.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newRestId(),
    label: typeof r.label === 'string' && r.label ? r.label : 'استراحت',
    icon: typeof r.icon === 'string' && r.icon ? r.icon : '☕',
    start: r.start,
    end: r.end,
    ...(days.length ? { days } : {})
  };
}

export function normalizeRests(raw: any): RestBlock[] {
  return Array.isArray(raw) ? (raw.map(normalizeRest).filter(Boolean) as RestBlock[]) : [];
}

export function cloneDefaultSchedule(): PlannerScheduleSettings {
  return {
    partMinutes: DEFAULT_SCHEDULE.partMinutes,
    breakMinutes: DEFAULT_SCHEDULE.breakMinutes,
    longBreakEvery: DEFAULT_SCHEDULE.longBreakEvery,
    longBreakMinutes: DEFAULT_SCHEDULE.longBreakMinutes,
    days: DEFAULT_SCHEDULE.days.map((d) => ({ ...d })),
    rests: []
  };
}

export function timeToMin(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// minutes since midnight -> "HH:MM" (wraps past midnight)
export function minToTime(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

// 0 = Saturday ... 6 = Friday (same order as the week board)
export function weekdayIndexOfKey(dateKey: string): number {
  const j = parseJalaliDate(dateKey);
  if (!j) return 0;
  const g = jalaliToGregorian(j.jy, j.jm, j.jd);
  return (new Date(g.gy, g.gm - 1, g.gd).getDay() + 1) % 7;
}

export function clampMinutes(v: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// Merge whatever was stored with the defaults so old / partial data never breaks
export function normalizeSchedule(raw: any): PlannerScheduleSettings {
  const base = cloneDefaultSchedule();
  if (!raw || typeof raw !== 'object') return base;
  const days = base.days.map((d, i) => {
    const r = Array.isArray(raw.days) ? raw.days[i] : null;
    const start = r && timeToMin(r.start) != null ? r.start : d.start;
    const end = r && timeToMin(r.end) != null ? r.end : d.end;
    return { start, end };
  });
  return {
    partMinutes: clampMinutes(raw.partMinutes, base.partMinutes, 5, 480),
    breakMinutes: clampMinutes(raw.breakMinutes, base.breakMinutes, 0, 120),
    longBreakEvery: clampMinutes(raw.longBreakEvery, 0, 0, 12),
    longBreakMinutes: clampMinutes(raw.longBreakMinutes, base.longBreakMinutes, 5, 180),
    days,
    rests: normalizeRests(raw.rests)
  };
}

export interface DaySlot {
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  minutes: number;
  overflow: boolean; // ends after the day's study window
  pinned: boolean; // the card has its own fixed start time
  clash: boolean; // a pinned card that overlaps the card before it or an interruption
  breakBefore: number; // rest minutes that were placed before this card
  longBreak: boolean; // that rest is the long one
}

export interface PlanRest {
  id: string;
  label: string;
  icon: string;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  beforeIndex: number; // shown right before the card with this index (items.length = after the last card)
  oneOff: boolean; // added for this day only (can be removed from the day)
}

export interface DayPlan {
  slots: DaySlot[]; // same order / length as the items
  rests: PlanRest[]; // interruptions of the day, in time order
  windowStart: string;
  windowEnd: string;
  totalMinutes: number; // first card start -> last card end
  freeMinutes: number; // left before the window ends (0 if over)
  overflowCount: number;
  clashCount: number;
}

export function itemMinutes(it: PlannerItem, s: PlannerScheduleSettings): number {
  return it.minutes && it.minutes > 0 ? it.minutes : s.partMinutes;
}

// All interruptions of one day: the recurring ones of that weekday + the day's own.
export function restsOfDay(dateKey: string, s: PlannerScheduleSettings, dayRests?: RestBlock[]): (RestBlock & { oneOff: boolean; a: number; b: number })[] {
  const wd = weekdayIndexOfKey(dateKey);
  const out: (RestBlock & { oneOff: boolean; a: number; b: number })[] = [];
  s.rests.forEach((r) => {
    if (r.days && r.days.length && r.days.indexOf(wd) < 0) return;
    out.push({ ...r, oneOff: false, a: timeToMin(r.start) ?? 0, b: timeToMin(r.end) ?? 0 });
  });
  (dayRests || []).forEach((r) => out.push({ ...r, oneOff: true, a: timeToMin(r.start) ?? 0, b: timeToMin(r.end) ?? 0 }));
  return out.filter((r) => r.b > r.a).sort((x, y) => x.a - y.a);
}

// Lay the day's cards out inside the day's window.
//  - a card with a pinned start stays exactly there
//  - other cards flow one after another (+ rest between parts, and a long rest every N parts)
//  - a flowing card never overlaps an interruption: it jumps to the end of it
// Pure function of (order, durations, pins, interruptions, window).
export function computeDayPlan(items: PlannerItem[], dateKey: string, s: PlannerScheduleSettings, dayRests?: RestBlock[]): DayPlan {
  const win = s.days[weekdayIndexOfKey(dateKey)] || s.days[0];
  const ws = timeToMin(win.start) ?? 8 * 60;
  const we = timeToMin(win.end) ?? 20 * 60;
  const rests = restsOfDay(dateKey, s, dayRests);
  let cur = ws;
  let overflowCount = 0;
  let clashCount = 0;
  const slots: DaySlot[] = items.map((it, i) => {
    const minutes = itemMinutes(it, s);
    const pin = it.start ? timeToMin(it.start) : null;
    let brk = 0;
    let long = false;
    if (i > 0) {
      brk = s.breakMinutes;
      if (s.longBreakEvery > 0 && i % s.longBreakEvery === 0) { brk = s.longBreakMinutes; long = true; }
    }
    let startMin: number;
    let clash = false;
    if (pin != null) {
      startMin = pin;
      if (i > 0 && pin < cur) clash = true;
      if (rests.some((r) => pin < r.b && pin + minutes > r.a)) clash = true;
    } else {
      startMin = cur + brk;
      for (const r of rests) {
        if (startMin < r.b && startMin + minutes > r.a) startMin = r.b;
      }
    }
    const endMin = startMin + minutes;
    const gap = startMin - cur;
    cur = endMin;
    const overflow = endMin > we;
    if (overflow) overflowCount++;
    if (clash) clashCount++;
    return {
      start: minToTime(startMin), end: minToTime(endMin), startMin, endMin, minutes, overflow,
      pinned: pin != null, clash, breakBefore: pin != null || gap <= 0 ? 0 : Math.min(brk, gap), longBreak: long && gap >= brk
    };
  });
  const placed: PlanRest[] = rests.map((r) => {
    let idx = slots.findIndex((sl) => sl.startMin >= r.a);
    if (idx < 0) idx = slots.length;
    return { id: r.id, label: r.label, icon: r.icon, start: r.start, end: r.end, startMin: r.a, endMin: r.b, beforeIndex: idx, oneOff: r.oneOff };
  });
  const firstStart = slots.length ? Math.min(...slots.map((x) => x.startMin)) : ws;
  return {
    slots,
    rests: placed,
    windowStart: win.start,
    windowEnd: win.end,
    totalMinutes: items.length ? Math.max(...slots.map((x) => x.endMin)) - firstStart : 0,
    freeMinutes: Math.max(0, we - (items.length ? Math.max(...slots.map((x) => x.endMin)) : ws)),
    overflowCount,
    clashCount
  };
}

// how many default-length parts (with rests) fit in a weekday's window, minus its interruptions
export function partsThatFit(win: { start: string; end: string }, s: PlannerScheduleSettings, weekday?: number): number {
  const a = timeToMin(win.start);
  const b = timeToMin(win.end);
  if (a == null || b == null || b <= a) return 0;
  let avail = b - a;
  if (weekday != null) {
    s.rests.forEach((r) => {
      if (r.days && r.days.length && r.days.indexOf(weekday) < 0) return;
      const x = Math.max(a, timeToMin(r.start) ?? 0);
      const y = Math.min(b, timeToMin(r.end) ?? 0);
      if (y > x) avail -= y - x;
    });
  }
  return Math.max(0, Math.floor((avail + s.breakMinutes) / (s.partMinutes + s.breakMinutes)));
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ساعت و ${m} دقیقه`;
  if (h) return `${h} ساعت`;
  return `${m} دقیقه`;
}
