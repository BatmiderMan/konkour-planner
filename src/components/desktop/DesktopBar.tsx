import React from 'react';
import {
  CalendarClock, CalendarRange, ClipboardList, LayoutDashboard, Library, ListChecks, Monitor, Moon, Music2, Pause, Play, ScanLine, Search, SkipBack, SkipForward, Sun, Timer, Trophy
} from 'lucide-react';
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
import { BUILD_LABEL } from '../../buildInfo';
import './desktop.css';

type Section = 'today' | 'planner' | 'tracker' | 'schedule' | 'exams' | 'checker' | 'bank' | 'report';
type ThemeMode = 'light' | 'dark' | 'auto';
const TABS: Array<[Section, string, React.ReactNode]> = [
  ['today', 'امروز', <LayoutDashboard size={18} key="a" />],
  ['planner', 'برنامه‌ریز', <CalendarRange size={18} key="b" />],
  ['tracker', 'پیگیری مباحث', <ListChecks size={18} key="b2" />],
  ['schedule', 'برنامه آزمون', <CalendarClock size={18} key="c" />],
  ['exams', 'آزمون‌ها', <Trophy size={18} key="d" />],
  ['checker', 'تصحیح', <ScanLine size={18} key="e" />],
  ['bank', 'بانک تست', <Library size={18} key="f" />],
  ['report', 'گزارش روز', <ClipboardList size={18} key="g" />]
];
const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return toPersianDigits(h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`);
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
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!live?.running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [live?.running]);

  const showMusic = music.active && !!track;
  const ambient = isAmbientId(music.currentId);

  // timer segment
  let timer: React.ReactNode;
  if (live) {
    const R = 13, C = 2 * Math.PI * R;
    const el = liveElapsedMs(live, now) / 1000, total = liveTotalPlannedSeconds(live);
    const stop = total <= 0, brk = liveKind(live) === 'break';
    const p = stop ? (el % 3600) / 3600 : Math.min(1, el / total);
    const shown = stop ? el : Math.max(0, total - el);
    timer = (
      <div className={'isl-seg timer live' + (live.running ? '' : ' paused')} style={{ ['--c' as any]: brk ? '#34c759' : liveColor(live) } as React.CSSProperties}>
        <button type="button" className="isl-main" onClick={openLiveTimer} title="باز کردن تایمر (T)">
          <svg viewBox="0 0 32 32" className="isl-ring" aria-hidden="true">
            <circle cx="16" cy="16" r={R} className="bg" /><circle cx="16" cy="16" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 16 16)" />
          </svg>
          <span className="isl-tx"><b className="isl-time">{clock(shown)}</b><em>{brk ? 'استراحت' : live.item.subject}{live.running ? '' : ' · متوقف'}</em></span>
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
        {TABS.map(([id, label, icon], i) => (
          <button key={id} type="button" role="tab" aria-selected={section === id} className={'dtb-tab' + (section === id ? ' on' : '')} onClick={() => setSection(id)} title={`${label} (${toPersianDigits(i + 1)})`}>
            {icon}<span>{label}</span>{id === 'today' && todayLeft > 0 && <i className="dtb-badge">{toPersianDigits(todayLeft)}</i>}
          </button>
        ))}
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
