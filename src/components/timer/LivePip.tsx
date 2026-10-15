import React from 'react';
import { Pause, Play } from 'lucide-react';
import { toPersianDigits } from '../../utils';
import { liveColor, liveElapsedMs, liveKind, liveTotalPlannedSeconds, pauseLivePlan, resumeLivePlan, useLivePlan } from '../../livePlan';
import { useTickPrefs } from '../../tickSound';
import { dialModel, fmtClock } from './timerMath';

// ---------- always-on-top mini window (Document Picture-in-Picture) ----------
export const pipSupported = (): boolean => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

// copies the app's CSS + theme into the separate window so it looks the same
export function preparePipWindow(w: Window) {
  const doc = w.document;
  const root = document.documentElement;
  doc.documentElement.dir = root.dir || 'rtl';
  doc.documentElement.lang = root.lang || 'fa';
  doc.documentElement.className = root.className;
  Array.from(root.attributes).forEach((a) => { if (a.name.startsWith('data-')) doc.documentElement.setAttribute(a.name, a.value); });
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      const el = doc.createElement('style');
      el.textContent = css;
      doc.head.appendChild(el);
    } catch {
      if (sheet.href) {
        const l = doc.createElement('link');
        l.rel = 'stylesheet';
        l.href = sheet.href;
        doc.head.appendChild(l);
      }
    }
  });
  doc.body.style.margin = '0';
  doc.body.style.fontFamily = getComputedStyle(document.body).fontFamily;
}

// Has its own clock driven by the mini window, so it keeps updating every second
// even when the main tab is in the background.
export const PipTimer: React.FC<{ win: Window }> = ({ win }) => {
  const live = useLivePlan();
  const tick = useTickPrefs();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = win.setInterval(() => setNow(Date.now()), 250);
    return () => win.clearInterval(id);
  }, [win]);
  if (!live) return null;

  const kind = liveKind(live);
  const isBreak = kind === 'break';
  const elapsed = Math.floor(liveElapsedMs(live, now) / 1000);
  const total = liveTotalPlannedSeconds(live);
  const tickOn = tick.on && !isBreak;
  const m = dialModel(elapsed, total, tickOn, tick.seconds, isBreak);
  const passed = tickOn ? Math.floor(elapsed / tick.seconds) : 0;
  const left = tickOn && total > 0 && !m.over ? Math.floor((total - elapsed) / tick.seconds) : 0;
  const nextIn = tickOn ? tick.seconds - (elapsed % tick.seconds) : 0;

  return (
    <div className={`tm-pip ph-${m.phase}` + (live.running ? '' : ' paused')} style={{ ['--c' as any]: liveColor(live) }}>
      <div className="tm-pip-top">
        <span className="tm-pip-name">{live.item.subject}</span>
        <button type="button" className="tm-pip-toggle" onClick={() => (live.running ? pauseLivePlan() : resumeLivePlan())} aria-label={live.running ? 'توقف موقت' : 'ادامه'}>
          {live.running ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>
      <div className="tm-pip-time">{m.over ? '+' : ''}{toPersianDigits(fmtClock(m.shown))}</div>
      <div className="tm-pip-bar"><i style={{ width: m.progress * 100 + '%' }} /></div>
      {tickOn ? (
        <div className="tm-pip-ticks">
          <span><b>{toPersianDigits(passed)}</b>تیک گذشته</span>
          {total > 0 && <span><b>{toPersianDigits(left)}</b>تیک مانده</span>}
          <span><b>{live.running ? toPersianDigits(nextIn) : '—'}</b>ثانیه تا تیک</span>
        </div>
      ) : (
        <div className="tm-pip-ticks off">{isBreak ? 'وقت استراحت' : 'صدای تیک خاموش است'}</div>
      )}
    </div>
  );
};
