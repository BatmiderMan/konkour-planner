// Exam schedule («برنامه آزمون‌ها / بودجه‌بندی»): what every exam covers, what you have already studied,
// and the bridge to the planner (study cards) and to the exams page (upcoming exam).
import { SCHEDULE, SCHEDULE_NOTES } from './data';
import type { Inst, SExam, SLesson } from './types';
import { dateFromKey, loadPlannerData, savePlannerData, createPlannerItem, insertByPin, dateKeyOf, addDays, todayGregorian } from '../plannerStore';
import { daysUntil, loadExams, loadSettings, saveExams, Exam, ExamSettings, isDone } from '../examStore';
import { PERSIAN_WEEK_DAYS } from '../jalali';
import type { PlannerGrade, PlannerItem } from '../types';

export { SCHEDULE, SCHEDULE_NOTES };
export const INST_META: Record<Inst, { label: string; color: string }> = {
  maz: { label: 'ماز', color: '#1f9d6b' },
  qalamchi: { label: 'قلم‌چی', color: '#e8741d' }
};
export const INSTS: Inst[] = ['maz', 'qalamchi'];

// ---------------------------------------------------------------- user state
export interface ScheduleState {
  follow: Record<Inst, boolean>; // which institutes' exams you actually take
  done: Record<string, boolean>; // «خوانده‌ام» per lesson row
  variant: Record<string, number>; // chosen variant for exams that offer a choice
  planned: Record<string, number>; // exam id → when its study cards were last sent to the planner
}
const KEY = 'konkour_schedule_v1';
export const defaultScheduleState = (): ScheduleState => ({ follow: { maz: true, qalamchi: true }, done: {}, variant: {}, planned: {} });
export function loadScheduleState(): ScheduleState {
  const d = defaultScheduleState();
  try {
    const r = localStorage.getItem(KEY);
    if (r) { const o = JSON.parse(r); return { follow: { ...d.follow, ...(o.follow || {}) }, done: o.done || {}, variant: o.variant || {}, planned: o.planned || {} }; }
  } catch (e) { /* ignore */ }
  return d;
}
export function saveScheduleState(s: ScheduleState): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------- basic helpers
import { PERSIAN_MONTH_NAMES } from '../jalali';
export function dayMonth(dateKey: string): { d: number; m: number; y: number; label: string } {
  const [y, m, d] = dateKey.split('/').map((x) => parseInt(x, 10));
  return { d, m, y, label: `${d} ${PERSIAN_MONTH_NAMES[m - 1]}` };
}
export const displayTitle = (e: SExam): string => (e.inst === 'qalamchi' ? `آزمون قلم‌چی ${dayMonth(e.date).label}` : e.title);
export const examLessons = (e: SExam, vi = 0): SLesson[] => (e.variants && e.variants.length ? (e.variants[vi] || e.variants[0]).lessons : e.lessons);
export const lessonKey = (e: SExam, vi: number, i: number) => `${e.id}:${vi}:${i}`;
export const variantOf = (s: ScheduleState, e: SExam) => (e.variants && e.variants.length ? Math.min(s.variant[e.id] || 0, e.variants.length - 1) : 0);
export const daysTo = (e: SExam): number => daysUntil(e.date) ?? 9999;

export function weekdayOf(dateKey: string): string {
  const d = dateFromKey(dateKey);
  return d ? PERSIAN_WEEK_DAYS[(d.getDay() + 1) % 7] : '';
}
export function pagesLabel(l: SLesson): string {
  if (l.pages) return `ص ${l.pages[0]} تا ${l.pages[1]}`;
  return l.pagesText ? l.pagesText.replace(/^صفحه.?های\s*/, 'ص ') : '';
}
const GRADE_OF: Record<string, PlannerGrade> = {
  'ریاضی ۱': 'دهم', 'هندسه ۱': 'دهم', 'فیزیک ۱': 'دهم', 'شیمی ۱': 'دهم',
  'حسابان ۱': 'یازدهم', 'هندسه ۲': 'یازدهم', 'آمار و احتمال': 'یازدهم', 'فیزیک ۲': 'یازدهم', 'شیمی ۲': 'یازدهم'
};
export const gradeOfLesson = (name: string): PlannerGrade => GRADE_OF[name] || 'دوازدهم';

