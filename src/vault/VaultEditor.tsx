import React from 'react';
import { Camera, Link2, Trash2, X } from 'lucide-react';
import { Sheet } from '../components/ui/Sheet';
import { TopicPicker } from '../components/tracker/TopicPicker';
import { confirmDialog } from '../dialog';
import { showUndo } from '../undo';
import { BOOKS, BY_UNIT } from '../trackerStore';
import { labelForUnits } from '../trackerPlan';
import { loadSettings } from '../examStore';
import { toPersianDigits as P } from '../utils';
import { compressImage } from './image';
import { CAUSE, DIFF_LABEL, VaultQ, VaultWhy, WHY, getVault, imageUrl, newId, putQuestion, removeQuestion } from './store';
import type { EditorDraft } from './launch';
import './vault.css';

const LAST = 'planex_vault_last_v1';
const readLast = (): Partial<VaultQ> => { try { return JSON.parse(localStorage.getItem(LAST) || '{}') || {}; } catch { return {}; } };

interface Form {
  book: string; lesson: string; units: string[]; why: VaultWhy; cause: string; choices: number; answer: number; diff: number; etext: string; star: boolean;
}
type Slot = 'q' | 'e';
interface Pic { blob?: Blob | null; url: string | null; own: boolean }

const topCount = (xs: string[], n: number): string[] => {
  const m: Record<string, number> = {};
  xs.forEach((x) => { if (x) m[x] = (m[x] || 0) + 1; });
  return Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, n);
};

