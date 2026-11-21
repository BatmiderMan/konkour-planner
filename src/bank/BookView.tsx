/** کتاب زنده — a full-screen book reader: the printed pages as one continuous sheet; tap or circle an option to answer, write on the page, zoom, save everything. */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Bookmark, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, ListTree, MoreHorizontal, Pencil, Plus, Star, StickyNote, Trash2, Upload, X } from 'lucide-react';
import { Lab } from './parts';
import { imageUrl, explUrl, kvGet, kvSet, kvDel, kvDelPrefix, kvEntries, patchMeta, keyOf, saveAttempt, recordAttemptMeta, bookDims, Attempt } from './store';
import { PenWheel, DrawProvider, DrawStage, useDraw, useDrawDoc } from './draw';
import type { Stroke } from './strokes';
import { qno } from './qno';
import { toPersianDigits as P } from '../utils';

/* ================================================================ settings */
interface Cfg { theme: 'paper' | 'sepia' | 'night'; width: number; circle: boolean; sens: number; strike: boolean; clearInk: boolean; haptic: boolean; autoHide: boolean; quiet: boolean; tapPick: boolean }
const DEF: Cfg = { theme: 'paper', width: 860, circle: true, sens: 0.5, strike: true, clearInk: false, haptic: true, autoHide: true, quiet: false, tapPick: true };
const LS = 'bkv:cfg';
const useCfg = (): [Cfg, (p: Partial<Cfg>) => void] => {
  const [c, setC] = useState<Cfg>(() => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return DEF; } });
  const set = useCallback((p: Partial<Cfg>) => setC((o) => { const n = { ...o, ...p }; try { localStorage.setItem(LS, JSON.stringify(n)); } catch { /* ignore */ } return n; }), []);
  return [c, set];
};

/* ================================================================ ink detection: a loop around an option = answer, a strike through it = eliminate */
const bbox = (st: Stroke) => { let x0 = 9, y0 = 9, x1 = -9, y1 = -9; for (const p of st.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } return { x0, y0, x1, y1, bw: x1 - x0, bh: y1 - y0 }; };
const plen = (st: Stroke) => { let l = 0; for (let i = 1; i < st.pts.length; i++) l += Math.hypot(st.pts[i].x - st.pts[i - 1].x, st.pts[i].y - st.pts[i - 1].y); return l; };
/** snapped shapes (rectangle / circle / triangle) become a dense closed outline so the same loop test applies */
const dense = (st: Stroke): Stroke => {
  const P = st.pts; let c: { x: number; y: number }[];
  if (st.t === 'ellipse' && P.length >= 2) { const cx = (P[0].x + P[1].x) / 2, cy = (P[0].y + P[1].y) / 2, rx = Math.abs(P[1].x - P[0].x) / 2, ry = Math.abs(P[1].y - P[0].y) / 2; return { ...st, t: 'pen', pts: Array.from({ length: 49 }, (_, i) => ({ x: cx + rx * Math.cos((i / 48) * 6.2832), y: cy + ry * Math.sin((i / 48) * 6.2832), p: 0.5 })) }; }
  if (st.t === 'rect' && P.length >= 2) c = [{ x: P[0].x, y: P[0].y }, { x: P[1].x, y: P[0].y }, { x: P[1].x, y: P[1].y }, { x: P[0].x, y: P[1].y }];
  else if (st.t === 'poly') c = P; else return st;
  const out: { x: number; y: number; p: number }[] = [];
  c.forEach((a, i) => { const b = c[(i + 1) % c.length]; for (let k = 0; k < 12; k++) out.push({ x: a.x + ((b.x - a.x) * k) / 12, y: a.y + ((b.y - a.y) * k) / 12, p: 0.5 }); });
  out.push({ ...out[0] }); return { ...st, t: 'pen', pts: out };
};
/** all numbers in units of the page width (zone y/h are fractions of the picture height → × ar) */
function circled(raw: Stroke, ar: number, sens: number, zones?: number[][], cal?: number[][]): number {
  const shp = raw.t === 'ellipse' || raw.t === 'rect' || raw.t === 'poly'; const st = shp ? dense(raw) : raw;
  if (st.t !== 'pen' || st.pts.length < 8) return 0;
  const { x0, y0, x1, y1, bw, bh } = bbox(st); if (bw < 0.02 || bh < 0.01) return 0;
  const f = st.pts[0], l = st.pts[st.pts.length - 1];
  if (Math.hypot(f.x - l.x, f.y - l.y) > (0.35 + sens * 0.5) * Math.max(bw, bh)) return 0;   // not closed
  if (!shp && plen(st) < 1.6 * (bw + bh)) return 0;                                                    // back-and-forth scribble, not a loop
  if (zones) {
    let best = 0, bs = 0;
    zones.forEach((z, i) => {
      const zx = z[0], zy = z[1] * ar, zw = z[2], zh = z[3] * ar;
      const iw = Math.min(x1, zx + zw) - Math.max(x0, zx), ih = Math.min(y1, zy + zh) - Math.max(y0, zy); if (iw <= 0 || ih <= 0) return;
      const cover = (iw * ih) / (zw * zh), tight = (zw * zh) / (bw * bh);
      const sc = Math.min(cover, 1) * Math.min(tight, 1) ** 0.5; if (cover > 0.6 - sens * 0.3 && tight > 0.15 && sc > bs) { bs = sc; best = i + 1; }
    });
    return best;
  }
  if (cal) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let best = 0, bd = 9;
    cal.forEach((c, i) => { const dd = Math.hypot(c[0] - cx, c[1] * ar - cy); if (dd < bd) { bd = dd; best = i + 1; } });
    return bd < Math.max(bw, bh) * 0.6 ? best : 0;
  }
  return 0;
}
function struck(st: Stroke, ar: number, zones?: number[][]): number {
  if (!zones || (st.t !== 'pen' && st.t !== 'line') || st.pts.length < 2) return 0;
  const { bw, bh } = bbox(st); if (bw < 0.03) return 0;
  const f = st.pts[0], l = st.pts[st.pts.length - 1]; if (st.pts.length > 6 && Math.hypot(f.x - l.x, f.y - l.y) < 0.3 * Math.max(bw, bh)) return 0;   // closed = a circle
  let best = 0, bs = 0;
  zones.forEach((z, i) => {
    const zx = z[0] - 0.01, zy = z[1] * ar - 0.01, zw = z[2] + 0.02, zh = z[3] * ar + 0.02;
    const inside = st.pts.filter((p) => p.x >= zx && p.x <= zx + zw && p.y >= zy && p.y <= zy + zh).length / st.pts.length;
    if (inside > 0.8 && bw >= 0.35 * z[2] && inside > bs) { bs = inside; best = i + 1; }
  });
  return best;
}

/* ================================================================ one page */
interface St { order: number[]; picks: Record<number, number>; cut?: Record<number, number[]> }
type Cal = Record<number, number[][]>
interface PageP { root: React.RefObject<HTMLDivElement>; cfg: Cfg; b: string; n: number; idx: number; ar: number; extra: number; ans: number; zones?: number[][]; cal?: number[][]; pick: number; cut?: number[]; reveal: boolean; edit: boolean; draw: boolean; bm: boolean; hasNote: boolean;
  onVis: (n: number, i: number, sc: number) => void; onPick: (n: number, o: number) => void; onCut: (n: number, o: number) => void; onMove: (n: number, d: number) => void; onCal: (n: number, p: number[][] | null) => void; onExtra: (n: number, v: number) => void }

