import React from 'react';
import { Download, Upload } from 'lucide-react';
import { goto } from '../../nav';
import { getHaptics, setHaptics } from '../../focusBus';
import { confirmDialog } from '../../dialog';
import { DEFAULT_VS, saveVsPrefs, useVsPrefs } from '../../checker/vsPrefs';
import { loadPrefs as loadCk, savePrefs as saveCk } from '../../checker/store';
import { backupKeys, exportAll, importAll } from '../../backup';
import { downloadJson } from '../../checker/store';
import { BUILD_LABEL } from '../../buildInfo';
import { toPersianDigits as P } from '../../utils';
import { Clock } from '../../clock/Clock';
import { useNow } from '../../clock/useNow';
import { ANIMS, FILLS, FONTS, PRESETS, SEPS, activePreset, applyPreset, resetLook, setLook, useLook } from '../timer/timerLook';
import './settings.css';

type ThemeMode = 'light' | 'dark' | 'auto';

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ on, onChange, label, hint }) => (
  <label className="st-sw">
    <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
    <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
    <i aria-hidden="true" />
  </label>
);
const Chips: React.FC<{ value: string; onChange: (v: string) => void; items: Array<[string, string]>; label: string }> = ({ value, onChange, items, label }) => (
  <div className="st-chips" role="radiogroup" aria-label={label}>
    {items.map(([k, t]) => <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{t}</button>)}
  </div>
);

/** the clock look, with a live preview that counts so the digit animation can be judged before choosing */
const ClockSettings: React.FC = () => {
  const look = useLook();
  const now = useNow(true);
  const demo = 754 + Math.floor(now / 1000) % 3000; // counts up, so the digits actually change in front of you
  const cur = activePreset(look);
  return (
    <section className="st-card">
      <h2>ساعت</h2>
      <p className="st-note">یک ظاهر برای همه‌ی ساعت‌های برنامه: تایمر تمرکز، نوار بالا، دکمه‌ی گوشی، پنجره‌ی شناور و پاسخ‌برگ. گزینه‌های بیشتر (رنگ، افکت، چیدمان) داخل خود تایمر، دکمه‌ی «شخصی‌سازی» است.</p>
      <div className="st-clock-prev" aria-hidden="true"><Clock sec={demo} scope="timer" /></div>
      <div className="st-row"><span><b>حالت‌های آماده</b></span>
        <Chips label="حالت آماده" value={cur || ''} onChange={applyPreset} items={PRESETS.map((p) => [p.id, `${p.emoji} ${p.label}`] as [string, string])} />
      </div>
      <div className="st-row"><span><b>قلم عدد</b></span>
        <Chips label="قلم عدد" value={look.font} onChange={(v) => setLook({ font: v as typeof look.font })} items={FONTS.map((f) => [f.id, f.label] as [string, string])} />
      </div>
      <div className="st-row"><span><b>ارقام</b></span>
        <Chips label="ارقام" value={look.digits} onChange={(v) => setLook({ digits: v as 'fa' | 'en' })} items={[['fa', '۱۲۳ فارسی'], ['en', '123 انگلیسی']]} />
      </div>
      <div className="st-row"><span><b>تغییر رقم‌ها</b></span>
        <Chips label="انیمیشن رقم" value={look.anim} onChange={(v) => setLook({ anim: v as typeof look.anim })} items={ANIMS.map((a) => [a.v, a.label] as [string, string])} />
      </div>
      <div className="st-row"><span><b>علامت بین عددها</b></span>
        <Chips label="جداکننده" value={look.sep} onChange={(v) => setLook({ sep: v as typeof look.sep })} items={SEPS.map((a) => [a.v, a.label] as [string, string])} />
      </div>
      <div className="st-row"><span><b>رنگ عدد</b></span>
        <Chips label="رنگ عدد" value={look.fill} onChange={(v) => setLook({ fill: v as typeof look.fill })} items={FILLS.map((a) => [a.v, a.label] as [string, string])} />
      </div>
      <Switch on={look.secs} onChange={(v) => setLook({ secs: v })} label="نمایش ثانیه" hint="خاموش: فقط دقیقه؛ آرام‌تر برای تمرکز" />
      <Switch on={look.everywhere} onChange={(v) => setLook({ everywhere: v })} label="همین ظاهر روی همه‌ی ساعت‌های کوچک" hint="نوار بالا، جزیره، دکمه‌ی گوشی، پنجره‌ی شناور و پاسخ‌برگ" />
      <Switch on={look.tabTitle} onChange={(v) => setLook({ tabTitle: v })} label="زمان در عنوان تب مرورگر" />
      <div className="st-acts"><button type="button" className="st-btn" onClick={resetLook}>برگرداندن پیش‌فرض ساعت</button></div>
    </section>
  );
};

