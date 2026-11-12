/** Shrink a picked / pasted photo to a JPEG of at most 1500 px (keeps the vault light on phones). */
export function compressImage(file: Blob, max = 1500, quality = 0.85): Promise<Blob> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    im.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, max / Math.max(im.width, im.height, 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
      const x = c.getContext('2d');
      if (!x) return rej(new Error('canvas'));
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/jpeg', quality);
    };
    im.src = url;
  });
}

export const blobToDataUrl = (b: Blob): Promise<string> => new Promise((res, rej) => {
  const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b);
});

export function dataUrlToBlob(u: string): Blob | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(u || '');
  if (!m) return null;
  try {
    const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] || 'image/jpeg' });
  } catch { return null; }
}

/** Draw a picture (optionally turned by 0/90/180/270°) onto a white JPEG of at most `max` px — used by the bulk importer for thumbnails and the final save. */
export function renderImage(file: Blob, max = 1500, quality = 0.85, rot = 0): Promise<Blob> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    im.onload = () => {
      URL.revokeObjectURL(url);
      const sw = im.naturalWidth || im.width, sh = im.naturalHeight || im.height;
      const turn = rot % 180 !== 0;
      const ow = turn ? sh : sw, oh = turn ? sw : sh;
      const k = Math.min(1, max / Math.max(ow, oh, 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(ow * k)); c.height = Math.max(1, Math.round(oh * k));
      const x = c.getContext('2d');
      if (!x) return rej(new Error('canvas'));
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.translate(c.width / 2, c.height / 2); x.rotate((rot * Math.PI) / 180);
      x.drawImage(im, (-sw * k) / 2, (-sh * k) / 2, sw * k, sh * k);
      c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/jpeg', quality);
    };
    im.src = url;
  });
}
