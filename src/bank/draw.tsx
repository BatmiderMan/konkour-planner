/** Drawing on questions: shared settings (context), the stage that holds a question + its free space + the canvas, and the tool bar. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Highlighter, Eraser, Scissors, Slash, ArrowUpRight, Square, Circle, Hand, Undo2, Redo2, Trash2, Settings, X } from 'lucide-react';
import { Bg, DrawDoc, EMPTY_DOC, Pt, Stroke, StrokeKind, bgCss, hits, paintAll, paintStroke, sid, simplify } from './strokes';
import { kvDel, kvGet, kvSet } from './store';
import { toPersianDigits as P } from '../utils';

export type Tool = 'pen' | 'hl' | 'eraser' | 'cut' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'hand';
export interface DrawSettings { tool: Tool; color: string; wPen: number; wHl: number; wEr: number; wShape: number; stab: number; touch: boolean; palm: boolean; snap: boolean }
const DEF: DrawSettings = { tool: 'pen', color: '#1b2a6b', wPen: 3, wHl: 18, wEr: 22, wShape: 3, stab: 0.35, touch: true, palm: true, snap: true };
const LS = 'planex-draw-v1';
const loadSet = (): DrawSettings => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return DEF; } };

interface Handlers { undo: () => void; redo: () => void; clear: () => void }
interface Ctx {
  on: boolean; setOn: (v: boolean) => void; s: DrawSettings; set: (p: Partial<DrawSettings>) => void;
  reg: (id: string, h: Handlers | null) => void; touch: (id: string, u: boolean, r: boolean) => void; act: { id: string; u: boolean; r: boolean }; run: (k: keyof Handlers) => void;
}
const C = createContext<Ctx | null>(null);
export const useDraw = () => useContext(C);

export const DrawProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [on, setOn] = useState(false);
  const [s, setS] = useState<DrawSettings>(loadSet);
  const [act, setAct] = useState({ id: '', u: false, r: false });
  const regs = useRef(new Map<string, Handlers>());
  const set = useCallback((p: Partial<DrawSettings>) => setS((o) => { const n = { ...o, ...p }; try { localStorage.setItem(LS, JSON.stringify(n)); } catch { /* ignore */ } return n; }), []);
  const reg = useCallback((id: string, h: Handlers | null) => { if (h) regs.current.set(id, h); else regs.current.delete(id); }, []);
  const touch = useCallback((id: string, u: boolean, r: boolean) => setAct({ id, u, r }), []);
  const run = useCallback((k: keyof Handlers) => { regs.current.get(act.id)?.[k](); }, [act.id]);
  const v = useMemo(() => ({ on, setOn, s, set, reg, touch, act, run }), [on, s, set, reg, touch, act, run]);
  return <C.Provider value={v}>{children}</C.Provider>;
};

/* ---------------------------------------------------------------- the saved drawing of one question */
export function useDrawDoc(session: string, key: string): { doc: DrawDoc; ready: boolean; setDoc: (d: DrawDoc) => void } {
  const full = `draw:${session}:${key}`;
  const [doc, setD] = useState<DrawDoc>(EMPTY_DOC); const [ready, setReady] = useState(false);
  const cur = useRef(doc), timer = useRef<any>(0), dirty = useRef(false);
  const flush = useCallback(() => { clearTimeout(timer.current); if (!dirty.current) return; dirty.current = false; const d = cur.current; (d.strokes.length || d.extra ? kvSet(full, d) : kvDel(full)).catch(() => { /* storage full */ }); }, [full]);
  useEffect(() => {
    let live = true; setReady(false);
    kvGet<DrawDoc>(full).then((d) => { if (live) { const v = d && d.v === 1 ? d : EMPTY_DOC; cur.current = v; setD(v); setReady(true); } }).catch(() => live && setReady(true));
    const hide = () => flush(); window.addEventListener('pagehide', hide);
    return () => { live = false; window.removeEventListener('pagehide', hide); flush(); };
  }, [full, flush]);
  const setDoc = useCallback((d: DrawDoc) => { cur.current = d; setD(d); dirty.current = true; clearTimeout(timer.current); timer.current = setTimeout(flush, 600); }, [flush]);
  return { doc, ready, setDoc };
}

