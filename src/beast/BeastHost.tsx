import React from 'react';
import { createPortal } from 'react-dom';
import { Camera, Coffee, Flame, Flag, ShieldAlert } from 'lucide-react';
import { PlannerItem, StudyBlock } from '../types';
import { loadPlannerData } from '../plannerStore';
import { confirmDialog } from '../dialog';
import { playTick } from '../tickSound';
import { toPersianDigits as P } from '../utils';
import { minToTime } from '../plannerSchedule';
import { OPEN_BEAST_EVENT, ackVerdict, useBeast, useBeastRun } from './beastStore';
import { absMs, endExcuse, forfeitRunning, getAlarmLevel, partLive, setEngineEnv, startExcuse, tick, todayKey } from './beastEngine';
import { calibrate, startCamera, stopCamera, usePresence } from './presence';
import { BeastPart, verdictFor } from './beastRules';
import { BeastContract } from './BeastContract';
import './beast.css';

const mmss = (ms: number): string => { const s = Math.max(0, Math.ceil(ms / 1000)); return P(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); };

/** the little live picture of the camera in the HUD (mirrored, tiny; it is only shown to the student, never stored) */
const Preview: React.FC<{ stream: MediaStream | null; tone: 'ok' | 'warn' | 'bad' | 'off' }> = ({ stream, tone }) => {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) v.play().catch(() => undefined);
  }, [stream]);
  return (
    <span className={'bs-cam ' + tone} aria-hidden="true">
      {stream ? <video ref={ref} muted playsInline /> : <Camera size={18} />}
    </span>
  );
};

/**
 * Mounted once in App. It runs the engine clock, and draws everything Beast mode puts on screen:
 * the floating chip, the 60-second countdown, the HUD while a part runs, the «come back» alarm, notes and the day's verdict.
 */
