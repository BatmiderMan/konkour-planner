import React, { useState } from 'react';
import { DayIndexEntry } from '../types';

interface ToolbarProps {
  days: DayIndexEntry[];
  currentId: string | null;
  saveStatus: string;
  installPrompt: any;
  activeTab: 'blocks' | 'sidebar';
  onTabChange: (tab: 'blocks' | 'sidebar') => void;
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
  activeTab,
  onTabChange,
  onSelectDay,
  onNewDay,
  onDeleteDay,
  onExport,
  onImport,
  onInstall
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="mobile-app-bar">
        <div className="mobile-bar-main">
          <div className="app-brand">
            <span className="app-icon">📚</span>
            <span className="app-name">دفتر کنکور</span>
          </div>

          <div className="day-selector-wrap">
            <select
              className="day-dropdown"
              value={currentId || ''}
              onChange={(e) => onSelectDay(e.target.value)}
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
            <span className={`save-badge ${saveStatus ? 'show' : ''}`}>
              {saveStatus}
            </span>
          </div>

          <div className="bar-actions">
            <button
              type="button"
              className="btn-new-day"
              onClick={onNewDay}
              title="ایجاد روز جدید"
            >
              + جدید
            </button>
            <button
              type="button"
              className="btn-menu-toggle"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="منو"
            >
              {menuOpen ? '✕' : '⚙'}
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="mobile-view-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'blocks' ? 'active' : ''}`}
            onClick={() => onTabChange('blocks')}
          >
            ⏱ بازه‌های مطالعه
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'sidebar' ? 'active' : ''}`}
            onClick={() => onTabChange('sidebar')}
          >
            📋 چک‌لیست و روتین‌ها
          </button>
        </div>
      </header>

      {/* Slide-out Menu / Modal for settings and actions */}
      {menuOpen && (
        <div className="menu-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="menu-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="menu-header">
              <h3>منوی امکانات</h3>
              <button
                type="button"
                className="close-menu-btn"
                onClick={() => setMenuOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="menu-buttons">
              {installPrompt && (
                <button
                  type="button"
                  className="menu-btn install"
                  onClick={() => {
                    onInstall();
                    setMenuOpen(false);
                  }}
                >
                  📲 نصب اپلیکیشن روی گوشی / کامپیوتر
                </button>
              )}

              <button
                type="button"
                className="menu-btn"
                onClick={() => {
                  onNewDay();
                  setMenuOpen(false);
                }}
              >
                ➕ ایجاد برگه روز جدید (با انتقال تسک‌ها)
              </button>

              <button
                type="button"
                className="menu-btn"
                onClick={() => {
                  onExport();
                  setMenuOpen(false);
                }}
              >
                💾 خروجی فایل پشتیبان (JSON)
              </button>

              <button
                type="button"
                className="menu-btn"
                onClick={() => {
                  onImport();
                  setMenuOpen(false);
                }}
              >
                📥 بازیابی فایل پشتیبان
              </button>

              <button
                type="button"
                className="menu-btn delete"
                onClick={() => {
                  onDeleteDay();
                  setMenuOpen(false);
                }}
              >
                🗑 حذف کامل این روز
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
