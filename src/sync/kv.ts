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
const EXCLUDE = /session|token|auth|nav_last|live_plan|^planex_sync|ck_meta|ck_fallback|^planex_music_v1$|haptics|print_saver|vault_last|tracker_ui|planner_sub|_full$|current_day_id|konkour_theme|sleep_enabled|beast_run|beast_cal/i;
export const isSynced = (k: string): boolean => KEEP.test(k) && !EXCLUDE.test(k);

interface Meta { t: number; p?: 1; d?: 1 }
interface Row { key: string; value: string | null; deleted: boolean; updated_at: number; device?: string | null }

/** who wrote a row: lets a device recognise its own echoes and merge only with OTHER devices' edits */
const DEVICE_KEY = 'planex_sync_device_v1';
export const DEVICE: string = (() => {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) { d = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem(DEVICE_KEY, d); }
    return d;
  } catch { return 'd-unknown'; }
})();
let deviceColumn = true; // becomes false if the server table has not got the `device` column yet (older setup.sql)

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
function saveMetaNow() { clearTimeout(metaTimer); lsSet(META, JSON.stringify(meta)); }
function saveMetaSoon() { clearTimeout(metaTimer); metaTimer = setTimeout(() => lsSet(META, JSON.stringify(meta)), 400); }
export const pendingCount = () => Object.keys(meta).filter((k) => meta[k].p).length;

function touch(k: string, deleted: boolean) {
  meta[k] = { t: Date.now(), p: 1, ...(deleted ? { d: 1 as const } : {}) };
  saveMetaNow(); // synchronous: closing the tab a moment after an edit must not forget that the edit is unsent
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

export const flushKvMeta = saveMetaNow;
export const kvDiagnostics = () => ({ pending: pendingCount(), tracked: Object.keys(meta).length, deviceColumn, device: DEVICE });
/** «send everything»: treat every synced key of this device as changed, then push */
export function markAllPending(): number {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isSynced(k)) { meta[k] = { t: Date.now(), p: 1 }; n++; }
    }
  } catch { /* ignore */ }
  saveMetaNow();
  return n;
}

export function setKvUser(id: string | null) {
  uid = id;
  if (!id) { clearTimeout(pushTimer); }
}
export function resetKvMeta() { meta = {}; lsSet(META, '{}'); }

// ---------------------------------------------------------------- push
function schedulePush(delay = 300) {
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
        return { user_id: uid, key: k, value: v, deleted: !!m.d || v === null, updated_at: m.t, ...(deviceColumn ? { device: DEVICE } : {}) } as any;
      });
      let r = await supabase.upsert('user_data', rows, 'user_id,key');
      if (r.error && deviceColumn && /device/i.test(r.error)) { // server not updated yet: carry on without the column
        deviceColumn = false;
        r = await supabase.upsert('user_data', rows.map((x: any) => { const { device, ...rest } = x; return rest; }), 'user_id,key');
      }
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
const PLANNER_KEY = 'konkour_planner_data_v1';
const EXAMS_KEY = 'konkour_exams_v2';
const PRESETS_KEY = 'konkour_week_presets_v1';

const idsOf = (x: any): Set<string> => new Set((Array.isArray(x) ? x : []).map((e: any) => e && e.id).filter(Boolean));

/**
 * Two devices changed the same big key while apart (e.g. one was offline). Instead of one copy replacing the other,
 * both devices' additions are kept: start from the NEWER copy and add what only the other copy has.
 * (Without a common ancestor a deletion on one side can't be told from an addition on the other, so a deleted item may come back — never lost.)
 */
