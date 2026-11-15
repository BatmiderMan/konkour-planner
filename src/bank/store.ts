/**
 * Storage of the question bank (بانک تست) — IndexedDB database «planex-bank»:
 *   books     one record per book (a book may arrive in several .qbank parts that carry the same id)
 *   images    question pictures  key «book:n»   and explanation pictures  key «book:n:e»
 *   attempts  every exam you took
 *   meta      what you know about ONE question: ⭐ mark, doubt flag, your own level, note, history (tries / wins / streak / time)
 *   sets      your own named collections of questions (can mix several books)
 *   prefs     small things: the chapter map of each book (key «sec:<book>»)
 * Nothing here goes to a server: pictures stay on this device. The vault (گنجینه) only stores a REFERENCE to a bank question.
 */
import { Pack } from './pack';

export interface BankBook {
  id: string; title: string; subject?: string; total: number; importedAt: number; created?: string;
  numbers: number[];                       // tests that have an image, ascending
  answers: Record<number, number>;         // every known answer (also tests without image)
  expl: number[];                          // tests that have an explanation picture, ascending
  shared: number[];                        // explanation picture also holds the neighbour's solution
  approx: number[];                        // question picture was cut by heuristics
  parts?: number[]; partsTotal?: number;   // which parts of the book are imported
}
export interface AttemptItem { n: number; pick: number; b?: string; sec?: number }   // pick 0 = left blank; b = book (only in mixed exams)
export interface Attempt {
  id: string; bookId: string; at: number; seconds: number; items: AttemptItem[];
  correct: number; wrong: number; blank: number; pct: number; mode: string;
  title?: string;                          // «ترکیبی · ۳ کتاب» …
}
export interface Ref { b: string; n: number }
export interface QMeta {
  k: string; b: string; n: number;
  star?: boolean;      // ⭐ important
  doubt?: boolean;     // 🤔 not sure → review again
  lvl?: 0 | 1 | 2 | 3; // your own difficulty: 0 none · 1 easy · 2 medium · 3 hard
  note?: string;
  tries?: number; wins?: number; streak?: number; lastOk?: boolean; lastAt?: number; secs?: number;
}
export interface LabSet { id: string; name: string; refs: Ref[]; created: number; updated: number }
export interface Section { name: string; from: number; to: number }

export const BANK_EVENT = 'planex:bank-changed';
export const keyOf = (b: string, n: number) => b + ':' + n;
export const MIX = '*mix';

const DB = 'planex-bank';
let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of ['books', 'attempts', 'sets']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      for (const s of ['images', 'meta', 'prefs']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error || new Error('پایگاه داده باز نشد')); };
  });
  return dbp;
}
const done = (t: IDBTransaction): Promise<void> => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const rq = <T,>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const changed = () => { try { window.dispatchEvent(new Event(BANK_EVENT)); } catch { /* ignore */ } };
const urls = new Map<string, string>();
const uniq = (a: number[]) => Array.from(new Set(a)).sort((x, y) => x - y);

/** delete every record of a store whose key starts with `prefix` */
async function wipePrefix(t: IDBTransaction, store: string, prefix: string): Promise<void> {
  const os = t.objectStore(store); const cur = os.openKeyCursor();
  await new Promise<void>((res, rej) => { cur.onsuccess = () => { const c = cur.result; if (!c) return res(); if (String(c.key).startsWith(prefix)) os.delete(c.key); c.continue(); }; cur.onerror = () => rej(cur.error); });
}

// ------------------------------------------------------------------ books
export async function listBooks(): Promise<BankBook[]> {
  const d = await open(); const all = await rq(d.transaction('books').objectStore('books').getAll() as IDBRequest<BankBook[]>);
  return all.map(fixBook).sort((a, b) => b.importedAt - a.importedAt);
}
export async function getBook(id: string): Promise<BankBook | undefined> {
  const d = await open(); const b = await rq(d.transaction('books').objectStore('books').get(id) as IDBRequest<BankBook | undefined>);
  return b ? fixBook(b) : undefined;
}
/** books saved by an older version of the app have no explanation lists */
const fixBook = (b: BankBook): BankBook => ({ ...b, expl: b.expl || [], shared: b.shared || [], approx: b.approx || [] });

