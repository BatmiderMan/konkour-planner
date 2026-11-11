/**
 * گنجینه سؤال — the question vault.
 * Questions you got wrong (or loved) are kept as pictures + answer + notes, then come back through spaced repetition.
 * Metadata lives in IndexedDB database «planex-vault» (store `q`) and is mirrored in memory, the pictures are Blobs (store `img`).
 */
import React from 'react';
import { BY_UNIT, getTracker, toggleFlag } from '../trackerStore';
import { INTERVALS, DAY, SrsFields, isDue, isLeech, nextSrs } from './srs';
import { blobToDataUrl, dataUrlToBlob } from './image';
import { cloudHooks, safe } from '../sync/hooks';

export type VaultWhy = 'wrong' | 'guess' | 'time' | 'tricky' | 'good' | 'formula';
/** w = a mistake (red) · n = a note worth remembering (yellow) */
export const WHY: Record<VaultWhy, { l: string; g: 'w' | 'n' }> = {
  wrong: { l: 'جواب را غلط زدم', g: 'w' },
  guess: { l: 'حدسی درست زدم', g: 'w' },
  time: { l: 'وقت کم آوردم', g: 'w' },
  tricky: { l: 'سؤال تله‌دار', g: 'n' },
  good: { l: 'سؤال خوب', g: 'n' },
  formula: { l: 'نکتهٔ مهم', g: 'n' }
};
export const CAUSE: Record<'w' | 'n', Record<string, string>> = {
  w: { concept: 'مفهوم را بلد نبودم', slip: 'اشتباه سهوی', misread: 'سؤال را بد خواندم', calc: 'خطای محاسبه', forgot: 'فراموش کرده بودم' },
  n: { trick: 'ترفند حل', pattern: 'الگوی تکراری', link: 'ترکیب چند مبحث', exam: 'احتمال آمدن در امتحان' }
};
export const CAUSE_LABEL: Record<string, string> = { ...CAUSE.w, ...CAUSE.n };
export const DIFF_LABEL = ['', 'آسان', 'متوسط', 'سخت'];

/** where a question came from, when it was not photographed by hand */
export interface VaultSrc { k: 'bank'; b: string; n: number }

export interface VaultQ extends SrsFields {
  id: string;
  book: string;
  lesson: string;
  why: VaultWhy;
  cause: string;
  choices: number;
  answer: number;
  diff: number;
  etext: string;
  star: boolean;
  hasEimg: boolean;
  created: number;
  updated: number;
  /** topic-tracker units this question belongs to (see trackerStore) */
  units: string[];
  src?: VaultSrc;
}
export type VaultKind = 'q' | 'e';

export const groupOf = (q: Pick<VaultQ, 'why'>): 'w' | 'n' => WHY[q.why].g;
/** a mistake that is still open: never retried yet, or the last retry went wrong */
export const isOpenMistake = (q: VaultQ): boolean => (q.tries ? q.lastOk === false : groupOf(q) === 'w');

