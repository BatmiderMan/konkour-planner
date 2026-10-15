import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Music player engine. One <audio> element lives for the whole app, so the music
// keeps playing while you move between Today / Planner / Exams / Report and while
// the study timer is open.
//
//  • Your own songs: picked from the device, stored in IndexedDB (they survive a
//    reload and never leave the device — nothing is uploaded anywhere).
//  • Playlists, favorites, a play-next queue, sort, rename, bulk delete.
//  • Focus sounds (rain / brown noise / ocean / …): generated in the browser as a
//    seamless loop, so they work offline and need no files. Any of them can be
//    removed from the list (and restored later).
//  • Sleep timer, playback speed, ±10 s skip, lock-screen / media-key controls.
// ---------------------------------------------------------------------------

export type Repeat = 'off' | 'all' | 'one';
export type AmbientKind = 'rain' | 'brown' | 'ocean' | 'white' | 'pink';
export type SortKey = 'added' | 'name' | 'duration' | 'fav';

export interface Track {
  id: string;
  title: string;
  kind: 'file' | 'ambient';
  duration?: number; // seconds (files only, filled in after the first read)
  size?: number; // bytes (files only)
  fav?: boolean;
  addedAt?: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export const AMBIENT_TRACKS: Track[] = [
  { id: 'amb:rain', title: 'باران', kind: 'ambient' },
  { id: 'amb:brown', title: 'نویز قهوه‌ای (تمرکز عمیق)', kind: 'ambient' },
  { id: 'amb:ocean', title: 'موج دریا', kind: 'ambient' },
  { id: 'amb:white', title: 'نویز سفید', kind: 'ambient' },
  { id: 'amb:pink', title: 'نویز صورتی (آرام)', kind: 'ambient' }
];

export const RATES = [0.75, 1, 1.25, 1.5, 2] as const;
/** 'all' = whole library, 'fav' = favorites, 'pl:<id>' = a playlist, 'focus' = focus sounds */
export type PlayContext = string;

export interface SleepTimer { mode: 'time' | 'track'; at?: number }

export interface MusicState {
  tracks: Track[]; // the user's library (files)
  playlists: Playlist[];
  hiddenAmbient: string[]; // focus sounds the user removed
  order: string[]; // the list that next / previous walk through
  upNext: string[]; // "play next" queue, consumed before `order`
  context: PlayContext;
  currentId: string | null;
  playing: boolean;
  active: boolean; // something was started this session -> the mini bar is shown
  position: number;
  duration: number;
  volume: number; // 0..1
  shuffle: boolean;
  repeat: Repeat;
  rate: number;
  sort: SortKey;
  sleep: SleepTimer | null;
  loading: boolean;
  error: string;
  ready: boolean; // library loaded from storage
}

const META_KEY = 'planex_music_v1'; // same key as before: old libraries keep working
const DB_NAME = 'planex-music';
const STORE = 'files';

let state: MusicState = {
  tracks: [], playlists: [], hiddenAmbient: [], order: [], upNext: [], context: 'all',
  currentId: null, playing: false, active: false, position: 0, duration: 0,
  volume: 0.7, shuffle: false, repeat: 'all', rate: 1, sort: 'added', sleep: null,
  loading: false, error: '', ready: false
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function set(p: Partial<MusicState>) { state = { ...state, ...p }; emit(); }

// ---------------------------------------------------------------- storage
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
  db.close();
}
async function dbGet(id: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).get(id);
    r.onsuccess = () => res((r.result as Blob) || null);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return blob;
}
async function dbDeleteMany(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  await new Promise<void>((res) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    ids.forEach((id) => os.delete(id));
    tx.oncomplete = () => res();
    tx.onerror = () => res();
    tx.onabort = () => res();
  });
  db.close();
}

function saveMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({
      tracks: state.tracks, playlists: state.playlists, hiddenAmbient: state.hiddenAmbient,
      currentId: state.currentId, context: state.context, volume: state.volume,
      shuffle: state.shuffle, repeat: state.repeat, rate: state.rate, sort: state.sort
    }));
  } catch { /* storage full / blocked: the player still works for this session */ }
}
const SORTS: SortKey[] = ['added', 'name', 'duration', 'fav'];
function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return;
    const m = JSON.parse(raw);
    const tracks: Track[] = Array.isArray(m.tracks)
      ? m.tracks.filter((t: any) => t && typeof t.id === 'string' && typeof t.title === 'string').map((t: any) => ({
        id: t.id, title: t.title, kind: 'file' as const,
        duration: typeof t.duration === 'number' ? t.duration : undefined,
        size: typeof t.size === 'number' ? t.size : undefined,
        fav: !!t.fav,
        addedAt: typeof t.addedAt === 'number' ? t.addedAt : undefined
      }))
      : [];
    const ids = new Set(tracks.map((t) => t.id));
    const playlists: Playlist[] = Array.isArray(m.playlists)
      ? m.playlists.filter((p: any) => p && typeof p.id === 'string' && typeof p.name === 'string').map((p: any) => ({
        id: p.id, name: p.name, createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0,
        trackIds: Array.isArray(p.trackIds) ? p.trackIds.filter((x: any) => ids.has(x)) : []
      }))
      : [];
    const ambIds = new Set(AMBIENT_TRACKS.map((t) => t.id));
    const hiddenAmbient: string[] = Array.isArray(m.hiddenAmbient) ? m.hiddenAmbient.filter((x: any) => ambIds.has(x)) : [];
    const all = [...tracks, ...AMBIENT_TRACKS];
    const ctx = typeof m.context === 'string' ? m.context : 'all';
    const ctxOk = ctx === 'all' || ctx === 'fav' || ctx === 'focus' || playlists.some((p) => 'pl:' + p.id === ctx);
    const rate = typeof m.rate === 'number' && RATES.includes(m.rate as any) ? m.rate : 1;
    state = {
      ...state,
      tracks, playlists, hiddenAmbient,
      context: ctxOk ? ctx : 'all',
      currentId: all.some((t) => t.id === m.currentId) ? m.currentId : null,
      volume: typeof m.volume === 'number' ? Math.min(1, Math.max(0, m.volume)) : 0.7,
      shuffle: !!m.shuffle,
      repeat: m.repeat === 'off' || m.repeat === 'one' ? m.repeat : 'all',
      rate,
      sort: SORTS.includes(m.sort) ? m.sort : 'added'
    };
    state.order = contextIds(state.context, state);
  } catch { /* ignore a broken record */ }
}

// ---------------------------------------------------------------- focus sounds (generated loops)
const SR = 22050;
const LOOP_SEC = 20;
const FADE_SEC = 1.5;
const ambientUrls: Partial<Record<AmbientKind, string>> = {};

function generateAmbient(kind: AmbientKind): Float32Array {
  const L = LOOP_SEC * SR;
  const N = Math.floor(FADE_SEC * SR);
  const raw = new Float32Array(L + N);
  let brown = 0, lp = 0, drop = 0, lp2 = 0;
  // pink noise (Paul Kellet's filter)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') {
      brown = (brown + 0.02 * w) * 0.998;
      raw[i] = brown * 3.2;
    } else if (kind === 'white') {
      raw[i] = w * 0.6;
    } else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else if (kind === 'rain') {
      lp += 0.32 * (w - lp);
      let v = (w - lp) * 0.55; // high-passed hiss
      if (Math.random() < 0.0016) drop = 0.5 + Math.random() * 0.5;
      drop *= 0.965;
      lp2 += 0.5 * ((Math.random() * 2 - 1) - lp2);
      v += lp2 * drop * 0.9;
      raw[i] = v;
    } else {
      brown = (brown + 0.02 * w) * 0.998;
      const t = i / SR;
      // swell period divides the loop length, so the loop is seamless
      const swell = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 10 - 1.2);
      lp += 0.08 * (w - lp);
      raw[i] = brown * 3.2 * (0.25 + 0.75 * swell) + lp * 0.35 * swell * swell;
    }
  }
  const out = new Float32Array(L);
  for (let i = 0; i < L; i++) out[i] = raw[i];
  // equal-power crossfade of the tail into the head -> no click when the loop restarts
  for (let i = 0; i < N; i++) {
    const a = (i / N) * (Math.PI / 2);
    out[i] = raw[i] * Math.sin(a) + raw[L + i] * Math.cos(a);
  }
  let peak = 0;
  for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < L; i++) out[i] *= g;
  return out;
}