/** import a book, or one PART of a book (parts with the same id are merged); returns the book */
export async function importPack(p: Pack, onProgress?: (done: number, total: number) => void): Promise<BankBook> {
  const h = p.header, d = await open();
  const merge = h.part !== undefined && (h.parts || 0) > 1;
  const old = merge ? await getBook(h.id) : undefined;
  if (!old) await removeBook(h.id, true);
  const answers: Record<number, number> = { ...(old?.answers || {}) };
  h.questions.forEach((q) => { answers[q.n] = q.a; });
  (h.keyOnly || []).forEach((k) => { answers[k.n] = k.a; });
  const expl: number[] = [...(old?.expl || [])], shared: number[] = [...(old?.shared || [])], approx: number[] = [...(old?.approx || [])];
  const eRows: Array<{ n: number; blob: Blob; w: number; h: number }> = [];
  for (const q of [...h.questions, ...(h.keyOnly || [])] as Array<Partial<import('./pack').PackQuestion> & { n: number }>) {
    const blob = p.explanation(q as any);
    if (blob) { expl.push(q.n); eRows.push({ n: q.n, blob, w: q.ew || 0, h: q.eh || 0 }); if (q.es) shared.push(q.n); }
  }
  h.questions.forEach((q) => { if (q.qa) approx.push(q.n); });
  const parts = uniq([...(old?.parts || []), ...(h.part ? [h.part] : [])]);
  const book: BankBook = {
    id: h.id, title: h.title, subject: h.subject, total: Math.max(h.total || 0, old?.total || 0), importedAt: Date.now(), created: h.created,
    numbers: uniq([...(old?.numbers || []), ...h.questions.map((q) => q.n)]), answers,
    expl: uniq(expl), shared: uniq(shared), approx: uniq(approx), ...(h.parts ? { parts, partsTotal: h.parts } : {})
  };
  const CH = 40, steps = h.questions.length + eRows.length; let n = 0;
  for (let i = 0; i < h.questions.length; i += CH) {
    const t = d.transaction('images', 'readwrite'), s = t.objectStore('images');
    h.questions.slice(i, i + CH).forEach((q) => s.put({ k: keyOf(h.id, q.n), bookId: h.id, n: q.n, w: q.w, h: q.h, blob: p.image(q) }));
    await done(t); n += Math.min(CH, h.questions.length - i); onProgress?.(n, steps);
  }
  for (let i = 0; i < eRows.length; i += CH) {
    const t = d.transaction('images', 'readwrite'), s = t.objectStore('images');
    eRows.slice(i, i + CH).forEach((e) => s.put({ k: keyOf(h.id, e.n) + ':e', bookId: h.id, n: e.n, w: e.w, h: e.h, blob: e.blob }));
    await done(t); n += Math.min(CH, eRows.length - i); onProgress?.(n, steps);
  }
  const t = d.transaction('books', 'readwrite'); t.objectStore('books').put(book); await done(t);
  urls.forEach((u, k) => { if (k.startsWith(h.id + ':')) { URL.revokeObjectURL(u); urls.delete(k); } });
  changed(); return book;
}

/** keepAttempts = true is used when a book is imported again: its history and your marks stay */
export async function removeBook(id: string, keepAttempts = false): Promise<void> {
  const d = await open();
  const t = d.transaction(['images', 'books', 'attempts', 'meta', 'prefs'], 'readwrite');
  await wipePrefix(t, 'images', id + ':');
  t.objectStore('books').delete(id);
  if (!keepAttempts) {
    await wipePrefix(t, 'meta', id + ':'); t.objectStore('prefs').delete('sec:' + id);
    const at = t.objectStore('attempts'); const ac = at.openCursor();
    await new Promise<void>((res, rej) => { ac.onsuccess = () => { const c = ac.result; if (!c) return res(); if ((c.value as Attempt).bookId === id) c.delete(); c.continue(); }; ac.onerror = () => rej(ac.error); });
  }
  await done(t); changed();
  urls.forEach((u, k) => { if (k.startsWith(id + ':')) { URL.revokeObjectURL(u); urls.delete(k); } });
}

// ------------------------------------------------------------------ pictures
async function pic(k: string): Promise<Blob | null> {
  const d = await open(); const rec: any = await rq(d.transaction('images').objectStore('images').get(k));
  return rec ? (rec.blob as Blob) : null;
}
async function picUrl(k: string): Promise<string | null> {
  const hit = urls.get(k); if (hit) return hit;
  const b = await pic(k); if (!b) return null;
  const u = URL.createObjectURL(b); urls.set(k, u); return u;
}
export const imageUrl = (b: string, n: number) => picUrl(keyOf(b, n));
export const explUrl = (b: string, n: number) => picUrl(keyOf(b, n) + ':e');
/** the picture of one question as a Blob (copied into the vault by older versions, used by the PDF maker) */
export const imageBlob = (b: string, n: number) => pic(keyOf(b, n));
export const explBlob = (b: string, n: number) => pic(keyOf(b, n) + ':e');

