import React from 'react';
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PlannerData } from '../../types';
import { PERSIAN_MONTH_NAMES } from '../../jalali';
import { addDays, dateKeyOf, jalaliOfDate } from '../../plannerStore';
import { toPersianDigits as P } from '../../utils';
import { confirmDialog } from '../../dialog';
import { useBackToClose } from '../../useBackToClose';
import { Sheet } from '../ui/Sheet';
import { PlannerItemForm } from './PlannerItemForm';
import {
  ApplyMode, ApplyResult, PRESET_COLORS, PresetItem, WEEKDAYS, WeekPreset,
  applyPreset, captureWeek, deletePreset, duplicatePreset, emptyPreset, presetCount, presetMinutes, previewApply, upsertPreset, useWeekPresets
} from '../../weekPresets';
import './weekPresets.css';

const weekLabel = (start: Date): string => {
  const a = jalaliOfDate(start), b = jalaliOfDate(addDays(start, 6));
  const mn = (m: number) => PERSIAN_MONTH_NAMES[m - 1];
  return a.jm === b.jm ? `${P(a.jd)} تا ${P(b.jd)} ${mn(a.jm)}` : `${P(a.jd)} ${mn(a.jm)} تا ${P(b.jd)} ${mn(b.jm)}`;
};
const hours = (min: number): string => { const h = Math.round((min / 60) * 10) / 10; return P(String(h).replace('.', '٫')) + ' ساعت'; };

