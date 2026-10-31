import React from 'react';
import { Download, Printer } from 'lucide-react';
import { PlannerData } from '../../types';
import { Sheet } from '../ui/Sheet';
import { canvasToBlob, dayTitleParts, renderDayPages } from '../../dayPrint';
import { toPersianDigits } from '../../utils';
import './dayPrint.css';

interface Props {
  data: PlannerData;
  dateKey: string;
  onClose: () => void;
}

const SAVER_KEY = 'planex_print_saver';

function readSaver(): boolean {
  try { return localStorage.getItem(SAVER_KEY) === '1'; } catch { return false; }
}

/** Preview of the day as printable A4 pages, with PNG download and print. */
export const DayPrintSheet: React.FC<Props> = ({ data, dateKey, onClose }) => {
  const [saver, setSaver] = React.useState<boolean>(readSaver);
  const [urls, setUrls] = React.useState<string[]>([]);
  const [blobs, setBlobs] = React.useState<Blob[]>([]);
  const [busy, setBusy] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const dataRef = React.useRef(data);
  dataRef.current = data;

  React.useEffect(() => {
    let dead = false;
    const made: string[] = [];
    setBusy(true);
    setFailed(false);
    renderDayPages(dataRef.current, dateKey, { saver })
      .then((canvases) => Promise.all(canvases.map(canvasToBlob)))
      .then((bs) => {
        if (dead) return;
        const us = bs.map((b) => URL.createObjectURL(b));
        made.push(...us);
        setBlobs(bs);
        setUrls(us);
        setBusy(false);
      })
      .catch(() => { if (!dead) { setFailed(true); setBusy(false); } });
    return () => { dead = true; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [dateKey, saver]);

  const toggleSaver = () => {
    const next = !saver;
    setSaver(next);
    try { localStorage.setItem(SAVER_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };

  const baseName = 'planex-' + dateKey.replace(/\//g, '-');
  const download = async () => {
    for (let i = 0; i < blobs.length; i++) {
      const a = document.createElement('a');
      a.href = urls[i];
      a.download = blobs.length > 1 ? `${baseName}-p${i + 1}.png` : `${baseName}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (i < blobs.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
  };

  const print = () => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentWindow!.document;
    doc.open();
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>Planex</title><style>' +
      '@page{size:A4;margin:0}html,body{margin:0;padding:0}' +
      'img{display:block;width:210mm;height:297mm;page-break-after:always;break-after:page}' +
      'img:last-child{page-break-after:auto;break-after:auto}' +
      '</style></head><body>' + urls.map((u) => `<img src="${u}">`).join('') + '</body></html>'
    );
    doc.close();
    const imgs = Array.from(doc.images);
    let left = imgs.length;
    const go = () => {
      try { f.contentWindow!.focus(); f.contentWindow!.print(); } catch { /* ignore */ }
      setTimeout(() => f.remove(), 60000);
    };
    if (!left) { go(); return; }
    imgs.forEach((im) => {
      const done = () => { left--; if (left === 0) go(); };
      if (im.complete) done(); else { im.onload = done; im.onerror = done; }
    });
  };

  const t = dayTitleParts(dateKey);

  return (
    <Sheet onClose={onClose} title={`چاپ برنامه‌ی ${t.weekday} ${t.date}`} z={600}>
      <div className="dps">
        <p className="dps-note">
          یک برگه‌ی A4 با طراحی آماده‌ی چاپ: برای هر پارت جای ساعت، نتیجه‌ی تست، نکته‌ها و سؤال‌های بی‌جواب، و در پایان بخش مرور شبانه.
        </p>

        <label className="dps-opt">
          <input type="checkbox" checked={saver} onChange={toggleSaver} />
          <span>نسخه‌ی کم‌مصرف (هدر سفید، صرفه‌جویی در جوهر)</span>
        </label>

        <div className="dps-pages">
          {busy && <div className="dps-busy">در حال ساخت برگه…</div>}
          {failed && <div className="dps-busy">ساخت برگه انجام نشد. دوباره امتحان کن.</div>}
          {!busy && urls.map((u, i) => (
            <figure key={u} className="dps-page">
              <img src={u} alt={`برگه ${toPersianDigits(i + 1)}`} />
              {urls.length > 1 && <figcaption>صفحه {toPersianDigits(i + 1)} از {toPersianDigits(urls.length)}</figcaption>}
            </figure>
          ))}
        </div>

        <div className="dps-actions">
          <button type="button" className="dps-btn primary" disabled={busy || !urls.length} onClick={download}>
            <Download size={17} />
            <span>{urls.length > 1 ? `دانلود PNG (${toPersianDigits(urls.length)} برگه)` : 'دانلود PNG'}</span>
          </button>
          <button type="button" className="dps-btn" disabled={busy || !urls.length} onClick={print}>
            <Printer size={17} />
            <span>چاپ</span>
          </button>
        </div>
        <div className="dps-hint">PNG با کیفیت ۳۰۰ dpi و اندازه‌ی ۲۴۸۰×۳۵۰۸ پیکسل (A4) ذخیره می‌شود.</div>
      </div>
    </Sheet>
  );
};
