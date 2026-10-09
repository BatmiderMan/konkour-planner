import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Music player engine. One <audio> element lives for the whole app, so the music
// keeps playing while you move between Today / Planner / Exams / Report and while
// the study timer is open.
//
//  • Your own songs: picked from the device, stored in IndexedDB (they survive a
//    reload and never leave the device — nothing is uploaded anywhere).
//  • Focus sounds (rain / brown noise / ocean): generated in the browser as a
//    seamless loop, so they work offline and need no files.
// ---------------------------------------------------------------------------

export type Repeat = 'off' | 'all' | 'one';
export type AmbientKind = 'rain' | 'brown' | 'ocean';

export interface Track {
  id: string;
  title: string;
  kind: 'file' | 'ambient';
  duration?: number; // seconds (files only, filled in after the first read)
}

export const AMBIENT_TRACKS: Track[] = [
  { id: 'amb:rain', title: 'باران', kind: 'ambient' },
  { id: 'amb:brown', title: 'نویز قهوه‌ای (تمرکز عمیق)', kind: 'ambient' },
  { id: 'amb:ocean', title: 'موج دریا', kind: 'ambient' }
];

export interface MusicState {
  tracks: Track[]; // the user's playlist (files)
  currentId: string | null;
  playing: boolean;
  active: boolean; // something was started this session -> the mini bar is shown
  position: number;
  duration: number;
  volume: number; // 0..1
  shuffle: boolean;
  repeat: Repeat;
  loading: boolean;
  error: string;
  ready: boolean; // playlist loaded from storage
}

const META_KEY = 'planex_music_v1';
const DB_NAME = 'planex-music';
const STORE = 'files';

let state: MusicState = {
  tracks: [], currentId: null, playing: false, active: false, position: 0, duration: 0,
  volume: 0.7, shuffle: false, repeat: 'all', loading: false, error: '', ready: false
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
async function dbDelete(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
  db.close();
}

function saveMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({
      tracks: state.tracks, currentId: state.currentId, volume: state.volume, shuffle: state.shuffle, repeat: state.repeat
    }));
  } catch { /* storage full / blocked: the player still works for this session */ }
}
function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return;
    const m = JSON.parse(raw);
    const tracks: Track[] = Array.isArray(m.tracks) ? m.tracks.filter((t: any) => t && typeof t.id === 'string' && typeof t.title === 'string').map((t: any) => ({ id: t.id, title: t.title, kind: 'file' as const, duration: typeof t.duration === 'number' ? t.duration : undefined })) : [];
    const all = [...tracks, ...AMBIENT_TRACKS];
    state = {
      ...state,
      tracks,
      currentId: all.some((t) => t.id === m.currentId) ? m.currentId : null,
      volume: typeof m.volume === 'number' ? Math.min(1, Math.max(0, m.volume)) : 0.7,
      shuffle: !!m.shuffle,
      repeat: m.repeat === 'off' || m.repeat === 'one' ? m.repeat : 'all'
    };
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
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') {
      brown = (brown + 0.02 * w) * 0.998;
      raw[i] = brown * 3.2;
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

const isAmbient = (id: string | null) => !!id && id.startsWith('amb:');
const findTrack = (id: string | null): Track | undefined => (id ? [...state.tracks, ...AMBIENT_TRACKS].find((t) => t.id === id) : undefined);

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = 'auto';
  a.volume = state.volume;
  a.addEventListener('timeupdate', () => { if (!isAmbient(state.currentId)) set({ position: a.currentTime }); });
  a.addEventListener('durationchange', () => { if (!isAmbient(state.currentId) && isFinite(a.duration)) set({ duration: a.duration }); });
  a.addEventListener('play', () => { set({ playing: true, active: true }); syncSession(); });
  a.addEventListener('pause', () => { set({ playing: false }); syncSession(); });
  a.addEventListener('ended', () => { if (!isAmbient(state.currentId)) advance(true); });
  a.addEventListener('error', () => { if (state.currentId) set({ error: 'پخش این فایل ممکن نشد', loading: false, playing: false }); });
  audio = a;
  setupMediaSession();
  return a;
}

