import React from 'react';
import { Bell, BellOff, ChevronDown, Volume2 } from 'lucide-react';
import { toPersianDigits } from '../../utils';
import { TICK_MAX, TICK_MIN, TICK_PRESETS, TICK_STYLES, clampSeconds, playTick, secondsLabel, setTickPrefs, unlockAudio, useTickPrefs } from '../../tickSound';

interface TickPanelProps {
  running: boolean;
  tickIdx: number; // ticks already passed
  nextIn: number; // seconds to the next tick
  ticksLeft: number | null; // ticks that still fit into the planned time (null: no planned time)
}

export const TickPanel: React.FC<TickPanelProps> = ({ running, tickIdx, nextIn, ticksLeft }) => {
  const tick = useTickPrefs();
  const [open, setOpen] = React.useState(false);
  const [secText, setSecText] = React.useState(String(tick.seconds));
  React.useEffect(() => { setSecText(String(tick.seconds)); }, [tick.seconds]);

  return (
    <div className={'tm-tick' + (tick.on ? ' on' : '')}>
      <div className="tm-tick-head">
        <button
          type="button"
          className="tm-switch"
          role="switch"
          aria-checked={tick.on}
          aria-label="صدای تیک"
          onClick={() => { unlockAudio(); setTickPrefs({ on: !tick.on }); if (!tick.on) setOpen(true); }}
        ><i /></button>
        <button type="button" className="tm-tick-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          {tick.on ? <Bell size={17} /> : <BellOff size={17} />}
          <b>ریتم تیک</b>
          <span>{tick.on ? `هر ${toPersianDigits(secondsLabel(tick.seconds))}` : 'خاموش'}</span>
          <ChevronDown size={16} className={'tm-chev' + (open ? ' up' : '')} />
        </button>
      </div>

      {tick.on && (
        <div className="tm-tick-stats">
          <div><b>{toPersianDigits(tickIdx)}</b><span>تیک گذشته</span></div>
          <div><b>{ticksLeft === null ? '∞' : toPersianDigits(ticksLeft)}</b><span>تیک مانده</span></div>
          <div className="nx"><b>{running ? toPersianDigits(nextIn) : '—'}</b><span>ثانیه تا تیک</span></div>
        </div>
      )}

      {open && (
        <div className="tm-tick-panel">
          <span className="tm-lbl">فاصله‌ی بین دو تیک</span>
          <div className="tm-chips">
            {TICK_PRESETS.map((s) => (
              <button key={s} type="button" className={tick.seconds === s ? 'on' : ''} onClick={() => setTickPrefs({ seconds: s })}>{toPersianDigits(secondsLabel(s))}</button>
            ))}
          </div>
          <label className="tm-inline">
            <span>یا خودت بنویس (ثانیه)</span>
            <input
              type="number" inputMode="numeric" min={TICK_MIN} max={TICK_MAX} value={secText}
              onChange={(e) => { setSecText(e.target.value); const n = parseInt(e.target.value, 10); if (n >= TICK_MIN) setTickPrefs({ seconds: clampSeconds(n) }); }}
              onBlur={() => setSecText(String(tick.seconds))}
            />
          </label>
          <span className="tm-lbl">صدا</span>
          <div className="tm-chips">
            {TICK_STYLES.map((s) => (
              <button key={s.id} type="button" className={tick.style === s.id ? 'on' : ''} onClick={() => { setTickPrefs({ style: s.id }); unlockAudio(); playTick(s.id); }}>{s.label}</button>
            ))}
          </div>
          <label className="tm-vol">
            <Volume2 size={16} />
            <input
              type="range" min="0.1" max="1" step="0.05" value={tick.volume}
              onChange={(e) => setTickPrefs({ volume: parseFloat(e.target.value) })}
              onPointerUp={() => { unlockAudio(); playTick(tick.style); }}
              aria-label="بلندی صدا"
            />
            <span>{toPersianDigits(Math.round(tick.volume * 100))}٪</span>
          </label>
          <label className="tm-check"><input type="checkbox" checked={tick.vibrate} onChange={(e) => setTickPrefs({ vibrate: e.target.checked })} />با هر تیک گوشی هم بلرزد (اگر پشتیبانی کند)</label>
          <p className="tm-hint">
            {'برای آزمون: مثلاً «هر ۶۰ ثانیه» یعنی با هر تیک وقت یک سؤال تمام شده. زمان توقف‌ها حساب نمی‌شود و آخر وقت پلن، زنگ جداگانه می‌خورد.'}
          </p>
        </div>
      )}
    </div>
  );
};
