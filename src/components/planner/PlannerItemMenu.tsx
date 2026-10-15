import React from 'react';
import { createPortal } from 'react-dom';
import { PERSIAN_WEEK_DAYS } from '../../jalali';
import { toPersianDigits } from '../../utils';
import { ItemRef, addDays, dateFromKey, dateKeyOf, startOfWeek, jalaliOfDate } from '../../plannerStore';
import { PlannerInteraction } from './plannerInteraction';

interface PlannerItemMenuProps {
  x: number;
  y: number;
  itemRef: ItemRef;
  refs: ItemRef[]; // what the menu acts on (the whole selection, or just this card)
  done: boolean;
  sentToReport: boolean;
  ctx: PlannerInteraction;
  onClose: () => void;
  onEdit: () => void;
  onToggleDone: () => void;
  onSendToReport?: () => void;
  onLiveStart?: () => void;
  canReorder?: boolean;
  edge?: 'first' | 'last' | 'only' | null;
}

export const PlannerItemMenu: React.FC<PlannerItemMenuProps> = ({
  x,
  y,
  itemRef,
  refs,
  done,
  sentToReport,
  ctx,
  onClose,
  onEdit,
  onToggleDone,
  onSendToReport,
  onLiveStart,
  canReorder,
  edge
}) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number }>({ left: x, top: y });
  const multi = refs.length > 1;

  // keep the menu inside the viewport
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pad = 8;
    let left = x;
    let top = y;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
    setPos({ left: Math.max(pad, left), top: Math.max(pad, top) });
  }, [x, y]);

  // close on outside click / Escape / scroll / resize
  React.useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    // scrolling inside the sheet itself (or the mobile URL bar resizing the viewport) must not close it
    const startW = window.innerWidth;
    const onScrollAway = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const onResizeAway = () => {
      if (window.innerWidth !== startW) onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResizeAway);
    window.addEventListener('scroll', onScrollAway, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResizeAway);
      window.removeEventListener('scroll', onScrollAway, true);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => { onClose(); fn(); };

  // the 7 days of the card's own week, for "move to / copy to" chips
  const weekDays = React.useMemo(() => {
    const d = dateFromKey(itemRef.key);
    if (!d) return [];
    const s = startOfWeek(d);
    return Array.from({ length: 7 }, (_, i) => {
      const dt = addDays(s, i);
      return { key: dateKeyOf(dt), label: PERSIAN_WEEK_DAYS[i], num: jalaliOfDate(dt).jd };
    });
  }, [itemRef.key]);

  const menu = (
    <div
      ref={ref}
      className="pl-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {multi && <div className="pl-menu-head">{toPersianDigits(refs.length)} مورد انتخاب‌شده</div>}

      {!multi && onLiveStart && (
        <button type="button" className="live" onClick={run(onLiveStart)}>▶ شروع زنده (تایمر این پارت)</button>
      )}
      {!multi && <button type="button" onClick={run(onEdit)}>✎ ویرایش</button>}
      {!multi && canReorder && (
        <div className="pl-menu-row">
          <button type="button" disabled={edge === 'first' || edge === 'only'} onClick={run(() => ctx.reorder(itemRef, -1))}>▲ زودتر</button>
          <button type="button" disabled={edge === 'last' || edge === 'only'} onClick={run(() => ctx.reorder(itemRef, 1))}>▼ دیرتر</button>
        </div>
      )}
      <button type="button" onClick={run(onToggleDone)}>
        {done ? '↺ برگرداندن به انجام‌نشده' : '✓ انجام شد'}
      </button>
      <button type="button" onClick={run(() => ctx.copyRefs(refs, true))}>⧉ کپی</button>
      <button type="button" onClick={run(() => ctx.cutRefs(refs, true))}>✂ برش</button>
      <button type="button" onClick={run(() => ctx.duplicate(refs, 0))}>＋ تکثیر در همین روز</button>

      <div className="pl-menu-sep" />
      <div className="pl-menu-label">انتقال به</div>
      <div className="pl-menu-days">
        {weekDays.map((d) => (
          <button
            key={d.key}
            type="button"
            className={d.key === itemRef.key ? 'here' : ''}
            disabled={d.key === itemRef.key}
            onClick={run(() => ctx.moveRefs(refs, d.key))}
            title={d.label}
          >
            <span>{d.label.slice(0, 2)}</span>
            <small>{toPersianDigits(d.num)}</small>
          </button>
        ))}
      </div>
      <div className="pl-menu-label">کپی به</div>
      <div className="pl-menu-days">
        {weekDays.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={run(() => ctx.copyRefsTo(refs, d.key))}
            title={d.label}
          >
            <span>{d.label.slice(0, 2)}</span>
            <small>{toPersianDigits(d.num)}</small>
          </button>
        ))}
      </div>
      <div className="pl-menu-row">
        <button type="button" onClick={run(() => ctx.duplicate(refs, 7))}>کپی به هفته بعد</button>
        <button type="button" onClick={run(() => ctx.moveByDays(refs, 7))}>انتقال به هفته بعد</button>
      </div>

      {!multi && onSendToReport && !sentToReport && (
        <>
          <div className="pl-menu-sep" />
          <button type="button" onClick={run(onSendToReport)}>⇥ افزودن به گزارش</button>
        </>
      )}

      <div className="pl-menu-sep" />
      <button type="button" className="danger" onClick={run(() => ctx.remove(refs))}>× حذف</button>
    </div>
  );

  return createPortal(menu, document.body);
};
