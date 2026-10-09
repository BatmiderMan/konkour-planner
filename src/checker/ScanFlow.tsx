import React, { useEffect, useMemo, useState } from 'react';
import { Plus, ArrowRight, Check, Settings2, Save } from 'lucide-react';
import { KeyBuilder } from './KeyBuilder';
import { ResultView } from './ResultView';
import { SheetStep, emptySheet, SheetState } from './SheetStep';
import { useLibrary } from './hooks';
import { ScanContext, openScan } from './launch';
import { Book, BookMeta, GradeSettings, KeyMap, Manual, RawRead, SavedSheet, effective, gradeSheet, lastMarked, makeRecord, makeSavedSheet, matchBook, packSheet, rangeHint, toPartCounts, unpackSheet, withAnswers } from './model';
import { getBook, keysOf, loadPrefs, recallChoice, rememberChoice, savePrefs, saveScan, saveSheet } from './store';
import { defaultTitle } from './format';
import { marksFromScan } from './engine';
import { Modal, Seg } from './ui';
import { toPersianDigits as P } from '../utils';

/** The whole check: photo of the sheet → pick the book → result → (optionally) write the counts into the report part. */
export const ScanFlow: React.FC<{ ctx: ScanContext; onClose: () => void }> = ({ ctx, onClose }) => {
  const { books } = useLibrary();
  const preset: SavedSheet | null = ctx.sheet || null;            // comparing a sheet that is already saved: no photo step
  const presetRead = useMemo<RawRead | null>(() => (preset ? unpackSheet(preset.sheet) : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const only = !!ctx.sheetOnly && !preset;                         // photo → save the sheet for later, no key
  const [prefs, setPrefs] = useState(loadPrefs);
  const [step, setStep] = useState<'sheet' | 'result'>(preset ? 'result' : 'sheet');
  const [sheet, setSheetRaw] = useState<SheetState>(() => emptySheet(prefs.sensitivity));
  const setSheet = (f: (s: SheetState) => SheetState) => setSheetRaw(f);
  const [manual, setManual] = useState<Manual>({});
  const [bookId, setBookId] = useState<string | undefined>(ctx.bookId || preset?.bookId);
  const [keys, setKeys] = useState<KeyMap | null>(null);
  const [startQ, setStartQ] = useState(preset?.startQ || 1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState<number | null>(null);
  const [showSet, setShowSet] = useState(false);
  const [builder, setBuilder] = useState<{ book?: Book } | null>(null);
  const [saving, setSaving] = useState(false);
  const [chosen, setChosen] = useState(!!(ctx.bookId || preset?.bookId)); // true once the book was picked (by memory, match or by hand)

  // pick a book on its own: remembered choice → same book/lesson as the planner card → the only book there is
  useEffect(() => {
    if (chosen || !books.length) return;
    const hint = { source: ctx.source, lesson: ctx.lesson };
    const mem = recallChoice(hint);
    const m = (mem && books.find((b) => b.id === mem.bookId)) || matchBook(books, hint) || (books.length === 1 ? books[0] : null);
    if (m) { setBookId(m.id); if (mem && mem.startQ && !preset?.startQ) setStartQ(mem.startQ); }
    setChosen(true);
  }, [books, chosen, ctx.source, ctx.lesson]);

  const meta: BookMeta | null = useMemo(() => books.find((b) => b.id === bookId) || null, [books, bookId]);
  useEffect(() => { let on = true; setKeys(null); keysOf(bookId).then((k) => { if (on) setKeys(k); }); return () => { on = false; }; }, [bookId, meta?.updatedAt]);

  // when a book is picked for the first time and nothing remembered: sheet question 1 = the book's first key, or the range written on the card
  const hint = useMemo(() => rangeHint([ctx.detail, ctx.subject].filter(Boolean).join(' '), keys), [ctx.detail, ctx.subject, keys]);
  const [startTouched, setStartTouched] = useState(!!preset?.startQ);
  useEffect(() => {
    if (startTouched || !meta || !keys) return;
    const mem = recallChoice({ source: ctx.source, lesson: ctx.lesson });
    if (mem && mem.bookId === meta.id && mem.startQ) return;
    setStartQ(hint ? hint.from : meta.min || 1);
  }, [meta?.id, keys, hint, startTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  const read: RawRead = presetRead || (sheet.marks ? { ans: sheet.marks.ans, dbl: sheet.marks.dbl } : { ans: [] as number[], dbl: [] as boolean[] });
  const hasRead = !!(presetRead || sheet.marks);
  const last = hasRead ? lastMarked(read, manual) : 0;
  // a typed sheet is graded over all the rows it shows (blank rows at the end count as «نزده»); a scan up to the last marked answer
  const defaultTo = hint ? hint.to - hint.from + 1 : preset ? Math.max(preset.size, last) : (last || 50);
  const settings: GradeSettings = { startQ, from, to: to ?? defaultTo, penalty: prefs.penalty, dblWrong: prefs.dblWrong };
  const grade = useMemo(() => (hasRead ? gradeSheet(read, manual, keys, settings) : null), // eslint-disable-line react-hooks/exhaustive-deps
    [hasRead, manual, keys, startQ, from, to, prefs.penalty, prefs.dblWrong, hint, last]);

  const setPref = (p: Partial<typeof prefs>) => { const n = { ...prefs, ...p }; setPrefs(n); savePrefs(n); };
  const onSens = (v: number) => {
    setPref({ sensitivity: v });
    setSheet((s) => ({ ...s, sens: v, marks: s.scan ? marksFromScan(s.scan.scores, v) : s.marks }));
  };
  const pick = (q: number, o: number) => { const cur = effective(read, manual, q); setManual({ ...manual, [q]: cur.v === o && !cur.dbl ? 0 : o }); };

  const save = async (apply: boolean) => {
    if (!grade || !sheet.marks) return;
    setSaving(true);
    const link = { ...(ctx.link || {}), lesson: ctx.lesson, label: ctx.subject || (ctx.detail ? ctx.detail.slice(0, 40) : preset?.title), ...(preset ? { sheetId: preset.id } : {}) };
    const rec = makeRecord(read, manual, grade, settings, meta, link);
    await saveScan(rec);
    // the saved sheet remembers its last comparison (and any answer corrected on the result screen)
    if (preset) await saveSheet(withAnswers(preset, packSheet(read, manual), { state: 'done', bookId: meta?.id, bookTitle: meta?.title, scanId: rec.id, pct: grade.pct, startQ }));
    if (meta) rememberChoice({ source: ctx.source, lesson: ctx.lesson }, meta.id, startQ);
    if (apply && ctx.onApply) ctx.onApply(toPartCounts(grade), rec);
    setSaving(false); onClose();
  };

  /** keep the sheet in «پاسخ‌برگ‌های من» without any key; optionally continue straight to the comparison */
  const keepSheet = async (thenCompare: boolean) => {
    if (!hasRead || preset) return;
    setSaving(true);
    const s = makeSavedSheet(defaultTitle('پاسخ‌برگ اسکن‌شده'), 'scan', packSheet(read, manual), ctx.lesson ? { lesson: ctx.lesson } : {});
    await saveSheet(s);
    setSaving(false); onClose();
    if (thenCompare) openScan({ sheet: s, source: ctx.source, lesson: ctx.lesson });
  };
  const counts = grade ? toPartCounts(grade) : null;
  const ctxLine = [ctx.lesson, ctx.subject].filter(Boolean).join(' · ');

  return (
    <Modal wide onClose={onClose} title={<>{preset ? 'مقایسه با کلید' : only ? 'اسکن و ذخیره‌ی پاسخ‌برگ' : 'تصحیح پاسخ‌برگ'}{(ctxLine || preset) && <small className="ck-ctx"> — {preset ? preset.title : ctxLine}</small>}</>}
      footer={only && sheet.marks?.marked ? <>
        <button type="button" className="ck-btn primary" disabled={saving} onClick={() => keepSheet(false)}><Save size={16} /> ذخیره‌ی پاسخ‌برگ برای بعد</button>
        <button type="button" className="ck-btn" disabled={saving} onClick={() => keepSheet(true)}>ذخیره و مقایسه با کلید</button>
      </> : step === 'result' && grade ? <>
        {ctx.onApply && <button type="button" className="ck-btn primary" disabled={saving || !grade.graded} onClick={() => save(true)}><Check size={17} /> {ctx.applyLabel || 'ثبت در گزارش'}</button>}
        <button type="button" className={'ck-btn' + (ctx.onApply ? '' : ' primary')} disabled={saving || !grade.graded} onClick={() => save(false)}>{ctx.onApply ? 'فقط ذخیره در تاریخچه' : 'ذخیره در تاریخچه'}</button>
        {!preset && !ctx.onApply && hasRead && <button type="button" className="ck-btn" disabled={saving} onClick={() => keepSheet(false)}><Save size={16} /> فقط ذخیره‌ی پاسخ‌برگ (بدون تصحیح)</button>}
        {ctx.onApply && counts && grade.graded > 0 && (
          <span className="ck-apply-note">ثبت می‌شود: کل {P(counts.total)} · غلط {P(counts.wrong)} · نزده {P(counts.blank)}
            {ctx.current && (ctx.current.total || ctx.current.wrong || ctx.current.blank) ? <em> (جایگزین کل {P(ctx.current.total || 0)}، غلط {P(ctx.current.wrong || 0)}، نزده {P(ctx.current.blank || 0)})</em> : null}
          </span>)}
      </> : undefined}>
      {!preset && !only && <Seg value={step} onChange={(v) => { if (v === 'result' && !sheet.marks?.marked) return; setStep(v as any); }} label="مرحله" items={[['sheet', '۱ · پاسخ‌برگ'], ['result', '۲ · نتیجه']]} />}
      {preset && <p className="ck-note">{P(preset.answered)} پاسخ از «{preset.title}» با کلید کتابی که انتخاب می‌کنی مقایسه می‌شود. می‌توانی هر وقت خواستی با کلید کتاب دیگری هم بسنجی.</p>}

      {step === 'sheet' && <SheetStep sheet={sheet} setSheet={setSheet} manual={manual} onSens={onSens} onNext={() => setStep('result')} hideNext={only} />}

      {step === 'result' && (
        <div className="ck-step">
          <section className="ck-card">
            <div className="ck-fields">
              <label className="ck-field grow"><span>کتاب (کلید)</span>
                <select value={bookId || ''} onChange={(e) => { setBookId(e.target.value || undefined); setStartTouched(false); }}>
                  <option value="">— انتخاب کن —</option>
                  {books.map((b) => <option key={b.id} value={b.id}>{b.title} ({P(b.count)} کلید)</option>)}
                </select>
              </label>
              <button type="button" className="ck-btn" onClick={() => setBuilder({})}><Plus size={16} /> کتاب جدید</button>
              {meta && <button type="button" className="ck-btn ghost" onClick={async () => setBuilder({ book: await getBook(meta.id) })}>ویرایش کلیدها</button>}
            </div>
            <div className="ck-fields">
              <label className="ck-field"><span>سؤال ۱ پاسخ‌برگ = سؤال … کتاب</span>
                <input type="number" min={1} value={startQ} onChange={(e) => { setStartTouched(true); setStartQ(Math.max(1, parseInt(e.target.value, 10) || 1)); }} />
              </label>
              <label className="ck-field"><span>تصحیح از سؤال (پاسخ‌برگ)</span>
                <input type="number" min={1} max={300} value={from} onChange={(e) => setFrom(Math.max(1, parseInt(e.target.value, 10) || 1))} />
              </label>
              <label className="ck-field"><span>تا سؤال</span>
                <input type="number" min={1} max={300} value={settings.to} onChange={(e) => setTo(Math.min(300, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
              </label>
            </div>
            {hint && !startTouched && <p className="ck-note">از توضیح این پارت به نظر می‌رسد تست‌های {P(hint.from)} تا {P(hint.to)} را زده‌ای؛ پاسخ‌برگ با همین فرض تصحیح شد. اگر این‌طور نیست، شماره‌ی بالا را عوض کن.</p>}
            <button type="button" className="ck-btn sm ghost" onClick={() => setShowSet(!showSet)}><Settings2 size={15} /> تنظیمات نمره</button>
            {showSet && (
              <div className="ck-fields">
                <label className="ck-field"><span>هر غلط چقدر کم می‌کند</span>
                  <select value={prefs.penalty} onChange={(e) => setPref({ penalty: +e.target.value as 0 | 3 | 4 })}><option value={3}>یک‌سوم نمره (کنکور)</option><option value={4}>یک‌چهارم نمره</option><option value={0}>هیچ</option></select>
                </label>
                <label className="ck-field"><span>دو علامت روی یک سؤال</span>
                  <select value={prefs.dblWrong ? 'wrong' : 'blank'} onChange={(e) => setPref({ dblWrong: e.target.value === 'wrong' })}><option value="blank">نزده حساب شود</option><option value="wrong">غلط حساب شود</option></select>
                </label>
                <button type="button" className="ck-btn sm" onClick={() => setManual({})}>لغو اصلاح‌های دستی</button>
              </div>
            )}
          </section>

          {!meta && <section className="ck-empty">
            {books.length ? 'برای تصحیح، کتابی را که از آن تست زدی انتخاب کن.' : 'هنوز هیچ کلیدی در کتابخانه نیست. اولین کتاب را از روی عکس صفحه‌ی کلید یا متن بساز.'}
            <div><button type="button" className="ck-btn primary" onClick={() => setBuilder({})}><Plus size={16} /> افزودن کتاب و کلید</button></div>
          </section>}
          {meta && !keys && <p className="ck-hint">در حال بارگذاری کلیدها…</p>}
          {grade && grade.nokey > 0 && meta && keys && (
            <p className="ck-warn">{P(grade.nokey)} سؤال از محدوده کلید ندارد و حساب نشد. شماره‌ی «سؤال ۱ پاسخ‌برگ» را بررسی کن یا کلیدهای کم را به کتاب اضافه کن.</p>
          )}
          {grade && grade.graded > 0 && <ResultView grade={grade} penalty={prefs.penalty} onPick={pick} />}
          {!preset && <div className="ck-row"><button type="button" className="ck-btn ghost" onClick={() => setStep('sheet')}><ArrowRight size={16} /> برگشت به پاسخ‌برگ</button></div>}
        </div>
      )}

      {builder && <KeyBuilder book={builder.book} defaults={{ lesson: ctx.lesson, source: ctx.source }} onClose={() => setBuilder(null)} onSaved={(b) => { setChosen(true); setBookId(b.id); setStartTouched(false); }} />}
    </Modal>
  );
};
