import React from 'react';
import { PlannerData, PlannerGrade } from '../../types';
import { ParsedEntry, parseEntry, splitLines } from '../../plannerNlp';
import { PERSIAN_MONTH_NAMES, PERSIAN_WEEK_DAYS } from '../../jalali';
import { jalaliOfDate } from '../../plannerStore';
import { formatDuration } from '../../plannerSchedule';
import { toPersianDigits } from '../../utils';

interface Props {
  data: PlannerData;
  defaultDate: Date;
  onCommit: (entries: ParsedEntry[]) => void;
}

const EXAMPLES = [
  'زیست گفتار ۲ تست ۳۰ فردا',
  'فیزیک ۳ دینامیک ۹۰ دقیقه ساعت ۱۶',
  'ناهار از ۱۳ تا ۱۴ امروز',
  'شیمی دوازدهم استوکیومتری از تست گاج چهارشنبه ۲ ساعت'
];

function dayLabel(d: Date): string {
  const j = jalaliOfDate(d);
  return `${PERSIAN_WEEK_DAYS[(d.getDay() + 1) % 7]} ${toPersianDigits(j.jd)} ${PERSIAN_MONTH_NAMES[j.jm - 1]}`;
}

export const Chips: React.FC<{ e: ParsedEntry; defaultMinutes: number }> = ({ e, defaultMinutes }) => {
  if (e.kind === 'rest') {
    return (
      <div className="pl-qa-chips">
        <span className="pl-qa-chip day">📅 {dayLabel(e.date)}</span>
        <span className="pl-qa-chip rest">{e.icon} {e.label}</span>
        {e.start && e.end && <span className="pl-qa-chip time">🕒 {toPersianDigits(e.start)}–{toPersianDigits(e.end)}</span>}
        {e.error && <span className="pl-qa-chip err">⚠ {e.error}</span>}
      </div>
    );
  }
  return (
    <div className="pl-qa-chips">
      <span className={'pl-qa-chip day' + (e.dayGiven ? '' : ' dim')}>📅 {dayLabel(e.date)}</span>
      {e.subject && <span className="pl-qa-chip subj">📚 {e.subject}</span>}
      {e.grade && e.subject && <span className={'pl-qa-chip' + (e.gradeGiven ? '' : ' dim')}>🎓 {e.grade}</span>}
      {e.detail && <span className="pl-qa-chip">📝 {e.detail}</span>}
      {e.source && <span className={'pl-qa-chip src' + (e.sourceKnown ? '' : ' new')}>📕 {e.source}{e.sourceKnown ? '' : ' (جدید)'}</span>}
      <span className={'pl-qa-chip' + (e.minutes ? '' : ' dim')}>⏱ {toPersianDigits(formatDuration(e.minutes || defaultMinutes))}</span>
      {e.start && <span className="pl-qa-chip time">📌 {toPersianDigits(e.start)}</span>}
      {e.error && <span className="pl-qa-chip err">⚠ {e.error}</span>}
    </div>
  );
};

export const PlannerQuickAdd: React.FC<Props> = ({ data, defaultDate, onCommit }) => {
  const [text, setText] = React.useState('');
  const [dump, setDump] = React.useState(false);
  const [multi, setMulti] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const ctx = { subjects: data.subjects, sourceColors: data.sourceColors, defaultDate };
  const one = text.trim() ? parseEntry(text, ctx) : null;
  const lines = dump ? splitLines(multi).map((l) => parseEntry(l, ctx)) : [];
  const okLines = lines.filter((l) => !l.error);

  const submit = () => {
    if (!one || one.error) return;
    onCommit([one]);
    setText('');
    inputRef.current?.focus();
  };
  const submitAll = () => {
    if (!okLines.length) return;
    onCommit(okLines);
    setMulti('');
    setDump(false);
  };

  return (
    <div className="pl-qa">
      <div className="pl-qa-row">
        <span className="pl-qa-spark">✨</span>
        <input
          ref={inputRef}
          className="pl-qa-input"
          value={text}
          placeholder="بنویس چی می‌خوای بخونی؛ خودم پارت می‌سازم…  مثال: زیست گفتار ۲ تست ۳۰ فردا ساعت ۱۶"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
          }}
        />
        <button type="button" className="pl-qa-go" disabled={!one || !!one.error} onClick={submit}>افزودن ↵</button>
        <button type="button" className={'pl-qa-dump' + (dump ? ' on' : '')} onClick={() => setDump((v) => !v)} title="چند کار را یکجا بنویس">🌪️ ذهن‌خالی‌کن</button>
      </div>

      {one && <Chips e={one} defaultMinutes={data.schedule.partMinutes} />}

      {!one && !dump && (
        <div className="pl-qa-ex">
          امتحان کن:
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => { setText(x); inputRef.current?.focus(); }}>{x}</button>
          ))}
        </div>
      )}

      {dump && (
        <div className="pl-qa-dump-box">
          <p>هر خط یک کار. ترتیب و شکل نوشتن مهم نیست؛ استراحت‌ها و ساعت‌ها هم قبول است.</p>
          <textarea
            value={multi}
            rows={6}
            placeholder={'زیست گفتار ۳ تست ۴۰ شنبه\nفیزیک ۳ حرکت‌شناسی ۹۰ دقیقه ساعت ۱۶\nناهار از ۱۳ تا ۱۴ شنبه\nعربی ترجمه نیم ساعت یکشنبه'}
            onChange={(e) => setMulti(e.target.value)}
            autoFocus
          />
          {lines.length > 0 && (
            <div className="pl-qa-list">
              {lines.map((l, i) => (
                <div key={i} className={'pl-qa-line' + (l.error ? ' bad' : '')}>
                  <Chips e={l} defaultMinutes={data.schedule.partMinutes} />
                </div>
              ))}
            </div>
          )}
          <div className="pl-form-row">
            <button type="button" className="pl-save" disabled={!okLines.length} onClick={submitAll}>
              افزودن {okLines.length ? toPersianDigits(okLines.length) : ''} مورد
            </button>
            <button type="button" className="pl-cancel" onClick={() => setDump(false)}>بستن</button>
          </div>
        </div>
      )}
    </div>
  );
};

export type { PlannerGrade };
