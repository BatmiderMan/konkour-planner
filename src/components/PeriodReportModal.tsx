import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DayData, DayIndexEntry, StudyBlock } from '../types';
import { ShamsiDatePicker } from './ShamsiDatePicker';
import {
  parseJalaliDate,
  addDaysToJalali,
  formatJalaliDate,
  compareJalaliStrings,
  getTodayJalali
} from '../jalali';
import {
  toPersianDigits,
  calculateTotalStudyTime,
  calculateTestPercentage
} from '../utils';

interface PeriodReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  daysIndex: DayIndexEntry[];
  currentDayDate: string;
}

interface ProcessedDay {
  id: string;
  day: string;
  date: string;
  totalStudyTime: string;
  totalMinutes: number;
  blocksCount: number;
  blocks: StudyBlock[];
  hasLearning: boolean;
}

export const PeriodReportModal: React.FC<PeriodReportModalProps> = ({
  isOpen,
  onClose,
  daysIndex,
  currentDayDate
}) => {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(6);

  const printableRef = useRef<HTMLDivElement | null>(null);

  // Initialize start and end dates whenever modal opens
  useEffect(() => {
    if (isOpen) {
      let endStr = currentDayDate;
      if (!endStr && daysIndex.length > 0) {
        const withDate = daysIndex.filter((d) => !!d.date);
        if (withDate.length > 0) {
          const sorted = [...withDate].sort((a, b) => compareJalaliStrings(b.date, a.date));
          endStr = sorted[0].date;
        }
      }
      if (!endStr) {
        endStr = formatJalaliDate(getTodayJalali());
      }

      const pEnd = parseJalaliDate(endStr) || getTodayJalali();
      const pStart = addDaysToJalali(pEnd, -6);
      const startStr = formatJalaliDate(pStart);

      setEndDate(endStr);
      setStartDate(startStr);
    }
  }, [isOpen, currentDayDate, daysIndex]);

  // Filter and process days between startDate and endDate
  const filteredDays = useMemo(() => {
    if (!startDate || !endDate) return [];

    const result: ProcessedDay[] = [];

    for (const item of daysIndex) {
      if (!item.date) continue;
      const cmpStart = compareJalaliStrings(item.date, startDate);
      const cmpEnd = compareJalaliStrings(item.date, endDate);

      if (cmpStart >= 0 && cmpEnd <= 0) {
        const raw = localStorage.getItem(`konkour_day_data_v2:${item.id}`);
        if (raw) {
          try {
            const parsed: DayData = JSON.parse(raw);
            const validBlocks = (parsed.blocks || []).filter(
              (b) => b.lesson.trim() || b.subject.trim() || b.desc.trim() || b.start || b.end
            );

            let totalMins = 0;
            validBlocks.forEach((b) => {
              if (b.start && b.end) {
                const s = b.start.split(':').map(Number);
                const e = b.end.split(':').map(Number);
                if (s.length === 2 && e.length === 2) {
                  const diff = (e[0] * 60 + e[1]) - (s[0] * 60 + s[1]);
                  if (diff > 0) totalMins += diff;
                }
              }
            });

            result.push({
              id: item.id,
              day: parsed.day || item.day || '',
              date: item.date || parsed.date || '',
              totalStudyTime: calculateTotalStudyTime(validBlocks),
              totalMinutes: totalMins,
              blocksCount: validBlocks.length,
              blocks: validBlocks,
              hasLearning: validBlocks.length > 0
            });
          } catch (e) {
            console.error('Error parsing day for report:', e);
          }
        }
      }
    }

    result.sort((a, b) => compareJalaliStrings(a.date, b.date));
    return result;
  }, [startDate, endDate, daysIndex]);

  // Split into chunks of 5-7 days per page
  const pagedDays = useMemo(() => {
    const pages: ProcessedDay[][] = [];
    for (let i = 0; i < filteredDays.length; i += pageSize) {
      pages.push(filteredDays.slice(i, i + pageSize));
    }
    return pages;
  }, [filteredDays, pageSize]);

  // Overall Statistics for the period
  const totalPeriodMinutes = useMemo(() => {
    return filteredDays.reduce((acc, d) => acc + d.totalMinutes, 0);
  }, [filteredDays]);

  const totalPeriodHoursStr = useMemo(() => {
    const h = Math.floor(totalPeriodMinutes / 60);
    const m = totalPeriodMinutes % 60;
    return `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه`;
  }, [totalPeriodMinutes]);

  const totalPeriodBlocksCount = useMemo(() => {
    return filteredDays.reduce((acc, d) => acc + d.blocksCount, 0);
  }, [filteredDays]);

  const totalPeriodTests = useMemo(() => {
    let t = 0;
    filteredDays.forEach((d) => {
      d.blocks.forEach((b) => {
        t += parseInt(b.totalTests, 10) || 0;
      });
    });
    return t;
  }, [filteredDays]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="report-modal-backdrop" onClick={onClose}>
      <div className="report-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="report-modal-header no-print">
          <div className="report-modal-title">
            <span className="report-modal-icon">📊</span>
            <h2>گزارش جامع دوره‌ای مطالعه</h2>
          </div>
          <div className="report-actions-top">
            <button
              type="button"
              className="btn-print-report"
              onClick={handlePrint}
              disabled={filteredDays.length === 0}
            >
              🖨 چاپ گزارش / ذخیره PDF
            </button>
            <button
              type="button"
              className="close-modal-btn"
              onClick={onClose}
              aria-label="بستن"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="report-filter-bar no-print">
          <div className="filter-item">
            <ShamsiDatePicker
              value={startDate}
              onChange={setStartDate}
              label="از تاریخ:"
              placeholder="شروع بازه"
              align="right"
            />
          </div>
          <div className="filter-item">
            <ShamsiDatePicker
              value={endDate}
              onChange={setEndDate}
              label="تا تاریخ:"
              placeholder="پایان بازه"
              align="left"
            />
          </div>
          <div className="filter-item days-per-page">
            <label>روز در هر صفحه PDF:</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={5}>۵ روز در صفحه</option>
              <option value={6}>۶ روز در صفحه (پیشنهادی)</option>
              <option value={7}>۷ روز در صفحه (یک هفته کامل)</option>
            </select>
          </div>
        </div>

        <div className="report-document" ref={printableRef}>
          {filteredDays.length === 0 ? (
            <div className="report-empty-state">
              <p>هیچ روز ثبت شده‌ای در این بازه زمانی ({toPersianDigits(startDate)} تا {toPersianDigits(endDate)}) پیدا نشد.</p>
              <p className="hint">لطفاً تاریخ شروع و پایان را بررسی کنید.</p>
            </div>
          ) : (
            <>
              {pagedDays.map((pageDays, pageIndex) => (
                <div key={pageIndex} className="report-print-page">
                  <div className="report-page-header">
                    <div className="report-page-title">
                      <h3>دفتر برنامه‌ریزی و گزارش کار مطالعاتی کنکور</h3>
                      <div className="report-period-info">
                        <span>بازه گزارش: از <b>{toPersianDigits(startDate)}</b> تا <b>{toPersianDigits(endDate)}</b></span>
                      </div>
                    </div>
                    <div className="report-page-num">
                      صفحه {toPersianDigits(pageIndex + 1)} از {toPersianDigits(pagedDays.length + 1)}
                    </div>
                  </div>

                  <div className="report-days-container">
                    {pageDays.map((dayItem) => (
                      <div key={dayItem.id} className="report-day-card">
                        <div className="report-day-header">
                          <div className="report-day-meta">
                            <span className="day-name">{dayItem.day || 'روز'}</span>
                            <span className="day-date">{toPersianDigits(dayItem.date)}</span>
                          </div>
                          <div className="day-study-summary">
                            <span>مجموع مطالعه روز: <b>{dayItem.totalStudyTime}</b> ساعت</span>
                            <span className="blocks-count">({toPersianDigits(dayItem.blocksCount)} پارت مطالعاتی)</span>
                          </div>
                        </div>

                        {dayItem.blocks.length === 0 ? (
                          <div className="report-no-blocks">ثبت مطالعه‌ای در این روز موجود نیست.</div>
                        ) : (
                          <div className="report-blocks-table-wrap">
                            <div className="report-blocks-table">
                              <div className="report-table-head">
                                <span className="col-num">پارت</span>
                                <span className="col-time">ساعت</span>
                                <span className="col-lesson">درس و مبحث</span>
                                <span className="col-type">نوع فعالیت</span>
                                <span className="col-desc">توضیحات و گزارش کار</span>
                                <span className="col-tests">آمار تست</span>
                              </div>
                              {dayItem.blocks.map((b, bIdx) => {
                                const types: string[] = [];
                                if (b.study) types.push('مطالعه');
                                if (b.cls) types.push('کلاس');
                                if (b.review) types.push('مرور');
                                if (b.test) types.push('تست');

                                const testStats = calculateTestPercentage(b.totalTests, b.wrong, b.blank);
                                const hasTests = parseInt(b.totalTests, 10) > 0;

                                return (
                                  <div key={bIdx} className="report-table-row">
                                    <span className="col-num">{toPersianDigits(bIdx + 1)}</span>
                                    <span className="col-time">
                                      {b.start && b.end ? (
                                        `${toPersianDigits(b.start)} - ${toPersianDigits(b.end)}`
                                      ) : (
                                        '-'
                                      )}
                                    </span>
                                    <span className="col-lesson">
                                      <strong>{b.lesson || '-'}</strong>
                                      {b.subject && <span className="sub-subject">{b.subject}</span>}
                                    </span>
                                    <span className="col-type">
                                      {types.length > 0 ? types.join('، ') : '-'}
                                    </span>
                                    <span className="col-desc">{b.desc || '-'}</span>
                                    <span className="col-tests">
                                      {hasTests ? (
                                        <div className="test-stat-summary">
                                          <span>کل: {toPersianDigits(b.totalTests)}</span>
                                          {parseInt(b.wrong, 10) > 0 && <span className="txt-wrong">غ: {toPersianDigits(b.wrong)}</span>}
                                          {parseInt(b.blank, 10) > 0 && <span className="txt-blank">ن: {toPersianDigits(b.blank)}</span>}
                                          <span className="txt-pct">درصد: {testStats.percentage}</span>
                                        </div>
                                      ) : (
                                        '-'
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Final Summary & Analytics Page */}
              <div className="report-print-page final-analytics-page">
                <div className="report-page-header">
                  <div className="report-page-title">
                    <h3>تحلیل و نمودارهای عملکرد دوره مطالعاتی</h3>
                    <div className="report-period-info">
                      <span>بازه گزارش: از <b>{toPersianDigits(startDate)}</b> تا <b>{toPersianDigits(endDate)}</b></span>
                    </div>
                  </div>
                  <div className="report-page-num">
                    صفحه {toPersianDigits(pagedDays.length + 1)} از {toPersianDigits(pagedDays.length + 1)}
                  </div>
                </div>

                <div className="report-kpi-grid">
                  <div className="report-kpi-card">
                    <span className="kpi-label">مجموع ساعت مطالعه</span>
                    <span className="kpi-value">{totalPeriodHoursStr}</span>
                  </div>
                  <div className="report-kpi-card">
                    <span className="kpi-label">تعداد کل پارت‌ها</span>
                    <span className="kpi-value">{toPersianDigits(totalPeriodBlocksCount)} پارت</span>
                  </div>
                  <div className="report-kpi-card">
                    <span className="kpi-label">میانگین روزانه مطالعه</span>
                    <span className="kpi-value">
                      {toPersianDigits(
                        filteredDays.length > 0
                          ? (totalPeriodMinutes / 60 / filteredDays.length).toFixed(1)
                          : 0
                      )} ساعت
                    </span>
                  </div>
                  <div className="report-kpi-card">
                    <span className="kpi-label">کل تست‌های پاسخ داده شده</span>
                    <span className="kpi-value">{toPersianDigits(totalPeriodTests)} تست</span>
                  </div>
                </div>

                <div className="report-chart-section">
                  <h4 className="chart-title">📈 نمودار ساعات مطالعه در روزهای دوره</h4>
                  <div className="chart-wrapper">
                    <HoursBarChart days={filteredDays} />
                  </div>
                </div>

                <div className="report-chart-section">
                  <h4 className="chart-title">📊 نمودار تعداد پارت‌های مطالعاتی در هر روز</h4>
                  <div className="chart-wrapper">
                    <BlocksCountBarChart days={filteredDays} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const HoursBarChart: React.FC<{ days: ProcessedDay[] }> = ({ days }) => {
  if (days.length === 0) return null;

  const maxHours = Math.max(...days.map((d) => d.totalMinutes / 60), 4);
  const chartHeight = 150;
  const chartWidth = Math.max(500, days.length * 55);

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`} className="analytics-svg-chart">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
        const y = chartHeight - ratio * (chartHeight - 20);
        const val = (ratio * maxHours).toFixed(1);
        return (
          <g key={idx}>
            <line x1="45" y1={y} x2={chartWidth - 10} y2={y} stroke="#e4d7be" strokeDasharray="3 3" />
            <text x="40" y={y + 4} textAnchor="end" fontSize="10" fill="#706249" fontFamily="Vazirmatn, Tahoma">
              {toPersianDigits(val)}h
            </text>
          </g>
        );
      })}

      {days.map((d, i) => {
        const barWidth = Math.min(32, (chartWidth - 60) / days.length - 8);
        const x = 55 + i * ((chartWidth - 70) / days.length) + 4;
        const hours = d.totalMinutes / 60;
        const h = maxHours > 0 ? (hours / maxHours) * (chartHeight - 20) : 0;
        const y = chartHeight - h;

        return (
          <g key={d.id}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(2, h)}
              rx="4"
              fill="#375f8a"
              className="chart-bar-rect"
            />
            {hours > 0 && (
              <text
                x={x + barWidth / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fill="#2b2319"
                fontFamily="Vazirmatn, Tahoma"
              >
                {toPersianDigits(hours.toFixed(1))}
              </text>
            )}
            <text
              x={x + barWidth / 2}
              y={chartHeight + 15}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill="#2b2319"
              fontFamily="Vazirmatn, Tahoma"
            >
              {d.day ? d.day.slice(0, 4) : ''}
            </text>
            <text
              x={x + barWidth / 2}
              y={chartHeight + 28}
              textAnchor="middle"
              fontSize="8"
              fill="#706249"
              fontFamily="Vazirmatn, Tahoma"
            >
              {toPersianDigits(d.date.slice(5))}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const BlocksCountBarChart: React.FC<{ days: ProcessedDay[] }> = ({ days }) => {
  if (days.length === 0) return null;

  const maxBlocks = Math.max(...days.map((d) => d.blocksCount), 5);
  const chartHeight = 150;
  const chartWidth = Math.max(500, days.length * 55);

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`} className="analytics-svg-chart">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
        const y = chartHeight - ratio * (chartHeight - 20);
        const val = Math.round(ratio * maxBlocks);
        return (
          <g key={idx}>
            <line x1="45" y1={y} x2={chartWidth - 10} y2={y} stroke="#e4d7be" strokeDasharray="3 3" />
            <text x="40" y={y + 4} textAnchor="end" fontSize="10" fill="#706249" fontFamily="Vazirmatn, Tahoma">
              {toPersianDigits(val)}
            </text>
          </g>
        );
      })}

      {days.map((d, i) => {
        const barWidth = Math.min(32, (chartWidth - 60) / days.length - 8);
        const x = 55 + i * ((chartWidth - 70) / days.length) + 4;
        const count = d.blocksCount;
        const h = maxBlocks > 0 ? (count / maxBlocks) * (chartHeight - 20) : 0;
        const y = chartHeight - h;

        return (
          <g key={d.id}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(2, h)}
              rx="4"
              fill="#3e8c86"
              className="chart-bar-rect"
            />
            {count > 0 && (
              <text
                x={x + barWidth / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fill="#2b2319"
                fontFamily="Vazirmatn, Tahoma"
              >
                {toPersianDigits(count)}
              </text>
            )}
            <text
              x={x + barWidth / 2}
              y={chartHeight + 15}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill="#2b2319"
              fontFamily="Vazirmatn, Tahoma"
            >
              {d.day ? d.day.slice(0, 4) : ''}
            </text>
            <text
              x={x + barWidth / 2}
              y={chartHeight + 28}
              textAnchor="middle"
              fontSize="8"
              fill="#706249"
              fontFamily="Vazirmatn, Tahoma"
            >
              {toPersianDigits(d.date.slice(5))}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
