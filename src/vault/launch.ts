/** Doorway to the question vault from anywhere in the app (bank, timer, Today, tracker, command palette). */
import type { VaultSrc, VaultWhy } from './store';

/** what the editor starts with; `id` = edit that saved question */
export interface EditorDraft {
  id?: string;
  book?: string; lesson?: string; units?: string[];
  why?: VaultWhy; choices?: number; answer?: number; etext?: string;
  img?: Blob; src?: VaultSrc;
}
export type ReviewMode = 'smart' | 'weak' | 'all';
export interface ReviewReq {
  mode?: ReviewMode;
  book?: string;      // only this book / source
  unit?: string;      // only questions linked to this tracker unit
  ids?: string[];     // exactly these questions
  title?: string;
}

/** what the bulk importer starts with */
export interface BulkDraft { book?: string; lesson?: string; units?: string[]; files?: File[] }

interface Host { editor: (d: EditorDraft) => void; review: (r: ReviewReq) => void; bulk: (d: BulkDraft) => void }
let host: Host | null = null;
export const registerVaultHost = (h: Host | null) => { host = h; };
export const openVaultEditor = (d: EditorDraft = {}): void => { host?.editor(d); };
export const openVaultBulk = (d: BulkDraft = {}): void => { host?.bulk(d); };
export const openVaultReview = (r: ReviewReq = {}): void => { host?.review(r); };

export const GOTO_VAULT_EVENT = 'planex:goto-vault';
export interface VaultFocus { book?: string; lesson?: string; unit?: string; status?: 'due' | 'open' | 'star' | 'leech' | 'fresh' }
/** switch the app to the vault section, optionally with a filter already applied */
export const goToVault = (f: VaultFocus = {}): void => { window.dispatchEvent(new CustomEvent(GOTO_VAULT_EVENT, { detail: f })); };