function toWav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}

function ambientUrl(kind: AmbientKind): string {
  const hit = ambientUrls[kind];
  if (hit) return hit;
  const url = URL.createObjectURL(toWav(generateAmbient(kind)));
  ambientUrls[kind] = url;
  return url;
}

// ---------------------------------------------------------------- engine
let audio: HTMLAudioElement | null = null;
let currentUrl: string | null = null; // object URL of a user file (revoked when replaced)
let loadToken = 0;
let history: string[] = []; // played tracks, for "previous" while shuffling
let anchor: string | null = null; // last track that was in the play order (so a queued song doesn't lose your place)
let sleepTimeout: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

const isAmbient = (id: string | null) => !!id && id.startsWith('amb:');
const findTrack = (id: string | null): Track | undefined => (id ? [...state.tracks, ...AMBIENT_TRACKS].find((t) => t.id === id) : undefined);

/** ids that belong to a play context, in library order */
function contextIds(ctx: PlayContext, s: Pick<MusicState, 'tracks' | 'playlists' | 'hiddenAmbient'>): string[] {
  if (ctx === 'fav') return s.tracks.filter((t) => t.fav).map((t) => t.id);
  if (ctx === 'focus') return AMBIENT_TRACKS.filter((t) => !s.hiddenAmbient.includes(t.id)).map((t) => t.id);
  if (ctx.startsWith('pl:')) {
    const p = s.playlists.find((x) => 'pl:' + x.id === ctx);
    return p ? p.trackIds.filter((id) => s.tracks.some((t) => t.id === id)) : [];
  }
  return s.tracks.map((t) => t.id);
}

export function sortTracks(list: Track[], key: SortKey): Track[] {
  const a = [...list];
  if (key === 'name') a.sort((x, y) => x.title.localeCompare(y.title, 'fa'));
  else if (key === 'duration') a.sort((x, y) => (y.duration || 0) - (x.duration || 0));
  else if (key === 'fav') a.sort((x, y) => Number(!!y.fav) - Number(!!x.fav));
  else a.sort((x, y) => (y.addedAt || 0) - (x.addedAt || 0));
  return a;
}

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = 'auto';
  a.volume = state.volume;
  a.addEventListener('timeupdate', () => { if (!isAmbient(state.currentId)) set({ position: a.currentTime }); });
  a.addEventListener('durationchange', () => { if (!isAmbient(state.currentId) && isFinite(a.duration)) set({ duration: a.duration }); });
  a.addEventListener('play', () => { set({ playing: true, active: true }); syncSession(); });
  a.addEventListener('pause', () => { set({ playing: false }); syncSession(); });
  a.addEventListener('ended', () => {
    if (isAmbient(state.currentId)) return;
    if (state.sleep?.mode === 'track') { clearSleep(); set({ position: 0 }); return; }
    advance(true);
  });
  a.addEventListener('error', () => { if (state.currentId && a.getAttribute('src')) set({ error: 'پخش این فایل ممکن نشد', loading: false, playing: false }); });
  audio = a;
  setupMediaSession();
  return a;
}

/** the id that should play after / before the current one; consumes the play-next queue */
function pickNext(dir: 1 | -1, auto: boolean, consume: boolean): string | null {
  const cur = state.currentId;
  if (auto && state.repeat === 'one' && cur && !isAmbient(cur)) return cur;
  if (dir === 1 && state.upNext.length) {
    const [id, ...rest] = state.upNext;
    if (consume) set({ upNext: rest });
    return id;
  }
  const list = state.order.length ? state.order : state.tracks.map((t) => t.id);
  if (!list.length) return null;
  const base = cur && list.includes(cur) ? cur : anchor;
  const idx = list.indexOf(base || '');
  if (dir === -1 && history.length && (state.shuffle || idx < 0)) {
    const h = history[history.length - 1];
    if (consume) history = history.slice(0, -1);
    return h;
  }
  if (state.shuffle && list.length > 1) {
    // avoid repeating a track until the whole list has been heard
    const recent = new Set(history.slice(-(Math.min(list.length - 1, 12))));
    if (cur) recent.add(cur);
    const pool = list.filter((id) => !recent.has(id));
    const src = pool.length ? pool : list.filter((id) => id !== cur);
    return src[Math.floor(Math.random() * src.length)];
  }
  if (idx < 0) return list[0];
  const n = idx + dir;
  if (n >= list.length || n < 0) {
    if (auto && state.repeat === 'off' && dir === 1) return null;
    return list[(n + list.length) % list.length];
  }
  return list[n];
}

