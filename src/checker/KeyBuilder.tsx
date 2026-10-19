import React, { useMemo, useRef, useState } from 'react';
import { Camera, FileText, Keyboard, Grid3x3, Trash2, Download } from 'lucide-react';
import { Book, BookMeta, KeyBatch, KeyMap, makeBook, withKeys } from './model';
import { deleteBook, downloadJson, exportLibrary, getBook, loadPrefs, savePrefs, saveBook } from './store';
import { KeyPhotoReader } from './KeyPhotoReader';
import { ExplanationReader } from './ExplanationReader';
import { PasteKeys } from './PasteKeys';
import { KeyGrid } from './KeyGrid';
import { Modal, Seg } from './ui';
import { loadPlannerData } from '../plannerStore';
import { alertDialog, confirmDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';

type Tab = 'photo' | 'expl' | 'text' | 'grid';

/** Create or edit one book of answer keys. Keys come from a photo of the key list, a detailed-answers page, pasted text, or by tapping the grid. */
export const KeyBuilder: React.FC<{
  book?: Book; defaults?: { title?: string; lesson?: string; source?: string };
  onClose: () => void; onSaved?: (b: Book) => void;
}> = ({ book, defaults, onClose, onSaved }) => {
  const planner = useMemo(() => loadPlannerData(), []);
  const testBooks = useMemo(() => Object.keys(planner.sourceColors).filter((n) => planner.sourceTypes[n] !== 'descriptive').sort((a, b) => a.localeCompare(b, 'fa')), [planner]);
  const lessons = useMemo(() => Array.from(new Set(planner.subjects.map((s) => s.n))), [planner]);

  const keys = useRef<KeyMap>(book ? KeyMap.fromSegs(book.segs) : new KeyMap());
  const [weak, setWeak] = useState<Set<number>>(() => new Set(book?.weak || []));
  const [edited, setEdited] = useState<Set<number>>(() => new Set());
  const [ver, setVer] = useState(0);
  const [title, setTitle] = useState(book?.title || defaults?.title || '');
  const [lesson, setLesson] = useState(book?.lesson || defaults?.lesson || '');
  const [source, setSource] = useState(book?.source || defaults?.source || '');
  const [tab, setTab] = useState<Tab>(book && book.count ? 'grid' : 'photo');
  const [from, setFrom] = useState(book?.min || 1);
  const [dirty, setDirty] = useState(false);
  const [rtl, setRtl] = useState(() => loadPrefs().rtl);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');

  const r = keys.current.range();
  const nextStart = r ? r[1] + 1 : 1;

  const addBatch = (b: KeyBatch) => {
    keys.current.assign(b.keys); (b.remove || []).forEach((n) => keys.current.delete(n));
    const w = new Set(weak), e = new Set(edited);
    Object.keys(b.keys).forEach((n) => { w.delete(+n); });
    (b.remove || []).forEach((n) => w.delete(n));
    b.weak.forEach((n) => w.add(n)); (b.edited || []).forEach((n) => e.add(n));
    setWeak(w); setEdited(e); setFrom(b.first); setVer((v) => v + 1); setDirty(true);
    setFlash(`${P(Object.keys(b.keys).length)} کلید به جدول اضافه شد`);
  };
  const cycle = (n: number) => {
    keys.current.set(n, ((keys.current.get(n) || 0) % 4) + 1);
    const w = new Set(weak); w.delete(n); const e = new Set(edited); e.add(n);
    setWeak(w); setEdited(e); setVer((v) => v + 1); setDirty(true);
  };

  const close = async () => { if (dirty && !(await confirmDialog('تغییرهای ذخیره‌نشده از بین می‌رود. بسته شود؟'))) return; onClose(); };

  const save = async () => {
    const name = title.trim();
    if (!name) { await alertDialog('برای کتاب یک نام بنویس.'); return; }
    if (!keys.current.size) { await alertDialog('هنوز هیچ کلیدی اضافه نشده است.'); return; }
    setSaving(true);
    savePrefs({ ...loadPrefs(), rtl });
    const base: Book = book ? { ...book } : makeBook(name, new KeyMap());
    const out = withKeys({ ...base, title: name, lesson: lesson || undefined, source: source || undefined }, keys.current, Array.from(weak).filter((n) => keys.current.has(n)));
    await saveBook(out); setSaving(false); setDirty(false);
    onSaved?.(out); onClose();
  };

  const remove = async () => {
    if (!book) return;
    if (!(await confirmDialog(`کتاب «${book.title}» و همه‌ی کلیدهایش حذف شود؟ نتیجه‌های ذخیره‌شده‌ی قبلی می‌مانند.`))) return;
    await deleteBook(book.id); onClose();
  };
  const exportOne = async () => { if (!book) return; downloadJson(`kelid-${book.title.replace(/\s+/g, '-')}.json`, await exportLibrary({ bookIds: [book.id] })); };

  return (
    <Modal wide title={book ? 'ویرایش کتاب' : 'کتاب جدید'} onClose={close}
      footer={<>
        <button type="button" className="ck-btn primary" onClick={save} disabled={saving}>{saving ? 'در حال ذخیره…' : 'ذخیره در کتابخانه'}</button>
        <button type="button" className="ck-btn" onClick={close}>انصراف</button>
        {book && <>
          <span className="ck-grow" />
          <button type="button" className="ck-btn ghost" onClick={exportOne}><Download size={16} /> خروجی</button>
          <button type="button" className="ck-btn danger" onClick={remove}><Trash2 size={16} /> حذف</button>
        </>}
      </>}>
      <section className="ck-card">
        <div className="ck-fields">
          <label className="ck-field grow"><span>نام کتاب</span><input type="text" value={title} placeholder="مثلاً حسابان جامع نردبام" onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></label>
          <label className="ck-field"><span>درس</span>
            <select value={lesson} onChange={(e) => { setLesson(e.target.value); setDirty(true); }}><option value="">— انتخاب نشده —</option>{lessons.map((l) => <option key={l} value={l}>{l}</option>)}</select>
          </label>
          <label className="ck-field"><span>پیوند با کتاب برنامه‌ریز</span>
            <select value={source} onChange={(e) => { setSource(e.target.value); setDirty(true); }}><option value="">— بدون پیوند —</option>{testBooks.map((l) => <option key={l} value={l}>{l}</option>)}</select>
          </label>
        </div>
        <p className="ck-hint">با پیوند دادن به کتاب برنامه‌ریز، وقتی پارتی از همین کتاب را تمام کنی، کلیدش خودکار انتخاب می‌شود.</p>
      </section>

      <section className="ck-card">
        <div className="ck-card-head">
          <h3>کلیدها</h3>
          <span className="ck-pill">{keys.current.size ? `${P(keys.current.size)} کلید، سؤال ${P(r![0])} تا ${P(r![1])}` : 'هنوز کلیدی نیست'}</span>
          {weak.size > 0 && <span className="ck-pill bad">{P(weak.size)} تأیید نشده</span>}
          {flash && <span className="ck-pill ok" role="status">{flash}</span>}
        </div>
        <Seg value={tab} onChange={(v) => setTab(v as Tab)} label="روش افزودن کلید" items={[
          ['photo', <><Camera size={15} /> عکس صفحه‌ی کلید</>],
          ['expl', <><FileText size={15} /> پاسخ تشریحی</>],
          ['text', <><Keyboard size={15} /> تایپ / چسباندن</>],
          ['grid', <><Grid3x3 size={15} /> جدول کلیدها</>]
        ]} />
        {tab === 'photo' && <KeyPhotoReader suggestStart={nextStart} rtl={rtl} onRtl={setRtl} onAdd={addBatch} />}
        {tab === 'expl' && <ExplanationReader suggestStart={nextStart} onAdd={addBatch} />}
        {tab === 'text' && <PasteKeys suggestStart={nextStart} onAdd={addBatch} />}
        {tab !== 'grid' && keys.current.size > 0 && <button type="button" className="ck-btn sm ghost" onClick={() => setTab('grid')}>دیدن و اصلاح جدول کلیدها</button>}
        {tab === 'grid' && (
          keys.current.size
            ? <>
                <p className="ck-hint">روی هر کلید بزنی ۱→۲→۳→۴ عوض می‌شود. قرمز یعنی تأیید نشده، زرد یعنی با دست تغییر کرده. جدول را با کتاب مقایسه کن.</p>
                <KeyGrid keys={keys.current} ver={ver} weak={weak} edited={edited} from={from} onFrom={setFrom} onCycle={cycle} />
              </>
            : <div className="ck-empty">هنوز کلیدی اضافه نشده. از یکی از سه روش بالا شروع کن.</div>
        )}
      </section>
    </Modal>
  );
};

/** helper for callers: open the builder on an existing library entry */
export async function loadBookForEdit(meta: BookMeta): Promise<Book | undefined> { return getBook(meta.id); }
