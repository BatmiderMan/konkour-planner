/**
 * lanes.ts — two repairs on a finished reading, both only applied when something is actually wrong:
 *
 *  snapToLanes   In every column the option digits stand in ONE vertical lane. A mark far outside that lane is not the option digit
 *                of its row but something that merely looked like one (the thin leading «۱» of a number such as ۱۲۲, a cell border,
 *                a stray dot). It is replaced by the digit found in the lane at that row, or the slot is left empty (and flagged) so that
 *                the numbering cannot shift and the person is asked about it.
 *  reclassify    after such a repair the four digit shapes are clustered again (step 8 of KeyScan.scan), because the stray marks had
 *                been taking up a cluster of their own and forced two real digits (e.g. ۲ and ۳) into one.
 */
import { KeyScan as KS } from './keyScan';

const med = (a: number[]): number => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };

export function snapToLanes(R: any): number {
  if (!R || !R.seq) return 0;
  const by: Record<number, any[]> = {};
  R.seq.forEach((p: any) => { (by[p.col] = by[p.col] || []).push(p); });
  const h0 = R.h0, cs = R.cosS, sn = R.sinS;
  let changed = 0;
  Object.keys(by).forEach((k) => {
    const c = by[+k], real = c.filter((p: any) => p.d);
    if (real.length < 8) return;
    const xs = real.map((p: any) => p.d.g[0].u), lane = med(xs);
    const mad = med(xs.map((x: number) => Math.abs(x - lane)));
    const tol = Math.max(0.55 * h0, 5 * mad), vtol = Math.max(0.6 * h0, 0.45 * (R.pitch || 3 * h0));
    const key = (g: any) => g.x0 + ',' + g.y0;
    const used = new Set<string>(); real.forEach((p: any) => { if (Math.abs(p.d.g[0].u - lane) <= tol) used.add(key(p.d.g[0])); });
    real.forEach((p: any) => {
      const u = p.d.g[0].u;
      if (Math.abs(u - lane) <= tol) return;
      const v = p.y, X = lane * cs - v * sn, Y = v * cs + lane * sn;
      const e: any = KS.localFind(R, X, Y);
      if (e && Math.abs(e.x - lane) <= 0.6 * h0 && Math.abs(e.y - v) <= vtol && !used.has(key(e.d.g[0]))) {
        used.add(key(e.d.g[0]));
        p.d = e.d; p.x = e.x; p.y = e.y; p.added = true; p.orphan = false; p.low = true; p.cl = -1; changed++;
      } else {
        p.d = null; p.x = lane; p.cl = -1; p.low = true; p.missing = true; changed++;
      }
    });
  });
  return changed;
}

/** step 8 of KeyScan.scan, run again over the digits that are in R.seq now */
export function reclassify(R: any): void {
  const seq = R.seq, real = seq.filter((p: any) => p.d);
  seq.forEach((p: any) => { if (!p.d) { p.cl = -1; p.low = true; } });
  if (real.length < 8) { R.km = null; return; }
  const feats = real.map((p: any) => KS.feat(p.d.g[0], R.W, R.cosS, R.sinS, R.gray, R.H));
  const km = KS.kmeans(feats.map((x: any) => x.f), 4);
  const order = [0, 1, 2, 3].sort((a, b) => {
    let ma = 0, na = 0, mb = 0, nb = 0;
    km.as.forEach((c: number, k: number) => { if (c === a) { ma += feats[k].asp; na++; } if (c === b) { mb += feats[k].asp; nb++; } });
    return ma / (na || 1) - mb / (nb || 1);
  });
  const rank: Record<number, number> = {}; order.forEach((c, r) => { rank[c] = r; });
  const C = order.map((c) => km.C[c]);
  real.forEach((p: any, k: number) => {
    const cl = rank[km.as[k]], d = [0, 1, 2, 3].map((j) => KS.dist(feats[k].f, C[j])), d1 = d[cl];
    const d2 = Math.min(...d.filter((_: number, j: number) => j !== cl));
    p.cl = cl; p.d1 = d1; p.ratio = d1 / (d2 || 1e-9); p.f = feats[k].f; p.box = feats[k];
  });
  const cd: number[][] = [[], [], [], []]; real.forEach((p: any) => { cd[p.cl].push(p.d1); });
  const cst = cd.map((a) => { const m = a.reduce((s, v) => s + v, 0) / (a.length || 1), sd = Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length || 1)); return { m, sd, n: a.length }; });
  real.forEach((p: any) => { const s = cst[p.cl]; p.low = p.ratio > 0.72 || p.d1 > s.m + 2.8 * s.sd; });
  R.km = { C, stats: cst };
}

