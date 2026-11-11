import React from 'react';
import { DigitAnim, FillStyle, ClockFont, SepStyle, useLook } from '../components/timer/timerLook';
import { clockText, digitsOf } from './clockFormat';
import { useNow } from './useNow';
import './clock.css';

/* ------------------------------------------------------------------ one digit
   Only the digit whose value changed does any work: React.memo skips the others, and the motion is
   transform + opacity only (GPU-composited), so a flip costs almost nothing even on a phone. */
const Digit = React.memo(({ ch, anim }: { ch: string; anim: DigitAnim }) => {
  const [st, setSt] = React.useState({ cur: ch, prev: null as string | null, n: 0 });
  if (st.cur !== ch) setSt({ cur: ch, prev: anim === 'none' ? null : st.cur, n: st.n + 1 });
  React.useEffect(() => {
    if (st.prev === null) return;
    const t = window.setTimeout(() => setSt((s) => (s.n === st.n ? { ...s, prev: null } : s)), 520);
    return () => window.clearTimeout(t);
  }, [st.n, st.prev]);
  return (
    <span className="ck-d" data-a={anim}>
      {st.prev !== null && <i key={'o' + st.n} className="o" aria-hidden="true">{st.prev}</i>}
      <i key={'c' + st.n} className={st.prev !== null ? 'c in' : 'c'}>{st.cur}</i>
    </span>
  );
});
Digit.displayName = 'ClockDigit';

const Sep = React.memo(({ kind }: { kind: SepStyle }) => (
  <span className="ck-s" data-k={kind} aria-hidden="true">
    {kind === 'dots' || kind === 'pulse' ? <><b /><b /></> : <i>:</i>}
  </span>
));
Sep.displayName = 'ClockSep';

export interface ClockProps {
  sec: number;                 // whole seconds to show
  over?: boolean;              // adds a «+» (overtime)
  running?: boolean;           // separators only animate while running
  secs?: boolean;              // false = minutes only
  round?: 'ceil' | 'floor';
  /** 'timer' = the big one (always follows the look) · 'mini' = small clocks (follow it unless «everywhere» is off) */
  scope?: 'timer' | 'mini';
  unit?: string;               // small label after a minutes-only value («دقیقه»)
  className?: string;
  style?: React.CSSProperties;
  /** force a look (used by previews) */
  force?: Partial<{ font: ClockFont; digits: 'fa' | 'en'; anim: DigitAnim; sep: SepStyle; fill: FillStyle }>;
}

/**
 * THE clock of the app. Drop it anywhere a time is shown:
 *   <Clock sec={754} running scope="mini" />
 * It applies the font, digit set, digit animation, separator and fill chosen in the Focus Studio / Settings.
 */
export const Clock: React.FC<ClockProps> = ({ sec, over, running = true, secs = true, round = 'floor', scope = 'mini', unit, className, style, force }) => {
  const look = useLook();
  const follow = scope === 'timer' || look.everywhere;
  const font = force?.font ?? (follow ? look.font : 'bold');
  const en = (force?.digits ?? (follow ? look.digits : 'fa')) === 'en';
  const anim = force?.anim ?? (follow ? look.anim : 'none');
  const sep = force?.sep ?? (follow ? look.sep : 'colon');
  const fill = force?.fill ?? (scope === 'timer' ? look.fill : 'solid');

  const { text, minutesOnly } = clockText(sec, secs, round);
  const full = digitsOf(text, en);
  const chars = Array.from(full);
  const n = chars.length;
  return (
    <span
      className={'ck' + (running ? ' run' : '') + (className ? ' ' + className : '')}
      data-font={font} data-fill={fill} data-en={en ? '1' : '0'} data-len={n + (over ? 1 : 0)}
      dir="ltr" role="text" aria-label={(over ? '+' : '') + full + (minutesOnly && unit ? ' ' + unit : '')} style={style}
    >
      {over && <span className="ck-p" aria-hidden="true">+</span>}
      {chars.map((c, i) => {
        const key = 'k' + (n - i); // keyed from the right: a digit keeps its identity when the length changes
        return c === ':' ? <Sep key={key} kind={sep} /> : <Digit key={key} ch={c} anim={anim} />;
      })}
      {minutesOnly && unit && <span className="ck-u" aria-hidden="true">{unit}</span>}
    </span>
  );
};

/* ------------------------------------------------------------------ the wall clock (top of the full view) */
export const WallClock: React.FC<{ className?: string }> = ({ className }) => {
  const look = useLook();
  const now = useNow(true, undefined, window);
  const d = new Date(now);
  let h = d.getHours();
  if (look.hour12) h = h % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const en = look.digits === 'en';
  const text = `${look.hour12 ? h : String(h).padStart(2, '0')}:${mm}${look.wallSecs ? ':' + ss : ''}`;
  let date = '';
  if (look.wallDate !== 'off') {
    try {
      date = new Intl.DateTimeFormat(look.wallDate === 'jalali' ? (en ? 'en-u-ca-persian' : 'fa-IR-u-ca-persian') : (en ? 'en-GB' : 'fa-IR-u-ca-gregory'),
        { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    } catch { /* old browser: no date line */ }
  }
  const ampm = look.hour12 ? (d.getHours() < 12 ? (en ? 'AM' : 'ق.ظ') : (en ? 'PM' : 'ب.ظ')) : '';
  return (
    <div className={'tm-topclock' + (className ? ' ' + className : '')} aria-hidden="true">
      <b className="ck-wall">
        {/* the wall clock rolls like the big one but is a plain string: it changes once a second at most */}
        <span className="ck" data-font={look.font} data-fill="solid" data-en={en ? '1' : '0'} dir="ltr">
          {Array.from(digitsOf(text, en)).map((c, i, a) => c === ':' ? <Sep key={'w' + (a.length - i)} kind={look.sep === 'dots' || look.sep === 'pulse' ? look.sep : 'colon'} /> : <Digit key={'w' + (a.length - i)} ch={c} anim={look.anim} />)}
        </span>
        {ampm && <small>{ampm}</small>}
      </b>
      {date && <span>{date}</span>}
    </div>
  );
};