function advance(auto: boolean) {
  const id = pickNext(1, auto, true);
  if (id) void playTrack(id, true);
  else { const a = getAudio(); a.pause(); a.currentTime = 0; set({ position: 0 }); }
}

async function playTrack(id: string, pushHistory = false): Promise<void> {
  const t = findTrack(id);
  if (!t) return;
  const a = getAudio();
  const token = ++loadToken;
  if (state.order.includes(id)) anchor = id;
  if (pushHistory && state.currentId && state.currentId !== id && !isAmbient(state.currentId)) {
    history = [...history.slice(-60), state.currentId];
  }
  set({ currentId: id, loading: true, error: '', position: 0, duration: t.duration || 0, active: true });
  try {
    let src: string;
    if (t.kind === 'ambient') {
      src = ambientUrl(t.id.slice(4) as AmbientKind);
      a.loop = true;
    } else {
      const blob = await dbGet(id);
      if (token !== loadToken) return;
      if (!blob) { set({ loading: false, error: 'فایل این آهنگ پیدا نشد؛ دوباره اضافه‌اش کن' }); return; }
      src = URL.createObjectURL(blob);
      a.loop = false;
    }
    const old = currentUrl;
    currentUrl = t.kind === 'file' ? src : null;
    a.src = src;
    if (old) URL.revokeObjectURL(old);
    a.volume = state.volume;
    a.playbackRate = t.kind === 'ambient' ? 1 : state.rate;
    await a.play();
    if (token === loadToken) set({ loading: false });
    saveMeta();
    syncSession();
  } catch (e: any) {
    if (token !== loadToken) return;
    set({ loading: false, playing: false, error: e && e.name === 'NotAllowedError' ? 'مرورگر پخش خودکار را نگذاشت؛ دکمه‌ی پخش را بزن' : 'پخش ممکن نشد' });
  }
}

// ---------------------------------------------------------------- lock-screen / media keys
function syncSession() {
  const ms = (navigator as any).mediaSession;
  if (!ms) return;
  const t = findTrack(state.currentId);
  try {
    if (t && typeof (window as any).MediaMetadata === 'function') {
      ms.metadata = new (window as any).MediaMetadata({ title: t.title, artist: t.kind === 'ambient' ? 'صدای تمرکز' : 'Planex', album: 'Planex' });
    }
    ms.playbackState = state.playing ? 'playing' : 'paused';
  } catch { /* ignore */ }
}
function setupMediaSession() {
  const ms = (navigator as any).mediaSession;
  if (!ms) return;
  const h = (name: string, fn: (d?: any) => void) => { try { ms.setActionHandler(name, fn); } catch { /* unsupported action */ } };
  h('play', () => musicToggle());
  h('pause', () => musicToggle());
  h('previoustrack', () => musicPrev());
  h('nexttrack', () => musicNext());
  h('seekbackward', () => musicSkip(-10));
  h('seekforward', () => musicSkip(10));
  h('seekto', (d) => { if (d && typeof d.seekTime === 'number') musicSeek(d.seekTime); });
}

