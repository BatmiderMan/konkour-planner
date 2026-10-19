import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// "Focus Studio": every option of the full-screen timer view. Stored on this device only.
// ---------------------------------------------------------------------------

export type ClockStyle = 'dial' | 'ring' | 'digits';
export type ClockFont = 'bold' | 'medium' | 'light' | 'thin' | 'mono' | 'serif';
export type ThemeId = 'aurora' | 'midnight' | 'oled' | 'sunset' | 'forest' | 'ocean' | 'dusk' | 'graphite';
export type AccentId = 'auto' | 'blue' | 'teal' | 'rose' | 'gold' | 'violet' | 'mint' | 'silver';
export type FxKind = 'none' | 'stars' | 'particles' | 'fireflies' | 'rain' | 'snow';
export type LayoutId = 'auto' | 'center' | 'split';

export interface Look {
  style: ClockStyle;
  font: ClockFont;
  digits: 'fa' | 'en';
  size: number; // % of the default clock size
  theme: ThemeId;
  accent: AccentId;
  glow: boolean; // the breathing colour glow behind everything
  fx: FxKind;
  fxLevel: 1 | 2 | 3;
  layout: LayoutId;
  showHeader: boolean; // subject + detail
  showStats: boolean; // start / plan / studied line
  showTools: boolean; // tick panel + music
  showClock: boolean; // wall clock + date at the top
  showPercent: boolean;
  showQuote: boolean;
  calmAfter: number; // seconds of quiet before the controls fade (0 = never)
  dimCalm: boolean; // also dim the clock while calm (night use)
  autoFs: boolean; // enter browser full-screen when the full view opens
}

export const DEFAULT_LOOK: Look = {
  style: 'dial', font: 'bold', digits: 'fa', size: 100,
  theme: 'aurora', accent: 'auto', glow: true,
  fx: 'none', fxLevel: 2, layout: 'auto',
  showHeader: true, showStats: true, showTools: true, showClock: false, showPercent: false, showQuote: false,
  calmAfter: 7, dimCalm: false, autoFs: false
};

