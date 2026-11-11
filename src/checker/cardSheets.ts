import { useEffect, useSyncExternalStore } from 'react';
import { SavedSheet, ScanRecord } from './model';
import { CK_EVENT, listScans, listSheets } from './store';

/**
 * Which answer sheet / result belongs to which planner card - one shared lookup for every card on screen
 * (planner rows, the Today card, the finish form), so a hundred cards do not each read the library.
 */
export interface CardSheet { sheet?: SavedSheet; scan?: ScanRecord }

const map = new Map<string, CardSheet>();
const subs = new Set<() => void>();
let version = 0, loading = false, loaded = false;
export const cardKey = (dateKey: string, itemId: string) => `${dateKey}|${itemId}`;

async function reload(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    const [sheets, scans] = await Promise.all([listSheets(), listScans()]);
    map.clear();
    sheets.forEach((s) => { // sheets come newest first: the first one wins
      if (!s.link || !s.link.plannerItemId || !s.link.dateKey) return;
      const k = cardKey(s.link.dateKey, s.link.plannerItemId);
      const cur = map.get(k) || {};
      if (!cur.sheet) map.set(k, { ...cur, sheet: s });
    });
    scans.forEach((r) => {
      if (!r.link || !r.link.plannerItemId || !r.link.dateKey) return;
      const k = cardKey(r.link.dateKey, r.link.plannerItemId);
      const cur = map.get(k) || {};
      if (!cur.scan || r.at > cur.scan.at) map.set(k, { ...cur, scan: r });
    });
    loaded = true; version++;
    subs.forEach((f) => f());
  } finally { loading = false; }
}

if (typeof window !== 'undefined') window.addEventListener(CK_EVENT, () => { void reload(); });
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** the sheet + latest result of one planner card (undefined while there is none) */
export function useCardSheet(dateKey: string | undefined, itemId: string | undefined): CardSheet | undefined {
  useEffect(() => { if (!loaded) void reload(); }, []);
  useSyncExternalStore(subscribe, () => version);
  return dateKey && itemId ? map.get(cardKey(dateKey, itemId)) : undefined;
}
