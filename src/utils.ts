import { DayData, StudyBlock } from './types';

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

export function createDefaultDayData(): DayData {
  return {
    day: '',
    date: '',
    favorite: false,
    blocks: [createEmptyBlock()],
    checklist: Array.from({ length: 5 }, () => ({ text: '', done: false })),
    routine: Array.from({ length: 6 }, () => ({ text: '', done: false })),
    transfer: Array.from({ length: 4 }, () => ({ text: '', done: false }))
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
