/**
 * Cloud sync (Supabase) — the one entry point.
 *   initCloudSync()   call once when the app starts
 *   syncNow()         manual «همگام‌سازی» button
 *   useSyncStatus()   (status.ts) state for the UI
 *
 * Without an account nothing here does anything: no network calls, no hooks, the app is purely local as before.
 *
 * Instant sync: every change is pushed ~0.3 s after it happens, and the other devices get it through the realtime socket and show it
 * without any question. Offline: changes are kept (also across restarts), and the moment the connection is back the pending changes are
 * sent and everything missed meanwhile is fetched; failed attempts are retried with growing pauses until it works.
 */
import { supabase } from '../supabase';
import { RealtimeLink, ChangeEvent } from './realtime';
import { announce, flushKvMeta, handleRealtimeKv, installKvHook, kvDiagnostics, markAllPending, onRemoteKeys, pendingCount, pushKv, reconcileKv, resetKvMeta, setKvStatusHandler, setKvUser } from './kv';
import { flushVault, handleRealtimeVault, installVaultHooks, markAllVaultPending, reconcileVault, resetVaultMeta, setVaultStatusHandler, setVaultUser, vaultPendingCount } from './vaultSync';
import { flushLib, handleRealtimeLib, installLibHooks, libPendingCount, markAllLibPending, reconcileLib, resetLibMeta, setLibStatusHandler, setLibUser } from './libSync';
import { getSyncStatus, setSyncStatus } from './status';

export { useSyncStatus } from './status';
export type { SyncState, SyncStatus } from './status';

/** event the app listens to, to refresh what is on screen when another device changed it */
export const REMOTE_KV_EVENT = 'planex:remote-kv';

const KEY_LAST_USER = 'planex_sync_user_v1';

let started = false;
let rt: RealtimeLink | null = null;
let timer: any = null;
let retryTimer: any = null;
let failures = 0;
let reconciling = false;
let wasLive = false;
let errors: Record<string, string | null> = { kv: null, vault: null, lib: null };
let saving: Record<string, boolean> = { kv: false, vault: false, lib: false };

const pending = () => pendingCount() + vaultPendingCount() + libPendingCount();
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function refreshStatus(extra: Partial<ReturnType<typeof getSyncStatus>> = {}) {
  const user = supabase.getUser();
  if (!user) { setSyncStatus({ state: 'off', live: false, message: '', needsReload: false }); return; }
  const err = errors.kv || errors.vault || errors.lib;
  const busy = saving.kv || saving.vault || saving.lib || reconciling;
  let state = getSyncStatus().state;
  let message = '';
  if (isOffline() && err) { state = 'offline'; message = pending() ? `آفلاین — ${pending()} تغییر پس از اتصال ارسال می‌شود` : 'آفلاین — پس از اتصال همگام می‌شود'; }
  else if (err) { state = 'error'; message = 'خطا در همگام‌سازی — دوباره تلاش می‌شود (' + String(err).slice(0, 90) + ')'; }
  else if (busy) { state = 'syncing'; message = 'در حال همگام‌سازی…'; }
  else if (state !== 'connecting' || extra.lastSync) { state = 'live'; message = pending() ? `${pending()} تغییر در انتظار ارسال` : 'همگام با سرور ✓'; }
  setSyncStatus({ state, message, needsReload: false, ...extra });
}

setKvStatusHandler((s) => { if (s.saving !== undefined) saving.kv = s.saving; if (s.error !== undefined) errors.kv = s.error; refreshStatus(); if (s.error) scheduleRetry(); });
setVaultStatusHandler((s) => { if (s.saving !== undefined) saving.vault = s.saving; if (s.error !== undefined) errors.vault = s.error; refreshStatus(); if (s.error) scheduleRetry(); });
setLibStatusHandler((s) => { if (s.saving !== undefined) saving.lib = s.saving; if (s.error !== undefined) errors.lib = s.error; refreshStatus(); if (s.error) scheduleRetry(); });

/** after any failure: try again with growing pauses (3 s, 6 s … 60 s); one success resets it */
function scheduleRetry() {
  if (retryTimer || !supabase.getUser()) return;
  const wait = Math.min(60000, 3000 * 2 ** Math.min(failures, 5));
  failures++;
  retryTimer = setTimeout(() => { retryTimer = null; void syncNow(); }, wait);
}

