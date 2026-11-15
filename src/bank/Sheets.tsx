/** PDF exams made by the student: kept inside the app; fill the virtual answer sheet later, it is graded automatically. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Download, FileText, Trash2, Play, Pause, RotateCcw, Award } from 'lucide-react';
import { Lab } from './parts';
import { Sheet, SheetState, applyCross, applyFlag, applyPick } from './Sheet';
import { Attempt, MIX, SavedExam, deleteExam, examPdf, recordAttemptMeta, saveAttempt, saveExam } from './store';
import { fmtDur } from './lab';
import { alertDialog, confirmDialog } from '../dialog';
import { showUndo } from '../undo';
import { toPersianDigits as P } from '../utils';

export const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pdf';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
};
export const getPdf = async (e: SavedExam) => { const b = await examPdf(e.id); if (!b) { await alertDialog('فایل PDF این آزمون پیدا نشد.'); return; } download(b, e.title); };

export const SheetList: React.FC<{ exams: SavedExam[]; ready: boolean; onOpen: (e: SavedExam) => void }> = ({ exams, ready, onOpen }) => (
  <section className="bk-lib">
    <header className="bk-hh"><div><p>PDFهایی که در برنامه می‌سازید اینجا می‌مانند. آزمون را روی کاغذ (یا هر جا) حل کنید، بعد پاسخ‌برگ مجازی را پر کنید تا خودکار تصحیح شود.</p></div></header>
    {ready && !exams.length && <div className="bk-emptybox"><FileText size={36} /><b>هنوز PDF ذخیره‌شده‌ای نیست</b><span>در «آزمون‌ساز» دکمهٔ PDF را بزنید؛ فایل اینجا هم ذخیره می‌شود.</span></div>}
    <div className="bk-books">
      {exams.map((e) => (
        <div key={e.id} className="bk-bookcard col">
          <div className="bk-bookrow"><div><b>{e.title}</b><span>{P(e.refs.length)} سؤال · {new Date(e.at).toLocaleDateString('fa-IR')} · {P(Math.round(e.pdfSize / 1024 / 1024 * 10) / 10)} مگابایت</span>
            <span className={'bk-pill ' + (e.status === 'graded' ? 'ok' : '')}>{e.status === 'graded' ? `تصحیح شد · ${P(e.pct ?? 0)}٪` : e.status === 'filled' ? 'در حال پر کردن' : 'پاسخ‌برگ خالی'}</span></div>
            <button type="button" className="bk-del" aria-label="حذف" onClick={async () => { if (await confirmDialog(`«${e.title}» و فایل PDF آن حذف شود؟`)) { const pdf = await examPdf(e.id); await deleteExam(e.id); showUndo('آزمون حذف شد', () => saveExam(e, pdf)); } }}><Trash2 size={18} /></button></div>
          <div className="bk-acts"><button type="button" className="bk-btn primary" onClick={() => onOpen(e)}><Award size={16} /> {e.status === 'graded' ? 'مشاهدهٔ پاسخ‌برگ' : 'پر کردن پاسخ‌برگ'}</button>
            <button type="button" className="bk-btn" onClick={() => getPdf(e)}><Download size={16} /> دانلود PDF</button></div>
        </div>))}
    </div>
  </section>
);

export const SheetFill: React.FC<{ exam: SavedExam; lab: Lab; onBack: () => void; onResult: (a: Attempt) => void }> = ({ exam: e0, lab, onBack, onResult }) => {
  const [exam, setExam] = useState(e0);
  const [st, setSt] = useState<SheetState>({ picks: e0.picks, crossed: e0.crossed, flags: e0.flags });
  const [secs, setSecs] = useState(e0.seconds);
  const [run, setRun] = useState(false);
  const [mins, setMins] = useState(e0.minutes ? String(e0.minutes) : '');
  const graded = exam.status === 'graded';
  const refs = exam.refs, keys = useMemo(() => refs.map((r) => lab.bookMap.get(r.b)?.answers[r.n] || 0), [refs, lab]);
  const missing = refs.filter((r) => !lab.bookMap.get(r.b)).length;
  const labels = useMemo(() => refs.map((r, i) => P(exam.renumber ? i + 1 : r.n)), [refs, exam.renumber]);
  const timer = useRef<any>(0), save = useRef<any>(0), cur = useRef({ st, secs, exam }); cur.current = { st, secs, exam };
  const persist = useCallback(() => { const c = cur.current; const any = Object.values(c.st.picks).some(Boolean); saveExam({ ...c.exam, ...c.st, seconds: c.secs, status: c.exam.status === 'graded' ? 'graded' : any ? 'filled' : 'new' }, undefined, true).catch(() => { /* ignore */ }); }, []);
  useEffect(() => { if (graded) return; clearTimeout(save.current); save.current = setTimeout(persist, 500); return () => clearTimeout(save.current); }, [st, secs, graded, persist]);
  useEffect(() => () => { if (!cur.current.exam.status || cur.current.exam.status !== 'graded') persist(); }, [persist]);
  useEffect(() => { if (!run) return; timer.current = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(timer.current); }, [run]);
  const left = +mins > 0 ? Math.max(0, +mins * 60 - secs) : 0;

  const grade = async () => {
    if (missing) { await alertDialog('کتاب این آزمون در برنامه نیست؛ اول فایل کتاب را در «کتابخانه» وارد کنید تا کلید پاسخ‌ها در دسترس باشد.'); return; }
    const blank = refs.filter((_, i) => !st.picks[i]).length;
    if (blank && !(await confirmDialog(`${P(blank)} سؤال را نزده‌اید. تصحیح شود؟`))) return;
    setRun(false);
    let c = 0, w = 0; const mixed = new Set(refs.map((r) => r.b)).size > 1;
    const items = refs.map((r, i) => ({ n: r.n, pick: st.picks[i] || 0, b: r.b, sec: 0 }));
    items.forEach((it, i) => { if (!it.pick) return; if (it.pick === keys[i]) c++; else w++; });
    const a: Attempt = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), bookId: mixed ? MIX : refs[0].b, at: Date.now(), seconds: secs, items, correct: c, wrong: w, blank: refs.length - c - w,
      pct: Math.round(((3 * c - w) / (3 * refs.length)) * 1000) / 10, mode: 'پاسخ‌برگ PDF', title: exam.title };
    await saveAttempt(a); await recordAttemptMeta(a, (b, n) => lab.bookMap.get(b)?.answers[n] || 0);
    const ne: SavedExam = { ...exam, ...st, seconds: secs, minutes: +mins || 0, status: 'graded', attemptId: a.id, pct: a.pct };
    await saveExam(ne); setExam(ne); onResult(a);
  };
  const again = async () => {
    if (!(await confirmDialog('پاسخ‌برگ پاک شود تا دوباره پر کنید؟ کارنامهٔ قبلی در سابقه می‌ماند.'))) return;
    const ne: SavedExam = { ...exam, picks: {}, crossed: {}, flags: {}, seconds: 0, status: 'new', attemptId: undefined, pct: undefined };
    await saveExam(ne); setExam(ne); setSt({ picks: {}, crossed: {}, flags: {} }); setSecs(0);
  };
  const att = graded ? lab.attempts.find((a) => a.id === exam.attemptId) : undefined;
  return (
    <section className="bk-sheetpage">
      <div className="bk-rh"><button type="button" className="bk-btn ghost" onClick={onBack}><ArrowRight size={18} /> بازگشت</button><h2>{exam.title}</h2></div>
      <div className="bk-acts">
        {!graded && <>
          <span className={'bk-time' + (+mins > 0 && left < 60 ? ' low' : '')}>{P(fmtDur(+mins > 0 ? left : secs))}</span>
          <button type="button" className={'bk-btn' + (run ? ' primary' : '')} onClick={() => setRun((v) => !v)}>{run ? <Pause size={16} /> : <Play size={16} />} {run ? 'توقف زمان' : 'شروع زمان'}</button>
          <label className="bk-minin">زمان (دقیقه) <input inputMode="numeric" value={mins} placeholder="آزاد" onChange={(ev) => setMins(ev.target.value.replace(/\D/g, ''))} /></label>
        </>}
        <button type="button" className="bk-btn" onClick={() => getPdf(exam)}><Download size={16} /> PDF</button>
        {graded && <button type="button" className="bk-btn" onClick={again}><RotateCcw size={16} /> پر کردن دوباره</button>}
        {graded && att && <button type="button" className="bk-btn primary" onClick={() => onResult(att)}><Award size={16} /> کارنامه و پاسخ تشریحی</button>}
      </div>
      {missing > 0 && <p className="bk-warn">کتاب این آزمون در برنامه نیست؛ برای تصحیح، فایل کتاب را وارد کنید.</p>}
      <Sheet labels={labels} picks={st.picks} crossed={st.crossed} flags={st.flags} keys={graded ? keys : undefined}
        onPick={graded ? undefined : (i, v) => setSt((s) => applyPick(s, i, v))} onCross={graded ? undefined : (i, v) => setSt((s) => applyCross(s, i, v))} onFlag={graded ? undefined : (i) => setSt((s) => applyFlag(s, i))} />
      {!graded && <div className="bk-endrow"><button type="button" className="bk-btn primary wide" onClick={grade}><Award size={18} /> پایان و تصحیح خودکار</button></div>}
    </section>
  );
};
