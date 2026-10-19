import React from 'react';
import { ScanLine } from 'lucide-react';
import { openScan, sourceFromDesc } from '../checker/launch';
import { StudyBlock } from '../types';
import { COLORS, ORDINALS, calculateTestPercentage, toPersianDigits } from '../utils';

interface StudyBlockItemProps {
  index: number;
  block: StudyBlock;
  dayId?: string;
  dateKey?: string;
  canDelete: boolean;
  onChange: (updated: Partial<StudyBlock>) => void;
  onDelete: () => void;
}

export const StudyBlockItem: React.FC<StudyBlockItemProps> = ({
  index,
  block,
  dayId,
  dateKey,
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
    <div className="block-card">
      <div className="block-card-header" style={{ backgroundColor: color }}>
        <div className="block-header-info">
          <span className="block-badge">بازه {ordinalLabel}</span>
        </div>
        {canDelete && (
          <button
            type="button"
            className="block-delete-btn"
            onClick={onDelete}
            title="حذف این بازه"
          >
            ✕ حذف
          </button>
        )}
      </div>

      <div className="block-card-body">
        {/* Row 1: Time & Lesson */}
        <div className="input-grid-2">
          <div className="input-box time-box">
            <label>شروع</label>
            <input
              type="time"
              value={block.start}
              onChange={(e) => onChange({ start: e.target.value })}
            />
          </div>
          <div className="input-box time-box">
            <label>پایان</label>
            <input
              type="time"
              value={block.end}
              onChange={(e) => onChange({ end: e.target.value })}
            />
          </div>
        </div>

        {/* Row 2: Lesson & Subject */}
        <div className="input-grid-2">
          <div className="input-box">
            <label>نام درس</label>
            <input
              type="text"
              value={block.lesson}
              onChange={(e) => onChange({ lesson: e.target.value })}
              placeholder="مثلاً زیست‌شناسی"
            />
          </div>
          <div className="input-box">
            <label>مبحث</label>
            <input
              type="text"
              value={block.subject}
              onChange={(e) => onChange({ subject: e.target.value })}
              placeholder="مثلاً گوارش"
            />
          </div>
        </div>

        {/* Description textarea */}
        <div className="input-box full">
          <label>شرح مطالعه</label>
          <textarea
            value={block.desc}
            onChange={(e) => onChange({ desc: e.target.value })}
            placeholder="خلاصه کارهای انجام شده..."
          />
        </div>

        {/* Activity Chips / Checkboxes */}
        <div className="activity-chips">
          <label className={`activity-chip ${block.study ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={block.study}
              onChange={(e) => onChange({ study: e.target.checked })}
            />
            <span>📖 مطالعه</span>
          </label>
          <label className={`activity-chip ${block.cls ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={block.cls}
              onChange={(e) => onChange({ cls: e.target.checked })}
            />
            <span>👨‍🏫 کلاس</span>
          </label>
          <label className={`activity-chip ${block.review ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={block.review}
              onChange={(e) => onChange({ review: e.target.checked })}
            />
            <span>🔄 مرور</span>
          </label>
          <label className={`activity-chip ${block.test ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={block.test}
              onChange={(e) => onChange({ test: e.target.checked })}
            />
            <span>✏️ تست‌زنی</span>
          </label>
        </div>

        {/* Test Section */}
        <div className="test-panel">
          <div className="test-inputs-wrap">
            <div className="test-input-item">
              <span className="test-lbl">کل</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="۰"
                value={block.totalTests || ''}
                onChange={(e) => onChange({ totalTests: e.target.value })}
              />
            </div>

            <div className="test-input-item wrong">
              <span className="test-lbl">✗ غلط</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="۰"
                value={block.wrong || ''}
                onChange={(e) => onChange({ wrong: e.target.value })}
              />
            </div>

            <div className="test-input-item blank">
              <span className="test-lbl">○ نزده</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="۰"
                value={block.blank || ''}
                onChange={(e) => onChange({ blank: e.target.value })}
              />
            </div>
          </div>

          {block.test && (
            <button
              type="button"
              className={'ck-scan-btn' + (block.scanId ? ' done' : '')}
              onClick={() => openScan({
                lesson: block.lesson, subject: block.subject, detail: block.desc, source: sourceFromDesc(block.desc),
                link: { dayId, dateKey, blockIndex: index },
                current: { total: block.totalTests, wrong: block.wrong, blank: block.blank },
                applyLabel: 'ثبت در این پارت',
                onApply: (c, rec) => onChange({ totalTests: String(c.total), wrong: String(c.wrong), blank: String(c.blank), scanId: rec.id })
              })}
            >
              <ScanLine size={16} /> {block.scanId ? 'تصحیح دوباره‌ی پاسخ‌برگ' : 'اسکن پاسخ‌برگ'}
            </button>
          )}

          <div className="test-calc-results">
            <div className="res-pill correct">
              <span>درست:</span>
              <b>{toPersianDigits(correctCount)}</b>
            </div>
            <div className="res-pill percentage">
              <span>درصد:</span>
              <b>{percentage}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
