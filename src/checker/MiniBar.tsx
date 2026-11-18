import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, GripHorizontal, Maximize2, Pause, PictureInPicture2, Play, Scale, Timer } from 'lucide-react';
import { Clock } from '../clock/Clock';
import { clock } from './format';
import { toPersianDigits as P } from '../utils';

export interface MiniProps {
  no: number; cur: string; answered: number; total: number; flagged: boolean; slow: boolean;
  curMs: number; mainSec: number; running: boolean; showClock: boolean; inPip: boolean; canPip: boolean; listening: boolean;
  onAnswer: (v: 1 | 2 | 3 | 4) => void; onBlank: () => void; onMove: (d: 1 | -1) => void; onFlag: () => void;
  onPause: () => void; onExpand: () => void; onPip: () => void; onFinish: () => void;
}

/**
 * The floating mini answer sheet: a small glass card that stays on top while the test itself is solved elsewhere
 * (a PDF, a book on the screen). Same keys as the full room (1-4, 0, arrows, F, Space).
 * It fills whatever window it lives in - the Document Picture-in-Picture window or the draggable in-page card.
 */
export const MiniBar: React.FC<MiniProps> = (p) => {
  const pct = p.total > 0 ? Math.min(100, Math.round((p.answered / p.total) * 100)) : 0;
  return (
    <div className={'fm ck-mini' + (p.inPip ? ' pip' : '') + (p.listening ? '' : ' deaf') + (p.running ? '' : ' paused')} dir="rtl" role="group" aria-label="پاسخ‌برگ کوچک">
      <div className="fm-top" data-drag={p.inPip ? undefined : '1'}>
        {!p.inPip && <span className="fm-grip" aria-hidden="true"><GripHorizontal size={16} /></span>}
        <span className={'fm-lis' + (p.listening ? ' on' : '')} title={p.listening ? 'کلیدها فعال است' : 'کلیدها فقط در پنجره‌ای کار می‌کنند که انتخاب (فوکوس) شده؛ یک بار روی این کارت کلیک کنید'}>
          <i />{p.listening ? 'کلید فعال' : 'کلیک کنید'}
        </span>
        <span className="fm-sp" />
        {p.showClock && <span className="fm-clk" title="زمان پاسخ‌برگ" dir="ltr"><Clock sec={p.mainSec} running={p.running} /></span>}
        {p.canPip && !p.inPip && <button type="button" className="fm-ic" title="پنجرهٔ شناور روی همهٔ پنجره‌ها (برای حل از PDF)" aria-label="پنجرهٔ شناور" onClick={p.onPip}><PictureInPicture2 size={16} /></button>}
        <button type="button" className="fm-ic" title="بازگشت به پاسخ‌برگ کامل" aria-label="پاسخ‌برگ کامل" onClick={p.onExpand}><Maximize2 size={16} /></button>
      </div>

      <div className="fm-main">
        <div className="fm-qn">
          <button type="button" className="fm-nav" aria-label="سؤال قبل" onClick={() => p.onMove(-1)}><ChevronRight size={20} /></button>
          <div className="fm-no" title="شمارهٔ سؤال"><small>سؤال</small><b>{P(p.no)}</b></div>
          <button type="button" className="fm-nav" aria-label="سؤال بعد" onClick={() => p.onMove(1)}><ChevronLeft size={20} /></button>
        </div>
        <div className="fm-opts" dir="ltr">
          {([1, 2, 3, 4] as const).map((v) => (
            <button key={v} type="button" className={'fm-op' + (p.cur === String(v) ? ' on' : '')} aria-pressed={p.cur === String(v)} onClick={() => p.onAnswer(v)}>{P(v)}</button>
          ))}
          <button type="button" className={'fm-op blank' + (p.cur === '0' ? ' on' : '')} title="نزده (۰)" aria-label="نزده" onClick={p.onBlank}>○</button>
        </div>
      </div>

      <div className="fm-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.answered}><i style={{ width: pct + '%' }} /></div>

      <div className="fm-foot">
        <span className={'fm-qt' + (p.slow ? ' slow' : '')} title="زمان روی این سؤال" dir="ltr"><Timer size={13} />{P(clock(p.curMs))}</span>
        <span className="fm-cnt" title="پاسخ داده‌شده"><b>{P(p.answered)}</b>/{P(p.total)}</span>
        <span className="fm-sp" />
        <button type="button" className="fm-ic sm" title="توقف / ادامهٔ زمان (Space)" aria-label="توقف / ادامه" onClick={p.onPause}>{p.running ? <Pause size={15} /> : <Play size={15} />}</button>
        <button type="button" className={'fm-ic sm' + (p.flagged ? ' on' : '')} aria-pressed={p.flagged} title="نشان‌دار (F)" aria-label="نشان‌دار" onClick={p.onFlag}><Flag size={15} /></button>
        <button type="button" className="fm-fin" title="پایان و تصحیح" onClick={p.onFinish}><Scale size={15} /> پایان</button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ in-page floating card: draggable, remembers where it was left */
const POS_KEY = 'planex_vs_mini_pos';
const loadPos = (): { x: number; y: number } | null => { try { const o = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); return o && isFinite(o.x) && isFinite(o.y) ? o : null; } catch { return null; } };

export const MiniFloat: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(loadPos);
  const [drag, setDrag] = useState(false);
  const clamp = useCallback((x: number, y: number) => {
    const el = ref.current, w = el ? el.offsetWidth : 360, h = el ? el.offsetHeight : 170;
    return { x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - w - 8)), y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - h - 8)) };
  }, []);
  useEffect(() => { // keep it on screen when the window shrinks
    const f = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener('resize', f); return () => window.removeEventListener('resize', f);
  }, [clamp]);
  const down = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (!t.closest('[data-drag="1"]') || t.closest('button')) return;
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    let last = { x: r.left, y: r.top };
    setDrag(true); e.preventDefault();
    const move = (ev: PointerEvent) => { last = clamp(ev.clientX - dx, ev.clientY - dy); setPos(last); };
    const up = () => {
      setDrag(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      try { localStorage.setItem(POS_KEY, JSON.stringify(last)); } catch { /* ignore */ }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  return (
    <div ref={ref} className={'fm-float' + (drag ? ' drag' : '') + (pos ? '' : ' home')} style={pos ? { left: pos.x, top: pos.y } : undefined} onPointerDown={down}>
      {children}
    </div>
  );
};
