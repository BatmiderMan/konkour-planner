import React from 'react';
import { Cloud, CloudRain, Music2, Radio, Waves, Wind } from 'lucide-react';
import { toPersianDigits } from '../../utils';

/** m:ss in Persian digits */
export const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec || 0));
  return toPersianDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
};

/** "۱ ساعت و ۱۲ دقیقه" / "۴۵ دقیقه" */
export const fmtLong = (sec: number): string => {
  const mins = Math.round((sec || 0) / 60);
  if (mins < 1) return sec > 0 ? 'کمتر از ۱ دقیقه' : '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${toPersianDigits(m)} دقیقه`;
  return m ? `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه` : `${toPersianDigits(h)} ساعت`;
};

export const fmtSize = (bytes: number): string => {
  if (!bytes) return '۰';
  const mb = bytes / 1048576;
  if (mb >= 1024) return toPersianDigits((mb / 1024).toFixed(1)).replace('.', '٫') + ' گیگابایت';
  return toPersianDigits(mb < 10 ? mb.toFixed(1) : Math.round(mb)).replace('.', '٫') + ' مگابایت';
};

export const AMBIENT_ICON: Record<string, React.ReactNode> = {
  'amb:rain': <CloudRain size={18} />,
  'amb:brown': <Wind size={18} />,
  'amb:ocean': <Waves size={18} />,
  'amb:white': <Radio size={18} />,
  'amb:pink': <Cloud size={18} />
};

export const ambientIcon = (id: string | null, size = 18): React.ReactNode => {
  const el = id ? AMBIENT_ICON[id] : null;
  return el ? React.cloneElement(el as React.ReactElement<any>, { size, strokeWidth: size > 30 ? 1.6 : 2 }) : <Music2 size={size} strokeWidth={size > 30 ? 1.6 : 2} />;
};

/** four bars that dance while the music plays */
export const Equalizer: React.FC<{ on: boolean }> = ({ on }) => (
  <span className={'mp-eq' + (on ? ' on' : '')} aria-hidden="true"><i /><i /><i /><i /></span>
);
