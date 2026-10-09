import { dateFromKey, dateKeyOf, todayGregorian } from './plannerStore';

export type ExamKind = 'real' | 'practice';
export type Field = 'riazi' | 'tajrobi' | 'ensani';
export interface Counts { n: number; c: number; w: number } // total, correct, wrong
// a part is either a leaf (has questions) or a group (children: e.g. هندسه → هندسه ۱، ۲، ۳)
export interface Part { id: string; name: string; n: number; children?: Part[] }
// a section = what a konkur test really reports (ریاضی, فیزیک ...). Parts are optional drill-down (حسابان, هندسه ...)
export interface Section { id: string; name: string; color: string; n: number; parts: Part[] }
export interface ExamSource { id: string; name: string } // an institute: قلم‌چی، ماز ...
export interface ExamSettings {
  field: Field;
  sections: Section[];
  sources: ExamSource[];
  negative: boolean;
  konkurDate?: string;
}
export interface Exam {
  id: string; title: string; kind: ExamKind; preset: string; date: string; time?: string;
  sections: Section[]; // snapshot taken when the exam was made, so later settings changes never break old exams
  detail: string[]; // section ids entered part by part
  negative: boolean;
  results?: Record<string, Counts>; // key = section id (total mode) or part id (detail mode)
  rank?: string; level?: string; notes?: string;
}

const KEY = 'konkour_exams_v2';
const OLD_KEY = 'konkour_exams_v1';
const SKEY = 'konkour_exam_settings_v2';
const OLD_SKEY = 'konkour_exam_settings_v1';

const uid = (p: string) => p + Math.random().toString(36).slice(2, 8);
const part = (name: string): Part => ({ id: uid('p_'), name, n: 0 });
const grp = (name: string, kids: string[]): Part => ({ ...part(name), children: kids.map(part) });
const sec = (name: string, color: string, n: number, parts: (string | Part)[] = []): Section => ({ id: uid('s_'), name, color, n, parts: parts.map((x) => (typeof x === 'string' ? part(x) : x)) });
export const newSection = (name: string): Section => sec(name, '#8a6fe8', 25);
export const newPart = part;
export const newSource = (name: string): ExamSource => ({ id: uid('src_'), name });

export const FIELD_LABEL: Record<Field, string> = { riazi: 'ریاضی و فیزیک', tajrobi: 'علوم تجربی', ensani: 'علوم انسانی' };
export const makeFieldSections = (f: Field): Section[] => f === 'riazi'
  ? [sec('ریاضی', '#2447d8', 55, [grp('حسابان', ['حسابان ۱', 'حسابان ۲']), grp('هندسه', ['هندسه ۱', 'هندسه ۲', 'هندسه ۳']), 'گسسته', 'آمار و احتمال']), sec('فیزیک', '#0fb5a4', 35, ['فیزیک ۱', 'فیزیک ۲', 'فیزیک ۳']), sec('شیمی', '#f5a524', 25, ['شیمی ۱', 'شیمی ۲', 'شیمی ۳'])]
  : f === 'tajrobi'
    ? [sec('زیست‌شناسی', '#4caf7d', 55, ['زیست ۱۰', 'زیست ۱۱', 'زیست ۱۲']), sec('ریاضی', '#2447d8', 25), sec('فیزیک', '#0fb5a4', 30, ['فیزیک ۱', 'فیزیک ۲', 'فیزیک ۳']), sec('شیمی', '#f5a524', 30, ['شیمی ۱', 'شیمی ۲', 'شیمی ۳'])]
    : [sec('ادبیات اختصاصی', '#d9534f', 25), sec('عربی اختصاصی', '#0fb5a4', 25), sec('ریاضی و آمار', '#2447d8', 25), sec('اقتصاد', '#f5a524', 25), sec('علوم اجتماعی', '#8a6fe8', 25), sec('تاریخ و جغرافیا', '#4caf7d', 25)];
export const GENERAL_SUGGEST = ['ادبیات فارسی', 'عربی', 'دین و زندگی', 'زبان انگلیسی'];

export const defaultSettings = (): ExamSettings => ({
  field: 'riazi', sections: makeFieldSections('riazi'), negative: true,
  sources: ['ماز', 'قلم‌چی', 'گاج', 'خیلی سبز', 'مدارس برتر'].map(newSource)
});

