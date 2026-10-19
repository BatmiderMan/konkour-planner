// Tiny event bus so any part of the app (bottom bar, shortcuts, buttons) can ask the
// timer / music player to open without prop-drilling through App.
export const OPEN_TIMER_EVENT = 'planex:timer-open';
export const TOGGLE_TIMER_RUN_EVENT = 'planex:timer-toggle-run';
export const openLiveTimer = () => window.dispatchEvent(new Event(OPEN_TIMER_EVENT));
const HAPTIC_KEY = 'planex_haptics_v1';
let hapticsOn = (() => { try { return localStorage.getItem(HAPTIC_KEY) !== '0'; } catch { return true; } })();
export const getHaptics = () => hapticsOn;
export function setHaptics(on: boolean): void {
  hapticsOn = on;
  try { localStorage.setItem(HAPTIC_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  if (on) try { navigator.vibrate?.(12); } catch { /* ignore */ }
}
/** a short vibration on phones that support it (respects the user's switch) */
export const haptic = (ms: number | number[] = 15) => { if (!hapticsOn) return; try { navigator.vibrate?.(ms as any); } catch { /* not supported */ } };
export const hapticTap = () => haptic(10);
export const hapticSuccess = () => haptic([12, 40, 18]);
export const OPEN_PALETTE_EVENT = 'planex:palette-open';
export const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
