/** The lab's brain: which questions an exam / PDF / set is made of. Pure functions, no UI. */
import { BankBook, QMeta, Ref, Section, keyOf, masteryOf } from './store';

export type StatusKey = 'new' | 'weak' | 'learning' | 'mastered';
export const STATUS: Array<[StatusKey, string]> = [['new', 'دیده‌نشده'], ['weak', 'ضعیف'], ['learning', 'در حال یادگیری'], ['mastered', 'مسلط']];
const STATUS_INDEX: Record<StatusKey, number> = { new: 0, weak: 1, learning: 2, mastered: 3 };

export interface Filter { status: StatusKey[]; star: boolean; doubt: boolean; levels: number[]; expl: boolean; noted: boolean }
export const NO_FILTER: Filter = { status: [], star: false, doubt: false, levels: [], expl: false, noted: false };
export const filterActive = (f: Filter) => !!(f.status.length || f.star || f.doubt || f.levels.length || f.expl || f.noted);

/** where questions come from: a book, optionally cut by a number range or by chapters */
export interface Source { b: string; from?: number; to?: number; secs?: number[] }

export type Order = 'book' | 'shuffle' | 'interleave' | 'hard';
export const ORDERS: Array<[Order, string, string]> = [
  ['book', 'به ترتیب کتاب', 'همان ترتیب شمارهٔ سؤال‌ها'],
  ['shuffle', 'تصادفی', 'همهٔ سؤال‌ها قاطی می‌شوند'],
  ['interleave', 'یکی‌درمیان کتاب‌ها', 'از هر کتاب به‌نوبت یک سؤال'],
  ['hard', 'سخت‌ها و ضعیف‌ها اول', 'اول سؤال‌هایی که سخت یا ضعیفند']
];

export const matches = (f: Filter, book: BankBook | undefined, n: number, m?: QMeta): boolean => {
  if (f.status.length && !f.status.some((s) => STATUS_INDEX[s] === masteryOf(m))) return false;
  if (f.star && !m?.star) return false;
  if (f.doubt && !m?.doubt) return false;
  if (f.levels.length && !f.levels.includes(m?.lvl || 0)) return false;
  if (f.expl && !(book && book.expl.includes(n))) return false;
  if (f.noted && !m?.note) return false;
  return true;
};

export function pool(books: Map<string, BankBook>, sources: Source[], f: Filter, meta: Record<string, QMeta>, sections: Record<string, Section[]>): Ref[] {
  const out: Ref[] = [], seen = new Set<string>();
  for (const s of sources) {
    const b = books.get(s.b); if (!b) continue;
    const secs = sections[b.id] || [];
    const ranges: Array<[number, number]> = [];
    if (s.secs && s.secs.length) s.secs.forEach((i) => { if (secs[i]) ranges.push([secs[i].from, secs[i].to]); });
    for (const n of b.numbers) {
      if (s.from !== undefined && n < s.from) continue;
      if (s.to !== undefined && n > s.to) continue;
      if (ranges.length && !ranges.some(([a, z]) => n >= a && n <= z)) continue;
      if (!matches(f, b, n, meta[keyOf(b.id, n)])) continue;
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
