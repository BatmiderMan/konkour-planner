import React from 'react';
import { Settings, Plus, X, ChevronDown, Layers, ArrowRight, FileUp } from 'lucide-react';
import { ImportedExam, buildExam, importReport, rememberHeading, validDate } from '../examImport';
import { ShamsiDatePicker } from './ShamsiDatePicker';
import { confirmDialog } from '../dialog';
import { toPersianDigits } from '../utils';
import { addDays, createPlannerItem, dateKeyOf, dateFromKey, loadPlannerData, savePlannerData, todayGregorian } from '../plannerStore';
import {
  Exam, ExamKind, ExamSettings, Field, FIELD_LABEL, GENERAL_SUGGEST, Section, Counts, ZERO,
  Part, daysUntil, examPercent, hasData, isDetail, isDone, loadExams, loadSettings, makeFieldSections, mapParts, newPart, newSection, newSource,
  partCounts, percentOf, plannerSubjectFor, saveExams, saveSettings, sectionCounts
} from '../examStore';

const P = toPersianDigits;
type Filter = 'all' | ExamKind;
const num = (v: string) => Math.max(0, parseInt(v.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))), 10) || 0);
const avg = (a: number[]) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10;
const kindLabel = (k: ExamKind) => (k === 'real' ? 'واقعی' : 'شبیه‌سازی');
const tone = (p: number) => (p < 30 ? 'low' : p < 60 ? 'mid' : 'high');
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const NumIn: React.FC<{ v: number; on?: (n: number) => void; ro?: boolean; label?: string }> = ({ v, on, ro, label }) =>
  ro ? <span className="ex-ro">{v ? P(v) : '–'}</span>
    : <input inputMode="numeric" aria-label={label} value={v ? P(v) : ''} placeholder="۰" onChange={(e) => on && on(num(e.target.value))} />;

