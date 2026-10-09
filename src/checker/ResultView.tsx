import React, { useState } from 'react';
import { Grade, ScanRecord } from './model';
import { toPersianDigits as P } from '../utils';

const LBL: Record<string, string> = { ok: 'درست', bad: 'غلط', blank: 'نزده', dbl: 'دو علامت', nokey: 'بدون کلید' };
const penaltyText = (p: number) => (p ? `با نمره‌ی منفی ${P('۱/' + p)}` : 'بدون نمره‌ی منفی');

/** Score, answer-sheet-like bubble map, and the list of questions. With `onPick` the answers can be corrected by tapping. */
export const ResultView: React.FC<{ grade: Grade; penalty: number; onPick?: (q: number, o: number) => void }> = ({ grade: g, penalty, onPick }) => {
  const [filter, setFilter] = useState<'all' | 'bad' | 'blank' | 'dbl'>('bad');
  const counts = { all: g.rows.length, bad: g.wrong, blank: g.blank, dbl: g.double };
  const rows = g.rows.filter((x) => filter === 'all' || x.st === filter);
  const jump = (q: number) => { setFilter('all'); setTimeout(() => document.getElementById('ckq' + q)?.scrollIntoView({ block: 'center' }), 30); };
  return (
    <>
      <section className="ck-card ck-hero">
        <div className="ck-score"><b>{P(g.pct)}٪</b><span>درصد {penaltyText(penalty)}</span></div>
        <div className="ck-stats">
          <div className="ok"><b>{P(g.correct)}</b><span>درست</span></div>
          <div className="bad"><b>{P(g.wrong)}</b><span>غلط</span></div>
          <div className="blank"><b>{P(g.blank)}</b><span>نزده</span></div>
          {g.double > 0 && <div className="dbl"><b>{P(g.double)}</b><span>دو علامت</span></div>}
        </div>
        <div className="ck-map" aria-label="نقشه‌ی پاسخ‌ها">
          {g.rows.map((x) => <i key={x.q} className={'st-' + x.st} title={`سؤال ${x.bq}: ${LBL[x.st]}`} onClick={() => jump(x.q)}>{P(x.q)}</i>)}
        </div>
      </section>
      <section className="ck-card">
        <div className="ck-chips">
          {([['bad', 'غلط'], ['blank', 'نزده'], ['dbl', 'دو علامت'], ['all', 'همه']] as const).map(([k, t]) =>
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{t} {P(counts[k])}</button>)}
        </div>
        <div className="ck-legend"><span className="m">پاسخ تو</span><span className="r">درست</span><span className="w">غلط</span><span className="k">کلید درست</span></div>
        <div className="ck-list">
          {rows.map((x) => (
            <div key={x.q} id={'ckq' + x.q} className={'ck-q s-' + x.st}>
              <div className="ck-qid">{P(x.bq)}<small>پاسخ‌برگ {P(x.q)}</small></div>
              <div className="ck-opts">
                {[1, 2, 3, 4].map((o) => {
                  const cls = ['ck-opt'];
                  if (x.mine === o && !x.dbl) { cls.push('mine'); if (x.key !== undefined) cls.push(x.key === o ? 'right' : 'wrong'); }
                  if (x.key === o && x.st !== 'ok') cls.push('key');
                  return <button key={o} type="button" className={cls.join(' ')} disabled={!onPick} aria-label={`سؤال ${x.bq} گزینه ${o}`} onClick={() => onPick && onPick(x.q, o)}>{P(o)}</button>;
                })}
              </div>
              <div className="ck-qst">{LBL[x.st]}{x.edited ? ' (اصلاح‌شده)' : ''}</div>
            </div>
          ))}
          {rows.length === 0 && <div className="ck-empty flat">{filter === 'all' ? 'سؤالی نیست.' : 'در این گروه چیزی نیست. آفرین!'}</div>}
        </div>
      </section>
    </>
  );
};

/** Saved scan: only what was not answered correctly, with the right key next to it. */
export const MissList: React.FC<{ rec: ScanRecord }> = ({ rec }) => {
  if (!rec.miss.length) return <div className="ck-empty flat">همه‌ی سؤال‌ها درست بود.</div>;
  return (
    <div className="ck-miss">
      {rec.miss.map(([bq, mine, key]) => (
        <div key={bq} className={'ck-mrow ' + (mine === 0 ? 'blank' : mine === 5 ? 'dbl' : 'bad')}>
          <b>{P(bq)}</b>
          <span>{mine === 0 ? 'نزده' : mine === 5 ? 'دو علامت' : <>پاسخ تو {P(mine)}</>}</span>
          <em>{key ? <>کلید {P(key)}</> : 'بدون کلید'}</em>
        </div>
      ))}
    </div>
  );
};
