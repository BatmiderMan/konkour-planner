import React from 'react';
import { RotateCcw, X } from 'lucide-react';
import {
  ACCENTS, CALM_CHOICES, FONTS, FX, Look, PRESETS, STYLES, THEMES, activePreset, applyPreset, resetLook, setLook, useLook
} from './timerLook';
import { toPersianDigits } from '../../utils';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="lk-sec"><h4>{title}</h4>{children}</section>
);
const Row: React.FC<{ label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, hint, on, onChange }) => (
  <button type="button" role="switch" aria-checked={on} className="lk-row" onClick={() => onChange(!on)}>
    <span><b>{label}</b>{hint && <em>{hint}</em>}</span>
    <i className={'lk-sw' + (on ? ' on' : '')}><u /></i>
  </button>
);
function Seg<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="lk-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

/** little drawings for the three clock styles */
const StyleArt: React.FC<{ id: string }> = ({ id }) => (
  <svg viewBox="0 0 64 44" className="lk-art" aria-hidden="true">
    {id === 'dial' && (<>
      {Array.from({ length: 24 }, (_, i) => <line key={i} x1="32" y1="3" x2="32" y2="6" transform={`rotate(${i * 15} 32 22)`} strokeWidth="1.4" opacity={i < 9 ? 1 : .3} />)}
      <circle cx="32" cy="22" r="14" fill="none" strokeWidth="3" opacity=".25" />
      <path d="M32 8 A14 14 0 0 1 44.1 29" fill="none" strokeWidth="3" strokeLinecap="round" />
    </>)}
    {id === 'ring' && (<>
      <circle cx="32" cy="22" r="16" fill="none" strokeWidth="1.8" opacity=".25" />
      <path d="M32 6 A16 16 0 1 1 18 30" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    </>)}
    {id === 'digits' && (<>
      <text x="32" y="25" textAnchor="middle" fontSize="19" fontWeight="800" stroke="none">12:34</text>
      {Array.from({ length: 10 }, (_, i) => <rect key={i} x={7 + i * 5.2} y="33" width="3.6" height="3" rx="1.2" opacity={i < 6 ? 1 : .3} stroke="none" />)}
    </>)}
  </svg>
);

