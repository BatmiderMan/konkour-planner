/**
 * Cloud sync (Supabase) — the one entry point.
 *   initCloudSync()   call once when the app starts
 *   syncNow()         manual «همگام‌سازی» button
 *   useSyncStatus()   (status.ts) state for the UI
 *
 * Without an account nothing here does anything: no network calls, no hooks, the app is purely local as before.
 */
import { supabase } from '../supabase';
import { RealtimeLink, ChangeEvent } from './realtime';
import { announce, handleRealtimeKv, installKvHook, onRemoteKeys, pendingCount, pushKv, reconcileKv, resetKvMeta, setKvStatusHandler, setKvUser } from './kv';
import { flushVault, handleRealtimeVault, installVaultHooks, reconcileVault, resetVaultMeta, setVaultStatusHandler, setVaultUser, vaultPendingCount } from './vaultSync';
import { flushLib, handleRealtimeLib, installLibHooks, libPendingCount, reconcileLib, resetLibMeta, setLibStatusHandler, setLibUser } from './libSync';
import { getSyncStatus, setSyncStatus } from './status';

export { useSyncStatus } from './status';
export type { SyncState, SyncStatus } from './status';

/** event the planner listens to, to refresh the day that is open on screen when another device changed it */
export const REMOTE_KV_EVENT = 'planex:remote-kv';

const KEY_LAST_USER = 'planex_sync_user_v1';
const RELOAD_GUARD = 'planex_sync_reloaded';
/** keys that the running UI re-reads by itself (see App.tsx); everything else needs a reload to show remote changes */
const isLiveKey = (k: string) => k === 'konkour_days_index_v2' || k.startsWith('konkour_day_data_v2:');

let started = false;
let rt: RealtimeLink | null = null;
let timer: any = null;
let reconciling = false;
let firstRunThisPage = true;
let errors: Record<string, string | null> = { kv: null, vault: null, lib: null };
let saving: Record<string, boolean> = { kv: false, vault: false, lib: false };

const pending = () => pendingCount() + vaultPendingCount() + libPendingCount();

function refreshStatus(extra: Partial<ReturnType<typeof getSyncStatus>> = {}) {
  const user = supabase.getUser();
  if (!user) { setSyncStatus({ state: 'off', live: false, message: '', needsReload: false }); return; }
  const err = errors.kv || errors.vault || errors.lib;
  const busy = saving.kv || saving.vault || saving.lib || reconciling;
  let state = getSyncStatus().state;
  let message = '';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { state = 'offline'; message = 'آفلاین — تغییرات پس از اتصال ارسال می‌شود'; }
  else if (err) { state = 'error'; message = 'خطا در همگام‌سازی — دوباره تلاش می‌شود (' + String(err).slice(0, 90) + ')'; }
  else if (busy) { state = 'syncing'; message = 'در حال همگام‌سازی…'; }
  else if (state !== 'connecting' || extra.lastSync) { state = 'live'; message = pending() ? `${pending()} تغییر در انتظار ارسال` : 'همگام با سرور ✓'; }
  setSyncStatus({ state, message, ...extra });
}

setKvStatusHandler((s) => { if (s.saving !== undefined) saving.kv = s.saving; if (s.error !== undefined) errors.kv = s.error; refreshStatus(); });
setVaultStatusHandler((s) => { if (s.saving !== undefined) saving.vault = s.saving; if (s.error !== undefined) errors.vault = s.error; refreshStatus(); });
setLibStatusHandler((s) => { if (s.saving !== undefined) saving.lib = s.saving; if (s.error !== undefined) errors.lib = s.error; refreshStatus(); });

// ---------------------------------------------------------------- remote → local
onRemoteKeys((keys) => {
  try { window.dispatchEvent(new CustomEvent(REMOTE_KV_EVENT, { detail: { keys } })); } catch { /* ignore */ }
  if (keys.some((k) => !isLiveKey(k))) setSyncStatus({ needsReload: true });
});

