import React from 'react';
import { CURRICULUM, TrackBook } from './tracker/curriculumData';
import { BookType } from './types';

/**
 * Topic tracker (پیگیری مباحث): every book of the track is a tree book > chapter > section > item.
 * The smallest tickable thing is a "unit" (an item, or a section that has no items).
 * Each unit can be ticked once per ROUND (دور / مرحله) - e.g. a learning round, a test round, a review round.
 */

/** the book / source a round is studied from, per scope: a book name (حسابان ۲), a lesson (ریاضی) or '*' for everything */
export type RoundSources = Record<string, { s: string; t?: BookType }>;

export interface TRound {
  id: string;
  name: string;
  color: string;
  /** which source (کتاب / منبع) this round uses - cards made for the round get it automatically */
  src?: RoundSources;
  /** target date (jalali key) the round should be finished by */
  due?: string;
}

export interface TrackerState {
  rounds: TRound[];
  /** unit id -> round id -> timestamp of the tick */
  done: Record<string, Record<string, number>>;
  flags: Record<string, 1>;
  notes: Record<string, string>;
  /** last unit that was ticked ("continue from here") */
  last?: string;
  /** the round the dashboard suggestions and the "next up" list work for */
  focus?: string;
}

export interface Unit { u: string; t: string; bi: number; ci: number; si: number; self: boolean }

export const ROUND_COLORS = ['#3d7fd1', '#15a38f', '#8dba2f', '#f0a21b', '#d9483b', '#8a6cf0', '#e86aa6', '#2fb7d6'];

export const DEFAULT_ROUNDS: TRound[] = [
  { id: 'r0', name: 'دور ۱ · آموزش', color: ROUND_COLORS[0] },
  { id: 'r1', name: 'دور ۲ · تست', color: ROUND_COLORS[1] },
  { id: 'r2', name: 'دور ۳ · مرور', color: ROUND_COLORS[2] },
  { id: 'r3', name: 'دور ۴ · جمع‌بندی', color: ROUND_COLORS[3] },
  { id: 'r4', name: 'تست زمان‌دار', color: ROUND_COLORS[4] }
];

// ---------------------------------------------------------------- the unit index (built once)
export const BOOKS: TrackBook[] = CURRICULUM;
export const UNITS: Unit[] = [];
export const BY_UNIT: Record<string, Unit> = {};
const BOOK_US: string[][] = [];
const CH_US: string[][][] = [];
const SEC_US: string[][][][] = [];

BOOKS.forEach((b, bi) => {
  BOOK_US[bi] = [];
  CH_US[bi] = [];
  SEC_US[bi] = [];
  b.chapters.forEach((c, ci) => {
    CH_US[bi][ci] = [];
    SEC_US[bi][ci] = [];
    c.s.forEach((s, si) => {
      const k = `${b.id}|${ci}.${si}`;
      const list: Unit[] = s.i.length
        ? s.i.map((t, ii) => ({ u: `${k}.${ii}`, t, bi, ci, si, self: false }))
        : [{ u: k, t: s.t, bi, ci, si, self: true }];
      SEC_US[bi][ci][si] = list.map((x) => x.u);
      list.forEach((x) => { UNITS.push(x); BY_UNIT[x.u] = x; BOOK_US[bi].push(x.u); CH_US[bi][ci].push(x.u); });
    });
  });
});

export const unitsOfBook = (bi: number): string[] => BOOK_US[bi] || [];
export const unitsOfChapter = (bi: number, ci: number): string[] => (CH_US[bi] && CH_US[bi][ci]) || [];
export const unitsOfSection = (bi: number, ci: number, si: number): string[] => (SEC_US[bi] && SEC_US[bi][ci] && SEC_US[bi][ci][si]) || [];
export const ALL_UNITS: string[] = UNITS.map((x) => x.u);

/** "فصل › بخش › مورد" for one unit */
export function unitPath(u: string): string {
  const x = BY_UNIT[u];
  if (!x) return '';
  const b = BOOKS[x.bi];
  const ch = b.chapters[x.ci];
  const sec = ch.s[x.si];
  return x.self ? `${ch.t} › ${sec.t}` : `${ch.t} › ${sec.t} › ${x.t}`;
}

// ---------------------------------------------------------------- persistence + subscription
const KEY = 'planex_tracker_v1';

function fresh(): TrackerState {
  return { rounds: DEFAULT_ROUNDS.map((r) => ({ ...r })), done: {}, flags: {}, notes: {} };
}

