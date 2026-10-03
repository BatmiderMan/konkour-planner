import React from 'react';
import { CalendarRange, ChevronDown, Check, ClipboardList, Trophy, CalendarClock, Layers } from 'lucide-react';
import { toPersianDigits } from '../utils';
import { PERSIAN_MONTH_NAMES } from '../jalali';
import { dateKeyOf, addDays, todayGregorian } from '../plannerStore';
import {
  INSTS, INST_META, SCHEDULE_NOTES, ScheduleState, loadScheduleState, saveScheduleState, visibleExams, nextExams, examLessons, lessonKey, variantOf,
  readiness, daysTo, weekdayOf, pagesLabel, dayMonth, displayTitle, clashesOf, lessonNames, lessonTimeline, buildStudyPlan, applyStudyPlan, addToMyExams, myExamState, PlanOpts
} from '../schedule/scheduleStore';
import type { SLesson, SExam as SExamT } from '../schedule/types';

const P = toPersianDigits;
type Mode = 'calendar' | 'lessons';
const KIND_LABEL: Record<string, string> = { review: 'مرور / جمع‌بندی', konkur: 'شبیه‌ساز کنکور' };

export function whenText(d: number): string {
  if (d === 0) return 'امروز';
  if (d === 1) return 'فردا';
  if (d > 1) return `${P(d)} روز دیگر`;
  return `${P(-d)} روز پیش`;
}

const Ring: React.FC<{ pct: number; color: string; size?: number; label?: string }> = ({ pct, color, size = 52, label }) => (
  <span className="sc-ring" style={{ width: size, height: size, background: `conic-gradient(${color} ${pct * 3.6}deg, var(--tint-2) 0)` }} aria-label={`آمادگی ${P(pct)} درصد`}>
    <i style={{ width: size - 12, height: size - 12 }}><b>{label ?? P(pct)}</b></i>
  </span>
);

interface Props { onOpenExams: () => void; onOpenPlanner: () => void }