// ---------------------------------------------------------------- sleep timer
function clearSleep() {
  if (sleepTimeout) { clearTimeout(sleepTimeout); sleepTimeout = null; }
  if (state.sleep) set({ sleep: null });
}
function fadeOutAndPause() {
  const a = audio;
  if (!a || a.paused) { clearSleep(); return; }
  const start = a.volume;
  let step = 0;
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = setInterval(() => {
    step++;
    a.volume = Math.max(0, start * (1 - step / 20));
    if (step >= 20) {
      if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
      a.pause();
      a.volume = state.volume; // restore for the next play
    }
  }, 150);
  clearSleep();
}
/** minutes > 0 -> stop after that long; 'track' -> stop when the current song ends; null -> cancel */
export function musicSetSleep(v: number | 'track' | null): void {
  if (sleepTimeout) { clearTimeout(sleepTimeout); sleepTimeout = null; }
  if (v === null) { set({ sleep: null }); return; }
  if (v === 'track') { set({ sleep: { mode: 'track' } }); return; }
  const at = Date.now() + v * 60000;
  set({ sleep: { mode: 'time', at } });
  sleepTimeout = setTimeout(fadeOutAndPause, v * 60000);
}

// ---------------------------------------------------------------- public API
let initStarted = false;
export function initMusic(): void {
  if (initStarted) return;
  initStarted = true;
  loadMeta();
  set({ ready: true });
}

export function musicToggle(): void {
  const a = getAudio();
  if (state.playing) { a.pause(); return; }
  if (!state.currentId || !a.getAttribute('src')) {
    const first = state.currentId || state.order[0] || state.tracks[0]?.id || visibleAmbient()[0]?.id;
    if (first) void playTrack(first);
  } else {
    a.volume = state.volume;
    a.play().catch(() => set({ error: 'پخش ممکن نشد' }));
  }
}

/**
 * Plays a track. `ids` + `context` say which list it was started from, so next / previous
 * stay inside that playlist / sorted view. Without them the current list is kept.
 */
export function musicPlay(id: string, ids?: string[], context?: PlayContext): void {
  if (ids) set({ order: ids, context: context || state.context });
  else if (!isAmbient(id) && !state.order.includes(id)) set({ order: contextIds('all', state), context: 'all' });
  if (id === state.currentId && audio && audio.getAttribute('src')) { musicToggle(); return; }
  void playTrack(id, true);
}
/** play a whole list from the top (or from a random song when shuffle is true) */
export function musicPlayList(ids: string[], context: PlayContext, shuffle = false): void {
  if (!ids.length) return;
  const first = shuffle ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
  set({ order: ids, context, shuffle: shuffle ? true : state.shuffle });
  saveMeta();
  void playTrack(first, true);
}
export function musicNext(): void {
  if (isAmbient(state.currentId)) return;
  const id = pickNext(1, false, true);
  if (id) void playTrack(id, true);
}
export function musicPrev(): void {
  if (isAmbient(state.currentId)) return;
  const a = getAudio();
  if (a.currentTime > 4) { a.currentTime = 0; return; }
  const id = pickNext(-1, false, true);
  if (id) void playTrack(id, false);
}
export function musicSeek(sec: number): void {
  if (isAmbient(state.currentId)) return;
  const a = getAudio();
  if (isFinite(a.duration)) { a.currentTime = Math.max(0, Math.min(a.duration, sec)); set({ position: a.currentTime }); }
}
export function musicSkip(delta: number): void {
  if (isAmbient(state.currentId)) return;
  musicSeek(getAudio().currentTime + delta);
}
export function musicSetVolume(v: number): void {
  const vol = Math.min(1, Math.max(0, v));
  if (audio) audio.volume = vol;
  set({ volume: vol });
  saveMeta();
}
export function musicSetRate(r: number): void {
  set({ rate: r });
  if (audio && !isAmbient(state.currentId)) audio.playbackRate = r;
  saveMeta();
}
export function musicToggleShuffle(): void { set({ shuffle: !state.shuffle }); saveMeta(); }
export function musicCycleRepeat(): void {
  set({ repeat: state.repeat === 'all' ? 'one' : state.repeat === 'one' ? 'off' : 'all' });
  saveMeta();
}
export function musicSetSort(sort: SortKey): void { set({ sort }); saveMeta(); }
/** hides the mini bar and stops the sound */
export function musicStop(): void {
  if (audio) { audio.pause(); }
  clearSleep();
  set({ active: false, playing: false });
}