// ------------------------------------------------------------------ attempts
export async function saveAttempt(a: Attempt): Promise<void> {
  const d = await open(); const t = d.transaction('attempts', 'readwrite'); t.objectStore('attempts').put(a); await done(t); changed();
}
export async function listAttempts(bookId?: string): Promise<Attempt[]> {
  const d = await open(); const all = await rq(d.transaction('attempts').objectStore('attempts').getAll() as IDBRequest<Attempt[]>);
  return all.filter((a) => !bookId || a.bookId === bookId || a.items.some((i) => i.b === bookId)).sort((a, b) => b.at - a.at);
}
export async function deleteAttempt(id: string): Promise<void> {
  const d = await open(); const t = d.transaction(['attempts', 'prefs'], 'readwrite'); t.objectStore('attempts').delete(id); await wipePrefix(t, 'prefs', 'draw:' + id + ':'); await done(t); changed();
}
export const konkurPct = (correct: number, wrong: number, total: number) => (total ? Math.round(((3 * correct - wrong) / (3 * total)) * 1000) / 10 : 0);
/** which book an item of an attempt belongs to */
export const itemBook = (a: Attempt, it: AttemptItem) => it.b || a.bookId;

// ------------------------------------------------------------------ question meta (marks, level, note, history)
export async function listMeta(): Promise<Record<string, QMeta>> {
  const d = await open(); const all = await rq(d.transaction('meta').objectStore('meta').getAll() as IDBRequest<QMeta[]>);
  const m: Record<string, QMeta> = {}; all.forEach((x) => { m[x.k] = x; }); return m;
}
const empty = (b: string, n: number): QMeta => ({ k: keyOf(b, n), b, n });
const isBlank = (m: QMeta) => !m.star && !m.doubt && !m.lvl && !m.note && !m.tries;
/** change marks / level / note of one question (a blank record is removed) */
export async function patchMeta(b: string, n: number, patch: Partial<QMeta>): Promise<void> {
  const d = await open(); const t = d.transaction('meta', 'readwrite'); const s = t.objectStore('meta');
  const cur: QMeta = (await rq(s.get(keyOf(b, n)) as IDBRequest<QMeta | undefined>)) || empty(b, n);
  const next = { ...cur, ...patch, k: cur.k, b, n };
  if (isBlank(next)) s.delete(cur.k); else s.put(next);
  await done(t); changed();
}
/** after an exam: every answered question gets one more try, a streak and the time spent */
export async function recordAttemptMeta(a: Attempt, answerOf: (b: string, n: number) => number): Promise<void> {
  const d = await open(); const t = d.transaction('meta', 'readwrite'); const s = t.objectStore('meta');
  for (const it of a.items) {
    const b = itemBook(a, it); if (!it.pick) { /* blank: only the time counts */ }
    const cur: QMeta = (await rq(s.get(keyOf(b, it.n)) as IDBRequest<QMeta | undefined>)) || empty(b, it.n);
    const ok = it.pick !== 0 && it.pick === answerOf(b, it.n);
    const next: QMeta = { ...cur, secs: (cur.secs || 0) + (it.sec || 0) };
    if (it.pick) { next.tries = (cur.tries || 0) + 1; next.wins = (cur.wins || 0) + (ok ? 1 : 0); next.streak = ok ? (cur.streak || 0) + 1 : 0; next.lastOk = ok; next.lastAt = a.at; }
    s.put(next);
  }
  await done(t); changed();
}
/** 0 not tried · 1 weak (last answer wrong) · 2 learning · 3 mastered (right twice in a row) */
export const masteryOf = (m?: QMeta): 0 | 1 | 2 | 3 => (!m || !m.tries ? 0 : m.lastOk === false ? 1 : (m.streak || 0) >= 2 ? 3 : 2);
export const MASTERY = ['دیده‌نشده', 'ضعیف', 'در حال یادگیری', 'مسلط'];
export const LEVEL = ['بدون سطح', 'آسان', 'متوسط', 'سخت'];

