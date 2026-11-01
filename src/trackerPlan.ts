import { PlannerData, PlannerItem } from './types';
import {
  addDays, createPlannerItem, dateFromKey, dateKeyOf, hashColor, insertByPin, jalaliOfDate, loadPlannerData, savePlannerData, todayGregorian
} from './plannerStore';
import { PERSIAN_MONTH_NAMES, PERSIAN_WEEK_DAYS, parseJalaliDate } from './jalali';
import { weekdayIndexOfKey } from './plannerSchedule';
import { toPersianDigits } from './utils';
import { BOOKS, BY_UNIT, TRound, TrackerState, appliesUnit, cnt, isOn, scopedUnits, sourceFor, unitPath, unitsOfBook, unitsOfSection } from './trackerStore';

export interface PlanChunk {
  us: string[]; // the units one planner card covers
  label: string; // "فصل › بخش › مورد" (or a section / chapter title)
  part?: boolean; // true = this card is only one part of the topics (they stay open after it)
  tag?: string; // "۱ از ۲" for the parts of one topic
  source?: string; // a specific source (کتاب) of the round for this card
}

const clip = (a: string[], n: number) => (a.length > n ? a.slice(0, n).join('، ') + '…' : a.join('، '));

/** a readable title for any group of units of one book */
export function labelForUnits(us: string[]): string {
  if (us.length === 1) return unitPath(us[0]);
  const xs = us.map((u) => BY_UNIT[u]).filter(Boolean);
  if (!xs.length) return '';
  const b = BOOKS[xs[0].bi];
  const secs = Array.from(new Set(xs.map((x) => `${x.ci}.${x.si}`)));
  const chs = Array.from(new Set(xs.map((x) => x.ci)));
  if (secs.length === 1) {
    const ch = b.chapters[xs[0].ci];
    const sec = ch.s[xs[0].si];
    const whole = unitsOfSection(xs[0].bi, xs[0].ci, xs[0].si).length === xs.length;
    return `${ch.t} › ${sec.t}` + (whole || xs.every((x) => x.self) ? '' : ` (${clip(xs.map((x) => x.t), 3)})`);
  }
  if (chs.length === 1) {
    const ch = b.chapters[chs[0]];
    return `${ch.t} › ${clip(Array.from(new Set(xs.map((x) => ch.s[x.si].t))), 3)}`;
  }
  return clip(chs.map((c) => b.chapters[c].t), 3);
}

export const chunkOfUnit = (u: string): PlanChunk => ({ us: [u], label: unitPath(u) });
export const chunkOfUnits = (us: string[]): PlanChunk => ({ us, label: labelForUnits(us) });

export function chunkOfSection(bi: number, ci: number, si: number, us: string[]): PlanChunk {
  const ch = BOOKS[bi].chapters[ci];
  return { us, label: `${ch.t} › ${ch.s[si].t}` };
}

export function chunkOfChapter(bi: number, ci: number, us: string[]): PlanChunk {
  return { us, label: BOOKS[bi].chapters[ci].t };
}

/** one planner card per chunk, added to a day. Pure: returns new planner data (nothing is saved). */
export function planChunksInto(data: PlannerData, chunks: PlanChunk[], round: TRound, dateKey: string, minutes?: number, pickSource?: string): { data: PlannerData; added: number } {
  const next: PlannerData = { ...data, items: { ...data.items }, sourceColors: { ...data.sourceColors }, sourceTypes: { ...data.sourceTypes } };
  let list = next.items[dateKey] ? [...next.items[dateKey]] : [];
  let added = 0;
  chunks.forEach((c) => {
    const us = scopedUnits(round, c.us);
    const first = us.length ? BY_UNIT[us[0]] : undefined;
    if (!first) return;
    const book = BOOKS[first.bi];
    const src = sourceFor(round, first.bi, c.source || pickSource);
    const item = createPlannerItem({
      subject: book.subject,
      detail: `${c.label}${c.tag ? ` (پارت ${c.tag})` : ''} — ${round.name}`,
      grade: book.grade,
      ...(src ? { source: src.s } : {}),
      ...(minutes ? { minutes } : {}),
      trk: { u: us, r: round.id, ...(c.part ? { m: 'p' as const } : {}) }
    });
    if (src) {
      if (!next.sourceColors[src.s]) next.sourceColors[src.s] = hashColor(src.s);
      if (src.t && !next.sourceTypes[src.s]) next.sourceTypes[src.s] = src.t;
    }
    list = insertByPin(list, item, dateKey, next);
    added++;
  });
  if (added) next.items[dateKey] = list;
  return { data: added ? next : data, added };
}

