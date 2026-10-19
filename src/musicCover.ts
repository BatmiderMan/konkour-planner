// Album art for the music player: pulls the embedded cover out of mp3 (ID3v2), m4a/mp4 (covr) and flac files
// directly in the browser (no libraries, nothing is uploaded), shrinks it and works out its main colours.

export interface RawCover { bytes: Uint8Array; mime: string }

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
function sniff(b: Uint8Array, from = 0, to = b.length): { at: number; mime: string } | null {
  const end = Math.min(to, b.length) - 4;
  for (let i = from; i < end; i++) {
    if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff) return { at: i, mime: 'image/jpeg' };
    if (b[i] === 0x89 && b[i + 1] === 0x50 && b[i + 2] === 0x4e && b[i + 3] === 0x47) return { at: i, mime: 'image/png' };
    if (b[i] === 0x52 && b[i + 1] === 0x49 && b[i + 2] === 0x46 && b[i + 3] === 0x46 && b[i + 8] === 0x57 && b[i + 9] === 0x45) return { at: i, mime: 'image/webp' };
  }
  return null;
}
void JPEG; void PNG;

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const syncsafe = (b: Uint8Array, o: number) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...Array.from(b.subarray(o, o + n)));
async function read(blob: Blob, start: number, len: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, start + len).arrayBuffer());
}