// ------------------------------------------------------------------ sets (your own collections)
export async function listSets(): Promise<LabSet[]> {
  const d = await open(); const all = await rq(d.transaction('sets').objectStore('sets').getAll() as IDBRequest<LabSet[]>);
  return all.sort((a, b) => b.updated - a.updated);
}
export async function saveSet(s: LabSet): Promise<void> { const d = await open(); const t = d.transaction('sets', 'readwrite'); t.objectStore('sets').put(s); await done(t); changed(); }
export async function deleteSet(id: string): Promise<void> { const d = await open(); const t = d.transaction('sets', 'readwrite'); t.objectStore('sets').delete(id); await done(t); changed(); }
export const newSetId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// ------------------------------------------------------------------ chapter map of a book
export async function getSections(bookId: string): Promise<Section[]> {
  const d = await open(); const r: any = await rq(d.transaction('prefs').objectStore('prefs').get('sec:' + bookId));
  return r && Array.isArray(r.v) ? r.v : [];
}
export async function setSections(bookId: string, v: Section[]): Promise<void> {
  const d = await open(); const t = d.transaction('prefs', 'readwrite'); t.objectStore('prefs').put({ k: 'sec:' + bookId, v }); await done(t); changed();
}

/** tests of a book that were answered wrongly (or left blank) in the LAST attempt that included them */
export async function weakTests(bookId: string): Promise<number[]> {
  const m = await listMeta(); const book = await getBook(bookId); if (!book) return [];
  const at = (await listAttempts(bookId)).slice().reverse(); const state = new Map<number, boolean>();
  at.forEach((a) => a.items.forEach((it) => { if (itemBook(a, it) === bookId) state.set(it.n, it.pick !== 0 && it.pick === book.answers[it.n]); }));
  void m;
  return [...state.entries()].filter(([, ok]) => !ok).map(([n]) => n).sort((a, b) => a - b);
}

/* ---------------------------------------------------------------- small key-value (prefs store): drawings, saved PDF exams */
export async function kvGet<T = any>(k: string): Promise<T | undefined> {
  const d = await open(); const r: any = await rq(d.transaction('prefs').objectStore('prefs').get(k)); return r ? (r.v as T) : undefined;
}
export async function kvSet(k: string, v: any, silent = true): Promise<void> {
  const d = await open(); const t = d.transaction('prefs', 'readwrite'); t.objectStore('prefs').put({ k, v }); await done(t); if (!silent) changed();
}
export async function kvDel(k: string): Promise<void> { const d = await open(); const t = d.transaction('prefs', 'readwrite'); t.objectStore('prefs').delete(k); await done(t); }
export async function kvDelPrefix(prefix: string): Promise<void> { const d = await open(); const t = d.transaction('prefs', 'readwrite'); await wipePrefix(t, 'prefs', prefix); await done(t); }
export async function kvList<T = any>(prefix: string): Promise<T[]> {
  const d = await open(); const all: any[] = await rq(d.transaction('prefs').objectStore('prefs').getAll() as IDBRequest<any[]>);
  return all.filter((r) => typeof r.k === 'string' && r.k.startsWith(prefix)).map((r) => r.v as T);
}

/** A PDF exam made by the student. The PDF itself is kept here; the virtual answer sheet is filled later and graded against the key. */
export interface SavedExam {
  id: string; title: string; at: number; refs: Ref[]; renumber: boolean; minutes: number;
  picks: Record<string, number>;      // key = position in the PDF (0-based) → chosen option, 0 = none
  crossed: Record<string, number>;    // position → bit mask of struck-out options
  flags: Record<string, boolean>;     // position → «review later»
  seconds: number; status: 'new' | 'filled' | 'graded'; attemptId?: string; pct?: number; pdfSize: number;
}
export const newExamId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
export async function saveExam(e: SavedExam, pdf?: Blob, silent = false): Promise<void> {
  const d = await open(); const t = d.transaction(['prefs', 'images'], 'readwrite');
  t.objectStore('prefs').put({ k: 'exam:' + e.id, v: e }); if (pdf) t.objectStore('images').put({ k: 'pdf:' + e.id, blob: pdf });
  await done(t); if (!silent) changed();
}
export const listExams = async (): Promise<SavedExam[]> => (await kvList<SavedExam>('exam:')).sort((a, b) => b.at - a.at);
export const getExam = (id: string) => kvGet<SavedExam>('exam:' + id);
export async function examPdf(id: string): Promise<Blob | undefined> { const d = await open(); const r: any = await rq(d.transaction('images').objectStore('images').get('pdf:' + id)); return r?.blob; }
export async function deleteExam(id: string): Promise<void> {
  const d = await open(); const t = d.transaction(['prefs', 'images'], 'readwrite'); t.objectStore('prefs').delete('exam:' + id); t.objectStore('images').delete('pdf:' + id); await done(t); changed();
}