/** same, but straight on the saved planner data (used while the planner screen is not open) */
export function planChunks(chunks: PlanChunk[], round: TRound, dateKey: string, minutes?: number, pickSource?: string): number {
  const r = planChunksInto(loadPlannerData(), chunks, round, dateKey, minutes, pickSource);
  if (r.added) savePlannerData(r.data);
  return r.added;
}

/** unit id -> the first date key of a not-yet-done planner card that covers it */
export function plannedUnits(data?: PlannerData): Record<string, string> {
  const out: Record<string, string> = {};
  const d = data || loadPlannerData();
  Object.keys(d.items).sort().forEach((k) => {
    (d.items[k] || []).forEach((it) => {
      if (it.done || !it.trk) return;
      it.trk.u.forEach((u) => { if (!out[u]) out[u] = k; });
    });
  });
  return out;
}

export function nextDays(n: number): string[] {
  const t = todayGregorian();
  return Array.from({ length: n }, (_, i) => dateKeyOf(addDays(t, i)));
}

export function dayLabel(key: string): string {
  const j = parseJalaliDate(key);
  return `${PERSIAN_WEEK_DAYS[weekdayIndexOfKey(key)] || ''} ${j ? toPersianDigits(j.jd) + ' ' + PERSIAN_MONTH_NAMES[j.jm - 1] : key}`;
}

// ---------------------------------------------------------------- backlog (cards that were planned for a past day and not done)
export interface OverdueItem { key: string; item: PlannerItem }

export function overdueLinked(data: PlannerData): OverdueItem[] {
  const today = dateKeyOf(todayGregorian());
  const out: OverdueItem[] = [];
  Object.keys(data.items).sort().forEach((k) => {
    if (k >= today) return;
    (data.items[k] || []).forEach((it) => { if (it.trk && !it.done) out.push({ key: k, item: it }); });
  });
  return out;
}

/** move overdue tracker cards to another day (default: today). Pure. */
export function rescheduleOverdue(data: PlannerData, toKey: string): { data: PlannerData; moved: number } {
  const od = overdueLinked(data);
  if (!od.length) return { data, moved: 0 };
  const items: Record<string, PlannerItem[]> = { ...data.items };
  const ids = new Set(od.map((o) => o.item.id));
  Array.from(new Set(od.map((o) => o.key))).forEach((k) => { items[k] = (items[k] || []).filter((x) => !ids.has(x.id)); });
  const next: PlannerData = { ...data, items };
  let list = items[toKey] ? [...items[toKey]] : [];
  od.forEach((o) => {
    const moved: PlannerItem = { ...o.item };
    delete moved.start; // a pinned time of an old day makes no sense today
    list = insertByPin(list, moved, toKey, next);
  });
  items[toKey] = list;
  return { data: next, moved: od.length };
}

// ---------------------------------------------------------------- auto planner
export interface AutoPlanOpts {
  roundId: string;
  books: number[]; // book indexes, in the order they should be studied
  perDay: number; // cards per day
  days: number; // how many study days to fill
  startOffset: number; // 0 = today, 1 = tomorrow
  skipFridays: boolean;
  granularity: 'section' | 'item';
  mode: 'sequential' | 'interleave';
  needPrev: boolean; // only units that already have the previous round
  partsPerChunk: number; // 1 = a topic is one card; 2+ = a topic is split into that many cards (all but the last are "parts")
  source: string; // a source name of the round, or '' for each book's default
}

export interface AutoPlanDay { dateKey: string; chunks: PlanChunk[] }
export interface AutoPlanResult { days: AutoPlanDay[]; total: number; leftover: number }

