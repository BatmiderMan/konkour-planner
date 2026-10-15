/** Storage of the question bank: books, question images and exam attempts live in IndexedDB (database «planex-bank»). */
import { Pack } from './pack';

export interface BankBook {
  id: string; title: string; subject?: string; total: number; importedAt: number; created?: string;
  numbers: number[];                       // tests that have an image, ascending
  answers: Record<number, number>;         // every known answer (also tests without image)
}
export interface AttemptItem { n: number; pick: number }   // pick 0 = left blank
export interface Attempt {
  id: string; bookId: string; at: number; seconds: number; items: AttemptItem[];
  correct: number; wrong: number; blank: number; pct: number; mode: string;
}
export const BANK_EVENT = 'planex:bank-changed';

const DB = 'planex-bank';
let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('books', { keyPath: 'id' });
      d.createObjectStore('images', { keyPath: 'k' });
      d.createObjectStore('attempts', { keyPath: 'id' });
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
const imgKey = (bookId: string, n: number) => bookId + ':' + n;

export async function listBooks(): Promise<BankBook[]> {
  const d = await open(); const all = await rq(d.transaction('books').objectStore('books').getAll() as IDBRequest<BankBook[]>);
  return all.sort((a, b) => b.importedAt - a.importedAt);
}
export async function getBook(id: string): Promise<BankBook | undefined> {
  const d = await open(); return rq(d.transaction('books').objectStore('books').get(id) as IDBRequest<BankBook | undefined>);
}

/** import (or replace) a book; returns how many images were stored */
export async function importPack(p: Pack, onProgress?: (done: number, total: number) => void): Promise<BankBook> {
  const h = p.header, d = await open();
  await removeBook(h.id, true);
  const answers: Record<number, number> = {};
  h.questions.forEach((q) => { answers[q.n] = q.a; });
  (h.keyOnly || []).forEach((k) => { answers[k.n] = k.a; });
  const book: BankBook = { id: h.id, title: h.title, subject: h.subject, total: h.total, importedAt: Date.now(), created: h.created, numbers: h.questions.map((q) => q.n).sort((a, b) => a - b), answers };
  const CH = 60;
  for (let i = 0; i < h.questions.length; i += CH) {
    const t = d.transaction('images', 'readwrite'), s = t.objectStore('images');
    h.questions.slice(i, i + CH).forEach((q) => s.put({ k: imgKey(h.id, q.n), bookId: h.id, n: q.n, w: q.w, h: q.h, blob: p.image(q) }));
    await done(t); onProgress?.(Math.min(h.questions.length, i + CH), h.questions.length);
  }
  const t = d.transaction('books', 'readwrite'); t.objectStore('books').put(book); await done(t);
  changed(); return book;
}

export async function removeBook(id: string, keepAttempts = false): Promise<void> {
  const d = await open();
  const t = d.transaction(['images', 'books', 'attempts'], 'readwrite');
  const imgs = t.objectStore('images'); const cur = imgs.openKeyCursor();
  await new Promise<void>((res, rej) => { cur.onsuccess = () => { const c = cur.result; if (!c) return res(); if (String(c.key).startsWith(id + ':')) imgs.delete(c.key); c.continue(); }; cur.onerror = () => rej(cur.error); });
  t.objectStore('books').delete(id);
  if (!keepAttempts) {
    const at = t.objectStore('attempts'); const ac = at.openCursor();
    await new Promise<void>((res, rej) => { ac.onsuccess = () => { const c = ac.result; if (!c) return res(); if ((c.value as Attempt).bookId === id) c.delete(); c.continue(); }; ac.onerror = () => rej(ac.error); });
  }
  await done(t); changed();
  urls.forEach((u, k) => { if (k.startsWith(id + ':')) { URL.revokeObjectURL(u); urls.delete(k); } });
}

/** object URL of one question image (cached for the session) */
export async function imageUrl(bookId: string, n: number): Promise<string | null> {
  const k = imgKey(bookId, n); const hit = urls.get(k); if (hit) return hit;
  const d = await open(); const rec: any = await rq(d.transaction('images').objectStore('images').get(k));
  if (!rec) return null; const u = URL.createObjectURL(rec.blob); urls.set(k, u); return u;
}

export async function saveAttempt(a: Attempt): Promise<void> {
  const d = await open(); const t = d.transaction('attempts', 'readwrite'); t.objectStore('attempts').put(a); await done(t); changed();
}
export async function listAttempts(bookId?: string): Promise<Attempt[]> {
  const d = await open(); const all = await rq(d.transaction('attempts').objectStore('attempts').getAll() as IDBRequest<Attempt[]>);
  return all.filter((a) => !bookId || a.bookId === bookId).sort((a, b) => b.at - a.at);
}
export async function deleteAttempt(id: string): Promise<void> {
  const d = await open(); const t = d.transaction('attempts', 'readwrite'); t.objectStore('attempts').delete(id); await done(t); changed();
}
/** tests of a book that were answered wrongly (or left blank) in the LAST attempt that included them */
export async function weakTests(bookId: string): Promise<number[]> {
  const at = (await listAttempts(bookId)).slice().reverse(); // oldest first, newest overwrites
  const state = new Map<number, boolean>();
  at.forEach((a) => a.items.forEach((it) => state.set(it.n, false)));
  const book = await getBook(bookId); if (!book) return [];
  at.forEach((a) => a.items.forEach((it) => state.set(it.n, it.pick !== 0 && it.pick === book.answers[it.n])));
  return [...state.entries()].filter(([, ok]) => !ok).map(([n]) => n).sort((a, b) => a - b);
}
export const konkurPct = (correct: number, wrong: number, total: number) => (total ? Math.round(((3 * correct - wrong) / (3 * total)) * 1000) / 10 : 0);