export const LookPanel: React.FC<{ onClose: () => void; fsSupported: boolean }> = ({ onClose, fsSupported }) => {
  const look = useLook();
  const set = <K extends keyof Look>(k: K, v: Look[K]) => setLook({ [k]: v } as Partial<Look>);
  const preset = activePreset(look);

  // Escape closes this panel first (capture phase so the timer doesn't also minimize)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <aside className="lk" role="dialog" aria-label="شخصی‌سازی نمای تمام‌صفحه" onClick={(e) => e.stopPropagation()}>
      <header className="lk-head">
        <div><b>شخصی‌سازی</b><span>همان لحظه روی تایمر اعمال می‌شود</span></div>
        <button type="button" className="tm-icon-btn" onClick={() => { resetLook(); }} aria-label="بازگشت به حالت پیش‌فرض" title="بازگشت به پیش‌فرض"><RotateCcw size={17} /></button>
        <button type="button" className="tm-icon-btn" onClick={onClose} aria-label="بستن"><X size={19} /></button>
      </header>

      <div className="lk-scroll">
        <Section title="حالت‌های آماده">
          <div className="lk-presets">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={preset === p.id ? 'on' : ''} onClick={() => applyPreset(p.id)}>
                <span aria-hidden="true">{p.emoji}</span>{p.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="شکل ساعت">
          <div className="lk-cards">
            {STYLES.map((s) => (
              <button key={s.id} type="button" className={look.style === s.id ? 'on' : ''} aria-pressed={look.style === s.id} onClick={() => set('style', s.id)}>
                <StyleArt id={s.id} /><b>{s.label}</b><em>{s.hint}</em>
              </button>
            ))}
          </div>
          <div className="lk-fonts">
            {FONTS.map((f) => (
              <button key={f.id} type="button" className={'f-' + f.id + (look.font === f.id ? ' on' : '')} aria-pressed={look.font === f.id} onClick={() => set('font', f.id)}>
                <span>{look.digits === 'en' ? '12:34' : toPersianDigits('12:34')}</span><em>{f.label}</em>
              </button>
            ))}
          </div>
          <div className="lk-line"><span>ارقام</span>
            <Seg label="نوع ارقام" value={look.digits} onChange={(v) => set('digits', v)} options={[{ v: 'fa', label: '۱۲۳ فارسی' }, { v: 'en', label: '123 انگلیسی' }]} />
          </div>
          <label className="lk-slider"><span>اندازه <b>{toPersianDigits(look.size)}٪</b></span>
            <input type="range" min={60} max={130} step={5} value={look.size} onChange={(e) => set('size', Number(e.target.value))} style={{ ['--p' as any]: ((look.size - 60) / 70) * 100 + '%' }} />
          </label>
        </Section>

        <Section title="پس‌زمینه و رنگ">
          <div className="lk-swatches">
            {THEMES.map((t) => (
              <button key={t.id} type="button" className={look.theme === t.id ? 'on' : ''} aria-pressed={look.theme === t.id} onClick={() => set('theme', t.id)}>
                <i style={{ background: t.swatch }} /><span>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="lk-accents" role="group" aria-label="رنگ تاکیدی">
            {ACCENTS.map((a) => (
              <button
                key={a.id} type="button" className={look.accent === a.id ? 'on' : ''} aria-pressed={look.accent === a.id} onClick={() => set('accent', a.id)}
                title={a.label} aria-label={a.label}
                style={a.id === 'auto' ? undefined : { background: `linear-gradient(135deg, ${a.a}, ${a.b})` }}
              >{a.id === 'auto' ? 'خودکار' : ''}</button>
            ))}
          </div>
          <p className="lk-note">«خودکار» رنگ همان درس را می‌گیرد. دقیقه‌های آخر و اضافه‌کاری همیشه زرد و قرمز می‌شوند تا متوجه شوی.</p>
          <Row label="درخشش نرم پس‌زمینه" hint="نفس کشیدن رنگ هنگام اجرا" on={look.glow} onChange={(v) => set('glow', v)} />
        </Section>

        <Section title="افکت‌های محیطی">
          <div className="lk-fx">
            {FX.map((f) => (
              <button key={f.id} type="button" className={look.fx === f.id ? 'on' : ''} aria-pressed={look.fx === f.id} onClick={() => set('fx', f.id)}>
                <span aria-hidden="true">{f.icon}</span>{f.label}
              </button>
            ))}
          </div>
          {look.fx !== 'none' && (
            <div className="lk-line"><span>شدت</span>
              <Seg label="شدت افکت" value={look.fxLevel} onChange={(v) => set('fxLevel', v)} options={[{ v: 1, label: 'کم' }, { v: 2, label: 'متوسط' }, { v: 3, label: 'زیاد' }]} />
            </div>
          )}
        </Section>

        <Section title="چه چیزهایی دیده شود">
          <Row label="عنوان درس" on={look.showHeader} onChange={(v) => set('showHeader', v)} />
          <Row label="ساعت و تاریخ امروز" hint="بالای صفحه" on={look.showClock} onChange={(v) => set('showClock', v)} />
          <Row label="درصد پیشرفت" on={look.showPercent} onChange={(v) => set('showPercent', v)} />
          <Row label="آمار جلسه" hint="شروع، برنامه، مطالعه" on={look.showStats} onChange={(v) => set('showStats', v)} />
          <Row label="ابزارها" hint="ریتم تیک و موسیقی" on={look.showTools} onChange={(v) => set('showTools', v)} />
          <Row label="جمله‌ی کوتاه" hint="هر چند دقیقه عوض می‌شود" on={look.showQuote} onChange={(v) => set('showQuote', v)} />
        </Section>

        <Section title="رفتار">
          <div className="lk-line"><span>چیدمان</span>
            <Seg label="چیدمان" value={look.layout} onChange={(v) => set('layout', v)} options={[{ v: 'auto', label: 'خودکار' }, { v: 'center', label: 'وسط' }, { v: 'split', label: 'دو ستون' }]} />
          </div>
          <div className="lk-line col"><span>محو شدن دکمه‌ها بعد از</span>
            <Seg label="زمان محو شدن" value={look.calmAfter} onChange={(v) => set('calmAfter', v)} options={CALM_CHOICES.map((c) => ({ v: c.v, label: c.label }))} />
          </div>
          <Row label="کم‌نور کردن ساعت در حالت آرام" hint="مناسب شب و صفحه‌ی OLED" on={look.dimCalm} onChange={(v) => set('dimCalm', v)} />
          {fsSupported && <Row label="ورود خودکار به تمام‌صفحه‌ی مرورگر" hint="نوار آدرس پنهان می‌شود" on={look.autoFs} onChange={(v) => set('autoFs', v)} />}
        </Section>
      </div>
    </aside>
  );
};
