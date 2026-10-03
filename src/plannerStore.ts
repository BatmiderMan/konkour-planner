import { BookType, PlannerData, PlannerGrade, PlannerItem, PlannerSubjectDef, RestBlock } from './types';
import { cloneDefaultSchedule, computeDayPlan, normalizeRests, normalizeSchedule, timeToMin } from './plannerSchedule';
import { gregorianToJalali, jalaliToGregorian, formatJalaliDate, parseJalaliDate, JalaliDate } from './jalali';

const KEY_PLANNER = 'konkour_planner_data_v1';

export const PLANNER_GRADES: { id: PlannerGrade; c: string }[] = [
  { id: 'دهم', c: '#6f9bd1' },
  { id: 'یازدهم', c: '#a68bd9' },
  { id: 'دوازدهم', c: '#d9a15b' }
];

export const DEFAULT_PLANNER_SUBJECTS: PlannerSubjectDef[] = [
  { n: 'ریاضی ۱', grades: ['دهم'] },
  { n: 'هندسه ۱', grades: ['دهم'] },
  { n: 'فیزیک ۱', grades: ['دهم'] },
  { n: 'شیمی ۱', grades: ['دهم'] },
  { n: 'حسابان ۱', grades: ['یازدهم'] },
  { n: 'هندسه ۲', grades: ['یازدهم'] },
  { n: 'آمار و احتمال', grades: ['یازدهم'] },
  { n: 'فیزیک ۲', grades: ['یازدهم'] },
  { n: 'شیمی ۲', grades: ['یازدهم'] },
  { n: 'حسابان ۲', grades: ['دوازدهم'] },
  { n: 'هندسه ۳', grades: ['دوازدهم'] },
  { n: 'گسسته', grades: ['دوازدهم'] },
  { n: 'فیزیک ۳', grades: ['دوازدهم'] },
  { n: 'شیمی ۳', grades: ['دوازدهم'] },
  { n: 'زیست‌شناسی', grades: ['دهم', 'یازدهم', 'دوازدهم'] },
  { n: 'ادبیات فارسی', grades: ['دهم', 'یازدهم', 'دوازدهم'] },
  { n: 'عربی', grades: ['دهم', 'یازدهم', 'دوازدهم'] },
  { n: 'دین و زندگی', grades: ['دهم', 'یازدهم', 'دوازدهم'] },
  { n: 'زبان انگلیسی', grades: ['دهم', 'یازدهم', 'دوازدهم'] },
  { n: 'زمین‌شناسی', grades: ['دهم', 'یازدهم', 'دوازدهم'] },
  { n: 'سایر', grades: ['دهم', 'یازدهم', 'دوازدهم'] }
];

export function gradeColor(g: string): string {
  return (PLANNER_GRADES.find((x) => x.id === g) || PLANNER_GRADES[2]).c;
}

export function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  const s = 0.55;
  const l = 0.58;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g2 = 0;
  let b = 0;
  if (hue < 60) { r = c; g2 = x; b = 0; }
  else if (hue < 120) { r = x; g2 = c; b = 0; }
  else if (hue < 180) { r = 0; g2 = c; b = x; }
  else if (hue < 240) { r = 0; g2 = x; b = c; }
  else if (hue < 300) { r = x; g2 = 0; b = c; }
  else { r = c; g2 = 0; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g2) + toHex(b);
}

