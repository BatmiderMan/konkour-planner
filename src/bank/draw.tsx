/** Drawing on questions: shared settings (context), the stage that holds a question + its free space + the canvas, and the tool bar. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Highlighter, Eraser, Scissors, Slash, ArrowUpRight, Square, Circle, Hand, Undo2, Redo2, Trash2, Settings, X } from 'lucide-react';
import { Bg, DrawDoc, EMPTY_DOC, Pt, Stroke, StrokeKind, bgCss, hits, paintAll, paintStroke, recognizeShape, sid, simplify } from './strokes';
import { kvDel, kvGet, kvSet } from './store';
import { toPersianDigits as P } from '../utils';

export type Tool = 'pen' | 'hl' | 'eraser' | 'cut' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'hand';
export interface DrawSettings { tool: Tool; color: string; wPen: number; wHl: number; wEr: number; wShape: number; stab: number; touch: boolean; palm: boolean; snap: boolean }
const DEF: DrawSettings = { tool: 'pen', color: '#1b2a6b', wPen: 3, wHl: 18, wEr: 22, wShape: 3, stab: 0.45, touch: true, palm: true, snap: true };
const LS = 'planex-draw-v1';
const loadSet = (): DrawSettings => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return DEF; } };

export interface StageApi { rect: () => DOMRect; B: () => number; strokes: () => Stroke[]; preview: (s: Stroke[] | null) => void; eraseInc: (st: Stroke, from: number) => void; apply: (s: Stroke[]) => void; hint: (p: { x: number; y: number } | null) => void }
interface Entry { id: string; prev: Stroke[]; next: Stroke[] }
interface Ctx {
  on: boolean; setOn: (v: boolean) => void; s: DrawSettings; set: (p: Partial<DrawSettings>) => void;
  wheel: boolean; setWheel: (v: boolean) => void;
  stages: Map<string, StageApi>; push: (g: Entry[]) => void; undo: () => void; redo: () => void; clearAll: () => Promise<void>; can: { u: boolean; r: boolean };
  act: { id: string; u: boolean; r: boolean }; run: (k: 'undo' | 'redo' | 'clear') => void;
}
const C = createContext<Ctx | null>(null);
export const useDraw = () => useContext(C);

/** One shared pen for the whole book: settings + ONE undo history across every page (an erase that crosses pages is one step). */
export const DrawProvider: React.FC<{ children: React.ReactNode; offline?: (id: string, strokes: Stroke[]) => void; wipe?: () => Promise<void> }> = ({ children, offline, wipe }) => {
  const [on, setOn] = useState(false); const [wheel, setWheel] = useState(false);
  const [s, setS] = useState<DrawSettings>(loadSet);
  const [can, setCan] = useState({ u: false, r: false });
  const stages = useRef(new Map<string, StageApi>()); const hist = useRef<{ p: Entry[][]; f: Entry[][] }>({ p: [], f: [] });
  const off = useRef(offline); off.current = offline; const wp = useRef(wipe); wp.current = wipe;
  const set = useCallback((p: Partial<DrawSettings>) => setS((o) => { const n = { ...o, ...p }; try { localStorage.setItem(LS, JSON.stringify(n)); } catch { /* ignore */ } return n; }), []);
  const sync = () => setCan({ u: hist.current.p.length > 0, r: hist.current.f.length > 0 });
  const applyTo = (id: string, st: Stroke[]) => { const a = stages.current.get(id); if (a) a.apply(st); else off.current?.(id, st); };
  const push = useCallback((g: Entry[]) => { if (!g.length) return; hist.current.p.push(g); if (hist.current.p.length > 200) hist.current.p.shift(); hist.current.f = []; sync(); }, []);
  const undo = useCallback(() => { const g = hist.current.p.pop(); if (!g) return; g.forEach((e) => applyTo(e.id, e.prev)); hist.current.f.push(g); sync(); }, []);
  const redo = useCallback(() => { const g = hist.current.f.pop(); if (!g) return; g.forEach((e) => applyTo(e.id, e.next)); hist.current.p.push(g); sync(); }, []);
  const clearAll = useCallback(async () => { stages.current.forEach((a) => a.apply([])); hist.current = { p: [], f: [] }; sync(); await wp.current?.(); }, []);
  const run = useCallback((k: 'undo' | 'redo' | 'clear') => { if (k === 'undo') undo(); else if (k === 'redo') redo(); else if (window.confirm('همهٔ نوشته‌ها و خط‌خطی‌های این کتاب پاک شود؟ (قابل بازگشت نیست)')) clearAll(); }, [undo, redo, clearAll]);
  const act = useMemo(() => ({ id: 'all', u: can.u, r: can.r }), [can]);
  const v = useMemo(() => ({ on, setOn, s, set, wheel, setWheel, stages: stages.current, push, undo, redo, clearAll, can, act, run }), [on, s, set, wheel, push, undo, redo, clearAll, can, act, run]);
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
export const DrawStage: React.FC<{ id: string; doc: DrawDoc; setDoc: (d: DrawDoc) => void; readOnly?: boolean; bleed?: number; onStroke?: (s: Stroke, W: number) => void; children: React.ReactNode }> = ({ id, doc, setDoc, readOnly, bleed = 0, onStroke, children }) => {
  const ctx = useDraw();
  const wrap = useRef<HTMLDivElement>(null), base = useRef<HTMLCanvasElement>(null), live = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const docRef = useRef(doc); docRef.current = doc;
  type Ms = Map<string, { api: StageApi; cur: Stroke | null; list: Stroke[]; rem: Set<string>; hot: boolean; pend: Map<Stroke, number>; remN: number }>;
  const g = useRef<null | { kind: 'draw' | 'cut' | 'erase' | 'pan'; stroke?: Stroke; ms?: Ms; sm?: Pt; hold?: any; snapped?: boolean; start?: Pt; py?: number; ax?: number; ay?: number; inc?: number; pen?: boolean }>(null);
  const sizeR = useRef(size), repaintR = useRef<(s: Stroke[]) => void>(() => undefined), liveR = useRef<() => void>(() => undefined), raf2 = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const penSeen = useRef(0), raf = useRef(0), hover = useRef<{ x: number; y: number } | null>(null);
  const dpr = Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const active = !readOnly && !!ctx?.on && ctx.s.tool !== 'hand';
  const s = ctx?.s;
  const showCv = !(bleed > 0) || active || doc.strokes.length > 0;   // the reader creates the (big) ink canvases only where there is ink or the pen is on
  const B = bleed * size.w;   // ink may spill this far above / below the page (paint canvases are taller than the page; the event layer is not)

  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, []);
  const repaint = useCallback((strokes: Stroke[]) => {
    const c = base.current; if (!c || !size.w) return;
    const ch = Math.round((size.h + 2 * B) * dpr);
    if (c.width !== Math.round(size.w * dpr) || c.height !== ch) { c.width = Math.round(size.w * dpr); c.height = ch; const l = live.current; if (l) { l.width = c.width; l.height = c.height; } }
    paintAll(c.getContext('2d')!, strokes, size.w, size.h + 2 * B, dpr, B);
  }, [size, dpr, B]);
  repaintR.current = repaint; sizeR.current = size;
  useEffect(() => { repaint(doc.strokes); }, [doc.strokes, repaint, showCv]);

  const commit = useCallback((strokes: Stroke[]) => {
    const prev = docRef.current.strokes; setDoc({ ...docRef.current, strokes }); ctx?.push([{ id, prev, next: strokes }]);
  }, [setDoc, ctx, id]);
  useEffect(() => {   // every page is known to the shared pen, so an erase / undo can reach any page
    if (!ctx) return;
    const api: StageApi = { rect: () => wrap.current!.getBoundingClientRect(), B: () => bleed * sizeR.current.w, strokes: () => docRef.current.strokes,
      preview: (st) => repaintR.current(st ?? docRef.current.strokes), eraseInc: (st, from) => { const c = base.current; if (!c) return; const x = c.getContext('2d')!; x.save(); x.setTransform(dpr, 0, 0, dpr, 0, bleed * sizeR.current.w * dpr); paintStroke(x, { ...st, pts: st.pts.slice(Math.max(0, from - 2)) }, sizeR.current.w); x.restore(); }, apply: (st) => setDoc({ ...docRef.current, strokes: st }), hint: (p) => { hover.current = p; liveR.current(); } };
    ctx.stages.set(id, api); return () => { if (ctx.stages.get(id) === api) ctx.stages.delete(id); };
  }, [ctx?.stages, id, setDoc, bleed]); // eslint-disable-line react-hooks/exhaustive-deps

  const lw = (t: Tool) => (t === 'hl' ? s!.wHl : t === 'eraser' || t === 'cut' ? s!.wEr : t === 'pen' ? s!.wPen : s!.wShape);
  const rectR = useRef<DOMRect | null>(null);
  const pos = (e: { clientX: number; clientY: number }): { x: number; y: number } => { const r = rectR.current || wrap.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.width }; };
  const paintLive = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const l = live.current; if (!l) return; const c = l.getContext('2d')!; const gg0 = g.current; const st = gg0?.stroke;
      if (st && st.t === 'pen' && !gg0!.snapped && !hover.current) {   // pen: add only the new segments (no clear, no redraw of the whole line) → stays smooth on long strokes
        c.setTransform(dpr, 0, 0, dpr, 0, B * dpr); inc(c, st, gg0!); return;
      }
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, l.width, l.height); c.setTransform(dpr, 0, 0, dpr, 0, B * dpr);
      if (gg0) gg0.inc = 0;
      if (st && st.t !== 'er') paintStroke(c, st, size.w);
      const hv = hover.current;
      if (hv && s && (s.tool === 'eraser' || s.tool === 'cut')) { c.save(); c.strokeStyle = '#555'; c.lineWidth = 1; c.beginPath(); c.arc(hv.x * size.w, hv.y * size.w, (s.wEr * size.w) / 2000, 0, Math.PI * 2); c.stroke(); c.restore(); }
    });
  };
  const inc = (c: CanvasRenderingContext2D, st: Stroke, gg: NonNullable<typeof g.current>) => {
    const P = st.pts, W = size.w, k = W / 1000, lw = Math.max(0.6, st.w * k), X = (q: Pt) => q.x * W, Y = (q: Pt) => q.y * W; let i = gg.inc || 0;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = st.c; c.fillStyle = st.c;
    if (i === 0) { c.beginPath(); c.arc(X(P[0]), Y(P[0]), lw / 2, 0, Math.PI * 2); c.fill(); i = 1; }
    const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    for (; i < P.length; i++) {
      const a = i === 1 ? P[0] : mid(P[i - 2], P[i - 1]), b = mid(P[i - 1], P[i]);
      c.lineWidth = gg.pen ? lw * (0.35 + 0.65 * ((P[i - 1].p + P[i].p) / 2)) : lw;
      c.beginPath(); c.moveTo(X(a), Y(a)); c.quadraticCurveTo(X(P[i - 1]), Y(P[i - 1]), X(b), Y(b)); c.stroke();
    }
    gg.inc = i;
  };
  liveR.current = paintLive;
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
    e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); rectR.current = wrap.current!.getBoundingClientRect();
    const p = pos(e), pr = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    const erasing = s.tool === 'eraser' || e.button === 5 || (e.buttons & 32) !== 0;
    if (erasing || s.tool === 'cut') { g.current = { kind: s.tool === 'cut' && !erasing ? 'cut' : 'erase', ms: new Map() }; sweep(e.clientX, e.clientY, pr); return; }
    const pt = { x: p.x, y: p.y, p: pr };
    g.current = { kind: 'draw', stroke: { id: sid(), t: s.tool as StrokeKind, c: s.color, w: lw(s.tool), pts: [pt] }, sm: pt, start: pt, ax: e.clientX, ay: e.clientY, inc: 0, pen: e.pointerType === 'pen' };
    hover.current = null; paintLive();
  };
  /** the eraser / whole-line cutter works on EVERY page under the finger, not only the one it started on */
  const sweep = (cx: number, cy: number, pr: number) => {
    const gg = g.current; if (!gg?.ms || !ctx || !s) return; const ms = gg.ms;
    for (const [sid2, api] of ctx.stages) {
      const r = api.rect(), W = r.width || 1, B = api.B(), rad = (s.wEr * W) / 2000;
      let m = ms.get(sid2);
      if (!(cx >= r.left - rad && cx <= r.right + rad && cy >= r.top - B - rad && cy <= r.bottom + B + rad)) { if (m) { m.cur = null; if (m.hot) { m.hot = false; api.hint(null); } } continue; }
      const p = { x: (cx - r.left) / W, y: (cy - r.top) / W };
      if (!m) { m = { api, cur: null, list: [], rem: new Set(), hot: false, pend: new Map(), remN: 0 }; ms.set(sid2, m); }
      if (gg.kind === 'erase') { if (!m.cur) { m.cur = { id: sid(), t: 'er', c: s.color, w: s.wEr, pts: [] }; m.list.push(m.cur); } m.cur.pts.push({ x: p.x, y: p.y, p: pr }); if (!m.pend.has(m.cur)) m.pend.set(m.cur, m.cur.pts.length - 1); }
      else for (const st of api.strokes()) if (!m.rem.has(st.id) && hits(st, p.x, p.y, rad, W)) m.rem.add(st.id);
      m.hot = true; api.hint(p);
    }
    cancelAnimationFrame(raf2.current);
    raf2.current = requestAnimationFrame(() => {   // paint only what is new: erasing = a few segments straight onto the page canvas; cutting = redraw only when something was actually removed
      for (const m of ms.values()) {
        if (gg.kind === 'erase') { if (m.api.strokes().length) m.pend.forEach((i, st) => m.api.eraseInc(st, i)); m.pend.clear(); }
        else if (m.rem.size !== m.remN) { m.remN = m.rem.size; m.api.preview(m.api.strokes().filter((x) => !m.rem.has(x.id))); }
      }
    });
  };
  const finishSweep = (gg: NonNullable<typeof g.current>, keep: boolean) => {
    cancelAnimationFrame(raf2.current); const group: Entry[] = [];
    for (const [sid2, m] of gg.ms!) {
      const prev = m.api.strokes(); m.hot = false; m.api.hint(null);
      const next = !keep ? prev : gg.kind === 'erase' ? (prev.length && m.list.length ? [...prev, ...m.list.map((x) => ({ ...x, pts: simplify(x.pts, m.api.rect().width || 1) }))] : prev) : m.rem.size ? prev.filter((x) => !m.rem.has(x.id)) : prev;
      if (next !== prev) { group.push({ id: sid2, prev, next }); m.api.apply(next); } else m.api.preview(null);
    }
    ctx?.push(group);
  };
  const move = (e: React.PointerEvent) => {
    if (!active || !s) return;
    const known = pointers.current.get(e.pointerId); if (known) { known.x = e.clientX; known.y = e.clientY; }
    const gg = g.current;
    if (!gg) { if (s.tool === 'eraser' || s.tool === 'cut') { hover.current = pos(e); paintLive(); } return; }
    if (gg.kind === 'pan') {
      const touches = [...pointers.current.values()].filter((p) => p.type === 'touch'); if (touches.length < 2) return;
      const y = touches.reduce((a, p) => a + p.y, 0) / touches.length; ((wrap.current?.closest('.bkv-scroll') as HTMLElement | null) || window).scrollBy(0, (gg.py || y) - y); gg.py = y; return;
    }
    e.preventDefault();
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || []; const list = evs.length ? evs : [e.nativeEvent as PointerEvent];
    if (gg.kind === 'cut' || gg.kind === 'erase') { for (const ev of list) sweep(ev.clientX, ev.clientY, ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5); return; }
    const st = gg.stroke!;
    for (const ev of list) {
      const p = pos(ev), pr = ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5;
      if (gg.snapped) { if (st.t === 'line' || st.t === 'hl') st.pts = [st.pts[0], { x: p.x, y: p.y, p: pr }]; continue; }
      if (st.t === 'pen' || st.t === 'hl') {
        const k = 1 - Math.min(0.9, s.stab); const a = gg.sm!;
        const n = { x: a.x + (p.x - a.x) * k, y: a.y + (p.y - a.y) * k, p: a.p + (pr - a.p) * 0.5 }; gg.sm = n; st.pts.push(n);
      } else st.pts = [st.pts[0], { x: p.x, y: p.y, p: pr }];
    }
    if (s.snap && (st.t === 'pen' || st.t === 'hl') && !gg.snapped) {   // hold still after a rough shape → clean shape (line, rectangle/square, circle/ellipse, triangle…)
      if (!gg.hold || Math.hypot(e.clientX - (gg.ax || 0), e.clientY - (gg.ay || 0)) > 5) {
        endHold(); gg.ax = e.clientX; gg.ay = e.clientY;
        gg.hold = setTimeout(() => {
          if (g.current !== gg || gg.snapped || st.pts.length < 7) return;
          const sh = recognizeShape(st.pts, size.w, st.t === 'hl'); if (!sh) return;
          gg.snapped = true; if (st.t === 'pen') st.t = sh.t; st.pts = sh.pts; try { navigator.vibrate?.(12); } catch { /* ignore */ } paintLive();
        }, 520);
      }
    }
    paintLive();
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const gg = g.current; if (!gg || !active || !s) return;
    if (gg.kind === 'pan') { if ([...pointers.current.values()].filter((p) => p.type === 'touch').length < 2) g.current = null; return; }
    endHold(); g.current = null; rectR.current = null;
    if (gg.kind === 'cut' || gg.kind === 'erase') { finishSweep(gg, true); return; }
    const st = gg.stroke!;
    if (st.t === 'pen' || st.t === 'hl') { if (!gg.snapped) { const last = pos(e); st.pts.push({ x: last.x, y: last.y, p: st.pts[st.pts.length - 1].p }); } st.pts = simplify(st.pts, size.w); }
    else if (st.pts.length < 2 || Math.hypot((st.pts[1].x - st.pts[0].x) * size.w, (st.pts[1].y - st.pts[0].y) * size.w) < 3) { hover.current = null; paintLive(); return; }
    commit([...docRef.current.strokes, st]); hover.current = null;
    const l = live.current; if (l) { const c2 = l.getContext('2d')!; c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, l.width, l.height); }
    onStroke?.(st, size.w);
  };
  const cancel = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); const gg = g.current; if (gg && gg.kind !== 'pan') { endHold(); g.current = null; rectR.current = null; if (gg.ms) finishSweep(gg, false); repaint(docRef.current.strokes); paintLive(); } };

  const ex = doc.extra;
  return (
    <div ref={wrap} className={'bk-stage' + (active ? ' draw-on' : '') + (readOnly ? ' ro' : '')} data-tool={s?.tool}>
      <div className="bk-stage-q">{children}</div>
      {ex > 0 && <div className="bk-space" style={{ height: ex * (size.w || 600), ...bgCss(doc.bg, size.w || 600) }} aria-label="فضای خالی" />}
      {showCv && <canvas ref={base} className="bk-draw" style={B ? { top: -B, bottom: 'auto', height: size.h + 2 * B, zIndex: 2 } : undefined} />}
      {showCv && <canvas ref={live} className="bk-draw live" style={B ? { top: -B, bottom: 'auto', height: size.h + 2 * B, zIndex: 2, pointerEvents: 'none' } : { pointerEvents: active ? 'auto' : 'none', touchAction: active ? 'none' : undefined }}
        onPointerDown={B ? undefined : down} onPointerMove={B ? undefined : move} onPointerUp={B ? undefined : up} onPointerCancel={B ? undefined : cancel} onPointerLeave={B ? undefined : () => { if (!g.current) { hover.current = null; paintLive(); } }} onContextMenu={(e) => active && e.preventDefault()} />}
      {B > 0 && <div className="bk-draw live" style={{ zIndex: 3, pointerEvents: active ? 'auto' : 'none', touchAction: active ? 'none' : undefined }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onPointerLeave={() => { if (!g.current) { hover.current = null; paintLive(); } }} onContextMenu={(e) => active && e.preventDefault()} />}
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
export function useDrawKeys(c: Ctx | null) {
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
}
export const DrawBar: React.FC = () => {
  const c = useDraw(); const [more, setMore] = useState(false); useDrawKeys(c);
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
        <button type="button" className="bk-dt" title="پاک کردن همهٔ نوشته‌ها" aria-label="پاک کردن همه" disabled={!c.act.id} onClick={() => c.run('clear')}><Trash2 size={18} /></button>
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

/* ---------------------------------------------------------------- radial pen menu: one round button; it opens a ring of tools and a second ring with what the tool needs */
const SHAPES: Tool[] = ['line', 'arrow', 'rect', 'ellipse'];
const polar = (r: number, deg: number) => ({ x: Math.cos((deg * Math.PI) / 180) * r, y: -Math.sin((deg * Math.PI) / 180) * r });
const spread = (n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 90 : 168 - (i * 156) / (n - 1)));
export const PenWheel: React.FC = () => {
  const c = useDraw(); useDrawKeys(c);
  if (!c || !c.on) return null;
  const { s, set, wheel: open, setWheel: setOpen } = c;
  const shape = SHAPES.includes(s.tool);
  type It = { k: string; txt?: string; ic?: React.ReactNode; on?: boolean; dis?: boolean; col?: string; dot?: number; t: string; f: () => void };
  const A: It[] = [
    { k: 'undo', ic: <Undo2 size={17} />, dis: !c.can.u, t: 'برگرداندن', f: () => c.undo() },
    { k: 'pen', ic: <Pencil size={17} />, on: s.tool === 'pen', t: 'قلم', f: () => set({ tool: 'pen', ...(HL.includes(s.color) ? { color: COLORS[0] } : {}) }) },
    { k: 'hl', ic: <Highlighter size={17} />, on: s.tool === 'hl', t: 'هایلایتر', f: () => set({ tool: 'hl', ...(HL.includes(s.color) ? {} : { color: HL[0] }) }) },
    { k: 'er', ic: <Eraser size={17} />, on: s.tool === 'eraser' || s.tool === 'cut', t: 'پاک‌کن', f: () => set({ tool: s.tool === 'cut' ? 'cut' : 'eraser' }) },
    { k: 'sh', ic: <Square size={17} />, on: shape, t: 'شکل‌ها', f: () => set({ tool: shape ? s.tool : 'rect', ...(HL.includes(s.color) ? { color: COLORS[0] } : {}) }) },
    { k: 'hand', ic: <Hand size={17} />, on: s.tool === 'hand', t: 'اسکرول', f: () => { set({ tool: 'hand' }); setOpen(false); } },
    { k: 'redo', ic: <Redo2 size={17} />, dis: !c.can.r, t: 'تکرار', f: () => c.redo() },
    { k: 'x', ic: <X size={17} />, t: 'بستن قلم', f: () => { c.setOn(false); setOpen(false); } }
  ];
  const wk = s.tool === 'hl' ? 'wHl' : s.tool === 'eraser' || s.tool === 'cut' ? 'wEr' : s.tool === 'pen' ? 'wPen' : 'wShape';
  const wp = s.tool === 'hl' ? [10, 18, 32] : s.tool === 'eraser' || s.tool === 'cut' ? [10, 22, 46] : [2, 4, 8];
  const W: It[] = wp.map((v, i) => ({ k: 'w' + v, dot: 6 + i * 5, on: Math.abs(s[wk] - v) < (s.tool === 'pen' ? 1 : 3), t: 'ضخامت', f: () => { set({ [wk]: v } as any); setOpen(false); } }));
  const cols = (l: string[]): It[] => l.map((col) => ({ k: col, col, on: s.color.toLowerCase() === col, t: 'رنگ', f: () => { set({ color: col }); setOpen(false); } }));
  const SI: Record<string, React.ReactNode> = { line: <Slash size={17} />, arrow: <ArrowUpRight size={17} />, rect: <Square size={17} />, ellipse: <Circle size={17} /> };
  let B: It[] = [];
  const LV = [0, 0.3, 0.55, 0.8], lv = LV.reduce((b, v, i) => (Math.abs(v - s.stab) < Math.abs(LV[b] - s.stab) ? i : b), 0);
  const extra: It[] = [{ k: 'sm', txt: 'نرمی ' + P(lv), on: lv > 0, t: 'نرمی خط', f: () => set({ stab: LV[(lv + 1) % 4] }) }, { k: 'snap', txt: 'شکل', on: s.snap, t: 'تبدیل شکل با مکث', f: () => set({ snap: !s.snap }) }];
  if (s.tool === 'pen') B = [...cols(COLORS.slice(0, 4)), ...W, ...extra];
  else if (s.tool === 'hl') B = [...cols(HL.slice(0, 4)), ...W, extra[1]];
  else if (s.tool === 'eraser' || s.tool === 'cut') B = [{ k: 'e1', ic: <Eraser size={17} />, on: s.tool === 'eraser', t: 'پاک‌کن نرم', f: () => set({ tool: 'eraser' }) }, { k: 'e2', ic: <Scissors size={17} />, on: s.tool === 'cut', t: 'پاک کردن کل خط', f: () => set({ tool: 'cut' }) }, ...W, { k: 'e3', ic: <Trash2 size={17} />, t: 'پاک کردن همه', f: () => { setOpen(false); c.run('clear'); } }];
  else if (shape) B = [...SHAPES.map((k) => ({ k, ic: SI[k], on: s.tool === k, t: k, f: () => set({ tool: k }) } as It)), ...cols([COLORS[0], COLORS[2], COLORS[3], COLORS[4]])];
  const place = (list: It[], r: number, base: string) => list.map((it, i) => {
    const d = spread(list.length)[i], p = polar(r, d);
    return <button type="button" key={base + it.k} className={'pw-i' + (it.on ? ' on' : '') + (it.col ? ' col' : '') + (it.dot ? ' dot' : '')} disabled={it.dis} aria-label={it.t} title={it.t} aria-pressed={it.on}
      style={{ ['--x' as any]: p.x + 'px', ['--y' as any]: p.y + 'px', ['--i' as any]: i, ...(it.col ? { background: it.col } : {}) }} onClick={it.f}>
      {it.dot ? <i style={{ width: it.dot, height: it.dot }} /> : it.txt ? <small>{it.txt}</small> : it.ic}</button>;
  });
  const cur = s.tool === 'hl' ? <Highlighter size={22} /> : s.tool === 'eraser' ? <Eraser size={22} /> : s.tool === 'cut' ? <Scissors size={22} /> : s.tool === 'hand' ? <Hand size={22} /> : shape ? SI[s.tool] : <Pencil size={22} />;
  return (
    <div className={'pw' + (open ? ' open' : '')} role="group" aria-label="منوی قلم">
      {open && <div className="pw-back" onClick={() => setOpen(false)} />}
      <div className="pw-ring">{place(A, 104, 'a')}{place(B, 158, 'b' + s.tool)}</div>
      <button type="button" className="pw-fab" onClick={() => setOpen(!open)} aria-label="ابزار قلم" aria-expanded={open} style={{ ['--pc' as any]: s.tool === 'eraser' || s.tool === 'cut' || s.tool === 'hand' ? 'var(--muted,#888)' : s.color }}>{cur}<i /></button>
    </div>
  );
};