export const ExamsView: React.FC = () => {
  const [exams, setExams] = React.useState<Exam[]>(() => loadExams());
  const [cfg, setCfg] = React.useState<ExamSettings>(() => loadSettings());
  const [view, setView] = React.useState<'main' | 'settings'>('main');
  const [filter, setFilter] = React.useState<Filter>('all');
  const [draft, setDraft] = React.useState<Exam | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  // the open card stays in the list group it was opened in, so entering the first number doesn't move it (a move remounts the inputs and drops focus)
  const [pinDone, setPinDone] = React.useState(false);
  const [trend, setTrend] = React.useState('all');
  const [openSec, setOpenSec] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState('');
  const [imp, setImp] = React.useState<{ exam: ImportedExam; sigs: string[] } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const plannerSubjects = React.useMemo(() => loadPlannerData().subjects.map((s) => s.n), []);

  const persist = (list: Exam[]) => { setExams(list); saveExams(list); };
  const setC = (patch: Partial<ExamSettings>) => { const n = { ...cfg, ...patch }; setCfg(n); saveSettings(n); };
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2600); };
  const patchExam = (e: Exam, patch: Partial<Exam>) => persist(exams.map((x) => (x.id === e.id ? { ...x, ...patch } : x)));

  const shown = exams.filter((e) => filter === 'all' || e.kind === filter);
  const inDone = (e: Exam) => (e.id === openId ? pinDone : isDone(e));
  const upcoming = shown.filter((e) => !inDone(e)).sort((a, b) => a.date.localeCompare(b.date));
  const done = shown.filter(inDone).sort((a, b) => b.date.localeCompare(a.date));
  const nextExam = exams.filter((e) => !isDone(e) && (daysUntil(e.date) ?? -1) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  const finished = exams.filter(isDone).sort((a, b) => a.date.localeCompare(b.date));
  const avg3 = finished.length ? avg(finished.slice(-3).map((e) => examPercent(e) as number)) : null;

  // ---- analytics: per section, with part drill-down when exams were entered in detail
  type PStat = { all: number[]; kids: Record<string, number[]> };
  type Stat = { color: string; all: number[]; parts: Record<string, PStat> };
  const stats: Record<string, Stat> = {};
  finished.slice(-8).forEach((e) => e.sections.forEach((s) => {
    const r = sectionCounts(e, s); if (!hasData(r)) return;
    const st = (stats[s.name] = stats[s.name] || { color: s.color, all: [], parts: {} });
    st.all.push(percentOf(r, e.negative));
    if (isDetail(e, s)) s.parts.forEach((p) => {
      const pc = partCounts(e, p); if (!hasData(pc)) return;
      const ps = (st.parts[p.name] = st.parts[p.name] || { all: [], kids: {} });
      ps.all.push(percentOf(pc, e.negative));
      (p.children || []).forEach((k) => { const kc = partCounts(e, k); if (hasData(kc)) (ps.kids[k.name] = ps.kids[k.name] || []).push(percentOf(kc, e.negative)); });
    });
  }));
  const secList = Object.entries(stats).map(([name, st]) => ({ name, ...st, p: avg(st.all) })).sort((a, b) => a.p - b.p);
  const weak = secList.flatMap((s) => {
    const ps = Object.entries(s.parts); if (!ps.length) return [{ name: s.name, p: s.p }];
    return ps.flatMap(([n, v]) => { const ks = Object.entries(v.kids); return ks.length ? ks.map(([kn, a]) => ({ name: kn, p: avg(a) })) : [{ name: n, p: avg(v.all) }]; });
  }).sort((a, b) => a.p - b.p).slice(0, 3);

  const addParts = (list: { name: string; detail: string; key: string }[]) => {
    const d = loadPlannerData();
    list.forEach((x) => {
      const subject = plannerSubjectFor(x.name, plannerSubjects);
      const grade = d.subjects.find((s) => s.n === subject)?.grades.slice(-1)[0] || 'دوازدهم';
      d.items[x.key] = [...(d.items[x.key] || []), createPlannerItem({ subject, detail: x.detail, grade, done: false })];
    });
    savePlannerData(d);
    say(`${P(list.length)} پارت به برنامه‌ریز اضافه شد`);
  };
  const reviewWeak = () => { const key = dateKeyOf(addDays(todayGregorian(), 1)); addParts(weak.map((w) => ({ name: w.name, detail: `مرور نقطه‌ضعف آزمون‌ها: ${w.name}`, key }))); };
  const examPlan = (e: Exam) => {
    const ex = dateFromKey(e.date); if (!ex) return;
    const t = todayGregorian(); const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    addParts(e.sections.map((s, i) => { let d = addDays(ex, -1 - i); if (d.getTime() < t0) d = t; return { name: s.name, detail: `مرور برای «${e.title}»`, key: dateKeyOf(d) }; }));
  };

  // ---- exam editing helpers (work on any exam object, saved or draft)
  const edSec = (e: Exam, sid: string, fn: (s: Section) => Section): Exam => ({ ...e, sections: e.sections.map((s) => (s.id === sid ? fn(s) : s)) });
  const edRes = (e: Exam, id: string, patch: Partial<Counts>): Exam => ({ ...e, results: { ...(e.results || {}), [id]: { ...ZERO, ...(e.results?.[id] || {}), ...patch } } });
  const toggleDetail = (e: Exam, sid: string): Exam => ({ ...e, detail: e.detail.includes(sid) ? e.detail.filter((x) => x !== sid) : [...e.detail, sid] });

  const saveDraft = () => {
    if (!draft || !draft.title.trim() || !draft.date || !draft.sections.length) return;
    const e = { ...draft, title: draft.title.trim() };
    persist(e.id ? exams.map((x) => (x.id === e.id ? e : x)) : [...exams, { ...e, id: 'ex_' + Date.now().toString(36) }]);
    setDraft(null);
  };
  const blank = (kind: ExamKind): Exam => ({ id: '', title: '', kind, preset: cfg.sources[0]?.name || '', date: '', sections: clone(cfg.sections), detail: [], negative: cfg.negative });
  // ---- auto-import of an institute report card (currently: ماز)
  const onImportFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try { setImp(await importReport(f, cfg)); setDraft(null); }
    catch (err) { say((err as Error).message === 'pdf' ? 'این PDF کارنامه‌ی قلم‌چی یا ماز نیست.' : 'کارنامه شناسایی نشد. کارنامه‌ی کامل قلم‌چی (PDF کانون) یا کارنامه‌ی تحلیلی ماز (PDF/عکس، بدون برش) را بده.'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const patchImp = (patch: Partial<ImportedExam>) => imp && setImp({ ...imp, exam: { ...imp.exam, ...patch } });
  const patchRow = (i: number, patch: Partial<ImportedExam['rows'][number]>) => imp && setImp({ ...imp, exam: { ...imp.exam, rows: imp.exam.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) } });
  const confirmImport = async () => {
    if (!imp) return;
    const x = imp.exam;
    // an exam that came from the schedule page (same institute + day, no result yet) is filled in instead of duplicated
    const planned = exams.find((e) => e.preset === x.institute && e.date === x.date && !isDone(e));
    if (!planned && exams.some((e) => e.preset === x.institute && e.date === x.date) && !(await confirmDialog('آزمونی با همین موسسه و تاریخ قبلاً ثبت شده. باز هم اضافه شود؟'))) return;
    imp.exam.rows.forEach((r, i) => { if (imp.sigs[i]) rememberHeading(imp.sigs[i], r.sectionName); });
    const built = buildExam(x, cfg);
    persist(planned ? exams.map((e) => (e.id === planned.id ? { ...built, id: planned.id } : e)) : [...exams, built]);
    setImp(null); say(`«${x.title}» با همه‌ی نتیجه‌ها اضافه شد`);
  };
  const remove = async (e: Exam) => { if (await confirmDialog(`آزمون «${e.title}» حذف شود؟`)) persist(exams.filter((x) => x.id !== e.id)); };

  // ======================= settings screen =======================
  const setSec = (id: string, fn: (s: Section) => Section) => setC({ sections: cfg.sections.map((s) => (s.id === id ? fn(s) : s)) });
  const settingsView = (
    <main className="ex">
      <header className="ex-head">
        <div><h1>تنظیمات آزمون‌ها</h1><p>درس‌ها و منبع‌های آزمون را مطابق رشته‌ی خودت بچین. تغییرها روی آزمون‌های قبلی اثر نمی‌گذارد.</p></div>
        <button type="button" className="ex-ghost" onClick={() => setView('main')}><ArrowRight size={16} />بازگشت</button>
      </header>
      <section className="ex-panel">
        <h3>رشته</h3>
        <div className="ex-seg">
          {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
            <button key={f} type="button" className={cfg.field === f ? 'active' : ''} onClick={async () => { if (f !== cfg.field && await confirmDialog('درس‌های آزمون با پیش‌فرض این رشته جایگزین شود؟')) setC({ field: f, sections: makeFieldSections(f) }); }}>{FIELD_LABEL[f]}</button>
          ))}
        </div>
        <div className="ex-set-row">
          <div className="ex-date"><ShamsiDatePicker value={cfg.konkurDate || ''} onChange={(v: string) => setC({ konkurDate: v })} label="تاریخ کنکور (برای شمارش معکوس)" placeholder="انتخاب تاریخ" align="left" /></div>
          <label className="ex-check"><input type="checkbox" checked={cfg.negative} onChange={(e) => setC({ negative: e.target.checked })} />نمره‌ی منفی به‌طور پیش‌فرض فعال باشد</label>
        </div>
      </section>
      <section className="ex-panel">
        <h3>درس‌های آزمون</h3>
        <p className="ex-hint">هر درس یک «بخش» است. اگر زیرمبحث دارد (مثل حسابان و هندسه برای ریاضی)، موقع ثبت نتیجه می‌توانی ریز نتیجه را هم وارد کنی؛ لازم نیست.</p>
        {cfg.sections.map((s) => (
          <div key={s.id} className="ex-sec-edit" style={{ '--c': s.color } as React.CSSProperties}>
            <div className="ex-sec-top">
              <input type="color" aria-label="رنگ" value={s.color} onChange={(e) => setSec(s.id, (x) => ({ ...x, color: e.target.value }))} />
              <input className="name" value={s.name} onChange={(e) => setSec(s.id, (x) => ({ ...x, name: e.target.value }))} />
              <label>تعداد سوال<NumIn v={s.n} on={(n) => setSec(s.id, (x) => ({ ...x, n }))} label="تعداد سوال" /></label>
              <button type="button" className="ex-icon" aria-label="حذف درس" onClick={() => setC({ sections: cfg.sections.filter((x) => x.id !== s.id) })}><X size={16} /></button>
            </div>
            <PartsEditor parts={s.parts} onChange={(parts) => setSec(s.id, (x) => ({ ...x, parts }))} />
          </div>
        ))}
        <div className="ex-add-row">
          <AddInline ph="+ درس جدید" onAdd={(t) => setC({ sections: [...cfg.sections, newSection(t)] })} wide />
          <span className="ex-hint">درس عمومی لازم داری؟</span>
          {GENERAL_SUGGEST.filter((g) => !cfg.sections.some((s) => s.name === g)).map((g) => <button key={g} type="button" className="ex-sugg" onClick={() => setC({ sections: [...cfg.sections, newSection(g)] })}>+ {g}</button>)}
        </div>
      </section>
      <section className="ex-panel">
        <h3>موسسه‌ها</h3>
        <p className="ex-hint">آزمونی که موسسه برگزار می‌کند «واقعی» است و آزمونی که خودت در خانه می‌سنجی «شبیه‌سازی». موسسه‌ی هر دو را از این فهرست انتخاب می‌کنی.</p>
        <div className="ex-src-group">
          {cfg.sources.map((s) => <span key={s.id} className="ex-pchip">{s.name}<button type="button" aria-label={`حذف ${s.name}`} onClick={() => setC({ sources: cfg.sources.filter((x) => x.id !== s.id) })}><X size={12} /></button></span>)}
          <AddInline ph="+ موسسه‌ی جدید" onAdd={(t) => setC({ sources: [...cfg.sources, newSource(t)] })} />
        </div>
      </section>
    </main>
  );
  if (view === 'settings') return settingsView;

  // ======================= main screen =======================
  const pickList = draft ? [...cfg.sections, ...draft.sections.filter((s) => !cfg.sections.some((c) => c.id === s.id))] : [];
  const form = draft && (
    <section className="ex-form">
      <div className="ex-seg">
        {(['practice', 'real'] as ExamKind[]).map((k) => (
          <button key={k} type="button" className={draft.kind === k ? 'active' : ''} onClick={() => setDraft({ ...draft, kind: k })}>{k === 'real' ? 'آزمون واقعی' : 'شبیه‌سازی'}</button>
        ))}
      </div>
      <p className="ex-hint">{draft.kind === 'real' ? 'آزمونی که موسسه برگزار کرده.' : 'آزمونی که خودت در خانه سنجیدی.'}</p>
      <div className="ex-grid">
        <label>موسسه<select value={draft.preset} onChange={(e) => setDraft({ ...draft, preset: e.target.value })}><option value="">بدون موسسه</option>{cfg.sources.map((s) => <option key={s.id}>{s.name}</option>)}{draft.preset && !cfg.sources.some((s) => s.name === draft.preset) && <option>{draft.preset}</option>}</select></label>
        <label>عنوان<input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="مثلاً آزمون جامع ۵" /></label>
        <div className="ex-date"><ShamsiDatePicker value={draft.date} onChange={(v: string) => setDraft({ ...draft, date: v })} label="تاریخ" placeholder="انتخاب تاریخ" align="left" /></div>
        <label>ساعت (اختیاری)<input type="time" value={draft.time || ''} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label>
      </div>
      <h4 className="ex-sub-h">درس‌های این آزمون</h4>
      <div className="ex-picks">
        {pickList.map((s) => {
          const sel = draft.sections.find((x) => x.id === s.id);
          const det = sel ? isDetail(draft, sel) : false;
          return (
            <div key={s.id} className={'ex-pick' + (sel ? ' on' : '')} style={{ '--c': s.color } as React.CSSProperties}>
              <button type="button" className="ex-pick-main" aria-pressed={!!sel} onClick={() => setDraft(sel ? { ...draft, sections: draft.sections.filter((x) => x.id !== s.id) } : { ...draft, sections: [...draft.sections, clone(s)] })}><i />{s.name}</button>
              {sel && (
                <div className="ex-pick-body">
                  <label>تعداد سوال<NumIn v={det ? sectionCounts(draft, sel).n : sel.n} ro={det} on={(n) => setDraft(edSec(draft, s.id, (x) => ({ ...x, n })))} label="تعداد سوال" /></label>
                  {sel.parts.length > 0 && <button type="button" className={'ex-detail' + (det ? ' on' : '')} onClick={() => setDraft(toggleDetail(draft, s.id))}>{det ? 'بدون تفکیک' : `تفکیک ${P(sel.parts.length)} مبحث`}</button>}
                  {det && <div className="ex-pick-parts">{sel.parts.map((p) => p.children?.length
                    ? <div key={p.id} className="ex-pgroup"><b>{p.name}</b>{p.children.map((k) => <label key={k.id}>{k.name}<NumIn v={k.n} on={(n) => setDraft(edSec(draft, s.id, (x) => ({ ...x, parts: mapParts(x.parts, k.id, (y) => ({ ...y, n })) })))} label={k.name} /></label>)}</div>
                    : <label key={p.id}>{p.name}<NumIn v={p.n} on={(n) => setDraft(edSec(draft, s.id, (x) => ({ ...x, parts: mapParts(x.parts, p.id, (y) => ({ ...y, n })) })))} label={p.name} /></label>)}</div>}
                </div>
              )}
            </div>
          );
        })}
        {!pickList.length && <div className="ex-empty">اول از تنظیمات درس‌های آزمون را بساز.</div>}
      </div>
      <label className="ex-check"><input type="checkbox" checked={draft.negative} onChange={(e) => setDraft({ ...draft, negative: e.target.checked })} />نمره‌ی منفی (هر ۳ غلط، ۱ درست را می‌برد)</label>
      <div className="ex-actions">
        <button type="button" className="primary" disabled={!draft.title.trim() || !draft.date || !draft.sections.length} onClick={saveDraft}>ذخیره</button>
        <button type="button" onClick={() => setDraft(null)}>انصراف</button>
      </div>
    </section>
  );

  const importPanel = imp && (
    <section className="ex-form ex-import">
      <h4 className="ex-sub-h">نتیجه‌ی خوانده‌شده از کارنامه‌ی {imp.exam.institute} — قبل از افزودن بررسی کن</h4>
      {imp.exam.warnings.map((w) => <p key={w} className="ex-warn">⚠ {w}</p>)}
      <div className="ex-grid">
        <label>عنوان<input value={imp.exam.title} onChange={(e) => patchImp({ title: e.target.value })} /></label>
        <div className="ex-date"><ShamsiDatePicker value={imp.exam.date} onChange={(v: string) => patchImp({ date: v })} label="تاریخ" placeholder="انتخاب تاریخ" align="left" /></div>
        <label>ساعت<input type="time" value={imp.exam.time || ''} onChange={(e) => patchImp({ time: e.target.value })} /></label>
      </div>
      <div className="ex-tablewrap"><table className="ex-table">
        <thead><tr><th>درس</th><th>درست</th><th>غلط</th><th>نزده</th><th>تراز</th><th>{imp.exam.rows.some((r) => r.countryRank !== null) ? 'رتبه کشوری' : 'رتبه در گروه'}</th></tr></thead>
        <tbody>{imp.exam.rows.map((r, i) => (
          <tr key={i} className="sec">
            <td>{(r.partName || r.label) && <small className="ex-lbl">{r.partName || r.label}</small>}<select value={r.sectionName} onChange={(e) => patchRow(i, { sectionName: e.target.value })}>
              {!cfg.sections.some((s) => s.name === r.sectionName) && <option>{r.sectionName}</option>}
              {cfg.sections.map((s) => <option key={s.id}>{s.name}</option>)}</select></td>
            <td><NumIn v={r.c} on={(n) => patchRow(i, { c: n, n: n + r.w + Math.max(0, r.n - r.c - r.w) })} label="درست" /></td>
            <td><NumIn v={r.w} on={(n) => patchRow(i, { w: n, n: r.c + n + Math.max(0, r.n - r.c - r.w) })} label="غلط" /></td>
            <td className="blank">{P(Math.max(0, r.n - r.c - r.w))}</td>
            <td>{r.level !== null ? P(r.level) : '–'}</td><td>{r.countryRank !== null ? P(r.countryRank) : '–'}</td>
          </tr>))}</tbody>
      </table></div>
      <p className="ex-hint">{[imp.exam.level !== null && `تراز کل ${P(imp.exam.level)}`, imp.exam.countryRank !== null && `رتبه کشوری ${P(imp.exam.countryRank)}`, imp.exam.regionRank !== null && `رتبه منطقه ${P(imp.exam.regionRank)}`, imp.exam.participants !== null && `${P(imp.exam.participants)} شرکت‌کننده`].filter(Boolean).join(' · ')}</p>
      <div className="ex-actions">
        <button type="button" className="primary" disabled={!validDate(imp.exam.date) || !imp.exam.title.trim()} onClick={confirmImport}>افزودن به آزمون‌ها</button>
        <button type="button" onClick={() => setImp(null)}>انصراف</button>
      </div>
    </section>
  );

  const resultRow = (e: Exam, key: string, label: string, r: Counts, o: { color?: string; sub?: boolean; depth?: number; ro?: boolean; onN?: (n: number) => void; extra?: React.ReactNode }) => {
    const bad = r.c + r.w > r.n;
    return (
      <tr key={key} className={o.sub ? 'sub d' + (o.depth || 0) : 'sec'} style={o.color ? { '--c': o.color } as React.CSSProperties : undefined}>
        <td><span className="nm">{!o.sub && <i />}{label}</span>{o.extra}</td>
        <td><NumIn v={r.n} ro={!o.onN} on={o.onN} label="کل" /></td>
        <td><NumIn v={r.c} ro={o.ro} on={(n) => patchExam(e, { results: edRes(e, key, { c: n }).results })} label="درست" /></td>
        <td><NumIn v={r.w} ro={o.ro} on={(n) => patchExam(e, { results: edRes(e, key, { w: n }).results })} label="غلط" /></td>
        <td className="blank">{r.n ? P(Math.max(0, r.n - r.c - r.w)) : '–'}</td>
        <td className={'pc' + (bad ? ' err' : '')}>{bad ? 'ناسازگار' : hasData(r) ? P(percentOf(r, e.negative)) + '٪' : '–'}</td>
      </tr>
    );
  };

  const card = (e: Exam) => {
    const pct = examPercent(e); const n = daysUntil(e.date); const open = openId === e.id;
    return (
      <article key={e.id} className={'ex-card ' + e.kind + (pct !== null ? ' done' : '')}>
        <header onClick={() => { setPinDone(isDone(e)); setOpenId(open ? null : e.id); }}>
          <span className={'ex-kind ' + e.kind}>{kindLabel(e.kind)}</span>
          <div className="ex-title"><b>{e.title}</b><small>{e.preset && <span className="ex-inst">{e.preset}</span>}{P(e.date)}{e.time ? ' · ' + P(e.time) : ''}</small>
            {pct !== null && <span className="ex-mini">{e.sections.map((s) => { const r = sectionCounts(e, s); return hasData(r) ? <u key={s.id} style={{ '--c': s.color } as React.CSSProperties}>{s.name} {P(percentOf(r, e.negative))}٪</u> : null; })}</span>}
          </div>
          {pct !== null ? <div className="ex-pct"><b>{P(pct)}٪</b>{e.rank && <small>رتبه {P(e.rank)}</small>}</div>
            : <span className={'ex-when' + (n !== null && n < 0 ? ' late' : '')}>{n === null ? '' : n < 0 ? `${P(-n)} روز گذشته · نتیجه ثبت نشده` : n === 0 ? 'امروز' : `${P(n)} روز مانده`}</span>}
          <ChevronDown size={18} className={'ex-chev' + (open ? ' up' : '')} />
        </header>
        {open && (
          <div className="ex-body">
            <div className="ex-tablewrap"><table className="ex-table">
              <thead><tr><th>درس</th><th>کل</th><th>درست</th><th>غلط</th><th>نزده</th><th>درصد</th></tr></thead>
              <tbody>
                {e.sections.map((s) => {
                  const det = isDetail(e, s);
                  const rows = [resultRow(e, s.id, s.name, sectionCounts(e, s), {
                    color: s.color, ro: det, onN: det ? undefined : (v) => patchExam(e, { sections: edSec(e, s.id, (x) => ({ ...x, n: v })).sections }),
                    extra: s.parts.length ? <button type="button" className={'ex-detail sm' + (det ? ' on' : '')} onClick={() => patchExam(e, { detail: toggleDetail(e, s.id).detail })}>{det ? 'بدون تفکیک' : 'تفکیک مبحث‌ها'}</button> : null
                  })];
                  const walk = (parts: Part[], depth: number): void => parts.forEach((p) => {
                    const g = !!p.children?.length;
                    rows.push(resultRow(e, p.id, p.name, partCounts(e, p), { sub: true, depth, color: s.color, ro: g, onN: g ? undefined : (v) => patchExam(e, { sections: edSec(e, s.id, (x) => ({ ...x, parts: mapParts(x.parts, p.id, (y) => ({ ...y, n: v })) })).sections }) }));
                    if (g) walk(p.children as Part[], depth + 1);
                  });
                  if (det) walk(s.parts, 0);
                  return rows;
                })}
              </tbody>
            </table></div>
            <div className="ex-extra">
              <label>رتبه<input value={e.rank || ''} onChange={(ev) => patchExam(e, { rank: ev.target.value })} /></label>
              <label>تراز<input value={e.level || ''} onChange={(ev) => patchExam(e, { level: ev.target.value })} /></label>
              <label className="grow">تحلیل و یادداشت (چرا غلط زدم؟)<textarea rows={2} value={e.notes || ''} onChange={(ev) => patchExam(e, { notes: ev.target.value })} /></label>
            </div>
            <div className="ex-actions">
              {pct === null && n !== null && n >= 0 && <button type="button" onClick={() => examPlan(e)}>📅 چیدن مرور در برنامه‌ریز</button>}
              <button type="button" onClick={() => setDraft(clone(e))}>✎ ویرایش</button>
              <button type="button" className="danger" onClick={() => remove(e)}>حذف</button>
            </div>
          </div>
        )}
      </article>
    );
  };

  const konkurN = cfg.konkurDate ? daysUntil(cfg.konkurDate) : null;
  const konkurCard = konkurN === null || konkurN < 0
    ? <div className="ex-count empty konkur"><span>تا کنکور</span><em><button type="button" className="ex-link" onClick={() => setView('settings')}>تاریخ کنکور را در تنظیمات بگذار</button></em></div>
    : <div className="ex-count konkur"><span>تا کنکور</span><b>{konkurN === 0 ? 'امروز!' : <>{P(konkurN)}<i> روز</i></>}</b><em>{P(cfg.konkurDate as string)}</em></div>;
  const nextN = nextExam ? (daysUntil(nextExam.date) as number) : null;
  const nextCard = nextExam
    ? <div className={'ex-count ' + nextExam.kind}><span>آزمون بعدی · {kindLabel(nextExam.kind)}</span><b>{nextN === 0 ? 'امروز!' : <>{P(nextN as number)}<i> روز</i></>}</b><em>{nextExam.title}{nextExam.preset ? ' · ' + nextExam.preset : ''}</em></div>
    : <div className="ex-count empty"><span>آزمون بعدی</span><em>آزمونی ثبت نشده</em></div>;

  const trendPts = finished.slice(-12).map((e) => {
    if (trend === 'all') return { e, p: examPercent(e) as number };
    const s = e.sections.find((x) => x.name === trend); const r = s ? sectionCounts(e, s) : ZERO;
    return hasData(r) ? { e, p: percentOf(r, e.negative) } : null;
  }).filter(Boolean) as { e: Exam; p: number }[];
  const barRow = (name: string, p: number, depth: number, expandable: boolean, open: boolean, toggle: () => void, dot = false) => (
    <button key={name} type="button" className={'ex-sub d' + depth} disabled={!expandable} onClick={toggle}>
      <span>{dot && <i />}{name}{expandable && <ChevronDown size={13} className={'ex-chev' + (open ? ' up' : '')} />}</span>
      <em><u style={{ width: `${Math.max(2, Math.min(100, p))}%` }} className={tone(p)} /></em><b>{P(p)}٪</b>
    </button>
  );
  const chart = () => {
    if (trendPts.length < 2) return <div className="ex-empty">بعد از ثبت نتیجه‌ی حداقل دو آزمون، نمودار روند اینجا نمایش داده می‌شود.</div>;
    const W = 560, H = 170, pad = 24;
    const xs = (i: number) => W - pad - (i * (W - 2 * pad)) / Math.max(1, trendPts.length - 1);
    const ys = (p: number) => H - pad - (Math.max(0, Math.min(100, p)) / 100) * (H - 2 * pad);
    const line = trendPts.map((t, i) => `${xs(trendPts.length - 1 - i)},${ys(t.p)}`).join(' ');
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="ex-chart" role="img" aria-label="روند درصد آزمون‌ها">
        {[0, 50, 100].map((g) => <g key={g}><line x1={pad} x2={W - pad} y1={ys(g)} y2={ys(g)} className="grid" /><text x={W - 4} y={ys(g) + 4} className="lbl">{P(g)}</text></g>)}
        <polyline points={line} className="ln" />
        {trendPts.map((t, i) => <circle key={t.e.id} cx={xs(trendPts.length - 1 - i)} cy={ys(t.p)} r="5" className={'pt ' + t.e.kind}><title>{`${t.e.title}: ${P(t.p)}٪`}</title></circle>)}
      </svg>
    );
  };

  return (
    <main className="ex">
      <header className="ex-head">
        <div><h1>آزمون‌ها</h1><p>آزمون موسسه‌ها «واقعی» و آزمون‌های خانگی «شبیه‌سازی» هستند. نتیجه را درس‌به‌درس ثبت کن و اگر خواستی تا مبحث پایین برو.</p></div>
        <div className="ex-head-btns">
          <button type="button" className="ex-ghost" onClick={() => setView('settings')}><Settings size={16} />تنظیمات</button>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => onImportFile(e.target.files?.[0])} />
          <button type="button" className="ex-ghost" disabled={busy} onClick={() => fileRef.current?.click()} title="کارنامه‌ی قلم‌چی (PDF کانون) یا ماز (PDF/عکس)"><FileUp size={16} />{busy ? 'در حال خواندن…' : 'ورود کارنامه'}</button>
          <button type="button" className="ex-add" onClick={() => { setImp(null); setDraft(blank(filter === 'real' ? 'real' : 'practice')); }}><Plus size={16} />آزمون جدید</button>
        </div>
      </header>

      <section className="ex-hero">
        {konkurCard}
        {nextCard}
        <div className="ex-count stat"><span>میانگین ۳ آزمون اخیر</span><b>{avg3 === null ? '–' : <>{P(avg3)}<i>٪</i></>}</b><em>{P(finished.length)} آزمون ثبت‌شده</em></div>
      </section>

      <div className="ex-tabs" role="tablist">
        {([['all', 'همه'], ['real', 'واقعی'], ['practice', 'شبیه‌سازی']] as [Filter, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {form}
      {importPanel}
      <div className="ex-layout">
        <div className="ex-main">
          {upcoming.length > 0 && <><h2 className="ex-h">در پیش‌رو</h2>{upcoming.map(card)}</>}
          {done.length > 0 && <><h2 className="ex-h">نتیجه‌دار</h2>{done.map(card)}</>}
          {!exams.length && <div className="ex-empty big">هنوز آزمونی ثبت نکرده‌ای. با «آزمون جدید» شروع کن.</div>}
          {exams.length > 0 && !shown.length && <div className="ex-empty">در این دسته آزمونی نیست.</div>}
        </div>
        <aside className="ex-side">
          <div className="ex-panel">
            <h3>روند درصد</h3>
            <div className="ex-chips">{['all', ...secList.map((s) => s.name)].map((k) => <button key={k} type="button" className={trend === k ? 'on' : ''} onClick={() => setTrend(k)}>{k === 'all' ? 'کل' : k}</button>)}</div>
            {chart()}<div className="ex-legend"><span className="real">● واقعی</span><span className="practice">● شبیه‌سازی</span></div>
          </div>
          <div className="ex-panel">
            <h3>درس‌ها (۸ آزمون اخیر)</h3>
            {secList.length ? secList.map((x) => {
              const subs = Object.entries(x.parts).map(([n, v]) => ({ n, p: avg(v.all), kids: Object.entries(v.kids).map(([kn, a]) => ({ n: kn, p: avg(a) })).sort((a, b) => a.p - b.p) })).sort((a, b) => a.p - b.p);
              const op = openSec === x.name;
              return (
                <div key={x.name} className="ex-subgrp" style={{ '--c': x.color } as React.CSSProperties}>
                  {barRow(x.name, x.p, 0, subs.length > 0, op, () => setOpenSec(op ? null : x.name), true)}
                  {op && subs.map((s) => {
                    const k = x.name + '/' + s.n; const o2 = openSec === k;
                    return <React.Fragment key={s.n}>{barRow(s.n, s.p, 1, s.kids.length > 0, o2, () => setOpenSec(o2 ? x.name : k))}{o2 && s.kids.map((c) => barRow(c.n, c.p, 2, false, false, () => undefined))}</React.Fragment>;
                  })}
                </div>
              );
            }) : <div className="ex-empty">هنوز نتیجه‌ای ثبت نشده.</div>}
            {weak.length > 0 && <button type="button" className="ex-weakbtn" onClick={reviewWeak}>📌 مرور ضعیف‌ترین‌ها ({weak.map((w) => w.name).join('، ')}) برای فردا</button>}
          </div>
        </aside>
      </div>
      {toast && <div className="ex-toast" role="status">{toast}</div>}
    </main>
  );
};

const AddInline: React.FC<{ ph: string; onAdd: (t: string) => void; wide?: boolean }> = ({ ph, onAdd, wide }) => {
  const [v, setV] = React.useState('');
  const go = () => { const t = v.trim(); if (t) { onAdd(t); setV(''); } };
  return <input className={'ex-addin' + (wide ? ' wide' : '')} value={v} placeholder={ph} aria-label={ph} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }} onBlur={go} />;
};

