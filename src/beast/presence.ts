// On-device presence detector for Beast mode. The camera picture is read ~2.5 times a second, reduced to a few numbers
// (is somebody there, where, how big, which way is the head turned) and thrown away. Nothing is recorded or uploaded.
//
// Three ways to find the student, best first (the first one that works on this device is used):
//   'face'        MediaPipe face detector (real model, also knows when the head is turned). Needs its files: see public/mediapipe/README.md
//   'native'      the browser's own FaceDetector when it exists
//   'silhouette'  no model at all: compare the live picture with a picture of the EMPTY room taken during calibration.
//                 Works for any skin tone / hijab / beard / wall colour; needs the camera to stay still.
// Whatever the way, the state is judged against how the student sat during calibration (frameAnalysis.classify).
import { useSyncExternalStore } from 'react';
import { Background, Baseline, Blob, blobOfBox, classify, foreground, frameDiff, majority, makeBackground, meanLuma, yawOf } from './frameAnalysis';
import type { Obs } from './beastRules';

export type CamStatus = 'off' | 'starting' | 'ready' | 'denied' | 'unsupported' | 'error';
export type DetectMode = 'pending' | 'face' | 'native' | 'silhouette';
export interface PresenceDebug { raw: Obs; ratio: number; fps: number; frac: number; box: Blob | null; seen: boolean }
export interface PresenceSnap { status: CamStatus; calibrated: boolean; obs: Obs; mode: DetectMode; stream: MediaStream | null; note: string; debug: PresenceDebug }

const CAL_KEY = 'planex_beast_cal_v1'; // calibration numbers (size and place of the student, never a picture)
const BG_KEY = 'planex_beast_cal_bg_v1'; // silhouette mode only: an 80x60 picture of the EMPTY room, kept on this device
const W = 80, H = 60, EVERY = 400, FROZEN_AFTER = 40, DARK = 22;
const NODBG: PresenceDebug = { raw: 'blind', ratio: 0, fps: 0, frac: 0, box: null, seen: false };

let snap: PresenceSnap = { status: 'off', calibrated: false, obs: 'blind', mode: 'pending', stream: null, note: '', debug: NODBG };
const ls = new Set<() => void>();
const emit = (p: Partial<PresenceSnap>) => { snap = { ...snap, ...p }; ls.forEach((l) => l()); };
export const getPresence = (): PresenceSnap => snap;
export const usePresence = (): PresenceSnap => useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l); }; }, getPresence, getPresence);
let wantDebug = false;
/** the contract sheet asks for live numbers (box, size, fps); otherwise only state changes are published */
export const setPresenceDebug = (on: boolean): void => { wantDebug = on; };

let video: HTMLVideoElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;
let last: Uint8ClampedArray | null = null;
let still = 0;
let hist: Obs[] = [];
let base: (Baseline & { mode: DetectMode }) | null = null;
let bg: Background | null = null;
let mp: any = null; // MediaPipe FaceDetector
let native: any = null; // browser FaceDetector
let modeReady: Promise<DetectMode> | null = null;
let frames = 0, fpsAt = 0, fps = 0, lastTs = 0;

// ---- saved calibration
const b64 = (u: Uint8Array): string => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
const unb64 = (s: string): Uint8Array => { const t = atob(s); const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
function saveCal(): void {
  try {
    if (base) localStorage.setItem(CAL_KEY, JSON.stringify(base)); else localStorage.removeItem(CAL_KEY);
    if (bg) localStorage.setItem(BG_KEY, b64(Uint8Array.from(bg.rgb, (v) => Math.round(v)))); else localStorage.removeItem(BG_KEY);
  } catch { /* ignore */ }
}
function loadCal(): void {
  try {
    const o = JSON.parse(localStorage.getItem(CAL_KEY) || 'null');
    if (o && typeof o.area === 'number' && (o.kind === 'face' || o.kind === 'silhouette')) base = o;
    const raw = localStorage.getItem(BG_KEY);
    if (raw) {
      const u = unb64(raw);
      if (u.length === W * H * 3) {
        const rgb = Float32Array.from(u);
        let l = 0; for (let p = 0; p < W * H; p++) l += 0.299 * rgb[p * 3] + 0.587 * rgb[p * 3 + 1] + 0.114 * rgb[p * 3 + 2];
        bg = { w: W, h: H, rgb, luma: l / (W * H), edge: 0, noise: 3 };
        bg.edge = edgeOf(rgb);
      }
    }
  } catch { /* ignore */ }
}
function edgeOf(rgb: Float32Array): number {
  let s = 0, c = 0;
  for (let y = 0; y < H * 0.7; y++) for (let x = 0; x < W; x++) {
    if (y > H * 0.14 && x > W * 0.08 && x < W * 0.92) continue;
    const i = (y * W + x) * 3; s += 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2]; c++;
  }
  return c ? s / c : 0;
}
loadCal();

