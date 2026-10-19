import React from 'react';
import { RotateCcw } from 'lucide-react';
import { haptic } from './focusBus';

// "Delete now, undo within a few seconds" — replaces the 'are you sure?' dialog for things that can be put back.
interface UndoItem { id: number; message: string; onUndo: () => void | Promise<void>; ms: number }
let push: ((u: UndoItem) => void) | null = null;
let seq = 0;

/** Show «message» with a Restore button. `onUndo` must put the deleted thing back. */
export function showUndo(message: string, onUndo: () => void | Promise<void>, ms = 6500): void {
  haptic(12);
  push?.({ id: ++seq, message, onUndo, ms });
}

/** mount once near the root */
export const UndoHost: React.FC = () => {
  const [cur, setCur] = React.useState<UndoItem | null>(null);
  React.useEffect(() => { push = setCur; return () => { push = null; }; }, []);
  React.useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => setCur(null), cur.ms);
    return () => clearTimeout(t);
  }, [cur]);
  if (!cur) return null;
  return (
    <div className="undo" role="status" aria-live="polite" key={cur.id}>
      <span className="undo-msg">{cur.message}</span>
      <button type="button" className="undo-btn" onClick={async () => { const u = cur; setCur(null); haptic(18); await u.onUndo(); }}>
        <RotateCcw size={15} /> بازگردانی
      </button>
      <i className="undo-bar" style={{ animationDuration: cur.ms + 'ms' }} />
    </div>
  );
};
