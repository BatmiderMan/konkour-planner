import React from 'react';

export type SyncState = 'off' | 'connecting' | 'syncing' | 'live' | 'offline' | 'error';
export interface SyncStatus {
  state: SyncState;
  /** the realtime socket is connected */
  live: boolean;
  lastSync: number;
  message: string;
  /** another device changed settings that are only read at start-up → offer a reload */
  needsReload: boolean;
}

let snap: SyncStatus = { state: 'off', live: false, lastSync: 0, message: '', needsReload: false };
const subs = new Set<() => void>();
export const getSyncStatus = (): SyncStatus => snap;
export const setSyncStatus = (p: Partial<SyncStatus>): void => {
  const next = { ...snap, ...p };
  if (next.state === snap.state && next.live === snap.live && next.lastSync === snap.lastSync && next.message === snap.message && next.needsReload === snap.needsReload) return;
  snap = next;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useSyncStatus = (): SyncStatus => React.useSyncExternalStore(subscribe, getSyncStatus);
