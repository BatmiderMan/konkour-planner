/** Small shared pieces of the question lab: pictures, the mark bar (⭐ 🤔 level note vault), the question viewer, the data hook. */
import React, { useCallback, useEffect, useState } from 'react';
import { Star, HelpCircle, Gem, StickyNote, X, ChevronLeft, ChevronRight, Eye, EyeOff, BookOpen } from 'lucide-react';
import { Attempt, BANK_EVENT, BankBook, LEVEL, LabSet, MASTERY, QMeta, Ref, Section, explUrl, getSections, imageBlob, imageUrl, keyOf, listAttempts, listBooks, listMeta, listSets, masteryOf, patchMeta } from './store';
import { alertDialog } from '../dialog';
import { toPersianDigits as P } from '../utils';
import { openVaultEditor } from '../vault/launch';
import { linkToVault } from '../vault/bankLink';
import { useVault } from '../vault/store';
import { DrawStage, useDrawDoc } from './draw';

export const QImg: React.FC<{ b: string; n: number; e?: boolean; className?: string; onClick?: () => void }> = ({ b, n, e, className, onClick }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let live = true; setSrc(null); (e ? explUrl(b, n) : imageUrl(b, n)).then((u) => { if (live) setSrc(u); }).catch(() => { /* missing */ }); return () => { live = false; }; }, [b, n, e]);
  if (!src) return <div className={'bk-img ph ' + (className || '')} aria-busy="true" />;
  return <img className={'bk-img ' + (className || '')} src={src} alt={(e ? 'پاسخ تشریحی ' : 'سؤال ') + n} draggable={false} onClick={onClick} />;
};

export interface Lab {
  ready: boolean; books: BankBook[]; bookMap: Map<string, BankBook>; meta: Record<string, QMeta>; attempts: Attempt[]; sets: LabSet[]; sections: Record<string, Section[]>;
}
export const useLab = (): Lab => {
  const [s, setS] = useState<Lab>({ ready: false, books: [], bookMap: new Map(), meta: {}, attempts: [], sets: [], sections: {} });
  const load = useCallback(async () => {
    try {
      const [books, meta, attempts, sets] = await Promise.all([listBooks(), listMeta(), listAttempts(), listSets()]);
      const sections: Record<string, Section[]> = {};
      await Promise.all(books.map(async (b) => { sections[b.id] = await getSections(b.id); }));
      setS({ ready: true, books, bookMap: new Map(books.map((b) => [b.id, b])), meta, attempts, sets, sections });
    } catch { setS((x) => ({ ...x, ready: true })); }
  }, []);
  useEffect(() => { load(); window.addEventListener(BANK_EVENT, load); return () => window.removeEventListener(BANK_EVENT, load); }, [load]);
  return s;
};

/** put questions in the vault as REFERENCES (nothing is copied or uploaded) */
export async function addRefsToVault(lab: Lab, refs: Ref[], why: 'wrong' | 'tricky' | 'good' = 'tricky') {
  let added = 0, skipped = 0;
  for (const b of new Set(refs.map((r) => r.b))) {
    const book = lab.bookMap.get(b); if (!book) continue;
    const r = await linkToVault(book, refs.filter((x) => x.b === b).map((x) => x.n), why); added += r.added; skipped += r.skipped;
  }
  await alertDialog(`${P(added)} سؤال به گنجینه اضافه شد${skipped ? ` (${P(skipped)} مورد از قبل بود)` : ''}. فقط شمارهٔ سؤال ذخیره می‌شود؛ تصویر از همین کتابِ واردشده خوانده می‌شود و چیزی روی سرور نمی‌رود.`);
}

