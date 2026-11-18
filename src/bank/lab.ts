/** The lab's brain: which questions an exam / PDF / set is made of. Pure functions, no UI. */
import { bn } from './qno';
import { Attempt, BankBook, QMeta, Ref, Section, itemBook, keyOf, masteryOf } from './store';

export type StatusKey = 'new' | 'weak' | 'learning' | 'mastered';
export const STATUS: Array<[StatusKey, string]> = [['new', 'دیده‌نشده'], ['weak', 'ضعیف'], ['learning', 'در حال یادگیری'], ['mastered', 'مسلط']];
const STATUS_INDEX: Record<StatusKey, number> = { new: 0, weak: 1, learning: 2, mastered: 3 };

export interface Filter { status: StatusKey[]; star: boolean; doubt: boolean; levels: number[]; expl: boolean; noted: boolean; lastBad: boolean; lastBlank: boolean }
export const NO_FILTER: Filter = { status: [], star: false, doubt: false, levels: [], expl: false, noted: false, lastBad: false, lastBlank: false };
export const filterActive = (f: Filter) => !!(f.status.length || f.star || f.doubt || f.levels.length || f.expl || f.noted || f.lastBad || f.lastBlank);

/** what happened to each question the LAST time it appeared in an exam: 'ok' | 'bad' (wrong) | 'blank' (left empty) */
export type LastMap = Record<string, 'ok' | 'bad' | 'blank'>;
export function lastResults(attempts: Attempt[], answerOf: (b: string, n: number) => number): LastMap {
  const m: LastMap = {};
  [...attempts].sort((a, b) => a.at - b.at).forEach((a) => a.items.forEach((it) => {
    const b = itemBook(a, it); const k = answerOf(b, it.n); m[keyOf(b, it.n)] = !it.pick || !k ? 'blank' : it.pick === k ? 'ok' : 'bad';
  }));
  return m;
}

/** where questions come from: a book, optionally cut by a number range or by chapters */
export interface Source { b: string; from?: number; to?: number; secs?: number[] }

export type Order = 'book' | 'shuffle' | 'interleave' | 'hard';
export const ORDERS: Array<[Order, string, string]> = [
  ['book', 'به ترتیب کتاب', 'همان ترتیب شمارهٔ سؤال‌ها'],
  ['shuffle', 'تصادفی', 'همهٔ سؤال‌ها قاطی می‌شوند'],
  ['interleave', 'یکی‌درمیان کتاب‌ها', 'از هر کتاب به‌نوبت یک سؤال'],
  ['hard', 'سخت‌ها و ضعیف‌ها اول', 'اول سؤال‌هایی که سخت یا ضعیفند']
];

export const matches = (f: Filter, book: BankBook | undefined, n: number, m?: QMeta, last?: string): boolean => {
  if ((f.lastBad || f.lastBlank) && !((f.lastBad && last === 'bad') || (f.lastBlank && last === 'blank'))) return false;
  if (f.status.length && !f.status.some((s) => STATUS_INDEX[s] === masteryOf(m))) return false;
  if (f.star && !m?.star) return false;
  if (f.doubt && !m?.doubt) return false;
  if (f.levels.length && !f.levels.includes(m?.lvl || 0)) return false;
  if (f.expl && !(book && book.expl.includes(n))) return false;
  if (f.noted && !m?.note) return false;
  return true;
};

export function pool(books: Map<string, BankBook>, sources: Source[], f: Filter, meta: Record<string, QMeta>, sections: Record<string, Section[]>, last: LastMap = {}): Ref[] {
  const out: Ref[] = [], seen = new Set<string>();
  for (const s of sources) {
    const b = books.get(s.b); if (!b) continue;
    const secs = sections[b.id] || [];
    const ranges: Array<[number, number]> = [];
    if (s.secs && s.secs.length) s.secs.forEach((i) => { if (secs[i]) ranges.push([secs[i].from, secs[i].to]); });
    for (const n of b.numbers) {
      if (s.from !== undefined && bn(n) < s.from) continue;
      if (s.to !== undefined && bn(n) > s.to) continue;
      if (ranges.length && !ranges.some(([a, z]) => bn(n) >= a && bn(n) <= z)) continue;
      if (!matches(f, b, n, meta[keyOf(b.id, n)], last[keyOf(b.id, n)])) continue;
      const k = keyOf(b.id, n); if (seen.has(k)) continue; seen.add(k);
      out.push({ b: b.id, n });
    }
  }
  return out;
}

const shuffle = <T,>(a: T[]): T[] => { const p = a.slice(); for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };

/** order + limit. `count` 0 = everything. A limit takes a RANDOM sample unless the order is by book. */
export function arrange(list: Ref[], order: Order, count: number, meta: Record<string, QMeta>): Ref[] {
  let l = list.slice();
  if (count > 0 && count < l.length && order !== 'book' && order !== 'hard') l = shuffle(l).slice(0, count);
  if (order === 'shuffle') l = shuffle(l);
  else if (order === 'interleave') {
    const by = new Map<string, Ref[]>(); shuffle(l).forEach((r) => { (by.get(r.b) || by.set(r.b, []).get(r.b)!).push(r); });
    const q = [...by.values()]; l = [];
    while (q.some((x) => x.length)) q.forEach((x) => { const r = x.shift(); if (r) l.push(r); });
  } else if (order === 'hard') {
    const score = (r: Ref) => { const m = meta[keyOf(r.b, r.n)]; return (m?.lvl || 0) * 2 + (masteryOf(m) === 1 ? 4 : masteryOf(m) === 0 ? 1 : 0) + Math.random(); };
    l = l.map((r) => [score(r), r] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }
  if (count > 0 && l.length > count) l = l.slice(0, count);
  return l;
}

export const refKey = (r: Ref) => keyOf(r.b, r.n);
export const fmtDur = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export interface QHist { aid: string; at: number; title: string; mode: string; pick: number; right: number; state: 'ok' | 'bad' | 'blank'; sec: number }
/** every time this question appeared in an exam/practice: what you answered, whether it was right, how long it took */
export function historyOf(attempts: Attempt[], answerOf: (b: string, n: number) => number, b: string, n: number): QHist[] {
  const out: QHist[] = [];
  for (const a of attempts) for (const it of a.items) {
    if (it.n !== n || itemBook(a, it) !== b) continue;
    const right = answerOf(b, n);
    out.push({ aid: a.id, at: a.at, title: a.title || 'آزمون', mode: a.mode, pick: it.pick, right, state: !it.pick || !right ? 'blank' : it.pick === right ? 'ok' : 'bad', sec: it.sec || 0 });
  }
  return out.sort((x, y) => y.at - x.at);
}

/* ---------------------------------------------------------------- stats shared with the planner */
export interface BankStat { total: number; solved: number; ok: number; bad: number; blank: number; acc: number; cover: number }
/** accuracy = right ÷ answered · coverage («درصد حل شده») = answered at least once ÷ all questions — from the LAST result of every question */
export function statOf(last: LastMap, refs: Ref[]): BankStat {
  let ok = 0, bad = 0, blank = 0;
  for (const r of refs) { const v = last[keyOf(r.b, r.n)]; if (v === 'ok') ok++; else if (v === 'bad') bad++; else if (v === 'blank') blank++; }
  const solved = ok + bad, total = refs.length;
  return { total, solved, ok, bad, blank, acc: solved ? Math.round((ok / solved) * 100) : 0, cover: total ? Math.round((solved / total) * 100) : 0 };
}
const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏()\-–—،,.:؛/]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const toks = (s: string) => norm(s).split(' ').filter((t) => t.length >= 2 && !['درس', 'فصل', 'مبحث', 'تست', 'تمرین', 'مرور', 'و', 'از', 'در', 'به'].includes(t));
/** questions of the book(s) that match a planner card (subject + topic): the matching lesson when found, else the whole subject */
export function matchRefs(books: BankBook[], sections: Record<string, Section[]>, subject: string, detail: string): { refs: Ref[]; scope: 'lesson' | 'subject' | 'none'; label: string } {
  const st = toks(subject), dt = toks(detail);
  const hit = (a: string[], b: string[]) => a.some((x) => b.some((y) => x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x)))));
  const bs = st.length ? books.filter((b) => hit(st, toks((b.subject || '') + ' ' + b.title))) : [];
  if (!bs.length) return { refs: [], scope: 'none', label: '' };
  const les: Ref[] = []; const names: string[] = [];
  if (dt.length) for (const b of bs) for (const s of sections[b.id] || []) if (hit(dt, toks(s.name))) { names.push(s.name); for (const n of b.numbers) if (bn(n) >= s.from && bn(n) <= s.to) les.push({ b: b.id, n }); }
  if (les.length) return { refs: les, scope: 'lesson', label: names[0] };
  const all: Ref[] = []; for (const b of bs) for (const n of b.numbers) all.push({ b: b.id, n });
  return { refs: all, scope: 'subject', label: subject };
}
/** the questions worth doing first: last time wrong → left blank → never seen → the rest (each group shuffled) */
export function smartPick(last: LastMap, refs: Ref[], count: number): Ref[] {
  const sh = <T,>(a: T[]) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const g = (v: string | undefined) => refs.filter((r) => last[keyOf(r.b, r.n)] === v);
  return [...sh(g('bad')), ...sh(g('blank')), ...sh(refs.filter((r) => !last[keyOf(r.b, r.n)])), ...sh(g('ok'))].slice(0, count);
}
/** seconds a question is allowed in pressure practice: your own usual time on it (last 3 tries), else by level; × the tightness */
export function budgetSec(attempts: Attempt[], meta: QMeta | undefined, r: Ref, tight: number): number {
  const ts: number[] = [];
  for (const a of [...attempts].sort((x, y) => y.at - x.at)) { for (const it of a.items) if (it.n === r.n && itemBook(a, it) === r.b && (it.sec || 0) > 0) ts.push(it.sec as number); if (ts.length >= 3) break; }
  const base = ts.length ? ts.reduce((s, x) => s + x, 0) / ts.length : ({ 1: 45, 2: 70, 3: 100 } as Record<number, number>)[meta?.lvl || 0] || 70;
  return Math.max(20, Math.min(240, Math.round(base * tight)));
}
