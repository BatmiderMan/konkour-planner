/** Pressure practice: ONE question at a time with a line across its box that burns down; when the line ends the question moves on by itself.
 *  The time per question is your own usual time (or the level's), made tighter by the chosen pressure.
 *  «زمان‌خر» (T): a few extra-time tokens — each gives +50% of the question's time but halves its credit and breaks your streak.
 *  Tokens are EARNED too: 3 right answers in a row, each given within 60% of its time, give one more. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Hourglass, X, Flame } from 'lucide-react';
import { Lab, QImg } from './parts';
import { Attempt, MIX, recordAttemptMeta, saveAttempt, keyOf } from './store';
import { budgetSec } from './lab';
import { confirmDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';
import type { Run } from './Player';

export const Pressure: React.FC<{ run: Run; lab: Lab; onFinish: (a: Attempt) => void; onCancel: () => void }> = ({ run, lab, onFinish, onCancel }) => {
  const { refs } = run, pz = run.pressure!;
  const budgets = useMemo(() => refs.map((r) => budgetSec(lab.attempts, lab.meta[keyOf(r.b, r.n)], r, pz.tight)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [tokens, setTokens] = useState(pz.tokens);
  const [combo, setCombo] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'bad' | 'time' | ''>('');
  const [toast, setToast] = useState('');
  const [leftMs, setLeftMs] = useState(budgets[0] * 1000);
  const [totalMs, setTotalMs] = useState(budgets[0] * 1000);
  const R = useRef({ i: 0, tokens: pz.tokens, combo: 0, picks: [] as number[], secs: [] as number[], ext: [] as boolean[], start: Date.now(), total: budgets[0] * 1000, lock: false, done: false, t0: Date.now() });
  const multi = useMemo(() => new Set(refs.map((r) => r.b)).size > 1, [refs]);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast((x) => (x === m ? '' : x)), 2600); };

  const finish = useCallback(async () => {
    const s = R.current; if (s.done) return; s.done = true;
    let c = 0, w = 0, ce = 0;
    const items = refs.map((x, k) => ({ n: x.n, pick: s.picks[k] || 0, b: x.b, sec: Math.round(s.secs[k] || 0), ...(s.ext[k] ? { ext: 1 } : {}) }));
    items.forEach((it, k) => { const key = lab.bookMap.get(it.b)?.answers[it.n]; if (!it.pick || !key) return; if (it.pick === key) { c++; if (s.ext[k]) ce++; } else w++; });
    const a: Attempt = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), bookId: multi ? MIX : refs[0].b, at: Date.now(), seconds: Math.round((Date.now() - s.t0) / 1000), items,
      correct: c, wrong: w, blank: refs.length - c - w, pct: Math.round(((3 * (c - ce / 2) - w) / (3 * refs.length)) * 1000) / 10, mode: 'تمرین فشار', title: run.title };
    try { await saveAttempt(a); await recordAttemptMeta(a, (b, n) => lab.bookMap.get(b)?.answers[n] || 0); } catch { /* still show the result */ }
    onFinish(a);
  }, [refs, lab, multi, run.title, onFinish]);

  const next = useCallback((how: 'ok' | 'bad' | 'time' | '') => {
    const s = R.current; s.lock = true; setFlash(how);
    setTimeout(() => {
      setFlash('');
      if (s.i + 1 >= refs.length) { finish(); return; }
      s.i++; s.start = Date.now(); s.total = budgets[s.i] * 1000; s.lock = false;
      setI(s.i); setTotalMs(s.total); setLeftMs(s.total);
    }, how === 'time' ? 520 : 380);
  }, [refs.length, budgets, finish]);

  const pick = useCallback((v: number) => {
    const s = R.current; if (s.lock || s.done) return;
    const used = (Date.now() - s.start) / 1000, k = s.i, r = refs[k], key = lab.bookMap.get(r.b)?.answers[r.n] || 0, ok = key > 0 && v === key;
    s.picks[k] = v; s.secs[k] = used;
    if (ok && !s.ext[k] && used <= (budgets[k] * 0.6)) { s.combo++; if (s.combo % 3 === 0 && s.tokens < 5) { s.tokens++; setTokens(s.tokens); say('🔥 سه پاسخ درست و سریع پشت‌هم! یک «زمان‌خر» جایزه گرفتی'); } } else s.combo = 0;
    setCombo(s.combo); next(!key ? '' : ok ? 'ok' : 'bad');
  }, [refs, lab, budgets, next]);

  const more = useCallback(() => {
    const s = R.current; if (s.lock || s.done || s.tokens <= 0 || s.ext[s.i]) return;
    s.tokens--; s.ext[s.i] = true; s.combo = 0; s.total += budgets[s.i] * 500; setTotalMs(s.total); setTokens(s.tokens); setCombo(0);
    say(`⏳ +${P(Math.round(budgets[s.i] / 2))} ثانیه · اگر درست بزنی فقط نصف نمرهٔ این سؤال را می‌گیری`);
  }, [budgets]);

  useEffect(() => {   // the burning line: 10 times a second; when it ends the question goes on by itself (left blank)
    const id = setInterval(() => {
      const s = R.current; if (s.lock || s.done) return;
      const left = s.total - (Date.now() - s.start); setLeftMs(Math.max(0, left));
      if (left <= 0) { s.picks[s.i] = 0; s.secs[s.i] = s.total / 1000; s.combo = 0; setCombo(0); next('time'); }
    }, 100);
    return () => clearInterval(id);
  }, [next]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (document.querySelector('.dlg-overlay') || e.ctrlKey || e.metaKey || e.altKey) return;
      const d = /^(Digit|Numpad)([1-4])$/.exec(e.code || '');
      if (d) { pick(+d[2]); } else if (e.code === 'KeyT') more(); else return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', h, true); return () => window.removeEventListener('keydown', h, true);
  }, [pick, more]);

  const r = refs[i], frac = totalMs ? leftMs / totalMs : 0, hue = Math.round(frac * 120), secLeft = Math.ceil(leftMs / 1000);
  const extUsed = R.current.ext[i];
  return (
    <section className="bk-pz" aria-label="تمرین فشار زمانی">
      <header className="bk-pz-head">
        <button type="button" className="bk-btn" onClick={async () => { if (await confirmDialog('تمرین فشار نیمه‌کاره رها شود؟ پاسخ‌های این دور ثبت نمی‌شود.')) { R.current.done = true; onCancel(); } }}><X size={16} /> خروج</button>
        <b>سؤال {P(i + 1)} از {P(refs.length)}</b>
        <span className={'bk-pz-combo' + (combo >= 2 ? ' hot' : '')} title="پاسخ درست و سریعِ پشت‌هم"><Flame size={15} /> {P(combo)}</span>
        <span className="bk-pz-tok" title="زمان‌خر: هرکدام ۵۰٪ زمان اضافه">{Array.from({ length: 5 }, (_, k) => <i key={k} className={k < tokens ? 'on' : ''} />)}</span>
      </header>
      <div className={'bk-pz-box ' + flash}>
        <div className="bk-pz-line" aria-hidden><i style={{ width: frac * 100 + '%', background: `hsl(${hue} 78% 46%)` }} className={secLeft <= 5 ? 'last' : ''} /></div>
        <span className="bk-pz-sec" style={{ color: `hsl(${hue} 70% 38%)` }}>{P(secLeft)}</span>
        <QImg b={r.b} n={r.n} />
      </div>
      <div className="bk-pz-opts" dir="ltr">{[1, 2, 3, 4].map((v) => <button key={v} type="button" onClick={() => pick(v)}>{P(v)}</button>)}</div>
      <button type="button" className="bk-btn bk-pz-more" disabled={tokens <= 0 || !!extUsed} onClick={more}><Hourglass size={16} /> {extUsed ? 'تمدید شد' : 'زمان می‌خوام'} <small>(T)</small></button>
      {toast && <div className="bk-pz-toast" role="status">{toast}</div>}
    </section>
  );
};