// ---- queue ("play next")
export function musicPlayNext(ids: string[]): void {
  const add = ids.filter((id) => state.tracks.some((t) => t.id === id));
  if (add.length) set({ upNext: [...add, ...state.upNext.filter((x) => !add.includes(x))] });
}
export function musicAddToQueue(ids: string[]): void {
  const add = ids.filter((id) => state.tracks.some((t) => t.id === id) && !state.upNext.includes(id));
  if (add.length) set({ upNext: [...state.upNext, ...add] });
}
export function musicUnqueue(id: string): void { set({ upNext: state.upNext.filter((x) => x !== id) }); }
export function musicClearQueue(): void { set({ upNext: [] }); }
export function musicMoveInQueue(from: number, to: number): void {
  const q = [...state.upNext];
  if (from < 0 || from >= q.length || to < 0 || to >= q.length) return;
  const [x] = q.splice(from, 1);
  q.splice(to, 0, x);
  set({ upNext: q });
}

// ---- tracks
export function musicToggleFav(id: string): void {
  set({ tracks: state.tracks.map((t) => (t.id === id ? { ...t, fav: !t.fav } : t)) });
  if (state.context === 'fav') set({ order: contextIds('fav', state) });
  saveMeta();
}
export function musicRenameTrack(id: string, title: string): void {
  const name = title.trim();
  if (!name) return;
  set({ tracks: state.tracks.map((t) => (t.id === id ? { ...t, title: name } : t)) });
  saveMeta();
  syncSession();
}

function readDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = (d: number) => { URL.revokeObjectURL(url); resolve(d); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => done(0);
    a.src = url;
    setTimeout(() => done(0), 4000);
  });
}

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm)$/i;

/** adds picked files to the library (and to a playlist when given); returns the new track ids */
export async function musicAddFiles(files: FileList | File[], intoPlaylist?: string): Promise<string[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name));
  if (!list.length) { set({ error: 'فایل صوتی پیدا نشد (mp3، m4a، wav، ogg…)' }); return []; }
  set({ error: '' });
  const added: Track[] = [];
  let n = 0;
  for (const f of list) {
    const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    try {
      await dbPut(id, f);
      const duration = await readDuration(f);
      added.push({
        id, kind: 'file', size: f.size, addedAt: Date.now() + n++,
        title: f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'بدون نام',
        duration: duration || undefined
      });
    } catch {
      set({ error: 'ذخیره‌ی فایل در مرورگر ممکن نشد (جای خالی کافی نیست؟)' });
    }
  }
  if (added.length) {
    const ids = added.map((t) => t.id);
    set({
      tracks: [...state.tracks, ...added],
      playlists: intoPlaylist
        ? state.playlists.map((p) => (p.id === intoPlaylist ? { ...p, trackIds: [...p.trackIds, ...ids] } : p))
        : state.playlists
    });
    // keep the current play order (it may be sorted) and just append what was added
    if (state.context === 'all') set({ order: [...state.order, ...ids] });
    else if (intoPlaylist && state.context === 'pl:' + intoPlaylist) set({ order: contextIds(state.context, state) });
    saveMeta();
  }
  return added.map((t) => t.id);
}

/** deletes songs from the device (storage + every playlist + the queue) */
export async function musicRemoveMany(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const gone = new Set(ids);
  const wasCurrent = !!state.currentId && gone.has(state.currentId);
  if (wasCurrent && audio) {
    loadToken++;
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
  }
  history = history.filter((h) => !gone.has(h));
  set({
    tracks: state.tracks.filter((t) => !gone.has(t.id)),
    playlists: state.playlists.map((p) => ({ ...p, trackIds: p.trackIds.filter((x) => !gone.has(x)) })),
    upNext: state.upNext.filter((x) => !gone.has(x)),
    order: state.order.filter((x) => !gone.has(x)),
    ...(wasCurrent ? { currentId: null, playing: false, position: 0, duration: 0, loading: false } : {})
  });
  saveMeta();
  await dbDeleteMany(ids);
}
export const musicRemove = (id: string) => musicRemoveMany([id]);
export async function musicClearLibrary(): Promise<void> { await musicRemoveMany(state.tracks.map((t) => t.id)); }

