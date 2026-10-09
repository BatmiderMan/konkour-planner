import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Upload, Play, Trash2, X, ChevronLeft, ChevronRight, Check, History, RotateCcw, LayoutGrid, Library } from 'lucide-react';
import { parsePack } from './pack';
import { Attempt, BANK_EVENT, BankBook, deleteAttempt, getBook, imageUrl, importPack, konkurPct, listAttempts, listBooks, removeBook, saveAttempt, weakTests } from './store';
import { alertDialog, confirmDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';
import './bank.css';

/* ------------------------------------------------------------------ one question image */
const QImg: React.FC<{ bookId: string; n: number; className?: string; onClick?: () => void }> = ({ bookId, n, className, onClick }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let live = true; setSrc(null); imageUrl(bookId, n).then((u) => { if (live) setSrc(u); }); return () => { live = false; }; }, [bookId, n]);
  if (!src) return <div className={'bk-img ph ' + (className || '')} aria-busy="true" />;
  return <img className={'bk-img ' + (className || '')} src={src} alt={'سؤال ' + n} draggable={false} onClick={onClick} />;
};

const useBank = () => {
  const [books, setBooks] = useState<BankBook[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    try { const [b, a] = await Promise.all([listBooks(), listAttempts()]); setBooks(b); setAttempts(a); } catch { /* storage unavailable */ }
    setReady(true);
  }, []);
  useEffect(() => { load(); window.addEventListener(BANK_EVENT, load); return () => window.removeEventListener(BANK_EVENT, load); }, [load]);
  return { books, attempts, ready };
};

/* ------------------------------------------------------------------ lightbox: a question with the answers */
const Lightbox: React.FC<{ book: BankBook; n: number; pick?: number; onClose: () => void }> = ({ book, n, pick, onClose }) => {
  const right = book.answers[n];
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="bk-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bk-lb-card" onClick={(e) => e.stopPropagation()}>
        <header><b>سؤال {P(n)}</b><button type="button" className="bk-x" onClick={onClose} aria-label="بستن"><X size={20} /></button></header>
        <div className="bk-qwrap"><QImg bookId={book.id} n={n} /></div>
        <footer>
          <span className="bk-pill ok">پاسخ درست: گزینهٔ {P(right)}</span>
          {pick !== undefined && (pick === 0 ? <span className="bk-pill">نزده بودید</span> : <span className={'bk-pill ' + (pick === right ? 'ok' : 'bad')}>پاسخ شما: گزینهٔ {P(pick)}</span>)}
        </footer>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ the exam */
interface Cfg { book: BankBook; list: number[]; instant: boolean; mode: string }

const Player: React.FC<{ cfg: Cfg; onFinish: (a: Attempt) => void; onCancel: () => void }> = ({ cfg, onFinish, onCancel }) => {
  const { book, list, instant } = cfg;
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [map, setMap] = useState(false);
  const t0 = useRef(Date.now());
  const [sec, setSec] = useState(0);
  useEffect(() => { const id = setInterval(() => setSec(Math.floor((Date.now() - t0.current) / 1000)), 1000); return () => clearInterval(id); }, []);
  const n = list[i], pick = picks[n] || 0, right = book.answers[n];
  const answered = Object.values(picks).filter(Boolean).length;
  const choose = useCallback((v: number) => setPicks((p) => ({ ...p, [n]: p[n] === v ? 0 : v })), [n]);
  const go = useCallback((d: number) => setI((x) => Math.min(list.length - 1, Math.max(0, x + d))), [list.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '4') choose(+e.key);
      else if (e.key === 'ArrowLeft') go(1); else if (e.key === 'ArrowRight') go(-1);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [choose, go]);
  useEffect(() => { // warm the next image
    if (list[i + 1] !== undefined) imageUrl(book.id, list[i + 1]);
  }, [i, list, book.id]);

  const finish = async () => {
    const blank = list.length - answered;
    if (blank > 0 && !(await confirmDialog(`${P(blank)} سؤال را نزده‌اید. آزمون تمام شود؟`))) return;
    let c = 0, w = 0; const items = list.map((q) => ({ n: q, pick: picks[q] || 0 }));
    items.forEach((it) => { if (!it.pick) return; if (it.pick === book.answers[it.n]) c++; else w++; });
    const a: Attempt = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), bookId: book.id, at: Date.now(), seconds: Math.floor((Date.now() - t0.current) / 1000), items, correct: c, wrong: w, blank: list.length - c - w, pct: konkurPct(c, w, list.length), mode: cfg.mode };
    try { await saveAttempt(a); } catch { /* still show the result */ }
    onFinish(a);
  };
  const mm = String(Math.floor(sec / 60)).padStart(2, '0'), ss = String(sec % 60).padStart(2, '0');
  return (
    <section className="bk-player">
      <header className="bk-ph">
        <button type="button" className="bk-btn ghost" onClick={async () => { if (await confirmDialog('آزمون رها شود؟ پاسخ‌ها ذخیره نمی‌شوند.')) onCancel(); }}><X size={18} /> خروج</button>
        <div className="bk-prog"><b>{P(i + 1)}</b> / {P(list.length)} <span className="bk-time">{P(mm + ':' + ss)}</span></div>
        <button type="button" className="bk-btn ghost" onClick={() => setMap((m) => !m)} aria-expanded={map}><LayoutGrid size={18} /> نقشه</button>
      </header>
      <div className="bk-bar"><i style={{ width: (answered / list.length) * 100 + '%' }} /></div>
      {map && (
        <div className="bk-map">
          {list.map((q, k) => <button type="button" key={q} className={(k === i ? 'cur ' : '') + (picks[q] ? 'done' : '')} onClick={() => { setI(k); setMap(false); }}>{P(q)}</button>)}
        </div>
      )}
      <div className="bk-qcard">
        <div className="bk-qno">سؤال {P(n)}</div>
        <div className="bk-qwrap"><QImg bookId={book.id} n={n} /></div>
      </div>
      <div className="bk-opts" role="group" aria-label="گزینه‌ها">
        {[1, 2, 3, 4].map((v) => {
          let cls = 'bk-opt';
          if (pick === v) cls += ' sel';
          if (instant && pick) { if (v === right) cls += ' right'; else if (pick === v) cls += ' wrong'; }
          return <button type="button" key={v} className={cls} onClick={() => choose(v)} aria-pressed={pick === v}>{P(v)}</button>;
        })}
      </div>
      {instant && pick !== 0 && <p className={'bk-fb ' + (pick === right ? 'ok' : 'bad')}>{pick === right ? 'درست است ✓' : `نادرست؛ پاسخ درست گزینهٔ ${P(right)} است.`}</p>}
      <footer className="bk-nav">
        <button type="button" className="bk-btn" onClick={() => go(-1)} disabled={i === 0}><ChevronRight size={18} /> قبلی</button>
        {i === list.length - 1
          ? <button type="button" className="bk-btn primary" onClick={finish}><Check size={18} /> پایان آزمون</button>
          : <button type="button" className="bk-btn primary" onClick={() => go(1)}>بعدی <ChevronLeft size={18} /></button>}
      </footer>
      {i !== list.length - 1 && <button type="button" className="bk-link" onClick={finish}>پایان آزمون ({P(answered)} از {P(list.length)} پاسخ داده شد)</button>}
    </section>
  );
};

