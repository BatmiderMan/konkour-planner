import React, { useState, useEffect, useRef } from 'react';
import { StudyBlock } from '../types';
import { calculateTestPercentage, toPersianDigits } from '../utils';

interface StudyTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveBlock: (block: StudyBlock) => void;
  currentDayLabel: string;
}

const POPULAR_LESSONS = [
  'زیست‌شناسی',
  'ریاضی',
  'فیزیک',
  'شیمی',
  'ادبیات',
  'عربی',
  'دینی',
  'زبان انگلیسی',
  'زمین‌شناسی'
];

const TIMER_STORAGE_KEY = 'konkour_study_timer_v1';

export const StudyTimerModal: React.FC<StudyTimerModalProps> = ({
  isOpen,
  onClose,
  onSaveBlock,
  currentDayLabel
}) => {
  // Timer modes: 'stopwatch' | 'countdown'
  const [mode, setMode] = useState<'stopwatch' | 'countdown'>('stopwatch');
  const [countdownMinutes, setCountdownMinutes] = useState<number>(45);

  // Timer run state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [sessionStartTime, setSessionStartTime] = useState<string>('');
  const [sessionEndTime, setSessionEndTime] = useState<string>('');

  // Step: 'timer' | 'log'
  const [step, setStep] = useState<'timer' | 'log'>('timer');

  // Form details for new study block
  const [lesson, setLesson] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [desc, setDesc] = useState<string>('');
  const [study, setStudy] = useState<boolean>(true);
  const [cls, setCls] = useState<boolean>(false);
  const [review, setReview] = useState<boolean>(false);
  const [test, setTest] = useState<boolean>(false);
  const [totalTests, setTotalTests] = useState<string>('');
  const [wrong, setWrong] = useState<string>('');
  const [blank, setBlank] = useState<string>('');

  const timerRef = useRef<any>(null);

  // Format Date to HH:mm string
  const formatTimeHHMM = (date: Date): string => {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  // Restore saved active timer state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIMER_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.mode) setMode(data.mode);
        if (data.countdownMinutes) setCountdownMinutes(data.countdownMinutes);
        if (data.sessionStartTime) setSessionStartTime(data.sessionStartTime);

        if (data.isRunning && data.startTimestamp) {
          const passed = Math.floor((Date.now() - data.startTimestamp) / 1000) + (data.baseElapsed || 0);
          setElapsedSeconds(passed);
          setIsRunning(true);
        } else if (typeof data.elapsedSeconds === 'number') {
          setElapsedSeconds(data.elapsedSeconds);
          setIsRunning(false);
        }
      }
    } catch (e) {
      console.error('Error loading timer state:', e);
    }
  }, []);

  // Timer tick effect
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          // Check countdown completion
          if (mode === 'countdown' && next >= countdownMinutes * 60) {
            handleStopTimer(true);
            return countdownMinutes * 60;
          }
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, mode, countdownMinutes]);

  // Persist timer state whenever state changes
  useEffect(() => {
    try {
      const data = {
        mode,
        countdownMinutes,
        isRunning,
        elapsedSeconds,
        sessionStartTime,
        startTimestamp: isRunning ? Date.now() - elapsedSeconds * 1000 : null,
        baseElapsed: 0
      };
      localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error(e);
    }
  }, [mode, countdownMinutes, isRunning, elapsedSeconds, sessionStartTime]);

  const handleStartTimer = () => {
    if (!sessionStartTime) {
      const nowStr = formatTimeHHMM(new Date());
      setSessionStartTime(nowStr);
    }
    setIsRunning(true);
  };

  const handlePauseTimer = () => {
    setIsRunning(false);
  };

  const handleResetTimer = () => {
    setIsRunning(false);
    setElapsedSeconds(0);
    setSessionStartTime('');
    setSessionEndTime('');
    setStep('timer');
    localStorage.removeItem(TIMER_STORAGE_KEY);
  };

  const handleStopTimer = (autoEnded = false) => {
    setIsRunning(false);
    const stopTimeStr = formatTimeHHMM(new Date());
    setSessionEndTime(stopTimeStr);

    let start = sessionStartTime;
    if (!start) {
      // Calculate start time backwards from elapsed time
      const startMs = Date.now() - elapsedSeconds * 1000;
      start = formatTimeHHMM(new Date(startMs));
    }

    setStartTime(start);
    setEndTime(stopTimeStr);
    setStep('log');
  };

  const handleSaveSession = (e: React.FormEvent) => {
    e.preventDefault();

    const newBlock: StudyBlock = {
      lesson: lesson.trim() || 'مطالعه آزاد',
      subject: subject.trim(),
      start: startTime,
      end: endTime,
      desc: desc.trim(),
      study,
      cls,
      review,
      test,
      totalTests: totalTests || '',
      wrong: wrong || '',
      blank: blank || ''
    };

    onSaveBlock(newBlock);

    // Reset timer
    handleResetTimer();
    onClose();
  };

  // Time calculations
  const remainingCountdownSeconds = Math.max(0, countdownMinutes * 60 - elapsedSeconds);
  const displaySeconds = mode === 'countdown' ? remainingCountdownSeconds : elapsedSeconds;

  const hours = Math.floor(displaySeconds / 3600);
  const minutes = Math.floor((displaySeconds % 3600) / 60);
  const seconds = displaySeconds % 60;

  const formattedDigital = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0'
  )}:${String(seconds).padStart(2, '0')}`;

  const countdownProgressPercent =
    mode === 'countdown'
      ? Math.min(100, Math.round((elapsedSeconds / (countdownMinutes * 60)) * 100))
      : 0;

  const testStats = calculateTestPercentage(totalTests, wrong, blank);

  return (
    <>
      {/* Floating mini timer pill when modal is closed but timer is running */}
      {!isOpen && isRunning && (
        <div className="floating-timer-pill" onClick={onClose}>
          <span className="pulse-dot"></span>
          <span className="pill-icon">⏱</span>
          <span className="pill-time">{toPersianDigits(formattedDigital)}</span>
          <span className="pill-text">در حال مطالعه</span>
        </div>
      )}

      {isOpen && (
        <div className="report-modal-backdrop" onClick={onClose}>
          <div
            className="study-timer-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="timer-modal-header">
              <div className="timer-header-title">
                <span className="timer-header-icon">⏱</span>
                <div>
                  <h2>تایمر و کرنومتر هوشمند مطالعه</h2>
                  <span className="current-day-tag">{currentDayLabel || 'برنامه امروز'}</span>
                </div>
              </div>
              <button
                type="button"
                className="close-modal-btn"
                onClick={onClose}
                aria-label="بستن"
              >
                ✕
              </button>
            </div>

            {step === 'timer' ? (
              <div className="timer-body-content">
                {/* Mode Switcher */}
                <div className="timer-mode-switcher">
                  <button
                    type="button"
                    className={`mode-btn ${mode === 'stopwatch' ? 'active' : ''}`}
                    onClick={() => {
                      if (!isRunning) {
                        setMode('stopwatch');
                        setElapsedSeconds(0);
                      }
                    }}
                    disabled={isRunning}
                  >
                    ⏱ کرنومتر آزاد
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${mode === 'countdown' ? 'active' : ''}`}
                    onClick={() => {
                      if (!isRunning) {
                        setMode('countdown');
                        setElapsedSeconds(0);
                      }
                    }}
                    disabled={isRunning}
                  >
                    ⏳ تایمر معکوس (پومودورو)
                  </button>
                </div>

                {/* Preset Chips for Countdown */}
                {mode === 'countdown' && !isRunning && (
                  <div className="countdown-presets">
                    {[25, 45, 60, 75, 90, 120].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        className={`preset-chip ${countdownMinutes === mins ? 'selected' : ''}`}
                        onClick={() => {
                          setCountdownMinutes(mins);
                          setElapsedSeconds(0);
                        }}
                      >
                        {toPersianDigits(mins)} دقیقه
                      </button>
                    ))}
                  </div>
                )}

                {/* Animated Circular Digital Clock Dial */}
                <div className="timer-dial-container">
                  <div className={`timer-ring ${isRunning ? 'running' : ''}`}>
                    {mode === 'countdown' && (
                      <svg className="timer-svg-circle" viewBox="0 0 200 200">
                        <circle
                          cx="100"
                          cy="100"
                          r="90"
                          className="circle-bg"
                        />
                        <circle
                          cx="100"
                          cy="100"
                          r="90"
                          className="circle-progress"
                          style={{
                            strokeDashoffset: 565 - (565 * countdownProgressPercent) / 100
                          }}
                        />
                      </svg>
                    )}
                    <div className="digital-display">
                      <span className="digital-numbers">
                        {toPersianDigits(formattedDigital)}
                      </span>
                      <span className="digital-status">
                        {isRunning
                          ? mode === 'countdown'
                            ? '⏳ در حال شمارش معکوس...'
                            : '⚡ پارت مطالعاتی فعال'
                          : elapsedSeconds > 0
                          ? '⏸ متوقف شده'
                          : 'آماده شروع مطالعه'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Time info badges */}
                {sessionStartTime && (
                  <div className="session-time-info">
                    <span>زمان شروع: <b>{toPersianDigits(sessionStartTime)}</b></span>
                    {elapsedSeconds > 0 && (
                      <span>
                        مدت مطالعه: <b>{toPersianDigits(Math.round(elapsedSeconds / 60))} دقیقه</b>
                      </span>
                    )}
                  </div>
                )}

                {/* Control Action Buttons */}
                <div className="timer-controls-grid">
                  {!isRunning ? (
                    <button
                      type="button"
                      className="btn-timer-primary start"
                      onClick={handleStartTimer}
                    >
                      ▶ {elapsedSeconds > 0 ? 'ادامه مطالعه' : 'شروع مطالعه'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-timer-primary pause"
                      onClick={handlePauseTimer}
                    >
                      ⏸ توقف موقت
                    </button>
                  )}

                  {elapsedSeconds > 0 && (
                    <button
                      type="button"
                      className="btn-timer-finish"
                      onClick={() => handleStopTimer(false)}
                    >
                      ⏹ اتمام و ثبت در برنامه
                    </button>
                  )}

                  {elapsedSeconds > 0 && !isRunning && (
                    <button
                      type="button"
                      className="btn-timer-reset"
                      onClick={handleResetTimer}
                    >
                      🔄 بازنشانی
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Step 2: Log session directly into study block */
              <form className="timer-log-form" onSubmit={handleSaveSession}>
                <div className="log-form-intro">
                  <span className="log-trophy">🎉</span>
                  <div>
                    <h3>عالی بود! خسته نباشی</h3>
                    <p>
                      پارت مطالعه شما به مدت{' '}
                      <b>{toPersianDigits(Math.round(elapsedSeconds / 60))} دقیقه</b> ثبت شد.
                      مشخصات درس را تکمیل و به برنامه اضافه کنید:
                    </p>
                  </div>
                </div>

                {/* Times pre-filled */}
                <div className="form-row-2">
                  <div className="log-field">
                    <label>ساعت شروع</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div className="log-field">
                    <label>ساعت پایان</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Lesson Selection with Quick Chips */}
                <div className="log-field">
                  <label>نام درس</label>
                  <input
                    type="text"
                    value={lesson}
                    onChange={(e) => setLesson(e.target.value)}
                    placeholder="نام درس را بنویسید یا از گزینه‌های زیر انتخاب کنید"
                    required
                  />
                  <div className="quick-lesson-chips">
                    {POPULAR_LESSONS.map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={`lesson-chip ${lesson === item ? 'active' : ''}`}
                        onClick={() => setLesson(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject / Topic */}
                <div className="log-field">
                  <label>مبحث / گفتار / فصل</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="مثلاً گفتار ۲ فصل اول، گوارش و جذب غذا..."
                  />
                </div>

                {/* Activity Types */}
                <div className="log-field">
                  <label>نوع فعالیت</label>
                  <div className="activity-chips-wrap">
                    <label className={`act-checkbox ${study ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={study}
                        onChange={(e) => setStudy(e.target.checked)}
                      />
                      <span>📖 مطالعه</span>
                    </label>
                    <label className={`act-checkbox ${cls ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={cls}
                        onChange={(e) => setCls(e.target.checked)}
                      />
                      <span>🎓 کلاس</span>
                    </label>
                    <label className={`act-checkbox ${review ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={review}
                        onChange={(e) => setReview(e.target.checked)}
                      />
                      <span>🔄 مرور</span>
                    </label>
                    <label className={`act-checkbox ${test ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={test}
                        onChange={(e) => setTest(e.target.checked)}
                      />
                      <span>📝 تست</span>
                    </label>
                  </div>
                </div>

                {/* Test Stats Panel */}
                <div className="log-test-panel">
                  <div className="test-inputs-grid">
                    <div className="test-field">
                      <label>تعداد کل تست</label>
                      <input
                        type="number"
                        min="0"
                        value={totalTests}
                        onChange={(e) => {
                          setTotalTests(e.target.value);
                          if (e.target.value && !test) setTest(true);
                        }}
                        placeholder="۰"
                      />
                    </div>
                    <div className="test-field">
                      <label>نادرست (غلط)</label>
                      <input
                        type="number"
                        min="0"
                        value={wrong}
                        onChange={(e) => setWrong(e.target.value)}
                        placeholder="۰"
                      />
                    </div>
                    <div className="test-field">
                      <label>نزده (سفید)</label>
                      <input
                        type="number"
                        min="0"
                        value={blank}
                        onChange={(e) => setBlank(e.target.value)}
                        placeholder="۰"
                      />
                    </div>
                  </div>
                  {parseInt(totalTests, 10) > 0 && (
                    <div className="test-live-stats">
                      <span>تست درست: <b>{toPersianDigits(testStats.correctCount)}</b></span>
                      <span>درصد پاسخگویی: <b className="pct-badge">{testStats.percentage}</b></span>
                    </div>
                  )}
                </div>

                {/* Description Textarea */}
                <div className="log-field">
                  <label>شرح و نکات مهم مطالعه</label>
                  <textarea
                    rows={2}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="خلاصه موارد خوانده شده، نکات تست‌ها، فرمول‌ها یا تکالیف بعدی..."
                  />
                </div>

                {/* Form Actions */}
                <div className="log-form-actions">
                  <button type="submit" className="btn-submit-log">
                    ➕ افزودن این پارت به برنامه امروز
                  </button>
                  <button
                    type="button"
                    className="btn-back-timer"
                    onClick={() => setStep('timer')}
                  >
                    بازگشت به تایمر
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