// ---- focus sounds (generated): remove from the list / bring back
export function musicRemoveAmbient(id: string): void {
  if (!AMBIENT_TRACKS.some((t) => t.id === id) || state.hiddenAmbient.includes(id)) return;
  if (state.currentId === id && audio) {
    loadToken++;
    audio.pause(); audio.removeAttribute('src'); audio.load();
    set({ currentId: null, playing: false, position: 0, duration: 0, loading: false });
  }
  // free the generated audio too — it is rebuilt on demand if the sound is restored
  const kind = id.slice(4) as AmbientKind;
  const url = ambientUrls[kind];
  if (url) { URL.revokeObjectURL(url); delete ambientUrls[kind]; }
  set({ hiddenAmbient: [...state.hiddenAmbient, id] });
  saveMeta();
}
export function musicRestoreAmbient(id?: string): void {
  set({ hiddenAmbient: id ? state.hiddenAmbient.filter((x) => x !== id) : [] });
  saveMeta();
}
export const visibleAmbient = (s: Pick<MusicState, 'hiddenAmbient'> = state): Track[] => AMBIENT_TRACKS.filter((t) => !s.hiddenAmbient.includes(t.id));

// ---- playlists
export function musicCreatePlaylist(name: string, trackIds: string[] = []): string {
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const valid = trackIds.filter((x) => state.tracks.some((t) => t.id === x));
  set({ playlists: [...state.playlists, { id, name: name.trim() || 'لیست جدید', trackIds: valid, createdAt: Date.now() }] });
  saveMeta();
  return id;
}
export function musicRenamePlaylist(id: string, name: string): void {
  const n = name.trim();
  if (!n) return;
  set({ playlists: state.playlists.map((p) => (p.id === id ? { ...p, name: n } : p)) });
  saveMeta();
}
export function musicDeletePlaylist(id: string): void {
  set({ playlists: state.playlists.filter((p) => p.id !== id) });
  if (state.context === 'pl:' + id) set({ context: 'all', order: contextIds('all', state) });
  saveMeta();
}
export function musicAddToPlaylist(id: string, trackIds: string[]): number {
  const p = state.playlists.find((x) => x.id === id);
  if (!p) return 0;
  const add = trackIds.filter((t) => !p.trackIds.includes(t) && state.tracks.some((x) => x.id === t));
  if (!add.length) return 0;
  set({ playlists: state.playlists.map((x) => (x.id === id ? { ...x, trackIds: [...x.trackIds, ...add] } : x)) });
  if (state.context === 'pl:' + id) set({ order: contextIds(state.context, state) });
  saveMeta();
  return add.length;
}
export function musicRemoveFromPlaylist(id: string, trackIds: string[]): void {
  const gone = new Set(trackIds);
  set({ playlists: state.playlists.map((x) => (x.id === id ? { ...x, trackIds: x.trackIds.filter((t) => !gone.has(t)) } : x)) });
  if (state.context === 'pl:' + id) set({ order: contextIds(state.context, state) });
  saveMeta();
}
export function musicMoveInPlaylist(id: string, from: number, to: number): void {
  const p = state.playlists.find((x) => x.id === id);
  if (!p || from === to || from < 0 || to < 0 || from >= p.trackIds.length || to >= p.trackIds.length) return;
  const ids = [...p.trackIds];
  const [x] = ids.splice(from, 1);
  ids.splice(to, 0, x);
  set({ playlists: state.playlists.map((q) => (q.id === id ? { ...q, trackIds: ids } : q)) });
  if (state.context === 'pl:' + id) set({ order: contextIds(state.context, state) });
  saveMeta();
}

export const getMusicState = () => state;
export function subscribeMusic(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
export function useMusic(): MusicState {
  initMusic();
  return useSyncExternalStore(subscribeMusic, getMusicState, getMusicState);
}
export const currentTrack = (s: MusicState): Track | undefined => findTrack(s.currentId);
export const isAmbientId = isAmbient;
export const trackById = (s: Pick<MusicState, 'tracks'>, id: string): Track | undefined => s.tracks.find((t) => t.id === id);
