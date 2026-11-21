/**
 * .qbank — a question pack: one book (or one PART of a book), every question as an image + its answer (+ its explanation).
 *
 *   bytes 0-3   "QBK1"
 *   bytes 4-7   uint32 little-endian: length H of the header
 *   next H      header, UTF-8 JSON  (see PackHeader)
 *   rest        the images (WebP) back to back; a question says where its image starts (o) and how long it is (l);
 *               its explanation image (the worked solution from the book) the same way (eo / el)
 *
 * A big book can be cut into several files ("part 2 of 4") that carry the SAME id: importing them one after the other
 * merges them into one book. No dependency, no server: the file can be sent in a messenger.
 */
export interface PackQuestion {
  n: number; a: 0 | 1 | 2 | 3 | 4; /* 0 = the book's key for this test is not known */ o: number; l: number; w: number; h: number;
  /** explanation image (پاسخ تشریحی) */
  eo?: number; el?: number; ew?: number; eh?: number;
  /** 1 = the explanation image also contains the neighbour's solution (its start marker was not found) */
  es?: 1;
  /** 1 = the question was cut by layout heuristics (check it) */
  qa?: 1;
  /** exact tap areas of the 4 printed options, in image pixels: [x, y, w, h] × 4 (option 1..4) */
  opt?: number[][];
}
export interface PackKeyOnly { n: number; a: number; eo?: number; el?: number; ew?: number; eh?: number; es?: 1 }
export interface PackHeader {
  format: 'qbank'; version: number; id: string; title: string; subject?: string; grade?: number; publisher?: string;
  total: number;            // how many tests the book's answer key has
  withImage: number;        // how many of them came with an image (in this file)
  withExplanation?: number;
  part?: number; parts?: number;   // "part 2 of 4"
  questions: PackQuestion[];
  keyOnly?: PackKeyOnly[];  // tests whose answer is known but whose image is not in the pack
  created?: string;
}
export interface Pack { header: PackHeader; image: (q: PackQuestion) => Blob; explanation: (q: { eo?: number; el?: number }) => Blob | null }

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
    if (!(q.a === 0 || (q.a >= 1 && q.a <= 4)) || q.o < 0 || q.l <= 0 || base + q.o + q.l > u8.length) throw new Error('فایل ناقص یا خراب است (تصویر سؤال ' + q.n + ').');
    if (q.eo !== undefined && (!(q.el! > 0) || base + q.eo + q.el! > u8.length)) throw new Error('فایل ناقص یا خراب است (پاسخ تشریحی ' + q.n + ').');
  }
  const blob = (o: number, l: number) => new Blob([u8.subarray(base + o, base + o + l)], { type: 'image/webp' });
  return {
    header,
    image: (q) => blob(q.o, q.l),
    explanation: (q) => (q.eo !== undefined && q.el && base + q.eo + q.el <= u8.length ? blob(q.eo, q.el) : null)
  };
}
