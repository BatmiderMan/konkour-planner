import React from 'react';
import { BookOpen, ClipboardList, GraduationCap, Repeat2, Plus, ArrowRight, Check, ScanLine } from 'lucide-react';
import { openScan } from '../../checker/launch';
import { PlannerItem, StudyBlock } from '../../types';
import { calculateTestPercentage, createEmptyBlock, toPersianDigits } from '../../utils';
import { blockKindFor, gradeColor, loadPlannerData, plannerItemToBlockFields } from '../../plannerStore';
import { LiveResult, liveKind } from '../../livePlan';
import { getTickPrefs } from '../../tickSound';

const POPULAR_LESSONS = ['زیست‌شناسی', 'ریاضی', 'فیزیک', 'شیمی', 'ادبیات', 'عربی', 'دینی', 'زبان انگلیسی', 'زمین‌شناسی'];
const FREE_DEFAULT = 'مطالعه آزاد';

interface FinishFormProps {
  result: LiveResult;
  onSave: (block: StudyBlock, linkedItem: PlannerItem | null) => void;
  onBack: () => void;
}

export const FinishForm: React.FC<FinishFormProps> = ({ result, onSave, onBack }) => {
  const s = result.session;
  const isFree = liveKind(s) === 'free';
  const data = React.useMemo(() => loadPlannerData(), []);
  const kind = blockKindFor(s.item, data.sourceTypes);
  const fields = plannerItemToBlockFields(s.item);

  const [lesson, setLesson] = React.useState(isFree && s.item.subject === FREE_DEFAULT ? '' : fields.lesson);
  const [subject, setSubject] = React.useState(isFree ? '' : fields.subject);
  const [desc, setDesc] = React.useState(isFree ? '' : fields.desc);
  const [startTime, setStartTime] = React.useState(result.start);
  const [endTime, setEndTime] = React.useState(result.end);
  const isTest = kind === 'test';
  const [study, setStudy] = React.useState(!isTest);
  const [cls, setCls] = React.useState(false);
  const [review, setReview] = React.useState(false);
  const [test, setTest] = React.useState(isTest);
  const [totalTests, setTotalTests] = React.useState('');
  const [wrong, setWrong] = React.useState('');
  const [blank, setBlank] = React.useState('');
  const [scanId, setScanId] = React.useState<string | undefined>(undefined);
  const [linked, setLinked] = React.useState<PlannerItem | null>(null);

  const todays = isFree ? data.items[s.dateKey] || [] : [];
  const pickPlan = (it: PlannerItem) => {
    if (linked && linked.id === it.id) { setLinked(null); return; }
    const f = plannerItemToBlockFields(it);
    setLesson(f.lesson); setSubject(f.subject); setDesc(f.desc);
    setLinked(it);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const block: StudyBlock = {
      ...createEmptyBlock(),
      lesson: lesson.trim() || s.item.subject || FREE_DEFAULT,
      subject: subject.trim(),
      start: startTime,
      end: endTime,
      desc: desc.trim(),
      study, cls, review, test,
      totalTests: totalTests || '',
      wrong: wrong || '',
      blank: blank || '',
      ...(scanId ? { scanId } : {})
    };
    onSave(block, isFree ? linked : s.item);
  };

  const stats = calculateTestPercentage(totalTests, wrong, blank);
  const mins = Math.round(result.activeSeconds / 60);
  const tp = getTickPrefs();
  const ticks = tp.on ? Math.floor(result.activeSeconds / tp.seconds) : 0;
  const acts: [string, React.ReactNode, boolean, (v: boolean) => void][] = [
    ['مطالعه', <BookOpen size={16} key="a" />, study, setStudy],
    ['کلاس', <GraduationCap size={16} key="b" />, cls, setCls],
    ['مرور', <Repeat2 size={16} key="c" />, review, setReview],
    ['تست', <ClipboardList size={16} key="d" />, test, setTest]
  ];

  return (
    <form className="tm-form" onSubmit={submit}>
      <div className="tm-recap">
        <div className="tm-recap-hero">
          <b>{toPersianDigits(mins)}</b>
          <span>دقیقه مطالعه‌ی مفید{s.pauses > 0 ? ' (توقف‌ها حساب نشده)' : ''}</span>
        </div>
        <div className="tm-recap-stats">
          {ticks > 0 && <div><b>{toPersianDigits(ticks)}</b><span>تیک</span></div>}
          {ticks === 0 && <div><b>{toPersianDigits(result.start)}</b><span>شروع</span></div>}
        </div>
      </div>

      <div className="tm-row2">
        <label className="tm-field"><span>ساعت شروع</span><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></label>
        <label className="tm-field"><span>ساعت پایان</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required /></label>
      </div>

      {todays.length > 0 && (
        <div className="tm-field">
          <span>این مطالعه کدام کارت برنامه‌ی امروز بود؟ (اختیاری)</span>
          <div className="tm-plan-picker">
            {todays.map((it) => (
              <button type="button" key={it.id} className={'tm-plan-chip' + (linked?.id === it.id ? ' sel' : '') + (it.done ? ' done' : '')} style={{ ['--c' as any]: gradeColor(it.grade) }} onClick={() => pickPlan(it)}>
                <b>{it.subject}</b>
                {it.detail && <em>{it.detail}</em>}
                {linked?.id === it.id && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="tm-field">
        <span>نام درس</span>
        <input type="text" value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder={isFree ? 'نام درس را بنویس یا از پایین انتخاب کن' : ''} required={!s.item.subject} />
      </label>
      {isFree && (
        <div className="tm-chips tm-lessons">
          {POPULAR_LESSONS.map((l) => <button type="button" key={l} className={lesson === l ? 'on' : ''} onClick={() => setLesson(l)}>{l}</button>)}
        </div>
      )}
      <label className="tm-field"><span>مبحث / گفتار / فصل</span><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="اختیاری" /></label>

      <div className="tm-acts">
        {acts.map(([label, icon, val, set]) => (
          <button key={label} type="button" className={val ? 'on' : ''} onClick={() => set(!val)}>{icon}{label}</button>
        ))}
      </div>

      {test && (
        <div className="tm-test-fields">
          <label className="tm-field"><span>کل تست</span><input type="number" inputMode="numeric" min="0" value={totalTests} onChange={(e) => setTotalTests(e.target.value)} placeholder="۰" /></label>
          <label className="tm-field"><span>غلط</span><input type="number" inputMode="numeric" min="0" value={wrong} onChange={(e) => setWrong(e.target.value)} placeholder="۰" /></label>
          <label className="tm-field"><span>نزده</span><input type="number" inputMode="numeric" min="0" value={blank} onChange={(e) => setBlank(e.target.value)} placeholder="۰" /></label>
          <button
            type="button"
            className={'ck-scan-btn' + (scanId ? ' done' : '')}
            onClick={() => openScan({
              lesson: lesson || s.item.subject, subject: subject, detail: [s.item.detail, desc].filter(Boolean).join(' '), source: s.item.source,
              link: { dateKey: s.dateKey, plannerItemId: isFree ? linked?.id : s.item.id },
              current: { total: totalTests, wrong, blank },
              applyLabel: 'ثبت در این پارت',
              onApply: (c, rec) => { setTotalTests(String(c.total)); setWrong(String(c.wrong)); setBlank(String(c.blank)); setScanId(rec.id); }
            })}
          >
            <ScanLine size={16} /> {scanId ? 'تصحیح دوباره‌ی پاسخ‌برگ' : 'اسکن پاسخ‌برگ و پر کردن خودکار'}
          </button>
          {parseInt(totalTests, 10) > 0 && (
            <div className="tm-test-result">درست: <b>{toPersianDigits(stats.correctCount)}</b> · درصد: <b>{stats.percentage}</b></div>
          )}
        </div>
      )}

      <label className="tm-field"><span>شرح و نکات</span><textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>

      <div className="tm-form-actions">
        <button type="submit" className="tm-btn-main"><Plus size={18} /> ثبت در گزارش {toPersianDigits(s.dateKey)}</button>
        <button type="button" className="tm-btn-ghost" onClick={onBack}><ArrowRight size={16} /> بازگشت به تایمر</button>
      </div>
    </form>
  );
};
