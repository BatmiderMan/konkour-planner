import React from 'react';
import { DialModel, pointOnCircle } from './timerMath';

interface TimerDialProps {
  model: DialModel;
  running: boolean;
  tickKey: number; // changes with every tick -> restarts the flash
  tickOn: boolean;
  children?: React.ReactNode; // the centre of the dial
}

const R_MAIN = 128;
const R_CYCLE = 106;

export const TimerDial: React.FC<TimerDialProps> = ({ model, running, tickKey, tickOn, children }) => {
  const gid = React.useId().replace(/:/g, '');
  const { notches, lit, progress, cycle, phase } = model;
  const head = pointOnCircle(R_MAIN, progress);
  const notchW = notches > 60 ? 2 : notches > 30 ? 3 : 4;

  return (
    <div className={`tm-dial ph-${phase}` + (running ? ' running' : ' idle')}>
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
                x1="0" y1="-150" x2="0" y2="-163"
                strokeWidth={notchW}
                transform={`rotate(${a})`}
              />
            );
          })}
        </g>

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
          <g className="tm-head" transform={`translate(${head.x} ${head.y})`}>
            <circle r="15" className="tm-head-glow" />
            <circle r="6.5" className="tm-head-dot" />
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