// ---------------------------------------------------------------- storage
const DB = 'planex-vault';
let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('q', { keyPath: 'id' }); r.result.createObjectStore('img', { keyPath: 'k' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error || new Error('پایگاه داده باز نشد')); };
  });
  return dbp;
}
const done = (t: IDBTransaction): Promise<void> => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const rq = <T,>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// ---------------------------------------------------------------- in-memory mirror + subscription
interface Snap { items: VaultQ[]; ready: boolean; failed: boolean }
let snap: Snap = { items: [], ready: false, failed: false };
const subs = new Set<() => void>();
const emit = (p: Partial<Snap>) => { snap = { ...snap, ...p }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getVault = (): Snap => snap;
export const useVault = (): Snap => React.useSyncExternalStore(subscribe, getVault);

const uid = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const newId = uid;

/** make any stored / imported record (also the standalone prototype's) a valid VaultQ */
export function normalize(raw: any): VaultQ | null {
  if (!raw || typeof raw !== 'object' || !raw.id || !String(raw.book || '').trim()) return null;
  const why: VaultWhy = raw.why && WHY[raw.why as VaultWhy] ? raw.why : raw.tag === 'nice' ? 'good' : 'wrong';
  const choices = Math.min(6, Math.max(2, Math.round(Number(raw.choices)) || 4));
  const answer = Math.round(Number(raw.answer)) || 0;
  const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const src = raw.src && raw.src.k === 'bank' && raw.src.b && Number.isFinite(Number(raw.src.n)) ? { k: 'bank' as const, b: String(raw.src.b), n: Number(raw.src.n) } : undefined;
  return {
    id: String(raw.id), book: String(raw.book).trim(), lesson: String(raw.lesson || '').trim(), why,
    cause: typeof raw.cause === 'string' && CAUSE_LABEL[raw.cause] ? raw.cause : '',
    choices, answer: answer >= 1 && answer <= choices ? answer : 0,
    diff: [0, 1, 2, 3].includes(Number(raw.diff)) ? Number(raw.diff) : 0,
    etext: String(raw.etext || ''), star: !!raw.star, hasEimg: !!raw.hasEimg || !!raw.eimg,
    created: num(raw.created) || Date.now(), updated: num(raw.updated) || num(raw.created) || Date.now(),
    tries: num(raw.tries), wins: Math.min(num(raw.wins), num(raw.tries)), box: Math.min(INTERVALS.length - 1, Math.max(0, num(raw.box))),
    due: num(raw.due), last: num(raw.last), ...(typeof raw.lastOk === 'boolean' ? { lastOk: raw.lastOk } : {}),
    units: Array.isArray(raw.units) ? raw.units.filter((u: any) => typeof u === 'string' && BY_UNIT[u]) : [],
    ...(src ? { src } : {})
  };
}

if (typeof indexedDB !== 'undefined') {
  open().then((d) => rq(d.transaction('q').objectStore('q').getAll() as IDBRequest<any[]>))
    .then((all) => emit({ items: all.map(normalize).filter((x): x is VaultQ => !!x), ready: true }))
    .catch(() => emit({ ready: true, failed: true }));
} else snap = { items: [], ready: true, failed: true };

const upsert = (q: VaultQ) => {
  const i = snap.items.findIndex((x) => x.id === q.id);
  const items = snap.items.slice();
  if (i < 0) items.push(q); else items[i] = q;
  emit({ items });
};

// ---------------------------------------------------------------- pictures
const urls = new Map<string, string>();
const imgKey = (id: string, k: VaultKind) => id + ':' + k;
const dropUrl = (id: string, k: VaultKind) => { const u = urls.get(imgKey(id, k)); if (u) { URL.revokeObjectURL(u); urls.delete(imgKey(id, k)); } };

export async function getBlob(id: string, k: VaultKind): Promise<Blob | undefined> {
  const d = await open();
  const rec: any = await rq(d.transaction('img').objectStore('img').get(imgKey(id, k)));
  return rec ? (rec.blob as Blob) : undefined;
}
/** object URL of one picture (cached while the app is open) */
export async function imageUrl(id: string, k: VaultKind): Promise<string | null> {
  const hit = urls.get(imgKey(id, k));
  if (hit) return hit;
  const b = await getBlob(id, k);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urls.set(imgKey(id, k), u);
  return u;
}
export function useVaultImage(id: string, k: VaultKind = 'q'): string | null {
  const [src, setSrc] = React.useState<string | null>(() => urls.get(imgKey(id, k)) || null);
  React.useEffect(() => {
    let live = true;
    const hit = urls.get(imgKey(id, k));
    if (hit) { setSrc(hit); return; }
    setSrc(null);
    imageUrl(id, k).then((u) => { if (live) setSrc(u); }).catch(() => { /* storage unavailable */ });
    return () => { live = false; };
  }, [id, k]);
  return src;
}

// ---------------------------------------------------------------- writes
/** blobs: q = new question picture · e = new explanation picture, null = remove it, undefined = leave as it is */
export async function putQuestion(q: VaultQ, blobs: { q?: Blob; e?: Blob | null } = {}): Promise<void> {
  await writeQuestion(q, blobs);
  safe(cloudHooks.vaultPut, q, blobs);
}

/** the same write, but without telling the cloud — used when the question itself came from the server */
export async function writeQuestion(q: VaultQ, blobs: { q?: Blob; e?: Blob | null } = {}): Promise<void> {
  const d = await open();
  const t = d.transaction(['q', 'img'], 'readwrite');
  const imgs = t.objectStore('img');
  t.objectStore('q').put(q);
  if (blobs.q) imgs.put({ k: imgKey(q.id, 'q'), blob: blobs.q });
  if (blobs.e) imgs.put({ k: imgKey(q.id, 'e'), blob: blobs.e });
  else if (blobs.e === null) imgs.delete(imgKey(q.id, 'e'));
  await done(t);
  if (blobs.q) dropUrl(q.id, 'q');
  if (blobs.e !== undefined) dropUrl(q.id, 'e');
  upsert(q);
}

/** change fields of a saved question (statistics, star …) — memory first, disk right after */
export function patchQuestion(id: string, patch: Partial<VaultQ>): void {
  const q = snap.items.find((x) => x.id === id);
  if (!q) return;
  const next = { ...q, ...patch, updated: Date.now() };
  upsert(next);
  open().then((d) => { const t = d.transaction('q', 'readwrite'); t.objectStore('q').put(next); return done(t); }).catch(() => { /* kept in memory only */ });
  safe(cloudHooks.vaultPut, next, {});
}

/** delete; the returned function puts the question back (for the undo toast) */
export async function removeQuestion(id: string): Promise<() => Promise<void>> {
  const q = snap.items.find((x) => x.id === id);
  const bq = await getBlob(id, 'q'), be = await getBlob(id, 'e');
  await eraseQuestion(id);
  safe(cloudHooks.vaultDel, id);
  // undo = a fresh save (newer `updated`, so it also beats the delete on the server)
  return async () => { if (q && bq) await putQuestion({ ...q, updated: Date.now() }, { q: bq, ...(be ? { e: be } : {}) }); };
}

/** remove locally without telling the cloud (also used when the deletion came from the server) */
export async function eraseQuestion(id: string): Promise<void> {
  const d = await open();
  const t = d.transaction(['q', 'img'], 'readwrite');
  t.objectStore('q').delete(id); t.objectStore('img').delete(imgKey(id, 'q')); t.objectStore('img').delete(imgKey(id, 'e'));
  await done(t);
  dropUrl(id, 'q'); dropUrl(id, 'e');
  emit({ items: snap.items.filter((x) => x.id !== id) });
}

// ---------------------------------------------------------------- practice log + results
const LOG = 'planex_vault_log_v1';
const dkey = (t: number) => new Date(t).toLocaleDateString('en-CA');
const readLog = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(LOG) || '{}') || {}; } catch { return {}; } };
function bump(): void {
  const l = readLog(), k = dkey(Date.now());
  l[k] = (l[k] || 0) + 1;
  try { localStorage.setItem(LOG, JSON.stringify(l)); } catch { /* storage full */ }
}
export const practiceLog = readLog;
export const practicedToday = (): number => readLog()[dkey(Date.now())] || 0;
/** consecutive days with at least one reviewed question (today may still be empty) */
export function vaultStreak(): number {
  const l = readLog();
  let n = 0, d = Date.now();
  if (!l[dkey(d)]) d -= DAY;
  while (l[dkey(d)]) { n++; d -= DAY; }
  return n;
}

