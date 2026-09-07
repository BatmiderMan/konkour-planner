import React, { useState, useEffect, useRef } from 'react';
import {
  JalaliDate,
  PERSIAN_MONTH_NAMES,
  PERSIAN_WEEK_DAYS,
  getTodayJalali,
  formatJalaliDate,
  parseJalaliDate,
  getDaysInJalaliMonth,
  jalaliToGregorian
} from '../jalali';
import { toPersianDigits } from '../utils';

interface ShamsiDatePickerProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  label?: string;
}

export const ShamsiDatePicker: React.FC<ShamsiDatePickerProps> = ({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ شمسی',
  label = 'تاریخ'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Derive initial year and month from the current input value or today's date
  const getInitial = () => {
    return parseJalaliDate(value) || getTodayJalali();
  };

  const [viewYear, setViewYear] = useState<number>(() => getInitial().jy);
  const [viewMonth, setViewMonth] = useState<number>(() => getInitial().jm);

  // Keep internal calendar view synced whenever value or open state changes
  useEffect(() => {
    const p = parseJalaliDate(value);
    if (p) {
      setViewYear(p.jy);
      setViewMonth(p.jm);
    } else {
      const today = getTodayJalali();
      setViewYear(today.jy);
      setViewMonth(today.jm);
    }
  }, [value, isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const selected: JalaliDate = {
      jy: viewYear,
      jm: viewMonth,
      jd: day
    };
    const formatted = formatJalaliDate(selected);
    onChange(formatted);
    setIsOpen(false);
  };

  const handleSetToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = getTodayJalali();
    onChange(formatJalaliDate(today));
    setViewYear(today.jy);
    setViewMonth(today.jm);
    setIsOpen(false);
  };

  // Build calendar matrix
  const daysInMonth = getDaysInJalaliMonth(viewYear, viewMonth);
  const firstDayGreg = jalaliToGregorian(viewYear, viewMonth, 1);
  const dateObj = new Date(firstDayGreg.gy, firstDayGreg.gm - 1, firstDayGreg.gd);
  const dayOfWeekIndex = dateObj.getDay(); // 0 is Sun, 6 is Sat
  const startDayOffset = (dayOfWeekIndex + 1) % 7; // Convert to Saturday=0

  const currentSelected = parseJalaliDate(value);
  const today = getTodayJalali();

  const isSelected = (d: number) =>
    currentSelected &&
    currentSelected.jy === viewYear &&
    currentSelected.jm === viewMonth &&
    currentSelected.jd === d;

  const isToday = (d: number) =>
    today.jy === viewYear && today.jm === viewMonth && today.jd === d;

  const blanks = Array.from({ length: startDayOffset });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="shamsi-picker-container" ref={containerRef}>
      <div className="shamsi-input-box" onClick={() => setIsOpen(!isOpen)}>
        {label && <label>{label}</label>}
        <div className="shamsi-display-value">
          <span className="shamsi-text">
            {value ? toPersianDigits(value) : <span className="placeholder">{placeholder}</span>}
          </span>
          <span className="shamsi-calendar-icon">📅</span>
        </div>
      </div>

      {isOpen && (
        <div className="shamsi-dropdown">
          <div className="shamsi-calendar-header">
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={handlePrevMonth}
              title="ماه قبل"
            >
              ◀
            </button>
            <div className="calendar-title">
              <span className="month-name">{PERSIAN_MONTH_NAMES[viewMonth - 1]}</span>
              <span className="year-number">{toPersianDigits(viewYear)}</span>
            </div>
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={handleNextMonth}
              title="ماه بعد"
            >
              ▶
            </button>
          </div>

          <div className="shamsi-weekdays-grid">
            {PERSIAN_WEEK_DAYS.map((w, idx) => (
              <span key={idx} className="shamsi-weekday-header">
                {w[0]}
              </span>
            ))}
          </div>

          <div className="shamsi-days-grid">
            {blanks.map((_, i) => (
              <span key={`blank-${i}`} className="shamsi-day-cell blank" />
            ))}
            {days.map((d) => {
              const selected = isSelected(d);
              const todayMark = isToday(d);
              return (
                <button
                  type="button"
                  key={`day-${d}`}
                  className={`shamsi-day-cell ${selected ? 'selected' : ''} ${
                    todayMark ? 'today' : ''
                  }`}
                  onClick={() => handleSelectDay(d)}
                >
                  {toPersianDigits(d)}
                </button>
              );
            })}
          </div>

          <div className="shamsi-footer">
            <button
              type="button"
              className="shamsi-today-btn"
              onClick={handleSetToday}
            >
              امروز ({toPersianDigits(formatJalaliDate(today))})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
