import { DayData, StudyBlock, SleepData } from './types';

export const ORDINALS = [
  'اول', 'دوم', 'سوم', 'چهارم', 'پنجم',
  'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم',
  'یازدهم', 'دوازدهم', 'سیزدهم', 'چهاردهم', 'پانزدهم',
  'شانزدهم', 'هفدهم', 'هجدهم', 'نوزدهم', 'بیستم'
];

export const COLORS = [
  '#3e6690',
  '#3e8c86',
  '#4c9b78',
  '#7fb35c',
  '#d9a54b',
  '#d68c46',
  '#d97a52',
  '#cb6650',
  '#c15546',
  '#b14a42',
  '#4a6fa5',
  '#5b8e7d',
  '#8cb369',
  '#f4a261',
  '#e76f51',
  '#9d4edd',
  '#0077b6',
  '#0096c7',
  '#48cae4',
  '#52b788'
];

export function toPersianDigits(n: number | string): string {
  const map: Record<string, string> = {
    '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
    '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹'
  };
  return String(n).replace(/[0-9]/g, (d) => map[d] || d);
}

export function createEmptyBlock(): StudyBlock {
  return {
    lesson: '',
    subject: '',
    start: '',
    end: '',
    desc: '',
    study: false,
    cls: false,
    review: false,
    test: false,
    totalTests: '',
    wrong: '',
    blank: ''
  };
}

export const KEY_SAVED_SLEEP_TARGETS = 'konkour_saved_sleep_targets_v2';

export function getSavedSleepTargets(): { targetBedtime: string; targetWakeTime: string } {
  let targetBedtime = '23:00';
  let targetWakeTime = '06:00';
  try {
    const saved = localStorage.getItem(KEY_SAVED_SLEEP_TARGETS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.targetBedtime) targetBedtime = parsed.targetBedtime;
      if (parsed.targetWakeTime) targetWakeTime = parsed.targetWakeTime;
    }
  } catch (e) {}
  return { targetBedtime, targetWakeTime };
}

export function createDefaultSleepData(
  targetBedtime?: string,
  targetWakeTime?: string
): SleepData {
  const saved = getSavedSleepTargets();
  return {
    targetBedtime: targetBedtime || saved.targetBedtime || '23:00',
    targetWakeTime: targetWakeTime || saved.targetWakeTime || '06:00',
    actualBedtime: '',
    actualWakeTime: '',
    bedtimeCheckedIn: false,
    wakeCheckedIn: false,
    napMinutes: 0,
    notes: ''
  };
}

export function calculateTimeDiffMinutes(targetTime: string, actualTime: string): number {
  if (!targetTime || !actualTime) return 0;
  const t = targetTime.split(':').map(Number);
  const a = actualTime.split(':').map(Number);
  if (t.length !== 2 || a.length !== 2 || isNaN(t[0]) || isNaN(a[0])) return 0;
  return (a[0] * 60 + a[1]) - (t[0] * 60 + t[1]);
}

export function calculateGoalAdherence(
  targetBedtime: string,
  actualBedtime: string,
  targetWakeTime: string,
  actualWakeTime: string
): {
  wakeDiffMinutes: number;
  bedDiffMinutes: number;
  scorePercent: number;
  statusText: string;
  statusColor: string;
} {
  if (!actualBedtime && !actualWakeTime) {
    return {
      wakeDiffMinutes: 0,
      bedDiffMinutes: 0,
      scorePercent: 100,
      statusText: 'هدف‌گذاری ثبت شد؛ در انتظار ثبت ساعت خواب و بیداری ⏳',
      statusColor: '#0284c7'
    };
  }

  const wakeDiff = actualWakeTime ? calculateTimeDiffMinutes(targetWakeTime, actualWakeTime) : 0;
  const bedDiff = actualBedtime ? calculateTimeDiffMinutes(targetBedtime, actualBedtime) : 0;

  const absWake = Math.abs(wakeDiff);
  const absBed = Math.abs(bedDiff);

  // Score starts from 100 and loses points based on deviation
  let penalty = 0;
  if (actualWakeTime) {
    if (wakeDiff > 0) penalty += Math.min(50, wakeDiff * 1.5);
    else if (wakeDiff < 0) penalty += Math.min(10, Math.abs(wakeDiff) * 0.2);
  }

  if (actualBedtime && bedDiff > 0) {
    penalty += Math.min(40, bedDiff * 1.0);
  }

  const scorePercent = Math.max(20, Math.round(100 - penalty));

  let statusText = 'هدف‌گذاری عالی و تعهد کامل 🎯';
  let statusColor = '#16a34a';

  if (actualWakeTime && actualBedtime) {
    if (absWake <= 10 && absBed <= 15) {
      statusText = 'پایبندی فوق‌العاده به ساعت خواب و بیداری 🎯';
      statusColor = '#16a34a';
    } else if (absWake <= 30 && absBed <= 30) {
      statusText = 'نظم بسیار خوب با انحراف جزئی ⚡';
      statusColor = '#0284c7';
    } else if (wakeDiff > 30) {
      statusText = `${toPersianDigits(wakeDiff)} دقیقه تاخیر در بیداری نسبت به هدف ⚠️`;
      statusColor = '#d97706';
    } else {
      statusText = 'نیاز به تنظیم دقیق‌تر ساعت خواب و بیداری 💡';
      statusColor = '#dc2626';
    }
  } else if (actualWakeTime) {
    statusText = wakeDiff <= 15
      ? 'بیداری به موقع ثبت شد ✓'
      : `${toPersianDigits(wakeDiff)} دقیقه تاخیر در بیداری ⚠️`;
    statusColor = wakeDiff <= 15 ? '#16a34a' : '#d97706';
  } else {
    statusText = 'خواب دیشب ثبت شد؛ در انتظار بیداری صبح 🌙';
    statusColor = '#0284c7';
  }

  return {
    wakeDiffMinutes: wakeDiff,
    bedDiffMinutes: bedDiff,
    scorePercent,
    statusText,
    statusColor
  };
}

