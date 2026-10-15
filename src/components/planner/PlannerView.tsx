import React from 'react';
import { PlannerData, PlannerGrade, PlannerItem } from '../../types';
import {
  PLANNER_GRADES,
  PlannerItemInput,
  ItemRef,
  EditResult,
  loadPlannerData,
  savePlannerData,
  normalizePlannerData,
  reportMetaFor,
  reorderWithinDay,
  SendMeta,
  createPlannerItem,
  insertByPin,
  startOfWeek,
  addDays,
  anchorFromDate,
  monthLenFromAnchor,
  dateKeyOf,
  resolveRefs,
  moveOrCopyItems,
  duplicateItems,
  moveItemsByDays,
  insertItems,
  removeItems,
  toggleDoneItems,
  serializeItems,
  parseClipboardItems,
  PLAN_PATCH_EVENT,
  hashColor,
  todayGregorian,
  jalaliOfDate
} from '../../plannerStore';
import { PERSIAN_MONTH_NAMES } from '../../jalali';
import { newRestId } from '../../plannerSchedule';
import { ParsedEntry } from '../../plannerNlp';
import { PlannerQuickAdd } from './PlannerQuickAdd';
import { toPersianDigits } from '../../utils';
import {
  DropPos,
  DropTarget,
  PlannerInteraction,
  PlannerInteractionContext,
  SelectMode
} from './plannerInteraction';
import { PlannerWeekView } from './PlannerWeekView';
import { PlannerMonthView } from './PlannerMonthView';
import { PlannerSettingsView } from './PlannerSettingsView';
import { alertDialog } from '../../dialog';

interface PlannerViewProps {
  onSendToReport: (dateKey: string, item: PlannerItem, meta?: SendMeta) => void;
}

type SubView = 'week' | 'month' | 'settings';