function uid(): string {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Fill in anything missing (older saved data has no types / schedule / timeline)
export function normalizePlannerData(parsed: any, fallbackSubjects?: PlannerSubjectDef[]): PlannerData {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const types: Record<string, BookType> = {};
  if (p.sourceTypes && typeof p.sourceTypes === 'object') {
    Object.keys(p.sourceTypes).forEach((k) => {
      if (p.sourceTypes[k] === 'test' || p.sourceTypes[k] === 'descriptive') types[k] = p.sourceTypes[k];
    });
  }
  const timeline: Record<string, boolean> = {};
  if (p.timeline && typeof p.timeline === 'object') {
    Object.keys(p.timeline).forEach((k) => { if (p.timeline[k]) timeline[k] = true; });
  }
  const dayRests: Record<string, RestBlock[]> = {};
  if (p.dayRests && typeof p.dayRests === 'object') {
    Object.keys(p.dayRests).forEach((k) => {
      const l = normalizeRests(p.dayRests[k]);
      if (l.length) dayRests[k] = l;
    });
  }
  return {
    items: p.items && typeof p.items === 'object' ? p.items : {},
    sourceColors: p.sourceColors && typeof p.sourceColors === 'object' ? p.sourceColors : {},
    sourceTypes: types,
    subjects:
      Array.isArray(p.subjects) && p.subjects.length
        ? p.subjects
        : fallbackSubjects || JSON.parse(JSON.stringify(DEFAULT_PLANNER_SUBJECTS)),
    schedule: normalizeSchedule(p.schedule),
    timeline,
    dayRests
  };
}

export function loadPlannerData(): PlannerData {
  try {
    const raw = localStorage.getItem(KEY_PLANNER);
    if (raw) return normalizePlannerData(JSON.parse(raw));
  } catch (e) {
    // ignore corrupt data, fall through to defaults
  }
  return {
    items: {},
    sourceColors: {},
    sourceTypes: {},
    subjects: JSON.parse(JSON.stringify(DEFAULT_PLANNER_SUBJECTS)),
    schedule: cloneDefaultSchedule(),
    timeline: {},
    dayRests: {}
  };
}

export function savePlannerData(data: PlannerData): void {
  try {
    localStorage.setItem(KEY_PLANNER, JSON.stringify(data));
  } catch (e) {
    // storage full or unavailable — silently ignore, same behavior as the rest of the app
  }
}

export interface PlannerItemInput {
  subject: string;
  detail: string;
  grade: PlannerGrade;
  source?: string;
  sourceColor?: string;
  sourceType?: BookType;
  minutes?: number; // optional custom duration of this card
  start?: string; // optional pinned start time "HH:MM"
}

export function createPlannerItem(input: PlannerItemInput & { done?: boolean }): PlannerItem {
  return {
    id: uid(),
    subject: input.subject,
    detail: input.detail,
    grade: input.grade,
    source: input.source,
    done: !!input.done,
    ...(input.minutes ? { minutes: input.minutes } : {}),
    ...(input.start ? { start: input.start } : {})
  };
}

// Insert a card into a day. A card with a pinned start goes to the chronologically right place.
export function insertByPin(list: PlannerItem[], item: PlannerItem, key: string, data: PlannerData): PlannerItem[] {
  const pin = item.start ? timeToMin(item.start) : null;
  if (pin == null) return [...list, item];
  const plan = computeDayPlan(list, key, data.schedule, data.dayRests[key]);
  const idx = plan.slots.findIndex((sl) => sl.startMin > pin);
  return idx < 0 ? [...list, item] : [...list.slice(0, idx), item, ...list.slice(idx)];
}

export function sourceTypeLabel(t: BookType | undefined): string {
  return t === 'test' ? 'تستی' : t === 'descriptive' ? 'تشریحی' : '';
}

// What a card becomes in the daily report: its book type decides the activity tick.
//   test book        -> تست‌زنی
//   descriptive book -> مطالعه
//   no book / unknown -> مطالعه (as before)
export function blockKindFor(item: PlannerItem, sourceTypes: Record<string, BookType>): BookType | undefined {
  return item.source ? sourceTypes[item.source] : undefined;
}

// ---------- Jalali date/week helpers (weeks run Saturday -> Friday) ----------

export function todayGregorian(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function jalaliOfDate(d: Date): JalaliDate {
  return gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function dateKeyOf(d: Date): string {
  return formatJalaliDate(jalaliOfDate(d));
}

// Start (Saturday) of the Gregorian week containing d
export function startOfWeek(d: Date): Date {
  const diff = (d.getDay() + 1) % 7; // getDay(): 0=Sun..6=Sat -> distance back to Saturday
  const s = new Date(d);
  s.setDate(d.getDate() - diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

// First Gregorian day of the Jalali month containing d
export function anchorFromDate(d: Date): Date {
  const j = jalaliOfDate(d);
  const a = new Date(d);
  a.setDate(d.getDate() - (j.jd - 1));
  a.setHours(0, 0, 0, 0);
  return a;
}

export function monthLenFromAnchor(a: Date): number {
  const jm = jalaliOfDate(a).jm;
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const probe = addDays(a, 29);
  return jalaliOfDate(probe).jm === 1 ? 29 : 30;
}

export function dateFromJalali(j: JalaliDate): Date {
  const g = jalaliToGregorian(j.jy, j.jm, j.jd);
  const d = new Date(g.gy, g.gm - 1, g.gd);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------- Shared planner -> report-block mapping ----------
//
// نام درس (lesson)  <- item.subject   (e.g. "شیمی ۳")
// مبحث (subject)    <- always left blank; a book name must never land here
// شرح مطالعه (desc) <- item.detail, plus "کتاب: <name>" appended when the
//                      item has a source book, e.g. "استوکیومتری. کتاب: تست گاج"
export function plannerItemToBlockFields(item: PlannerItem): { lesson: string; subject: string; desc: string } {
  const parts: string[] = [];
  if (item.detail && item.detail.trim()) parts.push(item.detail.trim());
  if (item.source && item.source.trim()) parts.push(`کتاب: ${item.source.trim()}`);
  return {
    lesson: item.subject,
    subject: '',
    desc: parts.join('. ')
  };
}

// Extra info that travels with a card into the daily report:
// the timed slot (only when that day's timeline is on) and the book type.
export interface SendMeta {
  start?: string;
  end?: string;
  kind?: BookType;
}

export function reportMetaFor(data: PlannerData, dateKey: string, item: PlannerItem): SendMeta {
  const meta: SendMeta = { kind: blockKindFor(item, data.sourceTypes) };
  if (data.timeline[dateKey]) {
    const list = data.items[dateKey] || [];
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) {
      const slot = computeDayPlan(list, dateKey, data.schedule, data.dayRests[dateKey]).slots[i];
      meta.start = slot.start;
      meta.end = slot.end;
    }
  }
  return meta;
}

export function markPlannerItemSent(dateKey: string, itemId: string): void {
  const data = loadPlannerData();
  const list = (data.items[dateKey] || []).map((it) => (it.id === itemId ? { ...it, sentToReport: true } : it));
  data.items[dateKey] = list;
  savePlannerData(data);
}

// Fired when a planner card is changed from outside the planner screen (e.g. the live timer
// finishing). PlannerView listens to it and applies the same patch to its own in-memory state,
// so its debounced save can never overwrite the change.
export const PLAN_PATCH_EVENT = 'konkour:plan-item-patch';

export function patchPlannerItem(dateKey: string, itemId: string, patch: Partial<PlannerItem>): void {
  const data = loadPlannerData();
  data.items[dateKey] = (data.items[dateKey] || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it));
  savePlannerData(data);
  window.dispatchEvent(new CustomEvent(PLAN_PATCH_EVENT, { detail: { dateKey, itemId, patch } }));
}


// ---------- Interactive editing helpers (drag & drop, copy/paste, duplicate) ----------
// All of these are pure: they take PlannerData and return a new PlannerData.

export interface ItemRef {
  key: string; // jalali date key of the day the item lives in
  id: string;
}

// A brand-new card with the same details: new id, not done, not sent to report.
export function cloneItem(it: PlannerItem): PlannerItem {
  return {
    id: uid(),
    subject: it.subject,
    detail: it.detail,
    grade: it.grade,
    source: it.source,
    done: false,
    ...(it.minutes ? { minutes: it.minutes } : {}),
    ...(it.start ? { start: it.start } : {})
  };
}

export function dateFromKey(key: string): Date | null {
  const j = parseJalaliDate(key);
  return j ? dateFromJalali(j) : null;
}

export function shiftDateKey(key: string, days: number): string {
  const d = dateFromKey(key);
  return d ? dateKeyOf(addDays(d, days)) : key;
}

interface ResolvedRef {
  ref: ItemRef;
  item: PlannerItem;
  index: number;
}

// Look refs up in the data, drop stale ones, and sort them by day then position
export function resolveRefs(data: PlannerData, refs: ItemRef[]): ResolvedRef[] {
  const out: ResolvedRef[] = [];
  const seen = new Set<string>();
  refs.forEach((ref) => {
    const sig = ref.key + '|' + ref.id;
    if (seen.has(sig)) return;
    seen.add(sig);
    const list = data.items[ref.key] || [];
    const index = list.findIndex((x) => x.id === ref.id);
    if (index >= 0) out.push({ ref, item: list[index], index });
  });
  out.sort((a, b) => (a.ref.key === b.ref.key ? a.index - b.index : a.ref.key < b.ref.key ? -1 : 1));
  return out;
}

function sameOrder(a: PlannerItem[] | undefined, b: PlannerItem[] | undefined): boolean {
  const x = a || [];
  const y = b || [];
  if (x.length !== y.length) return false;
  return x.every((it, i) => it.id === y[i].id);
}

export interface EditResult {
  data: PlannerData;
  newRefs: ItemRef[];
  changed: boolean;
}

// Move (or copy) cards to a day. `index` = position in the target day's full list
// (null = end of the day). Copies get fresh ids.
export function moveOrCopyItems(
  data: PlannerData,
  refs: ItemRef[],
  toKey: string,
  index: number | null,
  copy: boolean
): EditResult {
  const resolved = resolveRefs(data, refs);
  if (!resolved.length) return { data, newRefs: [], changed: false };

  const items: Record<string, PlannerItem[]> = { ...data.items };
  const original = items[toKey] ? [...items[toKey]] : [];

  if (copy) {
    const clones = resolved.map((r) => cloneItem(r.item));
    const at = index == null ? original.length : Math.max(0, Math.min(index, original.length));
    items[toKey] = [...original.slice(0, at), ...clones, ...original.slice(at)];
    return {
      data: { ...data, items },
      newRefs: clones.map((c) => ({ key: toKey, id: c.id })),
      changed: true
    };
  }

  const movedIds = new Set(resolved.map((r) => r.ref.id));
  const sourceKeys = Array.from(new Set(resolved.map((r) => r.ref.key)));
  sourceKeys.forEach((k) => {
    items[k] = (items[k] || []).filter((x) => !movedIds.has(x.id));
  });

  const base = (items[toKey] || []).filter((x) => !movedIds.has(x.id));
  const at =
    index == null
      ? base.length
      : original.slice(0, Math.max(0, Math.min(index, original.length))).filter((x) => !movedIds.has(x.id)).length;

  const moved = resolved.map((r) =>
    // moving to another day: the "already in that day's report" flag no longer applies
    r.ref.key === toKey ? r.item : { ...r.item, sentToReport: undefined }
  );
  items[toKey] = [...base.slice(0, at), ...moved, ...base.slice(at)];

  const touched = Array.from(new Set([...sourceKeys, toKey]));
  const changed = touched.some((k) => !sameOrder(data.items[k], items[k])) ||
    resolved.some((r) => r.ref.key !== toKey);
  return {
    data: { ...data, items },
    newRefs: moved.map((m) => ({ key: toKey, id: m.id })),
    changed
  };
}

// Swap a card with its neighbour inside the same day (-1 = earlier, +1 = later)
export function reorderWithinDay(data: PlannerData, ref: ItemRef, dir: -1 | 1): EditResult {
  const list = [...(data.items[ref.key] || [])];
  const i = list.findIndex((x) => x.id === ref.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { data, newRefs: [], changed: false };
  [list[i], list[j]] = [list[j], list[i]];
  return { data: { ...data, items: { ...data.items, [ref.key]: list } }, newRefs: [ref], changed: true };
}

// Duplicate cards. dayOffset 0 = a copy right after each original in the same day;
// otherwise the copies are appended to the day shifted by dayOffset.
export function duplicateItems(data: PlannerData, refs: ItemRef[], dayOffset: number): EditResult {
  const resolved = resolveRefs(data, refs);
  if (!resolved.length) return { data, newRefs: [], changed: false };
  const items: Record<string, PlannerItem[]> = { ...data.items };
  const newRefs: ItemRef[] = [];

  if (dayOffset === 0) {
    const byKey: Record<string, Set<string>> = {};
    resolved.forEach((r) => {
      (byKey[r.ref.key] = byKey[r.ref.key] || new Set()).add(r.ref.id);
    });
    Object.keys(byKey).forEach((k) => {
      const next: PlannerItem[] = [];
      (items[k] || []).forEach((it) => {
        next.push(it);
        if (byKey[k].has(it.id)) {
          const c = cloneItem(it);
          next.push(c);
          newRefs.push({ key: k, id: c.id });
        }
      });
      items[k] = next;
    });
  } else {
    resolved.forEach((r) => {
      const target = shiftDateKey(r.ref.key, dayOffset);
      const c = cloneItem(r.item);
      items[target] = [...(items[target] || []), c];
      newRefs.push({ key: target, id: c.id });
    });
  }
  return { data: { ...data, items }, newRefs, changed: true };
}

// Move every card by a number of days (Alt+Up / Alt+Down, "next week", ...)
export function moveItemsByDays(data: PlannerData, refs: ItemRef[], dayOffset: number): EditResult {
  const resolved = resolveRefs(data, refs);
  if (!resolved.length || dayOffset === 0) return { data, newRefs: [], changed: false };
  let cur = data;
  const newRefs: ItemRef[] = [];
  resolved.forEach((r) => {
    const res = moveOrCopyItems(cur, [r.ref], shiftDateKey(r.ref.key, dayOffset), null, false);
    cur = res.data;
    newRefs.push(...res.newRefs);
  });
  return { data: cur, newRefs, changed: true };
}

// Insert brand-new cards (paste) into a day. Templates always get fresh ids.
export function insertItems(data: PlannerData, toKey: string, templates: PlannerItem[], index: number | null): EditResult {
  if (!templates.length) return { data, newRefs: [], changed: false };
  const original = data.items[toKey] ? [...data.items[toKey]] : [];
  const clones = templates.map(cloneItem);
  const at = index == null ? original.length : Math.max(0, Math.min(index, original.length));
  return {
    data: { ...data, items: { ...data.items, [toKey]: [...original.slice(0, at), ...clones, ...original.slice(at)] } },
    newRefs: clones.map((c) => ({ key: toKey, id: c.id })),
    changed: true
  };
}

export function removeItems(data: PlannerData, refs: ItemRef[]): EditResult {
  const resolved = resolveRefs(data, refs);
  if (!resolved.length) return { data, newRefs: [], changed: false };
  const items: Record<string, PlannerItem[]> = { ...data.items };
  const ids = new Set(resolved.map((r) => r.ref.id));
  Array.from(new Set(resolved.map((r) => r.ref.key))).forEach((k) => {
    items[k] = (items[k] || []).filter((x) => !ids.has(x.id));
  });
  return { data: { ...data, items }, newRefs: [], changed: true };
}

// If every card is done -> mark all not done, otherwise mark all done
export function toggleDoneItems(data: PlannerData, refs: ItemRef[]): EditResult {
  const resolved = resolveRefs(data, refs);
  if (!resolved.length) return { data, newRefs: [], changed: false };
  const target = !resolved.every((r) => r.item.done);
  const items: Record<string, PlannerItem[]> = { ...data.items };
  const ids = new Set(resolved.map((r) => r.ref.id));
  Array.from(new Set(resolved.map((r) => r.ref.key))).forEach((k) => {
    items[k] = (items[k] || []).map((x) => (ids.has(x.id) ? { ...x, done: target } : x));
  });
  return { data: { ...data, items }, newRefs: resolved.map((r) => r.ref), changed: true };
}

// ---------- Clipboard text format (so cards can be pasted across tabs/devices) ----------
const CLIP_MARK = 'konkourPlannerItems';

export function serializeItems(items: PlannerItem[]): string {
  return JSON.stringify({
    [CLIP_MARK]: 1,
    items: items.map((it) => ({ subject: it.subject, detail: it.detail, grade: it.grade, source: it.source, minutes: it.minutes, start: it.start }))
  });
}

export function parseClipboardItems(text: string): PlannerItem[] | null {
  if (!text || text.indexOf(CLIP_MARK) < 0) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || parsed[CLIP_MARK] !== 1 || !Array.isArray(parsed.items)) return null;
    const grades = PLANNER_GRADES.map((g) => g.id as string);
    const out: PlannerItem[] = [];
    parsed.items.forEach((x: any) => {
      if (!x || typeof x.subject !== 'string' || !x.subject) return;
      out.push({
        id: uid(),
        subject: x.subject,
        detail: typeof x.detail === 'string' ? x.detail : '',
        grade: (grades.indexOf(x.grade) >= 0 ? x.grade : 'دوازدهم') as PlannerGrade,
        source: typeof x.source === 'string' && x.source ? x.source : undefined,
        done: false,
        ...(typeof x.minutes === 'number' && x.minutes > 0 ? { minutes: Math.round(x.minutes) } : {}),
        ...(typeof x.start === 'string' && timeToMin(x.start) != null ? { start: x.start } : {})
      });
    });
    return out.length ? out : null;
  } catch (e) {
    return null;
  }
}
