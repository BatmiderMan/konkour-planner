/**
 * Storage of the answer library.
 *
 *  - Books (answer keys), scans (history) and saved sheets (my own answers, scanned or typed) live in IndexedDB — no 5 MB limit, no blocking the UI thread on start.
 *  - A tiny index of book names is mirrored in localStorage, so the library list paints instantly and the keys of a
 *    book are only read from the database when somebody opens it (then cached in memory).
 *  - If IndexedDB is not available (private mode, old WebView) everything transparently falls back to one localStorage blob.
 *  - A key costs one character on disk («2343423…» per run of consecutive questions).
 */
import { Book, BookMeta, KeyMap, SavedSheet, ScanRecord, metaOf, newId, makeBook } from './model';

const DB_NAME = 'planex-checker', DB_VER = 2; // v2: added the «sheets» store (my own answer sheets)
const META_KEY = 'planex_ck_meta_v1';
const FALLBACK_KEY = 'planex_ck_fallback_v1';
const PREFS_KEY = 'planex_ck_prefs_v1';
const CHOICE_KEY = 'planex_ck_choice_v1';
export const CK_EVENT = 'planex:ck-changed';

/* ---------------------------------------------------------------- backends */
interface Backend {
  get<T>(store: string, id: string): Promise<T | undefined>;
  put(store: string, value: { id: string }): Promise<void>;
  del(store: string, id: string): Promise<void>;
  all<T>(store: string): Promise<T[]>;
  keys(store: string): Promise<string[]>;
}

const req = <T,>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

function idbBackend(db: IDBDatabase): Backend {
  const st = (name: string, mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name);
  return {
    get: (s, id) => req(st(s, 'readonly').get(id)) as Promise<any>,
    put: async (s, v) => { await req(st(s, 'readwrite').put(v)); },
    del: async (s, id) => { await req(st(s, 'readwrite').delete(id)); },
    all: (s) => req(st(s, 'readonly').getAll()) as Promise<any[]>,
    keys: async (s) => (await req(st(s, 'readonly').getAllKeys())).map(String)
  };
}

function lsBackend(): Backend {
  const read = (): Record<string, Record<string, any>> => { try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{}'); } catch (e) { return {}; } };
  const write = (d: Record<string, Record<string, any>>) => { try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(d)); } catch (e) { /* full */ } };
  return {
    get: async (s, id) => read()[s]?.[id],
    put: async (s, v) => { const d = read(); (d[s] = d[s] || {})[v.id] = v; write(d); },
    del: async (s, id) => { const d = read(); if (d[s]) delete d[s][id]; write(d); },
    all: async (s) => Object.values(read()[s] || {}),
    keys: async (s) => Object.keys(read()[s] || {})
  };
}

let backendP: Promise<Backend> | null = null;
function backend(): Promise<Backend> {
  if (!backendP) {
    backendP = new Promise<Backend>((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(lsBackend());
        const r = indexedDB.open(DB_NAME, DB_VER);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('scans')) d.createObjectStore('scans', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('sheets')) d.createObjectStore('sheets', { keyPath: 'id' });
        };
        r.onsuccess = () => resolve(idbBackend(r.result));
        r.onerror = () => resolve(lsBackend());
        r.onblocked = () => resolve(lsBackend());
      } catch (e) { resolve(lsBackend()); }
    });
  }
  return backendP;
}

/* ---------------------------------------------------------------- change notifications */
const emit = () => { try { window.dispatchEvent(new Event(CK_EVENT)); } catch (e) { /* ignore */ } };

/* ---------------------------------------------------------------- book index (instant, synchronous) */
let metaCache: BookMeta[] | null = null;
export function booksIndex(): BookMeta[] {
  if (metaCache) return metaCache;
  try { const r = localStorage.getItem(META_KEY); metaCache = r ? (JSON.parse(r) as BookMeta[]) : []; } catch (e) { metaCache = []; }
  return metaCache;
}
function setIndex(list: BookMeta[]) {
  metaCache = list.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  try { localStorage.setItem(META_KEY, JSON.stringify(metaCache)); } catch (e) { /* ignore */ }
}

/* ---------------------------------------------------------------- books */
const bookCache = new Map<string, Book>();
const inflight = new Map<string, Promise<Book | undefined>>();

