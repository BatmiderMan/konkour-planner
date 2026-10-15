import React from 'react';
import { ItemRef } from '../../plannerStore';

export type DropPos = 'before' | 'after';

export interface DropTarget {
  key: string;
  id: string | null; // null = "end of that day"
  pos: DropPos;
}

export type SelectMode = 'replace' | 'toggle' | 'range';

// Everything a card / day needs to be interactive. PlannerView owns the state
// and provides this; rows and days read it through usePlannerInteraction().
export interface PlannerInteraction {
  // selection
  isSelected: (key: string, id: string) => boolean;
  selectedRefs: () => ItemRef[];
  select: (ref: ItemRef, mode: SelectMode) => void;
  selectDay: (key: string) => void;

  // clipboard
  clipboardCount: number;
  isCutPending: (key: string, id: string) => boolean;
  copyRefs: (refs: ItemRef[], writeSystem?: boolean) => void;
  cutRefs: (refs: ItemRef[], writeSystem?: boolean) => void;
  pasteTo: (key: string) => void;

  // edits
  moveRefs: (refs: ItemRef[], toKey: string) => void;
  copyRefsTo: (refs: ItemRef[], toKey: string) => void;
  moveByDays: (refs: ItemRef[], days: number) => void;
  duplicate: (refs: ItemRef[], dayOffset: number) => void;
  toggleDone: (refs: ItemRef[]) => void;
  reorder: (ref: ItemRef, dir: -1 | 1) => void; // move one card earlier / later inside its day
  remove: (refs: ItemRef[]) => void;

  // drag & drop
  isDragging: () => boolean;
  isBeingDragged: (key: string, id: string) => boolean;
  startDrag: (ref: ItemRef, e: React.DragEvent) => void;
  endDrag: () => void;
  dropTarget: DropTarget | null; // for rendering highlights
  getDropTarget: () => DropTarget | null; // always-fresh value for event handlers
  setDropTarget: (t: DropTarget | null) => void;
  drop: (toKey: string, targetId: string | null, pos: DropPos, copy: boolean) => void;

  // which day "paste" / Ctrl+A / Alt+arrows act on
  activeKey: string | null;
  setActiveKey: (key: string) => void;
}

export const PlannerInteractionContext = React.createContext<PlannerInteraction | null>(null);

export function usePlannerInteraction(): PlannerInteraction | null {
  return React.useContext(PlannerInteractionContext);
}

export function wantsCopy(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.altKey || e.ctrlKey || e.metaKey;
}

// Is the pointer on the "before" or "after" half of a card? Works for the
// horizontal (desktop row, wraps, RTL-aware) and the vertical (phone) layouts.
export function dropPosition(e: React.DragEvent, el: HTMLElement): DropPos {
  const r = el.getBoundingClientRect();
  const parent = el.parentElement;
  const horizontal = !!parent && getComputedStyle(parent).flexDirection.indexOf('row') === 0;
  if (horizontal) {
    const rtl = getComputedStyle(el).direction === 'rtl';
    const frac = r.width ? (e.clientX - r.left) / r.width : 0.5;
    const before = rtl ? frac > 0.5 : frac < 0.5;
    return before ? 'before' : 'after';
  }
  const fracY = r.height ? (e.clientY - r.top) / r.height : 0.5;
  return fracY < 0.5 ? 'before' : 'after';
}

// Props to make any element a "drop onto this day (at the end)" zone.
export function getDayDropProps(ctx: PlannerInteraction | null, key: string) {
  if (!ctx) return { over: false, props: {} as React.HTMLAttributes<HTMLElement> };

  const over = !!ctx.dropTarget && ctx.dropTarget.key === key;

  const props: React.HTMLAttributes<HTMLElement> = {
    onDragOver: (e) => {
      if (!ctx.isDragging()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = wantsCopy(e) ? 'copy' : 'move';
      const t = ctx.getDropTarget();
      if (!t || t.key !== key) ctx.setDropTarget({ key, id: null, pos: 'after' });
    },
    onDragLeave: (e) => {
      if (!ctx.isDragging()) return;
      const next = e.relatedTarget as Node | null;
      if (next && (e.currentTarget as HTMLElement).contains(next)) return;
      const t = ctx.getDropTarget();
      if (t && t.key === key) ctx.setDropTarget(null);
    },
    onDrop: (e) => {
      if (!ctx.isDragging()) return;
      e.preventDefault();
      const t = ctx.getDropTarget();
      ctx.drop(key, t && t.key === key ? t.id : null, t && t.key === key ? t.pos : 'after', wantsCopy(e));
    }
  };
  return { over, props };
}
