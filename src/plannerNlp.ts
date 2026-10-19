import { PlannerGrade, PlannerSubjectDef } from './types';
import { PERSIAN_MONTH_NAMES } from './jalali';
import { addDays, dateFromJalali, dateKeyOf, jalaliOfDate } from './plannerStore';
import { minToTime } from './plannerSchedule';

// Turns a free Persian sentence into a planning card (or a fixed interruption of the day):
//   «زیست گفتار ۲ تست ۳۰ از تست گاج فردا ۹۰ دقیقه ساعت ۱۶»
//   «ناهار از ۱۳ تا ۱۴ امروز»

export interface ParseContext {
  subjects: PlannerSubjectDef[];
  sourceColors: Record<string, string>;
  defaultDate: Date; // used when the sentence names no day
  defaultGrade?: PlannerGrade;
}

export interface ParsedEntry {
  raw: string;
  kind: 'item' | 'rest';
  dateKey: string;
  date: Date;
  dayGiven: boolean;
  subject?: string;
  grade?: PlannerGrade;
  gradeGiven: boolean;
  detail: string;
  source?: string;
  sourceKnown: boolean;
  minutes?: number;
  start?: string;
  end?: string; // rests only
  label?: string; // rests only
  icon?: string; // rests only
  error?: string;
}

const GRADE_WORDS: { re: RegExp; g: PlannerGrade }[] = [
  { re: /(^|\s)یازدهم(?=\s|$)/, g: 'یازدهم' },
  { re: /(^|\s)دوازدهم(?=\s|$)/, g: 'دوازدهم' },
  { re: /(^|\s)دهم(?=\s|$)/, g: 'دهم' }
];
const GRADE_BY_NUM: Record<number, PlannerGrade> = { 1: 'دهم', 2: 'یازدهم', 3: 'دوازدهم' };
const NUM_BY_GRADE: Record<string, number> = { دهم: 1, یازدهم: 2, دوازدهم: 3 };

const ALIASES: Record<string, string> = {
  زیست: 'زیست‌شناسی',
  ادبیات: 'ادبیات فارسی',
  فارسی: 'ادبیات فارسی',
  دین: 'دین و زندگی',
  زبان: 'زبان انگلیسی',
  انگلیسی: 'زبان انگلیسی',
  آمار: 'آمار و احتمال',
  زمین: 'زمین‌شناسی',
  ریاضی: 'حسابان'
};

const REST_WORDS: { re: RegExp; label: string; icon: string }[] = [
  { re: /ناهار|نهار/, label: 'ناهار', icon: '🍽' },
  { re: /صبحانه/, label: 'صبحانه', icon: '🥐' },
  { re: /شام/, label: 'شام', icon: '🌙' },
  { re: /نماز/, label: 'نماز', icon: '🕌' },
  { re: /چرت|خواب/, label: 'چرت', icon: '😴' },
  { re: /ورزش|دویدن|پیاده[\u200c ]?روی/, label: 'ورزش', icon: '🏃' },
  { re: /مدرسه|کلاس|آموزشگاه/, label: 'مدرسه / کلاس', icon: '🏫' },
  { re: /رفت[\u200c ]?و[\u200c ]?آمد|مسیر/, label: 'رفت‌وآمد', icon: '🚌' },
  { re: /استراحت|تفریح|بیرون/, label: 'استراحت', icon: '☕' }
];

const WEEKDAYS: { re: RegExp; js: number }[] = [
  { re: /(^|\s)یک[\u200c ]?شنبه(?=\s|$)/, js: 0 },
  { re: /(^|\s)دو[\u200c ]?شنبه(?=\s|$)/, js: 1 },
  { re: /(^|\s)سه[\u200c ]?شنبه(?=\s|$)/, js: 2 },
  { re: /(^|\s)چهار[\u200c ]?شنبه(?=\s|$)/, js: 3 },
  { re: /(^|\s)پنج[\u200c ]?شنبه(?=\s|$)/, js: 4 },
  { re: /(^|\s)جمعه(?=\s|$)/, js: 5 },
  { re: /(^|\s)شنبه(?=\s|$)/, js: 6 }
];

const WORD_NUM: Record<string, number> = { یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8 };
const ORD: Record<string, number> = { اول: 1, دوم: 2, سوم: 3 };

