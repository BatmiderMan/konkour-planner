/** Small date/time helpers shared by the checker screens. */
import { jalaliOfDate } from '../plannerStore';
import { formatJalaliDate } from '../jalali';

export const dayOf = (at: number) => formatJalaliDate(jalaliOfDate(new Date(at)));
export const timeOf = (at: number) => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** «آزمون ۱۴۰۵/۰۷/۱۴ ۲۱:۳۰» — default name of a new sheet */
export const defaultTitle = (prefix: string, at = Date.now()) => `${prefix} ${dayOf(at)} ${timeOf(at)}`;
/** 3725000 ms → «۱:۰۲:۰۵» (no hour part below one hour) */
export function clock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}
