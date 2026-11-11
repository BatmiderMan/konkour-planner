import React from 'react';
import { toPersianDigits as P } from '../utils';
import { useCardSheet } from './cardSheets';
import { openVirtual } from './launch';
import { countAnswered } from './model';

/**
 * A small chip on a planner / today card that has an answer sheet: «📝 ۱۲ از ۲۶» while the test is open,
 * «📝 ۷۳٪» once it was graded. Tapping opens the sheet again (the room, or its result).
 */
export const CardSheetBadge: React.FC<{ dateKey: string; itemId: string; big?: boolean }> = ({ dateKey, itemId, big }) => {
  const cs = useCardSheet(dateKey, itemId);
  if (!cs || (!cs.sheet && !cs.scan)) return null;
  const sh = cs.sheet;
  const graded = !!cs.scan && (!sh || cs.scan.at >= sh.updatedAt - 2000);
  const label = graded ? `${P(cs.scan!.pct)}٪` : sh ? (sh.state === 'open' ? `${P(countAnswered(sh.sheet.slice(0, sh.size)))} از ${P(sh.size)}` : 'ذخیره‌شده') : '';
  return (
    <button
      type="button"
      className={'ck-cardchip' + (graded ? ' done' : '') + (big ? ' big' : '')}
      title={graded ? 'نتیجه‌ی پاسخ‌برگ این پارت' : 'ادامه‌ی پاسخ‌برگ این پارت'}
      onClick={(e) => { e.stopPropagation(); openVirtual({ sheet: sh, link: { dateKey, plannerItemId: itemId }, title: sh?.title }); }}
    >
      📝 {graded ? 'پاسخ‌برگ' : sh && sh.state === 'open' ? 'ادامه‌ی پاسخ‌برگ' : 'پاسخ‌برگ'} · {label}
    </button>
  );
};
