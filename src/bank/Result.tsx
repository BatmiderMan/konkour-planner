import React, { useMemo, useState } from 'react';
import { qno, bn } from './qno';
import { ArrowRight, RotateCcw, FileText, Gem, Bookmark } from 'lucide-react';
import { Lab, QImg, Viewer, addRefsToVault } from './parts';
import { Attempt, Ref, itemBook, keyOf, newSetId, saveSet } from './store';
import { fmtDur } from './lab';
import { toPersianDigits as P } from '../utils';
import { alertDialog } from '../dialog';
import { promptName } from './util';
import { TimeCandles } from '../checker/TimeCandles';
import { GradedRow } from '../checker/model';

export const Result: React.FC<{ a: Attempt; lab: Lab; onBack: () => void; onRetry: (refs: Ref[]) => void; onPdf: (refs: Ref[], title: string) => void }> = ({ a, lab, onBack, onRetry, onPdf }) => {
  const [tab, setTab] = useState<'all' | 'bad' | 'blank' | 'good'>('bad');
  const [view, setView] = useState<number | null>(null);
  const rows = useMemo(() => a.items.map((it) => {
    const b = itemBook(a, it), right = lab.bookMap.get(b)?.answers[it.n] || 0;
    return { ...it, b, right, ok: it.pick !== 0 && it.pick === right };
  }), [a, lab]);
  const bad = rows.filter((x) => x.pick !== 0 && x.right > 0 && !x.ok), blank = rows.filter((x) => !x.pick || !x.right), good = rows.filter((x) => x.ok);
  const shown = tab === 'all' ? rows : tab === 'bad' ? bad : tab === 'blank' ? blank : good;
  const refsOf = (l: typeof rows): Ref[] => l.map((x) => ({ b: x.b, n: x.n }));
  const picks: Record<string, number> = {}; rows.forEach((x) => { picks[keyOf(x.b, x.n)] = x.pick; });
  const perBook = useMemo(() => {
    const m = new Map<string, { t: number; c: number; w: number; s: number }>();
    rows.forEach((x) => { const e = m.get(x.b) || { t: 0, c: 0, w: 0, s: 0 }; e.t++; if (x.ok) e.c++; else if (x.pick) e.w++; e.s += x.sec || 0; m.set(x.b, e); });
    return [...m.entries()];
  }, [rows]);
  const slow = [...rows].sort((p, q) => (q.sec || 0) - (p.sec || 0)).slice(0, 5).filter((x) => (x.sec || 0) > 0);
  const miss = [...bad, ...blank];
  const candleRows: GradedRow[] = rows.map((x, i) => ({ q: i + 1, bq: x.n, key: x.right, mine: x.pick, dbl: false, edited: false, st: x.ok ? 'ok' : x.pick && x.right ? 'bad' : 'blank' }) as GradedRow);
  const candleTimes = rows.map((x) => x.sec || 0);
  const lvlName = ['', 'آسان', 'متوسط', 'سخت'];
  const topicOf = (b: string, n: number) => { const s = (lab.sections[b] || []).find((z) => bn(n) >= z.from && bn(n) <= z.to); return (lab.books.length > 1 || !s ? (lab.bookMap.get(b)?.title || '') : '') + (s ? (lab.books.length > 1 ? ' · ' : '') + s.name : ''); };
  const title = a.title || lab.bookMap.get(a.bookId)?.title || 'آزمون';
  return (
    <section className="bk-result">
      <div className="bk-rh"><button type="button" className="bk-btn ghost" onClick={onBack}><ArrowRight size={18} /> بازگشت</button><h2>نتیجه</h2></div>
      <p className="bk-sub">{title} · {P(a.items.length)} سؤال · {a.mode} · {P(fmtDur(a.seconds))}</p>
      <div className="bk-stats">
        <div className="big"><b>{P(a.pct)}٪</b><span>درصد (با نمرهٔ منفی)</span></div>
        <div className="ok"><b>{P(a.correct)}</b><span>درست</span></div><div className="bad"><b>{P(a.wrong)}</b><span>غلط</span></div><div><b>{P(a.blank)}</b><span>نزده</span></div>
      </div>
      {perBook.length > 1 && <ul className="bk-pb">{perBook.map(([b, e]) => <li key={b}><b>{lab.bookMap.get(b)?.title || 'کتاب حذف‌شده'}</b><span>{P(e.c)} درست · {P(e.w)} غلط · {P(e.t - e.c - e.w)} نزده</span><i style={{ width: (e.c / e.t) * 100 + '%' }} /></li>)}</ul>}
      {slow.length > 0 && <p className="bk-hint">⏱ وقت‌گیرترین‌ها: {slow.map((x) => `${P(qno(x.n))} (${P(fmtDur(x.sec || 0))})`).join(' ، ')}</p>}
      <div className="bk-acts">
        <button type="button" className="bk-btn primary" disabled={!miss.length} onClick={() => onRetry(refsOf(miss))}><RotateCcw size={16} /> دوباره فقط اشتباه‌ها ({P(miss.length)})</button>
        <button type="button" className="bk-btn" disabled={!miss.length} onClick={() => addRefsToVault(lab, refsOf(miss), 'wrong')}><Gem size={16} /> اشتباه‌ها به گنجینه</button>
        <button type="button" className="bk-btn" disabled={!miss.length} onClick={async () => {
          const name = await promptName('نام مجموعه', 'اشتباه‌های ' + title); if (!name) return;
          await saveSet({ id: newSetId(), name, refs: refsOf(miss), created: Date.now(), updated: Date.now() }); await alertDialog('مجموعه ذخیره شد (در «کتابخانه»).');
        }}><Bookmark size={16} /> ذخیره به‌عنوان مجموعه</button>
        <button type="button" className="bk-btn" onClick={() => onPdf(refsOf(shown.length ? shown : rows), tab === 'all' ? title : title + ' — ' + { bad: 'غلط‌ها', blank: 'نزده‌ها', good: 'درست‌ها' }[tab])}><FileText size={16} /> PDF همین فهرست</button>
      </div>
      <div className="bk-tabs">{([['bad', `غلط (${P(bad.length)})`], ['blank', `نزده (${P(blank.length)})`], ['good', `درست (${P(good.length)})`], ['all', 'همه']] as const).map(([k, l]) => <button type="button" key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {!shown.length && <p className="bk-empty">موردی نیست.</p>}
      <Rhythm rows={rows} />
      {a.mode === 'تمرین فشار' && <p className="bk-hint">⏱ تمرین فشار · {P(a.items.filter((x) => x.ext).length)} بار «زمان‌خر» · سؤال‌های تمدیدشده نصف نمره حساب شد</p>}
      {candleTimes.some((t) => t > 0) && <TimeCandles rows={candleRows} times={candleTimes} title={title} onOpen={(q) => { setTab('all'); setView(q - 1); }} />}
      <div className="bk-tbl" role="table">
        <div className="bk-tr hd" role="row"><span>سؤال</span><span>نتیجه و گزینه‌ها</span><span>موضوع</span><span>سطح</span><span>زمان</span></div>
        {shown.map((x) => { const idx = rows.indexOf(x), meta = lab.meta[keyOf(x.b, x.n)]; return (
          <button type="button" role="row" key={keyOf(x.b, x.n) + idx} className={'bk-tr ' + (x.ok ? 's-ok' : x.pick ? 's-bad' : 's-blank')} onClick={() => setView(shown.indexOf(x))}>
            <span className="no">{P(qno(x.n))}</span>
            <span className="opts">{[1, 2, 3, 4].map((v) => <i key={v} className={(v === x.right ? 'right ' : '') + (v === x.pick ? (x.ok ? 'mine ok' : 'mine bad') : '')}>{P(v)}</i>)}</span>
            <span className="tp"><b>{topicOf(x.b, x.n) || '—'}</b>{lab.bookMap.get(x.b)?.expl.includes(x.n) && <small>دارای پاسخ تشریحی</small>}</span>
            <span className="lv">{lvlName[meta?.lvl || 0] || '—'}</span>
            <span className="tm">{x.sec ? P(fmtDur(x.sec)) : '—'}</span>
          </button>); })}
      </div>
      {view !== null && <Viewer refs={refsOf(shown)} start={view} lab={lab} picks={picks} session={a.id} onClose={() => setView(null)} />}
    </section>
  );
};

/** how the exam went from start to end: accuracy and speed in each third — tiredness / rushing show up here */
const Rhythm: React.FC<{ rows: Array<{ ok: boolean; pick: number; sec?: number }> }> = ({ rows }) => {
  const n = rows.length; if (n < 6) return null;
  const parts = n >= 9 ? 3 : 2, size = Math.ceil(n / parts);
  const seg = Array.from({ length: parts }, (_, k) => rows.slice(k * size, (k + 1) * size)).filter((x) => x.length);
  const st = seg.map((x) => { const t = x.filter((r) => (r.sec || 0) > 0); return { acc: Math.round((x.filter((r) => r.ok).length / x.length) * 100), avg: t.length ? Math.round(t.reduce((s, r) => s + (r.sec || 0), 0) / t.length) : 0, blank: x.filter((r) => !r.pick).length }; });
  const a = st[0], z = st[st.length - 1], names = parts === 3 ? ['ابتدا', 'میانه', 'پایان'] : ['نیمهٔ اول', 'نیمهٔ دوم'];
  const msgs: string[] = [];
  const faster = a.avg > 0 && z.avg > 0 && z.avg < a.avg * 0.8, slower = a.avg > 0 && z.avg > a.avg * 1.25, worse = z.acc < a.acc - 12, better = z.acc > a.acc + 12;
  if (faster && worse) msgs.push('⚡ در پایان آزمون عجله کردی: سرعتت بالا رفت ولی دقتت افت کرد. چند ثانیه بیشتر برای خواندن سؤال بگذار.');
  else if (slower && worse) msgs.push('🥱 در پایان هم کُند شدی هم دقتت افت کرد؛ نشانهٔ خستگی. تمرین‌های طولانی‌تر و استراحت‌های کوتاه کمک می‌کند.');
  else if (worse) msgs.push('📉 دقتت در بخش پایانی کمتر بود؛ تمرکزت را برای ۱۰ سؤال آخر تمرین کن.');
  else if (better) msgs.push('📈 آخر آزمون بهتر از اولش بودی؛ احتمالاً شروع را گرم نبودی. چند سؤال آسان قبل از آزمون کمک می‌کند.');
  if (z.blank > a.blank + Math.ceil(size / 3)) msgs.push('⏳ بیشتر سؤال‌های نزده در بخش آخر است؛ زمان‌بندی را از ابتدا کنترل کن.');
  if (!msgs.length) msgs.push('✅ ریتم آزمونت پایدار بود: دقت و سرعتت از ابتدا تا انتها تقریباً یکسان ماند.');
  return (
    <div className="bk-rhythm">
      <h4>🎼 ریتم آزمون</h4>
      <div className="seg">{st.map((x, k) => <div key={k}><b>{names[k]}</b><span className="bar"><i style={{ width: x.acc + '%' }} /></span><small>دقت {P(x.acc)}٪{x.avg ? ' · میانگین ' + P(x.avg) + ' ث' : ''}</small></div>)}</div>
      {msgs.map((m) => <p key={m}>{m}</p>)}
    </div>
  );
};
