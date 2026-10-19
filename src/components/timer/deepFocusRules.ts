// Pure rules for break / eye-rest reminders (no browser APIs, unit-tested).
export interface DeepPrefs { guardExit: boolean; breakEvery: number; breakLen: number; eyeRest: boolean }
export interface NudgeState { nextBreakAt: number; nextEyeAt: number }
export type Nudge = 'break' | 'eye' | null;
export const EYE_EVERY_MS = 20 * 60000;

export const initialNudgeState = (elapsedMs: number, p: DeepPrefs): NudgeState => ({
  nextBreakAt: p.breakEvery > 0 ? (Math.floor(elapsedMs / (p.breakEvery * 60000)) + 1) * p.breakEvery * 60000 : Infinity,
  nextEyeAt: p.eyeRest ? (Math.floor(elapsedMs / EYE_EVERY_MS) + 1) * EYE_EVERY_MS : Infinity
});

/** what (if anything) to remind about right now; a break reminder wins over an eye-rest one */
export function nextNudge(elapsedMs: number, p: DeepPrefs, s: NudgeState): { nudge: Nudge; state: NudgeState } {
  const st = { ...s };
  // settings changed while running: re-arm timers that were off
  if (p.breakEvery > 0 && st.nextBreakAt === Infinity) st.nextBreakAt = initialNudgeState(elapsedMs, p).nextBreakAt;
  if (p.breakEvery <= 0) st.nextBreakAt = Infinity;
  if (p.eyeRest && st.nextEyeAt === Infinity) st.nextEyeAt = initialNudgeState(elapsedMs, p).nextEyeAt;
  if (!p.eyeRest) st.nextEyeAt = Infinity;
  if (elapsedMs >= st.nextBreakAt) {
    const step = p.breakEvery * 60000;
    st.nextBreakAt = (Math.floor(elapsedMs / step) + 1) * step;
    st.nextEyeAt = Math.max(st.nextEyeAt, elapsedMs + 60000); // do not stack an eye reminder right after a break reminder
    return { nudge: 'break', state: st };
  }
  if (elapsedMs >= st.nextEyeAt) {
    st.nextEyeAt = (Math.floor(elapsedMs / EYE_EVERY_MS) + 1) * EYE_EVERY_MS;
    return { nudge: 'eye', state: st };
  }
  return { nudge: null, state: st };
}
