/**
 * The question vault ↔ Supabase.
 *  - table `vault_items`: one row per question (all its fields as json) + the versions of its two pictures
 *  - private Storage bucket `vault`: <user id>/<question id>/q.jpg and e.jpg, squeezed to ~200 KB before upload
 * Changes made while offline are remembered (planex_sync_vault_pending_v1) and sent as soon as the connection is back.
 */
import { supabase } from '../supabase';
import { VaultQ, eraseQuestion, getBlob, getVault, normalize, writeQuestion } from '../vault/store';
import { cloudHooks } from './hooks';
import { compressForCloud } from './compress';

const BUCKET = 'vault';
const PENDING = 'planex_sync_vault_pending_v1';
const VERS = 'planex_sync_vault_ver_v1';

interface Row { id: string; data: any; q_path: string | null; e_path: string | null; q_ver: number; e_ver: number; deleted: boolean; updated_at: number }
interface Pend { meta?: 1; q?: 1; e?: 1 | -1; del?: number }

let uid: string | null = null;
let enabled = false;
let pend: Record<string, Pend> = {};
let vers: Record<string, [number, number]> = {};
let flushTimer: any = null, retryTimer: any = null, flushing = false, again = false;
let onStatus: (s: { error?: string | null; saving?: boolean }) => void = () => {};
export const setVaultStatusHandler = (f: typeof onStatus) => { onStatus = f; };

const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };
const savePend = () => write(PENDING, pend);
const saveVers = () => write(VERS, vers);

export function setVaultUser(id: string | null) {
  uid = id;
  if (id) { pend = read(PENDING, {}); vers = read(VERS, {}); }
}
export function resetVaultMeta() { pend = {}; vers = {}; savePend(); saveVers(); }
export const vaultPendingCount = () => Object.keys(pend).length;

// ---------------------------------------------------------------- local change → queue
function queue(id: string, patch: Pend, replace = false) {
  if (!enabled) return;
  pend[id] = replace ? patch : { ...(pend[id] || {}), ...patch };
  if (pend[id].del === undefined) delete pend[id].del;
  savePend();
  if (uid) scheduleFlush();
}
function scheduleFlush(delay = 350) { clearTimeout(flushTimer); flushTimer = setTimeout(() => { void flushVault(); }, delay); }

export function installVaultHooks() {
  enabled = true;
  cloudHooks.vaultPut = (q, blobs) => {
    const prev = pend[q.id];
    queue(q.id, {
      meta: 1,
      ...(blobs.q ? { q: 1 as const } : {}),
      ...(blobs.e ? { e: 1 as const } : blobs.e === null ? { e: -1 as const } : {})
    }, !!prev?.del); // a put after a delete starts a new entry
  };
  cloudHooks.vaultDel = (id) => queue(id, { del: Date.now() }, true);
}
export function uninstallVaultHooks() {
  enabled = false;
  delete cloudHooks.vaultPut; delete cloudHooks.vaultDel;
}

// ---------------------------------------------------------------- push
const qPath = (id: string) => `${uid}/${id}/q.jpg`;
const ePath = (id: string) => `${uid}/${id}/e.jpg`;

export async function flushVault(): Promise<boolean> {
  if (!uid) return false;
  if (flushing) { again = true; return false; }
  const ids = Object.keys(pend);
  if (!ids.length) return true;
  flushing = true; onStatus({ saving: true });
  let ok = true;
  try {
    for (const id of ids) {
      const p = pend[id];
      if (!p) continue;
      if (p.del) {
        const r = await supabase.upsert('vault_items', { user_id: uid, id, data: null, q_path: null, e_path: null, q_ver: 0, e_ver: 0, deleted: true, updated_at: p.del }, 'user_id,id');
        if (r.error) throw new Error(r.error);
        await supabase.removeFiles(BUCKET, [qPath(id), ePath(id)]);
        delete pend[id]; delete vers[id];
        continue;
      }
      const item = getVault().items.find((x) => x.id === id);
      if (!item) { delete pend[id]; continue; }
      const v = vers[id] || [0, 0];
      let qv = v[0], ev = v[1];
      if (p.q || !qv) {
        const b = await getBlob(id, 'q');
        if (b) {
          const small = await compressForCloud(b);
          const r = await supabase.uploadFile(BUCKET, qPath(id), small);
          if (r.error) throw new Error(r.error);
          qv = Date.now();
        }
      }
      if (p.e === -1 || !item.hasEimg) {
        if (ev) { await supabase.removeFiles(BUCKET, [ePath(id)]); ev = 0; }
      } else if (p.e === 1 || (item.hasEimg && !ev)) {
        const b = await getBlob(id, 'e');
        if (b) {
          const small = await compressForCloud(b);
          const r = await supabase.uploadFile(BUCKET, ePath(id), small);
          if (r.error) throw new Error(r.error);
          ev = Date.now();
        }
      }
      const row = { user_id: uid, id, data: item, q_path: qv ? qPath(id) : null, e_path: ev ? ePath(id) : null, q_ver: qv, e_ver: ev, deleted: false, updated_at: item.updated };
      const r = await supabase.upsert('vault_items', row, 'user_id,id');
      if (r.error) throw new Error(r.error);
      vers[id] = [qv, ev];
      // keep the entry when the question changed again while we were uploading
      const latest = getVault().items.find((x) => x.id === id);
      if (latest && latest.updated === item.updated) delete pend[id]; else pend[id] = { meta: 1 };
    }
    savePend(); saveVers();
    onStatus({ saving: false, error: null });
  } catch (e: any) {
    ok = false; savePend(); saveVers();
    onStatus({ saving: false, error: String(e?.message || e) });
    clearTimeout(retryTimer); retryTimer = setTimeout(() => scheduleFlush(0), 20000);
  } finally {
    flushing = false;
    if (again) { again = false; scheduleFlush(300); }
  }
  return ok;
}

