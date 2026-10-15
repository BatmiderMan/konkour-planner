import React from 'react';
import { DialModel, pointOnCircle } from './timerMath';

interface TimerDialProps {
  model: DialModel;
  running: boolean;
  tickKey: number; // changes with every tick -> restarts the flash
  tickOn: boolean;
  children?: React.ReactNode; // the centre of the dial
  variant?: 'dial' | 'ring' | 'digits'; // full-screen look: classic dial, plain ring, or big digits with a bar
}

const R_MAIN = 128;
const R_CYCLE = 108;

export const TimerDial: React.FC<TimerDialProps> = ({ model, running, tickKey, tickOn, children, variant = 'dial' }) => {
  const gid = React.useId().replace(/:/g, '');
  const { notches, lit, progress, cycle, phase } = model;
  const head = pointOnCircle(R_MAIN, progress);
  const notchW = notches > 60 ? 1.6 : notches > 30 ? 2.2 : 3;

  if (variant === 'digits') {
    // big digits: the progress is a row of segments (one segment = one tick) or a plain bar for long sessions
    const seg = notches > 0 && notches <= 60;
    return (
      <div className={`tm-dial v-digits ph-${phase}` + (running ? ' running' : ' idle')}>
        <div className="tm-dial-center">{children}</div>
        {seg ? (
          <div className="tm-bar" aria-hidden="true">
            {Array.from({ length: notches }, (_, i) => <i key={i} className={i < lit ? 'on' : i === lit && running ? 'now' : ''} />)}
          </div>
        ) : (
          <div className="tm-bar cont" aria-hidden="true"><i style={{ width: Math.min(100, progress * 100) + '%' }} /></div>
        )}
      </div>
    );
  }

  return (
    <div className={`tm-dial v-${variant} ph-${phase}` + (running ? ' running' : ' idle')}>
      <svg viewBox="-170 -170 340 340" aria-hidden="true">
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--tm-a)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--tm-b)' }} />
          </linearGradient>
        </defs>

        {/* outer ring of notches: with the tick sound on, ONE NOTCH = ONE TICK */}
        <g className="tm-notches">
          {Array.from({ length: notches }, (_, i) => {
            const a = (i / notches) * 360;
            const cls = i < lit ? 'on' : i === lit && running ? 'now' : '';
            return (
              <line
                key={i}
                className={cls}
                x1="0" y1="-147" x2="0" y2="-158"
                strokeWidth={notchW}
                transform={`rotate(${a})`}
              />
            );
          })}
        </g>

        <circle className="tm-face" r={96} />
        <circle className="tm-track" r={R_MAIN} />
        <circle
          className="tm-arc"
          r={R_MAIN}
          pathLength={100}
          stroke={`url(#g${gid})`}
          style={{ strokeDasharray: 100, strokeDashoffset: 100 - progress * 100 }}
          transform="rotate(-90)"
        />
        {progress > 0.004 && progress < 0.999 && (
          <g className="tm-hd" transform={`translate(${head.x} ${head.y})`}>
            <circle r="12" className="tm-hd-glow" />
            <circle r="5" className="tm-hd-dot" />
          </g>
        )}

        {/* inner ring: fills up until the next tick */}
        <circle className="tm-cycle-track" r={R_CYCLE} />
        <circle
          key={tickKey}
          className={'tm-cycle' + (tickOn ? ' tick' : '')}
          r={R_CYCLE}
          pathLength={100}
          style={{ strokeDasharray: 100, strokeDashoffset: 100 - cycle * 100 }}
          transform="rotate(-90)"
        />
      </svg>
      <div className="tm-dial-center">{children}</div>
    </div>
  );
};
