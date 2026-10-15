import React from 'react';
import { toPersianDigits } from '../utils';
import { compareJalaliStrings } from '../jalali';
import { Exam, examPercent, hasData, isDone, percentOf, sectionCounts } from '../examStore';

const P = toPersianDigits;

export interface ExamRow {
  exam: Exam;
  done: boolean;
  pct: number | null;
  sections: { id: string; name: string; color: string; pct: number | null }[];
}

export const kindLabel = (k: Exam['kind']) => (k === 'real' ? 'واقعی' : 'شبیه‌سازی');
export const fmtPct = (p: number) => `${P(p % 1 === 0 ? p.toFixed(0) : p.toFixed(1))}٪`;
const tone = (p: number) => (p < 30 ? '#b14a42' : p < 60 ? '#d9a54b' : '#4c9b78');

// exams whose date falls inside [start, end] (jalali "YYYY/MM/DD"), oldest first
export function examsInPeriod(all: Exam[], start: string, end: string): ExamRow[] {
  if (!start || !end) return [];
  return all
    .filter((e) => e.date && compareJalaliStrings(e.date, start) >= 0 && compareJalaliStrings(e.date, end) <= 0)
    .sort((a, b) => compareJalaliStrings(a.date, b.date))
    .map((exam) => ({
      exam,
      done: isDone(exam),
      pct: examPercent(exam),
      sections: exam.sections.map((s) => {
        const r = sectionCounts(exam, s);
        return { id: s.id, name: s.name, color: s.color, pct: hasData(r) ? percentOf(r, exam.negative) : null };
      })
    }));
}

// small chips shown inside a day card of the daily report
export const DayExamStrip: React.FC<{ rows: ExamRow[] }> = ({ rows }) => {
  if (!rows.length) return null;
  return (
    <div className="report-day-exams">
      {rows.map((r) => (
        <span key={r.exam.id} className="report-exam-chip">
          <span aria-hidden>🏆</span>
          <b>{r.exam.title || 'آزمون'}</b>
          <span className="rec-kind">{kindLabel(r.exam.kind)}</span>
          {r.pct !== null
            ? <span className="rec-pct" style={{ color: tone(r.pct) }}>{fmtPct(r.pct)}</span>
            : <span className="rec-pending">نتیجه ثبت نشده</span>}
        </span>
      ))}
    </div>
  );
};

const TrendChart: React.FC<{ rows: ExamRow[] }> = ({ rows }) => {
  const pts = rows.filter((r) => r.pct !== null);
  if (pts.length < 2) return null;
  const W = Math.max(500, pts.length * 70), H = 150;
  const lo = Math.min(0, ...pts.map((r) => r.pct as number));
  const hi = Math.max(100, ...pts.map((r) => r.pct as number));
  const step = (W - 70) / pts.length;
  const xy = pts.map((r, i) => ({ x: 55 + i * step + step / 2, y: 20 + (1 - ((r.pct as number) - lo) / (hi - lo)) * (H - 40), r }));
  return (
    <svg viewBox={`0 0 ${W} ${H + 40}`} className="analytics-svg-chart">
      {[0, 25, 50, 75, 100].map((v) => {
        const y = 20 + (1 - (v - lo) / (hi - lo)) * (H - 40);
        return (
          <g key={v}>
            <line x1="45" y1={y} x2={W - 10} y2={y} stroke="#e4d7be" strokeDasharray="3 3" />
            <text x="40" y={y + 4} textAnchor="end" fontSize="10" fill="#706249" fontFamily="Vazirmatn, Tahoma">{P(v)}٪</text>
          </g>
        );
      })}
      <path d={xy.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#375f8a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {xy.map((p) => (
        <g key={p.r.exam.id}>
          <circle cx={p.x} cy={p.y} r="5" fill={tone(p.r.pct as number)} stroke="#fff" strokeWidth="2" />
          <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#2b2319" fontFamily="Vazirmatn, Tahoma">{fmtPct(p.r.pct as number)}</text>
          <text x={p.x} y={H + 15} textAnchor="middle" fontSize="9" fontWeight="600" fill="#2b2319" fontFamily="Vazirmatn, Tahoma">{(p.r.exam.title || 'آزمون').slice(0, 10)}</text>
          <text x={p.x} y={H + 28} textAnchor="middle" fontSize="8" fill="#706249" fontFamily="Vazirmatn, Tahoma">{P(p.r.exam.date.slice(5))}</text>
        </g>
      ))}
    </svg>
  );
};

