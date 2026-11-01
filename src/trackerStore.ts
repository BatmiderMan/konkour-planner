import React from 'react';
import { CURRICULUM, TrackBook } from './tracker/curriculumData';
import { BookType } from './types';

/**
 * Topic tracker (پیگیری مباحث): every book of the track is a tree book > chapter > section > item.
 * The smallest tickable thing is a "unit" (an item, or a section that has no items).
 * Each unit can be ticked once per ROUND (دور / مرحله) - e.g. a learning round, a test round, a review round.
 */

/** sources (کتاب / منبع) a round is studied from, per scope: a book name (شیمی ۳), a lesson (شیمی), a grade (دوازدهم) or '*' for everything.
 *  One scope may list several sources. */
export type RoundSources = Record<string, Array<{ s: string; t?: BookType }>>;

export interface TRound {
  id: string;
  name: string;
  color: string;
  /** which sources this round uses - cards made for the round get one of them */
  src?: RoundSources;
  /** target date (jalali key) the round should be finished by */
  due?: string;
  /** where the round applies: grade names, lesson names and/or book names. Empty / missing = every book. */
  scope?: string[];
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
  /** study parts logged on a unit for a round while it is not finished yet: parts count + minutes */
  parts: Record<string, Record<string, { n: number; m: number }>>;
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
/** old unit id of a group of sub-items -> the ids of its sub-units */
const GROUP_SUBS: Record<string, string[]> = {};
const expandUnit = (u: string): string[] => (BY_UNIT[u] ? [u] : GROUP_SUBS[u] || []);
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
      const list: Unit[] = [];
      if (s.i.length) {
        s.i.forEach((it, ii) => {
          if (typeof it === 'string') {
            list.push({ u: `${k}.${ii}`, t: it, bi, ci, si, self: false });
          } else {
            // a group of sub-items: each one is its own unit; an old tick on the whole group means all of them
            const subs = it.i.map((sub, jj) => ({ u: `${k}.${ii}.${jj}`, t: `${it.t} › ${sub}`, bi, ci, si, self: false }));
            GROUP_SUBS[`${k}.${ii}`] = subs.map((x) => x.u);
            list.push(...subs);
          }
        });
      } else {
        list.push({ u: k, t: s.t, bi, ci, si, self: true });
      }
      SEC_US[bi][ci][si] = list.map((x) => x.u);
      list.forEach((x) => { UNITS.push(x); BY_UNIT[x.u] = x; BOOK_US[bi].push(x.u); CH_US[bi][ci].push(x.u); });
    });
  });
});

/** every name a round scope may use: grades, lessons and book names */
export const GRADES = ['دهم', 'یازدهم', 'دوازدهم'] as const;
export const LESSON_NAMES = ['ریاضی', 'فیزیک', 'شیمی'];
const SCOPE_KEYS = new Set<string>([...GRADES, ...LESSON_NAMES, ...BOOKS.map((b) => b.book)]);

const TRACKED_SUBJECTS = new Set<string>(BOOKS.map((b) => b.subject));
/** is this planner subject one of the tracker's books? */
export const isTrackedSubject = (name: string): boolean => TRACKED_SUBJECTS.has(name);

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
  return { rounds: DEFAULT_ROUNDS.map((r) => ({ ...r })), done: {}, flags: {}, notes: {}, parts: {} };
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
          const raw = Array.isArray(r.src[k]) ? r.src[k] : [r.src[k]];
          const list: Array<{ s: string; t?: BookType }> = [];
          raw.forEach((v: any) => {
            if (v && typeof v.s === 'string' && v.s.trim() && !list.some((x) => x.s === v.s.trim())) {
              list.push({ s: v.s.trim().slice(0, 60), ...(v.t === 'test' || v.t === 'descriptive' ? { t: v.t as BookType } : {}) });
            }
          });
          if (list.length) src[k] = list;
        });
        if (Object.keys(src).length) round.src = src;
      }
      if (Array.isArray(r.scope)) {
        const sc = r.scope.filter((x: any) => typeof x === 'string' && SCOPE_KEYS.has(x));
        if (sc.length) round.scope = sc;
      }
      if (typeof r.due === 'string' && /^\d{4}\/\d{2}\/\d{2}$/.test(r.due)) round.due = r.due;
      rs.push(round);
    });
    if (rs.length) s.rounds = rs;
  }
  const ids = new Set(s.rounds.map((r) => r.id));
  if (p.done && typeof p.done === 'object') {
    Object.keys(p.done).forEach((u0) => {
      if (!p.done[u0] || typeof p.done[u0] !== 'object') return;
      const o: Record<string, number> = {};
      Object.keys(p.done[u0]).forEach((r) => { if (ids.has(r) && p.done[u0][r]) o[r] = Number(p.done[u0][r]) || Date.now(); });
      if (Object.keys(o).length) expandUnit(u0).forEach((u) => { s.done[u] = { ...(s.done[u] || {}), ...o }; });
    });
  }
  if (p.parts && typeof p.parts === 'object') {
    Object.keys(p.parts).forEach((u) => {
      if (!BY_UNIT[u] || !p.parts[u] || typeof p.parts[u] !== 'object') return;
      const o: Record<string, { n: number; m: number }> = {};
      Object.keys(p.parts[u]).forEach((r) => {
        const v = p.parts[u][r];
        if (ids.has(r) && v && Number(v.n) > 0) o[r] = { n: Math.min(99, Math.round(Number(v.n))), m: Math.max(0, Math.round(Number(v.m) || 0)) };
      });
      if (Object.keys(o).length) s.parts[u] = o;
    });
  }
  if (p.flags && typeof p.flags === 'object') Object.keys(p.flags).forEach((u0) => { if (p.flags[u0]) expandUnit(u0).forEach((u) => { s.flags[u] = 1; }); });
  if (p.notes && typeof p.notes === 'object') Object.keys(p.notes).forEach((u0) => { if (typeof p.notes[u0] === 'string' && p.notes[u0].trim()) expandUnit(u0).forEach((u) => { s.notes[u] = p.notes[u0]; }); });
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

