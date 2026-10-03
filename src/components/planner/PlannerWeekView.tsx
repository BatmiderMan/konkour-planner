import React from 'react';
import { PlannerData, PlannerGrade, PlannerItem } from '../../types';
import { PERSIAN_MONTH_NAMES, PERSIAN_WEEK_DAYS } from '../../jalali';
import { toPersianDigits } from '../../utils';
import { PLANNER_GRADES, PlannerItemInput, addDays, dateKeyOf, jalaliOfDate } from '../../plannerStore';
import { PlannerItemForm } from './PlannerItemForm';
import { PlannerItemRow } from './PlannerItemRow';
import { getDayDropProps, usePlannerInteraction } from './plannerInteraction';
import { DayTimelineBar } from './DayTimelineBar';
import { computeDayPlan } from '../../plannerSchedule';
import { DayRestRow, breakLabel } from './DayRestRow';

interface PlannerWeekViewProps {
  data: PlannerData;
  weekStart: Date;
  search: string;
  gradeFilter: 'all' | PlannerGrade;
  onAddItem: (dateKey: string, item: PlannerItemInput) => void;
  onUpdateItem: (dateKey: string, id: string, item: PlannerItemInput) => void;
  onToggleDone: (dateKey: string, id: string) => void;
  onDeleteItem: (dateKey: string, id: string) => void;
  onSendToReport: (dateKey: string, item: PlannerItem) => void;
  onToggleTimeline: (dateKey: string, on: boolean) => void;
  onAddRest: (dateKey: string, r: { label: string; icon: string; start: string; end: string }) => void;
  onRemoveRest: (dateKey: string, id: string) => void;
}

function matches(it: PlannerItem, search: string, gradeFilter: 'all' | PlannerGrade): boolean {
  if (gradeFilter !== 'all' && it.grade !== gradeFilter) return false;
  if (!search) return true;
  const hay = `${it.subject} ${it.detail} ${it.source || ''}`.toLowerCase();
  return hay.includes(search.toLowerCase());
}

