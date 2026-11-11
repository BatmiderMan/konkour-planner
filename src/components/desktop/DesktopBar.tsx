import React from 'react';
import {
  CalendarRange, ClipboardList, LayoutDashboard, ListChecks, Monitor, Moon, Music2, Pause, Play, Search, Settings2, SkipBack, SkipForward, Sun, Timer
} from 'lucide-react';
import { SPACES, SpaceId, entryOf, spaceOf } from '../../nav';
import { dateKeyOf, loadPlannerData, todayGregorian } from '../../plannerStore';
import {
  liveColor, liveElapsedMs, liveKind, liveTotalPlannedSeconds, pauseLivePlan, requestLiveStart, resumeLivePlan, useLivePlan
} from '../../livePlan';
import { currentTrack, isAmbientId, musicNext, musicPrev, musicToggle, useCoverUrl, useMusic } from '../../musicStore';
import { Equalizer } from '../music/musicUi';
import { openLiveTimer, openPalette } from '../../focusBus';
import { unlockAudio } from '../../tickSound';
import { itemMinutes } from '../../plannerSchedule';
import { toPersianDigits } from '../../utils';
import { Clock } from '../../clock/Clock';
import { useNow } from '../../clock/useNow';
import { BUILD_LABEL } from '../../buildInfo';
import './desktop.css';

type Section = 'today' | 'planner' | 'tracker' | 'schedule' | 'exams' | 'checker' | 'bank' | 'report' | 'settings';
type ThemeMode = 'light' | 'dark' | 'auto';
const SPACE_ICON: Record<SpaceId, React.ReactNode> = {
  today: <LayoutDashboard size={18} />, plan: <CalendarRange size={18} />, study: <ListChecks size={18} />, insight: <ClipboardList size={18} />, settings: <Settings2 size={18} />
};
/** the first unfinished card of today's plan (re-read now and then: the planner can change anywhere) */
function useNextTask() {
  const read = () => {
    const key = dateKeyOf(todayGregorian());
    const data = loadPlannerData();
    const it = (data.items[key] || []).find((i) => !i.done) || null;
    return { key, it, mins: it ? itemMinutes(it, data.schedule) : 0 };
  };
  const [v, setV] = React.useState(read);
  React.useEffect(() => {
    const upd = () => setV(read());
    const id = setInterval(upd, 15000);
    window.addEventListener('focus', upd);
    document.addEventListener('visibilitychange', upd);
    return () => { clearInterval(id); window.removeEventListener('focus', upd); document.removeEventListener('visibilitychange', upd); };
  }, []);
  return v;
}

