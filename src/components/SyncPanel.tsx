import React from 'react';
import { supabase } from '../supabase';
import { getDiagnostics, pushEverything, syncNow, useSyncStatus } from '../sync';
import { confirmDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';
import { Sheet } from './ui/Sheet';

const ago = (t: number): string => {
  if (!t) return 'هنوز نشده';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 5) return 'همین الان';
  if (s < 60) return `${P(s)} ثانیه پیش`;
  if (s < 3600) return `${P(Math.round(s / 60))} دقیقه پیش`;
  return `${P(Math.round(s / 3600))} ساعت پیش`;
};

/** what is going on with the account: state, waiting changes, the real error text, and buttons to push / pull / test */
export const SyncPanel: React.FC<{ onClose: () => void; onSignOut: () => void }> = ({ onClose, onSignOut }) => {
  const st = useSyncStatus();
  const [, tick] = React.useReducer((x: number) => x + 1, 0);
  const [busy, setBusy] = React.useState('');
  const [note, setNote] = React.useState('');
  React.useEffect(() => { const t = window.setInterval(tick, 1000); return () => window.clearInterval(t); }, []);
  const d = getDiagnostics();
  const user = supabase.getUser();
  const err = d.errors.settings || d.errors.vault || d.errors.library || '';
  const dot = st.state === 'live' ? 'ok' : st.state === 'syncing' || st.state === 'connecting' ? 'wait' : 'bad';

  const run = async (name: string, fn: () => Promise<void>) => { setBusy(name); setNote(''); try { await fn(); } finally { setBusy(''); tick(); } };

  const test = () => run('test', async () => {
    const r = await supabase.ping();
    setNote(r.ok ? `✓ سرور در دسترس است (${P(r.ms)} میلی‌ثانیه)` : `✗ ${r.detail}`);
  });
  const sync = () => run('sync', async () => { const ok = await syncNow(); setNote(ok ? '✓ همگام شد' : '✗ همگام‌سازی کامل نشد؛ متن خطا را بالا ببینید.'); });
  const pushAll = () => run('push', async () => {
    if (!(await confirmDialog('همهٔ اطلاعات این دستگاه (برنامه‌ها، تنظیمات، گنجینه و کتابخانه) دوباره به سرور فرستاده می‌شود. ادامه می‌دهید؟'))) return;
    const r = await pushEverything();
    setNote(`${r.ok ? '✓' : '✗'} ارسال شد: ${P(r.counts.settings)} تنظیم/برنامه · ${P(r.counts.vault)} سؤال · ${P(r.counts.library)} سند کتابخانه`);
  });
  const copy = async () => {
    const text = JSON.stringify(getDiagnostics(), null, 2);
    try { await navigator.clipboard.writeText(text); setNote('✓ گزارش کپی شد'); } catch { window.prompt('گزارش را کپی کنید:', text); }
  };

  return (
    <Sheet onClose={onClose} title="همگام‌سازی با سرور" z={650}>
      <div className="sp">
        {!user ? (
          <p>وارد حساب نشده‌اید.</p>
        ) : (
          <>
            <div className={'sp-state ' + dot}>
              <i aria-hidden="true" />
              <div><b>{user.email}</b><span>{st.message || 'آماده'}</span></div>
            </div>
            <dl className="sp-grid">
              <div><dt>آخرین همگام‌سازی</dt><dd>{ago(st.lastSync)}</dd></div>
              <div><dt>اتصال زنده</dt><dd>{st.live ? 'برقرار ✓' : 'قطع (هر ۱۵ ثانیه بررسی می‌شود)'}</dd></div>
              <div><dt>در انتظار ارسال</dt><dd>{P(d.pending.settings)} تنظیم · {P(d.pending.vault)} سؤال · {P(d.pending.library)} کتابخانه</dd></div>
            </dl>
            {err && <div className="sp-err" dir="ltr">{err}</div>}
            {!err && d.session && d.session.lastRefreshError && <div className="sp-err" dir="ltr">token: {d.session.lastRefreshError}</div>}
            <div className="sp-act">
              <button type="button" className="sp-btn p" disabled={!!busy} onClick={() => void sync()}>{busy === 'sync' ? 'در حال همگام‌سازی…' : 'همگام‌سازی همین حالا'}</button>
              <button type="button" className="sp-btn" disabled={!!busy} onClick={() => void test()}>{busy === 'test' ? '…' : 'تست اتصال'}</button>
              <button type="button" className="sp-btn" disabled={!!busy} onClick={() => void pushAll()}>{busy === 'push' ? 'در حال ارسال…' : 'ارسال همهٔ اطلاعات این دستگاه'}</button>
              <button type="button" className="sp-btn" onClick={() => void copy()}>کپی گزارش</button>
            </div>
            {note && <div className="sp-note" role="status">{note}</div>}
            <button type="button" className="sp-out" onClick={() => { onClose(); onSignOut(); }}>خروج از حساب (فقط همین دستگاه)</button>
          </>
        )}
      </div>
    </Sheet>
  );
};
