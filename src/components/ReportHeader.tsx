import React from 'react';
import { ShamsiDatePicker } from './ShamsiDatePicker';
import { parseJalaliDate, getJalaliDayOfWeek } from '../jalali';

interface ReportHeaderProps {
  day: string;
  date: string;
  onDayChange: (val: string) => void;
  onDateChange: (val: string) => void;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  day,
  date,
  onDayChange,
  onDateChange
}) => {
  const handleDateSelected = (newDate: string) => {
    onDateChange(newDate);
    const parsed = parseJalaliDate(newDate);
    if (parsed && (!day || day.trim() === '')) {
      const dayName = getJalaliDayOfWeek(parsed);
      onDayChange(dayName);
    }
  };

  return (
    <div className="report-header">
      <h1>گزارش کار روز</h1>
      <div className="header-fields">
        <div className="field">
          <label>روز</label>
          <input
            type="text"
            value={day}
            onChange={(e) => onDayChange(e.target.value)}
            placeholder="مثلاً شنبه"
          />
        </div>
        <div className="field date-field">
          <ShamsiDatePicker
            value={date}
            onChange={handleDateSelected}
            label="تاریخ"
            placeholder="انتخاب تاریخ"
          />
        </div>
      </div>
    </div>
  );
};

