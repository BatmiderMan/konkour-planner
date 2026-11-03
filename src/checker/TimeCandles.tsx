import React, { useMemo, useState } from 'react';
import { GradedRow } from './model';
import { clock } from './format';
import { toPersianDigits as P } from '../utils';

const LBL: Record<string, string> = { ok: 'درست', bad: 'غلط', blank: 'نزده', dbl: 'دو علامت', nokey: 'بدون کلید' };
const mmss = (sec: number) => P(clock(Math.round(sec) * 1000));

/**
 * «زمان صرف‌شده برای هر سؤال»: one candle per question, left to right.
 * Height = time spent, colour = result (green right, red wrong, yellow left empty). Hover / tap a candle for the exact time.
 * Below the chart: what the time says about efficiency (where the minutes went, rushed mistakes, expensive hits).
 */
export const TimeCandles: React.FC<{ rows: GradedRow[]; times: number[]; title?: string }> = ({ rows, times, title }) => {
  const [hot, setHot] = useState<number | null>(null);
  const data = useMemo(() => rows.map((r) => ({ r, t: Math.max(0, (times[r.q - 1] || 0)) })), [rows, times]);
  const stats = useMemo(() => {
    const total = data.reduce((a, d) => a + d.t, 0);
    const seen = data.filter((d) => d.t > 0);
    const avg = seen.length ? total / seen.length : 0;
    const max = data.reduce((a, d) => Math.max(a, d.t), 0);
    const sum = (st: string[]) => data.filter((d) => st.includes(d.r.st)).reduce((a, d) => a + d.t, 0);
    const cntOf = (st: string[]) => data.filter((d) => st.includes(d.r.st)).length;
    const okT = sum(['ok']), badT = sum(['bad', 'dbl']), blankT = sum(['blank']);
    const avgOf = (t: number, n: number) => (n ? t / n : 0);
    const sinks = data.filter((d) => d.r.st === 'bad' || d.r.st === 'blank' || d.r.st === 'dbl').sort((a, b) => b.t - a.t).slice(0, 3).filter((d) => d.t > 0);
    const rushed = data.filter((d) => d.r.st === 'bad' && d.t > 0 && d.t < avg * 0.5).length;
    const costly = data.filter((d) => d.r.st === 'ok' && d.t > avg * 2).length;
    return { total, avg, max, okT, badT, blankT, okAvg: avgOf(okT, cntOf(['ok'])), badAvg: avgOf(badT, cntOf(['bad', 'dbl'])), blankAvg: avgOf(blankT, cntOf(['blank'])), sinks, rushed, costly };
  }, [data]);
  if (!data.length || stats.max <= 0) return null;

  const n = data.length;
  const labelEvery = n <= 40 ? 1 : n <= 80 ? 2 : 5;
  const pctOf = (x: number) => (stats.total ? Math.round((x / stats.total) * 100) : 0);
  const h = hot !== null ? data[hot] : null;

  return (
    <section className="ck-card ck-cd" aria-label="زمان هر سؤال">
      <div className="ck-cd-head">
        <div className="t">
          <h3>زمان صرف‌شده برای هر سؤال</h3>
          <p>هر ستون یک سؤال است (از چپ به راست)؛ ارتفاع = زمان و رنگ = نتیجه. نشانگر را روی هر ستون ببر.</p>
        </div>
        <div className="ck-cd-legend"><span className="ok">درست</span><span className="bad">غلط</span><span className="blank">نزده</span></div>
      </div>
      <div className="ck-cd-box">
        <div className="ck-cd-top">
          <span className="name">{title || 'آزمون'} <em>{P(n)} سؤال</em></span>
          <span className="meta">میانگین {mmss(stats.avg)} - بیشترین {mmss(stats.max)}</span>
        </div>
        <div className="ck-cd-scroll">
          <div className="ck-cd-plot" dir="ltr" style={{ minWidth: Math.max(0, n * 20) }} onMouseLeave={() => setHot(null)}>
            <i className="avg" style={{ bottom: `calc(${(stats.avg / stats.max) * 100}% * 0.86 + 26px)` }} title={`میانگین ${mmss(stats.avg)}`} />
            {data.map((d, i) => (
              <div
                key={d.r.q}
                className={'col st-' + d.r.st + (hot === i ? ' hot' : '') + (i < 3 ? ' edge-l' : n - i <= 3 ? ' edge-r' : '')}
                onMouseEnter={() => setHot(i)}
                onClick={() => setHot(hot === i ? null : i)}
                role="img"
                aria-label={`سؤال ${d.r.bq}، ${LBL[d.r.st]}، ${mmss(d.t)}`}
              >
                <span className="bar" style={{ height: `${Math.max(d.t > 0 ? 5 : 2, (d.t / stats.max) * 100)}%` }} />
                <span className="no">{i % labelEvery === 0 ? P(d.r.bq) : ''}</span>
                {hot === i && h && (
                  <span className="tip" role="tooltip">
                    <b>سؤال {P(h.r.bq)}</b>
                    <em className={'s-' + h.r.st}>{LBL[h.r.st]}</em>
                    <span><small>زمان شما</small><strong>{mmss(h.t)}</strong></span>
                    {h.r.key !== undefined && h.r.st !== 'ok' && <span><small>پاسخ تو / کلید</small><strong>{h.r.mine ? P(h.r.mine) : '—'} / {P(h.r.key)}</strong></span>}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ck-cd-ins">
        <div className="c"><small>زمان کل روی سؤال‌ها</small><b>{mmss(stats.total)}</b></div>
        <div className="c ok"><small>میانگین هر درست</small><b>{mmss(stats.okAvg)}</b></div>
        <div className="c bad"><small>میانگین هر غلط</small><b>{mmss(stats.badAvg)}</b></div>
        <div className="c blank"><small>میانگین هر نزده</small><b>{mmss(stats.blankAvg)}</b></div>
      </div>
      <ul className="ck-cd-notes">
        <li>زمان روی <b>غلط‌ها</b> {P(pctOf(stats.badT))}٪ و روی <b>نزده‌ها</b> {P(pctOf(stats.blankT))}٪ از کل وقتت بود{pctOf(stats.badT + stats.blankT) >= 40 ? ' — تقریباً نیمی از وقت بدون نتیجه رفته.' : '.'}</li>
        {stats.sinks.length > 0 && <li>وقت‌گیرترین سؤال‌های بی‌نتیجه: {stats.sinks.map((d, i) => <span key={d.r.q}>{i ? '، ' : ''}<b>{P(d.r.bq)}</b> ({mmss(d.t)}، {LBL[d.r.st]})</span>)}</li>}
        {stats.rushed > 0 && <li><b>{P(stats.rushed)}</b> غلطِ عجله‌ای داشتی (کمتر از نصف میانگین زمان) — این‌ها معمولاً با کمی دقت درست می‌شدند.</li>}
        {stats.costly > 0 && <li><b>{P(stats.costly)}</b> سؤال درست بیش از دو برابر میانگین وقت گرفت؛ ببین می‌شد سریع‌تر حلشان کرد.</li>}
      </ul>
    </section>
  );
};