/** one answered question: Leitner box moves, the date of the next review is set, wrong answers flag their topic in the tracker */
export function recordResult(id: string, win: boolean): void {
  const q = snap.items.find((x) => x.id === id);
  if (!q) return;
  patchQuestion(id, nextSrs(q, win));
  bump();
  if (!win) q.units.forEach((u) => { if (BY_UNIT[u] && !getTracker().flags[u]) toggleFlag(u); });
}

// ---------------------------------------------------------------- queries
export const dueOf = (items: VaultQ[], now = Date.now()): VaultQ[] => items.filter((q) => isDue(q, now)).sort((a, b) => a.due - b.due);
export const findBySrc = (b: string, n: number): VaultQ | undefined => snap.items.find((q) => q.src && q.src.b === b && q.src.n === n);
export const countForUnit = (items: VaultQ[], u: string): number => items.filter((q) => q.units.includes(u)).length;

export interface WeakArea { book: string; open: number; total: number; leeches: number; units: string[] }
/** where the open mistakes pile up, worst first */
export function weakAreas(items: VaultQ[], limit = 3): WeakArea[] {
  const m = new Map<string, WeakArea>();
  items.forEach((q) => {
    const a = m.get(q.book) || { book: q.book, open: 0, total: 0, leeches: 0, units: [] };
    a.total++;
    if (isOpenMistake(q)) { a.open++; q.units.forEach((u) => { if (!a.units.includes(u)) a.units.push(u); }); }
    if (isLeech(q)) a.leeches++;
    m.set(q.book, a);
  });
  return [...m.values()].filter((a) => a.open > 0).sort((a, b) => b.open + b.leeches * 2 - (a.open + a.leeches * 2)).slice(0, limit);
}

// ---------------------------------------------------------------- backup
export async function exportBackup(): Promise<Blob> {
  const out: any[] = [];
  for (const q of snap.items) {
    const bq = await getBlob(q.id, 'q'), be = q.hasEimg ? await getBlob(q.id, 'e') : undefined;
    if (!bq) continue;
    out.push({ ...q, img: await blobToDataUrl(bq), ...(be ? { eimg: await blobToDataUrl(be) } : {}) });
  }
  return new Blob([JSON.stringify({ app: 'planex-vault', v: 3, items: out })], { type: 'application/json;charset=utf-8' });
}

/** accepts this app's backup and the standalone «گنجینه سؤال» file; returns how many questions were restored */
export async function importBackup(text: string): Promise<number> {
  const d = JSON.parse(text);
  const list: any[] = Array.isArray(d) ? d : d && Array.isArray(d.items) ? d.items : [];
  let n = 0;
  for (const raw of list) {
    const q = normalize(raw);
    const bq = raw && typeof raw.img === 'string' ? dataUrlToBlob(raw.img) : null;
    if (!q || !bq) continue;
    const be = typeof raw.eimg === 'string' ? dataUrlToBlob(raw.eimg) : null;
    await putQuestion({ ...q, hasEimg: !!be }, { q: bq, e: be });
    n++;
  }
  if (!n) throw new Error('این فایل پشتیبان معتبر نیست.');
  return n;
}

export { isDue, isLeech };
