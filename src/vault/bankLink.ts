/** Link questions of the test bank (بانک تست) into the vault. Nothing is copied or uploaded: the vault keeps only «book + number»,
 *  the picture and the worked solution are read from the imported book. If the book is not on a device, the question waits there until it is imported. */
import { BankBook } from '../bank/store';
import { VaultQ, VaultWhy, findBySrc, newId, putQuestion } from './store';

const mk = (book: BankBook, n: number, why: VaultWhy, lesson = ''): VaultQ => {
  const now = Date.now();
  return {
    id: newId(), book: book.title, lesson, why, cause: '', choices: 4, answer: book.answers[n] || 0, diff: 0, etext: '', star: false, hasEimg: false,
    created: now, updated: now, tries: 0, wins: 0, box: 0, due: 0, last: 0, units: [], src: { k: 'bank', b: book.id, n }
  };
};

/** link a list of questions; `why` can depend on the question; already linked ones are skipped */
export async function linkToVault(book: BankBook, ns: number[], why: VaultWhy | ((n: number) => VaultWhy), opts: { lesson?: string; star?: boolean } = {}): Promise<{ added: number; skipped: number }> {
  let added = 0, skipped = 0;
  for (const n of ns) {
    if (findBySrc(book.id, n) || !book.answers[n]) { skipped++; continue; }
    const q = mk(book, n, typeof why === 'function' ? why(n) : why, opts.lesson || '');
    if (opts.star) q.star = true;
    await putQuestion(q, {}); added++;
  }
  return { added, skipped };
}

/** wrong → «جواب را غلط زدم», blank → «وقت کم آوردم» */
export async function saveBankMistakes(book: BankBook, items: Array<{ n: number; pick: number }>): Promise<{ added: number; skipped: number }> {
  const bad = items.filter((it) => !(it.pick !== 0 && it.pick === book.answers[it.n]));
  const pick = new Map(bad.map((it) => [it.n, it.pick]));
  return linkToVault(book, bad.map((it) => it.n), (n) => (pick.get(n) === 0 ? 'time' : 'wrong'));
}
