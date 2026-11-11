/**
 * The answer-key library (books, saved sheets, scan history) ↔ table `lib_docs` (kind + id → json document).
 * Same idea as the vault: local changes are queued (and survive a reload), a reconcile compares timestamps.
 */
import { supabase } from '../supabase';
import { LibKindName, applyRemoteDoc, eraseRemoteDoc, listLocalDocs, readLocalDoc } from '../checker/store';
import { cloudHooks } from './hooks';

const PENDING = 'planex_sync_lib_pending_v1';
const KINDS: LibKindName[] = ['book', 'sheet', 'scan'];
interface Row { kind: LibKindName; id: string; data: any; deleted: boolean; updated_at: number }

let uid: string | null = null;
let enabled = false;
let pend: Record<string, { del?: number }> = {}; // "kind:id" → {} (needs upload) | {del: time}
let flushTimer: any = null, retryTimer: any = null, flushing = false, again = false;
let onStatus: (s: { error?: string | null; saving?: boolean }) => void = () => {};
export const setLibStatusHandler = (f: typeof onStatus) => { onStatus = f; };

const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return d; } };
const savePend = () => { try { localStorage.setItem(PENDING, JSON.stringify(pend)); } catch { /* full */ } };
const pk = (kind: string, id: string) => kind + ':' + id;

export function setLibUser(id: string | null) { uid = id; if (id) pend = read(PENDING, {}); }
export function resetLibMeta() { pend = {}; savePend(); }
export const libPendingCount = () => Object.keys(pend).length;

function scheduleFlush(delay = 2500) { clearTimeout(flushTimer); flushTimer = setTimeout(() => { void flushLib(); }, delay); } // sheets are saved on every tap → wait a little

export function installLibHooks() {
  enabled = true;
  cloudHooks.libPut = (kind, id) => { if (!enabled) return; pend[pk(kind, id)] = {}; savePend(); if (uid) scheduleFlush(); };
  cloudHooks.libDel = (kind, id) => { if (!enabled) return; pend[pk(kind, id)] = { del: Date.now() }; savePend(); if (uid) scheduleFlush(800); };
}
export function uninstallLibHooks() { enabled = false; delete cloudHooks.libPut; delete cloudHooks.libDel; }

export async function flushLib(): Promise<boolean> {
  if (!uid) return false;
  if (flushing) { again = true; return false; }
  const keys = Object.keys(pend);
  if (!keys.length) return true;
  flushing = true; onStatus({ saving: true });
  let ok = true;
  try {
    const rows: any[] = [];
    const sent: Record<string, string> = {};
    for (const key of keys) {
      const [kind, ...rest] = key.split(':'); const id = rest.join(':');
      const p = pend[key];
      if (p.del) { rows.push({ user_id: uid, kind, id, data: null, deleted: true, updated_at: p.del }); sent[key] = 'd' + p.del; continue; }
      const local = await readLocalDoc(kind as LibKindName, id);
      if (!local) { delete pend[key]; continue; }
      rows.push({ user_id: uid, kind, id, data: local.doc, deleted: false, updated_at: local.t });
      sent[key] = 'u' + local.t;
    }
    for (let i = 0; i < rows.length; i += 20) {
      const r = await supabase.upsert('lib_docs', rows.slice(i, i + 20), 'user_id,kind,id');
      if (r.error) throw new Error(r.error);
    }
    for (const key of Object.keys(sent)) {
      const [kind, ...rest] = key.split(':'); const id = rest.join(':');
      const cur = pend[key];
      if (!cur) continue;
      if (cur.del) { if ('d' + cur.del === sent[key]) delete pend[key]; continue; }
      const local = await readLocalDoc(kind as LibKindName, id);
      if (!local || 'u' + local.t === sent[key]) delete pend[key]; // unchanged since we sent it
    }
    savePend(); onStatus({ saving: false, error: null });
  } catch (e: any) {
    ok = false; savePend();
    onStatus({ saving: false, error: String(e?.message || e) });
    clearTimeout(retryTimer); retryTimer = setTimeout(() => scheduleFlush(0), 20000);
  } finally {
    flushing = false;
    if (again) { again = false; scheduleFlush(500); }
  }
  return ok;
}

export async function handleRealtimeLib(rec: Partial<Row>): Promise<void> {
  if (!rec || !rec.id || !rec.kind || !KINDS.includes(rec.kind)) return;
  if (!rec.deleted && rec.data === undefined) { await reconcileLib(); return; }
  const local = await readLocalDoc(rec.kind, rec.id);
  const p = pend[pk(rec.kind, rec.id)];
  if (rec.deleted) { if (local && local.t <= (rec.updated_at || 0) && !(p && !p.del)) await eraseRemoteDoc(rec.kind, rec.id); return; }
  if (local && local.t >= (rec.updated_at || 0)) return;
  if (p && !p.del && local) return; // we have unsent edits of our own
  await applyRemoteDoc(rec.kind, rec.data);
}

export async function reconcileLib(): Promise<number> {
  if (!uid) return 0;
  const list = await supabase.selectAll<Row>('lib_docs', 'select=kind,id,updated_at,deleted&order=kind.asc,id.asc');
  if (list.error || !list.data) throw new Error(list.error || 'list failed');
  pend = read(PENDING, pend);
  let changed = 0;
  const remote = new Map(list.data.map((r) => [pk(r.kind, r.id), r]));
  const pull: Row[] = [];

  for (const kind of KINDS) {
    const local = await listLocalDocs(kind);
    const lmap = new Map(local.map((x) => [x.id, x.t]));
    for (const [key, r] of remote) {
      if (r.kind !== kind) continue;
      const p = pend[key];
      if (p?.del) { if (p.del >= r.updated_at) continue; delete pend[key]; }
      const lt = lmap.get(r.id);
      if (r.deleted) {
        if (lt !== undefined && lt > r.updated_at) pend[key] = {};        // edited after it was deleted elsewhere → keep it
        else if (lt !== undefined) { await eraseRemoteDoc(kind, r.id); changed++; }
        continue;
      }
      if (lt === undefined) pull.push(r);
      else if (lt > r.updated_at) pend[key] = {};
      else if (lt < r.updated_at) pull.push(r);
    }
    for (const [id] of lmap) { if (!remote.has(pk(kind, id)) && !pend[pk(kind, id)]?.del) pend[pk(kind, id)] = {}; }
  }
  for (let i = 0; i < pull.length; i += 10) {
    const chunk = pull.slice(i, i + 10);
    for (const kind of KINDS) {
      const ids = chunk.filter((r) => r.kind === kind).map((r) => '"' + r.id + '"');
      if (!ids.length) continue;
      const r = await supabase.select<Row>('lib_docs', `select=*&kind=eq.${kind}&id=in.(${encodeURIComponent(ids.join(','))})`);
      if (r.error || !r.data) throw new Error(r.error || 'fetch failed');
      for (const row of r.data) { await applyRemoteDoc(kind, row.data); changed++; }
    }
  }
  savePend();
  await flushLib();
  return changed;
}
