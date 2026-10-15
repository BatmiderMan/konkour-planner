import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Coffee, Expand, Maximize2, Minimize2, Minus, Pause, PictureInPicture2, Play, Plus, Shrink, SlidersHorizontal, Square, X } from 'lucide-react';
import { PlannerItem, StudyBlock } from '../../types';
import { loadPlannerData, patchPlannerItem } from '../../plannerStore';
import {
  LiveResult,
  cancelLivePlan,
  extendLivePlan,
  freezeLivePlan,
  getLivePlan,
  liveColor,
  liveElapsedMs,
  liveKind,
  liveTotalPlannedSeconds,
  markLiveAlerted,
  markLiveWarned,
  pauseLivePlan,
  requestBreakStart,
  resumeLivePlan,
  useLivePlan
} from '../../livePlan';
import { alertDialog, confirmDialog } from '../../dialog';
import { playAlarm, playDone, playHeadsUp, playTick, secondsLabel, tickStep, unlockAudio, useTickPrefs } from '../../tickSound';
import { toPersianDigits } from '../../utils';
import { TimerDial } from './TimerDial';
import { TickPanel } from './TickPanel';
import { FinishForm } from './FinishForm';
import { StartPicker } from './StartPicker';
import { MusicCompact } from '../music/MusicPlayer';
import { PipTimer, pipSupported, preparePipWindow } from './LivePip';
import { FocusFx } from './FocusFx';
import { LookPanel } from './LookPanel';
import { ACCENTS, OVER_QUOTE, quoteFor, useLook } from './timerLook';
import { dialModel, fmtClock } from './timerMath';

interface LiveTimerProps {
  reportDateKey: string; // jalali day open in the report (used by the start picker)
  reportDayLabel: string;
  pickerOpen: boolean; // the reporter asked to start a session
  onClosePicker: () => void;
  // Called when the user saves the finished session. The parent puts the block into the
  // report of `dateKey` (creating that day if needed).
  onSaveToReport: (dateKey: string, item: PlannerItem, block: StudyBlock) => void;
  onOpenMusic: () => void; // opens the music player on top of the timer
}

