/**
 * Standard Jalali (Shamsi) Calendar Conversion Algorithms
 * Provides bidirectional Gregorian <-> Jalali conversions, day of week,
 * month length calculations, leap year checks, and day arithmetic.
 */

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export const PERSIAN_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند'
];

export const PERSIAN_WEEK_DAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه'
];

/**
 * Converts Gregorian date to Jalali (Shamsi)
 */
export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm: number;
  let jd: number;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return { jy, jm, jd };
}

/**
 * Converts Jalali (Shamsi) date to Gregorian
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  let gy: number;
  if (jy > 979) {
    gy = 1600;
    jy -= 979;
  } else {
    gy = 621;
  }

  let days = (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;

  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }

  gy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm: number;
  for (gm = 0; gm < 13 && days >= sal_a[gm]; gm++) {
    days -= sal_a[gm];
  }
  let gd = days + 1;

  return { gy, gm, gd };
}

export function isJalaliLeapYear(jy: number): boolean {
  const rem = jy % 33;
  return [1, 5, 9, 13, 17, 22, 26, 30].includes(rem);
}

export function getDaysInJalaliMonth(jy: number, jm: number): number {
  if (jm >= 1 && jm <= 6) return 31;
  if (jm >= 7 && jm <= 11) return 30;
  if (jm === 12) return isJalaliLeapYear(jy) ? 30 : 29;
  return 30;
}

export function getTodayJalali(): JalaliDate {
  const now = new Date();
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function formatJalaliDate(j: JalaliDate): string {
  const m = String(j.jm).padStart(2, '0');
  const d = String(j.jd).padStart(2, '0');
  return `${j.jy}/${m}/${d}`;
}

export function parseJalaliDate(str: string): JalaliDate | null {
  if (!str) return null;
  const western = str.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const parts = western.split(/[\/\-.]/).map((p) => parseInt(p.trim(), 10));
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    let [jy, jm, jd] = parts;
    if (jy < 100) jy += 1400;
    if (jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31) {
      return { jy, jm, jd };
    }
  }
  return null;
}

export function addDaysToJalali(date: JalaliDate, daysToAdd: number): JalaliDate {
  let { jy, jm, jd } = date;
  let totalDays = jd + daysToAdd;

  while (totalDays > getDaysInJalaliMonth(jy, jm)) {
    totalDays -= getDaysInJalaliMonth(jy, jm);
    jm++;
    if (jm > 12) {
      jm = 1;
      jy++;
    }
  }

  while (totalDays < 1) {
    jm--;
    if (jm < 1) {
      jm = 12;
      jy--;
    }
    totalDays += getDaysInJalaliMonth(jy, jm);
  }

  return { jy, jm, jd: totalDays };
}

export function getJalaliDayOfWeek(date: JalaliDate): string {
  try {
    const g = jalaliToGregorian(date.jy, date.jm, date.jd);
    const d = new Date(g.gy, g.gm - 1, g.gd);
    const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday
    const map = [1, 2, 3, 4, 5, 6, 0];
    return PERSIAN_WEEK_DAYS[map[dayOfWeek]];
  } catch (e) {
    return 'شنبه';
  }
}

export function getNextDayOfWeekName(currentDayName: string): string {
  const cleaned = currentDayName.trim();
  const idx = PERSIAN_WEEK_DAYS.indexOf(cleaned);
  if (idx !== -1) {
    return PERSIAN_WEEK_DAYS[(idx + 1) % PERSIAN_WEEK_DAYS.length];
  }
  return '';
}

export function compareJalaliStrings(d1: string, d2: string): number {
  const p1 = parseJalaliDate(d1);
  const p2 = parseJalaliDate(d2);
  if (!p1 && !p2) return 0;
  if (!p1) return -1;
  if (!p2) return 1;

  if (p1.jy !== p2.jy) return p1.jy - p2.jy;
  if (p1.jm !== p2.jm) return p1.jm - p2.jm;
  return p1.jd - p2.jd;
}
