import React from 'react';
import { StudyBlock } from '../types';
import { COLORS, ORDINALS, calculateTestPercentage, toPersianDigits } from '../utils';

interface StudyBlockItemProps {
  index: number;
  block: StudyBlock;
  canDelete: boolean;
  onChange: (updated: Partial<StudyBlock>) => void;
  onDelete: () => void;
}

export const StudyBlockItem: React.FC<StudyBlockItemProps> = ({
  index,
  block,
  canDelete,
  onChange,
  onDelete
}) => {
  const { percentage, correctCount } = calculateTestPercentage(
    block.totalTests || '',
    block.wrong || '',
    block.blank || ''
  );

  const ordinalLabel = ORDINALS[index] || `شماره ${toPersianDigits(index + 1)}`;
  const color = COLORS[index % COLORS.length];

  return (
    <div className="block">
      <div className="label" style={{ backgroundColor: color }}>
        <span>بازه مطالعاتی</span>
        <strong>{ordinalLabel}</strong>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="حذف این بازه"
            style={{
              marginTop: '6px',
              background: 'rgba(0,0,0,0.25)',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.72rem',
              padding: '2px 6px'
            }}
          >
            ✕ حذف
          </button>
        )}
      </div>
      <div className="content">
        <div className="row">
          <div className="field">
            <label>ساعت شروع</label>
            <input
              type="time"
              value={block.start}
              onChange={(e) => onChange({ start: e.target.value })}
            />
          </div>
          <div className="field wide">
            <label>نام درس</label>
            <input
              type="text"
              value={block.lesson}
              onChange={(e) => onChange({ lesson: e.target.value })}
              placeholder="مثلاً ریاضی"
            />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>ساعت پایان</label>
            <input
              type="time"
              value={block.end}
              onChange={(e) => onChange({ end: e.target.value })}
            />
          </div>
          <div className="field wide">
            <label>مبحث</label>
            <input
              type="text"
              value={block.subject}
              onChange={(e) => onChange({ subject: e.target.value })}
              placeholder="مبحث درس"
            />
          </div>
        </div>

        <div className="field full">
          <label>شرح مطالعه</label>
          <textarea
            value={block.desc}
            onChange={(e) => onChange({ desc: e.target.value })}
            placeholder="چه کاری انجام دادی؟"
          />
        </div>

        <div className="checks">
          <label className="check-item">
            <input
              type="checkbox"
              checked={block.study}
              onChange={(e) => onChange({ study: e.target.checked })}
            />
            <span>مطالعه</span>
          </label>
          <label className="check-item">
            <input
              type="checkbox"
              checked={block.cls}
              onChange={(e) => onChange({ cls: e.target.checked })}
            />
            <span>کلاس</span>
          </label>
          <label className="check-item">
            <input
              type="checkbox"
              checked={block.review}
              onChange={(e) => onChange({ review: e.target.checked })}
            />
            <span>مرور</span>
          </label>
          <label className="check-item">
            <input
              type="checkbox"
              checked={block.test}
              onChange={(e) => onChange({ test: e.target.checked })}
            />
            <span>تست‌زنی</span>
          </label>
        </div>

        <div className="test-row">
          <span className="test-title">نتیجه تست‌زنی:</span>
          
          <label className="test-mini" title="تعداد کل تست‌ها">
            <span style={{ fontSize: '0.78rem', color: 'var(--sub-ink)' }}>کل:</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="تعداد"
              value={block.totalTests || ''}
              onChange={(e) => onChange({ totalTests: e.target.value })}
            />
          </label>

          <label className="test-mini wrong" title="تعداد پاسخ‌های نادرست">
            <span>✗</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="غلط"
              value={block.wrong || ''}
              onChange={(e) => onChange({ wrong: e.target.value })}
            />
          </label>

          <label className="test-mini blank" title="تعداد بدون پاسخ (نزده)">
            <span>○</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="نزده"
              value={block.blank || ''}
              onChange={(e) => onChange({ blank: e.target.value })}
            />
          </label>

          <span className="test-total">
            درست: <b style={{ color: '#3e8c56', marginLeft: '6px' }}>{toPersianDigits(correctCount)}</b>
            درصد: <b style={{ color: 'var(--ink)' }}>{percentage}</b>
          </span>
        </div>
      </div>
    </div>
  );
};