/* ------------------------------------------------------------------ result / report */
const Result: React.FC<{ a: Attempt; book: BankBook; onBack: () => void; onRetry: (nums: number[]) => void }> = ({ a, book, onBack, onRetry }) => {
  const [tab, setTab] = useState<'wrong' | 'blank' | 'all'>(a.wrong + a.blank > 0 ? 'wrong' : 'all');
  const [open, setOpen] = useState<{ n: number; pick: number } | null>(null);
  const ok = (it: { n: number; pick: number }) => it.pick !== 0 && it.pick === book.answers[it.n];
  const rows = a.items.filter((it) => tab === 'all' ? true : tab === 'wrong' ? it.pick !== 0 && !ok(it) : it.pick === 0);
  const bad = a.items.filter((it) => !ok(it)).map((it) => it.n);
  const m = Math.floor(a.seconds / 60), s = a.seconds % 60;
  return (
    <section className="bk-result">
      <header className="bk-rh"><button type="button" className="bk-btn ghost" onClick={onBack}><ChevronRight size={18} /> بازگشت</button><h2>گزارش آزمون</h2></header>
      <p className="bk-sub">{book.title} · {new Date(a.at).toLocaleDateString('fa-IR')} · {P(m)} دقیقه و {P(s)} ثانیه</p>
      <div className="bk-stats">
        <div className="big"><b>{P(a.pct)}٪</b><span>درصد (۳ - ۱)</span></div>
        <div className="ok"><b>{P(a.correct)}</b><span>درست</span></div>
        <div className="bad"><b>{P(a.wrong)}</b><span>غلط</span></div>
        <div><b>{P(a.blank)}</b><span>نزده</span></div>
      </div>
      {bad.length > 0 && <button type="button" className="bk-btn primary wide" onClick={() => onRetry(bad)}><RotateCcw size={18} /> آزمون دوباره از {P(bad.length)} سؤال اشتباه/نزده</button>}
      <div className="bk-tabs" role="tablist">
        {([['wrong', `غلط (${P(a.wrong)})`], ['blank', `نزده (${P(a.blank)})`], ['all', 'همه']] as const).map(([k, l]) => <button type="button" role="tab" aria-selected={tab === k} key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {rows.length === 0 && <p className="bk-empty">{tab === 'wrong' ? 'غلطی نداشتید 👏' : 'موردی نیست.'}</p>}
      <ul className="bk-rows">
        {rows.map((it) => (
          <li key={it.n}>
            <button type="button" className="bk-row" onClick={() => setOpen(it)}>
              <span className={'bk-badge ' + (ok(it) ? 'ok' : it.pick ? 'bad' : '')}>{P(it.n)}</span>
              <span className="bk-rt"><small>پاسخ شما: {it.pick ? P(it.pick) : '—'} · درست: {P(book.answers[it.n])}</small><QImg bookId={book.id} n={it.n} className="thumb" /></span>
            </button>
          </li>
        ))}
      </ul>
      {open && <Lightbox book={book} n={open.n} pick={open.pick} onClose={() => setOpen(null)} />}
    </section>
  );
};

/* ------------------------------------------------------------------ home */
const Home: React.FC<{ books: BankBook[]; attempts: Attempt[]; ready: boolean; onStart: (c: Cfg) => void; onOpen: (a: Attempt) => void }> = ({ books, attempts, ready, onStart, onOpen }) => {
  const [bid, setBid] = useState<string>('');
  const book = useMemo(() => books.find((b) => b.id === bid) || books[0], [books, bid]);
  const [mode, setMode] = useState<'range' | 'random' | 'weak'>('range');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [cnt, setCnt] = useState('20');
  const [instant, setInstant] = useState(false);
  const [weak, setWeak] = useState<number[]>([]);
  const [busy, setBusy] = useState<string>('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (book) weakTests(book.id).then(setWeak).catch(() => setWeak([])); else setWeak([]); }, [book, attempts]);
  const min = book ? book.numbers[0] : 0, max = book ? book.numbers[book.numbers.length - 1] : 0;

  const doImport = async (f: File) => {
    try {
      setBusy('در حال خواندن فایل…');
      const pack = parsePack(await f.arrayBuffer());
      const b = await importPack(pack, (d, t) => setBusy(`ذخیره تصاویر… ${P(d)} از ${P(t)}`));
      setBid(b.id); setBusy('');
      await alertDialog(`«${b.title}» اضافه شد: ${P(b.numbers.length)} سؤال با تصویر.`);
    } catch (e: any) { setBusy(''); await alertDialog(e?.message || 'فایل خوانده نشد.'); }
  };
  const start = () => {
    if (!book) return;
    let list: number[] = [];
    if (mode === 'range') {
      const a = parseInt(from || String(min), 10), b = parseInt(to || String(max), 10);
      list = book.numbers.filter((n) => n >= Math.min(a, b) && n <= Math.max(a, b));
    } else if (mode === 'random') {
      const k = Math.max(1, Math.min(parseInt(cnt, 10) || 20, book.numbers.length)); const pool = book.numbers.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      list = pool.slice(0, k).sort((a, b) => a - b);
    } else list = weak.filter((n) => book.numbers.includes(n));
    if (!list.length) { alertDialog('سؤالی با این انتخاب پیدا نشد.'); return; }
    onStart({ book, list, instant, mode: mode === 'range' ? 'بازه' : mode === 'random' ? 'تصادفی' : 'اشتباهات' });
  };
  const bookOf = (id: string) => books.find((b) => b.id === id);

  return (
    <section className="bk-home">
      <header className="bk-hh">
        <div><h2><Library size={22} /> بانک تست</h2><p>سؤال‌ها از روی کتاب بریده شده‌اند؛ آزمون بسازید، پاسخ بدهید و اشتباه‌ها را با تصویر ببینید.</p></div>
        <button type="button" className="bk-btn primary" onClick={() => file.current?.click()} disabled={!!busy}><Upload size={18} /> افزودن کتاب (.qbank)</button>
        <input ref={file} type="file" accept=".qbank,application/octet-stream" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) doImport(f); }} />
      </header>
      {busy && <p className="bk-busy" role="status">{busy}</p>}
      {ready && books.length === 0 && !busy && (
        <div className="bk-emptybox"><BookOpen size={36} /><b>هنوز کتابی اضافه نشده</b><span>فایل بستهٔ تست (با پسوند qbank) را از کسی که ساخته بگیرید و با دکمهٔ بالا اضافه کنید. همه‌چیز روی همین دستگاه می‌ماند و بدون اینترنت کار می‌کند.</span></div>
      )}
      {book && (
        <>
          <div className="bk-books">
            {books.map((b) => (
              <div key={b.id} className={'bk-bookcard' + (b.id === book.id ? ' on' : '')}>
                <button type="button" onClick={() => setBid(b.id)}><b>{b.title}</b><span>{P(b.numbers.length)} سؤال · کلید {P(Object.keys(b.answers).length)} تست</span></button>
                <button type="button" className="bk-del" aria-label="حذف کتاب" onClick={async () => { if (await confirmDialog(`«${b.title}» با تصاویر و سابقهٔ آزمون‌هایش حذف شود؟`)) removeBook(b.id); }}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <div className="bk-form">
            <h3>آزمون جدید</h3>
            <div className="bk-seg" role="tablist">
              {([['range', 'بازهٔ سؤال'], ['random', 'تصادفی'], ['weak', `اشتباه‌های قبلی (${P(weak.length)})`]] as const).map(([k, l]) => <button type="button" role="tab" aria-selected={mode === k} key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}
            </div>
            {mode === 'range' && (
              <div className="bk-fields">
                <label>از سؤال<input inputMode="numeric" value={from} placeholder={String(min)} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} /></label>
                <label>تا سؤال<input inputMode="numeric" value={to} placeholder={String(max)} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} /></label>
              </div>
            )}
            {mode === 'random' && <div className="bk-fields"><label>تعداد سؤال<input inputMode="numeric" value={cnt} onChange={(e) => setCnt(e.target.value.replace(/\D/g, ''))} /></label></div>}
            {mode === 'weak' && <p className="bk-hint">{weak.length ? 'سؤال‌هایی که آخرین بار غلط یا نزده بودید.' : 'هنوز آزمونی نداده‌اید یا همه را درست زده‌اید.'}</p>}
            <label className="bk-check"><input type="checkbox" checked={instant} onChange={(e) => setInstant(e.target.checked)} /> حالت تمرین: بعد از هر پاسخ، درست یا غلط را نشان بده</label>
            <button type="button" className="bk-btn primary wide" onClick={start} disabled={mode === 'weak' && !weak.length}><Play size={18} /> شروع آزمون</button>
          </div>
        </>
      )}
      {attempts.length > 0 && (
        <div className="bk-hist">
          <h3><History size={18} /> سابقهٔ آزمون‌ها</h3>
          <ul>
            {attempts.slice(0, 30).map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onOpen(a)}>
                  <b>{P(a.pct)}٪</b>
                  <span>{bookOf(a.bookId)?.title || 'کتاب حذف‌شده'} · {P(a.items.length)} سؤال · {a.mode}<small>{new Date(a.at).toLocaleDateString('fa-IR')} — {P(a.correct)} درست، {P(a.wrong)} غلط، {P(a.blank)} نزده</small></span>
                </button>
                <button type="button" className="bk-del" aria-label="حذف" onClick={async () => { if (await confirmDialog('این سابقه حذف شود؟')) deleteAttempt(a.id); }}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

/* ------------------------------------------------------------------ the section */
export const BankView: React.FC = () => {
  const { books, attempts, ready } = useBank();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [res, setRes] = useState<{ a: Attempt; book: BankBook } | null>(null);
  const open = async (a: Attempt) => { const b = await getBook(a.bookId); if (!b) { alertDialog('کتاب این آزمون حذف شده است.'); return; } setRes({ a, book: b }); };
  if (cfg) return <div className="bk-root"><Player cfg={cfg} onCancel={() => setCfg(null)} onFinish={(a) => { setRes({ a, book: cfg.book }); setCfg(null); }} /></div>;
  if (res) return <div className="bk-root"><Result a={res.a} book={res.book} onBack={() => setRes(null)} onRetry={(nums) => { setCfg({ book: res.book, list: nums, instant: true, mode: 'اشتباهات' }); setRes(null); }} /></div>;
  return <div className="bk-root"><Home books={books} attempts={attempts} ready={ready} onStart={setCfg} onOpen={open} /></div>;
};