// ---- detectors
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });
const FACE_MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
let mpTried = false;

/** MediaPipe: files from /mediapipe/ if you put them there, otherwise from a CDN. Any failure just means «use the next way». */
async function loadMediaPipe(): Promise<any | null> {
  if (mpTried) return mp;
  mpTried = true;
  const local = `${import.meta.env.BASE_URL}mediapipe/`;
  const tries: Array<{ lib: string; wasm: string; model: string }> = [
    { lib: local + 'vision_bundle.mjs', wasm: local + 'wasm', model: local + 'blaze_face_short_range.tflite' },
    { lib: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs', wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm', model: FACE_MODEL_CDN }
  ];
  for (const t of tries) {
    try {
      const m: any = await withTimeout(import(/* @vite-ignore */ t.lib), 9000);
      const fileset = await withTimeout(m.FilesetResolver.forVisionTasks(t.wasm), 9000);
      mp = await withTimeout(m.FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: t.model }, runningMode: 'VIDEO', minDetectionConfidence: 0.5 }), 20000);
      return mp;
    } catch { mp = null; }
  }
  return null;
}

function pickMode(): Promise<DetectMode> {
  if (modeReady) return modeReady;
  modeReady = (async () => {
    let mode: DetectMode = 'silhouette';
    if (await loadMediaPipe()) mode = 'face';
    else {
      try { const FD = (window as any).FaceDetector; if (FD) { native = new FD({ fastMode: true, maxDetectedFaces: 3 }); mode = 'native'; } } catch { native = null; }
    }
    // a calibration made with another way of detecting is no longer valid
    if (base && base.mode !== mode) { base = null; saveCalOnly(); }
    emit({ mode, calibrated: !!base && (mode !== 'silhouette' || !!bg), note: snap.note });
    return mode;
  })();
  return modeReady;
}
function saveCalOnly() { try { localStorage.removeItem(CAL_KEY); } catch { /* ignore */ } }
export const nativeSupported = (): boolean => typeof window !== 'undefined' && !!(window as any).FaceDetector;

function frame(): Uint8ClampedArray | null {
  if (!video || !ctx || video.readyState < 2) return null;
  ctx.drawImage(video, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}

async function measure(img: Uint8ClampedArray, mode: DetectMode): Promise<{ blob: Blob | null; frac: number }> {
  if (!video) return { blob: null, frac: 0 };
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  try {
    if (mode === 'face' && mp) {
      lastTs = Math.max(performance.now(), lastTs + 1); // MediaPipe wants strictly increasing timestamps
      const res = mp.detectForVideo(video, lastTs);
      const ds: any[] = (res && res.detections) || [];
      if (!ds.length) return { blob: null, frac: 0 };
      const d = ds.map((x) => ({ x, a: x.boundingBox.width * x.boundingBox.height })).sort((a, b) => b.a - a.a)[0].x;
      const bb = d.boundingBox, kp = d.keypoints || [];
      const yaw = kp.length >= 3 ? yawOf(kp[0], kp[1], kp[2]) : undefined;
      return { blob: blobOfBox(bb.originX, bb.originY, bb.width, bb.height, vw, vh, yaw), frac: 0 };
    }
    if (mode === 'native' && native) {
      const faces: any[] = await native.detect(video);
      if (!faces.length) return { blob: null, frac: 0 };
      const f = faces.map((x) => x.boundingBox).sort((a, b) => b.width * b.height - a.width * a.height)[0];
      return { blob: blobOfBox(f.x, f.y, f.width, f.height, vw, vh), frac: 0 };
    }
  } catch {
    // the detector broke on this device: drop to the next way and ask for a new calibration
    if (mode === 'face') mp = null; else native = null;
    base = null; saveCalOnly(); modeReady = null; void pickMode();
    emit({ calibrated: false, note: 'تشخیص‌گر کار نکرد؛ روش دیگری انتخاب شد. دوباره کالیبره کن.' });
    return { blob: null, frac: 0 };
  }
  if (mode === 'silhouette' && bg) return foreground(img, W, H, bg);
  return { blob: null, frac: 0 };
}

async function sample(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const img = frame();
    if (!img) return;
    frames++; const now = performance.now();
    if (now - fpsAt > 2000) { fps = frames / ((now - fpsAt) / 1000); frames = 0; fpsAt = now; }
    const luma = meanLuma(img);
    if (last) still = frameDiff(img, last) < 0.05 ? still + 1 : 0;
    last = new Uint8ClampedArray(img);
    const mode = snap.mode;
    let raw: Obs = 'blind';
    let m: { blob: Blob | null; frac: number } = { blob: null, frac: 0 };
    if (mode !== 'pending') m = await measure(img, mode);
    const ok = snap.calibrated && !!base;
    if (luma < DARK) raw = 'away'; // lens covered, or too dark to see anyone
    else if (still > FROZEN_AFTER) raw = 'blind'; // a frozen picture, not a live camera
    else if (!ok) raw = 'blind';
    else if (mode === 'silhouette' && m.frac > 0.8) raw = 'blind'; // camera moved / the light changed completely: nothing to compare with
    else raw = classify(m.blob, base as Baseline);
    hist.push(raw); if (hist.length > 5) hist.shift();
    const obs = majority(hist);
    const ratio = m.blob && base ? m.blob.area / Math.max(1e-6, base.area) : 0;
    if (wantDebug) emit({ obs, debug: { raw, ratio, fps, frac: m.frac, box: m.blob, seen: !!m.blob } });
    else if (obs !== snap.obs) emit({ obs });
  } finally { busy = false; }
}

