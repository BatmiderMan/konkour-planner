/** The exam: every selected question below each other, each with a header bar (number, ⭐ 🤔 level, note, vault, solving space),
 *  the options, a virtual answer sheet that stays at hand, and a drawing layer on every question. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, ListChecks, PenTool, Eye, EyeOff } from 'lucide-react';
import { Lab, MarkBar, QImg } from './parts';
import { Attempt, LiveExam, MIX, QMeta, Ref, clearLive, keyOf, recordAttemptMeta, saveAttempt, saveLive } from './store';
import { fmtDur } from './lab';
const clock = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60), d = (n: number) => String(n).padStart(2, '0'); return (h > 0 ? h + ':' : '') + d(m) + ':' + d(x); };
import { DrawBar, DrawProvider, DrawStage, SpaceButtons, useDraw, useDrawDoc } from './draw';
import { Sheet, SheetState, applyCross, applyFlag, applyPick } from './Sheet';
import { confirmDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';

export interface Run { refs: Ref[]; practice: boolean; minutes: number; title: string }

const Opts: React.FC<{ pick: number; mask: number; right?: number; reveal: boolean; onPick: (v: number) => void; onCross: (v: number) => void }> = ({ pick, mask, right, reveal, onPick, onCross }) => {
  const t = useRef<any>(0), fired = useRef(false);
  return (
    <div className="bk-opts" role="group" aria-label="گزینه‌ها">
      {[1, 2, 3, 4].map((v) => (
        <button type="button" key={v} aria-pressed={pick === v}
          className={'bk-opt' + (pick === v ? ' sel' : '') + (mask & (1 << v) ? ' x' : '') + (reveal && v === right ? ' right' : '') + (reveal && pick === v && v !== right ? ' wrong' : '')}
          onPointerDown={(e) => { if (e.pointerType === 'mouse') return; fired.current = false; t.current = setTimeout(() => { fired.current = true; onCross(v); }, 480); }}
          onPointerUp={() => clearTimeout(t.current)} onPointerLeave={() => clearTimeout(t.current)}
          onClick={() => { if (fired.current) { fired.current = false; return; } onPick(v); }} onContextMenu={(e) => { e.preventDefault(); onCross(v); }}>{P(v)}</button>
      ))}
    </div>
  );
};

interface CardProps { i: number; r: Ref; lab: Lab; meta?: QMeta; pick: number; mask: number; flagged: boolean; active: boolean; over: boolean; allow: number; practice: boolean; session: string; multi: boolean; onFocusQ: (i: number) => void;
  onPick: (i: number, v: number) => void; onCross: (i: number, v: number) => void; onFlag: (i: number) => void }
const Card = React.memo(({ i, r, lab, meta, pick, mask, flagged, active, over, allow, practice, session, multi, onFocusQ, onPick, onCross, onFlag }: CardProps) => {
  const book = lab.bookMap.get(r.b) as ReturnType<Lab['bookMap']['get']>;
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(i < 3);
  const [showE, setShowE] = useState(false);
  const { doc, setDoc } = useDrawDoc(session, keyOf(r.b, r.n));
  useEffect(() => {
    if (seen || !ref.current) return; const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '1400px 0px' });
    io.observe(ref.current); return () => io.disconnect();
  }, [seen]);
  if (!book) return null;
  const right = book.answers[r.n], reveal = practice && pick !== 0, noKey = !right, hasE = book.expl.includes(r.n);
  return (
    <article ref={ref} id={'bk-q-' + i} data-i={i} className={'bk-card' + (flagged ? ' flagged' : '') + (active ? ' active' : '')} onPointerDownCapture={() => onFocusQ(i)}>
      <header className="bk-chead">
        <span className="bk-cno">{P(i + 1)}</span>{active && <span className="bk-now"><i />در حال حل</span>}{over && <span className="bk-over" title={'از زمان مجاز این سؤال (' + P(fmtDur(Math.round(allow))) + ') بیشتر وقت گذاشته‌اید'}><i />زمان زیاد</span>}
        <span className="bk-ctitle">{multi ? book.title + ' · ' : ''}شمارهٔ {P(r.n)}{flagged ? ' ⚑' : ''}</span>
        <MarkBar book={book} n={r.n} meta={meta} pick={pick} compact />
        <button type="button" className={'bk-mk sm' + (flagged ? ' on' : '')} aria-pressed={flagged} title="علامت برای مرور" onClick={() => onFlag(i)}>⚑</button>
        <SpaceButtons doc={doc} setDoc={setDoc} />
      </header>
      <DrawStage id={'q' + i} doc={doc} setDoc={setDoc}>
        {seen ? <QImg b={r.b} n={r.n} /> : <div className="bk-img ph" style={{ minHeight: 180 }} />}
      </DrawStage>
      <Opts pick={pick} mask={mask} right={right} reveal={reveal} onPick={(v) => onPick(i, pick === v ? 0 : v)} onCross={(v) => onCross(i, v)} />
      {reveal && <p className={'bk-fb ' + (noKey ? '' : pick === right ? 'ok' : 'bad')}>{noKey ? 'کلید این سؤال در کتاب موجود نیست.' : pick === right ? 'درست است ✓' : `نادرست؛ پاسخ درست گزینهٔ ${P(right)} است.`}
        {hasE && <button type="button" className="bk-btn sm" onClick={() => setShowE((v) => !v)}>{showE ? <EyeOff size={15} /> : <Eye size={15} />} پاسخ تشریحی</button>}</p>}
      {reveal && showE && hasE && <div className="bk-qwrap bk-expl"><QImg b={r.b} n={r.n} e /></div>}
    </article>
  );
});

const Inner: React.FC<{ run: Run; resume?: LiveExam; lab: Lab; onFinish: (a: Attempt) => void; onCancel: () => void }> = ({ run, resume, lab, onFinish, onCancel }) => {
  const { refs, practice, minutes } = run;
  const dr = useDraw()!;
  const session = useRef(resume?.id || 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).current;
  const [st, setSt] = useState<SheetState>(resume ? resume.st : { picks: {}, crossed: {}, flags: {} });
  const secRef = useRef<HTMLElement>(null);
  const [sheet, setSheet] = useState(!!resume?.sheet);
  const [activeI, setActiveI] = useState(0);
  const t0 = useRef(Date.now()), base = useRef(resume?.elapsed || 0), started = useRef(resume?.started || Date.now()), secs = useRef<Record<string, number>>(resume ? { ...resume.secs } : {}), done = useRef(false), activeRef = useRef(0);
  const [sec, setSec] = useState(resume?.elapsed || 0);
  const elapsed = () => Math.floor(base.current + (Date.now() - t0.current) / 1000);
  const multi = useMemo(() => new Set(refs.map((r) => r.b)).size > 1, [refs]);
  const left = minutes > 0 ? Math.max(0, minutes * 60 - sec) : 0;
  const allow = minutes > 0 ? (minutes * 60) / Math.max(1, refs.length) : 0;   // fair share of the clock per question (none when the exam has no time limit)
  const [over, setOver] = useState<Record<number, boolean>>(() => { const o: Record<number, boolean> = {}; if (minutes > 0 && resume) refs.forEach((r, i) => { if ((resume.secs[keyOf(r.b, r.n)] || 0) > allow) o[i] = true; }); return o; });
  const [warn15, setWarn15] = useState(false);
  const warned = useRef(minutes > 0 && left <= 900);
  const answered = refs.filter((_, i) => st.picks[i]).length;
  const labels = useMemo(() => refs.map((_, i) => P(i + 1)), [refs]);
  const sub = useMemo(() => refs.map((r) => (lab.bookMap.get(r.b)?.title || '') + ' · ' + P(r.n)), [refs, lab]);

  const pick = useCallback((i: number, v: number) => setSt((s) => applyPick(s, i, v)), []);
  const cross = useCallback((i: number, v: number) => setSt((s) => applyCross(s, i, v)), []);
  const flag = useCallback((i: number) => setSt((s) => applyFlag(s, i)), []);
  const lockUntil = useRef(0);
  const focusQ = useCallback((i: number) => { if (i === activeRef.current) return; lockUntil.current = Date.now() + 1600; activeRef.current = i; setActiveI(i); }, []);
  const jump = (i: number) => { focusQ(i); lockUntil.current = Date.now() + 1600; document.getElementById('bk-q-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  useEffect(() => {   // which question is in front of the reader (for the clock per question and the sheet)
    let r = 0; const f = () => { cancelAnimationFrame(r); r = requestAnimationFrame(() => {
      if (Date.now() < lockUntil.current) return;
      const cards = document.querySelectorAll<HTMLElement>('.bk-card'); let a = 0; const line = window.innerHeight * 0.38;
      cards.forEach((c, i) => { if (c.getBoundingClientRect().top <= line) a = i; });
      activeRef.current = a; setActiveI((p) => (p === a ? p : a)); }); };
    window.addEventListener('scroll', f, { passive: true }); f(); return () => { window.removeEventListener('scroll', f); cancelAnimationFrame(r); };
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      setSec(elapsed());
      if (document.visibilityState === 'visible') { const r = refs[activeRef.current]; if (r) { const k = keyOf(r.b, r.n), v = (secs.current[k] = (secs.current[k] || 0) + 1), i = activeRef.current;
        if (minutes > 0 && v > allow) setOver((o) => (o[i] ? o : { ...o, [i]: true })); } }
    }, 1000); return () => clearInterval(id);
  }, [refs, minutes, allow]);
  useEffect(() => { if (minutes > 0 && !warned.current && left <= 900 && left > 0) { warned.current = true; setWarn15(true); const t = setTimeout(() => setWarn15(false), 14000); return () => clearTimeout(t); } }, [left, minutes]);

  /* the bar and the sheet are positioned from the viewport (not "sticky"), so no ancestor's overflow can ever scroll them away or make them unclickable */
  const [box, setBox] = useState({ l: 0, w: 0 });
  useEffect(() => {
    const el = secRef.current; if (!el) return;
    const m = () => { const r = el.getBoundingClientRect(); setBox((b) => (Math.abs(b.l - r.left) < 0.5 && Math.abs(b.w - r.width) < 0.5 ? b : { l: r.left, w: r.width })); };
    m(); const ro = new ResizeObserver(m); ro.observe(el); window.addEventListener('resize', m); return () => { ro.disconnect(); window.removeEventListener('resize', m); };
  }, []);

  /* continuous saving: answers, clock, position — so leaving (another Planex tab, reload, phone lock) never loses the exam */
  const cur = useRef({ st, sheet }); cur.current = { st, sheet };
  useEffect(() => {   // the sheet panel docks right under the exam's own top bar (its height changes with the drawing bar)
    const tb = secRef.current?.querySelector('.bk-topbar') as HTMLElement | null; if (!tb) return;
    const set = () => secRef.current?.style.setProperty('--bk-top-h', tb.offsetHeight + 'px');
    set(); const ro = new ResizeObserver(set); ro.observe(tb); return () => ro.disconnect();
  }, []);
  const persist = useCallback(() => {
    if (done.current) return;
    saveLive({ id: session, run: { refs, practice, minutes, title: run.title }, st: cur.current.st, secs: secs.current, elapsed: elapsed(), started: started.current, at: Date.now(), active: activeRef.current, sheet: cur.current.sheet }).catch(() => { /* ignore */ });
  }, [session, refs, practice, minutes, run.title]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(persist, 400); return () => clearTimeout(t); }, [st, sheet, persist]);
  useEffect(() => {
    const id = setInterval(persist, 4000), vis = () => { if (document.visibilityState === 'hidden') persist(); };
    document.addEventListener('visibilitychange', vis); window.addEventListener('pagehide', persist);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', persist); persist(); };
  }, [persist]);
  useEffect(() => { if (resume && resume.active > 0) { const t = setTimeout(() => jump(resume.active), 600); return () => clearTimeout(t); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(async (force = false) => {
    if (done.current) return;
    const blank = refs.length - refs.filter((_, i) => st.picks[i]).length;
    if (!force && blank > 0 && !(await confirmDialog(`${P(blank)} سؤال را نزده‌اید. آزمون تمام شود؟`))) return;
    done.current = true; let c = 0, w = 0;
    const items = refs.map((x, i) => ({ n: x.n, pick: st.picks[i] || 0, b: x.b, sec: secs.current[keyOf(x.b, x.n)] || 0 }));
    items.forEach((it) => { if (!it.pick) return; const k = lab.bookMap.get(it.b)?.answers[it.n]; if (!k) return; if (it.pick === k) c++; else w++; });
    const a: Attempt = { id: session, bookId: multi ? MIX : refs[0].b, at: Date.now(), seconds: elapsed(), items, correct: c, wrong: w, blank: refs.length - c - w,
      pct: Math.round(((3 * c - w) / (3 * refs.length)) * 1000) / 10, mode: practice ? 'تمرین' : 'آزمون', title: run.title };
    try { await saveAttempt(a); await recordAttemptMeta(a, (b, n) => lab.bookMap.get(b)?.answers[n] || 0); } catch { /* still show the result */ }
    await clearLive(session).catch(() => { /* ignore */ }); dr.setOn(false); onFinish(a);
  }, [refs, st, lab, practice, run.title, onFinish, session, multi, dr]);
  useEffect(() => { if (minutes > 0 && left === 0 && sec > 0) finish(true); }, [left, sec, minutes]); // eslint-disable-line react-hooks/exhaustive-deps
  const [autoNext, setAutoNext] = useState(() => { try { return localStorage.getItem('bk-autonext') === '1'; } catch { return false; } });
  const kb = useRef({ picks: st.picks, autoNext, drOn: dr.on, n: refs.length }); kb.current = { picks: st.picks, autoNext, drOn: dr.on, n: refs.length };
  useEffect(() => {   // exam shortcuts run in the CAPTURE phase and stop there: digits must never reach Planex's own shortcuts (tabs, timer…)
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (kb.current.drOn || document.querySelector('.dlg-overlay, .bk-lightbox') || e.ctrlKey || e.metaKey || e.altKey || (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]'))) return;
      const code = e.code || '', d = /^(Digit|Numpad)([0-4])$/.exec(code), cur = activeRef.current, k = e.key;
      let used = true;
      if (d) { const v = +d[2]; if (v === 0) pick(cur, 0); else { pick(cur, kb.current.picks[cur] === v ? 0 : v); if (kb.current.autoNext && kb.current.picks[cur] !== v && cur < kb.current.n - 1) setTimeout(() => jump(cur + 1), 120); } }
      else if (k === 'Backspace' || k === 'Delete') pick(cur, 0);
      else if (k === 'ArrowDown' || code === 'KeyJ') jump(Math.min(kb.current.n - 1, cur + 1));
      else if (k === 'ArrowUp' || code === 'KeyK') jump(Math.max(0, cur - 1));
      else if (code === 'KeyF') flag(cur);
      else if (code === 'KeyS') setSheet((v) => !v);
      else used = false;
      if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener('keydown', h, true); return () => window.removeEventListener('keydown', h, true);
  }, [pick, flag]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={"bk-scroll" + (sheet ? " with-sheet" : "")} ref={secRef} style={{ '--bk-l': box.l + 'px', '--bk-w': box.w + 'px' } as React.CSSProperties}>
      <div className="bk-tbspace" />
      <div className="bk-topbar">
        <header className="bk-ph">
          <button type="button" className="bk-btn ghost" onClick={async () => { if (await confirmDialog('از آزمون بیرون می‌روید؟ پیشرفت (پاسخ‌ها، نوشته‌ها و زمان) ذخیره می‌شود و بعداً از «بانک تست» ادامه می‌دهید.')) { persist(); dr.setOn(false); onCancel(); } }}><X size={18} /> خروج</button>
          <div className={'bk-nowq' + (over[activeI] ? ' over' : '')} title="سؤالی که الان وقتش حساب می‌شود">سؤال {P(activeI + 1)} · {P(fmtDur(secs.current[keyOf(refs[activeI]?.b, refs[activeI]?.n)] || 0))}</div>
          <button type="button" className={'bk-btn sm' + (autoNext ? ' primary' : '')} aria-pressed={autoNext} title="بعد از زدن گزینه با کیبورد، خودکار برو سؤال بعد" onClick={() => setAutoNext((v) => { try { localStorage.setItem('bk-autonext', v ? '0' : '1'); } catch { /* ignore */ } return !v; })}>↓ خودکار</button>
          <div className="bk-prog"><b>{P(answered)}</b>/{P(refs.length)}</div>
          <button type="button" className={'bk-btn' + (sheet ? ' primary' : '')} aria-pressed={sheet} onClick={() => setSheet((v) => !v)}><ListChecks size={18} /> پاسخ‌برگ</button>
          <button type="button" className={'bk-btn' + (dr.on ? ' primary' : '')} aria-pressed={dr.on} onClick={() => dr.setOn(!dr.on)}><PenTool size={18} /> رسم</button>
          <button type="button" className="bk-btn primary" onClick={() => finish()}><Check size={18} /> پایان</button>
          <div className={'bk-timer ' + (minutes <= 0 ? 'up' : left <= 60 ? 'crit blink' : left <= 300 ? 'crit' : left <= 900 ? 'warn' : '')} role="timer" aria-label={minutes > 0 ? 'زمان باقی‌مانده' : 'زمان سپری‌شده'}>
            <small>{minutes > 0 ? 'مانده' : 'گذشته'}</small><b>{P(clock(minutes > 0 ? left : sec))}</b>
          </div>
        </header>
        <div className="bk-bar"><i style={{ width: (answered / refs.length) * 100 + '%' }} /></div>
        <DrawBar />
      </div>
      {warn15 && <div className="bk-toast15" role="alert"><b>⏰ ۱۵ دقیقه به پایان آزمون مانده است</b><span>سؤال‌های نزده را مرور کنید و پاسخ‌برگ را کامل کنید.</span><button type="button" className="bk-btn primary" onClick={() => setWarn15(false)}>باشه</button></div>}
      <div className="bk-body">
      <div className="bk-maincol">
      <div className="bk-cards">
        {refs.map((r, i) => <Card key={keyOf(r.b, r.n) + ':' + i} i={i} r={r} lab={lab} meta={lab.meta[keyOf(r.b, r.n)]} pick={st.picks[i] || 0} mask={st.crossed[i] || 0} flagged={!!st.flags[i]}
          over={!!over[i]} allow={allow} active={activeI === i} onFocusQ={focusQ} practice={practice} session={session} multi={multi} onPick={pick} onCross={cross} onFlag={flag} />)}
      </div>
      <div className="bk-endrow"><button type="button" className="bk-btn primary wide" onClick={() => finish()}><Check size={18} /> پایان آزمون ({P(answered)} از {P(refs.length)})</button></div>
      </div>
      {sheet && (
        <aside className="bk-drawer" aria-label="پاسخ‌برگ">
          <header><b>پاسخ‌برگ</b><button type="button" className="bk-btn bk-close" onClick={() => setSheet(false)} aria-label="بستن"><X size={18} /> بستن</button></header>
          <Sheet labels={labels} sub={sub} picks={st.picks} crossed={st.crossed} flags={st.flags} active={activeI} overs={over} onJump={jump}
            onPick={pick} onCross={cross} onFlag={flag} />
        </aside>
      )}
      </div>
    </section>
  );
};

export const Player: React.FC<{ run: Run; resume?: LiveExam; lab: Lab; onFinish: (a: Attempt) => void; onCancel: () => void }> = (p) => <DrawProvider><Inner {...p} /></DrawProvider>;
