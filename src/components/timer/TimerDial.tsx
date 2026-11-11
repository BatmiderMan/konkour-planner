import React from 'react';
import { DialModel } from './timerMath';
import { MotionMode } from './timerLook';

export type DialVariant = 'dial' | 'ring' | 'orbit' | 'digits' | 'minimal';

interface TimerDialProps {
  model: DialModel;
  running: boolean;
  tickKey: number; // changes with every tick -> restarts the flash
  tickOn: boolean;
  children?: React.ReactNode; // the centre of the dial
  variant?: DialVariant; // classic dial · plain ring · orbit · big digits with segments · minimal (digits + hairline)
  marks?: boolean; // dial: outer notches
  inner?: boolean; // dial: inner "until the next tick" ring
  motion?: MotionMode; // 'smooth' glides between seconds, 'step' jumps once per second
}

const R_MAIN = 128;
const R_CYCLE = 108;

/** the outer notches only re-render when one lights up (not every second) */
const Notches = React.memo(({ notches, lit, running }: { notches: number; lit: number; running: boolean }) => {
  const w = notches > 60 ? 1.6 : notches > 30 ? 2.2 : 3;
  return (
    <g className="tm-notches">
      {Array.from({ length: notches }, (_, i) => (
        <line key={i} className={i < lit ? 'on' : i === lit && running ? 'now' : ''} x1="0" y1="-147" x2="0" y2="-158" strokeWidth={w} transform={`rotate(${(i / notches) * 360})`} />
      ))}
    </g>
  );
});
Notches.displayName = 'Notches';

/** the segment row of the big-digits style */
const Segments = React.memo(({ notches, lit, running }: { notches: number; lit: number; running: boolean }) => (
  <div className="tm-bar" aria-hidden="true">
    {Array.from({ length: notches }, (_, i) => <i key={i} className={i < lit ? 'on' : i === lit && running ? 'now' : ''} />)}
  </div>
));
Segments.displayName = 'Segments';

export const TimerDial: React.FC<TimerDialProps> = ({ model, running, tickKey, tickOn, children, variant = 'dial', marks = true, inner = true, motion = 'smooth' }) => {
  const gid = React.useId().replace(/:/g, '');
  const { notches, lit, progress, cycle, phase } = model;

  // when the progress wraps (stopwatch passes an hour) the arc must jump back, not sweep backwards
  const prev = React.useRef(progress);
  const snap = progress < prev.current - 0.3;
  React.useEffect(() => { prev.current = progress; });

  // the second hand of the orbit style is a pure-CSS 60 s rotation, started at the right angle once
  const sweep0 = React.useRef(-(model.elapsed % 60) * 1000);
  const cls = `tm-dial v-${variant} ph-${phase} m-${motion}` + (running ? ' running' : ' idle') + (snap ? ' snap' : '');

  if (variant === 'digits' || variant === 'minimal') {
    const seg = variant === 'digits' && notches > 0 && notches <= 60;
    return (
      <div className={cls + (variant === 'minimal' ? ' v-digits' : '')}>
        <div className="tm-dial-center">{children}</div>
        {seg ? <Segments notches={notches} lit={lit} running={running} /> : (
          <div className={'tm-bar cont' + (variant === 'minimal' ? ' hair' : '')} aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, progress)})` }} /></div>
        )}
      </div>
    );
  }

  const full = variant === 'dial';
  const orbit = variant === 'orbit';
  const dash = { strokeDasharray: 100, strokeDashoffset: 100 - Math.min(1, progress) * 100 };
  return (
    <div className={cls}>
      <svg viewBox="-170 -170 340 340" aria-hidden="true">
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--tm-a)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--tm-b)' }} />
          </linearGradient>
        </defs>

        {full && marks && <Notches notches={notches} lit={lit} running={running} />}
        {full && <circle className="tm-face" r={96} />}

        <circle className="tm-track" r={R_MAIN} />
        {/* soft glow without any SVG filter: two wider, fainter copies of the arc (filters repaint every second) */}
        {!orbit && <circle className="tm-arc-halo h2" r={R_MAIN} pathLength={100} style={dash} transform="rotate(-90)" stroke={`url(#g${gid})`} />}
        {!orbit && <circle className="tm-arc-halo h1" r={R_MAIN} pathLength={100} style={dash} transform="rotate(-90)" stroke={`url(#g${gid})`} />}
        <circle className="tm-arc" r={R_MAIN} pathLength={100} stroke={`url(#g${gid})`} style={dash} transform="rotate(-90)" />

        {/* the head rides the arc on a real circle (a rotating group: composited, no per-frame JS) */}
        {progress > 0.004 && progress < 0.999 && (
          <g className="tm-hd" style={{ transform: `rotate(${progress * 360}deg)` }}>
            <circle cy={-R_MAIN} r={orbit ? 16 : 12} className="tm-hd-glow" />
            <circle cy={-R_MAIN} r={orbit ? 6.5 : 5} className="tm-hd-dot" />
          </g>
        )}

        {orbit && (
          <g className="tm-sec" style={{ animationDelay: `${sweep0.current}ms` }}>
            <circle cy={-R_MAIN - 17} r="2.6" />
          </g>
        )}

        {full && inner && (
          <>
            <circle className="tm-cycle-track" r={R_CYCLE} />
            <circle key={tickKey} className={'tm-cycle' + (tickOn ? ' tick' : '')} r={R_CYCLE} pathLength={100} style={{ strokeDasharray: 100, strokeDashoffset: 100 - cycle * 100 }} transform="rotate(-90)" />
          </>
        )}
      </svg>
      <div className="tm-dial-center">{children}</div>
    </div>
  );
};
