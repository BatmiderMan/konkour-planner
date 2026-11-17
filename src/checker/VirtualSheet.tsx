import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pause, Play, Plus, Scale, Link2, Keyboard, Minimize2, X } from 'lucide-react';
import { MiniBar } from './MiniBar';
import {
  BookMeta, Grade, GradeSettings, SHEET_N, SavedSheet, addTime, countAnswered, emptySheetString, gradeSheet, makeRecord, makeSavedSheet, matchBook, onStep, setAnswer,
  stepLabel, timesToSeconds, toggleFlagQ, totalTime, unpackSheet, withAnswers
} from './model';
import { Plan, answeredIn, applyAction, firstOn, keyToAction, nextFlagged, planCount, rangeFromText } from './sheetEngine';
import { keysOf, loadPrefs as loadCkPrefs, notifyChanged, recallChoice, rememberChoice, saveScan, saveSheet } from './store';
import { useLibrary } from './hooks';
import { Modal } from './ui';
import { ResultView } from './ResultView';
import { clock, defaultTitle } from './format';
import { VirtualContext } from './launch';
import { useVsPrefs } from './vsPrefs';
import { liveElapsedMs, liveKind, liveTotalPlannedSeconds, useLivePlan } from '../livePlan';
import { loadPlannerData, patchPlannerItem } from '../plannerStore';
import { PartPicker } from './PartPicker';
import { openVaultEditor } from '../vault/launch';
import { lockScroll } from '../scrollLock';
import type { PlannerItem } from '../types';
import { TopicPick, TopicPicker } from '../components/tracker/TopicPicker';
import { labelForUnits } from '../trackerPlan';
import { useTracker } from '../trackerStore';
import { toPersianDigits as P } from '../utils';
import { Clock } from '../clock/Clock';
import { ExamWatch } from './ExamWatch';
import { getTickPrefs, playRampTick, setTickPrefs, TICK_STYLES, unlockAudio, useTickPrefs } from '../tickSound';
import './checker.css';

const PRESETS = [20, 30, 45, 50, 75, 100];
const STEPS: Array<[number, string]> = [[1, 'همه‌ی سؤال‌ها'], [2, '۲x · یکی در میان'], [3, '۳x · یکی در سه تا'], [4, '۴x']];

interface Outcome { grade: Grade; settings: GradeSettings; meta: BookMeta | null; times: number[]; flags: number[] }

/** Mini bar chart of the time per question while the test is running (no key yet, so colour = answered / empty / current). */
const LiveBars: React.FC<{ plan: Plan; sheet: string; times: number[]; cur: number }> = ({ plan, sheet, times, cur }) => {
  const qs: number[] = [];
  for (let q = 1; q <= plan.size; q++) if (onStep(q, plan.step, plan.off)) qs.push(q);
  const max = Math.max(1, ...qs.map((q) => times[q - 1] || 0));
  return (
    <div className="ck-ws-bars" dir="ltr" aria-label="زمان هر سؤال تا اینجا">
      {qs.map((q) => {
        const ms = times[q - 1] || 0, done = sheet[q - 1] && sheet[q - 1] !== '0';
        return <i key={q} className={(q === cur ? 'cur ' : '') + (done ? 'done' : ms > 1500 ? 'skip' : '')} style={{ height: `${Math.max(ms ? 8 : 3, (ms / max) * 100)}%` }} title={`${P(q)} · ${P(clock(ms))}`} />;
      })}
    </div>
  );
};

/**
 * The test room (virtual answer sheet), made for solving a test part with the keyboard:
 *  - the sheet reads left to right like paper; 1-4 (also ۱-۴ / numpad) marks the answer and moves on, 0 leaves the question empty,
 *    arrows move (Shift ignores the 2x/3x plan), Backspace empties, Space pauses the clock;
 *  - the time on each question is counted (visiting again adds up) and saved with the answers;
 *  - «2x / 3x»: only every 2nd / 3rd question belongs to the test; the others are dimmed, skipped and not counted when grading;
 *  - the sheet is attached to its planner card: the card's timer is the clock, the card's topics and notes ride along, and when the
 *    test is finished with an attached key it is graded right here and the result lands on the card (finish form is pre-filled);
 *  - a side panel keeps the pace (target time per question, forecast), the attachments (answer key, topics, note) and the settings.
 */
