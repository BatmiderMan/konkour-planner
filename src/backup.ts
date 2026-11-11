import { LibraryFile, exportLibrary, importLibrary } from './checker/store';
import { exportBackup as exportVault, getVault, importBackup as importVault } from './vault/store';

/** one file with everything the person has made: planner, tracker, reports, settings (local storage) + the answer-key library, sheets and results */
export interface AllData {
  format: 'planex-all';
  v: 1;
  exportedAt: number;
  local: Record<string, string>;
  library: LibraryFile | null;
  vault?: unknown; // the question vault (with its pictures)
}

const KEEP = /^(konkour|planex)_/;
const SKIP = /session|token|auth|nav_last|live_plan|^planex_sync/i; // login data and other things that should never travel in a file

export const backupKeys = (): string[] => {
  const out: string[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && KEEP.test(k) && !SKIP.test(k)) out.push(k); } } catch { /* ignore */ }
  return out;
};

export async function exportAll(): Promise<AllData> {
  const local: Record<string, string> = {};
  backupKeys().forEach((k) => { const v = localStorage.getItem(k); if (v !== null) local[k] = v; });
  let library: LibraryFile | null = null;
  try { library = await exportLibrary({ withScans: true, withSheets: true }); } catch { /* the library is optional */ }
  let vault: unknown;
  try { if (getVault().items.length) vault = JSON.parse(await (await exportVault()).text()); } catch { /* the vault is optional */ }
  return { format: 'planex-all', v: 1, exportedAt: Date.now(), local, library, ...(vault ? { vault } : {}) };
}

export async function importAll(text: string): Promise<{ keys: number; books: number; scans: number; sheets: number; vault: number }> {
  const d = JSON.parse(text) as Partial<AllData>;
  if (!d || d.format !== 'planex-all' || typeof d.local !== 'object' || !d.local) throw new Error('این فایل پشتیبان Planex نیست');
  let keys = 0;
  Object.keys(d.local).forEach((k) => {
    if (!KEEP.test(k) || SKIP.test(k)) return;
    try { localStorage.setItem(k, String((d.local as Record<string, string>)[k])); keys++; } catch { /* storage full */ }
  });
  let books = 0, scans = 0, sheets = 0;
  if (d.library) { const r = await importLibrary(JSON.stringify(d.library)); books = r.books; scans = r.scans; sheets = r.sheets; }
  let vaultN = 0;
  if (d.vault) { try { vaultN = await importVault(JSON.stringify(d.vault)); } catch { /* ignore a broken vault part */ } }
  return { keys, books, scans, sheets, vault: vaultN };
}
