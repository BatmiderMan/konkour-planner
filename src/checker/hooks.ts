import { useEffect, useState } from 'react';
import { BookMeta, SavedSheet, ScanRecord } from './model';
import { CK_EVENT, booksIndex, listScans, listSheets, migrateLegacy, syncIndex } from './store';

/** Book list (instant, from the index), scan history and saved answer sheets (loaded in the background). */
export function useLibrary(): { books: BookMeta[]; scans: ScanRecord[] | null; sheets: SavedSheet[] | null } {
  const [books, setBooks] = useState<BookMeta[]>(() => booksIndex());
  const [scans, setScans] = useState<ScanRecord[] | null>(null);
  const [sheets, setSheets] = useState<SavedSheet[] | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => { setBooks(booksIndex()); listScans().then((s) => { if (alive) setScans(s); }); listSheets().then((s) => { if (alive) setSheets(s); }); };
    (async () => { await migrateLegacy(); const b = await syncIndex(); const s = await listScans(); const sh = await listSheets(); if (alive) { setBooks(b); setScans(s); setSheets(sh); } })();
    window.addEventListener(CK_EVENT, refresh);
    return () => { alive = false; window.removeEventListener(CK_EVENT, refresh); };
  }, []);
  return { books, scans, sheets };
}
