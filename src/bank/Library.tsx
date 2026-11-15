import React, { useRef, useState } from 'react';
import { Upload, Trash2, History, ListTree, Play, FileText, BookOpen, AlertTriangle } from 'lucide-react';
import { Lab } from './parts';
import { Attempt, BankBook, deleteAttempt, deleteSet, importPack, removeBook, saveAttempt, saveSet, setSections } from './store';
import { parsePack } from './pack';
import { Run } from './Player';
import { alertDialog, confirmDialog } from '../dialog';
import { showUndo } from '../undo';
import { toPersianDigits as P } from '../utils';
import { SkeletonRows } from '../components/ui/Skeleton';

const parseSecs = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)[\s:،,-]*(\d+)\s*[-–تا\s]+\s*(\d+)\s*$/); return m ? { name: m[1].trim() || 'فصل', from: +m[2], to: +m[3] } : null; }).filter(Boolean) as Array<{ name: string; from: number; to: number }>;

const SecEditor: React.FC<{ book: BankBook; lab: Lab; onClose: () => void }> = ({ book, lab, onClose }) => {
  const [t, setT] = useState((lab.sections[book.id] || []).map((s) => `${s.name} ${s.from}-${s.to}`).join('\n'));
  return (
    <div className="bk-form bk-secs">
      <b>فصل‌بندی «{book.title}»</b>
      <p className="bk-hint">هر خط یک فصل: نام و بازهٔ سؤال، مثل «فصل ۱ — حسابان 1-120». بعد در آزمون‌ساز فصل‌ها را تیک بزنید.</p>
      <textarea className="bk-note" rows={6} value={t} onChange={(e) => setT(e.target.value)} dir="rtl" />
      <div className="bk-acts"><button type="button" className="bk-btn" onClick={onClose}>بستن</button>
        <button type="button" className="bk-btn primary" onClick={async () => { await setSections(book.id, parseSecs(t.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))); onClose(); }}>ذخیره فصل‌ها</button></div>
    </div>
  );
};

