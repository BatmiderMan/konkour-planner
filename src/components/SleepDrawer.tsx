import React from 'react';
import { SleepData } from '../types';
import { calculateSleepDuration, toPersianDigits } from '../utils';
import { SleepTrackerCard } from './SleepTrackerCard';

interface SleepDrawerProps {
  sleep: SleepData;
  onChange: (updated: SleepData) => void;
  onDisable: () => void; // turn the whole sleep tracker off
}

// The sleep tracker lives outside the daily report now: a small edge tab on the side of the
// screen opens it as a separate drawer, and it can be switched off completely.
const PHONE_Q = '(max-width: 768px)';
export function useIsPhone(): boolean {
  const [m, setM] = React.useState(() => window.matchMedia(PHONE_Q).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(PHONE_Q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

// Phone version: sleep is a small collapsible row inside the checklist & routine tab
export const SleepInline: React.FC<SleepDrawerProps> = ({ sleep, onChange, onDisable }) => {
  const [open, setOpen] = React.useState(false);
  const { formattedTotal } = calculateSleepDuration(sleep.actualBedtime, sleep.actualWakeTime, sleep.napMinutes);
  const logged = !!(sleep.actualBedtime && sleep.actualWakeTime);
  return (
    <section className={'sleep-inline' + (open ? ' open' : '')}>
      <button type="button" className="sleep-inline-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>🌙 خواب</span>
        <em>{logged ? toPersianDigits(formattedTotal) : 'ثبت نشده'}</em>
        <i aria-hidden="true">{open ? '▴' : '▾'}</i>
      </button>
      {open && (
        <div className="sleep-inline-body">
          <SleepTrackerCard sleep={sleep} onChange={onChange} />
          <button type="button" className="sleep-drawer-off" onClick={onDisable}>خاموش کردن ردیاب خواب</button>
        </div>
      )}
    </section>
  );
};

export const SleepDrawer: React.FC<SleepDrawerProps> = ({ sleep, onChange, onDisable }) => {
  const [open, setOpen] = React.useState(false);
  const phone = useIsPhone();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const { formattedTotal } = calculateSleepDuration(sleep.actualBedtime, sleep.actualWakeTime, sleep.napMinutes);
  const logged = !!(sleep.actualBedtime && sleep.actualWakeTime);

  if (phone) return null;

  return (
    <>
      <button
        type="button"
        className={'sleep-edge-tab no-print' + (logged ? ' logged' : '')}
        onClick={() => setOpen(true)}
        aria-label="باز کردن ردیاب خواب"
        title="ردیاب خواب"
      >
        <span className="sleep-edge-icon">🌙</span>
        {logged && <span className="sleep-edge-val">{toPersianDigits(formattedTotal)}</span>}
      </button>

      {open && (
        <div className="sleep-drawer-backdrop no-print" onClick={() => setOpen(false)}>
          <aside className="sleep-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="ردیاب خواب">
            <div className="sleep-drawer-bar">
              <span className="sleep-drawer-grip" aria-hidden="true" />
              <b>🌙 ردیاب خواب</b>
              <button type="button" className="sleep-drawer-close" onClick={() => setOpen(false)} aria-label="بستن">
                ✕
              </button>
            </div>
            <div className="sleep-drawer-body">
              <SleepTrackerCard sleep={sleep} onChange={onChange} />
              <button
                type="button"
                className="sleep-drawer-off"
                onClick={() => {
                  setOpen(false);
                  onDisable();
                }}
              >
                خاموش کردن ردیاب خواب
              </button>
              <p className="sleep-drawer-note">داده‌های خواب پاک نمی‌شوند؛ هر وقت خواستی از «منوی امکانات» دوباره روشنش کن.</p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
