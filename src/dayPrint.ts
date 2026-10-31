import { PlannerData, PlannerItem } from './types';
import { DaySlot, PlanRest, computeDayPlan, formatDuration, itemMinutes, weekdayIndexOfKey } from './plannerSchedule';
import { blockKindFor, gradeColor, hashColor, sourceTypeLabel } from './plannerStore';
import { PERSIAN_MONTH_NAMES, PERSIAN_WEEK_DAYS, parseJalaliDate } from './jalali';
import { toPersianDigits } from './utils';

/**
 * Draws one planner day as printable A4 pages (2480 x 3508 px = 300 dpi).
 * Everything is laid out in millimetres; the canvas is scaled once so 1 unit = 1 mm.
 * Each study part gets its own card with: checkbox, time, subject / source, a results strip
 * (test counts for test books, pages + focus for the others) and ruled places to write notes / questions.
 * The last page ends with a nightly-review block.
 */

const PW = 210;
const PH = 297;
const M = 12;
const CW = PW - 2 * M;
const PX_W = 2480;
const PX_H = 3508;
const FONT = "Vazirmatn, Tahoma, 'Segoe UI', sans-serif";

const COL = {
  ink: '#1d2142',
  mute: '#6d7192',
  paper: '#fcfaf5',
  line: '#d4cebd',
  dot: '#e8e3d6',
  accent: '#5b52d6',
  accent2: '#8a6cf0',
  deep: '#26295a',
  gold: '#e0a23a',
  soft: '#f0edfc',
  goldSoft: '#fbf1dc'
};

export interface DayPrintOptions {
  saver?: boolean; // light header, no big colour fills (saves ink)
}

type Entry =
  | { kind: 'item'; it: PlannerItem; slot?: DaySlot; n: number; dl: string[]; testKind: boolean }
  | { kind: 'rest'; r: PlanRest }
  | { kind: 'blank'; n: number };

interface Level { lines: number }
const LEVELS: Level[] = [{ lines: 3 }, { lines: 2 }, { lines: 1 }, { lines: 0 }];

const GAP = 3.5;
const REST_H = 9;
const FOOTER_H = 82;
const FIRST_START = 92;
const NEXT_START = 24;
const BODY_END = 281;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

async function ensureFonts(): Promise<void> {
  try {
    const f = (document as any).fonts;
    if (!f || !f.load) return;
    await Promise.all([
      f.load('400 10px Vazirmatn', 'آبپ۱۲۳ Planex'),
      f.load('500 10px Vazirmatn', 'آبپ۱۲۳ Planex'),
      f.load('700 10px Vazirmatn', 'آبپ۱۲۳ Planex'),
      f.load('800 10px Vazirmatn', 'آبپ۱۲۳ Planex')
    ]);
  } catch { /* fall back to whatever is available */ }
}

