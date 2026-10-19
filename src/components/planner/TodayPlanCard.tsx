import React from 'react';
import { PlannerItem } from '../../types';
import { gradeColor, hashColor, loadPlannerData, savePlannerData, markPlannerItemSent, reportMetaFor, SendMeta } from '../../plannerStore';
import { computeDayPlan } from '../../plannerSchedule';
import { toPersianDigits } from '../../utils';
import { requestLiveStart, useLivePlan } from '../../livePlan';

interface TodayPlanCardProps {
  dateKey: string; // Jalali "YYYY/MM/DD" of the day currently open in the report
  onGoToPlanner: () => void;
  onSendToReport: (item: PlannerItem, meta: SendMeta) => void;
  refreshToken: number; // bump this to force a re-read from storage (e.g. after sending an item)
}

export const TodayPlanCard: React.FC<TodayPlanCardProps> = ({ dateKey, onGoToPlanner, onSendToReport, refreshToken }) => {
  const live = useLivePlan();
  const [items, setItems] = React.useState<PlannerItem[]>([]);
  const [sourceColors, setSourceColors] = React.useState<Record<string, string>>({});
  const [times, setTimes] = React.useState<Record<string, string>>({}); // item id -> "HH:MM–HH:MM"

  React.useEffect(() => {
    if (!dateKey) { setItems([]); return; }
    const data = loadPlannerData();
    setItems(data.items[dateKey] || []);
    setSourceColors(data.sourceColors);
    const list = data.items[dateKey] || [];
    if (data.timeline[dateKey]) {
      const plan = computeDayPlan(list, dateKey, data.schedule);
      const t: Record<string, string> = {};
      list.forEach((it, i) => { t[it.id] = `${plan.slots[i].start}–${plan.slots[i].end}`; });
      setTimes(t);
    } else {
      setTimes({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, refreshToken]);

  const toggleDone = (id: string) => {
    const data = loadPlannerData();
    const list = (data.items[dateKey] || []).map((it) => (it.id === id ? { ...it, done: !it.done } : it));
    data.items[dateKey] = list;
    savePlannerData(data);
    setItems(list);
  };

  const sendToReport = (item: PlannerItem) => {
    const meta = reportMetaFor(loadPlannerData(), dateKey, item);
    markPlannerItemSent(dateKey, item.id);
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, sentToReport: true } : it)));
    onSendToReport(item, meta);
  };

  if (!dateKey || !items.length) return null;

  return (
    <div className="today-plan-card">
      <div className="today-plan-head">
        <span>🗓 برنامه‌ریزی‌شده برای این روز</span>
        <button type="button" className="today-plan-link" onClick={onGoToPlanner}>
          مشاهده در برنامه‌ریز ←
        </button>
      </div>
      <div className="today-plan-items">
        {items.map((it) => (
          <div
            key={it.id}
            className={'today-plan-item' + (it.done ? ' done' : '')}
            style={{
              ['--c' as any]: gradeColor(it.grade),
              ['--src' as any]: it.source ? sourceColors[it.source] || hashColor(it.source) : undefined
            }}
          >
            <span className="today-plan-chk" onClick={() => toggleDone(it.id)}>{it.done ? '✓' : ''}</span>
            <span className="today-plan-text">
              {times[it.id] && <span className="today-plan-time">{toPersianDigits(times[it.id])}</span>}
              <b>{it.subject}</b>
              {it.detail ? ` — ${it.detail}` : ''}
            </span>
            {!it.sentToReport && !(live && live.dateKey === dateKey && live.item.id === it.id) && (
              <button type="button" className="today-plan-live" title="شروع زنده" aria-label="شروع زنده" onClick={() => requestLiveStart(dateKey, it)}>
                ▶
              </button>
            )}
            {live && live.dateKey === dateKey && live.item.id === it.id && (
              <span className="today-plan-sent live"><i className="pl-live-dot" />زنده</span>
            )}
            {!it.sentToReport && (
              <button type="button" className="today-plan-send" title="افزودن به این گزارش" onClick={() => sendToReport(it)}>
                ⇥
              </button>
            )}
            {it.sentToReport && <span className="today-plan-sent">در گزارش ✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
