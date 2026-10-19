import React from 'react';
import { Play, Check, SkipForward, ArrowLeftToLine, CalendarClock, Sparkles, Undo2 } from 'lucide-react';
import { PlannerItem } from '../types';
import {
  loadPlannerData, savePlannerData, dateKeyOf, todayGregorian, addDays, gradeColor,
  markPlannerItemSent, reportMetaFor, moveItemsByDays, jalaliOfDate, SendMeta
} from '../plannerStore';
import { computeDayPlan, itemMinutes, formatDuration, timeToMin } from '../plannerSchedule';
import { PERSIAN_WEEK_DAYS, PERSIAN_MONTH_NAMES } from '../jalali';
import { toPersianDigits } from '../utils';
import { requestLiveStart, useLivePlan } from '../livePlan';
import { loadScheduleState, todayBrief, displayTitle, INST_META } from '../schedule/scheduleStore';
import { whenText } from './ScheduleView';

interface Props {
  refreshToken: number;
  onOpenPlanner: () => void;
  onOpenSchedule?: () => void;
  onSendToReport: (dateKey: string, item: PlannerItem, meta?: SendMeta) => void;
}

const fd = (m: number) => toPersianDigits(formatDuration(m));
const RING = 2 * Math.PI * 52;

export const TodayView: React.FC<Props> = ({ refreshToken, onOpenPlanner, onOpenSchedule, onSendToReport }) => {
  const live = useLivePlan();
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const [skipped, setSkipped] = React.useState<string[]>([]);
  const today = todayGregorian();
  const key = dateKeyOf(today);
  const yKey = dateKeyOf(addDays(today, -1));
  const data = loadPlannerData(); // re-read each render: storage is the single source of truth
  void refreshToken;
  const items = data.items[key] || [];
  const plan = computeDayPlan(items, key, data.schedule, data.dayRests[key]);
  const late = (data.items[yKey] || []).filter((i) => !i.done && !i.sentToReport);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const doneCount = items.filter((i) => i.done).length;
  const totalMin = items.reduce((a, i) => a + itemMinutes(i, data.schedule), 0);
  const doneMin = items.filter((i) => i.done).reduce((a, i) => a + itemMinutes(i, data.schedule), 0);
  const pct = totalMin ? doneMin / totalMin : 0;

  const nextIdx = items.findIndex((it, i) => !it.done && plan.slots[i] && plan.slots[i].endMin > nowMin);
  const baseIdx = nextIdx >= 0 ? nextIdx : items.findIndex((i) => !i.done);
  const pendingIdx = items.map((it, i) => (!it.done ? i : -1)).filter((i) => i >= 0);
  const pool = pendingIdx.filter((i) => !skipped.includes(items[i].id));
  const focusIdx = pool.length ? (pool.includes(baseIdx) ? baseIdx : pool[0]) : baseIdx;
  const canSkip = pendingIdx.length > 1;
  const focus = focusIdx >= 0 ? items[focusIdx] : null;
  const focusSlot = focus ? plan.slots[focusIdx] : null;
  const isLiveFocus = !!(live && focus && live.dateKey === key && live.item.id === focus.id);
  const overflow = items.filter((_, i) => plan.slots[i]?.overflow && !items[i].done);

  const j = jalaliOfDate(today);
  const h = now.getHours();
  const greet = h < 5 ? 'شب‌بخیر' : h < 12 ? 'صبح‌بخیر' : h < 17 ? 'ظهر‌بخیر' : h < 20 ? 'عصر‌بخیر' : 'شب‌بخیر';
  const wd = PERSIAN_WEEK_DAYS[(today.getDay() + 1) % 7];

  const commit = (d: ReturnType<typeof loadPlannerData>) => { savePlannerData(d); bump(); };
  const toggle = (id: string) => {
    const d = loadPlannerData();
    d.items[key] = (d.items[key] || []).map((it) => (it.id === id ? { ...it, done: !it.done } : it));
    commit(d);
  };
  const send = (it: PlannerItem) => {
    const meta = reportMetaFor(loadPlannerData(), key, it);
    markPlannerItemSent(key, it.id);
    onSendToReport(key, it, meta);
    bump();
  };
  const moveTo = (fromKey: string, list: PlannerItem[], offset: number) => {
    commit(moveItemsByDays(loadPlannerData(), list.map((i) => ({ key: fromKey, id: i.id })), offset).data);
  };

  // What is left, said in plain words
  const remainMin = totalMin - doneMin;
  const winEnd = timeToMin(plan.windowEnd) ?? 0;
  const roomLeft = Math.max(0, winEnd - Math.max(nowMin, timeToMin(plan.windowStart) ?? 0));
  const verdict = !items.length ? '' : remainMin === 0 ? 'همه‌ی پارت‌های امروز انجام شد. عالی بود.'
    : remainMin > roomLeft ? `${fd(remainMin - roomLeft)} بیشتر از زمان باقی‌مانده برنامه داری.`
    : `${fd(remainMin)} کار مانده و ${fd(roomLeft - remainMin)} زمان آزاد داری.`;

  return (
    <main className="td">
      <header className="td-hero">
        <div className="td-hello">
          <span className="td-hello-sub">{wd} {toPersianDigits(j.jd)} {PERSIAN_MONTH_NAMES[j.jm - 1]}</span>
          <h1>{greet}</h1>
          <p>{items.length ? verdict : 'برای امروز هنوز پارتی نچیده‌ای.'}</p>
        </div>
        <div className="td-ring" role="img" aria-label={`پیشرفت امروز ${toPersianDigits(Math.round(pct * 100))} درصد`}>
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" className="td-ring-bg" />
            <circle cx="60" cy="60" r="52" className="td-ring-fg" strokeDasharray={RING} strokeDashoffset={RING * (1 - pct)} />
          </svg>
          <div><b>{toPersianDigits(doneCount)}<i>/{toPersianDigits(items.length)}</i></b><span>پارت</span></div>
        </div>
      </header>

      {onOpenSchedule && (() => {
        const b = todayBrief(loadScheduleState());
        if (!b || b.days > 21) return null;
        return (
          <button type="button" className={'td-exam' + (b.days <= 3 ? ' hot' : '')} style={{ ['--c' as any]: INST_META[b.exam.inst].color }} onClick={onOpenSchedule}>
            <span className="td-exam-when">{whenText(b.days)}</span>
            <span className="td-exam-body"><b>{displayTitle(b.exam)}</b><em>{b.topics.slice(0, 3).join(' · ') || b.exam.phase || ''}</em></span>
            <span className="td-exam-pct">{toPersianDigits(b.ready.pct)}٪<small>آماده</small></span>
          </button>
        );
      })()}

      {focus && focusSlot && (
        <section className={'td-focus' + (isLiveFocus ? ' live' : '')} style={{ ['--c' as any]: gradeColor(focus.grade) }}>
          <div className="td-focus-meta">
            <span className="td-chip">{isLiveFocus ? 'در حال مطالعه' : focusSlot.startMin <= nowMin ? 'همین حالا' : 'پارت بعدی'}</span>
            <span className="td-time">{toPersianDigits(`${focusSlot.start}–${focusSlot.end}`)}</span>
          </div>
          <h2>{focus.subject}</h2>
          <p>{focus.detail || focus.source || focus.grade}</p>
          <div className="td-focus-actions">
            {!isLiveFocus && <button className="td-btn primary" onClick={() => requestLiveStart(key, focus)}><Play size={18} />شروع مطالعه</button>}
            <button className="td-btn" onClick={() => toggle(focus.id)}><Check size={18} />انجام شد</button>
            {canSkip && !isLiveFocus && (
              <button className="td-btn ghost" onClick={() => setSkipped((s) => (pool.length > 1 ? [...s, focus.id] : []))}><SkipForward size={18} />پارت بعدی</button>
            )}
          </div>
        </section>
      )}

      {(late.length > 0 || overflow.length > 0) && (
        <section className="td-smart">
          <Sparkles size={18} />
          <div>
            {late.length > 0 && (
              <p>{toPersianDigits(late.length)} پارت دیروز ناتمام مانده.
                <button onClick={() => moveTo(yKey, late, 1)}><Undo2 size={14} />بیاور به امروز</button></p>
            )}
            {overflow.length > 0 && (
              <p>{toPersianDigits(overflow.length)} پارت از بازه‌ی مطالعه‌ی امروز بیرون می‌زند.
                <button onClick={() => moveTo(key, overflow, 1)}><CalendarClock size={14} />بفرست برای فردا</button></p>
            )}
          </div>
        </section>
      )}

      <section className="td-list" aria-label="برنامه‌ی امروز">
        {items.map((it, i) => {
          const s = plan.slots[i];
          const rests = plan.rests.filter((r) => r.beforeIndex === i);
          const current = i === focusIdx;
          return (
            <React.Fragment key={it.id}>
              {rests.map((r) => (
                <div key={r.id} className="td-rest"><span>{r.icon}</span>{r.label}<em>{toPersianDigits(`${r.start}–${r.end}`)}</em></div>
              ))}
              <div className={'td-row' + (it.done ? ' done' : '') + (current ? ' current' : '')} style={{ ['--c' as any]: gradeColor(it.grade) }}>
                <button className="td-check" aria-label={it.done ? 'برگرداندن' : 'انجام شد'} aria-pressed={it.done} onClick={() => toggle(it.id)}>{it.done && <Check size={16} strokeWidth={3} />}</button>
                <div className="td-row-time">{toPersianDigits(s.start)}<span>{fd(s.minutes)}</span></div>
                <div className="td-row-body"><b>{it.subject}</b><span>{it.detail || it.source}</span></div>
                {it.sentToReport
                  ? <span className="td-sent">در گزارش</span>
                  : <button className="td-icon" title="افزودن به گزارش امروز" onClick={() => send(it)}><ArrowLeftToLine size={18} /></button>}
              </div>
            </React.Fragment>
          );
        })}
        {!items.length && (
          <div className="td-empty">
            <p>یک روز خالی، یک فرصت است.</p>
            <button className="td-btn primary" onClick={onOpenPlanner}>چیدن برنامه‌ی امروز</button>
          </div>
        )}
      </section>
      {items.length > 0 && <button className="td-link" onClick={onOpenPlanner}>ویرایش در برنامه‌ریز</button>}
    </main>
  );
};
