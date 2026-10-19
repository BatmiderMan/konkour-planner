import React from 'react';
import './ui.css';

/** a shimmering placeholder block */
export const Skeleton: React.FC<{ w?: number | string; h?: number | string; r?: number | string; className?: string; style?: React.CSSProperties }> = ({ w = '100%', h = 14, r = 8, className = '', style }) => (
  <i className={'ui-skel ' + className} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />
);

/** n list rows (thumbnail + two text lines) */
export const SkeletonRows: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="ui-skel-rows" role="status" aria-label="در حال بارگذاری">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="ui-skel-row">
        <Skeleton w={40} h={40} r={11} />
        <div><Skeleton w={`${62 - (i % 3) * 12}%`} h={13} /><Skeleton w={`${34 + (i % 2) * 14}%`} h={10} style={{ marginTop: 8 }} /></div>
      </div>
    ))}
  </div>
);
