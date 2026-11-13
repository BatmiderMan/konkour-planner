import React from 'react';
import { BookType, PlannerData, PlannerGrade, PlannerItem, RestBlock } from './types';
import { PlannerItemInput, addDays, createPlannerItem, dateKeyOf, insertByPin } from './plannerStore';
import { newRestId } from './plannerSchedule';

/**
 * Week presets («قالب هفته»): a whole week of planner cards saved under a name, editable, and loadable onto any week.
 * Day index 0 = Saturday … 6 = Friday, the same as the planner's week. Stored under its own key, so it syncs with the account like everything else.
 */
export const KEY_PRESETS = 'konkour_week_presets_v1';

export interface PresetItem {
  subject: string;
  detail: string;
  grade: PlannerGrade;
  source?: string;
  minutes?: number;
  start?: string;
}
export interface WeekPreset {
  id: string;
  name: string;
  color: string;
  note?: string;
  days: PresetItem[][];      // 7 lists
  rests: RestBlock[][];      // 7 lists (lunch, prayer … of that weekday)
  timeline: boolean[];       // 7 flags: show the clock timeline of that weekday
  created: number;
  updated: number;
}

export const PRESET_COLORS = ['#6f9bd1', '#a68bd9', '#d9a15b', '#5fb59a', '#e07a8f', '#7fb069', '#d98b5f', '#8a94a6'];
export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

const pid = () => 'wp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const grades: PlannerGrade[] = ['دهم', 'یازدهم', 'دوازدهم'];

const cleanItem = (x: any): PresetItem | null => {
  if (!x || typeof x.subject !== 'string' || !x.subject) return null;
  const minutes = Number(x.minutes);
  return {
    subject: x.subject,
    detail: typeof x.detail === 'string' ? x.detail : '',
    grade: grades.includes(x.grade) ? x.grade : 'دوازدهم',
    ...(typeof x.source === 'string' && x.source ? { source: x.source } : {}),
    ...(minutes > 0 ? { minutes: Math.round(minutes) } : {}),
    ...(typeof x.start === 'string' && /^\d{1,2}:\d{2}$/.test(x.start) ? { start: x.start } : {})
  };
};

export function normalizePreset(p: any): WeekPreset | null {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string') return null;
  const days: PresetItem[][] = Array.from({ length: 7 }, (_, i) => (Array.isArray(p.days?.[i]) ? p.days[i] : []).map(cleanItem).filter(Boolean) as PresetItem[]);
  const rests: RestBlock[][] = Array.from({ length: 7 }, (_, i) =>
    (Array.isArray(p.rests?.[i]) ? p.rests[i] : [])
      .filter((r: any) => r && typeof r.start === 'string' && typeof r.end === 'string')
      .map((r: any) => ({ id: String(r.id || newRestId()), label: String(r.label || 'استراحت'), icon: String(r.icon || '☕'), start: r.start, end: r.end }))
  );
  return {
    id: p.id,
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'قالب بدون نام',
    color: typeof p.color === 'string' ? p.color : PRESET_COLORS[0],
    ...(typeof p.note === 'string' && p.note ? { note: p.note } : {}),
    days, rests,
    timeline: Array.from({ length: 7 }, (_, i) => !!p.timeline?.[i]),
    created: Number(p.created) || Date.now(),
    updated: Number(p.updated) || Date.now()
  };
}

// ---------------------------------------------------------------- storage (tiny store, follows other tabs / devices)
let cache: WeekPreset[] | null = null;
const subs = new Set<() => void>();

function read(): WeekPreset[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY_PRESETS) || '[]');
    return (Array.isArray(arr) ? arr : []).map(normalizePreset).filter(Boolean) as WeekPreset[];
  } catch { return []; }
}
export const loadPresets = (): WeekPreset[] => (cache = cache || read());
export function savePresets(list: WeekPreset[]): void {
  cache = list;
  try { localStorage.setItem(KEY_PRESETS, JSON.stringify(list)); } catch { /* storage full */ }
  subs.forEach((f) => f());
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY_PRESETS || e.key === null) { cache = null; subs.forEach((f) => f()); } });
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useWeekPresets = (): WeekPreset[] => React.useSyncExternalStore(subscribe, loadPresets);

