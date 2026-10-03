import React from 'react';
import { PlanRest } from '../../plannerSchedule';
import { toPersianDigits } from '../../utils';

// A fixed interruption (lunch, prayer, school ...) shown inside a timed day.
export const DayRestRow: React.FC<{ rest: PlanRest; onRemove?: () => void }> = ({ rest, onRemove }) => (
  <div className={'pl-rest' + (rest.oneOff ? ' one' : '')} title={rest.oneOff ? 'فقط برای همین روز' : 'از برنامه‌ی ثابت روزانه (تنظیمات)'}>
    <span className="pl-rest-ic">{rest.icon}</span>
    <span className="pl-rest-t">{rest.label}</span>
    <span className="pl-rest-time">{toPersianDigits(rest.start)}–{toPersianDigits(rest.end)}</span>
    {rest.oneOff && onRemove && (
      <button type="button" className="pl-rest-x" title="حذف از این روز" onClick={onRemove}>×</button>
    )}
  </div>
);

export function breakLabel(minutes: number, long: boolean): string {
  return `${long ? '🧘 استراحت بلند' : '☕ استراحت'} ${toPersianDigits(minutes)} دقیقه`;
}
