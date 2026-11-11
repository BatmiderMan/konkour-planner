/** Copy questions of the test bank (بانک تست) into the vault. */
import { BankBook, imageBlob } from '../bank/store';
import { VaultQ, VaultWhy, findBySrc, newId, putQuestion } from './store';

const mk = (book: BankBook, n: number, why: VaultWhy, lesson = ''): VaultQ => {
  const now = Date.now();
  return {
    id: newId(), book: book.title, lesson, why, cause: '', choices: 4, answer: book.answers[n] || 0, diff: 0, etext: '', star: false, hasEimg: false,
    created: now, updated: now, tries: 0, wins: 0, box: 0, due: 0, last: 0, units: [], src: { k: 'bank', b: book.id, n }
  };
};

/** wrong → «جواب را غلط زدم», blank → «وقت کم آوردم»; questions that are already in the vault are skipped */
export async function saveBankMistakes(book: BankBook, items: Array<{ n: number; pick: number }>): Promise<{ added: number; skipped: number }> {
  let added = 0, skipped = 0;
  for (const it of items) {
    if (it.pick !== 0 && it.pick === book.answers[it.n]) continue; // answered right
    if (findBySrc(book.id, it.n)) { skipped++; continue; }
    const blob = await imageBlob(book.id, it.n);
    if (!blob || !book.answers[it.n]) { skipped++; continue; }
    await putQuestion(mk(book, it.n, it.pick === 0 ? 'time' : 'wrong'), { q: blob });
    added++;
  }
  return { added, skipped };
}
