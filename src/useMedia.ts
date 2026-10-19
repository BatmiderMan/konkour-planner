import { useSyncExternalStore } from 'react';

/** live `matchMedia` flag, e.g. useMedia('(max-width: 820px)') */
export function useMedia(query: string): boolean {
  const subscribe = (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  };
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