/** both repairs in one call; returns how many cells were touched */
export function repairLanes(R: any): number {
  let n = 0;
  try { n = snapToLanes(R); if (n) reclassify(R); } catch (e) { /* keep the reading as it was */ }
  try { n += refineLow(R); } catch (e) { /* keep the reading as it was */ }
  return n;
}

/**
 * Blur is local: on a photographed page one side can be out of focus, and there a ۳ turns into a fat blob that sits closer to the
 * ۴ cluster than to the (sharp) ۳ cluster of the page as a whole. For each doubtful digit the class is therefore decided again
 * against the CONFIDENT digits standing nearest to it on the page (same blur, same lighting): the class whose closest few
 * neighbours look most like it wins, and the label is only changed when that is clearly better than the current class.
 */
export function refineLow(R: any): number {
  if (!R || !R.seq || !R.km) return 0;
  const real = R.seq.filter((p: any) => p.d && p.cl >= 0);
  const feat = new Map<any, number[]>();
  real.forEach((p: any) => { feat.set(p, KS.feat(p.d.g[0], R.W, R.cosS, R.sinS, R.gray, R.H).f); });
  const conf = real.filter((p: any) => !p.low);
  // only digits the clustering itself could not decide (almost as close to a second class); an outlier it is sure about is left alone
  const lows = real.filter((p: any) => p.low && (p.ratio ?? 0) > 0.8);
  if (conf.length < 20 || !lows.length) return 0;
  let changed = 0;
  const upd: Array<[any, number]> = [];
  const asp = (p: any) => p.d.g[0].w / p.d.g[0].h;
  lows.forEach((p: any) => {
    const near = conf.map((q: any) => ({ q, d: (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y) })).sort((a: any, b: any) => a.d - b.d).slice(0, 60);
    const f = feat.get(p)!, sc = [Infinity, Infinity, Infinity, Infinity], tot = [Infinity, Infinity, Infinity, Infinity];
    for (let j = 0; j < 4; j++) {
      const mem = near.filter((o: any) => o.q.cl === j);
      const ds = mem.map((o: any) => KS.dist(f, feat.get(o.q)!)).sort((a: number, b: number) => a - b).slice(0, 3);
      if (ds.length < 2) continue;
      sc[j] = ds.reduce((s: number, v: number) => s + v, 0) / ds.length;
      // how wide the digit is relative to its height tells ۳ (wide) from ۴ and ۲ even when blur has smeared the inside of the glyph
      const as = mem.map((o: any) => asp(o.q)), mu = as.reduce((s: number, v: number) => s + v, 0) / as.length;
      const sd = Math.max(0.04, Math.sqrt(as.reduce((s: number, v: number) => s + (v - mu) * (v - mu), 0) / as.length)), z = (asp(p) - mu) / sd;
      tot[j] = Math.log(sc[j]) + 0.5 * z * z;
    }
    let best = p.cl; tot.forEach((v, j) => { if (v < tot[best]) best = j; });
    if (best !== p.cl && tot[best] < tot[p.cl] - 1.7) upd.push([p, best]);
  });
  upd.forEach(([p, c]) => { p.cl = c; changed++; });
  return changed;
}
