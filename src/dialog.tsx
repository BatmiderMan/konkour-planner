import React, { useEffect, useState } from 'react';

type DialogKind = 'confirm' | 'alert';

interface DialogRequest {
  kind: DialogKind;
  message: string;
  resolve: (v: boolean) => void;
}

let pushRequest: ((req: DialogRequest) => void) | null = null;

/** Drop-in async replacement for window.confirm — resolves true/false. */
export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (pushRequest) {
      pushRequest({ kind: 'confirm', message, resolve });
    } else {
      // DialogHost not mounted yet for some reason — fall back safely
      resolve(window.confirm(message));
    }
  });
}

/** Drop-in async replacement for window.alert. */
export function alertDialog(message: string): Promise<void> {
  return new Promise((resolve) => {
    if (pushRequest) {
      pushRequest({ kind: 'alert', message, resolve: () => resolve() });
    } else {
      window.alert(message);
      resolve();
    }
  });
}

/** Mount once near the root of the app. Renders whatever confirm/alert is currently pending. */
export const DialogHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);

  useEffect(() => {
    pushRequest = (req) => setQueue((q) => [...q, req]);
    return () => {
      pushRequest = null;
    };
  }, []);

  const current = queue[0];
  if (!current) return null;

  const close = (result: boolean) => {
    current.resolve(result);
    setQueue((q) => q.slice(1));
  };

  return (
    <div className="dlg-overlay" role="dialog" aria-modal="true">
      <div className="dlg-box">
        <p className="dlg-msg">{current.message}</p>
        <div className="dlg-actions">
          {current.kind === 'confirm' && (
            <button type="button" className="dlg-cancel" onClick={() => close(false)}>
              انصراف
            </button>
          )}
          <button type="button" className="dlg-ok" onClick={() => close(true)}>
            {current.kind === 'confirm' ? 'تأیید' : 'باشه'}
          </button>
        </div>
      </div>
    </div>
  );
};
