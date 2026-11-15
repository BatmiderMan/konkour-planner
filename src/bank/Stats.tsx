import React from 'react';
import { Lab } from './parts';
import { MASTERY, keyOf, masteryOf } from './store';
import { fmtDur } from './lab';
import { toPersianDigits as P } from '../utils';

export const Stats: React.FC<{ lab: Lab }> = ({ lab }) => {
  if (!lab.books.length) return <div className="bk-emptybox"><b>هنوز کتابی اضافه نشده</b></div>;
  const rows = lab.books.map((b) => {
    const c = [0, 0, 0, 0]; b.numbers.forEach((n) => { c[masteryOf(lab.meta[keyOf(b.id, n)])]++; });
    let secs = 0, tries = 0; b.numbers.forEach((n) => { const m = lab.meta[keyOf(b.id, n)]; if (m) { secs += m.secs || 0; tries += m.tries || 0; } });
    const secsBy = (lab.sections[b.id] || []).map((s) => {
      let t = 0, w = 0, ok = 0; b.numbers.forEach((n) => { if (n < s.from || n > s.to) return; const m = lab.meta[keyOf(b.id, n)]; if (m?.tries) { t += m.tries; ok += m.wins || 0; w++; } });
      return { name: s.name, t, ok, w };
    });
    return { b, c, secs, tries, secsBy };
  });
  const last = lab.attempts.slice(0, 14).reverse();
  const flagged = Object.values(lab.meta).filter((m) => m.star).length, doubt = Object.values(lab.meta).filter((m) => m.doubt).length;
  return (
    <section className="bk-stat">
      <div className="bk-stats"><div className="big"><b>{P(lab.attempts.length)}</b><span>آزمون انجام‌شده</span></div><div><b>{P(flagged)}</b><span>⭐ مهم</span></div><div><b>{P(doubt)}</b><span>🤔 شک‌دار</span></div><div><b>{P(lab.sets.length)}</b><span>مجموعه</span></div></div>
      {last.length > 0 && (
        <div className="bk-form"><h3>روند درصد آزمون‌ها</h3>
          <div className="bk-spark" role="img" aria-label="نمودار درصد آزمون‌ها">{last.map((a) => <div key={a.id} title={`${P(a.pct)}٪`}><i style={{ height: Math.max(3, Math.min(100, a.pct)) + '%' }} className={a.pct < 0 ? 'neg' : ''} /><small>{P(Math.round(a.pct))}</small></div>)}</div></div>
      )}
      {rows.map(({ b, c, secs, tries, secsBy }) => (
        <div key={b.id} className="bk-form"><h3>{b.title}</h3>
          <div className="bk-stack" role="img" aria-label="وضعیت تسلط">{c.map((v, i) => v > 0 && <i key={i} className={'s' + i} style={{ flex: v }} title={`${MASTERY[i]}: ${v}`} />)}</div>
          <p className="bk-hint">{c.map((v, i) => `${MASTERY[i]} ${P(v)}`).join(' · ')}{tries ? ` · میانگین زمان هر پاسخ ${P(fmtDur(secs / tries))}` : ''}</p>
          {secsBy.length > 0 && <ul className="bk-pb">{secsBy.map((s) => <li key={s.name}><b>{s.name}</b><span>{s.t ? `${P(Math.round((s.ok / s.t) * 100))}٪ درست از ${P(s.t)} پاسخ` : 'هنوز پاسخی نیست'}</span><i style={{ width: s.t ? (s.ok / s.t) * 100 + '%' : '0' }} /></li>)}</ul>}
        </div>
      ))}
    </section>
  );
};
