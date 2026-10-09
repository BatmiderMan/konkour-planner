import React from 'react';
import { PlannerData, PlannerGrade, PlannerItem } from '../../types';
import { PERSIAN_MONTH_NAMES, PERSIAN_WEEK_DAYS } from '../../jalali';
import { toPersianDigits } from '../../utils';
import {
  PLANNER_GRADES,
  PlannerItemInput,
  addDays,
  dateKeyOf,
  gradeColor,
  jalaliOfDate,
  monthLenFromAnchor
} from '../../plannerStore';
import { PlannerItemForm } from './PlannerItemForm';
import { PlannerItemRow } from './PlannerItemRow';
import { getDayDropProps, usePlannerInteraction } from './plannerInteraction';
import { DayTimelineBar } from './DayTimelineBar';
import { computeDayPlan, itemMinutes, formatDuration } from '../../plannerSchedule';
import { DayRestRow, breakLabel } from './DayRestRow';

interface PlannerMonthViewProps {
  data: PlannerData;
  monthAnchor: Date;
  selectedKey: string;
  selectedDate: Date;
  onSelectDay: (key: string, dayDate: Date) => void;
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
  onJumpToWeek: (dayDate: Date) => void;
}

function matches(it: PlannerItem, search: string, gradeFilter: 'all' | PlannerGrade): boolean {
  if (gradeFilter !== 'all' && it.grade !== gradeFilter) return false;
  if (!search) return true;
  const hay = `${it.subject} ${it.detail} ${it.source || ''}`.toLowerCase();
  return hay.includes(search.toLowerCase());
}

