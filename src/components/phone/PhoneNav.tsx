import React from 'react';
import {
  CalendarClock, CalendarRange, ClipboardList, LayoutDashboard, LayoutGrid, Library, Monitor, Moon, Music2, Pause, Play, ScanLine, Search, Sun, Timer, Trophy, Vibrate
} from 'lucide-react';
import {
  liveColor, liveElapsedMs, liveKind, liveTotalPlannedSeconds, pauseLivePlan, resumeLivePlan, useLivePlan
} from '../../livePlan';
import { useMusic } from '../../musicStore';
import { Equalizer } from '../music/musicUi';
import { getHaptics, haptic, hapticTap, openLiveTimer, openPalette, setHaptics } from '../../focusBus';
import { Sheet } from '../ui/Sheet';
import { toPersianDigits } from '../../utils';
import './phone.css';

type Section = 'today' | 'planner' | 'schedule' | 'exams' | 'checker' | 'bank' | 'report';
const MORE: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: 'schedule', label: 'برنامه آزمون', icon: <CalendarClock size={22} /> },
  { id: 'exams', label: 'آزمون‌ها', icon: <Trophy size={22} /> },
  { id: 'checker', label: 'تصحیح', icon: <ScanLine size={22} /> },
  { id: 'bank', label: 'بانک تست', icon: <Library size={22} /> }
];

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return toPersianDigits(h ? `${h}:${String(m).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`);
};

