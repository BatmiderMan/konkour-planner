/**
 * Makes a real PDF file on the device (no library, no server).
 * Every page is drawn on a canvas (A4 at 150 dpi), saved as JPEG and wrapped into a tiny hand-written PDF.
 * Part 1 = the questions · part 2 = answer key (+ the worked solutions from the book).
 */
import { toPersianDigits as P } from '../utils';

export interface PdfQ { n: number; bookTitle: string; answer: number; q: Blob; e: Blob | null; shared?: boolean }
export interface PdfOpts {
  title: string; items: PdfQ[];
  renumber: boolean;                    // label the questions 1..N in the exam (needed when shuffled / mixed)
  cols: 1 | 2;                          // question columns
  answers: 'none' | 'key' | 'full';     // nothing · answer key only · key + worked solutions
  showName: boolean;                    // «نام / تاریخ» line
  extra?: string;                       // second header line (time, score …)
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}

const PW = 1240, PH = 1754, M = 78, GAP = 36;           // A4 @150dpi, margin, column gap
const INK = '#0f1b3a', SUB = '#5a6787', LINE = '#c9d2e6', BLUE = '#2447d8', GREEN = '#127a3f';

async function bmp(b: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(b); } catch { /* fall back */ } }
  return new Promise((res, rej) => { const u = URL.createObjectURL(b), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('تصویر خوانده نشد')); }; i.src = u; });
}
const dim = (i: ImageBitmap | HTMLImageElement) => ({ w: (i as any).width as number, h: (i as any).height as number });
const jpeg = (c: HTMLCanvasElement): Promise<Uint8Array> => new Promise((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((x) => res(new Uint8Array(x))) : rej(new Error('ساخت صفحه ناموفق بود'))), 'image/jpeg', 0.86));