function sanitize(p: any): TrackerState {
  const s = fresh();
  if (!p || typeof p !== 'object') return s;
  if (Array.isArray(p.rounds) && p.rounds.length) {
    const seen = new Set<string>();
    const rs: TRound[] = [];
    p.rounds.forEach((r: any) => {
      if (!r || typeof r.id !== 'string' || seen.has(r.id)) return;
      seen.add(r.id);
      const round: TRound = { id: r.id, name: String(r.name || 'دور'), color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : ROUND_COLORS[rs.length % ROUND_COLORS.length] };
      if (r.src && typeof r.src === 'object') {
        const src: RoundSources = {};
        Object.keys(r.src).forEach((k) => {
          const v = r.src[k];
          if (v && typeof v.s === 'string' && v.s.trim()) src[k] = { s: v.s.trim().slice(0, 60), ...(v.t === 'test' || v.t === 'descriptive' ? { t: v.t as BookType } : {}) };
        });
        if (Object.keys(src).length) round.src = src;
      }
      if (typeof r.due === 'string' && /^\d{4}\/\d{2}\/\d{2}$/.test(r.due)) round.due = r.due;
      rs.push(round);
    });
    if (rs.length) s.rounds = rs;
  }
  const ids = new Set(s.rounds.map((r) => r.id));
  if (p.done && typeof p.done === 'object') {
    Object.keys(p.done).forEach((u) => {
      if (!BY_UNIT[u] || !p.done[u] || typeof p.done[u] !== 'object') return;
      const o: Record<string, number> = {};
      Object.keys(p.done[u]).forEach((r) => { if (ids.has(r) && p.done[u][r]) o[r] = Number(p.done[u][r]) || Date.now(); });
      if (Object.keys(o).length) s.done[u] = o;
    });
  }
  if (p.flags && typeof p.flags === 'object') Object.keys(p.flags).forEach((u) => { if (BY_UNIT[u] && p.flags[u]) s.flags[u] = 1; });
  if (p.notes && typeof p.notes === 'object') Object.keys(p.notes).forEach((u) => { if (BY_UNIT[u] && typeof p.notes[u] === 'string' && p.notes[u].trim()) s.notes[u] = p.notes[u]; });
  if (typeof p.last === 'string' && BY_UNIT[p.last]) s.last = p.last;
  if (typeof p.focus === 'string' && ids.has(p.focus)) s.focus = p.focus;
  return s;
}

function load(): TrackerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch { /* corrupt -> defaults */ }
  return fresh();
}

let state: TrackerState = load();
const subs = new Set<() => void>();

function commit(next: TrackerState): void {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full */ }
  subs.forEach((f) => f());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { state = load(); subs.forEach((f) => f()); }
  });
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getTracker = (): TrackerState => state;
export const useTracker = (): TrackerState => React.useSyncExternalStore(subscribe, getTracker);

// ---------------------------------------------------------------- reading helpers
export const isOn = (s: TrackerState, u: string, r: string): boolean => !!(s.done[u] && s.done[u][r]);
export const cnt = (s: TrackerState, us: string[], r: string): number => { let n = 0; for (const u of us) if (s.done[u] && s.done[u][r]) n++; return n; };
export const touched = (s: TrackerState, us: string[]): number => { let n = 0; for (const u of us) if (s.done[u] && Object.keys(s.done[u]).length) n++; return n; };
/** index of the highest round that is complete for every unit (-1 = none) */
export function upto(s: TrackerState, us: string[]): number {
  let k = -1;
  if (!us.length) return k;
  s.rounds.forEach((r, i) => { if (cnt(s, us, r.id) === us.length) k = i; });
  return k;
}
/** colour of the highest round ticked on a unit (for the row accent) */
export function topColor(s: TrackerState, u: string): string | null {
  const d = s.done[u];
  if (!d) return null;
  for (let i = s.rounds.length - 1; i >= 0; i--) if (d[s.rounds[i].id]) return s.rounds[i].color;
  return null;
}
export function focusRound(s: TrackerState): TRound {
  return s.rounds.find((r) => r.id === s.focus) || s.rounds[0];
}

// ---------------------------------------------------------------- mutations
function withDone(fn: (done: Record<string, Record<string, number>>) => void, last?: string): void {
  const done: Record<string, Record<string, number>> = { ...state.done };
  fn(done);
  commit({ ...state, done, ...(last ? { last } : {}) });
}

export function setMarks(us: string[], r: string, on: boolean, ts: number = Date.now()): void {
  if (!state.rounds.some((x) => x.id === r)) return;
  let lastU: string | undefined;
  withDone((done) => {
    us.forEach((u) => {
      if (!BY_UNIT[u]) return;
      const cur = { ...(done[u] || {}) };
      if (on) { if (!cur[r]) cur[r] = ts; lastU = u; } else delete cur[r];
      if (Object.keys(cur).length) done[u] = cur; else delete done[u];
    });
  });
  if (lastU && on) commit({ ...state, last: lastU });
}

