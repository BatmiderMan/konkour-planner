// Tiny bridge so the local stores can tell the cloud layer "something changed" without importing it (no import cycles).
// When nobody is registered (normal users without an account) every call is a no-op.
export type LibKind = 'book' | 'sheet' | 'scan';

export interface CloudHooks {
  vaultPut?: (q: { id: string; updated: number }, blobs: { q?: Blob; e?: Blob | null }) => void;
  vaultDel?: (id: string) => void;
  libPut?: (kind: LibKind, id: string) => void;
  libDel?: (kind: LibKind, id: string) => void;
}
export const cloudHooks: CloudHooks = {};

export const safe = <A extends unknown[]>(fn: ((...a: A) => void) | undefined, ...a: A): void => {
  try { fn?.(...a); } catch (e) { console.warn('cloud hook failed', e); }
};
