import React, { useState } from 'react';
import { BookType, PlannerGrade, PlannerItem, PlannerSubjectDef } from '../../types';
import { PLANNER_GRADES, hashColor } from '../../plannerStore';

interface PlannerItemFormProps {
  subjects: PlannerSubjectDef[];
  sourceColors: Record<string, string>;
  sourceTypes?: Record<string, BookType>;
  defaultMinutes?: number; // the global part length, shown as placeholder
  existing?: PlannerItem | null;
  onSave: (data: { subject: string; detail: string; grade: PlannerGrade; source?: string; sourceColor?: string; sourceType?: BookType; minutes?: number; start?: string }) => void;
  onCancel: () => void;
}

export const PlannerItemForm: React.FC<PlannerItemFormProps> = ({
  subjects,
  sourceColors,
  sourceTypes,
  defaultMinutes,
  existing,
  onSave,
  onCancel
}) => {
  const [grade, setGrade] = useState<PlannerGrade>(existing?.grade || 'دوازدهم');
  const gradeSubjects = subjects.filter((s) => s.grades.includes(grade));
  const [subject, setSubject] = useState<string>(
    existing?.subject && gradeSubjects.some((s) => s.n === existing.subject)
      ? existing.subject
      : gradeSubjects[0]?.n || ''
  );
  const [detail, setDetail] = useState(existing?.detail || '');
  const [srcOn, setSrcOn] = useState(!!existing?.source);
  const [source, setSource] = useState(existing?.source || '');
  const [srcColor, setSrcColor] = useState(
    (existing?.source && sourceColors[existing.source]) || '#d9a15b'
  );

  const [srcType, setSrcType] = useState<BookType>(
    (existing?.source && sourceTypes && sourceTypes[existing.source]) || 'test'
  );
  const [minutes, setMinutes] = useState<string>(existing?.minutes ? String(existing.minutes) : '');
  const [start, setStart] = useState<string>(existing?.start || '');
  const recentSources = Object.keys(sourceColors).slice(-4).reverse();

  const changeGrade = (g: PlannerGrade) => {
    setGrade(g);
    const opts = subjects.filter((s) => s.grades.includes(g));
    if (!opts.some((s) => s.n === subject)) setSubject(opts[0]?.n || '');
  };

  const submit = () => {
    if (!subject) return;
    const finalSource = srcOn ? source.trim() || undefined : undefined;
    onSave({
      subject,
      detail: detail.trim(),
      grade,
      source: finalSource,
      sourceColor: finalSource ? srcColor : undefined,
      sourceType: finalSource ? srcType : undefined,
      minutes: Number(minutes) > 0 ? Math.min(480, Math.round(Number(minutes))) : undefined,
      start: /^\d{2}:\d{2}$/.test(start) ? start : undefined
    });
  };

  return (
    <div className="pl-form">
      <div className="pl-grade-pills">
        {PLANNER_GRADES.map((g) => (
          <button
            key={g.id}
            type="button"
            className={'pl-grade-pill' + (g.id === grade ? ' active' : '')}
            style={{ ['--gc' as any]: g.c }}
            onClick={() => changeGrade(g.id)}
          >
            {g.id}
          </button>
        ))}
      </div>

      <select className="pl-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
        {gradeSubjects.map((s) => (
          <option key={s.n} value={s.n}>
            {s.n}
          </option>
        ))}
      </select>

      <input
        className="pl-input"
        placeholder="مبحث یا توضیح (اختیاری)"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
        }}
      />

      <label className="pl-src-toggle">
        <input type="checkbox" checked={srcOn} onChange={(e) => setSrcOn(e.target.checked)} />
        افزودن منبع (کتاب)
      </label>

      {srcOn && (
        <div className="pl-src-row">
          <input
            className="pl-input"
            placeholder="نام کتاب / منبع (مثلا: تست گاج)"
            value={source}
            list="pl-source-list"
            onChange={(e) => {
              const v = e.target.value;
              setSource(v);
              setSrcColor(sourceColors[v] || (v ? hashColor(v) : '#d9a15b'));
              if (sourceTypes && sourceTypes[v]) setSrcType(sourceTypes[v]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit(); }
            }}
          />
          <input
            type="color"
            className="pl-color"
            value={srcColor}
            onChange={(e) => setSrcColor(e.target.value)}
          />
          <datalist id="pl-source-list">
            {Object.keys(sourceColors).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      )}

      {srcOn && !source && recentSources.length > 0 && (
        <div className="pl-quick pl-src-recent">
          {recentSources.map((n) => (
            <button key={n} type="button" onClick={() => { setSource(n); setSrcColor(sourceColors[n]); if (sourceTypes && sourceTypes[n]) setSrcType(sourceTypes[n]); }}>
              {n}
            </button>
          ))}
        </div>
      )}

      {srcOn && (
        <div className="pl-type-pills" role="radiogroup" aria-label="نوع کتاب">
          <button type="button" className={srcType === 'test' ? 'active' : ''} onClick={() => setSrcType('test')}>✏️ تستی</button>
          <button type="button" className={srcType === 'descriptive' ? 'active' : ''} onClick={() => setSrcType('descriptive')}>📖 تشریحی</button>
        </div>
      )}

      <div className="pl-dur-row">
        <span>مدت پارت</span>
        <span className="pl-quick">
          {[30, 45, 60, 90, 120].map((m) => (
            <button key={m} type="button" className={minutes === String(m) ? 'on' : ''} onClick={() => setMinutes(minutes === String(m) ? '' : String(m))}>
              {m}′
            </button>
          ))}
        </span>
        <input
          className="pl-input pl-dur-input"
          type="number"
          min={5}
          max={480}
          inputMode="numeric"
          placeholder={defaultMinutes ? String(defaultMinutes) : 'پیش‌فرض'}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
        <span className="pl-dur-hint">خالی = مدت پیش‌فرض</span>
      </div>

      <div className="pl-dur-row">
        <span>📌 ساعت شروع ثابت</span>
        <input className="pl-input pl-time-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        {start && <button type="button" className="pl-quick-clear" onClick={() => setStart('')}>× آزاد</button>}
        <span className="pl-dur-hint">خالی = پشت پارت قبلی می‌آید</span>
      </div>

      <div className="pl-form-row">
        <button type="button" className="pl-save" onClick={submit}>
          {existing ? 'ذخیره' : 'افزودن'}
        </button>
        <button type="button" className="pl-cancel" onClick={onCancel}>
          بستن
        </button>
      </div>
    </div>
  );
};