function onRealtime(e: ChangeEvent) {
  if (e.type === 'DELETE' || !e.record) return; // everything is deleted with tombstone rows, so we only ever see INSERT / UPDATE
  const run = e.table === 'user_data' ? handleRealtimeKv(e.record)
    : e.table === 'vault_items' ? handleRealtimeVault(e.record)
    : e.table === 'lib_docs' ? handleRealtimeLib(e.record) : null;
  run?.then(() => setSyncStatus({ lastSync: Date.now() })).catch((err) => console.warn('realtime apply failed', err));
}

// ---------------------------------------------------------------- reconcile everything
export async function syncNow(): Promise<boolean> {
  if (!supabase.getUser() || reconciling) return false;
  reconciling = true; refreshStatus();
  let ok = true;
  try {
    const changedKeys = await reconcileKv();
    if (changedKeys.length) announce(changedKeys);
    await reconcileLib();
    await reconcileVault();
    errors = { kv: null, vault: null, lib: null };
    reconciling = false;
    refreshStatus({ lastSync: Date.now() });
    // first sync after the page opened brought changes only a fresh start can show (settings, tracker …): reload once
    if (firstRunThisPage && changedKeys.some((k) => !isLiveKey(k)) && !recentlyReloaded()) {
      markReloaded(); location.reload();
    }
  } catch (e: any) {
    ok = false; reconciling = false;
    errors.kv = errors.kv || String(e?.message || e);
    refreshStatus();
  } finally {
    reconciling = false; firstRunThisPage = false;
  }
  return ok;
}

const recentlyReloaded = () => { try { return Date.now() - Number(sessionStorage.getItem(RELOAD_GUARD) || 0) < 30000; } catch { return true; } };
const markReloaded = () => { try { sessionStorage.setItem(RELOAD_GUARD, String(Date.now())); } catch { /* ignore */ } };

export function reloadForRemote() { markReloaded(); location.reload(); }

// ---------------------------------------------------------------- start / stop
async function startForUser(id: string) {
  const last = localStorage.getItem(KEY_LAST_USER);
  if (last && last !== id) {
    const ok = window.confirm('این دستگاه قبلاً با حساب دیگری همگام بوده است.\nاگر ادامه دهید اطلاعات موجود روی این دستگاه به حساب جدید هم اضافه می‌شود.\nادامه می‌دهید؟');
    if (!ok) { await supabase.signOut(); return; }
    resetKvMeta(); resetVaultMeta(); resetLibMeta();
  }
  try { localStorage.setItem(KEY_LAST_USER, id); } catch { /* ignore */ }

  installKvHook(); installVaultHooks(); installLibHooks();
  setKvUser(id); setVaultUser(id); setLibUser(id);
  setSyncStatus({ state: 'connecting', message: 'در حال اتصال به سرور…' });

  if (!rt) rt = new RealtimeLink(onRealtime, (live) => { setSyncStatus({ live }); refreshStatus(); });
  rt.start();
  await syncNow();

  clearInterval(timer);
  timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    void syncNow();
  }, 120_000);
}

function stopSync() {
  rt?.stop(); clearInterval(timer);
  setKvUser(null); setVaultUser(null); setLibUser(null);
  setSyncStatus({ state: 'off', live: false, message: '', needsReload: false, lastSync: 0 });
}

export function initCloudSync() {
  if (started) return;
  started = true;
  // this device has been synced before → keep tracking edits even while signed out, so nothing is lost on the next login
  if (localStorage.getItem(KEY_LAST_USER)) { installKvHook(); installVaultHooks(); installLibHooks(); }

  let current: string | null = null;
  supabase.onAuthStateChange((session) => {
    const id = session?.user?.id || null;
    if (id === current) return;
    current = id;
    if (id) void startForUser(id); else stopSync();
  });

  const wake = () => { if (!supabase.getUser()) return; rt?.poke(); void syncNow(); };
  window.addEventListener('online', wake);
  window.addEventListener('offline', () => refreshStatus());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !supabase.getUser()) return;
    if (getSyncStatus().needsReload && !recentlyReloaded()) { reloadForRemote(); return; } // coming back to the app: show what the other device changed
    wake();
  });
  window.addEventListener('pagehide', () => { void pushKv(); void flushVault(); void flushLib(); });
}

