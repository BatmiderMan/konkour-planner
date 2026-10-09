import React, { useEffect, useState } from 'react';
import { MissList } from './ResultView';
import { ScanRecord } from './model';
import { listScans } from './store';
import { Modal } from './ui';
import { toPersianDigits as P } from '../utils';
import './checker.css';

/** Mistakes of one saved scan (opened from a report part). */
export const ScanViewer: React.FC<{ scanId: string; onClose: () => void }> = ({ scanId, onClose }) => {
  const [rec, setRec] = useState<ScanRecord | null | undefined>(undefined);
  useEffect(() => { listScans().then((l) => setRec(l.find((s) => s.id === scanId) || null)); }, [scanId]);
  return (
    <Modal title={rec ? `اشتباه‌های ${rec.bookTitle || 'پاسخ‌برگ'}` : 'اشتباه‌ها'} onClose={onClose}>
      {rec === undefined && <p className="ck-hint">در حال بارگذاری…</p>}
      {rec === null && <div className="ck-empty">این تصحیح دیگر در تاریخچه نیست.</div>}
      {rec && <>
        <p className="ck-hint">{P(rec.total)} سؤال، {P(rec.correct)} درست، {P(rec.wrong)} غلط، {P(rec.blank + rec.double)} نزده — {P(rec.pct)}٪</p>
        <MissList rec={rec} />
      </>}
    </Modal>
  );
};
