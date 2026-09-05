import React from 'react';
import { DayIndexEntry } from '../types';

interface ToolbarProps {
  days: DayIndexEntry[];
  currentId: string | null;
  saveStatus: string;
  installPrompt: any;
  onSelectDay: (id: string) => void;
  onNewDay: () => void;
  onDeleteDay: () => void;
  onExport: () => void;
  onImport: () => void;
  onInstall: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  days,
  currentId,
  saveStatus,
  installPrompt,
  onSelectDay,
  onNewDay,
  onDeleteDay,
  onExport,
  onImport,
  onInstall
}) => {
  return (
    <div className="toolbar">
      <div className="app-title">برنامه‌ریز مطالعه روزانه کنکور</div>
      <div className="toolbar-right">
        {installPrompt && (
          <button
            type="button"
            onClick={onInstall}
            style={{
              background: '#4c8a5a',
              color: '#fff',
              borderColor: '#4c8a5a',
              fontWeight: 700
            }}
            title="نصب برنامه روی گوشی یا کامپیوتر"
          >
            📲 نصب اپلیکیشن
          </button>
        )}
        <select
          id="daySelect"
          value={currentId || ''}
          onChange={(e) => onSelectDay(e.target.value)}
          title="رفتن به یک روز ذخیره‌شده"
        >
          {days.map((item) => {
            const label = `${item.day || ''} ${item.date || ''}`.trim() || 'بدون عنوان';
            return (
              <option key={item.id} value={item.id}>
                {label}
              </option>
            );
          })}
        </select>
        <button type="button" className="primary" onClick={onNewDay}>
          + روز جدید (مثلاً فردا)
        </button>
        <button type="button" className="danger" onClick={onDeleteDay}>
          حذف این روز
        </button>
        <button type="button" onClick={onExport} title="پشتیبان‌گیری از داده‌ها به صورت فایل JSON">
          پشتیبان (Export)
        </button>
        <button type="button" onClick={onImport} title="بازیابی فایل پشتیبان">
          بازیابی (Import)
        </button>
        <span className={`save-status ${saveStatus ? 'show' : ''}`}>
          {saveStatus}
        </span>
      </div>
    </div>
  );
};