/* ------------------------------------------------------------------ editor (full screen) */
const PresetEditor: React.FC<{ id: string; data: PlannerData; onClose: () => void }> = ({ id, data, onClose }) => {
  const list = useWeekPresets();
  const p = list.find((x) => x.id === id);
  const [form, setForm] = React.useState<{ day: number; idx: number | null } | null>(null); // idx null = adding
  const [copyOf, setCopyOf] = React.useState<{ day: number; idx: number } | null>(null);
  useBackToClose(true, onClose);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  if (!p) return null;

  const change = (fn: (c: WeekPreset) => void) => { const c: WeekPreset = JSON.parse(JSON.stringify(p)); fn(c); upsertPreset(c); };
  const part = data.schedule.partMinutes;

  return (
    <div className="wp-editor" role="dialog" aria-modal="true" aria-label="ویرایش قالب">
      <header className="wp-etop">
        <button type="button" className="wp-ib" onClick={onClose} aria-label="بستن"><X size={20} /></button>
        <h2>ویرایش قالب</h2>
        <span className="grow" />
        <span className="wp-auto">تغییرات خودکار ذخیره می‌شود ✓</span>
        <button type="button" className="wp-btn p" onClick={onClose}>پایان</button>
      </header>
      <div className="wp-ebody">
        <section className="wp-meta">
          <input className="wp-in" value={p.name} onChange={(e) => change((c) => { c.name = e.target.value; })} placeholder="نام قالب" aria-label="نام قالب" />
          <div className="wp-colors" role="group" aria-label="رنگ">
            {PRESET_COLORS.map((c) => <button key={c} type="button" className={p.color === c ? 'on' : ''} style={{ background: c }} aria-label={'رنگ ' + c} aria-pressed={p.color === c} onClick={() => change((x) => { x.color = c; })} />)}
          </div>
          <input className="wp-in" value={p.note || ''} onChange={(e) => change((c) => { c.note = e.target.value; })} placeholder="یادداشت (اختیاری)، مثلاً: هفتهٔ فشرده قبل از آزمون" aria-label="یادداشت" />
          <div className="wp-sum">{P(presetCount(p))} پارت · حدود {hours(presetMinutes(p, part))}</div>
        </section>

        <div className="wp-days">
          {WEEKDAYS.map((dn, d) => {
            const items = p.days[d];
            const mins = items.reduce((m, it) => m + (it.minutes || part), 0);
            return (
              <section key={d} className="wp-day">
                <div className="wp-dh"><b>{dn}</b><span>{items.length ? `${P(items.length)} پارت · ${hours(mins)}` : 'خالی'}</span></div>
                {items.map((it, i) => (
                  <React.Fragment key={i}>
                    {form && form.day === d && form.idx === i ? (
                      <PlannerItemForm
                        subjects={data.subjects} sourceColors={data.sourceColors} sourceTypes={data.sourceTypes} defaultMinutes={part}
                        existing={{ id: 'x', subject: it.subject, detail: it.detail, grade: it.grade, source: it.source, minutes: it.minutes, start: it.start, done: false }}
                        onCancel={() => setForm(null)}
                        onSave={(v) => { change((c) => { c.days[d][i] = { subject: v.subject, detail: v.detail, grade: v.grade, ...(v.source ? { source: v.source } : {}), ...(v.minutes ? { minutes: v.minutes } : {}), ...(v.start ? { start: v.start } : {}) }; }); setForm(null); }}
                      />
                    ) : (
                      <div className="wp-it">
                        <div className="wp-itx">
                          <b>{it.subject}</b>
                          {it.detail && <span>{it.detail}</span>}
                          <div className="wp-tags">
                            {it.source && <i style={{ background: data.sourceColors[it.source] || '#8a94a6' }}>{it.source}</i>}
                            {it.minutes ? <i className="n">{P(it.minutes)} دقیقه</i> : null}
                            {it.start ? <i className="n">⏱ {P(it.start)}</i> : null}
                          </div>
                        </div>
                        <div className="wp-ia">
                          <button type="button" className="wp-ib s" aria-label="بالاتر" disabled={i === 0} onClick={() => change((c) => { const a = c.days[d]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}>↑</button>
                          <button type="button" className="wp-ib s" aria-label="پایین‌تر" disabled={i === items.length - 1} onClick={() => change((c) => { const a = c.days[d]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; })}>↓</button>
                          <button type="button" className="wp-ib s" aria-label="ویرایش" onClick={() => { setForm({ day: d, idx: i }); setCopyOf(null); }}><Pencil size={15} /></button>
                          <button type="button" className={'wp-ib s' + (copyOf && copyOf.day === d && copyOf.idx === i ? ' on' : '')} aria-label="کپی به روز دیگر" onClick={() => setCopyOf(copyOf && copyOf.day === d && copyOf.idx === i ? null : { day: d, idx: i })}><Copy size={15} /></button>
                          <button type="button" className="wp-ib s d" aria-label="حذف" onClick={() => change((c) => { c.days[d].splice(i, 1); })}><Trash2 size={15} /></button>
                        </div>
                        {copyOf && copyOf.day === d && copyOf.idx === i && (
                          <div className="wp-copyrow" role="group" aria-label="کپی به">
                            <span>کپی به:</span>
                            {WEEKDAYS.map((n2, d2) => d2 === d ? null : (
                              <button key={d2} type="button" onClick={() => { change((c) => { c.days[d2].push({ ...c.days[d][i] }); }); setCopyOf(null); }}>{n2}</button>
                            ))}
                            <button type="button" className="all" onClick={() => { change((c) => { for (let k = 0; k < 7; k++) if (k !== d) c.days[k].push({ ...c.days[d][i] }); }); setCopyOf(null); }}>همهٔ روزها</button>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))}
                {form && form.day === d && form.idx === null ? (
                  <PlannerItemForm
                    subjects={data.subjects} sourceColors={data.sourceColors} sourceTypes={data.sourceTypes} defaultMinutes={part}
                    onCancel={() => setForm(null)}
                    onSave={(v) => { change((c) => { c.days[d].push({ subject: v.subject, detail: v.detail, grade: v.grade, ...(v.source ? { source: v.source } : {}), ...(v.minutes ? { minutes: v.minutes } : {}), ...(v.start ? { start: v.start } : {}) } as PresetItem); }); setForm(null); }}
                  />
                ) : (
                  <button type="button" className="wp-add" onClick={() => { setForm({ day: d, idx: null }); setCopyOf(null); }}><Plus size={15} /> افزودن درس</button>
                )}
                {p.rests[d].length > 0 && (
                  <div className="wp-rests">{p.rests[d].map((r) => <span key={r.id}>{r.icon} {r.label} {P(r.start)}–{P(r.end)}</span>)}</div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ apply screen */
const ApplyView: React.FC<{ p: WeekPreset; data: PlannerData; weekStart: Date; onBack: () => void; onDone: (r: ApplyResult, name: string) => void }> = ({ p, data, weekStart, onBack, onDone }) => {
  const hasTime = p.rests.some((r) => r.length) || p.timeline.some(Boolean);
  const [off, setOff] = React.useState(0);
  const [weeks, setWeeks] = React.useState(1);
  const [mode, setMode] = React.useState<ApplyMode>('append');
  const [withTime, setWithTime] = React.useState(hasTime);
  const start = addDays(weekStart, off * 7);
  const opts = { mode, withTime, weeks };
  const pv = React.useMemo(() => previewApply(data, p, start, opts), [data, p, off, mode, weeks]); // eslint-disable-line react-hooks/exhaustive-deps
  const modes: Array<[ApplyMode, string, string]> = [
    ['append', 'افزودن به برنامهٔ موجود', 'کارت‌های فعلی می‌مانند و کارت‌های قالب بعد از آن‌ها اضافه می‌شود.'],
    ['empty', 'فقط روزهای خالی', 'روزی که از قبل کارت دارد دست نمی‌خورد.'],
    ['replace', 'جایگزینی کل هفته', 'کارت‌های فعلی آن هفته پاک و با قالب عوض می‌شوند (با «بازگردانی» برمی‌گردند).']
  ];
  const go = async () => {
    if (!pv.add && !pv.remove) return;
    if (mode === 'replace' && pv.remove > 0 && !(await confirmDialog(`${P(pv.remove)} کارت فعلی پاک می‌شود و ${P(pv.add)} کارت قالب جایگزین می‌شود. ادامه می‌دهید؟`))) return;
    onDone(applyPreset(data, p, start, opts), p.name);
  };
  return (
    <div className="wp-apply">
      <div className="wp-ah"><button type="button" className="wp-ib" onClick={onBack} aria-label="بازگشت"><ChevronRight size={20} /></button><div><b>اعمال «{p.name}»</b><span>{P(presetCount(p))} پارت</span></div></div>
      <div className="wp-lb">روی کدام هفته؟</div>
      <div className="wp-weeknav">
        <button type="button" className="wp-ib" onClick={() => setOff((o) => o - 1)} aria-label="هفتهٔ قبل"><ChevronRight size={18} /></button>
        <div><b>{weekLabel(start)}</b><span>{off === 0 ? 'هفتهٔ نمایش‌داده‌شده' : off > 0 ? `${P(off)} هفته بعد` : `${P(-off)} هفته قبل`}</span></div>
        <button type="button" className="wp-ib" onClick={() => setOff((o) => o + 1)} aria-label="هفتهٔ بعد"><ChevronLeft size={18} /></button>
      </div>
      <div className="wp-quick">
        {[[0, 'همین هفته'], [1, 'هفتهٔ بعد'], [2, '۲ هفتهٔ بعد']].map(([o, l]) => <button key={String(o)} type="button" className={off === o ? 'on' : ''} onClick={() => setOff(o as number)}>{l}</button>)}
      </div>
      <div className="wp-lb">برای چند هفتهٔ پشت‌سرهم؟</div>
      <div className="wp-step">
        <button type="button" className="wp-ib" onClick={() => setWeeks((w) => Math.max(1, w - 1))} disabled={weeks <= 1} aria-label="کمتر">−</button>
        <b>{P(weeks)} هفته</b>
        <button type="button" className="wp-ib" onClick={() => setWeeks((w) => Math.min(12, w + 1))} disabled={weeks >= 12} aria-label="بیشتر">+</button>
        {weeks > 1 && <span>تا {weekLabel(addDays(start, (weeks - 1) * 7)).split(' تا ').pop()}</span>}
      </div>
      <div className="wp-lb">چطور اعمال شود؟</div>
      <div className="wp-modes" role="radiogroup">
        {modes.map(([m, t, d]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}><b>{t}</b><span>{d}</span></button>
        ))}
      </div>
      {hasTime && (
        <label className="wp-check"><input type="checkbox" checked={withTime} onChange={(e) => setWithTime(e.target.checked)} /> ساعت‌بندی و استراحت‌های قالب هم اعمال شود</label>
      )}
      <div className="wp-pv" role="status">
        {pv.add || pv.remove
          ? <>{P(pv.add)} کارت اضافه می‌شود{pv.remove ? <> · <em>{P(pv.remove)} کارت فعلی پاک می‌شود</em></> : null}</>
          : 'چیزی برای اعمال نیست (روزهای انتخابی پر یا قالب خالی است).'}
      </div>
      <button type="button" className="wp-btn p big" disabled={!pv.add && !pv.remove} onClick={() => void go()}>اعمال قالب</button>
    </div>
  );
};

/* ------------------------------------------------------------------ the panel */
export const WeekPresetsPanel: React.FC<{
  data: PlannerData; weekStart: Date; onClose: () => void; onApplied: (r: ApplyResult, name: string) => void;
}> = ({ data, weekStart, onClose, onApplied }) => {
  const list = useWeekPresets();
  const [view, setView] = React.useState<{ apply: string } | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [name, setName] = React.useState(() => 'هفتهٔ ' + weekLabel(weekStart));
  const [withTime, setWithTime] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const weekCount = React.useMemo(() => {
    let n = 0;
    for (let i = 0; i < 7; i++) n += (data.items[dateKeyOf(addDays(weekStart, i))] || []).length;
    return n;
  }, [data, weekStart]);
  const color = PRESET_COLORS[list.length % PRESET_COLORS.length];

  const saveWeek = () => {
    const p = captureWeek(data, weekStart, name.trim() || 'قالب بدون نام', color, withTime);
    upsertPreset(p); setSaving(false);
    setName('هفتهٔ ' + weekLabel(weekStart));
  };
  const create = () => { const p = emptyPreset('قالب جدید', color); upsertPreset(p); setEditId(p.id); };
  const remove = async (p: WeekPreset) => { if (await confirmDialog(`قالب «${p.name}» حذف شود؟`)) deletePreset(p.id); };
  const applying = view ? list.find((x) => x.id === view.apply) : null;

  return (
    <>
      <Sheet onClose={onClose} title={applying ? 'اعمال قالب' : 'قالب‌های هفته'} z={640}>
        {applying ? (
          <ApplyView p={applying} data={data} weekStart={weekStart} onBack={() => setView(null)} onDone={(r, n) => { onApplied(r, n); onClose(); }} />
        ) : (
          <div className="wp-list">
            <p className="wp-hint">یک هفته را با همهٔ کارت‌هایش به‌عنوان قالب ذخیره کنید، هر وقت خواستید ویرایشش کنید و روی هفته‌های دیگر بارگذاری کنید.</p>

            {saving ? (
              <div className="wp-save">
                <div className="wp-lb">ذخیرهٔ {weekLabel(weekStart)} ({P(weekCount)} پارت)</div>
                <input className="wp-in" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveWeek(); }} placeholder="نام قالب" aria-label="نام قالب" />
                <label className="wp-check"><input type="checkbox" checked={withTime} onChange={(e) => setWithTime(e.target.checked)} /> ساعت‌بندی و استراحت‌ها هم ذخیره شود</label>
                <div className="wp-row"><button type="button" className="wp-btn p" onClick={saveWeek}>ذخیره</button><button type="button" className="wp-btn" onClick={() => setSaving(false)}>انصراف</button></div>
              </div>
            ) : (
              <div className="wp-row">
                <button type="button" className="wp-btn p" disabled={!weekCount} onClick={() => setSaving(true)} title={weekCount ? '' : 'این هفته خالی است'}>💾 ذخیرهٔ این هفته به‌عنوان قالب</button>
                <button type="button" className="wp-btn" onClick={create}><Plus size={15} /> قالب خالی</button>
              </div>
            )}
            {!weekCount && !saving && <p className="wp-hint dim">هفتهٔ نمایش‌داده‌شده خالی است؛ یا کارت اضافه کنید، یا یک قالب خالی بسازید و در ویرایشگر پر کنید.</p>}

            {list.length === 0 && <div className="wp-empty">هنوز قالبی ندارید.</div>}
            <div className="wp-cards">
              {list.map((p) => {
                const max = Math.max(1, ...p.days.map((d) => d.length));
                return (
                  <article key={p.id} className="wp-card" style={{ ['--pc' as string]: p.color }}>
                    <div className="wp-ct"><b>{p.name}</b><span>{P(presetCount(p))} پارت · {hours(presetMinutes(p, data.schedule.partMinutes))}</span></div>
                    {p.note && <div className="wp-note">{p.note}</div>}
                    <div className="wp-strip" aria-hidden="true">
                      {p.days.map((d, i) => <div key={i}><i style={{ height: 6 + (d.length / max) * 30 }} /><small>{WEEKDAYS[i][0]}</small></div>)}
                    </div>
                    <div className="wp-ca">
                      <button type="button" className="wp-btn p" disabled={!presetCount(p)} onClick={() => setView({ apply: p.id })}>اعمال روی هفته</button>
                      <button type="button" className="wp-btn" onClick={() => setEditId(p.id)}><Pencil size={14} /> ویرایش</button>
                      <button type="button" className="wp-ib" aria-label="کپی قالب" title="کپی قالب" onClick={() => duplicatePreset(p.id)}><Copy size={16} /></button>
                      <button type="button" className="wp-ib d" aria-label="حذف قالب" title="حذف قالب" onClick={() => void remove(p)}><Trash2 size={16} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </Sheet>
      {editId && <PresetEditor id={editId} data={data} onClose={() => setEditId(null)} />}
    </>
  );
};