export async function startCamera(): Promise<CamStatus> {
  if (snap.status === 'ready' && snap.stream && snap.stream.getVideoTracks().some((t) => t.readyState === 'live')) return 'ready';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { emit({ status: 'unsupported', note: 'این مرورگر به دوربین دسترسی نمی‌دهد (یا صفحه امن نیست: باید https یا localhost باشد).' }); return 'unsupported'; }
  emit({ status: 'starting', note: '' });
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }, audio: false });
    stopLoop();
    video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.setAttribute('aria-hidden', 'true');
    // not display:none and not 0px: some browsers stop decoding a video nobody can see
    Object.assign(video.style, { position: 'fixed', width: '64px', height: '48px', opacity: '0.01', pointerEvents: 'none', left: '0', bottom: '0', zIndex: '-1' });
    video.srcObject = stream;
    document.body.appendChild(video);
    await video.play().catch(() => undefined);
    canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    const t = stream.getVideoTracks()[0];
    if (t) t.addEventListener('ended', () => { if (snap.stream === stream) { stopLoop(); emit({ status: 'error', stream: null, obs: 'blind', note: 'دوربین قطع شد.' }); } });
    hist = []; still = 0; last = null; frames = 0; fpsAt = performance.now();
    emit({ status: 'ready', stream, note: '', obs: 'blind', calibrated: !!base && snap.mode !== 'pending' && (snap.mode !== 'silhouette' || !!bg) });
    timer = setInterval(() => { void sample(); }, EVERY);
    void pickMode();
    return 'ready';
  } catch (e: any) {
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'PermissionDeniedError');
    emit({ status: denied ? 'denied' : 'error', stream: null, obs: 'blind', note: denied ? 'اجازه‌ی دوربین داده نشد؛ از تنظیمات مرورگر برای این سایت باز کن.' : 'دوربین پیدا یا باز نشد (شاید برنامه‌ی دیگری از آن استفاده می‌کند).' });
    return denied ? 'denied' : 'error';
  }
}

function stopLoop() {
  if (timer) { clearInterval(timer); timer = null; }
  if (video) { try { video.pause(); } catch { /* ignore */ } video.srcObject = null; video.remove(); video = null; }
  canvas = null; ctx = null; last = null; still = 0; hist = [];
}

export function stopCamera(): void {
  const s = snap.stream;
  stopLoop();
  if (s) s.getTracks().forEach((t) => t.stop());
  emit({ status: 'off', stream: null, obs: 'blind', note: '', debug: NODBG });
}