/** Keys of one book. First call reads the database, later calls come from memory. */
export function getBook(id: string): Promise<Book | undefined> {
  const hit = bookCache.get(id); if (hit) return Promise.resolve(hit);
  const run = inflight.get(id); if (run) return run;
  const p = backend().then((b) => b.get<Book>('books', id)).then((bk) => { if (bk) bookCache.set(id, bk); inflight.delete(id); return bk; });
  inflight.set(id, p); return p;
}
export async function saveBook(book: Book): Promise<Book> {
  const b = await backend(); await b.put('books', book);
  bookCache.set(book.id, book);
  setIndex([...booksIndex().filter((m) => m.id !== book.id), metaOf(book)]);
  emit(); return book;
}
export async function deleteBook(id: string): Promise<void> {
  const b = await backend(); await b.del('books', id);
  bookCache.delete(id); setIndex(booksIndex().filter((m) => m.id !== id));
  emit();
}
export async function keysOf(id: string | undefined): Promise<KeyMap | null> {
  if (!id) return null; const bk = await getBook(id); return bk ? KeyMap.fromSegs(bk.segs) : null;
}

/** Makes sure the index matches the database (first start, restored backup, cleared localStorage). Cheap: only ids are compared. */
export async function syncIndex(): Promise<BookMeta[]> {
  const b = await backend();
  const ids = await b.keys('books'); const idx = booksIndex();
  const same = ids.length === idx.length && ids.every((i) => idx.some((m) => m.id === i));
  if (!same) { const all = await b.all<Book>('books'); setIndex(all.map(metaOf)); emit(); }
  return booksIndex();
}

/* ---------------------------------------------------------------- scans (history) */
let scanCache: ScanRecord[] | null = null;
export async function listScans(): Promise<ScanRecord[]> {
  if (scanCache) return scanCache;
  const b = await backend(); const all = await b.all<ScanRecord>('scans');
  scanCache = all.sort((x, y) => y.at - x.at); return scanCache;
}
export async function saveScan(rec: ScanRecord): Promise<void> {
  const b = await backend(); await b.put('scans', rec);
  const cur = await listScans();
  scanCache = [rec, ...cur.filter((s) => s.id !== rec.id)].sort((x, y) => y.at - x.at);
  emit();
}
export async function deleteScan(id: string): Promise<void> {
  const b = await backend(); await b.del('scans', id);
  scanCache = (await listScans()).filter((s) => s.id !== id); emit();
}
/** scans attached to one report part */
export async function scansFor(link: { dayId?: string; dateKey?: string; blockIndex?: number }): Promise<ScanRecord[]> {
  return (await listScans()).filter((s) => s.link && s.link.blockIndex === link.blockIndex && ((link.dayId && s.link.dayId === link.dayId) || (link.dateKey && s.link.dateKey === link.dateKey)));
}

/* ---------------------------------------------------------------- saved sheets (my own answers) */
let sheetCache: SavedSheet[] | null = null;
const bySheetNewest = (a: SavedSheet, b: SavedSheet) => b.updatedAt - a.updatedAt;
export async function listSheets(): Promise<SavedSheet[]> {
  if (sheetCache) return sheetCache;
  const b = await backend(); const all = await b.all<SavedSheet>('sheets');
  sheetCache = all.sort(bySheetNewest); return sheetCache;
}
export async function getSheet(id: string): Promise<SavedSheet | undefined> { return (await listSheets()).find((s) => s.id === id); }
/** `silent` skips the change notification — used while somebody is tapping answers, so the lists behind do not redraw on every tap. */
export async function saveSheet(rec: SavedSheet, opts: { silent?: boolean } = {}): Promise<SavedSheet> {
  const cur = await listSheets();
  sheetCache = [rec, ...cur.filter((s) => s.id !== rec.id)].sort(bySheetNewest);
  const b = await backend(); await b.put('sheets', rec);
  if (!opts.silent) emit();
  return rec;
}
export async function deleteSheet(id: string): Promise<void> {
  const b = await backend(); await b.del('sheets', id);
  sheetCache = (await listSheets()).filter((s) => s.id !== id); emit();
}
/** the notification that was skipped by silent saves */
export const notifyChanged = emit;

