/**
 * Settings / planner / tracker / exams … everything the app keeps in localStorage is mirrored to the table `user_data`
 * (one row per key). Writes are caught by wrapping localStorage.setItem/removeItem, so none of the existing stores had to change.
 * Conflicts: the newest write of a key wins (per key). A value that loses is copied to `planex_sync_conflicts_v1`, so nothing is lost silently.
 */
import { supabase } from '../supabase';

const META = 'planex_sync_meta_v1';
const BACKUP = 'planex_sync_conflicts_v1';
const KEEP = /^(konkour|planex)_/;
// never synced: login data, this-device-only state, things rebuilt from IndexedDB, and the music library (audio files live on the device)
const EXCLUDE = /session|token|auth|nav_last|live_plan|^planex_sync|ck_meta|ck_fallback|^planex_music_v1$|haptics|print_saver|vault_last|tracker_ui|planner_sub|_full$|current_day_id|konkour_theme|sleep_enabled/i;
export const isSynced = (k: string): boolean => KEEP.test(k) && !EXCLUDE.test(k);

interface Meta { t: number; p?: 1; d?: 1 }
interface Row { key: string; value: string | null; deleted: boolean; updated_at: number }

let meta: Record<string, Meta> = {};
let uid: string | null = null;
let applying = false;
let installed = false;
let pushTimer: any = null, metaTimer: any = null, retryTimer: any = null;
let pushing = false, again = false;

const proto = typeof Storage !== 'undefined' ? Storage.prototype : null;
const rawGet = proto ? proto.getItem : (null as any);
const rawSet = proto ? proto.setItem : (null as any);
const rawRemove = proto ? proto.removeItem : (null as any);
const lsGet = (k: string): string | null => { try { return rawGet.call(localStorage, k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { rawSet.call(localStorage, k, v); } catch { /* full */ } };

export type KvListener = (keys: string[]) => void;
const listeners = new Set<KvListener>();
export const onRemoteKeys = (f: KvListener) => { listeners.add(f); return () => { listeners.delete(f); }; };
let onStatus: (s: { saving?: boolean; error?: string | null; pending?: number }) => void = () => {};
export const setKvStatusHandler = (f: typeof onStatus) => { onStatus = f; };

function loadMeta() { try { meta = JSON.parse(lsGet(META) || '{}') || {}; } catch { meta = {}; } }
function saveMetaSoon() { clearTimeout(metaTimer); metaTimer = setTimeout(() => lsSet(META, JSON.stringify(meta)), 400); }
export const pendingCount = () => Object.keys(meta).filter((k) => meta[k].p).length;

function touch(k: string, deleted: boolean) {
  meta[k] = { t: Date.now(), p: 1, ...(deleted ? { d: 1 as const } : {}) };
  saveMetaSoon();
  if (uid) schedulePush();
}

/** start watching localStorage writes (safe to call twice) */
export function installKvHook() {
  if (installed || !proto) return;
  installed = true;
  loadMeta();
  proto.setItem = function (this: Storage, k: string, v: string) {
    const track = this === localStorage && !applying && isSynced(k);
    const prev = track ? rawGet.call(this, k) : null;
    rawSet.call(this, k, v);
    if (track && String(v) !== prev) touch(k, false);
  };
  proto.removeItem = function (this: Storage, k: string) {
    const track = this === localStorage && !applying && isSynced(k);
    const had = track ? rawGet.call(this, k) !== null : false;
    rawRemove.call(this, k);
    if (track && had) touch(k, true);
  };
}

export function setKvUser(id: string | null) {
  uid = id;
  if (!id) { clearTimeout(pushTimer); }
}
export function resetKvMeta() { meta = {}; lsSet(META, '{}'); }

// ---------------------------------------------------------------- push
function schedulePush(delay = 1500) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void pushKv(); }, delay);
}

export async function pushKv(): Promise<boolean> {
  if (!uid) return false;
  if (pushing) { again = true; return false; }
  const keys = Object.keys(meta).filter((k) => meta[k].p && isSynced(k));
  if (!keys.length) { onStatus({ pending: 0 }); return true; }
  pushing = true; onStatus({ saving: true, pending: keys.length });
  let ok = true;
  try {
    for (let i = 0; i < keys.length; i += 40) {
      const chunk = keys.slice(i, i + 40);
      const sent: Record<string, number> = {};
      const rows: Row[] & { user_id?: string }[] = chunk.map((k) => {
        const m = meta[k]; const v = m.d ? null : lsGet(k);
        sent[k] = m.t;
        return { user_id: uid, key: k, value: v, deleted: !!m.d || v === null, updated_at: m.t } as any;
      });
      const r = await supabase.upsert('user_data', rows, 'user_id,key');
      if (r.error) throw new Error(r.error);
      chunk.forEach((k) => { if (meta[k] && meta[k].t === sent[k]) delete meta[k].p; });
      saveMetaSoon();
    }
    onStatus({ saving: false, error: null, pending: pendingCount() });
  } catch (e: any) {
    ok = false;
    onStatus({ saving: false, error: String(e?.message || e), pending: pendingCount() });
    clearTimeout(retryTimer); retryTimer = setTimeout(() => schedulePush(0), 20000);
  } finally {
    pushing = false;
    if (again) { again = false; schedulePush(300); }
  }
  return ok;
}