// ---------------------------------------------------------------- pull
/** take one server row into the local vault. Returns true when something changed. */
async function applyRow(r: Row, localQ?: VaultQ): Promise<boolean> {
  if (r.deleted) {
    if (localQ) { await eraseQuestion(r.id); }
    delete vers[r.id];
    return !!localQ;
  }
  const q = normalize(r.data);
  if (!q) return false;
  const known = vers[r.id] || [0, 0];
  const blobs: { q?: Blob; e?: Blob | null } = {};
  const needQ = !!r.q_path && (known[0] !== r.q_ver || !localQ || !(await getBlob(r.id, 'q')));
  if (needQ) {
    const b = await supabase.downloadFile(BUCKET, r.q_path as string);
    if (!b) return false; // try again at the next reconcile
    blobs.q = b;
  } else if (!localQ && !r.q_path) return false; // a question without a picture is not usable
  if (r.e_path) {
    if (known[1] !== r.e_ver || !localQ || !(await getBlob(r.id, 'e'))) {
      const b = await supabase.downloadFile(BUCKET, r.e_path);
      if (b) blobs.e = b;
    }
  } else if (localQ?.hasEimg && known[1] !== r.e_ver) blobs.e = null;
  await writeQuestion({ ...q, hasEimg: !!r.e_path }, blobs);
  vers[r.id] = [r.q_ver, r.e_ver];
  return true;
}

/** realtime event on vault_items */
export async function handleRealtimeVault(rec: Partial<Row>): Promise<void> {
  if (!rec || !rec.id) return;
  const local = getVault().items.find((x) => x.id === rec.id);
  if (!rec.deleted && rec.data === undefined) { await reconcileVault(); return; } // big row: the server left the data out
  if (local && !rec.deleted && local.updated >= (rec.updated_at || 0)) return; // our own echo
  if (!local && rec.deleted) return;
  const mine = pend[rec.id];
  if (mine && !mine.del && local && local.updated >= (rec.updated_at || 0)) return;
  if (await applyRow(rec as Row, local)) saveVers();
}

/** compare the whole vault with the server (cheap: ids and timestamps only) */
export async function reconcileVault(): Promise<number> {
  if (!uid) return 0;
  const list = await supabase.selectAll<Row>('vault_items', 'select=id,updated_at,deleted,q_ver,e_ver&order=id.asc');
  if (list.error || !list.data) throw new Error(list.error || 'list failed');
  pend = read(PENDING, pend); // may have been changed by the hooks while we were waiting
  const remote = new Map(list.data.map((r) => [r.id, r]));
  const local = new Map(getVault().items.map((q) => [q.id, q]));
  let changed = 0;
  const pull: string[] = [];

  for (const r of list.data) {
    const l = local.get(r.id);
    const p = pend[r.id];
    if (p?.del) { if (p.del >= r.updated_at) continue; delete pend[r.id]; } // somebody changed it after we deleted it
    if (r.deleted) {
      if (l && l.updated > r.updated_at) queue(r.id, { meta: 1, q: 1, e: l.hasEimg ? 1 : undefined } as Pend, true); // we edited it after the deletion → bring it back
      else if (l) { await eraseQuestion(r.id); changed++; }
      continue;
    }
    if (!l) { pull.push(r.id); continue; }
    if (l.updated > r.updated_at) { queue(r.id, { meta: 1 }); continue; }
    const known = vers[r.id] || [0, 0];
    if (r.updated_at > l.updated || known[0] !== r.q_ver || known[1] !== r.e_ver) pull.push(r.id);
  }
  for (const [id, l] of local) {
    if (remote.has(id)) continue;
    if (pend[id]?.del) continue;
    queue(id, { meta: 1, q: 1, ...(l.hasEimg ? { e: 1 as const } : {}) }, true);
  }
  for (const id of Object.keys(pend)) { if (pend[id].del && !remote.has(id)) { /* nothing on the server to delete, but keep the tombstone harmlessly */ } }

  for (let i = 0; i < pull.length; i += 20) {
    const chunk = pull.slice(i, i + 20);
    const q = chunk.map((x) => '"' + x + '"').join(',');
    const r = await supabase.select<Row>('vault_items', `select=*&id=in.(${encodeURIComponent(q)})`);
    if (r.error || !r.data) throw new Error(r.error || 'fetch failed');
    for (const row of r.data) { if (await applyRow(row, local.get(row.id))) changed++; }
  }
  saveVers(); savePend();
  await flushVault();
  return changed;
}
