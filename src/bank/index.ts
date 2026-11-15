/**
 * A synchronous picture of the bank that other parts of the app (the vault) can ask without waiting for IndexedDB:
 * «is book X imported, and does it have question n / its explanation?»  Refreshes itself when the bank changes.
 */
import React from 'react';
import { BANK_EVENT, BankBook, listBooks } from './store';

interface Snap { books: Map<string, BankBook>; ready: boolean }
let snap: Snap = { books: new Map(), ready: false };
const subs = new Set<() => void>();
const load = () => { listBooks().then((l) => { snap = { books: new Map(l.map((b) => [b.id, b])), ready: true }; subs.forEach((f) => f()); }).catch(() => { snap = { ...snap, ready: true }; subs.forEach((f) => f()); }); };
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') { load(); window.addEventListener(BANK_EVENT, load); }
export const bankIndex = (): Snap => snap;
export const useBankIndex = (): Snap => React.useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, bankIndex);

export const bankHasQuestion = (b: string, n: number): boolean => { const k = snap.books.get(b); return !!k && k.numbers.includes(n); };
export const bankHasExplanation = (b: string, n: number): boolean => { const k = snap.books.get(b); return !!k && k.expl.includes(n); };
export const bankBookTitle = (b: string): string | undefined => snap.books.get(b)?.title;