function pickNext(dir: 1 | -1, auto: boolean): string | null {
  const list = state.tracks;
  if (!list.length) return null;
  const idx = list.findIndex((t) => t.id === state.currentId);
  if (auto && state.repeat === 'one' && idx >= 0) return list[idx].id;
  if (state.shuffle && list.length > 1) {
    let n = idx;
    while (n === idx) n = Math.floor(Math.random() * list.length);
    return list[n].id;
  }
  if (idx < 0) return list[0].id;
  const n = idx + dir;
  if (n >= list.length || n < 0) {
    if (auto && state.repeat === 'off' && dir === 1) return null;
    return list[(n + list.length) % list.length].id;
  }
  return list[n].id;
}

function advance(auto: boolean) {
  const id = pickNext(1, auto);
  if (id) void playTrack(id);
  else { const a = getAudio(); a.pause(); a.currentTime = 0; set({ position: 0 }); }
}

async function playTrack(id: string): Promise<void> {
  const t = findTrack(id);
  if (!t) return;
  const a = getAudio();
  const token = ++loadToken;
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
  h('seekto', (d) => { if (d && typeof d.seekTime === 'number') musicSeek(d.seekTime); });
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
  if (!state.currentId || !a.src) {
    const first = state.currentId || state.tracks[0]?.id || AMBIENT_TRACKS[0].id;
    void playTrack(first);
  } else {
    a.play().catch(() => set({ error: 'پخش ممکن نشد' }));
  }
}
export function musicPlay(id: string): void {
  if (id === state.currentId && audio && audio.src) { musicToggle(); return; }
  void playTrack(id);
}
export function musicNext(): void {
  if (isAmbient(state.currentId) || !state.tracks.length) return;
  const id = pickNext(1, false);
  if (id) void playTrack(id);
}
export function musicPrev(): void {
  if (isAmbient(state.currentId) || !state.tracks.length) return;
  const a = getAudio();
  if (a.currentTime > 4) { a.currentTime = 0; return; }
  const id = pickNext(-1, false);
  if (id) void playTrack(id);
}
export function musicSeek(sec: number): void {
  if (isAmbient(state.currentId)) return;
  const a = getAudio();
  if (isFinite(a.duration)) { a.currentTime = Math.max(0, Math.min(a.duration, sec)); set({ position: a.currentTime }); }
}
export function musicSetVolume(v: number): void {
  const vol = Math.min(1, Math.max(0, v));
  if (audio) audio.volume = vol;
  set({ volume: vol });
  saveMeta();
}
export function musicToggleShuffle(): void { set({ shuffle: !state.shuffle }); saveMeta(); }
export function musicCycleRepeat(): void {
  set({ repeat: state.repeat === 'all' ? 'one' : state.repeat === 'one' ? 'off' : 'all' });
  saveMeta();
}
/** hides the mini bar and stops the sound */
export function musicStop(): void {
  if (audio) { audio.pause(); }
  set({ active: false, playing: false });
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

/** adds picked files to the playlist; returns how many were added */
export async function musicAddFiles(files: FileList | File[]): Promise<number> {
  const list = Array.from(files).filter((f) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name));
  if (!list.length) { set({ error: 'فایل صوتی پیدا نشد (mp3، m4a، wav، ogg…)' }); return 0; }
  set({ error: '' });
  const added: Track[] = [];
  for (const f of list) {
    const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    try {
      await dbPut(id, f);
      const duration = await readDuration(f);
      added.push({ id, kind: 'file', title: f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'بدون نام', duration: duration || undefined });
    } catch {
      set({ error: 'ذخیره‌ی فایل در مرورگر ممکن نشد (جای خالی کافی نیست؟)' });
    }
  }
  if (added.length) {
    set({ tracks: [...state.tracks, ...added] });
    saveMeta();
  }
  return added.length;
}

export async function musicRemove(id: string): Promise<void> {
  const wasCurrent = state.currentId === id;
  if (wasCurrent && audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; } }
  set({
    tracks: state.tracks.filter((t) => t.id !== id),
    ...(wasCurrent ? { currentId: null, playing: false, position: 0, duration: 0 } : {})
  });
  saveMeta();
  await dbDelete(id);
}

export const getMusicState = () => state;
export function subscribeMusic(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
export function useMusic(): MusicState {
  initMusic();
  return useSyncExternalStore(subscribeMusic, getMusicState, getMusicState);
}
export const currentTrack = (s: MusicState): Track | undefined => findTrack(s.currentId);
export const isAmbientId = isAmbient;
