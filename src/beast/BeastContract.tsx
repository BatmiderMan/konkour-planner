import React from 'react';
import { createPortal } from 'react-dom';
import { Camera, Check, Flame, Lock, X } from 'lucide-react';
import { loadPlannerData, shiftDateKey } from '../plannerStore';
import { minToTime } from '../plannerSchedule';
import { toPersianDigits as P } from '../utils';
import { getDay, setBeastSettings, signDay, useBeast, useBeastRun } from './beastStore';
import { todayKey } from './beastEngine';
import { BeastPart, buildParts, partPct } from './beastRules';
import { calibrate, clearCalibration, modeLabel, setPresenceDebug, startCamera, usePresence } from './presence';
import { unlockAudio } from '../tickSound';
import './beast.css';

const HOLD_MS = 1400;

/** press and hold: signing a contract should take a moment of decision */
const HoldButton: React.FC<{ disabled?: boolean; onDone: () => void; children: React.ReactNode }> = ({ disabled, onDone, children }) => {
  const [p, setP] = React.useState(0);
  const raf = React.useRef(0);
  const t0 = React.useRef(0);
  const stop = () => { cancelAnimationFrame(raf.current); setP(0); };
  const start = () => {
    if (disabled) return;
    unlockAudio();
    t0.current = performance.now();
    const loop = () => {
      const v = Math.min(1, (performance.now() - t0.current) / HOLD_MS);
      setP(v);
      if (v >= 1) { stop(); onDone(); } else raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };
  React.useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button
      type="button" className="bs-hold" disabled={disabled}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') stop(); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <i style={{ transform: `scaleX(${p})` }} />
      <span>{children}</span>
    </button>
  );
};

const statusText: Record<BeastPart['status'], string> = { pending: 'در انتظار', running: 'در جریان', done: 'تمام', missed: 'از دست رفت', forfeit: 'تسلیم' };