export const STYLES: Array<{ id: ClockStyle; label: string; hint: string }> = [
  { id: 'dial', label: 'کلاسیک', hint: 'حلقه با نشانه‌ها' },
  { id: 'ring', label: 'حلقه‌ی ساده', hint: 'یک خط باریک' },
  { id: 'digits', label: 'اعداد بزرگ', hint: 'با نوار پیشرفت' }
];
export const FONTS: Array<{ id: ClockFont; label: string }> = [
  { id: 'bold', label: 'ضخیم' },
  { id: 'medium', label: 'متوسط' },
  { id: 'light', label: 'سبک' },
  { id: 'thin', label: 'باریک' },
  { id: 'mono', label: 'مونو' },
  { id: 'serif', label: 'سریف' }
];
export const THEMES: Array<{ id: ThemeId; label: string; swatch: string }> = [
  { id: 'aurora', label: 'شفق', swatch: 'linear-gradient(160deg,#2a3d9c,#0d1442 60%,#0b6b66)' },
  { id: 'midnight', label: 'نیمه‌شب', swatch: 'linear-gradient(160deg,#141c52,#05071a)' },
  { id: 'oled', label: 'مشکی', swatch: '#000' },
  { id: 'sunset', label: 'غروب', swatch: 'linear-gradient(160deg,#2a1240,#7a2e4a 60%,#d9743f)' },
  { id: 'forest', label: 'جنگل', swatch: 'linear-gradient(160deg,#0f4a3a,#04140f)' },
  { id: 'ocean', label: 'اقیانوس', swatch: 'linear-gradient(160deg,#0b5a85,#031425)' },
  { id: 'dusk', label: 'گرگ‌ومیش', swatch: 'linear-gradient(160deg,#3b2a7a,#0b0620)' },
  { id: 'graphite', label: 'گرافیت', swatch: 'linear-gradient(160deg,#2b2e36,#0b0c10)' }
];
export const ACCENTS: Array<{ id: AccentId; label: string; a: string; b: string }> = [
  { id: 'auto', label: 'رنگ درس', a: '', b: '' },
  { id: 'blue', label: 'آبی', a: '#6b8cff', b: '#7be0ff' },
  { id: 'teal', label: 'فیروزه‌ای', a: '#35e0c4', b: '#6b8cff' },
  { id: 'rose', label: 'گل‌بهی', a: '#ff7aa8', b: '#ffb199' },
  { id: 'gold', label: 'طلایی', a: '#f5c26b', b: '#ffe3a3' },
  { id: 'violet', label: 'بنفش', a: '#b18cff', b: '#ff8ce0' },
  { id: 'mint', label: 'نعنایی', a: '#8ff0b4', b: '#35e0c4' },
  { id: 'silver', label: 'نقره‌ای', a: '#e8ecff', b: '#aeb9ff' }
];
export const FX: Array<{ id: FxKind; label: string; icon: string }> = [
  { id: 'none', label: 'بدون افکت', icon: '∅' },
  { id: 'stars', label: 'ستاره‌ها', icon: '✦' },
  { id: 'particles', label: 'ذرات نور', icon: '◌' },
  { id: 'fireflies', label: 'کرم شب‌تاب', icon: '✺' },
  { id: 'rain', label: 'باران', icon: '☂' },
  { id: 'snow', label: 'برف', icon: '❅' }
];
export const CALM_CHOICES: Array<{ v: number; label: string }> = [
  { v: 0, label: 'هرگز' }, { v: 3, label: '۳ ثانیه' }, { v: 7, label: '۷ ثانیه' }, { v: 15, label: '۱۵ ثانیه' }, { v: 30, label: '۳۰ ثانیه' }
];

export interface Preset { id: string; label: string; emoji: string; look: Partial<Look> }
export const PRESETS: Preset[] = [
  { id: 'classic', label: 'کلاسیک', emoji: '◔', look: {} },
  { id: 'night', label: 'شب‌زنده‌دار', emoji: '🌙', look: { style: 'digits', font: 'light', theme: 'oled', accent: 'silver', glow: false, fx: 'stars', fxLevel: 2, showStats: false, showTools: false, showClock: true, calmAfter: 3, dimCalm: true } },
  { id: 'zen', label: 'ذن', emoji: '🍃', look: { style: 'ring', font: 'thin', theme: 'midnight', accent: 'mint', fx: 'fireflies', fxLevel: 2, showStats: false, showTools: false, showQuote: true, calmAfter: 3 } },
  { id: 'rain', label: 'بارانی', emoji: '🌧', look: { font: 'medium', theme: 'ocean', accent: 'teal', fx: 'rain', fxLevel: 2, showClock: true } },
  { id: 'sunrise', label: 'طلوع', emoji: '🌅', look: { font: 'serif', theme: 'sunset', accent: 'gold', fx: 'particles', fxLevel: 2, showQuote: true, showPercent: true } },
  { id: 'pro', label: 'حرفه‌ای', emoji: '⌘', look: { style: 'digits', font: 'mono', digits: 'en', theme: 'graphite', accent: 'blue', glow: false, showClock: true, showPercent: true, calmAfter: 15 } }
];

// ---------------------------------------------------------------- store
const KEY = 'planex_timer_look_v1';
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

