import { toPersianDigits } from '../utils';

/**
 * ONE place that turns seconds into clock text. Every clock in the app (timer, pill, island, phone button,
 * floating window, test sheet, vault review, tab title) goes through here, so they can never disagree.
 */
export interface ClockText {
  text: string;      // "05:09" · "1:05:09" · with secs=false: "5" · "1:05"
  minutesOnly: boolean; // true when the text is a bare minute count (the caller may add a unit label)
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * @param sec     whole seconds (negative is treated as 0)
 * @param secs    show the seconds part. When off the value is shown in minutes: «۴۲» or «۱:۰۵»
 * @param round   how a minutes-only value rounds: 'ceil' for a countdown (never shows 0 while time is left), 'floor' for count-up
 */
export function clockText(sec: number, secs = true, round: 'ceil' | 'floor' = 'floor'): ClockText {
  const s = Math.max(0, Math.floor(sec));
  if (secs) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return { text: h > 0 ? `${h}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`, minutesOnly: false };
  }
  const total = round === 'ceil' ? Math.ceil(s / 60) : Math.floor(s / 60);
  const h = Math.floor(total / 60), m = total % 60;
  return h > 0 ? { text: `${h}:${two(m)}`, minutesOnly: false } : { text: String(m), minutesOnly: true };
}

export const digitsOf = (text: string, en: boolean): string => (en ? text : toPersianDigits(text));

/** plain string for places that cannot render the component (tab title, aria-label) */
export const clockString = (sec: number, opts: { en?: boolean; secs?: boolean; round?: 'ceil' | 'floor'; over?: boolean } = {}): string =>
  (opts.over ? '+' : '') + digitsOf(clockText(sec, opts.secs ?? true, opts.round ?? 'floor').text, !!opts.en);

/** milliseconds → clock string (test sheet clocks keep their ms inputs) */
export const clockStringMs = (ms: number, opts: { en?: boolean; secs?: boolean } = {}) => clockString(ms / 1000, opts);