export const PlannerMonthView: React.FC<PlannerMonthViewProps> = ({
  data,
  monthAnchor,
  selectedKey,
  selectedDate,
  onSelectDay,
  search,
  gradeFilter,
  onAddItem,
  onUpdateItem,
  onToggleDone,
  onDeleteItem,
  onSendToReport,
  onToggleTimeline,
  onAddRest,
  onRemoveRest,
  onJumpToWeek
}) => {
  const ctx = usePlannerInteraction();
  const [openForm, setOpenForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const jAnchor = jalaliOfDate(monthAnchor);
  const mlen = monthLenFromAnchor(monthAnchor);
  const todayKey = dateKeyOf(new Date());
  const lead = (monthAnchor.getDay() + 1) % 7;
  const totalCells = Math.ceil((lead + mlen) / 7) * 7;

  let mTotal = 0;
  let mDone = 0;
  let mMin = 0;
  let mDoneMin = 0;
  let maxMin = 1;
  const minutesOf: Record<string, number> = {};
  const subj: Record<string, { t: number; d: number; c: string }> = {};
  const overdue: { key: string; id: string }[] = [];
  for (let d = 0; d < mlen; d++) {
    const k = dateKeyOf(addDays(monthAnchor, d));
    const its = data.items[k] || [];
    let dm = 0;
    its.forEach((it) => {
      const m = itemMinutes(it, data.schedule);
      mTotal++; dm += m; mMin += m;
      if (it.done) { mDone++; mDoneMin += m; }
      const sb = subj[it.subject] || (subj[it.subject] = { t: 0, d: 0, c: gradeColor(it.grade) });
      sb.t++; if (it.done) sb.d++;
      if (!it.done && k < todayKey) overdue.push({ key: k, id: it.id });
    });
    minutesOf[k] = dm;
    if (dm > maxMin) maxMin = dm;
  }
  const subjList = Object.keys(subj).map((n) => ({ n, ...subj[n] })).sort((x, y) => y.t - x.t).slice(0, 6);
  const fd = (m: number) => toPersianDigits(formatDuration(m));

  const panelDrop = getDayDropProps(ctx, selectedKey);
  const items = data.items[selectedKey] || [];
  const visible = items.filter((it) => matches(it, search, gradeFilter));
  const timed = !!data.timeline[selectedKey];
  const plan = timed ? computeDayPlan(items, selectedKey, data.schedule, data.dayRests[selectedKey]) : null;

  return (
    <div className="pl-month-view">
      <section className="pl-msum">
        <div className="pl-msum-main">
          <div className="pl-msum-nums">
            <div><b>{toPersianDigits(mDone)}<i>/{toPersianDigits(mTotal)}</i></b><span>پارت انجام‌شده</span></div>
            <div><b>{fd(mDoneMin)}</b><span>از {fd(mMin)} مطالعه</span></div>
            <div><b>{toPersianDigits(mTotal ? Math.round((mDone / mTotal) * 100) : 0)}٪</b><span>پیشرفت {PERSIAN_MONTH_NAMES[jAnchor.jm - 1]}</span></div>
          </div>
          <div className="pl-progress-track"><div className="pl-progress-fill" style={{ width: mTotal ? `${(mDone / mTotal) * 100}%` : '0%' }} /></div>
          {overdue.length > 0 && ctx && (
            <div className="pl-overdue">
              <span>⚠ {toPersianDigits(overdue.length)} پارت از روزهای گذشته انجام نشده</span>
              <button type="button" onClick={() => ctx.moveRefs(overdue, todayKey)}>بیاور به امروز</button>
            </div>
          )}
        </div>
        {subjList.length > 0 && (
          <div className="pl-msum-subj" aria-label="توزیع درس‌ها در این ماه">
            {subjList.map((x) => (
              <div key={x.n} className="pl-sbar" title={`${x.n}: ${toPersianDigits(x.d)} از ${toPersianDigits(x.t)}`}>
                <span className="pl-sbar-n">{x.n}</span>
                <span className="pl-sbar-t"><i style={{ width: `${(x.t / subjList[0].t) * 100}%`, background: x.c }}><u style={{ width: `${(x.d / x.t) * 100}%` }} /></i></span>
                <em>{toPersianDigits(x.t)}</em>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="pl-month-layout">
        <div className="pl-mgrid-wrap">
          <div className="pl-weekday-row">
            {PERSIAN_WEEK_DAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="pl-mgrid">
            {Array.from({ length: totalCells }, (_, c) => {
              const dt = addDays(monthAnchor, c - lead);
              const key = dateKeyOf(dt);
              const j = jalaliOfDate(dt);
              const inMonth = j.jm === jAnchor.jm;
              const cellItems = data.items[key] || [];
              const cellDrop = getDayDropProps(ctx, key);

              return (
                <div
                  key={key}
                  className={
                    'pl-mcell' +
                    (inMonth ? '' : ' other') +
                    (key === todayKey ? ' today' : '') +
                    (key === selectedKey ? ' selected' : '') +
                    (key < todayKey && cellItems.some((x) => !x.done) ? ' late' : '') +
                    (cellItems.length && cellItems.every((x) => x.done) ? ' full' : '') +
                    (cellDrop.over ? ' drop-over' : '')
                  }
                  {...cellDrop.props}
                  style={{ ['--heat' as any]: cellItems.length ? 0.12 + 0.5 * ((minutesOf[key] || 0) / maxMin) : 0 }}
                  onClick={() => { setOpenForm(false); setEditingId(null); onSelectDay(key, dt); }}
                  onDoubleClick={() => { setOpenForm(true); setEditingId(null); onSelectDay(key, dt); }}
                >
                  <div className="pl-dnum">{toPersianDigits(j.jd)}</div>
                  {cellItems.length > 0 && (
                    <>
                      <div className="pl-mpills">
                        {cellItems.slice(0, 3).map((it) => (
                          <span key={it.id} className={'pl-mpill' + (it.done ? ' done' : '')} style={{ ['--pc' as any]: gradeColor(it.grade) }}>{it.subject}</span>
                        ))}
                        {cellItems.length > 3 && <span className="pl-more">+{toPersianDigits(cellItems.length - 3)}</span>}
                      </div>
                      <div className="pl-mbar" title={`${toPersianDigits(cellItems.filter((x) => x.done).length)} از ${toPersianDigits(cellItems.length)} · ${fd(minutesOf[key] || 0)}`}>
                        <i style={{ width: `${(cellItems.filter((x) => x.done).length / cellItems.length) * 100}%` }} />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside className={'pl-day-panel' + (panelDrop.over ? ' drop-over' : '')} {...panelDrop.props}>
          <div className="pl-p-head">
            <span className="pl-p-title">{PERSIAN_WEEK_DAYS[(selectedDate.getDay() + 1) % 7]}</span>
          </div>
          <div className="pl-p-sub">
            {(() => {
              const j = jalaliOfDate(selectedDate);
              return `${toPersianDigits(j.jd)} ${PERSIAN_MONTH_NAMES[j.jm - 1]} ${toPersianDigits(j.jy)}`;
            })()}
          </div>

          <DayTimelineBar dateKey={selectedKey} data={data} onToggle={onToggleTimeline} onAddRest={onAddRest} />

          <div className={'pl-items' + (timed ? ' timeline' : '')}>
            {!visible.length && (
              <div className="pl-empty">{items.length ? 'موردی با این فیلتر نیست' : 'برای این روز چیزی ثبت نشده'}</div>
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
                  <DayRestRow key={r.id} rest={r} onRemove={() => onRemoveRest(selectedKey, r.id)} />
                ))}
                {showBreak && slotHere && (
                  <div className="pl-break">{breakLabel(slotHere.breakBefore, slotHere.longBreak)}</div>
                )}
                <PlannerItemRow
                  item={it}
                  dateKey={selectedKey}
                  sourceColors={data.sourceColors}
                  sourceTypes={data.sourceTypes}
                  slot={plan ? plan.slots[fullIdx] : undefined}
                  edge={items.length === 1 ? 'only' : fullIdx === 0 ? 'first' : fullIdx === items.length - 1 ? 'last' : null}
                  onToggleDone={() => onToggleDone(selectedKey, it.id)}
                  onEdit={() => { setEditingId(it.id); setOpenForm(false); }}
                  onDelete={() => onDeleteItem(selectedKey, it.id)}
                  onSendToReport={() => onSendToReport(selectedKey, it)}
                />
                {editingId === it.id && (
                  <PlannerItemForm
                    subjects={data.subjects}
                    sourceColors={data.sourceColors}
                    sourceTypes={data.sourceTypes}
                    defaultMinutes={data.schedule.partMinutes}
                    existing={it}
                    onCancel={() => setEditingId(null)}
                    onSave={(vals) => { onUpdateItem(selectedKey, it.id, vals); setEditingId(null); }}
                  />
                )}
              </React.Fragment>
              );
            })}
            {plan && plan.rests.filter((r) => r.beforeIndex >= items.length).map((r) => (
              <DayRestRow key={r.id} rest={r} onRemove={() => onRemoveRest(selectedKey, r.id)} />
            ))}
          </div>

          {ctx && (items.length > 0 || ctx.clipboardCount > 0) && (
            <div className="pl-day-tools">
              {items.length > 0 && (
                <button
                  type="button"
                  title="کپی همه‌ی پارت‌های این روز"
                  onClick={() => ctx.copyRefs(items.map((it) => ({ key: selectedKey, id: it.id })), true)}
                >
                  ⧉ کپی روز
                </button>
              )}
              {ctx.clipboardCount > 0 && (
                <button type="button" className="paste" title="چسباندن در این روز (Ctrl+V)" onClick={() => ctx.pasteTo(selectedKey)}>
                  📋 چسباندن ({toPersianDigits(ctx.clipboardCount)})
                </button>
              )}
            </div>
          )}

          <div className="pl-add-row">
            {openForm ? (
              <PlannerItemForm
                subjects={data.subjects}
                sourceColors={data.sourceColors}
                sourceTypes={data.sourceTypes}
                defaultMinutes={data.schedule.partMinutes}
                onCancel={() => setOpenForm(false)}
                onSave={(vals) => { onAddItem(selectedKey, vals); setOpenForm(false); }}
              />
            ) : (
              <button type="button" className="pl-add-btn" onClick={() => { setOpenForm(true); setEditingId(null); }}>
                + افزودن درس
              </button>
            )}
          </div>

          <button type="button" className="pl-p-jump" onClick={() => onJumpToWeek(selectedDate)}>
            نمایش این هفته ←
          </button>
        </aside>
      </div>
    </div>
  );
};
