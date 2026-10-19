import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/** Full-screen sheet on phones, centred panel on desktop. Closes with Escape; page behind does not scroll. */
export const Modal: React.FC<{ title: React.ReactNode; onClose: () => void; wide?: boolean; footer?: React.ReactNode; children: React.ReactNode }> = ({ title, onClose, wide, footer, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="ck-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'ck-modal' + (wide ? ' wide' : '')}>
        <header className="ck-modal-head">
          <h2>{title}</h2>
          <button type="button" className="ck-x" aria-label="بستن" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="ck-modal-body">{children}</div>
        {footer && <footer className="ck-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
};

export const Seg: React.FC<{ value: string; onChange: (v: string) => void; items: [string, React.ReactNode][]; label?: string }> = ({ value, onChange, items, label }) => (
  <div className="ck-seg" role="tablist" aria-label={label}>
    {items.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{t}</button>)}
  </div>
);

export const readAsDataURL = (f: File): Promise<string> => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
export const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('تصویر باز نشد')); im.src = src; });
export const fileToImage = async (f: File) => loadImage(await readAsDataURL(f));