function hexA(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function dayTitleParts(key: string): { weekday: string; date: string; jy: number } {
  const j = parseJalaliDate(key);
  const wd = PERSIAN_WEEK_DAYS[weekdayIndexOfKey(key)] || '';
  if (!j) return { weekday: wd, date: key, jy: 0 };
  return { weekday: wd, date: `${toPersianDigits(j.jd)} ${PERSIAN_MONTH_NAMES[j.jm - 1]} ${toPersianDigits(j.jy)}`, jy: j.jy };
}

export async function renderDayPages(data: PlannerData, key: string, opts: DayPrintOptions = {}): Promise<HTMLCanvasElement[]> {
  await ensureFonts();
  const logo = await loadImage(`${import.meta.env.BASE_URL}planex-icon.png`);

  const items = data.items[key] || [];
  const timed = !!data.timeline[key];
  const plan = timed && items.length ? computeDayPlan(items, key, data.schedule, data.dayRests[key]) : null;
  const saver = !!opts.saver;
  const title = dayTitleParts(key);

  // ---------- canvas helpers (one measuring canvas, pages are created later) ----------
  const mk = (): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } => {
    const c = document.createElement('canvas');
    c.width = PX_W;
    c.height = PX_H;
    const x = c.getContext('2d')!;
    x.setTransform(PX_W / PW, 0, 0, PX_H / PH, 0, 0);
    x.direction = 'rtl';
    x.textBaseline = 'alphabetic';
    return { c, x };
  };
  const measure = mk().x;

  const setFont = (x: CanvasRenderingContext2D, size: number, weight = 400) => { x.font = `${weight} ${size}px ${FONT}`; };

  const wrap = (text: string, maxW: number, size: number, weight: number, maxLines: number): string[] => {
    setFont(measure, size, weight);
    const words = (text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const out: string[] = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const t = cur ? cur + ' ' + words[i] : words[i];
      if (measure.measureText(t).width <= maxW || !cur) cur = t;
      else { out.push(cur); cur = words[i]; }
      if (out.length === maxLines) break;
    }
    if (out.length < maxLines && cur) out.push(cur);
    // overflow: the text did not fit in maxLines -> ellipsis on the last line
    const used = out.join(' ').replace(/\s+/g, ' ').length;
    const total = words.join(' ').length;
    if (used < total && out.length) {
      let last = out[out.length - 1];
      while (last.length > 1 && measure.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      out[out.length - 1] = last.trimEnd() + '…';
    }
    return out;
  };

  // ---------- entries ----------
  const xr = M + CW - 6; // content right edge inside a card
  const xl = M + 5; // content left edge inside a card
  const TIME_W = 36;
  const titleRight = xr - 9.4;
  const detailMaxW = titleRight - (xl + TIME_W + 4);

  const entries: Entry[] = [];
  if (items.length) {
    items.forEach((it, i) => {
      if (plan) plan.rests.filter((r) => r.beforeIndex === i).forEach((r) => entries.push({ kind: 'rest', r }));
      entries.push({
        kind: 'item',
        it,
        slot: plan ? plan.slots[i] : undefined,
        n: i + 1,
        dl: it.detail ? wrap(it.detail, detailMaxW, 3.5, 400, 2) : [],
        testKind: blockKindFor(it, data.sourceTypes) === 'test'
      });
    });
    if (plan) plan.rests.filter((r) => r.beforeIndex >= items.length).forEach((r) => entries.push({ kind: 'rest', r }));
  } else {
    for (let i = 1; i <= 5; i++) entries.push({ kind: 'blank', n: i });
  }

  const STRIP_H = 9.5;
  const extra = new Map<Entry, number>(); // spare writing lines a card gets when its page has room left over
  const entryH = (e: Entry, lv: Level): number => {
    if (e.kind === 'rest') return REST_H;
    const row1 = e.kind === 'item' ? 11.5 + e.dl.length * 4.4 : 16;
    const lines = lv.lines ? lv.lines + (extra.get(e) || 0) : 0;
    return row1 + STRIP_H + (lines ? 3.5 + lines * 6.4 : 0) + 3.5;
  };

  interface Paged { pages: Entry[][]; footerPage: number }
  const paginate = (lv: Level): Paged => {
    const pages: Entry[][] = [[]];
    let y = FIRST_START;
    entries.forEach((e) => {
      const h = entryH(e, lv);
      if (y + h > BODY_END && pages[pages.length - 1].length) { pages.push([]); y = NEXT_START; }
      pages[pages.length - 1].push(e);
      y += h + GAP;
    });
    if (y + FOOTER_H > BODY_END + 2) { pages.push([]); y = NEXT_START; }
    return { pages, footerPage: pages.length - 1 };
  };

  let best = { lv: LEVELS[0], paged: paginate(LEVELS[0]) };
  for (const lv of LEVELS) {
    const p = paginate(lv);
    if (p.pages.length < best.paged.pages.length) best = { lv, paged: p };
  }
  const { lv, paged } = best;

  // use spare room on each page for more writing lines (max +3 per card)
  if (lv.lines) {
    paged.pages.forEach((list, pi) => {
      const cards = list.filter((e) => e.kind !== 'rest');
      if (!cards.length) return;
      let used = pi === 0 ? FIRST_START : NEXT_START;
      list.forEach((e) => { used += entryH(e, lv) + GAP; });
      const limit = pi === paged.footerPage ? BODY_END - FOOTER_H - 2 : BODY_END;
      const per = Math.max(0, Math.min(3, Math.floor((limit - used) / 6.4 / cards.length)));
      if (per) cards.forEach((e) => extra.set(e, per));
    });
  }

  // ---------- drawing primitives ----------
  const rr = (x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) => {
    const rad = Math.min(r, w / 2, h / 2);
    x.beginPath();
    x.moveTo(px + rad, py);
    x.arcTo(px + w, py, px + w, py + h, rad);
    x.arcTo(px + w, py + h, px, py + h, rad);
    x.arcTo(px, py + h, px, py, rad);
    x.arcTo(px, py, px + w, py, rad);
    x.closePath();
  };
  const text = (x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, color: string, weight = 400, align: CanvasTextAlign = 'right') => {
    setFont(x, size, weight);
    x.fillStyle = color;
    x.textAlign = align;
    x.fillText(s, px, py);
  };
  const dotted = (x: CanvasRenderingContext2D, x1: number, x2: number, py: number, color = COL.line, w = 0.22) => {
    x.save();
    x.strokeStyle = color;
    x.lineWidth = w;
    x.setLineDash([0.9, 1.1]);
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(x1, py);
    x.lineTo(x2, py);
    x.stroke();
    x.restore();
  };
  const shadowOn = (x: CanvasRenderingContext2D, a = 0.1) => {
    x.shadowColor = `rgba(38,41,90,${a})`;
    x.shadowBlur = 26;
    x.shadowOffsetY = 7;
  };
  const shadowOff = (x: CanvasRenderingContext2D) => { x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0; };
  const star = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r * 0.42 : r;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
  };
  const drop = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
    x.beginPath();
    x.moveTo(cx, cy - r * 1.35);
    x.bezierCurveTo(cx + r * 0.2, cy - r * 0.7, cx + r, cy - r * 0.1, cx + r, cy + r * 0.35);
    x.arc(cx, cy + r * 0.35, r, 0, Math.PI, false);
    x.bezierCurveTo(cx - r, cy - r * 0.1, cx - r * 0.2, cy - r * 0.7, cx, cy - r * 1.35);
    x.closePath();
  };
  const face = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number, mood: number) => {
    x.save();
    x.strokeStyle = COL.mute;
    x.fillStyle = COL.mute;
    x.lineWidth = 0.35;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.stroke();
    x.beginPath(); x.arc(cx - r * 0.35, cy - r * 0.2, r * 0.09, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(cx + r * 0.35, cy - r * 0.2, r * 0.09, 0, Math.PI * 2); x.fill();
    // mood 0 (sad) .. 4 (happy)
    const k = (mood - 2) / 2; // -1 .. 1
    x.beginPath();
    x.moveTo(cx - r * 0.42, cy + r * 0.38);
    x.quadraticCurveTo(cx, cy + r * (0.38 + 0.5 * k), cx + r * 0.42, cy + r * 0.38);
    x.stroke();
    x.restore();
  };

  // ---------- page pieces ----------
  const drawBackground = (x: CanvasRenderingContext2D) => {
    x.fillStyle = COL.paper;
    x.fillRect(0, 0, PW, PH);
    x.fillStyle = COL.dot;
    for (let gx = 6; gx < PW; gx += 6) for (let gy = 6; gy < PH; gy += 6) { x.beginPath(); x.arc(gx, gy, 0.22, 0, Math.PI * 2); x.fill(); }
  };

  const drawBigHeader = (x: CanvasRenderingContext2D) => {
    const dark = !saver;
    const H = 44;
    if (dark) {
      const g = x.createLinearGradient(PW, 0, 0, H + 10);
      g.addColorStop(0, COL.deep);
      g.addColorStop(0.55, '#4b43c4');
      g.addColorStop(1, COL.accent2);
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(PW, 0);
      x.lineTo(PW, H - 4);
      x.bezierCurveTo(PW * 0.72, H + 4, PW * 0.3, H - 8, 0, H + 1);
      x.closePath();
      x.fill();
      x.save();
      x.clip();
      x.fillStyle = 'rgba(255,255,255,0.07)';
      [[PW - 6, 8, 30], [PW * 0.55, 34, 22], [28, 6, 26], [PW * 0.3, 40, 12]].forEach(([cx, cy, r]) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); });
      x.strokeStyle = 'rgba(255,255,255,0.10)';
      x.lineWidth = 0.35;
      for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(PW - 6, 8, 38 + i * 7, 0, Math.PI * 2); x.stroke(); }
      x.fillStyle = 'rgba(255,214,120,0.9)';
      [[PW * 0.42, 12, 1.7], [PW * 0.48, 22, 1.1], [PW * 0.36, 26, 0.9]].forEach(([cx, cy, r]) => { star(x, cx, cy, r); x.fill(); });
      x.restore();
    } else {
      x.strokeStyle = COL.accent;
      x.lineWidth = 0.7;
      x.beginPath(); x.moveTo(M, 38); x.lineTo(PW - M, 38); x.stroke();
      x.fillStyle = COL.gold;
      x.fillRect(PW - M - 26, 37.3, 26, 1.4);
    }
    const fg = dark ? '#ffffff' : COL.ink;
    const fg2 = dark ? 'rgba(255,255,255,0.82)' : COL.mute;
    text(x, 'برنامه‌ی روزانه', PW - M, 12.5, 3.7, fg2, 500);
    text(x, title.weekday, PW - M, 25, 15, fg, 800);
    text(x, title.date, PW - M, 33.5, 6, dark ? '#ffe3a3' : COL.accent, 700);
    // brand (left)
    if (logo) {
      x.save();
      shadowOn(x, 0.2);
      x.fillStyle = '#fff';
      rr(x, M, 8, 14, 14, 3.4);
      x.fill();
      shadowOff(x);
      const iw = 8.4, ih = (logo.naturalHeight / logo.naturalWidth) * iw;
      x.drawImage(logo, M + 7 - iw / 2, 15 - ih / 2, iw, ih);
      x.restore();
    }
    text(x, 'Planex', M + 17, 16, 6.2, fg, 800, 'left');
    text(x, 'برنامه‌ریز کنکور', M + 17, 21.4, 3, fg2, 500, 'left');
  };

  const drawStats = (x: CanvasRenderingContext2D) => {
    const totalMin = items.reduce((s, it) => s + itemMinutes(it, data.schedule), 0);
    const done = items.filter((i) => i.done).length;
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    const tTxt = !items.length ? '—' : (h ? `${toPersianDigits(h)} ساعت` : '') + (h && m ? ' و ' : '') + (m ? `${toPersianDigits(m)} دقیقه` : '');
    const cells: [string, string, string][] = [
      [items.length ? toPersianDigits(items.length) : '—', 'پارت برنامه‌ریزی‌شده', COL.accent],
      [tTxt, 'زمان مطالعه‌ی برنامه', COL.gold],
      [items.length ? `${toPersianDigits(done)} از ${toPersianDigits(items.length)}` : '—', 'پارت انجام‌شده', '#2f9e77']
    ];
    const w = 56, gap = (CW - 3 * w) / 2, y = 38;
    cells.forEach(([val, lab, c], i) => {
      const cx = PW - M - w - i * (w + gap);
      x.save();
      shadowOn(x, 0.13);
      x.fillStyle = '#fff';
      rr(x, cx, y, w, 14.5, 3.4);
      x.fill();
      shadowOff(x);
      x.strokeStyle = COL.line; x.lineWidth = 0.2; x.stroke();
      x.fillStyle = c;
      rr(x, cx + w - 1.6, y + 3.2, 1.1, 8.1, 0.55); x.fill();
      text(x, val, cx + w - 5, y + 8, val.length > 9 ? 4.6 : 5.8, COL.ink, 800);
      text(x, lab, cx + w - 5, y + 12.6, 2.9, COL.mute, 500);
      x.restore();
    });
  };

  const drawSmallHeader = (x: CanvasRenderingContext2D, pageNo: number, total: number) => {
    const g = x.createLinearGradient(PW, 0, 0, 0);
    g.addColorStop(0, saver ? COL.accent : COL.deep);
    g.addColorStop(1, COL.accent2);
    x.fillStyle = g;
    x.fillRect(0, 0, PW, 2.6);
    text(x, `${title.weekday}، ${title.date}`, PW - M, 14, 5.4, COL.ink, 800);
    text(x, `ادامه‌ی برنامه · صفحه ${toPersianDigits(pageNo)} از ${toPersianDigits(total)}`, M, 14, 3.4, COL.mute, 500, 'left');
    x.fillStyle = COL.gold;
    x.fillRect(PW - M - 18, 16.4, 18, 1);
  };

  const sectionTitle = (x: CanvasRenderingContext2D, label: string, y: number, sub?: string) => {
    x.fillStyle = COL.accent;
    rr(x, PW - M - 1.6, y - 4.6, 1.6, 6.2, 0.8); x.fill();
    text(x, label, PW - M - 4, y, 5, COL.ink, 800);
    if (sub) text(x, sub, M, y, 3.1, COL.mute, 400, 'left');
  };

  const drawCheckbox = (x: CanvasRenderingContext2D, px: number, py: number, s: number, color: string, done: boolean) => {
    x.save();
    x.lineWidth = 0.5;
    x.strokeStyle = color;
    rr(x, px, py, s, s, 1.5);
    if (done) {
      x.fillStyle = color; x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 0.8; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(px + s * 0.24, py + s * 0.54); x.lineTo(px + s * 0.43, py + s * 0.74); x.lineTo(px + s * 0.78, py + s * 0.28); x.stroke();
    } else {
      x.fillStyle = '#fff'; x.fill(); x.stroke();
    }
    x.restore();
  };

  const field = (x: CanvasRenderingContext2D, rightX: number, slotW: number, py: number, label: string, boxW: number) => {
    // label at the right, writing box to its left
    setFont(x, 3, 600);
    const lw = x.measureText(label).width;
    text(x, label, rightX, py + 4.9, 3, COL.mute, 600);
    const bx = rightX - lw - 1.6 - boxW;
    x.save();
    x.fillStyle = '#fff';
    x.strokeStyle = COL.line;
    x.lineWidth = 0.25;
    rr(x, bx, py + 0.9, boxW, 5.4, 1.2); x.fill(); x.stroke();
    x.restore();
    void slotW;
  };

  const drawCard = (x: CanvasRenderingContext2D, y: number, e: Entry & { kind: 'item' | 'blank' }) => {
    const h = entryH(e, lv);
    const isItem = e.kind === 'item';
    const it = isItem ? (e as Extract<Entry, { kind: 'item' }>).it : null;
    const accent = it ? gradeColor(it.grade) : COL.accent;
    const done = !!it && it.done;
    const testKind = isItem ? (e as Extract<Entry, { kind: 'item' }>).testKind : false;

    // card body + shadow
    x.save();
    shadowOn(x, 0.1);
    x.fillStyle = done ? '#f7fbf8' : '#ffffff';
    rr(x, M, y, CW, h, 3.2);
    x.fill();
    shadowOff(x);
    x.strokeStyle = COL.line; x.lineWidth = 0.2; x.stroke();
    x.clip();
    x.fillStyle = accent;
    x.fillRect(M + CW - 2.6, y, 2.6, h);
    x.restore();

    // number tag (tiny, on the accent bar side)
    const n = isItem ? (e as Extract<Entry, { kind: 'item' }>).n : (e as Extract<Entry, { kind: 'blank' }>).n;
    text(x, toPersianDigits(n), M + CW - 1.3, y + 2.3 + 6.4, 2.6, '#fff', 800, 'center');

    // checkbox
    drawCheckbox(x, xr - 6.4, y + 3.6, 6.4, accent, done);

    const row1 = isItem ? 11.5 + (e as Extract<Entry, { kind: 'item' }>).dl.length * 4.4 : 16;

    if (it) {
      const ie = e as Extract<Entry, { kind: 'item' }>;
      // title
      setFont(x, 4.8, 800);
      const tW = Math.min(x.measureText(it.subject).width, titleRight - xl - TIME_W - 6);
      text(x, it.subject, titleRight, y + 8.1, 4.8, done ? COL.mute : COL.ink, 800);
      if (done) { x.strokeStyle = COL.mute; x.lineWidth = 0.3; x.beginPath(); x.moveTo(titleRight - tW, y + 6.8); x.lineTo(titleRight, y + 6.8); x.stroke(); }
      // source chip
      if (it.source) {
        const sc = data.sourceColors[it.source] || hashColor(it.source);
        const tl = sourceTypeLabel(data.sourceTypes[it.source]);
        const label = it.source + (tl ? ' · ' + tl : '');
        setFont(x, 2.9, 600);
        const cw = x.measureText(label).width + 6;
        const cx = titleRight - tW - 3 - cw;
        if (cx > xl + TIME_W + 2) {
          x.fillStyle = hexA(sc, 0.16); rr(x, cx, y + 4.5, cw, 5, 2.5); x.fill();
          x.fillStyle = sc; x.beginPath(); x.arc(cx + cw - 2.4, y + 7, 0.95, 0, Math.PI * 2); x.fill();
          text(x, label, cx + cw - 4.4, y + 8.1, 2.9, COL.ink, 600);
        }
      }
      ie.dl.forEach((ln, i) => text(x, ln, titleRight, y + 13.1 + i * 4.4, 3.5, COL.mute, 400));
      // time block
      const slot = ie.slot;
      const tx = xl;
      if (slot) {
        x.fillStyle = slot.clash || slot.overflow ? '#fdecec' : COL.soft;
        rr(x, tx, y + 3.7, TIME_W, 6.6, 3.3); x.fill();
        text(x, `${toPersianDigits(slot.start)} – ${toPersianDigits(slot.end)}`, tx + TIME_W / 2, y + 8.25, 3.9, slot.clash || slot.overflow ? '#c0392b' : COL.accent, 800, 'center');
        text(x, toPersianDigits(formatDuration(slot.minutes)), tx + TIME_W / 2, y + 13.4, 3, COL.mute, 500, 'center');
      } else {
        x.save();
        x.setLineDash([0.9, 0.9]); x.strokeStyle = COL.line; x.lineWidth = 0.28;
        rr(x, tx, y + 3.7, TIME_W, 6.6, 3.3); x.stroke();
        x.restore();
        text(x, 'ساعت', tx + TIME_W - 3.5, y + 8, 3, COL.mute, 500);
        text(x, toPersianDigits(formatDuration(itemMinutes(it, data.schedule))), tx + TIME_W / 2, y + 13.4, 3, COL.mute, 500, 'center');
      }
    } else {
      // blank card: write-in subject / topic / time
      text(x, 'درس:', titleRight, y + 8.2, 3.6, COL.mute, 700);
      dotted(x, xl + TIME_W + 6, titleRight - 9, y + 8.4);
      text(x, 'مبحث:', titleRight, y + 14.4, 3.6, COL.mute, 700);
      dotted(x, xl + TIME_W + 6, titleRight - 10.5, y + 14.6);
      x.save();
      x.setLineDash([0.9, 0.9]); x.strokeStyle = COL.line; x.lineWidth = 0.28;
      rr(x, xl, y + 3.7, TIME_W, 6.6, 3.3); x.stroke();
      x.restore();
      text(x, 'ساعت', xl + TIME_W - 3.5, y + 8, 3, COL.mute, 500);
    }

    // results strip
    const sy = y + row1;
    x.fillStyle = COL.soft;
    rr(x, xl, sy, xr - xl, 7.6, 2.2); x.fill();
    const stripW = xr - xl;
    if (testKind || !isItem) {
      const labels = ['تعداد تست', 'درست', 'غلط', 'نزده', 'درصد'];
      const slotW = stripW / labels.length;
      labels.forEach((lb, i) => field(x, xr - 1.6 - i * slotW, slotW, sy + 0.2, lb, i === 0 ? 14 : 12));
    } else {
      const slotW = stripW / 4;
      field(x, xr - 1.6, slotW, sy + 0.2, 'از صفحه', 13);
      field(x, xr - 1.6 - slotW, slotW, sy + 0.2, 'تا صفحه', 13);
      field(x, xr - 1.6 - 2 * slotW, slotW, sy + 0.2, 'مدت واقعی', 12);
      // focus dots
      const fxR = xr - 1.6 - 3 * slotW;
      text(x, 'تمرکز', fxR, sy + 5.1, 3, COL.mute, 600);
      for (let i = 0; i < 5; i++) {
        x.beginPath(); x.arc(fxR - 11.5 - i * 4.1, sy + 3.8, 1.5, 0, Math.PI * 2);
        x.fillStyle = '#fff'; x.fill(); x.strokeStyle = COL.accent2; x.lineWidth = 0.28; x.stroke();
      }
    }

    // notes + questions
    const nLines = lv.lines ? lv.lines + (extra.get(e) || 0) : 0;
    if (nLines) {
      const ny = sy + 7.6 + 2.2;
      const col1 = 104;
      const gap = 5;
      const col2 = xr - xl - col1 - gap;
      text(x, 'نکته‌ها و خلاصه', xr, ny + 2.4, 3.1, COL.accent, 700);
      text(x, 'سؤال‌های بی‌جواب', xr - col1 - gap, ny + 2.4, 3.1, COL.gold, 700);
      for (let i = 0; i < nLines; i++) {
        const ly = ny + 3.5 + (i + 1) * 6.4 - 1;
        dotted(x, xr - col1, xr, ly);
        dotted(x, xl, xl + col2, ly);
      }
      // divider
      x.save();
      x.strokeStyle = COL.line; x.lineWidth = 0.2; x.setLineDash([0.6, 1]);
      x.beginPath(); x.moveTo(xr - col1 - gap / 2, ny); x.lineTo(xr - col1 - gap / 2, ny + 3.5 + nLines * 6.4 - 1); x.stroke();
      x.restore();
    }
  };

  const drawRest = (x: CanvasRenderingContext2D, y: number, r: PlanRest) => {
    const label = `${r.icon}  ${r.label}   ${toPersianDigits(r.start)} – ${toPersianDigits(r.end)}`;
    setFont(x, 3.5, 600);
    const w = x.measureText(label).width + 12;
    const cx = PW / 2;
    x.fillStyle = COL.goldSoft;
    rr(x, cx - w / 2, y + 1, w, 7, 3.5); x.fill();
    text(x, label, cx, y + 5.7, 3.5, '#8a6212', 600, 'center');
    dotted(x, M + 6, cx - w / 2 - 3, y + 4.5, '#e6cf9c', 0.3);
    dotted(x, cx + w / 2 + 3, PW - M - 6, y + 4.5, '#e6cf9c', 0.3);
  };

  const linedBox = (x: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number, label: string, color: string, rows: number) => {
    x.save();
    shadowOn(x, 0.08);
    x.fillStyle = '#fff';
    rr(x, bx, by, bw, bh, 3); x.fill();
    shadowOff(x);
    x.strokeStyle = COL.line; x.lineWidth = 0.2; x.stroke();
    x.restore();
    x.fillStyle = color;
    rr(x, bx + bw - 1.3, by + 3, 1.3, 5, 0.65); x.fill();
    text(x, label, bx + bw - 4, by + 6.6, 3.7, COL.ink, 800);
    const top = by + 10.5;
    const step = (bh - 12) / rows;
    for (let i = 0; i < rows; i++) dotted(x, bx + 4, bx + bw - 4, top + (i + 1) * step - 1);
  };

  const drawFooter = (x: CanvasRenderingContext2D, y: number) => {
    sectionTitle(x, 'مرور شبانه', y + 4, 'پایان روز، پنج دقیقه با خودت صادق باش ✦');
    const top = y + 8;
    const w2 = (CW - 5) / 2;
    linedBox(x, M + w2 + 5, top, w2, 31, 'امروز چه چیزی یاد گرفتم؟', COL.accent, 4);
    linedBox(x, M, top, w2, 31, 'اشتباه‌هایی که باید جبران کنم', '#d4543f', 4);
    const by = top + 35;
    const w3 = (CW - 10) / 3;
    const bh = 27;
    // box 1: first task tomorrow
    linedBox(x, M + 2 * (w3 + 5), by, w3, bh, 'اولین کار فردا', COL.gold, 2);
    // box 2: sleep + water
    const b2x = M + (w3 + 5);
    x.save();
    shadowOn(x, 0.08); x.fillStyle = '#fff'; rr(x, b2x, by, w3, bh, 3); x.fill(); shadowOff(x);
    x.strokeStyle = COL.line; x.lineWidth = 0.2; x.stroke();
    x.restore();
    x.fillStyle = '#2f9e77'; rr(x, b2x + w3 - 1.3, by + 3, 1.3, 5, 0.65); x.fill();
    text(x, 'خواب و آب', b2x + w3 - 4, by + 6.6, 3.7, COL.ink, 800);
    text(x, 'خواب:', b2x + w3 - 4, by + 13.4, 3.2, COL.mute, 600);
    dotted(x, b2x + w3 / 2 + 2, b2x + w3 - 14, by + 13.6);
    text(x, 'بیداری:', b2x + w3 / 2 - 1, by + 13.4, 3.2, COL.mute, 600);
    dotted(x, b2x + 4, b2x + w3 / 2 - 12, by + 13.6);
    for (let i = 0; i < 8; i++) {
      const dx = b2x + w3 - 8 - i * ((w3 - 14) / 7);
      drop(x, dx, by + 21, 1.7);
      x.strokeStyle = '#5aa7e6'; x.lineWidth = 0.3; x.stroke();
    }
    // box 3: rating
    const b3x = M;
    x.save();
    shadowOn(x, 0.08); x.fillStyle = '#fff'; rr(x, b3x, by, w3, bh, 3); x.fill(); shadowOff(x);
    x.strokeStyle = COL.line; x.lineWidth = 0.2; x.stroke();
    x.restore();
    x.fillStyle = COL.accent2; rr(x, b3x + w3 - 1.3, by + 3, 1.3, 5, 0.65); x.fill();
    text(x, 'امتیاز امروز من', b3x + w3 - 4, by + 6.6, 3.7, COL.ink, 800);
    for (let i = 0; i < 5; i++) {
      star(x, b3x + w3 / 2 + 2 * 7.4 - i * 7.4, by + 14.5, 3);
      x.strokeStyle = COL.gold; x.lineWidth = 0.35; x.stroke();
    }
    for (let i = 0; i < 5; i++) face(x, b3x + w3 / 2 + 2 * 7.4 - i * 7.4, by + 22.4, 2.1, i);
  };

  const drawPageFoot = (x: CanvasRenderingContext2D, pageNo: number, total: number) => {
    x.strokeStyle = COL.line; x.lineWidth = 0.2;
    x.beginPath(); x.moveTo(M, PH - 10); x.lineTo(PW - M, PH - 10); x.stroke();
    text(x, 'Planex · ' + title.weekday + ' ' + title.date, PW - M, PH - 6, 2.9, COL.mute, 500);
    text(x, `${toPersianDigits(pageNo)} / ${toPersianDigits(total)}`, M, PH - 6, 2.9, COL.mute, 500, 'left');
  };

  // today's main goal (lined) + mood / energy faces, right under the stat cards
  const drawGoalBand = (x: CanvasRenderingContext2D) => {
    const y = 57, h = 22;
    const wGoal = 118, wMood = CW - wGoal - 5;
    const gx = PW - M - wGoal;
    x.save();
    shadowOn(x, 0.08); x.fillStyle = '#fff'; rr(x, gx, y, wGoal, h, 3); x.fill(); shadowOff(x);
    x.strokeStyle = COL.line; x.lineWidth = 0.2; x.stroke();
    x.restore();
    x.fillStyle = COL.gold; rr(x, gx + wGoal - 1.3, y + 3, 1.3, 5, 0.65); x.fill();
    text(x, 'هدف اصلی امروز من', gx + wGoal - 4, y + 6.6, 3.7, COL.ink, 800);
    dotted(x, gx + 4, gx + wGoal - 4, y + 13.4);
    dotted(x, gx + 4, gx + wGoal - 4, y + 19.2);
    const mx = M;
    x.save();
    shadowOn(x, 0.08); x.fillStyle = '#fff'; rr(x, mx, y, wMood, h, 3); x.fill(); shadowOff(x);
    x.strokeStyle = COL.line; x.lineWidth = 0.2; x.stroke();
    x.restore();
    x.fillStyle = COL.accent2; rr(x, mx + wMood - 1.3, y + 3, 1.3, 5, 0.65); x.fill();
    text(x, 'حال و انرژی امروز', mx + wMood - 4, y + 6.6, 3.7, COL.ink, 800);
    for (let i = 0; i < 5; i++) face(x, mx + wMood / 2 + 2 * 8.6 - i * 8.6, y + 15.2, 3.2, i);
  };

  // ---------- compose pages ----------
  const total = paged.pages.length;
  const canvases: HTMLCanvasElement[] = [];
  paged.pages.forEach((list, pi) => {
    const { c, x } = mk();
    drawBackground(x);
    let y: number;
    if (pi === 0) {
      drawBigHeader(x);
      drawStats(x);
      y = FIRST_START;
    } else {
      drawSmallHeader(x, pi + 1, total);
      y = NEXT_START;
    }
    if (pi === 0) {
      drawGoalBand(x);
      sectionTitle(x, 'برنامه‌ی امروز', 86.5, items.length ? 'هر پارت: ساعت، نتیجه، نکته و سؤال' : 'نسخه‌ی خالی — دست‌نویس پر کن');
    }
    list.forEach((e) => {
      if (e.kind === 'rest') drawRest(x, y, e.r);
      else drawCard(x, y, e);
      y += entryH(e, lv) + GAP;
    });
    if (pi === paged.footerPage) {
      const fy = Math.max(y + 2, BODY_END - FOOTER_H + 4);
      const room = fy - y - 2;
      // a mostly empty last page: fill the gap with a free-notes box
      if (room >= 28) linedBox(x, M, y, CW, room - 1, 'یادداشت آزاد', COL.accent2, Math.max(2, Math.floor((room - 13) / 6.4)));
      drawFooter(x, fy);
    }
    drawPageFoot(x, pi + 1, total);
    canvases.push(c);
  });
  return canvases;
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
}