// turn flat «هندسه» / «حسابان» parts (older saved settings) into groups
const upgrade = (parts: Part[]): Part[] => parts.map((p) => {
  if (p.children) return p;
  if (p.name === 'هندسه') return { ...p, children: ['هندسه ۱', 'هندسه ۲', 'هندسه ۳'].map(part) };
  if (p.name === 'حسابان') return { ...p, children: ['حسابان ۱', 'حسابان ۲'].map(part) };
  return p;
});
export function loadSettings(): ExamSettings {
  const d = defaultSettings();
  try { const r = localStorage.getItem(SKEY); if (r) return { ...d, ...JSON.parse(r) }; } catch (e) { /* ignore */ }
  try {
    const r = localStorage.getItem(OLD_SKEY);
    if (r) { const o = JSON.parse(r); return { ...d, field: o.field || d.field, negative: o.negative ?? d.negative, konkurDate: o.konkurDate, sections: (o.sections || d.sections).map((x: Section) => ({ ...x, parts: upgrade(x.parts || []) })) }; }
  } catch (e) { /* ignore */ }
  return d;
}
export function saveSettings(s: ExamSettings): void { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

export function loadExams(): Exam[] {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) as Exam[]; } catch (e) { /* ignore */ }
  // migrate v1 exams (flat subject names) into one section per old subject
  try {
    const r = localStorage.getItem(OLD_KEY);
    if (r) {
      const old = JSON.parse(r) as any[];
      return old.map((o) => {
        const sections: Section[] = (o.subjects || []).map((n: string) => ({ id: 'old_' + n, name: n, color: '#5b7bd9', n: o.results?.[n]?.n || 0, parts: [] }));
        return { id: o.id, title: o.title, kind: o.kind, preset: o.preset, date: o.date, time: o.time, sections, detail: [], negative: o.negative, results: Object.fromEntries(Object.entries(o.results || {}).map(([k, v]) => ['old_' + k, v])), rank: o.rank, level: o.level, notes: o.notes } as Exam;
      });
    }
  } catch (e) { /* ignore */ }
  return [];
}
export function saveExams(list: Exam[]): void { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } }

export const ZERO: Counts = { n: 0, c: 0, w: 0 };
export const addC = (a: Counts, b: Counts): Counts => ({ n: a.n + b.n, c: a.c + b.c, w: a.w + b.w });
export const isDetail = (e: Exam, s: Section) => s.parts.length > 0 && e.detail.includes(s.id);
export const leaves = (p: Part): Part[] => (p.children?.length ? p.children.flatMap(leaves) : [p]);
export const partCounts = (e: Exam, p: Part): Counts => leaves(p).reduce((a, l) => addC(a, { ...(e.results?.[l.id] || ZERO), n: l.n }), ZERO);
export const mapParts = (parts: Part[], id: string, fn: (p: Part) => Part): Part[] =>
  parts.map((p) => (p.id === id ? fn(p) : p.children ? { ...p, children: mapParts(p.children, id, fn) } : p));
export const sectionCounts = (e: Exam, s: Section): Counts =>
  isDetail(e, s) ? s.parts.reduce((a, p) => addC(a, partCounts(e, p)), ZERO) : { ...(e.results?.[s.id] || ZERO), n: s.n };

export function percentOf(r: Counts, negative: boolean): number {
  if (!r.n) return 0;
  const raw = negative ? (r.c * 3 - r.w) / (r.n * 3) : r.c / r.n;
  return Math.round(raw * 1000) / 10;
}
export const hasData = (r: Counts) => r.n > 0 && r.c + r.w > 0;
export function examPercent(e: Exam): number | null {
  const tot = e.sections.reduce((a, s) => { const r = sectionCounts(e, s); return hasData(r) ? addC(a, r) : a; }, ZERO);
  return tot.n ? percentOf(tot, e.negative) : null;
}
export const isDone = (e: Exam) => examPercent(e) !== null;

export function daysUntil(dateKey: string): number | null {
  const d = dateFromKey(dateKey);
  if (!d) return null;
  const t = todayGregorian();
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000);
}
export const todayKey = () => dateKeyOf(todayGregorian());

// planner subject that best matches an exam section/part name (e.g. «حسابان» → «حسابان ۲»)
const strip = (s: string) => s.replace(/[\s‌]*[۰-۹0-9]+$/, '').trim();
export function plannerSubjectFor(name: string, planner: string[]): string {
  const b = strip(name);
  const hit = planner.filter((p) => p.startsWith(b) || b.startsWith(strip(p)));
  return hit[hit.length - 1] || 'سایر';
}
