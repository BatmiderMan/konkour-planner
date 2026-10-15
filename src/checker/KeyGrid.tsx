import React from 'react';
import { KeyMap } from './model';
import { toPersianDigits as P } from '../utils';

const PER = 216, ROWS = 36;

/** The keys, column by column like a book page. Tap a key to cycle 1→2→3→4. Red = not confirmed, yellow = changed by hand. */
export const KeyGrid: React.FC<{
  keys: KeyMap; ver: number; weak: Set<number>; edited: Set<number>; from: number;
  onFrom: (n: number) => void; onCycle: (n: number) => void; readOnly?: boolean;
}> = ({ keys, weak, edited, from, onFrom, onCycle, readOnly }) => {
  const cells: React.ReactNode[] = [];
  for (let n = from; n < from + PER; n++) {
    const has = keys.has(n);
    const cls = weak.has(n) ? 'low' : edited.has(n) ? 'ed' : '';
    cells.push(
      <button key={n} type="button" data-k={n} className={cls + (has ? '' : ' none')} disabled={readOnly} aria-label={`سؤال ${n}: ${has ? 'گزینه ' + keys.get(n) : 'بدون کلید'}`}>
        <span>{P(n)}</span><b>{has ? P(keys.get(n)!) : '–'}</b>
      </button>
    );
  }
  const r = keys.range();
  return (
    <div className="ck-grid-wrap">
      <div className="ck-grid-bar">
        <button type="button" className="ck-btn sm" onClick={() => onFrom(Math.max(1, from - PER))}>→ {P(PER)} قبلی</button>
        <label className="ck-inline">از سؤال
          <input type="number" min={1} value={from} onChange={(e) => onFrom(Math.max(1, parseInt(e.target.value, 10) || 1))} />
        </label>
        <button type="button" className="ck-btn sm" onClick={() => onFrom(from + PER)}>{P(PER)} بعدی ←</button>
        {r && <button type="button" className="ck-btn sm ghost" onClick={() => onFrom(r[0])}>برو به اولین کلید ({P(r[0])})</button>}
      </div>
      <div className="ck-grid" onClick={(e) => { const b = (e.target as HTMLElement).closest('button[data-k]'); if (b && !readOnly) onCycle(+b.getAttribute('data-k')!); }}>
        <div className="ck-kg" style={{ gridTemplateRows: `repeat(${ROWS}, auto)` }}>{cells}</div>
      </div>
    </div>
  );
};