export const PlannerView: React.FC<PlannerViewProps> = ({ onSendToReport }) => {
  const [data, setData] = React.useState<PlannerData>(() => loadPlannerData());
  const [subView, setSubView] = React.useState<SubView>('week');
  const [cursor, setCursor] = React.useState<Date>(() => startOfWeek(new Date()));
  const [monthAnchor, setMonthAnchor] = React.useState<Date>(() => anchorFromDate(new Date()));
  const [selectedDate, setSelectedDate] = React.useState<Date>(() => new Date(new Date().setHours(0, 0, 0, 0)));
  const [search, setSearch] = React.useState('');
  const [gradeFilter, setGradeFilter] = React.useState<'all' | PlannerGrade>('all');

  const saveTimer = React.useRef<any>(null);
  const dataRef = React.useRef<PlannerData>(data);
  const pastRef = React.useRef<PlannerData[]>([]);
  const futureRef = React.useRef<PlannerData[]>([]);
  const [, setHistVer] = React.useState(0);

  const persist = React.useCallback((next: PlannerData, opts?: { noHistory?: boolean }) => {
    if (!opts || !opts.noHistory) {
      pastRef.current.push(dataRef.current);
      if (pastRef.current.length > 80) pastRef.current.shift();
      futureRef.current = [];
    }
    dataRef.current = next;
    setData(next);
    setHistVer((v) => v + 1);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePlannerData(next), 250);
  }, []);

  // make sure the last edit is written even if the user leaves right away
  React.useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      savePlannerData(dataRef.current);
    };
  }, []);

  // a card was changed from outside (live timer finished): mirror it into our state
  React.useEffect(() => {
    const onPatch = (e: Event) => {
      const d = (e as CustomEvent).detail as { dateKey: string; itemId: string; patch: Partial<PlannerItem> };
      if (!d) return;
      const cur = dataRef.current;
      const list = cur.items[d.dateKey];
      if (!list) return;
      persist(
        { ...cur, items: { ...cur.items, [d.dateKey]: list.map((it) => (it.id === d.itemId ? { ...it, ...d.patch } : it)) } },
        { noHistory: true }
      );
    };
    window.addEventListener(PLAN_PATCH_EVENT, onPatch);
    return () => window.removeEventListener(PLAN_PATCH_EVENT, onPatch);
  }, [persist]);

  // ---------- interaction state: selection, clipboard, drag, toast ----------
  const sameRef = (a: ItemRef, b: ItemRef) => a.key === b.key && a.id === b.id;

  const [selection, setSelectionState] = React.useState<ItemRef[]>([]);
  const selRef = React.useRef<ItemRef[]>([]);
  const setSelection = (refs: ItemRef[]) => {
    selRef.current = refs;
    setSelectionState(refs);
  };

  interface Clip { items: PlannerItem[]; cut: ItemRef[] | null }
  const [clip, setClipState] = React.useState<Clip | null>(null);
  const clipRef = React.useRef<Clip | null>(null);
  const setClip = (c: Clip | null) => {
    clipRef.current = c;
    setClipState(c);
  };

  const [activeKeyState, setActiveKeyState] = React.useState<string | null>(null);
  const activeKeyRef = React.useRef<string | null>(null);
  const setActiveKey = (key: string) => {
    if (activeKeyRef.current === key) return;
    activeKeyRef.current = key;
    setActiveKeyState(key);
  };

  const dragRefsRef = React.useRef<ItemRef[] | null>(null);
  const [dragRefs, setDragRefs] = React.useState<ItemRef[] | null>(null);
  const dropTargetRef = React.useRef<DropTarget | null>(null);
  const [dropTarget, setDropTargetState] = React.useState<DropTarget | null>(null);
  const setDropTarget = (t: DropTarget | null) => {
    const c = dropTargetRef.current;
    if (c === t || (c && t && c.key === t.key && c.id === t.id && c.pos === t.pos)) return;
    dropTargetRef.current = t;
    setDropTargetState(t);
  };

  const [toast, setToast] = React.useState<{ id: number; msg: string; undo: boolean } | null>(null);
  const toastTimer = React.useRef<any>(null);
  const showToast = (msg: string, withUndo = false) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), msg, undo: withUndo });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  };
  React.useEffect(() => () => clearTimeout(toastTimer.current), []);

  const [showHelp, setShowHelp] = React.useState(false);

  const isSettings = subView === 'settings';
  const selectedKey = dateKeyOf(selectedDate);
  const quickDefaultDate = (() => {
    if (subView === 'month') return selectedDate;
    const t = todayGregorian();
    return t >= cursor && t < addDays(cursor, 7) ? t : cursor;
  })();

  const addItem = (dateKey: string, item: PlannerItemInput) => {
    const next: PlannerData = { ...data, items: { ...data.items }, sourceColors: { ...data.sourceColors }, sourceTypes: { ...data.sourceTypes }, timeline: { ...data.timeline } };
    const list = next.items[dateKey] ? [...next.items[dateKey]] : [];
    next.items[dateKey] = insertByPin(list, createPlannerItem(item), dateKey, next);
    if (item.start) next.timeline[dateKey] = true;
    if (item.source && item.sourceColor) {
      next.sourceColors[item.source] = item.sourceColor;
    }
    if (item.source && item.sourceType) {
      next.sourceTypes[item.source] = item.sourceType;
    }
    persist(next);
  };

  // ---------- smart quick-add (free Persian sentences -> cards / interruptions) ----------
  const commitEntries = (entries: ParsedEntry[]) => {
    const next: PlannerData = {
      ...dataRef.current,
      items: { ...dataRef.current.items },
      sourceColors: { ...dataRef.current.sourceColors },
      sourceTypes: { ...dataRef.current.sourceTypes },
      timeline: { ...dataRef.current.timeline },
      dayRests: { ...dataRef.current.dayRests }
    };
    let cards = 0;
    let rests = 0;
    entries.forEach((e) => {
      if (e.error) return;
      if (e.kind === 'rest' && e.start && e.end) {
        next.dayRests[e.dateKey] = [...(next.dayRests[e.dateKey] || []), { id: newRestId(), label: e.label || 'استراحت', icon: e.icon || '☕', start: e.start, end: e.end }];
        next.timeline[e.dateKey] = true;
        rests++;
        return;
      }
      const subject = e.subject || 'سایر';
      const src = e.source;
      const item = createPlannerItem({
        subject,
        detail: e.detail,
        grade: (e.grade || 'دوازدهم') as PlannerGrade,
        source: src,
        minutes: e.minutes,
        start: e.start
      });
      next.items[e.dateKey] = insertByPin(next.items[e.dateKey] || [], item, e.dateKey, next);
      if (e.start) next.timeline[e.dateKey] = true;
      if (src && !next.sourceColors[src]) next.sourceColors[src] = hashColor(src);
      cards++;
    });
    if (!cards && !rests) return;
    persist(next);
    const first = entries.find((x) => !x.error);
    if (first) {
      setCursor(startOfWeek(first.date));
      setSubView((v) => (v === 'settings' ? 'week' : v));
      setSelectedDate(first.date);
    }
    showToast(
      [cards ? `${toPersianDigits(cards)} پارت` : '', rests ? `${toPersianDigits(rests)} وقفه` : ''].filter(Boolean).join(' و ') + ' اضافه شد',
      true
    );
  };

  const addRest = (dateKey: string, r: { label: string; icon: string; start: string; end: string }) => {
    const cur = dataRef.current;
    persist({
      ...cur,
      timeline: { ...cur.timeline, [dateKey]: true },
      dayRests: { ...cur.dayRests, [dateKey]: [...(cur.dayRests[dateKey] || []), { id: newRestId(), ...r }] }
    });
  };
  const removeRest = (dateKey: string, id: string) => {
    const cur = dataRef.current;
    const list = (cur.dayRests[dateKey] || []).filter((x) => x.id !== id);
    const dayRests = { ...cur.dayRests };
    if (list.length) dayRests[dateKey] = list;
    else delete dayRests[dateKey];
    persist({ ...cur, dayRests });
  };

  const updateItem = (dateKey: string, id: string, item: PlannerItemInput) => {
    const next: PlannerData = { ...data, items: { ...data.items }, sourceColors: { ...data.sourceColors }, sourceTypes: { ...data.sourceTypes }, timeline: { ...data.timeline } };
    let moved: PlannerItem | null = null;
    let list = (next.items[dateKey] || []).map((it) => {
      if (it.id !== id) return it;
      const upd: PlannerItem = { ...it, subject: item.subject, detail: item.detail, grade: item.grade, source: item.source };
      if (item.minutes) upd.minutes = item.minutes;
      else delete upd.minutes;
      if (item.start) upd.start = item.start;
      else delete upd.start;
      if (item.start && item.start !== it.start) moved = upd;
      return upd;
    });
    if (moved) {
      // a newly pinned time puts the card at its chronological place
      const m: PlannerItem = moved;
      list = insertByPin(list.filter((x) => x.id !== id), m, dateKey, next);
      next.timeline[dateKey] = true;
    }
    next.items[dateKey] = list;
    if (item.source && item.sourceColor) {
      next.sourceColors[item.source] = item.sourceColor;
    }
    if (item.source && item.sourceType) {
      next.sourceTypes[item.source] = item.sourceType;
    }
    persist(next);
  };

  const toggleDone = (dateKey: string, id: string) => {
    const next: PlannerData = { ...data, items: { ...data.items } };
    next.items[dateKey] = (next.items[dateKey] || []).map((it) => (it.id === id ? { ...it, done: !it.done } : it));
    persist(next);
  };

  const deleteItem = (dateKey: string, id: string) => {
    removeRefs([{ key: dateKey, id }]);
  };

  const sendToReport = (dateKey: string, item: PlannerItem) => {
    // work out the time slot + book type from the live data (before the flag changes anything)
    const meta = reportMetaFor(dataRef.current, dateKey, item);
    const next: PlannerData = { ...data, items: { ...data.items } };
    next.items[dateKey] = (next.items[dateKey] || []).map((it) => (it.id === item.id ? { ...it, sentToReport: true } : it));
    persist(next);
    onSendToReport(dateKey, item, meta);
  };

  const clearDoneWeek = () => {
    const days = Array.from({ length: 7 }, (_, i) => dateKeyOf(addDays(cursor, i)));
    let removed = 0;
    const next: PlannerData = { ...data, items: { ...data.items } };
    days.forEach((k) => {
      const before = (next.items[k] || []).length;
      next.items[k] = (next.items[k] || []).filter((x) => !x.done);
      removed += before - next.items[k].length;
    });
    if (!removed) { alertDialog('مورد انجام‌شده‌ای در این هفته نیست'); return; }
    persist(next);
  };

  const clearDoneDay = () => {
    const before = (data.items[selectedKey] || []).length;
    const next: PlannerData = { ...data, items: { ...data.items } };
    next.items[selectedKey] = (next.items[selectedKey] || []).filter((x) => !x.done);
    if ((next.items[selectedKey] || []).length === before) { alertDialog('مورد انجام‌شده‌ای در این روز نیست'); return; }
    persist(next);
  };

  // ---------- timeline (timed day) ----------
  const setTimeline = (dateKey: string, on: boolean) => {
    const timeline = { ...dataRef.current.timeline };
    if (on) timeline[dateKey] = true;
    else delete timeline[dateKey];
    persist({ ...dataRef.current, timeline });
  };
  const setWeekTimeline = (on: boolean) => {
    const timeline = { ...dataRef.current.timeline };
    for (let i = 0; i < 7; i++) {
      const k = dateKeyOf(addDays(cursor, i));
      if (on) timeline[k] = true;
      else delete timeline[k];
    }
    persist({ ...dataRef.current, timeline });
  };

  // ---------- undo / redo ----------
  const applySnapshot = (snap: PlannerData) => {
    dataRef.current = snap;
    setData(snap);
    setHistVer((v) => v + 1);
    setSelection([]);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePlannerData(snap), 250);
  };
  const undo = () => {
    const prev = pastRef.current.pop();
    if (!prev) { showToast('چیزی برای بازگردانی نیست'); return; }
    futureRef.current.push(dataRef.current);
    applySnapshot(prev);
    showToast('بازگردانی شد');
  };
  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) { showToast('چیزی برای تکرار نیست'); return; }
    pastRef.current.push(dataRef.current);
    applySnapshot(next);
    showToast('دوباره انجام شد');
  };

  // ---------- card operations (all go through history, so all are undoable) ----------
  const applyEdit = (res: EditResult, msg: string, reselect = true) => {
    if (!res.changed) return;
    persist(res.data);
    if (reselect) setSelection(res.newRefs);
    showToast(msg, true);
  };
  const n = (count: number) => toPersianDigits(count);

  const moveRefs = (refs: ItemRef[], toKey: string) => {
    const res = moveOrCopyItems(dataRef.current, refs, toKey, null, false);
    applyEdit(res, `${n(res.newRefs.length)} مورد منتقل شد`);
  };
  const copyRefsTo = (refs: ItemRef[], toKey: string) => {
    const res = moveOrCopyItems(dataRef.current, refs, toKey, null, true);
    applyEdit(res, `${n(res.newRefs.length)} مورد کپی شد`);
  };
  const moveByDays = (refs: ItemRef[], days: number) => {
    const res = moveItemsByDays(dataRef.current, refs, days);
    applyEdit(res, `${n(res.newRefs.length)} مورد منتقل شد`);
  };
  const duplicate = (refs: ItemRef[], dayOffset: number) => {
    const res = duplicateItems(dataRef.current, refs, dayOffset);
    applyEdit(res, dayOffset === 0 ? `${n(res.newRefs.length)} مورد تکثیر شد` : `${n(res.newRefs.length)} مورد به هفته بعد کپی شد`);
  };
  const reorder = (ref: ItemRef, dir: -1 | 1) => {
    const res = reorderWithinDay(dataRef.current, ref, dir);
    if (!res.changed) return;
    persist(res.data);
  };
  const toggleDoneRefs = (refs: ItemRef[]) => {
    const res = toggleDoneItems(dataRef.current, refs);
    if (!res.changed) return;
    persist(res.data);
  };
  const removeRefs = (refs: ItemRef[]) => {
    const res = removeItems(dataRef.current, refs);
    if (!res.changed) return;
    persist(res.data);
    setSelection(selRef.current.filter((s) => !refs.some((r) => sameRef(r, s))));
    showToast(`${n(refs.length)} مورد حذف شد`, true);
  };

  // ---------- clipboard ----------
  const writeSystemClipboard = (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
    } catch (e) {
      // clipboard blocked — the in-app clipboard still works
    }
  };
  const copyRefs = (refs: ItemRef[], writeSystem = false) => {
    const res = resolveRefs(dataRef.current, refs);
    if (!res.length) return;
    const items = res.map((r) => r.item);
    setClip({ items, cut: null });
    if (writeSystem) writeSystemClipboard(serializeItems(items));
    showToast(`${n(items.length)} مورد کپی شد — روی یک روز بروید و Ctrl+V بزنید`);
  };
  const cutRefs = (refs: ItemRef[], writeSystem = false) => {
    const res = resolveRefs(dataRef.current, refs);
    if (!res.length) return;
    const items = res.map((r) => r.item);
    setClip({ items, cut: res.map((r) => r.ref) });
    if (writeSystem) writeSystemClipboard(serializeItems(items));
    showToast(`${n(items.length)} مورد برش خورد — روی یک روز بروید و Ctrl+V بزنید`);
  };
  const doPaste = (key: string, templates: PlannerItem[], cutSources: ItemRef[] | null) => {
    const cur = dataRef.current;
    if (cutSources && resolveRefs(cur, cutSources).length === cutSources.length) {
      const res = moveOrCopyItems(cur, cutSources, key, null, false);
      setClip(null);
      applyEdit(res, `${n(res.newRefs.length)} مورد منتقل شد`);
      return;
    }
    if (cutSources) setClip(null);
    const res = insertItems(cur, key, templates, null);
    applyEdit(res, `${n(res.newRefs.length)} مورد چسبانده شد`);
  };
  const defaultPasteKey = (): string => {
    const today = dateKeyOf(new Date());
    const inWeek = Array.from({ length: 7 }, (_, i) => dateKeyOf(addDays(cursor, i))).indexOf(today) >= 0;
    return inWeek ? today : dateKeyOf(cursor);
  };
  const pasteKey = (): string | null => {
    if (subView === 'month') return selectedKey;
    if (subView === 'week') return activeKeyRef.current || defaultPasteKey();
    return null;
  };
  const pasteTo = (key: string) => {
    const c = clipRef.current;
    if (!c) { showToast('چیزی برای چسباندن نیست — اول یک پارت را کپی کنید'); return; }
    doPaste(key, c.items, c.cut);
  };

  // ---------- selection ----------
  const select = (ref: ItemRef, mode: SelectMode) => {
    const cur = selRef.current;
    const has = cur.some((r) => sameRef(r, ref));
    if (mode === 'toggle') {
      setSelection(has ? cur.filter((r) => !sameRef(r, ref)) : [...cur, ref]);
      return;
    }
    if (mode === 'range') {
      const anchor = cur.length ? cur[cur.length - 1] : null;
      if (anchor && anchor.key === ref.key) {
        const list = dataRef.current.items[ref.key] || [];
        const a = list.findIndex((x) => x.id === anchor.id);
        const b = list.findIndex((x) => x.id === ref.id);
        if (a >= 0 && b >= 0) {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          setSelection(list.slice(lo, hi + 1).map((x) => ({ key: ref.key, id: x.id })));
          return;
        }
      }
      setSelection([ref]);
      return;
    }
    setSelection(cur.length === 1 && has ? [] : [ref]);
  };
  const selectDay = (key: string) => {
    setSelection((dataRef.current.items[key] || []).map((x) => ({ key, id: x.id })));
  };

  // ---------- drag & drop ----------
  const navTimer = React.useRef<any>(null);
  const stopNavHover = () => {
    clearTimeout(navTimer.current);
    navTimer.current = null;
  };
  React.useEffect(() => () => stopNavHover(), []);

  // hovering a dragged card over the prev/next buttons flips the page, so a card
  // can be carried to another week/month
  const hoverNav = (dir: 1 | -1) => {
    if (!dragRefsRef.current) return;
    stopNavHover();
    const step = () => {
      if (subView === 'month') {
        setMonthAnchor((a) => (dir < 0 ? anchorFromDate(addDays(a, -1)) : anchorFromDate(addDays(a, monthLenFromAnchor(a)))));
      } else {
        setCursor((c) => addDays(c, 7 * dir));
      }
    };
    const tick = () => {
      step();
      navTimer.current = setTimeout(tick, 900);
    };
    navTimer.current = setTimeout(tick, 550);
  };

  const startDrag = (ref: ItemRef, e: React.DragEvent) => {
    e.stopPropagation();
    let refs = selRef.current;
    if (!refs.some((r) => sameRef(r, ref))) {
      refs = [ref];
      setSelection(refs);
    }
    dragRefsRef.current = refs;
    const res = resolveRefs(dataRef.current, refs);
    try {
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('text/plain', res.map((r) => r.item.subject + (r.item.detail ? ' — ' + r.item.detail : '')).join('\n'));
      if (refs.length > 1) {
        const badge = document.createElement('div');
        badge.className = 'pl-drag-badge';
        badge.textContent = n(refs.length) + ' مورد';
        document.body.appendChild(badge);
        e.dataTransfer.setDragImage(badge, 16, 16);
        setTimeout(() => badge.remove(), 0);
      }
    } catch (err) {
      // some browsers restrict dataTransfer — dragging still works via the ref
    }
    // set the "being dragged" look after the browser has taken its drag snapshot
    setTimeout(() => {
      if (dragRefsRef.current) setDragRefs(dragRefsRef.current);
    }, 0);
  };
  const endDrag = () => {
    dragRefsRef.current = null;
    setDragRefs(null);
    setDropTarget(null);
    stopNavHover();
  };
  const drop = (toKey: string, targetId: string | null, pos: DropPos, copy: boolean) => {
    const refs = dragRefsRef.current;
    endDrag();
    if (!refs) return;
    let index: number | null = null;
    if (targetId) {
      const list = dataRef.current.items[toKey] || [];
      const i = list.findIndex((x) => x.id === targetId);
      if (i >= 0) index = i + (pos === 'after' ? 1 : 0);
    }
    const res = moveOrCopyItems(dataRef.current, refs, toKey, index, copy);
    applyEdit(res, copy ? `${n(res.newRefs.length)} مورد کپی شد` : `${n(res.newRefs.length)} مورد منتقل شد`);
  };

  // ---------- keyboard + system clipboard ----------
  const isEditable = (t: EventTarget | null): boolean => {
    const el = t as HTMLElement | null;
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
  };

  React.useEffect(() => {
    if (subView === 'settings') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      // e.code (not e.key) so shortcuts also work on the Persian keyboard layout
      if (mod && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
      if (mod && e.code === 'KeyD') {
        if (selRef.current.length) { e.preventDefault(); duplicate(selRef.current, 0); }
        return;
      }
      if (mod && e.code === 'KeyA') {
        const key = pasteKey();
        if (key) { e.preventDefault(); selectDay(key); }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selRef.current.length) { e.preventDefault(); removeRefs(selRef.current); }
        return;
      }
      if (e.key === 'Escape') {
        if (selRef.current.length) setSelection([]);
        return;
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && selRef.current.length) {
        e.preventDefault();
        moveByDays(selRef.current, e.key === 'ArrowUp' ? -1 : 1);
      }
    };

    const onCopyCut = (isCut: boolean) => (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.toString()) return; // the user is copying page text — leave it alone
      const res = resolveRefs(dataRef.current, selRef.current);
      if (!res.length) return;
      e.preventDefault();
      if (e.clipboardData) e.clipboardData.setData('text/plain', serializeItems(res.map((r) => r.item)));
      if (isCut) cutRefs(selRef.current, false);
      else copyRefs(selRef.current, false);
    };
    const onCopy = onCopyCut(false);
    const onCut = onCopyCut(true);

    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      const key = pasteKey();
      if (!key) return;
      const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      const parsed = parseClipboardItems(text);
      const c = clipRef.current;
      if (parsed) {
        e.preventDefault();
        if (c && c.cut && serializeItems(c.items) === text) doPaste(key, c.items, c.cut);
        else doPaste(key, parsed, null);
      } else if (c && !text.trim()) {
        e.preventDefault();
        doPaste(key, c.items, c.cut);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  });

  // copy the whole visible week onto the next week (weekly templates!)
  const repeatWeek = () => {
    const refs: ItemRef[] = [];
    for (let i = 0; i < 7; i++) {
      const key = dateKeyOf(addDays(cursor, i));
      (dataRef.current.items[key] || []).forEach((it) => refs.push({ key, id: it.id }));
    }
    if (!refs.length) { showToast('این هفته خالی است'); return; }
    const res = duplicateItems(dataRef.current, refs, 7);
    applyEdit(res, `${n(res.newRefs.length)} مورد به هفته بعد کپی شد`);
    setCursor(addDays(cursor, 7));
  };

  const interaction: PlannerInteraction = {
    isSelected: (key, id) => selection.some((r) => r.key === key && r.id === id),
    selectedRefs: () => selRef.current,
    select,
    selectDay,
    clipboardCount: clip ? clip.items.length : 0,
    isCutPending: (key, id) => !!clip && !!clip.cut && clip.cut.some((r) => r.key === key && r.id === id),
    copyRefs,
    cutRefs,
    pasteTo,
    moveRefs,
    copyRefsTo,
    moveByDays,
    duplicate,
    toggleDone: toggleDoneRefs,
    reorder,
    remove: removeRefs,
    isDragging: () => !!dragRefsRef.current,
    isBeingDragged: (key, id) => !!dragRefs && dragRefs.some((r) => r.key === key && r.id === id),
    startDrag,
    endDrag,
    dropTarget,
    getDropTarget: () => dropTargetRef.current,
    setDropTarget,
    drop,
    activeKey: subView === 'month' ? selectedKey : activeKeyState,
    setActiveKey
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'konkur-planner-backup.json';
    a.click();
  };

  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  const importBackup = () => importInputRef.current?.click();
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const next: PlannerData = normalizePlannerData(parsed, data.subjects);
        persist(next);
      } catch {
        alertDialog('فایل معتبر نیست');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const navStep = (dir: 1 | -1) => {
    if (subView === 'month') setMonthAnchor((a) => (dir < 0 ? anchorFromDate(addDays(a, -1)) : anchorFromDate(addDays(a, monthLenFromAnchor(a)))));
    else setCursor((c) => addDays(c, 7 * dir));
  };
  const goToday = () => {
    if (subView === 'month') { setMonthAnchor(anchorFromDate(new Date())); setSelectedDate(new Date(new Date().setHours(0, 0, 0, 0))); }
    else setCursor(startOfWeek(new Date()));
  };
  const navTitle = (() => {
    if (subView === 'month') { const j = jalaliOfDate(monthAnchor); return `${PERSIAN_MONTH_NAMES[j.jm - 1]} ${toPersianDigits(j.jy)}`; }
    const f = jalaliOfDate(cursor); const l = jalaliOfDate(addDays(cursor, 6));
    return `${toPersianDigits(f.jd)} ${PERSIAN_MONTH_NAMES[f.jm - 1]} – ${toPersianDigits(l.jd)} ${PERSIAN_MONTH_NAMES[l.jm - 1]}`;
  })();
  const weekAllTimeline = Array.from({ length: 7 }, (_, i) => dateKeyOf(addDays(cursor, i))).every((k) => !!data.timeline[k]);
  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  return (
    <PlannerInteractionContext.Provider value={interaction}>
    <div
      className="planner-wrap"
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (selRef.current.length && !t.closest('.pl-item, .pl-menu, .pl-selbar, .pl-form, button, input, select, textarea, .pl-mcell')) {
          setSelection([]);
        }
      }}
    >
      <input type="file" ref={importInputRef} accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />

      <div className="pl-topbar">
      <div className="pl-view-tabs" role="tablist">
        <button type="button" className={subView === 'week' ? 'active' : ''} onClick={() => setSubView('week')}>هفته</button>
        <button type="button" className={subView === 'month' ? 'active' : ''} onClick={() => setSubView('month')}>ماه</button>
        <button type="button" className={subView === 'settings' ? 'active' : ''} onClick={() => setSubView('settings')}>تنظیمات</button>
      </div>
        {!isSettings && (
          <div className="pl-nav" role="group" aria-label="پیمایش">
            <button type="button" onClick={() => navStep(-1)} onDragEnter={() => hoverNav(-1)} onDragLeave={stopNavHover} aria-label="قبل">›</button>
            <button type="button" className="pl-today-btn" onClick={goToday}>امروز</button>
            <button type="button" onClick={() => navStep(1)} onDragEnter={() => hoverNav(1)} onDragLeave={stopNavHover} aria-label="بعد">‹</button>
            <span className="pl-nav-title">{navTitle}</span>
          </div>
        )}
        {subView === 'week' && (
          <div className="pl-topbar-tools">
            <button type="button" className={weekAllTimeline ? 'on' : ''} onClick={() => setWeekTimeline(!weekAllTimeline)} title="نمایش / پنهان کردن ساعت‌بندی همه‌ی روزها">⏱<span>ساعت‌بندی</span></button>
            <button type="button" onClick={repeatWeek} title="همه‌ی پارت‌های این هفته را به هفته بعد کپی کن">⧉<span>تکرار هفته</span></button>
          </div>
        )}
      </div>

      {!isSettings && <PlannerQuickAdd data={data} defaultDate={quickDefaultDate} onCommit={commitEntries} />}

      {!isSettings && (
      <div className="pl-toolbar">
        <input
          className="pl-search"
          type="text"
          placeholder="جستجو: درس، مبحث، منبع…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="pl-filter-pills">
          <button type="button" className={gradeFilter === 'all' ? 'active' : ''} onClick={() => setGradeFilter('all')}>همه</button>
          {PLANNER_GRADES.map((g) => (
            <button
              key={g.id}
              type="button"
              className={gradeFilter === g.id ? 'active' : ''}
              onClick={() => setGradeFilter(g.id)}
            >
              {g.id}
            </button>
          ))}
        </div>
        <div className="pl-toolbar-actions">
          <button type="button" onClick={undo} disabled={!canUndo} title="بازگردانی (Ctrl+Z)">↶</button>
          <button type="button" onClick={redo} disabled={!canRedo} title="تکرار (Ctrl+Shift+Z)">↷</button>
          <button type="button" className={showHelp ? 'on' : ''} onClick={() => setShowHelp((v) => !v)} title="راهنمای میانبرها">؟</button>
          {(
            <button
              type="button"
              onClick={subView === 'month' ? clearDoneDay : clearDoneWeek}
              title={subView === 'month' ? 'حذف موارد انجام‌شده روز انتخاب‌شده' : 'حذف موارد انجام‌شده این هفته'}
            >
              ✓ پاک‌سازی {subView === 'month' ? 'روز' : ''}
            </button>
          )}
        </div>
      </div>
      )}

      {!isSettings && showHelp && (
        <div className="pl-help">
          <div><b>کشیدن و رها کردن:</b> پارت را روی روز دیگر یا بین پارت‌ها بکشید. هنگام رها کردن <kbd>Alt</kbd> (یا <kbd>Ctrl</kbd>) را نگه دارید تا کپی شود.</div>
          <div><b>انتخاب:</b> کلیک = یک پارت · <kbd>Ctrl</kbd>+کلیک = چندتایی · <kbd>Shift</kbd>+کلیک = بازه. چند پارت انتخاب‌شده را با هم بکشید.</div>
          <div><b>کپی / برش / چسباندن:</b> <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> — روی روزی که موس روی آن است چسبانده می‌شود (حتی بین دو تب).</div>
          <div><b>تکثیر:</b> <kbd>Ctrl</kbd>+<kbd>D</kbd> · <b>حذف:</b> <kbd>Delete</kbd> · <b>انتخاب همه‌ی روز:</b> <kbd>Ctrl</kbd>+<kbd>A</kbd></div>
          <div><b>روز قبل / بعد:</b> <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd> · <b>بازگردانی:</b> <kbd>Ctrl</kbd>+<kbd>Z</kbd> و <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></div>
          <div><b>دابل‌کلیک</b> روی پارت = ویرایش، روی جای خالی روز = افزودن · <b>راست‌کلیک</b> یا ⋯ = منوی پارت (انتقال و کپی به هر روز هفته).</div>
          <div><b>هفته/ماه دیگر:</b> پارت را روی دکمه‌های ‹ › نگه دارید تا صفحه عوض شود.</div>
        </div>
      )}


      {subView === 'week' && (
        <>
          <PlannerWeekView
            data={data}
            weekStart={cursor}
            search={search}
            gradeFilter={gradeFilter}
            onAddItem={addItem}
            onUpdateItem={updateItem}
            onToggleDone={toggleDone}
            onDeleteItem={deleteItem}
            onSendToReport={sendToReport}
            onToggleTimeline={setTimeline}
            onAddRest={addRest}
            onRemoveRest={removeRest}
          />
        </>
      )}

      {subView === 'month' && (
        <>
          <PlannerMonthView
            data={data}
            monthAnchor={monthAnchor}
            selectedKey={selectedKey}
            selectedDate={selectedDate}
            onSelectDay={(_key, dayDate) => {
              setSelectedDate(dayDate);
              if (dayDate.getMonth() !== monthAnchor.getMonth() || dayDate.getFullYear() !== monthAnchor.getFullYear()) {
                setMonthAnchor(anchorFromDate(dayDate));
              }
            }}
            search={search}
            gradeFilter={gradeFilter}
            onAddItem={addItem}
            onUpdateItem={updateItem}
            onToggleDone={toggleDone}
            onDeleteItem={deleteItem}
            onSendToReport={sendToReport}
            onToggleTimeline={setTimeline}
            onAddRest={addRest}
            onRemoveRest={removeRest}
            onJumpToWeek={(dayDate) => { setCursor(startOfWeek(dayDate)); setSubView('week'); }}
          />
        </>
      )}

      {subView === 'settings' && (
        <PlannerSettingsView
          data={data}
          onUpdate={(fn) => persist(fn(dataRef.current))}
          onExport={exportBackup}
          onImport={importBackup}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      )}

      {subView !== 'settings' && selection.length > 0 && (
        <div className="pl-selbar" role="toolbar" aria-label="عملیات روی پارت‌های انتخاب‌شده">
          <span className="pl-selbar-count">{toPersianDigits(selection.length)} انتخاب</span>
          <button type="button" onClick={() => copyRefs(selection, true)} title="کپی (Ctrl+C)">⧉ کپی</button>
          <button type="button" onClick={() => cutRefs(selection, true)} title="برش (Ctrl+X)">✂ برش</button>
          <button type="button" onClick={() => duplicate(selection, 0)} title="تکثیر (Ctrl+D)">＋ تکثیر</button>
          <button type="button" onClick={() => toggleDoneRefs(selection)} title="انجام شد / برگشت">✓ انجام</button>
          <button type="button" className="danger" onClick={() => removeRefs(selection)} title="حذف (Delete)">× حذف</button>
          <button type="button" onClick={() => setSelection([])} title="لغو انتخاب (Esc)">✕</button>
        </div>
      )}

      {toast && (
        <div className={'pl-toast' + (selection.length > 0 ? ' with-bar' : '')} key={toast.id} role="status">
          <span>{toast.msg}</span>
          {toast.undo && (
            <button type="button" onClick={() => { setToast(null); undo(); }}>بازگردانی</button>
          )}
        </div>
      )}
    </div>
    </PlannerInteractionContext.Provider>
  );
};
