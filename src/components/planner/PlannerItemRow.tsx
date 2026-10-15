import React from 'react';
import { BookType, PlannerItem } from '../../types';
import { DaySlot } from '../../plannerSchedule';
import { toPersianDigits } from '../../utils';
import { gradeColor, hashColor, sourceTypeLabel } from '../../plannerStore';
import { dropPosition, usePlannerInteraction, wantsCopy } from './plannerInteraction';
import { PlannerItemMenu } from './PlannerItemMenu';
import { requestLiveStart, useLivePlan } from '../../livePlan';

interface PlannerItemRowProps {
  item: PlannerItem;
  dateKey?: string; // the day this card lives in (enables drag / select / menu)
  sourceColors: Record<string, string>;
  sourceTypes?: Record<string, BookType>;
  slot?: DaySlot; // timed slot (only when the day's timeline is on)
  edge?: 'first' | 'last' | 'only' | null; // position in the day, to disable ▲ / ▼
  onToggleDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSendToReport?: () => void;
}

export const PlannerItemRow: React.FC<PlannerItemRowProps> = ({
  item,
  dateKey,
  sourceColors,
  sourceTypes,
  slot,
  edge,
  onToggleDone,
  onEdit,
  onDelete,
  onSendToReport
}) => {
  const ctx = usePlannerInteraction();
  const interactive = !!ctx && !!dateKey;
  const live = useLivePlan();
  const isLive = !!live && !!dateKey && live.dateKey === dateKey && live.item.id === item.id;
  const canLive = !!dateKey && !item.sentToReport && !isLive;

  const handleLiveStart = () => {
    if (dateKey) requestLiveStart(dateKey, item);
  };

  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);
  const closeMenu = React.useCallback(() => setMenu(null), []);

  const style: React.CSSProperties & Record<string, string> = {
    '--c': gradeColor(item.grade)
  };
  if (item.source) {
    style['--src'] = sourceColors[item.source] || hashColor(item.source);
  }

  const selected = interactive && ctx!.isSelected(dateKey!, item.id);
  const dragging = interactive && ctx!.isBeingDragged(dateKey!, item.id);
  const cutPending = interactive && ctx!.isCutPending(dateKey!, item.id);
  const dt = interactive ? ctx!.dropTarget : null;
  const dropMark = dt && dt.key === dateKey && dt.id === item.id ? ' drop-' + dt.pos : '';

  const cls =
    'pl-item' +
    (item.done ? ' done' : '') +
    (isLive ? ' live' : '') +
    (item.source ? ' has-src' : '') +
    (slot ? ' timed' : '') +
    (slot && slot.overflow ? ' overflow' : '') +
    (slot && slot.clash ? ' clash' : '') +
    (interactive ? ' interactive' : '') +
    (selected ? ' selected' : '') +
    (dragging ? ' dragging' : '') +
    (cutPending ? ' cut-pending' : '') +
    dropMark;

  const handleClick = (e: React.MouseEvent) => {
    if (!interactive) return;
    if ((e.target as HTMLElement).closest('.pl-chk, .pl-item-actions')) return;
    // touch screens: a plain tap must not start a selection (it popped up the selection bar
    // while scrolling); once something is selected (via the ⋯ sheet) taps toggle cards
    const touchOnly = typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;
    if (touchOnly) {
      if (ctx!.selectedRefs().length === 0) return;
      ctx!.setActiveKey(dateKey!);
      ctx!.select({ key: dateKey!, id: item.id }, 'toggle');
      return;
    }
    ctx!.setActiveKey(dateKey!);
    ctx!.select(
      { key: dateKey!, id: item.id },
      e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'replace'
    );
  };

  const openMenuAt = (x: number, y: number) => {
    if (!interactive) return;
    ctx!.setActiveKey(dateKey!);
    if (!ctx!.isSelected(dateKey!, item.id)) ctx!.select({ key: dateKey!, id: item.id }, 'replace');
    setMenu({ x, y });
  };

  const menuRefs = () => {
    const sel = ctx!.selectedRefs();
    const me = { key: dateKey!, id: item.id };
    return sel.some((r) => r.key === me.key && r.id === me.id) ? sel : [me];
  };

  return (
    <>
      <div
        className={cls}
        style={style}
        draggable={interactive}
        onClick={handleClick}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('.pl-chk, .pl-item-actions')) return;
          onEdit();
        }}
        onContextMenu={(e) => {
          if (!interactive) return;
          e.preventDefault();
          openMenuAt(e.clientX, e.clientY);
        }}
        onMouseEnter={() => interactive && ctx!.setActiveKey(dateKey!)}
        onDragStart={(e) => interactive && ctx!.startDrag({ key: dateKey!, id: item.id }, e)}
        onDragEnd={() => interactive && ctx!.endDrag()}
        onDragOver={(e) => {
          if (!interactive || !ctx!.isDragging()) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = wantsCopy(e) ? 'copy' : 'move';
          const pos = dropPosition(e, e.currentTarget as HTMLElement);
          const t = ctx!.getDropTarget();
          if (!t || t.key !== dateKey || t.id !== item.id || t.pos !== pos) {
            ctx!.setDropTarget({ key: dateKey!, id: item.id, pos });
          }
        }}
        onDrop={(e) => {
          if (!interactive || !ctx!.isDragging()) return;
          e.preventDefault();
          e.stopPropagation();
          ctx!.drop(dateKey!, item.id, dropPosition(e, e.currentTarget as HTMLElement), wantsCopy(e));
        }}
      >
        <span className="pl-chk" title="انجام شد / برگشت" onClick={onToggleDone}>
          {item.done ? '✓' : ''}
        </span>
        <span className="pl-item-text">
          {slot && (
            <span
              className="pl-time-tag"
              key={slot.start + slot.end}
              title={`${toPersianDigits(slot.minutes)} دقیقه${slot.overflow ? ' — بعد از ساعت پایان روز' : ''}${slot.clash ? ' — با پارت قبلی یا یک وقفه تداخل دارد' : ''}`}
            >
              {slot.pinned ? '📌 ' : ''}{toPersianDigits(slot.start)}–{toPersianDigits(slot.end)}
            </span>
          )}
          {!slot && item.start && (
            <span className="pl-time-tag pin" title="ساعت شروع ثابت">📌 {toPersianDigits(item.start)}</span>
          )}
          {isLive && <span className="pl-live-badge"><i className="pl-live-dot" />زنده</span>}
          <span className="pl-grade-tag">{item.grade}</span>
          <span className="pl-subj">{item.subject}</span>
          {item.detail && <span className="pl-detail">{item.detail}</span>}
          {item.source && (
            <span className="pl-src-tag">
              {item.source}
              {sourceTypes && sourceTypes[item.source] && (
                <em className="pl-src-type">{sourceTypeLabel(sourceTypes[item.source])}</em>
              )}
            </span>
          )}
          {item.minutes ? <span className="pl-dur-tag" title="مدت اختصاصی این پارت">{toPersianDigits(item.minutes)}′</span> : null}
          {item.sentToReport && <span className="pl-sent-tag" title="به گزارش اضافه شد">در گزارش ✓</span>}
        </span>
        <span className="pl-item-actions">
          {canLive && (
            <button type="button" className="pl-live-btn" title="شروع زنده (تایمر اختصاصی این پارت)" aria-label="شروع زنده" onClick={handleLiveStart}>
              ▶
            </button>
          )}
          {slot && interactive && (
            <>
              <button type="button" className="pl-act-2" title="یک جایگاه بالاتر (زودتر)" disabled={edge === 'first' || edge === 'only'} onClick={() => ctx!.reorder({ key: dateKey!, id: item.id }, -1)}>▲</button>
              <button type="button" className="pl-act-2" title="یک جایگاه پایین‌تر (دیرتر)" disabled={edge === 'last' || edge === 'only'} onClick={() => ctx!.reorder({ key: dateKey!, id: item.id }, 1)}>▼</button>
            </>
          )}
          {onSendToReport && !item.sentToReport && (
            <button type="button" className="pl-act-2" title="افزودن به گزارش امروز" onClick={onSendToReport}>
              ⇥
            </button>
          )}
          <button type="button" className="pl-act-2" title="ویرایش" onClick={onEdit}>
            ✎
          </button>
          {interactive && (
            <button
              type="button"
              className="pl-more-btn"
              title="بیشتر (کپی، انتقال، تکثیر…)"
              aria-label="گزینه‌های بیشتر"
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                openMenuAt(r.left, r.bottom + 4);
              }}
            >
              ⋯
            </button>
          )}
          <button type="button" title="حذف" className="pl-del pl-act-2" onClick={onDelete}>
            ×
          </button>
        </span>
      </div>
      {menu && interactive && (
        <PlannerItemMenu
          x={menu.x}
          y={menu.y}
          itemRef={{ key: dateKey!, id: item.id }}
          refs={menuRefs()}
          done={item.done}
          sentToReport={!!item.sentToReport}
          ctx={ctx!}
          onClose={closeMenu}
          onEdit={onEdit}
          onToggleDone={() => ctx!.toggleDone(menuRefs())}
          onSendToReport={onSendToReport}
          onLiveStart={canLive ? handleLiveStart : undefined}
          canReorder={!!slot}
          edge={edge}
        />
      )}
    </>
  );
};