export function createDefaultDayData(): DayData {
  const saved = getSavedSleepTargets();
  return {
    day: '',
    date: '',
    favorite: false,
    blocks: [createEmptyBlock()],
    checklist: Array.from({ length: 5 }, () => ({ text: '', done: false })),
    routine: Array.from({ length: 6 }, () => ({ text: '', done: false })),
    transfer: Array.from({ length: 4 }, () => ({ text: '', done: false })),
    sleep: createDefaultSleepData(saved.targetBedtime, saved.targetWakeTime)
  };
}

export function calculateSleepDuration(bedtime: string, wakeTime: string, napMinutes = 0): {
  nightMinutes: number;
  totalMinutes: number;
  formattedNight: string;
  formattedTotal: string;
  hoursDecimal: number;
} {
  let nightMinutes = 0;

  if (bedtime && wakeTime) {
    const s = bedtime.split(':').map(Number);
    const e = wakeTime.split(':').map(Number);
    if (s.length === 2 && e.length === 2 && !isNaN(s[0]) && !isNaN(e[0])) {
      const startTotal = s[0] * 60 + s[1];
      const endTotal = e[0] * 60 + e[1];

      if (endTotal >= startTotal) {
        nightMinutes = endTotal - startTotal;
      } else {
        // Crossed midnight (e.g. 23:30 to 06:30)
        nightMinutes = (1440 - startTotal) + endTotal;
      }
    }
  }

  const validNap = Number(napMinutes) || 0;
  const totalMinutes = nightMinutes + validNap;

  const hN = Math.floor(nightMinutes / 60);
  const mN = nightMinutes % 60;
  const formattedNight = nightMinutes > 0
    ? `${toPersianDigits(hN)} ساعت و ${toPersianDigits(mN)} دقیقه`
    : 'در انتظار ثبت';

  const hT = Math.floor(totalMinutes / 60);
  const mT = totalMinutes % 60;
  const formattedTotal = totalMinutes > 0
    ? `${toPersianDigits(hT)} ساعت و ${toPersianDigits(mT)} دقیقه`
    : 'در انتظار ثبت';

  const hoursDecimal = Math.round((totalMinutes / 60) * 10) / 10;

  return {
    nightMinutes,
    totalMinutes,
    formattedNight,
    formattedTotal,
    hoursDecimal
  };
}

export function calculateTestPercentage(totalTests: number | string, wrong: number | string, blank: number | string): { percentage: string; correctCount: number } {
  const total = parseInt(String(totalTests), 10) || 0;
  const w = parseInt(String(wrong), 10) || 0;
  const b = parseInt(String(blank), 10) || 0;

  if (total === 0) {
    return { percentage: '۰٪', correctCount: 0 };
  }

  // Correct = Total - (Wrong + Blank)
  const c = Math.max(0, total - (w + b));

  // Konkour standard formula: ((3 * C - W) / (3 * Total)) * 100
  const score = ((3 * c - w) / (3 * total)) * 100;
  const rounded = Math.round(score * 10) / 10;
  const formatted = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);

  return {
    percentage: `${toPersianDigits(formatted)}٪`,
    correctCount: c
  };
}

export function calculateTotalStudyTime(blocks: StudyBlock[]): string {
  let totalMinutes = 0;
  for (const b of blocks) {
    if (b.start && b.end) {
      const s = b.start.split(':').map(Number);
      const e = b.end.split(':').map(Number);
      if (s.length === 2 && e.length === 2) {
        const mins = (e[0] * 60 + e[1]) - (s[0] * 60 + s[1]);
        if (mins > 0) totalMinutes += mins;
      }
    }
  }
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${toPersianDigits(h)}:${toPersianDigits(String(m).padStart(2, '0'))}`;
}
