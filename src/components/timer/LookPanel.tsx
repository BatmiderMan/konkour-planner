import React from 'react';
import { RotateCcw, X } from 'lucide-react';
import {
  ACCENTS, ANIMS, CALM_CHOICES, FILLS, FONTS, FX, Look, PRESETS, SEPS, STYLES, THEMES, activePreset, applyPreset, resetLook, setLook, useLook
} from './timerLook';
import { toPersianDigits } from '../../utils';
import { BREAK_EVERY, BREAK_LEN, setDeepPrefs, useDeepPrefs } from './deepFocus';

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
    {id === 'orbit' && (<>
      <circle cx="32" cy="22" r="16" fill="none" strokeWidth="1" opacity=".3" />
      <path d="M32 6 A16 16 0 0 1 46.9 27.5" fill="none" strokeWidth="2" strokeLinecap="round" />
      <circle cx="46.9" cy="27.5" r="3.2" stroke="none" />
      <circle cx="21" cy="9.7" r="1.4" stroke="none" opacity=".7" />
    </>)}
    {id === 'minimal' && (<>
      <text x="32" y="26" textAnchor="middle" fontSize="19" fontWeight="300" stroke="none">12:34</text>
      <rect x="14" y="33" width="36" height="1.6" rx=".8" opacity=".3" stroke="none" /><rect x="14" y="33" width="21" height="1.6" rx=".8" stroke="none" />
    </>)}
    {id === 'digits' && (<>
      <text x="32" y="25" textAnchor="middle" fontSize="19" fontWeight="800" stroke="none">12:34</text>
      {Array.from({ length: 10 }, (_, i) => <rect key={i} x={7 + i * 5.2} y="33" width="3.6" height="3" rx="1.2" opacity={i < 6 ? 1 : .3} stroke="none" />)}
    </>)}
  </svg>
);

