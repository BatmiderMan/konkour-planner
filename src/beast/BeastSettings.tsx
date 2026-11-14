import React from 'react';
import { Flame } from 'lucide-react';
import { toPersianDigits as P } from '../utils';
import { DONE_PCT_CHOICES, EXCUSE_CHOICES, GRACE_CHOICES, MIN_PCT_CHOICES, verdictFor } from './beastRules';
import { openBeast, setBeastSettings, useBeast, useBeastRun } from './beastStore';
import { clearCalibration } from './presence';

const Chips: React.FC<{ value: number; onChange: (v: number) => void; items: Array<[number, string]>; label: string; disabled?: boolean }> = ({ value, onChange, items, label, disabled }) => (
  <div className="st-chips" role="radiogroup" aria-label={label}>
    {items.map(([k, t]) => <button key={k} type="button" role="radio" disabled={disabled} aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{t}</button>)}
  </div>
);

/** the «حالت بیست» card of the settings page: the switch, the strictness dials, the streak and the last days */
export const BeastSettings: React.FC = () => {
  const b = useBeast();
  const run = useBeastRun();
  const s = b.settings;
  const locked = Object.values(run.days).some((d) => !d.closed); // a signed day cannot be walked away from by switching the mode off
  const days = Object.values(b.history).sort((x, y) => (x.dateKey < y.dateKey ? 1 : -1)).slice(0, 7);

  return (
    <section className="st-card bs-set">
      <h2><Flame size={16} /> حالت بیست</h2>
      <p className="st-note">حالت سخت‌گیر: قراردادِ روز را امضا می‌کنی، هر پارت دقیقاً سر ساعتش شروع و تمام می‌شود، «۵ دقیقه بیشتر» و مکث ندارد، و با دوربین (فقط روی همین دستگاه) معلوم می‌شود واقعاً سر درس بودی یا نه. زمانِ بیرون‌رفته از همان پارت کم می‌شود، ولی پارت بعدی منتظر نمی‌ماند.</p>

      <label className="st-sw">
        <span><b>روشن بودن حالت بیست</b><small>{locked ? 'یک روزِ امضاشده در جریان است؛ تا پایانش نمی‌شود خاموشش کرد.' : 'یک دکمه‌ی شناور برای امضای قرارداد امروز اضافه می‌شود.'}</small></span>
        <input type="checkbox" role="switch" checked={s.on} disabled={locked && s.on} onChange={(e) => setBeastSettings({ on: e.target.checked })} />
        <i aria-hidden="true" />
      </label>

      {s.on && (
        <>
          <div className="st-acts"><button type="button" className="st-btn pri" onClick={openBeast}><Flame size={15} /> قرارداد امروز / فردا</button></div>
          <label className="st-sw">
            <span><b>تأیید با دوربین</b><small>تصویر هیچ‌جا ذخیره یا فرستاده نمی‌شود؛ فقط «هست / نیست / حواسش پرت است» حساب می‌شود</small></span>
            <input type="checkbox" role="switch" checked={s.camera} disabled={locked} onChange={(e) => setBeastSettings({ camera: e.target.checked })} />
            <i aria-hidden="true" />
          </label>
          <div className="st-row"><span><b>مهلت دور شدن</b><small>کوتاه‌تر از این بخشوده می‌شود</small></span>
            <Chips label="مهلت" value={s.graceSec} disabled={locked} onChange={(v) => setBeastSettings({ graceSec: v })} items={GRACE_CHOICES.map((v) => [v, `${P(v)} ثانیه`] as [number, string])} />
          </div>
          <div className="st-row"><span><b>استراحتِ مجاز در هر پارت</b><small>آب یا دستشویی، بدون جریمه</small></span>
            <Chips label="استراحت مجاز" value={s.excuseSec} disabled={locked} onChange={(v) => setBeastSettings({ excuseSec: v })} items={EXCUSE_CHOICES.map((v) => [v, `${P(v / 60)} دقیقه`] as [number, string])} />
          </div>
          <div className="st-row"><span><b>روز موفق از چند درصد</b><small>برای ادامه‌ی زنجیره‌ی روزهای پشت‌سرهم</small></span>
            <Chips label="حد روز موفق" value={s.minPct} disabled={locked} onChange={(v) => setBeastSettings({ minPct: v })} items={MIN_PCT_CHOICES.map((v) => [v, `${P(v)}٪`] as [number, string])} />
          </div>
          <div className="st-row"><span><b>تیک خوردن کارت برنامه</b><small>کارت وقتی «انجام‌شده» می‌شود که اعتبار پارت به این حد برسد</small></span>
            <Chips label="حد انجام" value={s.doneAtPct} disabled={locked} onChange={(v) => setBeastSettings({ doneAtPct: v })} items={DONE_PCT_CHOICES.map((v) => [v, `${P(v)}٪`] as [number, string])} />
          </div>

          <div className="bs-streak">
            <div><b>{P(b.streak.count)}🔥</b><span>روز پشت‌سرهم</span></div>
            <div><b>{P(b.streak.best)}</b><span>بهترین رکورد</span></div>
          </div>

          {days.length > 0 && (
            <ul className="bs-hist" aria-label="هفت روز اخیر">
              {days.map((d) => (
                <li key={d.dateKey} title={verdictFor(d.pct).title}>
                  <span>{P(d.dateKey.slice(5))}</span>
                  <em><i className={d.pct >= s.minPct ? 'ok' : d.pct >= 50 ? 'mid' : 'low'} style={{ width: Math.max(3, d.pct) + '%' }} /></em>
                  <b>{P(d.pct)}٪</b>
                </li>
              ))}
            </ul>
          )}
          <div className="st-acts"><button type="button" className="st-btn" disabled={locked} onClick={clearCalibration}>پاک کردن کالیبره‌ی دوربین</button></div>
        </>
      )}
    </section>
  );
};
