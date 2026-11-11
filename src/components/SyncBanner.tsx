import React from 'react';
import { reloadForRemote, useSyncStatus } from '../sync';

/** small floating chip: shows sync problems, and offers a reload when another device changed settings that are read at start-up */
export const SyncBanner: React.FC = () => {
  const s = useSyncStatus();
  if (s.state === 'off') return null;
  const reload = s.needsReload;
  const bad = s.state === 'error' || s.state === 'offline';
  if (!reload && !bad) return null;
  return (
    <div className={`sync-banner${bad && !reload ? ' bad' : ''}`} role="status">
      {reload ? (
        <>
          <span>تغییرات تازه‌ای از دستگاه دیگر رسید</span>
          <button type="button" onClick={reloadForRemote}>بارگذاری</button>
        </>
      ) : (
        <span>{s.message}</span>
      )}
    </div>
  );
};
