import React, { useState } from 'react';
import { KeyBatch, parseKeyText } from './model';
import { toPersianDigits as P } from '../utils';

export const PasteKeys: React.FC<{ suggestStart: number; onAdd: (b: KeyBatch) => void }> = ({ suggestStart, onAdd }) => {
  const [text, setText] = useState(''); const [start, setStart] = useState(suggestStart); const [msg, setMsg] = useState('');
  const go = () => {
    const r = parseKeyText(text, Math.max(1, start));
    if (!r.count) { setMsg('کلیدی پیدا نشد. قالب متن را بررسی کن.'); return; }
    const ks = Object.keys(r.out).map(Number).sort((a, b) => a - b);
    onAdd({ keys: r.out, weak: [], first: ks[0] });
    setMsg(`${P(r.count)} کلید اضافه شد (${P(ks[0])} تا ${P(ks[ks.length - 1])}).`); setText('');
  };
  return (
    <div className="ck-method">
      <p className="ck-hint">متن کلید را به‌صورت خط‌های «۱۲۸۵- گزینه ۲» بچسبان؛ یا فقط رقم‌های ۱ تا ۴ را پشت سر هم بنویس و شماره‌ی اولین سؤال را بده. رقم فارسی هم قبول است.</p>
      <textarea className="ck-text" dir="ltr" value={text} onChange={(e) => setText(e.target.value)} placeholder={'1301- گزینه 2\n1302- گزینه 4\n…   یا   2 3 4 3 4 2 1 1 …'} />
      <div className="ck-row">
        <label className="ck-field"><span>شماره‌ی اولین سؤال (برای حالت فقط رقم)</span><input type="number" min={1} value={start} onChange={(e) => setStart(parseInt(e.target.value, 10) || 1)} /></label>
        <button type="button" className="ck-btn primary" onClick={go} disabled={!text.trim()}>افزودن کلیدها</button>
        {msg && <span className="ck-hint" role="status">{msg}</span>}
      </div>
    </div>
  );
};
