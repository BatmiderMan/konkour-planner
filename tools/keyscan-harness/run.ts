import fs from 'fs';
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
import { runKeyScanGray } from '/home/claude/proj/src/checker/engine/index';
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['p1','p2','p3','p4','p5','p6','p7'];
for (const n of names) {
  const meta = JSON.parse(fs.readFileSync(n + '.json', 'utf8'));
  const gray = new Uint8Array(fs.readFileSync(n + '.gray'));
  const t = Date.now();
  const { R, names: perm } = runKeyScanGray(gray, meta.w, meta.h, true);
  const cols: Record<number, any[]> = {};
  R.seq.forEach((p: any) => (cols[p.col] = cols[p.col] || []).push(p));
  const lens = Object.keys(cols).map(c => cols[+c].length);
  const labs = R.seq.map((p: any) => p.cl >= 0 ? perm[p.cl] : 0);
  console.log(n, 'cells', R.seq.length, 'cols', R.ncol, 'lens', lens.join(','), 'low', R.seq.filter((p: any) => p.low).length, 'missing', R.seq.filter((p: any) => !p.d).length, 'h0', R.h0, 'badges', R.badges, 'pills', R.pills, 'hdr', R.headerRows, 'ms', Date.now() - t);
  const cells = R.seq.map((p: any, i: number) => { const b = p.d ? p.d.g[0] : null; return { i, col: p.col, row: p.row, b: b ? [b.x0, b.y0, b.x1, b.y1] : null, lab: labs[i], low: !!p.low, miss: !p.d, ratio: p.ratio ?? null }; });
  fs.writeFileSync(n + '.out.json', JSON.stringify({ W: R.W, H: R.H, h0: R.h0, lens, perm, cells }));
  fs.writeFileSync(n + '.rgray', Buffer.from(R.gray));
}
