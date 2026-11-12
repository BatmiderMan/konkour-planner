import React from 'react';
import { Check, ChevronLeft, ChevronRight, ImagePlus, Link2, Plus, RotateCcw, Star, X } from 'lucide-react';
import { TopicPicker } from '../components/tracker/TopicPicker';
import { confirmDialog } from '../dialog';
import { useBackToClose } from '../useBackToClose';
import { BOOKS, BY_UNIT } from '../trackerStore';
import { labelForUnits } from '../trackerPlan';
import { loadSettings } from '../examStore';
import { toPersianDigits as P } from '../utils';
import { useSyncStatus } from '../sync';
import { supabase } from '../supabase';
import { renderImage } from './image';
import { VaultQ, VaultWhy, WHY, getVault, newId, putQuestion } from './store';
import type { BulkDraft } from './launch';
import './vault.css';
import './bulk.css';

/* ============================================================================================
   Bulk importer: choose many pictures → every 2 pictures become one question
   (1st = the question, 2nd = its explained answer) → set the right option of each → save all.
   ============================================================================================ */

const LAST = 'planex_vault_last_v1';
const readLast = (): Partial<VaultQ> => { try { return JSON.parse(localStorage.getItem(LAST) || '{}') || {}; } catch { return {}; } };

type Mode = 1 | 2;
type Order = 'time' | 'name' | 'pick';
interface Img { id: string; file: File; rot: number; url: string }
interface Card { id: string; q: Img; e: Img | null; answer: number; star: boolean; why: VaultWhy | ''; open: boolean; err?: string }
interface Common { book: string; lesson: string; units: string[]; why: VaultWhy; choices: number }
type Phase = 'pick' | 'busy' | 'review' | 'saving' | 'done';

const fkey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
const isImg = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif|bmp|gif)$/i.test(f.name);
const sortFiles = (fs: File[], o: Order) => {
  if (o === 'pick') return fs;
  const c = [...fs];
  if (o === 'name') return c.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  return c.sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name, 'en', { numeric: true }));
};
const topCount = (xs: string[], n: number): string[] => {
  const m: Record<string, number> = {};
  xs.forEach((x) => { if (x) m[x] = (m[x] || 0) + 1; });
  return Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, n);
};
const mkCard = (q: Img, e: Img | null, open: boolean): Card => ({ id: newId(), q, e, answer: 0, star: false, why: '', open });

/** every 2 pictures = one card; a lone last picture stays "open" and takes the next picture as its explanation */
function pairUp(prev: Card[], imgs: Img[], mode: Mode): Card[] {
  const out = prev.map((c) => ({ ...c }));
  let i = 0;
  const last = out[out.length - 1];
  if (mode === 2 && last && last.open && imgs.length) { last.e = imgs[0]; last.open = false; i = 1; }
  while (i < imgs.length) {
    const q = imgs[i++];
    if (mode === 2 && i < imgs.length) out.push(mkCard(q, imgs[i++], false));
    else out.push(mkCard(q, null, mode === 2));
  }
  return out;
}