// ---------------------------------------------------------------- the Island: timer + music in one adaptive pill
const Island: React.FC<{ onStartPicker: () => void; onOpenMusic: () => void }> = ({ onStartPicker, onOpenMusic }) => {
  const live = useLivePlan();
  const music = useMusic();
  const track = currentTrack(music);
  const cover = useCoverUrl(music.currentId);
  const next = useNextTask();
  // one update per displayed second, in step with the digit flip (was: a 500 ms poll)
  const now = useNow(!!live?.running, () => (live ? liveElapsedMs(live) % 1000 : 0));

  const showMusic = music.active && !!track;
  const ambient = isAmbientId(music.currentId);

  // timer segment
  let timer: React.ReactNode;
  if (live) {
    const R = 13, C = 2 * Math.PI * R;
    const el = Math.floor(liveElapsedMs(live, now) / 1000), total = liveTotalPlannedSeconds(live);
    const stop = total <= 0, brk = liveKind(live) === 'break';
    const p = stop ? (el % 3600) / 3600 : Math.min(1, el / total);
    const shown = stop ? el : Math.max(0, total - el);
    timer = (
      <div className={'isl-seg timer live' + (live.running ? '' : ' paused')} style={{ ['--c' as any]: brk ? '#34c759' : liveColor(live) } as React.CSSProperties}>
        <button type="button" className="isl-main" onClick={openLiveTimer} title="باز کردن تایمر (T)">
          <svg viewBox="0 0 32 32" className="isl-ring" aria-hidden="true">
            <circle cx="16" cy="16" r={R} className="bg" /><circle cx="16" cy="16" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 16 16)" />
          </svg>
          <span className="isl-tx"><b className="isl-time"><Clock sec={shown} running={live.running} round="ceil" /></b><em>{brk ? 'استراحت' : live.item.subject}{live.running ? '' : ' · متوقف'}</em></span>
        </button>
        <button type="button" className="isl-btn" onClick={() => (live.running ? pauseLivePlan() : resumeLivePlan())} aria-label={live.running ? 'توقف' : 'ادامه'} title={live.running ? 'توقف' : 'ادامه'}>
          {live.running ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>
    );
  } else {
    timer = (
      <div className="isl-seg timer">
        <button type="button" className="isl-main" onClick={onStartPicker} title="شروع تمرکز (T)">
          <span className="isl-ic"><Timer size={18} /></span>
          <span className="isl-tx"><b>شروع تمرکز</b><em>{next.it ? `بعدی: ${next.it.subject}${next.mins ? ' · ' + toPersianDigits(next.mins) + ' دقیقه' : ''}` : 'کرونومتر یا مطالعه‌ی آزاد'}</em></span>
        </button>
        {next.it && (
          <button type="button" className="isl-go" onClick={() => { unlockAudio(); void requestLiveStart(next.key, next.it!); }} aria-label={`شروع ${next.it.subject}`} title={`شروع «${next.it.subject}» همین حالا`}>
            <Play size={15} /> شروع
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={'isl' + (live ? ' has-live' : '') + (showMusic ? ' has-music' : '')} role="group" aria-label="تایمر و موسیقی">
      {timer}
      {showMusic && track && (
        <div className="isl-seg music">
          <button type="button" className="isl-main" onClick={onOpenMusic} title={`${track.title} — باز کردن پخش‌کننده (M)`}>
            <span className={'isl-art' + (cover ? ' has-cover' : '')} style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>{!cover && (music.playing ? <Equalizer on /> : <Music2 size={16} />)}</span>
            <span className="isl-tx"><b>{track.title}</b><em>{music.playing ? 'در حال پخش' : 'متوقف'}</em></span>
          </button>
          {!ambient && <button type="button" className="isl-btn" onClick={musicNext} aria-label="بعدی"><SkipBack size={15} /></button>}
          <button type="button" className="isl-btn play" onClick={musicToggle} aria-label={music.playing ? 'توقف' : 'پخش'}>{music.playing ? <Pause size={16} /> : <Play size={16} />}</button>
          {!ambient && <button type="button" className="isl-btn" onClick={musicPrev} aria-label="قبلی"><SkipForward size={15} /></button>}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- the bar
export const DesktopBar: React.FC<{
  section: string; setSection: (s: Section) => void; todayLeft: number; onStartPicker: () => void; onOpenMusic: () => void;
  themeMode: ThemeMode; onCycleTheme: () => void; theme: 'light' | 'dark';
}> = ({ section, setSection, todayLeft, onStartPicker, onOpenMusic, themeMode, onCycleTheme, theme }) => {
  const music = useMusic();
  return (
    <header className="dtb no-print">
      <nav className="dtb-tabs" role="tablist" aria-label="بخش‌های برنامه">
        <img className="dtb-brand" src={`${import.meta.env.BASE_URL}planex-icon.png`} alt="Planex" title={BUILD_LABEL} />
        {SPACES.map((sp, i) => {
          const on = spaceOf(section).id === sp.id;
          return (
            <button key={sp.id} type="button" role="tab" aria-selected={on} className={'dtb-tab' + (on ? ' on' : '')} onClick={() => setSection(entryOf(sp))} title={`${sp.label} (${toPersianDigits(i + 1)})`}>
              {SPACE_ICON[sp.id]}<span>{sp.label}</span>{sp.id === 'today' && todayLeft > 0 && <i className="dtb-badge">{toPersianDigits(todayLeft)}</i>}
            </button>
          );
        })}
      </nav>
      <Island onStartPicker={onStartPicker} onOpenMusic={onOpenMusic} />
      <div className="dtb-tools">
        <button type="button" className="dtb-tool search" onClick={openPalette} title="جست‌وجو و فرمان‌ها (Ctrl+K)"><Search size={17} /><span>جست‌وجو</span><kbd>Ctrl K</kbd></button>
        {!(music.active) && <button type="button" className="dtb-tool" onClick={onOpenMusic} title="موسیقی (M)" aria-label="موسیقی"><Music2 size={18} /></button>}
        <button type="button" className="dtb-tool" onClick={onCycleTheme} title={themeMode === 'auto' ? 'حالت: خودکار' : themeMode === 'dark' ? 'حالت: تیره' : 'حالت: روشن'} aria-label="تغییر حالت روشن / تیره / خودکار">
          {themeMode === 'auto' ? <Monitor size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>
    </header>
  );
};
