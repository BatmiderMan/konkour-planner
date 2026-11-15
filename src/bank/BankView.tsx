/** بانک تست — the question laboratory: build mixed exams, practice with worked solutions, mark & level questions, make PDFs, link to the vault. */
import React, { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { Attempt, Ref, SavedExam, listExams, BANK_EVENT } from './store';
import { Lab, useLab } from './parts';
import { Run, Player } from './Player';
import { Result } from './Result';
import { Builder } from './Builder';
import { Browse } from './Browse';
import { Library } from './Library';
import { Stats } from './Stats';
import { SheetFill, SheetList } from './Sheets';
import { PdfDialog } from './PdfDialog';
import './bank.css';

type Tab = 'build' | 'browse' | 'sheets' | 'lib' | 'stats';
const TABS: Array<[Tab, string]> = [['build', 'آزمون‌ساز'], ['browse', 'مرور'], ['sheets', 'پاسخ‌برگ'], ['lib', 'کتابخانه'], ['stats', 'آمار']];
interface PdfReq { refs: Ref[]; title: string; mixed: boolean; extra?: string }

export const BankView: React.FC = () => {
  const lab: Lab = useLab();
  const [tab, setTab] = useState<Tab>('build');
  const [run, setRun] = useState<Run | null>(null);
  const [res, setRes] = useState<Attempt | null>(null);
  const [pdf, setPdf] = useState<PdfReq | null>(null);
  const [first, setFirst] = useState(true);
  const [exams, setExams] = useState<SavedExam[]>([]);
  const [examsReady, setExamsReady] = useState(false);
  const [sheetId, setSheetId] = useState('');
  useEffect(() => { const f = () => listExams().then((x) => { setExams(x); setExamsReady(true); }).catch(() => setExamsReady(true)); f(); window.addEventListener(BANK_EVENT, f); return () => window.removeEventListener(BANK_EVENT, f); }, []);
  if (first && lab.ready && !lab.books.length && tab !== 'lib') { setTab('lib'); setFirst(false); }
  const start = (r: Run) => { const refs = r.refs.filter((x) => lab.bookMap.get(x.b)?.numbers.includes(x.n)); if (refs.length) setRun({ ...r, refs }); };
  const askPdf = (refs: Ref[], title: string, mixed = new Set(refs.map((r) => r.b)).size > 1, extra?: string) => setPdf({ refs, title, mixed, extra });
  const dlg = pdf && <PdfDialog refs={pdf.refs} lab={lab} title={pdf.title} mixed={pdf.mixed} extra={pdf.extra} onClose={() => setPdf(null)} />;
  if (run) return <div className="bk-root"><Player run={run} lab={lab} onCancel={() => setRun(null)} onFinish={(a) => { setRes(a); setRun(null); }} /></div>;
  const sheet = exams.find((x) => x.id === sheetId);
  if (sheet && !res) return <div className="bk-root"><SheetFill key={sheet.id + (sheet.status === 'graded' ? 'g' : 'o')} exam={sheet} lab={lab} onBack={() => { setSheetId(''); setTimeout(() => window.dispatchEvent(new Event(BANK_EVENT)), 350); }} onResult={(a) => setRes(a)} /></div>;
  if (res) return <div className="bk-root"><Result a={res} lab={lab} onBack={() => { setRes(null); }} onRetry={(refs) => { setRes(null); start({ refs, practice: true, minutes: 0, title: 'مرور اشتباه‌ها' }); }} onPdf={(refs, t) => askPdf(refs, t)} />{dlg}</div>;
  return (
    <div className="bk-root">
      <header className="bk-hh"><div><h2><FlaskConical size={22} /> بانک تست</h2><p>آزمایشگاه سؤال: ترکیب کتاب‌ها، تمرین با پاسخ تشریحی، نشان‌گذاری و سطح‌بندی، ساخت PDF و اتصال به گنجینه.</p></div></header>
      <div className="bk-tabs bk-main" role="tablist">{TABS.map(([k, l]) => <button type="button" role="tab" aria-selected={tab === k} key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'build' && <Builder lab={lab} onStart={start} onPdf={askPdf} />}
      {tab === 'browse' && <Browse lab={lab} onStart={start} onPdf={askPdf} />}
      {tab === 'sheets' && <SheetList exams={exams} ready={examsReady} onOpen={(e) => setSheetId(e.id)} />}
      {tab === 'lib' && <Library lab={lab} onStart={start} onOpen={(a) => setRes(a)} onPdf={askPdf} />}
      {tab === 'stats' && <Stats lab={lab} />}
      {dlg}
    </div>
  );
};
