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
  // the weekday name always follows the date: nothing to type
  const parsedDate = parseJalaliDate(date);
  const derivedDay = parsedDate ? getJalaliDayOfWeek(parsedDate) : '';
  React.useEffect(() => {
    if (derivedDay !== day) onDayChange(derivedDay);
  }, [derivedDay, day]);
  const handleDateSelected = (newDate: string) => onDateChange(newDate);

  return (
    <div className="report-header">
      <h1>گزارش کار روز</h1>
      <div className="header-fields">
        <div className="field date-field">
          <ShamsiDatePicker
            value={date}
            onChange={handleDateSelected}
            label="تاریخ"
            placeholder="انتخاب تاریخ"
            align="left"
          />
        </div>
        <div className="report-dayname" aria-live="polite">{derivedDay || 'روز هفته از روی تاریخ تعیین می‌شود'}</div>
      </div>
    </div>
  );
};