// ---------------------------------------------------------------- apply remote values
function stash(k: string, value: string) {
  try {
    const b = JSON.parse(lsGet(BACKUP) || '{}');
    b[k] = { value, at: Date.now() };
    const ks = Object.keys(b).sort((x, y) => b[y].at - b[x].at).slice(0, 30);
    const out: Record<string, unknown> = {}; ks.forEach((x) => { out[x] = b[x]; });
    lsSet(BACKUP, JSON.stringify(out));
  } catch { /* ignore */ }
}

const INDEX_KEY = 'konkour_days_index_v2';
const DAY_PREFIX = 'konkour_day_data_v2:';

/** the list of days is a shared list: when two devices edited it, keep both devices' days instead of one list winning */
function mergeIndex(a: string, b: string): string | null {
  try {
    const x = JSON.parse(a), y = JSON.parse(b);
    if (!Array.isArray(x) || !Array.isArray(y)) return null;
    const by = new Map<string, any>();
    [...x, ...y].forEach((e: any) => {
      if (!e || !e.id) return;
      if (meta[DAY_PREFIX + e.id]?.d) return; // deleted on this device
      const old = by.get(e.id);
      if (!old || (e.updatedAt || 0) > (old.updatedAt || 0)) by.set(e.id, e);
    });
    return JSON.stringify([...by.values()].sort((p, q) => (q.updatedAt || 0) - (p.updatedAt || 0)));
  } catch { return null; }
}

/** returns true when localStorage really changed */
export function applyRemoteKv(rec: Row): boolean {
  const k = rec.key;
  if (!isSynced(k)) return false;
  const m = meta[k];
  if (k === INDEX_KEY && m?.p && !rec.deleted && typeof rec.value === 'string') {
    const cur = lsGet(k);
    const merged = cur !== null && cur !== rec.value ? mergeIndex(cur, rec.value) : null;
    if (merged !== null) {
      if (merged !== cur) { applying = true; try { rawSet.call(localStorage, k, merged); } catch { /* full */ } finally { applying = false; } }
      meta[k] = { t: Math.max(Date.now(), rec.updated_at + 1), p: 1 }; saveMetaSoon();
      if (uid) schedulePush();
      return merged !== cur;
    }
  }
  if (m && m.t >= rec.updated_at) return false; // our copy is as new or newer: the push will settle it
  const cur = lsGet(k);
  if (rec.deleted || rec.value === null) {
    meta[k] = { t: rec.updated_at }; saveMetaSoon();
    if (cur === null) return false;
    if (!m || m.p) stash(k, cur);
    applying = true; try { rawRemove.call(localStorage, k); } finally { applying = false; }
    return true;
  }
  if (cur === rec.value) { meta[k] = { t: rec.updated_at }; saveMetaSoon(); return false; }
  if (cur !== null && (!m || m.p)) stash(k, cur);
  applying = true; try { rawSet.call(localStorage, k, rec.value); } catch { applying = false; return false; } finally { applying = false; }
  meta[k] = { t: rec.updated_at }; saveMetaSoon();
  return true;
}

export function announce(keys: string[]) {
  if (keys.length) listeners.forEach((f) => { try { f(keys); } catch { /* ignore */ } });
}

/** a realtime event: use the row it carries, or fetch it when the server left the big value out */
export async function handleRealtimeKv(rec: Partial<Row> & { key?: string }): Promise<void> {
  if (!rec || !rec.key || !isSynced(rec.key)) return;
  let row = rec as Row;
  if (typeof rec.value !== 'string' && !rec.deleted) {
    const r = await supabase.select<Row>('user_data', `select=key,value,deleted,updated_at&key=eq.${encodeURIComponent(rec.key)}`);
    if (!r.data || !r.data[0]) return;
    row = r.data[0];
  }
  if (applyRemoteKv(row)) announce([row.key]);
}

// ---------------------------------------------------------------- full reconcile (start-up, back online, every few minutes)
export async function reconcileKv(): Promise<string[]> {
  if (!uid) return [];
  const list = await supabase.selectAll<{ key: string; updated_at: number; deleted: boolean }>('user_data', 'select=key,updated_at,deleted&order=key.asc');
  if (list.error || !list.data) throw new Error(list.error || 'list failed');
  const remote = new Map(list.data.map((r) => [r.key, r]));
  const need: string[] = [];
  for (const r of list.data) {
    if (!isSynced(r.key)) continue;
    const m = meta[r.key];
    if (m && m.t >= r.updated_at && !(r.key === INDEX_KEY && m.p)) continue;
    if (!m && lsGet(r.key) === null && r.deleted) { meta[r.key] = { t: r.updated_at }; continue; }
    need.push(r.key);
  }
  // local keys the server has never seen (or lost) → push them
  const localKeys: string[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && isSynced(k)) localKeys.push(k); } } catch { /* ignore */ }
  for (const k of localKeys) {
    if (remote.has(k)) continue;
    meta[k] = meta[k] ? { ...meta[k], p: 1 } : { t: Date.now(), p: 1 };
  }
  for (const k of Object.keys(meta)) { if (meta[k].d && !remote.has(k)) meta[k].p = 1; }

  const changed: string[] = [];
  for (let i = 0; i < need.length; i += 25) {
    const chunk = need.slice(i, i + 25);
    const q = chunk.map((k) => '"' + k.replace(/"/g, '\\"') + '"').join(',');
    const r = await supabase.select<Row>('user_data', `select=key,value,deleted,updated_at&key=in.(${encodeURIComponent(q)})`);
    if (r.error || !r.data) throw new Error(r.error || 'fetch failed');
    r.data.forEach((row) => { if (applyRemoteKv(row)) changed.push(row.key); });
  }
  saveMetaSoon();
  await pushKv();
  return changed;
}
