import React, { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import { CornerPicker } from './CornerPicker';
import { Corners, SHEET_COLS, SHEET_ROWS, SheetMarks, SheetScan, marksFromScan, scanSheet } from './engine';
import { Manual } from './model';
import { drawSheetPreview } from './sheetDraw';
import { fileToImage } from './ui';
import { toPersianDigits as P } from '../utils';

export interface SheetState {
  img: HTMLImageElement | null; corners: Corners; rev: number;
  scan: SheetScan | null; marks: SheetMarks | null; sens: number; reading: boolean; error?: string;
}
export const emptySheet = (sens: number): SheetState => ({ img: null, corners: [], rev: 0, scan: null, marks: null, sens, reading: false });

const defaultCorners = (im: HTMLImageElement): Corners => {
  const w = im.naturalWidth, h = im.naturalHeight;
  return [[w * .1, h * .2], [w * .9, h * .2], [w * .9, h * .9], [w * .1, h * .9]];
};

/** Step 1: photo of the answer sheet → four corners → bubbles read. */
export const SheetStep: React.FC<{ sheet: SheetState; setSheet: (f: (s: SheetState) => SheetState) => void; manual: Manual; onNext: () => void; onSens: (v: number) => void; hideNext?: boolean }> = ({ sheet, setSheet, manual, onNext, onSens, hideNext }) => {
  const camRef = useRef<HTMLInputElement>(null), galRef = useRef<HTMLInputElement>(null), prevRef = useRef<HTMLCanvasElement>(null);
  const [grid, setGrid] = useState(false);

  const read = (img: HTMLImageElement, corners: Corners, sens: number) => {
    setSheet((s) => ({ ...s, reading: true, error: undefined }));
    setTimeout(() => {
      try { const scan = scanSheet(img, corners); const marks = marksFromScan(scan.scores, sens); setSheet((s) => ({ ...s, scan, marks, reading: false })); }
      catch (err: any) { setSheet((s) => ({ ...s, reading: false, error: 'خوانده نشد: ' + err.message })); }
    }, 20);
  };
  const onFile = async (f: File) => {
    try {
      const img = await fileToImage(f);
      setSheet((s) => ({ ...s, img, corners: defaultCorners(img), rev: s.rev + 1, scan: null, marks: null, error: undefined }));
    } catch (err: any) { setSheet((s) => ({ ...s, error: err.message })); }
  };

  useEffect(() => {
    if (sheet.scan && sheet.marks && prevRef.current) drawSheetPreview(prevRef.current, sheet.scan, { ans: sheet.marks.ans, dbl: sheet.marks.dbl }, manual, sheet.sens, grid);
  }, [sheet.scan, sheet.marks, sheet.sens, manual, grid]);

  const input = (ref: React.RefObject<HTMLInputElement>, capture?: boolean) => (
    <input ref={ref} type="file" accept="image/*" {...(capture ? { capture: 'environment' as const } : {})} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
  );

  return (
    <div className="ck-step">
      <section className="ck-card">
        <h3>عکس پاسخ‌برگ</h3>
        <p className="ck-hint">از بالا و با نور خوب عکس بگیر. کل جدول حباب‌ها در کادر باشد؛ بخشی که پر نکرده‌ای می‌تواند بیرون از عکس بماند.</p>
        <div className="ck-row">
          {input(camRef, true)}{input(galRef)}
          <button type="button" className="ck-btn primary" onClick={() => camRef.current?.click()}><Camera size={17} /> عکس بگیر</button>
          <button type="button" className="ck-btn" onClick={() => galRef.current?.click()}><ImageIcon size={17} /> از گالری</button>
        </div>
        {sheet.error && <p className="ck-warn">{sheet.error}</p>}
      </section>

      {sheet.img && (
        <section className="ck-card">
          <h3>چهار گوشه‌ی جدول را مشخص کن</h3>
          <p className="ck-hint">چهار نقطه را روی گوشه‌های بیرونیِ جدول حباب‌ها بکش (۱ بالا-چپ، ۲ بالا-راست، ۳ پایین-راست، ۴ پایین-چپ، همان‌طور که در عکس می‌بینی). گوشه‌ای که بیرون از عکس است را به حاشیه‌ی خاکستری ببر. خط‌های نازک باید روی خط‌های ضخیم پاسخ‌برگ بنشینند. با رها کردن نقطه، پاسخ‌ها خوانده می‌شود.</p>
          <CornerPicker img={sheet.img} corners={sheet.corners} rev={sheet.rev} cols={SHEET_COLS} rows={SHEET_ROWS}
            onDone={(c) => { setSheet((s) => ({ ...s, corners: c })); read(sheet.img!, c, sheet.sens); }} />
          <div className="ck-row">
            <button type="button" className="ck-btn primary" disabled={sheet.reading} onClick={() => read(sheet.img!, sheet.corners.length ? sheet.corners : defaultCorners(sheet.img!), sheet.sens)}>{sheet.reading ? 'در حال خواندن…' : 'خواندن پاسخ‌ها'}</button>
            <label className="ck-inline">حساسیت علامت
              <input type="range" min={20} max={70} value={sheet.sens} onChange={(e) => onSens(+e.target.value)} />
            </label>
            {sheet.marks && <span className="ck-pill">{P(sheet.marks.marked)} سؤال علامت خورده، آخری {sheet.marks.last ? P(sheet.marks.last) : '—'}</span>}
          </div>
        </section>
      )}

      {sheet.scan && sheet.marks && (
        <section className="ck-card">
          <div className="ck-card-head">
            <h3>آنچه خوانده شد</h3>
            <label className="ck-check"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> نمایش شبکه‌ی حباب‌ها</label>
          </div>
          <p className="ck-hint">حلقه‌ی سبز یعنی یک پاسخ، حلقه‌ی نارنجی یعنی دو علامت روی یک سؤال. اگر حلقه‌ها با علامت‌هایت هم‌خوان نیست، گوشه‌ها را جابه‌جا کن یا حساسیت را عوض کن. پاسخ‌های تکی را در نتیجه می‌توانی اصلاح کنی.</p>
          {sheet.marks.marked === 0 && <p className="ck-warn">هیچ علامتی پیدا نشد. گوشه‌ها را دقیق‌تر بگذار یا حساسیت را کمتر کن.</p>}
          <div className="ck-photo-scroll"><canvas ref={prevRef} /></div>
          {!hideNext && <div className="ck-row"><button type="button" className="ck-btn primary" onClick={onNext} disabled={!sheet.marks.marked}>دیدن نتیجه <ArrowLeft size={16} /></button></div>}
        </section>
      )}
    </div>
  );
};