/** tap on a round chip: if every unit already has the round, clear them all; otherwise tick all */
export function toggleMarks(us: string[], r: string): void {
  if (!us.length) return;
  setMarks(us, r, cnt(state, us, r) !== us.length);
}

export function toggleFlag(u: string): void {
  const flags = { ...state.flags };
  if (flags[u]) delete flags[u]; else flags[u] = 1;
  commit({ ...state, flags });
}

export function setNote(u: string, text: string): void {
  const notes = { ...state.notes };
  const t = text.trim();
  if (t) notes[u] = t; else delete notes[u];
  commit({ ...state, notes });
}

export function setFocus(r: string): void { commit({ ...state, focus: r }); }

export function addRound(name?: string, color?: string): TRound {
  const n = state.rounds.length;
  let id = 'r' + n;
  while (state.rounds.some((r) => r.id === id)) id += 'x';
  const used = new Set(state.rounds.map((r) => r.color.toLowerCase()));
  const col = color || ROUND_COLORS.find((c) => !used.has(c)) || ROUND_COLORS[n % ROUND_COLORS.length];
  const r: TRound = { id, name: name || `دور ${n + 1}`, color: col };
  commit({ ...state, rounds: [...state.rounds, r] });
  return r;
}

/** the source a round uses for a book: the book's own entry, else its lesson's, else the round's default */
export function sourceFor(r: TRound, bi: number): { s: string; t?: BookType } | null {
  const b = BOOKS[bi];
  const m = r.src || {};
  return (b && (m[b.book] || m[b.lesson])) || m['*'] || null;
}

/** set (or with an empty name, remove) the source of a round for a scope: book name, lesson name or '*' */
export function setRoundSource(id: string, scope: string, name: string, t?: BookType): void {
  commit({
    ...state,
    rounds: state.rounds.map((r) => {
      if (r.id !== id) return r;
      const src: RoundSources = { ...(r.src || {}) };
      const n = name.trim().slice(0, 60);
      if (n) src[scope] = { s: n, ...(t ? { t } : {}) }; else delete src[scope];
      const out: TRound = { ...r };
      if (Object.keys(src).length) out.src = src; else delete out.src;
      return out;
    })
  });
}

export function setRoundDue(id: string, due: string | undefined): void {
  commit({
    ...state,
    rounds: state.rounds.map((r) => {
      if (r.id !== id) return r;
      const out: TRound = { ...r };
      if (due) out.due = due; else delete out.due;
      return out;
    })
  });
}

export function updateRound(id: string, patch: Partial<Pick<TRound, 'name' | 'color'>>): void {
  commit({ ...state, rounds: state.rounds.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
}

export function moveRound(id: string, dir: -1 | 1): void {
  const i = state.rounds.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.rounds.length) return;
  const rounds = state.rounds.slice();
  [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
  commit({ ...state, rounds });
}

export function removeRound(id: string): void {
  if (state.rounds.length <= 1) return;
  const done: Record<string, Record<string, number>> = {};
  Object.keys(state.done).forEach((u) => {
    const o = { ...state.done[u] };
    delete o[id];
    if (Object.keys(o).length) done[u] = o;
  });
  const rounds = state.rounds.filter((r) => r.id !== id);
  commit({ ...state, rounds, done, focus: state.focus === id ? rounds[0].id : state.focus });
}

export function exportBackup(): string {
  return JSON.stringify({ rounds: state.rounds, done: state.done, flags: state.flags, notes: state.notes });
}

/** accepts the backup text of this tracker or of the older standalone lesson tracker */
export function importBackup(text: string, mode: 'replace' | 'merge'): { ok: boolean; units: number } {
  try {
    const p = JSON.parse(text);
    if (!p || typeof p !== 'object') return { ok: false, units: 0 };
    const inc = sanitize({ ...p, last: undefined, focus: undefined });
    if (mode === 'replace') {
      commit({ ...inc, focus: inc.rounds[0].id });
    } else {
      const done = { ...state.done };
      Object.keys(inc.done).forEach((u) => { done[u] = { ...(done[u] || {}), ...inc.done[u] }; });
      commit({
        ...state,
        done,
        flags: { ...state.flags, ...inc.flags },
        notes: { ...state.notes, ...inc.notes },
        rounds: [...state.rounds, ...inc.rounds.filter((r) => !state.rounds.some((x) => x.id === r.id))]
      });
    }
    return { ok: true, units: Object.keys(state.done).length };
  } catch {
    return { ok: false, units: 0 };
  }
}

export function resetTracker(): void { commit(fresh()); }

/** called by the planner when a card that was made from the tracker is ticked / unticked */
export function applyPlannerDone(us: string[], r: string, done: boolean): void {
  if (!state.rounds.some((x) => x.id === r)) return;
  setMarks(us, r, done);
}
