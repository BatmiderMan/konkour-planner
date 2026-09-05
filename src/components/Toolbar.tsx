import React, { useState } from 'react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="toolbar">
      <div className="toolbar-top-row">
        <div className="app-branding">
          <span className="app-logo">📖</span>
          <span className="app-title">برنامه‌ریز کنکور</span>
        </div>

        <div className="toolbar-center">
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
          <span className={`save-status ${saveStatus ? 'show' : ''}`}>
            {saveStatus}
          </span>
        </div>

        {/* Mobile menu toggle button */}
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="منوی ابزار"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Action buttons (always visible on desktop, expandable on mobile) */}
      <div className={`toolbar-actions ${mobileMenuOpen ? 'open' : ''}`}>
        {installPrompt && (
          <button
            type="button"
            className="pwa-install-btn"
            onClick={() => {
              onInstall();
              setMobileMenuOpen(false);
            }}
            title="نصب برنامه روی گوشی یا کامپیوتر"
          >
            📲 نصب اپلیکیشن
          </button>
        )}
        <button
          type="button"
          className="primary"
          onClick={() => {
            onNewDay();
            setMobileMenuOpen(false);
          }}
        >
          + روز جدید
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            onDeleteDay();
            setMobileMenuOpen(false);
          }}
        >
          حذف این روز
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            onExport();
            setMobileMenuOpen(false);
          }}
          title="پشتیبان‌گیری از داده‌ها به صورت فایل JSON"
        >
          خروجی پشتیبان
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            onImport();
            setMobileMenuOpen(false);
          }}
          title="بازیابی فایل پشتیبان"
        >
          بازیابی فایل
        </button>
      </div>
    </header>
  );
};
