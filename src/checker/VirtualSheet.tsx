import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Plus, Scale, Link2, Keyboard } from 'lucide-react';
import { SHEET_N, SavedSheet, addTime, countAnswered, emptySheetString, makeSavedSheet, onStep, setAnswer, stepLabel, totalTime, withAnswers } from './model';
import { Plan, answeredIn, applyAction, firstOn, keyToAction, planCount, rangeFromText } from './sheetEngine';
import { notifyChanged, saveSheet } from './store';
import { Modal } from './ui';
import { clock, defaultTitle } from './format';
import { VirtualContext } from './launch';
import { liveElapsedMs, liveKind, liveTotalPlannedSeconds, pauseLivePlan, resumeLivePlan, useLivePlan } from '../livePlan';
import { toPersianDigits as P } from '../utils';

const PRESETS = [20, 30, 45, 50, 75, 100];
const STEPS: Array<[number, string]> = [[1, 'همه‌ی سؤال‌ها'], [2, '۲x · یکی در میان'], [3, '۳x · یکی در سه تا'], [4, '۴x']];
const PREF_KEY = 'planex_vs_prefs';
const loadPrefs = (): { autoNext: boolean } => { try { return { autoNext: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { autoNext: true }; } };

/**
 * The virtual answer sheet - made for solving a test part with the keyboard:
 *  - the sheet reads left to right like a paper sheet; the selected question is highlighted;
 *  - 1-4 (also ۱-۴ and the numpad) marks the answer and moves to the next question, 0 leaves it empty and moves on,
 *    arrow keys go up / down (Shift+arrow ignores the 2x/3x plan), Backspace empties the question, Space pauses the clock;
 *  - the time on every question is counted (visiting a question again adds to it) and saved with the answers;
 *  - «2x / 3x»: only every 2nd / 3rd question belongs to the test; the others are dimmed, skipped by the arrows and not counted when comparing;
 *  - when the sheet belongs to a planner card whose timer is running, that timer drives the clock (pause it there, the sheet pauses too).
 * Nothing here needs a key. Comparing with a book is the next step (onCompare).
 */
export const VirtualSheet: React.FC<{
  sheet?: SavedSheet;
  ctx?: VirtualContext;
  onClose: () => void;
  onCompare: (s: SavedSheet) => void;
}> = ({ sheet: initial, ctx, onClose, onCompare }) => {
  const hint = useMemo(() => rangeFromText([ctx?.detail, ctx?.title].filter(Boolean).join(' ')), [ctx?.detail, ctx?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rec, setRec] = useState<SavedSheet | null>(initial || null);
  const recRef = useRef<SavedSheet | null>(initial || null);
  const [title, setTitle] = useState(() => ctx?.title || defaultTitle('آزمون'));
  const [size, setSize] = useState(ctx?.size || hint?.count || 30);
  const [first, setFirst] = useState(ctx?.startQ || hint?.from || 1);
  const [step, setStep] = useState(ctx?.step || 1);
  const [off, setOff] = useState(ctx?.off || 0);
  const [paused, setPaused] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [, force] = useState(0);
  const [endHint, setEndHint] = useState(false);
  const dirty = useRef(false);
  const live = useLivePlan();

  const qOf = (r: SavedSheet | null) => Math.min(Math.max(1, (r && r.cursor) || 1), (r && r.size) || 1);
  const [q, setQState] = useState(() => qOf(initial || null));
  const qRef = useRef(q);
  const setQ = useCallback((n: number) => { qRef.current = n; setQState(n); }, []);
  const autoRef = useRef(prefs.autoNext);
  autoRef.current = prefs.autoNext;

  const rows = rec ? Math.min(SHEET_N, Math.max(1, rec.size)) : 0;
  const plan: Plan = { size: rows, step: rec?.step || 1, off: rec?.off || 0 };
  const planRef = useRef(plan);
  planRef.current = plan;

  // the planner card this sheet belongs to: while its timer runs, it is the clock of the test
  const liveOn = !!(rec && rec.link && rec.link.plannerItemId && live && liveKind(live) === 'plan' && live.item.id === rec.link.plannerItemId && live.dateKey === rec.link.dateKey);
  const ticking = !!rec && rec.mode === 'live' && rec.state === 'open' && (liveOn ? !!live && live.running : !paused);
  const tickRef = useRef(ticking);
  tickRef.current = ticking;

  const persist = useCallback((next: SavedSheet, silent = true) => {
    recRef.current = next; setRec(next); dirty.current = true;
    saveSheet(next, { silent });
  }, []);

  /* ---------- the clock: every 200 ms the elapsed slice goes to the question that is selected ---------- */
  useEffect(() => {
    let last = performance.now(), n = 0, sec = -1;
    const id = window.setInterval(() => {
      const now = performance.now(), dt = Math.min(now - last, 1500);
      last = now;
      const cur = recRef.current;
      if (!cur || !tickRef.current || document.hidden) return;
      const times = addTime(cur.times, qRef.current, dt);
      const spent = totalTime(times);
      recRef.current = { ...cur, times, spentMs: spent, cursor: qRef.current };
      dirty.current = true;
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

  /* ---------- keyboard ---------- */
  const togglePause = useCallback(() => {
    const cur = recRef.current;
    if (!cur) return;
    if (cur.link && live && liveKind(live) === 'plan' && live.item.id === cur.link.plannerItemId) { if (live.running) pauseLivePlan(); else resumeLivePlan(); }
    else setPaused((p) => !p);
  }, [live]);

  const press = useCallback((a: NonNullable<ReturnType<typeof keyToAction>>) => {
    const cur = recRef.current;
    if (!cur) return;
    if (a.t === 'pause') { togglePause(); return; }
    const r = applyAction({ sheet: cur.sheet, q: qRef.current }, a, planRef.current, autoRef.current);
    setEndHint(r.atEnd);
    setQ(r.q);
    if (r.changed) persist({ ...withAnswers(cur, r.sheet), times: recRef.current?.times, spentMs: recRef.current?.spentMs, cursor: r.q });
    else if (r.q !== qRef.current || a.t === 'move') { recRef.current = { ...cur, cursor: r.q }; dirty.current = true; }
  }, [persist, setQ, togglePause]);

  useEffect(() => {
    if (!rec) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === 'function' && t.closest('input,textarea,select,[contenteditable="true"]')) return;
      const a = keyToAction(e);
      if (!a) return;
      e.preventDefault(); e.stopImmediatePropagation(); // the timer's own shortcuts (Space ...) must not fire as well
      press(a);
    };
    window.addEventListener('keydown', onKey, true); // capture: runs before the other handlers
    return () => window.removeEventListener('keydown', onKey, true);
  }, [!!rec, press]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the selected row in view
  useEffect(() => { document.getElementById('vsq' + q)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [q]);

  const start = () => {
    const stepV = Math.max(1, step), offV = Math.min(off, stepV - 1);
    const r = makeSavedSheet(title.trim() || defaultTitle('آزمون'), 'live', emptySheetString(), {
      size, startQ: Math.max(1, first), step: stepV > 1 ? stepV : undefined, off: stepV > 1 && offV ? offV : undefined,
      times: [], link: ctx?.link, lesson: ctx?.lesson, source: ctx?.source, detail: ctx?.detail
    });
    const q0 = firstOn({ size, step: stepV, off: offV });
    r.cursor = q0;
    recRef.current = r; setRec(r); setQ(q0); dirty.current = true; saveSheet(r, { silent: true });
  };

  /* ---------- setup screen ---------- */
  if (!rec) {
    return (
      <Modal title="پاسخ‌برگ مجازی" onClose={onClose}
        footer={<button type="button" className="ck-btn primary" onClick={start}>شروع آزمون</button>}>
        <section className="ck-card">
          <p className="ck-hint">پاسخ‌ها را با کیبورد وارد کن: <b>۱ تا ۴</b> گزینه را می‌زند و می‌رود سؤال بعد، <b>۰</b> سؤال را نزده می‌گذارد، با <b>فلش‌ها</b> بالا و پایین می‌روی. زمانِ هر سؤال هم حساب می‌شود. هر علامت همان لحظه ذخیره می‌شود.</p>
          {ctx?.link && <p className="ck-note"><Link2 size={14} /> این پاسخ‌برگ به همین پارتِ برنامه‌ریز وصل است؛ ساعتش با تایمر آن پارت هم‌گام می‌شود.</p>}
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
        </section>
      </Modal>
    );
  }

  /* ---------- the sheet ---------- */
  const answers = rec.sheet;
  const planNow = plan;
  const totalOn = planCount(planNow);
  const { onPlan, extra } = answeredIn(answers, planNow);
  const startNo = rec.startQ || 1;
  const times = rec.times || [];
  const isLive = rec.mode === 'live';
  const open = isLive && rec.state === 'open';
  const spent = rec.spentMs || totalTime(times);
  const cardElapsed = liveOn && live ? liveElapsedMs(live) : 0;
  const planned = liveOn && live ? liveTotalPlannedSeconds(live) : 0;
  const mainClock = liveOn ? cardElapsed : spent;
  const runningNow = liveOn ? !!(live && live.running) : !paused;

  const pickMouse = (qq: number, o: number) => {
    const cur = answers[qq - 1];
    const v = cur === String(o) ? 0 : o; // clicking the chosen option again clears it
    const nextSheet = setAnswer(answers, qq, v);
    const nq = v && prefs.autoNext ? (applyAction({ sheet: nextSheet, q: qq }, { t: 'move', dir: 1, any: false }, planNow).q) : qq;
    setQ(nq); setEndHint(false);
    persist({ ...withAnswers(rec, nextSheet), times: recRef.current?.times, spentMs: recRef.current?.spentMs, cursor: nq });
  };
  const grow = () => persist({ ...withAnswers(rec, answers, { size: Math.min(SHEET_N, rows + 25) }), times: recRef.current?.times });
  const rename = (t: string) => persist({ ...rec, title: t, updatedAt: Date.now() });
  const finish = (andCompare: boolean) => {
    const cur = recRef.current || rec;
    const next = { ...withAnswers(cur, cur.sheet), state: 'done' as const, cursor: qRef.current };
    recRef.current = next; dirty.current = true;
    saveSheet(next, { silent: false }).then(() => { if (andCompare) onCompare(next); else onClose(); });
  };
  const setAuto = (v: boolean) => { const n = { ...prefs, autoNext: v }; setPrefs(n); try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* ignore */ } };

  const rowsEls: React.ReactNode[] = [];
  for (let n = 1; n <= rows; n++) {
    const c = answers[n - 1] || '0';
    const on = onStep(n, planNow.step, planNow.off);
    const ms = times[n - 1] || 0;
    rowsEls.push(
      <div
        key={n}
        id={'vsq' + n}
        className={'ck-vs2-q' + (n === q ? ' cur' : '') + (c !== '0' ? ' done' : '') + (on ? '' : ' off') + (n % 5 === 0 ? ' sep' : '')}
        onClick={() => { setQ(n); setEndHint(false); }}
      >
        <span className="no">{P(startNo + n - 1)}</span>
        {[1, 2, 3, 4].map((o) => (
          <button key={o} type="button" tabIndex={-1} className={'o' + (c === String(o) ? ' on' : '')} aria-pressed={c === String(o)} aria-label={`سؤال ${startNo + n - 1} گزینه ${o}`} onClick={(e) => { e.stopPropagation(); pickMouse(n, o); }}>{P(o)}</button>
        ))}
        <span className={'tm' + (n === q ? ' live' : '')}>{ms >= 1000 ? P(clock(ms)) : ''}</span>
      </div>
    );
  }

  return (
    <Modal wide onClose={onClose}
      title={<>{isLive ? 'پاسخ‌برگ مجازی' : 'پاسخ‌برگ ذخیره‌شده'}<small className="ck-ctx"> — {rec.title}</small></>}
      footer={<>
        <button type="button" className="ck-btn primary" disabled={!countAnswered(answers.slice(0, rows))} onClick={() => finish(true)}><Scale size={16} /> {open ? 'پایان و مقایسه با کلید' : 'مقایسه با کلید'}</button>
        <button type="button" className="ck-btn" onClick={() => finish(false)}>{open ? 'پایان آزمون، ذخیره برای بعد' : 'ذخیره و بستن'}</button>
        {open && <span className="ck-apply-note">با بستن پنجره، آزمون «در حال انجام» می‌ماند و بعداً ادامه‌اش می‌دهی.</span>}
      </>}>
      <div className="ck-vs2-panel">
        {isLive && (
          <div className={'clock' + (runningNow && open ? ' run' : ' stop')}>
            <b dir="ltr">{P(clock(mainClock))}</b>
            <span>{liveOn ? `زمان پارت${planned ? ` از ${P(clock(planned * 1000))}` : ''}` : open ? 'زمان آزمون' : 'زمان کل'}</span>
          </div>
        )}
        <div className="info">
          <div className="line">
            <span className="ck-pill ok">{P(onPlan)} از {P(totalOn)} پاسخ</span>
            {extra > 0 && <span className="ck-pill">{P(extra)} خارج از برنامه</span>}
            {planNow.step > 1 && <span className="ck-pill bad">{P(stepLabel(planNow.step, planNow.off))}</span>}
            {liveOn && <span className="ck-pill"><Link2 size={12} /> وصل به تایمر پارت</span>}
          </div>
          <div className="line sub">
            <span>سؤال <b>{P(startNo + q - 1)}</b> · زمان روی این سؤال <b dir="ltr">{P(clock(times[q - 1] || 0))}</b></span>
          </div>
          <span className="bar"><i style={{ width: totalOn ? Math.round((onPlan / totalOn) * 100) + '%' : '0%' }} /></span>
        </div>
        <div className="ctl">
          {open && <button type="button" className="ck-btn sm" aria-label={runningNow ? 'توقف زمان' : 'ادامه‌ی زمان'} onClick={togglePause}>{runningNow ? <Pause size={15} /> : <Play size={15} />} {runningNow ? 'توقف' : 'ادامه'}</button>}
          <input className="ck-vs-title" type="text" value={rec.title} aria-label="نام پاسخ‌برگ" onChange={(e) => rename(e.target.value)} />
        </div>
      </div>
      <div className="ck-vs2-keys" aria-label="راهنمای کیبورد">
        <Keyboard size={14} />
        <span><kbd>۱</kbd>–<kbd>۴</kbd> پاسخ و سؤال بعد</span>
        <span><kbd>۰</kbd> نزده و سؤال بعد</span>
        <span><kbd>↑</kbd><kbd>↓</kbd> حرکت</span>
        <span><kbd>⌫</kbd> پاک کردن</span>
        <span><kbd>Space</kbd> توقف</span>
        <label className="auto"><input type="checkbox" checked={prefs.autoNext} onChange={(e) => setAuto(e.target.checked)} /> رفتن خودکار به سؤال بعد</label>
      </div>
      {endHint && <p className="ck-note">به آخرین سؤال رسیدی. با «پایان و مقایسه با کلید» ادامه بده یا با فلش‌ها برگرد.</p>}
      {rec.mode === 'scan' && <p className="ck-note">این پاسخ‌برگ از روی عکس خوانده شده؛ اگر جایی اشتباه خوانده شده، همین‌جا اصلاحش کن.</p>}
      <div className="ck-vs2-grid" dir="ltr">{rowsEls}</div>
      {rows < SHEET_N && <div className="ck-row"><button type="button" className="ck-btn sm ghost" onClick={grow}><Plus size={14} /> ۲۵ سؤال دیگر</button></div>}
    </Modal>
  );
};