export const ScheduleView: React.FC<Props> = ({ onOpenExams, onOpenPlanner }) => {
  const [st, setSt] = React.useState<ScheduleState>(loadScheduleState);
  const [mode, setMode] = React.useState<Mode>('calendar');
  const [showPast, setShowPast] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const [planFor, setPlanFor] = React.useState<string | null>(null);
  const [opts, setOpts] = React.useState<Omit<PlanOpts, 'picked'>>({ fromKey: dateKeyOf(todayGregorian()), perDay: 2, onlyUndone: true, withReview: true });
  const [lesson, setLesson] = React.useState<string>('');
  const [toast, setToast] = React.useState('');
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  const upd = (fn: (s: ScheduleState) => ScheduleState) => setSt((s) => { const n = fn(s); saveScheduleState(n); return n; });
  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3200); };

  const all = visibleExams(st);
  const upcoming = all.filter((e) => daysTo(e) >= 0);
  const past = all.filter((e) => daysTo(e) < 0);
  const shown = showPast ? all : upcoming;
  const next = nextExams(st)[0];
  const weekCount = upcoming.filter((e) => daysTo(e) <= 7).length;
  const names = React.useMemo(() => lessonNames(), []);
  const curLesson = lesson || names[0] || '';

  const toggleDone = (key: string) => upd((s) => ({ ...s, done: { ...s.done, [key]: !s.done[key] } }));
  const markAll = (e: SExamT, vi: number, on: boolean) => upd((s) => {
    const done = { ...s.done };
    examLessons(e, vi).forEach((_, i) => { done[lessonKey(e, vi, i)] = on; });
    return { ...s, done };
  });

  // ------------------------------------------------------------ one lesson row (shared by both views)
  const lessonRow = (e: SExamT, vi: number, l: SLesson, i: number, withName: boolean) => {
    const k = lessonKey(e, vi, i); const on = !!st.done[k]; const pg = pagesLabel(l);
    return (
      <li key={k} className={'sc-les' + (on ? ' done' : '') + (l.fast ? ' fast' : '')}>
        <button type="button" className="sc-tick" aria-pressed={on} aria-label={on ? 'خوانده‌ام را بردار' : 'خوانده‌ام'} onClick={() => toggleDone(k)}>{on && <Check size={14} strokeWidth={3} />}</button>
        <div className="sc-les-body">
          {withName && <b>{l.lesson}</b>}
          <span className="sc-topic">{l.tag === 'full' && !l.topic.startsWith('آزمون') ? 'کل کتاب' : l.topic || '—'}</span>
          <span className="sc-tags">
            {pg && <u>{pg}</u>}
            {l.tag === 'optional' && <u className="opt">اختیاری</u>}
            {l.tag === 'required' && <u className="req">اجباری</u>}
            {l.tag === 'full' && <u className="full">کل کتاب</u>}
            {l.fast && <u className="fast">پیشروی سریع</u>}
          </span>
        </div>
      </li>
    );
  };

  // ------------------------------------------------------------ study-plan panel
  const planPanel = (e: SExamT) => {
    const cards = buildStudyPlan(e, st, opts);
    const byDay: Record<string, typeof cards> = {};
    cards.forEach((c) => { (byDay[c.dateKey] ||= []).push(c); });
    const keys = Object.keys(byDay).sort();
    const tomorrow = dateKeyOf(addDays(todayGregorian(), 1));
    const today = dateKeyOf(todayGregorian());
    const wasPlanned = !!st.planned[e.id];
    return (
      <div className="sc-plan">
        <h4><CalendarClock size={16} />چیدن خودکار برنامه‌ی مطالعه تا این آزمون</h4>
        <div className="sc-plan-opts">
          <label>شروع از
            <select value={opts.fromKey === tomorrow ? 'tomorrow' : 'today'} onChange={(ev) => setOpts({ ...opts, fromKey: ev.target.value === 'tomorrow' ? tomorrow : today })}>
              <option value="today">امروز</option><option value="tomorrow">فردا</option>
            </select>
          </label>
          <label>حداکثر کارت در روز
            <select value={opts.perDay} onChange={(ev) => setOpts({ ...opts, perDay: +ev.target.value })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{P(n)}</option>)}</select>
          </label>
          <label className="chk"><input type="checkbox" checked={opts.onlyUndone} onChange={(ev) => setOpts({ ...opts, onlyUndone: ev.target.checked })} />فقط خوانده‌نشده‌ها</label>
          <label className="chk"><input type="checkbox" checked={opts.withReview} onChange={(ev) => setOpts({ ...opts, withReview: ev.target.checked })} />کارت مرور روز آخر</label>
        </div>
        {!keys.length ? <p className="sc-hint">چیزی برای چیدن نیست (همه را «خوانده‌ام» زده‌ای یا آزمون خیلی نزدیک است).</p> : (
          <div className="sc-preview">
            {keys.map((k) => { const dm = dayMonth(k); return (
              <div key={k} className="sc-pday"><b>{weekdayOf(k)} {P(dm.d)} {PERSIAN_MONTH_NAMES[dm.m - 1]}</b>
                <ul>{byDay[k].map((c) => <li key={c.item.id}><i style={{ background: 'var(--primary)' }} />{c.item.subject}<em>{c.item.detail.replace(/ · برای .*$/, '')}</em></li>)}</ul>
              </div>); })}
          </div>
        )}
        <div className="sc-actions">
          <button type="button" className="primary" disabled={!cards.length} onClick={() => { const n = applyStudyPlan(cards); upd((s) => ({ ...s, planned: { ...s.planned, [e.id]: Date.now() } })); setPlanFor(null); bump(); say(`${P(n)} کارت به برنامه‌ریز اضافه شد`); }}>افزودن {cards.length ? `${P(cards.length)} کارت ` : ''}به برنامه‌ریز</button>
          <button type="button" onClick={() => setPlanFor(null)}>بستن</button>
          {wasPlanned && <span className="sc-hint">قبلاً یک‌بار برای این آزمون چیده‌ای؛ دوباره زدن کارت‌های تکراری می‌سازد.</span>}
        </div>
      </div>
    );
  };

  // ------------------------------------------------------------ exam card
  const card = (e: SExamT) => {
    const d = daysTo(e); const vi = variantOf(st, e); const ls = examLessons(e, vi); const rd = readiness(e, st);
    const isOpen = open === e.id; const clash = clashesOf(e, st); const mine = myExamState(e);
    const dm = dayMonth(e.date); const col = INST_META[e.inst].color;
    return (
      <div key={e.id} className={'sc-card' + (d < 0 ? ' past' : '') + (d >= 0 && d <= 3 ? ' soon' : '')} style={{ ['--c' as any]: col }}>
        <header onClick={() => setOpen(isOpen ? null : e.id)}>
          <div className="sc-date"><b>{P(dm.d)}</b><span>{PERSIAN_MONTH_NAMES[dm.m - 1]}</span><em>{weekdayOf(e.date)}</em></div>
          <div className="sc-main">
            <div className="sc-line1"><span className="sc-inst">{INST_META[e.inst].label}</span><strong>{displayTitle(e)}</strong>{KIND_LABEL[e.kind] && <u className={'sc-kind ' + e.kind}>{KIND_LABEL[e.kind]}</u>}</div>
            <small>{e.phase || e.term || e.note || ''}{e.stage ? ` · مرحله ${P(e.stage)} از ${P(e.stageTotal || 21)}` : ''}</small>
            <div className="sc-meta">
              {e.subjects && <span>⏱ {e.subjects.reduce((a, s) => a + s.q, 0)} سؤال درس‌های ریاضی-فیزیک-شیمی</span>}
              {mine === 'upcoming' && <span className="ok">در آزمون‌های من</span>}
              {mine === 'done' && <span className="ok"><Trophy size={12} />نتیجه ثبت شده</span>}
              {clash.length > 0 && <span className="warn">⚠ هم‌روز با {clash.map((x) => INST_META[x.inst].label).join('، ')}</span>}
            </div>
          </div>
          <div className="sc-right">
            <span className={'sc-when' + (d < 0 ? ' late' : d <= 3 ? ' hot' : '')}>{whenText(d)}</span>
            {ls.length > 0 && <Ring pct={rd.pct} color={col} size={44} />}
            <ChevronDown size={16} className={'sc-chev' + (isOpen ? ' up' : '')} />
          </div>
        </header>
        {isOpen && (
          <div className="sc-body">
            {e.variants && e.variants.length > 1 && (
              <div className="sc-var">
                {e.variants.map((v, k) => <button key={k} type="button" className={k === vi ? 'on' : ''} onClick={() => upd((s) => ({ ...s, variant: { ...s.variant, [e.id]: k } }))}>{v.label}</button>)}
              </div>
            )}
            {e.note && <p className="sc-note">{e.note}</p>}
            {e.goal && e.goal.length > 0 && <p className="sc-goal"><Layers size={14} />هدف‌گذاری آزمون: {e.goal.map((g) => `${g.label} (${P(g.n)} از ${P(g.of)})`).join(' + ')}</p>}
            {ls.length ? (
              <>
                <ul className="sc-lessons">{ls.map((l, i) => lessonRow(e, vi, l, i, true))}</ul>
                <div className="sc-bar"><span>{P(rd.done)} از {P(rd.total)} درس خوانده‌ام</span>
                  <button type="button" className="sc-link" onClick={() => markAll(e, vi, rd.done !== rd.total)}>{rd.done === rd.total ? 'برداشتن همه' : 'همه را خوانده‌ام'}</button></div>
              </>
            ) : <p className="sc-hint">برای این آزمون مبحث مشخصی در برنامه نیامده ({e.kind === 'konkur' ? 'جامع، مطابق کنکور؛ کل کتاب‌ها' : 'مرور آزاد'}).</p>}
            {(e.subjects || e.totals) && (
              <details className="sc-det"><summary>تعداد سؤال و زمان‌بندی</summary>
                {e.subjects && <div className="sc-chips">{e.subjects.map((s) => <u key={s.name}>{s.name}: {P(s.q)} سؤال{s.min ? ` / ${P(s.min)} دقیقه` : ''}</u>)}</div>}
                {e.totals && e.totals.map((t, i) => <p key={i}>{t}</p>)}
                {e.similar && <p>{e.similar}</p>}
              </details>
            )}
            {clash.length > 0 && <p className="sc-warn">⚠ این روز {clash.map((x) => `${INST_META[x.inst].label} (${displayTitle(x)})`).join(' و ')} هم آزمون دارند. اگر فقط یکی را می‌دهی، از بالای صفحه موسسه‌ی دیگر را خاموش کن.</p>}
            <div className="sc-actions">
              {d >= 0 && ls.length > 0 && <button type="button" className="primary" onClick={() => setPlanFor(planFor === e.id ? null : e.id)}><CalendarClock size={15} />چیدن برنامه‌ی مطالعه</button>}
              {mine === 'none' && d >= 0 && <button type="button" onClick={() => { const r = addToMyExams(e); bump(); say(r === 'added' ? 'به «آزمون‌ها» اضافه شد؛ بعد از آزمون، کارنامه را وارد کن' : 'قبلاً اضافه شده'); }}><Trophy size={15} />ثبت در آزمون‌های من</button>}
              {mine !== 'none' && <button type="button" onClick={onOpenExams}><Trophy size={15} />باز کردن در آزمون‌ها</button>}
            </div>
            {planFor === e.id && planPanel(e)}
          </div>
        )}
      </div>
    );
  };

  // ------------------------------------------------------------ calendar view
  const groups: { key: string; list: SExamT[] }[] = [];
  shown.forEach((e) => { const dm = dayMonth(e.date); const k = `${PERSIAN_MONTH_NAMES[dm.m - 1]} ${P(dm.y)}`; const g = groups[groups.length - 1]; if (g && g.key === k) g.list.push(e); else groups.push({ key: k, list: [e] }); });

  const calendar = (
    <>
      {!showPast && past.length > 0 && <button type="button" className="sc-link sc-pastbtn" onClick={() => setShowPast(true)}>نمایش {P(past.length)} آزمون گذشته</button>}
      {showPast && <button type="button" className="sc-link sc-pastbtn" onClick={() => setShowPast(false)}>پنهان کردن آزمون‌های گذشته</button>}
      {groups.map((g) => <section key={g.key}><h2 className="sc-month">{g.key}</h2>{g.list.map(card)}</section>)}
      {!shown.length && <div className="sc-empty">{all.length ? 'آزمون پیش‌رویی نمانده.' : 'هیچ موسسه‌ای روشن نیست. از بالا یکی را روشن کن.'}</div>}
    </>
  );

  // ------------------------------------------------------------ lessons («بودجه‌بندی») view
  const tl = curLesson ? lessonTimeline(curLesson, st) : [];
  const tlShown = tl.filter((t) => showPast || daysTo(t.exam) >= 0);
  const tlDays: { date: string; items: typeof tl }[] = [];
  tlShown.forEach((t) => { const g = tlDays[tlDays.length - 1]; if (g && g.date === t.exam.date) g.items.push(t); else tlDays.push({ date: t.exam.date, items: [t] }); });
  const firstUp = tlDays.findIndex((g) => daysTo(g.items[0].exam) >= 0);
  const doneCnt = tl.filter((t) => st.done[lessonKey(t.exam, t.vi, t.i)]).length;
  const lessonsView = (
    <>
      <div className="sc-chips pick">{names.map((n) => <button key={n} type="button" className={n === curLesson ? 'on' : ''} onClick={() => setLesson(n)}>{n}</button>)}</div>
      <p className="sc-hint">مسیر «{curLesson}» در همه‌ی آزمون‌های موسسه‌های روشن — {P(tl.length)} بار آمده، {P(doneCnt)} بار خوانده‌ای.
        <button type="button" className="sc-link" onClick={() => setShowPast(!showPast)}>{showPast ? 'پنهان‌کردن گذشته' : 'نمایش گذشته'}</button></p>
      <div className="sc-tl">
        {tlDays.map((g, gi) => {
          const e0 = g.items[0].exam; const d = daysTo(e0); const dm = dayMonth(e0.date);
          return (
            <div key={g.date} className={'sc-tl-day' + (d < 0 ? ' past' : '') + (gi === firstUp ? ' next' : '')}>
              <div className="sc-tl-when"><b>{P(dm.d)} {PERSIAN_MONTH_NAMES[dm.m - 1]}</b><span>{weekdayOf(g.date)} · {whenText(d)}</span>{gi === firstUp && <em>بعدی</em>}</div>
              <div className="sc-tl-items">
                {g.items.map((t) => (
                  <ul key={t.exam.id + t.i + t.vi} className="sc-tl-item" style={{ ['--c' as any]: INST_META[t.exam.inst].color }}>
                    <li className="sc-tl-head"><span className="sc-inst">{INST_META[t.exam.inst].label}</span><small>{t.exam.stage ? `مرحله ${P(t.exam.stage)}` : displayTitle(t.exam)}{t.exam.variants && t.exam.variants.length > 1 ? ` · ${t.exam.variants[t.vi].label}` : ''}</small></li>
                    {lessonRow(t.exam, t.vi, t.item, t.i, false)}
                  </ul>
                ))}
              </div>
            </div>
          );
        })}
        {!tlDays.length && <div className="sc-empty">برای این درس چیزی پیش‌رو نیست.</div>}
      </div>
    </>
  );

  return (
    <main className="sc">
      <header className="ex-head">
        <div><h1>برنامه آزمون‌ها</h1><p>برنامه‌ی ماز و قلم‌چی (دوازدهم ریاضی، ۱۴۰۵–۱۴۰۶): هر آزمون چه مباحثی دارد، چه روزی است و برای هر کدام چه چیزی باید خوانده باشی.</p></div>
        <div className="sc-follow" role="group" aria-label="موسسه‌ها">
          {INSTS.map((i) => <button key={i} type="button" aria-pressed={st.follow[i]} className={st.follow[i] ? 'on' : ''} style={{ ['--c' as any]: INST_META[i].color }} onClick={() => upd((s) => ({ ...s, follow: { ...s.follow, [i]: !s.follow[i] } }))}>{st.follow[i] ? <Check size={14} /> : null}{INST_META[i].label}</button>)}
        </div>
      </header>

      <section className="sc-hero">
        {next ? (() => { const d = daysTo(next); const rd = readiness(next, st); const ls = examLessons(next, variantOf(st, next)); const same = upcoming.filter((x) => x.date === next.date); return (
          <div className="sc-next" style={{ ['--c' as any]: INST_META[next.inst].color }}>
            <div className="sc-next-top"><span>آزمون بعدی</span><em>{weekdayOf(next.date)} {dayMonth(next.date).label}</em></div>
            <h2>{same.map((x) => displayTitle(x)).join(' + ')}</h2>
            <div className="sc-count"><b>{d === 0 ? 'امروز' : d === 1 ? 'فردا' : P(d)}</b>{d > 1 && <i>روز مانده</i>}</div>
            <ul className="sc-topics">{ls.filter((l) => l.topic && l.tag !== 'full').slice(0, 5).map((l, i) => <li key={i}><b>{l.lesson}</b>{l.topic.split('+')[0].split('(')[0].trim()}</li>)}</ul>
            <div className="sc-next-foot"><Ring pct={rd.pct} color={INST_META[next.inst].color} /><span>{P(rd.done)} از {P(rd.total)} درس آماده</span>
              <button type="button" className="ex-add" onClick={() => { setMode('calendar'); setShowPast(false); setOpen(next.id); setPlanFor(next.id); }}><CalendarClock size={15} />چیدن برنامه‌ی مطالعه</button></div>
          </div>); })() : <div className="sc-next empty"><h2>آزمون پیش‌رویی نیست</h2><p>موسسه‌ای را روشن کن یا آزمون‌های گذشته را از «تقویم» ببین.</p></div>}
        <div className="sc-stats">
          <div className="ex-count stat"><span>تا ۷ روز آینده</span><b>{P(weekCount)}<i> آزمون</i></b><em>{upcoming.length ? `${P(upcoming.length)} آزمون در پیش‌رو` : 'برنامه‌ی سال تمام شد'}</em></div>
          <div className="ex-count practice"><span>پیشرفت کل مطالعه</span><b>{(() => { let dn = 0, tt = 0; upcoming.forEach((e) => { const r = readiness(e, st); dn += r.done; tt += r.total; }); return tt ? P(Math.round((dn / tt) * 100)) : '–'; })()}<i>٪</i></b><em>از سرفصل‌های آزمون‌های پیش‌رو</em></div>
        </div>
      </section>

      <div className="ex-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'calendar'} className={mode === 'calendar' ? 'active' : ''} onClick={() => setMode('calendar')}><CalendarRange size={14} /> تقویم آزمون‌ها</button>
        <button type="button" role="tab" aria-selected={mode === 'lessons'} className={mode === 'lessons' ? 'active' : ''} onClick={() => setMode('lessons')}><ClipboardList size={14} /> بودجه‌بندی درس‌ها</button>
      </div>

      {mode === 'calendar' ? calendar : lessonsView}

      <footer className="sc-foot">{SCHEDULE_NOTES.map((n, i) => <p key={i}>{n}</p>)}<button type="button" className="sc-link" onClick={onOpenPlanner}>رفتن به برنامه‌ریز</button></footer>
      {toast && <div className="ex-toast" role="status">{toast}</div>}
    </main>
  );
};