export const PlannerWeekView: React.FC<PlannerWeekViewProps> = ({
  data,
  weekStart,
  search,
  gradeFilter,
  onAddItem,
  onUpdateItem,
  onToggleDone,
  onDeleteItem,
  onSendToReport,
  onToggleTimeline,
  onAddRest,
  onRemoveRest
}) => {
  const ctx = usePlannerInteraction();
  const [openForm, setOpenForm] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<{ key: string; id: string } | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = dateKeyOf(new Date());

  const first = jalaliOfDate(days[0]);
  const last = jalaliOfDate(days[6]);

  let total = 0;
  let done = 0;
  const perGrade: Record<string, { t: number; d: number }> = {};
  PLANNER_GRADES.forEach((g) => (perGrade[g.id] = { t: 0, d: 0 }));
  days.forEach((d) => {
    const items = data.items[dateKeyOf(d)] || [];
    items.forEach((it) => {
      total++;
      if (it.done) done++;
      if (perGrade[it.grade]) {
        perGrade[it.grade].t++;
        if (it.done) perGrade[it.grade].d++;
      }
    });
  });

  return (
    <div className="pl-week-view">
      <div className="pl-weekhead">
        <div className="pl-weekhead-prog">
          <div className="pl-progress-track"><div className="pl-progress-fill" style={{ width: total ? `${(done / total) * 100}%` : '0%' }} /></div>
          <span>{toPersianDigits(done)} از {toPersianDigits(total)} پارت این هفته</span>
        </div>
        <div className="pl-weekhead-grades">
          {PLANNER_GRADES.map((g) => (
            <span key={g.id} className="pl-stat-chip"><span className="pl-stat-dot" style={{ background: g.c }} />{g.id} {toPersianDigits(perGrade[g.id].d)}/{toPersianDigits(perGrade[g.id].t)}</span>
          ))}
        </div>
      </div>

      <div className="pl-daystrip" role="tablist" aria-label="پرش به روز">
        {days.map((d, idx) => {
          const k = dateKeyOf(d);
          const list = data.items[k] || [];
          const left = list.filter((x) => !x.done).length;
          return (
            <button
              key={k}
              type="button"
              className={(k === todayKey ? 'today ' : '') + (list.length && !left ? 'complete' : '')}
              onClick={() => document.getElementById('pl-day-' + idx)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <span>{PERSIAN_WEEK_DAYS[idx].slice(0, 1)}</span>
              <b>{toPersianDigits(jalaliOfDate(d).jd)}</b>
              <i>{list.length ? toPersianDigits(left || '✓') : '·'}</i>
            </button>
          );
        })}
      </div>

      <div className="pl-board">
        {days.map((d, idx) => {
          const key = dateKeyOf(d);
          const items = data.items[key] || [];
          const visible = items.filter((it) => matches(it, search, gradeFilter));
          const doneInDay = items.filter((x) => x.done).length;
          const j = jalaliOfDate(d);
          const drop = getDayDropProps(ctx, key);
          const timed = !!data.timeline[key];
          const plan = timed ? computeDayPlan(items, key, data.schedule, data.dayRests[key]) : null;

          return (
            <div
              key={key}
              id={'pl-day-' + idx}
              className={
                'pl-day' +
                (key === todayKey ? ' today' : '') +
                (drop.over ? ' drop-over' : '') +
                (ctx && ctx.activeKey === key ? ' active-day' : '')
              }
              onMouseEnter={() => ctx && ctx.setActiveKey(key)}
              {...drop.props}
            >
              <div className="pl-day-info">
                <div className="pl-day-head">
                  <span className="pl-day-name">{PERSIAN_WEEK_DAYS[idx]}</span>
                  <span className="pl-day-date">
                    {toPersianDigits(j.jd)} {PERSIAN_MONTH_NAMES[j.jm - 1]}
                  </span>
                </div>
                <div className="pl-day-count">
                  {items.length ? `${toPersianDigits(doneInDay)} از ${toPersianDigits(items.length)} انجام شده` : '—'}
                </div>
                <DayTimelineBar dateKey={key} data={data} onToggle={onToggleTimeline} onAddRest={onAddRest} />
                {ctx && (
                  <div className="pl-day-tools">
                    {items.length > 0 && (
                      <button
                        type="button"
                        title="کپی همه‌ی پارت‌های این روز"
                        onClick={() => ctx.copyRefs(items.map((it) => ({ key, id: it.id })), true)}
                      >
                        ⧉ کپی روز
                      </button>
                    )}
                    {ctx.clipboardCount > 0 && (
                      <button type="button" className="paste" title="چسباندن در این روز (Ctrl+V)" onClick={() => ctx.pasteTo(key)}>
                        📋 چسباندن ({toPersianDigits(ctx.clipboardCount)})
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div
                className="pl-day-body"
                onDoubleClick={(e) => {
                  const t = e.target as HTMLElement;
                  if (t.closest('.pl-item, .pl-form, button')) return;
                  setOpenForm(key);
                  setEditing(null);
                }}
              >
                <div className={'pl-items' + (timed ? ' timeline' : '')}>
                  {!visible.length && (
                    <div className="pl-empty">{items.length ? 'موردی با این فیلتر نیست' : 'هنوز چیزی ثبت نشده'}</div>
                  )}
                  {visible.map((it, vi) => {
                    const fullIdx = items.indexOf(it);
                    const prevVisible = vi > 0 ? visible[vi - 1] : null;
                    const slotHere = plan ? plan.slots[fullIdx] : undefined;
                    const showBreak = !!slotHere && slotHere.breakBefore > 0 && !!prevVisible && items.indexOf(prevVisible) === fullIdx - 1;
                    const restsHere = plan ? plan.rests.filter((r) => r.beforeIndex === fullIdx) : [];
                    return (
                    <React.Fragment key={it.id}>
                      {restsHere.map((r) => (
                        <DayRestRow key={r.id} rest={r} onRemove={() => onRemoveRest(key, r.id)} />
                      ))}
                      {showBreak && slotHere && (
                        <div className="pl-break">{breakLabel(slotHere.breakBefore, slotHere.longBreak)}</div>
                      )}
                      <PlannerItemRow
                        item={it}
                        dateKey={key}
                        sourceColors={data.sourceColors}
                        sourceTypes={data.sourceTypes}
                        slot={plan ? plan.slots[fullIdx] : undefined}
                        edge={items.length === 1 ? 'only' : fullIdx === 0 ? 'first' : fullIdx === items.length - 1 ? 'last' : null}
                        onToggleDone={() => onToggleDone(key, it.id)}
                        onEdit={() => { setEditing({ key, id: it.id }); setOpenForm(null); }}
                        onDelete={() => onDeleteItem(key, it.id)}
                        onSendToReport={() => onSendToReport(key, it)}
                      />
                      {editing && editing.key === key && editing.id === it.id && (
                        <PlannerItemForm
                          subjects={data.subjects}
                          sourceColors={data.sourceColors}
                          sourceTypes={data.sourceTypes}
                          defaultMinutes={data.schedule.partMinutes}
                          existing={it}
                          onCancel={() => setEditing(null)}
                          onSave={(vals) => { onUpdateItem(key, it.id, vals); setEditing(null); }}
                        />
                      )}
                    </React.Fragment>
                    );
                  })}
                  {plan && plan.rests.filter((r) => r.beforeIndex >= items.length).map((r) => (
                    <DayRestRow key={r.id} rest={r} onRemove={() => onRemoveRest(key, r.id)} />
                  ))}
                </div>

                <div className="pl-add-row">
                  {openForm === key ? (
                    <PlannerItemForm
                      subjects={data.subjects}
                      sourceColors={data.sourceColors}
                      sourceTypes={data.sourceTypes}
                      defaultMinutes={data.schedule.partMinutes}
                      onCancel={() => setOpenForm(null)}
                      onSave={(vals) => { onAddItem(key, vals); setOpenForm(null); }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="pl-add-btn"
                      onClick={() => { setOpenForm(key); setEditing(null); }}
                    >
                      + افزودن درس
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