class Doc {
  pages: Uint8Array[] = [];
  cv = document.createElement('canvas'); ctx!: CanvasRenderingContext2D;
  y = M; no = 0; font: string; title: string; section = '';
  constructor(title: string, font: string) { this.title = title; this.font = font; this.cv.width = PW; this.cv.height = PH; this.ctx = this.cv.getContext('2d')!; this.blank(); }
  blank() {
    const c = this.ctx; c.fillStyle = '#fff'; c.fillRect(0, 0, PW, PH); this.no++; this.y = M;
  }
  txt(s: string, x: number, y: number, size: number, color = INK, bold = false, align: CanvasTextAlign = 'right') {
    const c = this.ctx; c.font = `${bold ? '700 ' : ''}${size}px ${this.font}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic';
    try { (c as any).direction = 'rtl'; } catch { /* old browser */ }
    c.fillText(s, x, y);
  }
  footer() {
    const c = this.ctx;
    c.strokeStyle = LINE; c.lineWidth = 2; c.beginPath(); c.moveTo(M, PH - M + 12); c.lineTo(PW - M, PH - M + 12); c.stroke();
    this.txt(this.title, PW - M, PH - M + 46, 24, SUB);
    this.txt((this.section ? this.section + ' · ' : '') + 'صفحهٔ ' + P(this.no), M, PH - M + 46, 24, SUB, false, 'left');
  }
  async next() { this.footer(); this.pages.push(await jpeg(this.cv)); this.blank(); }
  async finish() { this.footer(); this.pages.push(await jpeg(this.cv)); }
  get bottom() { return PH - M - 10; }
}

/** a row of the picture that is (nearly) white — a safe place to cut a tall explanation */
function whiteRowNear(img: CanvasRenderingContext2D, w: number, from: number, minY: number): number {
  const lo = Math.max(minY, from - 140);
  const data = img.getImageData(0, lo, w, Math.max(1, from - lo)).data;
  for (let r = from - lo - 1; r >= 0; r--) {
    let dark = 0; const o = r * w * 4;
    for (let x = 0; x < w; x += 2) { const i = o + x * 4; if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) { dark++; if (dark > 1) break; } }
    if (dark <= 1) return lo + r;
  }
  return from;
}

export async function buildPdf(o: PdfOpts): Promise<Blob> {
  const font = (getComputedStyle(document.body).fontFamily || '').trim() || 'Vazirmatn, Tahoma, sans-serif';
  try { await (document as any).fonts?.load?.(`700 28px ${font}`); await (document as any).fonts?.ready; } catch { /* ignore */ }
  const d = new Doc(o.title, font), c = d.ctx, total = o.items.length * (o.answers === 'full' ? 2 : 1) + 1; let done = 0;
  const tick = () => { done++; o.onProgress?.(Math.min(done, total), total); if (o.signal?.cancelled) throw new Error('لغو شد'); };
  const date = new Date().toLocaleDateString('fa-IR');

  // ---------------------------------------------------------------- part 1: the questions
  d.section = 'سؤال‌ها';
  d.txt(o.title, PW - M, d.y + 44, 44, INK, true); d.y += 64;
  d.txt(`${P(o.items.length)} سؤال · ${date}${o.extra ? ' · ' + o.extra : ''}`, PW - M, d.y + 22, 26, SUB); d.y += 44;
  if (o.showName) {
    d.txt('نام و نام خانوادگی: ', PW - M, d.y + 22, 26, INK); c.strokeStyle = LINE; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(PW - M - 220, d.y + 22); c.lineTo(PW - M - 620, d.y + 22); c.stroke();
    d.txt('تاریخ: ', PW - M - 700, d.y + 22, 26, INK); c.beginPath(); c.moveTo(PW - M - 790, d.y + 22); c.lineTo(M, d.y + 22); c.stroke(); c.setLineDash([]); d.y += 50;
  }
  c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(M, d.y); c.lineTo(PW - M, d.y); c.stroke(); d.y += 26;

  const colW = o.cols === 2 ? (PW - 2 * M - GAP) / 2 : PW - 2 * M;
  const top0 = d.y; let col = 0, colTop = top0;
  const colX = (k: number) => (o.cols === 2 ? PW - M - colW - k * (colW + GAP) : M);   // column 0 is on the right (RTL)
  d.y = top0;
  for (let i = 0; i < o.items.length; i++) {
    const it = o.items[i], im = await bmp(it.q), { w, h } = dim(im);
    const lab = o.renumber ? 36 : 0, ih = Math.round((h * colW) / w), need = ih + lab + 28;
    if (d.y + need > d.bottom) {
      if (o.cols === 2 && col === 0) { col = 1; d.y = colTop; }
      else { await d.next(); col = 0; colTop = M; d.y = M; }
      if (d.y + need > d.bottom && d.y > colTop) { await d.next(); col = 0; colTop = M; d.y = M; }
    }
    const x = colX(col);
    if (o.renumber) {
      c.fillStyle = '#e4ebfa'; const bw = 150; c.beginPath(); c.roundRect?.(x + colW - bw, d.y, bw, 30, 15); if (!c.roundRect) c.rect(x + colW - bw, d.y, bw, 30); c.fill();
      d.txt('سؤال ' + P(i + 1), x + colW - 18, d.y + 23, 22, BLUE, true);
      if (o.items.some((q) => q.bookTitle !== o.items[0].bookTitle)) d.txt(it.bookTitle, x + colW - bw - 14, d.y + 23, 20, SUB);
      d.y += lab;
    }
    const hh = Math.min(ih, d.bottom - d.y);
    c.drawImage(im as CanvasImageSource, 0, 0, w, Math.round((hh / ih) * h), x, d.y, colW, hh);
    d.y += hh + 28; (im as any).close?.(); tick();
  }
  await d.next();

  // ---------------------------------------------------------------- part 2: answers
  if (o.answers !== 'none') {
    d.section = 'پاسخنامه';
    d.txt('پاسخنامهٔ کلیدی', PW - M, d.y + 44, 44, INK, true); d.y += 70;
    d.txt(o.title, PW - M, d.y + 22, 26, SUB); d.y += 46;
    const per = 25, groups = Math.ceil(o.items.length / per), cw = (PW - 2 * M) / Math.min(5, Math.max(1, groups)), rowH = 46;
    const bands = Math.ceil(groups / 5);
    for (let band = 0; band < bands; band++) {
      if (band > 0) { await d.next(); }
      const by0 = d.y;
      for (let g = band * 5; g < Math.min(groups, band * 5 + 5); g++) {
        const gx = PW - M - ((g % 5) + 1) * cw;
        for (let r = 0; r < per; r++) {
          const idx = g * per + r; if (idx >= o.items.length) break;
          const yy = by0 + r * rowH;
          if (r % 2 === 0) { c.fillStyle = '#f0f4fc'; c.fillRect(gx + 6, yy, cw - 12, rowH - 4); }
          d.txt(P(idx + 1), gx + cw - 22, yy + 31, 26, INK, true);
          d.txt('گزینهٔ ' + P(o.items[idx].answer), gx + 24, yy + 31, 26, GREEN, true, 'left');
        }
      }
      d.y = by0 + per * rowH + 30;
    }
    if (o.renumber && o.items.length <= 80 && d.y + 60 < d.bottom) {
      d.txt('شمارهٔ هر سؤال در کتاب: ' + o.items.map((q, i) => `${P(i + 1)}←${P(q.n)}`).join('   '), PW - M, d.y + 26, 18, SUB);
    }
    tick();
    if (o.answers === 'full') {
      await d.next(); d.section = 'پاسخ تشریحی';
      d.txt('پاسخ‌های تشریحی', PW - M, d.y + 44, 44, INK, true); d.y += 70;
      const cwid = (PW - 2 * M - GAP) / 2; let ec = 0; const ecTop = d.y; let ey = ecTop;
      const nextCol = async () => { if (ec === 0) { ec = 1; ey = ecTop; } else { await d.next(); ec = 0; ey = M; } };
      let first = true;
      for (let i = 0; i < o.items.length; i++) {
        const it = o.items[i], x = PW - M - cwid - ec * (cwid + GAP);
        const headTxt = `${o.renumber ? 'سؤال ' + P(i + 1) : 'سؤال ' + P(it.n)} — گزینهٔ ${P(it.answer)}`;
        if (!it.e) {
          if (ey + 70 > d.bottom) await nextCol();
          const xx = PW - M - cwid - ec * (cwid + GAP);
          c.fillStyle = '#f0f4fc'; c.fillRect(xx, ey, cwid, 40); d.txt(headTxt, xx + cwid - 14, ey + 28, 22, INK, true);
          d.txt('پاسخ تشریحی در دسترس نیست', xx + 14, ey + 28, 18, SUB, false, 'left'); ey += 62; tick(); continue;
        }
        const im = await bmp(it.e), { w, h } = dim(im), ih = Math.round((h * cwid) / w);
        // pre-render the scaled explanation to find cut rows
        const off = document.createElement('canvas'); off.width = Math.round(cwid); off.height = ih; const oc = off.getContext('2d')!; oc.fillStyle = '#fff'; oc.fillRect(0, 0, off.width, ih); oc.drawImage(im as CanvasImageSource, 0, 0, off.width, ih);
        let sy = 0, headDone = false;
        while (sy < ih) {
          if (ey + 40 + 120 > d.bottom && !first) await nextCol();
          first = false;
          const xx = PW - M - cwid - ec * (cwid + GAP);
          if (!headDone) { c.fillStyle = '#e4ebfa'; c.fillRect(xx, ey, cwid, 40); d.txt(headTxt + (it.shared ? ' (همراه پاسخ مجاور)' : ''), xx + cwid - 14, ey + 28, 22, BLUE, true); ey += 46; headDone = true; }
          const room = d.bottom - ey; let ex = Math.min(ih, sy + room);
          if (ex < ih) { ex = whiteRowNear(oc, off.width, ex, sy + 60); }
          if (ex <= sy + 20) { await nextCol(); continue; }
          c.drawImage(off, 0, sy, off.width, ex - sy, xx, ey, cwid, ex - sy);
          ey += ex - sy; sy = ex;
          if (sy < ih) { await nextCol(); } else ey += 26;
        }
        (im as any).close?.(); tick();
      }
    }
  }
  await d.finish();
  tick();
  return pagesToPdf(d.pages);
}

// ---------------------------------------------------------------- the PDF container (one JPEG per page)
function pagesToPdf(jpegs: Uint8Array[]): Blob {
  const enc = new TextEncoder(), parts: Uint8Array[] = []; const offs: number[] = []; let len = 0;
  const push = (u: Uint8Array | string) => { const b = typeof u === 'string' ? enc.encode(u) : u; parts.push(b); len += b.length; };
  const plain = (id: number, body: string) => { offs[id] = len; push(`${id} 0 obj\n${body}\nendobj\n`); };
  const stream = (id: number, body: Uint8Array | string, dict: string) => {
    const b = typeof body === 'string' ? enc.encode(body) : body;
    offs[id] = len; push(`${id} 0 obj\n<< ${dict} /Length ${b.length} >>\nstream\n`); push(b); push('\nendstream\nendobj\n');
  };
  push('%PDF-1.4\n');
  const n = jpegs.length, W = 595.28, H = 841.89;
  plain(1, '<< /Type /Catalog /Pages 2 0 R >>');
  plain(2, `<< /Type /Pages /Count ${n} /Kids [${jpegs.map((_, i) => `${6 + i * 3} 0 R`).join(' ')}] >>`);
  plain(3, '<< /Producer (Planex) >>');
  jpegs.forEach((j, i) => {
    const imgId = 4 + i * 3, contId = imgId + 1, pageId = imgId + 2;
    stream(imgId, j, `/Type /XObject /Subtype /Image /Width ${PW} /Height ${PH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`);
    stream(contId, `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`, '');
    plain(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contId} 0 R >>`);
  });
  const xref = len, total = 4 + n * 3;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}
