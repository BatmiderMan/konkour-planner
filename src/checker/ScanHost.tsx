import React, { useEffect, useState } from 'react';
import { ScanFlow } from './ScanFlow';
import { ScanContext, registerScanOpener } from './launch';
import './checker.css';

/** Mount once near the root: renders the scanner whenever somebody calls openScan(). */
export const ScanHost: React.FC = () => {
  const [ctx, setCtx] = useState<{ c: ScanContext; k: number } | null>(null);
  useEffect(() => { registerScanOpener((c) => setCtx({ c, k: Date.now() })); return () => registerScanOpener(null); }, []);
  return ctx ? <ScanFlow key={ctx.k} ctx={ctx.c} onClose={() => setCtx(null)} /> : null;
};
