import React from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, RotateCcw, X } from 'lucide-react';
import { confirmDialog } from '../dialog';
import { useBackToClose } from '../useBackToClose';
import { labelForUnits } from '../trackerPlan';
import { toPersianDigits as P } from '../utils';
import { CAUSE_LABEL, DIFF_LABEL, VaultQ, WHY, dueOf, isLeech, isOpenMistake, recordResult, getVault, useVaultPic, hasExplain, linkedBookTitle } from './store';
import type { ReviewReq } from './launch';
import { Clock } from '../clock/Clock';
import './vault.css';

export interface ReviewSummary { total: number; right: number; wrong: number; lesson: string; title: string; minutes: number }

/** the list of questions a review request stands for */
export function buildReview(all: VaultQ[], r: ReviewReq): VaultQ[] {
  let pool = all;
  if (r.ids) { const s = new Set(r.ids); pool = pool.filter((q) => s.has(q.id)); }
  if (r.book) pool = pool.filter((q) => q.book === r.book);
  if (r.unit) pool = pool.filter((q) => q.units.includes(r.unit as string));
  if (r.ids) return pool;
  const mode = r.mode || 'smart';
  if (mode === 'all') return pool.slice().sort(() => Math.random() - 0.5);
  if (mode === 'weak') return pool.filter(isOpenMistake).sort((a, b) => Number(isLeech(b)) - Number(isLeech(a)) || a.last - b.last);
  // smart: what is due (stubborn ones first) → otherwise questions never practised → otherwise the open mistakes
  const due = dueOf(pool).sort((a, b) => Number(isLeech(b)) - Number(isLeech(a)) || a.due - b.due);
  if (due.length) return due.slice(0, 30);
  const fresh = pool.filter((q) => !q.tries).sort((a, b) => a.created - b.created);
  if (fresh.length) return fresh.slice(0, 20);
  return pool.filter(isOpenMistake).slice(0, 20);
}

type Res = 'ok' | 'bad';
const Pic: React.FC<{ id: string; kind: 'q' | 'e'; alt: string }> = ({ id, kind, alt }) => {
  const { src, missing } = useVaultPic(id, kind);
  const q = getVault().items.find((x) => x.id === id);
  if (!src && missing && q?.src) return <div className="vt-img ph vt-miss">این سؤال از کتاب «{linkedBookTitle(q)}» است؛ آن کتاب را در «بانک تست» وارد کنید.</div>;
  return src ? <img className="vt-img" src={src} alt={alt} draggable={false} /> : <div className="vt-img ph" aria-busy="true" />;
};

