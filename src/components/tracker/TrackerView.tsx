import React from 'react';
import {
  CalendarRange, ChevronDown, Download, Layers, LayoutDashboard, ListChecks, Plus, RotateCcw, Search, Settings2, Sparkles, Trash2, Upload, ArrowUp, ArrowDown
} from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { confirmDialog } from '../../dialog';
import { hapticTap } from '../../focusBus';
import { toPersianDigits } from '../../utils';
import { PERSIAN_WEEK_DAYS } from '../../jalali';
import { addDays, dateKeyOf, loadPlannerData, savePlannerData, todayGregorian } from '../../plannerStore';
import { weekdayIndexOfKey } from '../../plannerSchedule';
import {
  ALL_UNITS, BOOKS, BY_UNIT, GRADES, LESSON_NAMES, TRound, TrackerState, addParts, addRound, appliesBook, appliesUnit, cnt, exportBackup, focusRound, importBackup, isOn, moveRound,
  partInfo, partial, removeRound, removeRoundSource, resetTracker, roundsOfBook, scopeLabel, scopedUnits, setFocus, setNote, setRoundDue, setRoundScope, setRoundSource, sourcesFor, toggleFlag,
  toggleMarks, topColor, touched, tot, unitPath, unitsOfBook, unitsOfChapter, unitsOfSection, updateRound, upto, useTracker
} from '../../trackerStore';
import {
  AutoPlanDay, PlanChunk, chunkOfChapter, chunkOfSection, chunkOfUnit, dayLabel, nextDays, overdueLinked, paceInfo, planChunks, planChunksInto, plannedUnits, rescheduleOverdue
} from '../../trackerPlan';
import { AutoPlanSheet } from './AutoPlanSheet';
import type { BookType } from '../../types';
import './tracker.css';

type Tab = 'dash' | 'list' | 'rev' | 'stat' | 'set';
const TABS: Array<[Tab, string, React.ReactNode]> = [
  ['dash', 'داشبورد', <LayoutDashboard size={17} key="a" />],
  ['list', 'چک‌لیست', <ListChecks size={17} key="b" />],
  ['rev', 'مرور', <RotateCcw size={17} key="c" />],
  ['stat', 'تحلیل', <Layers size={17} key="d" />],
  ['set', 'دورها', <Settings2 size={17} key="e" />]
];
const LESSONS = ['ریاضی', 'فیزیک', 'شیمی'];
const LESSON_COLOR: Record<string, string> = { 'ریاضی': '#4d7cf0', 'فیزیک': '#8a6cf0', 'شیمی': '#1fa88a' };
const UI_KEY = 'planex_tracker_ui_v1';

interface Ui { tab: Tab; book: number; fold: Record<string, boolean>; flt: string; grade: string }
function loadUi(): Ui {
  try {
    const p = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (p && typeof p === 'object') {
      return {
        tab: TABS.some((t) => t[0] === p.tab) ? p.tab : 'dash',
        book: Number.isInteger(p.book) && p.book >= 0 && p.book < BOOKS.length ? p.book : 0,
        fold: p.fold && typeof p.fold === 'object' ? p.fold : {},
        flt: typeof p.flt === 'string' ? p.flt : 'all',
        grade: typeof p.grade === 'string' ? p.grade : 'all'
      };
    }
  } catch { /* defaults */ }
  return { tab: 'dash', book: 0, fold: {}, flt: 'all', grade: 'all' };
}

const fa = (n: number) => toPersianDigits(n);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
type CssVars = React.CSSProperties & Record<string, string | number>;

// ---------------------------------------------------------------- small shared pieces
const Chips: React.FC<{ us: string[]; s: TrackerState }> = ({ us, s }) => (
  <span className="tk-chips">
    {s.rounds.map((r, i) => {
      const t = tot(s, us, r.id);
      if (!t) return null; // the round does not apply to these books
      const n = cnt(s, us, r.id);
      const on = n === t;
      const pn = partial(s, us, r.id);
      const part = !on && (n > 0 || pn > 0);
      const ts = us.length === 1 && s.done[us[0]] ? s.done[us[0]][r.id] : 0;
      const pi = us.length === 1 ? partInfo(s, us[0], r.id) : null;
      return (
        <button
          key={r.id}
          type="button"
          className={'tk-chip' + (on ? ' on' : part ? ' part' : '')}
          style={{ '--c': r.color } as CssVars}
          aria-pressed={on}
          aria-label={r.name}
          title={
            r.name +
            (ts ? ' — ' + new Date(ts).toLocaleDateString('fa-IR-u-ca-persian') : '') +
            (pi ? ` — ${fa(pi.n)} پارت${pi.m ? ' · ' + fa(pi.m) + ' دقیقه' : ''}` : '') +
            (!ts && !pi && n > 0 ? ` — ${fa(n)} از ${fa(t)}` : '')
          }
          onClick={(e) => { e.stopPropagation(); hapticTap(); toggleMarks(us, r.id); }}
        >
          {on ? '✓' : pi ? fa(pi.n) : fa(i + 1)}
        </button>
      );
    })}
  </span>
);

const MultiBar: React.FC<{ us: string[]; s: TrackerState }> = ({ us, s }) => (
  <span className="tk-bar">
    {s.rounds.map((r) => {
      const t = tot(s, us, r.id);
      if (!t) return null;
      return <b key={r.id}><i style={{ width: pct(cnt(s, us, r.id), t) + '%', background: r.color }} /></b>;
    })}
  </span>
);

const UptoBadge: React.FC<{ us: string[]; s: TrackerState }> = ({ us, s }) => {
  const k = upto(s, us);
  if (k < 0) return null;
  return <span className="tk-badge" style={{ '--c': s.rounds[k].color } as CssVars}>کامل تا {s.rounds[k].name}</span>;
};

