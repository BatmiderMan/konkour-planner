import React from 'react';
import { SleepData } from '../types';
import {
  calculateSleepDuration,
  calculateGoalAdherence,
  calculateTimeDiffMinutes,
  toPersianDigits
} from '../utils';

interface SleepTrackerCardProps {
  sleep: SleepData;
  onChange: (updated: SleepData) => void;
}

const NAP_PRESETS = [0, 15, 30, 45, 60, 90];

// Helper to check if current time is in [Target - 1h, Target + 3h]
function checkWakeWindow(targetWakeTime: string): {
  isInWindow: boolean;
  windowStartStr: string;
  windowEndStr: string;
} {
  if (!targetWakeTime) return { isInWindow: true, windowStartStr: '', windowEndStr: '' };
  const parts = targetWakeTime.split(':').map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    return { isInWindow: true, windowStartStr: '', windowEndStr: '' };
  }

  const targetMins = parts[0] * 60 + parts[1];
  const startMins = targetMins - 60;
  const endMins = targetMins + 180;

  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const formatMins = (m: number) => {
    const mod = (m + 1440) % 1440;
    const hh = String(Math.floor(mod / 60)).padStart(2, '0');
    const mm = String(mod % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  let inWin = false;
  if (startMins < 0) {
    inWin = currentMins >= startMins + 1440 || currentMins <= endMins;
  } else if (endMins >= 1440) {
    inWin = currentMins >= startMins || currentMins <= endMins % 1440;
  } else {
    inWin = currentMins >= startMins && currentMins <= endMins;
  }

  return {
    isInWindow: inWin,
    windowStartStr: formatMins(startMins),
    windowEndStr: formatMins(endMins)
  };
}

export const SleepTrackerCard: React.FC<SleepTrackerCardProps> = ({
  sleep,
  onChange
}) => {
  const data: SleepData = {
    targetBedtime: sleep?.targetBedtime || sleep?.bedtime || '23:00',
    targetWakeTime: sleep?.targetWakeTime || sleep?.wakeTime || '06:00',
    actualBedtime: sleep?.actualBedtime || sleep?.bedtime || '23:00',
    actualWakeTime: sleep?.actualWakeTime || sleep?.wakeTime || '06:00',
    bedtimeCheckedIn: !!sleep?.bedtimeCheckedIn,
    wakeCheckedIn: !!sleep?.wakeCheckedIn,
    wakeCheckinTimestamp: sleep?.wakeCheckinTimestamp,
    napMinutes: sleep?.napMinutes ?? 0,
    notes: sleep?.notes || ''
  };

  const { formattedNight, formattedTotal, hoursDecimal } =
    calculateSleepDuration(data.actualBedtime, data.actualWakeTime, data.napMinutes);

  const adherence = calculateGoalAdherence(
    data.targetBedtime,
    data.actualBedtime,
    data.targetWakeTime,
    data.actualWakeTime
  );

  const wakeWindow = checkWakeWindow(data.targetWakeTime);

  const formatNowTime = (): string => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const updateField = <K extends keyof SleepData>(key: K, value: SleepData[K]) => {
    onChange({
      ...data,
      [key]: value
    });
  };

  // Morning Wake-Up Check-in Action
  const handleWakeCheckIn = () => {
    const nowTime = formatNowTime();
    onChange({
      ...data,
      actualWakeTime: nowTime,
      wakeCheckedIn: true,
      wakeCheckinTimestamp: Date.now()
    });
  };

  // Night Bedtime Check-in Action
  const handleBedCheckIn = () => {
    const nowTime = formatNowTime();
    onChange({
      ...data,
      actualBedtime: nowTime,
      bedtimeCheckedIn: true
    });
  };

  return (
    <div className="sleep-card">
      {/* Header */}
      <div className="card-header sleep-header">
        <div className="card-header-title">
          <span className="sleep-icon">🌙</span>
          <div>
            <h2>مدیریت و هدف‌گذاری خواب و بیداری</h2>
            <span className="sleep-sub-label">پایش تعهد و زمان‌بندی دقیق ریکاوری</span>
          </div>
        </div>
        <div className="sleep-total-badge">
          <span>مجموع خواب:</span>
          <b>{formattedTotal}</b>
        </div>
      </div>

      <div className="card-body sleep-card-body">
        {/* Morning Check-In Hero Action (Only active in [Target - 1h, Target + 3h]) */}
        <div
          className={`morning-checkin-banner ${
            data.wakeCheckedIn ? 'done' : wakeWindow.isInWindow ? 'active' : 'disabled'
          }`}
        >
          <div className="checkin-info">
            <span className="checkin-icon">
              {data.wakeCheckedIn ? '🎉' : wakeWindow.isInWindow ? '☀️' : '🔒'}
            </span>
            <div>
              <span className="checkin-title">
                {data.wakeCheckedIn
                  ? 'حضور صبحگاهی ثبت شد'
                  : wakeWindow.isInWindow
                  ? 'ثبت بیداری و شروع روز'
                  : 'پنجره ثبت حضور بیداری غیرفعال است'}
              </span>
              <span className="checkin-desc">
                هدف بیداری: <b>{toPersianDigits(data.targetWakeTime)}</b>
                {data.wakeCheckedIn ? (
                  <> | ثبت واقعی: <b>{toPersianDigits(data.actualWakeTime)}</b></>
                ) : !wakeWindow.isInWindow ? (
                  <> (فعال از {toPersianDigits(wakeWindow.windowStartStr)} تا {toPersianDigits(wakeWindow.windowEndStr)})</>
                ) : null}
              </span>
            </div>
          </div>

          {wakeWindow.isInWindow ? (
            <button
              type="button"
              className={`btn-wake-checkin ${data.wakeCheckedIn ? 'checked' : ''}`}
              onClick={handleWakeCheckIn}
            >
              {data.wakeCheckedIn ? '✓ بیدار شدم (به‌روزرسانی)' : '☀️ من بیدارم!'}
            </button>
          ) : (
            <span className="checkin-locked-tag">
              {data.wakeCheckedIn ? '✓ تایید شده' : 'خارج از بازه بیداری'}
            </span>
          )}
        </div>

        {/* Goal Adherence & Discipline Metric */}
        <div className="discipline-score-card" style={{ borderColor: adherence.statusColor }}>
          <div className="discipline-header">
            <span className="disc-label">🎯 درصد پایبندی به هدف خواب و بیداری:</span>
            <span className="disc-badge" style={{ backgroundColor: adherence.statusColor }}>
              {toPersianDigits(adherence.scorePercent)}٪
            </span>
          </div>
          <p className="disc-status-text">{adherence.statusText}</p>
        </div>

        {/* Beautiful Target vs Actual Timing Inputs */}
        <div className="sleep-timing-panel">
          {/* Target Section */}
          <div className="timing-col target-col">
            <div className="col-header">
              <span className="col-icon">🎯</span>
              <span className="col-title">هدف‌گذاری من</span>
            </div>
            <div className="timing-fields">
              <div className="stylish-time-field">
                <label>ساعت خواب شب</label>
                <div className="time-input-wrap">
                  <input
                    type="time"
                    value={data.targetBedtime}
                    onChange={(e) => updateField('targetBedtime', e.target.value)}
                  />
                </div>
              </div>
              <div className="stylish-time-field">
                <label>ساعت بیداری صبح</label>
                <div className="time-input-wrap">
                  <input
                    type="time"
                    value={data.targetWakeTime}
                    onChange={(e) => updateField('targetWakeTime', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Actual Section */}
          <div className="timing-col actual-col">
            <div className="col-header">
              <span className="col-icon">⏱</span>
              <span className="col-title">ساعت واقعی</span>
            </div>
            <div className="timing-fields">
              <div className="stylish-time-field">
                <div className="label-flex">
                  <label>خواب دیشب</label>
                  <button
                    type="button"
                    className="btn-stamp-now"
                    onClick={handleBedCheckIn}
                    title="ثبت ساعت کنونی"
                  >
                    الان ⏱
                  </button>
                </div>
                <div className="time-input-wrap">
                  <input
                    type="time"
                    value={data.actualBedtime}
                    onChange={(e) => updateField('actualBedtime', e.target.value)}
                  />
                </div>
              </div>
              <div className="stylish-time-field">
                <div className="label-flex">
                  <label>بیداری امروز</label>
                  <button
                    type="button"
                    className="btn-stamp-now"
                    onClick={handleWakeCheckIn}
                    title="ثبت ساعت کنونی"
                  >
                    الان ☀️
                  </button>
                </div>
                <div className="time-input-wrap">
                  <input
                    type="time"
                    value={data.actualWakeTime}
                    onChange={(e) => updateField('actualWakeTime', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Visual Sleep vs Target Comparison Timeline Chart */}
        <div className="sleep-comparison-chart-card">
          <div className="chart-header">
            <span className="chart-icon">📊</span>
            <h4>نمودار مقایسه زمان‌بندی خواب و بیداری</h4>
          </div>

          <SleepTimelineChart
            targetBed={data.targetBedtime}
            targetWake={data.targetWakeTime}
            actualBed={data.actualBedtime}
            actualWake={data.actualWakeTime}
          />

          <div className="chart-legend-row">
            <div className="legend-item">
              <span className="legend-box target"></span>
              <span>بازه هدف‌گذاری شده ({toPersianDigits(data.targetBedtime)} تا {toPersianDigits(data.targetWakeTime)})</span>
            </div>
            <div className="legend-item">
              <span className="legend-box actual"></span>
              <span>بازه خواب واقعی ({toPersianDigits(data.actualBedtime)} تا {toPersianDigits(data.actualWakeTime)})</span>
            </div>
          </div>
        </div>

        {/* Midday Nap / Rest with Styled Controls */}
        <div className="sleep-section nap-section">
          <div className="section-label-row">
            <span className="sec-title">🛋️ استراحت و چرت نیمروزی</span>
            <span className="nap-current-value">
              {data.napMinutes > 0
                ? `${toPersianDigits(data.napMinutes)} دقیقه استراحت`
                : 'بدون چرت'}
            </span>
          </div>

          <div className="nap-preset-chips">
            {NAP_PRESETS.map((mins) => (
              <button
                key={mins}
                type="button"
                className={`nap-chip ${data.napMinutes === mins ? 'active' : ''}`}
                onClick={() => updateField('napMinutes', mins)}
              >
                {mins === 0 ? 'بدون چرت' : `${toPersianDigits(mins)} دقیقه`}
              </button>
            ))}
          </div>

          {/* Custom minute input */}
          <div className="nap-custom-input-row">
            <label>یا ثبت دقیقه دلخواه چرت:</label>
            <div className="nap-input-wrap">
              <input
                type="number"
                min="0"
                max="240"
                value={data.napMinutes || ''}
                onChange={(e) => updateField('napMinutes', Number(e.target.value) || 0)}
                placeholder="۰"
              />
              <span className="nap-unit">دقیقه</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="sleep-section">
          <label className="section-label">📝 یادداشت نظم خواب و ریکاوری:</label>
          <input
            type="text"
            className="sleep-notes-input"
            value={data.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="مثلاً: بیداری راس ساعت با انرژی عالی، تنظیم نور اتاق..."
          />
        </div>
      </div>
    </div>
  );
};

// Visual Horizontal 24h Timeline Chart Component
interface SleepTimelineChartProps {
  targetBed: string;
  targetWake: string;
  actualBed: string;
  actualWake: string;
}

const SleepTimelineChart: React.FC<SleepTimelineChartProps> = ({
  targetBed,
  targetWake,
  actualBed,
  actualWake
}) => {
  // We plot nocturnal timeline starting from 20:00 (8 PM) to 12:00 (12 PM next day) = 16 hours total
  const SCALE_START_HOUR = 20; // 20:00
  const TOTAL_SCALE_HOURS = 16; // 20:00 -> 12:00 next day (960 minutes)

  const timeToScalePercent = (timeStr: string): number => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length !== 2) return 0;
    const [h, m] = parts;

    let minsFrom20 = 0;
    if (h >= SCALE_START_HOUR) {
      minsFrom20 = (h - SCALE_START_HOUR) * 60 + m;
    } else {
      minsFrom20 = (24 - SCALE_START_HOUR + h) * 60 + m;
    }

    const pct = (minsFrom20 / (TOTAL_SCALE_HOURS * 60)) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  const tStartPct = timeToScalePercent(targetBed);
  const tEndPct = timeToScalePercent(targetWake);
  const tWidth = tEndPct >= tStartPct ? tEndPct - tStartPct : 100 - tStartPct + tEndPct;

  const aStartPct = timeToScalePercent(actualBed);
  const aEndPct = timeToScalePercent(actualWake);
  const aWidth = aEndPct >= aStartPct ? aEndPct - aStartPct : 100 - aStartPct + aEndPct;

  const bedDiff = calculateTimeDiffMinutes(targetBed, actualBed);
  const wakeDiff = calculateTimeDiffMinutes(targetWake, actualWake);

  const markerHours = [20, 22, 0, 2, 4, 6, 8, 10, 12];

  return (
    <div className="timeline-chart-wrap">
      {/* Markers Axis */}
      <div className="timeline-axis">
        {markerHours.map((hr) => {
          const formattedHr = `${String(hr).padStart(2, '0')}:۰۰`;
          return (
            <span key={hr} className="timeline-time-mark">
              {toPersianDigits(formattedHr)}
            </span>
          );
        })}
      </div>

      {/* Target Bar Row */}
      <div className="timeline-bar-row">
        <span className="row-label target-lbl">هدف</span>
        <div className="timeline-track">
          <div
            className="timeline-fill target-fill"
            style={{
              left: `${tStartPct}%`,
              width: `${Math.max(2, tWidth)}%`
            }}
            title={`هدف: ${targetBed} تا ${targetWake}`}
          >
            <span className="fill-time start">{toPersianDigits(targetBed)}</span>
            <span className="fill-time end">{toPersianDigits(targetWake)}</span>
          </div>
        </div>
      </div>

      {/* Actual Bar Row */}
      <div className="timeline-bar-row">
        <span className="row-label actual-lbl">واقعی</span>
        <div className="timeline-track">
          <div
            className="timeline-fill actual-fill"
            style={{
              left: `${aStartPct}%`,
              width: `${Math.max(2, aWidth)}%`
            }}
            title={`واقعی: ${actualBed} تا ${actualWake}`}
          >
            <span className="fill-time start">{toPersianDigits(actualBed)}</span>
            <span className="fill-time end">{toPersianDigits(actualWake)}</span>
          </div>
        </div>
      </div>

      {/* Deviation summary tags */}
      <div className="timeline-diff-tags">
        <div className={`diff-tag ${Math.abs(bedDiff) <= 15 ? 'good' : 'warn'}`}>
          <span>انحراف ساعت خواب:</span>
          <b>
            {bedDiff === 0
              ? 'دقیقاً سر وقت ✓'
              : bedDiff > 0
              ? `${toPersianDigits(bedDiff)}+ دقیقه دیرتر`
              : `${toPersianDigits(Math.abs(bedDiff))} دقیقه زودتر`}
          </b>
        </div>
        <div className={`diff-tag ${Math.abs(wakeDiff) <= 15 ? 'good' : 'warn'}`}>
          <span>انحراف ساعت بیداری:</span>
          <b>
            {wakeDiff === 0
              ? 'دقیقاً سر وقت ✓'
              : wakeDiff > 0
              ? `${toPersianDigits(wakeDiff)}+ دقیقه دیرتر`
              : `${toPersianDigits(Math.abs(wakeDiff))} دقیقه سحرخیزتر ✓`}
          </b>
        </div>
      </div>
    </div>
  );
};
