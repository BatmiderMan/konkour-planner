/** a tiny async «type a name» dialog (the app's dialog helper only has confirm / alert) */
import React from 'react';
import { createRoot } from 'react-dom/client';

export function promptName(label: string, def = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
    const end = (v: string | null) => { root.unmount(); host.remove(); resolve(v); };
    const F: React.FC = () => {
      const [v, setV] = React.useState(def);
      return (
        <div className="bk-lightbox" role="dialog" aria-modal="true" style={{ zIndex: 2000 }} onClick={() => end(null)}>
          <form className="bk-lb-card bk-form" style={{ maxWidth: 420, padding: 16 }} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); end(v.trim() || null); }}>
            <label className="bk-lab">{label}<input autoFocus className="bk-in" value={v} onChange={(e) => setV(e.target.value)} /></label>
            <div className="bk-acts"><button type="button" className="bk-btn" onClick={() => end(null)}>لغو</button><button type="submit" className="bk-btn primary">تأیید</button></div>
          </form>
        </div>
      );
    };
    root.render(<F />);
  });
}
