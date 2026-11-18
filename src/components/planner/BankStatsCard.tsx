import React, { useMemo } from 'react';
import { useLab } from '../../bank/parts';
import { matchRefs, smartPick, statOf } from '../../bank/lab';
import { keyOf } from '../../bank/store';
import { toPersianDigits as P } from '../../utils';
import type { PlannerItem } from '../../types';

/** hands a ready-made exam to the test bank and switches to it (the bank reads «bk-launch» when it opens) */
export const launchBank = (run: { refs: Array<{ b: string; n: number }>; title: string; pressure?: { tight: number; tokens: number } }) => {
  try { sessionStorage.setItem('bk-launch', JSON.stringify({ ...run, practice: false, minutes: 0 })); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('planex:goto', { detail: 'bank' }));
};

const Ring: React.FC<{ v: number; label: string; tone: string }> = ({ v, label, tone }) => (
  <div className="bst-ring" style={{ ['--v' as any]: v, ['--c' as any]: tone }} title={label}><b>{P(v)}٪</b><span>{label}</span></div>
);

/** accuracy (right ÷ answered) and solved share (answered ÷ all) from the test bank — overall and for today's planner cards */
export const BankStatsCard: React.FC<{ items: PlannerItem[] }> = ({ items }) => {
  const lab = useLab();
  const all = useMemo(() => lab.books.flatMap((b) => b.numbers.map((n) => ({ b: b.id, n }))), [lab.books]);
  const overall = useMemo(() => statOf(lab.last, all), [lab.last, all]);
  const rows = useMemo(() => {
    const seen = new Set<string>(); const out: Array<{ key: string; subject: string; label: string; scope: string; refs: Array<{ b: string; n: number }> }> = [];
    for (const it of items) {
      const k = it.subject + '|' + it.detail; if (seen.has(k)) continue; seen.add(k);
      const m = matchRefs(lab.books, lab.sections, it.subject, it.detail + ' ' + (it.source || ''));
      if (m.refs.length) out.push({ key: k, subject: it.subject, label: m.label, scope: m.scope, refs: m.refs });
    }
    return out;
  }, [items, lab.books, lab.sections]);
  if (!lab.ready || !lab.books.length) return null;
  return (
    <section className="bst" aria-label="آمار بانک تست">
      <h3>📊 بانک تست</h3>
      <div className="bst-top">
        <Ring v={overall.acc} label="دقت" tone="#2fb59a" />
        <Ring v={overall.cover} label="حل‌شده" tone="#3b6fe0" />
        <p>{P(overall.solved)} از {P(overall.total)} سؤال را حل کرده‌ای · {P(overall.ok)} درست، {P(overall.bad)} غلط</p>
      </div>
      {rows.map((r) => { const s = statOf(lab.last, r.refs), n = Math.min(20, r.refs.length); return (
        <div className="bst-row" key={r.key}>
          <div className="t"><b>{r.subject}</b><small>{r.scope === 'lesson' ? r.label : 'کل کتاب‌های این درس'} · {P(s.total)} سؤال</small></div>
          <div className="m"><span className="bar a" title="دقت"><i style={{ width: s.acc + '%' }} /></span><small>دقت {P(s.acc)}٪</small></div>
          <div className="m"><span className="bar c" title="حل‌شده"><i style={{ width: s.cover + '%' }} /></span><small>حل‌شده {P(s.cover)}٪</small></div>
          <div className="act">
            <button type="button" onClick={() => launchBank({ refs: smartPick(lab.last, r.refs, n), title: `تست ${r.subject}${r.scope === 'lesson' ? ' · ' + r.label : ''}` })}>تست {P(n)}تایی</button>
            <button type="button" className="pz" onClick={() => launchBank({ refs: smartPick(lab.last, r.refs, n), title: `فشار · ${r.subject}`, pressure: { tight: 0.8, tokens: 3 } })}>⏱ فشار</button>
          </div>
        </div>); })}
      {!rows.length && items.length > 0 && <p className="bst-note">برای کارت‌های امروز کتابی با همین نام درس در بانک پیدا نشد. اسم درس در بانک و برنامه‌ریز باید شبیه هم باشد (مثلاً «ریاضی»).</p>}
    </section>
  );
};
