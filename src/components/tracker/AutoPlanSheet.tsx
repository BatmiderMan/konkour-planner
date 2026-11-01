import React from 'react';
import { Sheet } from '../ui/Sheet';
import { PlannerData } from '../../types';
import { toPersianDigits } from '../../utils';
import { BOOKS, TRound, appliesBook, focusRound, sourcesFor, useTracker } from '../../trackerStore';
import { AutoPlanDay, AutoPlanOpts, buildAutoPlan, dayLabel, plannedUnits } from '../../trackerPlan';
import './tracker.css';

const LESSONS = ['ریاضی', 'فیزیک', 'شیمی'];
const LESSON_COLOR: Record<string, string> = { 'ریاضی': '#4d7cf0', 'فیزیک': '#8a6cf0', 'شیمی': '#1fa88a' };
type CssVars = React.CSSProperties & Record<string, string | number>;
const fa = (n: number) => toPersianDigits(n);

interface Props {
  plannerData?: PlannerData;
  /** writes the days into the planner and returns how many cards were added */
  onApply: (days: AutoPlanDay[], round: TRound, minutes?: number) => number;
  onDone?: (n: number) => void;
  onClose: () => void;
}

const Stepper: React.FC<{ label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }> = ({ label, value, min, max, unit, onChange }) => (
  <div className="ap-step">
    <span>{label}</span>
    <div>
      <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="کم">−</button>
      <b>{fa(value)}{unit ? ' ' + unit : ''}</b>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="زیاد">+</button>
    </div>
  </div>
);

