import React from 'react';
import {
  CalendarClock, CalendarRange, ClipboardList, Gem, LayoutDashboard, Library, ListChecks, Monitor, Moon, Music2, Pause, Play, ScanLine, Search, Settings2, Sun, Timer, Trophy, Vibrate
} from 'lucide-react';
import { OPEN_MORE_EVENT, SPACES, SpaceId, entryOf, spaceOf } from '../../nav';
import {
  liveColor, liveElapsedMs, liveKind, liveTotalPlannedSeconds, pauseLivePlan, resumeLivePlan, useLivePlan
} from '../../livePlan';
import { useMusic } from '../../musicStore';
import { Equalizer } from '../music/musicUi';
import { getHaptics, haptic, hapticTap, openLiveTimer, openPalette, setHaptics } from '../../focusBus';
import { Sheet } from '../ui/Sheet';
import { toPersianDigits } from '../../utils';
import { Clock } from '../../clock/Clock';
import { useNow } from '../../clock/useNow';
import './phone.css';

type Section = 'today' | 'planner' | 'tracker' | 'schedule' | 'exams' | 'checker' | 'bank' | 'vault' | 'report' | 'settings';
const SPACE_ICON: Record<SpaceId, React.ReactNode> = {
  today: <LayoutDashboard size={22} />, plan: <CalendarRange size={22} />, study: <ListChecks size={22} />, insight: <ClipboardList size={22} />, settings: <Settings2 size={22} />
};
const MORE: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: 'settings', label: 'تنظیمات', icon: <Settings2 size={22} /> },
  { id: 'planner', label: 'برنامه‌ریز', icon: <CalendarRange size={22} /> },
  { id: 'report', label: 'گزارش روز', icon: <ClipboardList size={22} /> },
  { id: 'tracker', label: 'پیگیری مباحث', icon: <ListChecks size={22} /> },
  { id: 'schedule', label: 'برنامه آزمون', icon: <CalendarClock size={22} /> },
  { id: 'exams', label: 'آزمون‌ها', icon: <Trophy size={22} /> },
  { id: 'checker', label: 'تصحیح', icon: <ScanLine size={22} /> },
  { id: 'bank', label: 'بانک تست', icon: <Library size={22} /> },
  { id: 'vault', label: 'گنجینه سؤال', icon: <Gem size={22} /> }
];

// ---------------------------------------------------------------- the centre button: start / live timer
export const FocusButton: React.FC<{ onStart: () => void; variant?: 'bar' | 'rail' }> = ({ onStart, variant = 'bar' }) => {
  const live = useLivePlan();
  const now = useNow(!!live?.running, () => (live ? liveElapsedMs(live) % 1000 : 0));
  const hold = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = React.useRef(false);

  const R = 25, C = 2 * Math.PI * R;
  const elapsed = live ? Math.floor(liveElapsedMs(live, now) / 1000) : 0;
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
            <span className="pn-time"><Clock sec={shown} running={live.running} secs={shown < 3600} round={stopwatch ? 'floor' : 'ceil'} /></span>
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
  React.useEffect(() => {
    const open = () => setMore(true);
    window.addEventListener(OPEN_MORE_EVENT, open);
    return () => window.removeEventListener(OPEN_MORE_EVENT, open);
  }, []);
  const cur = spaceOf(section).id;
  const tab = (id: SpaceId, label: string) => (
    <button key={id} type="button" role="tab" aria-selected={cur === id} className={'pn-tab' + (cur === id ? ' on' : '')} onClick={() => { hapticTap(); setSection(entryOf(SPACES.find((x) => x.id === id)!)); }}>
      <span className="pn-ic">{SPACE_ICON[id]}</span><span className="pn-label">{label}</span>
    </button>
  );
  return (
    <>
      <nav className="pn-bar no-print" role="tablist" aria-label="بخش برنامه">
        {tab('today', 'امروز')}
        {tab('plan', 'برنامه')}
        <FocusButton onStart={onStartTimer} />
        {tab('study', 'مطالعه')}
        {tab('insight', 'تحلیل')}
      </nav>
      {more && <MoreSheet onClose={() => setMore(false)} section={section} go={setSection} themeMode={themeMode} onSetThemeMode={onSetThemeMode} onOpenMusic={onOpenMusic} />}
    </>
  );
};
