import React from 'react';

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
        <div className="field">
          <label>تاریخ</label>
          <input
            type="text"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            placeholder="۱۴۰۳/۰۶/۱۵"
          />
        </div>
      </div>
    </div>
  );
};
