import React from 'react';
import { Pause, Play, X } from 'lucide-react';
import {
  getLivePlan, liveColor, liveElapsedMs, liveKind, liveTotalPlannedSeconds, pauseLivePlan, resumeLivePlan, useLivePlan
} from '../../livePlan';
import { haptic, openLiveTimer } from '../../focusBus';
import { toPersianDigits } from '../../utils';
import './welcome.css';

const mins = (ms: number) => Math.floor(ms / 60000);

/** shown once after the app (re)opens while a study session still exists */
export const WelcomeBack: React.FC = () => {
  const live = useLivePlan();
  const [open, setOpen] = React.useState<boolean>(() => !!getLivePlan());
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!open) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const hide = setTimeout(() => setOpen(false), 30000);
    return () => { clearInterval(tick); clearTimeout(hide); };
  }, [open]);
  React.useEffect(() => { if (open && !live) setOpen(false); }, [open, live]);
  if (!open || !live) return null;

  const kind = liveKind(live);
  const elapsed = mins(liveElapsedMs(live, now));
  const total = Math.round(liveTotalPlannedSeconds(live) / 60);
  const what = kind === 'break' ? 'استراحتت' : `مطالعه‌ی «${live.item.subject}»`;
  const status = live.running ? `${toPersianDigits(elapsed)} دقیقه گذشته${total ? ` از ${toPersianDigits(total)}` : ''}` : `متوقف شده روی دقیقه‌ی ${toPersianDigits(elapsed)}`;
  const close = () => setOpen(false);

  return (
    <div className="wb" role="status" aria-live="polite" style={{ ['--wb' as any]: kind === 'break' ? '#8ff0b4' : liveColor(live) } as React.CSSProperties}>
      <span className="wb-dot" aria-hidden="true" />
      <div className="wb-txt">
        <b>خوش برگشتی!</b>
        <span>{what} هنوز باز است · {status}</span>
      </div>
      <button type="button" className="wb-go" onClick={() => { haptic(12); openLiveTimer(); close(); }}>باز کردن</button>
      <button type="button" className="wb-ic" onClick={() => { haptic(10); if (live.running) pauseLivePlan(); else resumeLivePlan(); }} aria-label={live.running ? 'توقف' : 'ادامه'}>
        {live.running ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button type="button" className="wb-ic" onClick={close} aria-label="بستن"><X size={16} /></button>
    </div>
  );
};
