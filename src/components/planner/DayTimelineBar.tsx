import React from 'react';
import { PlannerData } from '../../types';
import { REST_PRESETS, computeDayPlan, formatDuration, timeToMin } from '../../plannerSchedule';
import { toPersianDigits } from '../../utils';

interface DayTimelineBarProps {
  dateKey: string;
  data: PlannerData;
  onToggle: (dateKey: string, on: boolean) => void;
  onAddRest: (dateKey: string, r: { label: string; icon: string; start: string; end: string }) => void;
}

// The on/off switch for a day's timed schedule + a one-glance summary + quick "add interruption".
export const DayTimelineBar: React.FC<DayTimelineBarProps> = ({ dateKey, data, onToggle, onAddRest }) => {
  const on = !!data.timeline[dateKey];
  const items = data.items[dateKey] || [];
  const plan = on ? computeDayPlan(items, dateKey, data.schedule, data.dayRests[dateKey]) : null;
  const last = plan && plan.slots.length ? plan.slots.reduce((a, b) => (b.endMin > a.endMin ? b : a)) : null;
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState('');
  const [start, setStart] = React.useState('13:00');
  const [mins, setMins] = React.useState('45');
  const [icon, setIcon] = React.useState('☕');

  const saveCustom = () => {
    const a = timeToMin(start);
    const d = Math.round(Number(mins));
    if (a == null || !(d > 0) || a + d >= 1440) return;
    const e = a + d;
    onAddRest(dateKey, {
      label: label.trim() || 'استراحت',
      icon,
      start,
      end: String(Math.floor(e / 60)).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0')
    });
    setOpen(false);
    setLabel('');
  };

  return (
    <div className={'pl-tl-bar' + (on ? ' on' : '')}>
      <button
        type="button"
        className="pl-tl-switch"
        role="switch"
        aria-checked={on}
        title={on ? 'خاموش کردن زمان‌بندی این روز' : 'نمایش ساعت شروع و پایان هر درس این روز'}
        onClick={() => onToggle(dateKey, !on)}
      >
        <span className="pl-tl-knob" />
        <span className="pl-tl-text">⏱ زمان‌بندی</span>
      </button>
      {plan && (
        <div className="pl-tl-sum">
          <div>
            بازه‌ی روز: <b>{toPersianDigits(plan.windowStart)}</b> تا <b>{toPersianDigits(plan.windowEnd)}</b>
          </div>
          {last && !plan.overflowCount && (
            <div>
              پایان برنامه: <b>{toPersianDigits(last.end)}</b>
              {plan.freeMinutes > 0 && <> · {toPersianDigits(formatDuration(plan.freeMinutes))} آزاد</>}
            </div>
          )}
          {plan.overflowCount > 0 && (
            <div className="pl-tl-warn">⚠ {toPersianDigits(plan.overflowCount)} مورد بعد از ساعت پایان می‌افتد</div>
          )}
          {plan.clashCount > 0 && (
            <div className="pl-tl-warn">⚠ {toPersianDigits(plan.clashCount)} پارت با پارت قبلی یا یک وقفه تداخل دارد</div>
          )}
        </div>
      )}
      {on && (
        <div className="pl-rest-add">
          <button type="button" className="pl-rest-toggle" onClick={() => setOpen((v) => !v)}>＋ وقفه</button>
          {open && (
            <div className="pl-rest-pop">
              <div className="pl-rest-presets">
                {REST_PRESETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => { onAddRest(dateKey, p); setOpen(false); }}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
              <div className="pl-rest-custom">
                <input className="pl-input" placeholder="نام (مثلا: دندانپزشکی)" value={label} onChange={(e) => setLabel(e.target.value)} />
                <input className="pl-input pl-time-input" type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
                <input className="pl-input pl-dur-input" type="number" min={5} max={600} value={mins} onChange={(e) => setMins(e.target.value)} aria-label="دقیقه" />
                <button type="button" className="pl-save" onClick={saveCustom}>افزودن</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
