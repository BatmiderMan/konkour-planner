import React from 'react';
import { X } from 'lucide-react';
import { useSwipeDown } from '../../useSwipeDown';
import { useBackToClose } from '../../useBackToClose';
import './ui.css';

/**
 * The app's one bottom sheet: scrim, grab handle, swipe-down to close, Esc, and the phone Back button.
 * Content goes in children; `title` adds a header with a close button.
 */
export const Sheet: React.FC<{ onClose: () => void; title?: string; label?: string; z?: number; dark?: boolean; children: React.ReactNode }> = ({ onClose, title, label, z, dark, children }) => {
  const sw = useSwipeDown(onClose);
  useBackToClose(true, onClose);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="ui-scrim" style={z ? { zIndex: z } : undefined} onClick={onClose}>
      <div className={'ui-sheet' + (dark ? ' dark' : '')} role="dialog" aria-modal="true" aria-label={label || title} onClick={(e) => e.stopPropagation()} style={sw.style}>
        <div className="ui-grab" {...sw.bind}><i /></div>
        {title && <div className="ui-head"><b>{title}</b><button type="button" className="ui-x" onClick={onClose} aria-label="بستن"><X size={18} /></button></div>}
        {children}
      </div>
    </div>
  );
};