export const VirtualSheet: React.FC<{
  sheet?: SavedSheet;
  ctx?: VirtualContext;
  onClose: () => void;
  onCompare: (s: SavedSheet) => void;
}> = ({ sheet: initial, ctx, onClose, onCompare }) => {
  const hint = useMemo(() => rangeFromText([ctx?.detail, ctx?.title].filter(Boolean).join(' ')), [ctx?.detail, ctx?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  const { books } = useLibrary();
  const tracker = useTracker();
  const [vp, setVp] = useVsPrefs();
  const tickPrefs = useTickPrefs();
  const [rec, setRec] = useState<SavedSheet | null>(initial || null);
  const recRef = useRef<SavedSheet | null>(initial || null);
  const [title, setTitle] = useState(() => ctx?.title || defaultTitle('آزمون'));
  const [size, setSize] = useState(ctx?.size || hint?.count || 30);
  const [first, setFirst] = useState(ctx?.startQ || hint?.from || 1);
  const [step, setStep] = useState(ctx?.step || 1);
  const [off, setOff] = useState(ctx?.off || 0);
  const [budget, setBudget] = useState('');
  const [bookPick, setBookPick] = useState<string>('');
  const [paused, setPaused] = useState(false);
  const [, force] = useState(0);
  const [endHint, setEndHint] = useState(false);
  const [phase, setPhase] = useState<'doing' | 'result'>('doing');
  const [out, setOut] = useState<Outcome | null>(null);
  const [grading, setGrading] = useState(false);
  const [picker, setPicker] = useState(false);
  const [partPick, setPartPick] = useState(false);
  const waitStart = useRef(false); // the clock waits for the first answer (when «شروع خودکار» is off)
  const [side, setSide] = useState(false); // phone: the tools drawer
  const [mini, setMini] = useState(false);   // the one-line answer sheet on top (the rest of the screen stays usable)
  const [pip, setPip] = useState<Window | null>(null);
  /* keys only reach the window that has focus (a browser rule): show whether this bar is listening, and try to take focus when the pointer comes over it */
  const [listening, setListening] = useState(true);
  useEffect(() => {
    if (!mini) return;
    const w = pip || window;
    const upd = () => setListening(w.document.hasFocus());
    upd(); w.addEventListener('focus', upd); w.addEventListener('blur', upd);
    const hover = () => { if (!w.document.hasFocus()) { try { w.focus(); } catch { /* needs a click */ } setTimeout(upd, 50); } };
    w.document.addEventListener('pointerenter', hover, true); w.document.addEventListener('pointermove', hover, true);
    const poll = setInterval(upd, 1000);
    return () => { clearInterval(poll); try { w.removeEventListener('focus', upd); w.removeEventListener('blur', upd); w.document.removeEventListener('pointerenter', hover, true); w.document.removeEventListener('pointermove', hover, true); } catch { /* closed */ } };
  }, [mini, pip]);
  /* the floating window has a FIXED size that fits the bar exactly (not resizable by hand) */
  useEffect(() => {
    if (!pip) return;
    let sz = { w: 0, h: 0 }; let on = true;
    const fit = () => {
      const el = pip.document.querySelector('.ck-mini') as HTMLElement | null; if (!el || !on) return;
      const r = el.getBoundingClientRect(); sz = { w: Math.ceil(r.width) + (pip.outerWidth - pip.innerWidth), h: Math.ceil(r.height) + (pip.outerHeight - pip.innerHeight) };
      try { if (pip.outerWidth !== sz.w || pip.outerHeight !== sz.h) pip.resizeTo(sz.w, sz.h); } catch { /* needs a recent click: fine */ }
    };
    const snap = () => { if (!sz.w) return; try { if (Math.abs(pip.outerWidth - sz.w) > 2 || Math.abs(pip.outerHeight - sz.h) > 2) pip.resizeTo(sz.w, sz.h); } catch { /* ignore */ } };
    const t1 = setTimeout(fit, 120), t2 = setTimeout(fit, 600);
    pip.addEventListener('resize', snap);
    return () => { on = false; clearTimeout(t1); clearTimeout(t2); try { pip.removeEventListener('resize', snap); } catch { /* closed */ } };
  }, [pip]); // … floating above every window (Document Picture-in-Picture)
  const dirty = useRef(false);
  const live = useLivePlan();

  const qOf = (r: SavedSheet | null) => Math.min(Math.max(1, (r && r.cursor) || 1), (r && r.size) || 1);
  const [q, setQState] = useState(() => qOf(initial || null));
  const qRef = useRef(q);
  const setQ = useCallback((n: number) => { qRef.current = n; setQState(n); }, []);
  const prefsRef = useRef(vp);
  prefsRef.current = vp;

  const rows = rec ? Math.min(SHEET_N, Math.max(1, rec.size)) : 0;
  const plan: Plan = { size: rows, step: rec?.step || 1, off: rec?.off || 0 };
  const planRef = useRef(plan);
  planRef.current = plan;

  // the planner card this sheet belongs to. Its timer is shown for reference only: the sheet runs its OWN clock
  const liveOn = !!(rec && rec.link && rec.link.plannerItemId && live && liveKind(live) === 'plan' && live.item.id === rec.link.plannerItemId && live.dateKey === rec.link.dateKey);
  const ticking = !!rec && phase === 'doing' && rec.mode === 'live' && rec.state === 'open' && !paused;
  const tickRef = useRef(ticking);
  tickRef.current = ticking;
  const miniRef = useRef(false); // in the one-line / floating mode the test is solved in ANOTHER window: the clock must keep running while this page is hidden
  miniRef.current = mini;

  // a key that fits the card: remembered choice → same book / lesson as the card (like the scanner does)
  const autoBook = useCallback((): string => {
    const h = { source: ctx?.source, lesson: ctx?.lesson };
    const mem = recallChoice(h);
    const m = (mem && books.find((b) => b.id === mem.bookId)) || matchBook(books, h);
    return m ? m.id : '';
  }, [books, ctx?.source, ctx?.lesson]);
  const bookTouched = useRef(false);
  useEffect(() => { if (!rec && !bookTouched.current && books.length) setBookPick(autoBook()); }, [books.length, rec, autoBook]);

  const persist = useCallback((next: SavedSheet, silent = true) => {
    recRef.current = next; setRec(next); dirty.current = true;
    saveSheet(next, { silent });
  }, []);

  /* ---------- per-question tick: every second on the current question, rising towards its target time; restarts when it is passed ---------- */
  const cycleRef = useRef(0); // seconds of one rising cycle (the question's target time), set below once it is known
  const qBase = useRef({ q: 0, base: 0, sec: 0 }); // time already on the question when it was entered, last second ticked
  const resetQTick = useCallback(() => {
    qBase.current = { q: qRef.current, base: (recRef.current?.times || [])[qRef.current - 1] || 0, sec: 0 };
  }, []);
  useEffect(() => { resetQTick(); }, [q, resetQTick]);

  /* ---------- the clock: every 200 ms the elapsed slice goes to the selected question ---------- */
  useEffect(() => {
    let last = performance.now(), n = 0, sec = -1;
    const id = window.setInterval(() => {
      const now = performance.now(), dt = Math.min(now - last, miniRef.current && document.hidden ? 70000 : 1500); // hidden pages get timers throttled to once a minute: count the real time
      last = now;
      const cur = recRef.current;
      if (!cur || !tickRef.current || (document.hidden && !miniRef.current)) return;
      const times = addTime(cur.times, qRef.current, dt);
      const spent = totalTime(times);
      recRef.current = { ...cur, times, spentMs: spent, cursor: qRef.current };
      dirty.current = true;
      const tp = getTickPrefs();
      if (tp.qTick) {
        if (qBase.current.q !== qRef.current) resetQTick();
        const s1 = Math.floor((times[qRef.current - 1] - qBase.current.base) / 1000);
        if (s1 > qBase.current.sec) {
          qBase.current.sec = s1;
          const cyc = Math.max(3, Math.round(cycleRef.current || tp.seconds));
          playRampTick(tp.style, (s1 % cyc) / cyc);
        }
      }
      if (Math.floor(spent / 1000) !== sec) { sec = Math.floor(spent / 1000); setRec(recRef.current); force((x) => x + 1); }
      if (++n % 25 === 0) saveSheet({ ...recRef.current, updatedAt: Date.now() }, { silent: true }); // every ~5 s
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  // the last tap and the last second of time must be on disk, and the lists behind the screen refresh
  useEffect(() => () => {
    const cur = recRef.current;
    if (cur && dirty.current) saveSheet({ ...cur, cursor: qRef.current, updatedAt: Date.now() }, { silent: false }); else notifyChanged();
  }, []);
  useEffect(() => (rec && !mini ? lockScroll() : undefined), [!!rec, mini]); // eslint-disable-line react-hooks/exhaustive-deps -- only while the room itself is on screen (the setup form is a Modal with its own lock)

  /* ---------- keyboard ---------- */
  const togglePause = useCallback(() => { waitStart.current = false; setPaused((p) => !p); }, []);

  const buzz = () => { if (prefsRef.current.haptic && typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(6); } catch { /* ignore */ } } };

  const press = useCallback((a: NonNullable<ReturnType<typeof keyToAction>>) => {
    const cur = recRef.current;
    if (!cur) return;
    if (a.t === 'pause') { togglePause(); return; }
    if (a.t === 'flag') { persist({ ...cur, flags: toggleFlagQ(cur.flags, qRef.current), cursor: qRef.current }); buzz(); return; }
    if (a.t === 'nextFlag') { const nq = nextFlagged(cur.flags, qRef.current); setQ(nq); setEndHint(false); return; }
    if ((a.t === 'answer' || a.t === 'blank') && waitStart.current) { waitStart.current = false; setPaused(false); }
    const r = applyAction({ sheet: cur.sheet, q: qRef.current }, a, planRef.current, prefsRef.current.autoNext);
    if (a.t === 'answer' || a.t === 'blank') buzz();
    setEndHint(r.atEnd);
    setQ(r.q);
    if (r.changed) persist({ ...withAnswers(cur, r.sheet), times: recRef.current?.times, spentMs: recRef.current?.spentMs, cursor: r.q });
    else if (r.q !== qRef.current || a.t === 'move') { recRef.current = { ...cur, cursor: r.q }; dirty.current = true; }
  }, [persist, setQ, togglePause]);

  useEffect(() => {
    if (!rec || phase !== 'doing' || picker) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === 'function' && t.closest('input,textarea,select,[contenteditable="true"]')) return;
      const a = keyToAction(e);
      if (!a) return;
      e.preventDefault(); e.stopImmediatePropagation(); // the timer's own shortcuts (Space ...) must not fire as well
      press(a);
    };
    window.addEventListener('keydown', onKey, true); // capture: runs before the other handlers
    pip?.addEventListener('keydown', onKey, true);    // the floating window reads the same keys
    return () => { window.removeEventListener('keydown', onKey, true); pip?.removeEventListener('keydown', onKey, true); };
  }, [!!rec, phase, picker, press, pip]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !picker && !mini) onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, picker, mini]);

  const canPip = typeof window !== 'undefined' && !!(window as any).documentPictureInPicture;
  const openPip = useCallback(async () => {
    try {
      const w: Window = await (window as any).documentPictureInPicture.requestWindow({ width: 600, height: 64 });
      const d = w.document;
      document.querySelectorAll('style').forEach((s) => d.head.appendChild(s.cloneNode(true)));
      document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => d.head.appendChild(l.cloneNode(true)));
      for (const a of Array.from(document.documentElement.attributes)) d.documentElement.setAttribute(a.name, a.value);
      for (const a of Array.from(document.body.attributes)) d.body.setAttribute(a.name, a.value);
      d.documentElement.dir = 'rtl'; d.body.style.margin = '0'; d.body.style.overflow = 'hidden';
      w.addEventListener('pagehide', () => setPip(null));
      setPip(w); setMini(true);
    } catch { /* not allowed / not supported: the bar on top still works */ }
  }, []);
  useEffect(() => () => { try { pip?.close(); } catch { /* ignore */ } }, [pip]);

  // keep the selected row in view
  useEffect(() => { document.getElementById('vsq' + q)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [q]);

  const start = () => {
    const stepV = Math.max(1, step), offV = Math.min(off, stepV - 1);
    const meta = books.find((b) => b.id === bookPick);
    const r = makeSavedSheet(title.trim() || defaultTitle('آزمون'), 'live', emptySheetString(), {
      size, startQ: Math.max(1, first), step: stepV > 1 ? stepV : undefined, off: stepV > 1 && offV ? offV : undefined,
      times: [], link: ctx?.link, lesson: ctx?.lesson, source: ctx?.source, detail: ctx?.detail,
      bookId: meta?.id, bookTitle: meta?.title, budgetMin: parseInt(budget, 10) > 0 ? parseInt(budget, 10) : undefined
    });
    // topics the planner card already carries
    if (ctx?.link?.plannerItemId) {
      const it = (loadPlannerData().items[ctx.link.dateKey || ''] || []).find((x) => x.id === ctx.link!.plannerItemId);
      if (it && it.trk) r.trk = it.trk;
    }
    const q0 = firstOn({ size, step: stepV, off: offV });
    r.cursor = q0;
    recRef.current = r; setRec(r); setQ(q0); dirty.current = true; saveSheet(r, { silent: true });
    if (!vp.autoStart) { waitStart.current = true; setPaused(true); }
  };

  /* ---------- setup screen ---------- */
  if (!rec) {
    return (
      <Modal title="پاسخ‌برگ مجازی" onClose={onClose}
        footer={<button type="button" className="ck-btn primary" onClick={start}>شروع آزمون</button>}>
        <section className="ck-card">
          <p className="ck-hint">پاسخ‌ها را با کیبورد وارد کن: <b>۱ تا ۴</b> گزینه را می‌زند و می‌رود سؤال بعد، <b>۰</b> سؤال را نزده می‌گذارد، با <b>فلش‌ها</b> بالا و پایین می‌روی. زمانِ هر سؤال هم حساب می‌شود و هر علامت همان لحظه ذخیره می‌شود.</p>
          {ctx?.link && <p className="ck-note"><Link2 size={14} /> این پاسخ‌برگ به همین پارتِ برنامه‌ریز وصل است؛ ساعتش با تایمر آن پارت هم‌گام می‌شود و نتیجه‌اش روی همان کارت می‌نشیند.</p>}
          <div className="ck-fields">
            <label className="ck-field grow"><span>نام آزمون</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
          </div>
          <div className="ck-fields">
            <div className="ck-field"><span>تعداد سؤال</span>
              <div className="ck-chips">
                {PRESETS.map((n) => <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)}>{P(n)}</button>)}
              </div>
            </div>
            <label className="ck-field"><span>یا عدد دلخواه</span>
              <input type="number" min={1} max={SHEET_N} value={size} onChange={(e) => setSize(Math.min(SHEET_N, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
            </label>
            <label className="ck-field"><span>شماره‌ی اولین تست (در کتاب)</span>
              <input type="number" min={1} value={first} onChange={(e) => setFirst(Math.max(1, parseInt(e.target.value, 10) || 1))} />
            </label>
          </div>
          <div className="ck-fields">
            <div className="ck-field grow"><span>همه‌ی تست‌ها را می‌زنی یا یکی در میان؟ (۲x / ۳x)</span>
              <div className="ck-chips">
                {STEPS.map(([n, t]) => <button key={n} type="button" aria-pressed={step === n} onClick={() => { setStep(n); setOff(0); }}>{t}</button>)}
              </div>
            </div>
          </div>
          {step > 1 && (
            <div className="ck-fields">
              <div className="ck-field grow"><span>از کدام سؤال شروع می‌کنی؟</span>
                <div className="ck-chips">
                  {Array.from({ length: step }, (_, i) => <button key={i} type="button" aria-pressed={off === i} onClick={() => setOff(i)}>سؤال {P(first + i)}</button>)}
                </div>
              </div>
            </div>
          )}
          {step > 1 && <p className="ck-note">با {P(step)}x سؤال‌های {P(first + off)}، {P(first + off + step)}، {P(first + off + 2 * step)}… فعال‌اند؛ بقیه کم‌رنگ می‌شوند، فلش‌ها از رویشان می‌پرند و موقع تصحیح اگر خالی بمانند اصلاً حساب نمی‌شوند.</p>}
          <div className="ck-fields">
            <label className="ck-field grow"><span>🔑 کلید این آزمون (اختیاری؛ با کلید، پایان آزمون همان‌جا تصحیح می‌شود)</span>
              <select value={bookPick} onChange={(e) => { bookTouched.current = true; setBookPick(e.target.value); }}>
                <option value="">بدون کلید — بعداً انتخاب می‌کنم</option>
                {books.map((b) => <option key={b.id} value={b.id}>{b.title}{b.count ? ` (${P(b.count)} کلید)` : ''}</option>)}
              </select>
            </label>
            {!ctx?.link && (
              <label className="ck-field"><span>⏱ زمان آزمون (دقیقه، اختیاری)</span>
                <input type="number" min={1} max={600} value={budget} placeholder="مثلاً ۴۵" onChange={(e) => setBudget(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              </label>
            )}
          </div>
        </section>
      </Modal>
    );
  }

  /* ---------- derived values for the room ---------- */
  const answers = rec.sheet;
  const totalOn = planCount(plan);
  const { onPlan, extra } = answeredIn(answers, plan);
  const startNo = rec.startQ || 1;
  const times = rec.times || [];
  const flagList = (rec.flags || []).filter((x) => x >= 1 && x <= rows);
  const flagSet = new Set(flagList);
  const isLive = rec.mode === 'live';
  const open = isLive && rec.state === 'open' && phase === 'doing';
  const spent = rec.spentMs || totalTime(times);
  const cardElapsed = liveOn && live ? liveElapsedMs(live) : 0;
  const planned = liveOn && live ? liveTotalPlannedSeconds(live) : 0;
  const mainClock = spent; // the sheet's own clock
  const runningNow = !paused;
  const budgetSec = planned > 0 ? planned : rec.budgetMin ? rec.budgetMin * 60 : 0;
  const targetSec = budgetSec && totalOn ? budgetSec / totalOn : 0;
  cycleRef.current = targetSec; // without a target time the cycle falls back to the tick interval of the timer's tick settings
  const spentSec = spent / 1000;
  const avgSec = onPlan ? spentSec / onPlan : 0;
  const remainQ = Math.max(0, totalOn - onPlan);
  const leftSec = budgetSec ? Math.max(0, budgetSec - spentSec) : 0;
  const forecastSec = avgSec * remainQ;
  const reachable = avgSec > 0 ? Math.floor(leftSec / avgSec) : remainQ; // questions the time left still pays for at the current pace
  const unreached = Math.max(0, remainQ - reachable);
  const curMs = times[q - 1] || 0;
  const slowLimit = (targetSec || (onPlan >= 5 ? avgSec : 0)) * vp.slowFactor * 1000;
  const curSlow = vp.slowWarn && open && slowLimit > 0 && curMs > slowLimit && onStep(q, plan.step, plan.off);
  const meta = books.find((b) => b.id === rec.bookId) || null;
  const itemTrk = (() => {
    if (rec.trk) return rec.trk;
    if (rec.link && rec.link.plannerItemId) { const it = (loadPlannerData().items[rec.link.dateKey || ''] || []).find((x) => x.id === rec.link!.plannerItemId); return it && it.trk ? it.trk : undefined; }
    return undefined;
  })();
  const trkRound = itemTrk ? tracker.rounds.find((r) => r.id === itemTrk.r) : undefined;
  const outOfKey = meta && (startNo < meta.min || startNo + rows - 1 > meta.max);

  const pickMouse = (qq: number, o: number) => {
    const cur = answers[qq - 1];
    const v = cur === String(o) ? 0 : o; // clicking the chosen option again clears it
    const nextSheet = setAnswer(answers, qq, v);
    const nq = v && vp.autoNext ? applyAction({ sheet: nextSheet, q: qq }, { t: 'move', dir: 1, any: false }, plan).q : qq;
    setQ(nq); setEndHint(false); buzz();
    persist({ ...withAnswers(rec, nextSheet), times: recRef.current?.times, spentMs: recRef.current?.spentMs, cursor: nq });
  };
  const grow = () => persist({ ...withAnswers(rec, answers, { size: Math.min(SHEET_N, rows + 25) }), times: recRef.current?.times });
  const rename = (t: string) => persist({ ...rec, title: t, updatedAt: Date.now() });
  const setNote = (t: string) => persist({ ...rec, note: t, updatedAt: Date.now() });
  const setBook = (id: string) => { const b = books.find((x) => x.id === id); persist({ ...rec, bookId: b?.id, bookTitle: b?.title }); };
  const applyTopics = (p: TopicPick) => {
    const trk = { u: p.us, r: p.roundId, ...(p.part ? { m: 'p' as const } : {}) };
    persist({ ...rec, trk });
    if (rec.link && rec.link.plannerItemId && rec.link.dateKey) patchPlannerItem(rec.link.dateKey, rec.link.plannerItemId, { trk }); // the card now ticks these topics when it is finished
  };

  /** attach this sheet to another planner card (or take it off): the card's topics ride along, and the finished result lands on that card */
  const applyLink = (dateKey: string, it: PlannerItem) => {
    persist({ ...rec, link: { dateKey, plannerItemId: it.id }, lesson: it.subject, source: it.source, detail: it.detail, trk: it.trk || rec.trk });
    if (rec.trk && !it.trk) patchPlannerItem(dateKey, it.id, { trk: rec.trk });
  };
  const detach = () => persist({ ...rec, link: undefined });
  const linkedItem = rec.link && rec.link.plannerItemId ? (loadPlannerData().items[rec.link.dateKey || ''] || []).find((x) => x.id === rec.link!.plannerItemId) : undefined;

  /** finish: with an attached key the test is graded right here and the result is saved on the card's link */
  const finish = async (mode: 'grade' | 'compare' | 'save') => {
    const cur = recRef.current || rec;
    const done = { ...withAnswers(cur, cur.sheet), state: 'done' as const, cursor: qRef.current };
    recRef.current = done; dirty.current = true;
    if (mode === 'save') { await saveSheet(done, { silent: false }); onClose(); return; }
    if (mode === 'compare') { await saveSheet(done, { silent: false }); onCompare(done); return; }
    setGrading(true);
    const keys = await keysOf(done.bookId);
    const ck = loadCkPrefs();
    const settings: GradeSettings = { startQ: done.startQ || 1, from: 1, to: rows, penalty: ck.penalty, dblWrong: ck.dblWrong, step: done.step, off: done.off };
    const read = unpackSheet(done.sheet);
    const grade = gradeSheet(read, {}, keys, settings);
    const bm = books.find((b) => b.id === done.bookId) || null;
    const link = { ...(done.link || {}), lesson: done.lesson, label: done.title, sheetId: done.id };
    const sec = timesToSeconds(done.times, rows);
    const scan = makeRecord(read, {}, grade, settings, bm, link, sec, done.flags);
    if (done.scanId) scan.id = done.scanId; // grading again overwrites the earlier result of this sheet
    await saveScan(scan);
    const saved = { ...done, scanId: scan.id, pct: grade.pct };
    recRef.current = saved;
    await saveSheet(saved, { silent: false });
    if (bm) rememberChoice({ source: done.source, lesson: done.lesson }, bm.id, done.startQ);
    setRec(saved); setOut({ grade, settings, meta: bm, times: sec, flags: (done.flags || []).map((x) => (done.startQ || 1) + x - 1) }); setPhase('result'); setGrading(false);
  };
  const backToTest = () => { const cur = recRef.current || rec; const r = { ...cur, state: 'open' as const }; persist(r, false); setPhase('doing'); setOut(null); };

  const rowsEls: React.ReactNode[] = [];
  for (let n = 1; n <= rows; n++) {
    const c = answers[n - 1] || '0';
    const on = onStep(n, plan.step, plan.off);
    const ms = times[n - 1] || 0;
    const slow = vp.slowWarn && slowLimit > 0 && ms > slowLimit && on;
    const flagged = flagSet.has(n);
    rowsEls.push(
      <div
        key={n}
        id={'vsq' + n}
        className={'ck-vs2-q' + (n === q ? ' cur' : '') + (c !== '0' ? ' done' : '') + (on ? '' : ' off') + (n % 5 === 0 ? ' sep' : '') + (slow ? ' slow' : '') + (flagged ? ' flag' : '')}
        onClick={() => { setQ(n); setEndHint(false); }}
      >
        <span className="no">{P(startNo + n - 1)}</span>
        {[1, 2, 3, 4].map((o) => (
          <button key={o} type="button" tabIndex={-1} className={'o' + (c === String(o) ? ' on' : '')} aria-pressed={c === String(o)} aria-label={`سؤال ${startNo + n - 1} گزینه ${o}`} onClick={(e) => { e.stopPropagation(); pickMouse(n, o); }}>{P(o)}</button>
        ))}
        <span className={'tm' + (n === q ? ' live' : '')}>{vp.showTimes && ms >= 1000 ? P(clock(ms)) : ''}</span>
        <button type="button" tabIndex={-1} className={'ck-flagbtn' + (flagged ? ' on' : '')} aria-pressed={flagged} aria-label={`نشان‌دار کردن سؤال ${startNo + n - 1}`} title="نشان‌دار (F)" onClick={(e) => { e.stopPropagation(); persist({ ...recRef.current!, flags: toggleFlagQ(recRef.current!.flags, n) }); }}>⚑</button>
      </div>
    );
  }

  const mm = (sec: number) => P(clock(Math.round(sec) * 1000));

  const side_el = (
    <aside className={'ck-ws-side' + (side ? ' open' : '')}>
      {open && (
        <section className="ck-ws-card">
          <h4>ساعت و ایستگاه‌ها</h4>
          <ExamWatch budgetSec={budgetSec} leftSec={leftSec} spentSec={spentSec} totalOn={totalOn} done={onPlan} targetSec={targetSec} running={runningNow} />
        </section>
      )}
      {open && (
        <section className="ck-ws-card pace">
          <h4>سرعت و زمان</h4>
          {budgetSec > 0 ? (
            <>
              <div className="row"><span>{planned > 0 ? 'زمان باقی‌مانده (از زمان پیش‌بینی پارت)' : 'زمان باقی‌مانده'}</span><b dir="ltr">{mm(leftSec)}</b></div>
              <div className="row"><span>هدف هر سؤال</span><b dir="ltr">{mm(targetSec)}</b></div>
            </>
          ) : <p className="mut">برای هدف زمانی، موقع ساخت پاسخ‌برگ «زمان آزمون» بده یا پارت را با زمان پیش‌بینی‌شده بچین.</p>}
          <div className="row"><span>میانگین تا حالا</span><b dir="ltr">{onPlan ? mm(avgSec) : '—'}</b></div>
          {budgetSec > 0 && onPlan >= 3 && remainQ > 0 && (
            <p className={'fc ' + (unreached > 0 ? 'late' : 'ok')}>
              {unreached > 0 ? `با این سرعت به ${P(unreached)} سؤال از ${P(remainQ)} سؤال باقی‌مانده نمی‌رسی.` : 'با این سرعت به همه‌ی سؤال‌ها می‌رسی.'}
            </p>
          )}
          {curSlow && <p className="fc late">روی سؤال {P(startNo + q - 1)} زیاد مانده‌ای؛ شاید بهتر است ردش کنی (۰) و برگردی.</p>}
          <LiveBars plan={plan} sheet={answers} times={times} cur={q} />
        </section>
      )}
      <section className="ck-ws-card">
        <h4>⚑ نشان‌دارها {flagList.length > 0 && <small>({P(flagList.length)})</small>}</h4>
        {flagList.length ? (
          <div className="flagchips">{flagList.map((n) => <button key={n} type="button" onClick={() => { setQ(n); setEndHint(false); }}>{P(startNo + n - 1)}</button>)}</div>
        ) : <p className="mut">سؤال مشکوک را با <kbd>F</kbd> (یا دکمه‌ی ⚑ کنار سؤال) نشان‌دار کن؛ با <kbd>G</kbd> به نشان‌دار بعدی می‌روی. بعد از تصحیح می‌بینی حدست درست بود یا نه.</p>}
      </section>
      <section className="ck-ws-card">
        <h4>پیوست‌ها</h4>
        <label className="att"><span>🔑 کلید</span>
          <select value={rec.bookId || ''} onChange={(e) => setBook(e.target.value)} aria-label="کلید آزمون">
            <option value="">بدون کلید</option>
            {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </label>
        {meta && <p className={'mut' + (outOfKey ? ' warn' : '')}>{outOfKey ? `کلیدِ این کتاب فقط سؤال‌های ${P(meta.min)} تا ${P(meta.max)} را دارد؛ بقیه بدون کلید می‌مانند.` : `کلیدها: سؤال ${P(meta.min)} تا ${P(meta.max)}`}</p>}
        <div className="att"><span>📚 مبحث</span>
          <div className="topics">
            {itemTrk ? (
              <span className="chip" style={{ ['--c' as string]: trkRound ? trkRound.color : '#888' } as React.CSSProperties}>
                {trkRound ? trkRound.name : 'دور'} · {labelForUnits(itemTrk.u).slice(0, 38)}{itemTrk.m === 'p' ? ' · پارت' : ''}
              </span>
            ) : <span className="mut">هنوز مشخص نشده</span>}
            <button type="button" className="ck-btn sm" onClick={() => setPicker(true)}>{itemTrk ? 'تغییر' : 'انتخاب مبحث'}</button>
          </div>
        </div>
        <label className="att col"><span>📝 یادداشت (به گزارش پارت می‌رود)</span>
          <textarea rows={3} value={rec.note || ''} placeholder="نکته‌ها، تست‌های مشکل‌دار…" onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>
      <section className="ck-ws-card">
        <h4>تنظیمات پاسخ‌برگ</h4>
        <label className="sw"><input type="checkbox" checked={vp.autoNext} onChange={(e) => setVp({ autoNext: e.target.checked })} /> رفتن خودکار به سؤال بعد</label>
        <label className="sw"><input type="checkbox" checked={vp.showTimes} onChange={(e) => setVp({ showTimes: e.target.checked })} /> نمایش زمان کنار هر سؤال</label>
        <label className="sw"><input type="checkbox" checked={vp.slowWarn} onChange={(e) => setVp({ slowWarn: e.target.checked })} /> هشدار سؤال وقت‌گیر</label>
        <label className="sw"><input type="checkbox" checked={tickPrefs.qTick} onChange={(e) => { unlockAudio(); setTickPrefs({ qTick: e.target.checked }); }} /> تیک ثانیه‌ای برای هر سؤال (بالا رفتن صدا تا پایان وقت سؤال)</label>
        {tickPrefs.qTick && (
          <div className="att col">
            <span className="mut">{targetSec > 0 ? `هر سؤال ${P(Math.round(targetSec))} ثانیه؛ بعد از آن دوباره از اول.` : `بدون زمان آزمون، هر ${P(tickPrefs.seconds)} ثانیه (از «ریتم تیک» تایمر) دوباره از اول می‌شود.`}</span>
            <select value={tickPrefs.style} aria-label="مدل صدای تیک" onChange={(e) => { setTickPrefs({ style: e.target.value as typeof tickPrefs.style }); unlockAudio(); playRampTick(e.target.value as typeof tickPrefs.style, 0.6); }}>
              {TICK_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        )}
        <label className="sw"><input type="checkbox" checked={vp.hideDigital} onChange={(e) => setVp({ hideDigital: e.target.checked })} /> پنهان کردن ساعت دیجیتال بالا (تمرین با ساعت عقربه‌ای)</label>
        <label className="sw"><input type="checkbox" checked={vp.haptic} onChange={(e) => setVp({ haptic: e.target.checked })} /> لرزش کوتاه با هر کلید (گوشی)</label>
      </section>
    </aside>
  );

  if (mini && phase === 'doing') {
    const bar = (
      <MiniBar
        no={startNo + q - 1} cur={answers[q - 1] || '0'} answered={onPlan} total={totalOn} flagged={flagList.includes(q)} slow={!!curSlow}
        curMs={curMs} mainSec={Math.floor(mainClock / 1000)} running={runningNow && open} showClock={isLive} inPip={!!pip} canPip={canPip} listening={listening}
        onAnswer={(v) => press({ t: 'answer', v })} onBlank={() => press({ t: 'blank' })} onMove={(d) => press({ t: 'move', dir: d, any: false })} onFlag={() => press({ t: 'flag' })}
        onPause={togglePause} onExpand={() => { setMini(false); try { pip?.close(); } catch { /* ignore */ } setPip(null); }} onPip={openPip}
        onFinish={() => { setMini(false); try { pip?.close(); } catch { /* ignore */ } setPip(null); finish(rec.bookId ? 'grade' : 'compare'); }}
      />
    );
    return pip ? createPortal(bar, pip.document.body) : <div className="ck-mini-wrap">{bar}</div>;
  }

  return (
    <div className="ck-ws" role="dialog" aria-modal="true" aria-label="اتاق حل تست">
      <header className="ck-ws-head">
        <button type="button" className="ck-x" aria-label="بستن" onClick={onClose}><X size={20} /></button>
        <div className="ttl">
          <small>{rec.mode === 'scan' ? 'پاسخ‌برگ اسکن‌شده' : 'اتاق حل تست'}{planNow(plan)}</small>
          <input type="text" value={rec.title} aria-label="نام پاسخ‌برگ" onChange={(e) => rename(e.target.value)} />
          <button type="button" className={'linkchip' + (linkedItem ? '' : ' none')} onClick={() => setPartPick(true)} title="انتخاب یا تغییر پارتی که این پاسخ‌برگ به آن وصل است">
            <Link2 size={12} /><span>{linkedItem ? `پارت: ${linkedItem.subject}${linkedItem.detail ? ' — ' + linkedItem.detail : ''}` : rec.link && rec.link.plannerItemId ? 'پارتِ وصل‌شده پیدا نشد — تغییر' : 'به هیچ پارتی وصل نیست — وصل کن'}</span>
          </button>
          {liveOn && live && <span className="partclock">تایمر پارت (جدا): <b dir="ltr"><Clock sec={Math.floor(liveElapsedMs(live) / 1000)} running={!!live.running} /></b></span>}
        </div>
        {isLive && !(vp.hideDigital && open) && (
          <div className={'clock' + (runningNow && open ? ' run' : ' stop') + (curSlow ? ' slow' : '')} title="زمان پاسخ‌برگ (جدا از تایمر پارت)">
            <b dir="ltr"><Clock sec={Math.floor(mainClock / 1000)} running={runningNow && open} /></b>
            <span>{open ? (runningNow ? 'زمان پاسخ‌برگ' : waitStart.current ? 'با اولین پاسخ شروع می‌شود' : 'زمان متوقف است') : 'زمان کل'}</span>
          </div>
        )}
        <div className="acts">
          {open && <button type="button" className="ck-btn sm" aria-label={runningNow ? 'توقف زمان' : 'ادامه‌ی زمان'} onClick={togglePause}>{runningNow ? <Pause size={15} /> : <Play size={15} />} {runningNow ? 'توقف' : 'ادامه'}</button>}
          {open && <button type="button" className="ck-btn sm" title="پاسخ‌برگ یک‌خطی بالای صفحه؛ با همان کلیدها" onClick={() => setMini(true)}><Minimize2 size={15} /> حالت کوچک</button>}
          <button type="button" className="ck-btn sm ck-ws-tools" onClick={() => setSide((v) => !v)}>ابزارها</button>
        </div>
      </header>

      <div className="ck-ws-body">
        <main className="ck-ws-main">
          {phase === 'result' && out ? (
            <>
              <div className="ck-ws-resbar">
                <b>{out.meta ? `تصحیح با «${out.meta.title}»` : 'تصحیح'}</b>
                <span>نتیجه روی کارت این پارت ثبت می‌شود و در فرم پایان پارت خودکار پر است.</span>
              </div>
              <ResultView
                grade={out.grade} penalty={out.settings.penalty} times={out.times} flags={out.flags} title={rec.lesson || out.meta?.title}
                onVault={(x) => openVaultEditor({
                  book: out.meta?.title || rec.bookTitle || rec.lesson || '', lesson: rec.lesson || '', units: itemTrk ? itemTrk.u : [],
                  why: x.st === 'ok' ? 'guess' : x.st === 'blank' ? 'time' : 'wrong', choices: 4, ...(x.key ? { answer: x.key } : {}), etext: `سؤال ${x.bq} — ${rec.title}`
                })}
              />
            </>
          ) : (
            <>
              <div className="ck-vs2-panel solo">
                <div className="info">
                  <div className="line">
                    <span className="ck-pill ok">{P(onPlan)} از {P(totalOn)} پاسخ</span>
                    {extra > 0 && <span className="ck-pill">{P(extra)} خارج از برنامه</span>}
                    {plan.step > 1 && <span className="ck-pill bad">{P(stepLabel(plan.step, plan.off))}</span>}
                    {flagList.length > 0 && <span className="ck-pill" style={{ color: '#e0951b' }}>⚑ {P(flagList.length)} نشان‌دار</span>}
                    {meta && <span className="ck-pill">🔑 {meta.title}</span>}
                  </div>
                  <div className="line sub"><span>سؤال <b>{P(startNo + q - 1)}</b> · زمان روی این سؤال <b dir="ltr" className={curSlow ? 'slow' : ''}>{P(clock(curMs))}</b></span></div>
                  <span className="bar"><i style={{ width: totalOn ? Math.round((onPlan / totalOn) * 100) + '%' : '0%' }} /></span>
                </div>
              </div>
              <div className="ck-vs2-keys" aria-label="راهنمای کیبورد">
                <Keyboard size={14} />
                <span><kbd>۱</kbd>–<kbd>۴</kbd> پاسخ و سؤال بعد</span>
                <span><kbd>۰</kbd> نزده و سؤال بعد</span>
                <span><kbd>↑</kbd><kbd>↓</kbd> حرکت</span>
                <span><kbd>⌫</kbd> پاک کردن</span>
                <span><kbd>F</kbd> نشان‌دار</span>
                <span><kbd>G</kbd> نشان‌دارِ بعدی</span>
                <span><kbd>Space</kbd> توقف ساعتِ پاسخ‌برگ</span>
              </div>
              {endHint && <p className="ck-note">به آخرین سؤال رسیدی. با «پایان آزمون» ادامه بده یا با فلش‌ها برگرد.</p>}
              {rec.mode === 'scan' && <p className="ck-note">این پاسخ‌برگ از روی عکس خوانده شده؛ اگر جایی اشتباه خوانده شده، همین‌جا اصلاحش کن.</p>}
              <div className="ck-vs2-grid" dir="ltr">
                {Array.from({ length: Math.ceil(rowsEls.length / 10) }, (_, ci) => <div key={ci} className="ck-vs2-col">{rowsEls.slice(ci * 10, ci * 10 + 10)}</div>)}
              </div>
              {rows < SHEET_N && <div className="ck-row"><button type="button" className="ck-btn sm ghost" onClick={grow}><Plus size={14} /> ۲۵ سؤال دیگر</button></div>}
            </>
          )}
        </main>
        {side_el}
      </div>

      <footer className="ck-ws-foot">
        {phase === 'result' ? (
          <>
            <button type="button" className="ck-btn primary" onClick={onClose}>تأیید و بازگشت به پارت</button>
            <button type="button" className="ck-btn" onClick={backToTest}>اصلاح پاسخ‌ها</button>
            <button type="button" className="ck-btn ghost" onClick={() => rec && onCompare(rec)}>باز کردن در تصحیح کامل</button>
          </>
        ) : (
          <>
            {rec.bookId ? (
              <button type="button" className="ck-btn primary" disabled={grading || !countAnswered(answers.slice(0, rows))} onClick={() => finish('grade')}><Scale size={16} /> {grading ? 'در حال تصحیح…' : 'پایان آزمون و تصحیح'}</button>
            ) : (
              <button type="button" className="ck-btn primary" disabled={!countAnswered(answers.slice(0, rows))} onClick={() => finish('compare')}><Scale size={16} /> پایان و مقایسه با کلید</button>
            )}
            <button type="button" className="ck-btn" onClick={() => finish('save')}>پایان، ذخیره برای بعد</button>
            {open && <span className="ck-apply-note">با بستن پنجره، آزمون «در حال انجام» می‌ماند و بعداً ادامه‌اش می‌دهی.</span>}
          </>
        )}
      </footer>
      {partPick && <PartPicker current={rec.link} onPick={applyLink} onDetach={detach} onClose={() => setPartPick(false)} />}
      {picker && <TopicPicker title="این آزمون از چه مبحثی است؟" confirmLabel="ثبت مبحث" initialRound={itemTrk?.r} initialUnits={itemTrk?.u} initialPart={itemTrk?.m === 'p'} onPick={applyTopics} onClose={() => setPicker(false)} />}
    </div>
  );
};

const planNow = (plan: Plan): string => (plan.step > 1 ? ` · ${plan.step}x` : '');
