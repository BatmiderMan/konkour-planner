import React, { useMemo, useState } from 'react';
import { bn } from './qno';
import { Play, FileText, Gem, Bookmark, Shuffle } from 'lucide-react';
import { Lab, addRefsToVault } from './parts';
import { Filter, NO_FILTER, ORDERS, Order, STATUS, Source, arrange, filterActive, pool } from './lab';
import { LEVEL, Ref, newSetId, saveSet } from './store';
import { Run } from './Player';
import { alertDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';
import { promptName } from './util';

export const FilterChips: React.FC<{ f: Filter; set: (f: Filter) => void; last?: Record<string, string> }> = ({ f, set, last }) => {
  const cnt = (k: string) => (last ? Object.values(last).filter((v) => v === k).length : 0);
  const tog = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);
  return (
    <div className="bk-chips">
      {STATUS.map(([k, l]) => <button type="button" key={k} className={'bk-chip s' + k + (f.status.includes(k) ? ' on' : '')} onClick={() => set({ ...f, status: tog(f.status, k) })}>{l}</button>)}
      <button type="button" className={'bk-chip last bad' + (f.lastBad ? ' on' : '')} title="سؤال‌هایی که آخرین بار که در آزمون آمدند غلط زده بودید" onClick={() => set({ ...f, lastBad: !f.lastBad })}>✗ غلط‌ها طبق آخرین آزمون{last ? ' (' + P(cnt('bad')) + ')' : ''}</button>
      <button type="button" className={'bk-chip last blank' + (f.lastBlank ? ' on' : '')} title="سؤال‌هایی که آخرین بار که در آزمون آمدند نزده بودید" onClick={() => set({ ...f, lastBlank: !f.lastBlank })}>○ نزده‌ها طبق آخرین آزمون{last ? ' (' + P(cnt('blank')) + ')' : ''}</button>
      <button type="button" className={'bk-chip' + (f.star ? ' on' : '')} onClick={() => set({ ...f, star: !f.star })}>⭐ مهم</button>
      <button type="button" className={'bk-chip' + (f.doubt ? ' on' : '')} onClick={() => set({ ...f, doubt: !f.doubt })}>🤔 شک‌دار</button>
      {[1, 2, 3].map((l) => <button type="button" key={l} className={'bk-chip' + (f.levels.includes(l) ? ' on' : '')} onClick={() => set({ ...f, levels: tog(f.levels, l) })}>{LEVEL[l]}</button>)}
      <button type="button" className={'bk-chip' + (f.expl ? ' on' : '')} onClick={() => set({ ...f, expl: !f.expl })}>دارای تشریحی</button>
      <button type="button" className={'bk-chip' + (f.noted ? ' on' : '')} onClick={() => set({ ...f, noted: !f.noted })}>📝 یادداشت‌دار</button>
      {filterActive(f) && <button type="button" className="bk-chip clr" onClick={() => set(NO_FILTER)}>پاک کردن فیلتر</button>}
    </div>
  );
};

interface SrcState { on: boolean; from: string; to: string; secs: number[] }