/* ------------------------------------------------------------------------------ one card */
interface CardProps {
  c: Card; n: number; choices: number; common: Common; menu: boolean;
  onAnswer: (id: string, k: number) => void; onOpen: (id: string) => void; onMenu: (id: string | null) => void;
  onAct: (id: string, act: string) => void;
}
const CardView = React.memo(({ c, n, choices, common, menu, onAnswer, onOpen, onMenu, onAct }: CardProps) => {
  const done = c.answer > 0;
  return (
    <article className={'vb-card' + (done ? ' done' : '') + (c.err ? ' err' : '')} style={{ ['--i' as string]: Math.min(n, 12) }}>
      <div className="vb-ch">
        <span className="vb-no">{P(n)}</span>
        {c.why && c.why !== common.why && <span className={'vt-tag ' + WHY[c.why].g}>{WHY[c.why].l}</span>}
        {c.open && <span className="vt-tag n">منتظر عکس پاسخ</span>}
        <span className="grow" />
        <button type="button" className={'vt-ib' + (c.star ? ' on' : '')} aria-label="نشان‌دار" aria-pressed={c.star} onClick={() => onAct(c.id, 'star')}><Star size={16} /></button>
        <div className="vb-menuwrap">
          <button type="button" className="vt-ib" aria-label="گزینه‌های بیشتر" aria-expanded={menu} onClick={(e) => { e.stopPropagation(); onMenu(menu ? null : c.id); }}>⋯</button>
          {menu && (
            <div className="vb-menu" role="menu">
              {c.e && <button type="button" role="menuitem" onClick={() => onAct(c.id, 'swap')}>⇄ جابجایی سؤال و پاسخ</button>}
              {c.e && <button type="button" role="menuitem" onClick={() => onAct(c.id, 'split')}>✂ عکس دوم سؤال جدا باشد</button>}
              {c.e && <button type="button" role="menuitem" onClick={() => onAct(c.id, 'noe')}>بدون پاسخ تشریحی</button>}
              {!c.e && <button type="button" role="menuitem" onClick={() => onAct(c.id, 'next')}>سؤال بعدی را پاسخ این بگیر</button>}
              <button type="button" role="menuitem" className="d" onClick={() => onAct(c.id, 'del')}>حذف این سؤال</button>
            </div>
          )}
        </div>
      </div>
      <div className={'vb-media' + (c.e ? '' : ' one')}>
        <figure>
          <button type="button" className="vb-thumb" onClick={() => onOpen(c.id)} aria-label={'بازکردن سؤال ' + P(n)}><img src={c.q.url} alt="" decoding="async" loading="lazy" /></button>
          <figcaption>سؤال</figcaption>
          <button type="button" className="vb-rot" aria-label="چرخاندن" onClick={() => onAct(c.id, 'rotq')}><RotateCcw size={14} /></button>
        </figure>
        {c.e ? (
          <figure>
            <button type="button" className="vb-thumb" onClick={() => onOpen(c.id)} aria-label={'بازکردن پاسخ ' + P(n)}><img src={c.e.url} alt="" decoding="async" loading="lazy" /></button>
            <figcaption>پاسخ تشریحی</figcaption>
            <button type="button" className="vb-rot" aria-label="چرخاندن" onClick={() => onAct(c.id, 'rote')}><RotateCcw size={14} /></button>
          </figure>
        ) : null}
      </div>
      <div className="vb-opts" role="group" aria-label={'گزینهٔ درست سؤال ' + P(n)}>
        {Array.from({ length: choices }, (_, i) => (
          <button key={i} type="button" className={c.answer === i + 1 ? 'on' : ''} aria-pressed={c.answer === i + 1} onClick={() => onAnswer(c.id, i + 1)}>{P(i + 1)}</button>
        ))}
      </div>
      {c.err && <div className="vb-err">{c.err}</div>}
    </article>
  );
});

