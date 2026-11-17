import React, { useMemo, useState } from 'react';
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
  const [mins, setMins] = useState('');
  const cur = (id: string): SrcState => src[id] || { on: false, from: '', to: '', secs: [] };
  const upd = (id: string, p: Partial<SrcState>) => setSrc((s) => ({ ...s, [id]: { ...cur(id), ...p } }));
  const sources: Source[] = lab.books.filter((b) => cur(b.id).on).map((b) => { const s = cur(b.id); return { b: b.id, from: s.from ? +s.from : undefined, to: s.to ? +s.to : undefined, secs: s.secs }; });
  const list = useMemo(() => {
    if (setId) {
      const st = lab.sets.find((x) => x.id === setId); if (!st) return [];
      const only = pool(lab.bookMap, st.refs.map((r) => ({ b: r.b })).filter((x, i, a) => a.findIndex((y) => y.b === x.b) === i), f, lab.meta, lab.sections, lab.last);
      const ok = new Set(only.map((r) => r.b + ':' + r.n)); return st.refs.filter((r) => ok.has(r.b + ':' + r.n));
    }
    return pool(lab.bookMap, sources, f, lab.meta, lab.sections, lab.last);
  }, [lab, src, setId, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = Math.max(0, parseInt(count, 10) || 0);
  const total = n > 0 ? Math.min(n, list.length) : list.length;
  const build = (): Ref[] => arrange(list, order, n, lab.meta);
  const mixed = new Set(list.map((r) => r.b)).size > 1;
  const nameOf = () => (setId ? lab.sets.find((x) => x.id === setId)?.name || 'مجموعه' : sources.length === 1 ? lab.bookMap.get(sources[0].b)!.title : sources.length ? `ترکیبی · ${P(sources.length)} کتاب` : 'آزمون');
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
                  <div className="bk-fields"><label>از سؤال<input inputMode="numeric" value={s.from} placeholder={P(b.numbers[0] || 1)} onChange={(e) => upd(b.id, { from: e.target.value.replace(/\D/g, '') })} /></label>
                    <label>تا سؤال<input inputMode="numeric" value={s.to} placeholder={P(b.numbers[b.numbers.length - 1] || 1)} onChange={(e) => upd(b.id, { to: e.target.value.replace(/\D/g, '') })} /></label></div>
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
        <div className="bk-fields">
          <label>تعداد سؤال (خالی = همه)<input inputMode="numeric" value={count} placeholder={P(list.length)} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} /></label>
          <label>زمان (دقیقه، خالی = بدون محدودیت)<input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ''))} /></label>
        </div>
        <label className="bk-check"><input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} /> حالت تمرین: بعد از هر پاسخ، درست/غلط و پاسخ تشریحی نشان داده شود</label>
      </div>
      <div className="bk-sticky">
        <b className="bk-count"><Shuffle size={16} /> {P(total)} سؤال{mixed ? ' از چند کتاب' : ''}</b>
        <button type="button" className="bk-btn primary" disabled={!total} onClick={async () => { if (await need()) onStart({ refs: build(), practice, minutes: +mins || 0, title: nameOf() }); }}><Play size={18} /> شروع</button>
        <button type="button" className="bk-btn" disabled={!total} onClick={async () => { if (await need()) onPdf(build(), nameOf(), mixed); }}><FileText size={16} /> PDF</button>
        <button type="button" className="bk-btn" disabled={!total} onClick={async () => { if (await need()) addRefsToVault(lab, build()); }}><Gem size={16} /> گنجینه</button>
        <button type="button" className="bk-btn" disabled={!total} onClick={async () => { if (!(await need())) return; const name = await promptName('نام مجموعه', nameOf()); if (!name) return; await saveSet({ id: newSetId(), name, refs: build(), created: Date.now(), updated: Date.now() }); await alertDialog('مجموعه ذخیره شد.'); }}><Bookmark size={16} /> مجموعه</button>
      </div>
    </div>
  );
};
