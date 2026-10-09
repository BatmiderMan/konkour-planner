import React, { useEffect, useRef, useState } from 'react';
import { Camera, RotateCw, Check } from 'lucide-react';
import { ExplRow, learnDigit, scanExplanation } from './engine';
import { KeyBatch } from './model';
import { fileToImage } from './ui';
import { toPersianDigits as P } from '../utils';

/** Reads the coloured answer boxes (pink, green …) of a detailed-answers page. Boxes are numbered one after another from the first question number. */
export const ExplanationReader: React.FC<{ suggestStart: number; onAdd: (b: KeyBatch) => void }> = ({ suggestStart, onAdd }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const res = useRef<any>(null);
  const [rows, setRows] = useState<ExplRow[]>([]);
  const [first, setFirst] = useState<number>(suggestStart);
  const [info, setInfo] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const run = (forced: number | undefined, f: number) => {
    if (!img.current) return;
    setBusy(true); setInfo('در حال خواندن…');
    setTimeout(() => {
      try {
        const r = scanExplanation(img.current!, forced, f);
        res.current = r.res; setRows(r.rows);
        setInfo(`${P(r.rows.length)} کادر پاسخ، صفحه ${P(r.res.rot * 90)} درجه چرخانده شد`);
      } catch (err: any) { setInfo('خوانده نشد: ' + err.message); setRows([]); }
      setBusy(false);
    }, 20);
  };
  const onFile = async (f: File) => { try { img.current = await fileToImage(f); run(undefined, first); } catch (err: any) { setInfo(err.message); } };

  // overview image with numbered boxes
  useEffect(() => {
    const px = res.current && res.current.px, c = canvasRef.current; if (!px || !c) return;
    const W = 1000, s = W / px.W; c.width = W; c.height = Math.round(px.H * s);
    const x = c.getContext('2d')!; x.drawImage(px.canvas, 0, 0, c.width, c.height); x.lineWidth = 3;
    rows.forEach((r, i) => { const b = r.box; x.strokeStyle = r.why ? '#e0382d' : '#12a36f'; x.strokeRect(b.x * s - 2, b.y * s - 2, b.w * s + 4, b.h * s + 4); x.fillStyle = x.strokeStyle; x.font = '700 16px sans-serif'; x.fillText(String(i + 1), b.x * s - 2, b.y * s - 6); });
  }, [rows]);

  const renumberFrom = (list: ExplRow[], from: number) => { const n = list[from].num; for (let i = from + 1; i < list.length; i++) list[i].num = n ? n + (i - from) : 0; };
  const setKey = (i: number, o: number) => {
    const list = rows.map((r) => ({ ...r })), r = list[i];
    if (r.gl && o !== r.detected && !r.learned) { learnDigit(o, r.gl); r.learned = true; } // remember the corrected digit shape
    r.key = o; r.why = ''; setRows(list);
  };
  const setNum = (i: number, v: number) => { const list = rows.map((r) => ({ ...r })); list[i].num = v; renumberFrom(list, i); setRows(list); };
  const changeFirst = (v: number) => { setFirst(v); setRows(rows.map((r, i) => ({ ...r, num: v ? v + i : 0 }))); };

  const add = () => {
    const keys: Record<number, number> = {}, weak: number[] = []; let n = 0, missing = 0, low = 1e9;
    rows.forEach((r) => { if (!r.key) return; if (!r.num) { missing++; return; } keys[r.num] = r.key; if (r.why) weak.push(r.num); n++; low = Math.min(low, r.num); });
    if (!n) { setMsg(missing ? 'اول شماره‌ی اولین سؤال را بالای فهرست وارد کن.' : 'هنوز چیزی برای افزودن نیست.'); return; }
    onAdd({ keys, weak, first: low });
    setMsg(`${P(n)} کلید اضافه شد` + (missing ? `؛ ${P(missing)} کادر هنوز شماره ندارد` : '') + '. موارد نامطمئن در جدول قرمز است.');
  };

  return (
    <div className="ck-method">
      <p className="ck-hint">از یک صفحه (یا دو صفحه‌ی روبه‌رو) از پاسخ تشریحی عکس بگیر. برنامه کادر رنگی هر پاسخ (صورتی، سبز و …) را پیدا می‌کند و گزینه‌ی داخلش را می‌خواند. کادرها به ترتیب خواندن کتاب (اول ستون راست) از شماره‌ای که می‌دهی شماره‌گذاری می‌شوند. اگر شماره‌ای جا افتاده بود، شماره‌ی همان ردیف را عوض کن؛ بقیه دنبالش می‌آیند. عکس وارونه خودکار چرخانده می‌شود.</p>
      <div className="ck-fields">
        <label className="ck-field"><span>شماره‌ی سؤال اولین کادر صفحه</span>
          <input type="number" min={1} placeholder="مثلاً ۲۳۲۷" value={first || ''} onChange={(e) => changeFirst(parseInt(e.target.value, 10) || 0)} />
        </label>
      </div>
      <div className="ck-row">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        <button type="button" className="ck-btn primary" onClick={() => fileRef.current?.click()} disabled={busy}><Camera size={17} /> عکس صفحه را انتخاب کن یا بگیر</button>
        {img.current && <button type="button" className="ck-btn" disabled={busy} onClick={() => run((((res.current?.rot) || 0) + 1) % 4, first)}><RotateCw size={16} /> ۹۰ درجه بچرخان</button>}
        {info && <span className="ck-pill">{info}</span>}
      </div>
      {img.current && (
        <>
          <div className="ck-photo-scroll short"><canvas ref={canvasRef} /></div>
          {rows.length === 0 ? <div className="ck-empty">کادر رنگی پیدا نشد. مطمئن شو کل صفحه در عکس است و نور خوب است.</div> : (
            <div className="ck-xlist">
              {rows.map((r, i) => (
                <div key={i} className={'ck-xr' + (r.why ? ' low' : '')}>
                  <input type="number" min={1} value={r.num || ''} placeholder="شماره" aria-label={`شماره‌ی سؤال کادر ${i + 1}`} onChange={(e) => setNum(i, parseInt(e.target.value, 10) || 0)} />
                  <div className="ck-opts">{[1, 2, 3, 4].map((o) => <button key={o} type="button" className={'ck-opt sm' + (r.key === o ? ' on' : '')} onClick={() => setKey(i, o)}>{P(o)}</button>)}</div>
                  <span className="ck-why">{r.why}</span>
                </div>
              ))}
            </div>
          )}
          <div className="ck-row"><button type="button" className="ck-btn primary" onClick={add} disabled={!rows.length}><Check size={17} /> افزودن این کلیدها</button>{msg && <span className="ck-hint" role="status">{msg}</span>}</div>
        </>
      )}
    </div>
  );
};
