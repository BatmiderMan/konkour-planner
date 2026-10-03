import React from 'react';
import { PlannerItem, StudyBlock } from '../../types';
import { calculateTestPercentage, createEmptyBlock, toPersianDigits } from '../../utils';
import { blockKindFor, gradeColor, loadPlannerData, patchPlannerItem, plannerItemToBlockFields } from '../../plannerStore';
import {
  LiveResult,
  cancelLivePlan,
  extendLivePlan,
  freezeLivePlan,
  liveElapsedMs,
  liveTotalPlannedSeconds,
  markLiveAlerted,
  pauseLivePlan,
  resumeLivePlan,
  useLivePlan
} from '../../livePlan';
import { confirmDialog } from '../../dialog';

interface LivePlanTimerProps {
  // Called when the user saves the finished session. The parent puts the block into the
  // report of `dateKey` (creating that day if needed).
  onSaveToReport: (dateKey: string, item: PlannerItem, block: StudyBlock) => void;
}

const fmt = (totalSec: number): string => {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

function beep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (at: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.4);
    };
    play(0);
    play(0.5);
    play(1.0);
    setTimeout(() => ctx.close && ctx.close(), 2000);
  } catch {
    // audio is optional
  }
}

export const LivePlanTimer: React.FC<LivePlanTimerProps> = ({ onSaveToReport }) => {
  const live = useLivePlan();
  const [expanded, setExpanded] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  const [result, setResult] = React.useState<LiveResult | null>(null);

  // finish form
  const [lesson, setLesson] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [study, setStudy] = React.useState(true);
  const [cls, setCls] = React.useState(false);
  const [review, setReview] = React.useState(false);
  const [test, setTest] = React.useState(false);
  const [totalTests, setTotalTests] = React.useState('');
  const [wrong, setWrong] = React.useState('');
  const [blank, setBlank] = React.useState('');

  const sessionKey = live ? `${live.dateKey}|${live.item.id}|${live.startedAtClock}` : '';
  const wakeRef = React.useRef<any>(null);

  // a brand-new session opens the sheet (a session restored after a reload stays minimized)
  const prevKey = React.useRef(sessionKey);
  React.useEffect(() => {
    if (sessionKey && sessionKey !== prevKey.current) {
      setExpanded(true);
      setResult(null);
    }
    prevKey.current = sessionKey;
  }, [sessionKey]);

  // ticker (timestamp based, so background throttling can't make it drift)
  const running = !!live && live.running;
  React.useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [running]);

  // keep the screen awake while running
  React.useEffect(() => {
    const req = async () => {
      try {
        if ('wakeLock' in navigator) wakeRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {
        // not critical
      }
    };
    const rel = () => {
      if (wakeRef.current) {
        wakeRef.current.release().catch(() => {});
        wakeRef.current = null;
      }
    };
    if (running) req();
    else rel();
    const onVis = () => {
      if (document.visibilityState === 'visible' && running) req();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      rel();
    };
  }, [running]);

  const elapsedSec = live ? Math.floor(liveElapsedMs(live, now) / 1000) : 0;
  const totalSec = live ? liveTotalPlannedSeconds(live) : 0;

  // planned time reached -> alert once, and pop the sheet open
  React.useEffect(() => {
    if (live && live.running && !live.alerted && elapsedSec >= totalSec) {
      markLiveAlerted();
      setExpanded(true);
      beep();
      try {
        navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]);
      } catch {
        // ignore
      }
    }
  }, [live, elapsedSec, totalSec]);

  if (!live) return null;

  const overtime = elapsedSec > totalSec;
  const remaining = totalSec - elapsedSec;
  const shownSec = overtime ? elapsedSec - totalSec : Math.max(0, remaining);
  const progress = totalSec > 0 ? Math.min(100, Math.round((elapsedSec / totalSec) * 100)) : 0;
  const item = live.item;
  const color = gradeColor(item.grade);

  const handleFinish = () => {
    const r = freezeLivePlan();
    if (!r) return;
    const data = loadPlannerData();
    const kind = blockKindFor(r.session.item, data.sourceTypes);
    const fields = plannerItemToBlockFields(r.session.item);
    setLesson(fields.lesson);
    setSubject(fields.subject);
    setDesc(fields.desc);
    setStartTime(r.start);
    setEndTime(r.end);
    setStudy(kind !== 'test');
    setCls(false);
    setReview(false);
    setTest(kind === 'test');
    setTotalTests('');
    setWrong('');
    setBlank('');
    setResult(r);
    setExpanded(true);
  };

  const handleCancel = async () => {
    const ok = await confirmDialog('این پلن زنده لغو شود؟ زمان ثبت‌شده در گزارش وارد نمی‌شود.');
    if (!ok) return;
    cancelLivePlan();
    setResult(null);
  };

  const handleBackToTimer = () => {
    setResult(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!result) return;
    const block: StudyBlock = {
      ...createEmptyBlock(),
      lesson: lesson.trim() || result.session.item.subject || 'مطالعه آزاد',
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
    const { dateKey, item: it } = result.session;
    onSaveToReport(dateKey, it, block);
    patchPlannerItem(dateKey, it.id, { done: true, sentToReport: true });
    cancelLivePlan();
    setResult(null);
  };

  const testStats = calculateTestPercentage(totalTests, wrong, blank);
  const RING = 2 * Math.PI * 90;

  // ---------- minimized pill ----------
  if (!expanded && !result) {
    return (
      <div className={'live-pill' + (overtime ? ' over' : '') + (live.running ? '' : ' paused')} role="status">
        <button type="button" className="live-pill-main" onClick={() => setExpanded(true)} aria-label="باز کردن پلن زنده">
          <i className="pl-live-dot" />
          <span className="live-pill-name">{item.subject}</span>
          <span className="live-pill-time">
            {overtime ? '+' : ''}
            {toPersianDigits(fmt(shownSec))}
          </span>
        </button>
        <button
          type="button"
          className="live-pill-toggle"
          onClick={() => (live.running ? pauseLivePlan() : resumeLivePlan())}
          aria-label={live.running ? 'توقف موقت' : 'ادامه'}
        >
          {live.running ? '⏸' : '▶'}
        </button>
      </div>
    );
  }

  return (
    <div className="live-backdrop" onClick={() => !result && setExpanded(false)}>
      <div className="live-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ ['--c' as any]: color }}>
        <div className="live-head">
          <div className="live-head-title">
            <i className="pl-live-dot" />
            <div>
              <h2>{result ? 'پایان پلن — ثبت در گزارش' : 'پلن زنده'}</h2>
              <span>گزارش روز {toPersianDigits(live.dateKey)}</span>
            </div>
          </div>
          {!result && (
            <button type="button" className="live-min-btn" onClick={() => setExpanded(false)} aria-label="کوچک کردن">
              ⌄ کوچک‌کردن
            </button>
          )}
        </div>

        <div className="live-card">
          <span className="live-card-grade">{item.grade}</span>
          <b>{item.subject}</b>
          {item.detail && <span className="live-card-detail">{item.detail}</span>}
          {item.source && <span className="live-card-book">📕 {item.source}</span>}
        </div>

        {!result ? (
          <div className="live-body">
            <div className={'live-dial' + (overtime ? ' over' : '') + (live.running ? ' running' : '')}>
              <svg viewBox="0 0 200 200" aria-hidden="true">
                <circle cx="100" cy="100" r="90" className="live-ring-bg" />
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  className="live-ring-fg"
                  style={{ strokeDasharray: RING, strokeDashoffset: RING - (RING * progress) / 100 }}
                />
              </svg>
              <div className="live-dial-text">
                <span className="live-time">
                  {overtime ? '+' : ''}
                  {toPersianDigits(fmt(shownSec))}
                </span>
                <span className="live-status">
                  {overtime
                    ? '⏰ از زمان برنامه گذشته‌ای'
                    : live.running
                    ? 'باقی‌مانده تا پایان برنامه'
                    : '⏸ متوقف شده'}
                </span>
              </div>
            </div>

            <div className="live-facts">
              <span>
                شروع: <b>{toPersianDigits(live.startedAtClock)}</b>
              </span>
              <span>
                برنامه: <b>{toPersianDigits(Math.round(totalSec / 60))} دقیقه</b>
              </span>
              <span>
                مطالعه: <b>{toPersianDigits(Math.floor(elapsedSec / 60))} دقیقه</b>
              </span>
            </div>

            <div className="live-controls">
              {live.running ? (
                <button type="button" className="live-btn pause" onClick={pauseLivePlan}>
                  ⏸ توقف موقت
                </button>
              ) : (
                <button type="button" className="live-btn go" onClick={resumeLivePlan}>
                  ▶ ادامه
                </button>
              )}
              <button type="button" className="live-btn finish" onClick={handleFinish}>
                ⏹ اتمام و ثبت در گزارش
              </button>
              <div className="live-controls-row">
                <button type="button" className="live-btn ghost" onClick={() => extendLivePlan(5)}>
                  ＋۵ دقیقه
                </button>
                <button type="button" className="live-btn ghost danger" onClick={handleCancel}>
                  لغو پلن
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form className="live-form" onSubmit={handleSave}>
            <p className="live-form-intro">
              🎉 خسته نباشی! <b>{toPersianDigits(Math.round(result.activeSeconds / 60))} دقیقه</b> مطالعه‌ی مفید ثبت شد
              {live.pauses > 0 ? ' (زمان توقف‌ها حساب نشده)' : ''}. اطلاعات را بررسی کن:
            </p>

            <div className="live-row2">
              <label className="live-field">
                <span>ساعت شروع</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </label>
              <label className="live-field">
                <span>ساعت پایان</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </label>
            </div>

            <label className="live-field">
              <span>نام درس</span>
              <input type="text" value={lesson} onChange={(e) => setLesson(e.target.value)} required />
            </label>
            <label className="live-field">
              <span>مبحث / گفتار / فصل</span>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="اختیاری" />
            </label>

            <div className="live-acts">
              {(
                [
                  ['📖 مطالعه', study, setStudy],
                  ['🎓 کلاس', cls, setCls],
                  ['🔄 مرور', review, setReview],
                  ['📝 تست', test, setTest]
                ] as [string, boolean, (v: boolean) => void][]
              ).map(([label, val, set]) => (
                <button key={label} type="button" className={'live-act' + (val ? ' on' : '')} onClick={() => set(!val)}>
                  {label}
                </button>
              ))}
            </div>

            {test && (
              <div className="live-test">
                <label className="live-field">
                  <span>کل تست</span>
                  <input type="number" inputMode="numeric" min="0" value={totalTests} onChange={(e) => setTotalTests(e.target.value)} placeholder="۰" />
                </label>
                <label className="live-field">
                  <span>غلط</span>
                  <input type="number" inputMode="numeric" min="0" value={wrong} onChange={(e) => setWrong(e.target.value)} placeholder="۰" />
                </label>
                <label className="live-field">
                  <span>نزده</span>
                  <input type="number" inputMode="numeric" min="0" value={blank} onChange={(e) => setBlank(e.target.value)} placeholder="۰" />
                </label>
                {parseInt(totalTests, 10) > 0 && (
                  <div className="live-test-stats">
                    درست: <b>{toPersianDigits(testStats.correctCount)}</b> · درصد: <b>{testStats.percentage}</b>
                  </div>
                )}
              </div>
            )}

            <label className="live-field">
              <span>شرح و نکات</span>
              <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </label>

            <div className="live-controls">
              <button type="submit" className="live-btn finish">
                ➕ ثبت در گزارش {toPersianDigits(live.dateKey)}
              </button>
              <button type="button" className="live-btn ghost" onClick={handleBackToTimer}>
                بازگشت به تایمر
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
