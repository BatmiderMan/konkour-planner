// Turn an uploaded file (PDF exported by the institute site, or a screenshot) into a pixel raster.
import type { Raster } from './raster';

/** jsPDF-style report PDFs hold one JPEG page image; pull the biggest DCT stream out of the bytes (no PDF library needed). */
export function extractPdfJpeg(bytes: Uint8Array): Uint8Array | null {
  const dec = new TextDecoder('latin1');
  const text = dec.decode(bytes);
  let best: Uint8Array | null = null;
  const re = /\/DCTDecode/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const sIdx = text.indexOf('stream', m.index);
    if (sIdx < 0) continue;
    let start = sIdx + 6;
    if (text[start] === '\r') start++;
    if (text[start] === '\n') start++;
    const end = text.indexOf('endstream', start);
    if (end < 0) continue;
    let stop = end;
    while (stop > start && (text[stop - 1] === '\n' || text[stop - 1] === '\r')) stop--;
    if (bytes[start] === 0xff && bytes[start + 1] === 0xd8 && (!best || stop - start > best.length)) best = bytes.subarray(start, stop);
  }
  return best;
}

export async function fileToRaster(file: File): Promise<Raster> {
  let blob: Blob = file;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const jpg = extractPdfJpeg(new Uint8Array(await file.arrayBuffer()));
    if (!jpg) throw new Error('pdf');
    blob = new Blob([jpg as BlobPart], { type: 'image/jpeg' });
  }
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, cv.width, cv.height);
}
