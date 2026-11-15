import React, { useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Lab } from './parts';
import { Ref, explBlob, imageBlob, newExamId, saveExam } from './store';
import { PdfQ, buildPdf } from './pdf';
import { toPersianDigits as P } from '../utils';
import { alertDialog } from '../dialog';

/** Makes the PDF of a list of questions: part 1 = the questions, part 2 (at the end) = answers / worked solutions. */
export const PdfDialog: React.FC<{ refs: Ref[]; lab: Lab; title?: string; extra?: string; mixed?: boolean; onClose: () => void }> = ({ refs, lab, title: t0, extra, mixed, onClose }) => {
  const [title, setTitle] = useState(t0 || 'آزمون');
  const [cols, setCols] = useState<1 | 2>(1);
  const [answers, setAnswers] = useState<'none' | 'key' | 'full'>('full');
  const [showName, setShowName] = useState(true);
  const [renumber, setRenumber] = useState(true);
  const [keep, setKeep] = useState(true);
  const [prog, setProg] = useState<[number, number] | null>(null);
  const sig = useRef({ cancelled: false });
  const withE = refs.filter((r) => lab.bookMap.get(r.b)?.expl.includes(r.n)).length;
  const go = async () => {
    sig.current = { cancelled: false }; setProg([0, refs.length]);
    try {
      const items: PdfQ[] = []; const kept: Ref[] = [];
      for (const r of refs) {
        const b = lab.bookMap.get(r.b); if (!b) continue;
        const q = await imageBlob(r.b, r.n); if (!q) continue;
        const e = answers === 'full' && b.expl.includes(r.n) ? await explBlob(r.b, r.n) : null;
        kept.push(r); items.push({ n: r.n, bookTitle: b.title, answer: b.answers[r.n] || 0, q, e, shared: b.shared.includes(r.n) });
      }
      const blob = await buildPdf({ title, items, renumber, cols, answers, showName, extra, signal: sig.current, onProgress: (d, t) => setProg([d, t]) });
      if (sig.current.cancelled) return;
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = (title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'آزمون') + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      let saved = false;
      if (keep) { try { await saveExam({ id: newExamId(), title, at: Date.now(), refs: kept, renumber, minutes: 0, picks: {}, crossed: {}, flags: {}, seconds: 0, status: 'new', pdfSize: blob.size }, blob); saved = true; } catch { /* storage full */ } }
      setProg(null); onClose();
      if (saved) await alertDialog('PDF دانلود و در تب «پاسخ‌برگ» ذخیره شد؛ بعداً پاسخ‌برگ مجازی آن را پر کنید تا خودکار تصحیح شود.');
    } catch (e: any) { setProg(null); if (!sig.current.cancelled) await alertDialog(e?.message || 'ساخت PDF ناموفق بود.'); }
  };
  return (
    <div className="bk-lightbox" role="dialog" aria-modal="true" onClick={() => !prog && onClose()}>
      <div className="bk-lb-card bk-pdf" onClick={(e) => e.stopPropagation()}>
        <header><b><FileText size={18} /> ساخت PDF · {P(refs.length)} سؤال</b><button type="button" className="bk-x" onClick={() => { sig.current.cancelled = true; onClose(); }} aria-label="بستن"><X size={20} /></button></header>
        <div className="bk-lb-body bk-form">
          <label className="bk-lab">عنوان<input className="bk-in" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="bk-lab">بخش دوم (پایان فایل)</div>
          <div className="bk-seg">
            {([['none', 'فقط سؤال‌ها'], ['key', 'کلید پاسخ'], ['full', 'کلید + تشریحی']] as const).map(([k, l]) => <button key={k} type="button" className={answers === k ? 'on' : ''} onClick={() => setAnswers(k)}>{l}</button>)}
          </div>
          {answers === 'full' && <p className="bk-hint">{withE ? `${P(withE)} سؤال پاسخ تشریحی دارند؛ بقیه فقط در کلید می‌آیند.` : 'این سؤال‌ها تشریحی ندارند؛ فقط کلید چاپ می‌شود.'}</p>}
          <div className="bk-lab">ستون‌های سؤال</div>
          <div className="bk-seg">{([1, 2] as const).map((c) => <button key={c} type="button" className={cols === c ? 'on' : ''} onClick={() => setCols(c)}>{P(c)} ستون</button>)}</div>
          <label className="bk-check"><input type="checkbox" checked={renumber} onChange={(e) => setRenumber(e.target.checked)} /> شماره‌گذاری از ۱ (برای ترکیبی یا درهم)</label>
          <label className="bk-check"><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> خط «نام و نام خانوادگی / تاریخ»</label>
          <label className="bk-check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> ذخیره در برنامه برای پاسخ‌برگ مجازی و تصحیح خودکار</label>
          {mixed && <p className="bk-hint">سؤال‌ها از چند کتاب‌اند؛ در بخش پاسخ، نام کتاب هر سؤال می‌آید.</p>}
          {prog && <div className="bk-busy" role="status">در حال ساخت… {P(prog[0])} از {P(prog[1])}<div className="bk-bar"><i style={{ width: (prog[1] ? (prog[0] / prog[1]) * 100 : 0) + '%' }} /></div></div>}
          <button type="button" className="bk-btn primary wide" onClick={go} disabled={!!prog || !refs.length}><FileText size={18} /> {prog ? 'صبر کنید…' : 'ساخت و دانلود PDF'}</button>
        </div>
      </div>
    </div>
  );
};