export const BeastContract: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const beast = useBeast();
  const run = useBeastRun();
  const cam = usePresence();
  const today = todayKey();
  const tomorrow = React.useMemo(() => shiftDateKey(today, 1), [today]);
  const [target, setTarget] = React.useState<'today' | 'tomorrow'>(() => (getDay(today) ? 'today' : 'today'));
  const dateKey = target === 'today' ? today : tomorrow;
  const signed = run.days[dateKey];
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [step, setStep] = React.useState('');
  const s = beast.settings;

  const parts = React.useMemo(() => {
    if (signed) return signed.parts;
    const d = loadPlannerData();
    const n = new Date();
    return buildParts(d.items[dateKey] || [], dateKey, d.schedule, d.dayRests[dateKey], target === 'today' ? n.getHours() * 60 + n.getMinutes() : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, signed, target]);

  // the sheet shows the camera while it is open (the engine turns it off again afterwards)
  React.useEffect(() => { if (s.camera && cam.status === 'off') void startCamera(); }, [s.camera]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { setPresenceDebug(true); return () => setPresenceDebug(false); }, []);
  const vref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => { const v = vref.current; if (v) { v.srcObject = cam.stream; if (cam.stream) v.play().catch(() => undefined); } }, [cam.stream, s.camera]);

  const total = parts.reduce((a, p) => a + (p.endMin - p.startMin), 0);
  const camReady = cam.status === 'ready';
  const camBlocked = s.camera && (cam.status === 'denied' || cam.status === 'unsupported' || cam.status === 'error');
  const needCal = s.camera && camReady && !cam.calibrated;

  const doCal = async () => {
    setBusy(true); setMsg('');
    const r = await calibrate(setStep);
    setBusy(false); setStep('');
    setMsg(r.ok ? 'کالیبره شد ✓ حالا جلوی دوربین جابه‌جا شو و ببین وضعیت چطور عوض می‌شود.' : r.reason || 'کالیبره نشد');
  };
  const d = cam.debug;
  const obsText = { present: 'حاضر ✓', away: 'نیستی', distracted: 'حواست پرت است', blind: 'تأییدنشده' }[cam.obs];
  const sign = () => {
    if (signed || !parts.length) return;
    signDay(dateKey, parts.map((p) => ({ ...p })));
    onClose();
  };

  return createPortal(
    <div className="bs-scrim" role="dialog" aria-modal="true" aria-label="قرارداد حالت بیست" onClick={onClose}>
      <div className="bs-card sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <span className="bs-flame"><Flame size={22} /></span>
          <div><h2>قرارداد حالت بیست</h2><small>{signed ? 'امضا شده؛ قفل است' : 'قول بده؛ بعد پشتش بایست'}</small></div>
          <button type="button" className="bs-x" onClick={onClose} aria-label="بستن"><X size={18} /></button>
        </header>

        <div className="bs-seg" role="radiogroup" aria-label="روز">
          <button type="button" role="radio" aria-checked={target === 'today'} className={target === 'today' ? 'on' : ''} onClick={() => setTarget('today')}>امروز</button>
          <button type="button" role="radio" aria-checked={target === 'tomorrow'} className={target === 'tomorrow' ? 'on' : ''} onClick={() => setTarget('tomorrow')}>فردا</button>
        </div>

        {parts.length === 0 ? (
          <p className="bs-empty">برای این روز پارتِ باقی‌مانده‌ای در برنامه‌ریز نیست. اول در برنامه‌ریز کارت بگذار؛ هر کارت یک پارت قرارداد می‌شود.</p>
        ) : (
          <ul className="bs-list">
            {parts.map((p) => (
              <li key={p.id} className={p.status}>
                <time>{P(minToTime(p.startMin))}<em>تا</em>{P(minToTime(p.endMin))}</time>
                <span><b>{p.item.subject}</b>{p.item.detail && <small>{p.item.detail}</small>}</span>
                <i>{signed ? (p.status === 'pending' ? <Lock size={14} /> : p.status === 'missed' ? statusText.missed : `${P(partPct(p))}٪`) : `${P(p.endMin - p.startMin)}د`}</i>
              </li>
            ))}
          </ul>
        )}
        {parts.length > 0 && <p className="bs-total">جمع: <b>{P(Math.floor(total / 60))}:{P(String(total % 60).padStart(2, '0'))}</b> ساعت</p>}

        <div className="bs-rules">
          <h3>قاعده‌ها</h3>
          <ul>
            <li><b>سر ساعت.</b> هر پارت دقیقاً در وقتش شروع می‌شود و در وقتش تمام؛ دیر رسیدی، همان دقیقه‌ها سوخته‌اند.</li>
            <li><b>بدون تعویق.</b> نه «۵ دقیقه بیشتر»، نه مکث، نه لغو. فقط {P(s.maxExcuses)} استراحتِ مجاز تا {P(Math.round(s.excuseSec / 60))} دقیقه برای هر پارت.</li>
            <li><b>اعتبار = زمانِ واقعی.</b> هر ثانیه که نباشی یا حواست جای دیگر باشد از اعتبار پارت کم می‌شود؛ پارت بعدی منتظر نمی‌ماند.</li>
            <li><b>مهلت {P(s.graceSec)} ثانیه.</b> دور شدنِ کوتاه‌تر بخشوده می‌شود.</li>
            <li><b>امضا یعنی قفل.</b> بعد از امضا کارت‌های برنامه‌ی این روز عوض نمی‌شوند و حذفشان قرارداد را نمی‌شکند.</li>
          </ul>
        </div>

        <div className="bs-cam-box">
          <label className="bs-sw">
            <span><b><Camera size={15} /> تأیید با دوربین</b><small>تصویر فقط روی همین دستگاه و لحظه‌ای بررسی می‌شود؛ هیچ‌چیز ذخیره یا فرستاده نمی‌شود</small></span>
            <input type="checkbox" role="switch" checked={s.camera} disabled={!!signed} onChange={(e) => setBeastSettings({ camera: e.target.checked })} />
            <i aria-hidden="true" />
          </label>
          {s.camera && (
            <div className="bs-cam-row">
              <div className="bs-prev">
                {cam.stream ? (
                  <div className="bs-prev-in">
                    <video ref={vref} muted playsInline />
                    {d.box && <i className={'bs-box ' + cam.obs} style={{ left: d.box.x0 * 100 + '%', top: d.box.y0 * 100 + '%', width: (d.box.x1 - d.box.x0) * 100 + '%', height: (d.box.y1 - d.box.y0) * 100 + '%' }} />}
                  </div>
                ) : <span>{cam.status === 'starting' ? 'در حال روشن شدن…' : 'دوربین خاموش است'}</span>}
              </div>
              <div className="bs-cam-info">
                {!camReady ? (
                  <button type="button" className="bs-btn go" onClick={() => void startCamera()} disabled={cam.status === 'starting'}>روشن کردن دوربین</button>
                ) : (
                  <>
                    <button type="button" className="bs-btn go" onClick={doCal} disabled={busy}>{busy ? 'نگاه کن…' : cam.calibrated ? 'کالیبره‌ی دوباره' : 'کالیبره کن'}</button>
                    {cam.calibrated && <button type="button" className="bs-btn quiet" onClick={clearCalibration}>پاک کردن</button>}
                  </>
                )}
                {step && <small className="bs-step" role="status">{step}</small>}
                <small>
                  {cam.note || (cam.calibrated ? <><Check size={13} /> کالیبره است</> : cam.mode === 'silhouette' ? 'روش بدون مدل: اول از جلوی دوربین کنار می‌روی تا اتاقِ خالی را یاد بگیرد، بعد می‌نشینی.' : 'همان‌طور که معمولاً درس می‌خوانی بنشین و به صفحه نگاه کن.')}
                </small>
                {camReady && (
                  <small className="bs-live" aria-live="off">
                    روش: <b>{modeLabel(cam.mode)}</b> · الان: <b className={cam.obs}>{obsText}</b>
                    {cam.calibrated && <> · اندازه {P(Math.round(d.ratio * 100))}٪</>} · {P(Math.round(d.fps * 10) / 10)} فریم/ث{!d.seen && cam.calibrated ? ' · کسی دیده نمی‌شود' : ''}
                  </small>
                )}
              </div>
            </div>
          )}
          {camBlocked && <p className="bs-warn">دوربین در دسترس نیست. می‌توانی امضا کنی، ولی زمانی که تأیید نشود فقط نصفش اعتبار می‌گیرد.</p>}
          {msg && <p className="bs-msg" role="status">{msg}</p>}
        </div>

        {!signed && (
          <HoldButton disabled={!parts.length || needCal} onDone={sign}>
            <Flame size={18} /> {needCal ? 'اول دوربین را کالیبره کن' : 'نگه دار تا امضا شود'}
          </HoldButton>
        )}
        {signed && <p className="bs-locked"><Lock size={15} /> این روز قفل است تا آخرین پارت تمام شود.</p>}
      </div>
    </div>,
    document.body
  );
};