// ---------------------------------------------------------------- scope: which rounds apply to which books
export function appliesBook(r: TRound, bi: number): boolean {
  if (!r.scope || !r.scope.length) return true;
  const b = BOOKS[bi];
  return !!b && (r.scope.includes(b.book) || r.scope.includes(b.lesson) || r.scope.includes(b.grade));
}
export function appliesUnit(r: TRound, u: string): boolean {
  const x = BY_UNIT[u];
  return !!x && appliesBook(r, x.bi);
}
/** the rounds that apply to a book, in order */
export function roundsOfBook(s: TrackerState, bi: number): TRound[] {
  return s.rounds.filter((r) => appliesBook(r, bi));
}
/** the units of a list that a round applies to */
export function scopedUnits(r: TRound, us: string[]): string[] {
  return !r.scope || !r.scope.length ? us : us.filter((u) => appliesUnit(r, u));
}
export const scopeLabel = (r: TRound): string => (r.scope && r.scope.length ? r.scope.join('، ') : 'همه‌ی کتاب‌ها');

// ---------------------------------------------------------------- reading helpers
export const isOn = (s: TrackerState, u: string, r: string): boolean => !!(s.done[u] && s.done[u][r]);
/** units of the list that have the round - counted only where the round applies */
export const cnt = (s: TrackerState, us: string[], r: string): number => {
  const round = s.rounds.find((x) => x.id === r);
  let n = 0;
  for (const u of us) if (s.done[u] && s.done[u][r] && (!round || appliesUnit(round, u))) n++;
  return n;
};
/** how many units of the list the round applies to (the denominator of its progress) */
export const tot = (s: TrackerState, us: string[], r: string): number => {
  const round = s.rounds.find((x) => x.id === r);
  return round ? scopedUnits(round, us).length : us.length;
};
/** units with study parts logged for the round but not finished yet */
export const partial = (s: TrackerState, us: string[], r: string): number => {
  let n = 0;
  for (const u of us) if (!(s.done[u] && s.done[u][r]) && s.parts[u] && s.parts[u][r]) n++;
  return n;
};
export const partInfo = (s: TrackerState, u: string, r: string): { n: number; m: number } | null => (s.parts[u] && s.parts[u][r]) || null;
export const touched = (s: TrackerState, us: string[]): number => {
  let n = 0;
  for (const u of us) if ((s.done[u] && Object.keys(s.done[u]).length) || (s.parts[u] && Object.keys(s.parts[u]).length)) n++;
  return n;
};
/** index of the highest round that is complete for every unit it applies to (-1 = none) */
export function upto(s: TrackerState, us: string[]): number {
  let k = -1;
  s.rounds.forEach((r, i) => { const t = tot(s, us, r.id); if (t > 0 && cnt(s, us, r.id) === t) k = i; });
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
  const round = state.rounds.find((x) => x.id === r);
  if (!round) return;
  const a = scopedUnits(round, us);
  if (!a.length) return;
  setMarks(a, r, cnt(state, a, r) !== a.length);
}

