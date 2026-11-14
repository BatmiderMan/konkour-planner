import assert from 'node:assert/strict';
import { DEFAULT_BEAST, awayLevel, buildParts, creditedMs, flushPresence, freshPres, newPart, nextStreak, emptyStreak, normalizeSettings, partPct, phaseOf, plannedMs, reportTimes, stepPresence, summarizeDay, verdictFor, applyCredits, requiredMs } from '../../src/beast/beastRules';
import { classify, foreground, frameDiff, majority, makeBackground, meanLuma, blobOfBox, yawOf, Baseline } from '../../src/beast/frameAnalysis';
import { DEFAULT_SCHEDULE, cloneDefaultSchedule } from '../../src/plannerSchedule';

let n = 0; const t = (name: string, f: () => void) => { f(); n++; console.log('ok', name); };
const G = 10000;

t('present time is credited fully', () => {
  const r = stepPresence(freshPres(), 'present', 1000, G);
  assert.equal(r.credits.present, 1000);
});
t('short absence inside grace is forgiven on return', () => {
  let st = freshPres(); let present = 0, away = 0;
  for (let i = 0; i < 6; i++) { const r = stepPresence(st, 'away', 1000, G); st = r.st; away += r.credits.away; present += r.credits.present; }
  assert.equal(away, 0); // 6 s pending
  const r = stepPresence(st, 'present', 1000, G); present += r.credits.present; st = r.st;
  assert.equal(present, 7000); assert.equal(st.badKind, null);
});
t('absence longer than grace counts the WHOLE stretch from the moment of leaving', () => {
  let st = freshPres(); let away = 0, present = 0;
  for (let i = 0; i < 12; i++) { const r = stepPresence(st, 'away', 1000, G); st = r.st; away += r.credits.away; present += r.credits.present; }
  assert.equal(away, 12000); assert.equal(present, 0);
  const r = stepPresence(st, 'present', 1000, G);
  assert.equal(r.credits.present, 1000); // after it counted, return gives only the new second
});
t('distracted vs away buckets', () => {
  let st = freshPres(); let d = 0, a = 0;
  for (let i = 0; i < 12; i++) { const r = stepPresence(st, 'distracted', 1000, G); st = r.st; d += r.credits.distracted; a += r.credits.away; }
  assert.equal(d, 12000); assert.equal(a, 0);
});
t('blind (camera cannot say) is unverified and keeps a pending absence pending', () => {
  let st = freshPres();
  st = stepPresence(st, 'away', 3000, G).st;
  const r = stepPresence(st, 'blind', 2000, G);
  assert.equal(r.credits.unverified, 2000); assert.equal(r.st.badMs, 3000);
});
t('flush forgives a pending absence inside grace only', () => {
  assert.equal(flushPresence({ badKind: 'away', badMs: 4000 }, G).present, 4000);
  assert.equal(flushPresence({ badKind: 'away', badMs: 15000 }, G).present, 0);
});
t('awayLevel escalates', () => {
  assert.equal(awayLevel(freshPres(), G), 0);
  assert.equal(awayLevel({ badKind: 'away', badMs: 3000 }, G), 0);
  assert.equal(awayLevel({ badKind: 'away', badMs: 6000 }, G), 1);
  assert.equal(awayLevel({ badKind: 'away', badMs: 11000 }, G), 2);
});