export function clearCalibration(): void {
  base = null; bg = null; saveCal();
  emit({ calibrated: false, obs: 'blind' });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function grab(count: number, gap: number): Promise<Uint8ClampedArray[]> {
  const out: Uint8ClampedArray[] = [];
  for (let i = 0; i < count; i++) { const f = frame(); if (f) out.push(new Uint8ClampedArray(f)); await sleep(gap); }
  return out;
}
async function countdown(msg: string, secs: number, say: (m: string) => void) {
  for (let s = secs; s > 0; s--) { say(`${msg} (${s})`); await sleep(1000); }
}

/**
 * Calibration. With a face detector it is one step (sit and look at the screen). Without one (silhouette) it is two:
 * first step out of the picture so the empty room can be remembered, then sit down the way you study.
 */
export async function calibrate(say: (m: string) => void = () => undefined): Promise<{ ok: boolean; reason?: string }> {
  if (snap.status !== 'ready' || !video) return { ok: false, reason: 'اول دوربین را روشن کن.' };
  say('در حال انتخاب روش تشخیص…');
  const mode = await pickMode();
  if (!frame()) return { ok: false, reason: 'تصویری از دوربین نرسید.' };
  if (meanLuma(frame() as Uint8ClampedArray) < 40) return { ok: false, reason: 'اتاق یا لنز خیلی تاریک است؛ نور را بیشتر کن یا روی لنز را باز کن.' };

  if (mode === 'face' || mode === 'native') {
    await countdown('همان‌طور که درس می‌خوانی بنشین و به صفحه نگاه کن', 3, say);
    const blobs: Blob[] = [];
    for (let i = 0; i < 8; i++) {
      const f = frame();
      if (f) { const m = await measure(f, mode); if (m.blob) blobs.push(m.blob); }
      await sleep(300);
    }
    if (blobs.length < 5) return { ok: false, reason: 'چهره‌ات را پیدا نکردم؛ وسط تصویر بنشین، نور جلوی صورتت باشد (نه پشت سرت) و دوباره امتحان کن.' };
    const avg = (k: 'area' | 'cx' | 'cy' | 'top') => blobs.reduce((s, b) => s + b[k], 0) / blobs.length;
    const yaw = blobs.reduce((s, b) => s + Math.abs(b.yaw || 0), 0) / blobs.length;
    if (avg('area') < 0.008) return { ok: false, reason: 'چهره در تصویر خیلی کوچک است؛ کمی نزدیک‌تر بنشین.' };
    if (yaw > 0.4) return { ok: false, reason: 'سرت به یک سمت چرخیده بود؛ مستقیم به صفحه نگاه کن.' };
    base = { kind: 'face', area: avg('area'), cx: avg('cx'), cy: avg('cy'), top: avg('top'), mode }; bg = null;
  } else {
    await countdown('از جلوی دوربین کنار برو و صحنه را خالی بگذار', 4, say);
    say('در حال یادگرفتن اتاقِ خالی…');
    const empty = await grab(6, 250);
    const room = makeBackground(empty, W, H);
    if (!room) return { ok: false, reason: 'صحنه ثابت نبود (کسی یا چیزی حرکت می‌کرد). کنار برو و دوربین را ثابت نگه دار.' };
    await countdown('حالا بنشین، همان‌طور که درس می‌خوانی، و به صفحه نگاه کن', 5, say);
    const sit = await grab(6, 250);
    const found = sit.map((f) => foreground(f, W, H, room)).filter((r) => r.blob && r.frac < 0.8);
    if (found.length < 4) return { ok: false, reason: found.length === 0 ? 'کسی را نسبت به اتاق خالی ندیدم. وسط تصویر بنشین و دوربین را جابه‌جا نکن.' : 'تصویر ثابت نبود؛ تکان نخور و دوباره امتحان کن.' };
    const bl = found.map((r) => r.blob as Blob);
    const avg = (k: 'area' | 'cx' | 'cy' | 'top') => bl.reduce((s, b) => s + b[k], 0) / bl.length;
    if (avg('area') < 0.05) return { ok: false, reason: 'خیلی کم از تو در تصویر هست؛ نزدیک‌تر بنشین یا دوربین را رو به خودت کن.' };
    if (avg('area') > 0.9) return { ok: false, reason: 'تصویر بیشتر از تو پر شده؛ کمی عقب‌تر بنشین.' };
    bg = room; base = { kind: 'silhouette', area: avg('area'), cx: avg('cx'), cy: avg('cy'), top: avg('top'), mode };
  }
  saveCal();
  hist = [];
  emit({ calibrated: true, mode, obs: 'present', note: '' });
  say('');
  return { ok: true };
}

export const modeLabel = (m: DetectMode): string => (m === 'face' ? 'مدل چهره (MediaPipe)' : m === 'native' ? 'تشخیص چهره‌ی مرورگر' : m === 'silhouette' ? 'مقایسه با اتاق خالی' : 'در حال انتخاب…');

if (typeof document !== 'undefined') {
  // phones stop the camera when the page is hidden: bring it back when the student returns
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (snap.status === 'ready' && snap.stream && !snap.stream.getVideoTracks().some((t) => t.readyState === 'live')) { stopLoop(); emit({ status: 'off', stream: null }); void startCamera(); }
  });
}
