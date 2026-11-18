import React, { useMemo, useState } from 'react';
import { qno } from './qno';
import { CheckSquare, FileText, Gem, Bookmark, Play } from 'lucide-react';
import { Lab, Viewer, addRefsToVault } from './parts';
import { FilterChips } from './Builder';
import { Filter, NO_FILTER, pool, refKey } from './lab';
import { Ref, keyOf, newSetId, saveSet, masteryOf } from './store';
import { Run } from './Player';
import { alertDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';
import { promptName } from './util';

/** All questions as a grid coloured by how well you know them. Tap = open with answer + explanation; «select» = act on many. */
export const Browse: React.FC<{ lab: Lab; onStart: (r: Run) => void; onPdf: (refs: Ref[], title: string, mixed: boolean) => void }> = ({ lab, onStart, onPdf }) => {
  const [bid, setBid] = useState('');
  const [f, setF] = useState<Filter>(NO_FILTER);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [view, setView] = useState<number | null>(null);
  const ids = bid ? [bid] : lab.books.map((b) => b.id);
  const list = useMemo(() => pool(lab.bookMap, ids.map((b) => ({ b })), f, lab.meta, lab.sections, lab.last), [lab, bid, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = sel ? list.filter((r) => sel.has(refKey(r))) : [];
  const multi = lab.books.length > 1 && !bid;
  const flip = (r: Ref) => setSel((s) => { const n = new Set(s || []); n.has(refKey(r)) ? n.delete(refKey(r)) : n.add(refKey(r)); return n; });
  if (!lab.books.length) return <div className="bk-emptybox"><b>هنوز کتابی اضافه نشده</b></div>;
  return (
    <div className="bk-browse">
      <div className="bk-form">
        <select className="bk-in" value={bid} onChange={(e) => setBid(e.target.value)}><option value="">همهٔ کتاب‌ها</option>{lab.books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
        <FilterChips f={f} set={setF} last={lab.last} />
        <div className="bk-acts"><span className="bk-hint">{P(list.length)} سؤال</span>
          <button type="button" className={'bk-btn' + (sel ? ' primary' : '')} onClick={() => setSel(sel ? null : new Set())}><CheckSquare size={16} /> {sel ? 'پایان انتخاب' : 'انتخاب چندتایی'}</button>
          {sel && <button type="button" className="bk-btn" onClick={() => setSel(new Set(list.map(refKey)))}>همه</button>}</div>
      </div>
      {!list.length && <p className="bk-empty">سؤالی با این فیلتر نیست.</p>}
      <div className="bk-grid">
        {list.map((r, i) => {
          const m = lab.meta[keyOf(r.b, r.n)], st = masteryOf(m), on = sel?.has(refKey(r));
          return <button type="button" key={refKey(r)} className={'bk-cell s' + st + (on ? ' sel' : '')} onClick={() => (sel ? flip(r) : setView(i))} title={multi ? lab.bookMap.get(r.b)?.title : undefined}>
            {P(qno(r.n))}{m?.star && <i className="st">★</i>}{m?.doubt && <i className="db">?</i>}{lab.bookMap.get(r.b)?.expl.includes(r.n) && <i className="bk-exdot" />}
          </button>;
        })}
      </div>
      {sel && (
        <div className="bk-sticky"><b className="bk-count">{P(chosen.length)} انتخاب</b>
          <button type="button" className="bk-btn primary" disabled={!chosen.length} onClick={() => onStart({ refs: chosen, practice: true, minutes: 0, title: 'آزمون از انتخاب‌ها' })}><Play size={16} /> آزمون</button>
          <button type="button" className="bk-btn" disabled={!chosen.length} onClick={() => onPdf(chosen, 'مجموعهٔ انتخابی', new Set(chosen.map((r) => r.b)).size > 1)}><FileText size={16} /> PDF</button>
          <button type="button" className="bk-btn" disabled={!chosen.length} onClick={() => addRefsToVault(lab, chosen)}><Gem size={16} /> گنجینه</button>
          <button type="button" className="bk-btn" disabled={!chosen.length} onClick={async () => { const name = await promptName('نام مجموعه'); if (!name) return; await saveSet({ id: newSetId(), name, refs: chosen, created: Date.now(), updated: Date.now() }); await alertDialog('مجموعه ذخیره شد.'); setSel(null); }}><Bookmark size={16} /> مجموعه</button>
        </div>
      )}
      <div className="bk-legend"><i className="s0" /> دیده‌نشده <i className="s1" /> ضعیف <i className="s2" /> در حال یادگیری <i className="s3" /> مسلط <i className="bk-exdot" /> تشریحی دارد</div>
      {view !== null && <Viewer refs={list} start={view} lab={lab} onClose={() => setView(null)} />}
    </div>
  );
};
