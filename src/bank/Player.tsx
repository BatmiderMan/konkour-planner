/** The exam: every selected question below each other, each with a header bar (number, ⭐ 🤔 level, note, vault, solving space),
 *  the options, a virtual answer sheet that stays at hand, and a drawing layer on every question. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, ListChecks, PenTool, Eye, EyeOff } from 'lucide-react';
import { Lab, MarkBar, QImg } from './parts';
import { Attempt, LiveExam, MIX, QMeta, Ref, clearLive, keyOf, recordAttemptMeta, saveAttempt, saveLive } from './store';
import { fmtDur } from './lab';
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

interface CardProps { i: number; r: Ref; lab: Lab; meta?: QMeta; pick: number; mask: number; flagged: boolean; practice: boolean; session: string; multi: boolean;
  onPick: (i: number, v: number) => void; onCross: (i: number, v: number) => void; onFlag: (i: number) => void }
const Card = React.memo(({ i, r, lab, meta, pick, mask, flagged, practice, session, multi, onPick, onCross, onFlag }: CardProps) => {
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
  const right = book.answers[r.n], reveal = practice && pick !== 0, hasE = book.expl.includes(r.n);
  return (
    <article ref={ref} id={'bk-q-' + i} data-i={i} className={'bk-card' + (flagged ? ' flagged' : '')}>
      <header className="bk-chead">
        <span className="bk-cno">{P(i + 1)}</span>
        <span className="bk-ctitle">{multi ? book.title + ' · ' : ''}شمارهٔ {P(r.n)}{flagged ? ' ⚑' : ''}</span>
        <MarkBar book={book} n={r.n} meta={meta} pick={pick} compact />
        <button type="button" className={'bk-mk sm' + (flagged ? ' on' : '')} aria-pressed={flagged} title="علامت برای مرور" onClick={() => onFlag(i)}>⚑</button>
        <SpaceButtons doc={doc} setDoc={setDoc} />
      </header>
      <DrawStage id={'q' + i} doc={doc} setDoc={setDoc}>
        {seen ? <QImg b={r.b} n={r.n} /> : <div className="bk-img ph" style={{ minHeight: 180 }} />}
      </DrawStage>
      <Opts pick={pick} mask={mask} right={right} reveal={reveal} onPick={(v) => onPick(i, pick === v ? 0 : v)} onCross={(v) => onCross(i, v)} />
      {reveal && <p className={'bk-fb ' + (pick === right ? 'ok' : 'bad')}>{pick === right ? 'درست است ✓' : `نادرست؛ پاسخ درست گزینهٔ ${P(right)} است.`}
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
  const [sheet, setSheet] = useState(!!resume?.sheet);
  const [activeI, setActiveI] = useState(0);
  const t0 = useRef(Date.now()), base = useRef(resume?.elapsed || 0), started = useRef(resume?.started || Date.now()), secs = useRef<Record<string, number>>(resume ? { ...resume.secs } : {}), done = useRef(false), activeRef = useRef(0);
  const [sec, setSec] = useState(resume?.elapsed || 0);
  const elapsed = () => Math.floor(base.current + (Date.now() - t0.current) / 1000);
  const multi = useMemo(() => new Set(refs.map((r) => r.b)).size > 1, [refs]);
  const left = minutes > 0 ? Math.max(0, minutes * 60 - sec) : 0;
  const answered = refs.filter((_, i) => st.picks[i]).length;
  const labels = useMemo(() => refs.map((_, i) => P(i + 1)), [refs]);
  const sub = useMemo(() => refs.map((r) => (lab.bookMap.get(r.b)?.title || '') + ' · ' + P(r.n)), [refs, lab]);

  const pick = useCallback((i: number, v: number) => setSt((s) => applyPick(s, i, v)), []);
  const cross = useCallback((i: number, v: number) => setSt((s) => applyCross(s, i, v)), []);
  const flag = useCallback((i: number) => setSt((s) => applyFlag(s, i)), []);
  const jump = (i: number) => { document.getElementById('bk-q-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  useEffect(() => {   // which question is in front of the reader (for the clock per question and the sheet)
    let r = 0; const f = () => { cancelAnimationFrame(r); r = requestAnimationFrame(() => {
      const cards = document.querySelectorAll<HTMLElement>('.bk-card'); let a = 0; const line = window.innerHeight * 0.38;
      cards.forEach((c, i) => { if (c.getBoundingClientRect().top <= line) a = i; });
      activeRef.current = a; setActiveI((p) => (p === a ? p : a)); }); };
    window.addEventListener('scroll', f, { passive: true }); f(); return () => { window.removeEventListener('scroll', f); cancelAnimationFrame(r); };
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      setSec(elapsed());
      if (document.visibilityState === 'visible') { const r = refs[activeRef.current]; if (r) secs.current[keyOf(r.b, r.n)] = (secs.current[keyOf(r.b, r.n)] || 0) + 1; }
    }, 1000); return () => clearInterval(id);
  }, [refs]);

  /* continuous saving: answers, clock, position — so leaving (another Planex tab, reload, phone lock) never loses the exam */
  const cur = useRef({ st, sheet }); cur.current = { st, sheet };
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
    items.forEach((it) => { if (!it.pick) return; if (it.pick === lab.bookMap.get(it.b)?.answers[it.n]) c++; else w++; });
    const a: Attempt = { id: session, bookId: multi ? MIX : refs[0].b, at: Date.now(), seconds: elapsed(), items, correct: c, wrong: w, blank: refs.length - c - w,
      pct: Math.round(((3 * c - w) / (3 * refs.length)) * 1000) / 10, mode: practice ? 'تمرین' : 'آزمون', title: run.title };
    try { await saveAttempt(a); await recordAttemptMeta(a, (b, n) => lab.bookMap.get(b)?.answers[n] || 0); } catch { /* still show the result */ }
    await clearLive(session).catch(() => { /* ignore */ }); dr.setOn(false); onFinish(a);
  }, [refs, st, lab, practice, run.title, onFinish, session, multi, dr]);
  useEffect(() => { if (minutes > 0 && left === 0 && sec > 0) finish(true); }, [left, sec, minutes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (dr.on || (t && /TEXTAREA|INPUT|SELECT/.test(t.tagName)) || e.ctrlKey || e.metaKey) return; if (e.key >= '1' && e.key <= '4') pick(activeRef.current, (st.picks[activeRef.current] === +e.key ? 0 : +e.key)); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [pick, st.picks, dr.on]);

  return (
    <section className={"bk-scroll" + (sheet ? " with-sheet" : "")}>
      <div className="bk-topbar">
        <header className="bk-ph">
          <button type="button" className="bk-btn ghost" onClick={async () => { if (await confirmDialog('از آزمون بیرون می‌روید؟ پیشرفت (پاسخ‌ها، نوشته‌ها و زمان) ذخیره می‌شود و بعداً از «بانک تست» ادامه می‌دهید.')) { persist(); dr.setOn(false); onCancel(); } }}><X size={18} /> خروج</button>
          <div className="bk-prog"><span className={'bk-time' + (minutes > 0 && left < 60 ? ' low' : '')}>{P(fmtDur(minutes > 0 ? left : sec))}</span> <b>{P(answered)}</b>/{P(refs.length)}</div>
          <button type="button" className={'bk-btn' + (sheet ? ' primary' : '')} aria-pressed={sheet} onClick={() => setSheet((v) => !v)}><ListChecks size={18} /> پاسخ‌برگ</button>
          <button type="button" className={'bk-btn' + (dr.on ? ' primary' : '')} aria-pressed={dr.on} onClick={() => dr.setOn(!dr.on)}><PenTool size={18} /> رسم</button>
          <button type="button" className="bk-btn primary" onClick={() => finish()}><Check size={18} /> پایان</button>
        </header>
        <div className="bk-bar"><i style={{ width: (answered / refs.length) * 100 + '%' }} /></div>
        <DrawBar />
      </div>
      <div className="bk-cards">
        {refs.map((r, i) => <Card key={keyOf(r.b, r.n) + ':' + i} i={i} r={r} lab={lab} meta={lab.meta[keyOf(r.b, r.n)]} pick={st.picks[i] || 0} mask={st.crossed[i] || 0} flagged={!!st.flags[i]}
          practice={practice} session={session} multi={multi} onPick={pick} onCross={cross} onFlag={flag} />)}
      </div>
      <div className="bk-endrow"><button type="button" className="bk-btn primary wide" onClick={() => finish()}><Check size={18} /> پایان آزمون ({P(answered)} از {P(refs.length)})</button></div>
      {sheet && (
        <aside className="bk-drawer" aria-label="پاسخ‌برگ">
          <header><b>پاسخ‌برگ</b><button type="button" className="bk-btn bk-close" onClick={() => setSheet(false)} aria-label="بستن"><X size={18} /> بستن</button></header>
          <Sheet labels={labels} sub={sub} picks={st.picks} crossed={st.crossed} flags={st.flags} active={activeI} onJump={jump}
            onPick={pick} onCross={cross} onFlag={flag} />
        </aside>
      )}
    </section>
  );
};

export const Player: React.FC<{ run: Run; resume?: LiveExam; lab: Lab; onFinish: (a: Attempt) => void; onCancel: () => void }> = (p) => <DrawProvider><Inner {...p} /></DrawProvider>;