export function upsertPreset(p: WeekPreset): void {
  const list = loadPresets();
  const next = { ...p, updated: Date.now() };
  savePresets(list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? next : x)) : [next, ...list]);
}
export const deletePreset = (id: string): void => savePresets(loadPresets().filter((x) => x.id !== id));
export function duplicatePreset(id: string): WeekPreset | null {
  const p = loadPresets().find((x) => x.id === id);
  if (!p) return null;
  const c: WeekPreset = { ...JSON.parse(JSON.stringify(p)), id: pid(), name: p.name + ' (کپی)', created: Date.now(), updated: Date.now() };
  savePresets([c, ...loadPresets()]);
  return c;
}
export const emptyPreset = (name = 'قالب جدید', color = PRESET_COLORS[0]): WeekPreset => ({
  id: pid(), name, color, days: Array.from({ length: 7 }, () => []), rests: Array.from({ length: 7 }, () => []),
  timeline: Array(7).fill(false), created: Date.now(), updated: Date.now()
});

// ---------------------------------------------------------------- week ⇄ preset
const toPresetItem = (it: PlannerItem): PresetItem => ({
  subject: it.subject, detail: it.detail, grade: it.grade,
  ...(it.source ? { source: it.source } : {}),
  ...(it.minutes ? { minutes: it.minutes } : {}),
  ...(it.start ? { start: it.start } : {})
});

/** copy the 7 days starting at `weekStart` (a Saturday) into a new preset (cards are copied without their done / report / tracker marks) */
export function captureWeek(data: PlannerData, weekStart: Date, name: string, color: string, withTime = true): WeekPreset {
  const p = emptyPreset(name, color);
  for (let i = 0; i < 7; i++) {
    const key = dateKeyOf(addDays(weekStart, i));
    p.days[i] = (data.items[key] || []).map(toPresetItem);
    if (withTime) {
      p.rests[i] = (data.dayRests[key] || []).map((r) => ({ ...r }));
      p.timeline[i] = !!data.timeline[key];
    }
  }
  return p;
}

export const presetCount = (p: WeekPreset): number => p.days.reduce((n, d) => n + d.length, 0);
export const presetMinutes = (p: WeekPreset, partMinutes: number): number => p.days.reduce((n, d) => n + d.reduce((m, it) => m + (it.minutes || partMinutes), 0), 0);

export type ApplyMode = 'append' | 'empty' | 'replace';
export interface ApplyOpts { mode: ApplyMode; withTime: boolean; weeks: number }
export interface ApplyResult { data: PlannerData; added: number; removed: number; weeks: number; firstWeek: Date }

/** how many cards a load would add / remove — shown before the person confirms */
export function previewApply(data: PlannerData, p: WeekPreset, weekStart: Date, o: ApplyOpts): { add: number; remove: number } {
  let add = 0, remove = 0;
  for (let w = 0; w < o.weeks; w++) {
    for (let i = 0; i < 7; i++) {
      const key = dateKeyOf(addDays(weekStart, w * 7 + i));
      const have = (data.items[key] || []).length;
      if (o.mode === 'empty' && have) continue;
      add += p.days[i].length;
      if (o.mode === 'replace') remove += have;
    }
  }
  return { add, remove };
}

/** put the preset on `o.weeks` weeks in a row, starting at `weekStart`. Pure: returns the new planner data (so the planner's undo works). */
export function applyPreset(data: PlannerData, p: WeekPreset, weekStart: Date, o: ApplyOpts): ApplyResult {
  const next: PlannerData = { ...data, items: { ...data.items }, timeline: { ...data.timeline }, dayRests: { ...data.dayRests } };
  let added = 0, removed = 0;
  for (let w = 0; w < o.weeks; w++) {
    for (let i = 0; i < 7; i++) {
      const key = dateKeyOf(addDays(weekStart, w * 7 + i));
      const have = next.items[key] || [];
      if (o.mode === 'empty' && have.length) continue;
      let list: PlannerItem[] = o.mode === 'replace' ? [] : [...have];
      if (o.mode === 'replace') removed += have.length;
      p.days[i].forEach((t) => {
        const input: PlannerItemInput = { subject: t.subject, detail: t.detail, grade: t.grade, source: t.source, minutes: t.minutes, start: t.start };
        list = insertByPin(list, createPlannerItem(input), key, next);
        added++;
        if (t.start) next.timeline[key] = true;
      });
      if (list.length) next.items[key] = list; else delete next.items[key];
      if (o.withTime) {
        const rs = p.rests[i].map((r) => ({ ...r, id: newRestId() }));
        const keep = o.mode === 'append' ? (next.dayRests[key] || []).filter((x) => !rs.some((r) => r.start === x.start && r.end === x.end && r.label === x.label)) : [];
        const all = [...keep, ...rs];
        if (all.length) next.dayRests[key] = all; else delete next.dayRests[key];
        if (p.timeline[i]) next.timeline[key] = true;
        else if (o.mode !== 'append' && !p.days[i].some((t) => t.start)) delete next.timeline[key];
      }
    }
  }
  return { data: next, added, removed, weeks: o.weeks, firstWeek: weekStart };
}

export type { BookType };