// ---------------------------------------------------------------- MP3: ID3v2.2 / 2.3 / 2.4
async function fromId3(file: Blob, head: Uint8Array): Promise<RawCover | null> {
  const ver = head[3];
  const flags = head[5];
  const size = syncsafe(head, 6);
  if (size <= 0 || size > 24 * 1024 * 1024) return null;
  let tag = await read(file, 10, size);
  if (flags & 0x80) { // whole-tag unsynchronisation: FF 00 -> FF
    const out: number[] = [];
    for (let i = 0; i < tag.length; i++) { out.push(tag[i]); if (tag[i] === 0xff && tag[i + 1] === 0x00) i++; }
    tag = Uint8Array.from(out);
  }
  let pos = 0;
  if (flags & 0x40 && ver >= 3) { // extended header
    pos = ver === 4 ? syncsafe(tag, 0) : u32(tag, 0) + 4;
  }
  const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10;
  let best: RawCover | null = null;
  while (pos + hdr < tag.length) {
    const id = ascii(tag, pos, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding reached
    let fsize = ver === 2 ? (tag[pos + 3] << 16) | (tag[pos + 4] << 8) | tag[pos + 5] : ver === 4 ? syncsafe(tag, pos + 4) : u32(tag, pos + 4);
    const body = pos + hdr;
    if (fsize <= 0 || body + fsize > tag.length) fsize = Math.max(0, tag.length - body);
    if (id === 'APIC' || id === 'PIC') {
      const frame = tag.subarray(body, body + fsize);
      const hit = sniff(frame, 2);
      if (hit) {
        // picture type sits just before the description; 3 = front cover wins, otherwise keep the first image
        const cand: RawCover = { bytes: frame.slice(hit.at), mime: hit.mime };
        const front = frame.indexOf(3) >= 0 && frame.indexOf(3) < hit.at;
        if (front) return cand;
        if (!best) best = cand;
      }
    }
    pos = body + fsize;
  }
  return best;
}

// ---------------------------------------------------------------- M4A / MP4: moov > udta > meta > ilst > covr > data
async function fromMp4(file: Blob): Promise<RawCover | null> {
  let off = 0;
  const total = file.size;
  while (off + 8 <= total) {
    const h = await read(file, off, 16);
    let size = u32(h, 0);
    const type = ascii(h, 4, 4);
    if (size === 1) size = u32(h, 8) * 4294967296 + u32(h, 12);
    else if (size === 0) size = total - off;
    if (size < 8) return null;
    if (type === 'moov') {
      if (size > 32 * 1024 * 1024) return null;
      const moov = await read(file, off, size);
      for (let i = 0; i + 8 < moov.length; i++) {
        if (moov[i] === 0x63 && moov[i + 1] === 0x6f && moov[i + 2] === 0x76 && moov[i + 3] === 0x72) { // "covr"
          const d = i + 4; // the first child is the "data" atom
          if (ascii(moov, d + 4, 4) !== 'data') continue;
          const dsize = u32(moov, d);
          const img = moov.slice(d + 16, Math.min(moov.length, d + dsize));
          const hit = sniff(img, 0, 16);
          if (hit) return { bytes: img.slice(hit.at), mime: hit.mime };
        }
      }
      return null;
    }
    off += size;
  }
  return null;
}

// ---------------------------------------------------------------- FLAC: PICTURE metadata block
async function fromFlac(file: Blob): Promise<RawCover | null> {
  let off = 4;
  for (let n = 0; n < 40; n++) {
    const h = await read(file, off, 4);
    const last = !!(h[0] & 0x80), type = h[0] & 0x7f;
    const len = (h[1] << 16) | (h[2] << 8) | h[3];
    if (type === 6 && len < 24 * 1024 * 1024) {
      const b = await read(file, off + 4, len);
      const hit = sniff(b, 8);
      if (hit) return { bytes: b.slice(hit.at), mime: hit.mime };
    }
    off += 4 + len;
    if (last) break;
  }
  return null;
}

/** the embedded cover of an audio file, or null */
export async function extractEmbeddedCover(file: Blob): Promise<RawCover | null> {
  try {
    const head = await read(file, 0, 16);
    if (ascii(head, 0, 3) === 'ID3') return await fromId3(file, head);
    if (ascii(head, 4, 4) === 'ftyp') return await fromMp4(file);
    if (ascii(head, 0, 4) === 'fLaC') return await fromFlac(file);
  } catch { /* unreadable tag: no cover */ }
  return null;
}

// ---------------------------------------------------------------- browser side: shrink + colours
export interface Thumb { blob: Blob; tint: [string, string] }

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** main + lighter colour of an RGBA pixel grid (favours saturated mid-tones, ignores near black / white) */
export function dominantTint(px: Uint8ClampedArray | Uint8Array): [string, string] {
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < px.length; i += 4) {
    const R = px[i], G = px[i + 1], B = px[i + 2];
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    const v = mx / 255, s = mx === 0 ? 0 : (mx - mn) / mx;
    if (v < 0.18 || (v > 0.97 && s < 0.08)) continue;
    const wt = 0.15 + s * s * 1.6 + (1 - Math.abs(v - 0.65)) * 0.5;
    r += R * wt; g += G * wt; b += B * wt; w += wt;
  }
  if (!w) return ['#8b5cf6', '#35e0c4'];
  r /= w; g /= w; b /= w;
  // keep it vivid enough for a dark UI
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum < 0.42) { const k = 0.42 / Math.max(lum, 0.05); r = Math.min(255, r * k + 18); g = Math.min(255, g * k + 18); b = Math.min(255, b * k + 18); }
  return [hex(r, g, b), hex(r + (255 - r) * 0.42, g + (255 - g) * 0.42, b + (255 - b) * 0.42)];
}

/** shrinks any image blob to a 360px JPEG and finds its colours (browser only) */
export async function makeThumb(src: Blob, max = 360): Promise<Thumb | null> {
  try {
    const bmp = await createImageBitmap(src);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const small = ctx.getImageData(0, 0, w, h);
    // sample a coarse grid for the colours
    const step = Math.max(1, Math.floor(Math.max(w, h) / 24));
    const samp: number[] = [];
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4; samp.push(small.data[i], small.data[i + 1], small.data[i + 2], 255); }
    const tint = dominantTint(Uint8ClampedArray.from(samp));
    const blob: Blob | null = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.84));
    return blob ? { blob, tint } : null;
  } catch { return null; }
}
