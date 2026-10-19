// Tiny text extractor for "print to PDF" reports (wkhtmltopdf / Qt): finds the page text with positions.
// Handles the plain structure those files use — flate content streams, Type0/Identity-H fonts with a ToUnicode map.
// It is not a general PDF reader; anything it cannot understand makes it return an empty list.

export interface TextItem { text: string; x: number; y: number; size: number; bold: boolean } // x right-ward, y downward, page units

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const w = ds.writable.getWriter();
  w.write(bytes as unknown as BufferSource).catch(() => undefined); w.close().catch(() => undefined);
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

interface Obj { dict: string; stream?: Uint8Array }
function readObjects(bytes: Uint8Array): Map<number, Obj> {
  const t = new TextDecoder('latin1').decode(bytes);
  const out = new Map<number, Obj>();
  const re = /(?:^|[\r\n\s])(\d+) 0 obj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const id = +m[1]; const start = m.index + m[0].length;
    const end = t.indexOf('endobj', start); if (end < 0) break;
    const body = t.slice(start, end);
    const si = body.indexOf('stream');
    if (si >= 0 && /^\s*<</.test(body)) {
      let a = start + si + 6; if (t[a] === '\r') a++; if (t[a] === '\n') a++;
      const eIdx = t.indexOf('endstream', a);
      let b = eIdx < 0 ? end : eIdx;
      while (b > a && (t[b - 1] === '\n' || t[b - 1] === '\r')) b--;
      out.set(id, { dict: body.slice(0, si), stream: bytes.subarray(a, b) });
    } else out.set(id, { dict: body });
    re.lastIndex = end;
  }
  return out;
}
const refOf = (s: string, key: string): number | null => { const m = new RegExp('/' + key + '\\s+(\\d+) 0 R').exec(s); return m ? +m[1] : null; };
async function streamOf(o: Obj | undefined): Promise<string> {
  if (!o || !o.stream) return '';
  const raw = /FlateDecode/.test(o.dict) ? await inflate(o.stream) : o.stream;
  return new TextDecoder('latin1').decode(raw);
}

function parseToUnicode(cm: string): Map<number, string> {
  const map = new Map<number, string>();
  const u16 = (h: string) => { let s = ''; for (let i = 0; i + 3 < h.length + 0; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return s; };
  for (const blk of cm.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(m[1], 16), u16(m[2]));
  for (const blk of cm.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
      const a = parseInt(m[1], 16), b = parseInt(m[2], 16);
      if (m[3][0] === '[') { const items = [...m[3].matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => u16(x[1])); for (let c = a; c <= b && c - a < items.length; c++) map.set(c, items[c - a]); }
      else { const base = parseInt(m[3].slice(1, -1), 16); const hexLen = m[3].length - 2; for (let c = a; c <= b; c++) map.set(c, u16((base + c - a).toString(16).padStart(hexLen, '0'))); }
    }
  }
  return map;
}

export async function extractPdfText(bytes: Uint8Array): Promise<TextItem[]> {
  const objs = readObjects(bytes);
  let page: Obj | undefined;
  for (const o of objs.values()) if (/\/Type\s*\/Page(?![s\w])/.test(o.dict)) { page = o; break; }
  if (!page) return [];
  // contents (one ref or an array of refs)
  const cm = /\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/.exec(page.dict);
  const cIds = cm ? [...cm[1].matchAll(/(\d+) 0 R/g)].map((x) => +x[1]) : [];
  let content = '';
  for (const id of cIds) content += (await streamOf(objs.get(id))) + '\n';
  // fonts
  const resId = refOf(page.dict, 'Resources');
  const resDict = resId ? (objs.get(resId)?.dict || '') : page.dict;
  const fm = /\/Font\s*<<([^>]*)>>/.exec(resDict);
  const fonts = new Map<string, { map: Map<number, string>; bold: boolean }>();
  if (fm) for (const f of fm[1].matchAll(/\/(\S+)\s+(\d+) 0 R/g)) {
    const fo = objs.get(+f[2]); if (!fo) continue;
    const tu = refOf(fo.dict, 'ToUnicode');
    fonts.set(f[1], { map: tu ? parseToUnicode(await streamOf(objs.get(tu))) : new Map(), bold: /Bold/i.test(fo.dict) });
  }
  const mb = /\/MediaBox\s*\[\s*[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s*\]/.exec(page.dict);
  const pageH = mb ? parseFloat(mb[1]) : 0;
  // interpret
  const items: TextItem[] = [];
  const tok = /\[|\]|<([0-9a-fA-F\s]*)>|\/[^\s\/\[\]<>()]+|[-+]?\d*\.?\d+|[A-Za-z*'"]+/g;
  let ctm: M = [1, 0, 0, 1, 0, 0]; const stack: M[] = [];
  let tm: M = [1, 0, 0, 1, 0, 0], tlm: M = tm; let font = ''; let size = 0;
  let glyphs: { x: number; y: number; ch: string }[] = []; let ops: (string | number)[] = [];
  const flush = () => {
    if (!glyphs.length) return;
    const f = fonts.get(font);
    items.push({ text: glyphs.map((g) => g.ch).join(''), x: glyphs.reduce((a, g) => a + g.x, 0) / glyphs.length, y: pageH - glyphs[0].y, size, bold: !!f?.bold });
    glyphs = [];
  };
  const show = (hex: string) => {
    const f = fonts.get(font); const h = hex.replace(/\s/g, '');
    const p = mul(tm, ctm); // glyph origin in device space
    for (let i = 0; i + 3 < h.length + 0; i += 4) {
      const code = parseInt(h.slice(i, i + 4), 16);
      glyphs.push({ x: p[4], y: p[5], ch: f?.map.get(code) ?? '' });
    }
  };
  let m: RegExpExecArray | null; let inArr = false;
  while ((m = tok.exec(content))) {
    const s = m[0];
    if (s === '[') { inArr = true; continue; }
    if (s === ']') { inArr = false; continue; }
    if (m[1] !== undefined) { ops.push('<' + m[1]); continue; }
    if (s[0] === '/' || /^[-+]?\d*\.?\d+$/.test(s)) { ops.push(s[0] === '/' ? s : parseFloat(s)); continue; }
    if (inArr) continue;
    const n = (i: number) => ops[i] as number;
    switch (s) {
      case 'q': stack.push(ctm); break;
      case 'Q': ctm = stack.pop() || ctm; break;
      case 'cm': ctm = mul([n(0), n(1), n(2), n(3), n(4), n(5)], ctm); break;
      case 'BT': flush(); tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case 'ET': flush(); break;
      case 'Tf': font = String(ops[0]).slice(1); size = n(1) * Math.abs(ctm[3] || ctm[0]); break;
      case 'Tm': tm = [n(0), n(1), n(2), n(3), n(4), n(5)]; tlm = tm; break;
      case 'Td': case 'TD': tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm; break;
      case 'Tj': case 'TJ': for (const o of ops) if (typeof o === 'string' && o[0] === '<') show(o.slice(1)); break;
      default: break;
    }
    ops = [];
  }
  flush();
  return items;
}
