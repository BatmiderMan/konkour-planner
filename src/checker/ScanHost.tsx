import React, { useEffect, useState } from 'react';
import { ScanFlow } from './ScanFlow';
import { VirtualSheet } from './VirtualSheet';
import { ScanContext, VirtualContext, openScan, registerScanOpener, registerVirtualOpener } from './launch';
import { SavedSheet } from './model';
import { listSheets } from './store';
import './checker.css';

/** Mount once near the root: renders the scanner whenever somebody calls openScan(), and the virtual sheet for openVirtual(). */
export const ScanHost: React.FC = () => {
  const [ctx, setCtx] = useState<{ c: ScanContext; k: number } | null>(null);
  const [vs, setVs] = useState<{ c: VirtualContext; sheet?: SavedSheet; k: number } | null>(null);
  useEffect(() => { registerScanOpener((c) => setCtx({ c, k: Date.now() })); return () => registerScanOpener(null); }, []);
  useEffect(() => {
    registerVirtualOpener(async (c) => {
      window.dispatchEvent(new CustomEvent('planex:timer-collapse')); // the part timer is a separate thing: keep its big panel out of the way
      let sheet = c.sheet;
      // the same planner card already has a test in progress: continue it instead of starting a second one
      if (!sheet && c.link && c.link.plannerItemId) {
        const all = await listSheets();
        const mine = all.filter((s) => s.mode === 'live' && s.link && s.link.plannerItemId === c.link!.plannerItemId && s.link.dateKey === c.link!.dateKey);
        sheet = mine.filter((s) => s.state === 'open').sort((a, b) => b.updatedAt - a.updatedAt)[0]; // the test still in progress, else the latest finished one
        if (!sheet && c.link && c.openLast) sheet = mine.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      }
      setVs({ c, sheet, k: Date.now() });
    });
    return () => registerVirtualOpener(null);
  }, []);
  return (
    <>
      {ctx && <ScanFlow key={ctx.k} ctx={ctx.c} onClose={() => setCtx(null)} />}
      {vs && (
        <VirtualSheet
          key={vs.k}
          sheet={vs.sheet}
          ctx={vs.c}
          onClose={() => { const c = vs.c; setVs(null); c.onClose?.(); }}
          onCompare={(s) => { const c = vs.c; setVs(null); c.onClose?.(); openScan({ sheet: s, lesson: s.lesson || vs.c.lesson, source: s.source || vs.c.source, detail: s.detail || vs.c.detail, link: s.link }); }}
        />
      )}
    </>
  );
};