/* ---------------------------------------------------------------- preferences + remembered choices */
export interface Prefs { sensitivity: number; penalty: 0 | 3 | 4; dblWrong: boolean; rtl: boolean }
export const DEFAULT_PREFS: Prefs = { sensitivity: 43, penalty: 3, dblWrong: false, rtl: true };
export function loadPrefs(): Prefs { try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch (e) { return { ...DEFAULT_PREFS }; } }
export function savePrefs(p: Prefs): void { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } }

const choiceKey = (h: { source?: string; lesson?: string }) => (h.source || '') + '|' + (h.lesson || '');
export function recallChoice(h: { source?: string; lesson?: string }): { bookId: string; startQ?: number } | null {
  try { const m = JSON.parse(localStorage.getItem(CHOICE_KEY) || '{}'); return m[choiceKey(h)] || null; } catch (e) { return null; }
}
export function rememberChoice(h: { source?: string; lesson?: string }, bookId: string, startQ?: number): void {
  if (!h.source && !h.lesson) return;
  try { const m = JSON.parse(localStorage.getItem(CHOICE_KEY) || '{}'); m[choiceKey(h)] = { bookId, startQ }; localStorage.setItem(CHOICE_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
}

/* ---------------------------------------------------------------- export / import */
export interface LibraryFile { format: 'planex-checker'; v: 1; exportedAt: number; books: Book[]; scans?: ScanRecord[]; sheets?: SavedSheet[] }

export async function exportLibrary(opts: { bookIds?: string[]; withScans?: boolean; withSheets?: boolean } = {}): Promise<LibraryFile> {
  const ids = opts.bookIds || booksIndex().map((m) => m.id);
  const books = (await Promise.all(ids.map(getBook))).filter(Boolean) as Book[];
  return { format: 'planex-checker', v: 1, exportedAt: Date.now(), books, ...(opts.withScans ? { scans: await listScans() } : {}), ...(opts.withSheets ? { sheets: await listSheets() } : {}) };
}

export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** accepts our own export, a single book, or the old checker's «saved key sets» ([{name, keys:{n:d}}]) */
export async function importLibrary(text: string): Promise<{ books: number; scans: number; sheets: number }> {
  const raw = JSON.parse(text);
  const incoming: Book[] = []; let scans: ScanRecord[] = []; let sheets: SavedSheet[] = [];
  if (raw && raw.format === 'planex-checker' && Array.isArray(raw.books)) { incoming.push(...raw.books); scans = raw.scans || []; sheets = raw.sheets || []; }
  else if (raw && Array.isArray(raw.segs)) incoming.push(raw as Book);
  else if (Array.isArray(raw)) raw.forEach((x: any) => { if (x && x.name && x.keys) incoming.push(makeBook(String(x.name), KeyMap.fromRecord(x.keys))); });
  else throw new Error('فایل شناخته نشد');
  let nb = 0;
  for (const bk of incoming) {
    if (!bk || !bk.id || !Array.isArray(bk.segs)) continue;
    const cur = await getBook(bk.id);
    if (cur && cur.updatedAt >= bk.updatedAt) continue; // keep the newer copy
    await saveBook({ ...bk, weak: bk.weak || [] }); nb++;
  }
  let ns = 0; const have = new Set((await listScans()).map((s) => s.id));
  for (const sc of scans) { if (sc && sc.id && !have.has(sc.id)) { await saveScan(sc); ns++; } }
  let nh = 0; const mine = new Map((await listSheets()).map((x): [string, SavedSheet] => [x.id, x]));
  for (const sh of sheets) {
    if (!sh || !sh.id || typeof sh.sheet !== 'string') continue;
    const cur = mine.get(sh.id); if (cur && cur.updatedAt >= sh.updatedAt) continue; // keep the newer copy
    await saveSheet(sh); nh++;
  }
  return { books: nb, scans: ns, sheets: nh };
}

/** one-time pull of the key sets saved by the standalone checker (only possible when both lived on the same address) */
export async function migrateLegacy(): Promise<number> {
  const FLAG = 'planex_ck_legacy_done';
  try {
    if (localStorage.getItem(FLAG)) return 0;
    localStorage.setItem(FLAG, '1');
    const sets = JSON.parse(localStorage.getItem('pasokhbarg.sets') || '[]'); let n = 0;
    for (const x of sets) if (x && x.name && x.keys) { await saveBook(makeBook(String(x.name), KeyMap.fromRecord(x.keys))); n++; }
    return n;
  } catch (e) { return 0; }
}

export { newId };
