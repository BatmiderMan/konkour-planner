import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, ChevronDown, Plus, Scale } from 'lucide-react';
import { SHEET_N, SavedSheet, countAnswered, emptySheetString, makeSavedSheet, setAnswer, withAnswers } from './model';
import { notifyChanged, saveSheet } from './store';
import { Modal } from './ui';
import { clock, defaultTitle } from './format';
import { toPersianDigits as P } from '../utils';

const PRESETS = [25, 50, 75, 100];

/**
 * The virtual answer sheet. Two ways in:
 *  - a new test: pick a name and the number of questions, then tap the answers while taking the test (saved on every tap,
 *    so closing the app or the phone dying loses nothing; the sheet stays «در حال آزمون» until finished);
 *  - an already saved sheet (typed earlier or scanned from paper): look at it, correct single answers, continue.
 * Nothing here needs a key. Comparing with a book is a separate step (onCompare).
 */
export const VirtualSheet: React.FC<{
  sheet?: SavedSheet;
  onClose: () => void;
  onCompare: (s: SavedSheet) => void;
}> = ({ sheet: initial, onClose, onCompare }) => {
  const [rec, setRec] = useState<SavedSheet | null>(initial || null);
  const recRef = useRef<SavedSheet | null>(initial || null);
  const [title, setTitle] = useState(() => defaultTitle('آزمون'));
  const [size, setSize] = useState(50);
  const [running, setRunning] = useState(true);
  const dirty = useRef(false);

  const commit = useCallback((next: SavedSheet, silent = true) => {
    recRef.current = next; setRec(next); dirty.current = true;
    saveSheet(next, { silent });
  }, []);

  /* ---------- timer: counts only while this screen is open and visible; saved every few seconds with the answers ---------- */
  const ticking = !!rec && rec.mode === 'live' && rec.state === 'open';
  useEffect(() => {
    if (!ticking || !running) return;
    let tick = 0;
    const id = window.setInterval(() => {
      if (document.hidden || !recRef.current) return;
      tick++;
      const cur = recRef.current;
      const next = { ...cur, spentMs: (cur.spentMs || 0) + 1000 };
      recRef.current = next; setRec(next);
      if (tick % 10 === 0) saveSheet({ ...next, updatedAt: Date.now() }, { silent: true });
    }, 1000);
    return () => window.clearInterval(id);
  }, [ticking, running]);

  // make sure the last second of time and the last tap are on disk, and the lists behind the screen refresh
  useEffect(() => () => {
    const cur = recRef.current;
    if (cur && dirty.current) saveSheet({ ...cur, updatedAt: Date.now() }, { silent: false }); else notifyChanged();
  }, []);

  const start = () => {
    const r = makeSavedSheet(title.trim() || defaultTitle('آزمون'), 'live', emptySheetString(), { size });
    recRef.current = r; setRec(r); dirty.current = true; saveSheet(r, { silent: true });
  };

  /* ---------- setup screen ---------- */
  if (!rec) {
    return (
      <Modal title="پاسخ‌برگ مجازی" onClose={onClose}
        footer={<button type="button" className="ck-btn primary" onClick={start}>شروع آزمون</button>}>
        <section className="ck-card">
          <p className="ck-hint">پاسخ‌هایت را هم‌زمان با آزمون روی همین صفحه علامت بزن. کلید لازم نیست؛ بعد از آزمون هر وقت خواستی با کلید یک کتاب مقایسه‌اش کن یا فقط نگهش دار. هر علامت همان لحظه ذخیره می‌شود.</p>
          <div className="ck-fields">
            <label className="ck-field grow"><span>نام آزمون</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
          </div>
          <div className="ck-fields">
            <div className="ck-field"><span>تعداد سؤال</span>
              <div className="ck-chips">
                {PRESETS.map((n) => <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)}>{P(n)}</button>)}
              </div>
            </div>
            <label className="ck-field"><span>یا عدد دلخواه</span>
              <input type="number" min={1} max={SHEET_N} value={size} onChange={(e) => setSize(Math.min(SHEET_N, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
            </label>
          </div>
        </section>
      </Modal>
    );
  }

  /* ---------- the sheet ---------- */
  const answers = rec.sheet;
  const rows = Math.min(SHEET_N, Math.max(1, rec.size));
  const done = countAnswered(answers.slice(0, rows));
  let firstBlank = 0;
  for (let q = 1; q <= rows && !firstBlank; q++) { const c = answers[q - 1]; if (!c || c === '0') firstBlank = q; }

  const pick = (q: number, o: number) => {
    const cur = answers[q - 1];
    const v = cur === String(o) ? 0 : o; // tapping the chosen option again clears it
    commit(withAnswers(rec, setAnswer(answers, q, v)));
  };
  const grow = () => commit(withAnswers(rec, answers, { size: Math.min(SHEET_N, rows + 25) }));
  const jump = () => { if (firstBlank) document.getElementById('vsq' + firstBlank)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  const rename = (t: string) => commit({ ...rec, title: t, updatedAt: Date.now() });
  const finish = (andCompare: boolean) => {
    const next = { ...withAnswers(rec, answers), state: 'done' as const };
    recRef.current = next; dirty.current = true;
    saveSheet(next, { silent: false }).then(() => { if (andCompare) onCompare(next); else onClose(); });
  };

  const rowsEls: React.ReactNode[] = [];
  for (let q = 1; q <= rows; q++) {
    const c = answers[q - 1] || '0';
    rowsEls.push(
      <div key={q} id={'vsq' + q} className={'ck-vs-q' + (c === 'd' ? ' dbl' : '') + (q % 5 === 0 ? ' sep' : '')}>
        <span className="ck-vs-n">{P(q)}</span>
        {[1, 2, 3, 4].map((o) => (
          <button key={o} type="button" className={'ck-vs-o' + (c === String(o) ? ' on' : '')} aria-pressed={c === String(o)} aria-label={`سؤال ${q} گزینه ${o}`} onClick={() => pick(q, o)}>{P(o)}</button>
        ))}
      </div>
    );
  }

  const isLive = rec.mode === 'live';
  return (
    <Modal wide onClose={onClose}
      title={<>{isLive ? 'پاسخ‌برگ مجازی' : 'پاسخ‌برگ ذخیره‌شده'}<small className="ck-ctx"> — {rec.title}</small></>}
      footer={<>
        <button type="button" className="ck-btn primary" disabled={!done} onClick={() => finish(true)}><Scale size={16} /> {isLive && rec.state === 'open' ? 'پایان و مقایسه با کلید' : 'مقایسه با کلید'}</button>
        <button type="button" className="ck-btn" onClick={() => finish(false)}>{isLive && rec.state === 'open' ? 'پایان آزمون، ذخیره برای بعد' : 'ذخیره و بستن'}</button>
        {isLive && rec.state === 'open' && <span className="ck-apply-note">با بستن پنجره، آزمون «در حال انجام» می‌ماند و بعداً ادامه‌اش می‌دهی.</span>}
      </>}>
      <div className="ck-vs-bar">
        <span className="ck-pill ok">{P(done)} از {P(rows)} پاسخ داده شد</span>
        {isLive && (
          <span className="ck-vs-clock">
            {ticking && <button type="button" className="ck-btn sm ghost" aria-label={running ? 'توقف زمان' : 'ادامه زمان'} onClick={() => setRunning(!running)}>{running ? <Pause size={14} /> : <Play size={14} />}</button>}
            <b>{P(clock(rec.spentMs || 0))}</b>
          </span>
        )}
        <span className="ck-grow" />
        <button type="button" className="ck-btn sm" disabled={!firstBlank} onClick={jump}><ChevronDown size={14} /> اولین نزده{firstBlank ? ` (${P(firstBlank)})` : ''}</button>
        <input className="ck-vs-title" type="text" value={rec.title} aria-label="نام پاسخ‌برگ" onChange={(e) => rename(e.target.value)} />
      </div>
      {rec.mode === 'scan' && <p className="ck-note">این پاسخ‌برگ از روی عکس خوانده شده؛ اگر جایی اشتباه خوانده شده، همین‌جا با یک ضربه اصلاحش کن.</p>}
      <div className="ck-vs-grid" dir="rtl">{rowsEls}</div>
      {rows < SHEET_N && <div className="ck-row"><button type="button" className="ck-btn sm ghost" onClick={grow}><Plus size={14} /> ۲۵ سؤال دیگر</button></div>}
    </Modal>
  );
};