export const VaultEditor: React.FC<{ draft: EditorDraft; onClose: () => void }> = ({ draft, onClose }) => {
  const items = getVault().items;
  const existing = React.useMemo(() => (draft.id ? items.find((x) => x.id === draft.id) : undefined), [draft.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const isNew = !existing;
  const [form, setForm] = React.useState<Form>(() => {
    if (existing) return { book: existing.book, lesson: existing.lesson, units: existing.units, why: existing.why, cause: existing.cause, choices: existing.choices, answer: existing.answer, diff: existing.diff, etext: existing.etext, star: existing.star };
    const l = readLast();
    return {
      book: draft.book ?? l.book ?? '', lesson: draft.lesson ?? l.lesson ?? '', units: draft.units || [], why: draft.why || (l.why as VaultWhy) || 'wrong', cause: '',
      choices: draft.choices || l.choices || 4, answer: draft.answer || 0, diff: l.diff || 0, etext: draft.etext || '', star: false
    };
  });
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const [pics, setPics] = React.useState<Record<Slot, Pic>>({ q: { url: null, own: false }, e: { url: null, own: false } });
  const [act, setAct] = React.useState<Slot>('q');
  const [picker, setPicker] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const picsRef = React.useRef(pics);
  picsRef.current = pics;

  // pictures: what is already saved, or the image the draft brings along
  React.useEffect(() => {
    let live = true;
    if (draft.img) { const u = URL.createObjectURL(draft.img); setPics((p) => ({ ...p, q: { ...(draft.src ? {} : { blob: draft.img }), url: u, own: true } })); } // a bank question is only linked, never copied
    else if (existing) imageUrl(existing.id, 'q').then((u) => { if (live && u) setPics((p) => (p.q.blob ? p : { ...p, q: { url: u, own: false } })); }).catch(() => { /* ignore */ });
    if (existing?.hasEimg) imageUrl(existing.id, 'e').then((u) => { if (live && u) setPics((p) => (p.e.blob !== undefined ? p : { ...p, e: { url: u, own: false } })); }).catch(() => { /* ignore */ });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => () => { (['q', 'e'] as Slot[]).forEach((s) => { const p = picsRef.current[s]; if (p.own && p.url) URL.revokeObjectURL(p.url); }); }, []);

  const take = React.useCallback(async (file: Blob, slot: Slot) => {
    if (!file.type.startsWith('image/')) return;
    try {
      const blob = await compressImage(file);
      const url = URL.createObjectURL(blob);
      setPics((p) => { if (p[slot].own && p[slot].url) URL.revokeObjectURL(p[slot].url as string); return { ...p, [slot]: { blob, url, own: true } }; });
    } catch { setNote('این تصویر خوانده نشد.'); }
  }, []);
  const clearPic = (slot: Slot) => setPics((p) => { if (p[slot].own && p[slot].url) URL.revokeObjectURL(p[slot].url as string); return { ...p, [slot]: { blob: null, url: null, own: false } }; });

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files || []).find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); void take(f, act); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [act, take]);

  const g = WHY[form.why].g;
  const hasImg = !!pics.q.url;
  const miss = [!hasImg && 'عکس سؤال', !form.book.trim() && 'نام کتاب', !form.answer && 'گزینهٔ درست'].filter(Boolean) as string[];

  const books = React.useMemo(() => topCount(items.map((x) => x.book), 5), [items]);
  const lessons = React.useMemo(() => topCount(items.filter((x) => x.book === form.book).map((x) => x.lesson), 5), [items, form.book]);
  const bookHints = React.useMemo(() => Array.from(new Set([...items.map((x) => x.book), ...BOOKS.map((b) => b.subject), ...loadSettings().sources.map((s) => s.name)])), [items]);
  const lessonHints = React.useMemo(() => Array.from(new Set(items.map((x) => x.lesson).filter(Boolean))), [items]);

  const save = async (next: boolean) => {
    if (miss.length || busy) return;
    setBusy(true);
    try {
      const now = Date.now();
      const qBlob = pics.q.blob || undefined;
      const eBlob = pics.e.blob === undefined ? undefined : pics.e.blob; // undefined = untouched
      const hasE = eBlob === undefined ? !!existing?.hasEimg : !!eBlob;
      const rec: VaultQ = {
        tries: 0, wins: 0, box: 0, due: 0, last: 0, ...(existing || {}), ...(!existing && draft.src ? { src: draft.src } : {}),
        id: existing?.id || newId(), created: existing?.created || now, updated: now,
        book: form.book.trim(), lesson: form.lesson.trim(), why: form.why, cause: form.cause, choices: form.choices, answer: form.answer, diff: form.diff,
        etext: form.etext, star: form.star, hasEimg: hasE, units: form.units.filter((u) => BY_UNIT[u])
      };
      await putQuestion(rec, { ...(qBlob ? { q: qBlob } : {}), ...(eBlob !== undefined ? { e: eBlob } : {}) });
      try { localStorage.setItem(LAST, JSON.stringify({ book: rec.book, lesson: rec.lesson, why: rec.why, choices: rec.choices, diff: rec.diff })); } catch { /* ignore */ }
      if (next && isNew) {
        (['q', 'e'] as Slot[]).forEach((s) => { if (pics[s].own && pics[s].url) URL.revokeObjectURL(pics[s].url as string); });
        setPics({ q: { url: null, own: false }, e: { url: null, own: false } });
        setForm((f) => ({ ...f, answer: 0, cause: '', etext: '', star: false }));
        setAct('q'); setNote(`✓ ذخیره شد (${P(getVault().items.length)} سؤال در گنجینه)`);
        setTimeout(() => setNote(''), 2600);
      } else onClose();
    } catch {
      setNote('ذخیره انجام نشد. شاید حافظه‌ی مرورگر پر است یا حالت خصوصی فعال است.');
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!existing || !(await confirmDialog('این سؤال حذف شود؟'))) return;
    const restore = await removeQuestion(existing.id);
    onClose();
    showUndo('سؤال از گنجینه حذف شد', restore);
  };

  const onKey = (e: React.KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save(isNew); } };

  const drop = (slot: Slot) => {
    const p = pics[slot];
    const empty = !p.url;
    return (
      <div
        className={'vt-drop' + (slot === 'q' ? ' big' : '') + (act === slot ? ' on' : '')}
        onClick={() => setAct(slot)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); setAct(slot); const f = e.dataTransfer.files[0]; if (f) void take(f, slot); }}
      >
        {empty ? (
          <div>
            <b>{slot === 'q' ? 'عکس سؤال را اینجا بگذارید' : 'عکس پاسخ تشریحی'}</b>
            <span>Paste (Ctrl+V) یا رها کردن فایل</span>
            <button type="button" className="vt-btn" onClick={() => { setAct(slot); fileRef.current?.click(); }}><Camera size={16} /> عکس بگیرید / انتخاب فایل</button>
          </div>
        ) : (
          <>
            <img src={p.url as string} alt="" />
            <button type="button" className="vt-x" aria-label="حذف تصویر" onClick={(e) => { e.stopPropagation(); clearPic(slot); }}><X size={14} /></button>
          </>
        )}
      </div>
    );
  };

  const chip = (key: string, label: string, on: boolean, click: () => void, cls = '') => (
    <button key={key} type="button" className={'vt-chip ' + cls + (on ? ' on' : '')} aria-pressed={on} onClick={click}>{label}</button>
  );

  return (
    <>
      <Sheet onClose={onClose} title={isNew ? 'ذخیرهٔ سؤال در گنجینه' : 'ویرایش سؤال'} z={760}>
        <div className="vt-editor" onKeyDown={onKey}>
          {drop('q')}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void take(f, act); }} />

          <div className="vt-sec">
            <div className="vt-lb">از کجاست؟</div>
            {books.length > 0 && <div className="vt-chips">{books.map((b) => chip('b' + b, b, b === form.book, () => set({ book: b, lesson: '' })))}</div>}
            <div className="vt-row">
              <input className="vt-in" list="vt-books" value={form.book} onChange={(e) => set({ book: e.target.value })} placeholder="کتاب / منبع" aria-label="کتاب یا منبع" />
              <input className="vt-in" list="vt-lessons" value={form.lesson} onChange={(e) => set({ lesson: e.target.value })} placeholder="درس / فصل (اختیاری)" aria-label="درس یا فصل" />
            </div>
            <datalist id="vt-books">{bookHints.map((b) => <option key={b} value={b} />)}</datalist>
            <datalist id="vt-lessons">{lessonHints.map((b) => <option key={b} value={b} />)}</datalist>
            {lessons.length > 0 && <div className="vt-chips">{lessons.map((l) => chip('l' + l, l, l === form.lesson, () => set({ lesson: l })))}</div>}
            <div className="vt-topic">
              {form.units.length > 0 && (
                <span className="vt-linked"><Link2 size={14} />{labelForUnits(form.units.slice(0, 1)) || 'مبحث'}{form.units.length > 1 ? ` + ${P(form.units.length - 1)} مبحث دیگر` : ''}
                  <button type="button" aria-label="حذف پیوند" onClick={() => set({ units: [] })}><X size={13} /></button></span>
              )}
              <button type="button" className="vt-btn" onClick={() => setPicker(true)}><Link2 size={16} /> {form.units.length ? 'تغییر مبحث' : 'پیوند به مبحث درسی'}</button>
            </div>
            {!form.units.length && <p className="vt-hint">اگر سؤال را به مبحثی از «پیگیری مباحث» وصل کنید، با هر غلط، همان مبحث برای مرور علامت می‌خورد.</p>}
          </div>

          <div className="vt-sec">
            <div className="vt-lb">چه اتفاقی افتاد؟</div>
            <div className="vt-chips">{(Object.keys(WHY) as VaultWhy[]).map((k) => chip(k, WHY[k].l, k === form.why, () => set({ why: k, cause: WHY[k].g === g ? form.cause : '' }), WHY[k].g))}</div>
          </div>
          <div className="vt-sec">
            <div className="vt-lb">{g === 'w' ? 'علت اشتباه چه بود؟ (اختیاری)' : 'چه چیزی ارزش یادآوری دارد؟ (اختیاری)'}</div>
            <div className="vt-chips">{Object.entries(CAUSE[g]).map(([k, l]) => chip(k, l, k === form.cause, () => set({ cause: form.cause === k ? '' : k })))}</div>
          </div>

          <div className="vt-row">
            <div className="vt-sec">
              <div className="vt-lb">چند گزینه‌ای؟</div>
              <div className="vt-seg">{[2, 3, 4, 5, 6].map((n) => <button key={n} type="button" className={form.choices === n ? 'on' : ''} onClick={() => set({ choices: n, answer: form.answer > n ? 0 : form.answer })}>{P(n)}</button>)}</div>
            </div>
            <div className="vt-sec">
              <div className="vt-lb">سختی (اختیاری)</div>
              <div className="vt-seg">{[1, 2, 3].map((n) => <button key={n} type="button" className={form.diff === n ? 'on' : ''} onClick={() => set({ diff: form.diff === n ? 0 : n })}>{DIFF_LABEL[n]}</button>)}</div>
            </div>
          </div>

          <div className="vt-sec">
            <div className="vt-lb">گزینهٔ درست کدام است؟</div>
            <div className="vt-pick">{Array.from({ length: form.choices }, (_, i) => <button key={i} type="button" className={form.answer === i + 1 ? 'on' : ''} aria-pressed={form.answer === i + 1} onClick={() => set({ answer: i + 1 })}>{P(i + 1)}</button>)}</div>
          </div>

          <details className="vt-more" open={!!(existing?.hasEimg || form.etext)}>
            <summary>پاسخ تشریحی و یادداشت (اختیاری)</summary>
            {drop('e')}
            <textarea className="vt-in" rows={3} value={form.etext} onChange={(e) => set({ etext: e.target.value })} placeholder="چرا این گزینه درست است یا کجا اشتباه کردم" />
          </details>

          <div className="vt-foot">
            {!isNew && <button type="button" className="vt-btn d" onClick={remove}><Trash2 size={16} /> حذف</button>}
            <span className="vt-hint grow" role="status">{note || (miss.length ? 'هنوز لازم است: ' + miss.join('، ') : 'Ctrl+Enter برای ذخیره')}</span>
            <button type="button" className="vt-btn" onClick={onClose}>انصراف</button>
            {isNew && <button type="button" className="vt-btn" disabled={!!miss.length || busy} onClick={() => save(true)}>ذخیره و بعدی</button>}
            <button type="button" className="vt-btn p" disabled={!!miss.length || busy} onClick={() => save(false)}>ذخیره</button>
          </div>
        </div>
      </Sheet>
      {picker && (
        <TopicPicker
          z={790}
          title="پیوند سؤال به مبحث"
          confirmLabel="پیوند بزن"
          initialUnits={form.units}
          onClose={() => setPicker(false)}
          onPick={(p) => {
            const x = BY_UNIT[p.us[0]];
            setForm((f) => ({
              ...f, units: p.us,
              book: f.book.trim() ? f.book : p.subject,
              lesson: f.lesson.trim() || !x ? f.lesson : BOOKS[x.bi].chapters[x.ci].t
            }));
            setPicker(false);
          }}
        />
      )}
    </>
  );
};