// ---------------------------------------------------------------- remote → local, shown at once
onRemoteKeys((keys) => {
  try { window.dispatchEvent(new CustomEvent(REMOTE_KV_EVENT, { detail: { keys } })); } catch { /* ignore */ }
  // the stores that already follow other tabs (tracker …) listen to the browser's own «storage» event: give it to them
  keys.forEach((k) => {
    try { window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: localStorage.getItem(k), storageArea: localStorage })); } catch { /* old browser */ }
  });
});

function onRealtime(e: ChangeEvent) {
  if (e.type === 'DELETE' || !e.record) return; // everything is deleted with tombstone rows, so we only ever see INSERT / UPDATE
  const run = e.table === 'user_data' ? handleRealtimeKv(e.record)
    : e.table === 'vault_items' ? handleRealtimeVault(e.record)
    : e.table === 'lib_docs' ? handleRealtimeLib(e.record) : null;
  run?.then(() => setSyncStatus({ lastSync: Date.now() })).catch((err) => console.warn('realtime apply failed', err));
}

// ---------------------------------------------------------------- send what is waiting, fetch what was missed
export async function syncNow(): Promise<boolean> {
  if (!supabase.getUser() || reconciling) return false;
  reconciling = true; refreshStatus();
  let ok = true;
  try {
    // 1) our own waiting changes first, so they are safe on the server before anything else happens
    await Promise.allSettled([pushKv(), flushLib(), flushVault()]);
    // 2) then compare everything (this also fetches what other devices did while we were away)
    const changedKeys = await reconcileKv();
    if (changedKeys.length) announce(changedKeys);
    await reconcileLib();
    await reconcileVault();
    errors = { kv: null, vault: null, lib: null };
    failures = 0; clearTimeout(retryTimer); retryTimer = null;
    reconciling = false;
    refreshStatus({ lastSync: Date.now() });
  } catch (e: any) {
    ok = false; reconciling = false;
    errors.kv = errors.kv || String(e?.message || e);
    refreshStatus(); scheduleRetry();
  } finally {
    reconciling = false;
  }
  return ok;
}

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

  if (!rt) {
    rt = new RealtimeLink(onRealtime, (live) => {
      const came = live && !wasLive;
      wasLive = live;
      setSyncStatus({ live }); refreshStatus();
      if (came) void syncNow(); // (re)connected: catch up on everything that happened while the socket was down
    });
  }
  rt.start();
  await syncNow();

  clearInterval(timer);
  // safety net: while the socket is down look for news every 15 s, while it is up every 5 min
  timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!getSyncStatus().live || Date.now() - getSyncStatus().lastSync > 300_000) void syncNow();
  }, 15_000);
}

function stopSync() {
  rt?.stop(); clearInterval(timer); clearTimeout(retryTimer); retryTimer = null; wasLive = false; failures = 0;
  setKvUser(null); setVaultUser(null); setLibUser(null);
  setSyncStatus({ state: 'off', live: false, message: '', needsReload: false, lastSync: 0 });
}

/** everything the «همگام‌سازی» panel shows (and what «کپی گزارش» copies) */
export function getDiagnostics() {
  const st = getSyncStatus();
  return {
    state: st.state, realtime: st.live, lastSync: st.lastSync, message: st.message,
    pending: { settings: pendingCount(), vault: vaultPendingCount(), library: libPendingCount() },
    errors: { settings: errors.kv, vault: errors.vault, library: errors.lib },
    kv: kvDiagnostics(),
    session: supabase.sessionInfo(),
    browserOnline: typeof navigator !== 'undefined' ? navigator.onLine : null,
    failures, time: new Date().toISOString()
  };
}

/** «send everything»: queue every local item again and push, then compare with the server */
export async function pushEverything(): Promise<{ ok: boolean; counts: { settings: number; vault: number; library: number } }> {
  const counts = { settings: markAllPending(), vault: markAllVaultPending(), library: await markAllLibPending() };
  failures = 0; clearTimeout(retryTimer); retryTimer = null;
  const ok = await syncNow();
  return { ok, counts };
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

  // back online / tab shown again / window focused: reconnect the socket and run a sync right away
  const wake = () => {
    if (!supabase.getUser()) return;
    failures = 0; clearTimeout(retryTimer); retryTimer = null;
    rt?.poke();
    void syncNow();
  };
  window.addEventListener('online', wake);
  window.addEventListener('offline', () => refreshStatus());
  window.addEventListener('focus', () => { if (supabase.getUser()) rt?.poke(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
  window.addEventListener('pagehide', () => { flushKvMeta(); void pushKv(); void flushVault(); void flushLib(); });
}
