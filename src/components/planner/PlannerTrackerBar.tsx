import React from 'react';
import { PlannerData } from '../../types';
import { toPersianDigits } from '../../utils';
import { ALL_UNITS, TRound, cnt, focusRound, setFocus, useTracker } from '../../trackerStore';
import { AutoPlanDay, overdueLinked, paceInfo } from '../../trackerPlan';
import { AutoPlanSheet } from '../tracker/AutoPlanSheet';
import '../tracker/tracker.css';

interface Props {
  data: PlannerData;
  /** put the days of an auto plan into the planner (through the planner's own undo history) */
  onApplyPlan: (days: AutoPlanDay[], round: TRound, minutes?: number) => number;
  /** move every overdue tracker card to today; returns how many moved */
  onMoveOverdue: () => number;
  onOpenTracker?: () => void;
}

type CssVars = React.CSSProperties & Record<string, string | number>;
const fa = (n: number) => toPersianDigits(n);

/** strip on top of the planner: the round you are working on, its pace / deadline, the backlog, and the auto planner */
export const PlannerTrackerBar: React.FC<Props> = ({ data, onApplyPlan, onMoveOverdue, onOpenTracker }) => {
  const s = useTracker();
  const [auto, setAuto] = React.useState(false);
  const r = focusRound(s);
  const total = ALL_UNITS.length;
  const done = cnt(s, ALL_UNITS, r.id);
  const p = total ? Math.round((done / total) * 100) : 0;
  const od = React.useMemo(() => overdueLinked(data), [data]);
  const pace = React.useMemo(() => paceInfo(s, r, ALL_UNITS), [s, r]);

  return (
    <div className="pl-trkbar" style={{ '--c': r.color } as CssVars}>
      <div className="tb-main">
        <div className="tb-rounds" role="group" aria-label="دور فعال">
          {s.rounds.map((x, i) => (
            <button key={x.id} type="button" className={x.id === r.id ? 'on' : ''} style={{ '--c': x.color } as CssVars} onClick={() => setFocus(x.id)} title={x.name}>{fa(i + 1)}</button>
          ))}
        </div>
        <div className="tb-info">
          <div className="tb-name"><b>{r.name}</b><span>{fa(p)}٪ · {fa(done)} از {fa(total)} بند</span></div>
          <span className="tb-bar"><i style={{ width: p + '%' }} /></span>
          <div className="tb-sub">
            {pace.perDay > 0 && <span>سرعت: {toPersianDigits(pace.perDay.toFixed(1))} بند در روز{pace.etaLabel ? ` · پایان ≈ ${pace.etaLabel}` : ''}</span>}
            {pace.daysLeft !== null && pace.remaining > 0 && (
              <span className={pace.late ? 'late' : 'ok'}>
                ددلاین {pace.daysLeft < 0 ? 'گذشته' : `${fa(pace.daysLeft)} روز دیگر`} · لازم: {toPersianDigits((pace.need || 0).toFixed(1))} بند در روز
              </span>
            )}
            {!pace.perDay && pace.daysLeft === null && <span>هنوز فعالیتی در ۱۴ روز اخیر ثبت نشده</span>}
          </div>
        </div>
      </div>
      <div className="tb-acts">
        {od.length > 0 && (
          <button type="button" className="tb-btn warn" onClick={onMoveOverdue} title="کارت‌های مباحثِ روزهای گذشته که انجام نشده‌اند">
            ⚠ {fa(od.length)} عقب‌افتاده · انتقال به امروز
          </button>
        )}
        <button type="button" className="tb-btn pri" onClick={() => setAuto(true)}>🎯 برنامه‌ریزی خودکار</button>
        {onOpenTracker && <button type="button" className="tb-btn" onClick={onOpenTracker}>📚 پیگیری مباحث</button>}
      </div>
      {auto && <AutoPlanSheet plannerData={data} onApply={onApplyPlan} onClose={() => setAuto(false)} />}
    </div>
  );
};