const Body: React.FC<PageP> = (p) => {
  const [src, setSrc] = useState<string | null>(null); const [ex, setEx] = useState<string | null>(null); const [openEx, setOpenEx] = useState(false);
  const [pts, setPts] = useState<number[][] | null>(null); const [flash, setFlash] = useState(0);
  const { doc, setDoc } = useDrawDoc('book:' + p.b, keyOf(p.b, p.n));
  const docR = useRef(doc); docR.current = doc;
  useEffect(() => { let live = true; imageUrl(p.b, p.n).then((u) => live && u && setSrc(u)); return () => { live = false; }; }, [p.b, p.n]);
  useEffect(() => { p.onExtra(p.n, doc.extra); }, [doc.extra]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (openEx && !ex) explUrl(p.b, p.n).then(setEx); }, [openEx, ex, p.b, p.n]);
  useEffect(() => {   // the dock's «working space» buttons talk to the page on screen
    const f = (e: Event) => { const d = (e as CustomEvent).detail as { n: number; op: string }; if (d.n !== p.n) return; const c = docR.current; const bgs = ['blank', 'grid', 'dots', 'lines'] as const;
      if (d.op === 'more') setDoc({ ...c, extra: Math.min(6, +(c.extra + 0.6).toFixed(2)) }); if (d.op === 'less') setDoc({ ...c, extra: Math.max(0, +(c.extra - 0.6).toFixed(2)) });
      if (d.op === 'bg') setDoc({ ...c, bg: bgs[(bgs.indexOf(c.bg) + 1) % 4] }); if (d.op === 'clear') setDoc({ ...c, strokes: [] }); };
    window.addEventListener('bkv:space', f); return () => window.removeEventListener('bkv:space', f);
  }, [p.n, setDoc]);
  const cls = (o: number) => { const k = (p.cut?.includes(o) ? ' cut' : '') + (flash === o ? ' flash' : ''); if (!p.pick) return k; if (!p.reveal) return (o === p.pick ? 'sel' : '') + k; return (o === p.ans ? 'ok' : o === p.pick ? 'bad' : '') + k; };
  const ping = (o: number) => { setFlash(o); setTimeout(() => setFlash(0), 700); if (p.cfg.haptic) try { navigator.vibrate?.(14); } catch { /* ignore */ } };
  const onStroke = (st: Stroke) => {
    let hit = 0;
    if (p.cfg.circle) { const o = circled(st, p.ar, p.cfg.sens, p.zones, p.cal); if (o) { hit = o; p.onPick(p.n, o); } }
    if (!hit && p.cfg.strike) { const o = struck(st, p.ar, p.zones); if (o) { hit = o; p.onCut(p.n, o); } }
    if (hit) { ping(hit); if (p.cfg.clearInk) setTimeout(() => setDoc({ ...docR.current, strokes: docR.current.strokes.filter((s) => s.id !== st.id) }), 60); }
  };
  return (
    <>
      <DrawStage id={'bv' + p.n} doc={doc} setDoc={setDoc} bleed={0.4} onStroke={onStroke}>
        <div className="bkv-pg" onClick={(e) => {
          if (!p.cfg.tapPick && !pts) return;
          if (p.zones && !pts) return;
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / (r.height || 1);
          if (pts) { const np = [...pts, [x, y]]; if (np.length === 4) { setPts(null); p.onCal(p.n, np); } else setPts(np); return; }
          if (p.cal) { let bi = 0, bd = 9; p.cal.forEach((c, i) => { const dd = Math.hypot((c[0] - x) * 4, c[1] - y); if (dd < bd) { bd = dd; bi = i; } }); p.onPick(p.n, p.pick === bi + 1 ? 0 : bi + 1); }
        }}>
          {src ? <img src={src} alt={'سؤال ' + qno(p.n)} draggable={false} /> : <div className="bkv-ph" />}
          {p.zones?.map((z, i) => <button type="button" key={i} className={'bkv-z ' + cls(i + 1)} tabIndex={-1} aria-label={'گزینه ' + (i + 1)} disabled={!p.cfg.tapPick}
            style={{ left: z[0] * 100 + '%', top: z[1] * 100 + '%', width: z[2] * 100 + '%', height: z[3] * 100 + '%' }} onClick={() => p.onPick(p.n, p.pick === i + 1 ? 0 : i + 1)} />)}
          {!p.zones && p.cal && p.cal.map((c, i) => <i key={i} className={'bkv-dot ' + cls(i + 1)} style={{ left: c[0] * 100 + '%', top: c[1] * 100 + '%' }} />)}
          {pts && <div className="bkv-calmsg">روی گزینهٔ {P(pts.length + 1)} بزنید</div>}
          {pts && pts.map((c, i) => <i key={i} className="bkv-dot sel" style={{ left: c[0] * 100 + '%', top: c[1] * 100 + '%' }} />)}
          {p.bm && <span className="bkv-ribbon" aria-hidden />}
          {p.hasNote && <span className="bkv-notedot" aria-hidden><StickyNote size={13} /></span>}
          {p.edit && <div className="bkv-mv"><button type="button" onClick={() => p.onMove(p.n, -1)}><ChevronUp size={18} /></button><span>{P(p.idx + 1)}</span><button type="button" onClick={() => p.onMove(p.n, 1)}><ChevronDown size={18} /></button></div>}
        </div>
      </DrawStage>
      {!p.zones && !p.cal && !pts && !p.draw && <button type="button" className="bkv-link" onClick={() => setPts([])}>گزینه‌ها را یک‌بار نشان بده (۴ لمس: ۱ تا ۴)</button>}
      {!p.zones && p.cal && !pts && !p.draw && <button type="button" className="bkv-link" onClick={() => { p.onCal(p.n, null); setPts([]); }}>تنظیم دوبارهٔ گزینه‌ها</button>}
      {p.reveal && p.pick > 0 && !p.draw && <button type="button" className="bkv-expl" onClick={() => setOpenEx(!openEx)}>{openEx ? 'بستن پاسخ تشریحی' : 'پاسخ تشریحی'}</button>}
      {openEx && (ex ? <img className="bkv-exi" src={ex} alt="پاسخ تشریحی" /> : <div className="bkv-ph" />)}
    </>
  );
};

/** one page of the book. Far from the screen it is an empty box of exactly the right size (no layout jumps); near it, the real thing. */
const Page = React.memo((p: PageP) => {
  const host = useRef<HTMLElement>(null); const [near, setNear] = useState(p.idx < 3);
  useEffect(() => {
    const el = host.current, root = p.root.current; if (!el || !root) return;
    const io = new IntersectionObserver((e) => setNear(e[e.length - 1].isIntersecting), { root, rootMargin: '1000px 0px' });
    const io2 = new IntersectionObserver((e) => { const x = e[e.length - 1]; const rh = x.rootBounds?.height || 1; p.onVis(p.n, p.idx, x.isIntersecting ? Math.max(x.intersectionRatio, x.intersectionRect.height / (rh * 0.6)) : -1); }, { root, threshold: [0, 0.1, 0.25, 0.4, 0.6, 0.8, 1] });
    io.observe(el); io2.observe(el); return () => { io.disconnect(); io2.disconnect(); };
  }, [p.n, p.root]); // eslint-disable-line react-hooks/exhaustive-deps
  return <article ref={host} className="bkv-q" id={'bkv-' + p.n} style={{ aspectRatio: '1 / ' + (p.ar + p.extra) }}>{near && <Body {...p} />}</article>;
});

/* ================================================================ the current page (a tiny external store, so scrolling never re-renders the book) */
const useCur = () => { const r = useRef({ v: 0, subs: new Set<() => void>() }); return r.current; };
type CurStore = ReturnType<typeof useCur>;
const useSub = (c: CurStore) => React.useSyncExternalStore((f) => { c.subs.add(f); return () => { c.subs.delete(f); }; }, () => c.v);

/* ================================================================ panels */
type Tab = 'toc' | 'marks' | 'exam' | 'store' | 'cfg';
const TABS: Array<[Tab, string]> = [['toc', 'فهرست'], ['marks', 'نشانه‌ها'], ['exam', 'آزمون'], ['store', 'ذخیره'], ['cfg', 'تنظیمات']];

