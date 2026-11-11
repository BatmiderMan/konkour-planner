import { useEffect, useState } from 'react';

/** how the virtual answer sheet behaves - one place, shared by the sheet and the settings hub */
export interface VsPrefs {
  autoNext: boolean;   // after an answer / 0 the selection goes to the next question
  showTimes: boolean;  // show the time spent on every row
  slowWarn: boolean;   // warn when a question takes much longer than its share of the time
  slowFactor: number;  // «much longer» = this many times the target time per question
  haptic: boolean;     // a tiny vibration on every key press (phones)
  autoStart: boolean;  // the sheet's own clock starts when the test room opens (off: it starts with the first answer)
}
export const DEFAULT_VS: VsPrefs = { autoNext: true, showTimes: true, slowWarn: true, slowFactor: 2, haptic: true, autoStart: true };
const KEY = 'planex_vs_prefs';
const EVT = 'planex:vs-prefs';

export function loadVsPrefs(): VsPrefs {
  try { return { ...DEFAULT_VS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_VS }; }
}
export function saveVsPrefs(p: VsPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT));
}
/** live copy of the preferences (changes made in the settings hub show up in an open sheet) */
export function useVsPrefs(): [VsPrefs, (patch: Partial<VsPrefs>) => void] {
  const [p, setP] = useState(loadVsPrefs);
  useEffect(() => { const f = () => setP(loadVsPrefs()); window.addEventListener(EVT, f); return () => window.removeEventListener(EVT, f); }, []);
  return [p, (patch) => saveVsPrefs({ ...loadVsPrefs(), ...patch })];
}
