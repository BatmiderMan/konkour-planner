/** PDF exams are filled on Planex's own virtual answer sheet (clocks, per-question time, 2x/3x, flags…); the key travels with it. */
import { KeyMap, SavedSheet, emptySheetString, makeBook, makeSavedSheet } from '../checker/model';
import { getSheet, saveBook, saveSheet } from '../checker/store';
import { openVirtual } from '../checker/launch';
import { Lab } from './parts';
import { Attempt, MIX, SavedExam, getExam, recordAttemptMeta, saveAttempt, saveExam } from './store';
import { alertDialog } from '../dialog';

const base = (e: SavedExam) => (!e.renumber && new Set(e.refs.map((r) => r.b)).size === 1 && e.refs.every((r, i) => r.n === e.refs[0].n + i) ? e.refs[0].n : 1);

/** sync the exam with what was done on the sheet (answers, time, and — once graded there — the bank result) */
export async function syncExam(id: string, lab: Lab): Promise<void> {
  const e = await getExam(id); if (!e || !e.sheetId) return;
  const sh = await getSheet(e.sheetId); if (!sh) return;
  const n = e.refs.length, picks: Record<string, number> = {};
  for (let i = 0; i < n; i++) { const v = +(sh.sheet[i] || 0); if (v >= 1 && v <= 4) picks[i] = v; }
  const any = Object.keys(picks).length > 0;
  let ne: SavedExam = { ...e, picks, seconds: Math.round((sh.spentMs || 0) / 1000), status: e.status === 'graded' && e.scanId === sh.scanId ? 'graded' : any ? 'filled' : 'new' };
  if (sh.scanId && sh.pct !== undefined && sh.scanId !== e.scanId) {
    let c = 0, w = 0; const mixed = new Set(e.refs.map((r) => r.b)).size > 1;
    const items = e.refs.map((r, i) => ({ n: r.n, pick: picks[i] || 0, b: r.b, sec: Math.round(((sh.times || [])[i] || 0) / 1000) }));
    items.forEach((it, i) => { const k = lab.bookMap.get(e.refs[i].b)?.answers[e.refs[i].n] || 0; if (!it.pick || !k) return; if (it.pick === k) c++; else w++; });
    const a: Attempt = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), bookId: mixed ? MIX : e.refs[0].b, at: Date.now(), seconds: ne.seconds, items, correct: c, wrong: w, blank: n - c - w,
      pct: Math.round(((3 * c - w) / (3 * n)) * 1000) / 10, mode: 'پاسخ‌برگ PDF', title: e.title };
    await saveAttempt(a); await recordAttemptMeta(a, (b, q) => lab.bookMap.get(b)?.answers[q] || 0);
    ne = { ...ne, status: 'graded', attemptId: a.id, pct: a.pct, scanId: sh.scanId };
  }
  await saveExam(ne);
}

export async function openExamSheet(e: SavedExam, lab: Lab, fresh = false): Promise<void> {
  if (e.refs.some((r) => !lab.bookMap.get(r.b))) { await alertDialog('کتاب این آزمون در برنامه نیست؛ اول فایل کتاب را در «کتابخانه» وارد کنید تا کلید پاسخ‌ها در دسترس باشد.'); return; }
  const b0 = base(e), kk = new KeyMap();
  e.refs.forEach((r, i) => { const k = lab.bookMap.get(r.b)?.answers[r.n]; if (k) kk.set(b0 + i, k); });
  const bk = makeBook(e.title + ' · کلید PDF', kk, { id: 'bkx_' + e.id, color: '#0fb5a4' }); await saveBook(bk);
  let sh: SavedSheet | undefined = e.sheetId && !fresh ? await getSheet(e.sheetId) : undefined;
  if (!sh) {
    sh = makeSavedSheet(e.title, 'live', emptySheetString(), { size: e.refs.length, startQ: b0, bookId: bk.id, bookTitle: bk.title, budgetMin: e.minutes || undefined });
    await saveSheet(sh, { silent: true });
    await saveExam({ ...e, sheetId: sh.id, scanId: undefined, status: 'new', attemptId: undefined, pct: undefined, picks: {}, crossed: {}, flags: {}, seconds: 0 }, undefined, true);
  }
  openVirtual({ title: e.title, sheet: sh, onClose: () => { syncExam(e.id, lab).catch(() => { /* ignore */ }); } });
}