function sanitize(m: any): Look {
  const d = DEFAULT_LOOK;
  return {
    style: pick(m?.style, STYLES.map((x) => x.id), d.style),
    font: pick(m?.font, FONTS.map((x) => x.id), d.font),
    digits: m?.digits === 'en' ? 'en' : 'fa',
    size: typeof m?.size === 'number' ? Math.min(130, Math.max(60, Math.round(m.size))) : d.size,
    theme: pick(m?.theme, THEMES.map((x) => x.id), d.theme),
    accent: pick(m?.accent, ACCENTS.map((x) => x.id), d.accent),
    glow: bool(m?.glow, d.glow),
    fx: pick(m?.fx, FX.map((x) => x.id), d.fx),
    fxLevel: m?.fxLevel === 1 || m?.fxLevel === 3 ? m.fxLevel : 2,
    layout: pick(m?.layout, ['auto', 'center', 'split'] as const, d.layout),
    showHeader: bool(m?.showHeader, d.showHeader), showStats: bool(m?.showStats, d.showStats), showTools: bool(m?.showTools, d.showTools),
    showClock: bool(m?.showClock, d.showClock), showPercent: bool(m?.showPercent, d.showPercent), showQuote: bool(m?.showQuote, d.showQuote),
    calmAfter: typeof m?.calmAfter === 'number' && CALM_CHOICES.some((c) => c.v === m.calmAfter) ? m.calmAfter : d.calmAfter,
    dimCalm: bool(m?.dimCalm, d.dimCalm), autoFs: bool(m?.autoFs, d.autoFs)
  };
}
function load(): Look {
  try { const raw = localStorage.getItem(KEY); if (raw) return sanitize(JSON.parse(raw)); } catch { /* ignore */ }
  return { ...DEFAULT_LOOK };
}

let look: Look = load();
const listeners = new Set<() => void>();
function commit(next: Look) {
  look = next;
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
export const setLook = (patch: Partial<Look>) => commit(sanitize({ ...look, ...patch }));
export const resetLook = () => commit({ ...DEFAULT_LOOK });
export const applyPreset = (id: string) => {
  const p = PRESETS.find((x) => x.id === id);
  if (p) commit(sanitize({ ...DEFAULT_LOOK, ...p.look }));
};
/** which preset (if any) the current look equals — to highlight it */
export const activePreset = (l: Look): string | null => {
  for (const p of PRESETS) {
    const full = sanitize({ ...DEFAULT_LOOK, ...p.look });
    if (JSON.stringify(full) === JSON.stringify(l)) return p.id;
  }
  return null;
};
export function useLook(): Look {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => look, () => look);
}

// ---------------------------------------------------------------- little sentences for the quiet line
const FOCUS_QUOTES = [
  'همین یک جلسه را خوب تمام کن؛ بقیه‌اش راحت‌تر می‌شود.',
  'تمرکز یعنی همین حالا، همین صفحه، همین مسئله.',
  'سخت‌ترین قسمت شروع بود؛ آن را رد کرده‌ای.',
  'کار کوچک و پیوسته، از کار بزرگ و گاه‌به‌گاه ارزشمندتر است.',
  'هر دقیقه‌ای که الان درس می‌خوانی، فردا یک دقیقه آرامش است.',
  'اشتباه کردن بخشی از یاد گرفتن است؛ ادامه بده.',
  'آهسته، ولی بی‌وقفه.',
  'نفس عمیق، شانه‌ها پایین، ادامه بده.',
  'گوشی را کنار بگذار؛ ذهنت را به خودت بده.',
  'پیشرفت یعنی هر روز کمی بهتر از دیروز.'
];
const REST_QUOTES = [
  'چشم‌هایت را از صفحه بردار و کمی دورتر را نگاه کن.',
  'یک لیوان آب بنوش.',
  'شانه‌ها و گردنت را شل کن.',
  'چند نفس عمیق بکش.',
  'کمی راه برو؛ ذهنت سبک می‌شود.'
];
export const OVER_QUOTE = 'از برنامه جلوتری؛ هر وقت خواستی تمامش کن.';
/** changes every ~100 seconds */
export function quoteFor(nowMs: number, rest: boolean): string {
  const list = rest ? REST_QUOTES : FOCUS_QUOTES;
  return list[Math.floor(nowMs / 100000) % list.length];
}
