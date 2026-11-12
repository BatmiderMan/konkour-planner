import React from 'react';
import { CalendarPlus, Download, Flame, Gem, ImagePlus, Link2, Pencil, Play, Plus, Search, Star, Upload } from 'lucide-react';
import { alertDialog } from '../dialog';
import { showUndo } from '../undo';
import { SkeletonRows } from '../components/ui/Skeleton';
import { BOOKS } from '../trackerStore';
import { labelForUnits } from '../trackerPlan';
import { createPlannerItem, dateKeyOf, insertByPin, loadPlannerData, savePlannerData, todayGregorian } from '../plannerStore';
import { toPersianDigits as P } from '../utils';
import {
  CAUSE_LABEL, DIFF_LABEL, VaultQ, WHY, WeakArea, VaultWhy, dueOf, exportBackup, importBackup, isDue, isLeech, isOpenMistake, patchQuestion,
  practicedToday, recordResult, useVault, useVaultImage, vaultStreak, weakAreas
} from './store';
import { VaultFocus, openVaultBulk, openVaultEditor, openVaultReview } from './launch';
import './vault.css';

type Status = '' | 'due' | 'open' | 'fresh' | 'star' | 'leech';
type Sort = 'new' | 'old' | 'miss' | 'stale' | 'rand';
interface Filt { book: string; lesson: string; unit: string; status: Status; why: '' | VaultWhy; cause: string; sort: Sort; qs: string }
const EMPTY: Filt = { book: '', lesson: '', unit: '', status: '', why: '', cause: '', sort: 'new', qs: '' };
let saved: Filt = EMPTY; // survives switching sections
interface Sess { pick?: number; shown?: boolean; graded?: boolean }
const sess: Record<string, Sess> = {}; // answers given in this visit (cleared with the button)

