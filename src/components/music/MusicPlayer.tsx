import React from 'react';
import {
  ChevronDown, CloudRain, ListMusic, Music2, Pause, Play, Plus, Repeat, Repeat1, Shuffle, SkipBack, SkipForward,
  Trash2, Volume1, Volume2, VolumeX, Waves, Wind, X
} from 'lucide-react';
import {
  AMBIENT_TRACKS, Track, currentTrack, isAmbientId, musicAddFiles, musicCycleRepeat, musicNext, musicPlay, musicPrev,
  musicRemove, musicSeek, musicSetVolume, musicStop, musicToggle, musicToggleShuffle, useMusic
} from '../../musicStore';
import { confirmDialog } from '../../dialog';
import { toPersianDigits } from '../../utils';
import './music.css';

const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec || 0));
  return toPersianDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
};

const AMBIENT_ICON: Record<string, React.ReactNode> = {
  'amb:rain': <CloudRain size={18} />,
  'amb:brown': <Wind size={18} />,
  'amb:ocean': <Waves size={18} />
};

/** three bars that dance while the music plays */
export const Equalizer: React.FC<{ on: boolean }> = ({ on }) => (
  <span className={'mp-eq' + (on ? ' on' : '')} aria-hidden="true"><i /><i /><i /><i /></span>
);

// ---------------------------------------------------------------- floating mini bar (any section of the app)
export const MusicMini: React.FC<{ onOpen: () => void; hidden?: boolean }> = ({ onOpen, hidden }) => {
  const m = useMusic();
  const t = currentTrack(m);
  if (!m.active || !t || hidden) return null;
  const pct = m.duration > 0 && !isAmbientId(m.currentId) ? (m.position / m.duration) * 100 : 0;
  return (
    <div className={'mp-mini' + (m.playing ? ' playing' : '')} role="region" aria-label="پخش‌کننده‌ی موسیقی">
      <button type="button" className="mp-mini-main" onClick={onOpen} aria-label="باز کردن پخش‌کننده">
        <span className="mp-mini-art"><Equalizer on={m.playing} /></span>
        <span className="mp-mini-title">{t.title}</span>
      </button>
      {!isAmbientId(m.currentId) && m.tracks.length > 1 && (
        <button type="button" className="mp-mini-btn hide-sm" onClick={musicPrev} aria-label="قبلی"><SkipForward size={16} /></button>
      )}
      <button type="button" className="mp-mini-btn play" onClick={musicToggle} aria-label={m.playing ? 'توقف' : 'پخش'}>
        {m.playing ? <Pause size={17} /> : <Play size={17} />}
      </button>
      {!isAmbientId(m.currentId) && m.tracks.length > 1 && (
        <button type="button" className="mp-mini-btn hide-sm" onClick={musicNext} aria-label="بعدی"><SkipBack size={16} /></button>
      )}
      <button type="button" className="mp-mini-btn" onClick={musicStop} aria-label="بستن پخش‌کننده"><X size={15} /></button>
      {pct > 0 && <i className="mp-mini-bar" style={{ width: pct + '%' }} />}
    </div>
  );
};