/** log (or take back, with a negative number) study parts on units for a round */
export function addParts(us: string[], r: string, dn: number, dm: number): void {
  if (!state.rounds.some((x) => x.id === r)) return;
  const parts = { ...state.parts };
  us.forEach((u) => {
    if (!BY_UNIT[u]) return;
    const cur = (parts[u] && parts[u][r]) || { n: 0, m: 0 };
    const n = Math.max(0, Math.min(99, cur.n + dn));
    const m = Math.max(0, cur.m + Math.round(dm / Math.max(1, us.length)));
    const o = { ...(parts[u] || {}) };
    if (n > 0) o[r] = { n, m }; else delete o[r];
    if (Object.keys(o).length) parts[u] = o; else delete parts[u];
  });
  commit({ ...state, parts, last: us[us.length - 1] && BY_UNIT[us[us.length - 1]] ? us[us.length - 1] : state.last });
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

export function addRound(name?: string, color?: string, scope?: string[]): TRound {
  const n = state.rounds.length;
  let id = 'r' + n;
  while (state.rounds.some((r) => r.id === id)) id += 'x';
  const used = new Set(state.rounds.map((r) => r.color.toLowerCase()));
  const col = color || ROUND_COLORS.find((c) => !used.has(c)) || ROUND_COLORS[n % ROUND_COLORS.length];
  const r: TRound = { id, name: name || `دور ${n + 1}`, color: col, ...(scope && scope.length ? { scope } : {}) };
  commit({ ...state, rounds: [...state.rounds, r] });
  return r;
}

/** every source a round offers for a book: the book's own list; else the lesson's + grade's lists; else the round's default list */
export function sourcesFor(r: TRound, bi: number): Array<{ s: string; t?: BookType }> {
  const b = BOOKS[bi];
  const m = r.src || {};
  if (!b) return [];
  if (m[b.book] && m[b.book].length) return m[b.book];
  const mix = [...(m[b.lesson] || []), ...(m[b.grade] || [])].filter((x, i, a) => a.findIndex((y) => y.s === x.s) === i);
  if (mix.length) return mix;
  return m['*'] || [];
}
/** the source a card gets by default (the first one, or the named one when the round offers it) */
export function sourceFor(r: TRound, bi: number, pick?: string): { s: string; t?: BookType } | null {
  const list = sourcesFor(r, bi);
  return (pick && list.find((x) => x.s === pick)) || list[0] || null;
}

/** add a source to a scope (book name / lesson / grade / '*'); with an existing name it only updates its type */
export function setRoundSource(id: string, scope: string, name: string, t?: BookType): void {
  const n = name.trim().slice(0, 60);
  if (!n) return;
  commit({
    ...state,
    rounds: state.rounds.map((r) => {
      if (r.id !== id) return r;
      const src: RoundSources = { ...(r.src || {}) };
      const list = (src[scope] || []).filter((x) => x.s !== n);
      src[scope] = [...list, { s: n, ...(t ? { t } : {}) }];
      return { ...r, src };
    })
  });
}

export function removeRoundSource(id: string, scope: string, name: string): void {
  commit({
    ...state,
    rounds: state.rounds.map((r) => {
      if (r.id !== id) return r;
      const src: RoundSources = { ...(r.src || {}) };
      const list = (src[scope] || []).filter((x) => x.s !== name);
      if (list.length) src[scope] = list; else delete src[scope];
      const out: TRound = { ...r };
      if (Object.keys(src).length) out.src = src; else delete out.src;
      return out;
    })
  });
}

export function setRoundScope(id: string, scope: string[]): void {
  commit({
    ...state,
    rounds: state.rounds.map((r) => {
      if (r.id !== id) return r;
      const out: TRound = { ...r };
      if (scope.length) out.scope = scope; else delete out.scope;
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
  const parts: Record<string, Record<string, { n: number; m: number }>> = {};
  Object.keys(state.parts).forEach((u) => {
    const o = { ...state.parts[u] };
    delete o[id];
    if (Object.keys(o).length) parts[u] = o;
  });
  const rounds = state.rounds.filter((r) => r.id !== id);
  commit({ ...state, rounds, done, parts, focus: state.focus === id ? rounds[0].id : state.focus });
}

export function exportBackup(): string {
  return JSON.stringify({ rounds: state.rounds, done: state.done, parts: state.parts, flags: state.flags, notes: state.notes });
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
      const parts = { ...state.parts };
      Object.keys(inc.parts).forEach((u) => { parts[u] = { ...(parts[u] || {}), ...inc.parts[u] }; });
      commit({
        ...state,
        done,
        parts,
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

/**
 * Called when a planner card that is linked to topics is ticked / unticked.
 * - a "part" card (mode 'p') only logs a study part on the topics (the topic stays open)
 * - a "full" card finishes the topics for that round (and logs its part as well)
 */
export function applyPlannerDone(us: string[], r: string, done: boolean, mode: 'f' | 'p' = 'f', minutes = 0): void {
  if (!state.rounds.some((x) => x.id === r)) return;
  if (done) {
    addParts(us, r, 1, minutes);
    if (mode === 'f') setMarks(us, r, true);
  } else {
    addParts(us, r, -1, -minutes);
    if (mode === 'f') setMarks(us, r, false);
  }
}