const item = (id: string, subject = 'ریاضی', extra: any = {}) => ({ id, subject, detail: '', grade: 'دوازدهم' as const, done: false, ...extra });
t('score: credited / (planned - excused); unverified earns half', () => {
  const p = newPart(item('a'), 480, 540); // 60 min
  applyCredits(p, { present: 30 * 60000, away: 20 * 60000, distracted: 0, unverified: 10 * 60000 });
  assert.equal(plannedMs(p), 3600000);
  assert.equal(creditedMs(p), 35 * 60000);
  assert.equal(partPct(p), 58);
  p.excusedMs = 2 * 60000;
  assert.equal(requiredMs(p), 58 * 60000);
});
t('missed part scores 0 and report minutes follow credited time', () => {
  const p = newPart(item('a'), 480, 540); p.status = 'missed';
  assert.equal(partPct(p), 0);
  const q = newPart(item('b'), 600, 660); q.presentMs = 45 * 60000;
  const rt = reportTimes(q);
  assert.deepEqual(rt, { start: '10:00', end: '10:45', minutes: 45 });
  q.presentMs = 90 * 60000; assert.equal(reportTimes(q).minutes, 60); // never more than planned
});
t('buildParts lays cards out like the planner, drops done and past ones', () => {
  const s = cloneDefaultSchedule(); // 60 min parts, 10 min break, window 08:00–20:00
  const items = [item('1'), item('2'), item('3', 'x', { done: true }), item('4')];
  const key = '1405/08/23';
  const all = buildParts(items, key, s, undefined, -1);
  assert.equal(all.length, 3); assert.equal(all[0].startMin, 480); assert.equal(all[0].endMin, 540);
  assert.equal(all[1].startMin, 550); assert.ok(all.every((p) => p.status === 'pending'));
  const late = buildParts(items, key, s, undefined, 560); // 09:20: first part is over, second (09:10-10:10) still counts
  assert.deepEqual(late.map((p) => p.id), ['2', '4']);
});
t('overlapping pinned cards: the earlier part ends where the next begins', () => {
  const s = cloneDefaultSchedule();
  const items = [item('1', 'a', { start: '08:00' }), item('2', 'b', { start: '08:40' })];
  const ps = buildParts(items, '1405/08/23', s, undefined, -1);
  assert.equal(ps[0].endMin, 520); assert.equal(ps[1].startMin, 520 + 0 || 520);
});
t('summarizeDay + verdict + streak', () => {
  const a = newPart(item('a'), 480, 540); a.status = 'done'; a.presentMs = 57 * 60000;
  const b = newPart(item('b', 'فیزیک'), 550, 610); b.status = 'missed';
  const sum = summarizeDay({ dateKey: '1405/08/23', signedAt: 0, closed: false, parts: [a, b] });
  assert.equal(sum.pct, Math.round((57 / 120) * 100)); assert.equal(sum.missed, 1);
  assert.equal(sum.bestId, 'a'); assert.equal(sum.worstId, 'b');
  assert.equal(verdictFor(97).tone, 'gold'); assert.equal(verdictFor(60).tone, 'bad'); assert.equal(verdictFor(10).tone, 'fail');
  let s = emptyStreak();
  s = nextStreak(s, 'd1', 90, 85, false); assert.equal(s.count, 1);
  s = nextStreak(s, 'd2', 88, 85, true); assert.equal(s.count, 2);
  s = nextStreak(s, 'd4', 95, 85, false); assert.equal(s.count, 1); assert.equal(s.best, 2); // a skipped day breaks it
  s = nextStreak(s, 'd5', 40, 85, true); assert.equal(s.count, 0); assert.equal(s.best, 2);
});
t('phaseOf & settings normalisation', () => {
  assert.equal(phaseOf(100, 200, 50), 'before'); assert.equal(phaseOf(100, 200, 100), 'running'); assert.equal(phaseOf(100, 200, 200), 'after');
  const s = normalizeSettings({ graceSec: 9999, camera: 'x', minPct: -5, on: 1 });
  assert.equal(s.graceSec, 120); assert.equal(s.minPct, 10); assert.equal(s.on, true); assert.equal(s.camera, true);
  assert.deepEqual(normalizeSettings(null), DEFAULT_BEAST);
});

