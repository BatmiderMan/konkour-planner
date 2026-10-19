import React from 'react';
import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { currentTrack, isAmbientId, musicNext, musicPrev, musicToggle, useCoverUrl, useMusic } from '../../musicStore';
import { Equalizer } from '../music/musicUi';

/** Desktop rail: the music player as a compact control-centre widget (replaces the floating mini bar). */
export const RailMusic: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const m = useMusic();
  const t = currentTrack(m);
  const cover = useCoverUrl(m.currentId);
  if (!m.active || !t) {
    return (
      <button type="button" className="rail-music idle" onClick={onOpen} title="موسیقی (M)" aria-label="موسیقی">
        <Music2 size={22} strokeWidth={1.9} /><span>موسیقی</span>
      </button>
    );
  }
  const ambient = isAmbientId(m.currentId);
  const R = 21, C = 2 * Math.PI * R;
  const p = m.duration > 0 && !ambient ? Math.min(1, m.position / m.duration) : 0;
  return (
    <div className={'rail-music' + (m.playing ? ' playing' : '')} role="group" aria-label="پخش‌کننده‌ی موسیقی">
      <button type="button" className="rail-music-art" onClick={musicToggle} aria-label={m.playing ? 'توقف' : 'پخش'} title={m.playing ? 'توقف' : 'پخش'}>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r={R} className="bg" />
          <circle cx="24" cy="24" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 24 24)" />
        </svg>
        <span style={cover ? { backgroundImage: `url("${cover}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>{cover && !m.playing ? null : m.playing ? <Equalizer on /> : <Play size={16} />}</span>
        <em className="rail-music-hover">{m.playing ? <Pause size={16} /> : <Play size={16} />}</em>
      </button>
      {!ambient && (
        <div className="rail-music-skip">
          <button type="button" onClick={musicNext} aria-label="بعدی" title="بعدی"><SkipBack size={14} /></button>
          <button type="button" onClick={musicPrev} aria-label="قبلی" title="قبلی"><SkipForward size={14} /></button>
        </div>
      )}
      <button type="button" className="rail-music-title" onClick={onOpen} title={`${t.title} — باز کردن پخش‌کننده (M)`}>{t.title}</button>
    </div>
  );
};