/* ---------------------------------------------------------------- stage: [question picture][free space] + canvas on top of both */
export const DrawStage: React.FC<{ id: string; doc: DrawDoc; setDoc: (d: DrawDoc) => void; readOnly?: boolean; children: React.ReactNode }> = ({ id, doc, setDoc, readOnly, children }) => {
  const ctx = useDraw();
  const wrap = useRef<HTMLDivElement>(null), base = useRef<HTMLCanvasElement>(null), live = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const docRef = useRef(doc); docRef.current = doc;
  const past = useRef<Stroke[][]>([]), future = useRef<Stroke[][]>([]);
  const g = useRef<null | { kind: 'draw' | 'cut' | 'pan'; stroke?: Stroke; removed?: Set<string>; sm?: Pt; hold?: any; snapped?: boolean; start?: Pt; py?: number }>(null);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const penSeen = useRef(0), raf = useRef(0), hover = useRef<{ x: number; y: number } | null>(null);
  const dpr = Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const active = !readOnly && !!ctx?.on && ctx.s.tool !== 'hand';
  const s = ctx?.s;

  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, []);
  const repaint = useCallback((strokes: Stroke[]) => {
    const c = base.current; if (!c || !size.w) return;
    if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) { c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr); const l = live.current; if (l) { l.width = c.width; l.height = c.height; } }
    paintAll(c.getContext('2d')!, strokes, size.w, size.h, dpr);
  }, [size, dpr]);
  useEffect(() => { repaint(doc.strokes); }, [doc.strokes, repaint]);

  const commit = useCallback((strokes: Stroke[]) => {
    past.current.push(docRef.current.strokes); if (past.current.length > 150) past.current.shift(); future.current = [];
    setDoc({ ...docRef.current, strokes }); ctx?.touch(id, true, false);
  }, [setDoc, ctx, id]);
  useEffect(() => {
    if (!ctx) return;
    ctx.reg(id, {
      undo: () => { const p = past.current.pop(); if (!p) return; future.current.push(docRef.current.strokes); setDoc({ ...docRef.current, strokes: p }); ctx.touch(id, past.current.length > 0, true); },
      redo: () => { const n = future.current.pop(); if (!n) return; past.current.push(docRef.current.strokes); setDoc({ ...docRef.current, strokes: n }); ctx.touch(id, true, future.current.length > 0); },
      clear: () => { if (!docRef.current.strokes.length) return; past.current.push(docRef.current.strokes); future.current = []; setDoc({ ...docRef.current, strokes: [] }); ctx.touch(id, true, false); }
    });
    return () => ctx.reg(id, null);
  }, [ctx?.reg, id, setDoc]); // eslint-disable-line react-hooks/exhaustive-deps

  const lw = (t: Tool) => (t === 'hl' ? s!.wHl : t === 'eraser' || t === 'cut' ? s!.wEr : t === 'pen' ? s!.wPen : s!.wShape);
  const pos = (e: { clientX: number; clientY: number }): { x: number; y: number } => { const r = wrap.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.width }; };
  const paintLive = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const l = live.current; if (!l) return; const c = l.getContext('2d')!; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, size.w, size.h);
      const st = g.current?.stroke;
      if (st && st.t !== 'er') paintStroke(c, st, size.w);
      if (st && st.t === 'er') repaint([...docRef.current.strokes, st]);
      const hv = hover.current;
      if (hv && s && (s.tool === 'eraser' || s.tool === 'cut')) { c.save(); c.strokeStyle = '#555'; c.lineWidth = 1; c.beginPath(); c.arc(hv.x * size.w, hv.y * size.w, (s.wEr * size.w) / 2000, 0, Math.PI * 2); c.stroke(); c.restore(); }
    });
  };
  const endHold = () => { clearTimeout(g.current?.hold); };

  const down = (e: React.PointerEvent) => {
    if (!active || !s) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === 'pen') penSeen.current = Date.now();
    if (e.pointerType === 'touch') {
      const touches = [...pointers.current.values()].filter((p) => p.type === 'touch');
      if (touches.length >= 2) { endHold(); g.current = { kind: 'pan', py: touches.reduce((a, p) => a + p.y, 0) / touches.length }; live.current?.getContext('2d')?.clearRect(0, 0, 9999, 9999); return; }
      if (!s.touch || (s.palm && Date.now() - penSeen.current < 4000)) return;
    }
    if (e.button !== 0 && e.button !== 5 && e.pointerType === 'mouse') return;
    e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pos(e), pr = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    const erasing = s.tool === 'eraser' || e.button === 5 || (e.buttons & 32) !== 0;
    if (s.tool === 'cut') { g.current = { kind: 'cut', removed: new Set() }; hover.current = p; cutAt(p); return; }
    const t: StrokeKind = erasing ? 'er' : (s.tool as StrokeKind);
    const w = erasing ? s.wEr : lw(s.tool);
    const pt = { x: p.x, y: p.y, p: pr };
    g.current = { kind: 'draw', stroke: { id: sid(), t, c: s.color, w, pts: [pt] }, sm: pt, start: pt };
    hover.current = erasing ? p : null; paintLive();
  };
  const cutAt = (p: { x: number; y: number }) => {
    const r = (s!.wEr * size.w) / 2000, rem = g.current!.removed!; let ch = false;
    for (const st of docRef.current.strokes) if (!rem.has(st.id) && hits(st, p.x, p.y, r, size.w)) { rem.add(st.id); ch = true; }
    if (ch) repaint(docRef.current.strokes.filter((x) => !rem.has(x.id)));
    paintLive();
  };
  const move = (e: React.PointerEvent) => {
    if (!active || !s) return;
    const known = pointers.current.get(e.pointerId); if (known) { known.x = e.clientX; known.y = e.clientY; }
    const gg = g.current;
    if (!gg) { if (s.tool === 'eraser' || s.tool === 'cut') { hover.current = pos(e); paintLive(); } return; }
    if (gg.kind === 'pan') {
      const touches = [...pointers.current.values()].filter((p) => p.type === 'touch'); if (touches.length < 2) return;
      const y = touches.reduce((a, p) => a + p.y, 0) / touches.length; window.scrollBy(0, (gg.py || y) - y); gg.py = y; return;
    }
    e.preventDefault();
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || []; const list = evs.length ? evs : [e.nativeEvent as PointerEvent];
    if (gg.kind === 'cut') { for (const ev of list) { const p = pos(ev); hover.current = p; cutAt(p); } return; }
    const st = gg.stroke!;
    for (const ev of list) {
      const p = pos(ev), pr = ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5;
      if (st.t === 'pen' || st.t === 'hl' || st.t === 'er') {
        if (gg.snapped) { st.pts = [st.pts[0], { x: p.x, y: p.y, p: pr }]; continue; }
        const k = 1 - Math.min(0.9, s.stab * (st.t === 'er' ? 0.3 : 1)); const a = gg.sm!;
        const n = { x: a.x + (p.x - a.x) * k, y: a.y + (p.y - a.y) * k, p: a.p + (pr - a.p) * 0.5 }; gg.sm = n; st.pts.push(n);
      } else st.pts = [st.pts[0], { x: p.x, y: p.y, p: pr }];
    }
    if (st.t === 'er') hover.current = pos(e);
    if (s.snap && (st.t === 'pen' || st.t === 'hl') && !gg.snapped) {   // hold still → straight line
      endHold(); gg.hold = setTimeout(() => { if (g.current === gg && st.pts.length > 6) { gg.snapped = true; if (st.t === 'pen') st.t = 'line'; st.pts = [st.pts[0], st.pts[st.pts.length - 1]]; paintLive(); } }, 600);
    }
    paintLive();
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const gg = g.current; if (!gg || !active || !s) return;
    if (gg.kind === 'pan') { if ([...pointers.current.values()].filter((p) => p.type === 'touch').length < 2) g.current = null; return; }
    endHold(); g.current = null;
    if (gg.kind === 'cut') { const rem = gg.removed!; if (rem.size) commit(docRef.current.strokes.filter((x) => !rem.has(x.id))); else repaint(docRef.current.strokes); hover.current = null; paintLive(); return; }
    const st = gg.stroke!;
    if (st.t === 'pen' || st.t === 'hl' || st.t === 'er') { if (!gg.snapped) { const last = pos(e); st.pts.push({ x: last.x, y: last.y, p: st.pts[st.pts.length - 1].p }); } st.pts = simplify(st.pts, size.w); }
    else if (st.pts.length < 2 || Math.hypot((st.pts[1].x - st.pts[0].x) * size.w, (st.pts[1].y - st.pts[0].y) * size.w) < 3) { hover.current = null; paintLive(); return; }
    commit([...docRef.current.strokes, st]); hover.current = null;
    const l = live.current; if (l) l.getContext('2d')!.clearRect(0, 0, l.width, l.height);
  };
  const cancel = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (g.current && g.current.kind !== 'pan') { endHold(); g.current = null; repaint(docRef.current.strokes); paintLive(); } };

  const ex = doc.extra;
  return (
    <div ref={wrap} className={'bk-stage' + (active ? ' draw-on' : '') + (readOnly ? ' ro' : '')} data-tool={s?.tool}>
      <div className="bk-stage-q">{children}</div>
      {ex > 0 && <div className="bk-space" style={{ height: ex * (size.w || 600), ...bgCss(doc.bg, size.w || 600) }} aria-label="فضای خالی" />}
      <canvas ref={base} className="bk-draw" />
      <canvas ref={live} className="bk-draw live" style={{ pointerEvents: active ? 'auto' : 'none', touchAction: active ? 'none' : undefined }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onPointerLeave={() => { if (!g.current) { hover.current = null; paintLive(); } }} onContextMenu={(e) => active && e.preventDefault()} />
    </div>
  );
};