export function visibleExams(s: ScheduleState): SExam[] {
  return SCHEDULE.filter((e) => s.follow[e.inst]).sort((a, b) => a.date.localeCompare(b.date) || a.inst.localeCompare(b.inst));
}
export function nextExams(s: ScheduleState, within = 9999): SExam[] {
  return visibleExams(s).filter((e) => { const d = daysTo(e); return d >= 0 && d <= within; });
}
/** exams that fall on the same day for different institutes (you probably cannot sit both) */
export function clashesOf(e: SExam, s: ScheduleState): SExam[] {
  return visibleExams(s).filter((x) => x.date === e.date && x.inst !== e.inst);
}

export function readiness(e: SExam, s: ScheduleState): { done: number; total: number; pct: number } {
  const vi = variantOf(s, e);
  const ls = examLessons(e, vi);
  const done = ls.filter((_, i) => s.done[lessonKey(e, vi, i)]).length;
  return { done, total: ls.length, pct: ls.length ? Math.round((done / ls.length) * 100) : 0 };
}

// ---------------------------------------------------------------- «بودجه‌بندی» by lesson
export interface TimelineEntry { exam: SExam; item: SLesson; vi: number; i: number }
export function lessonNames(): string[] {
  const set = new Set<string>();
  SCHEDULE.forEach((e) => (e.variants?.length ? e.variants.flatMap((v) => v.lessons) : e.lessons).forEach((l) => { if (!l.fast) set.add(l.lesson); }));
  const order = ['حسابان ۱', 'حسابان ۲', 'ریاضی ۱', 'هندسه ۱', 'هندسه ۲', 'هندسه ۳', 'گسسته', 'آمار و احتمال', 'فیزیک ۱', 'فیزیک ۲', 'فیزیک ۳', 'شیمی ۱', 'شیمی ۲', 'شیمی ۳'];
  return [...set].sort((a, b) => (order.indexOf(a) + 100) % 100 - (order.indexOf(b) + 100) % 100 || a.localeCompare(b));
}
export function lessonTimeline(lesson: string, s: ScheduleState): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  visibleExams(s).forEach((exam) => {
    const variants = exam.variants?.length ? exam.variants.map((v) => v.lessons) : [exam.lessons];
    variants.forEach((ls, vi) => ls.forEach((item, i) => { if (item.lesson === lesson && !item.fast) out.push({ exam, item, vi, i }); }));
  });
  return out;
}

// ---------------------------------------------------------------- study plan → planner cards
export interface PlanOpts {
  fromKey: string; // first day (Jalali key)
  perDay: number; // max cards per day
  onlyUndone: boolean;
  withReview: boolean; // a final «مرور کلی» card on the last day
  picked?: number[]; // lesson indexes; default all
}
export interface PlanCard { dateKey: string; item: PlannerItem }
const PRIORITY = (l: SLesson) => (l.tag === 'optional' ? 2 : l.tag === 'full' ? 1 : 0);

export function dayKeysBetween(fromKey: string, exam: SExam): string[] {
  const from = dateFromKey(fromKey);
  const to = dateFromKey(exam.date);
  if (!from || !to) return [];
  const out: string[] = [];
  const last = addDays(to, -1); // the day before the exam is the last study day
  for (let d = new Date(from); d <= last; d = addDays(d, 1)) out.push(dateKeyOf(d));
  if (!out.length && daysTo(exam) >= 0) out.push(dateKeyOf(from)); // exam is today/tomorrow: still give one day
  return out;
}