const MERGE: Record<string, (win: any, lose: any) => any> = {
  [INDEX_KEY]: (win, lose) => {
    if (!Array.isArray(win) || !Array.isArray(lose)) return null;
    const ids = idsOf(win);
    const extra = lose.filter((e: any) => e && e.id && !ids.has(e.id) && !meta[DAY_PREFIX + e.id]?.d);
    return [...win, ...extra].sort((p: any, q: any) => (q.updatedAt || 0) - (p.updatedAt || 0));
  },
  [PRESETS_KEY]: (win, lose) => {
    if (!Array.isArray(win) || !Array.isArray(lose)) return null;
    const ids = idsOf(win);
    return [...win, ...lose.filter((e: any) => e && e.id && !ids.has(e.id))];
  },
  [EXAMS_KEY]: (win, lose) => {
    if (!Array.isArray(win) || !Array.isArray(lose)) return null;
    const ids = idsOf(win);
    return [...win, ...lose.filter((e: any) => e && e.id && !ids.has(e.id))];
  },
  [PLANNER_KEY]: (win, lose) => {
    if (!win || !lose || typeof win !== 'object' || typeof lose !== 'object') return null;
    const out = JSON.parse(JSON.stringify(win));
    out.items = out.items || {};
    const have = new Set<string>();
    Object.keys(out.items).forEach((d) => (out.items[d] || []).forEach((it: any) => it && it.id && have.add(it.id)));
    Object.keys(lose.items || {}).forEach((d) => {
      (lose.items[d] || []).forEach((it: any) => { if (it && it.id && !have.has(it.id)) { (out.items[d] = out.items[d] || []).push(it); have.add(it.id); } });
    });
    ['sourceColors', 'sourceTypes', 'timeline', 'dayRests'].forEach((f) => {
      if (lose[f] && typeof lose[f] === 'object') out[f] = { ...lose[f], ...(out[f] || {}) };
    });
    return out;
  }
};
const isMergeable = (k: string) => Object.prototype.hasOwnProperty.call(MERGE, k);

function tryMerge(k: string, local: string, remote: string, remoteWins: boolean): string | null {
  try {
    const l = JSON.parse(local), r = JSON.parse(remote);
    const m = remoteWins ? MERGE[k](r, l) : MERGE[k](l, r);
    return m == null ? null : JSON.stringify(m);
  } catch { return null; }
}

/** returns true when localStorage really changed */
export function applyRemoteKv(rec: Row): boolean {
  const k = rec.key;
  if (!isSynced(k)) return false;
  const m = meta[k];
  if (m && rec.device === DEVICE && rec.updated_at <= m.t) return false; // echo of our own write
  if (isMergeable(k) && m?.p && !m.d && !rec.deleted && typeof rec.value === 'string' && rec.device !== DEVICE) {
    const cur = lsGet(k);
    const merged = cur !== null && cur !== rec.value ? tryMerge(k, cur, rec.value, rec.updated_at > m.t) : null;
    if (merged !== null) {
      if (merged !== cur) { applying = true; try { rawSet.call(localStorage, k, merged); } catch { /* full */ } finally { applying = false; } }
      meta[k] = { t: Math.max(Date.now(), rec.updated_at + 1), p: 1 }; saveMetaNow();
      if (uid) schedulePush(0);
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
  let list = await supabase.selectAll<{ key: string; updated_at: number; deleted: boolean; device?: string }>('user_data', 'select=key,updated_at,deleted,device&order=key.asc');
  if (list.error && /device/i.test(list.error)) { // older table without the column
    deviceColumn = false;
    list = await supabase.selectAll<{ key: string; updated_at: number; deleted: boolean; device?: string }>('user_data', 'select=key,updated_at,deleted&order=key.asc');
  }
  if (list.error || !list.data) throw new Error(list.error || 'list failed');
  const remote = new Map(list.data.map((r) => [r.key, r]));
  const need: string[] = [];
  for (const r of list.data) {
    if (!isSynced(r.key)) continue;
    const m = meta[r.key];
    if (m && m.t >= r.updated_at && !(isMergeable(r.key) && m.p && r.device !== DEVICE)) continue;
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
    const r = await supabase.select<Row>('user_data', `select=${deviceColumn ? 'key,value,deleted,updated_at,device' : 'key,value,deleted,updated_at'}&key=in.(${encodeURIComponent(q)})`);
    if (r.error || !r.data) throw new Error(r.error || 'fetch failed');
    r.data.forEach((row) => { if (applyRemoteKv(row)) changed.push(row.key); });
  }
  saveMetaSoon();
  await pushKv();
  return changed;
}
