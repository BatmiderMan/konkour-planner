import React, { useState } from 'react';
import { DayIndexEntry } from '../types';

interface ToolbarProps {
  days: DayIndexEntry[];
  currentId: string | null;
  saveStatus: string;
  installPrompt: any;
  userEmail: string | null;
  activeTab: 'blocks' | 'sidebar';
  onTabChange: (tab: 'blocks' | 'sidebar') => void;
  onSelectDay: (id: string) => void;
  onNewDay: () => void;
  onDeleteDay: () => void;
  onExport: () => void;
  onImport: () => void;
  onInstall: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onSyncCloud: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  days,
  currentId,
  saveStatus,
  installPrompt,
  userEmail,
  activeTab,
  onTabChange,
  onSelectDay,
  onNewDay,
  onDeleteDay,
  onExport,
  onImport,
  onInstall,
  onOpenAuth,
  onSignOut,
  onSyncCloud
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
            {userEmail ? (
              <button
                type="button"
                className="cloud-sync-badge active"
                onClick={onSyncCloud}
                title={`همگام با حساب: ${userEmail}`}
              >
                ☁️ همگام
              </button>
            ) : (
              <button
                type="button"
                className="btn-login"
                onClick={onOpenAuth}
                title="ورود به حساب برای همگام‌سازی ابری"
              >
                🔐 ورود
              </button>
            )}

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

            {userEmail ? (
              <div className="user-profile-box">
                <div className="user-profile-info">
                  <span className="profile-icon">👤</span>
                  <span className="profile-email">{userEmail}</span>
                </div>
                <div className="user-profile-actions">
                  <button
                    type="button"
                    className="profile-btn sync"
                    onClick={() => {
                      onSyncCloud();
                      setMenuOpen(false);
                    }}
                  >
                    🔄 همگام‌سازی دستی
                  </button>
                  <button
                    type="button"
                    className="profile-btn logout"
                    onClick={() => {
                      onSignOut();
                      setMenuOpen(false);
                    }}
                  >
                    خروج از حساب
                  </button>
                </div>
              </div>
            ) : (
              <div className="user-login-prompt">
                <p>برای همگام‌سازی خودکار بین گوشی و لپ‌تاپ وارد شوید:</p>
                <button
                  type="button"
                  className="menu-btn login-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAuth();
                  }}
                >
                  🔐 ورود یا ثبت‌نام رایگان
                </button>
              </div>
            )}

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
