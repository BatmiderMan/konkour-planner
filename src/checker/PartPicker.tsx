import React from 'react';
import { Sheet } from '../components/ui/Sheet';
import { PlannerItem } from '../types';
import { addDays, dateKeyOf, loadPlannerData, todayGregorian } from '../plannerStore';
import { dayLabel } from '../trackerPlan';
import { toPersianDigits as P } from '../utils';
import './checker.css';

/**
 * Choose the planner card (part) an answer sheet belongs to: pick a day, then a card.
 * Used to attach a sheet that was started somewhere else, to move it to another part, or to detach it.
 */
export const PartPicker: React.FC<{
  current?: { dateKey?: string; plannerItemId?: string };
  onPick: (dateKey: string, item: PlannerItem) => void;
  onDetach: () => void;
  onClose: () => void;
}> = ({ current, onPick, onDetach, onClose }) => {
  const days = React.useMemo(() => [-3, -2, -1, 0, 1, 2, 3].map((n) => dateKeyOf(addDays(todayGregorian(), n))), []);
  const todayKey = days[3];
  const [day, setDay] = React.useState(current && current.dateKey && days.includes(current.dateKey) ? current.dateKey : todayKey);
  const items = loadPlannerData().items[day] || [];
  const nameOf = (k: string, i: number) => (i === 3 ? 'امروز' : i === 4 ? 'فردا' : i === 2 ? 'دیروز' : dayLabel(k).split(' ')[0]);
  return (
    <Sheet onClose={onClose} title="این پاسخ‌برگ مال کدام پارت است؟" z={660}>
      <div className="tk-sheet">
        <div className="pt-day">
          {days.map((k, i) => (
            <button key={k} type="button" className={'tk-pill sm' + (k === day ? ' on' : '')} onClick={() => setDay(k)}>{nameOf(k, i)}<small>{P(Number(k.split('/')[2]))}</small></button>
          ))}
        </div>
        <div className="pt-list">
          {items.length === 0 && <p className="tk-empty">برای این روز پارتی نیست.</p>}
          {items.map((it) => (
            <button key={it.id} type="button" className={'pt-item' + (current && current.plannerItemId === it.id && current.dateKey === day ? ' on' : '')} onClick={() => { onPick(day, it); onClose(); }}>
              <b>{it.subject}</b><span>{it.detail || 'بدون توضیح'}</span><i>{it.done ? '✓ انجام شد' : ''}</i>
            </button>
          ))}
        </div>
        {current && current.plannerItemId && (
          <div className="tk-actions"><button type="button" className="tk-btn" onClick={() => { onDetach(); onClose(); }}>جدا کردن از پارت</button></div>
        )}
      </div>
    </Sheet>
  );
};