export const Library: React.FC<{ lab: Lab; onStart: (r: Run) => void; onOpen: (a: Attempt) => void; onPdf: (refs: Array<{ b: string; n: number }>, title: string, mixed: boolean) => void }> = ({ lab, onStart, onOpen, onPdf }) => {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [sec, setSec] = useState('');
  const doImport = async (files: File[]) => {
    const msgs: string[] = [];
    for (const f of files) {
      try {
        setBusy(`در حال خواندن «${f.name}»…`);
        const pack = parsePack(await f.arrayBuffer());
        const b = await importPack(pack, (d, t) => setBusy(`«${f.name}» · ذخیره تصاویر ${P(d)} از ${P(t)}`));
        msgs.push(`«${b.title}»${b.partsTotal && b.partsTotal > 1 ? ` (بخش ${P((pack.header as any).part || 1)} از ${P(b.partsTotal)})` : ''}: ${P(b.numbers.length)} سؤال، ${P(b.expl.length)} تشریحی`);
      } catch (e: any) { msgs.push(`${f.name}: ${e?.message || 'خوانده نشد'}`); }
    }
    setBusy(''); await alertDialog(msgs.join('\n'));
  };
  return (
    <section className="bk-lib">
      <header className="bk-hh">
        <div><p>کتاب‌ها فقط روی همین دستگاه ذخیره می‌شوند. هر کتاب ممکن است چند بخش باشد؛ همهٔ بخش‌ها را (با هر ترتیب) وارد کنید تا ادغام شوند.</p></div>
        <button type="button" className="bk-btn primary" onClick={() => file.current?.click()} disabled={!!busy}><Upload size={18} /> افزودن کتاب (.qbank)</button>
        <input ref={file} type="file" multiple accept=".qbank,application/octet-stream" hidden onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) doImport(f); }} />
      </header>
      {busy && <p className="bk-busy" role="status">{busy}</p>}
      {!lab.ready && <SkeletonRows rows={3} />}
      {lab.ready && !lab.books.length && !busy && <div className="bk-emptybox"><BookOpen size={36} /><b>هنوز کتابی اضافه نشده</b><span>فایل(های) .qbank را با دکمهٔ بالا وارد کنید.</span></div>}
      <div className="bk-books">
        {lab.books.map((b) => {
          const miss = b.partsTotal && b.partsTotal > 1 && (b.parts?.length || 0) < b.partsTotal;
          return (
            <div key={b.id} className="bk-bookcard col">
              <div className="bk-bookrow">
                <div><b>{b.title}</b>
                  <span>{P(b.numbers.length)} سؤال · {P(b.expl.length)} تشریحی · کلید {P(Object.keys(b.answers).length)} تست{b.total ? ` از ${P(b.total)}` : ''}</span>
                  {miss && <span className="bk-warn"><AlertTriangle size={14} /> بخش‌های واردشده: {P((b.parts || []).join('، '))} از {P(b.partsTotal || 0)} — بقیه را هم وارد کنید.</span>}
                </div>
                <button type="button" className="bk-del" aria-label="حذف کتاب" onClick={async () => {
                  if (!(await confirmDialog(`«${b.title}» با تصاویر حذف شود؟ سؤال‌های گنجینه که به این کتاب وصل‌اند می‌مانند ولی تصویرشان تا وارد کردن دوباره دیده نمی‌شود.`))) return;
                  await removeBook(b.id, true);
                }}><Trash2 size={18} /></button>
              </div>
              <div className="bk-acts">
                <button type="button" className="bk-btn" onClick={() => setSec(sec === b.id ? '' : b.id)}><ListTree size={16} /> فصل‌بندی ({P((lab.sections[b.id] || []).length)})</button>
              </div>
              {sec === b.id && <SecEditor book={b} lab={lab} onClose={() => setSec('')} />}
            </div>
          );
        })}
      </div>
      {lab.sets.length > 0 && (
        <div className="bk-hist"><h3>مجموعه‌های من</h3>
          <ul>{lab.sets.map((s) => (
            <li key={s.id}><div className="bk-setrow"><span><b>{s.name}</b><small>{P(s.refs.length)} سؤال · {P(new Set(s.refs.map((r) => r.b)).size)} کتاب</small></span>
              <button type="button" className="bk-btn" onClick={() => onStart({ refs: s.refs.filter((r) => lab.bookMap.get(r.b)?.numbers.includes(r.n)), practice: true, minutes: 0, title: s.name })}><Play size={16} /> آزمون</button>
              <button type="button" className="bk-btn" onClick={() => onPdf(s.refs, s.name, new Set(s.refs.map((r) => r.b)).size > 1)}><FileText size={16} /> PDF</button>
              <button type="button" className="bk-del" aria-label="حذف" onClick={async () => { await deleteSet(s.id); showUndo('مجموعه حذف شد', () => saveSet(s)); }}><Trash2 size={18} /></button></div></li>))}</ul></div>
      )}
      {lab.attempts.length > 0 && (
        <div className="bk-hist"><h3><History size={18} /> سابقهٔ آزمون‌ها</h3>
          <ul>{lab.attempts.slice(0, 40).map((a) => (
            <li key={a.id}><button type="button" onClick={() => onOpen(a)}><b>{P(a.pct)}٪</b>
              <span>{a.title || lab.bookMap.get(a.bookId)?.title || 'کتاب حذف‌شده'} · {P(a.items.length)} سؤال · {a.mode}<small>{new Date(a.at).toLocaleDateString('fa-IR')} — {P(a.correct)} درست، {P(a.wrong)} غلط، {P(a.blank)} نزده</small></span></button>
              <button type="button" className="bk-del" aria-label="حذف" onClick={async () => { await deleteAttempt(a.id); showUndo('سابقهٔ آزمون حذف شد', () => saveAttempt(a)); }}><Trash2 size={18} /></button></li>))}</ul></div>
      )}
    </section>
  );
};