const hs = (s: string, k: number) => { let h = k; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
const fdate = (t: number) => (t ? new Date(t).toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—');
const PAGE = 12;

/* ------------------------------------------------------------------ one question card */
interface CardProps { q: VaultQ; n: number; s: Sess; set: (id: string, s: Sess | null) => void; zoom: (src: string) => void; onOpenTracker: () => void }
const NO_SESS: Sess = {};
const Card = React.memo(({ q, n, s, set, zoom, onOpenTracker }: CardProps) => {
  const img = useVaultImage(q.id, 'q');
  const eimg = useVaultImage(q.hasEimg && s.shown ? q.id : '', 'e');
  const sh = !!s.shown, pk = s.pick || 0;
  const cls = sh && pk ? (pk === q.answer ? 'win' : 'lose') : WHY[q.why].g === 'w' ? 'w' : 'n';
  const leech = isLeech(q);
  const topic = q.units.length ? labelForUnits(q.units.slice(0, 1)) : '';
  const choose = (k: number) => { if (sh) return; set(q.id, { pick: k, shown: true, graded: true }); recordResult(q.id, k === q.answer); };
  const grade = (win: boolean) => { set(q.id, { ...s, graded: true }); recordResult(q.id, win); };
  return (
    <article className={'vt-q ' + cls}>
      <div className="vt-qh">
        <span className="vt-num">{P(n)}</span>
        <span className="vt-pill">{q.book}</span>
        {q.lesson && <span className="vt-pill">{q.lesson}</span>}
        <span className={'vt-tag ' + WHY[q.why].g}>{WHY[q.why].l}</span>
        {leech && <span className="vt-tag w">سؤال لجباز</span>}
        {q.cause && <span className="vt-tag cs">{CAUSE_LABEL[q.cause]}</span>}
        {q.diff > 0 && <span className="vt-tag cs">{DIFF_LABEL[q.diff]}</span>}
        <span className="grow" />
        <button type="button" className={'vt-ib' + (q.star ? ' on' : '')} aria-label="نشان‌دار" aria-pressed={q.star} title="نشان‌دار" onClick={() => patchQuestion(q.id, { star: !q.star })}><Star size={16} /></button>
        <button type="button" className="vt-ib" aria-label="ویرایش" title="ویرایش" onClick={() => openVaultEditor({ id: q.id })}><Pencil size={16} /></button>
      </div>
      {(topic || q.src) && (
        <div className="vt-links">
          {topic && <button type="button" className="vt-linked" onClick={onOpenTracker} title="باز کردن پیگیری مباحث"><Link2 size={13} />{topic}</button>}
          {q.src && <span className="vt-linked plain">بانک تست · سؤال {P(q.src.n)}</span>}
        </div>
      )}
      <div className="vt-qb">{img ? <img className="vt-img zoomable" src={img} alt={'سؤال ' + n} loading="lazy" decoding="async" onClick={() => zoom(img)} /> : <div className="vt-img ph" aria-busy="true" />}</div>
      <div className="vt-copts" role="group" aria-label="گزینه‌ها">
        {Array.from({ length: q.choices }, (_, i) => {
          const k = i + 1;
          let c = 'vt-co';
          if (sh) { if (k === q.answer) c += ' ok'; else if (k === pk) c += ' bad'; }
          return <button key={k} type="button" className={c} disabled={sh} onClick={() => choose(k)}><i>{P(k)}</i>گزینهٔ {P(k)}</button>;
        })}
      </div>
      {sh && (
        <div className="vt-qa">
          <div className={'vt-verdict ' + (pk ? (pk === q.answer ? 'ok' : 'bad') : '')}>{pk ? (pk === q.answer ? 'درست است. ' : `نادرست؛ گزینهٔ ${P(pk)} را زدید. `) : ''}پاسخ درست: گزینهٔ {P(q.answer)}</div>
          {eimg && <img className="vt-img zoomable" src={eimg} alt="پاسخ تشریحی" onClick={() => zoom(eimg)} />}
          {q.etext && <div className="vt-expl">{q.etext}</div>}
          {!q.hasEimg && !q.etext && <div className="vt-sub">توضیحی ذخیره نشده است.</div>}
        </div>
      )}
      <div className="vt-qf">
        {!sh && <button type="button" className="vt-btn" onClick={() => set(q.id, { shown: true })}>مشاهدهٔ پاسخ</button>}
        {sh && !s.graded && (<><span className="vt-sub">نتیجهٔ خودت چه بود؟</span>
          <button type="button" className="vt-btn ok" onClick={() => grade(true)}>بلد بودم</button>
          <button type="button" className="vt-btn no" onClick={() => grade(false)}>غلط زدم</button></>)}
        {sh && <button type="button" className="vt-btn" onClick={() => set(q.id, null)}>دوباره امتحان</button>}
      </div>
      <div className="vt-meta">
        <span>ثبت {fdate(q.created)}</span><span>{P(q.choices)} گزینه‌ای</span><span>{P(q.tries)} بار تلاش</span>
        <span>درستی {q.tries ? P(Math.round((q.wins / q.tries) * 100)) + '٪' : '—'}</span>
        <span>مرور بعدی {q.tries ? (isDue(q) ? 'اکنون' : fdate(q.due)) : '—'}</span>
      </div>
    </article>
  );
});

/* ------------------------------------------------------------------ the section */
interface Props { focus?: VaultFocus | null; onFocusUsed?: () => void; onOpenTracker: () => void; onPlanChanged?: () => void }

export const VaultView: React.FC<Props> = ({ focus, onFocusUsed, onOpenTracker, onPlanChanged }) => {
  const { items, ready, failed } = useVault();
  const [f, setF] = React.useState<Filt>(saved);
  const [seed, setSeed] = React.useState(1);
  const [limit, setLimit] = React.useState(PAGE);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const [zoomSrc, setZoomSrc] = React.useState<string | null>(null);
  const [adv, setAdv] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const upd = (p: Partial<Filt>) => { setF((x) => { saved = { ...x, ...p }; return saved; }); setLimit(PAGE); };

  // another screen asked for a filtered view (tracker row, Today …)
  React.useEffect(() => {
    if (!focus) return;
    upd({ ...EMPTY, book: focus.book || '', lesson: focus.lesson || '', unit: focus.unit || '', status: focus.status || '' });
    onFocusUsed?.();
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = React.useCallback((id: string, s: Sess | null) => { if (s) sess[id] = s; else delete sess[id]; force(); }, []);

  const books = React.useMemo(() => { const m: Record<string, number> = {}; items.forEach((q) => { m[q.book] = (m[q.book] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [items]);
  const lessons = React.useMemo(() => { const m: Record<string, number> = {}; items.filter((q) => q.book === f.book && q.lesson).forEach((q) => { m[q.lesson] = (m[q.lesson] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [items, f.book]);
  const cnt = React.useMemo(() => ({
    due: dueOf(items).length, fresh: items.filter((q) => !q.tries).length, open: items.filter(isOpenMistake).length,
    star: items.filter((q) => q.star).length, leech: items.filter(isLeech).length
  }), [items]);
  const weak = React.useMemo(() => weakAreas(items, 3), [items]);

  const view = React.useMemo(() => {
    const s = f.qs.trim().toLowerCase();
    const v = items.filter((q) =>
      (!f.book || q.book === f.book) && (!f.lesson || q.lesson === f.lesson) && (!f.unit || q.units.includes(f.unit)) && (!f.why || q.why === f.why) && (!f.cause || q.cause === f.cause) &&
      (!s || (q.book + ' ' + q.lesson + ' ' + q.etext + ' ' + (q.units.length ? labelForUnits(q.units.slice(0, 1)) : '')).toLowerCase().includes(s)) &&
      (!f.status || (f.status === 'due' ? isDue(q) : f.status === 'open' ? isOpenMistake(q) : f.status === 'fresh' ? !q.tries : f.status === 'star' ? q.star : isLeech(q))));
    const cmp: Record<Sort, (a: VaultQ, b: VaultQ) => number> = {
      new: (a, b) => b.created - a.created, old: (a, b) => a.created - b.created,
      miss: (a, b) => (b.tries - b.wins) - (a.tries - a.wins), stale: (a, b) => a.last - b.last, rand: (a, b) => hs(a.id, seed) - hs(b.id, seed)
    };
    return v.sort(cmp[f.sort]);
  }, [items, f, seed]);

  // endless list: the next cards appear when the end comes near
  const more = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = more.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setLimit((l) => l + PAGE); }, { rootMargin: '900px' });
    io.observe(el);
    return () => io.disconnect();
  }, [view.length]);

  React.useEffect(() => {
    if (!zoomSrc) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomSrc(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [zoomSrc]);

  const tries = view.reduce((a, q) => a + q.tries, 0), wins = view.reduce((a, q) => a + q.wins, 0);
  const title = f.lesson || f.book || 'همهٔ سؤال‌ها';
  const filtered = !!(f.book || f.lesson || f.unit || f.status || f.why || f.cause || f.qs);

  const planReview = (a: WeakArea) => {
    const data = loadPlannerData(), key = dateKeyOf(todayGregorian());
    const tb = BOOKS.find((b) => b.subject === a.book);
    const item = createPlannerItem({ subject: a.book, detail: `مرور ${P(a.open)} سؤال اشتباه از گنجینه`, grade: tb ? tb.grade : 'دوازدهم', source: 'گنجینه سؤال', minutes: Math.min(45, Math.max(10, a.open * 3)) });
    data.items[key] = insertByPin(data.items[key] || [], item, key, data);
    savePlannerData(data);
    onPlanChanged?.();
    showUndo('مرور به برنامه‌ی امروز اضافه شد', () => {
      const d = loadPlannerData();
      d.items[key] = (d.items[key] || []).filter((x) => x.id !== item.id);
      savePlannerData(d); onPlanChanged?.();
    });
  };

  const doExport = async () => {
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `planex-vault-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { void alertDialog('پشتیبان‌گیری انجام نشد.'); }
  };
  const doImport = async (file: File) => {
    try { const n = await importBackup(await file.text()); void alertDialog(`${P(n)} سؤال بازیابی شد.`); }
    catch (e: any) { void alertDialog(e && e.message ? e.message : 'این فایل پشتیبان معتبر نیست.'); }
  };

  const status: Array<[Status, string, number]> = [['', 'همه', items.length], ['due', 'سررسید', cnt.due], ['fresh', 'مرور‌نشده', cnt.fresh], ['open', 'اشتباه باز', cnt.open], ['leech', 'لجباز', cnt.leech], ['star', 'نشان‌دار', cnt.star]];
  const streak = vaultStreak();

  return (
    <main className="vt-root">
      <header className="vt-head">
        <h1><Gem size={24} /> {title}</h1>
        <p>سؤال‌هایی که غلط زدی یا ارزش یادآوری دارند؛ با مرور فاصله‌دار تا ته‌ذهنت می‌مانند.</p>
        <div className="vt-actions">
          <button type="button" className="vt-btn p" onClick={() => openVaultEditor({ book: f.book, lesson: f.lesson, units: f.unit ? [f.unit] : [] })}><Plus size={17} /> ذخیرهٔ سؤال</button>
          <button type="button" className="vt-btn vb-entry" onClick={() => openVaultBulk({ book: f.book, lesson: f.lesson, units: f.unit ? [f.unit] : [] })} title="چندین عکس را یکجا وارد کنید؛ هر دو عکس = یک سؤال"><ImagePlus size={17} /> ورود گروهی عکس‌ها</button>
          <button type="button" className="vt-btn go" disabled={!items.length} onClick={() => openVaultReview({ mode: 'smart', book: f.book || undefined, unit: f.unit || undefined })}><Play size={16} /> مرور هوشمند{cnt.due ? ` (${P(cnt.due)})` : ''}</button>
          <button type="button" className="vt-btn" disabled={!view.length} onClick={() => openVaultReview({ ids: view.map((q) => q.id), title: 'مرور ' + title })}>مرور این فهرست</button>
          <button type="button" className="vt-btn icon" aria-label="پشتیبان‌گیری" title="خروجی پشتیبان" disabled={!items.length} onClick={doExport}><Download size={17} /></button>
          <button type="button" className="vt-btn icon" aria-label="بازیابی" title="بازیابی از پشتیبان (فایل این برنامه یا نسخهٔ مستقل گنجینه)" onClick={() => fileRef.current?.click()}><Upload size={17} /></button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) void doImport(x); }} />
        </div>
      </header>

      {failed && <p className="vt-warn" role="alert">ذخیره‌سازی در این مرورگر در دسترس نیست. صفحه را در پنجرهٔ عادی (غیرخصوصی) باز کنید.</p>}
      {!ready && <SkeletonRows rows={3} />}

      {ready && items.length > 0 && (
        <>
          <div className="vt-stat">
            <div><b>{P(view.length)}</b><span>سؤال در این مجموعه</span></div>
            <div><b>{tries ? P(Math.round((wins / tries) * 100)) + '٪' : '—'}</b><span>درصد درستی</span></div>
            <div><b>{P(view.filter((q) => isDue(q)).length)}</b><span>سررسید مرور</span></div>
            <div><b>{P(practicedToday())}</b><span>مرور امروز{streak > 0 ? ` · ${P(streak)} روز پیاپی` : ''} {streak > 0 && <Flame size={12} />}</span></div>
          </div>

          {!filtered && weak.length > 0 && (
            <section className="vt-weak" aria-label="نقاط ضعف">
              <h2>جایی که اشتباه‌ها جمع شده‌اند</h2>
              {weak.map((a) => (
                <div key={a.book} className="vt-weak-row">
                  <span className="vt-weak-t"><b>{a.book}</b><em>{P(a.open)} اشتباه باز{a.leeches ? ` · ${P(a.leeches)} لجباز` : ''} از {P(a.total)} سؤال</em></span>
                  <button type="button" className="vt-btn" onClick={() => openVaultReview({ mode: 'weak', book: a.book, title: 'اشتباه‌های ' + a.book })}><Play size={15} /> مرور</button>
                  <button type="button" className="vt-btn" onClick={() => planReview(a)} title="یک کارت مرور به برنامه‌ی امروز اضافه می‌شود"><CalendarPlus size={15} /> برنامه‌ی امروز</button>
                </div>
              ))}
            </section>
          )}

          <div className="vt-filters">
            <label className="vt-search"><Search size={16} /><input type="search" value={f.qs} onChange={(e) => upd({ qs: e.target.value })} placeholder="جستجوی کتاب، درس، مبحث، یادداشت" aria-label="جستجو" /></label>
            <div className="vt-chips scroll" role="group" aria-label="وضعیت">
              {status.map(([k, l, n]) => (!k || n > 0 || f.status === k) && <button key={k || 'all'} type="button" className={'vt-chip' + (f.status === k ? ' on' : '')} aria-pressed={f.status === k} onClick={() => upd({ status: k })}>{l} <small>{P(n)}</small></button>)}
            </div>
            <div className="vt-chips scroll" role="group" aria-label="کتاب">
              <button type="button" className={'vt-chip' + (!f.book ? ' on' : '')} onClick={() => upd({ book: '', lesson: '' })}>همهٔ کتاب‌ها</button>
              {books.map(([b, n]) => <button key={b} type="button" className={'vt-chip' + (f.book === b ? ' on' : '')} aria-pressed={f.book === b} onClick={() => upd({ book: f.book === b ? '' : b, lesson: '' })}>{b} <small>{P(n)}</small></button>)}
            </div>
            {f.book && lessons.length > 0 && (
              <div className="vt-chips scroll" role="group" aria-label="درس">
                {lessons.map(([l, n]) => <button key={l} type="button" className={'vt-chip sub' + (f.lesson === l ? ' on' : '')} aria-pressed={f.lesson === l} onClick={() => upd({ lesson: f.lesson === l ? '' : l })}>{l} <small>{P(n)}</small></button>)}
              </div>
            )}
            <div className="vt-toolrow">
              <button type="button" className="vt-btn ghost" aria-expanded={adv} onClick={() => setAdv((a) => !a)}>مرتب‌سازی و فیلتر بیشتر</button>
              {filtered && <button type="button" className="vt-btn ghost" onClick={() => upd({ ...EMPTY, sort: f.sort })}>پاک‌کردن فیلترها</button>}
              <span className="grow" />
              {Object.keys(sess).length > 0 && <button type="button" className="vt-btn ghost" onClick={() => { Object.keys(sess).forEach((k) => delete sess[k]); force(); }}>پاک‌کردن پاسخ‌های این بازدید</button>}
            </div>
            {adv && (
              <div className="vt-adv">
                <div className="vt-lb">مرتب‌سازی</div>
                <div className="vt-chips">{([['new', 'جدیدترین'], ['old', 'قدیمی‌ترین'], ['miss', 'بیشترین اشتباه'], ['stale', 'کمترین مرور'], ['rand', 'تصادفی']] as Array<[Sort, string]>).map(([k, l]) => (
                  <button key={k} type="button" className={'vt-chip' + (f.sort === k ? ' on' : '')} onClick={() => { if (k === 'rand') setSeed(Date.now() % 1e6); upd({ sort: k }); }}>{l}</button>))}</div>
                <div className="vt-lb">دلیل ذخیره</div>
                <div className="vt-chips">
                  <button type="button" className={'vt-chip' + (!f.why ? ' on' : '')} onClick={() => upd({ why: '' })}>همه</button>
                  {(Object.keys(WHY) as VaultWhy[]).filter((k) => items.some((q) => q.why === k)).map((k) => <button key={k} type="button" className={'vt-chip ' + WHY[k].g + (f.why === k ? ' on' : '')} onClick={() => upd({ why: f.why === k ? '' : k })}>{WHY[k].l}</button>)}
                </div>
                {items.some((q) => q.cause) && (<>
                  <div className="vt-lb">علت اشتباه یا نکته</div>
                  <div className="vt-chips">
                    <button type="button" className={'vt-chip' + (!f.cause ? ' on' : '')} onClick={() => upd({ cause: '' })}>همه</button>
                    {Object.keys(CAUSE_LABEL).filter((k) => items.some((q) => q.cause === k)).map((k) => <button key={k} type="button" className={'vt-chip' + (f.cause === k ? ' on' : '')} onClick={() => upd({ cause: f.cause === k ? '' : k })}>{CAUSE_LABEL[k]}</button>)}
                  </div>
                </>)}
                {f.unit && <div className="vt-chips"><button type="button" className="vt-chip on" onClick={() => upd({ unit: '' })}>مبحث: {labelForUnits([f.unit])} ×</button></div>}
              </div>
            )}
          </div>
        </>
      )}

      {ready && !view.length && (
        <div className="vt-empty">
          <h2>{items.length ? 'موردی با این فیلترها پیدا نشد' : 'گنجینهٔ شما خالی است'}</h2>
          <p>{items.length ? 'فیلتر یا جستجوی دیگری امتحان کنید.' : 'از سؤالی که غلط زدید عکس بگیرید یا paste کنید، گزینهٔ درست را مشخص کنید و ذخیره کنید. سؤال‌های غلط «بانک تست» هم با یک دکمه به اینجا می‌آیند.'}</p>
          {!items.length && <button type="button" className="vt-btn p" onClick={() => openVaultEditor({})}><Plus size={17} /> اولین سؤال را ذخیره کنید</button>}
          {!items.length && <button type="button" className="vt-btn go" onClick={() => openVaultBulk({})}><ImagePlus size={17} /> ورود گروهی از گالری</button>}
        </div>
      )}

      <div className="vt-feed">
        {view.slice(0, limit).map((q, i) => <Card key={q.id} q={q} n={i + 1} s={sess[q.id] || NO_SESS} set={set} zoom={setZoomSrc} onOpenTracker={onOpenTracker} />)}
      </div>
      <div ref={more} style={{ height: 1 }} />

      {ready && items.length > 0 && (
        <button type="button" className="vt-fab" aria-label="ذخیرهٔ سؤال" onClick={() => openVaultEditor({ book: f.book, lesson: f.lesson })}><Plus size={26} /></button>
      )}
      {zoomSrc && <div className="vt-zoom vt-lock" role="dialog" aria-modal="true" onClick={() => setZoomSrc(null)}><img src={zoomSrc} alt="" /></div>}
    </main>
  );
};
