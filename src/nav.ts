/**
 * The map of the app: five SPACES, each holding one or a few SECTIONS (the screens that already existed).
 *   امروز   → today
 *   برنامه  → planner · exam schedule
 *   مطالعه  → topic tracker · answer sheets & checking · question bank · question vault (گنجینه سؤال)
 *   تحلیل   → day report · exams
 *   تنظیمات → the settings hub
 */
export type Section = 'today' | 'planner' | 'tracker' | 'schedule' | 'exams' | 'checker' | 'bank' | 'vault' | 'report' | 'settings';
export type SpaceId = 'today' | 'plan' | 'study' | 'insight' | 'settings';

export interface SpaceDef {
  id: SpaceId;
  label: string;
  sections: Array<{ id: Section; label: string; hint: string }>;
}

export const SPACES: SpaceDef[] = [
  { id: 'today', label: 'امروز', sections: [{ id: 'today', label: 'امروز', hint: 'کارهای همین الان' }] },
  { id: 'plan', label: 'برنامه', sections: [
    { id: 'planner', label: 'برنامه‌ریز', hint: 'هفته، ماه و چیدن پارت‌ها' },
    { id: 'schedule', label: 'برنامه آزمون', hint: 'آزمون‌های پیش رو' }
  ] },
  { id: 'study', label: 'مطالعه', sections: [
    { id: 'tracker', label: 'پیگیری مباحث', hint: 'دورها و چک‌لیست مباحث' },
    { id: 'checker', label: 'پاسخ‌برگ و تصحیح', hint: 'کلیدها، پاسخ‌برگ‌ها، اسکن' },
    { id: 'bank', label: 'بانک تست', hint: 'سؤال‌های ذخیره‌شده' },
    { id: 'vault', label: 'گنجینه سؤال', hint: 'سؤال‌های غلط و مرور فاصله‌دار' }
  ] },
  { id: 'insight', label: 'تحلیل', sections: [
    { id: 'report', label: 'گزارش روز', hint: 'ساعت مطالعه و گزارش‌ها' },
    { id: 'exams', label: 'آزمون‌ها', hint: 'نتایج و تراز' }
  ] },
  { id: 'settings', label: 'تنظیمات', sections: [{ id: 'settings', label: 'تنظیمات', hint: 'همه‌ی تنظیمات یک‌جا' }] }
];

export const spaceOf = (s: string): SpaceDef => SPACES.find((sp) => sp.sections.some((x) => x.id === s)) || SPACES[0];

const KEY = 'planex_nav_last_v1';
const readLast = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };

/** remember which section of a space was open last (the space button returns there) */
export function rememberSection(section: string): void {
  const sp = spaceOf(section);
  if (sp.sections.length < 2) return;
  const m = readLast(); m[sp.id] = section;
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ }
}
export function entryOf(space: SpaceDef): Section {
  const last = readLast()[space.id];
  const hit = space.sections.find((x) => x.id === last);
  return (hit || space.sections[0]).id;
}

/** other screens ask to switch with window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: 'settings' })) */
export const GOTO_EVENT = 'planex:goto';
export const goto = (s: Section): void => { window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: s })); };
export const OPEN_MORE_EVENT = 'planex:open-more';