/** every setting in one place: look & feel, the test sheet, the planner, rounds, and the backup of all data */
export const SettingsHub: React.FC<{ themeMode: ThemeMode; onSetThemeMode: (m: ThemeMode) => void }> = ({ themeMode, onSetThemeMode }) => {
  const [vp, setVp] = useVsPrefs();
  const [ck, setCk] = React.useState(loadCk);
  const [hap, setHap] = React.useState(getHaptics());
  const [msg, setMsg] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const file = React.useRef<HTMLInputElement>(null);
  const setCkPref = (p: Partial<typeof ck>) => { const n = { ...ck, ...p }; setCk(n); saveCk(n); };

  const openPlannerSettings = () => { try { sessionStorage.setItem('planex_planner_sub', 'settings'); } catch { /* ignore */ } goto('planner'); };
  const openRounds = () => {
    try { const u = JSON.parse(localStorage.getItem('planex_tracker_ui_v1') || '{}'); localStorage.setItem('planex_tracker_ui_v1', JSON.stringify({ ...u, tab: 'set' })); } catch { /* ignore */ }
    goto('tracker');
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const d = await exportAll();
      const day = new Date().toISOString().slice(0, 10);
      downloadJson(`planex-backup-${day}.json`, d);
      setMsg(`پشتیبان ساخته شد: ${P(Object.keys(d.local).length)} بخش داده${d.library ? `، ${P(d.library.books.length)} کتاب کلید، ${P((d.library.sheets || []).length)} پاسخ‌برگ و ${P((d.library.scans || []).length)} نتیجه` : ''}${d.vault ? '، به‌علاوه‌ی گنجینه‌ی سؤال' : ''}.`);
    } catch { setMsg('ساخت پشتیبان انجام نشد.'); }
    setBusy(false);
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    if (!(await confirmDialog('داده‌های فعلی با این پشتیبان جایگزین یا ادغام شوند؟ (کلیدها ادغام می‌شوند؛ برنامه، مباحث و تنظیمات جایگزین می‌شوند)'))) return;
    setBusy(true);
    try {
      const r = await importAll(text);
      setMsg(`بازیابی شد: ${P(r.keys)} بخش داده، ${P(r.books)} کتاب، ${P(r.sheets)} پاسخ‌برگ، ${P(r.scans)} نتیجه${r.vault ? `، ${P(r.vault)} سؤال گنجینه` : ''}. برنامه تا چند ثانیه‌ی دیگر دوباره باز می‌شود…`);
      setTimeout(() => window.location.reload(), 1800);
    } catch (e) { setMsg((e as Error).message || 'فایل معتبر نیست.'); }
    setBusy(false);
  };

  return (
    <div className="st">
      <h1>تنظیمات</h1>
      <p className="st-lead">همه‌ی تنظیم‌ها یک‌جاست. بخش‌هایی که صفحه‌ی خودشان را دارند (برنامه‌ریز، دورها) از همین‌جا یک‌ضرب باز می‌شوند.</p>

      <section className="st-card">
        <h2>ظاهر و حس برنامه</h2>
        <div className="st-row"><span><b>حالت رنگ</b><small>روشن، تیره، یا همراه با دستگاه</small></span>
          <Chips label="حالت رنگ" value={themeMode} onChange={(v) => onSetThemeMode(v as ThemeMode)} items={[['light', 'روشن'], ['dark', 'تیره'], ['auto', 'خودکار']]} />
        </div>
        <Switch on={hap} onChange={(v) => { setHaptics(v); setHap(v); }} label="لرزش لمسی" hint="روی گوشی، با لمس دکمه‌ها" />
      </section>

      <ClockSettings />

      <section className="st-card">
        <h2>پاسخ‌برگ و حل تست</h2>
        <Switch on={vp.autoStart} onChange={(v) => setVp({ autoStart: v })} label="شروع خودکار ساعتِ پاسخ‌برگ" hint="ساعت پاسخ‌برگ جدا از تایمر پارت است؛ اگر خاموش باشد با اولین پاسخ یا Space شروع می‌شود" />
        <Switch on={vp.autoNext} onChange={(v) => setVp({ autoNext: v })} label="رفتن خودکار به سؤال بعد" hint="بعد از زدن گزینه یا ۰، انتخاب به سؤال بعدی می‌رود" />
        <Switch on={vp.showTimes} onChange={(v) => setVp({ showTimes: v })} label="نمایش زمان کنار هر سؤال" />
        <Switch on={vp.slowWarn} onChange={(v) => setVp({ slowWarn: v })} label="هشدار سؤال وقت‌گیر" hint="وقتی روی یک سؤال خیلی بیشتر از سهمش می‌مانی" />
        {vp.slowWarn && (
          <div className="st-row"><span><b>«خیلی بیشتر» یعنی</b><small>چند برابر زمان هدفِ هر سؤال</small></span>
            <Chips label="ضریب" value={String(vp.slowFactor)} onChange={(v) => setVp({ slowFactor: Number(v) })} items={[['1.5', '۱٫۵ برابر'], ['2', '۲ برابر'], ['3', '۳ برابر']]} />
          </div>
        )}
        <Switch on={vp.haptic} onChange={(v) => setVp({ haptic: v })} label="لرزش کوتاه با هر کلید" hint="فقط گوشی‌هایی که لرزش را پشتیبانی می‌کنند" />
        <div className="st-row"><span><b>نمره‌ی منفی</b><small>در تصحیح همه‌ی آزمون‌ها</small></span>
          <Chips label="نمره منفی" value={String(ck.penalty)} onChange={(v) => setCkPref({ penalty: Number(v) as 0 | 3 | 4 })} items={[['0', 'ندارد'], ['3', '⅓ نمره'], ['4', '¼ نمره']]} />
        </div>
        <Switch on={ck.dblWrong} onChange={(v) => setCkPref({ dblWrong: v })} label="دو علامت = غلط" hint="سؤالی که دو گزینه‌اش زده شده، غلط حساب شود" />
        <div className="st-acts">
          <button type="button" className="st-btn" onClick={() => saveVsPrefs({ ...DEFAULT_VS })}>برگرداندن پیش‌فرض‌های پاسخ‌برگ</button>
          <button type="button" className="st-btn" onClick={() => goto('checker')}>کلیدها و پاسخ‌برگ‌ها ←</button>
        </div>
      </section>

      <section className="st-card">
        <h2>برنامه‌ریز و مباحث</h2>
        <div className="st-row"><span><b>برنامه‌ریز</b><small>طول پارت، استراحت‌ها، ساعت شروع و پایان، منابع</small></span><button type="button" className="st-btn pri" onClick={openPlannerSettings}>باز کردن</button></div>
        <div className="st-row"><span><b>دورها و منبع هر دور</b><small>دامنه‌ی هر دور، چند منبع، ددلاین</small></span><button type="button" className="st-btn pri" onClick={openRounds}>باز کردن</button></div>
      </section>

      <section className="st-card">
        <h2>داده‌ها و پشتیبان</h2>
        <p className="st-note">پشتیبان کامل، یک فایل است با برنامه‌ریز، مباحث، گزارش‌ها، تنظیمات، گنجینه‌ی سؤال و کتابخانه‌ی کلید/پاسخ‌برگ/نتیجه‌ها ({P(backupKeys().length)} بخش داده روی این دستگاه). اطلاعات ورود به حساب داخل فایل نمی‌رود.</p>
        <div className="st-acts">
          <button type="button" className="st-btn pri" disabled={busy} onClick={doExport}><Download size={16} /> ساخت پشتیبان کامل</button>
          <button type="button" className="st-btn" disabled={busy} onClick={() => file.current?.click()}><Upload size={16} /> بازیابی از فایل</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {msg && <p className="st-msg" role="status">{msg}</p>}
      </section>

      <p className="st-foot">{BUILD_LABEL}</p>
    </div>
  );
};
