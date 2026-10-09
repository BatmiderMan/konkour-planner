import React, { useEffect, useRef, useState } from 'react';
import { Camera, RotateCw, Undo2, Check } from 'lucide-react';
import { KeyPageSession, drawKeyPage, drawTile } from './engine/keyPage';
import { forgetKeyShapes, keyPageCanvas, ksTurn } from './engine';
import { KeyBatch, faDigits } from './model';
import { fileToImage } from './ui';
import { toPersianDigits as P } from '../utils';

const Tile: React.FC<{ R: any; x: number; y: number; hw: number; hh: number; w: number }> = ({ R, x, y, hw, hh, w }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawTile(R, ref.current, x, y, hw, hh, w); }, [R, x, y, hw, hh, w]);
  return <canvas ref={ref} />;
};

/** Reads question number + option digit pairs from a photo of any answer-key page (the KeyScan reader), then lets you correct what it got wrong. */
export const KeyPhotoReader: React.FC<{ suggestStart: number; rtl: boolean; onRtl: (v: boolean) => void; onAdd: (b: KeyBatch) => void }> = ({ suggestStart, rtl, onRtl, onAdd }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const src = useRef<HTMLCanvasElement | null>(null);
  const rot = useRef(0);
  const sess = useRef<KeyPageSession | null>(null);
  const [, setTick] = useState(0); const bump = () => setTick((t) => t + 1);
  const [start, setStart] = useState(suggestStart);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const s = sess.current;

  const summaryText = (se: KeyPageSession, st: number) => {
    const m = se.summary(st);
    return `${P(m.n)} خانه در ${P(m.ncol)} ستون پیدا شد (سؤال ${P(st)} تا ${P(m.last)}). ${P(m.low)} مورد نیاز به بررسی دارد`
      + (m.headers ? `. ${P(m.headers)} عنوان فصل رد شد` : '') + (m.titles ? `. ${P(m.titles)} خط عنوان بالا یا پایین ستون نادیده گرفته شد` : '')
      + (m.headerRows ? `. ردیف عنوان «سؤال / پاسخ» بالای ${P(m.headerRows)} ستون نادیده گرفته شد` : '') + (m.filled ? `. ${P(m.filled)} ردیف جاافتاده‌ی بالا یا پایین ستون پر شد` : '')
      + '. روی یک کادر بزن تا اصلاح یا حذفش کنی؛ جایی که رقمی جا افتاده را بزن تا اضافه شود. عددهای آبی روی عکس، شماره‌ی سؤالی است که ثبت می‌شود؛ چند‌تا را با کتاب مقایسه کن.';
  };

  const run = (cv: HTMLCanvasElement, rtlVal: boolean) => {
    setBusy(true); setMsg('در حال خواندن…');
    setTimeout(() => {
      try { sess.current = KeyPageSession.run(cv, rtlVal); setMsg(summaryText(sess.current, start)); }
      catch (err: any) { sess.current = null; setMsg('عکس خوانده نشد: ' + err.message); }
      setBusy(false); bump();
    }, 20);
  };

  const onFile = async (f: File) => {
    try { const im = await fileToImage(f); src.current = keyPageCanvas(im, 0); rot.current = 0; run(src.current, rtl); }
    catch (err: any) { setMsg(err.message); }
  };
  const turn = () => { if (!src.current) return; rot.current = (rot.current + 1) % 4; run(ksTurn(src.current, rot.current), rtl); };

  useEffect(() => { if (s && canvasRef.current) drawKeyPage(s, canvasRef.current, start); });

  // keys 1-4 answer the first cell that still needs a look
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const se = sess.current; const k = faDigits(e.key);
      if (!se || !/^[1-4]$/.test(k) || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName || '')) return;
      const first = se.reviewList()[0]; if (first === undefined) return;
      se.fix(first, +k); bump();
    };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const se = sess.current; if (!se) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) * se.R.W / r.width, y = (e.clientY - r.top) * se.R.H / r.height;
    const i = se.hit(x, y);
    if (i >= 0) se.select(i); else setMsg(se.add(x, y));
    bump();
  };
  const apply = () => {
    const se = sess.current; if (!se || !se.hasShapes) return;
    const c = se.collect(Math.max(1, start));
    onAdd({ keys: c.keys, remove: c.remove, weak: c.weak, edited: c.edited, first: Math.max(1, start) });
    se.learn();
    setMsg(`${P(Object.keys(c.keys).length)} کلید اضافه شد (${P(start)} تا ${P(start + se.R.seq.length - 1)})` + (c.weak.length ? `؛ ${P(c.weak.length)} مورد تأیید نشده و در جدول قرمز است.` : '.'));
  };

  const review = s ? s.reviewList() : [];
  const sel = s ? s.selIndex : -1;

  return (
    <div className="ck-method">
      <p className="ck-hint">از یک صفحه‌ی کلید کتاب عکس بگیر: هر چیدمانی که کنار شماره‌ی سؤال یک رقم گزینه دارد (مثل «۱۲۸۵- گزینه ۲»). تعداد ستون مهم نیست و عنوان فصل‌ها خودکار رد می‌شود.</p>
      <div className="ck-fields">
        <label className="ck-field"><span>شماره‌ی اولین سؤال این صفحه</span>
          <input type="number" min={1} value={start} onChange={(e) => { const v = Math.max(1, parseInt(e.target.value, 10) || 1); setStart(v); if (sess.current) setMsg(summaryText(sess.current, v)); }} />
        </label>
        <label className="ck-field"><span>ستون‌ها از کدام سمت خوانده شوند</span>
          <select value={rtl ? 'rtl' : 'ltr'} onChange={(e) => { const v = e.target.value === 'rtl'; onRtl(v); if (src.current) run(ksTurn(src.current, rot.current), v); }}>
            <option value="rtl">راست به چپ (کتاب فارسی)</option><option value="ltr">چپ به راست</option>
          </select>
        </label>
      </div>
      <div className="ck-row">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        <button type="button" className="ck-btn primary" onClick={() => fileRef.current?.click()} disabled={busy}><Camera size={17} /> عکس صفحه را انتخاب کن یا بگیر</button>
        {s && <button type="button" className="ck-btn" onClick={turn} disabled={busy}><RotateCw size={16} /> ۹۰ درجه بچرخان</button>}
      </div>
      {msg && <p className="ck-note" role="status">{msg}</p>}

      {s && (
        <div className="ck-keyphoto">
          <div className="ck-row">
            <label className="ck-inline">بزرگ‌نمایی
              <select value={zoom} onChange={(e) => setZoom(+e.target.value)}>
                <option value={1}>اندازه‌ی صفحه</option><option value={2}>۲ برابر</option><option value={3}>۳ برابر</option><option value={4}>۴ برابر</option>
              </select>
            </label>
            <button type="button" className="ck-btn sm" disabled={!s.canUndo} onClick={() => { s.undo(); bump(); }}><Undo2 size={15} /> برگردان</button>
          </div>
          <div className="ck-photo-scroll"><canvas ref={canvasRef} style={{ width: zoom * 100 + '%' }} onClick={onCanvas} /></div>
          <p className="ck-hint">سبز = مطمئن، نارنجی = نامطمئن، قرمز خط‌چین = چیزی پیدا نشد، آبی = توسط تو اصلاح شد.</p>

          {sel >= 0 && (
            <div className="ck-sel">
              <Tile R={s.R} x={s.center(s.R.seq[sel])[0]} y={s.center(s.R.seq[sel])[1]} hw={s.R.h0 * 1.5} hh={s.R.h0 * 1.3} w={110} />
              <div>
                <div className="ck-hint"><b>سؤال {P(start + sel)}</b>: گزینه‌اش را انتخاب کن</div>
                <div className="ck-opts">
                  {[1, 2, 3, 4].map((d) => <button key={d} type="button" className={'ck-opt' + (s.label(sel) === d ? ' on' : '')} onClick={() => { s.setSelected(d); bump(); }}>{P(d)}</button>)}
                  <button type="button" className="ck-btn sm" title="جای این سؤال بماند ولی کلیدی ندارد" onClick={() => { s.setSelected(0); bump(); }}>بدون کلید</button>
                  <button type="button" className="ck-btn sm danger" title="این خانه اصلاً سؤال نیست" onClick={() => { setMsg(s.removeSelected()); bump(); }}>حذف خانه</button>
                </div>
              </div>
            </div>
          )}

          {s.hasShapes ? (
            <div className="ck-shapes">
              <p className="ck-hint"><b>مرحله‌ی ۱.</b> برنامه ۴ شکل رقم روی این صفحه پیدا کرد. بررسی کن زیر هر شکل همان رقمی نوشته شده که می‌بینی (برچسب‌ها فقط حدس است).</p>
              <div className="ck-shape-row">
                {[0, 1, 2, 3].map((c) => { const b = s.bestTileOfShape(c); return (
                  <div key={c} className="ck-shape">
                    {b && <Tile R={s.R} x={(b.d.g[0].x0 + b.d.g[0].x1) / 2} y={(b.d.g[0].y0 + b.d.g[0].y1) / 2} hw={s.R.h0 * .9} hh={s.R.h0 * 1.15} w={56} />}
                    <select value={s.names[c]} onChange={(e) => { s.setShapeName(c, +e.target.value); bump(); }}>{[1, 2, 3, 4].map((d) => <option key={d} value={d}>{P(d)}</option>)}</select>
                    <small>{P(s.R.km.stats[c].n)} خانه</small>
                  </div>
                ); })}
              </div>
            </div>
          ) : <p className="ck-warn">خانه‌های کافی پیدا نشد. عکس واضح‌تر و صاف‌تر بگیر یا ۹۰ درجه بچرخانش.</p>}

          {review.length === 0 ? <p className="ck-hint"><b>مرحله‌ی ۲.</b> چیزی برای بررسی نمانده. چند خانه را با کتاب مقایسه کن و بعد کلیدها را اضافه کن.</p> : (
            <div className="ck-review">
              <p className="ck-hint"><b>مرحله‌ی ۲.</b> {P(review.length)} خانه را ببین. رقمی را که می‌بینی بزن (یا کلید ۱ تا ۴ را برای اولی فشار بده؛ «–» یعنی این جا خالی است).</p>
              <div className="ck-rev-grid">
                {review.slice(0, 60).map((i, k) => { const p = s.R.seq[i], c = s.center(p), cur = s.label(i); return (
                  <div key={i} className={'ck-rev' + (k ? '' : ' first')}>
                    <Tile R={s.R} x={c[0]} y={c[1]} hw={s.R.h0 * 1.3} hh={s.R.h0 * 1.25} w={88} />
                    <div className="ck-opts">
                      {[1, 2, 3, 4].map((d) => <button key={d} type="button" className={'ck-opt sm' + (cur === d ? ' on' : '')} onClick={() => { s.fix(i, d); bump(); }}>{P(d)}</button>)}
                      <button type="button" className="ck-opt sm" onClick={() => { s.fix(i, 0); bump(); }}>–</button>
                    </div>
                  </div>
                ); })}
              </div>
              {review.length > 60 && <p className="ck-hint">و {P(review.length - 60)} مورد بعد از این‌ها…</p>}
            </div>
          )}

          <div className="ck-row">
            <button type="button" className="ck-btn primary" onClick={apply} disabled={!s.hasShapes}><Check size={17} /> افزودن این کلیدها</button>
            <button type="button" className="ck-btn sm ghost" onClick={() => { forgetKeyShapes(); setMsg('شکل رقم‌های یادگرفته‌شده فراموش شد.'); }}>فراموشی شکل رقم‌های یادگرفته‌شده</button>
          </div>
        </div>
      )}
    </div>
  );
};
