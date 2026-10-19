import React from 'react';
import { Coffee, Eye, Play } from 'lucide-react';
import { liveElapsedMs, liveKind, pauseLivePlan, resumeLivePlan, useLivePlan } from '../../livePlan';
import { playDone, playHeadsUp } from '../../tickSound';
import { haptic } from '../../focusBus';
import { toPersianDigits } from '../../utils';
import { getDeepPrefs, useDeepPrefs } from './deepFocus';
import { initialNudgeState, nextNudge, NudgeState } from './deepFocusRules';
import './focusGuard.css';

type Card = { kind: 'break' } | { kind: 'eye'; until: number } | { kind: 'rest'; until: number; done: boolean } | null;
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return toPersianDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); };

/**
 * Deep focus while a study session runs:
 *  • closing / reloading the tab asks first
 *  • optional break reminder every N minutes → pauses the session and runs a rest countdown
 *  • optional 20-20-20 eye-rest reminder
 * Mounted once in App; renders only its reminder cards.
 */
export const FocusGuard: React.FC = () => {
  const live = useLivePlan();
  const prefs = useDeepPrefs();
  const [card, setCard] = React.useState<Card>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const state = React.useRef<NudgeState | null>(null);
  const sessionKey = live ? `${live.dateKey}|${live.item.id}|${live.startedAtClock}|${liveKind(live)}` : '';
  const isFocus = !!live && liveKind(live) !== 'break';
  const running = !!live && live.running && isFocus;

  // 1) leaving the page while studying
  React.useEffect(() => {
    if (!running || !prefs.guardExit) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [running, prefs.guardExit]);

  // a new session: re-arm the reminders; a finished one: clear the cards
  React.useEffect(() => {
    state.current = live && isFocus ? initialNudgeState(liveElapsedMs(live, Date.now()), getDeepPrefs()) : null;
    if (!live) setCard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // 2) reminders
  React.useEffect(() => {
    if (!running || !live) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (!state.current) state.current = initialNudgeState(liveElapsedMs(live, t), getDeepPrefs());
      const r = nextNudge(liveElapsedMs(live, t), getDeepPrefs(), state.current);
      state.current = r.state;
      setCard((c) => {
        if (c && c.kind === 'break') return c; // keep the open reminder
        if (r.nudge === 'break') { playHeadsUp(); haptic([30, 60, 30] as any); return { kind: 'break' }; }
        if (r.nudge === 'eye' && !c) { playHeadsUp(); haptic(20); return { kind: 'eye', until: t + 20000 }; }
        return c;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, live]);

  // countdowns for the eye card and the rest card
  React.useEffect(() => {
    if (!card || card.kind === 'break') return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setCard((c) => {
        if (!c || c.kind === 'break') return c;
        if (c.kind === 'eye' && t >= c.until) return null;
        if (c.kind === 'rest' && !c.done && t >= c.until) { playDone(); haptic([40, 80, 40] as any); return { ...c, done: true }; }
        return c;
      });
    }, 500);
    return () => clearInterval(id);
  }, [card]);

  // the user resumed the timer by hand during the rest: drop the rest card
  React.useEffect(() => { if (card?.kind === 'rest' && live?.running) setCard(null); }, [card, live?.running]);

  if (!card || !live) return null;

  if (card.kind === 'break') {
    const len = getDeepPrefs().breakLen;
    return (
      <div className="fg" role="alertdialog" aria-label="یادآوری استراحت">
        <span className="fg-ic"><Coffee size={20} /></span>
        <div className="fg-txt"><b>وقت یک استراحت کوتاه است</b><span>{toPersianDigits(getDeepPrefs().breakEvery)} دقیقه مطالعه‌ی پیوسته؛ کمی آب بخور و کش و قوس برو.</span></div>
        <button type="button" className="fg-go" onClick={() => { haptic(14); pauseLivePlan(); setCard({ kind: 'rest', until: Date.now() + len * 60000, done: false }); }}>استراحت {toPersianDigits(len)} دقیقه‌ای</button>
        <button type="button" className="fg-ghost" onClick={() => { state.current = state.current ? { ...state.current, nextBreakAt: liveElapsedMs(live, Date.now()) + 10 * 60000 } : state.current; setCard(null); }}>۱۰ دقیقه بعد</button>
      </div>
    );
  }
  if (card.kind === 'eye') {
    return (
      <div className="fg eye" role="status" aria-live="polite">
        <span className="fg-ic"><Eye size={20} /></span>
        <div className="fg-txt"><b>استراحت چشم</b><span>۲۰ ثانیه به چیزی دور نگاه کن · {mmss(card.until - now)}</span></div>
        <button type="button" className="fg-ghost" onClick={() => setCard(null)}>باشه</button>
        <i className="fg-bar" style={{ animationDuration: '20s' }} />
      </div>
    );
  }
  return (
    <div className="fg rest" role="status" aria-live="polite">
      <span className="fg-ic"><Coffee size={20} /></span>
      <div className="fg-txt">
        <b>{card.done ? 'استراحت تمام شد' : `در حال استراحت · ${mmss(card.until - now)}`}</b>
        <span>{card.done ? 'آماده‌ای برگردی؟' : 'تایمر مطالعه متوقف است و ادامه می‌یابد.'}</span>
      </div>
      <button type="button" className="fg-go" onClick={() => { haptic(14); setCard(null); resumeLivePlan(); }}><Play size={15} /> ادامه‌ی مطالعه</button>
    </div>
  );
};
