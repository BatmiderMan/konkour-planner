import { useSyncExternalStore } from 'react';
import { ACCENTS, THEMES, AccentId, ThemeId } from './components/timer/timerLook';

// Look of the music player (this device only): theme, accent, colours from the cover, blurred cover background, art shape.
export type ArtShape = 'square' | 'round' | 'vinyl';
export interface MusicLook {
  theme: ThemeId;
  accent: AccentId; // 'auto' = colours of the playing cover (when `adaptive`), otherwise the default violet / mint
  adaptive: boolean;
  coverBg: boolean;
  art: ArtShape;
}
export const DEFAULT_MUSIC_LOOK: MusicLook = { theme: 'aurora', accent: 'auto', adaptive: true, coverBg: true, art: 'square' };
export const ART_SHAPES: Array<{ id: ArtShape; label: string }> = [
  { id: 'square', label: 'مربع' }, { id: 'round', label: 'گرد' }, { id: 'vinyl', label: 'صفحه‌ی گرامافون' }
];

const KEY = 'planex_music_look_v1';
function sanitize(m: any): MusicLook {
  const d = DEFAULT_MUSIC_LOOK;
  return {
    theme: THEMES.some((t) => t.id === m?.theme) ? m.theme : d.theme,
    accent: ACCENTS.some((a) => a.id === m?.accent) ? m.accent : d.accent,
    adaptive: typeof m?.adaptive === 'boolean' ? m.adaptive : d.adaptive,
    coverBg: typeof m?.coverBg === 'boolean' ? m.coverBg : d.coverBg,
    art: ART_SHAPES.some((a) => a.id === m?.art) ? m.art : d.art
  };
}
let look: MusicLook = (() => { try { return sanitize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return { ...DEFAULT_MUSIC_LOOK }; } })();
const listeners = new Set<() => void>();
function commit(next: MusicLook) {
  look = next;
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
export const setMusicLook = (p: Partial<MusicLook>) => commit(sanitize({ ...look, ...p }));
export const resetMusicLook = () => commit({ ...DEFAULT_MUSIC_LOOK });
export function useMusicLook(): MusicLook {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => look, () => look);
}
/** colours the player should use right now: explicit accent > cover colours > default (null) */
export function pickAccent(l: MusicLook, tint: [string, string] | null): [string, string] | null {
  const a = ACCENTS.find((x) => x.id === l.accent);
  if (a && a.id !== 'auto') return [a.a, a.b];
  if (l.adaptive && tint) return tint;
  return null;
}