function normalize(t: string): string {
  return t
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[،,؛;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const toFa = (t: string) => t.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
const stripNum = (n: string) => n.replace(/\s*[\d۰-۹]+$/, '');
const numOfName = (n: string): number | undefined => {
  const m = normalize(n).match(/(\d+)$/);
  return m ? Number(m[1]) : undefined;
};

function cut(t: string, m: RegExpMatchArray): string {
  return (t.slice(0, m.index) + ' ' + t.slice((m.index || 0) + m[0].length)).replace(/\s+/g, ' ').trim();
}

function to24(h: number, period: string | undefined): number {
  if (period) {
    if (/عصر|بعد|شب/.test(period)) {
      if (h < 12) return h + 12;
      if (h === 12 && /شب/.test(period)) return 0;
      return h;
    }
    if (/ظهر/.test(period)) return h >= 1 && h <= 4 ? h + 12 : h;
    return h; // صبح
  }
  return h >= 1 && h <= 6 ? h + 12 : h; // "ساعت ۴" in a study planner means 16:00
}

function fmtTime(h: number, m: number): string | undefined {
  if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseEntry(input: string, ctx: ParseContext): ParsedEntry {
  let t = normalize(input);
  const out: ParsedEntry = {
    raw: input,
    kind: 'item',
    dateKey: '',
    date: ctx.defaultDate,
    dayGiven: false,
    gradeGiven: false,
    detail: '',
    sourceKnown: false
  };
  let m: RegExpMatchArray | null;

  // ---- time range: «از ۱۶ تا ۱۸» / «۱۶:۳۰ تا ۱۸» ----
  let rangeMinutes: number | undefined;
  m = t.match(/((?:از|ساعت)\s*(?:ساعت\s*)?)?(\d{1,2})(?::(\d{2}))?\s*(?:تا|-|–)\s*(?:ساعت\s*)?(\d{1,2})(?::(\d{2}))?(?![\d:])/);
  if (m && (m[1] || m[3])) {
    const period = /عصر|بعد|شب/.test(t) ? 'عصر' : undefined;
    let h1 = Number(m[2]);
    let h2 = Number(m[4]);
    if (!m[3] && !m[5] && h1 <= 12 && h2 <= 12) {
      h1 = to24(h1, period);
      h2 = to24(h2, period);
      if (h2 <= h1) h2 = h1 < 12 ? h2 + 12 : h2;
    }
    const s1 = fmtTime(h1, Number(m[3] || 0));
    const s2 = fmtTime(h2 % 24, Number(m[5] || 0));
    if (s1 && s2) {
      out.start = s1;
      const x = h1 * 60 + Number(m[3] || 0);
      const y = h2 * 60 + Number(m[5] || 0);
      if (y > x) {
        rangeMinutes = y - x;
        out.end = s2;
      }
      t = cut(t, m);
    }
  }

  // ---- duration ----
  if (rangeMinutes) {
    out.minutes = rangeMinutes;
  } else {
    let mins: number | undefined;
    if ((m = t.match(/نیم[\u200c ]?ساعت/))) {
      mins = 30;
      t = cut(t, m);
    } else if ((m = t.match(/(\d+(?:[.٫]\d+)?|یک|دو|سه|چهار|پنج|شش|هفت|هشت)\s*ساعت(?:\s*و\s*(نیم|ربع|(\d+)\s*دقیقه))?/))) {
      const base = /\d/.test(m[1]) ? parseFloat(m[1].replace('٫', '.')) : WORD_NUM[m[1]];
      let extra = 0;
      if (m[2] === 'نیم') extra = 30;
      else if (m[2] === 'ربع') extra = 15;
      else if (m[3]) extra = Number(m[3]);
      mins = Math.round(base * 60 + extra);
      t = cut(t, m);
    } else if ((m = t.match(/(\d+)\s*(?:دقیقه|دقیقه‌ای|دقی|دق)(?![آ-ی])/))) {
      mins = Number(m[1]);
      t = cut(t, m);
    }
    if (mins && mins >= 5 && mins <= 480) out.minutes = mins;
  }

  // ---- pinned start time ----
  if (!out.start) {
    if ((m = t.match(/(?:از\s+)?(?:ساعت\s*)?(\d{1,2}):(\d{2})\s*(صبح|ظهر|بعد[\u200c ]?از[\u200c ]?ظهر|عصر|شب)?/))) {
      const h = Number(m[1]);
      out.start = fmtTime((m[3] ? to24(h, m[3]) : h) % 24, Number(m[2]));
      t = cut(t, m);
    } else if ((m = t.match(/(?:از\s+)?ساعت\s*(\d{1,2})(?:\s*و\s*(نیم|ربع))?\s*(صبح|ظهر|بعد[\u200c ]?از[\u200c ]?ظهر|عصر|شب)?/))) {
      const h = to24(Number(m[1]), m[3]);
      const mi = m[2] === 'نیم' ? 30 : m[2] === 'ربع' ? 15 : 0;
      out.start = fmtTime(h % 24, mi);
      t = cut(t, m);
    }
  }

  // ---- day ----
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const setDay = (d: Date) => {
    out.date = d;
    out.dayGiven = true;
  };
  let weekShift = 0;
  if ((m = t.match(/(^|\s)هفته[\u200c ]?(بعد|آینده)(?=\s|$)/))) {
    weekShift = 7;
    t = cut(t, m);
  }
  if ((m = t.match(/(^|\s)پس[\u200c ]?فردا(?=\s|$)/))) {
    setDay(addDays(today, 2));
    t = cut(t, m);
  } else if ((m = t.match(/(^|\s)فردا(?=\s|$)/))) {
    setDay(addDays(today, 1));
    t = cut(t, m);
  } else if ((m = t.match(/(^|\s)امروز(?=\s|$)/))) {
    setDay(today);
    t = cut(t, m);
  } else if ((m = t.match(/(\d{3,4})\/(\d{1,2})\/(\d{1,2})/))) {
    setDay(dateFromJalali({ jy: Number(m[1]), jm: Number(m[2]), jd: Number(m[3]) }));
    t = cut(t, m);
  } else {
    const monthRe = new RegExp('(\\d{1,2})\\s*(' + PERSIAN_MONTH_NAMES.join('|') + ')(?![\\u0600-\\u06FF])');
    let found = false;
    if ((m = t.match(monthRe))) {
      const jt = jalaliOfDate(today);
      let d = dateFromJalali({ jy: jt.jy, jm: PERSIAN_MONTH_NAMES.indexOf(m[2]) + 1, jd: Number(m[1]) });
      if (d < today) d = dateFromJalali({ jy: jt.jy + 1, jm: PERSIAN_MONTH_NAMES.indexOf(m[2]) + 1, jd: Number(m[1]) });
      setDay(d);
      t = cut(t, m);
      found = true;
    }
    if (!found) {
      for (const w of WEEKDAYS) {
        const wm = t.match(w.re);
        if (wm) {
          const diff = (w.js - today.getDay() + 7) % 7;
          setDay(addDays(today, diff));
          t = cut(t, wm);
          break;
        }
      }
    }
  }
  if (weekShift) setDay(addDays(out.dayGiven ? out.date : today, weekShift));
  out.dateKey = dateKeyOf(out.date);

  // ---- interruption (lunch, prayer ...) ----
  const restHit = REST_WORDS.find((r) => r.re.test(t));
  const bases = Array.from(new Set(ctx.subjects.map((s) => stripNum(s.n))));
  const aliasKeys = Object.keys(ALIASES);
  const subjectWordInText = bases.some((b) => t.includes(b)) || aliasKeys.some((a) => new RegExp('(^|\\s)' + a + '(?=\\s|$)').test(t));
  if (restHit && !subjectWordInText) {
    out.kind = 'rest';
    out.label = restHit.label;
    out.icon = restHit.icon;
    if (!out.start) out.error = 'ساعت را هم بنویس، مثلا «ناهار از ۱۳ تا ۱۴»';
    else if (!out.end) {
      const a = Number(out.start.slice(0, 2)) * 60 + Number(out.start.slice(3));
      const mins = out.minutes || 45;
      if (a + mins >= 1440) out.error = 'پایان باید قبل از نیمه‌شب باشد';
      else {
        out.end = minToTime(a + mins);
        out.minutes = mins;
      }
    }
    return out;
  }

  // ---- source (book) ----
  const known = Object.keys(ctx.sourceColors).sort((a, b) => b.length - a.length);
  const knownHit = known.find((k) => normalize(k) && t.includes(normalize(k)));
  if (knownHit) {
    out.source = knownHit;
    out.sourceKnown = true;
    t = t.replace(normalize(knownHit), ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/(^|\s)(?:از|با)\s*(?:کتاب|منبع)?(?=\s|$)/, ' ').replace(/(^|\s)(?:کتاب|منبع)(?=\s|$)/, ' ');
  } else if ((m = t.match(/[«"“]([^»"”]+)[»"”]/))) {
    out.source = m[1].trim();
    t = cut(t, m);
  } else if ((m = t.match(/@(\S+)/))) {
    out.source = m[1].trim();
    t = cut(t, m);
  } else if ((m = t.match(/(?:^|\s)(?:از\s+)?(?:کتاب|منبع)\s+(\S+)/))) {
    out.source = m[1];
    t = cut(t, m);
  }

  // ---- grade ----
  for (const g of GRADE_WORDS) {
    const gm = t.match(g.re);
    if (gm) {
      out.grade = g.g;
      out.gradeGiven = true;
      t = cut(t, gm);
      break;
    }
  }
  if (!out.grade && (m = t.match(/(?:پایه|کلاس)\s*(10|11|12)/))) {
    out.grade = GRADE_BY_NUM[Number(m[1]) - 9];
    out.gradeGiven = true;
    t = cut(t, m);
  }

  // ---- subject ----
  const words: { word: string; base: string }[] = [];
  bases.forEach((b) => words.push({ word: b, base: b }));
  aliasKeys.forEach((a) => {
    const target = ALIASES[a];
    const base = bases.find((b) => b === target) || bases.find((b) => b === stripNum(target));
    if (base) words.push({ word: a, base });
  });
  words.sort((a, b) => b.word.length - a.word.length);
  let baseHit: string | undefined;
  let num: number | undefined;
  for (const w of words) {
    const re = new RegExp('(^|\\s)' + escapeRe(w.word).replace(/\u200c/g, '[\\u200c ]?') + '(?:\\s*(\\d)|\\s+(اول|دوم|سوم))?(?=\\s|$)');
    const sm = t.match(re);
    if (sm) {
      baseHit = w.base;
      if (sm[2]) num = Number(sm[2]);
      else if (sm[3]) num = ORD[sm[3]];
      // don't swallow a following number that belongs to the detail (e.g. «زیست فصل ۳» is fine, «فیزیک ۳» is the book)
      t = (t.slice(0, sm.index) + ' ' + t.slice((sm.index || 0) + sm[0].length)).replace(/\s+/g, ' ').trim();
      break;
    }
  }
  if (baseHit) {
    t = t.replace(/(^|\s)ریاضی(?=\s|$)/, ' ').replace(/\s+/g, ' ').trim();
    const variants = ctx.subjects.filter((s) => stripNum(s.n) === baseHit);
    const numbered = variants.some((v) => numOfName(v.n) !== undefined);
    let grade = out.grade;
    if (numbered) {
      if (num && GRADE_BY_NUM[num] && !out.gradeGiven) grade = GRADE_BY_NUM[num];
      const wantNum = num || (grade ? NUM_BY_GRADE[grade] : undefined);
      const exact = wantNum ? variants.find((v) => numOfName(v.n) === wantNum) : undefined;
      const pick = exact || variants.find((v) => grade && v.grades.includes(grade)) || variants[variants.length - 1];
      out.subject = pick.n;
      if (!grade) grade = pick.grades[pick.grades.length - 1];
    } else {
      out.subject = variants[0].n;
      if (num) t = (t + ' ' + num).trim(); // a number after a plain subject is a detail («ادبیات ۲» = درس ۲)
      if (!grade) grade = ctx.defaultGrade || 'دوازدهم';
    }
    if (grade && !out.grade) out.grade = grade;
    if (out.grade && out.subject) {
      const def = ctx.subjects.find((s) => s.n === out.subject);
      if (def && !def.grades.includes(out.grade)) out.grade = def.grades[def.grades.length - 1];
    }
  } else {
    out.grade = out.grade || ctx.defaultGrade || 'دوازدهم';
  }

  // ---- what is left is the topic ----
  out.detail = toFa(
    t
      .replace(/[!؟?]+/g, ' ')
      .replace(/^(?:(?:مبحث|درس|برای|در|از|با|رو|را|تا)\s+)+/, '')
      .replace(/(?:\s+(?:برای|در|از|با|رو|را|تا))+$/, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
  if (!out.subject && out.start && out.end) {
    // a timed thing that is not a lesson (dentist, family visit ...) = a custom interruption
    out.kind = 'rest';
    out.label = out.detail || 'وقفه';
    out.icon = '📌';
    return out;
  }
  if (!out.subject) out.error = 'اسم درس را پیدا نکردم';
  return out;
}

export function splitLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}