export const BeastHost: React.FC<{ onSaveToReport: (dateKey: string, item: PlannerItem, block: StudyBlock) => void }> = ({ onSaveToReport }) => {
  const beast = useBeast();
  const run = useBeastRun();
  const cam = usePresence();
  const on = beast.settings.on;
  const [now, setNow] = React.useState(() => Date.now());
  const [toast, setToast] = React.useState('');
  const [sheet, setSheet] = React.useState(false);
  const saveRef = React.useRef(onSaveToReport);
  saveRef.current = onSaveToReport;

  React.useEffect(() => {
    setEngineEnv({ save: (d, i, b) => saveRef.current(d, i, b), notify: (t) => setToast(t) });
  }, []);
  React.useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 6000); return () => clearTimeout(id); }, [toast]);
  React.useEffect(() => {
    const open = () => setSheet(true);
    window.addEventListener(OPEN_BEAST_EVENT, open);
    return () => window.removeEventListener(OPEN_BEAST_EVENT, open);
  }, []);

  // the clock: once a second, timestamp based, so a throttled background tab only makes it late, never wrong
  React.useEffect(() => {
    if (!on) return;
    tick(Date.now());
    const id = setInterval(() => { const t = Date.now(); tick(t); setNow(t); }, 1000);
    return () => clearInterval(id);
  }, [on]);

  const today = todayKey();
  const day = on ? run.days[today] : undefined;
  const running: BeastPart | undefined = day && !day.closed ? day.parts.find((p) => p.status === 'running') : undefined;
  const next: BeastPart | undefined = day && !day.closed ? day.parts.find((p) => p.status === 'pending') : undefined;
  const nextIn = next ? absMs(next.startMin, new Date(now)) - now : null;

  // the camera is on only when a part is running or about to start (or while the contract sheet is open)
  const wantCam = on && beast.settings.camera && ((!!running) || (nextIn !== null && nextIn < 180000));
  React.useEffect(() => {
    if (wantCam) void startCamera();
    else if (!sheet) stopCamera();
  }, [wantCam, sheet]);

  React.useEffect(() => {
    document.body.classList.toggle('beast-live', !!running);
    return () => document.body.classList.remove('beast-live');
  }, [running]);

  // last five seconds before a part: one tick per second
  const sec = nextIn !== null && nextIn > 0 && nextIn <= 5000 ? Math.ceil(nextIn / 1000) : 0;
  React.useEffect(() => { if (sec) playTick('wood'); }, [sec]);

  const hasPlan = React.useMemo(() => {
    if (!on) return false;
    try { return (loadPlannerData().items[today] || []).some((i) => !i.done); } catch { return false; }
  }, [on, today, Math.floor(now / 30000)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return sheet ? <BeastContract onClose={() => setSheet(false)} /> : null;

  const alarm = running ? getAlarmLevel() : 0;
  const away = !!running && !running.excuseOn && alarm === 2;
  const live = running ? partLive(running, now) : null;
  const left = running ? absMs(running.endMin, new Date(now)) - now : 0;
  const camOn = beast.settings.camera;
  const tone: 'ok' | 'warn' | 'bad' | 'off' = !running ? 'off' : running.excuseOn ? 'ok' : alarm === 2 ? 'bad' : alarm === 1 || running.pend.badMs > 0 ? 'warn' : 'ok';
  const closedToday = !!day && day.closed;
  const hist = beast.history[today];
  const verdict = beast.unseen && beast.history[beast.unseen] ? beast.history[beast.unseen] : null;

  const excuseLeft = running ? Math.max(0, beast.settings.excuseSec * 1000 - running.excusedMs) : 0;
  const canExcuse = !!running && !running.excuseOn && running.excuses < beast.settings.maxExcuses && excuseLeft > 0;

  const giveUp = async () => {
    if (!running) return;
    if (await confirmDialog('تسلیم می‌شوی؟ از این پارت فقط همان‌قدری که تا حالا تأیید شده اعتبار می‌گیری، و پارت بعدی سر وقتش شروع می‌شود.')) forfeitRunning();
  };

  const chip = !running && !(nextIn !== null && nextIn <= 60000) && !sheet ? (
    <button type="button" className={'bs-chip' + (!day && hasPlan ? ' warn' : '')} onClick={() => setSheet(true)} aria-label="حالت بیست">
      <Flame size={15} />
      <span>
        {!day ? (hasPlan ? 'امروز را امضا کن' : 'حالت بیست') : closedToday ? `${P(hist ? hist.pct : 0)}٪ امروز` : next && nextIn !== null ? `پارت بعد ${P(minToTime(next.startMin))} · ${nextIn > 3600000 ? P(Math.floor(nextIn / 3600000)) + ' ساعت' : mmss(nextIn)}` : 'در حال انجام'}
      </span>
      {beast.streak.count > 0 && <b>{P(beast.streak.count)}🔥</b>}
    </button>
  ) : null;

  return (
    <>
      {chip}

      {next && nextIn !== null && nextIn > 0 && nextIn <= 60000 && !running && (
        <div className="bs-count" role="status" aria-live="polite">
          <Flame size={20} />
          <div><b>{next.item.subject}</b><span>شروع پارت تا</span></div>
          <strong>{mmss(nextIn)}</strong>
        </div>
      )}

      {running && live && (
        <div className={'bs-hud ' + tone + (running.excuseOn ? ' excuse' : '')} role="region" aria-label="حالت بیست">
          {camOn && <Preview stream={cam.stream} tone={tone} />}
          <div className="bs-hud-main">
            {running.excuseOn ? (
              <><b>استراحتِ مجاز · {mmss(excuseLeft)}</b><span>ساعت پارت همچنان می‌رود</span></>
            ) : (
              <>
                <b>{P(live.pct)}٪ <em>تأییدشده</em></b>
                <span>
                  {camOn ? (cam.status !== 'ready' ? 'دوربین آماده نیست (نیمی از زمان حساب می‌شود)' : !cam.calibrated ? 'دوربین کالیبره نیست' : tone === 'bad' ? 'نیستی!' : tone === 'warn' ? 'حواست پرت شد…' : 'حاضر') : 'بدون دوربین'}
                  {' · '}{mmss(left)} مانده
                </span>
              </>
            )}
          </div>
          {running.excuseOn ? (
            <button type="button" className="bs-btn go" onClick={endExcuse}>برگشتم</button>
          ) : (
            <button type="button" className="bs-btn" disabled={!canExcuse} onClick={() => startExcuse()} title="آب یا دستشویی؛ محدود و بدون جریمه">
              <Coffee size={15} /> استراحت {P(Math.max(0, beast.settings.maxExcuses - running.excuses))}
            </button>
          )}
          <button type="button" className="bs-btn quiet" onClick={giveUp} title="تسلیم"><Flag size={15} /></button>
        </div>
      )}

      {away && live && createPortal(
        <div className="bs-alarm" role="alertdialog" aria-live="assertive">
          <ShieldAlert size={54} />
          <h2>برگرد سرِ درس!</h2>
          <p>{cam.status === 'ready' && beast.settings.camera ? 'دوربین تو را سر جایت نمی‌بیند' : 'از صفحه رفتی'} · {P(Math.round(running!.pend.badMs / 1000))} ثانیه</p>
          <small>هر ثانیه از زمان این پارت دارد از دست می‌رود و پارت بعدی منتظر کسی نمی‌ماند.</small>
          {beast.settings.camera && cam.status === 'ready' && (
            <button type="button" className="bs-btn quiet" onClick={() => { void calibrate((m) => setToast(m)).then((r) => setToast(r.ok ? 'کالیبره شد ✓' : r.reason || 'کالیبره نشد')); }}>من اینجام؛ دوربین اشتباه می‌بیند ← دوباره کالیبره کن</button>
          )}
        </div>, document.body)}

      {toast && <div className="bs-toast" role="status" aria-live="polite">{toast}</div>}
      {sheet && <BeastContract onClose={() => setSheet(false)} />}
      {verdict && !sheet && createPortal(<VerdictCard dateKey={verdict.dateKey} onClose={ackVerdict} />, document.body)}
    </>
  );
};

/** the end-of-day «court»: what was planned, what was verified, the best and the worst part */
const VerdictCard: React.FC<{ dateKey: string; onClose: () => void }> = ({ dateKey, onClose }) => {
  const b = useBeast();
  const s = b.history[dateKey];
  if (!s) return null;
  const v = verdictFor(s.pct);
  const best = s.parts.find((p) => p.id === s.bestId);
  const worst = s.parts.find((p) => p.id === s.worstId);
  return (
    <div className="bs-scrim" role="dialog" aria-modal="true" aria-label="حکم امروز">
      <div className={'bs-card verdict ' + v.tone}>
        <small>حکم روز {P(dateKey)}</small>
        <h2>{v.title}</h2>
        <div className="bs-big">{P(s.pct)}٪</div>
        <p>{v.line}</p>
        <div className="bs-stats">
          <div><b>{P(Math.floor(s.creditedMin / 60))}:{P(String(s.creditedMin % 60).padStart(2, '0'))}</b><span>ساعتِ تأییدشده</span></div>
          <div><b>{P(Math.floor(s.plannedMin / 60))}:{P(String(s.plannedMin % 60).padStart(2, '0'))}</b><span>قولِ امضاشده</span></div>
          <div><b>{P(s.streakAfter || 0)}🔥</b><span>روز پشت‌سرهم</span></div>
        </div>
        <ul className="bs-parts">
          {s.parts.map((p) => (
            <li key={p.id} className={p.status}>
              <i style={{ width: p.pct + '%' }} />
              <span>{P(p.start)} · {p.subject}</span>
              <b>{p.status === 'missed' ? 'از دست رفت' : p.status === 'forfeit' ? `تسلیم · ${P(p.pct)}٪` : `${P(p.pct)}٪`}</b>
            </li>
          ))}
        </ul>
        {best && <p className="bs-note good">بهترین پارت: {best.subject} ({P(best.pct)}٪)</p>}
        {worst && <p className="bs-note bad">ضعیف‌ترین پارت: {worst.subject} ({P(worst.pct)}٪){worst.awayMin + worst.distractedMin > 0 ? ` · ${P(worst.awayMin + worst.distractedMin)} دقیقه حواس‌پرتی` : ''}</p>}
        <button type="button" className="bs-btn go big" onClick={onClose}>قبول؛ فردا بهتر</button>
      </div>
    </div>
  );
};
