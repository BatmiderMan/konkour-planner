/**
 * .qbank — a question pack: one book, every question as an image + its answer.
 *
 *   bytes 0-3   "QBK1"
 *   bytes 4-7   uint32 little-endian: length H of the header
 *   next H      header, UTF-8 JSON  (see PackHeader)
 *   rest        the images (WebP) back to back; a question says where its image starts (o) and how long it is (l)
 *
 * No dependency, no server: the file can be sent in a messenger and opened by anyone who has the planner.
 */
export interface PackQuestion { n: number; a: 1 | 2 | 3 | 4; o: number; l: number; w: number; h: number }
export interface PackHeader {
  format: 'qbank'; version: number; id: string; title: string; subject?: string; grade?: number; publisher?: string;
  total: number;            // how many tests the book's answer key has
  withImage: number;        // how many of them came with an image
  questions: PackQuestion[];
  keyOnly?: { n: number; a: number }[]; // tests whose answer is known but whose image is not in the pack
  created?: string;
}
export interface Pack { header: PackHeader; image: (q: PackQuestion) => Blob }

export function parsePack(buf: ArrayBuffer): Pack {
  const u8 = new Uint8Array(buf);
  if (u8.length < 12 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'QBK1') throw new Error('این فایل، بستهٔ تست (qbank) نیست.');
  const hl = new DataView(buf).getUint32(4, true);
  if (hl <= 0 || 8 + hl > u8.length) throw new Error('فایل ناقص یا خراب است.');
  let header: PackHeader;
  try { header = JSON.parse(new TextDecoder('utf-8').decode(u8.subarray(8, 8 + hl))); } catch { throw new Error('سرآیند فایل خوانده نشد.'); }
  if (header.format !== 'qbank' || !header.id || !Array.isArray(header.questions)) throw new Error('این فایل، بستهٔ تست (qbank) نیست.');
  if (header.version > 1) throw new Error('این بسته با نسخهٔ جدیدتری از برنامه ساخته شده؛ برنامه را به‌روز کنید.');
  const base = 8 + hl;
  for (const q of header.questions) {
    if (!(q.a >= 1 && q.a <= 4) || q.o < 0 || q.l <= 0 || base + q.o + q.l > u8.length) throw new Error('فایل ناقص یا خراب است (تصویر سؤال ' + q.n + ').');
  }
  return { header, image: (q) => new Blob([u8.subarray(base + q.o, base + q.o + q.l)], { type: 'image/webp' }) };
}
