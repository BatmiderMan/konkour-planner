import React from 'react';
import {
  ArrowDown, ArrowUp, Check, CloudRain, GripVertical, Heart, ListMusic, ListPlus, Music2, Pencil, Play, Plus,
  RotateCcw, Search, Shuffle, Trash2, X, ChevronRight
} from 'lucide-react';
import {
  AMBIENT_TRACKS, SortKey, Track, musicAddFiles, musicAddToPlaylist, musicAddToQueue, musicClearLibrary, musicClearQueue,
  musicCreatePlaylist, musicDeletePlaylist, musicMoveInPlaylist, musicMoveInQueue, musicPlay, musicPlayList, musicPlayNext,
  musicRemoveAmbient, musicRemoveFromPlaylist, musicRemoveMany, musicRenamePlaylist, musicRenameTrack, musicRestoreAmbient,
  musicSetSort, musicToggleFav, musicUnqueue, sortTracks, trackById, useMusic, visibleAmbient
} from '../../musicStore';
import { confirmDialog } from '../../dialog';
import { toPersianDigits } from '../../utils';
import { Equalizer, ambientIcon, fmt, fmtLong, fmtSize } from './musicUi';

type Tab = 'songs' | 'lists' | 'focus' | 'queue';
type Toast = (msg: string) => void;

const SORT_LABEL: Record<SortKey, string> = {
  added: 'تازه‌ترین', name: 'نام (الفبا)', duration: 'طولانی‌ترین', fav: 'علاقه‌مندی‌ها اول'
};
const n = (x: number) => toPersianDigits(x);

