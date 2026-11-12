import React from 'react';
import { useSyncStatus } from '../sync';

/** small floating chip: only shows when syncing has a problem (offline / error). Changes from other devices appear by themselves. */
export const SyncBanner: React.FC = () => {
  const s = useSyncStatus();
  if (s.state !== 'error' && s.state !== 'offline') return null;
  return (
    <div className="sync-banner bad" role="status">
      <span>{s.message}</span>
    </div>
  );
};