export const Builder: React.FC<{ lab: Lab; onStart: (r: Run) => void; onPdf: (refs: Ref[], title: string, mixed: boolean) => void }> = ({ lab, onStart, onPdf }) => {
  const [src, setSrc] = useState<Record<string, SrcState>>({});
  const [setId, setSetId] = useState('');
  const [f, setF] = useState<Filter>(NO_FILTER);
  const [order, setOrder] = useState<Order>('book');
  const [count, setCount] = useState('');
  const [practice, setPractice] = useState(false);
  const [pressure, setPressure] = useState(false);
  const [pzMins, setPzMins] = useState('');
  const [mins, setMins] = useState('');
  const [step, setStep] = useState(1);   // 2x / 3x / 4x: only every step-th question (by its printed book number) belongs to the exam
  const [off, setOff] = useState(0);     // which of them: 0 = 1,3,5… (odd)  ·  1 = 2,4,6… (even)
  const cur = (id: string): SrcState => src[id] || { on: false, from: '', to: '', secs: [] };
  const upd = (id: string, p: Partial<SrcState>) => setSrc((s) => ({ ...s, [id]: { ...cur(id), ...p } }));
  const sources: Source[] = lab.books.filter((b) => cur(b.id).on).map((b) => { const s = cur(b.id); return { b: b.id, from: s.from ? +s.from : undefined, to: s.to ? +s.to : undefined, secs: s.secs }; });
  const base = useMemo(() => {
    if (setId) {
      const st = lab.sets.find((x) => x.id === setId); if (!st) return [];
      const only = pool(lab.bookMap, st.refs.map((r) => ({ b: r.b })).filter((x, i, a) => a.findIndex((y) => y.b === x.b) === i), f, lab.meta, lab.sections, lab.last);
      const ok = new Set(only.map((r) => r.b + ':' + r.n)); return st.refs.filter((r) => ok.has(r.b + ':' + r.n));
    }
    return pool(lab.bookMap, sources, f, lab.meta, lab.sections, lab.last);
  }, [lab, src, setId, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => (step > 1 ? base.filter((r) => (((bn(r.n) - 1 - off) % step) + step) % step === 0) : base), [base, step, off]);
  const setPlan = (st: number) => { setStep(st); setOff(st === 2 ? 1 : 0); };   // 2x defaults to the even questions
  const planTxt = step > 1 ? ' · ' + P(step) + 'x' + (step === 2 ? (off === 1 ? ' زوج' : ' فرد') : ' ردیف ' + P(off + 1)) : '';
  const n = Math.max(0, parseInt(count, 10) || 0);
  const total = n > 0 ? Math.min(n, list.length) : list.length;
  const build = (): Ref[] => arrange(list, order, n, lab.meta);
  const mixed = new Set(list.map((r) => r.b)).size > 1;
  const nameOf = () => ((setId ? lab.sets.find((x) => x.id === setId)?.name || 'مجموعه' : sources.length === 1 ? lab.bookMap.get(sources[0].b)!.title : sources.length ? `ترکیبی · ${P(sources.length)} کتاب` : 'آزمون')) + planTxt;
  const need = async () => { if (!list.length) { await alertDialog(sources.length || setId ? 'سؤالی با این انتخاب پیدا نشد.' : 'اول یک یا چند کتاب (یا یک مجموعه) را انتخاب کنید.'); return false; } return true; };

  if (!lab.books.length) return <div className="bk-emptybox"><b>هنوز کتابی اضافه نشده</b><span>از تب «کتابخانه» فایل .qbank را وارد کنید.</span></div>;
  return (
    <div className="bk-builder">
      <div className="bk-form">
        <h3>۱ · منبع سؤال‌ها <small className="bk-hint">(چند کتاب = آزمون ترکیبی)</small></h3>
        {lab.books.map((b) => {
          const s = cur(b.id), secs = lab.sections[b.id] || [];
          return (
            <div key={b.id} className={'bk-src' + (s.on && !setId ? ' on' : '')}>
              <label className="bk-check"><input type="checkbox" checked={s.on} disabled={!!setId} onChange={(e) => upd(b.id, { on: e.target.checked })} /> <b>{b.title}</b> <small>({P(b.numbers.length)} سؤال)</small></label>
              {s.on && !setId && (
                <div className="bk-srcopts">
                  <div className="bk-fields"><label>از سؤال<input inputMode="numeric" value={s.from} placeholder={P(bn(b.numbers[0] || 1))} onChange={(e) => upd(b.id, { from: e.target.value.replace(/\D/g, '') })} /></label>
                    <label>تا سؤال<input inputMode="numeric" value={s.to} placeholder={P(bn(b.numbers[b.numbers.length - 1] || 1))} onChange={(e) => upd(b.id, { to: e.target.value.replace(/\D/g, '') })} /></label></div>
                  {secs.length > 0 && <div className="bk-chips">{secs.map((c, i) => <button type="button" key={i} className={'bk-chip' + (s.secs.includes(i) ? ' on' : '')} onClick={() => upd(b.id, { secs: s.secs.includes(i) ? s.secs.filter((x) => x !== i) : [...s.secs, i] })}>{c.name}</button>)}</div>}
                </div>
              )}
            </div>
          );
        })}
        {lab.sets.length > 0 && (
          <label className="bk-lab">یا از یکی از مجموعه‌های من
            <select className="bk-in" value={setId} onChange={(e) => setSetId(e.target.value)}><option value="">— انتخاب نشده —</option>{lab.sets.map((s) => <option key={s.id} value={s.id}>{s.name} ({P(s.refs.length)})</option>)}</select>
          </label>
        )}
      </div>
      <div className="bk-form">
        <h3>۲ · فیلتر هوشمند</h3>
        <FilterChips f={f} set={setF} last={lab.last} />
        <h3>۳ · ترتیب و تعداد</h3>
        <div className="bk-seg bk-seg4">{ORDERS.map(([k, l]) => <button type="button" key={k} className={order === k ? 'on' : ''} onClick={() => setOrder(k)}>{l}</button>)}</div>
        <p className="bk-hint">{ORDERS.find((o) => o[0] === order)![2]}</p>
        <div className="bk-plan">
          <span className="bk-plan-t">همه‌ی تست‌ها یا یکی در میان؟ <small className="bk-hint">(۲x / ۳x)</small></span>
          <div className="bk-seg bk-seg-s" role="group" aria-label="برنامهٔ ۲x / ۳x">
            {([[1, 'همه'], [2, '۲x'], [3, '۳x'], [4, '۴x']] as const).map(([k, l]) => <button type="button" key={k} className={step === k ? 'on' : ''} aria-pressed={step === k} onClick={() => setPlan(k)}>{l}</button>)}
          </div>
          {step > 1 && (
            <div className="bk-seg bk-seg-s" role="group" aria-label="کدام سؤال‌ها">
              {Array.from({ length: step }, (_, i) => (
                <button type="button" key={i} className={off === i ? 'on' : ''} aria-pressed={off === i} onClick={() => setOff(i)}>
                  {step === 2 ? (i === 1 ? 'زوج · ۲، ۴، ۶…' : 'فرد · ۱، ۳، ۵…') : P(i + 1) + '، ' + P(i + 1 + step) + '، ' + P(i + 1 + 2 * step) + '…'}
                </button>
              ))}
            </div>
          )}
          {step > 1 && <p className="bk-hint">فقط سؤال‌هایی که شمارهٔ چاپی‌شان در این الگو می‌افتد در آزمون می‌آید؛ بقیه کنار گذاشته می‌شوند (برای PDF، مجموعه و گنجینه هم همین‌طور).</p>}
        </div>
        <div className="bk-fields">
          <label>تعداد سؤال (خالی = همه)<input inputMode="numeric" value={count} placeholder={P(list.length)} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} /></label>
          {!pressure && <label>زمان (دقیقه، خالی = بدون محدودیت)<input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ''))} /></label>}
        </div>
        <label className="bk-check"><input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} /> حالت تمرین: بعد از هر پاسخ، درست/غلط و پاسخ تشریحی نشان داده شود</label>
        <label className="bk-check"><input type="checkbox" checked={pressure} onChange={(e) => setPressure(e.target.checked)} /> ⏱ تمرین فشار زمانی: کل زمان را خودت تعیین می‌کنی؛ هر سؤال سهمی از زمانِ باقی‌مانده دارد و خودکار می‌رود سؤال بعد</label>
        {pressure && (() => {
          const minsEff = Math.max(1, +pzMins || Math.round((total * 75) / 60)), perQ = total ? Math.round((minsEff * 60) / total) : 0;
          return <div className="bk-pz-set">
            <div className="bk-pz-plan">
              <label>زمان کل (دقیقه)<input inputMode="numeric" value={pzMins} placeholder={P(minsEff)} onChange={(e) => setPzMins(e.target.value.replace(/\D/g, ''))} /></label>
              <div className="bk-pz-presets">{([[90, 'راحت'], [75, 'معمولی'], [60, 'فشرده'], [45, 'جهنمی']] as const).map(([sec, name]) => <button type="button" key={sec} className={'bk-chip' + (+pzMins === Math.max(1, Math.round((total * sec) / 60)) ? ' on' : '')} onClick={() => setPzMins(String(Math.max(1, Math.round((total * sec) / 60))))}>{name}<small> · {P(sec)} ث/سؤال</small></button>)}</div>
            </div>
            <p className="bk-pz-sum"><b>{P(total)}</b> سؤال در <b>{P(minsEff)}</b> دقیقه ← حدود <b>{P(perQ)}</b> ثانیه برای هر سؤال{perQ > 0 && perQ < 20 ? ' (خیلی فشرده!)' : ''}</p>
            <p className="bk-hint">کل زمان یک «بانک مشترک» است: هر سؤال سهمی برابرِ «زمان باقی‌مانده ÷ سؤال‌های باقی‌مانده» دارد. سریع جواب بدهی، ثانیه‌های پس‌انداز به سؤال‌های بعدی می‌رسد؛ کُند بروی، بعدی‌ها تنگ‌تر می‌شوند. ۳ «زمان‌خر» داری که هرکدام ۵۰٪ زمان می‌دهد ولی نصف نمرهٔ آن سؤال را می‌برد؛ با ۳ پاسخ درستِ سریع پشت‌هم یکی جایزه می‌گیری.</p>
          </div>;
        })()}
      </div>
      <div className="bk-sticky">
        <b className="bk-count"><Shuffle size={16} /> {P(total)} سؤال{mixed ? ' از چند کتاب' : ''}</b>
        <button type="button" className="bk-btn primary" disabled={!total} onClick={async () => { if (await need()) onStart({ refs: build(), practice: practice && !pressure, minutes: pressure ? 0 : +mins || 0, title: nameOf(), ...(pressure ? { pressure: { totalSec: Math.max(1, +pzMins || Math.round((total * 75) / 60)) * 60, tokens: total && (Math.max(1, +pzMins || Math.round((total * 75) / 60)) * 60) / total < 50 ? 2 : 3 } } : {}) }); }}><Play size={18} /> شروع</button>
        <button type="button" className="bk-btn" disabled={!total} onClick={async () => { if (await need()) onPdf(build(), nameOf(), mixed); }}><FileText size={16} /> PDF</button>
        <button type="button" className="bk-btn" disabled={!total} onClick={async () => { if (await need()) addRefsToVault(lab, build()); }}><Gem size={16} /> گنجینه</button>
        <button type="button" className="bk-btn" disabled={!total} onClick={async () => { if (!(await need())) return; const name = await promptName('نام مجموعه', nameOf()); if (!name) return; await saveSet({ id: newSetId(), name, refs: build(), created: Date.now(), updated: Date.now() }); await alertDialog('مجموعه ذخیره شد.'); }}><Bookmark size={16} /> مجموعه</button>
      </div>
    </div>
  );
};
