import React from 'react';
import { ChevronLeft, ChevronRight, Flag, Maximize2, Pause, PictureInPicture2, Play, Scale } from 'lucide-react';
import { Clock } from '../clock/Clock';
import { clock } from './format';
import { toPersianDigits as P } from '../utils';

export interface MiniProps {
  no: number; cur: string; answered: number; total: number; flagged: boolean; slow: boolean;
  curMs: number; mainSec: number; running: boolean; showClock: boolean; inPip: boolean; canPip: boolean; listening: boolean;
  onAnswer: (v: 1 | 2 | 3 | 4) => void; onBlank: () => void; onMove: (d: 1 | -1) => void; onFlag: () => void;
  onPause: () => void; onExpand: () => void; onPip: () => void; onFinish: () => void;
}

/** the one-line answer sheet: stays on top while the test itself is solved elsewhere (a PDF, a book on the screen). Same keys as the full room. */
export const MiniBar: React.FC<MiniProps> = (p) => (
  <div className={'ck-mini' + (p.inPip ? ' pip' : '')} dir="rtl" role="group" aria-label="پاسخ‌برگ کوچک">
    <span className={'lis' + (p.listening ? ' on' : '')} title={p.listening ? 'کلیدها فعال است' : 'کلیدها فقط در پنجره‌ای کار می‌کنند که انتخاب (فوکوس) شده؛ یک بار روی این نوار کلیک کنید'}><i />{p.listening ? 'کلید فعال' : 'کلیک کنید'}</span>
    <button type="button" className="mb ic" title="بازگشت به پاسخ‌برگ کامل" aria-label="پاسخ‌برگ کامل" onClick={p.onExpand}><Maximize2 size={15} /></button>
    <div className="qn">
      <button type="button" className="mb ic" aria-label="سؤال قبل" onClick={() => p.onMove(-1)}><ChevronRight size={16} /></button>
      <b title="شمارهٔ سؤال">{P(p.no)}</b>
      <button type="button" className="mb ic" aria-label="سؤال بعد" onClick={() => p.onMove(1)}><ChevronLeft size={16} /></button>
    </div>
    <div className="opts" dir="ltr">
      {([1, 2, 3, 4] as const).map((v) => <button key={v} type="button" className={'op' + (p.cur === String(v) ? ' on' : '')} aria-pressed={p.cur === String(v)} onClick={() => p.onAnswer(v)}>{P(v)}</button>)}
      <button type="button" className={'op blank' + (p.cur === '0' ? ' on' : '')} title="نزده (۰)" onClick={p.onBlank}>○</button>
    </div>
    <button type="button" className={'mb ic' + (p.flagged ? ' on' : '')} aria-pressed={p.flagged} title="نشان‌دار (F)" onClick={p.onFlag}><Flag size={15} /></button>
    <span className={'qt' + (p.slow ? ' slow' : '')} title="زمان روی این سؤال" dir="ltr">{P(clock(p.curMs))}</span>
    {p.showClock && <span className="ck" title="زمان پاسخ‌برگ" dir="ltr"><Clock sec={p.mainSec} running={p.running} /></span>}
    <button type="button" className="mb ic" title="توقف / ادامهٔ زمان (Space)" onClick={p.onPause}>{p.running ? <Pause size={15} /> : <Play size={15} />}</button>
    <span className="cnt">{P(p.answered)}/{P(p.total)}</span>
    {p.canPip && !p.inPip && <button type="button" className="mb ic" title="پنجرهٔ شناور روی همهٔ پنجره‌ها (برای حل از PDF)" onClick={p.onPip}><PictureInPicture2 size={15} /></button>}
    <button type="button" className="mb fin" title="پایان و تصحیح" onClick={p.onFinish}><Scale size={14} /> پایان</button>
  </div>
);
