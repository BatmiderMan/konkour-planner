import { useSyncExternalStore } from 'react';
import { DeepPrefs } from './deepFocusRules';

export type { DeepPrefs };
export const BREAK_EVERY = [0, 25, 45, 60, 90];
export const BREAK_LEN = [5, 10, 15];
const KEY = 'planex_deep_focus_v1';
const DEFAULT: DeepPrefs = { guardExit: true, breakEvery: 0, breakLen: 5, eyeRest: false };
function load(): DeepPrefs {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (m) return {
      guardExit: m.guardExit !== false,
      breakEvery: BREAK_EVERY.includes(m.breakEvery) ? m.breakEvery : 0,
      breakLen: BREAK_LEN.includes(m.breakLen) ? m.breakLen : 5,
      eyeRest: !!m.eyeRest
    };
  } catch { /* ignore */ }
  return { ...DEFAULT };
}
let prefs = load();
const ls = new Set<() => void>();
export const getDeepPrefs = () => prefs;
export function setDeepPrefs(p: Partial<DeepPrefs>): void {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  ls.forEach((l) => l());
}
export const useDeepPrefs = (): DeepPrefs => useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l); }; }, getDeepPrefs, getDeepPrefs);
