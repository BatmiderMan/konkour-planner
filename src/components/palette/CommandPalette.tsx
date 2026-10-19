import React from 'react';
import {
  CalendarClock, CalendarRange, ClipboardList, CornerDownLeft, LayoutDashboard, Library, Monitor, Moon, Music2, Pause, Play, Plus, ScanLine,
  Search, SkipBack, SkipForward, Sun, Timer, Trophy
} from 'lucide-react';
import {
  dateKeyOf, addDays, createPlannerItem, insertByPin, loadPlannerData, savePlannerData, todayGregorian
} from '../../plannerStore';
import { getLivePlan, pauseLivePlan, requestFreeStart, requestLiveStart, resumeLivePlan } from '../../livePlan';
import { getMusicState, musicNext, musicPrev, musicToggle, currentTrack } from '../../musicStore';
import { OPEN_PALETTE_EVENT, haptic, openLiveTimer } from '../../focusBus';
import { showUndo } from '../../undo';
import { toPersianDigits } from '../../utils';
import { norm, parseTask } from './parseTask';
import './palette.css';

type Section = 'today' | 'planner' | 'schedule' | 'exams' | 'checker' | 'bank' | 'report';
type ThemeMode = 'light' | 'dark' | 'auto';
interface Cmd { id: string; label: string; hint?: string; group: string; keys: string; icon: React.ReactNode; run: () => void }

interface Props {
  onGo: (s: Section) => void;
  onSetThemeMode: (m: ThemeMode) => void;
  onStartTimer: () => void; // opens the start sheet
  onOpenMusic: () => void;
  onTaskAdded: () => void;
}

const SECTIONS: Array<[Section, string, React.ReactNode, string]> = [
  ['today', 'امروز', <LayoutDashboard size={18} key="a" />, 'خانه داشبورد'],
  ['planner', 'برنامه‌ریز', <CalendarRange size={18} key="b" />, 'برنامه هفته روزانه پلنر'],
  ['schedule', 'برنامه آزمون', <CalendarClock size={18} key="c" />, 'زمان‌بندی آزمون تقویم'],
  ['exams', 'آزمون‌ها', <Trophy size={18} key="d" />, 'نتایج تراز رتبه'],
  ['checker', 'تصحیح', <ScanLine size={18} key="e" />, 'اسکن پاسخنامه نمره کلید'],
  ['bank', 'بانک تست', <Library size={18} key="f" />, 'تست سوال کتاب'],
  ['report', 'گزارش روز', <ClipboardList size={18} key="g" />, 'گزارش ساعت مطالعه']
];

