import React from 'react';
import { Flame, Gem, Play } from 'lucide-react';
import { toPersianDigits as P } from '../utils';
import { dueOf, useVault, vaultStreak, isOpenMistake, practicedToday } from './store';
import { openVaultReview } from './launch';
import './vault.css';

/** Today page: how many vault questions are waiting for their review (nothing is shown while the vault is empty) */
export const VaultToday: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { items, ready } = useVault();
  if (!ready || !items.length) return null;
  const due = dueOf(items).length;
  const fresh = items.filter((q) => !q.tries).length;
  const open = items.filter(isOpenMistake).length;
  const streak = vaultStreak();
  const doneToday = practicedToday();
  const waiting = due || fresh;
  const text = due ? `${P(due)} سؤال سررسید مرور است` : fresh ? `${P(fresh)} سؤال هنوز مرور نشده` : open ? `${P(open)} اشتباه باز داری` : 'امروز همه‌چیز مرور شده است';
  return (
    <section className={'vt-today' + (due ? ' hot' : '')} aria-label="گنجینه سؤال">
      <button type="button" className="vt-today-body" onClick={onOpen}>
        <span className="vt-today-ic"><Gem size={20} /></span>
        <span className="vt-today-tx"><b>گنجینه سؤال</b><em>{text}{doneToday ? ` · امروز ${P(doneToday)} سؤال مرور کردی` : ''}</em></span>
        {streak > 0 && <span className="vt-streak" title="روزهای پیاپی مرور"><Flame size={15} />{P(streak)}</span>}
      </button>
      {(waiting > 0 || open > 0) && (
        <button type="button" className="vt-btn p" onClick={() => openVaultReview({ mode: waiting ? 'smart' : 'weak' })}><Play size={16} /> شروع مرور</button>
      )}
    </section>
  );
};
