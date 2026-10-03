import React from 'react';
import { BookType, PlannerData, PlannerGrade, PlannerScheduleSettings, PlannerSubjectDef } from '../../types';
import { PLANNER_GRADES, DEFAULT_PLANNER_SUBJECTS, sourceTypeLabel } from '../../plannerStore';
import { REST_PRESETS, clampMinutes, formatDuration, newRestId, partsThatFit, timeToMin } from '../../plannerSchedule';
import { RestBlock } from '../../types';
import { PERSIAN_WEEK_DAYS } from '../../jalali';
import { toPersianDigits } from '../../utils';
import { confirmDialog, alertDialog } from '../../dialog';

interface PlannerSettingsViewProps {
  data: PlannerData;
  // functional update so every change is applied to the freshest data (and is undoable)
  onUpdate: (fn: (d: PlannerData) => PlannerData) => void;
  onExport: () => void;
  onImport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

type Panel = 'time' | 'rests' | 'lessons' | 'books' | 'data';
const PANELS: { id: Panel; icon: string; label: string; hint: string }[] = [
  { id: 'time', icon: '⏱', label: 'زمان‌بندی', hint: 'مدت بخش، استراحت و ساعت مطالعه' },
  { id: 'rests', icon: '🍽', label: 'وقفه‌ها', hint: 'ناهار، نماز، مدرسه…' },
  { id: 'lessons', icon: '📚', label: 'درس‌ها', hint: 'فهرست درس‌ها و پایه‌ها' },
  { id: 'books', icon: '📕', label: 'کتاب‌ها', hint: 'منابع، رنگ و نوع' },
  { id: 'data', icon: '💾', label: 'داده‌ها', hint: 'پشتیبان‌گیری و بازیابی' }
];

function countSubjectUsage(data: PlannerData, name: string): number {
  let n = 0;
  Object.values(data.items).forEach((arr) => arr.forEach((it) => { if (it.subject === name) n++; }));
  return n;
}
function countSourceUsage(data: PlannerData, name: string): number {
  let n = 0;
  Object.values(data.items).forEach((arr) => arr.forEach((it) => { if (it.source === name) n++; }));
  return n;
}

export const PlannerSettingsView: React.FC<PlannerSettingsViewProps> = ({
  data,
  onUpdate,
  onExport,
  onImport,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) => {
  const [panel, setPanel] = React.useState<Panel>(() => (sessionStorage.getItem('pl_settings_panel') as Panel) || 'time');
  const go = (p: Panel) => { setPanel(p); try { sessionStorage.setItem('pl_settings_panel', p); } catch (e) { /* ignore */ } };
  const itemCount = Object.values(data.items).reduce((a: number, l: unknown) => a + (l as unknown[]).length, 0);
  const count = (p: Panel): string => {
    if (p === 'rests') return toPersianDigits(data.schedule.rests.length);
    if (p === 'lessons') return toPersianDigits(data.subjects.length);
    if (p === 'books') return toPersianDigits(Object.keys(data.sourceColors).length);
    return '';
  };
  const onChangeSubjects = (subjects: PlannerSubjectDef[]) => onUpdate((d) => ({ ...d, subjects }));
  const setSchedule = (patch: Partial<PlannerScheduleSettings>) =>
    onUpdate((d) => ({ ...d, schedule: { ...d.schedule, ...patch } }));
  const setDayWindow = (idx: number, patch: { start?: string; end?: string }) =>
    onUpdate((d) => ({
      ...d,
      schedule: { ...d.schedule, days: d.schedule.days.map((w, i) => (i === idx ? { ...w, ...patch } : w)) }
    }));
  const applyWindowToAll = (idx: number) =>
    onUpdate((d) => ({
      ...d,
      schedule: { ...d.schedule, days: d.schedule.days.map(() => ({ ...d.schedule.days[idx] })) }
    }));

  const setRests = (fn: (r: RestBlock[]) => RestBlock[]) =>
    onUpdate((d) => ({ ...d, schedule: { ...d.schedule, rests: fn(d.schedule.rests) } }));
  const patchRest = (id: string, patch: Partial<RestBlock>) =>
    setRests((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const toggleRestDay = (r: RestBlock, idx: number) => {
    const cur = r.days && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6];
    const next = cur.includes(idx) ? cur.filter((x) => x !== idx) : [...cur, idx].sort();
    patchRest(r.id, { days: next.length === 7 || !next.length ? [] : next });
  };

  const [lessonEdit, setLessonEdit] = React.useState<{ idx: number | 'new'; name: string; grades: PlannerGrade[] } | null>(null);
  const [sourceEdit, setSourceEdit] = React.useState<{ key: string; name: string; color: string; type: BookType } | null>(null);

  const saveLesson = async () => {
    if (!lessonEdit) return;
    const name = lessonEdit.name.trim();
    if (!name) { await alertDialog('نام درس را بنویسید'); return; }
    if (!lessonEdit.grades.length) { await alertDialog('حداقل یک پایه انتخاب کنید'); return; }
    const dup = data.subjects.some((s, i) => s.n === name && i !== lessonEdit.idx);
    if (dup) { await alertDialog('این درس قبلا ثبت شده'); return; }

    let next: PlannerSubjectDef[];
    if (lessonEdit.idx === 'new') {
      next = [...data.subjects, { n: name, grades: lessonEdit.grades }];
    } else {
      next = data.subjects.map((s, i) => (i === lessonEdit.idx ? { n: name, grades: lessonEdit.grades } : s));
    }
    onChangeSubjects(next);
    setLessonEdit(null);
  };

  const deleteLesson = async (idx: number) => {
    const s = data.subjects[idx];
    const used = countSubjectUsage(data, s.n);
    const ok = await confirmDialog(`«${s.n}» حذف شود؟${used ? ` (${toPersianDigits(used)} مورد ثبت‌شده با این درس باقی می‌ماند.)` : ''}`);
    if (!ok) return;
    const next = data.subjects.filter((_, i) => i !== idx);
    onChangeSubjects(next.length ? next : JSON.parse(JSON.stringify(DEFAULT_PLANNER_SUBJECTS)));
  };

  const saveSource = async () => {
    if (!sourceEdit) return;
    const name = sourceEdit.name.trim();
    if (!name) { await alertDialog('نام کتاب را بنویسید'); return; }
    const renamed = sourceEdit.key !== 'new' && sourceEdit.key !== name;
    if (renamed && data.sourceColors[name] !== undefined) { await alertDialog('کتابی با این نام قبلا ثبت شده'); return; }
    const oldKey = sourceEdit.key;
    onUpdate((d) => {
      const colors = { ...d.sourceColors };
      const types = { ...d.sourceTypes };
      let items = d.items;
      if (renamed) {
        delete colors[oldKey];
        delete types[oldKey];
        // keep the cards that used the old name pointing at the renamed book
        items = {};
        Object.keys(d.items).forEach((k) => {
          items[k] = d.items[k].map((it) => (it.source === oldKey ? { ...it, source: name } : it));
        });
      }
      colors[name] = sourceEdit.color;
      types[name] = sourceEdit.type;
      return { ...d, items, sourceColors: colors, sourceTypes: types };
    });
    setSourceEdit(null);
  };

  const deleteSource = async (name: string) => {
    const used = countSourceUsage(data, name);
    const ok = await confirmDialog(`«${name}» حذف شود؟${used ? ` (${toPersianDigits(used)} مورد با این منبع باقی می‌ماند.)` : ''}`);
    if (!ok) return;
    onUpdate((d) => {
      const colors = { ...d.sourceColors };
      const types = { ...d.sourceTypes };
      delete colors[name];
      delete types[name];
      return { ...d, sourceColors: colors, sourceTypes: types };
    });
  };

  const typePills = (value: BookType, onPick: (t: BookType) => void) => (
    <div className="pl-type-pills" role="radiogroup" aria-label="نوع کتاب">
      <button type="button" className={value === 'test' ? 'active' : ''} onClick={() => onPick('test')}>✏️ تستی</button>
      <button type="button" className={value === 'descriptive' ? 'active' : ''} onClick={() => onPick('descriptive')}>📖 تشریحی</button>
    </div>
  );

  const sourceNames = Object.keys(data.sourceColors).sort(
    (a, b) => countSourceUsage(data, b) - countSourceUsage(data, a)
  );

  const cur = PANELS.find((x) => x.id === panel)!;
  return (
    <div className="pl-settings-shell">
      <aside className="pl-settings-nav" role="tablist" aria-label="بخش‌های تنظیمات">
        <div className="pl-settings-nav-title">تنظیمات برنامه‌ریز</div>
        {PANELS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={panel === x.id} className={panel === x.id ? 'active' : ''} onClick={() => go(x.id)}>
            <span className="ic">{x.icon}</span>
            <span className="tx"><b>{x.label}</b><small>{x.hint}</small></span>
            {count(x.id) && <em>{count(x.id)}</em>}
          </button>
        ))}
        <div className="pl-settings-nav-foot">
          <button type="button" onClick={onUndo} disabled={!canUndo} title="بازگردانی">↶ بازگردانی</button>
          <button type="button" onClick={onRedo} disabled={!canRedo} title="تکرار">↷ تکرار</button>
        </div>
      </aside>
      <div className="pl-settings-main">
      <header className="pl-settings-head"><h1>{cur.icon} {cur.label}</h1><p>{cur.hint}</p></header>
      <div className="pl-settings-grid one">
      {panel === 'time' && (<>
      <div className="pl-setting-card pl-schedule-card">
        <h2>مدت بخش‌ها</h2>
        <p className="pl-setting-desc">
          مدت هر بخش (هر پارت درس) و استراحت بین بخش‌ها، و بازه‌ی مطالعه‌ی هر روز هفته. با روشن کردن «⏱ زمان‌بندی» در هر روز، ساعت شروع و پایان پارت‌ها از روی همین‌ها حساب می‌شود.
        </p>

        <div className="pl-dur-grid">
          <label className="pl-dur-field">
            <span>مدت هر بخش (دقیقه)</span>
            <input
              className="pl-input"
              type="number"
              min={5}
              max={480}
              inputMode="numeric"
              value={data.schedule.partMinutes}
              onChange={(e) => setSchedule({ partMinutes: clampMinutes(e.target.value, data.schedule.partMinutes, 5, 480) })}
            />
            <span className="pl-quick">
              {[30, 45, 60, 90, 120].map((m) => (
                <button key={m} type="button" className={data.schedule.partMinutes === m ? 'on' : ''} onClick={() => setSchedule({ partMinutes: m })}>
                  {toPersianDigits(m)}
                </button>
              ))}
            </span>
          </label>
          <label className="pl-dur-field">
            <span>استراحت بین بخش‌ها (دقیقه)</span>
            <input
              className="pl-input"
              type="number"
              min={0}
              max={120}
              inputMode="numeric"
              value={data.schedule.breakMinutes}
              onChange={(e) => setSchedule({ breakMinutes: clampMinutes(e.target.value, data.schedule.breakMinutes, 0, 120) })}
            />
            <span className="pl-quick">
              {[0, 5, 10, 15, 20].map((m) => (
                <button key={m} type="button" className={data.schedule.breakMinutes === m ? 'on' : ''} onClick={() => setSchedule({ breakMinutes: m })}>
                  {toPersianDigits(m)}
                </button>
              ))}
            </span>
          </label>
        </div>

        <div className="pl-dur-grid">
          <label className="pl-dur-field">
            <span>🧘 استراحت بلند بعد از هر … بخش (۰ = خاموش)</span>
            <input
              className="pl-input"
              type="number"
              min={0}
              max={12}
              inputMode="numeric"
              value={data.schedule.longBreakEvery}
              onChange={(e) => setSchedule({ longBreakEvery: clampMinutes(e.target.value, 0, 0, 12) })}
            />
            <span className="pl-quick">
              {[0, 2, 3, 4].map((m) => (
                <button key={m} type="button" className={data.schedule.longBreakEvery === m ? 'on' : ''} onClick={() => setSchedule({ longBreakEvery: m })}>
                  {m ? toPersianDigits(m) : 'خاموش'}
                </button>
              ))}
            </span>
          </label>
          <label className="pl-dur-field">
            <span>مدت استراحت بلند (دقیقه)</span>
            <input
              className="pl-input"
              type="number"
              min={5}
              max={180}
              inputMode="numeric"
              disabled={!data.schedule.longBreakEvery}
              value={data.schedule.longBreakMinutes}
              onChange={(e) => setSchedule({ longBreakMinutes: clampMinutes(e.target.value, data.schedule.longBreakMinutes, 5, 180) })}
            />
            <span className="pl-quick">
              {[15, 20, 30, 45].map((m) => (
                <button key={m} type="button" className={data.schedule.longBreakMinutes === m ? 'on' : ''} onClick={() => setSchedule({ longBreakMinutes: m })}>
                  {toPersianDigits(m)}
                </button>
              ))}
            </span>
          </label>
        </div>

      </div>
      </>)}
      {panel === 'rests' && (
      <div className="pl-setting-card">
        <h3 className="pl-sub-h">🍽 برنامه‌ی ثابت روزانه (وقفه‌ها)</h3>
        <p className="pl-setting-desc">
          ناهار، نماز، مدرسه، چرت… پارت‌های درسی دور این وقفه‌ها می‌چینند و هیچ‌وقت روی آن‌ها نمی‌افتند. برای یک روز خاص، توی خود روز «＋ وقفه» بزن یا مثلا بنویس «دندانپزشکی از ۱۶ تا ۱۷ فردا».
        </p>
        <div className="pl-rest-presets">
          {REST_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => setRests((l) => [...l, { id: newRestId(), label: p.label, icon: p.icon, start: p.start, end: p.end }])}>
              {p.icon} + {p.label}
            </button>
          ))}
        </div>
        {!data.schedule.rests.length && <div className="pl-empty">هنوز وقفه‌ای تعریف نشده — با دکمه‌های بالا اضافه کن.</div>}
        {data.schedule.rests.map((r) => {
          const on = r.days && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6];
          return (
            <div key={r.id} className="pl-rest-edit">
              <div className="pl-rest-edit-top">
                <input className="pl-input pl-rest-ic-in" value={r.icon} maxLength={2} onChange={(e) => patchRest(r.id, { icon: e.target.value })} aria-label="آیکون" />
                <input className="pl-input" value={r.label} onChange={(e) => patchRest(r.id, { label: e.target.value })} aria-label="نام" />
                <input type="time" className="pl-input pl-time-input" value={r.start} onChange={(e) => e.target.value && patchRest(r.id, { start: e.target.value })} />
                <span className="pl-hours-sep">تا</span>
                <input type="time" className="pl-input pl-time-input" value={r.end} onChange={(e) => e.target.value && patchRest(r.id, { end: e.target.value })} />
                <button type="button" className="pl-del" title="حذف" onClick={() => setRests((l) => l.filter((x) => x.id !== r.id))}>×</button>
              </div>
              <div className="pl-rest-days">
                {PERSIAN_WEEK_DAYS.map((n, i) => (
                  <button key={n} type="button" className={on.includes(i) ? 'on' : ''} onClick={() => toggleRestDay(r, i)}>{n}</button>
                ))}
              </div>
            </div>
          );
        })}