export function buildStudyPlan(e: SExam, s: ScheduleState, o: PlanOpts): PlanCard[] {
  const vi = variantOf(s, e);
  const all = examLessons(e, vi).map((l, i) => ({ l, i }));
  const rows = all
    .filter(({ l, i }) => (o.picked ? o.picked.includes(i) : true) && (!o.onlyUndone || !s.done[lessonKey(e, vi, i)]) && !!(l.topic || l.pages || l.pagesText))
    .sort((a, b) => PRIORITY(a.l) - PRIORITY(b.l) || a.i - b.i);
  const days = dayKeysBetween(o.fromKey, e);
  if (!rows.length || !days.length) return [];
  const tag = `${displayTitle(e).replace(/^آزمون /, '')}`;
  const cards: PlanCard[] = [];
  // use as few days as `perDay` allows (earlier is better), then spread the cards evenly over them
  const used = Math.max(1, Math.min(days.length, Math.ceil(rows.length / Math.max(1, o.perDay))));
  rows.forEach(({ l }, idx) => {
    const di = Math.min(used - 1, Math.floor((idx * used) / rows.length));
    const pg = pagesLabel(l);
    const detail = [l.tag === 'full' ? 'کل کتاب' : l.topic, pg].filter(Boolean).join(' — ') + ` · برای ${tag}`;
    cards.push({ dateKey: days[di], item: createPlannerItem({ subject: l.lesson, detail, grade: gradeOfLesson(l.lesson) }) });
  });
  if (o.withReview && days.length >= 2) {
    const last = days[days.length - 1];
    cards.push({ dateKey: last, item: createPlannerItem({ subject: 'سایر', detail: `مرور سریع همه‌ی مباحث ${e.title} + مرور اشتباه‌های آزمون‌های قبلی`, grade: 'دوازدهم' }) });
  }
  return cards;
}

/** write the cards into the planner storage (subjects that do not exist yet are added) */
export function applyStudyPlan(cards: PlanCard[]): number {
  if (!cards.length) return 0;
  const data = loadPlannerData();
  cards.forEach(({ dateKey, item }) => {
    if (!data.subjects.some((x) => x.n === item.subject)) data.subjects.push({ n: item.subject, grades: [item.grade] });
    data.items[dateKey] = insertByPin(data.items[dateKey] || [], item, dateKey, data);
  });
  savePlannerData(data);
  return cards.length;
}

// ---------------------------------------------------------------- bridge to the exams page
export const presetOf = (i: Inst) => INST_META[i].label;
export const findMyExam = (e: SExam, list: Exam[] = loadExams()) => list.find((x) => x.preset === presetOf(e.inst) && x.date === e.date);
export function addToMyExams(e: SExam, cfg: ExamSettings = loadSettings()): 'added' | 'exists' {
  const list = loadExams();
  if (findMyExam(e, list)) return 'exists';
  const ex: Exam = {
    id: 'ex_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: displayTitle(e), kind: 'real', preset: presetOf(e.inst), date: e.date,
    sections: JSON.parse(JSON.stringify(cfg.sections)), detail: [], negative: cfg.negative,
    notes: e.phase ? `از برنامه‌ی ${presetOf(e.inst)}: ${e.phase}` : `از برنامه‌ی ${presetOf(e.inst)}`
  };
  saveExams([...list, ex]);
  return 'added';
}
export const myExamState = (e: SExam): 'none' | 'upcoming' | 'done' => {
  const m = findMyExam(e);
  return !m ? 'none' : isDone(m) ? 'done' : 'upcoming';
};

// ---------------------------------------------------------------- «what's next» summary used by the Today page
export function todayBrief(s: ScheduleState): { exam: SExam; days: number; ready: ReturnType<typeof readiness>; topics: string[] } | null {
  const e = nextExams(s)[0];
  if (!e) return null;
  const vi = variantOf(s, e);
  const topics = examLessons(e, vi).filter((l) => l.topic && l.tag !== 'full').slice(0, 4).map((l) => `${l.lesson}: ${l.topic.split('+')[0].trim()}`);
  return { exam: e, days: daysTo(e), ready: readiness(e, s), topics };
}
export const todayKeyNow = () => dateKeyOf(todayGregorian());