export const CommandPalette: React.FC<Props> = ({ onGo, onSetThemeMode, onStartTimer, onOpenMusic, onTaskAdded }) => {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const [pull, setPull] = React.useState(0);

  // open: event (Ctrl+K, buttons, pull-down)
  React.useEffect(() => {
    const on = () => { setQ(''); setSel(0); setOpen(true); haptic(8); };
    window.addEventListener(OPEN_PALETTE_EVENT, on);
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); on(); return; }
      if (e.code === 'Slash' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const el = e.target as HTMLElement | null; const tag = el?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
        if (document.querySelector('.tm-backdrop, .mp-backdrop, .dlg-overlay, .pn-back')) return;
        e.preventDefault(); on();
      }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener(OPEN_PALETTE_EVENT, on); window.removeEventListener('keydown', key); };
  }, []);
  React.useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 30); }, [open]);

  // phone: pull the page down from the very top to search
  React.useEffect(() => {
    let y0 = 0, x0 = 0, armed = false;
    const blocked = (t: EventTarget | null) => {
      let el = t as HTMLElement | null;
      if (el?.closest?.('.tm-backdrop, .mp-backdrop, .pn-back, .dlg-overlay, .cp, input, textarea, select')) return true;
      while (el && el !== document.body) { if (el.scrollTop > 0) return true; el = el.parentElement; }
      return false;
    };
    const start = (e: TouchEvent) => {
      armed = window.matchMedia('(max-width: 820px)').matches && window.scrollY <= 0 && !blocked(e.target);
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
    };
    const move = (e: TouchEvent) => {
      if (!armed) return;
      const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
      if (dy > 12 && dx < dy) setPull(Math.min(1, dy / 110)); else if (dy < 0) { armed = false; setPull(0); }
    };
    const end = () => {
      if (armed && pullRef.current >= 1) { setQ(''); setSel(0); setOpen(true); haptic(14); }
      armed = false; setPull(0);
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); };
  }, []);
  const pullRef = React.useRef(0);
  pullRef.current = pull;

  const close = () => setOpen(false);
  const run = (c: Cmd) => { close(); haptic(10); setTimeout(c.run, 0); };

  // ---- commands (rebuilt every time the palette is shown or the text changes: always fresh)
  const cmds = React.useMemo<Cmd[]>(() => {
    if (!open) return [];
    const out: Cmd[] = [];
    const live = getLivePlan();
    const music = getMusicState();
    const track = currentTrack(music);
    const data = loadPlannerData();
    const today = dateKeyOf(todayGregorian());

    if (live) {
      out.push({ id: 't-open', label: 'باز کردن تایمر', hint: live.running ? 'در حال اجرا' : 'متوقف', group: 'تایمر', keys: 'تایمر باز کردن timer', icon: <Timer size={18} />, run: openLiveTimer });
      out.push({ id: 't-toggle', label: live.running ? 'توقف تایمر' : 'ادامه‌ی تایمر', group: 'تایمر', keys: 'توقف ادامه pause resume تایمر', icon: live.running ? <Pause size={18} /> : <Play size={18} />, run: () => (live.running ? pauseLivePlan() : resumeLivePlan()) });
    } else {
      out.push({ id: 't-start', label: 'شروع تایمر', hint: 'انتخاب درس و زمان', group: 'تایمر', keys: 'شروع تایمر تمرکز start timer focus', icon: <Timer size={18} />, run: onStartTimer });
      out.push({ id: 't-free', label: 'شروع کرونومتر آزاد', hint: 'بدون زمان‌بندی', group: 'تایمر', keys: 'کرونومتر آزاد stopwatch', icon: <Timer size={18} />, run: () => { void requestFreeStart(today); } });
    }
    for (const it of (data.items[today] || []).filter((x) => !x.done).slice(0, 12)) {
      out.push({ id: 'p-' + it.id, label: `شروع: ${it.subject}${it.detail ? ' — ' + it.detail : ''}`, hint: 'از برنامه‌ی امروز', group: 'برنامه‌ی امروز', keys: `${it.subject} ${it.detail} شروع`, icon: <Play size={18} />, run: () => { void requestLiveStart(today, it); } });
    }
    for (const [id, label, icon, keys] of SECTIONS) out.push({ id: 's-' + id, label: `رفتن به ${label}`, group: 'بخش‌ها', keys: `${label} ${keys}`, icon, run: () => onGo(id) });
    out.push({ id: 'm-open', label: 'باز کردن پخش‌کننده‌ی موسیقی', group: 'موسیقی', keys: 'موسیقی پخش‌کننده music player', icon: <Music2 size={18} />, run: onOpenMusic });
    if (track) {
      out.push({ id: 'm-toggle', label: music.playing ? `توقف «${track.title}»` : `پخش «${track.title}»`, group: 'موسیقی', keys: 'پخش توقف موسیقی play pause', icon: music.playing ? <Pause size={18} /> : <Play size={18} />, run: musicToggle });
      if (!track.id.startsWith('amb:')) {
        out.push({ id: 'm-next', label: 'آهنگ بعدی', group: 'موسیقی', keys: 'بعدی next آهنگ', icon: <SkipBack size={18} />, run: musicNext });
        out.push({ id: 'm-prev', label: 'آهنگ قبلی', group: 'موسیقی', keys: 'قبلی prev آهنگ', icon: <SkipForward size={18} />, run: musicPrev });
      }
    } else out.push({ id: 'm-play', label: 'پخش موسیقی', group: 'موسیقی', keys: 'پخش موسیقی play', icon: <Play size={18} />, run: musicToggle });
    out.push({ id: 'th-l', label: 'حالت روشن', group: 'ظاهر', keys: 'روشن تم light theme', icon: <Sun size={18} />, run: () => onSetThemeMode('light') });
    out.push({ id: 'th-d', label: 'حالت تیره', group: 'ظاهر', keys: 'تیره تم شب dark theme', icon: <Moon size={18} />, run: () => onSetThemeMode('dark') });
    out.push({ id: 'th-a', label: 'حالت خودکار (مطابق سیستم)', group: 'ظاهر', keys: 'خودکار سیستم auto theme', icon: <Monitor size={18} />, run: () => onSetThemeMode('auto') });
    return out;
  }, [open, onGo, onSetThemeMode, onStartTimer, onOpenMusic]);

  const results = React.useMemo<Cmd[]>(() => {
    const text = norm(q);
    if (!text) return cmds.slice(0, 40);
    const toks = text.split(' ');
    const scored: Array<[number, Cmd]> = [];
    for (const c of cmds) {
      const hay = norm(c.label + ' ' + c.keys);
      let score = 0, okAll = true;
      for (const tk of toks) {
        const i = hay.indexOf(tk);
        if (i < 0) { okAll = false; break; }
        score += i === 0 ? 0 : hay.includes(' ' + tk) ? 4 : 12;
      }
      if (okAll) scored.push([score + (norm(c.label).startsWith(toks[0]) ? -6 : 0), c]);
    }
    scored.sort((a, b) => a[0] - b[0]);
    const found = scored.map((x) => x[1]).slice(0, 40);
    // a sentence that is not a command can be planned right away
    const subjects = loadPlannerData().subjects.map((s) => s.n);
    const parsed = parseTask(q, subjects);
    if (parsed) {
      const when = parsed.tomorrow ? 'فردا' : 'امروز';
      const mins = parsed.minutes ? ` · ${toPersianDigits(parsed.minutes)} دقیقه` : '';
      found.push({
        id: 'add', label: `افزودن به برنامه‌ی ${when}: ${parsed.subject}${parsed.detail ? ' — ' + toPersianDigits(parsed.detail) : ''}`, hint: `${parsed.grade || 'دوازدهم'}${mins}`,
        group: 'افزودن سریع', keys: '', icon: <Plus size={18} />,
        run: () => {
          const data = loadPlannerData();
          const key = dateKeyOf(parsed.tomorrow ? addDays(todayGregorian(), 1) : todayGregorian());
          const item = createPlannerItem({ subject: parsed.subject, detail: toPersianDigits(parsed.detail), grade: parsed.grade || 'دوازدهم', minutes: parsed.minutes });
          data.items[key] = insertByPin(data.items[key] || [], item, key, data);
          savePlannerData(data); onTaskAdded();
          showUndo(`«${parsed.subject}» به برنامه‌ی ${when} اضافه شد`, () => {
            const d = loadPlannerData();
            d.items[key] = (d.items[key] || []).filter((x) => x.id !== item.id);
            savePlannerData(d); onTaskAdded();
          });
        }
      });
    }
    return found;
  }, [cmds, q, onTaskAdded]);

  React.useEffect(() => { setSel(0); }, [q]);
  React.useEffect(() => { list.current?.querySelector('.cp-item.on')?.scrollIntoView({ block: 'nearest' }); }, [sel, results]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = results[sel]; if (c) run(c); }
  };

  return (
    <>
      {pull > 0 && !open && (
        <div className="cp-pull" style={{ opacity: pull, transform: `translateY(${pull * 26}px) scale(${0.9 + pull * 0.1})` }} aria-hidden="true">
          <Search size={15} /> {pull >= 1 ? 'رها کن تا جست‌وجو باز شود' : 'بکش پایین برای جست‌وجو'}
        </div>
      )}
      {open && (
        <div className="cp-back" onClick={close}>
          <div className="cp" role="dialog" aria-modal="true" aria-label="جست‌وجو و فرمان‌ها" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
            <div className="cp-field">
              <Search size={18} />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو یا فرمان… مثلاً «ریاضی ۴۵ دقیقه فردا»" aria-label="جست‌وجو" role="combobox" aria-expanded="true" aria-controls="cp-list" />
              <kbd>Esc</kbd>
            </div>
            <div className="cp-list" id="cp-list" role="listbox" ref={list}>
              {results.map((c, i) => (
                <React.Fragment key={c.id}>
                  {(i === 0 || results[i - 1].group !== c.group) && <div className="cp-group">{c.group}</div>}
                  <button type="button" role="option" aria-selected={i === sel} className={'cp-item' + (i === sel ? ' on' : '')} onMouseMove={() => setSel(i)} onClick={() => run(c)}>
                    <span className="cp-ic">{c.icon}</span>
                    <span className="cp-tx"><b>{c.label}</b>{c.hint && <em>{c.hint}</em>}</span>
                    {i === sel && <CornerDownLeft size={14} className="cp-enter" />}
                  </button>
                </React.Fragment>
              ))}
              {!results.length && <div className="cp-empty">چیزی پیدا نشد</div>}
            </div>
            <div className="cp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> انتخاب</span><span><kbd>↵</kbd> اجرا</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> باز کردن</span></div>
          </div>
        </div>
      )}
    </>
  );
};
