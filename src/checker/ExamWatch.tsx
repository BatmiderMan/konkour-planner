import React from 'react';
import { toPersianDigits as P } from '../utils';

interface Props {
  budgetSec: number;   // whole test time (0 = unknown: only the watch is shown)
  leftSec: number;     // time left on the sheet's own clock
  spentSec: number;
  totalOn: number;     // questions that belong to the test
  done: number;        // questions answered so far
  targetSec: number;   // target time per question
  running: boolean;
}

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  return `${P(h)}:${P(String(d.getMinutes()).padStart(2, '0'))}`;
};
const pt = (r: number, deg: number): [number, number] => [100 + r * Math.sin((deg * Math.PI) / 180), 100 - r * Math.cos((deg * Math.PI) / 180)];
const minuteDeg = (ms: number): number => { const d = new Date(ms); return (d.getMinutes() + d.getSeconds() / 60) * 6; };

/**
 * A classic (analog) watch with the test drawn on it: the arc is the time of the test, the dots are the checkpoints (every third of it).
 * Under it: where you should be by now, and the watch time of the next checkpoint. Practise reading it instead of the digital clock.
 */
export const ExamWatch: React.FC<Props> = ({ budgetSec, leftSec, spentSec, totalOn, done, targetSec, running }) => {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);

  const d = new Date(now);
  const sec = d.getSeconds(), min = d.getMinutes() + sec / 60, hour = (d.getHours() % 12) + min / 60;
  const hasBudget = budgetSec > 0 && totalOn > 0;
  const endMs = now + leftSec * 1000;
  const startMs = endMs - budgetSec * 1000;
  const n = hasBudget ? (totalOn >= 9 ? 3 : totalOn >= 4 ? 2 : 1) : 0;
  const cps = Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    return { k, q: Math.round((totalOn * k) / n), at: startMs + (budgetSec * 1000 * k) / n };
  });
  const arc = hasBudget && budgetSec < 3600;
  let arcPath = '';
  if (arc) {
    const a0 = minuteDeg(startMs), a1 = minuteDeg(endMs);
    const [x0, y0] = pt(90, a0), [x1, y1] = pt(90, a1);
    const span = (a1 - a0 + 360) % 360;
    arcPath = `M ${x0} ${y0} A 90 90 0 ${span > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  }

  const expected = hasBudget && targetSec > 0 ? Math.min(totalOn, spentSec / targetSec) : 0;
  const diff = Math.round(done - expected);
  const next = cps.find((c) => done < c.q && c.at >= now) || null; // first checkpoint still ahead of you

  return (
    <div className="ck-watch">
      <svg viewBox="0 0 200 200" role="img" aria-label="ساعت عقربه‌ای">
        <circle cx="100" cy="100" r="97" fill="var(--field-bg, #fff)" stroke="currentColor" strokeWidth="3" />
        {arc && <path d={arcPath} fill="none" stroke="var(--ck-ok, #2e854b)" strokeWidth="6" strokeLinecap="round" opacity=".55" />}
        {Array.from({ length: 60 }, (_, i) => {
          const big = i % 5 === 0;
          const [x0, y0] = pt(big ? 78 : 83, i * 6), [x1, y1] = pt(86, i * 6);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="currentColor" strokeWidth={big ? 2.4 : 1} opacity={big ? 1 : 0.55} />;
        })}
        {Array.from({ length: 12 }, (_, i) => {
          const h = i + 1; const [x, y] = pt(66, h * 30);
          return <text key={h} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="700" fill="currentColor" style={{ fontFamily: 'Georgia, serif' }}>{h}</text>;
        })}
        {arc && cps.map((c) => { const [x, y] = pt(90, minuteDeg(c.at)); return <circle key={c.k} cx={x} cy={y} r="5" fill="var(--ck-bad, #b84339)" stroke="#fff" strokeWidth="1.5" />; })}
        <line x1="100" y1="100" x2={pt(46, hour * 30)[0]} y2={pt(46, hour * 30)[1]} stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <line x1="100" y1="100" x2={pt(72, min * 6)[0]} y2={pt(72, min * 6)[1]} stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <line x1={pt(-14, sec * 6)[0]} y1={pt(-14, sec * 6)[1]} x2={pt(80, sec * 6)[0]} y2={pt(80, sec * 6)[1]} stroke="var(--ck-bad, #b84339)" strokeWidth="1.4" />
        <circle cx="100" cy="100" r="4" fill="currentColor" />
      </svg>
      {hasBudget ? (
        <div className="info">
          <div className="row"><span>شروع (با این ساعت)</span><b dir="ltr">{hhmm(startMs)}</b></div>
          <div className="row"><span>پایان</span><b dir="ltr">{hhmm(endMs)}</b></div>
          {cps.map((c) => (
            <div key={c.k} className={'row cp' + (done >= c.q ? ' ok' : '')}>
              <span>{done >= c.q ? '✓' : '●'} ایستگاه {P(c.k)}: تا سؤال {P(c.q)}</span><b dir="ltr">{hhmm(c.at)}</b>
            </div>
          ))}
          {expected > 0 && (
            <p className={'fc ' + (diff >= 0 ? 'ok' : 'late')}>
              {diff === 0 ? 'دقیقاً روی برنامه‌ای.' : diff > 0 ? `${P(diff)} سؤال جلوتر از برنامه‌ای.` : `${P(-diff)} سؤال عقب‌تر از برنامه‌ای.`}
              {next && diff < 0 ? ` تا ساعت ${hhmm(next.at)} باید به سؤال ${P(next.q)} برسی.` : ''}
            </p>
          )}
          {!running && <p className="mut">زمان متوقف است؛ نشانه‌ها با ادامه‌ی زمان جابه‌جا می‌شوند.</p>}
        </div>
      ) : <p className="mut">برای نشان‌دادن بازه‌ی آزمون و ایستگاه‌ها روی ساعت، «زمان آزمون» بده.</p>}
    </div>
  );
};