/* ------------------------------------------------------------------------------ focus viewer */
const Focus: React.FC<{
  cards: Card[]; index: number; choices: number; common: Common;
  onIndex: (i: number) => void; onAnswer: (id: string, k: number) => void; onAct: (id: string, act: string) => void; onWhy: (id: string, w: VaultWhy | '') => void; onClose: () => void;
}> = ({ cards, index, choices, common, onIndex, onAnswer, onAct, onWhy, onClose }) => {
  const c = cards[index];
  const left = cards.filter((x) => !x.answer).length;
  const go = React.useCallback((d: number) => onIndex(Math.max(0, Math.min(cards.length - 1, index + d))), [cards.length, index, onIndex]);
  const answer = React.useCallback((k: number) => {
    if (!c) return;
    onAnswer(c.id, k);
    if (c.answer !== k) {
      // jump to the next card that still needs an answer
      window.setTimeout(() => {
        for (let s = 1; s <= cards.length; s++) { const j = (index + s) % cards.length; if (!cards[j].answer && cards[j].id !== c.id) { onIndex(j); return; } }
      }, 230);
    }
  }, [c, cards, index, onAnswer, onIndex]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(-1); }
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= choices) { e.preventDefault(); answer(Number(e.key)); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, answer, onClose, choices]);

  // swipe left / right between questions
  const sx = React.useRef<number | null>(null);
  if (!c) return null;
  return (
    <div className="vb-focus" role="dialog" aria-modal="true" aria-label="بررسی سؤال‌ها">
      <div className="vb-fbar">
        <button type="button" className="vt-ib" onClick={onClose} aria-label="بستن"><X size={20} /></button>
        <b>{P(index + 1)} از {P(cards.length)}</b>
        <span className="grow" />
        <span className="vb-left">{left ? `${P(left)} سؤال بدون پاسخ` : 'همه پاسخ داده شد ✓'}</span>
        <button type="button" className={'vt-ib' + (c.star ? ' on' : '')} aria-label="نشان‌دار" onClick={() => onAct(c.id, 'star')}><Star size={18} /></button>
      </div>
      <div
        className="vb-fbody"
        onTouchStart={(e) => { sx.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { if (sx.current === null) return; const dx = e.changedTouches[0].clientX - sx.current; sx.current = null; if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1); }}
      >
        <div className="vb-fimg"><span>سؤال</span><img src={c.q.url} alt="سؤال" /><button type="button" className="vb-rot big" aria-label="چرخاندن" onClick={() => onAct(c.id, 'rotq')}><RotateCcw size={16} /></button></div>
        {c.e && <div className="vb-fimg e"><span>پاسخ تشریحی</span><img src={c.e.url} alt="پاسخ تشریحی" /><button type="button" className="vb-rot big" aria-label="چرخاندن" onClick={() => onAct(c.id, 'rote')}><RotateCcw size={16} /></button></div>}
        <div className="vb-chips">
          {(Object.keys(WHY) as VaultWhy[]).map((k) => (
            <button key={k} type="button" className={'vt-chip ' + WHY[k].g + ((c.why || common.why) === k ? ' on' : '')} onClick={() => onWhy(c.id, k === common.why ? '' : k)}>{WHY[k].l}</button>
          ))}
        </div>
      </div>
      <div className="vb-fdock">
        <button type="button" className="vb-nav" onClick={() => go(-1)} disabled={index === 0} aria-label="قبلی"><ChevronRight size={22} /></button>
        <div className="vb-opts big" role="group" aria-label="گزینهٔ درست">
          {Array.from({ length: choices }, (_, i) => <button key={i} type="button" className={c.answer === i + 1 ? 'on' : ''} aria-pressed={c.answer === i + 1} onClick={() => answer(i + 1)}>{P(i + 1)}</button>)}
        </div>
        <button type="button" className="vb-nav" onClick={() => go(1)} disabled={index === cards.length - 1} aria-label="بعدی"><ChevronLeft size={22} /></button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------------ the importer */
export const VaultBulk: React.FC<{ draft: BulkDraft; onClose: () => void }> = ({ draft, onClose }) => {
  const items = getVault().items;
  const sync = useSyncStatus();
  const [phase, setPhase] = React.useState<Phase>('pick');
  const [cards, setCards] = React.useState<Card[]>([]);
  const [mode, setMode] = React.useState<Mode>(2);
  const [order, setOrder] = React.useState<Order>('time');
  const [common, setCommon] = React.useState<Common>(() => {
    const l = readLast();
    return { book: draft.book ?? l.book ?? '', lesson: draft.lesson ?? l.lesson ?? '', units: draft.units || [], why: (l.why as VaultWhy) || 'wrong', choices: l.choices || 4 };
  });
  const [setOpen, setSetOpen] = React.useState(true);
  const [picker, setPicker] = React.useState(false);
  const [filter, setFilter] = React.useState<'all' | 'todo'>('all');
  const [menu, setMenu] = React.useState<string | null>(null);
  const [focus, setFocus] = React.useState<number | null>(null);
  const [prog, setProg] = React.useState({ done: 0, total: 0 });
  const [skipped, setSkipped] = React.useState(0);
  const [result, setResult] = React.useState({ saved: 0, failed: 0 });
  const fileRef = React.useRef<HTMLInputElement>(null);
  const camRef = React.useRef<HTMLInputElement>(null);
  const seen = React.useRef<Set<string>>(new Set());
  const urls = React.useRef<Set<string>>(new Set());
  const cardsRef = React.useRef(cards); cardsRef.current = cards;
  const modeRef = React.useRef(mode); modeRef.current = mode;
  const orderRef = React.useRef(order); orderRef.current = order;

  const mkUrl = (b: Blob) => { const u = URL.createObjectURL(b); urls.current.add(u); return u; };
  const dropUrl = (u: string) => { if (urls.current.delete(u)) URL.revokeObjectURL(u); };
  React.useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); urls.current.clear(); }, []);

  const dirty = cards.length > 0 && phase !== 'done';
  const requestClose = React.useCallback(async () => {
    if (cardsRef.current.length && phase !== 'done' && !(await confirmDialog('عکس‌های انتخاب‌شده ذخیره نشده‌اند. خارج شوید؟'))) return;
    onClose();
  }, [onClose, phase]);
  useBackToClose(true, () => { void requestClose(); });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && focus === null && picker === false) { e.stopPropagation(); void requestClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [requestClose, focus, picker]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /* ---- take pictures: thumbnails first (3 at a time), then pair them */
  const take = React.useCallback(async (list: File[], keepOrder = false) => {
    let files = list.filter(isImg);
    const fresh = files.filter((f) => !seen.current.has(fkey(f)));
    const dup = files.length - fresh.length;
    files = keepOrder ? fresh : sortFiles(fresh, orderRef.current);
    if (!files.length) { setSkipped(dup); if (!cardsRef.current.length) setPhase('pick'); return; }
    setPhase('busy'); setProg({ done: 0, total: files.length }); setSkipped(dup);
    const out: Array<Img | null> = new Array(files.length).fill(null);
    let next = 0, done = 0;
    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= files.length) return;
        try {
          const b = await renderImage(files[i], 900, 0.8, 0);
          out[i] = { id: newId(), file: files[i], rot: 0, url: mkUrl(b) };
          seen.current.add(fkey(files[i]));
        } catch { /* unreadable picture: skipped */ }
        done++; setProg({ done, total: files.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const imgs = out.filter(Boolean) as Img[];
    setSkipped(dup + (files.length - imgs.length));
    setCards((prev) => pairUp(prev, imgs, modeRef.current));
    setPhase(imgs.length || cardsRef.current.length ? 'review' : 'pick');
  }, []);

  React.useEffect(() => { if (draft.files?.length) void take(draft.files); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- card operations */
  const patch = (id: string, f: (c: Card) => Card) => setCards((cs) => cs.map((c) => (c.id === id ? f(c) : c)));
  const answer = React.useCallback((id: string, k: number) => patch(id, (c) => ({ ...c, answer: c.answer === k ? 0 : k, err: undefined })), []);
  const rotate = async (id: string, which: 'q' | 'e') => {
    const c = cardsRef.current.find((x) => x.id === id); const im = c && c[which];
    if (!im) return;
    const rot = (im.rot + 270) % 360;
    try {
      const url = mkUrl(await renderImage(im.file, 900, 0.8, rot));
      const old = im.url;
      setCards((cs) => cs.map((x) => (x.id === id && x[which] ? { ...x, [which]: { ...(x[which] as Img), rot, url } } : x)));
      window.setTimeout(() => dropUrl(old), 400);
    } catch { /* ignore */ }
  };
  const act = React.useCallback((id: string, a: string) => {
    setMenu(null);
    if (a === 'rotq') { void rotate(id, 'q'); return; }
    if (a === 'rote') { void rotate(id, 'e'); return; }
    setCards((cs) => {
      const i = cs.findIndex((x) => x.id === id);
      if (i < 0) return cs;
      const c = cs[i];
      const out = cs.slice();
      if (a === 'star') out[i] = { ...c, star: !c.star };
      else if (a === 'swap' && c.e) out[i] = { ...c, q: c.e, e: c.q };
      else if (a === 'noe') out[i] = { ...c, e: null, open: false };
      else if (a === 'split' && c.e) { out[i] = { ...c, e: null, open: false }; out.splice(i + 1, 0, mkCard(c.e, null, false)); }
      else if (a === 'next' && !c.e && cs[i + 1]) { out[i] = { ...c, e: cs[i + 1].q, open: false }; out.splice(i + 1, 1); }
      else if (a === 'del') { [c.q, c.e].forEach((m) => { if (m) window.setTimeout(() => dropUrl(m.url), 400); }); out.splice(i, 1); }
      return out;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setWhy = React.useCallback((id: string, w: VaultWhy | '') => patch(id, (c) => ({ ...c, why: w })), []);
  const setC = (p: Partial<Common>) => setCommon((c) => ({ ...c, ...p }));
  const setChoices = (n: number) => { setC({ choices: n }); setCards((cs) => cs.map((c) => (c.answer > n ? { ...c, answer: 0 } : c))); };
  const swapAll = () => setCards((cs) => cs.map((c) => (c.e ? { ...c, q: c.e, e: c.q } : c)));
  const firstTodo = () => { const i = cards.findIndex((c) => !c.answer); if (i >= 0) setFocus(i); };

  /* ---- stats */
  const answered = cards.filter((c) => c.answer > 0).length;
  const total = cards.length;
  const left = total - answered;
  const shown = React.useMemo(() => cards.map((c, i) => ({ c, n: i + 1 })).filter((x) => filter === 'all' || !x.c.answer), [cards, filter]);
  const noE = cards.filter((c) => !c.e).length;
  const needBook = !common.book.trim();
  const books = React.useMemo(() => topCount(items.map((x) => x.book), 5), [items]);
  const lessons = React.useMemo(() => topCount(items.filter((x) => x.book === common.book).map((x) => x.lesson), 5), [items, common.book]);
  const bookHints = React.useMemo(() => Array.from(new Set([...items.map((x) => x.book), ...BOOKS.map((b) => b.subject), ...loadSettings().sources.map((s) => s.name)])), [items]);

  /* ---- save everything that has an answer */
  const save = async () => {
    if (needBook || !answered) return;
    if (left > 0 && !(await confirmDialog(`${P(left)} سؤال هنوز پاسخ ندارد. فقط ${P(answered)} سؤال پاسخ‌دار ذخیره شود و بقیه بماند؟`))) return;
    const todo = cards.filter((c) => c.answer > 0);
    setPhase('saving'); setProg({ done: 0, total: todo.length });
    const base = Date.now();
    const okIds = new Set<string>(); const bad: Record<string, string> = {};
    for (let i = 0; i < todo.length; i++) {
      const c = todo[i];
      try {
        const qb = await renderImage(c.q.file, 1500, 0.85, c.q.rot);
        const eb = c.e ? await renderImage(c.e.file, 1500, 0.85, c.e.rot) : undefined;
        const rec: VaultQ = {
          tries: 0, wins: 0, box: 0, due: 0, last: 0,
          id: newId(), created: base + (todo.length - i), updated: base + i, // the first picture of the batch is the first in the list
          book: common.book.trim(), lesson: common.lesson.trim(), why: c.why || common.why, cause: '', choices: common.choices, answer: c.answer, diff: 0,
          etext: '', star: c.star, hasEimg: !!eb, units: common.units.filter((u) => BY_UNIT[u])
        };
        await putQuestion(rec, { q: qb, ...(eb ? { e: eb } : {}) });
        okIds.add(c.id);
      } catch { bad[c.id] = 'ذخیره نشد؛ دوباره امتحان کنید.'; }
      setProg({ done: i + 1, total: todo.length });
      await new Promise((r) => window.setTimeout(r, 0)); // let the screen breathe between pictures
    }
    try { localStorage.setItem(LAST, JSON.stringify({ book: common.book.trim(), lesson: common.lesson.trim(), why: common.why, choices: common.choices, diff: 0 })); } catch { /* ignore */ }
    const gone = cardsRef.current.filter((c) => okIds.has(c.id));
    gone.forEach((c) => [c.q, c.e].forEach((m) => m && dropUrl(m.url)));
    setCards((cs) => cs.filter((c) => !okIds.has(c.id)).map((c) => (bad[c.id] ? { ...c, err: bad[c.id] } : c)));
    setResult({ saved: okIds.size, failed: Object.keys(bad).length });
    setPhase('done');
  };

  const more = () => { setPhase(cardsRef.current.length ? 'review' : 'pick'); };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>, keep = false) => {
    const fs = Array.from(e.target.files || []); e.target.value = '';
    if (fs.length) void take(fs, keep);
  };

  /* ================================================================ render */
  const chip = (key: string, label: string, on: boolean, click: () => void, cls = '') => (
    <button key={key} type="button" className={'vt-chip ' + cls + (on ? ' on' : '')} aria-pressed={on} onClick={click}>{label}</button>
  );

  const picker0 = (
    <div className="vb-pick">
      <div
        className="vb-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void take(Array.from(e.dataTransfer.files)); }}
      >
        <div className="vb-demo" aria-hidden="true">
          <div className="vb-pair"><i>۱</i><i className="e">۲</i><b>سؤال ۱</b></div>
          <div className="vb-pair"><i>۳</i><i className="e">۴</i><b>سؤال ۲</b></div>
          <div className="vb-pair"><i>۵</i><i className="e">۶</i><b>سؤال ۳</b></div>
        </div>
        <h2>چندین عکس را یکجا وارد کنید</h2>
        <p>{mode === 2 ? 'هر دو عکس پشت‌سرهم می‌شود یک سؤال: عکس اول خودِ سؤال، عکس دوم پاسخ تشریحی.' : 'هر عکس می‌شود یک سؤال.'}</p>
        <button type="button" className="vt-btn go big" onClick={() => fileRef.current?.click()}><ImagePlus size={20} /> انتخاب عکس‌ها از گالری</button>
        <button type="button" className="vt-btn" onClick={() => camRef.current?.click()}>عکس گرفتن با دوربین</button>
        <span className="vt-hint">یا عکس‌ها را اینجا رها کنید</span>
      </div>
      <div className="vb-opt">
        <div className="vt-lb">هر سؤال چند عکس دارد؟</div>
        <div className="vt-seg">
          <button type="button" className={mode === 2 ? 'on' : ''} onClick={() => setMode(2)}>۲ عکس · سؤال + پاسخ</button>
          <button type="button" className={mode === 1 ? 'on' : ''} onClick={() => setMode(1)}>۱ عکس · فقط سؤال</button>
        </div>
      </div>
      <div className="vb-opt">
        <div className="vt-lb">ترتیب عکس‌ها</div>
        <div className="vt-seg">
          <button type="button" className={order === 'time' ? 'on' : ''} onClick={() => setOrder('time')}>زمان گرفتن عکس</button>
          <button type="button" className={order === 'name' ? 'on' : ''} onClick={() => setOrder('name')}>نام فایل</button>
          <button type="button" className={order === 'pick' ? 'on' : ''} onClick={() => setOrder('pick')}>ترتیب انتخاب</button>
        </div>
        <p className="vt-hint">عکس‌ها را به همان ترتیبی که گرفته‌اید مرتب می‌کند تا جفت‌ها درست بیفتند. اگر جفت‌ها جابه‌جا شد، بعداً در هر کارت می‌توانید اصلاحش کنید.</p>
      </div>
      {skipped > 0 && <p className="vt-hint">{P(skipped)} عکس تکراری یا نامعتبر نادیده گرفته شد.</p>}
    </div>
  );

  const settings = (
    <section className={'vb-set' + (setOpen ? ' open' : '')}>
      <button type="button" className="vb-sethead" aria-expanded={setOpen} onClick={() => setSetOpen((o) => !o)}>
        <b>تنظیمات مشترک همهٔ سؤال‌ها</b>
        <span className={needBook ? 'warn' : ''}>
          {needBook ? 'نام کتاب را وارد کنید' : [common.book, common.lesson, WHY[common.why].l, P(common.choices) + ' گزینه‌ای'].filter(Boolean).join(' · ')}
        </span>
        <i aria-hidden="true">{setOpen ? '▴' : '▾'}</i>
      </button>
      {setOpen && (
        <div className="vb-setbody">
          <div className="vt-sec">
            <div className="vt-lb">از کجاست؟</div>
            {books.length > 0 && <div className="vt-chips">{books.map((b) => chip('b' + b, b, b === common.book, () => setC({ book: b, lesson: '' })))}</div>}
            <div className="vt-row">
              <input className="vt-in" list="vb-books" value={common.book} onChange={(e) => setC({ book: e.target.value })} placeholder="کتاب / منبع" aria-label="کتاب یا منبع" />
              <input className="vt-in" value={common.lesson} onChange={(e) => setC({ lesson: e.target.value })} placeholder="درس / فصل (اختیاری)" aria-label="درس یا فصل" />
            </div>
            <datalist id="vb-books">{bookHints.map((b) => <option key={b} value={b} />)}</datalist>
            {lessons.length > 0 && <div className="vt-chips">{lessons.map((l) => chip('l' + l, l, l === common.lesson, () => setC({ lesson: l })))}</div>}
            <div className="vt-topic">
              {common.units.length > 0 && (
                <span className="vt-linked"><Link2 size={14} />{labelForUnits(common.units.slice(0, 1)) || 'مبحث'}{common.units.length > 1 ? ` + ${P(common.units.length - 1)} مبحث دیگر` : ''}
                  <button type="button" aria-label="حذف پیوند" onClick={() => setC({ units: [] })}><X size={13} /></button></span>
              )}
              <button type="button" className="vt-btn" onClick={() => setPicker(true)}><Link2 size={16} /> {common.units.length ? 'تغییر مبحث' : 'پیوند به مبحث درسی'}</button>
            </div>
          </div>
          <div className="vt-sec">
            <div className="vt-lb">چه اتفاقی افتاد؟ (برای همه؛ هر سؤال را می‌توان جدا عوض کرد)</div>
            <div className="vt-chips">{(Object.keys(WHY) as VaultWhy[]).map((k) => chip(k, WHY[k].l, k === common.why, () => setC({ why: k }), WHY[k].g))}</div>
          </div>
          <div className="vt-sec">
            <div className="vt-lb">چند گزینه‌ای؟</div>
            <div className="vt-seg">{[2, 3, 4, 5, 6].map((n) => <button key={n} type="button" className={common.choices === n ? 'on' : ''} onClick={() => setChoices(n)}>{P(n)}</button>)}</div>
          </div>
        </div>
      )}
    </section>
  );

  const review = (
    <>
      {settings}
      <div className="vb-bar">
        <div className="vb-prog" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}>
          <div style={{ width: total ? (answered / total) * 100 + '%' : '0%' }} />
        </div>
        <div className="vb-barrow">
          <span><b>{P(answered)}</b> از {P(total)} سؤال پاسخ داده شد</span>
          <span className="grow" />
          {left > 0 && <button type="button" className="vt-btn" onClick={firstTodo}>پاسخ‌دهی سریع ←</button>}
        </div>
        <div className="vt-chips">
          {chip('all', `همه (${P(total)})`, filter === 'all', () => setFilter('all'))}
          {chip('todo', `بدون پاسخ (${P(left)})`, filter === 'todo', () => setFilter('todo'))}
          <button type="button" className="vt-chip" onClick={() => fileRef.current?.click()}><Plus size={13} style={{ verticalAlign: '-2px' }} /> عکس بیشتر</button>
          <button type="button" className="vt-chip" onClick={() => camRef.current?.click()}>دوربین</button>
          {cards.some((c) => c.e) && <button type="button" className="vt-chip" onClick={swapAll} title="اگر عکس پاسخ را اول گرفته‌اید">⇄ جابجایی سؤال/پاسخ همه</button>}
        </div>
        {noE > 0 && mode === 2 && <p className="vt-hint">{P(noE)} سؤال عکس پاسخ ندارد. اگر جفت‌ها جابه‌جا شده‌اند، از منوی ⋯ هر کارت اصلاحشان کنید.</p>}
        {skipped > 0 && <p className="vt-hint">{P(skipped)} عکس تکراری یا نامعتبر نادیده گرفته شد.</p>}
      </div>
      {shown.length === 0 && <div className="vb-empty">همهٔ سؤال‌ها پاسخ دارند 🎉<br /><span className="vt-sub">حالا ذخیره کنید.</span></div>}
      <div className="vb-grid" onClick={() => menu && setMenu(null)}>
        {shown.map(({ c, n }) => (
          <CardView key={c.id} c={c} n={n} choices={common.choices} common={common} menu={menu === c.id} onAnswer={answer} onOpen={(id) => setFocus(cardsRef.current.findIndex((x) => x.id === id))} onMenu={setMenu} onAct={act} />
        ))}
      </div>
    </>
  );

  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  return (
    <div className="vb-root" role="dialog" aria-modal="true" aria-label="ورود گروهی سؤال‌ها">
      <header className="vb-top">
        <button type="button" className="vt-ib" aria-label="بستن" onClick={() => void requestClose()}><X size={20} /></button>
        <h1>ورود گروهی سؤال‌ها</h1>
        <span className="grow" />
        {phase === 'review' && <span className="vb-count">{P(total)} سؤال</span>}
      </header>

      <main className="vb-main">
        {phase === 'pick' && picker0}
        {phase === 'review' && review}
        {phase === 'busy' && (
          <div className="vb-center">
            <div className="vb-spin" aria-hidden="true" />
            <h2>در حال آماده‌سازی عکس‌ها…</h2>
            <div className="vb-prog wide"><div style={{ width: pct + '%' }} /></div>
            <p className="vt-sub">{P(prog.done)} از {P(prog.total)}</p>
          </div>
        )}
        {phase === 'saving' && (
          <div className="vb-center">
            <div className="vb-spin" aria-hidden="true" />
            <h2>در حال ذخیرهٔ سؤال‌ها…</h2>
            <div className="vb-prog wide"><div style={{ width: pct + '%' }} /></div>
            <p className="vt-sub">{P(prog.done)} از {P(prog.total)} · عکس‌ها فشرده می‌شوند</p>
          </div>
        )}
        {phase === 'done' && (
          <div className="vb-center">
            <div className={'vb-tick' + (result.failed ? ' warn' : '')} aria-hidden="true"><Check size={46} strokeWidth={3} /></div>
            <h2>{P(result.saved)} سؤال در گنجینه ذخیره شد</h2>
            {result.failed > 0 && <p className="vt-hint">{P(result.failed)} سؤال ذخیره نشد و در فهرست مانده است.</p>}
            {cards.length > 0 && <p className="vt-sub">{P(cards.length)} سؤال دیگر هنوز در فهرست است.</p>}
            {supabase.getUser() && <p className="vt-sub vb-sync">{sync.state === 'syncing' ? '☁️ در حال ارسال به سرور تا روی کامپیوتر هم دیده شوند…' : sync.state === 'live' ? '☁️ برای همگام‌سازی با سرور ارسال می‌شود' : '☁️ ' + (sync.message || '')}</p>}
            <div className="vb-doneact">
              {cards.length > 0 && <button type="button" className="vt-btn p" onClick={more}>ادامهٔ بقیه</button>}
              <button type="button" className={'vt-btn' + (cards.length ? '' : ' p')} onClick={() => { setPhase('pick'); setCards([]); seen.current.clear(); }}><ImagePlus size={16} /> دستهٔ دیگر</button>
              <button type="button" className="vt-btn" onClick={onClose}>مشاهده در گنجینه</button>
            </div>
          </div>
        )}
      </main>

      {phase === 'review' && (
        <footer className="vb-foot">
          <span className="vt-hint grow" role="status">
            {needBook ? 'نام کتاب را در تنظیمات مشترک وارد کنید' : !answered ? 'گزینهٔ درست سؤال‌ها را مشخص کنید' : left ? `${P(left)} سؤال بدون پاسخ می‌ماند` : 'همه آماده‌اند'}
          </span>
          <button type="button" className="vt-btn" onClick={() => void requestClose()}>انصراف</button>
          <button type="button" className="vt-btn p vb-save" disabled={needBook || !answered} onClick={() => void save()}><Check size={17} /> ذخیرهٔ {P(answered)} سؤال</button>
        </footer>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onPick(e)} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPick(e, true)} />

      {focus !== null && cards[focus] && (
        <Focus cards={cards} index={focus} choices={common.choices} common={common} onIndex={setFocus} onAnswer={answer} onAct={act} onWhy={setWhy} onClose={() => setFocus(null)} />
      )}
      {picker && (
        <TopicPicker
          z={800}
          title="پیوند سؤال‌ها به مبحث"
          confirmLabel="پیوند بزن"
          initialUnits={common.units}
          onClose={() => setPicker(false)}
          onPick={(p) => {
            const x = BY_UNIT[p.us[0]];
            setCommon((f) => ({ ...f, units: p.us, book: f.book.trim() ? f.book : p.subject, lesson: f.lesson.trim() || !x ? f.lesson : BOOKS[x.bi].chapters[x.ci].t }));
            setPicker(false);
          }}
        />
      )}
    </div>
  );
};
