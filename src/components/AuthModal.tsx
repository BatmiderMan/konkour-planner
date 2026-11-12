import React, { useState } from 'react';
import { SUPABASE_URL, setSupabaseUrlOverride, supabase, supabaseUrl } from '../supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (email: string) => void;
}

/** Login only. Accounts are created by the owner in the Supabase dashboard — there is deliberately no sign-up here. */
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState('');
  const [test, setTest] = useState('');
  const [adv, setAdv] = useState(false);
  const [url, setUrl] = useState(supabaseUrl());

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setDetail('');
    if (!name.trim() || !password) {
      setError('نام کاربری و رمز عبور را وارد کنید.');
      return;
    }
    setLoading(true);
    try {
      const res = await supabase.signIn(name, password);
      if (res.error) {
        setError(res.error);
        setDetail(res.detail || '');
      } else {
        setMessage('ورود موفقیت‌آمیز بود! همگام‌سازی شروع شد…');
        setPassword('');
        onSuccess(res.user?.email || name);
        setTimeout(onClose, 900);
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    setTest('در حال بررسی…');
    const r = await supabase.ping();
    setTest(r.ok ? `✓ سرور در دسترس است (${r.ms} میلی‌ثانیه)` : `✗ ${r.detail}${r.status ? '' : ' — این دستگاه/شبکه به سرور نمی‌رسد'}`);
  };

  return (
    <div className="auth-backdrop" onClick={onClose}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()}>
        <div className="auth-header">
          <h2>🔐 ورود به حساب</h2>
          <button type="button" className="auth-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="auth-subtitle">
          با ورود، برنامه‌ها، گزارش‌ها، آزمون‌ها و گنجینهٔ سؤال (با عکس‌ها) روی سرور ذخیره می‌شوند و بین دستگاه‌هایتان زنده همگام می‌مانند.
        </p>

        {error && <div className="auth-alert error">{error}{detail && <div dir="ltr" style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>{detail}</div>}</div>}
        {message && <div className="auth-alert success">{message}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>نام کاربری</label>
            <input
              type="text"
              dir="ltr"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              spellCheck={false}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="username"
              required
            />
          </div>

          <div className="auth-field">
            <label>رمز عبور</label>
            <input
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              required
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'در حال اتصال...' : 'ورود'}
          </button>
        </form>

        <div className="auth-footer">
          <button type="button" className="auth-link-btn" onClick={() => void runTest()} style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>تست اتصال به سرور</button>
          {' · '}
          <button type="button" className="auth-link-btn" onClick={() => setAdv((a) => !a)} style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>پیشرفته</button>
          {test && <p dir="auto">{test}</p>}
          {adv && (
            <div className="auth-field" style={{ marginTop: 8 }}>
              <label>آدرس سرور (فقط اگر سرور مستقیم باز نمی‌شود و پروکسی دارید)</label>
              <input type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => { setSupabaseUrlOverride(url); setUrl(supabaseUrl()); }} placeholder={SUPABASE_URL} />
            </div>
          )}
          <p>
            ساخت حساب جدید ممکن نیست؛ نام کاربری و رمز را مدیر برنامه به شما می‌دهد.
            <br />
            بدون حساب هم می‌توانید از برنامه استفاده کنید، فقط اطلاعات روی همین دستگاه می‌ماند.
          </p>
        </div>
      </div>
    </div>
  );
};