export const LookPanel: React.FC<{ onClose: () => void; fsSupported: boolean; compact?: boolean }> = ({ onClose, fsSupported, compact = false }) => {
  const look = useLook();
  const deep = useDeepPrefs();
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
        <div><b>شخصی‌سازی</b><span>{compact ? 'ظاهر کارت تایمر؛ در نمای تمام‌صفحه گزینه‌های بیشتری هست' : 'همان لحظه روی تایمر اعمال می‌شود'}</span></div>
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
            {STYLES.filter((s) => !compact || s.id === 'dial' || s.id === 'ring' || s.id === 'orbit').map((s) => (
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
          {!compact && <label className="lk-slider"><span>اندازه <b>{toPersianDigits(look.size)}٪</b></span>
            <input type="range" min={60} max={130} step={5} value={look.size} onChange={(e) => set('size', Number(e.target.value))} style={{ ['--p' as any]: ((look.size - 60) / 70) * 100 + '%' }} />
          </label>}
        </Section>

        <Section title="حرکت و جزئیات">
          <div className="lk-line col"><span>تغییر رقم‌ها</span>
            <Seg label="انیمیشن رقم" value={look.anim} onChange={(v) => set('anim', v)} options={ANIMS} />
          </div>
          <div className="lk-line col"><span>علامت بین عددها</span>
            <Seg label="جداکننده" value={look.sep} onChange={(v) => set('sep', v)} options={SEPS} />
          </div>
          <div className="lk-line col"><span>رنگ عدد</span>
            <Seg label="رنگ عدد" value={look.fill} onChange={(v) => set('fill', v)} options={FILLS} />
          </div>
          <div className="lk-line col"><span>عدد بزرگ نشان بدهد</span>
            <Seg label="حالت عدد" value={look.mode} onChange={(v) => set('mode', v)} options={[{ v: 'remaining', label: 'باقی‌مانده' }, { v: 'elapsed', label: 'مطالعه‌شده' }]} />
          </div>
          <div className="lk-line"><span>حرکت پیشرفت</span>
            <Seg label="حرکت پیشرفت" value={look.motion} onChange={(v) => set('motion', v)} options={[{ v: 'smooth', label: 'روان' }, { v: 'step', label: 'ثانیه‌ای' }]} />
          </div>
          <Row label="نمایش ثانیه" hint="خاموش: فقط دقیقه؛ آرام‌تر برای تمرکز" on={look.secs} onChange={(v) => set('secs', v)} />
          {(compact || look.style === 'dial') && <Row label="نشانه‌های دور ساعت" on={look.marks} onChange={(v) => set('marks', v)} />}
          {(compact || look.style === 'dial') && <Row label="حلقه‌ی داخلی تیک" on={look.inner} onChange={(v) => set('inner', v)} />}
          <Row label="متن‌های کوچک دور عدد" hint="«باقی‌مانده»، «در حال مطالعه»" on={look.labels} onChange={(v) => set('labels', v)} />
          <Row label="همین ظاهر روی همه‌ی ساعت‌ها" hint="نوار بالا، جزیره، دکمه‌ی گوشی، پنجره‌ی شناور، پاسخ‌برگ" on={look.everywhere} onChange={(v) => set('everywhere', v)} />
          <Row label="زمان در عنوان تب مرورگر" on={look.tabTitle} onChange={(v) => set('tabTitle', v)} />
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
          {!compact && <Row label="ساعت و تاریخ امروز" hint="بالای صفحه" on={look.showClock} onChange={(v) => set('showClock', v)} />}
          {!compact && look.showClock && (<>
            <div className="lk-line"><span>تاریخ</span>
              <Seg label="تاریخ زیر ساعت" value={look.wallDate} onChange={(v) => set('wallDate', v)} options={[{ v: 'jalali', label: 'شمسی' }, { v: 'gregorian', label: 'میلادی' }, { v: 'off', label: 'بدون' }]} />
            </div>
            <Row label="ساعت ۱۲ ساعته" on={look.hour12} onChange={(v) => set('hour12', v)} />
            <Row label="ثانیه‌ی ساعت امروز" on={look.wallSecs} onChange={(v) => set('wallSecs', v)} />
          </>)}
          <Row label="درصد پیشرفت" on={look.showPercent} onChange={(v) => set('showPercent', v)} />
          <Row label="آمار جلسه" hint="شروع، برنامه، مطالعه" on={look.showStats} onChange={(v) => set('showStats', v)} />
          <Row label="ابزارها" hint="ریتم تیک و موسیقی" on={look.showTools} onChange={(v) => set('showTools', v)} />
          {!compact && <Row label="جمله‌ی کوتاه" hint="هر چند دقیقه عوض می‌شود" on={look.showQuote} onChange={(v) => set('showQuote', v)} />}
        </Section>

        <Section title="تمرکز عمیق">
          <Row label="هشدار هنگام خروج از صفحه" hint="تا وقتی تایمر اجراست، بستن یا رفرش تب بی‌صدا نیست" on={deep.guardExit} onChange={(v) => setDeepPrefs({ guardExit: v })} />
          <div className="lk-line col"><span>یادآوری استراحت بعد از هر</span>
            <Seg label="یادآوری استراحت" value={deep.breakEvery} onChange={(v) => setDeepPrefs({ breakEvery: v })} options={BREAK_EVERY.map((v) => ({ v, label: v === 0 ? 'خاموش' : `${toPersianDigits(v)}د` }))} />
          </div>
          {deep.breakEvery > 0 && (
            <div className="lk-line"><span>مدت استراحت</span>
              <Seg label="مدت استراحت" value={deep.breakLen} onChange={(v) => setDeepPrefs({ breakLen: v })} options={BREAK_LEN.map((v) => ({ v, label: `${toPersianDigits(v)} دقیقه` }))} />
            </div>
          )}
          <Row label="استراحت چشم (۲۰-۲۰-۲۰)" hint="هر ۲۰ دقیقه، ۲۰ ثانیه به دوردست نگاه کن" on={deep.eyeRest} onChange={(v) => setDeepPrefs({ eyeRest: v })} />
        </Section>

        {!compact && <Section title="رفتار">
          <div className="lk-line"><span>چیدمان</span>
            <Seg label="چیدمان" value={look.layout} onChange={(v) => set('layout', v)} options={[{ v: 'auto', label: 'خودکار' }, { v: 'center', label: 'وسط' }, { v: 'split', label: 'دو ستون' }]} />
          </div>
          <div className="lk-line col"><span>محو شدن دکمه‌ها بعد از</span>
            <Seg label="زمان محو شدن" value={look.calmAfter} onChange={(v) => set('calmAfter', v)} options={CALM_CHOICES.map((c) => ({ v: c.v, label: c.label }))} />
          </div>
          <Row label="کم‌نور کردن ساعت در حالت آرام" hint="مناسب شب و صفحه‌ی OLED" on={look.dimCalm} onChange={(v) => set('dimCalm', v)} />
          {fsSupported && <Row label="ورود خودکار به تمام‌صفحه‌ی مرورگر" hint="نوار آدرس پنهان می‌شود" on={look.autoFs} onChange={(v) => set('autoFs', v)} />}
        </Section>}
      </div>
    </aside>
  );
};