export const AutoPlanSheet: React.FC<Props> = ({ plannerData, onApply, onDone, onClose }) => {
  const s = useTracker();
  const [rid, setRid] = React.useState(focusRound(s).id);
  const [books, setBooks] = React.useState<number[]>(() => BOOKS.map((b, i) => (b.grade === 'دوازدهم' ? i : -1)).filter((i) => i >= 0));
  const [perDay, setPerDay] = React.useState(3);
  const [days, setDays] = React.useState(7);
  const [startOffset, setStartOffset] = React.useState(0);
  const [skipFridays, setSkipFridays] = React.useState(false);
  const [granularity, setGranularity] = React.useState<'section' | 'item'>('section');
  const [mode, setMode] = React.useState<'sequential' | 'interleave'>('interleave');
  const [needPrev, setNeedPrev] = React.useState(true);
  const [mins, setMins] = React.useState('');
  const [partsPer, setPartsPer] = React.useState(1);
  const [srcPick, setSrcPick] = React.useState('');

  const round = s.rounds.find((r) => r.id === rid) || s.rounds[0];
  const ri = s.rounds.findIndex((r) => r.id === round.id);
  const planned = React.useMemo(() => plannedUnits(plannerData), [plannerData]);
  const useBooks = books.filter((b) => appliesBook(round, b));
  const opts: AutoPlanOpts = { roundId: round.id, books: useBooks, perDay, days, startOffset, skipFridays, granularity, mode, needPrev: needPrev && ri > 0, partsPerChunk: partsPer, source: srcPick };
  const plan = React.useMemo(() => buildAutoPlan(s, opts, planned), [s, rid, books, perDay, days, startOffset, skipFridays, granularity, mode, needPrev, planned]);
  const cards = plan.days.reduce((n, d) => n + d.chunks.length, 0);

  const srcNames = Array.from(new Set(useBooks.flatMap((b) => sourcesFor(round, b).map((x) => x.s))));
  const toggleBook = (i: number) => setBooks((b) => (b.includes(i) ? b.filter((x) => x !== i) : [...b, i]));

  const apply = () => {
    const n = onApply(plan.days, round, mins ? Number(mins) : undefined);
    onDone && onDone(n);
    onClose();
  };

  return (
    <Sheet onClose={onClose} title="برنامه‌ریزی خودکار" z={650}>
      <div className="tk-sheet ap">
        <p className="tk-sub">بندهای باقی‌مانده‌ی یک دور را خودکار بین روزهای آینده پخش کن. بندهایی که قبلا در برنامه‌ریز گذاشته‌ای دوباره اضافه نمی‌شوند.</p>

        <div className="tk-lab">کدام دور؟</div>
        <div className="tk-pills">
          {s.rounds.map((r) => (
            <button key={r.id} type="button" className={'tk-pill' + (r.id === rid ? ' on' : '')} style={{ '--c': r.color } as CssVars} onClick={() => { setRid(r.id); setSrcPick(''); }}>{r.name}</button>
          ))}
        </div>

        <div className="tk-lab">کتاب‌ها <small>(ترتیب انتخاب = ترتیب مطالعه)</small></div>
        <div className="tp-books">
          {LESSONS.map((l) => (
            <div key={l} className="grp" style={{ '--lc': LESSON_COLOR[l] } as CssVars}>
              <span className="gl">{l}</span>
              {BOOKS.map((x, i) => x.lesson === l && appliesBook(round, i) && (
                <button key={x.id} type="button" className={'tk-bp' + (books.includes(i) ? ' on' : '')} onClick={() => toggleBook(i)} title={sourcesFor(round, i).length ? 'منبع: ' + sourcesFor(round, i).map((y) => y.s).join('، ') : ''}>
                  {books.includes(i) && <small>{fa(books.indexOf(i) + 1)}</small>}{x.book}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="ap-grid">
          <Stepper label="کارت در هر روز" value={perDay} min={1} max={10} onChange={setPerDay} />
          <Stepper label="تعداد روز مطالعه" value={days} min={1} max={60} onChange={setDays} />
          <Stepper label="شروع از" value={startOffset} min={0} max={14} unit={startOffset === 0 ? '(امروز)' : startOffset === 1 ? '(فردا)' : 'روز بعد'} onChange={setStartOffset} />
          <Stepper label="هر مبحث در چند پارت؟" value={partsPer} min={1} max={6} unit="پارت" onChange={setPartsPer} />
        </div>
        {partsPer > 1 && <div className="tk-note">هر مبحث به {fa(partsPer)} کارت شکسته می‌شود؛ فقط کارت آخر مبحث را تمام می‌کند و بقیه «پارت» ثبت می‌کنند.</div>}

        {srcNames.length > 1 && (
          <>
            <div className="tk-lab">📖 منبع کارت‌ها</div>
            <div className="tk-pills">
              <button type="button" className={'tk-pill sm' + (!srcPick ? ' on' : '')} onClick={() => setSrcPick('')}>پیش‌فرضِ هر کتاب</button>
              {srcNames.map((n) => (<button key={n} type="button" className={'tk-pill sm' + (srcPick === n ? ' on' : '')} onClick={() => setSrcPick(n)}>{n}</button>))}
            </div>
          </>
        )}

        <div className="tk-lab">هر کارت چه باشد؟</div>
        <div className="tk-pills">
          <button type="button" className={'tk-pill' + (granularity === 'section' ? ' on' : '')} onClick={() => setGranularity('section')}>یک بخش کامل</button>
          <button type="button" className={'tk-pill' + (granularity === 'item' ? ' on' : '')} onClick={() => setGranularity('item')}>یک مورد (ریز)</button>
        </div>
        <div className="tk-lab">چینش</div>
        <div className="tk-pills">
          <button type="button" className={'tk-pill' + (mode === 'interleave' ? ' on' : '')} onClick={() => setMode('interleave')}>هر روز از چند کتاب</button>
          <button type="button" className={'tk-pill' + (mode === 'sequential' ? ' on' : '')} onClick={() => setMode('sequential')}>کتاب به کتاب</button>
        </div>

        <label className="ap-chk"><input type="checkbox" checked={skipFridays} onChange={(e) => setSkipFridays(e.target.checked)} /> جمعه‌ها را رد کن</label>
        {ri > 0 && (
          <label className="ap-chk"><input type="checkbox" checked={needPrev} onChange={(e) => setNeedPrev(e.target.checked)} /> فقط بندهایی که «{s.rounds[ri - 1].name}» را دارند</label>
        )}
        <label className="tk-lab" htmlFor="ap-min">مدت هر کارت (دقیقه، اختیاری)</label>
        <input id="ap-min" className="tk-in" inputMode="numeric" value={mins} placeholder="پیش‌فرض برنامه‌ریز" onChange={(e) => setMins(e.target.value.replace(/\D/g, '').slice(0, 3))} />

        <div className="ap-prev">
          <div className="tk-h">پیش‌نمایش · {fa(cards)} کارت در {fa(plan.days.length)} روز</div>
          {plan.leftover > 0 && <div className="tk-note">{fa(plan.leftover)} کارت دیگر هم باقی می‌ماند (روزها یا تعداد کارت را بیشتر کن).</div>}
          {!plan.days.length && <div className="tk-empty">با این تنظیمات چیزی برای برنامه‌ریزی پیدا نشد.</div>}
          <div className="ap-days">
            {plan.days.slice(0, 12).map((d) => (
              <div key={d.dateKey} className="ap-day">
                <b>{dayLabel(d.dateKey)}</b>
                {d.chunks.map((c, i) => (<span key={i} title={c.label}>{c.label}</span>))}
              </div>
            ))}
            {plan.days.length > 12 && <div className="tk-mut">… و {fa(plan.days.length - 12)} روز دیگر</div>}
          </div>
        </div>

        <div className="tk-actions">
          <button type="button" className="tk-btn pri" disabled={!cards} onClick={apply}>افزودن {fa(cards)} کارت به برنامه‌ریز</button>
        </div>
      </div>
    </Sheet>
  );
};
