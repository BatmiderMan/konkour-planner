import React, { useEffect, useRef, useState } from 'react';
import { ScanLine, Plus, Upload, Download, BookOpen, History, Trash2, RefreshCw, ChevronDown, ListChecks, FileText } from 'lucide-react';
import { useLibrary } from './hooks';
import { KeyBuilder } from './KeyBuilder';
import { SheetsTab } from './SheetsTab';
import { VirtualSheet } from './VirtualSheet';
import { dayOf, timeOf } from './format';
import { MissList } from './ResultView';
import { openScan, CheckerFocus } from './launch';
import { Book, BookMeta, SavedSheet, ScanRecord, regrade } from './model';
import { deleteScan, downloadJson, exportLibrary, getBook, importLibrary, keysOf, saveScan } from './store';
import { Seg } from './ui';
import { alertDialog, confirmDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';
import './checker.css';

const BookCard: React.FC<{ b: BookMeta; scans: ScanRecord[]; onEdit: () => void }> = ({ b, scans, onEdit }) => {
  const mine = scans.filter((s) => s.bookId === b.id);
  const avg = mine.length ? Math.round(mine.slice(0, 5).reduce((a, s) => a + s.pct, 0) / Math.min(5, mine.length)) : null;
  return (
    <article className="ck-book" style={{ ['--c' as any]: b.color }}>
      <button type="button" className="ck-book-main" onClick={onEdit}>
        <h3>{b.title}</h3>
        <p>{b.lesson || 'درس مشخص نشده'}{b.source ? ` · پیوند: ${b.source}` : ''}</p>
        <div className="ck-book-meta">
          <span>{P(b.count)} کلید</span>
          {b.count > 0 && <span>سؤال {P(b.min)} تا {P(b.max)}</span>}
          {b.weakCount > 0 && <span className="bad">{P(b.weakCount)} تأیید نشده</span>}
        </div>
      </button>
      <footer>
        <span className="ck-book-avg">{avg === null ? 'هنوز تصحیحی نشده' : `میانگین ${P(mine.length > 5 ? 5 : mine.length)} آخر: ${P(avg)}٪`}</span>
        <button type="button" className="ck-btn sm primary" onClick={() => openScan({ bookId: b.id, source: b.source, lesson: b.lesson })}><ScanLine size={15} /> تصحیح</button>
      </footer>
    </article>
  );
};

const HistoryRow: React.FC<{ s: ScanRecord }> = ({ s }) => {
  const [open, setOpen] = useState(false);
  const redo = async () => {
    const k = await keysOf(s.bookId);
    if (!k) { await alertDialog('کتاب این تصحیح دیگر در کتابخانه نیست.'); return; }
    await saveScan(regrade(s, k));
  };
  const tone = s.pct >= 60 ? 'good' : s.pct >= 30 ? 'mid' : 'low';
  return (
    <article className="ck-hist">
      <button type="button" className="ck-hist-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={'ck-pct ' + tone}>{P(s.pct)}٪</span>
        <span className="ck-hist-t">
          <b>{s.bookTitle || 'بدون کتاب'}</b>
          <small>{[s.link?.lesson, s.link?.label].filter(Boolean).join(' · ') || `سؤال ${P(s.startQ + s.from - 1)} تا ${P(s.startQ + s.to - 1)}`}</small>
        </span>
        <span className="ck-hist-c"><i className="ok">{P(s.correct)}</i><i className="bad">{P(s.wrong)}</i><i className="blank">{P(s.blank + s.double)}</i></span>
        <span className="ck-hist-d">{P(timeOf(s.at))}</span>
        <ChevronDown size={18} className={open ? 'up' : ''} />
      </button>
      {open && (
        <div className="ck-hist-body">
          <p className="ck-hint">{P(s.total)} سؤال تصحیح شد: سؤال {P(s.startQ + s.from - 1)} تا {P(s.startQ + s.to - 1)} کتاب. زیر، فقط سؤال‌هایی است که درست نبود.</p>
          <MissList rec={s} />
          <div className="ck-row">
            {s.bookId && <button type="button" className="ck-btn sm" onClick={redo}><RefreshCw size={14} /> نمره‌گیری دوباره با کلید فعلی</button>}
            <button type="button" className="ck-btn sm danger" onClick={async () => { if (await confirmDialog('این تصحیح از تاریخچه حذف شود؟')) deleteScan(s.id); }}><Trash2 size={14} /> حذف</button>
          </div>
        </div>
      )}
    </article>
  );
};

/** The checker section: the answer library (books and keys) and the history of checked sheets. */
export const CheckerView: React.FC<{ focus?: CheckerFocus | null; onFocusUsed?: () => void }> = ({ focus, onFocusUsed }) => {
  const { books, scans, sheets } = useLibrary();
  const [tab, setTab] = useState<'books' | 'sheets' | 'history'>('books');
  const [virtual, setVirtual] = useState<{ sheet?: SavedSheet } | null>(null);
  const [builder, setBuilder] = useState<{ book?: Book; defaults?: { lesson?: string; source?: string } } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focus) return;
    if (focus.tab) setTab(focus.tab);
    if (focus.newBook || focus.source || focus.lesson) {
      const found = books.find((b) => b.source && b.source === focus.source);
      if (found) getBook(found.id).then((bk) => setBuilder({ book: bk }));
      else if (focus.newBook) setBuilder({ defaults: { lesson: focus.lesson, source: focus.source } });
    }
    onFocusUsed?.();
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const doImport = async (f: File) => {
    try { const r = await importLibrary(await f.text()); await alertDialog(`${P(r.books)} کتاب، ${P(r.sheets)} پاسخ‌برگ و ${P(r.scans)} تصحیح وارد شد.`); }
    catch (e: any) { await alertDialog('فایل خوانده نشد: ' + e.message); }
  };
  const list = scans || [];
  const groups: { day: string; items: ScanRecord[] }[] = [];
  list.forEach((s) => { const d = dayOf(s.at), g = groups[groups.length - 1]; if (g && g.day === d) g.items.push(s); else groups.push({ day: d, items: [s] }); });

  return (
    <div className="ck-view">
      <header className="ck-head">
        <div>
          <h1>تصحیح پاسخ‌برگ</h1>
          <p>کلید کتاب‌هایت را یک‌بار ذخیره کن؛ پاسخ‌هایت را با عکس پاسخ‌برگ یا هم‌زمان با آزمون روی پاسخ‌برگ مجازی ثبت کن و هر وقت خواستی با کلید بسنج. عددها خودکار در گزارش پارت می‌نشیند.</p>
        </div>
        <div className="ck-head-actions">
          <button type="button" className="ck-btn primary big" onClick={() => openScan({})}><ScanLine size={20} /> تصحیح پاسخ‌برگ</button>
          <button type="button" className="ck-btn big" onClick={() => setVirtual({})}><ListChecks size={20} /> پاسخ‌برگ مجازی</button>
        </div>
      </header>

      <div className="ck-toolbar">
        <Seg value={tab} onChange={(v) => setTab(v as any)} label="بخش" items={[['books', <><BookOpen size={15} /> کتاب‌ها و کلیدها ({P(books.length)})</>], ['sheets', <><FileText size={15} /> پاسخ‌برگ‌های من{sheets ? ` (${P(sheets.length)})` : ''}</>], ['history', <><History size={15} /> تاریخچه{scans ? ` (${P(scans.length)})` : ''}</>]]} />
        <span className="ck-grow" />
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }} />
        <button type="button" className="ck-btn sm ghost" onClick={() => fileRef.current?.click()}><Upload size={15} /> وارد کردن</button>
        <button type="button" className="ck-btn sm ghost" disabled={!books.length && !(sheets && sheets.length)} onClick={async () => downloadJson('planex-answer-library.json', await exportLibrary({ withScans: true, withSheets: true }))}><Download size={15} /> پشتیبان</button>
      </div>

      {tab === 'books' && (
        books.length === 0 ? (
          <div className="ck-empty big">
            <h2>کتابخانه‌ی کلیدها خالی است</h2>
            <p>اولین کتاب را بساز: از یک صفحه‌ی کلید عکس بگیر، یا متن کلید را بچسبان. کتاب‌ها فقط روی همین دستگاه ذخیره می‌شوند و می‌توانی از آن‌ها پشتیبان بگیری.</p>
            <button type="button" className="ck-btn primary" onClick={() => setBuilder({})}><Plus size={17} /> افزودن کتاب</button>
          </div>
        ) : (
          <div className="ck-books">
            {books.map((b) => <BookCard key={b.id} b={b} scans={list} onEdit={async () => setBuilder({ book: await getBook(b.id) })} />)}
            <button type="button" className="ck-book add" onClick={() => setBuilder({})}><Plus size={22} /><span>کتاب جدید</span></button>
          </div>
        )
      )}

      {tab === 'sheets' && (
        <SheetsTab sheets={sheets} onNew={() => setVirtual({})} onScan={() => openScan({ sheetOnly: true })}
          onOpen={(s) => setVirtual({ sheet: s })} onCompare={(s) => openScan({ sheet: s })} />
      )}

      {tab === 'history' && (
        scans === null ? <p className="ck-hint">در حال بارگذاری…</p> :
        list.length === 0 ? (
          <div className="ck-empty big"><h2>هنوز پاسخ‌برگی تصحیح نشده</h2><p>اولین تصحیح را بزن؛ نتیجه‌ها این‌جا می‌مانند تا اشتباه‌هایت را مرور کنی.</p>
            <button type="button" className="ck-btn primary" onClick={() => openScan({})}><ScanLine size={17} /> تصحیح پاسخ‌برگ</button></div>
        ) : groups.map((g) => (
          <section key={g.day} className="ck-day"><h3>{P(g.day)}</h3>{g.items.map((s) => <HistoryRow key={s.id} s={s} />)}</section>
        ))
      )}

      {virtual && <VirtualSheet sheet={virtual.sheet} onClose={() => setVirtual(null)} onCompare={(s) => { setVirtual(null); openScan({ sheet: s }); }} />}
      {builder && <KeyBuilder book={builder.book} defaults={builder.defaults} onClose={() => setBuilder(null)} />}
    </div>
  );
};
