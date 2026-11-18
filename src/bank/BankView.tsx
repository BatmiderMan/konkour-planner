/** بانک تست — the question laboratory: build mixed exams, practice with worked solutions, mark & level questions, make PDFs, link to the vault. */
import React, { useEffect, useRef, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { Attempt, LiveExam, Ref, SavedExam, listExams, listLive, discardLive, BANK_EVENT } from './store';
import { alertDialog, confirmDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';
import { Lab, useLab } from './parts';
import { Run, Player } from './Player';
import { Pressure } from './Pressure';
import { Result } from './Result';
import { Builder } from './Builder';
import { Browse } from './Browse';
import { Library } from './Library';
import { Stats } from './Stats';
import { SheetList } from './Sheets';
import { openExamSheet } from './examSheet';
import { PdfDialog } from './PdfDialog';
import './bank.css';

type Tab = 'build' | 'browse' | 'sheets' | 'lib' | 'stats';
const TABS: Array<[Tab, string]> = [['build', 'آزمون‌ساز'], ['browse', 'مرور'], ['sheets', 'پاسخ‌برگ'], ['lib', 'کتابخانه'], ['stats', 'آمار']];
interface PdfReq { refs: Ref[]; title: string; mixed: boolean; extra?: string }

class Guard extends React.Component<{ children: React.ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e: unknown) { console.error('bank crash', e); try { sessionStorage.setItem('bk-noauto', '1'); } catch { /* ignore */ } }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="bk-root"><div className="bk-emptybox"><b>مشکلی در نمایش بانک تست پیش آمد</b>
        <span>اطلاعات آزمون‌های نیمه‌کاره‌تان سر جایش است.</span>
        <button type="button" className="bk-btn primary" onClick={() => this.setState({ err: false })}>تلاش دوباره</button>
        <button type="button" className="bk-btn" onClick={async () => { try { for (const l of await listLive()) await discardLive(l.id, false); } catch { /* ignore */ } this.setState({ err: false }); }}>کنار گذاشتن آزمون‌های نیمه‌کاره و ادامه</button></div></div>
    );
  }
}

