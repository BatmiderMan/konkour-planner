// Reader for the Qalamchi / Kanoon (کانون فرهنگی آموزش) personal result sheet — the PDF from kanoon.ir.
// The sheet is a real-text PDF; everything is found by position (right panel = tables, left panel = answer sheet, ignored).
import type { TextItem } from './pdfText';

export interface QLesson {
  label: string; base: string; grade: number | null; // grade: 10 / 11 / 12
  score10: number; level: number; rank: number; responders: number; correct: number; wrong: number; blank: number;
}
export interface QReport {
  day: number | null; month: number | null; year: number | null; date: string | null; // Jalali exam date
  level: number | null; countryRank: number | null; population: number | null; regionRank: number | null; cityRank: number | null;
  notebookLevels: { grade: number | null; level: number }[];
  lessons: QLesson[]; warnings: string[];
}

export const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
export const norm = (s: string): string => s.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه')
  .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/\u200c/g, ' ').replace(/\s+/g, ' ').trim();
export const squash = (s: string): string => norm(s).replace(/[\s]/g, '').replace(/[ًٌٍَُِّْ]/g, '');

export function gradeOf(s: string): number | null {
  const n = squash(s);
  return n.includes('دوازدهم') ? 12 : n.includes('یازدهم') ? 11 : /(^|[^ز])دهم/.test(n) || n.endsWith('دهم') ? 10 : null;
}
export function lev(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** the lesson name without its grade word, squashed: «هندسه یازدهم» → «هندسه» */
export const baseOf = (label: string): string => squash(label).replace(/(دوازدهم|یازدهم|دهم)$/, '').replace(/(دوازدهم|یازدهم|دهم)/, '');

interface Line { y: number; items: TextItem[] } // items sorted right → left (logical order for Persian)
function lines(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const out: Line[] = [];
  for (const it of sorted) {
    const l = out[out.length - 1];
    if (l && Math.abs(it.y - l.y) <= 2.2) { l.items.push(it); l.y = (l.y * (l.items.length - 1) + it.y) / l.items.length; } else out.push({ y: it.y, items: [it] });
  }
  out.forEach((l) => l.items.sort((a, b) => b.x - a.x));
  return out;
}
const isNum = (t: string) => /^\d+$/.test(norm(t));

export function parseQalamchi(all: TextItem[]): QReport {
  const warnings: string[] = [];
  const right = all.filter((i) => i.x > 380 && i.y > 20);
  const L = lines(right);

  // ---- lesson rows: a «87%» cell + at least seven numbers
  const lessons: QLesson[] = []; const rowIdx: number[] = [];
  L.forEach((l, idx) => {
    const pi = l.items.findIndex((i) => /^\d+%$/.test(norm(i.text)));
    if (pi < 0) return;
    const nums = l.items.slice(pi + 1).filter((i) => isNum(i.text)).map((i) => parseInt(norm(i.text), 10));
    if (nums.length < 7) return;
    const label = norm(l.items.slice(0, pi).map((i) => i.text).join('')).replace(/\s+/g, ' ');
    const [score10, level, rank, responders, correct, wrong, blank] = nums.slice(0, 7);
    lessons.push({ label, base: baseOf(label), grade: gradeOf(label), score10, level, rank, responders, correct, wrong, blank });
    rowIdx.push(idx);
  });
  if (!lessons.length) throw new Error('layout');

  // notebook tables: title cells «یازدهم» / «دهم» tell the grade when a lesson label does not
  lessons.forEach((ls, k) => {
    if (ls.grade !== null) return;
    for (let i = rowIdx[k]; i >= 0; i--) { const t = L[i].items.map((x) => norm(x.text)).join(''); if (L[i].items.length <= 2 && gradeOf(t)) { ls.grade = gradeOf(t); break; } }
  });
  lessons.forEach((ls) => {
    if (ls.score10 !== ls.correct) warnings.push(`«${ls.label}»: «چند تا از ۱۰» با تعداد درست نمی‌خواند.`);
    if (ls.correct + ls.wrong + ls.blank !== 10) warnings.push(`«${ls.label}»: جمع درست/غلط/نزده ۱۰ نشد.`);
  });

  // ---- overall table (before the first lesson row): label + level + ranks
  const firstLesson = rowIdx[0];
  const overall: { label: string; nums: number[] }[] = [];
  for (let i = 0; i < firstLesson; i++) {
    const l = L[i];
    const nums = l.items.filter((x) => isNum(x.text)).map((x) => parseInt(norm(x.text), 10));
    const lvl = l.items.find((x) => /^\d{4}$/.test(norm(x.text)) && x.x > 690);
    if (lvl && nums.length >= 5 && !l.items.some((x) => /%/.test(x.text))) {
      const label = norm(l.items.filter((x) => x.x > 745 && !isNum(x.text)).map((x) => x.text).join(''));
      overall.push({ label, nums });
    }
  }
  const total = overall[0];
  const level = total ? total.nums[0] : null;
  if (!total) warnings.push('ردیف «اختصاصی - کل» پیدا نشد.');
  const notebookLevels = overall.slice(1).map((o) => ({ grade: gradeOf(o.label), level: o.nums[0] }));

  // ---- date: «۳ مهر» (day + month name) in the header, year from the receive date «1405/07/03»
  const head = all.filter((i) => i.y < 36);
  const mi = head.find((i) => MONTHS.includes(norm(i.text).replace(/\s/g, '')));
  let day: number | null = null, month: number | null = null, year: number | null = null;
  if (mi) {
    month = MONTHS.indexOf(norm(mi.text).replace(/\s/g, '')) + 1;
    const near = head.filter((i) => isNum(i.text) && Math.abs(i.y - mi.y) < 3 && Math.abs(i.x - mi.x) < 40).sort((a, b) => Math.abs(a.x - mi.x) - Math.abs(b.x - mi.x))[0];
    if (near) day = parseInt(norm(near.text), 10);
  }
  const recv = head.map((i) => /(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(norm(i.text))).find(Boolean);
  if (recv) {
    const ry = +recv[1], rm = +recv[2], rd = +recv[3];
    if (day === null || month === null) { year = ry; month = rm; day = rd; warnings.push('تاریخ آزمون از تاریخ دریافت کارنامه برداشته شد.'); }
    else year = month > rm ? ry - 1 : ry;
  }
  const date = year && month && day ? `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}` : null;
  if (!date) warnings.push('تاریخ آزمون خوانده نشد.');

  // ---- cross-check with the «وضعیت پاسخ‌گویی» summary (first line below the lessons with three numbers: total, correct, wrong)
  const after = L.slice(rowIdx[rowIdx.length - 1] + 1);
  const sumLine = after.find((l) => l.items.filter((x) => isNum(x.text)).length === 3 && l.items.some((x) => x.x > 760));
  if (sumLine) {
    const [tot, cor, wr] = sumLine.items.filter((x) => isNum(x.text)).sort((a, b) => b.x - a.x).map((x) => parseInt(norm(x.text), 10));
    const sc = lessons.reduce((a, x) => a + x.correct, 0), sw = lessons.reduce((a, x) => a + x.wrong, 0);
    if (cor !== sc || wr !== sw || tot !== lessons.length * 10) warnings.push('جمع درس‌ها با جدول «وضعیت پاسخ‌گویی» نمی‌خواند؛ اعداد را بررسی کن.');
  }

  return {
    day, month, year, date, level,
    countryRank: total ? total.nums[1] ?? null : null, population: total ? total.nums[2] ?? null : null,
    regionRank: total ? total.nums[3] ?? null : null, cityRank: total ? total.nums[4] ?? null : null,
    notebookLevels, lessons, warnings
  };
}