/** concentric rings, one per round (that applies to these units), outermost = first round */
const Rings: React.FC<{ s: TrackerState; us: string[]; onPick: (id: string) => void }> = ({ s, us, onPick }) => {
  const rs = s.rounds.filter((r) => tot(s, us, r.id) > 0);
  const n = Math.max(1, rs.length);
  const w = Math.min(11, 74 / n);
  const f0 = focusRound(s);
  const fr = rs.find((r) => r.id === f0.id) || rs[0] || f0;
  const p = pct(cnt(s, us, fr.id), tot(s, us, fr.id));
  return (
    <div className="tk-rings">
      <svg viewBox="0 0 200 200" role="img" aria-label="پیشرفت دورها">
        {rs.map((r, i) => {
          const rad = 92 - i * (w + 3.2);
          const v = pct(cnt(s, us, r.id), tot(s, us, r.id));
          return (
            <g key={r.id} className={'tk-ring' + (r.id === fr.id ? ' act' : '')} onClick={() => onPick(r.id)} style={{ '--c': r.color } as CssVars}>
              <circle cx="100" cy="100" r={rad} className="trk" strokeWidth={w} />
              <circle cx="100" cy="100" r={rad} className={'val' + (v ? '' : ' zero')} strokeWidth={w} pathLength={100} strokeDasharray={`${Math.max(v, v ? 0.8 : 0)} 100`} stroke={r.color} />
              <circle cx="100" cy="100" r={rad} className="hit" strokeWidth={w + 3} />
            </g>
          );
        })}
      </svg>
      <div className="mid">
        <b style={{ color: fr.color }}>{fa(p)}<small>٪</small></b>
        <span>{fr.name}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- sheets
const NoteSheet: React.FC<{ u: string; initial: string; onClose: () => void }> = ({ u, initial, onClose }) => {
  const [t, setT] = React.useState(initial);
  const x = BY_UNIT[u];
  return (
    <Sheet onClose={onClose} title="یادداشت">
      <div className="tk-sheet">
        <div className="tk-sub">{x ? unitPath(u) : ''}</div>
        <textarea className="tk-ta" autoFocus rows={5} value={t} onChange={(e) => setT(e.target.value)} placeholder="نکته، نقطه ضعف، شماره‌ی تست‌های مهم…" />
        <div className="tk-actions">
          <button type="button" className="tk-btn pri" onClick={() => { setNote(u, t); onClose(); }}>ذخیره</button>
          {initial && <button type="button" className="tk-btn" onClick={() => { setNote(u, ''); onClose(); }}>حذف یادداشت</button>}
        </div>
      </div>
    </Sheet>
  );
};

const PlanSheet: React.FC<{ chunks: PlanChunk[]; s: TrackerState; onClose: () => void; onDone: (n: number, dateKey: string) => void }> = ({ chunks, s, onClose, onDone }) => {
  const days = React.useMemo(() => nextDays(8), []);
  const firstU = chunks[0] && BY_UNIT[chunks[0].us[0]];
  const bi = firstU ? firstU.bi : 0;
  const usable = roundsOfBook(s, bi);
  const f0 = focusRound(s);
  const [day, setDay] = React.useState(days[0]);
  const [rid, setRid] = React.useState((usable.find((r) => r.id === f0.id) || usable[0] || f0).id);
  const [mins, setMins] = React.useState('');
  const [part, setPart] = React.useState(false);
  const [src, setSrc] = React.useState('');
  const round = s.rounds.find((r) => r.id === rid) || s.rounds[0];
  const srcs = sourcesFor(round, bi);
  const dayLabel = (k: string, i: number) => (i === 0 ? 'امروز' : i === 1 ? 'فردا' : PERSIAN_WEEK_DAYS[weekdayIndexOfKey(k)] || k);
  const go = () => {
    const list = part ? chunks.map((c) => ({ ...c, part: true })) : chunks;
    const n = planChunks(list, round, day, mins ? Number(mins) : undefined, src || undefined);
    onDone(n, day);
    onClose();
  };
  return (
    <Sheet onClose={onClose} title="افزودن به برنامه‌ی روز">
      <div className="tk-sheet">
        <div className="tk-sub">
          {chunks.length === 1 ? chunks[0].label : `${fa(chunks.length)} مورد`}
          {chunks.length === 1 && chunks[0].us.length > 1 ? ` (${fa(chunks[0].us.length)} بند)` : ''}
        </div>
        <div className="tk-lab">برای کدام دور؟</div>
        <div className="tk-pills">
          {usable.map((r) => (
            <button key={r.id} type="button" className={'tk-pill' + (r.id === rid ? ' on' : '')} style={{ '--c': r.color } as CssVars} onClick={() => { setRid(r.id); setSrc(''); }}>{r.name}</button>
          ))}
        </div>
        {srcs.length > 0 && (
          <>
            <div className="tk-lab">📖 منبع</div>
            <div className="tk-pills">
              {srcs.map((x, i) => (
                <button key={x.s} type="button" className={'tk-pill sm' + ((src || srcs[0].s) === x.s ? ' on' : '')} onClick={() => setSrc(i === 0 ? '' : x.s)}>{x.s}{x.t ? (x.t === 'test' ? ' ✏️' : ' 📖') : ''}</button>
              ))}
            </div>
          </>
        )}
        <div className="tk-lab">این کارت…</div>
        <div className="tk-pills">
          <button type="button" className={'tk-pill sm' + (!part ? ' on' : '')} onClick={() => setPart(false)}>✓ مبحث را تمام می‌کند</button>
          <button type="button" className={'tk-pill sm' + (part ? ' on' : '')} onClick={() => setPart(true)}>◐ فقط یک پارت از مبحث است</button>
        </div>
        <div className="tk-lab">کدام روز؟</div>
        <div className="tk-pills">
          {days.map((k, i) => (
            <button key={k} type="button" className={'tk-pill day' + (k === day ? ' on' : '')} onClick={() => setDay(k)}>
              {dayLabel(k, i)}<small>{fa(Number(k.split('/')[2]))}</small>
            </button>
          ))}
        </div>
        <label className="tk-lab" htmlFor="tk-min">مدت (دقیقه، اختیاری)</label>
        <input id="tk-min" className="tk-in" inputMode="numeric" value={mins} placeholder="پیش‌فرض برنامه‌ریز" onChange={(e) => setMins(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        <div className="tk-note">
          {part
            ? `با تیک زدن کارت در برنامه‌ریز، فقط یک پارت (و زمانش) برای «${round.name}» ثبت می‌شود و مبحث باز می‌ماند؛ هر وقت پارت آخر را خواندی، یک کارت «مبحث را تمام می‌کند» بگذار یا در چک‌لیست تیکش بزن.`
            : `وقتی این کارت را در برنامه‌ریز تیک بزنی، همین بندها برای «${round.name}» خودکار تیک می‌خورند.`}
        </div>
        <div className="tk-actions">
          <button type="button" className="tk-btn pri" onClick={go}>افزودن به برنامه</button>
        </div>
      </div>
    </Sheet>
  );
};

// ---------------------------------------------------------------- the view
interface Props {
  onPlanChanged?: () => void;
  onOpenPlanner?: () => void;
}

export const TrackerView: React.FC<Props> = ({ onPlanChanged, onOpenPlanner }) => {
  const s = useTracker();
  const [ui, setUi] = React.useState<Ui>(loadUi);
  const [q, setQ] = React.useState('');
  const [go, setGo] = React.useState<string | null>(null);
  const [noteU, setNoteU] = React.useState<string | null>(null);
  const [plan, setPlan] = React.useState<PlanChunk[] | null>(null);
  const [toast, setToast] = React.useState('');
  const [planTick, setPlanTick] = React.useState(0);
  const [auto, setAuto] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, { scope: string; name: string; t: BookType | '' }>>({});
  const [dueDays, setDueDays] = React.useState<Record<string, string>>({});
  const [revRid, setRevRid] = React.useState('');
  const [bk, setBk] = React.useState('');
  const [msg, setMsg] = React.useState('');
  const toastT = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* ignore */ } }, [ui]);
  const patch = (p: Partial<Ui>) => setUi((u) => ({ ...u, ...p }));
  const flash = (m: string) => { setToast(m); if (toastT.current) clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2600); };

  const planned = React.useMemo(() => plannedUnits(), [s, planTick, ui.tab]);
  const overdue = React.useMemo(() => overdueLinked(loadPlannerData()), [s, planTick, ui.tab]);
  const sourceNames = React.useMemo(() => { const d = loadPlannerData(); return Array.from(new Set([...Object.keys(d.sourceColors), ...Object.keys(d.sourceTypes)])); }, [ui.tab]);

  const applyAuto = (days: AutoPlanDay[], round: TRound, minutes?: number): number => {
    let cur = loadPlannerData();
    let n = 0;
    days.forEach((d) => { const r = planChunksInto(cur, d.chunks, round, d.dateKey, minutes); cur = r.data; n += r.added; });
    if (n) savePlannerData(cur);
    return n;
  };
  const moveOverdue = () => {
    const r = rescheduleOverdue(loadPlannerData(), dateKeyOf(todayGregorian()));
    if (r.moved) { savePlannerData(r.data); setPlanTick((x) => x + 1); onPlanChanged && onPlanChanged(); flash(`${fa(r.moved)} کارت به امروز منتقل شد ✓`); }
  };
  const fr = focusRound(s);
  const total = ALL_UNITS.length;

  const afterPlan = (n: number, key: string) => {
    setPlanTick((x) => x + 1);
    onPlanChanged && onPlanChanged();
    flash(n ? `${fa(n)} کارت به برنامه‌ی ${key} اضافه شد ✓` : 'چیزی اضافه نشد');
  };

  React.useEffect(() => {
    if (!go) return;
    const el = document.querySelector(`[data-tk-u="${CSS.escape(go)}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setGo(null), 1800);
    return () => clearTimeout(t);
  }, [go, ui.tab, ui.book]);

  const gotoUnit = (u: string) => {
    const x = BY_UNIT[u];
    if (!x) return;
    setQ('');
    setUi((p) => {
      const fold = { ...p.fold };
      delete fold[`${x.bi}|c${x.ci}`];
      delete fold[`${x.bi}|c${x.ci}s${x.si}`];
      return { ...p, tab: 'list', book: x.bi, flt: 'all', fold };
    });
    setGo(u);
  };

  // ------------- one unit row
  const Row = (u: string, crumb: boolean) => {
    const x = BY_UNIT[u];
    if (!x) return null;
    const accent = topColor(s, u);
    const pk = planned[u];
    return (
      <div key={u} className={'tk-row' + (go === u ? ' hl' : '')} data-tk-u={u} style={{ '--ac': accent || 'transparent' } as CssVars}>
        <span className="t">
          {x.t}
          {crumb && <small>{BOOKS[x.bi].book} › {BOOKS[x.bi].chapters[x.ci].t}</small>}
          {pk && <small className={'pk' + (pk < dateKeyOf(todayGregorian()) ? ' late' : '')}>{pk < dateKeyOf(todayGregorian()) ? '⚠ عقب‌افتاده از ' : '📅 در برنامه‌ی '}{toPersianDigits(pk.split('/').slice(1).join('/'))}</small>}
          {s.rounds.map((r) => { const pi = partInfo(s, u, r.id); return pi && !isOn(s, u, r.id) ? (<small key={r.id} className="pp" style={{ '--c': r.color } as CssVars}>◐ {r.name}: {fa(pi.n)} پارت{pi.m ? ` · ${fa(pi.m)} دقیقه` : ''} — هنوز تمام نشده</small>) : null; })}
          {s.notes[u] && <em>{s.notes[u]}</em>}
        </span>
        <Chips us={[u]} s={s} />
        {appliesUnit(fr, u) && <button type="button" className="tk-ic" title={`ثبت یک پارت مطالعه برای «${fr.name}» (مبحث باز می‌ماند)`} aria-label="ثبت پارت" onClick={() => addParts([u], fr.id, 1, 0)}>◐</button>}
        <button type="button" className={'tk-ic' + (s.flags[u] ? ' on' : '')} title="نیاز به مرور" aria-label="علامت" onClick={() => toggleFlag(u)}>⚑</button>
        <button type="button" className={'tk-ic' + (s.notes[u] ? ' on' : '')} title="یادداشت" aria-label="یادداشت" onClick={() => setNoteU(u)}>✎</button>
        <button type="button" className="tk-ic" title="افزودن به برنامه" aria-label="افزودن به برنامه" onClick={() => setPlan([chunkOfUnit(u)])}><CalendarRange size={15} /></button>
      </div>
    );
  };

  // ------------- DASHBOARD
  const Dash = () => {
    const days: Record<string, number> = {};
    Object.values(s.done).forEach((o) => Object.values(o).forEach((ts) => { const k = new Date(ts).toDateString(); days[k] = (days[k] || 0) + 1; }));
    const act: { c: number; l: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      act.push({ c: days[d.toDateString()] || 0, l: d.toLocaleDateString('fa-IR-u-ca-persian', { day: 'numeric' }) });
    }
    let streak = 0;
    for (let i = 13; i >= 0; i--) { if (act[i].c) streak++; else if (i < 13) break; }
    const mx = Math.max(1, ...act.map((a) => a.c));
    const dUs = ui.grade === 'all' ? ALL_UNITS : ALL_UNITS.filter((u) => BOOKS[BY_UNIT[u].bi].grade === ui.grade);
    const dTotal = dUs.length;
    const fi = s.rounds.findIndex((r) => r.id === fr.id);
    const prev = fi > 0 ? s.rounds[fi - 1] : null;
    let next = dUs.filter((u) => appliesUnit(fr, u) && !isOn(s, u, fr.id) && !planned[u] && (!prev || isOn(s, u, prev.id)));
    if (!next.length) next = dUs.filter((u) => appliesUnit(fr, u) && !isOn(s, u, fr.id) && !planned[u]);
    next = next.slice(0, 5);
    const last = s.last && BY_UNIT[s.last] ? s.last : null;
    return (
      <>
        <div className="tk-gradebar" role="group" aria-label="پایه">
          {['all', ...GRADES].map((g) => (
            <button key={g} type="button" className={ui.grade === g ? 'on' : ''} onClick={() => patch({ grade: g })}>{g === 'all' ? 'همه‌ی پایه‌ها' : 'پایه‌ی ' + g}</button>
          ))}
        </div>

        <section className="tk-card hero">
          <Rings s={s} us={dUs} onPick={setFocus} />
          <div className="tk-legend">
            <div className="tk-h">پیشرفت کل · {fa(touched(s, dUs))} از {fa(dTotal)} بند لمس شده</div>
            {s.rounds.map((r, i) => {
              const t = tot(s, dUs, r.id);
              if (!t) return null;
              const c = cnt(s, dUs, r.id);
              const pc = paceInfo(s, r, dUs);
              const srcs = Object.values(r.src || {}).flat().map((x) => x.s);
              return (
                <button key={r.id} type="button" className={'tk-lg' + (r.id === fr.id ? ' on' : '')} style={{ '--c': r.color } as CssVars} onClick={() => setFocus(r.id)}>
                  <i>{fa(i + 1)}</i>
                  <span className="n">{r.name}{r.scope && r.scope.length > 0 && <small className="src">🎯 {r.scope.join('، ')}</small>}{srcs.length > 0 && <small className="src">📖 {Array.from(new Set(srcs)).slice(0, 3).join('، ')}</small>}</span>
                  <span className="v"><b>{fa(pct(c, t))}٪</b> · {fa(c)}/{fa(t)}</span>
                  <span className="tk-track"><u style={{ width: pct(c, t) + '%' }} /></span>
                  {(pc.perDay > 0 || pc.daysLeft !== null) && pc.remaining > 0 && (
                    <span className={'pc' + (pc.late ? ' late' : '')}>
                      {pc.perDay > 0 ? `${toPersianDigits(pc.perDay.toFixed(1))} بند در روز${pc.etaLabel ? ` · پایان ≈ ${pc.etaLabel}` : ''}` : 'فعالیتی در ۱۴ روز اخیر نیست'}
                      {pc.daysLeft !== null ? ` · ددلاین ${pc.daysLeft < 0 ? 'گذشته' : fa(pc.daysLeft) + ' روز دیگر'} (لازم: ${toPersianDigits((pc.need || 0).toFixed(1))}/روز)` : ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className="tk-tiles">
          <div className="tk-tile"><b>{fa(streak)}</b><span>روز پیاپی فعالیت</span></div>
          <div className="tk-tile"><b>{fa(Object.keys(s.flags).length)}</b><span>بند علامت‌دار</span></div>
          <div className="tk-tile"><b>{fa(Object.keys(planned).length)}</b><span>بند در برنامه‌ریز</span></div>
        </div>

        {overdue.length > 0 && (
          <section className="tk-card warn">
            <div className="tk-h">⚠ {fa(overdue.length)} کارت از مباحث عقب افتاده</div>
            <p className="tk-mut">این کارت‌ها برای روزهای گذشته برنامه‌ریزی شده بودند و انجام نشده‌اند.</p>
            {overdue.slice(0, 4).map((o) => (<div key={o.item.id} className="tk-od"><b>{o.item.subject}</b><span>{o.item.detail}</span><em>{dayLabel(o.key)}</em></div>))}
            <div className="tk-actions"><button type="button" className="tk-btn pri" onClick={moveOverdue}>انتقال همه به امروز</button></div>
          </section>
        )}

        <section className="tk-card">
          <div className="tk-h"><Sparkles size={16} /> پیشنهاد برای «{fr.name}»</div>
          <p className="tk-mut">{prev ? `بندهایی که «${prev.name}» را دارند ولی این مرحله را هنوز ندارند.` : 'اولین بندهای نخوانده.'}</p>
          {next.map((u) => Row(u, true))}
          {!next.length && <div className="tk-empty">همه‌ی بندها یا انجام شده‌اند یا در برنامه‌ریز هستند. 🎉</div>}
          {next.length > 0 && (
            <div className="tk-actions">
              <button type="button" className="tk-btn pri" onClick={() => setPlan(next.map(chunkOfUnit))}>
                <CalendarRange size={16} /> همه‌ی {fa(next.length)} مورد را به برنامه بفرست
              </button>
              <button type="button" className="tk-btn" onClick={() => setAuto(true)}>🎯 برنامه‌ریزی خودکار چندروزه</button>
            </div>
          )}
          {!next.length && <div className="tk-actions"><button type="button" className="tk-btn" onClick={() => setAuto(true)}>🎯 برنامه‌ریزی خودکار چندروزه</button></div>}
        </section>

        <section className="tk-card">
          <div className="tk-h">فعالیت ۱۴ روز اخیر</div>
          <div className="tk-act">
            {act.map((a, i) => (<div key={i} title={`${fa(a.c)} تیک`}><i style={{ height: Math.max(a.c ? 8 : 3, (a.c / mx) * 100) + '%' }} />{a.l}</div>))}
          </div>
        </section>

        {last && (
          <section className="tk-card">
            <div className="tk-h">ادامه از همین‌جا</div>
            {Row(last, true)}
            <div className="tk-actions"><button type="button" className="tk-btn" onClick={() => gotoUnit(last)}>رفتن به چک‌لیست</button></div>
          </section>
        )}

        {LESSONS.map((l) => (
          <section key={l} className="tk-lesson" style={{ '--lc': LESSON_COLOR[l] } as CssVars}>
            <div className="tk-lh"><i />{l}<span>{fa(BOOKS.filter((b) => b.lesson === l).length)} کتاب</span></div>
            <div className="tk-books">
              {BOOKS.map((b, bi) => {
                if (b.lesson !== l || (ui.grade !== 'all' && b.grade !== ui.grade)) return null;
                const us = unitsOfBook(bi);
                const ft = tot(s, us, fr.id);
                const fp = pct(cnt(s, us, fr.id), ft);
                return (
                  <button key={b.id} type="button" className="tk-book" onClick={() => { patch({ tab: 'list', book: bi, flt: 'all' }); setQ(''); }}>
                    <span className="top"><b>{b.book}</b><em>{b.grade}</em></span>
                    <span className="pc" style={{ color: ft ? fr.color : 'var(--sub-ink)' }}>{ft ? <>{fa(fp)}<small>٪</small></> : <small>—</small>}</span>
                    <MultiBar us={us} s={s} />
                    <span className="bt"><span>{fa(touched(s, us))}/{fa(us.length)} بند</span><UptoBadge us={us} s={s} /></span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </>
    );
  };

  // ------------- CHECKLIST
  const List = () => {
    const bi = ui.book;
    const b = BOOKS[bi];
    const all = unitsOfBook(bi);
    const fold = (k: string) => !!ui.fold[k] && !q && ui.flt === 'all';
    const match = (u: string) => {
      const d = s.done[u] || {};
      if (q && !unitPath(u).includes(q)) return false;
      if (ui.flt === 'none') return !Object.keys(d).length;
      if (ui.flt === 'flag') return !!s.flags[u];
      if (ui.flt !== 'all') { const rr = s.rounds.find((x) => x.id === ui.flt); return !!rr && appliesUnit(rr, u) && !d[ui.flt]; }
      return true;
    };
    const toggleFold = (k: string) => patch({ fold: { ...ui.fold, [k]: !ui.fold[k] } });
    const setAllFold = (mode: 'all' | 'sec' | 'none') => {
      const f: Record<string, boolean> = {};
      Object.keys(ui.fold).forEach((k) => { if (!k.startsWith(`${bi}|`)) f[k] = ui.fold[k]; });
      if (mode !== 'none') {
        b.chapters.forEach((c, ci) => {
          if (mode === 'all') f[`${bi}|c${ci}`] = true;
          else c.s.forEach((_, si) => { f[`${bi}|c${ci}s${si}`] = true; });
        });
      }
      patch({ fold: f });
    };
    const Head = (key: string, title: string, us: string[], lvl: 0 | 1, chunk: PlanChunk, shut: boolean) => (
      <div className="tk-nh">
        <button type="button" className={'tk-cr' + (shut ? ' shut' : '')} aria-label="باز و بسته" onClick={() => toggleFold(key)}><ChevronDown size={16} /></button>
        <span className="nt" onClick={() => toggleFold(key)}>{title} {lvl === 0 && <UptoBadge us={us} s={s} />}</span>
        <span className="tk-mut">{fa(touched(s, us))}/{fa(us.length)}</span>
        <Chips us={us} s={s} />
        <button type="button" className="tk-ic" title="افزودن به برنامه" aria-label="افزودن به برنامه" onClick={() => setPlan([chunk])}><CalendarRange size={15} /></button>
        <MultiBar us={us} s={s} />
      </div>
    );
    let shown = 0;
    const tree = b.chapters.map((c, ci) => {
      const secs = c.s
        .map((sec, si) => ({ sec, si, us: unitsOfSection(bi, ci, si) }))
        .map((x) => ({ ...x, v: x.us.filter(match) }))
        .filter((x) => x.v.length);
      if (!secs.length) return null;
      const ck = `${bi}|c${ci}`;
      const chUs = unitsOfChapter(bi, ci);
      const shut = fold(ck);
      shown += secs.reduce((n, x) => n + x.v.length, 0);
      return (
        <div key={ck} className={'tk-nd lv0' + (shut ? ' shut' : '')}>
          {Head(ck, c.t, chUs, 0, chunkOfChapter(bi, ci, chUs), shut)}
          <div className="nc">
            {secs.map((x) => {
              if (x.us.length === 1 && BY_UNIT[x.us[0]].self) return Row(x.us[0], false);
              const sk = `${ck}s${x.si}`;
              const ss = fold(sk);
              return (
                <div key={sk} className={'tk-nd lv1' + (ss ? ' shut' : '')}>
                  {Head(sk, x.sec.t, x.us, 1, chunkOfSection(bi, ci, x.si, x.us), ss)}
                  <div className="nc">{x.v.map((u) => Row(u, false))}</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    });
    return (
      <>
        <div className="tk-books-pick">
          {LESSONS.map((l) => (
            <div key={l} className="grp" style={{ '--lc': LESSON_COLOR[l] } as CssVars}>
              <span className="gl">{l}</span>
              {BOOKS.map((x, i) => x.lesson === l && (
                <button key={x.id} type="button" className={'tk-bp' + (i === bi ? ' on' : '')} onClick={() => patch({ book: i })}>{x.book}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="tk-toolbar">
          <span className="tk-badge" style={{ '--c': 'var(--primary)' } as CssVars}>{fa(touched(s, all))} از {fa(all.length)} بند</span>
          <UptoBadge us={all} s={s} />
          <div className="tk-search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در مباحث…" aria-label="جستجو" /></div>
          <select className="tk-sel" value={ui.flt} onChange={(e) => patch({ flt: e.target.value })} aria-label="فیلتر">
            <option value="all">همه‌ی بندها</option>
            <option value="none">هنوز شروع نشده</option>
            <option value="flag">علامت‌دار ⚑</option>
            {s.rounds.filter((r) => tot(s, all, r.id) > 0).map((r) => (<option key={r.id} value={r.id}>{r.name} تمام نشده</option>))}
          </select>
        </div>
        <div className="tk-toolbar">
          {s.rounds.map((r, i) => tot(s, all, r.id) > 0 && (
            <button key={r.id} type="button" className={'tk-lgp' + (ui.flt === r.id ? ' on' : '')} style={{ '--c': r.color } as CssVars} onClick={() => patch({ flt: ui.flt === r.id ? 'all' : r.id })} title="فقط بندهایی که این دور را ندارند">
              <i>{fa(i + 1)}</i>{r.name}<b>{fa(cnt(s, all, r.id))}/{fa(tot(s, all, r.id))}</b>
            </button>
          ))}
        </div>
        <div className="tk-toolbar sm">
          <button type="button" className="tk-btn" onClick={() => setAllFold('all')}>جمع کردن</button>
          <button type="button" className="tk-btn" onClick={() => setAllFold('sec')}>فقط فصل‌ها باز</button>
          <button type="button" className="tk-btn" onClick={() => setAllFold('none')}>باز کردن همه</button>
        </div>
        {tree}
        {!shown && <div className="tk-empty">موردی پیدا نشد. جستجو یا فیلتر را پاک کن.</div>}
      </>
    );
  };

  // ------------- REVIEW
  const Rev = () => {
    const r = s.rounds.find((x) => x.id === revRid) || fr;
    const ri = s.rounds.findIndex((x) => x.id === r.id);
    const prev = ri > 0 ? s.rounds[ri - 1] : null;
    const flagged = ALL_UNITS.filter((u) => s.flags[u]).slice(0, 60);
    const nx = ALL_UNITS.filter((u) => appliesUnit(r, u) && !isOn(s, u, r.id) && (!prev || isOn(s, u, prev.id))).slice(0, 30);
    return (
      <>
        <section className="tk-card">
          <div className="tk-h">⚑ علامت‌دار ({fa(Object.keys(s.flags).length)})</div>
          {flagged.map((u) => Row(u, true))}
          {!flagged.length && <div className="tk-empty">با ⚑ بندهای دشوار را علامت بزن تا اینجا جمع شوند.</div>}
          {flagged.length > 0 && <div className="tk-actions"><button type="button" className="tk-btn" onClick={() => setPlan(flagged.slice(0, 8).map(chunkOfUnit))}><CalendarRange size={16} /> ۸ مورد اول را به برنامه بفرست</button></div>}
        </section>
        <section className="tk-card">
          <div className="tk-h">نوبت بعدی برای
            <select className="tk-sel" value={r.id} onChange={(e) => setRevRid(e.target.value)}>
              {s.rounds.map((x) => (<option key={x.id} value={x.id}>{x.name}</option>))}
            </select>
          </div>
          <p className="tk-mut">{prev ? `بندهایی که «${prev.name}» را تمام کرده‌اند ولی ` : 'بندهایی که '}هنوز این مرحله را ندارند.</p>
          {nx.map((u) => Row(u, true))}
          {!nx.length && <div className="tk-empty">چیزی در صف نیست.</div>}
        </section>
      </>
    );
  };

  // ------------- ANALYSIS
  const Stat = () => {
    const bi = ui.book;
    const b = BOOKS[bi];
    return (
      <>
        <div className="tk-books-pick">
          {LESSONS.map((l) => (
            <div key={l} className="grp" style={{ '--lc': LESSON_COLOR[l] } as CssVars}>
              <span className="gl">{l}</span>
              {BOOKS.map((x, i) => x.lesson === l && (<button key={x.id} type="button" className={'tk-bp' + (i === bi ? ' on' : '')} onClick={() => patch({ book: i })}>{x.book}</button>))}
            </div>
          ))}
        </div>
        <section className="tk-card">
          <div className="tk-h">{b.book}: پیشرفت هر فصل در هر دور</div>
          <div className="tk-scroll">
            <table className="tk-mx">
              <thead><tr><th />{s.rounds.map((r) => (<th key={r.id} style={{ color: r.color }}>{r.name}</th>))}</tr></thead>
              <tbody>
                {b.chapters.map((c, ci) => {
                  const u = unitsOfChapter(bi, ci);
                  return (
                    <tr key={ci}>
                      <td>{c.t}</td>
                      {s.rounds.map((r) => { const t = tot(s, u, r.id); const p = pct(cnt(s, u, r.id), t); return (<td key={r.id} style={{ '--c': r.color, '--p': p } as CssVars}><span>{t ? `${fa(p)}٪` : '—'}</span></td>); })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="tk-card">
          <div className="tk-h">به تفکیک کتاب</div>
          {BOOKS.map((x, i) => {
            const u = unitsOfBook(i);
            return (
              <div key={x.id} className="tk-bl">
                <b>{x.book}</b><MultiBar us={u} s={s} /><span className="tk-mut">{fa(touched(s, u))}/{fa(u.length)}</span>
                <button type="button" className="tk-btn" onClick={() => patch({ tab: 'list', book: i })}>باز کردن</button>
              </div>
            );
          })}
        </section>
      </>
    );
  };

  // ------------- ROUNDS + BACKUP
  const SetV = () => {
    return (
      <>
        <section className="tk-card">
          <div className="tk-h">دورها و مرحله‌ها</div>
          <p className="tk-mut">هر دور یک رنگ و یک دایره‌ی شماره‌دار در چک‌لیست است. دور آموزشی، دور تستی، مرور و جمع‌بندی بساز و هر بار که کتاب را از اول می‌خوانی، یک دور تازه شروع کن.</p>
          {s.rounds.map((r, i) => {
            const dr = drafts[r.id] || { scope: '*', name: '', t: '' as BookType | '' };
            const setDr = (p: Partial<typeof dr>) => setDrafts((d) => ({ ...d, [r.id]: { ...dr, ...p } }));
            const entries = Object.entries(r.src || {});
            const pc = r.due ? paceInfo(s, r, ALL_UNITS) : null;
            return (
              <div key={r.id} className="tk-rblock" style={{ '--c': r.color } as CssVars}>
                <div className="tk-rr">
                  <i style={{ background: r.color }}>{fa(i + 1)}</i>
                  <input type="color" value={r.color} onChange={(e) => updateRound(r.id, { color: e.target.value })} aria-label="رنگ" />
                  <input className="tk-in" value={r.name} onChange={(e) => updateRound(r.id, { name: e.target.value })} aria-label="نام" />
                  <button type="button" className="tk-ic" disabled={i === 0} onClick={() => moveRound(r.id, -1)} aria-label="بالا"><ArrowUp size={15} /></button>
                  <button type="button" className="tk-ic" disabled={i === s.rounds.length - 1} onClick={() => moveRound(r.id, 1)} aria-label="پایین"><ArrowDown size={15} /></button>
                  <button
                    type="button"
                    className="tk-ic danger"
                    disabled={s.rounds.length <= 1}
                    aria-label="حذف"
                    onClick={async () => { if (await confirmDialog(`«${r.name}» و همه‌ی تیک‌هایش حذف شود؟`)) removeRound(r.id); }}
                  ><Trash2 size={15} /></button>
                </div>
                <div className="tk-rcfg">
                  <div className="tk-lab">🎯 این دور برای کدام پایه / درس / کتاب است؟</div>
                  <div className="tk-pills">
                    <button type="button" className={'tk-pill sm' + (!r.scope || !r.scope.length ? ' on' : '')} onClick={() => setRoundScope(r.id, [])}>همه‌ی کتاب‌ها</button>
                    {[...GRADES.map((g) => ({ k: g as string, l: 'پایه‌ی ' + g })), ...LESSON_NAMES.map((l) => ({ k: l, l: 'درس ' + l }))].map((o) => {
                      const on = !!r.scope && r.scope.includes(o.k);
                      return (
                        <button key={o.k} type="button" className={'tk-pill sm' + (on ? ' on' : '')} onClick={() => setRoundScope(r.id, on ? (r.scope || []).filter((x) => x !== o.k) : [...(r.scope || []), o.k])}>{o.l}</button>
                      );
                    })}
                    <select className="tk-sel" value="" aria-label="افزودن کتاب خاص" onChange={(e) => { if (e.target.value) setRoundScope(r.id, [...(r.scope || []).filter((x) => x !== e.target.value), e.target.value]); }}>
                      <option value="">+ کتاب خاص…</option>
                      {BOOKS.filter((b) => !(r.scope || []).includes(b.book)).map((b) => (<option key={b.id} value={b.book}>{b.book}</option>))}
                    </select>
                  </div>
                  {!!r.scope && r.scope.some((x) => BOOKS.some((b) => b.book === x)) && (
                    <div className="tk-srcs" style={{ marginTop: 6 }}>
                      {r.scope.filter((x) => BOOKS.some((b) => b.book === x)).map((x) => (
                        <span key={x} className="tk-srcchip"><b>{x}</b><button type="button" aria-label="حذف" onClick={() => setRoundScope(r.id, (r.scope || []).filter((y) => y !== x))}>×</button></span>
                      ))}
                    </div>
                  )}
                  <div className="tk-note">دامنه: {scopeLabel(r)} — این دور فقط برای همین کتاب‌ها دایره، درصد و کارت می‌سازد.</div>

                  <div className="tk-lab">📖 منبع‌های (کتاب) این دور <small>(برای هر کتاب می‌توانی چند منبع بگذاری)</small></div>
                  <div className="tk-srcs">
                    {entries.length === 0 && <span className="tk-mut">هنوز منبعی تعیین نشده.</span>}
                    {entries.flatMap(([k, list]) => list.map((v) => (
                      <span key={k + '|' + v.s} className="tk-srcchip">
                        <em>{k === '*' ? 'همه‌ی کتاب‌ها' : k}</em> ← <b>{v.s}</b>{v.t ? (v.t === 'test' ? ' · تستی' : ' · تشریحی') : ''}
                        <button type="button" aria-label="حذف منبع" onClick={() => removeRoundSource(r.id, k, v.s)}>×</button>
                      </span>
                    )))}
                  </div>
                  <div className="tk-srcadd">
                    <select className="tk-sel" value={dr.scope} onChange={(e) => setDr({ scope: e.target.value })} aria-label="برای">
                      <option value="*">همه‌ی کتاب‌ها</option>
                      {GRADES.map((g) => (<option key={g} value={g}>پایه‌ی {g}</option>))}
                      {LESSON_NAMES.map((l) => (<option key={l} value={l}>درس {l}</option>))}
                      {BOOKS.map((b) => (<option key={b.id} value={b.book}>{b.book}</option>))}
                    </select>
                    <input className="tk-in" list="tk-src-list" placeholder="نام منبع (مثلا: گاج، خیلی سبز، کتاب درسی)" value={dr.name} onChange={(e) => setDr({ name: e.target.value })} />
                    <button type="button" className={'tk-pill sm' + (dr.t === 'test' ? ' on' : '')} onClick={() => setDr({ t: dr.t === 'test' ? '' : 'test' })}>✏️ تستی</button>
                    <button type="button" className={'tk-pill sm' + (dr.t === 'descriptive' ? ' on' : '')} onClick={() => setDr({ t: dr.t === 'descriptive' ? '' : 'descriptive' })}>📖 تشریحی</button>
                    <button
                      type="button"
                      className="tk-btn pri"
                      disabled={!dr.name.trim()}
                      onClick={() => { setRoundSource(r.id, dr.scope, dr.name, dr.t || undefined); setDr({ name: '' }); }}
                    >افزودن</button>
                  </div>
                  <div className="tk-lab">🎯 ددلاین این دور</div>
                  <div className="tk-srcadd">
                    {r.due ? (
                      <>
                        <span className="tk-srcchip"><b>{dayLabel(r.due)}</b>{pc && pc.daysLeft !== null ? ` · ${pc.daysLeft < 0 ? 'گذشته' : fa(pc.daysLeft) + ' روز مانده'}` : ''}</span>
                        <button type="button" className="tk-btn" onClick={() => setRoundDue(r.id, undefined)}>حذف ددلاین</button>
                      </>
                    ) : (
                      <>
                        <input className="tk-in" inputMode="numeric" style={{ maxWidth: 150 }} placeholder="تا چند روز دیگر؟" value={dueDays[r.id] || ''} onChange={(e) => setDueDays((d) => ({ ...d, [r.id]: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />
                        <button
                          type="button"
                          className="tk-btn"
                          disabled={!dueDays[r.id]}
                          onClick={() => { setRoundDue(r.id, dateKeyOf(addDays(todayGregorian(), Number(dueDays[r.id])))); setDueDays((d) => ({ ...d, [r.id]: '' })); }}
                        >تعیین ددلاین</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <datalist id="tk-src-list">{sourceNames.map((n) => (<option key={n} value={n} />))}</datalist>
          <div className="tk-actions">
            <button type="button" className="tk-btn pri" onClick={() => addRound()}><Plus size={16} /> شروع دور تازه</button>
            <button type="button" className="tk-btn" onClick={() => addRound(`مرحله‌ی تست ${fa(s.rounds.length + 1)}`)}><Plus size={16} /> مرحله‌ی تست</button>
            <select className="tk-sel" value="" aria-label="دور تازه برای" onChange={(e) => { const v = e.target.value; if (!v) return; const sc = v.split('|'); addRound(`دور ${sc[0]}`, undefined, sc); }}>
              <option value="">+ دور مخصوص یک پایه / درس / کتاب…</option>
              {GRADES.map((g) => (<option key={g} value={g}>پایه‌ی {g}</option>))}
              {LESSON_NAMES.map((l) => (<option key={l} value={l}>درس {l}</option>))}
              {BOOKS.map((b) => (<option key={b.id} value={b.book}>{b.book}</option>))}
            </select>
          </div>
        </section>
        <section className="tk-card">
          <div className="tk-h">پشتیبان و انتقال</div>
          <p className="tk-mut">پیشرفت فقط روی همین دستگاه ذخیره می‌شود. متن پشتیبان را کپی کن یا پشتیبان «پیگیری درس‌ها»ی قبلی را اینجا بچسبان.</p>
          <textarea className="tk-ta" rows={5} value={bk} onChange={(e) => setBk(e.target.value)} placeholder="متن پشتیبان…" />
          <div className="tk-actions">
            <button type="button" className="tk-btn" onClick={() => { const t = exportBackup(); setBk(t); try { navigator.clipboard.writeText(t); setMsg('پشتیبان کپی شد ✓'); } catch { setMsg('متن بالا را دستی کپی کن'); } }}><Download size={16} /> کپی پشتیبان</button>
            <button type="button" className="tk-btn" onClick={() => { const r = importBackup(bk, 'merge'); setMsg(r.ok ? `ادغام شد ✓ (${fa(r.units)} بند دارای پیشرفت)` : 'متن پشتیبان معتبر نیست'); }}><Upload size={16} /> ادغام با فعلی</button>
            <button
              type="button"
              className="tk-btn"
              onClick={async () => { if (!bk.trim()) return; if (!(await confirmDialog('پیشرفت فعلی با این پشتیبان جایگزین شود؟'))) return; const r = importBackup(bk, 'replace'); setMsg(r.ok ? 'جایگزین شد ✓' : 'متن پشتیبان معتبر نیست'); }}
            >جایگزینی کامل</button>
          </div>
          {msg && <div className="tk-note">{msg}</div>}
          <div className="tk-actions">
            <button type="button" className="tk-btn danger" onClick={async () => { if (await confirmDialog('همه‌ی پیشرفت، علامت‌ها و یادداشت‌ها پاک شود؟')) { resetTracker(); setMsg('پاک شد'); } }}>پاک کردن همه‌ی پیشرفت</button>
          </div>
        </section>
      </>
    );
  };

  return (
    <div className="tk">
      <div className="tk-top">
        <h1>پیگیری مباحث</h1>
        <div className="tk-tabs" role="tablist">
          {TABS.map(([id, label, icon]) => (
            <button key={id} type="button" role="tab" aria-selected={ui.tab === id} className={ui.tab === id ? 'on' : ''} onClick={() => patch({ tab: id })}>{icon}<span>{label}</span></button>
          ))}
        </div>
        {onOpenPlanner && <button type="button" className="tk-btn" onClick={onOpenPlanner}><CalendarRange size={16} /> برنامه‌ریز</button>}
      </div>
      {ui.tab === 'dash' ? Dash() : ui.tab === 'list' ? List() : ui.tab === 'rev' ? Rev() : ui.tab === 'stat' ? Stat() : SetV()}
      {auto && <AutoPlanSheet onApply={applyAuto} onDone={(n) => afterPlan(n, 'آینده')} onClose={() => setAuto(false)} />}
      {noteU && <NoteSheet u={noteU} initial={s.notes[noteU] || ''} onClose={() => setNoteU(null)} />}
      {plan && <PlanSheet chunks={plan} s={s} onClose={() => setPlan(null)} onDone={afterPlan} />}
      {toast && <div className="tk-toast" role="status">{toast}</div>}
    </div>
  );
};