      </div>
      )}
      {panel === 'time' && (
      <div className="pl-setting-card">
        <h3 className="pl-sub-h">ساعت شروع و پایان مطالعه در هر روز</h3>
        <p className="pl-setting-desc">مثلا اگر شنبه و یکشنبه مدرسه دارید، ساعت‌های آن روزها را کوتاه‌تر بگذارید.</p>
        <div className="pl-week-hours">
          {PERSIAN_WEEK_DAYS.map((name, idx) => {
            const w = data.schedule.days[idx];
            const a = timeToMin(w.start);
            const b = timeToMin(w.end);
            const bad = a == null || b == null || b <= a;
            const fit = partsThatFit(w, data.schedule, idx);
            return (
              <div key={name} className={'pl-hours-row' + (bad ? ' bad' : '')}>
                <span className="pl-hours-day">{name}</span>
                <input
                  type="time"
                  className="pl-input pl-time-input"
                  value={w.start}
                  onChange={(e) => e.target.value && setDayWindow(idx, { start: e.target.value })}
                  aria-label={`شروع ${name}`}
                />
                <span className="pl-hours-sep">تا</span>
                <input
                  type="time"
                  className="pl-input pl-time-input"
                  value={w.end}
                  onChange={(e) => e.target.value && setDayWindow(idx, { end: e.target.value })}
                  aria-label={`پایان ${name}`}
                />
                <span className="pl-hours-cap">
                  {bad ? 'پایان باید بعد از شروع باشد' : `${toPersianDigits(fit)} بخش · ${toPersianDigits(formatDuration(b! - a!))}`}
                </span>
                <button type="button" className="pl-hours-all" title="همین ساعت‌ها برای همه‌ی روزها" onClick={() => applyWindowToAll(idx)}>
                  ⧉ همه
                </button>
                {!bad && (
                  <div className="pl-strip" title="بازه‌ی مطالعه و وقفه‌های این روز">
                    {data.schedule.rests
                      .filter((r) => !r.days || !r.days.length || r.days.includes(idx))
                      .map((r) => {
                        const x = Math.max(a!, timeToMin(r.start) ?? 0);
                        const y = Math.min(b!, timeToMin(r.end) ?? 0);
                        if (y <= x) return null;
                        return <i key={r.id} title={`${r.label} ${r.start}–${r.end}`} style={{ insetInlineStart: `${((x - a!) / (b! - a!)) * 100}%`, width: `${((y - x) / (b! - a!)) * 100}%` }}>{r.icon}</i>;
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      )}
      {panel === 'lessons' && (
      <div className="pl-setting-card">
        <h2>جدول درس‌ها</h2>
        <p className="pl-setting-desc">درس‌ها و پایه‌هایشان — همین‌ها در فرم افزودن نمایش داده می‌شوند.</p>
        {data.subjects.map((s, idx) => {
          if (lessonEdit && lessonEdit.idx === idx) {
            return (
              <div key={idx} className="pl-sform">
                <input
                  className="pl-input"
                  placeholder="نام درس (مثلا: هندسه ۳)"
                  value={lessonEdit.name}
                  onChange={(e) => setLessonEdit({ ...lessonEdit, name: e.target.value })}
                />
                <div className="pl-grade-pills">
                  {PLANNER_GRADES.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={'pl-grade-pill' + (lessonEdit.grades.includes(g.id) ? ' active' : '')}
                      style={{ ['--gc' as any]: g.c }}
                      onClick={() => {
                        const has = lessonEdit.grades.includes(g.id);
                        setLessonEdit({
                          ...lessonEdit,
                          grades: has ? lessonEdit.grades.filter((x) => x !== g.id) : [...lessonEdit.grades, g.id]
                        });
                      }}
                    >
                      {g.id}
                    </button>
                  ))}
                </div>
                <div className="pl-form-row">
                  <button type="button" className="pl-save" onClick={saveLesson}>ذخیره</button>
                  <button type="button" className="pl-cancel" onClick={() => setLessonEdit(null)}>بستن</button>
                </div>
              </div>
            );
          }
          return (
            <div key={idx} className="pl-srow">
              <span className="pl-sname">{s.n}</span>
              <span className="pl-sgrades">
                {PLANNER_GRADES.map((g) => (
                  <span key={g.id} className={'pl-sg' + (s.grades.includes(g.id) ? ' on' : '')} style={{ ['--gc' as any]: g.c }}>
                    {g.id}
                  </span>
                ))}
              </span>
              <span className="pl-suse">×{toPersianDigits(countSubjectUsage(data, s.n))}</span>
              <span className="pl-sact">
                <button type="button" title="ویرایش" onClick={() => setLessonEdit({ idx, name: s.n, grades: [...s.grades] })}>✎</button>
                <button type="button" className="pl-del" title="حذف" onClick={() => deleteLesson(idx)}>×</button>
              </span>
            </div>
          );
        })}
        {lessonEdit && lessonEdit.idx === 'new' ? (
          <div className="pl-sform">
            <input
              className="pl-input"
              placeholder="نام درس (مثلا: هندسه ۳)"
              value={lessonEdit.name}
              onChange={(e) => setLessonEdit({ ...lessonEdit, name: e.target.value })}
            />
            <div className="pl-grade-pills">
              {PLANNER_GRADES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={'pl-grade-pill' + (lessonEdit.grades.includes(g.id) ? ' active' : '')}
                  style={{ ['--gc' as any]: g.c }}
                  onClick={() => {
                    const has = lessonEdit.grades.includes(g.id);
                    setLessonEdit({
                      ...lessonEdit,
                      grades: has ? lessonEdit.grades.filter((x) => x !== g.id) : [...lessonEdit.grades, g.id]
                    });
                  }}
                >
                  {g.id}
                </button>
              ))}
            </div>
            <div className="pl-form-row">
              <button type="button" className="pl-save" onClick={saveLesson}>افزودن</button>
              <button type="button" className="pl-cancel" onClick={() => setLessonEdit(null)}>بستن</button>
            </div>
          </div>
        ) : (
          <button type="button" className="pl-sadd" onClick={() => setLessonEdit({ idx: 'new', name: '', grades: ['دوازدهم'] })}>
            + درس جدید
          </button>
        )}
      </div>

      )}
      {panel === 'books' && (
      <div className="pl-setting-card">
        <h2>کتاب‌ها / منابع پیشنهادی</h2>
        <p className="pl-setting-desc">نام، رنگ و نوع کتاب (تستی / تشریحی) — کتاب تستی در گزارش روزانه به‌صورت «تست‌زنی» ثبت می‌شود و کتاب تشریحی به‌صورت «مطالعه».</p>
        {!sourceNames.length && !sourceEdit && (
          <div className="pl-empty">هنوز کتابی ثبت نشده — از فرم افزودن درس، منبع را وارد کنید یا اینجا اضافه کنید</div>
        )}
        {sourceNames.map((name) => {
          if (sourceEdit && sourceEdit.key === name) {
            return (
              <div key={name} className="pl-sform">
                <div className="pl-src-row">
                  <input
                    className="pl-input"
                    value={sourceEdit.name}
                    onChange={(e) => setSourceEdit({ ...sourceEdit, name: e.target.value })}
                  />
                  <input
                    type="color"
                    className="pl-color"
                    value={sourceEdit.color}
                    onChange={(e) => setSourceEdit({ ...sourceEdit, color: e.target.value })}
                  />
                </div>
                {typePills(sourceEdit.type, (t) => setSourceEdit({ ...sourceEdit, type: t }))}
                <div className="pl-form-row">
                  <button type="button" className="pl-save" onClick={saveSource}>ذخیره</button>
                  <button type="button" className="pl-cancel" onClick={() => setSourceEdit(null)}>بستن</button>
                </div>
              </div>
            );
          }
          return (
            <div key={name} className="pl-srow">
              <span className="pl-swatch" style={{ background: data.sourceColors[name] }} />
              <span className="pl-sname">{name}</span>
              {data.sourceTypes[name] ? (
                <span className={'pl-btype ' + data.sourceTypes[name]}>{sourceTypeLabel(data.sourceTypes[name])}</span>
              ) : (
                <span className="pl-btype unset" title="نوع این کتاب را مشخص کنید (ویرایش ✎)">نوع؟</span>
              )}
              <span className="pl-suse">×{toPersianDigits(countSourceUsage(data, name))}</span>
              <span className="pl-sact">
                <button type="button" title="ویرایش" onClick={() => setSourceEdit({ key: name, name, color: data.sourceColors[name], type: data.sourceTypes[name] || 'test' })}>✎</button>
                <button type="button" className="pl-del" title="حذف" onClick={() => deleteSource(name)}>×</button>
              </span>
            </div>
          );
        })}
        {sourceEdit && sourceEdit.key === 'new' ? (
          <div className="pl-sform">
            <div className="pl-src-row">
              <input
                className="pl-input"
                placeholder="نام کتاب / منبع (مثلا: تست گاج)"
                value={sourceEdit.name}
                onChange={(e) => setSourceEdit({ ...sourceEdit, name: e.target.value })}
              />
              <input
                type="color"
                className="pl-color"
                value={sourceEdit.color}
                onChange={(e) => setSourceEdit({ ...sourceEdit, color: e.target.value })}
              />
            </div>
            {typePills(sourceEdit.type, (t) => setSourceEdit({ ...sourceEdit, type: t }))}
            <div className="pl-form-row">
              <button type="button" className="pl-save" onClick={saveSource}>افزودن</button>
              <button type="button" className="pl-cancel" onClick={() => setSourceEdit(null)}>بستن</button>
            </div>
          </div>
        ) : (
          <button type="button" className="pl-sadd" onClick={() => setSourceEdit({ key: 'new', name: '', color: '#d9a15b', type: 'test' })}>
            + کتاب جدید
          </button>
        )}
      </div>
      )}
      {panel === 'data' && (
      <div className="pl-setting-card">
        <h2>پشتیبان‌گیری و بازیابی</h2>
        <p className="pl-setting-desc">کل برنامه‌ی شما ({toPersianDigits(itemCount)} پارت، {toPersianDigits(data.subjects.length)} درس، {toPersianDigits(Object.keys(data.sourceColors).length)} کتاب) در این دستگاه ذخیره شده است. برای امنیت، هر چند وقت یک‌بار پشتیبان بگیرید.</p>
        <div className="pl-data-actions">
          <button type="button" className="pl-save" onClick={onExport}>⬇ خروجی پشتیبان (JSON)</button>
          <button type="button" className="pl-cancel" onClick={onImport}>⬆ وارد کردن پشتیبان</button>
        </div>
      </div>
      )}
      </div>
      </div>
    </div>
  );
};