const FULL_KEY = 'planex_timer_full';
/** wall-clock time + Persian date for the top of the full view */
function wallText(ms: number, en: boolean): { time: string; date: string } {
  const d = new Date(ms);
  try {
    return {
      time: new Intl.DateTimeFormat(en ? 'en-GB' : 'fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d),
      date: new Intl.DateTimeFormat(en ? 'en-u-ca-persian' : 'fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
    };
  } catch {
    return { time: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, date: '' };
  }
}
const browserFsSupported = () => typeof document !== 'undefined' && !!document.fullscreenEnabled;

export const LiveTimer: React.FC<LiveTimerProps> = ({ reportDateKey, reportDayLabel, pickerOpen, onClosePicker, onSaveToReport, onOpenMusic }) => {
  const live = useLivePlan();
  const look = useLook();
  const tick = useTickPrefs();
  const [expanded, setExpanded] = React.useState(false);
  // full-screen "focus view": phones open it by default, desktops the sheet (remembered once changed)
  const [full, setFull] = React.useState<boolean>(() => {
    try { const v = localStorage.getItem(FULL_KEY); if (v === '1' || v === '0') return v === '1'; } catch { /* ignore */ }
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;
  });
  const [calm, setCalm] = React.useState(false); // chrome faded away
  const [bfs, setBfs] = React.useState(false); // the browser itself is full-screen
  const ownFs = React.useRef(false); // we asked for it (so we may leave it)
  const [lookOpen, setLookOpen] = React.useState(false); // the customize drawer
  const [wall, setWall] = React.useState(() => Date.now()); // real time, for the top clock
  const [now, setNow] = React.useState(() => Date.now());
  const [result, setResult] = React.useState<LiveResult | null>(null);
  const [offer, setOffer] = React.useState<{ dateKey: string; minutes: number } | null>(null);
  const wakeRef = React.useRef<any>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);

  const sessionKey = live ? `${live.dateKey}|${live.item.id}|${live.startedAtClock}` : '';
  const kind = live ? liveKind(live) : 'plan';
  const isBreak = kind === 'break';

  // opening the finish form starts at its top
  React.useEffect(() => { if (result && sheetRef.current) sheetRef.current.scrollTo({ top: 0 }); }, [result]);

  // ---- the reporter asked for a timer while one is already running -> just open it
  React.useEffect(() => {
    if (pickerOpen && live) { setExpanded(true); setResult(null); onClosePicker(); }
  }, [pickerOpen, live, onClosePicker]);

  const toggleFull = () => setFull((f) => {
    const v = !f;
    try { localStorage.setItem(FULL_KEY, v ? '1' : '0'); } catch { /* ignore */ }
    return v;
  });
  const toggleBrowserFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen(); ownFs.current = true; }
    } catch { /* refused: the in-app full view still works */ }
  };
  React.useEffect(() => {
    const onChange = () => { const on = !!document.fullscreenElement; setBfs(on); if (!on) ownFs.current = false; };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  // leaving the full view / minimizing / finishing also leaves browser full-screen if we started it
  const fsView = full && !result;
  React.useEffect(() => {
    if ((!live || !expanded || !fsView) && ownFs.current && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      ownFs.current = false;
    }
  }, [live, expanded, fsView]);

  // full view: after a few quiet seconds the chrome fades so only the clock is left
  const calmDelay = look.calmAfter * 1000;
  const calmArmed = !!live && live.running && expanded && fsView && calmDelay > 0 && !lookOpen;
  React.useEffect(() => {
    if (!calmArmed) { setCalm(false); return; }
    let t = 0;
    const arm = () => { setCalm(false); window.clearTimeout(t); t = window.setTimeout(() => setCalm(true), calmDelay); };
    arm();
    const evs = ['pointermove', 'pointerdown', 'keydown', 'touchstart'];
    evs.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    return () => { window.clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, arm)); };
  }, [calmArmed, calmDelay]);

  // the customize drawer only exists in the full view
  React.useEffect(() => { if ((!fsView || !expanded) && lookOpen) setLookOpen(false); }, [fsView, expanded, lookOpen]);
  // real-time clock at the top (minute resolution is enough)
  React.useEffect(() => {
    if (!(expanded && fsView && look.showClock)) return;
    setWall(Date.now());
    const id = setInterval(() => setWall(Date.now()), 10000);
    return () => clearInterval(id);
  }, [expanded, fsView, look.showClock]);
  // optional: go browser-full-screen as soon as the full view opens (the click that opened it is the permission)
  React.useEffect(() => {
    if (!(expanded && fsView && look.autoFs && browserFsSupported()) || document.fullscreenElement) return;
    document.documentElement.requestFullscreen().then(() => { ownFs.current = true; }).catch(() => { /* needs a fresh tap: the button still works */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, fsView, look.autoFs]);

  // ---- mini always-on-top window
  const [pipWin, setPipWin] = React.useState<Window | null>(null);
  const pipRef = React.useRef<Window | null>(null);
  const togglePip = async () => {
    if (pipRef.current) { pipRef.current.close(); return; }
    if (!pipSupported()) {
      await alertDialog('پنجره‌ی شناور فقط در Chrome / Edge نسخه‌ی دسکتاپ (۱۱۶ به بالا) پشتیبانی می‌شود.');
      return;
    }
    try {
      const w: Window = await (window as any).documentPictureInPicture.requestWindow({ width: 300, height: 200 });
      preparePipWindow(w);
      pipRef.current = w;
      setPipWin(w);
      w.addEventListener('pagehide', () => { pipRef.current = null; setPipWin(null); });
    } catch {
      await alertDialog('باز کردن پنجره‌ی شناور ممکن نشد.');
    }
  };
  React.useEffect(() => { if (!live && pipRef.current) pipRef.current.close(); }, [live]);
  React.useEffect(() => () => { pipRef.current?.close(); }, []);

  // ---- tick sound: scheduled on the audio clock from the ACTIVE time of the session, so pauses shift the
  // ticks, a long screen-off gap gives one catch-up tick and UI jitter never moves a tick.
  const tickRunning = !!live && live.running && tick.on && !isBreak;
  React.useEffect(() => {
    if (!tickRunning) return;
    const intervalMs = tick.seconds * 1000;
    const s0 = getLivePlan();
    if (!s0) return;
    let last = Math.floor(liveElapsedMs(s0) / intervalMs);
    const timers: number[] = [];
    const id = window.setInterval(() => {
      const s = getLivePlan();
      if (!s || !s.running) return;
      const r = tickStep(liveElapsedMs(s), last, intervalMs, 350);
      if (!r.fire) return;
      last = r.last;
      playTick(tick.style, r.delayMs / 1000);
      if (tick.vibrate) timers.push(window.setTimeout(() => { try { navigator.vibrate && navigator.vibrate(60); } catch { /* ignore */ } }, r.delayMs));
    }, 100);
    return () => { window.clearInterval(id); timers.forEach((x) => window.clearTimeout(x)); };
  }, [tickRunning, tick.seconds, tick.style, tick.vibrate, sessionKey]);

  // a brand-new session opens the sheet (a session restored after a reload stays minimized)
  const prevKey = React.useRef(sessionKey);
  React.useEffect(() => {
    if (sessionKey && sessionKey !== prevKey.current) { setExpanded(true); setResult(null); setOffer(null); }
    prevKey.current = sessionKey;
  }, [sessionKey]);

  // ticker (timestamp based, so background throttling can't make it drift)
  const running = !!live && live.running;
  React.useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [running]);

  // keep the screen awake while running
  React.useEffect(() => {
    const req = async () => {
      try { if ('wakeLock' in navigator) wakeRef.current = await (navigator as any).wakeLock.request('screen'); } catch { /* not critical */ }
    };
    const rel = () => { if (wakeRef.current) { wakeRef.current.release().catch(() => {}); wakeRef.current = null; } };
    if (running) req(); else rel();
    const onVis = () => { if (document.visibilityState === 'visible' && running) req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); rel(); };
  }, [running]);

  const elapsedSec = live ? Math.floor(liveElapsedMs(live, now) / 1000) : 0;
  const totalSec = live ? liveTotalPlannedSeconds(live) : 0;
  const model = dialModel(elapsedSec, totalSec, tick.on && !isBreak, tick.seconds, isBreak);

  // the browser tab shows the time too, so you can glance at it from another tab
  React.useEffect(() => {
    if (!live || !live.running) return;
    const old = document.title;
    document.title = `${model.over ? '+' : ''}${toPersianDigits(fmtClock(model.shown))} · ${live.item.subject}`;
    return () => { document.title = old; };
  }, [live, model.shown, model.over]);

  // planned time reached -> alert once, and pop the sheet open. One minute before: a gentle heads-up.
  React.useEffect(() => {
    if (!live || !live.running || totalSec <= 0) return;
    if (!live.alerted && elapsedSec >= totalSec) {
      markLiveAlerted();
      setExpanded(true);
      if (isBreak) playDone(); else playAlarm();
      try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch { /* ignore */ }
    } else if (!isBreak && !live.warned && totalSec >= 180 && totalSec - elapsedSec <= 60 && elapsedSec < totalSec) {
      markLiveWarned();
      playHeadsUp();
    }
  }, [live, elapsedSec, totalSec, isBreak]);

  // offer to rest after a saved session; fades away by itself
  React.useEffect(() => {
    if (!offer) return;
    const id = window.setTimeout(() => setOffer(null), 30000);
    return () => window.clearTimeout(id);
  }, [offer]);

  // ---- keyboard (desktop): Space pause/resume · F full view · Esc minimize
  React.useEffect(() => {
    if (!live || !expanded || result) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input,textarea,select,button,[role=switch]')) return;
      if (e.key === ' ') { e.preventDefault(); live.running ? pauseLivePlan() : resumeLivePlan(); }
      else if (e.key === 'Escape') setExpanded(false);
      else if (e.key === 'f' || e.key === 'F') toggleFull();
      else if ((e.key === 'c' || e.key === 'C') && full) setLookOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, expanded, result, full]);

  const pickerNode = pickerOpen && !live ? <StartPicker dateKey={reportDateKey} dayLabel={reportDayLabel} onClose={onClosePicker} /> : null;
  const offerNode = offer && !live ? (
    <div className="tm-offer" role="status">
      <Coffee size={20} />
      <span><b>ثبت شد ✓</b> یک استراحت {toPersianDigits(offer.minutes)} دقیقه‌ای؟</span>
      <button type="button" onClick={() => { requestBreakStart(offer.dateKey, offer.minutes); setOffer(null); }}>شروع استراحت</button>
      <button type="button" className="x" onClick={() => setOffer(null)} aria-label="بستن"><X size={16} /></button>
    </div>
  ) : null;

  if (!live) return <>{pickerNode}{offerNode}</>;

  const color = liveColor(live);
  const accent = ACCENTS.find((a) => a.id === look.accent);
  const sheetVars: Record<string, string> = { ['--c']: color };
  if (fsView) {
    sheetVars['--tm-scale'] = String(look.size / 100);
    if (accent && accent.id !== 'auto') { sheetVars['--ac-a'] = accent.a; sheetVars['--ac-b'] = accent.b; }
  }
  const item = live.item;
  const tickIdx = tick.on && !isBreak ? Math.floor(elapsedSec / tick.seconds) : 0;
  const nextIn = tick.seconds - (elapsedSec % tick.seconds);
  const ticksLeft = totalSec > 0 ? (model.over ? 0 : Math.floor((totalSec - elapsedSec) / tick.seconds)) : null;
  const en = fsView && look.digits === 'en';
  const fd = (v: string | number) => (en ? String(v) : toPersianDigits(v));
  const clockText = `${model.over ? '+' : ''}${fd(fmtClock(model.shown))}`;
  const pct = totalSec > 0 ? Math.min(100, Math.floor((elapsedSec / totalSec) * 100)) : null;
  const wallNow = fsView && look.showClock ? wallText(wall, en) : null;
  const stopwatch = totalSec === 0;

  const handleFinish = () => {
    if (isBreak) { cancelLivePlan(); setExpanded(false); return; }
    const r = freezeLivePlan();
    if (!r) return;
    setResult(r);
    setExpanded(true);
  };

  const handleCancel = async () => {
    const ok = await confirmDialog(isBreak ? 'استراحت تمام شود؟' : 'این پلن زنده لغو شود؟ زمان ثبت‌شده در گزارش وارد نمی‌شود.');
    if (!ok) return;
    cancelLivePlan();
    setResult(null);
  };

  const handleSave = (block: StudyBlock, linked: PlannerItem | null) => {
    if (!result) return;
    const { dateKey, item: it } = result.session;
    onSaveToReport(dateKey, it, block);
    if (linked) patchPlannerItem(dateKey, linked.id, { done: true, sentToReport: true });
    cancelLivePlan();
    setResult(null);
    setExpanded(false);
    playDone();
    setOffer({ dateKey, minutes: loadPlannerData().schedule.breakMinutes || 5 });
  };

  const pipNode = pipWin ? createPortal(<PipTimer win={pipWin} />, pipWin.document.body) : null;
  const pipActive = !!pipWin;
  const toggleRun = () => { unlockAudio(); live.running ? pauseLivePlan() : resumeLivePlan(); };

  const labelTop = isBreak
    ? model.over ? 'استراحت تمام شد' : 'استراحت'
    : stopwatch ? 'مدت مطالعه' : model.over ? 'از زمان برنامه گذشته‌ای' : 'باقی‌مانده';
  const subline = isBreak ? 'چشم‌ها را از صفحه بردار، آب بخور' : [kind === 'plan' ? item.grade : 'مطالعه‌ی آزاد', item.detail, item.source ? `📕 ${item.source}` : ''].filter(Boolean).join(' · ');

  // ---------- minimized pill ----------
  if (!expanded && !result) {
    const C = 2 * Math.PI * 15;
    return (
      <>
        <div className={`tm-pill ph-${model.phase}` + (live.running ? '' : ' paused')} style={{ ['--c' as any]: color }} role="status">
          <button type="button" className="tm-pill-main" onClick={() => setExpanded(true)} aria-label="باز کردن تایمر">
            <svg viewBox="0 0 36 36" className="tm-pill-ring" aria-hidden="true">
              <circle cx="18" cy="18" r="15" className="bg" />
              <circle cx="18" cy="18" r="15" className="fg" transform="rotate(-90 18 18)" style={{ strokeDasharray: C, strokeDashoffset: C - C * model.progress }} />
            </svg>
            <span className="tm-pill-name">{item.subject}</span>
            {tick.on && !isBreak && <i className="tm-pill-tick" title={`تیک هر ${secondsLabel(tick.seconds)}`}>♪{toPersianDigits(tickIdx)}</i>}
            <span className="tm-pill-time">{model.over ? '+' : ''}{toPersianDigits(fmtClock(model.shown))}</span>
          </button>
          <button type="button" className="tm-pill-btn" onClick={toggleRun} aria-label={live.running ? 'توقف موقت' : 'ادامه'}>
            {live.running ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" className={'tm-pill-btn' + (pipActive ? ' on' : '')} onClick={togglePip} aria-label="پنجره‌ی شناور" title="پنجره‌ی شناور روی همه‌ی پنجره‌ها">
            <PictureInPicture2 size={16} />
          </button>
        </div>
        {pipNode}
      </>
    );
  }

  const SIDE = 5;
  return (
    <>
      {pipNode}
      <div className={'tm-backdrop' + (fsView ? ' full' : '')} onClick={() => !result && !fsView && setExpanded(false)}>
        <div ref={sheetRef} className={`tm-sheet ph-${model.phase}` + (result ? ' is-form' : '') + (fsView ? ' full' : '') + (calm ? ' calm' : '') + (lookOpen ? ' look-open' : '')} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={sheetVars as React.CSSProperties}
          {...(fsView ? { 'data-theme': look.theme, 'data-accent': look.accent, 'data-font': look.font, 'data-layout': look.layout, 'data-style': look.style, 'data-glow': look.glow ? 'on' : 'off', 'data-dim': look.dimCalm ? 'on' : 'off' } : {})}>
          {fsView && <FocusFx kind={look.fx} level={look.fxLevel} />}
          {wallNow && (
            <div className="tm-topclock" aria-hidden="true"><b>{wallNow.time}</b>{wallNow.date && <span>{wallNow.date}</span>}</div>
          )}
          <div className={'tm-head' + (fsView && !look.showHeader ? ' no-title' : '')}>
            <div className="tm-head-title">
              <i className={'tm-live-dot' + (live.running ? '' : ' off')} />
              <div>
                <h2>{result ? 'پایان — ثبت در گزارش' : item.subject}</h2>
                <span>{result ? `گزارش روز ${toPersianDigits(live.dateKey)}` : subline}</span>
              </div>
            </div>
            {!result && (
              <div className="tm-head-actions">
                {fsView && (
                  <button type="button" className={'tm-icon-btn' + (lookOpen ? ' on' : '')} onClick={() => setLookOpen((v) => !v)} aria-pressed={lookOpen} aria-label="شخصی‌سازی نمای تمام‌صفحه" title="شخصی‌سازی (C)">
                    <SlidersHorizontal size={18} />
                  </button>
                )}
                <button type="button" className={'tm-icon-btn' + (pipActive ? ' on' : '')} onClick={togglePip} aria-label="پنجره‌ی شناور" title="پنجره‌ی کوچک که روی همه‌ی پنجره‌ها می‌ماند"><PictureInPicture2 size={18} /></button>
                {fsView && browserFsSupported() && (
                  <button type="button" className={'tm-icon-btn' + (bfs ? ' on' : '')} onClick={toggleBrowserFs} aria-label={bfs ? 'خروج از تمام‌صفحه‌ی مرورگر' : 'تمام‌صفحه‌ی مرورگر'} title={bfs ? 'خروج از تمام‌صفحه‌ی مرورگر' : 'تمام‌صفحه‌ی مرورگر (بدون نوار آدرس)'}>
                    {bfs ? <Shrink size={18} /> : <Expand size={18} />}
                  </button>
                )}
                <button type="button" className="tm-icon-btn" onClick={toggleFull} aria-label={full ? 'نمای کوچک‌تر' : 'نمای تمام‌صفحه'} title={full ? 'نمای کوچک‌تر (F)' : 'نمای تمام‌صفحه (F)'}>
                  {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button type="button" className="tm-icon-btn" onClick={() => setExpanded(false)} aria-label="کوچک کردن" title="کوچک کردن (Esc)"><ChevronDown size={20} /></button>
              </div>
            )}
          </div>

          {result ? (
            <FinishForm result={result} onSave={handleSave} onBack={() => setResult(null)} />
          ) : (
            <div className="tm-body">
              <div className="tm-stage">
                <TimerDial model={model} running={live.running} tickKey={tickIdx} tickOn={tick.on && !isBreak} variant={fsView ? look.style : 'dial'}>
                  <span className="tm-dial-label">{labelTop}</span>
                  <span className="tm-time" data-len={clockText.length}>{clockText}</span>
                  <span className={'tm-dial-state' + (live.running ? '' : ' paused')}>
                    <i />
                    {!live.running ? 'متوقف شده' : isBreak ? 'در حال استراحت' : model.over ? 'اضافه‌کار' : model.phase === 'warn' ? 'ته‌مانده‌ی وقت…' : 'در حال مطالعه'}
                  </span>
                  {fsView && look.showPercent && pct !== null && !isBreak && <span className="tm-pct">{fd(pct)}٪</span>}
                </TimerDial>
                {fsView && look.showQuote && (
                  <p className="tm-quote">{model.over && !isBreak ? OVER_QUOTE : quoteFor(now, isBreak)}</p>
                )}
              </div>

              <div className="tm-side">
                {!isBreak && (!fsView || look.showStats) && (
                  <div className="tm-meta">
                    <span>شروع <b>{toPersianDigits(live.startedAtClock)}</b></span>
                    <span>برنامه <b>{stopwatch ? 'نامحدود' : `${toPersianDigits(Math.round(totalSec / 60))} دقیقه`}</b></span>
                    <span>مطالعه <b>{toPersianDigits(Math.floor(elapsedSec / 60))} دقیقه</b></span>
                  </div>
                )}

                <div className="tm-controls">
                  {!stopwatch ? (
                    <button type="button" className="tm-round" onClick={() => extendLivePlan(-SIDE)} aria-label="۵ دقیقه کمتر" title="۵ دقیقه کمتر"><Minus size={14} />{toPersianDigits(SIDE)}</button>
                  ) : <span />}
                  <button type="button" className={'tm-play' + (live.running ? ' pause' : '')} onClick={toggleRun} aria-label={live.running ? 'توقف موقت' : 'ادامه'} title="فاصله (Space)">
                    {live.running ? <Pause size={30} /> : <Play size={30} />}
                  </button>
                  {!stopwatch ? (
                    <button type="button" className="tm-round" onClick={() => extendLivePlan(SIDE)} aria-label="۵ دقیقه بیشتر" title="۵ دقیقه بیشتر"><Plus size={14} />{toPersianDigits(SIDE)}</button>
                  ) : <span />}
                </div>

                {(!fsView || look.showTools) && <div className="tm-tools">
                  {!isBreak && <TickPanel running={live.running} tickIdx={tickIdx} nextIn={nextIn} ticksLeft={ticksLeft} />}
                  <MusicCompact onOpen={onOpenMusic} />
                </div>}

                <div className="tm-finish-row">
                  <button type="button" className="tm-btn-main finish" onClick={handleFinish}>
                    <Square size={16} /> {isBreak ? 'پایان استراحت' : 'اتمام و ثبت در گزارش'}
                  </button>
                  {!isBreak && <button type="button" className="tm-btn-ghost danger" onClick={handleCancel}>لغو</button>}
                </div>
              </div>
            </div>
          )}
          {fsView && lookOpen && <LookPanel onClose={() => setLookOpen(false)} fsSupported={browserFsSupported()} />}
        </div>
      </div>
    </>
  );
};