// ---------------------------------------------------------------- one song row
interface RowProps {
  t: Track; on: boolean; playing: boolean;
  selecting?: boolean; selected?: boolean;
  onPlay: () => void; onSelect?: () => void; onMenu?: () => void; onFav?: () => void;
  drag?: { over: boolean; onStart: () => void; onOver: () => void; onDrop: () => void; onEnd: () => void };
}
const TrackRow: React.FC<RowProps> = ({ t, on, playing, selecting, selected, onPlay, onSelect, onMenu, onFav, drag }) => (
  <div
    className={'mp-row' + (on ? ' on' : '') + (selected ? ' picked' : '') + (drag?.over ? ' over' : '')}
    draggable={!!drag}
    onDragStart={drag ? (e) => { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', t.id); } catch { /* ignore */ } drag.onStart(); } : undefined}
    onDragOver={drag ? (e) => { e.preventDefault(); drag.onOver(); } : undefined}
    onDrop={drag ? (e) => { e.preventDefault(); e.stopPropagation(); drag.onDrop(); } : undefined}
    onDragEnd={drag?.onEnd}
  >
    {drag && !selecting && <span className="mp-grip" aria-hidden="true"><GripVertical size={15} /></span>}
    {selecting && (
      <button type="button" className={'mp-check' + (selected ? ' on' : '')} onClick={onSelect} aria-pressed={!!selected} aria-label={`انتخاب ${t.title}`}>
        {selected && <Check size={14} strokeWidth={3} />}
      </button>
    )}
    <button type="button" className="mp-row-main" onClick={selecting ? onSelect : onPlay}>
      <span className="mp-row-ic">{on && playing ? <Equalizer on /> : <Play size={14} />}</span>
      <span className="mp-row-title">{t.title}</span>
      {t.duration ? <span className="mp-row-dur">{fmt(t.duration)}</span> : null}
    </button>
    {!selecting && onFav && (
      <button type="button" className={'mp-row-btn fav' + (t.fav ? ' on' : '')} onClick={onFav} aria-pressed={!!t.fav} aria-label={t.fav ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}>
        <Heart size={15} fill={t.fav ? 'currentColor' : 'none'} />
      </button>
    )}
    {!selecting && onMenu && (
      <button type="button" className="mp-row-btn" onClick={onMenu} aria-label={`گزینه‌های ${t.title}`}><span className="mp-dots" aria-hidden="true">⋮</span></button>
    )}
  </div>
);

// ---------------------------------------------------------------- modal helpers
const Modal: React.FC<{ onClose: () => void; title: string; children: React.ReactNode }> = ({ onClose, title, children }) => (
  <div className="mp-modal" onClick={(e) => { e.stopPropagation(); onClose(); }}>
    <div className="mp-modal-card" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <div className="mp-modal-head"><b>{title}</b><button type="button" className="mp-icon sm" onClick={onClose} aria-label="بستن"><X size={17} /></button></div>
      {children}
    </div>
  </div>
);

const PlaylistPicker: React.FC<{ ids: string[]; onClose: () => void; toast: Toast }> = ({ ids, onClose, toast }) => {
  const m = useMusic();
  const [name, setName] = React.useState('');
  const add = (plId: string, plName: string) => {
    const c = musicAddToPlaylist(plId, ids);
    toast(c ? `${n(c)} آهنگ به «${plName}» اضافه شد` : 'این آهنگ‌ها از قبل در لیست هستند');
    onClose();
  };
  const create = () => {
    const nm = name.trim() || 'لیست جدید';
    musicCreatePlaylist(nm, ids);
    toast(`لیست «${nm}» ساخته شد`);
    onClose();
  };
  return (
    <Modal onClose={onClose} title={`افزودن ${n(ids.length)} آهنگ به لیست`}>
      <div className="mp-modal-list">
        {m.playlists.map((p) => (
          <button key={p.id} type="button" className="mp-pick" onClick={() => add(p.id, p.name)}>
            <ListMusic size={16} /><span>{p.name}</span><em>{n(p.trackIds.length)}</em>
          </button>
        ))}
        {!m.playlists.length && <p className="mp-note">هنوز لیستی نساخته‌ای. یک نام بنویس و بساز.</p>}
      </div>
      <form className="mp-inline-form" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="نام لیست جدید" maxLength={40} />
        <button type="submit" className="mp-btn primary"><Plus size={16} /> ساخت</button>
      </form>
    </Modal>
  );
};

const TrackMenu: React.FC<{
  id: string; listId: string | null; onPlay: () => void; onClose: () => void; onPickPlaylist: (ids: string[]) => void; toast: Toast;
}> = ({ id, listId, onPlay, onClose, onPickPlaylist, toast }) => {
  const m = useMusic();
  const t = trackById(m, id);
  const [mode, setMode] = React.useState<'main' | 'rename'>('main');
  const [title, setTitle] = React.useState(t?.title || '');
  if (!t) return null;
  const pl = listId && listId !== 'fav' ? m.playlists.find((p) => p.id === listId) : undefined;
  const idx = pl ? pl.trackIds.indexOf(id) : -1;

  const item = (icon: React.ReactNode, label: string, fn: () => void, danger = false, disabled = false) => (
    <button type="button" className={'mp-menu-item' + (danger ? ' danger' : '')} onClick={fn} disabled={disabled}>{icon}<span>{label}</span></button>
  );

  if (mode === 'rename') {
    return (
      <Modal onClose={onClose} title="تغییر نام آهنگ">
        <form className="mp-inline-form" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { musicRenameTrack(id, title); toast('نام آهنگ تغییر کرد'); onClose(); } }}>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} aria-label="نام آهنگ" />
          <button type="submit" className="mp-btn primary" disabled={!title.trim()}><Check size={16} /> ذخیره</button>
        </form>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={t.title}>
      <div className="mp-menu">
        {item(<Play size={17} />, 'پخش', () => { onPlay(); onClose(); })}
        {item(<ListPlus size={17} />, 'پخش بعدی', () => { musicPlayNext([id]); toast('بعد از آهنگ فعلی پخش می‌شود'); onClose(); })}
        {item(<ListPlus size={17} />, 'افزودن به صف', () => { musicAddToQueue([id]); toast('به صف اضافه شد'); onClose(); })}
        {item(<Heart size={17} fill={t.fav ? 'currentColor' : 'none'} />, t.fav ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها', () => { musicToggleFav(id); onClose(); })}
        {item(<ListMusic size={17} />, 'افزودن به لیست…', () => { onClose(); onPickPlaylist([id]); })}
        {item(<Pencil size={17} />, 'تغییر نام', () => setMode('rename'))}
        {pl && item(<ArrowUp size={17} />, 'یک ردیف بالاتر', () => { musicMoveInPlaylist(pl.id, idx, idx - 1); onClose(); }, false, idx <= 0)}
        {pl && item(<ArrowDown size={17} />, 'یک ردیف پایین‌تر', () => { musicMoveInPlaylist(pl.id, idx, idx + 1); onClose(); }, false, idx < 0 || idx >= pl.trackIds.length - 1)}
        {pl && item(<X size={17} />, 'حذف از این لیست', () => { musicRemoveFromPlaylist(pl.id, [id]); toast('از لیست برداشته شد'); onClose(); })}
        {item(<Trash2 size={17} />, 'حذف از دستگاه', async () => {
          onClose();
          if (await confirmDialog(`«${t.title}» برای همیشه از دستگاه حذف شود؟`)) { await musicRemoveMany([id]); toast('آهنگ حذف شد'); }
        }, true)}
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- the library
export const MusicLibrary: React.FC<{ toast: Toast }> = ({ toast }) => {
  const m = useMusic();
  const [tab, setTabRaw] = React.useState<Tab>('songs');
  const [openList, setOpenList] = React.useState<string | null>(null); // 'fav' or a playlist id
  const [query, setQuery] = React.useState('');
  const [sel, setSel] = React.useState<Set<string> | null>(null);
  const [adding, setAdding] = React.useState<Set<string> | null>(null);
  const [menu, setMenu] = React.useState<{ id: string; listId: string | null; ids: string[]; ctx: string } | null>(null);
  const [picker, setPicker] = React.useState<string[] | null>(null);
  const [naming, setNaming] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const fileTarget = React.useRef<string | undefined>(undefined);

  const setTab = (t: Tab) => { setTabRaw(t); setSel(null); setAdding(null); setRenaming(null); setNaming(null); };

  // Escape closes the innermost thing first (capture phase so the sheet doesn't close too)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menu) setMenu(null);
      else if (picker) setPicker(null);
      else if (sel) setSel(null);
      else if (adding) setAdding(null);
      else if (renaming !== null) setRenaming(null);
      else if (naming !== null) setNaming(null);
      else if (openList) setOpenList(null);
      else return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [menu, picker, sel, adding, renaming, naming, openList]);

  // a playlist that was deleted while open
  const openPl = openList && openList !== 'fav' ? m.playlists.find((p) => p.id === openList) : undefined;
  React.useEffect(() => { if (openList && openList !== 'fav' && !openPl) setOpenList(null); }, [openList, openPl]);

  const pickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const target = fileTarget.current;
    if (files && files.length) {
      const ids = await musicAddFiles(files, target);
      if (ids.length) toast(`${n(ids.length)} آهنگ اضافه شد`);
    }
    e.target.value = '';
  };
  const openPicker = (intoPlaylist?: string) => { fileTarget.current = intoPlaylist; fileRef.current?.click(); };

  const q = query.trim().toLowerCase();
  const songs = React.useMemo(
    () => sortTracks(m.tracks, m.sort).filter((t) => !q || t.title.toLowerCase().includes(q)),
    [m.tracks, m.sort, q]
  );
  const favs = m.tracks.filter((t) => t.fav);
  const totalDur = m.tracks.reduce((s, t) => s + (t.duration || 0), 0);
  const totalSize = m.tracks.reduce((s, t) => s + (t.size || 0), 0);

  const toggleSel = (id: string) => setSel((s) => { const x = new Set(s || []); x.has(id) ? x.delete(id) : x.add(id); return x; });
  const toggleAdd = (id: string) => setAdding((s) => { const x = new Set(s || []); x.has(id) ? x.delete(id) : x.add(id); return x; });

  const deleteMany = async (ids: string[]) => {
    if (!ids.length) return;
    const msg = ids.length === 1 ? `«${trackById(m, ids[0])?.title || 'آهنگ'}» برای همیشه از دستگاه حذف شود؟` : `${n(ids.length)} آهنگ برای همیشه از دستگاه حذف شوند؟`;
    if (await confirmDialog(msg)) { await musicRemoveMany(ids); setSel(null); toast(ids.length === 1 ? 'آهنگ حذف شد' : `${n(ids.length)} آهنگ حذف شد`); }
  };

  const openMenu = (id: string, listId: string | null, ids: string[], ctx: string) => setMenu({ id, listId, ids, ctx });

  // ------------------------------------------------------------ songs
  const renderSongs = () => {
    const selecting = !!sel;
    const ids = songs.map((t) => t.id);
    return (
      <>
        <div className="mp-toolbar">
          <label className="mp-search">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجو در آهنگ‌ها" aria-label="جست‌وجو در آهنگ‌ها" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="پاک کردن جست‌وجو"><X size={14} /></button>}
          </label>
          <select className="mp-sort" value={m.sort} onChange={(e) => musicSetSort(e.target.value as SortKey)} aria-label="مرتب‌سازی">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="mp-actions">
          <button type="button" className="mp-btn primary" disabled={!ids.length} onClick={() => musicPlayList(ids, 'all')}><Play size={15} /> پخش همه</button>
          <button type="button" className="mp-btn" disabled={!ids.length} onClick={() => musicPlayList(ids, 'all', true)}><Shuffle size={15} /> تصادفی</button>
          <button type="button" className={'mp-btn' + (selecting ? ' on' : '')} disabled={!m.tracks.length} onClick={() => setSel(selecting ? null : new Set())}><Check size={15} /> انتخاب</button>
          <button type="button" className="mp-btn" onClick={() => openPicker()}><Plus size={15} /> افزودن</button>
        </div>

        <div className="mp-list">
          {!m.tracks.length && (
            <div className="mp-empty">
              <Music2 size={26} />
              <b>هنوز آهنگی نیست</b>
              <span>آهنگ‌های خودت را از گوشی یا کامپیوتر اضافه کن (یا فایل‌ها را همین‌جا رها کن). فایل‌ها فقط روی همین دستگاه ذخیره می‌شوند و جایی آپلود نمی‌شوند.</span>
            </div>
          )}
          {!!m.tracks.length && !songs.length && <div className="mp-empty"><Search size={22} /><b>چیزی پیدا نشد</b></div>}
          {songs.map((t) => (
            <TrackRow
              key={t.id} t={t} on={t.id === m.currentId} playing={m.playing}
              selecting={selecting} selected={!!sel?.has(t.id)}
              onSelect={() => toggleSel(t.id)}
              onPlay={() => musicPlay(t.id, ids, 'all')}
              onFav={() => musicToggleFav(t.id)}
              onMenu={() => openMenu(t.id, null, ids, 'all')}
            />
          ))}
        </div>

        {selecting ? (
          <div className="mp-selbar" role="toolbar" aria-label="کار روی آهنگ‌های انتخاب‌شده">
            <b>{n(sel!.size)} انتخاب</b>
            <button type="button" className="mp-btn sm" onClick={() => setSel(sel!.size === songs.length ? new Set() : new Set(ids))}>{sel!.size === songs.length ? 'هیچ‌کدام' : 'همه'}</button>
            <button type="button" className="mp-btn sm" disabled={!sel!.size} onClick={() => setPicker([...sel!])}><ListMusic size={14} /> لیست</button>
            <button type="button" className="mp-btn sm" disabled={!sel!.size} onClick={() => { musicAddToQueue([...sel!]); toast('به صف اضافه شد'); setSel(null); }}><ListPlus size={14} /> صف</button>
            <button type="button" className="mp-btn sm danger" disabled={!sel!.size} onClick={() => deleteMany([...sel!])}><Trash2 size={14} /> حذف</button>
            <button type="button" className="mp-btn sm" onClick={() => setSel(null)} aria-label="لغو انتخاب"><X size={14} /></button>
          </div>
        ) : !!m.tracks.length && (
          <div className="mp-foot">
            <span>{n(m.tracks.length)} آهنگ · {fmtLong(totalDur)}{totalSize ? ` · ${fmtSize(totalSize)}` : ''}</span>
            <button type="button" onClick={async () => { if (await confirmDialog(`همه‌ی ${n(m.tracks.length)} آهنگ از دستگاه حذف شوند؟ لیست‌های پخش هم خالی می‌شوند.`)) { await musicClearLibrary(); toast('کتابخانه خالی شد'); } }}><Trash2 size={13} /> حذف همه</button>
          </div>
        )}
      </>
    );
  };

  // ------------------------------------------------------------ playlists
  const createList = () => {
    const name = (naming || '').trim();
    if (naming === null) return;
    const id = musicCreatePlaylist(name || 'لیست جدید');
    setNaming(null);
    setOpenList(id);
    toast('لیست ساخته شد');
  };

  const renderLists = () => {
    if (openList) return renderDetail();
    const card = (key: string, icon: React.ReactNode, name: string, ids: string[], ctx: string, onOpen: () => void) => {
      const dur = ids.reduce((s, id) => s + (trackById(m, id)?.duration || 0), 0);
      const playingHere = m.context === ctx && m.playing;
      return (
        <div key={key} className={'mp-row card' + (m.context === ctx && m.currentId ? ' on' : '')}>
          <button type="button" className="mp-row-main" onClick={onOpen}>
            <span className="mp-row-ic big">{playingHere ? <Equalizer on /> : icon}</span>
            <span className="mp-card-txt"><b>{name}</b><em>{n(ids.length)} آهنگ{dur ? ` · ${fmtLong(dur)}` : ''}</em></span>
          </button>
          <button type="button" className="mp-row-btn play" disabled={!ids.length} onClick={() => musicPlayList(ids, ctx)} aria-label={`پخش ${name}`}><Play size={16} /></button>
        </div>
      );
    };
    return (
      <>
        <div className="mp-actions">
          {naming === null
            ? <button type="button" className="mp-btn primary wide" onClick={() => setNaming('')}><Plus size={15} /> لیست پخش جدید</button>
            : (
              <form className="mp-inline-form" onSubmit={(e) => { e.preventDefault(); createList(); }}>
                <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="نام لیست (مثلاً «درس‌خوانی شبانه»)" maxLength={40} aria-label="نام لیست" />
                <button type="submit" className="mp-btn primary"><Check size={16} /> ساخت</button>
                <button type="button" className="mp-btn" onClick={() => setNaming(null)} aria-label="لغو"><X size={16} /></button>
              </form>
            )}
        </div>
        <div className="mp-list">
          {card('fav', <Heart size={15} />, 'علاقه‌مندی‌ها', favs.map((t) => t.id), 'fav', () => setOpenList('fav'))}
          {m.playlists.map((p) => card(p.id, <ListMusic size={15} />, p.name, p.trackIds, 'pl:' + p.id, () => setOpenList(p.id)))}
          {!m.playlists.length && (
            <div className="mp-empty">
              <ListMusic size={26} />
              <b>هنوز لیست پخشی نساخته‌ای</b>
              <span>آهنگ‌هایت را در لیست‌های جدا دسته‌بندی کن؛ مثلاً یکی برای تمرکز عمیق و یکی برای مرور سبک.</span>
            </div>
          )}
        </div>
      </>
    );
  };

  const renderDetail = () => {
    const isFav = openList === 'fav';
    const ctx = isFav ? 'fav' : 'pl:' + openList;
    const ids = isFav ? favs.map((t) => t.id) : (openPl?.trackIds || []);
    const tracks = ids.map((id) => trackById(m, id)).filter((t): t is Track => !!t);
    const dur = tracks.reduce((s, t) => s + (t.duration || 0), 0);
    const name = isFav ? 'علاقه‌مندی‌ها' : openPl?.name || '';

    if (adding && openPl) {
      const pool = sortTracks(m.tracks, 'name').filter((t) => !openPl.trackIds.includes(t.id));
      return (
        <>
          <div className="mp-detail-head">
            <button type="button" className="mp-icon sm" onClick={() => setAdding(null)} aria-label="بازگشت"><ChevronRight size={18} /></button>
            <div className="mp-card-txt"><b>افزودن آهنگ به «{name}»</b><em>آهنگ‌هایی که می‌خواهی را تیک بزن</em></div>
          </div>
          <div className="mp-list">
            {pool.map((t) => <TrackRow key={t.id} t={t} on={false} playing={false} selecting selected={adding.has(t.id)} onSelect={() => toggleAdd(t.id)} onPlay={() => toggleAdd(t.id)} />)}
            {!pool.length && <div className="mp-empty"><Check size={22} /><b>همه‌ی آهنگ‌ها در این لیست هستند</b></div>}
            <button type="button" className="mp-add" onClick={() => openPicker(openPl.id)}><Plus size={17} /> آهنگ جدید از دستگاه</button>
          </div>
          <div className="mp-selbar">
            <b>{n(adding.size)} انتخاب</b>
            <button type="button" className="mp-btn sm primary" disabled={!adding.size} onClick={() => { const c = musicAddToPlaylist(openPl.id, [...adding]); toast(`${n(c)} آهنگ اضافه شد`); setAdding(null); }}><Plus size={14} /> افزودن</button>
            <button type="button" className="mp-btn sm" onClick={() => setAdding(null)}>لغو</button>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="mp-detail-head">
          <button type="button" className="mp-icon sm" onClick={() => { setOpenList(null); setRenaming(null); }} aria-label="بازگشت به لیست‌ها"><ChevronRight size={18} /></button>
          {renaming !== null && openPl ? (
            <form className="mp-inline-form" onSubmit={(e) => { e.preventDefault(); if (renaming.trim()) { musicRenamePlaylist(openPl.id, renaming); } setRenaming(null); }}>
              <input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={40} aria-label="نام لیست" />
              <button type="submit" className="mp-btn primary"><Check size={16} /></button>
            </form>
          ) : (
            <div className="mp-card-txt"><b>{name}</b><em>{n(tracks.length)} آهنگ{dur ? ` · ${fmtLong(dur)}` : ''}</em></div>
          )}
          {openPl && renaming === null && (
            <>
              <button type="button" className="mp-icon sm" onClick={() => setRenaming(openPl.name)} aria-label="تغییر نام لیست"><Pencil size={16} /></button>
              <button type="button" className="mp-icon sm danger" aria-label="حذف لیست" onClick={async () => { if (await confirmDialog(`لیست «${openPl.name}» حذف شود؟ آهنگ‌ها روی دستگاه می‌مانند.`)) { musicDeletePlaylist(openPl.id); setOpenList(null); toast('لیست حذف شد'); } }}><Trash2 size={16} /></button>
            </>
          )}
        </div>
        <div className="mp-actions">
          <button type="button" className="mp-btn primary" disabled={!tracks.length} onClick={() => musicPlayList(ids, ctx)}><Play size={15} /> پخش</button>
          <button type="button" className="mp-btn" disabled={!tracks.length} onClick={() => musicPlayList(ids, ctx, true)}><Shuffle size={15} /> تصادفی</button>
          {openPl && <button type="button" className="mp-btn" onClick={() => setAdding(new Set())}><Plus size={15} /> افزودن آهنگ</button>}
        </div>
        <div className="mp-list" onDragLeave={() => setDragOver(null)}>
          {!tracks.length && (
            <div className="mp-empty">
              {isFav ? <Heart size={26} /> : <ListMusic size={26} />}
              <b>{isFav ? 'هنوز آهنگی را دوست نداری' : 'این لیست خالی است'}</b>
              <span>{isFav ? 'روی قلب کنار هر آهنگ بزن تا اینجا جمع شوند.' : 'با «افزودن آهنگ» چند آهنگ داخلش بگذار.'}</span>
            </div>
          )}
          {tracks.map((t, i) => (
            <TrackRow
              key={t.id} t={t} on={t.id === m.currentId} playing={m.playing}
              onPlay={() => musicPlay(t.id, ids, ctx)}
              onFav={() => musicToggleFav(t.id)}
              onMenu={() => openMenu(t.id, openList, ids, ctx)}
              drag={openPl ? {
                over: dragOver === i && dragFrom !== null && dragFrom !== i,
                onStart: () => setDragFrom(i),
                onOver: () => setDragOver(i),
                onDrop: () => { if (dragFrom !== null && dragFrom !== i) musicMoveInPlaylist(openPl.id, dragFrom, i); setDragFrom(null); setDragOver(null); },
                onEnd: () => { setDragFrom(null); setDragOver(null); }
              } : undefined}
            />
          ))}
        </div>
      </>
    );
  };

  // ------------------------------------------------------------ focus sounds
  const renderFocus = () => {
    const shown = visibleAmbient(m);
    const hidden = AMBIENT_TRACKS.filter((t) => m.hiddenAmbient.includes(t.id));
    return (
      <>
        <div className="mp-list">
          {shown.map((tr) => {
            const on = tr.id === m.currentId;
            return (
              <div key={tr.id} className={'mp-row focus' + (on ? ' on' : '')}>
                <button type="button" className="mp-row-main" onClick={() => musicPlay(tr.id)}>
                  <span className="mp-row-ic">{on && m.playing ? <Equalizer on /> : ambientIcon(tr.id, 16)}</span>
                  <span className="mp-row-title">{tr.title}</span>
                  <span className="mp-row-dur">∞</span>
                </button>
                <button
                  type="button" className="mp-row-btn danger" aria-label={`حذف ${tr.title}`}
                  onClick={async () => { if (await confirmDialog(`«${tr.title}» از صداهای تمرکز حذف شود؟ هر وقت خواستی می‌توانی برش گردانی.`)) { musicRemoveAmbient(tr.id); toast('صدا حذف شد'); } }}
                ><Trash2 size={15} /></button>
              </div>
            );
          })}
          {!shown.length && (
            <div className="mp-empty">
              <CloudRain size={26} />
              <b>همه‌ی صداهای تمرکز حذف شده‌اند</b>
              <span>با دکمه‌ی زیر می‌توانی آن‌ها را برگردانی.</span>
            </div>
          )}
        </div>
        {!!hidden.length && (
          <div className="mp-removed">
            <div className="mp-removed-head">
              <span>حذف‌شده‌ها ({n(hidden.length)})</span>
              <button type="button" onClick={() => { musicRestoreAmbient(); toast('همه‌ی صداها برگشتند'); }}><RotateCcw size={13} /> بازگردانی همه</button>
            </div>
            {hidden.map((tr) => (
              <div key={tr.id} className="mp-row removed">
                <span className="mp-row-main static"><span className="mp-row-ic">{ambientIcon(tr.id, 16)}</span><span className="mp-row-title">{tr.title}</span></span>
                <button type="button" className="mp-row-btn" onClick={() => musicRestoreAmbient(tr.id)} aria-label={`بازگرداندن ${tr.title}`}><RotateCcw size={15} /></button>
              </div>
            ))}
          </div>
        )}
        <p className="mp-note">این صداها داخل خود برنامه ساخته می‌شوند؛ بدون اینترنت هم کار می‌کنند و برای تمرکز هنگام مطالعه مناسب‌اند. با «حذف» فقط از فهرست برداشته می‌شوند و حافظه‌شان آزاد می‌شود.</p>
      </>
    );
  };

  // ------------------------------------------------------------ queue
  const renderQueue = () => {
    const cur = m.currentId ? trackById(m, m.currentId) : undefined;
    const queued = m.upNext.map((id) => trackById(m, id)).filter((t): t is Track => !!t);
    const idx = m.order.indexOf(m.currentId || '');
    const after = (idx >= 0 ? m.order.slice(idx + 1) : m.order).map((id) => trackById(m, id)).filter((t): t is Track => !!t && !m.upNext.includes(t.id)).slice(0, 40);
    const ctxName = m.context === 'fav' ? 'علاقه‌مندی‌ها' : m.context.startsWith('pl:') ? (m.playlists.find((p) => 'pl:' + p.id === m.context)?.name || 'لیست') : 'کتابخانه';
    const ambientNow = !!m.currentId && m.currentId.startsWith('amb:');
    return (
      <div className="mp-list tall">
        {cur && (
          <>
            <div className="mp-sec">در حال پخش</div>
            <TrackRow t={cur} on playing={m.playing} onPlay={() => musicPlay(cur.id)} />
          </>
        )}
        {ambientNow && <p className="mp-note">صدای تمرکز بی‌پایان است؛ صف برای آهنگ‌هاست.</p>}
        {!!queued.length && (
          <>
            <div className="mp-sec">بعدی در صف <button type="button" onClick={() => musicClearQueue()}>پاک کردن صف</button></div>
            {queued.map((t, i) => (
              <div key={t.id} className="mp-row">
                <button type="button" className="mp-row-main" onClick={() => { musicUnqueue(t.id); musicPlay(t.id); }}>
                  <span className="mp-row-ic">{n(i + 1)}</span>
                  <span className="mp-row-title">{t.title}</span>
                  {t.duration ? <span className="mp-row-dur">{fmt(t.duration)}</span> : null}
                </button>
                <button type="button" className="mp-row-btn" disabled={i === 0} onClick={() => musicMoveInQueue(i, i - 1)} aria-label="بالاتر"><ArrowUp size={15} /></button>
                <button type="button" className="mp-row-btn" disabled={i === queued.length - 1} onClick={() => musicMoveInQueue(i, i + 1)} aria-label="پایین‌تر"><ArrowDown size={15} /></button>
                <button type="button" className="mp-row-btn danger" onClick={() => musicUnqueue(t.id)} aria-label="برداشتن از صف"><X size={15} /></button>
              </div>
            ))}
          </>
        )}
        {!ambientNow && !!after.length && (
          <>
            <div className="mp-sec">{m.shuffle ? `از «${ctxName}» (ترتیب تصادفی)` : `ادامه‌ی «${ctxName}»`}</div>
            {!m.shuffle && after.map((t) => (
              <TrackRow key={t.id} t={t} on={false} playing={false} onPlay={() => musicPlay(t.id)} onMenu={() => openMenu(t.id, null, m.order, m.context)} />
            ))}
            {m.shuffle && <p className="mp-note">پخش تصادفی روشن است؛ آهنگ بعدی از میان {n(after.length)} آهنگ باقی‌مانده‌ی این لیست انتخاب می‌شود.</p>}
          </>
        )}
        {!cur && !queued.length && (
          <div className="mp-empty">
            <ListPlus size={26} />
            <b>صف خالی است</b>
            <span>از منوی هر آهنگ «پخش بعدی» یا «افزودن به صف» را بزن تا اینجا ردیف شوند.</span>
          </div>
        )}
      </div>
    );
  };

  const tabs: Array<[Tab, string, React.ReactNode, number]> = [
    ['songs', 'آهنگ‌ها', <Music2 size={15} key="s" />, m.tracks.length],
    ['lists', 'لیست‌ها', <ListMusic size={15} key="l" />, m.playlists.length],
    ['focus', 'تمرکز', <CloudRain size={15} key="f" />, 0],
    ['queue', 'صف', <ListPlus size={15} key="q" />, m.upNext.length]
  ];

  return (
    <div className="mp-lib">
      <div className="mp-tabs four" role="tablist">
        {tabs.map(([key, label, icon, count]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
            {icon}<span>{label}</span>{key === 'queue' && count > 0 && <i className="mp-badge">{n(count)}</i>}
          </button>
        ))}
      </div>
      <div className="mp-pane" role="tabpanel">
        {tab === 'songs' && renderSongs()}
        {tab === 'lists' && renderLists()}
        {tab === 'focus' && renderFocus()}
        {tab === 'queue' && renderQueue()}
      </div>

      <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac" multiple hidden onChange={pickFiles} />

      {menu && (
        <TrackMenu
          id={menu.id} listId={menu.listId} toast={toast}
          onPlay={() => musicPlay(menu.id, menu.ids, menu.ctx)}
          onClose={() => setMenu(null)}
          onPickPlaylist={(ids) => setPicker(ids)}
        />
      )}
      {picker && <PlaylistPicker ids={picker} onClose={() => { setPicker(null); setSel(null); }} toast={toast} />}
    </div>
  );
};
