import React from 'react';
import { ImagePlus, RotateCcw, ScanSearch, Trash2, X } from 'lucide-react';
import { ACCENTS, THEMES } from '../timer/timerLook';
import { ART_SHAPES, resetMusicLook, setMusicLook, useMusicLook } from '../../musicLook';
import { musicRemoveCover, musicScanCovers, musicSetCover, trackById, useMusic } from '../../musicStore';
import { toPersianDigits } from '../../utils';

const Switch: React.FC<{ label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, hint, on, onChange }) => (
  <button type="button" role="switch" aria-checked={on} className="mpl-row" onClick={() => onChange(!on)}>
    <span><b>{label}</b>{hint && <em>{hint}</em>}</span><i className={'mp-sw' + (on ? ' on' : '')}><u /></i>
  </button>
);

/** appearance of the music player: themes, accent colours, cover options */
export const MusicLookPanel: React.FC<{ onClose: () => void; toast: (m: string) => void }> = ({ onClose, toast }) => {
  const look = useMusicLook();
  const m = useMusic();
  const t = m.currentId ? trackById(m, m.currentId) : undefined;
  const file = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const withCover = m.tracks.filter((x) => x.cover).length;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !t) return;
    toast((await musicSetCover(t.id, f)) ? 'کاور تنظیم شد' : 'این تصویر قابل خواندن نبود');
  };
  const rescan = async () => {
    setBusy(true);
    const n = await musicScanCovers(true);
    setBusy(false);
    toast(n ? `کاور ${toPersianDigits(n)} آهنگ پیدا شد` : 'کاور تازه‌ای داخل فایل‌ها پیدا نشد');
  };

  return (
    <div className="mp-modal" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="mp-modal-card mpl" role="dialog" aria-modal="true" aria-label="ظاهر پخش‌کننده" onClick={(e) => e.stopPropagation()}>
        <div className="mp-modal-head">
          <b>ظاهر پخش‌کننده</b>
          <span>
            <button type="button" className="mp-icon sm" onClick={resetMusicLook} aria-label="بازگشت به پیش‌فرض" title="پیش‌فرض"><RotateCcw size={16} /></button>
            <button type="button" className="mp-icon sm" onClick={onClose} aria-label="بستن"><X size={17} /></button>
          </span>
        </div>

        <h4 className="mpl-h">پس‌زمینه</h4>
        <div className="mpl-swatches">
          {THEMES.map((th) => (
            <button key={th.id} type="button" className={look.theme === th.id ? 'on' : ''} aria-pressed={look.theme === th.id} onClick={() => setMusicLook({ theme: th.id })}>
              <i style={{ background: th.swatch }} /><span>{th.label}</span>
            </button>
          ))}
        </div>

        <h4 className="mpl-h">رنگ تاکیدی</h4>
        <div className="mpl-accents" role="group" aria-label="رنگ تاکیدی">
          {ACCENTS.map((a) => (
            <button
              key={a.id} type="button" className={look.accent === a.id ? 'on' : ''} aria-pressed={look.accent === a.id} title={a.label} aria-label={a.label}
              onClick={() => setMusicLook({ accent: a.id })}
              style={a.id === 'auto' ? undefined : { background: `linear-gradient(135deg, ${a.a}, ${a.b})` }}
            >{a.id === 'auto' ? 'از کاور' : ''}</button>
          ))}
        </div>

        <h4 className="mpl-h">کاور</h4>
        <Switch label="رنگ‌ها از روی کاور آهنگ" hint="با «از کاور» بالا، رنگ پخش‌کننده با هر آهنگ عوض می‌شود" on={look.adaptive} onChange={(v) => setMusicLook({ adaptive: v })} />
        <Switch label="پس‌زمینه‌ی تار از کاور" on={look.coverBg} onChange={(v) => setMusicLook({ coverBg: v })} />
        <div className="mpl-line"><span>شکل کاور</span>
          <div className="mpl-seg" role="radiogroup" aria-label="شکل کاور">
            {ART_SHAPES.map((a) => <button key={a.id} type="button" role="radio" aria-checked={look.art === a.id} className={look.art === a.id ? 'on' : ''} onClick={() => setMusicLook({ art: a.id })}>{a.label}</button>)}
          </div>
        </div>

        <div className="mpl-actions">
          {t && t.kind === 'file' && (
            <>
              <button type="button" className="mp-btn" onClick={() => file.current?.click()}><ImagePlus size={15} /> کاور برای «{t.title.length > 14 ? t.title.slice(0, 14) + '…' : t.title}»</button>
              {t.cover && <button type="button" className="mp-btn danger" onClick={async () => { await musicRemoveCover(t.id); toast('کاور برداشته شد'); }}><Trash2 size={15} /> حذف کاور</button>}
            </>
          )}
          <button type="button" className="mp-btn" disabled={busy || !m.tracks.length} onClick={rescan}><ScanSearch size={15} /> {busy ? 'در حال جست‌وجو…' : 'جست‌وجوی دوباره‌ی کاورها'}</button>
        </div>
        <p className="mpl-note">کاور از داخل خود فایل‌ها خوانده می‌شود (mp3، m4a، flac) و فقط روی همین دستگاه می‌ماند. {m.tracks.length ? `${toPersianDigits(withCover)} از ${toPersianDigits(m.tracks.length)} آهنگ کاور دارند.` : ''}</p>
        <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
      </div>
    </div>
  );
};
