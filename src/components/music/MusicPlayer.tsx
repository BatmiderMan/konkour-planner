import React from 'react';
import {
  ChevronDown, Heart, Maximize2, Minimize2, Moon, Music2, Pause, Play, Repeat, Repeat1, RotateCcw, RotateCw, Shuffle,
  SkipBack, SkipForward, Volume1, Volume2, VolumeX, X
} from 'lucide-react';
import {
  RATES, currentTrack, isAmbientId, musicAddFiles, musicCycleRepeat, musicNext, musicPrev, musicSeek, musicSetRate,
  musicSetSleep, musicSetVolume, musicSkip, musicStop, musicToggle, musicToggleFav, musicToggleShuffle, useMusic
} from '../../musicStore';
import { toPersianDigits } from '../../utils';
import { Equalizer, ambientIcon, fmt } from './musicUi';
import { MusicLibrary } from './MusicLibrary';
import './music.css';

export { Equalizer };

const FULL_KEY = 'planex_music_full';
const SLEEP_CHOICES = [15, 30, 45, 60, 90];
const n = (x: number) => toPersianDigits(x);

// ---------------------------------------------------------------- floating mini bar (any section of the app)
export const MusicMini: React.FC<{ onOpen: () => void; hidden?: boolean }> = ({ onOpen, hidden }) => {
  const m = useMusic();
  const t = currentTrack(m);
  if (!m.active || !t || hidden) return null;
  const pct = m.duration > 0 && !isAmbientId(m.currentId) ? (m.position / m.duration) * 100 : 0;
  const canSkip = !isAmbientId(m.currentId) && (m.tracks.length > 1 || m.upNext.length > 0);
  return (
    <div className={'mp-mini' + (m.playing ? ' playing' : '')} role="region" aria-label="پخش‌کننده‌ی موسیقی">
      <button type="button" className="mp-mini-main" onClick={onOpen} aria-label="باز کردن پخش‌کننده">
        <span className="mp-mini-art"><Equalizer on={m.playing} /></span>
        <span className="mp-mini-title">{t.title}</span>
      </button>
      {canSkip && (
        <button type="button" className="mp-mini-btn hide-sm" onClick={musicPrev} aria-label="قبلی"><SkipForward size={16} /></button>
      )}
      <button type="button" className="mp-mini-btn play" onClick={musicToggle} aria-label={m.playing ? 'توقف' : 'پخش'}>
        {m.playing ? <Pause size={17} /> : <Play size={17} />}
      </button>
      {canSkip && (
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
const isPhoneWidth = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;

export const MusicSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const m = useMusic();
  const t = currentTrack(m);
  const [full, setFull] = React.useState<boolean>(() => {
    try { const v = localStorage.getItem(FULL_KEY); if (v === '1' || v === '0') return v === '1'; } catch { /* ignore */ }
    return isPhoneWidth(); // phones open the big player by default, desktops the sheet
  });
  const [drag, setDrag] = React.useState<number | null>(null); // seek value while dragging
  const [sleepOpen, setSleepOpen] = React.useState(false);
  const [dropping, setDropping] = React.useState(false);
  const [toastMsg, setToastMsg] = React.useState('');
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, tick] = React.useState(0);

  const toast = React.useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2200);
  }, []);
  React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const toggleFull = () => setFull((f) => { const v = !f; try { localStorage.setItem(FULL_KEY, v ? '1' : '0'); } catch { /* ignore */ } return v; });

  // sleep-timer countdown
  React.useEffect(() => {
    if (!open || m.sleep?.mode !== 'time') return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [open, m.sleep]);

  // keyboard: Esc closes, space / arrows / letters control playback
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (sleepOpen) setSleepOpen(false); else onClose(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const typing = tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable || (tag === 'INPUT' && (el as HTMLInputElement).type !== 'range');
      if (typing) return;
      const onRange = tag === 'INPUT';
      switch (e.key) {
        case ' ': if (tag === 'BUTTON') return; e.preventDefault(); musicToggle(); break;
        case 'ArrowLeft': if (onRange) return; e.preventDefault(); musicSkip(-5); break;
        case 'ArrowRight': if (onRange) return; e.preventDefault(); musicSkip(5); break;
        case 'ArrowUp': if (onRange) return; e.preventDefault(); musicSetVolume(m.volume + 0.05); break;
        case 'ArrowDown': if (onRange) return; e.preventDefault(); musicSetVolume(m.volume - 0.05); break;
        case 'n': case 'N': musicNext(); break;
        case 'p': case 'P': musicPrev(); break;
        case 'm': case 'M': musicSetVolume(m.volume === 0 ? 0.7 : 0); break;
        case 's': case 'S': musicToggleShuffle(); break;
        case 'r': case 'R': musicCycleRepeat(); break;
        case 'f': case 'F': if (t && !isAmbientId(t.id)) musicToggleFav(t.id); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, sleepOpen, m.volume, t]);

  if (!open) return null;

  const ambient = isAmbientId(m.currentId);
  const shown = drag ?? m.position;
  const seekPct = m.duration > 0 ? Math.min(100, (shown / m.duration) * 100) : 0;
  const VolIcon = m.volume === 0 ? VolumeX : m.volume < 0.45 ? Volume1 : Volume2;
  const canSkip = !ambient && (m.tracks.length > 1 || m.upNext.length > 0);
  const ctxName = m.context === 'fav' ? 'علاقه‌مندی‌ها' : m.context === 'focus' ? 'صداهای تمرکز' : m.context.startsWith('pl:') ? (m.playlists.find((p) => 'pl:' + p.id === m.context)?.name || 'لیست پخش') : 'کتابخانه';
  const status = !t ? 'یک آهنگ اضافه کن یا صدای محیطی را بزن'
    : ambient ? 'صدای تمرکز · بی‌پایان'
      : m.loading ? 'در حال آماده‌سازی…' : `${m.playing ? 'در حال پخش' : 'متوقف'} · ${ctxName}`;

  const sleepLeft = m.sleep?.mode === 'time' && m.sleep.at ? Math.max(0, Math.ceil((m.sleep.at - Date.now()) / 1000)) : 0;
  const sleepLabel = !m.sleep ? '' : m.sleep.mode === 'track' ? 'پایان آهنگ' : fmt(sleepLeft);

  const commitSeek = () => { if (drag !== null) { musicSeek(drag); setDrag(null); } };

  const onDragFiles = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); setDropping(true); }
  };
  const onDropFiles = async (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault(); setDropping(false);
    const ids = await musicAddFiles(e.dataTransfer.files);
    if (ids.length) toast(`${n(ids.length)} آهنگ اضافه شد`);
  };

  return (
    <div className={'mp-backdrop' + (full ? ' full' : '')} onClick={onClose}>
      <div
        className={'mp-sheet' + (full ? ' full' : '')} role="dialog" aria-modal="true" aria-label="پخش‌کننده‌ی موسیقی"
        onClick={(e) => e.stopPropagation()}
        onDragEnter={onDragFiles} onDragOver={onDragFiles}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
        onDrop={onDropFiles}
      >
        <div className="mp-top">
          <span className="mp-top-title"><Music2 size={18} /> موسیقی</span>
          <div className="mp-top-actions">
            <button type="button" className="mp-icon" onClick={toggleFull} aria-label={full ? 'کوچک کردن پخش‌کننده' : 'تمام‌صفحه کردن پخش‌کننده'} title={full ? 'کوچک کردن' : 'تمام‌صفحه'}>
              {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button type="button" className="mp-icon" onClick={onClose} aria-label="بستن"><ChevronDown size={20} /></button>
          </div>
        </div>

        <div className="mp-body">
          {/* ------------------------------------------------ now playing */}
          <section className="mp-pane-now" aria-label="در حال پخش">
            <div className={'mp-now' + (m.playing ? ' playing' : '')}>
              <div className="mp-art" aria-hidden="true">
                {ambient ? ambientIcon(m.currentId, full ? 80 : 54) : <Music2 size={full ? 80 : 54} strokeWidth={1.6} />}
                <Equalizer on={m.playing} />
              </div>
              <div className="mp-meta">
                <h3>{t ? t.title : 'چیزی انتخاب نشده'}</h3>
                <span>{status}</span>
              </div>
            </div>

            {m.error && <div className="mp-error" role="alert">{m.error}</div>}

            <div className={'mp-seek' + (ambient || !t ? ' off' : '')}>
              <span>{ambient ? '∞' : fmt(shown)}</span>
              <input
                type="range" min={0} max={Math.max(1, Math.floor(m.duration))} step={1} value={ambient ? 0 : Math.floor(shown)}
                disabled={ambient || !t || m.duration <= 0}
                style={{ ['--p' as any]: seekPct + '%' }}
                onChange={(e) => setDrag(Number(e.target.value))}
                onPointerUp={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek}
                aria-label="جابه‌جایی در آهنگ"
              />
              <span>{ambient ? '' : fmt(m.duration)}</span>
            </div>

            <div className="mp-transport">
              <button type="button" className={'mp-icon' + (m.shuffle ? ' on' : '')} onClick={musicToggleShuffle} aria-pressed={m.shuffle} aria-label="پخش تصادفی" title="پخش تصادفی (S)" disabled={ambient}><Shuffle size={18} /></button>
              <button type="button" className="mp-icon" onClick={musicPrev} aria-label="آهنگ قبلی" title="قبلی (P)" disabled={!canSkip}><SkipForward size={22} /></button>
              <button type="button" className="mp-play" onClick={musicToggle} aria-label={m.playing ? 'توقف' : 'پخش'} title="پخش / توقف (فاصله)">
                {m.playing ? <Pause size={28} /> : <Play size={28} />}
              </button>
              <button type="button" className="mp-icon" onClick={musicNext} aria-label="آهنگ بعدی" title="بعدی (N)" disabled={!canSkip}><SkipBack size={22} /></button>
              <button type="button" className={'mp-icon' + (m.repeat !== 'off' ? ' on' : '')} onClick={musicCycleRepeat} aria-label="تکرار" title={m.repeat === 'one' ? 'تکرار یک آهنگ' : m.repeat === 'all' ? 'تکرار همه' : 'بدون تکرار'} disabled={ambient}>
                {m.repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
              </button>
            </div>

            <div className="mp-extras">
              <button type="button" className={'mp-chip' + (t && t.fav ? ' on' : '')} disabled={!t || ambient} onClick={() => t && musicToggleFav(t.id)} aria-pressed={!!t?.fav} aria-label="علاقه‌مندی" title="علاقه‌مندی (F)">
                <Heart size={16} fill={t?.fav ? 'currentColor' : 'none'} />
              </button>
              <span className="mp-skip" dir="ltr">
                <button type="button" className="mp-chip" disabled={ambient || !t} onClick={() => musicSkip(-10)} aria-label="۱۰ ثانیه عقب"><RotateCcw size={16} /><i>10</i></button>
                <button type="button" className="mp-chip" disabled={ambient || !t} onClick={() => musicSkip(10)} aria-label="۱۰ ثانیه جلو"><RotateCw size={16} /><i>10</i></button>
              </span>
              <button
                type="button" className={'mp-chip txt' + (m.rate !== 1 ? ' on' : '')} disabled={ambient}
                onClick={() => musicSetRate(RATES[(RATES.indexOf(m.rate as any) + 1) % RATES.length])}
                aria-label="سرعت پخش" title="سرعت پخش"
              >×{n(m.rate)}</button>
              <button type="button" className={'mp-chip txt' + (m.sleep ? ' on' : '')} onClick={() => setSleepOpen((v) => !v)} aria-expanded={sleepOpen} aria-label="زمان‌سنج خواب" title="زمان‌سنج خواب">
                <Moon size={16} />{sleepLabel && <span>{sleepLabel}</span>}
              </button>
            </div>

            {sleepOpen && (
              <div className="mp-sleep" role="group" aria-label="خاموش شدن خودکار">
                <span>خاموش شدن خودکار بعد از</span>
                <div>
                  {SLEEP_CHOICES.map((min) => (
                    <button key={min} type="button" className={'mp-chip txt' + (m.sleep?.mode === 'time' && Math.abs(sleepLeft - min * 60) < 5 ? ' on' : '')} onClick={() => { musicSetSleep(min); setSleepOpen(false); toast(`بعد از ${n(min)} دقیقه خاموش می‌شود`); }}>{n(min)} دقیقه</button>
                  ))}
                  {!ambient && <button type="button" className={'mp-chip txt' + (m.sleep?.mode === 'track' ? ' on' : '')} onClick={() => { musicSetSleep('track'); setSleepOpen(false); toast('بعد از این آهنگ خاموش می‌شود'); }}>پایان این آهنگ</button>}
                  {m.sleep && <button type="button" className="mp-chip txt" onClick={() => { musicSetSleep(null); setSleepOpen(false); toast('زمان‌سنج لغو شد'); }}>لغو</button>}
                </div>
              </div>
            )}

            <label className="mp-vol">
              <button type="button" className="mp-icon sm" onClick={() => musicSetVolume(m.volume === 0 ? 0.7 : 0)} aria-label="بی‌صدا" title="بی‌صدا (M)"><VolIcon size={18} /></button>
              <input type="range" min={0} max={1} step={0.02} value={m.volume} style={{ ['--p' as any]: m.volume * 100 + '%' }} onChange={(e) => musicSetVolume(Number(e.target.value))} aria-label="بلندی صدا" />
            </label>

            <p className="mp-keys" aria-hidden="true">فاصله: پخش/توقف · ← → : ۵ ثانیه · ↑ ↓ : صدا · N / P : بعدی / قبلی · S : تصادفی · F : علاقه‌مندی</p>
          </section>

          {/* ------------------------------------------------ library */}
          <section className="mp-pane-lib" aria-label="کتابخانه">
            <MusicLibrary toast={toast} />
          </section>
        </div>

        {dropping && <div className="mp-drop" aria-hidden="true"><Music2 size={34} /><b>فایل‌های صوتی را اینجا رها کن</b></div>}
        {toastMsg && <div className="mp-toast" role="status" aria-live="polite">{toastMsg}</div>}
      </div>
    </div>
  );
};
