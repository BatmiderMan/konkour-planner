import React from 'react';
import { Play, X, Timer, Hourglass, ListChecks, Zap } from 'lucide-react';
import { PlannerItem } from '../../types';
import { gradeColor, loadPlannerData } from '../../plannerStore';
import { itemMinutes } from '../../plannerSchedule';
import { toPersianDigits } from '../../utils';
import { requestFreeStart, requestLiveStart } from '../../livePlan';
import { unlockAudio } from '../../tickSound';

const LESSONS = ['زیست‌شناسی', 'ریاضی', 'فیزیک', 'شیمی', 'ادبیات', 'عربی', 'دینی', 'زبان انگلیسی', 'زمین‌شناسی'];
const PRESETS = [25, 45, 60, 90, 120];

interface StartPickerProps {
  dateKey: string; // jalali day open in the report
  dayLabel: string;
  onClose: () => void;
}

export const StartPicker: React.FC<StartPickerProps> = ({ dateKey, dayLabel, onClose }) => {
  const data = React.useMemo(() => loadPlannerData(), []);
  const items: PlannerItem[] = data.items[dateKey] || [];
  const open = items.filter((i) => !i.done);
  const [tab, setTab] = React.useState<'plan' | 'free'>(open.length ? 'plan' : 'free');

  const [title, setTitle] = React.useState('');
  const [mode, setMode] = React.useState<'watch' | 'down'>('watch');
  const [minutes, setMinutes] = React.useState(45);
  const [minText, setMinText] = React.useState('45');

  const startCard = async (it: PlannerItem) => {
    unlockAudio();
    await requestLiveStart(dateKey, it);
    onClose();
  };
  const startFree = async () => {
    unlockAudio();
    const ok = await requestFreeStart(dateKey, { title, minutes: mode === 'down' ? minutes : 0 });
    if (ok) onClose();
  };

  return (
    <div className="tm-backdrop" onClick={onClose}>
      <div className="tm-sheet tm-picker" role="dialog" aria-modal="true" aria-label="شروع مطالعه" onClick={(e) => e.stopPropagation()}>
        <div className="tm-picker-head">
          <div>
            <h2>شروع مطالعه</h2>
            <span>{dayLabel || 'برنامه امروز'}</span>
          </div>
          <button type="button" className="tm-icon-btn" onClick={onClose} aria-label="بستن"><X size={18} /></button>
        </div>

        <div className="tm-seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}><ListChecks size={16} /> از برنامه‌ی روز</button>
          <button type="button" role="tab" aria-selected={tab === 'free'} className={tab === 'free' ? 'on' : ''} onClick={() => setTab('free')}><Zap size={16} /> مطالعه‌ی آزاد</button>
        </div>

        {tab === 'plan' ? (
          items.length === 0 ? (
            <div className="tm-empty">
              برای این روز کارتی در برنامه‌ریز نیست.
              <button type="button" className="tm-btn-ghost" onClick={() => setTab('free')}>یک مطالعه‌ی آزاد شروع کن</button>
            </div>
          ) : (
            <div className="tm-plan-list">
              {items.map((it) => (
                <button type="button" key={it.id} className={'tm-plan-row' + (it.done ? ' done' : '')} style={{ ['--c' as any]: gradeColor(it.grade) }} onClick={() => startCard(it)}>
                  <i className="tm-plan-bar" />
                  <span className="tm-plan-txt">
                    <b>{it.subject}</b>
                    <em>{[it.detail, it.source ? `کتاب: ${it.source}` : ''].filter(Boolean).join(' · ') || it.grade}</em>
                  </span>
                  <span className="tm-plan-min">{toPersianDigits(itemMinutes(it, data.schedule))}<small>دقیقه</small></span>
                  <span className="tm-plan-play"><Play size={16} /></span>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="tm-free">
            <label className="tm-field">
              <span>چه درسی می‌خوانی؟ (اختیاری)</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً شیمی — استوکیومتری" />
            </label>
            <div className="tm-chips tm-lessons">
              {LESSONS.map((l) => <button key={l} type="button" className={title === l ? 'on' : ''} onClick={() => setTitle(l)}>{l}</button>)}
            </div>

            <div className="tm-seg small">
              <button type="button" className={mode === 'watch' ? 'on' : ''} onClick={() => setMode('watch')}><Timer size={16} /> کرنومتر آزاد</button>
              <button type="button" className={mode === 'down' ? 'on' : ''} onClick={() => setMode('down')}><Hourglass size={16} /> تایمر معکوس</button>
            </div>

            {mode === 'down' && (
              <div className="tm-chips">
                {PRESETS.map((m) => (
                  <button key={m} type="button" className={minutes === m ? 'on' : ''} onClick={() => { setMinutes(m); setMinText(String(m)); }}>{toPersianDigits(m)} دقیقه</button>
                ))}
                <label className="tm-inline tight">
                  <input
                    type="number" inputMode="numeric" min={1} max={600} value={minText}
                    onChange={(e) => { setMinText(e.target.value); const n = parseInt(e.target.value, 10); if (n >= 1) setMinutes(Math.min(600, n)); }}
                    onBlur={() => setMinText(String(minutes))}
                    aria-label="دقیقه"
                  />
                  <span>دقیقه</span>
                </label>
              </div>
            )}

            <button type="button" className="tm-btn-main" onClick={startFree}><Play size={18} /> شروع</button>
          </div>
        )}
      </div>
    </div>
  );
};