// ---------------------------------------------------------------- one line inside the study timer
export const MusicCompact: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const m = useMusic();
  const t = currentTrack(m);
  return (
    <div className={'mp-compact' + (m.playing ? ' playing' : '')}>
      <button type="button" className="mp-compact-main" onClick={onOpen}>
        <span className="mp-compact-ic"><Music2 size={17} /></span>
        <span className="mp-compact-txt">
          <b>{t ? t.title : 'موسیقی تمرکز'}</b>
          <em>{t ? (m.playing ? 'در حال پخش' : 'متوقف') : 'آهنگ یا صدای محیطی انتخاب کن'}</em>
        </span>
        <Equalizer on={m.playing} />
      </button>
      {t && (
        <button type="button" className="mp-compact-play" onClick={musicToggle} aria-label={m.playing ? 'توقف موسیقی' : 'پخش موسیقی'}>
          {m.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- the full player
export const MusicSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const m = useMusic();
  const t = currentTrack(m);
  const [tab, setTab] = React.useState<'list' | 'focus'>('list');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState<number | null>(null); // seek value while dragging

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ambient = isAmbientId(m.currentId);
  const shown = drag ?? m.position;
  const seekPct = m.duration > 0 ? Math.min(100, (shown / m.duration) * 100) : 0;
  const VolIcon = m.volume === 0 ? VolumeX : m.volume < 0.45 ? Volume1 : Volume2;

  const pickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) await musicAddFiles(files);
    e.target.value = '';
  };

  const remove = async (tr: Track) => {
    if (await confirmDialog(`«${tr.title}» از لیست پخش حذف شود؟`)) await musicRemove(tr.id);
  };

  return (
    <div className="mp-backdrop" onClick={onClose}>
      <div className="mp-sheet" role="dialog" aria-modal="true" aria-label="پخش‌کننده‌ی موسیقی" onClick={(e) => e.stopPropagation()}>
        <div className="mp-top">
          <span className="mp-top-title"><Music2 size={18} /> موسیقی</span>
          <button type="button" className="mp-icon" onClick={onClose} aria-label="بستن"><ChevronDown size={20} /></button>
        </div>

        {/* now playing */}
        <div className={'mp-now' + (m.playing ? ' playing' : '')}>
          <div className="mp-art" aria-hidden="true">
            {ambient ? (AMBIENT_ICON[m.currentId!] ? React.cloneElement(AMBIENT_ICON[m.currentId!] as React.ReactElement<any>, { size: 54, strokeWidth: 1.6 }) : <Music2 size={54} />) : <Music2 size={54} strokeWidth={1.6} />}
            <Equalizer on={m.playing} />
          </div>
          <div className="mp-meta">
            <h3>{t ? t.title : 'چیزی انتخاب نشده'}</h3>
            <span>{t ? (ambient ? 'صدای تمرکز · بی‌پایان' : m.loading ? 'در حال آماده‌سازی…' : m.playing ? 'در حال پخش' : 'متوقف') : 'یک آهنگ اضافه کن یا صدای محیطی را بزن'}</span>
          </div>
        </div>

        {m.error && <div className="mp-error" role="alert">{m.error}</div>}

        {/* seek */}
        <div className={'mp-seek' + (ambient || !t ? ' off' : '')}>
          <span>{ambient ? '∞' : fmt(shown)}</span>
          <input
            type="range" min={0} max={Math.max(1, Math.floor(m.duration))} step={1} value={ambient ? 0 : Math.floor(shown)}
            disabled={ambient || !t || m.duration <= 0}
            style={{ ['--p' as any]: seekPct + '%' }}
            onChange={(e) => setDrag(Number(e.target.value))}
            onPointerUp={() => { if (drag !== null) { musicSeek(drag); setDrag(null); } }}
            onKeyUp={() => { if (drag !== null) { musicSeek(drag); setDrag(null); } }}
            aria-label="جابه‌جایی در آهنگ"
          />
          <span>{ambient ? '' : fmt(m.duration)}</span>
        </div>

        {/* transport */}
        <div className="mp-transport">
          <button type="button" className={'mp-icon' + (m.shuffle ? ' on' : '')} onClick={musicToggleShuffle} aria-pressed={m.shuffle} aria-label="پخش تصادفی" disabled={ambient}><Shuffle size={18} /></button>
          <button type="button" className="mp-icon" onClick={musicPrev} aria-label="آهنگ قبلی" disabled={ambient || m.tracks.length < 2}><SkipForward size={22} /></button>
          <button type="button" className="mp-play" onClick={musicToggle} aria-label={m.playing ? 'توقف' : 'پخش'}>
            {m.playing ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button type="button" className="mp-icon" onClick={musicNext} aria-label="آهنگ بعدی" disabled={ambient || m.tracks.length < 2}><SkipBack size={22} /></button>
          <button type="button" className={'mp-icon' + (m.repeat !== 'off' ? ' on' : '')} onClick={musicCycleRepeat} aria-label="تکرار" title={m.repeat === 'one' ? 'تکرار یک آهنگ' : m.repeat === 'all' ? 'تکرار همه' : 'بدون تکرار'} disabled={ambient}>
            {m.repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
        </div>

        <label className="mp-vol">
          <button type="button" className="mp-icon sm" onClick={() => musicSetVolume(m.volume === 0 ? 0.7 : 0)} aria-label="بی‌صدا"><VolIcon size={18} /></button>
          <input type="range" min={0} max={1} step={0.02} value={m.volume} style={{ ['--p' as any]: m.volume * 100 + '%' }} onChange={(e) => musicSetVolume(Number(e.target.value))} aria-label="بلندی صدا" />
        </label>

        {/* lists */}
        <div className="mp-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}><ListMusic size={16} /> لیست من</button>
          <button type="button" role="tab" aria-selected={tab === 'focus'} className={tab === 'focus' ? 'on' : ''} onClick={() => setTab('focus')}><CloudRain size={16} /> صداهای تمرکز</button>
        </div>

        {tab === 'list' ? (
          <div className="mp-list">
            {m.tracks.length === 0 && (
              <div className="mp-empty">
                <Music2 size={26} />
                <b>هنوز آهنگی نیست</b>
                <span>آهنگ‌های خودت را از گوشی یا کامپیوتر اضافه کن. فایل‌ها فقط روی همین دستگاه ذخیره می‌شوند و جایی آپلود نمی‌شوند.</span>
              </div>
            )}
            {m.tracks.map((tr) => {
              const on = tr.id === m.currentId;
              return (
                <div key={tr.id} className={'mp-row' + (on ? ' on' : '')}>
                  <button type="button" className="mp-row-main" onClick={() => musicPlay(tr.id)}>
                    <span className="mp-row-ic">{on && m.playing ? <Equalizer on /> : <Play size={14} />}</span>
                    <span className="mp-row-title">{tr.title}</span>
                    {tr.duration ? <span className="mp-row-dur">{fmt(tr.duration)}</span> : null}
                  </button>
                  <button type="button" className="mp-row-del" onClick={() => remove(tr)} aria-label={`حذف ${tr.title}`}><Trash2 size={15} /></button>
                </div>
              );
            })}
            <button type="button" className="mp-add" onClick={() => fileRef.current?.click()}><Plus size={17} /> افزودن آهنگ</button>
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac" multiple hidden onChange={pickFiles} />
          </div>
        ) : (
          <div className="mp-list">
            {AMBIENT_TRACKS.map((tr) => {
              const on = tr.id === m.currentId;
              return (
                <div key={tr.id} className={'mp-row focus' + (on ? ' on' : '')}>
                  <button type="button" className="mp-row-main" onClick={() => musicPlay(tr.id)}>
                    <span className="mp-row-ic">{on && m.playing ? <Equalizer on /> : AMBIENT_ICON[tr.id]}</span>
                    <span className="mp-row-title">{tr.title}</span>
                    <span className="mp-row-dur">∞</span>
                  </button>
                </div>
              );
            })}
            <p className="mp-note">این صداها داخل خود برنامه ساخته می‌شوند؛ بدون اینترنت هم کار می‌کنند و برای تمرکز هنگام مطالعه مناسب‌اند.</p>
          </div>
        )}
      </div>
    </div>
  );
};
