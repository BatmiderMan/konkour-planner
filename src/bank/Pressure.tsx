/** Pressure practice (v2): you enter the TOTAL time and the number of tests; that time is ONE shared pool.
 *  Every question gets a fair share of what is LEFT (remaining time ÷ remaining questions) — answer fast and the
 *  spare seconds flow to the harder questions, dawdle and the next ones get tighter. When a question's share runs
 *  out it moves on by itself (left blank); when the pool is empty the run ends.
 *  «زمان‌خر» (T): a few extra-time tokens — each gives +50% of the question's share but halves its credit and breaks the streak.
 *  Tokens are EARNED too: 3 right answers in a row, each given within 60% of its share, give one more.
 *  Old runs without a total (launched from the planner) get a pool = the sum of the old per-question budgets. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Hourglass, X, Flame, Timer, TrendingUp, TrendingDown } from 'lucide-react';
import { Lab, QImg } from './parts';
import { Attempt, MIX, recordAttemptMeta, saveAttempt, keyOf } from './store';
import { budgetSec } from './lab';
import { confirmDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';
import type { Run } from './Player';

type Res = '' | 'ok' | 'bad' | 'time' | 'nokey';
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return P(String(Math.floor(s / 60)).padStart(2, '0')) + ':' + P(String(s % 60).padStart(2, '0')); };
const RIN = 48, ROUT = 61, CIN = 2 * Math.PI * RIN, COUT = 2 * Math.PI * ROUT;

export const Pressure: React.FC<{ run: Run; lab: Lab; onFinish: (a: Attempt) => void; onCancel: () => void }> = ({ run, lab, onFinish, onCancel }) => {
  const { refs } = run, pz = run.pressure!, n = refs.length;
  const totalMs = useMemo(() => {
    if (pz.totalSec && pz.totalSec > 0) return Math.round(pz.totalSec * 1000);
    return refs.reduce((s, r) => s + budgetSec(lab.attempts, lab.meta[keyOf(r.b, r.n)], r, pz.tight || 0.8), 0) * 1000;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pace = totalMs / n;                                   // the even share per question
  const share = (i: number, elapsed: number) => { const rem = Math.max(0, totalMs - elapsed); return i >= n - 1 ? rem : Math.min(rem, Math.max(4000, rem / (n - i))); };

  const [i, setI] = useState(0);
  const [tokens, setTokens] = useState(pz.tokens);
  const [combo, setCombo] = useState(0);
  const [flash, setFlash] = useState<Res>('');
  const [toast, setToast] = useState('');
  const [cd, setCd] = useState(3);                            // get-ready countdown; the pool starts after it
  const [leftQ, setLeftQ] = useState(share(0, 0));
  const [allowQ, setAllowQ] = useState(share(0, 0));
  const [leftPool, setLeftPool] = useState(totalMs);
  const [res, setRes] = useState<Res[]>([]);
  const R = useRef({ i: 0, tokens: pz.tokens, combo: 0, picks: [] as number[], secs: [] as number[], ext: [] as boolean[], res: [] as Res[], elapsed: 0, qEl: 0, qStartEl: 0, allow: share(0, 0), last: Date.now(), lock: true, paused: false, done: false });
  const multi = useMemo(() => new Set(refs.map((r) => r.b)).size > 1, [refs]);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast((x) => (x === m ? '' : x)), 2600); };

  const finish = useCallback(async () => {
    const s = R.current; if (s.done) return; s.done = true;
    let c = 0, w = 0, ce = 0;
    const items = refs.map((x, k) => ({ n: x.n, pick: s.picks[k] || 0, b: x.b, sec: Math.round(s.secs[k] || 0), ...(s.ext[k] ? { ext: 1 } : {}) }));
    items.forEach((it, k) => { const key = lab.bookMap.get(it.b)?.answers[it.n]; if (!it.pick || !key) return; if (it.pick === key) { c++; if (s.ext[k]) ce++; } else w++; });
    const a: Attempt = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), bookId: multi ? MIX : refs[0].b, at: Date.now(), seconds: Math.round(s.elapsed / 1000), items,
      correct: c, wrong: w, blank: refs.length - c - w, pct: Math.round(((3 * (c - ce / 2) - w) / (3 * refs.length)) * 1000) / 10, mode: 'تمرین فشار', title: run.title };
    try { await saveAttempt(a); await recordAttemptMeta(a, (b, q) => lab.bookMap.get(b)?.answers[q] || 0); } catch { /* still show the result */ }
    onFinish(a);
  }, [refs, lab, multi, run.title, onFinish]);

  const startQ = useCallback((k: number) => {
    const s = R.current; s.i = k; s.qEl = 0; s.qStartEl = s.elapsed; s.allow = share(k, s.elapsed); s.lock = false; s.last = Date.now();
    setI(k); setAllowQ(s.allow); setLeftQ(s.allow);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback((how: Res) => {
    const s = R.current; s.lock = true; s.res[s.i] = how; setRes([...s.res]); setFlash(how);
    setTimeout(() => {
      setFlash('');
      if (s.done) return;
      if (s.i + 1 >= n || s.elapsed >= totalMs) { finish(); return; }
      startQ(s.i + 1);
    }, how === 'time' ? 520 : 340);
  }, [n, totalMs, finish, startQ]);

  const pick = useCallback((v: number) => {
    const s = R.current; if (s.lock || s.done || s.paused) return;
    const k = s.i, r = refs[k], key = lab.bookMap.get(r.b)?.answers[r.n] || 0, ok = key > 0 && v === key;
    s.picks[k] = v; s.secs[k] = s.qEl / 1000;
    if (ok && !s.ext[k] && s.qEl <= s.allow * 0.6) { s.combo++; if (s.combo % 3 === 0 && s.tokens < 5) { s.tokens++; setTokens(s.tokens); say('🔥 سه پاسخ درست و سریع پشت‌هم! یک «زمان‌خر» جایزه گرفتی'); } } else s.combo = 0;
    setCombo(s.combo); next(!key ? 'nokey' : ok ? 'ok' : 'bad');
  }, [refs, lab, next]);

  const more = useCallback(() => {
    const s = R.current; if (s.lock || s.done || s.paused || s.tokens <= 0 || s.ext[s.i]) return;
    const rem = totalMs - s.elapsed, add = Math.min(s.allow * 0.5, Math.max(0, rem - (s.allow - s.qEl)));
    s.tokens--; s.ext[s.i] = true; s.combo = 0; s.allow += add; setAllowQ(s.allow); setTokens(s.tokens); setCombo(0);
    say(`⏳ +${P(Math.round(add / 1000))} ثانیه · اگر درست بزنی فقط نصف نمرهٔ این سؤال را می‌گیری`);
  }, [totalMs]);

  useEffect(() => {   // get-ready countdown 3·2·1, then the first question and the shared clock start together
    if (cd <= 0) { startQ(0); return; }
    const t = setTimeout(() => setCd((c) => c - 1), 800); return () => clearTimeout(t);
  }, [cd, startQ]);

  useEffect(() => {   // the clock: 10 times a second, counting only while a question is live (not during the flash or a dialog)
    const id = setInterval(() => {
      const s = R.current, now = Date.now(), dt = Math.min(1000, now - s.last); s.last = now;
      if (s.lock || s.paused || s.done) return;
      s.elapsed += dt; s.qEl += dt;
      setLeftPool(Math.max(0, totalMs - s.elapsed)); setLeftQ(Math.max(0, s.allow - s.qEl));
      if (s.elapsed >= totalMs) { s.picks[s.i] = 0; s.secs[s.i] = s.qEl / 1000; s.res[s.i] = 'time'; s.lock = true; setRes([...s.res]); setFlash('time'); setTimeout(() => finish(), 520); return; }
      if (s.qEl >= s.allow) { s.picks[s.i] = 0; s.secs[s.i] = s.allow / 1000; s.combo = 0; setCombo(0); next('time'); }
    }, 100);
    return () => clearInterval(id);
  }, [next, finish, totalMs]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (document.querySelector('.dlg-overlay') || e.ctrlKey || e.metaKey || e.altKey) return;
      const d = /^(Digit|Numpad)([1-4])$/.exec(e.code || '');
      if (d) { pick(+d[2]); } else if (e.code === 'KeyT') more(); else return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', h, true); return () => window.removeEventListener('keydown', h, true);
  }, [pick, more]);

  const r = refs[Math.min(i, n - 1)], fq = allowQ ? Math.max(0, Math.min(1, leftQ / allowQ)) : 0, fp = totalMs ? Math.max(0, Math.min(1, leftPool / totalMs)) : 0;
  const hue = Math.round(fq * 120), secLeft = Math.ceil(leftQ / 1000), extUsed = R.current.ext[i];
  const bank = Math.round((i * pace - R.current.qStartEl) / 1000);          // seconds banked (+) or owed (−) versus the even pace
  const segs = Math.min(n, 60), segOf = (k: number) => Math.floor((k * n) / segs);
  const q0 = R.current.i;
  return (
    <section className="bk-pz" aria-label="تمرین فشار زمانی">
      <header className="bk-pz-head">
        <button type="button" className="bk-btn" onClick={async () => { const s = R.current; s.paused = true; const ok = await confirmDialog('تمرین فشار نیمه‌کاره رها شود؟ پاسخ‌های این دور ثبت نمی‌شود.'); s.last = Date.now(); if (ok) { s.done = true; onCancel(); } else s.paused = false; }}><X size={16} /> خروج</button>
        <span className="bk-pz-count"><b>{P(Math.min(i + 1, n))}</b> / {P(n)}</span>
        <span className={'bk-pz-combo' + (combo >= 2 ? ' hot' : '')} title="پاسخ درست و سریعِ پشت‌هم"><Flame size={15} /> {P(combo)}</span>
        <span className="bk-pz-tok" title="زمان‌خر: هرکدام ۵۰٪ زمان اضافه">{Array.from({ length: 5 }, (_, k) => <i key={k} className={k < tokens ? 'on' : ''} />)}</span>
      </header>

      <div className={'bk-pz-hero' + (secLeft <= 5 && cd <= 0 ? ' urgent' : '')}>
        <div className="bk-pz-ring" style={{ ['--h' as any]: hue }}>
          <svg viewBox="0 0 140 140" aria-hidden>
            <circle className="trk" cx="70" cy="70" r={ROUT} strokeWidth="4" />
            <circle className="pool" cx="70" cy="70" r={ROUT} strokeWidth="4" strokeDasharray={COUT} strokeDashoffset={COUT * (1 - fp)} />
            <circle className="trk" cx="70" cy="70" r={RIN} strokeWidth="11" />
            <circle className="arc" cx="70" cy="70" r={RIN} strokeWidth="11" strokeDasharray={CIN} strokeDashoffset={CIN * (1 - fq)} />
          </svg>
          <div className="bk-pz-mid"><b>{P(secLeft)}</b><small>ثانیه</small></div>
        </div>
        <dl className="bk-pz-stats">
          <div><dt><Timer size={13} /> زمان کل باقی‌مانده</dt><dd className="mono">{mmss(leftPool)}</dd></div>
          <div><dt>سهم این سؤال</dt><dd>{P(Math.round(allowQ / 1000))} ثانیه</dd></div>
          <div className={'bk-pz-pace ' + (bank >= 0 ? 'up' : 'down')}><dt>{bank >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} نسبت به برنامه</dt><dd>{bank >= 0 ? 'جلوتری ' : 'عقب‌تری '}{P(Math.abs(bank))} ثانیه</dd></div>
        </dl>
      </div>

      <div className="bk-pz-segs" aria-hidden>{Array.from({ length: segs }, (_, k) => { const idx = segOf(k), st = idx < q0 ? (res[idx] || 'done') : idx === q0 ? 'cur' : ''; return <i key={k} className={st} />; })}</div>

      <div className={'bk-pz-box ' + flash}>
        {cd > 0 && <div className="bk-pz-cd" role="status"><span key={cd}>{cd}</span><small>آماده باش… {P(n)} سؤال در {mmss(totalMs)}</small></div>}
        <QImg b={r.b} n={r.n} />
      </div>
      <div className="bk-pz-opts" dir="ltr">{[1, 2, 3, 4].map((v) => <button key={v} type="button" disabled={cd > 0} onClick={() => pick(v)}>{P(v)}</button>)}</div>
      <button type="button" className="bk-btn bk-pz-more" disabled={cd > 0 || tokens <= 0 || !!extUsed} onClick={more}><Hourglass size={16} /> {extUsed ? 'تمدید شد' : 'زمان می‌خوام'} <small>(T)</small></button>
      {toast && <div className="bk-pz-toast" role="status">{toast}</div>}
    </section>
  );
};