const BankInner: React.FC = () => {
  const lab: Lab = useLab();
  const [tab, setTab] = useState<Tab>('build');
  const [run, setRun] = useState<Run | null>(null);
  const [res, setRes] = useState<Attempt | null>(null);
  const [pdf, setPdf] = useState<PdfReq | null>(null);
  const [first, setFirst] = useState(true);
  const [exams, setExams] = useState<SavedExam[]>([]);
  const [examsReady, setExamsReady] = useState(false);
  const [lives, setLives] = useState<LiveExam[]>([]);
  const [resume, setResume] = useState<LiveExam | null>(null);
  const auto = useRef(false);
  const reload = () => listLive().then((l) => { setLives(l); return l; }).catch(() => [] as LiveExam[]);
  useEffect(() => { reload(); window.addEventListener(BANK_EVENT, reload as any); return () => window.removeEventListener(BANK_EVENT, reload as any); }, []);
  const usable = (l: LiveExam) => l.run.refs.length > 0 && l.run.refs.every((r) => lab.bookMap.get(r.b)?.numbers.includes(r.n));
  // come back straight into the exam touched in the last 30 minutes — but only once the books are loaded (never before), and never after a crash
  useEffect(() => {
    if (auto.current || !lab.ready) return; auto.current = true;
    let off = false; try { off = sessionStorage.getItem('bk-noauto') === '1'; } catch { /* ignore */ }
    const l = lives[0]; if (!off && l && Date.now() - l.at < 30 * 60 * 1000 && usable(l)) { setResume(l); setRun(l.run); }
  }, [lab.ready, lives]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // an exam handed over by the planner («تست درس امروز»)
    if (!lab.ready) return;
    try {
      const raw = sessionStorage.getItem('bk-launch'); if (!raw) return; sessionStorage.removeItem('bk-launch');
      const r = JSON.parse(raw); const refs = (r.refs || []).filter((x: Ref) => lab.bookMap.get(x.b)?.numbers.includes(x.n));
      if (refs.length) { auto.current = true; setResume(null); setRun({ refs, practice: false, minutes: 0, title: r.title || 'تست', ...(r.pressure ? { pressure: r.pressure } : {}) }); }
    } catch { /* ignore */ }
  }, [lab.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const goOn = (l: LiveExam) => { if (!lab.ready) return; if (!usable(l)) { alertDialog('کتاب‌های این آزمون هنوز در برنامه نیست؛ اول فایل کتاب را در «کتابخانه» وارد کنید.'); return; } try { sessionStorage.removeItem('bk-noauto'); } catch { /* ignore */ } setResume(l); setRun(l.run); };
  useEffect(() => { const f = () => listExams().then((x) => { setExams(x); setExamsReady(true); }).catch(() => setExamsReady(true)); f(); window.addEventListener(BANK_EVENT, f); return () => window.removeEventListener(BANK_EVENT, f); }, []);
  if (first && lab.ready && !lab.books.length && tab !== 'lib') { setTab('lib'); setFirst(false); }
  const start = (r: Run) => { const refs = r.refs.filter((x) => lab.bookMap.get(x.b)?.numbers.includes(x.n)); if (refs.length) setRun({ ...r, refs }); };
  const askPdf = (refs: Ref[], title: string, mixed = new Set(refs.map((r) => r.b)).size > 1, extra?: string) => setPdf({ refs, title, mixed, extra });
  const dlg = pdf && <PdfDialog refs={pdf.refs} lab={lab} title={pdf.title} mixed={pdf.mixed} extra={pdf.extra} onClose={() => setPdf(null)} />;
  if (run) return <div className="bk-root">{run.pressure ? <Pressure run={run} lab={lab} onCancel={() => { setRun(null); }} onFinish={(a) => { setRes(a); setRun(null); }} /> : <Player key={resume?.id || 'new'} run={run} resume={resume || undefined} lab={lab} onCancel={() => { setRun(null); setResume(null); setTimeout(reload, 300); }} onFinish={(a) => { setRes(a); setRun(null); setResume(null); setTimeout(reload, 300); }} />}</div>;
  if (res) return <div className="bk-root"><Result a={res} lab={lab} onBack={() => { setRes(null); }} onRetry={(refs) => { setRes(null); start({ refs, practice: true, minutes: 0, title: 'مرور اشتباه‌ها' }); }} onPdf={(refs, t) => askPdf(refs, t)} />{dlg}</div>;
  return (
    <div className="bk-root">
      <header className="bk-hh"><div><h2><FlaskConical size={22} /> بانک تست</h2><p>آزمایشگاه سؤال: ترکیب کتاب‌ها، تمرین با پاسخ تشریحی، نشان‌گذاری و سطح‌بندی، ساخت PDF و اتصال به گنجینه.</p></div></header>
      {lives.length > 0 && (
        <div className="bk-live" role="region" aria-label="آزمون‌های نیمه‌کاره">
          <h4>⏸ آزمون نیمه‌کاره ({P(lives.length)})</h4>
          {lives.map((l) => { const an = Object.values(l.st.picks).filter(Boolean).length; return (
            <div className="row" key={l.id}><div><b>{l.run.title}</b><small>{P(an)} از {P(l.run.refs.length)} پاسخ · {P(Math.floor(l.elapsed / 60))} دقیقه · {new Date(l.at).toLocaleString('fa-IR')}</small></div>
              <div className="bk-acts"><button type="button" className="bk-btn primary" onClick={() => goOn(l)}>ادامه</button>
                <button type="button" className="bk-btn" onClick={async () => { if (await confirmDialog('این آزمون نیمه‌کاره حذف شود؟')) { await discardLive(l.id); reload(); } }}>رها کردن</button></div></div>); })}
        </div>)}
      <div className="bk-tabs bk-main" role="tablist">{TABS.map(([k, l]) => <button type="button" role="tab" aria-selected={tab === k} key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'build' && <Builder lab={lab} onStart={start} onPdf={askPdf} />}
      {tab === 'browse' && <Browse lab={lab} onStart={start} onPdf={askPdf} />}
      {tab === 'sheets' && <SheetList exams={exams} ready={examsReady} onOpen={(e) => { const a = e.status === 'graded' ? lab.attempts.find((x) => x.id === e.attemptId) : undefined; if (a) setRes(a); else openExamSheet(e, lab); }} onAgain={(e) => openExamSheet(e, lab, true)} />}
      {tab === 'lib' && <Library lab={lab} onStart={start} onOpen={(a) => setRes(a)} onPdf={askPdf} />}
      {tab === 'stats' && <Stats lab={lab} />}
      {dlg}
    </div>
  );
};

export const BankView: React.FC = () => <Guard><BankInner /></Guard>;