// ---------------------------------------------------------------- the centre button: start / live timer
export const FocusButton: React.FC<{ onStart: () => void; variant?: 'bar' | 'rail' }> = ({ onStart, variant = 'bar' }) => {
  const live = useLivePlan();
  const [now, setNow] = React.useState(() => Date.now());
  const hold = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = React.useRef(false);

  React.useEffect(() => {
    if (!live?.running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [live?.running]);

  const R = 25, C = 2 * Math.PI * R;
  const elapsed = live ? liveElapsedMs(live, now) / 1000 : 0;
  const total = live ? liveTotalPlannedSeconds(live) : 0;
  const stopwatch = !!live && total <= 0;
  const progress = !live ? 0 : stopwatch ? (elapsed % 3600) / 3600 : Math.min(1, elapsed / total);
  const shown = !live ? 0 : stopwatch ? elapsed : Math.max(0, total - elapsed);
  const isBreak = !!live && liveKind(live) === 'break';
  const label = !live ? 'تمرکز' : !live.running ? 'متوقف' : isBreak ? 'استراحت' : 'مطالعه';

  const down = () => {
    held.current = false;
    if (!live) return;
    hold.current = setTimeout(() => {
      held.current = true;
      haptic(22);
      if (live.running) pauseLivePlan(); else resumeLivePlan();
    }, 520);
  };
  const up = () => { if (hold.current) { clearTimeout(hold.current); hold.current = null; } };

  return (
    <div className={'pn-focus-slot' + (variant === 'rail' ? ' rail' : '')}>
      <button
        type="button"
        className={'pn-focus' + (live ? ' live' : '') + (live && !live.running ? ' paused' : '') + (isBreak ? ' rest' : '')}
        style={live && !isBreak ? ({ ['--pn-c' as any]: liveColor(live) } as React.CSSProperties) : undefined}
        onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
        onClick={() => { if (held.current) { held.current = false; return; } if (live) openLiveTimer(); else onStart(); }}
        aria-label={live ? `تایمر ${label}؛ برای باز کردن بزن، برای توقف یا ادامه نگه دار` : 'شروع تایمر تمرکز'}
      >
        {live ? (
          <>
            <svg viewBox="0 0 56 56" className="pn-ring" aria-hidden="true">
              <circle cx="28" cy="28" r={R} className="bg" />
              <circle cx="28" cy="28" r={R} className="fg" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 28 28)" />
            </svg>
            <span className="pn-time">{clock(shown)}</span>
            {!live.running && <Pause size={11} className="pn-pause" />}
          </>
        ) : (
          <Timer size={26} strokeWidth={2.2} />
        )}
      </button>
      <span className="pn-label">{label}</span>
    </div>
  );
};

// ---------------------------------------------------------------- "more" sheet
type ThemeMode = 'light' | 'dark' | 'auto';
const MoreSheet: React.FC<{
  onClose: () => void; section: string; go: (s: Section) => void; themeMode: ThemeMode; onSetThemeMode: (m: ThemeMode) => void; onOpenMusic: () => void;
}> = ({ onClose, section, go, themeMode, onSetThemeMode, onOpenMusic }) => {
  const music = useMusic();
  const [hap, setHap] = React.useState(getHaptics());
  return (
    <Sheet onClose={onClose} label="بخش‌های بیشتر" z={500}>
      <button type="button" className="pn-search" onClick={() => { onClose(); setTimeout(openPalette, 120); }}>
        <Search size={17} /><span>جست‌وجو و فرمان‌ها</span><em>یا صفحه را از بالا بکش پایین</em>
      </button>
      <div className="pn-theme" role="radiogroup" aria-label="ظاهر برنامه">
        <span>ظاهر برنامه</span>
        <div>
          {([['light', 'روشن', <Sun size={16} key="l" />], ['dark', 'تیره', <Moon size={16} key="d" />], ['auto', 'خودکار', <Monitor size={16} key="a" />]] as const).map(([k, label, icon]) => (
            <button key={k} type="button" role="radio" aria-checked={themeMode === k} className={themeMode === k ? 'on' : ''} onClick={() => { hapticTap(); onSetThemeMode(k); }}>{icon}{label}</button>
          ))}
        </div>
      </div>
      <div className="pn-grid">
        {MORE.map((m) => (
          <button key={m.id} type="button" className={'pn-tile' + (section === m.id ? ' on' : '')} onClick={() => { hapticTap(); go(m.id); onClose(); }}>
            {m.icon}<span>{m.label}</span>
          </button>
        ))}
        <button type="button" className={'pn-tile' + (music.playing ? ' on' : '')} onClick={() => { onClose(); onOpenMusic(); }}>
          {music.playing ? <Equalizer on /> : <Music2 size={22} />}<span>موسیقی</span>
        </button>
        <button type="button" className={'pn-tile' + (hap ? ' on' : '')} onClick={() => { const v = !hap; setHaptics(v); setHap(v); }} aria-pressed={hap}>
          <Vibrate size={22} /><span>لرزش لمسی: {hap ? 'روشن' : 'خاموش'}</span>
        </button>
      </div>
    </Sheet>
  );
};

// ---------------------------------------------------------------- the bar
export const PhoneNav: React.FC<{
  section: string; setSection: (s: Section) => void; onStartTimer: () => void; onOpenMusic: () => void; themeMode: ThemeMode; onSetThemeMode: (m: ThemeMode) => void;
}> = ({ section, setSection, onStartTimer, onOpenMusic, themeMode, onSetThemeMode }) => {
  const [more, setMore] = React.useState(false);
  const inMore = MORE.some((m) => m.id === section);
  const tab = (id: Section, label: string, icon: React.ReactNode) => (
    <button key={id} type="button" role="tab" aria-selected={section === id} className={'pn-tab' + (section === id ? ' on' : '')} onClick={() => { hapticTap(); setSection(id); }}>
      <span className="pn-ic">{icon}</span><span className="pn-label">{label}</span>
    </button>
  );
  return (
    <>
      <nav className="pn-bar no-print" role="tablist" aria-label="بخش برنامه">
        {tab('today', 'امروز', <LayoutDashboard size={22} />)}
        {tab('planner', 'برنامه‌ریز', <CalendarRange size={22} />)}
        <FocusButton onStart={onStartTimer} />
        {tab('report', 'گزارش روز', <ClipboardList size={22} />)}
        <button type="button" className={'pn-tab' + (inMore || more ? ' on' : '')} onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more}>
          <span className="pn-ic"><LayoutGrid size={22} /></span><span className="pn-label">بیشتر</span>
        </button>
      </nav>
      {more && <MoreSheet onClose={() => setMore(false)} section={section} go={setSection} themeMode={themeMode} onSetThemeMode={onSetThemeMode} onOpenMusic={onOpenMusic} />}
    </>
  );
};