export function buildAutoPlan(s: TrackerState, o: AutoPlanOpts, planned: Record<string, string>): AutoPlanResult {
  const ri = s.rounds.findIndex((r) => r.id === o.roundId);
  const round = s.rounds[ri];
  if (!round) return { days: [], total: 0, leftover: 0 };
  const prev = ri > 0 ? s.rounds[ri - 1] : null;
  const ok = (u: string) => appliesUnit(round, u) && !isOn(s, u, round.id) && !planned[u] && (!o.needPrev || !prev || isOn(s, u, prev.id));

  const queues: PlanChunk[][] = o.books.map((bi) => {
    const q: PlanChunk[] = [];
    BOOKS[bi].chapters.forEach((c, ci) => c.s.forEach((_, si) => {
      const us = unitsOfSection(bi, ci, si).filter(ok);
      if (!us.length) return;
      const base = o.granularity === 'section' ? [chunkOfUnits(us)] : us.map(chunkOfUnit);
      base.forEach((c) => {
        const n = Math.max(1, Math.min(6, o.partsPerChunk || 1));
        for (let i = 0; i < n; i++) {
          q.push({ ...c, ...(o.source ? { source: o.source } : {}), ...(n > 1 ? { part: i < n - 1, tag: `${toPersianDigits(i + 1)} از ${toPersianDigits(n)}` } : {}) });
        }
      });
    }));
    return q;
  });
  const total = queues.reduce((n, q) => n + q.length, 0);

  const days: AutoPlanDay[] = [];
  const today = todayGregorian();
  let rot = 0;
  let offset = o.startOffset;
  let guard = 0;
  while (days.length < o.days && queues.some((q) => q.length) && guard++ < 400) {
    const d = addDays(today, offset++);
    if (o.skipFridays && d.getDay() === 5) continue;
    const chunks: PlanChunk[] = [];
    while (chunks.length < o.perDay && queues.some((q) => q.length)) {
      if (o.mode === 'sequential') {
        const q = queues.find((x) => x.length)!;
        chunks.push(q.shift()!);
      } else {
        let tries = 0;
        while (!queues[rot % queues.length].length && tries++ < queues.length) rot++;
        chunks.push(queues[rot % queues.length].shift()!);
        rot++;
      }
    }
    if (chunks.length) days.push({ dateKey: dateKeyOf(d), chunks });
  }
  return { days, total, leftover: queues.reduce((n, q) => n + q.length, 0) };
}

// ---------------------------------------------------------------- pace + deadline
export interface PaceInfo {
  total: number;
  done: number;
  remaining: number;
  perDay: number; // ticks per day over the last 14 days
  etaDays: number | null;
  etaLabel: string; // "۱۴ آذر"
  daysLeft: number | null; // to the due date
  need: number | null; // units per day to make the due date
  late: boolean; // current pace misses the due date
}

export function paceInfo(s: TrackerState, r: TRound, all: string[]): PaceInfo {
  const us = scopedUnits(r, all);
  const total = us.length;
  const done = cnt(s, us, r.id);
  const remaining = total - done;
  const cutoff = Date.now() - 14 * 864e5;
  let recent = 0;
  us.forEach((u) => { const ts = s.done[u] && s.done[u][r.id]; if (ts && ts >= cutoff) recent++; });
  const perDay = recent / 14;
  const etaDays = remaining === 0 ? 0 : perDay > 0 ? Math.ceil(remaining / perDay) : null;
  let etaLabel = '';
  if (etaDays !== null && etaDays > 0) {
    const j = jalaliOfDate(addDays(todayGregorian(), etaDays));
    etaLabel = `${toPersianDigits(j.jd)} ${PERSIAN_MONTH_NAMES[j.jm - 1]}`;
  }
  let daysLeft: number | null = null;
  let need: number | null = null;
  if (r.due) {
    const dd = dateFromKey(r.due);
    if (dd) {
      const t = todayGregorian();
      t.setHours(0, 0, 0, 0);
      dd.setHours(0, 0, 0, 0);
      daysLeft = Math.round((dd.getTime() - t.getTime()) / 864e5);
      need = remaining / Math.max(daysLeft, 1);
    }
  }
  const late = remaining > 0 && daysLeft !== null && (daysLeft < 0 || etaDays === null || etaDays > daysLeft);
  return { total, done, remaining, perDay, etaDays, etaLabel, daysLeft, need, late };
}

export const unitsOfBooks = (books: number[]): string[] => books.flatMap((b) => unitsOfBook(b));
