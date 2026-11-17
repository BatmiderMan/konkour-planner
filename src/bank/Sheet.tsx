/** The virtual answer sheet (پاسخ‌برگ): bubbles ①②③④, strike-out of options, «review later» flags, live counters, graded colours. */
import React, { useRef, useState } from 'react';
import { Flag, PenLine, Slash } from 'lucide-react';
import { toPersianDigits as P } from '../utils';

export interface SheetProps {
  labels: string[]; sub?: string[];
  picks: Record<string, number>; crossed: Record<string, number>; flags: Record<string, boolean>;
  onPick?: (i: number, v: number) => void; onCross?: (i: number, v: number) => void; onFlag?: (i: number) => void;
  keys?: number[];                                  // graded: the right option of each position
  active?: number; onJump?: (i: number) => void; overs?: Record<number, boolean>;
}
type Mode = 'fill' | 'cross';

const Bubble: React.FC<{ v: number; on: boolean; crossed: boolean; cls: string; disabled?: boolean; onFill: () => void; onCross: () => void }> = ({ v, on, crossed, cls, disabled, onFill, onCross }) => {
  const t = useRef<any>(0), fired = useRef(false);
  return (
    <button type="button" disabled={disabled} className={'bk-bub' + (on ? ' on' : '') + (crossed ? ' x' : '') + (cls ? ' ' + cls : '')} aria-pressed={on} aria-label={'گزینهٔ ' + v + (crossed ? ' (خط خورده)' : '')}
      onPointerDown={(e) => { if (e.pointerType === 'mouse') return; fired.current = false; t.current = setTimeout(() => { fired.current = true; onCross(); }, 480); }}
      onPointerUp={() => clearTimeout(t.current)} onPointerLeave={() => clearTimeout(t.current)} onPointerCancel={() => clearTimeout(t.current)}
      onClick={() => { if (fired.current) { fired.current = false; return; } onFill(); }} onContextMenu={(e) => { e.preventDefault(); onCross(); }}>{P(v)}</button>
  );
};

export const Sheet: React.FC<SheetProps> = ({ labels, sub, picks, crossed, flags, onPick, onCross, onFlag, keys, active, onJump, overs }) => {
  const [mode, setMode] = useState<Mode>('fill');
  const ro = !onPick;
  const answered = labels.filter((_, i) => picks[i]).length, fl = labels.filter((_, i) => flags[i]).length;
  return (
    <div className={'bk-sheet' + (keys ? ' graded' : '')}>
      <div className="bk-sheet-top">
        <b>{P(answered)} از {P(labels.length)} پاسخ داده شد</b>{fl > 0 && <span className="bk-pill">⚑ {P(fl)} علامت‌دار</span>}
        {!ro && <div className="bk-seg bk-seg-s" role="group" aria-label="حالت پاسخ‌برگ">
          <button type="button" className={mode === 'fill' ? 'on' : ''} onClick={() => setMode('fill')}><PenLine size={14} /> پر کردن</button>
          <button type="button" className={mode === 'cross' ? 'on' : ''} onClick={() => setMode('cross')}><Slash size={14} /> خط‌زدن گزینه</button>
        </div>}
        {!ro && <small className="bk-hint">نگه‌داشتن (یا راست‌کلیک) روی گزینه = خط‌زدن · دوباره زدن = برداشتن</small>}
      </div>
      <div className="bk-sheet-grid">
        {labels.map((lab, i) => {
          const pick = picks[i] || 0, mask = crossed[i] || 0, key = keys?.[i] || 0;
          const state = keys ? (pick === 0 ? 'blank' : pick === key ? 'ok' : 'bad') : '';
          return (
            <div key={i} className={'bk-srow' + (active === i ? ' cur' : '') + (overs?.[i] ? ' over' : '') + (i % 5 === 4 ? ' g5' : '') + (state ? ' ' + state : '')}>
              <button type="button" className={'bk-sno' + (flags[i] ? ' fl' : '')} onClick={() => onJump?.(i)} title={sub?.[i]}>{lab}</button>
              <span className="bk-bubs">
                {[1, 2, 3, 4].map((v) => (
                  <Bubble key={v} v={v} on={pick === v} crossed={!!(mask & (1 << v))} disabled={ro}
                    cls={keys ? (v === key ? 'right' : pick === v ? 'wrong' : '') : ''}
                    onFill={() => { if (mode === 'cross') onCross?.(i, v); else onPick?.(i, pick === v ? 0 : v); }}
                    onCross={() => onCross?.(i, v)} />
                ))}
              </span>
              {!ro && <button type="button" className={'bk-flag' + (flags[i] ? ' on' : '')} aria-label="علامت برای مرور" aria-pressed={!!flags[i]} onClick={() => onFlag?.(i)}><Flag size={14} /></button>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** keep picks/crossed/flags in one place (shared by the exam and the PDF answer sheet) */
export interface SheetState { picks: Record<string, number>; crossed: Record<string, number>; flags: Record<string, boolean> }
export const applyPick = (s: SheetState, i: number, v: number): SheetState => ({ ...s, picks: { ...s.picks, [i]: v }, crossed: v ? { ...s.crossed, [i]: (s.crossed[i] || 0) & ~(1 << v) } : s.crossed });
export const applyCross = (s: SheetState, i: number, v: number): SheetState => {
  const m = s.crossed[i] || 0, on = !(m & (1 << v));
  return { ...s, crossed: { ...s.crossed, [i]: on ? m | (1 << v) : m & ~(1 << v) }, picks: on && s.picks[i] === v ? { ...s.picks, [i]: 0 } : s.picks };
};
export const applyFlag = (s: SheetState, i: number): SheetState => ({ ...s, flags: { ...s.flags, [i]: !s.flags[i] } });