/* ⭐ 🤔 level · note · vault — works on one question and saves at once */
export const MarkBar: React.FC<{ book: BankBook; n: number; meta?: QMeta; pick?: number; compact?: boolean }> = ({ book, n, meta, pick, compact }) => {
  const { items } = useVault();
  const [note, setNote] = useState(false);
  const [txt, setTxt] = useState(meta?.note || '');
  useEffect(() => { setTxt(meta?.note || ''); setNote(false); }, [book.id, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = items.some((q) => q.src && q.src.b === book.id && q.src.n === n);
  const lvl = meta?.lvl || 0, st = masteryOf(meta);
  return (
    <div className={'bk-marks' + (compact ? ' compact' : '')}>
      <div className="bk-mrow">
        <button type="button" className={'bk-mk' + (meta?.star ? ' on star' : '')} aria-pressed={!!meta?.star} onClick={() => patchMeta(book.id, n, { star: !meta?.star })}><Star size={16} /><span className="lbl"> مهم</span></button>
        <button type="button" className={'bk-mk' + (meta?.doubt ? ' on doubt' : '')} aria-pressed={!!meta?.doubt} onClick={() => patchMeta(book.id, n, { doubt: !meta?.doubt })}><HelpCircle size={16} /><span className="lbl"> شک دارم</span></button>
        <button type="button" className={'bk-mk lv' + lvl} onClick={() => patchMeta(book.id, n, { lvl: ((lvl + 1) % 4) as 0 | 1 | 2 | 3 })} title={'سطح سختی از نگاه شما: ' + LEVEL[lvl]}>{compact ? <span className="lvdot">{lvl ? ['', 'آ', 'م', 'س'][lvl] : '◌'}</span> : 'سطح: ' + LEVEL[lvl]}</button>
        <button type="button" className={'bk-mk' + (meta?.note ? ' on' : '')} onClick={() => setNote((v) => !v)}><StickyNote size={16} /><span className="lbl"> یادداشت</span></button>
        {saved
          ? <span className="bk-pill ok">در گنجینه ✓</span>
          : <button type="button" className="bk-mk" onClick={async () => {
            const img = await imageBlob(book.id, n); if (!img) { await alertDialog('تصویر این سؤال پیدا نشد.'); return; }
            openVaultEditor({ book: book.title, answer: book.answers[n] || 0, choices: 4, why: pick === 0 ? 'time' : pick && pick === book.answers[n] ? 'good' : pick ? 'wrong' : 'tricky', img, src: { k: 'bank', b: book.id, n } });
          }}><Gem size={16} /><span className="lbl"> گنجینه</span></button>}
        <span className={'bk-st s' + st} hidden={compact}>{MASTERY[st]}{meta?.tries ? ` · ${P(meta.wins || 0)}/${P(meta.tries)}` : ''}</span>
      </div>
      {note && <textarea className="bk-note" rows={2} value={txt} placeholder="یادداشت شما دربارهٔ این سؤال…" onChange={(e) => setTxt(e.target.value)} onBlur={() => patchMeta(book.id, n, { note: txt.trim() })} />}
      {!note && meta?.note && <p className="bk-notep" onClick={() => setNote(true)}>📝 {meta.note}</p>}
    </div>
  );
};

/* a question with its answer and worked solution; flips through a list */
const ViewQ: React.FC<{ r: Ref; session?: string }> = ({ r, session }) => {
  const { doc, setDoc } = useDrawDoc(session || '-', keyOf(r.b, r.n));
  return <DrawStage id={'v'} doc={doc} setDoc={setDoc} readOnly><QImg b={r.b} n={r.n} /></DrawStage>;
};
export const Viewer: React.FC<{ refs: Ref[]; start: number; lab: Lab; picks?: Record<string, number>; session?: string; onClose: () => void }> = ({ refs, start, lab, picks, session, onClose }) => {
  const [i, setI] = useState(start);
  const [show, setShow] = useState(true);
  const r = refs[i], book = r && lab.bookMap.get(r.b);
  const go = useCallback((d: number) => setI((x) => Math.min(refs.length - 1, Math.max(0, x + d))), [refs.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowLeft') go(1); else if (e.key === 'ArrowRight') go(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [go, onClose]);
  if (!r || !book) return null;
  const right = book.answers[r.n], pick = picks?.[keyOf(r.b, r.n)];
  const hasE = book.expl.includes(r.n);
  return (
    <div className="bk-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bk-lb-card" onClick={(e) => e.stopPropagation()}>
        <header><b>{lab.books.length > 1 ? book.title + ' · ' : ''}سؤال {P(r.n)} <small>({P(i + 1)} از {P(refs.length)})</small></b><button type="button" className="bk-x" onClick={onClose} aria-label="بستن"><X size={20} /></button></header>
        <div className="bk-lb-body">
          <div className="bk-qwrap">{session ? <ViewQ r={r} session={session} /> : <QImg b={r.b} n={r.n} />}</div>
          <div className="bk-ansrow">
            <span className="bk-pill ok">پاسخ درست: گزینهٔ {P(right || 0)}</span>
            {pick !== undefined && (pick === 0 ? <span className="bk-pill">نزده بودید</span> : <span className={'bk-pill ' + (pick === right ? 'ok' : 'bad')}>پاسخ شما: {P(pick)}</span>)}
            {hasE ? <button type="button" className="bk-btn" onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={16} /> : <Eye size={16} />} پاسخ تشریحی</button> : <span className="bk-hint">برای این تست پاسخ تشریحی در کتاب نیست</span>}
          </div>
          {hasE && show && <div className="bk-qwrap bk-expl"><QImg b={r.b} n={r.n} e />{book.shared.includes(r.n) && <p className="bk-hint"><BookOpen size={14} /> این تصویر شامل تشریحی سؤال کناری هم هست.</p>}</div>}
          <MarkBar book={book} n={r.n} meta={lab.meta[keyOf(r.b, r.n)]} pick={pick} />
        </div>
        <footer>
          <button type="button" className="bk-btn" onClick={() => go(-1)} disabled={i === 0}><ChevronRight size={18} /> قبلی</button>
          <button type="button" className="bk-btn" onClick={() => go(1)} disabled={i === refs.length - 1}>بعدی <ChevronLeft size={18} /></button>
        </footer>
      </div>
    </div>
  );
};
