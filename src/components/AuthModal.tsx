import React, { useState } from 'react';
import { supabase } from '../supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (email: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email || !password) {
      setError('لطفاً ایمیل و رمز عبور را وارد کنید.');
      return;
    }

    if (password.length < 6) {
      setError('رمز عبور باید حداقل ۶ کاراکتر باشد.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const res = await supabase.signUp(email, password);
        if (res.error) {
          setError(res.error);
        } else {
          setMessage('حساب کاربری با موفقیت ساخته شد!');
          onSuccess(email);
          setTimeout(onClose, 1000);
        }
      } else {
        const res = await supabase.signIn(email, password);
        if (res.error) {
          setError(res.error);
        } else {
          setMessage('ورود موفقیت‌آمیز بود!');
          onSuccess(email);
          setTimeout(onClose, 800);
        }
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-backdrop" onClick={onClose}>
      <div className="auth-card" onClick={(e) => e.stopPropagation()}>
        <div className="auth-header">
          <h2>{isSignUp ? '✨ ساخت حساب جدید' : '🔐 ورود به حساب'}</h2>
          <button type="button" className="auth-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="auth-subtitle">
          با ورود به حساب، تمام گزارش‌ها و برنامه‌ها به‌صورت خودکار بین گوشی و کامپیوتر همگام می‌شوند.
        </p>

        {error && <div className="auth-alert error">{error}</div>}
        {message && <div className="auth-alert success">{message}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>ایمیل</label>
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>

          <div className="auth-field">
            <label>رمز عبور</label>
            <input
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="حداقل ۶ کاراکتر"
              required
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'در حال اتصال...' : isSignUp ? 'ثبت نام و شروع همگام‌سازی' : 'ورود به حساب'}
          </button>
        </form>

        <div className="auth-footer">
          {isSignUp ? (
            <p>
              قبلاً حساب کاربری داشته‌اید؟{' '}
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => {
                  setIsSignUp(false);
                  setError('');
                }}
              >
                ورود به حساب
              </button>
            </p>
          ) : (
            <p>
              هنوز حساب کاربری ندارید؟{' '}
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => {
                  setIsSignUp(true);
                  setError('');
                }}
              >
                ثبت نام رایگان
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