export const VaultReview: React.FC<{ list: VaultQ[]; title: string; onClose: () => void; onLogReport: (s: ReviewSummary) => void }> = ({ list: first, title, onClose, onLogReport }) => {
  const [list, setList] = React.useState(first);
  const [i, setI] = React.useState(0);
  const [pick, setPick] = React.useState<Record<string, number>>({});
  const [shown, setShown] = React.useState<Record<string, true>>({});
  const [res, setRes] = React.useState<Record<string, Res>>({});
  const [fin, setFin] = React.useState(false);
  const [t0, setT0] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(() => Date.now());
  const [logged, setLogged] = React.useState(false);
  useBackToClose(true, onClose);
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { rootRef.current?.focus(); }, []);

  React.useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const q = list[i];
  const sh = !!(q && shown[q.id]);
  const pk = q ? pick[q.id] : 0;
  const right = list.filter((x) => res[x.id] === 'ok').length;
  const wrong = list.filter((x) => res[x.id] === 'bad').length;
  const doneN = right + wrong;

  const doPick = (n: number) => { if (q && !sh) setPick((p) => ({ ...p, [q.id]: n })); };
  const check = () => {
    if (!q || sh || !pk) return;
    const win = pk === q.answer;
    setShown((s) => ({ ...s, [q.id]: true })); setRes((r) => ({ ...r, [q.id]: win ? 'ok' : 'bad' }));
    recordResult(q.id, win);
  };
  const reveal = () => { if (q && !sh) setShown((s) => ({ ...s, [q.id]: true })); };
  const selfGrade = (win: boolean) => { if (!q || res[q.id]) return; setRes((r) => ({ ...r, [q.id]: win ? 'ok' : 'bad' })); recordResult(q.id, win); };
  const go = (d: number) => setI((x) => Math.min(list.length - 1, Math.max(0, x + d)));
  const restart = (l: VaultQ[]) => { if (!l.length) return; setList(l); setI(0); setPick({}); setShown({}); setRes({}); setFin(false); setT0(Date.now()); setLogged(false); };

  const stateRef = React.useRef({ q, sh, pk, go, check, doPick, fin });
  stateRef.current = { q, sh, pk, go, check, doPick, fin };
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current, el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || s.fin || !s.q) return;
      if (e.key === 'Escape') { void exitRef.current(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); s.go(1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); s.go(-1); }
      else if (/^[1-6]$/.test(e.key) && Number(e.key) <= s.q.choices) { e.preventDefault(); s.doPick(Number(e.key)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (s.sh) s.go(1); else s.check(); } // preventDefault: a button focused behind the player must not be «clicked»
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const exitRef = React.useRef<() => Promise<void>>(async () => undefined);
  const exit = async () => { if (fin || doneN === 0 || (await confirmDialog('مرور نیمه‌کاره بسته شود؟ پاسخ‌های داده‌شده ذخیره شده‌اند.'))) onClose(); };
  exitRef.current = exit;
  const el = Math.floor((now - t0) / 1000);
  

  if (!q) return null;

  if (fin) {
    const bad = list.filter((x) => res[x.id] === 'bad');
    const minutes = Math.max(1, Math.round((now - t0) / 6e4));
    const lessons: Record<string, number> = {};
    list.forEach((x) => { if (res[x.id]) lessons[x.book] = (lessons[x.book] || 0) + 1; });
    const top = Object.keys(lessons).sort((a, b) => lessons[b] - lessons[a])[0] || title;
    return (
      <div ref={rootRef} tabIndex={-1} className="vt-exam vt-lock" role="dialog" aria-modal="true" aria-label="خلاصه مرور">
        <div className="vt-eh"><b>خلاصهٔ مرور</b><span className="grow" /><button type="button" className="vt-btn" onClick={onClose}>بستن</button></div>
        <div className="vt-eb one">
          <div className="vt-paper vt-sum">
            <big>{P(doneN ? Math.round((right / doneN) * 100) : 0)}٪</big>
            <p>{P(right)} پاسخ درست از {P(doneN)} پاسخ‌داده‌شده، از {P(list.length)} سؤال · {P(minutes)} دقیقه</p>
            {bad.length > 0 && <p className="vt-sub">اشتباه‌ها دوباره به‌زودی برمی‌گردند و مبحث پیوندشان در «پیگیری مباحث» علامت خورده است.</p>}
            <div className="vt-sumbtns">
              <button type="button" className="vt-btn p" onClick={() => restart(list)}><RotateCcw size={16} /> مرور دوباره</button>
              {bad.length > 0 && <button type="button" className="vt-btn d" onClick={() => restart(bad)}>فقط غلط‌ها ({P(bad.length)})</button>}
              {doneN > 0 && <button type="button" className="vt-btn" disabled={logged} onClick={() => { setLogged(true); onLogReport({ total: doneN, right, wrong, lesson: top, title, minutes }); }}><ClipboardList size={16} /> {logged ? 'در گزارش امروز ثبت شد ✓' : 'ثبت در گزارش امروز'}</button>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const last = i === list.length - 1;
  const topic = q.units.length ? labelForUnits(q.units.slice(0, 1)) : '';
  return (
    <div ref={rootRef} tabIndex={-1} className="vt-exam vt-lock" role="dialog" aria-modal="true" aria-label="مرور گنجینه">
      <div className="vt-eh">
        <b className="vt-et">{title}</b><span className="grow" />
        <span className="vt-clock"><Clock sec={el} /></span>
        <div className="vt-bar" aria-hidden="true"><i style={{ width: ((i + 1) / list.length) * 100 + '%' }} /></div>
        <button type="button" className="vt-btn" onClick={exit}><X size={16} /> خروج</button>
      </div>
      <div className="vt-eb">
        <div className="vt-paper">
          <div className="vt-qn"><b>سؤال {P(i + 1)}</b> از {P(list.length)}
            <span className={'vt-tag ' + WHY[q.why].g}>{WHY[q.why].l}</span>
            {isLeech(q) && <span className="vt-tag w">سؤال لجباز</span>}
            {q.cause && <span className="vt-tag cs">{CAUSE_LABEL[q.cause]}</span>}
            {q.diff > 0 && <span className="vt-tag cs">{DIFF_LABEL[q.diff]}</span>}
          </div>
          <div className="vt-src">{q.book}{q.lesson ? ' › ' + q.lesson : ''}{topic ? ' · ' + topic : ''}</div>
          <Pic id={q.id} kind="q" alt={'سؤال ' + (i + 1)} />
          <div className="vt-opts" role="group" aria-label="گزینه‌ها">
            {Array.from({ length: q.choices }, (_, k) => {
              const n = k + 1;
              let c = 'vt-opt';
              if (sh) { if (n === q.answer) c += ' ok'; else if (n === pk) c += ' bad'; } else if (n === pk) c += ' sel';
              return <button key={n} type="button" className={c} disabled={sh} aria-pressed={n === pk} onClick={() => doPick(n)}>{P(n)}</button>;
            })}
          </div>
          {sh && (
            <div className="vt-qa">
              <div className={'vt-verdict ' + (pk ? (pk === q.answer ? 'ok' : 'bad') : '')}>{pk ? (pk === q.answer ? 'درست است. ' : `نادرست؛ گزینهٔ ${P(pk)} را انتخاب کردید. `) : ''}پاسخ درست: گزینهٔ {P(q.answer)}</div>
              {hasExplain(q) && <Pic id={q.id} kind="e" alt="پاسخ تشریحی" />}
              {q.etext && <div className="vt-expl">{q.etext}</div>}
              {!hasExplain(q) && !q.etext && <div className="vt-sub">توضیحی ذخیره نشده است.</div>}
              {!pk && !res[q.id] && (
                <div className="vt-self"><span>نتیجهٔ خودت چه بود؟</span>
                  <button type="button" className="vt-btn ok" onClick={() => selfGrade(true)}>بلد بودم</button>
                  <button type="button" className="vt-btn no" onClick={() => selfGrade(false)}>غلط می‌زدم</button></div>
              )}
            </div>
          )}
        </div>
        <aside className="vt-nvp" aria-label="نقشه سؤال‌ها">
          <h3>{P(right)} درست · {P(wrong)} غلط</h3>
          <div className="vt-nv">{list.map((x, k) => <button key={x.id} type="button" className={(res[x.id] || '') + (k === i ? ' cur' : '')} onClick={() => setI(k)}>{P(k + 1)}</button>)}</div>
        </aside>
      </div>
      <div className="vt-ef">
        <button type="button" className="vt-btn" disabled={i === 0} onClick={() => go(-1)}><ChevronRight size={16} /> قبلی</button>
        {!sh && <button type="button" className="vt-btn p" disabled={!pk} onClick={check}>بررسی پاسخ</button>}
        {!sh && <button type="button" className="vt-btn" onClick={reveal}>نمایش پاسخ</button>}
        {!last ? <button type="button" className={'vt-btn' + (sh ? ' p' : '')} onClick={() => go(1)}>بعدی <ChevronLeft size={16} /></button>
          : <button type="button" className="vt-btn p" onClick={() => setFin(true)}>پایان</button>}
      </div>
    </div>
  );
};