// ---- frame analysis on synthetic scenes (80x60): a beige wall, a person with hair, face, neck and a shirt
const W = 80, H = 60;
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
type RGB = [number, number, number];
interface Person { cx: number; headY: number; scale: number; skin: RGB; shirt: RGB; hair: RGB }
function scene(wall: RGB, person?: Person, gain = 1, noise = 3): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let c: RGB = [wall[0] - y * 0.25, wall[1] - y * 0.25, wall[2] - y * 0.2]; // soft gradient
    if (person) {
      const { cx, headY, scale: s } = person;
      const hx = (x - cx) / (9 * s), hy = (y - headY) / (12 * s);
      if (hx * hx + hy * hy < 1) c = hy < -0.35 ? person.hair : person.skin; // head: hair on top, face below
      else if (Math.abs(x - cx) < 3 * s && y > headY + 11 * s && y < headY + 16 * s) c = person.skin; // neck
      else if (y > headY + 15 * s && Math.abs(x - cx) < 20 * s + (y - headY - 15 * s) * 0.5) c = person.shirt; // shoulders
    }
    for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, c[k] * gain + (rnd() - 0.5) * 2 * noise));
    d[i + 3] = 255;
  }
  return d;
}
const WALLS: Record<string, RGB> = { beige: [205, 175, 145], white: [225, 225, 230], dark: [60, 62, 70], skinLike: [214, 168, 140] };
const PEOPLE: Record<string, Person> = {
  light: { cx: 40, headY: 24, scale: 1, skin: [236, 190, 160], shirt: [40, 60, 120], hair: [50, 35, 25] },
  tan: { cx: 40, headY: 24, scale: 1, skin: [190, 135, 100], shirt: [200, 200, 200], hair: [20, 15, 10] },
  dark: { cx: 40, headY: 24, scale: 1, skin: [110, 70, 50], shirt: [150, 30, 40], hair: [15, 10, 8] }
};
const room = (wall: RGB, gain = 1) => makeBackground([0, 1, 2, 3, 4, 5].map(() => scene(wall, undefined, gain)), W, H)!;
function baselineOf(bg: any, p: Person): Baseline {
  const f = foreground(scene(WALLS.beige, p), W, H, bg); const b = f.blob!;
  return { kind: 'silhouette', area: b.area, cx: b.cx, cy: b.cy, top: b.top };
}
for (const wallName of ['beige', 'white', 'dark', 'skinLike']) for (const pName of Object.keys(PEOPLE)) {
  t(`silhouette: ${pName} skin in front of a ${wallName} wall → present / away / distracted`, () => {
    const wall = WALLS[wallName]; const bg = room(wall); const p = PEOPLE[pName];
    const sit = foreground(scene(wall, p), W, H, bg); assert.ok(sit.blob && sit.blob.area > 0.08, 'student found, area ' + sit.blob?.area);
    const base: Baseline = { kind: 'silhouette', area: sit.blob!.area, cx: sit.blob!.cx, cy: sit.blob!.cy, top: sit.blob!.top };
    const obs = (person?: Person, gain = 1) => classify(foreground(scene(wall, person, gain), W, H, bg).blob, base);
    assert.equal(obs(p), 'present');
    assert.equal(obs({ ...p, cx: 42, headY: 25 }), 'present'); // small natural movement is fine
    assert.equal(obs({ ...p, scale: 1.2, headY: 23 }), 'present'); // leaning toward the screen
    assert.equal(obs(undefined), 'away'); // empty chair
    assert.equal(obs({ ...p, cx: 62 }), 'distracted'); // slid far to the side
    assert.equal(obs({ ...p, headY: 38 }), 'distracted'); // head down / slumped
    assert.notEqual(obs({ ...p, scale: 0.45, headY: 38 }), 'present'); // tiny and low: slumped far away
  });
}
t('silhouette: a face the same colour as the wall (hair + shirt only) still works, head down is noticed through the hair line', () => {
  const wall: RGB = [205, 175, 145]; const bg = room(wall);
  const p: Person = { cx: 40, headY: 24, scale: 1, skin: [207, 176, 146], shirt: [40, 60, 120], hair: [50, 35, 25] };
  const sit = foreground(scene(wall, p), W, H, bg).blob!; assert.ok(sit && sit.area > 0.08);
  const base: Baseline = { kind: 'silhouette', area: sit.area, cx: sit.cx, cy: sit.cy, top: sit.top };
  const obs = (q?: Person) => classify(foreground(scene(wall, q), W, H, bg).blob, base);
  assert.equal(obs(p), 'present'); assert.equal(obs(undefined), 'away');
  assert.equal(obs({ ...p, headY: 38 }), 'distracted');
  assert.equal(obs({ ...p, cx: 64 }), 'distracted');
});
t('silhouette is robust to auto-exposure: the same scene 25% brighter / darker', () => {
  const wall = WALLS.beige; const bg = room(wall); const p = PEOPLE.light;
  const base = baselineOf(bg, p);
  for (const g of [0.78, 0.88, 1.12, 1.25]) {
    assert.equal(classify(foreground(scene(wall, p, g), W, H, bg).blob, base), 'present', 'present at gain ' + g);
    assert.equal(classify(foreground(scene(wall, undefined, g), W, H, bg).blob, base), 'away', 'empty at gain ' + g);
  }
});
t('background capture refuses a scene with somebody moving in it; camera moved → almost everything is foreground', () => {
  const frames = [0, 1, 2, 3, 4, 5].map((i) => scene(WALLS.beige, { ...PEOPLE.light, cx: 20 + i * 8 }));
  assert.equal(makeBackground(frames, W, H), null);
  const bg = room(WALLS.beige);
  const moved = foreground(scene(WALLS.dark, PEOPLE.tan), W, H, bg);
  assert.ok(moved.frac > 0.8, 'frac ' + moved.frac);
});
t('face boxes: present / far / turned (yaw) / dropped', () => {
  const base: Baseline = { kind: 'face', area: 0.1, cx: 0.5, cy: 0.45, top: 0.3 };
  const box = (x: number, y: number, w: number, h: number, yaw?: number) => blobOfBox(x * 640, y * 480, w * 640, h * 480, 640, 480, yaw);
  assert.equal(classify(box(0.35, 0.3, 0.3, 0.33, 0.05), base), 'present');
  assert.equal(classify(box(0.42, 0.4, 0.15, 0.17, 0.0), base), 'distracted'); // much smaller
  assert.equal(classify(box(0.35, 0.3, 0.3, 0.33, 0.8), base), 'distracted'); // turned away
  assert.equal(classify(box(0.35, 0.3, 0.3, 0.33, -0.7), base), 'distracted');
  assert.equal(classify(box(0.35, 0.55, 0.3, 0.33, 0), base), 'distracted'); // dropped
  assert.equal(classify(null, base), 'away');
  assert.ok(Math.abs(yawOf({ x: 0.4 }, { x: 0.6 }, { x: 0.5 })) < 1e-9);
  assert.ok(yawOf({ x: 0.4 }, { x: 0.6 }, { x: 0.62 }) > 0.5);
});
t('dark frame and frozen frames', () => {
  assert.ok(meanLuma(scene([5, 5, 5], undefined, 1, 0)) < 22);
  const a = scene(WALLS.beige, PEOPLE.light);
  assert.equal(frameDiff(a, new Uint8ClampedArray(a)), 0);
  assert.ok(frameDiff(a, scene(WALLS.beige)) > 5);
});
t('majority vote smooths one bad frame', () => {
  assert.equal(majority(['present', 'present', 'away', 'present', 'present']), 'present');
  assert.equal(majority([]), 'blind');
});
console.log(`\n${n} tests passed`);