const PartsEditor: React.FC<{ parts: Part[]; onChange: (p: Part[]) => void }> = ({ parts, onChange }) => {
  const upd = (id: string, fn: (p: Part) => Part) => onChange(parts.map((x) => (x.id === id ? fn(x) : x)));
  return (
    <div className="ex-parts">
      <Layers size={14} />
      {parts.map((p) => p.children ? (
        <span key={p.id} className="ex-group">
          <b>{p.name}</b>
          {p.children.map((k) => (
            <span key={k.id} className="ex-pchip">{k.name}
              <button type="button" aria-label={`حذف ${k.name}`} onClick={() => upd(p.id, (x) => (x.children!.length > 1 ? { ...x, children: x.children!.filter((y) => y.id !== k.id) } : { id: x.id, name: x.name, n: 0 }))}><X size={12} /></button>
            </span>
          ))}
          <AddInline ph="+ پایه" onAdd={(t) => upd(p.id, (x) => ({ ...x, children: [...x.children!, newPart(t)] }))} />
          <button type="button" className="ex-icon" aria-label={`حذف گروه ${p.name}`} onClick={() => onChange(parts.filter((x) => x.id !== p.id))}><X size={14} /></button>
        </span>
      ) : (
        <span key={p.id} className="ex-pchip">{p.name}
          <button type="button" title="تبدیل به گروه (مثلاً هندسه ۱، ۲، ۳)" aria-label={`تبدیل ${p.name} به گروه`} onClick={() => upd(p.id, (x) => ({ ...x, children: [] }))}><Layers size={12} /></button>
          <button type="button" aria-label={`حذف ${p.name}`} onClick={() => onChange(parts.filter((x) => x.id !== p.id))}><X size={12} /></button>
        </span>
      ))}
      <AddInline ph="زیرمبحث جدید" onAdd={(t) => onChange([...parts, newPart(t)])} />
    </div>
  );
};