/* ---- exam clock: total time, time of every question, a warning when a question passes its share. Lives in its own component so the pages never re-render each second. */
interface Ex { used: number; secs: Record<number, number>; total: number; per: number; paused: boolean; warned: number[]; w15: boolean; up: boolean }
const mmss = (t: number) => { const a = Math.max(0, Math.round(t)); return P(String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0')); };
const ExamBar: React.FC<{ ex: Ex; cur: CurStore; persist: () => void; onWarn: (m: string) => void; onSave: () => void; onFinish: () => void }> = ({ ex, cur, persist, onWarn, onSave, onFinish }) => {
  const [, f] = useState(0); const n = useSub(cur);
  useEffect(() => {
    const iv = setInterval(() => {
      if (!ex.paused && document.visibilityState === 'visible') {
        ex.used++; const q = cur.v; if (q) { const v = (ex.secs[q] = (ex.secs[q] || 0) + 1); if (ex.per > 0 && v >= ex.per && !ex.warned.includes(q)) { ex.warned.push(q); onWarn('⏰ زمان این سؤال تمام شد؛ ادامه بدهید یا بروید سراغ بعدی'); try { navigator.vibrate?.([60, 40, 60]); } catch { /* ignore */ } } }
        if (ex.total > 0) { const left = ex.total - ex.used; if (left <= 900 && left > 0 && !ex.w15) { ex.w15 = true; onWarn('⏰ ۱۵ دقیقه به پایان آزمون مانده'); } if (left <= 0 && !ex.up) { ex.up = true; onWarn('⌛ زمان آزمون تمام شد'); try { navigator.vibrate?.([200, 80, 200]); } catch { /* ignore */ } } }
      }
      if (ex.used % 5 === 0) persist(); f((x) => x + 1);
    }, 1000); return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const left = ex.total > 0 ? ex.total - ex.used : 0, q = ex.secs[n] || 0, over = ex.per > 0 && q >= ex.per;
  return (
    <div className={'bkv-ex' + (over ? ' over' : '') + (ex.total > 0 && left <= 300 ? ' crit' : '')} role="timer">
      <span className="t" title="زمان">{ex.total > 0 ? (left < 0 ? '−' : '') + mmss(Math.abs(left)) : mmss(ex.used)}</span>
      <span className="q" title="زمان این سؤال">سؤال: {mmss(q)}{ex.per > 0 ? ' / ' + mmss(ex.per) : ''}</span>
      <button type="button" onClick={() => { ex.paused = !ex.paused; f((x) => x + 1); }}>{ex.paused ? 'ادامه' : 'توقف'}</button>
      <button type="button" onClick={onSave}>ذخیره</button>
      <button type="button" className="end" onClick={onFinish}>پایان</button>
    </div>
  );
};
const FILTERS: Array<[string, string]> = [['all', 'همه'], ['todo', 'بی‌پاسخ'], ['bad', 'اشتباه'], ['ok', 'درست'], ['star', 'ستاره‌دار'], ['note', 'یادداشت'], ['bm', 'نشانه']];

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ on, onChange, label, hint }) => (
  <button type="button" className="bkv-sw" role="switch" aria-checked={on} onClick={() => onChange(!on)}><span><b>{label}</b>{hint && <small>{hint}</small>}</span><i className={on ? 'on' : ''} /></button>
);

/* ================================================================ the reader */
const Reader: React.FC<{ lab: Lab; bid: string; onClose: () => void }> = ({ lab, bid, onClose }) => {
  const book = lab.bookMap.get(bid)!;
  const dr = useDraw()!;
  const [cfg, setCfg] = useCfg();
  const [st, setSt] = useState<St | null>(null);
  const [checked, setChecked] = useState(false); const [edit, setEdit] = useState(false);
  const [panel, setPanel] = useState<Tab | null>(null); const [filter, setFilter] = useState('all'); const [goto, setGoto] = useState('');
  const [cal, setCal] = useState<Cal>({}); const [dims, setDims] = useState<Record<number, number> | null>(null); const [extras, setExtras] = useState<Record<number, number>>({});
  const [bms, setBms] = useState<number[]>([]); const [saved, setSaved] = useState<Array<{ name: string; order: number[] }>>([]);
  const [noteFor, setNoteFor] = useState<number | null>(null); const [noteTxt, setNoteTxt] = useState(''); const [spaceOpen, setSpaceOpen] = useState(false);
  const [z, setZ] = useState(1); const [cw, setCw] = useState(0); const [chrome, setChrome] = useState(true); const [ver, setVer] = useState(0);
  const [rng, setRng] = useState<{ from: number; to: number }>({ from: 1, to: 0 }); const [exOn, setExOn] = useState(false); const [exMin, setExMin] = useState(''); const [exPer, setExPer] = useState(''); const [res, setRes] = useState<{ a: Attempt; fin: boolean } | null>(null);
  const ex = useRef<Ex | null>(null);
  const [rf, setRf] = useState('1'); const [rt, setRt] = useState('');
  const [toast, setToast] = useState(''); const [stor, setStor] = useState<{ draws: number; bytes: number; usage?: number; quota?: number } | null>(null);
  const root = useRef<HTMLDivElement>(null); const sheet = useRef<HTMLElement>(null); const cur = useCur();
  const base = useMemo(() => book.numbers.slice(), [book]);
  const sess = useRef({ picks: {} as Record<number, number>, secs: {} as Record<number, number>, at: Date.now(), n: 0, t: Date.now() });
  const stRef = useRef<St | null>(null); stRef.current = st;
  const ord = useMemo(() => (st ? st.order.slice(Math.max(0, rng.from - 1), rng.to > 0 ? rng.to : undefined) : []), [st?.order, rng]); // eslint-disable-line react-hooks/exhaustive-deps
  const ordRef = useRef(ord); ordRef.current = ord;
  const calRef = useRef<Cal>({}); calRef.current = cal;
  const exRef = useRef<Record<number, number>>({}); exRef.current = extras;
  const exT = useRef<any>(0); const pend = useRef<null | { ox: number; oy: number; r: number; fx: number; fy: number }>(null); const toastT = useRef<any>(0);
  const startAt = useRef(0); const zRef = useRef(1); zRef.current = z;
  const say = (m: string) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 1800); };

  // ---- load everything saved for this book
  useEffect(() => { let off = false;
    kvGet<St & { at?: number }>('bookview:' + book.id).then((v) => { if (off) return; const ok = v && v.order?.length === base.length && base.every((n) => v.order.includes(n)); setSt(ok ? { order: v!.order, picks: v!.picks || {}, cut: v!.cut || {} } : { order: base, picks: {}, cut: {} }); startAt.current = ok ? v!.at || 0 : 0; });
    kvGet<Cal>('bookcal:' + book.id).then((v) => !off && setCal(v || {}));
    kvGet<Record<number, number>>('bookextra:' + book.id).then((v) => !off && setExtras(v || {}));
    kvGet<{ from: number; to: number }>('bookrange:' + book.id).then((v) => !off && setRng(v && v.from >= 1 ? v : { from: 1, to: 0 }));
    kvGet<Ex>('bookexam:' + book.id).then((v) => { if (!off && v && v.total !== undefined) { ex.current = { ...v, paused: true }; setExOn(true); } });
    kvGet<number[]>('bookmarks:' + book.id).then((v) => !off && setBms(v || []));
    kvGet<Array<{ name: string; order: number[] }>>('bookorders:' + book.id).then((v) => !off && setSaved(v || []));
    bookDims(book.id).then((v) => !off && setDims(v)).catch(() => !off && setDims({}));
    return () => { off = true; }; }, [book, base, ver]);
  useEffect(() => { if (st && dims && startAt.current) { const n = startAt.current; startAt.current = 0; setTimeout(() => document.getElementById('bkv-' + n)?.scrollIntoView({ block: 'start' }), 60); } }, [st, dims]);
  useEffect(() => { const el = root.current; if (!el) return; const ro = new ResizeObserver(() => setCw(el.clientWidth)); ro.observe(el); setCw(el.clientWidth); return () => ro.disconnect(); }, []);

  // ---- every interaction is recorded in the main app: time per question while it is on screen, and the answered questions become an «attempt»
  const tick = () => { const c = sess.current, now = Date.now(); if (c.n) c.secs[c.n] = (c.secs[c.n] || 0) + Math.min(120, (now - c.t) / 1000); c.t = now; };
  // ---- which question is «current» (star / note / bookmark act on it): the one you touched; otherwise the topmost question that is really on screen
  const vis = useRef(new Map<number, { i: number; sc: number }>()); const lock = useRef(0); const rafV = useRef(0);
  const setCur = (n: number) => { if (cur.v === n) return; tick(); sess.current.n = n; cur.v = n; cur.subs.forEach((f) => f()); };
  const recalc = () => {
    const m = vis.current; const L = lock.current;
    if (L && (m.get(L)?.sc ?? 0) >= 0.25) { setCur(L); return; }
    lock.current = 0; let bn = 0, bi = 1e9;
    for (const [n, v] of m) if (v.sc >= 0.3 && v.i < bi) { bi = v.i; bn = n; }
    if (!bn) for (const [n, v] of m) if (v.i < bi) { bi = v.i; bn = n; }
    if (bn) setCur(bn);
  };
  const onVis = useCallback((n: number, i: number, sc: number) => {
    if (sc < 0) vis.current.delete(n); else vis.current.set(n, { i, sc });
    cancelAnimationFrame(rafV.current); rafV.current = requestAnimationFrame(recalc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (n: number) => { lock.current = n; setCur(n); };
  useEffect(() => { let prev: HTMLElement | null = null; const f = () => { prev?.classList.remove('act'); prev = document.getElementById('bkv-' + cur.v); prev?.classList.add('act'); }; cur.subs.add(f); f(); return () => { cur.subs.delete(f); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const flush = () => {
    tick(); const c = sess.current; const ns = Object.keys(c.picks).map(Number).filter((n) => c.picks[n]);
    if (!ns.length) return;
    const items = ns.map((n) => ({ n, pick: c.picks[n], sec: Math.round(c.secs[n] || 0) }));
    let ok = 0, bad = 0; items.forEach((it) => { const k = book.answers[it.n]; if (k > 0) { if (it.pick === k) ok++; else bad++; } });
    const a: Attempt = { id: 'bv' + c.at.toString(36), bookId: book.id, at: Date.now(), seconds: Math.round((Date.now() - c.at) / 1000), items, correct: ok, wrong: bad, blank: 0,
      pct: Math.round(((3 * ok - bad) / (3 * items.length)) * 1000) / 10, mode: 'کتاب زنده', title: 'کتاب زنده · ' + book.title };
    c.picks = {}; c.at = Date.now();
    saveAttempt(a).then(() => recordAttemptMeta(a, (b, n) => book.answers[n] || 0)).catch(() => { /* ignore */ });
  };
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => { const f = () => flushRef.current(); const v = () => { if (document.visibilityState === 'hidden') flushRef.current(); }; window.addEventListener('pagehide', f); document.addEventListener('visibilitychange', v); const iv = setInterval(() => { tick(); }, 15000); return () => { window.removeEventListener('pagehide', f); document.removeEventListener('visibilitychange', v); clearInterval(iv); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { flush(); dr.setOn(false); onClose(); };

  // ---- state changes (all saved at once)
  const save = useCallback((s: St) => { setSt(s); kvSet('bookview:' + book.id, { ...s, at: sess.current.n }); }, [book.id]);
  const pick = useCallback((n: number, o: number) => { const s = stRef.current; if (!s) return; save({ ...s, picks: { ...s.picks, [n]: o } }); sess.current.picks[n] = o; }, [save]);
  const onCut = useCallback((n: number, o: number) => { const s = stRef.current; if (!s) return; const c = new Set(s.cut?.[n] || []); if (c.has(o)) c.delete(o); else c.add(o); save({ ...s, cut: { ...s.cut, [n]: [...c] } }); }, [save]);
  const onMove = useCallback((n: number, d: number) => { const s = stRef.current; if (!s) return; const o = s.order.slice(), i = o.indexOf(n), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; save({ ...s, order: o }); }, [save]);
  const onCal = useCallback((n: number, p: number[][] | null) => { const c = { ...calRef.current }; if (p) c[n] = p; else delete c[n]; setCal(c); kvSet('bookcal:' + book.id, c); }, [book.id]);
  const onExtra = useCallback((n: number, v: number) => { if ((exRef.current[n] || 0) === v) return; const e = { ...exRef.current, [n]: v }; if (!v) delete e[n]; exRef.current = e; setExtras(e); clearTimeout(exT.current); exT.current = setTimeout(() => kvSet('bookextra:' + book.id, exRef.current), 500); }, [book.id]);
  const meta = (n: number) => lab.meta[keyOf(book.id, n)];
  const toggleStar = (n: number) => { patchMeta(book.id, n, { star: !meta(n)?.star }); say(meta(n)?.star ? 'ستاره برداشته شد' : 'ستاره‌دار شد'); };
  const toggleBm = (n: number) => { const b = bms.includes(n) ? bms.filter((x) => x !== n) : [...bms, n]; setBms(b); kvSet('bookmarks:' + book.id, b); say(bms.includes(n) ? 'نشانه برداشته شد' : 'نشانه‌گذاری شد'); };
  const reveal = cfg.quiet ? checked : true;
  const goTo = (n: number, smooth = true) => { setPanel(null); choose(n); document.getElementById('bkv-' + n)?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' }); };
  const step = (d: number) => { const o = ordRef.current; if (!o.length) return; const i = o.indexOf(cur.v); const j = Math.max(0, Math.min(o.length - 1, (i < 0 ? 0 : i) + d)); goTo(o[j]); };
  const ordered = (kind: string, name?: string) => { if (!st) return; let o = base.slice();
    const w = (n: number) => st.picks[n] && st.picks[n] !== book.answers[n];
    if (kind === 'rand') for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    if (kind === 'wrong') o = [...o.filter((n) => w(n)), ...o.filter((n) => !w(n))];
    if (kind === 'todo') o = [...o.filter((n) => !st.picks[n]), ...o.filter((n) => st.picks[n])];
    if (kind === 'star') o = [...o.filter((n) => meta(n)?.star), ...o.filter((n) => !meta(n)?.star)];
    if (kind === 'saved') { const sv = saved.find((x) => x.name === name); if (sv && sv.order.length === base.length) o = sv.order.slice(); }
    save({ ...st, order: o }); setPanel(null); root.current?.scrollTo({ top: 0 }); say('ترتیب تغییر کرد'); };
  const status = (n: number) => { const p = st?.picks[n]; return !p ? '' : !reveal ? 'sel' : p === book.answers[n] ? 'ok' : 'bad'; };
  const done = st ? ord.filter((n) => st.picks[n]).length : 0;
  const correct = st ? ord.filter((n) => st.picks[n] && st.picks[n] === book.answers[n]).length : 0;
  const setRange = (from: number, to: number) => {
    const N = base.length; let f = Math.max(1, Math.min(N, Math.round(from) || 1)); let t = Math.round(to) || 0; if (t >= N) t = 0; if (t > 0 && t < f) t = f;
    const r = { from: f, to: t }; setRng(r); kvSet('bookrange:' + book.id, r); vis.current.clear(); lock.current = 0; root.current?.scrollTo({ top: 0 }); say(t > 0 || f > 1 ? 'فقط سؤال‌های ' + P(f) + ' تا ' + P(t || N) + ' نمایش داده می‌شود' : 'همهٔ سؤال‌ها');
  };
  useEffect(() => { setRf(String(rng.from)); setRt(String(rng.to || base.length)); }, [rng, base.length]);
  const dg = (t: string) => +t.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const applyRange = () => { const f = dg(rf) || 1, t = dg(rt) || 0; if (f !== rng.from || (t !== (rng.to || base.length))) setRange(f, t); };
  // ---- save the current result (any time) / run an exam with a clock
  const buildAttempt = (exam: boolean): Attempt | null => {
    const s = stRef.current; if (!s) return null; tick(); const o = ordRef.current; const e = ex.current;
    const items = o.filter((n) => exam || s.picks[n]).map((n) => ({ n, pick: s.picks[n] || 0, sec: Math.round((e?.secs[n] ?? sess.current.secs[n]) || 0) }));
    if (!items.length) return null;
    let ok = 0, bad = 0, bl = 0; items.forEach((it) => { if (!it.pick) bl++; else { const k = book.answers[it.n]; if (k > 0) { if (it.pick === k) ok++; else bad++; } } });
    const a: Attempt = { id: 'bv' + Date.now().toString(36), bookId: book.id, at: Date.now(), seconds: Math.round(e ? e.used : (Date.now() - sess.current.at) / 1000), items, correct: ok, wrong: bad, blank: bl,
      pct: Math.round(((3 * ok - bad) / (3 * items.length)) * 1000) / 10, mode: exam ? 'آزمون کتاب زنده' : 'کتاب زنده', title: (exam ? 'آزمون کتاب زنده · ' : 'کتاب زنده · ') + book.title + (rng.from > 1 || rng.to > 0 ? ' (' + P(rng.from) + '–' + P(rng.to || base.length) + ')' : '') };
    return a;
  };
  const saveResult = (final = false) => {
    const a = buildAttempt(!!ex.current); if (!a) { say('هنوز به سؤالی پاسخ نداده‌اید'); return; }
    sess.current.picks = {}; sess.current.at = Date.now();
    saveAttempt(a).then(() => recordAttemptMeta(a, (b, n) => book.answers[n] || 0)).catch(() => { /* ignore */ });
    setPanel(null); setRes({ a, fin: final }); if (!final) say('نتیجه ذخیره شد ✓');
  };
  const persistEx = () => { if (ex.current) kvSet('bookexam:' + book.id, ex.current); };
  const startExam = () => {
    const s = stRef.current; if (!s || !ord.length) return;
    const min = Math.max(0, Math.round(+exMin.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) || 0));
    const per0 = Math.round(+exPer.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) || 0); const per = per0 > 0 ? per0 : min > 0 ? Math.round((min * 60) / ord.length) : 0;
    if (ord.some((n) => s.picks[n]) && !window.confirm('پاسخ‌های قبلی این بازه پاک شود و آزمون از اول شروع شود؟')) return;
    const picks = { ...s.picks }, cut = { ...s.cut }; ord.forEach((n) => { delete picks[n]; delete cut[n]; }); save({ ...s, picks, cut }); sess.current.picks = {};
    ex.current = { used: 0, secs: {}, total: min * 60, per, paused: false, warned: [], w15: false, up: false }; persistEx(); setExOn(true); setCfg({ quiet: true }); setChecked(false); setPanel(null); root.current?.scrollTo({ top: 0 }); say('آزمون شروع شد — موفق باشید');
  };
  const finishExam = () => { if (!window.confirm('آزمون تمام شود و نتیجه ذخیره شود؟')) return; saveResult(true); ex.current = null; setExOn(false); kvDel('bookexam:' + book.id); setChecked(true); };

  // ---- zoom: pinch (two fingers) / ctrl+wheel / buttons. While pinching only a CSS transform moves; the real width is set once, when the fingers lift.
  const sheetW = Math.max(200, Math.min(cfg.width, cw || cfg.width)) * z;
  const commitZoom = (nz: number) => {
    const s = Math.max(1, Math.min(4, nz)); if (s === z) return;
    const rc = root.current!.getBoundingClientRect(), sr = sheet.current!.getBoundingClientRect(); const fx = rc.left + rc.width / 2, fy = rc.top + rc.height / 2;
    pend.current = { ox: fx - sr.left, oy: fy - sr.top, fx, fy, r: s / z }; setZ(s);
  };
  useLayoutEffect(() => {
    const pd = pend.current, el = root.current, sh = sheet.current; if (!pd || !el || !sh) return; pend.current = null;
    sh.style.transform = ''; sh.style.willChange = ''; const sr = sh.getBoundingClientRect();
    el.scrollLeft += sr.left + pd.ox * pd.r - pd.fx; el.scrollTop += sr.top + pd.oy * pd.r - pd.fy;
  }, [z]);
  useEffect(() => {
    const el = root.current; if (!el) return; let d0 = 0, z0 = 1, f: any = null, cs = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const ts = (e: TouchEvent) => { if (e.touches.length === 2) { const sr = sheet.current!.getBoundingClientRect(); const fx = (e.touches[0].clientX + e.touches[1].clientX) / 2, fy = (e.touches[0].clientY + e.touches[1].clientY) / 2; d0 = dist(e.touches); z0 = zRef.current; cs = 1; f = { ox: fx - sr.left, oy: fy - sr.top, fx, fy }; sheet.current!.style.willChange = 'transform'; } };
    const tm = (e: TouchEvent) => { if (f && e.touches.length === 2) { e.preventDefault(); cs = Math.max(1, Math.min(4, z0 * dist(e.touches) / d0)) / z0; const sh = sheet.current!; sh.style.transformOrigin = f.ox + 'px ' + f.oy + 'px'; sh.style.transform = 'scale(' + cs + ')'; } };
    const te = (e: TouchEvent) => { if (f && e.touches.length < 2) { const ff = f; f = null; if (Math.abs(cs - 1) > 0.01) { pend.current = { ...ff, r: cs }; setZ(Math.max(1, Math.min(4, +(z0 * cs).toFixed(3)))); } else { sheet.current!.style.transform = ''; sheet.current!.style.willChange = ''; } } };
    let wacc = 0, wf: any = null, wr = 0;
    const wh = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const sr = sheet.current!.getBoundingClientRect(); wf = { ox: e.clientX - sr.left, oy: e.clientY - sr.top, fx: e.clientX, fy: e.clientY }; wacc += -e.deltaY * 0.01; cancelAnimationFrame(wr); wr = requestAnimationFrame(() => { const nz = Math.max(1, Math.min(4, zRef.current * Math.exp(wacc))); wacc = 0; if (nz !== zRef.current) { pend.current = { ...wf, r: nz / zRef.current }; setZ(+nz.toFixed(3)); } }); };
    el.addEventListener('touchstart', ts, { passive: true }); el.addEventListener('touchmove', tm, { passive: false }); el.addEventListener('touchend', te); el.addEventListener('touchcancel', te); el.addEventListener('wheel', wh, { passive: false });
    return () => { el.removeEventListener('touchstart', ts); el.removeEventListener('touchmove', tm); el.removeEventListener('touchend', te); el.removeEventListener('touchcancel', te); el.removeEventListener('wheel', wh); };
  }, []);

  // ---- the bars step out of the way while you read (scrolling hides them, and ONLY a tap brings them back); with the pen they stay hidden
  useEffect(() => {
    const el = root.current; if (!el) return; let last = el.scrollTop, raf = 0;
    const f = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const t = el.scrollTop; if (Math.abs(t - last) > 14) { setChrome(false); last = t; } }); };
    el.addEventListener('scroll', f, { passive: true }); return () => el.removeEventListener('scroll', f);
  }, []);
  const showChrome = (chrome || !cfg.autoHide) && !dr.on || !!panel;

  // ---- keyboard
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (t && /TEXTAREA|INPUT|SELECT/.test(t.tagName)) return; if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase(); const n = cur.v;
      if (key === 'escape') { if (panel) setPanel(null); else if (noteFor !== null) setNoteFor(null); else close(); }
      else if (key === 'j' || key === 'n') step(1); else if (key === 'k' || key === 'p') step(-1);
      else if (['1', '2', '3', '4', '۱', '۲', '۳', '۴'].includes(key) && n) pick(n, '1234'.includes(key) ? +key : '۱۲۳۴'.indexOf(key) + 1);
      else if (key === 's' && n) toggleStar(n); else if (key === 'b' && n) toggleBm(n); else if (key === 'd') dr.setOn(!dr.on); else if (key === 'g') setPanel(panel ? null : 'toc');
      else if (key === '+' || key === '=') commitZoom(z + 0.25); else if (key === '-') commitZoom(z - 0.25); else if (key === '0') commitZoom(1);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  // ---- storage: what is saved, backup & restore
  const loadStor = async () => {
    const dr2 = await kvEntries('draw:book:' + book.id + ':'); let bytes = 0; dr2.forEach((e) => { bytes += JSON.stringify(e.v).length; });
    let usage: number | undefined, quota: number | undefined; try { const e = await navigator.storage.estimate(); usage = e.usage; quota = e.quota; } catch { /* ignore */ }
    setStor({ draws: dr2.length, bytes, usage, quota });
  };
  useEffect(() => { if (panel === 'store') loadStor(); }, [panel, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportAll = async () => {
    const ents = [...await kvEntries('bookview:' + book.id), ...await kvEntries('bookcal:' + book.id), ...await kvEntries('bookextra:' + book.id), ...await kvEntries('bookmarks:' + book.id), ...await kvEntries('bookorders:' + book.id), ...await kvEntries('draw:book:' + book.id + ':')];
    const metas = Object.values(lab.meta).filter((m) => m.b === book.id && (m.star || m.doubt || m.lvl || m.note)).map((m) => ({ n: m.n, star: m.star, doubt: m.doubt, lvl: m.lvl, note: m.note }));
    const blob = new Blob([JSON.stringify({ kind: 'planex-living-book', v: 1, book: book.id, title: book.title, at: Date.now(), kv: ents, meta: metas })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'living-book-' + book.id + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('پشتیبان ذخیره شد');
  };
  const importAll = async (f: File) => {
    try { const j = JSON.parse(await f.text()); if (j.kind !== 'planex-living-book' || j.book !== book.id) { say('این فایل برای این کتاب نیست'); return; }
      for (const e of j.kv || []) await kvSet(e.k, e.v); for (const m of j.meta || []) await patchMeta(book.id, m.n, { star: m.star, doubt: m.doubt, lvl: m.lvl, note: m.note });
      setVer((v) => v + 1); say('بازیابی شد ✓'); } catch { say('فایل خراب است'); }
  };
  const clearDraws = async () => { if (!window.confirm('همهٔ نوشته‌ها و نقاشی‌های این کتاب پاک شود؟')) return; await kvDelPrefix('draw:book:' + book.id + ':'); await kvDelPrefix('bookextra:' + book.id); setVer((v) => v + 1); say('پاک شد'); };
  const resetAnswers = () => { if (!st || !window.confirm('پاسخ‌های علامت‌خورده و حذف‌شده‌ها پاک شود؟ (آمار قبلی می‌ماند)')) return; save({ ...st, picks: {}, cut: {} }); sess.current.picks = {}; say('پاسخ‌ها پاک شد'); };
  const saveOrder = () => { if (!st) return; const name = window.prompt('نام این ترتیب؟', 'ترتیب من ' + P(saved.length + 1)); if (!name) return; const s = [...saved.filter((x) => x.name !== name), { name, order: st.order.slice() }]; setSaved(s); kvSet('bookorders:' + book.id, s); say('ترتیب ذخیره شد'); };
  const delOrder = (name: string) => { const s = saved.filter((x) => x.name !== name); setSaved(s); kvSet('bookorders:' + book.id, s); };
  const openNote = (n: number) => { setNoteFor(n); setNoteTxt(meta(n)?.note || ''); };
  const saveNote = () => { if (noteFor === null) return; patchMeta(book.id, noteFor, { note: noteTxt.trim() || undefined }); setNoteFor(null); say('یادداشت ذخیره شد'); };

  const inFilter = (n: number): boolean => { const p = st?.picks[n], k = book.answers[n];
    switch (filter) { case 'todo': return !p; case 'bad': return !!p && k > 0 && p !== k; case 'ok': return !!p && p === k; case 'star': return !!meta(n)?.star; case 'note': return !!meta(n)?.note; case 'bm': return bms.includes(n); default: return true; } };

  const bytesTxt = (b: number) => (b > 1073741824 ? P((b / 1073741824).toFixed(1).replace('.', '٫')) + ' گیگابایت' : b > 1048576 ? P(Math.round(b / 1048576)) + ' مگابایت' : P(Math.max(1, Math.round(b / 1024))) + ' کیلوبایت');
  return (
    <div className="bkv" dir="rtl" data-theme={cfg.theme} data-chrome={showChrome ? '1' : '0'} data-draw={dr.on ? '1' : '0'}>
      <header className="bkv-top">
        <button type="button" className="ic" onClick={close} aria-label="بستن کتاب"><X size={20} /></button>
        <div className="ttl"><b>{book.title}</b><small>{P(done)} از {P(ord.length)} پاسخ داده{ord.length < base.length ? ' · بازهٔ ' + P(rng.from) + '–' + P(rng.to || base.length) : ''}{reveal && done ? ` · ${P(Math.round((correct / done) * 100))}٪ درست` : ''}</small></div>
        <button type="button" className={'chip' + (cfg.quiet ? ' on' : '')} onClick={() => { setCfg({ quiet: !cfg.quiet }); setChecked(false); }}>{cfg.quiet ? 'آزمون' : 'مطالعه'}</button>
        {cfg.quiet && <button type="button" className={'chip' + (checked ? ' on' : '')} onClick={() => setChecked(!checked)}>{checked ? 'پنهان' : 'تصحیح'}</button>}
        {!exOn && done > 0 && <button type="button" className="chip" onClick={() => saveResult()}>ذخیرهٔ نتیجه</button>}
        <i className="bar" style={{ width: (done / Math.max(1, ord.length)) * 100 + '%' }} />
      </header>
      {exOn && ex.current && <ExamBar ex={ex.current} cur={cur} persist={persistEx} onWarn={say} onSave={() => saveResult()} onFinish={finishExam} />}

      <div className="bkv-scroll" ref={root} onClick={(e) => { if (!dr.on && cfg.autoHide && !(e.target as HTMLElement).closest('button,a,input')) setChrome((c) => !c); }}>
        <main className="bkv-sheet" ref={sheet} style={{ width: sheetW }} key={ver}
          onClickCapture={(e) => { const a = (e.target as HTMLElement).closest?.('.bkv-q'); if (a) choose(+a.id.slice(4)); }}
          onPointerDownCapture={(e) => { if (dr.on) { const a = (e.target as HTMLElement).closest?.('.bkv-q'); if (a) choose(+a.id.slice(4)); if (dr.wheel) dr.setWheel(false); } }}>
          {!st || !dims ? <div className="bkv-ph" /> : ord.map((n, i) => (
            <Page key={n} root={root} cfg={cfg} onVis={onVis} b={book.id} n={n} idx={i} ar={dims[n] || 0.2} extra={extras[n] || 0} ans={book.answers[n] || 0} zones={book.opt?.[n]} cal={cal[n]} pick={st.picks[n] || 0} cut={st.cut?.[n]} reveal={reveal}
              edit={edit} draw={dr.on} bm={bms.includes(n)} hasNote={!!meta(n)?.note} onPick={pick} onCut={onCut} onMove={onMove} onCal={onCal} onExtra={onExtra} />
          ))}
          <div className="bkv-end">پایان {ord.length < base.length ? 'بازه' : 'کتاب'} ✦ {P(done)} از {P(ord.length)} پاسخ داده</div>
        </main>
      </div>

      <PenWheel />
      <Dock cur={cur} order={ord} z={z} cfg={cfg} meta={meta} bm={(n) => bms.includes(n)} spaceOpen={spaceOpen} setSpaceOpen={setSpaceOpen} dr={dr}
        onStep={step} onToc={() => setPanel('toc')} onMenu={() => setPanel('cfg')} onStar={toggleStar} onNote={openNote} onBm={toggleBm} onZoom={(v) => commitZoom(v)}
        onSlide={(i) => ord[i] && goTo(ord[i], false)} />

      {panel && (
        <div className="bkv-pan" role="dialog" aria-label="پنل کتاب">
          <div className="bkv-back" onClick={() => setPanel(null)} />
          <div className="bkv-sh">
            <div className="grab" />
            <nav>{TABS.map(([k, l]) => <button type="button" key={k} className={panel === k ? 'on' : ''} onClick={() => setPanel(k)}>{l}</button>)}<button type="button" className="ic" onClick={() => setPanel(null)} aria-label="بستن"><X size={18} /></button></nav>
            <div className="bd">
              {panel === 'toc' && st && <>
                <form className="goto" onSubmit={(e) => { e.preventDefault(); const t = goto.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim(); const n = ord.find((x) => qno(x) === t); if (n) { setGoto(''); goTo(n); } else say('این شماره در کتاب نیست'); }}>
                  <input value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="رفتن به شمارهٔ سؤال…" inputMode="numeric" /><button type="submit">برو</button>
                </form>
                <div className="chips">{FILTERS.map(([k, l]) => <button type="button" key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
                <div className="map">{ord.map((n, i) => inFilter(n) && <button type="button" key={n} className={status(n) + (n === cur.v ? ' cur' : '') + (meta(n)?.star ? ' star' : '') + (bms.includes(n) ? ' bm' : '')} onClick={() => goTo(n)}>{P(i + 1)}</button>)}</div>
                <div className="legend"><i className="ok" />درست<i className="bad" />اشتباه<i className="sel" />پاسخ‌داده<i className="" />بی‌پاسخ</div>
              </>}
              {panel === 'marks' && st && <>
                <h4>نشانه‌ها ({P(bms.length)})</h4>
                <div className="list">{bms.map((n) => <button type="button" key={n} onClick={() => goTo(n)}><Bookmark size={15} /> سؤال {P(ord.indexOf(n) + 1)}<small>شمارهٔ کتاب {P(qno(n))}</small></button>)}{!bms.length && <p className="empty">با دکمهٔ نشانه (روبان) در نوار پایین، جای خود را علامت بزنید.</p>}</div>
                <h4>یادداشت‌ها</h4>
                <div className="list">{ord.filter((n) => meta(n)?.note).map((n) => <button type="button" key={n} onClick={() => goTo(n)}><StickyNote size={15} /> سؤال {P(ord.indexOf(n) + 1)}<small>{meta(n)!.note}</small></button>)}{!ord.some((n) => meta(n)?.note) && <p className="empty">هنوز یادداشتی ننوشته‌اید.</p>}</div>
                <h4>ستاره‌دارها</h4>
                <div className="list">{ord.filter((n) => meta(n)?.star).map((n) => <button type="button" key={n} onClick={() => goTo(n)}><Star size={15} /> سؤال {P(ord.indexOf(n) + 1)}</button>)}{!ord.some((n) => meta(n)?.star) && <p className="empty">ستاره‌ای نزده‌اید.</p>}</div>
              </>}
              {panel === 'store' && <>
                <div className="stat"><div><b>{P(done)}</b><small>پاسخ ثبت‌شده</small></div><div><b>{P(stor?.draws ?? 0)}</b><small>صفحهٔ نوشته‌دار</small></div><div><b>{P(bms.length)}</b><small>نشانه</small></div><div><b>{P(Object.values(lab.meta).filter((m) => m.b === book.id && m.note).length)}</b><small>یادداشت</small></div></div>
                {stor && <p className="hint">فضای نوشته‌های این کتاب: {bytesTxt(stor.bytes)}{stor.usage && stor.quota ? ` · کل حافظهٔ برنامه ${bytesTxt(stor.usage)} از ${bytesTxt(stor.quota)}` : ''}. همه‌چیز خودکار و روی همین دستگاه ذخیره می‌شود.</p>}
                <h4>پشتیبان‌گیری</h4>
                <div className="row2"><button type="button" onClick={exportAll}><Download size={16} /> ذخیرهٔ فایل پشتیبان</button><label className="btn"><Upload size={16} /> بازیابی از فایل<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importAll(f); e.target.value = ''; }} /></label></div>
                <p className="hint">پشتیبان شامل پاسخ‌ها، نوشته‌ها، نشانه‌ها، یادداشت‌ها، ستاره‌ها، ترتیب‌ها و تنظیم گزینه‌هاست.</p>
                <h4>ترتیب‌های ذخیره‌شده</h4>
                <div className="list">{saved.map((s) => <div key={s.name} className="srow"><button type="button" onClick={() => ordered('saved', s.name)}><ListTree size={15} /> {s.name}</button><button type="button" className="ic" onClick={() => delOrder(s.name)} aria-label="حذف"><Trash2 size={15} /></button></div>)}{!saved.length && <p className="empty">ترتیب فعلی را با نام ذخیره کنید تا بعداً برگردید.</p>}</div>
                <div className="row2"><button type="button" onClick={saveOrder}><Plus size={16} /> ذخیرهٔ ترتیب فعلی</button></div>
                <h4>مرتب‌سازی سریع</h4>
                <div className="chips">{[['book', 'ترتیب کتاب'], ['todo', 'بی‌پاسخ‌ها اول'], ['wrong', 'اشتباه‌ها اول'], ['star', 'ستاره‌دارها اول'], ['rand', 'تصادفی']].map(([k, l]) => <button type="button" key={k} onClick={() => ordered(k)}>{l}</button>)}<button type="button" className={edit ? 'on' : ''} onClick={() => { setEdit(!edit); setPanel(null); }}>جابه‌جایی دستی</button></div>
                <h4>پاک‌سازی</h4>
                <div className="row2"><button type="button" className="warn" onClick={clearDraws}><Trash2 size={16} /> پاک‌کردن همهٔ نوشته‌ها</button><button type="button" className="warn" onClick={resetAnswers}>پاک‌کردن پاسخ‌ها</button></div>
              </>}
              {panel === 'exam' && <>
                <h4>آزمون روی سؤال‌های {P(rng.from)} تا {P(rng.to || base.length)} ({P(ord.length)} سؤال)</h4>
                {exOn && ex.current ? <>
                  <div className="stat"><div><b>{mmss(ex.current.used)}</b><small>زمان سپری‌شده</small></div><div><b>{P(done)}</b><small>پاسخ‌داده</small></div><div><b>{ex.current.total ? mmss(ex.current.total) : '∞'}</b><small>زمان کل</small></div><div><b>{ex.current.per ? mmss(ex.current.per) : '—'}</b><small>سهم هر سؤال</small></div></div>
                  <div className="row2"><button type="button" onClick={() => saveResult()}>ذخیرهٔ نتیجهٔ فعلی</button><button type="button" className="warn" onClick={finishExam}>پایان آزمون</button></div>
                  <p className="hint">زمان هر سؤال فقط وقتی حساب می‌شود که روی صفحه است؛ با پایان سهمش هشدار می‌گیرید. «ذخیرهٔ نتیجهٔ فعلی» آزمون را متوقف نمی‌کند.</p>
                </> : <>
                  <label className="num2"><span>زمان کل (دقیقه، خالی = بدون محدودیت)</span><input value={exMin} onChange={(e) => setExMin(e.target.value)} inputMode="numeric" placeholder={P(Math.max(1, Math.round(ord.length * 1.5)))} /></label>
                  <label className="num2"><span>زمان هر سؤال (ثانیه، خالی = تقسیم مساوی)</span><input value={exPer} onChange={(e) => setExPer(e.target.value)} inputMode="numeric" placeholder="خودکار" /></label>
                  <div className="row2"><button type="button" className="pri" onClick={startExam}>شروع آزمون</button><button type="button" onClick={() => { setPanel('cfg'); }}>تغییر بازهٔ سؤال‌ها</button></div>
                  <p className="hint">در آزمون پاسخ‌ها پنهان می‌ماند، ساعت و زمان هر سؤال دیده می‌شود و با «پایان» نتیجه در آمار برنامه ثبت می‌شود. بدون آزمون هم هر وقت خواستید در «ذخیره» یا نوار بالا نتیجهٔ فعلی را ذخیره کنید.</p>
                  <div className="row2"><button type="button" onClick={() => saveResult()}>ذخیرهٔ نتیجهٔ فعلی (بدون آزمون)</button></div>
                </>}
              </>}
              {panel === 'cfg' && <>
                <h4>بازهٔ سؤال‌ها</h4>
                <div className="rangebox">
                  <label><span>از</span><input value={rf} onChange={(e) => setRf(e.target.value)} onBlur={applyRange} onKeyDown={(e) => { if (e.key === 'Enter') applyRange(); }} inputMode="numeric" /></label>
                  <label><span>تا</span><input value={rt} onChange={(e) => setRt(e.target.value)} onBlur={applyRange} onKeyDown={(e) => { if (e.key === 'Enter') applyRange(); }} inputMode="numeric" /></label>
                  <button type="button" onClick={() => setRange(1, 0)}>همه ({P(base.length)})</button>
                </div>
                <p className="hint">فقط سؤال‌های این بازه (طبق ترتیب فعلی) ساخته و نمایش داده می‌شوند؛ آمار و آزمون هم روی همین بازه است.</p>
                <h4>ظاهر</h4>
                <div className="seg">{([['paper', 'کاغذ'], ['sepia', 'کرم'], ['night', 'شب']] as const).map(([k, l]) => <button type="button" key={k} className={cfg.theme === k ? 'on' : ''} onClick={() => setCfg({ theme: k })}>{l}</button>)}</div>
                <div className="seg">{([[680, 'باریک'], [860, 'معمولی'], [1100, 'پهن']] as const).map(([k, l]) => <button type="button" key={k} className={cfg.width === k ? 'on' : ''} onClick={() => setCfg({ width: k })}>{l}</button>)}</div>
                <Switch on={cfg.autoHide} onChange={(v) => setCfg({ autoHide: v })} label="مخفی‌شدن خودکار نوارها" hint="با اسکرول مخفی می‌شوند و فقط با یک لمس برمی‌گردند؛ با قلم همیشه مخفی‌اند" />
                <h4>تشخیص نوشته</h4>
                <Switch on={cfg.circle} onChange={(v) => setCfg({ circle: v })} label="دایره دور گزینه = انتخاب پاسخ" hint="با قلم دور گزینه حلقه بکشید" />
                <label className="rng"><span>حساسیت تشخیص حلقه</span><input type="range" min={0} max={1} step={0.05} value={cfg.sens} onChange={(e) => setCfg({ sens: +e.target.value })} /><small>{cfg.sens < 0.34 ? 'دقیق' : cfg.sens > 0.66 ? 'آسان‌گیر' : 'متعادل'}</small></label>
                <Switch on={cfg.strike} onChange={(v) => setCfg({ strike: v })} label="خط روی گزینه = حذف گزینه" hint="گزینهٔ غلط را خط بزنید تا کم‌رنگ شود" />
                <Switch on={cfg.clearInk} onChange={(v) => setCfg({ clearInk: v })} label="پاک‌شدن خودکار خطِ تشخیص‌داده‌شده" hint="دایره/خط بعد از اعمال محو می‌شود" />
                <Switch on={cfg.haptic} onChange={(v) => setCfg({ haptic: v })} label="لرزش هنگام تشخیص" />
                <h4>پاسخ‌دادن</h4>
                <Switch on={cfg.tapPick} onChange={(v) => setCfg({ tapPick: v })} label="انتخاب با لمس گزینه" hint="خاموش کنید تا لمس اتفاقی پاسخ نزند" />
                <Switch on={cfg.quiet} onChange={(v) => { setCfg({ quiet: v }); setChecked(false); }} label="حالت آزمون (بدون نمایش پاسخ)" hint="با دکمهٔ «تصحیح» همه‌چیز یک‌جا نمایش داده می‌شود" />
                <h4>میان‌بُرها</h4>
                <p className="hint">J / K بعدی و قبلی · ۱ تا ۴ انتخاب گزینه · S ستاره · B نشانه · D قلم · G فهرست · + / − بزرگ‌نمایی · Esc بستن</p>
              </>}
            </div>
          </div>
        </div>)}

      {noteFor !== null && (
        <div className="bkv-pan" role="dialog" aria-label="یادداشت">
          <div className="bkv-back" onClick={() => setNoteFor(null)} />
          <div className="bkv-sh small"><div className="grab" /><div className="bd"><h4>یادداشت سؤال {P(st ? ord.indexOf(noteFor) + 1 : 0)}</h4>
            <textarea value={noteTxt} onChange={(e) => setNoteTxt(e.target.value)} placeholder="نکته، دلیل اشتباه، فرمول…" autoFocus rows={5} />
            <div className="row2"><button type="button" className="pri" onClick={saveNote}>ذخیره</button><button type="button" onClick={() => setNoteFor(null)}>انصراف</button></div></div></div>
        </div>)}
      {res && (
        <div className="bkv-pan" role="dialog" aria-label="نتیجه">
          <div className="bkv-back" onClick={() => setRes(null)} />
          <div className="bkv-sh small"><div className="grab" /><div className="bd"><h4>{res.fin ? 'نتیجهٔ آزمون' : 'نتیجه ذخیره شد'}</h4>
            <div className="stat"><div><b>{P(res.a.correct)}</b><small>درست</small></div><div><b>{P(res.a.wrong)}</b><small>غلط</small></div><div><b>{P(res.a.blank)}</b><small>نزده</small></div><div><b>{P(res.a.pct)}٪</b><small>درصد</small></div></div>
            <p className="hint">زمان: {mmss(res.a.seconds)} · در بخش آمار برنامه هم ثبت شد.</p>
            <div className="row2"><button type="button" className="pri" onClick={() => { setRes(null); if (res.fin) { setCfg({ quiet: true }); setChecked(true); } }}>{res.fin ? 'مرور و تصحیح' : 'ادامه'}</button></div></div></div>
        </div>)}
      {toast && <div className="bkv-toast" role="status">{toast}</div>}
    </div>
  );
};

/* ================================================================ floating bottom dock */
const Dock: React.FC<{ cur: CurStore; order: number[]; z: number; cfg: Cfg; meta: (n: number) => any; bm: (n: number) => boolean; spaceOpen: boolean; setSpaceOpen: (v: boolean) => void; dr: ReturnType<typeof useDraw>;
  onStep: (d: number) => void; onToc: () => void; onMenu: () => void; onStar: (n: number) => void; onNote: (n: number) => void; onBm: (n: number) => void; onZoom: (z: number) => void; onSlide: (i: number) => void }> = (p) => {
  const n = useSub(p.cur); const pos = Math.max(0, p.order.indexOf(n)); const m = p.meta(n);
  const sp = (op: string) => window.dispatchEvent(new CustomEvent('bkv:space', { detail: { n, op } }));
  return (
    <footer className="bkv-dock">
      {p.spaceOpen && <div className="bkv-space"><span>جای حل</span><button type="button" onClick={() => sp('more')}>+ بیشتر</button><button type="button" onClick={() => sp('less')}>− کمتر</button><button type="button" onClick={() => sp('bg')}>نوع کاغذ</button><button type="button" onClick={() => sp('clear')}>پاک‌کردن نوشته</button></div>}
      <input className="sld" type="range" min={0} max={Math.max(0, p.order.length - 1)} value={pos} style={{ direction: 'ltr' }} onChange={(e) => p.onSlide(+e.target.value)} aria-label="صفحه" />
      <div className="pill">
        <button type="button" className="ic" onClick={() => p.onStep(-1)} aria-label="سؤال قبلی"><ChevronRight size={20} /></button>
        <button type="button" className="num" onClick={p.onToc}><b>{P(pos + 1)}</b><small>از {P(p.order.length)}</small></button>
        <button type="button" className="ic" onClick={() => p.onStep(1)} aria-label="سؤال بعدی"><ChevronLeft size={20} /></button>
        <span className="sep" />
        <button type="button" className={'ic' + (m?.star ? ' on star' : '')} onClick={() => n && p.onStar(n)} aria-label="ستاره"><Star size={19} /></button>
        <button type="button" className={'ic' + (m?.note ? ' on' : '')} onClick={() => n && p.onNote(n)} aria-label="یادداشت"><StickyNote size={19} /></button>
        <button type="button" className={'ic' + (p.bm(n) ? ' on' : '')} onClick={() => n && p.onBm(n)} aria-label="نشانه"><Bookmark size={19} /></button>
        <button type="button" className={'ic' + (p.spaceOpen ? ' on' : '')} onClick={() => p.setSpaceOpen(!p.spaceOpen)} aria-label="جای حل"><Plus size={19} /></button>
        <span className="sep" />
        <button type="button" className={'ic pen' + (p.dr?.on ? ' on' : '')} onClick={() => p.dr?.setOn(!p.dr.on)} aria-label="قلم"><Pencil size={19} /></button>
        <button type="button" className="ic" onClick={p.onMenu} aria-label="منو"><MoreHorizontal size={20} /></button>
      </div>
      <div className="zoom"><button type="button" onClick={() => p.onZoom(p.z - 0.25)}>−</button><button type="button" onClick={() => p.onZoom(1)}>{P(Math.round(p.z * 100))}٪</button><button type="button" onClick={() => p.onZoom(p.z + 0.25)}>+</button></div>
    </footer>
  );
};

/* ink of pages that are not on screen (undo reaching them, «clear everything») is written straight to storage */
const inkKey = (bid: string, n: number) => 'draw:book:' + bid + ':' + keyOf(bid, n);
async function offlineInk(bid: string, n: number, strokes: Stroke[]) { const k = inkKey(bid, n); const d: any = (await kvGet(k)) || { v: 1, strokes: [], extra: 0, bg: 'blank' }; const nd = { ...d, strokes }; if (!strokes.length && !nd.extra) await kvDel(k); else await kvSet(k, nd); }
async function wipeInk(bid: string) { for (const e of await kvEntries<any>('draw:book:' + bid + ':')) { const d = e.v; if (!d?.strokes?.length) continue; if (d.extra) await kvSet(e.k, { ...d, strokes: [] }); else await kvDel(e.k); } }

/* ================================================================ the shelf */
const HUE = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const BookView: React.FC<{ lab: Lab; onBack: () => void }> = ({ lab, onBack }) => {
  const [open, setOpen] = useState<string | null>(null); const [prog, setProg] = useState<Record<string, number>>({});
  useEffect(() => { if (open) { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; } }, [open]);
  useEffect(() => { let off = false; (async () => { const r: Record<string, number> = {}; for (const b of lab.books) { const v = await kvGet<St>('bookview:' + b.id); r[b.id] = v ? Object.values(v.picks || {}).filter(Boolean).length : 0; } if (!off) setProg(r); })(); return () => { off = true; }; }, [lab.books, open]);
  return (
    <section className="bkv-shelf">
      <header className="sh-h"><h3><BookOpen size={22} /> کتاب زنده</h3><p>کتاب را مثل یک کتاب‌خوان تمام‌صفحه باز کنید: روی گزینهٔ چاپی بزنید یا دورش دایره بکشید، روی صفحه بنویسید، بزرگ کنید؛ همه‌چیز ذخیره و در آمار برنامه ثبت می‌شود.</p></header>
      {!lab.books.length && <div className="bk-emptybox"><b>اول یک کتاب در «کتابخانه» وارد کنید.</b></div>}
      <div className="sh-grid">{lab.books.map((b) => { const hu = HUE(b.id), pr = prog[b.id] || 0, tot = b.numbers.length || 1; return (
        <button type="button" key={b.id} className="sh-book" style={{ ['--h' as any]: hu }} onClick={() => setOpen(b.id)}>
          <span className="spine" /><span className="t">{b.title}</span><span className="s">{b.subject || ''}</span>
          <span className="m">{P(b.numbers.length)} سؤال{pr ? ` · ${P(pr)} پاسخ` : ''}</span>
          <span className="pg"><i style={{ width: Math.min(100, (pr / tot) * 100) + '%' }} /></span><span className="go">{pr ? 'ادامهٔ مطالعه' : 'باز کردن کتاب'} ←</span>
        </button>); })}</div>
      <button type="button" className="bk-btn" onClick={onBack}>بازگشت</button>
      {open && lab.bookMap.get(open) && createPortal(<DrawProvider offline={(id, st) => offlineInk(open, +id.slice(2), st)} wipe={() => wipeInk(open)}><Reader lab={lab} bid={open} onClose={() => setOpen(null)} /></DrawProvider>, document.body)}
    </section>
  );
};