/** + / − / background of the free space (used in a card header) */
export const SpaceButtons: React.FC<{ doc: DrawDoc; setDoc: (d: DrawDoc) => void }> = ({ doc, setDoc }) => {
  const bgs: Bg[] = ['blank', 'grid', 'dots', 'lines'], names = { blank: 'سفید', grid: 'شطرنجی', dots: 'نقطه‌ای', lines: 'خط‌دار' };
  return (
    <span className="bk-space-btns">
      <button type="button" className={'bk-mk sm' + (doc.extra ? ' on' : '')} onClick={() => setDoc({ ...doc, extra: Math.min(6, doc.extra + 0.6) })} title="باز کردن فضای خالی زیر سؤال">＋ فضای حل</button>
      {doc.extra > 0 && <>
        <button type="button" className="bk-mk sm" onClick={() => setDoc({ ...doc, extra: Math.max(0, +(doc.extra - 0.6).toFixed(2)) })} aria-label="کمتر">−</button>
        <button type="button" className="bk-mk sm" onClick={() => setDoc({ ...doc, bg: bgs[(bgs.indexOf(doc.bg) + 1) % 4] })} title="نوع کاغذ">{names[doc.bg]}</button>
      </>}
    </span>
  );
};

/* ---------------------------------------------------------------- the tool bar */
const COLORS = ['#1b2a6b', '#111111', '#d32f2f', '#1b8a3c', '#f57c00', '#7b1fa2', '#0288d1', '#8d6e63'];
const HL = ['#ffeb3b', '#ff9800', '#4caf50', '#40c4ff', '#ff4081'];
export const DrawBar: React.FC = () => {
  const c = useDraw(); const [more, setMore] = useState(false);
  useEffect(() => {
    if (!c?.on) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (t && /TEXTAREA|INPUT|SELECT/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); c.run(e.shiftKey ? 'redo' : 'undo'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); c.run('redo'); }
      else if (!e.ctrlKey && !e.metaKey) { const m: Record<string, Tool> = { p: 'pen', h: 'hl', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', v: 'hand' }; const t2 = m[e.key.toLowerCase()]; if (t2) c.set({ tool: t2 }); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [c]);
  if (!c || !c.on) return null;
  const { s, set } = c;
  const T: Array<[Tool, React.ReactNode, string]> = [['pen', <Pencil size={18} />, 'قلم (P)'], ['hl', <Highlighter size={18} />, 'هایلایتر (H)'], ['eraser', <Eraser size={18} />, 'پاک‌کن (E)'], ['cut', <Scissors size={18} />, 'پاک کردن کل خط'], ['line', <Slash size={18} />, 'خط‌کش / خط راست (L)'], ['arrow', <ArrowUpRight size={18} />, 'فلش (A)'], ['rect', <Square size={18} />, 'مستطیل (R)'], ['ellipse', <Circle size={18} />, 'بیضی (O)'], ['hand', <Hand size={18} />, 'اسکرول (V)']];
  const wKey = s.tool === 'hl' ? 'wHl' : s.tool === 'eraser' || s.tool === 'cut' ? 'wEr' : s.tool === 'pen' ? 'wPen' : 'wShape';
  const palette = s.tool === 'hl' ? HL : COLORS;
  return (
    <div className="bk-drawbar" role="toolbar" aria-label="ابزار رسم">
      <div className="bk-dtools">
        {T.map(([k, ic, t]) => <button type="button" key={k} className={'bk-dt' + (s.tool === k ? ' on' : '')} title={t} aria-label={t} aria-pressed={s.tool === k} onClick={() => set({ tool: k, ...(k === 'hl' && !HL.includes(s.color) ? { color: HL[0] } : {}), ...(k !== 'hl' && HL.includes(s.color) ? { color: COLORS[0] } : {}) })}>{ic}</button>)}
        <span className="bk-dsep" />
        <button type="button" className="bk-dt" title="برگرداندن (Ctrl+Z)" aria-label="برگرداندن" disabled={!c.act.u} onClick={() => c.run('undo')}><Undo2 size={18} /></button>
        <button type="button" className="bk-dt" title="تکرار" aria-label="تکرار" disabled={!c.act.r} onClick={() => c.run('redo')}><Redo2 size={18} /></button>
        <button type="button" className="bk-dt" title="پاک کردن همهٔ نوشته‌های این سؤال" aria-label="پاک کردن همه" disabled={!c.act.id} onClick={() => c.run('clear')}><Trash2 size={18} /></button>
        <button type="button" className={'bk-dt' + (more ? ' on' : '')} title="تنظیمات" aria-label="تنظیمات" onClick={() => setMore((v) => !v)}><Settings size={18} /></button>
      </div>
      {s.tool !== 'eraser' && s.tool !== 'cut' && s.tool !== 'hand' && (
        <div className="bk-dcolors">{palette.map((col) => <button type="button" key={col} className={'bk-dc' + (s.color.toLowerCase() === col ? ' on' : '')} style={{ background: col }} aria-label={'رنگ ' + col} onClick={() => set({ color: col })} />)}
          <label className="bk-dc custom" title="رنگ دلخواه"><input type="color" value={s.color.length === 7 ? s.color : '#000000'} onChange={(e) => set({ color: e.target.value })} /></label></div>
      )}
      {s.tool !== 'hand' && <label className="bk-dw">ضخامت <input type="range" min={1} max={s.tool === 'hl' || s.tool === 'eraser' || s.tool === 'cut' ? 60 : 16} step={0.5} value={s[wKey]} onChange={(e) => set({ [wKey]: +e.target.value } as any)} /><i style={{ width: Math.max(3, Math.min(26, s[wKey])), height: Math.max(3, Math.min(26, s[wKey])), background: s.tool === 'eraser' || s.tool === 'cut' ? '#999' : s.color }} /></label>}
      {more && (
        <div className="bk-dmore">
          <label>نرمی خط (پایدارساز) <input type="range" min={0} max={0.85} step={0.05} value={s.stab} onChange={(e) => set({ stab: +e.target.value })} /> <small>{P(Math.round(s.stab * 100))}٪</small></label>
          <label className="bk-check"><input type="checkbox" checked={s.touch} onChange={(e) => set({ touch: e.target.checked })} /> نوشتن با انگشت (با دو انگشت اسکرول می‌شود)</label>
          <label className="bk-check"><input type="checkbox" checked={s.palm} onChange={(e) => set({ palm: e.target.checked })} /> رد لمس کف دست وقتی قلم نزدیک است</label>
          <label className="bk-check"><input type="checkbox" checked={s.snap} onChange={(e) => set({ snap: e.target.checked })} /> مکث آخر خط ← صاف شدن</label>
          <button type="button" className="bk-btn" onClick={() => setMore(false)}><X size={14} /> بستن</button>
        </div>
      )}
    </div>
  );
};