// the dedicated exam page of the period report
export const ExamReportPage: React.FC<{ rows: ExamRow[]; start: string; end: string; pageNo: number; pageTotal: number }> = ({ rows, start, end, pageNo, pageTotal }) => {
  const finished = rows.filter((r) => r.pct !== null);
  const pcts = finished.map((r) => r.pct as number);
  const avg = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null;
  const best = pcts.length ? Math.max(...pcts) : null;
  const delta = pcts.length >= 2 ? Math.round((pcts[pcts.length - 1] - pcts[0]) * 10) / 10 : null;

  // average per section across the period
  const secMap: Record<string, { color: string; v: number[] }> = {};
  finished.forEach((r) => r.sections.forEach((s) => {
    if (s.pct === null) return;
    (secMap[s.name] = secMap[s.name] || { color: s.color, v: [] }).v.push(s.pct);
  }));
  const secAvg = Object.entries(secMap)
    .map(([name, s]) => ({ name, color: s.color, p: Math.round((s.v.reduce((a, b) => a + b, 0) / s.v.length) * 10) / 10 }))
    .sort((a, b) => a.p - b.p);

  return (
    <div className="report-print-page report-exam-page">
      <div className="report-page-header">
        <div className="report-page-title">
          <h3>🏆 آزمون‌های دوره</h3>
          <div className="report-period-info">
            <span>بازه گزارش: از <b>{P(start)}</b> تا <b>{P(end)}</b></span>
          </div>
        </div>
        <div className="report-page-num">صفحه {P(pageNo)} از {P(pageTotal)}</div>
      </div>

      <div className="report-kpi-grid">
        <div className="report-kpi-card"><span className="kpi-label">تعداد آزمون</span><span className="kpi-value">{P(rows.length)} آزمون</span></div>
        <div className="report-kpi-card"><span className="kpi-label">میانگین درصد</span><span className="kpi-value">{avg !== null ? fmtPct(avg) : '–'}</span></div>
        <div className="report-kpi-card"><span className="kpi-label">بهترین درصد</span><span className="kpi-value">{best !== null ? fmtPct(best) : '–'}</span></div>
        <div className="report-kpi-card"><span className="kpi-label">تغییر از اولین به آخرین</span><span className="kpi-value" style={delta !== null ? { color: delta >= 0 ? '#2f7d5b' : '#b14a42' } : undefined}>{delta !== null ? `${delta > 0 ? '+' : ''}${P(delta)}٪` : '–'}</span></div>
      </div>

      <div className="report-exam-table-wrap">
        <table className="report-exam-table">
          <thead>
            <tr><th>تاریخ</th><th>آزمون</th><th>درصد دروس</th><th>کل</th><th>رتبه / تراز</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.exam.id}>
                <td className="ret-date">{P(r.exam.date)}{r.exam.time ? <small>{P(r.exam.time)}</small> : null}</td>
                <td>
                  <strong>{r.exam.title || 'آزمون'}</strong>
                  <small>{kindLabel(r.exam.kind)}{r.exam.negative ? ' • با نمره منفی' : ''}</small>
                  {r.exam.notes ? <small className="ret-notes">{r.exam.notes}</small> : null}
                </td>
                <td>
                  {r.sections.some((s) => s.pct !== null)
                    ? r.sections.filter((s) => s.pct !== null).map((s) => (
                      <span key={s.id} className="ret-sec" style={{ borderColor: s.color }}>
                        <i style={{ background: s.color }} />{s.name} {fmtPct(s.pct as number)}
                      </span>
                    ))
                    : <span className="rec-pending">{r.done ? '-' : 'هنوز برگزار نشده / نتیجه ثبت نشده'}</span>}
                </td>
                <td className="ret-total">{r.pct !== null ? <b style={{ color: tone(r.pct) }}>{fmtPct(r.pct)}</b> : '–'}</td>
                <td>{[r.exam.rank && `رتبه ${P(r.exam.rank)}`, r.exam.level && `تراز ${P(r.exam.level)}`].filter(Boolean).join(' • ') || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {finished.length >= 2 && (
        <div className="report-chart-section">
          <h4 className="chart-title">📈 روند درصد آزمون‌ها</h4>
          <div className="chart-wrapper"><TrendChart rows={rows} /></div>
        </div>
      )}

      {secAvg.length > 0 && (
        <div className="report-chart-section">
          <h4 className="chart-title">📚 میانگین درصد هر درس در این دوره (ضعیف‌ترین بالا)</h4>
          <div className="report-sec-bars">
            {secAvg.map((s) => (
              <div key={s.name} className="rsb-row">
                <span className="rsb-name">{s.name}</span>
                <span className="rsb-track"><span className="rsb-fill" style={{ width: `${Math.max(2, Math.min(100, s.p))}%`, background: s.color }} /></span>
                <span className="rsb-val">{fmtPct(s.p)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
