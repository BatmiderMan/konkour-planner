import React from 'react';
import { ListChecks, ScanLine, Scale, Trash2, Eye } from 'lucide-react';
import { SavedSheet } from './model';
import { deleteSheet } from './store';
import { clock, dayOf, timeOf } from './format';
import { confirmDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';

const SheetCard: React.FC<{ s: SavedSheet; onOpen: (s: SavedSheet) => void; onCompare: (s: SavedSheet) => void }> = ({ s, onOpen, onCompare }) => {
  const running = s.mode === 'live' && s.state === 'open';
  const tone = s.pct === undefined ? '' : s.pct >= 60 ? 'good' : s.pct >= 30 ? 'mid' : 'low';
  return (
    <article className={'ck-sh' + (running ? ' running' : '')}>
      <button type="button" className="ck-sh-main" onClick={() => onOpen(s)}>
        <span className="ck-sh-ico">{s.mode === 'live' ? <ListChecks size={20} /> : <ScanLine size={20} />}</span>
        <span className="ck-sh-t">
          <b>{s.title}</b>
          <small>
            {s.mode === 'live' ? 'پاسخ‌برگ مجازی' : 'اسکن پاسخ‌برگ کاغذی'} · {P(dayOf(s.updatedAt))} {P(timeOf(s.updatedAt))}
            {s.mode === 'live' && s.spentMs ? ` · ${P(clock(s.spentMs))}` : ''}
          </small>
        </span>
        {running && <span className="ck-pill bad">در حال آزمون</span>}
        <span className="ck-pill">{P(s.answered)} پاسخ</span>
        {s.pct !== undefined && <span className={'ck-pct ' + tone} title={s.bookTitle ? 'آخرین مقایسه با ' + s.bookTitle : undefined}>{P(s.pct)}٪</span>}
      </button>
      <footer>
        <span className="ck-book-avg">{s.pct === undefined ? 'هنوز با کلیدی مقایسه نشده' : `آخرین مقایسه: ${s.bookTitle || 'کتاب'}`}</span>
        <span className="ck-sh-act">
          <button type="button" className="ck-btn sm" onClick={() => onOpen(s)}><Eye size={14} /> {running ? 'ادامه' : 'مشاهده و ویرایش'}</button>
          <button type="button" className="ck-btn sm primary" disabled={!s.answered} onClick={() => onCompare(s)}><Scale size={14} /> مقایسه با کلید</button>
          <button type="button" className="ck-btn sm ghost danger" aria-label="حذف" onClick={async () => { if (await confirmDialog(`«${s.title}» حذف شود؟ نتیجه‌هایی که قبلاً در تاریخچه ذخیره شده می‌مانند.`)) deleteSheet(s.id); }}><Trash2 size={14} /></button>
        </span>
      </footer>
    </article>
  );
};

/** «پاسخ‌برگ‌های من»: the person's own answer sheets — typed during a test or scanned from paper — kept without any key. */
export const SheetsTab: React.FC<{
  sheets: SavedSheet[] | null;
  onNew: () => void; onScan: () => void;
  onOpen: (s: SavedSheet) => void; onCompare: (s: SavedSheet) => void;
}> = ({ sheets, onNew, onScan, onOpen, onCompare }) => (
  <>
    <div className="ck-row">
      <button type="button" className="ck-btn primary" onClick={onNew}><ListChecks size={17} /> پاسخ‌برگ مجازی (حین آزمون)</button>
      <button type="button" className="ck-btn" onClick={onScan}><ScanLine size={17} /> اسکن پاسخ‌برگ کاغذی و ذخیره</button>
    </div>
    {sheets === null ? <p className="ck-hint">در حال بارگذاری…</p> :
      sheets.length === 0 ? (
        <div className="ck-empty big">
          <h2>هنوز پاسخ‌برگی ذخیره نکرده‌ای</h2>
          <p>هنگام آزمون پاسخ‌هایت را روی پاسخ‌برگ مجازی علامت بزن، یا از پاسخ‌برگ کاغذی عکس بگیر. بدون هیچ کلیدی ذخیره می‌شود و هر وقت کلید را داشتی، با یک کلیک درصدت را می‌گیری.</p>
        </div>
      ) : <div className="ck-sheets">{sheets.map((s) => <SheetCard key={s.id} s={s} onOpen={onOpen} onCompare={onCompare} />)}</div>}
  </>
);
