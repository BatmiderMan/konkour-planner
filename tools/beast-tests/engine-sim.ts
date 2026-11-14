import assert from 'node:assert/strict';
// ---- browser stubs
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = String(v); }, removeItem: (k: string) => { delete store[k]; }, key: (i: number) => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length; } };
(globalThis as any).window = Object.assign(globalThis, { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
(globalThis as any).document = { hidden: false, visibilityState: 'visible', hasFocus: () => true, addEventListener() {}, body: { classList: { toggle() {}, remove() {} } } };
Object.defineProperty(globalThis, 'navigator', { value: { vibrate() { return true; } }, configurable: true });
(globalThis as any).Storage = class {};

let T = Date.now();
Date.now = () => T;

(async () => {
  const rules = await import('../../src/beast/beastRules');
  const st = await import('../../src/beast/beastStore');
  const eng = await import('../../src/beast/beastEngine');
  const lp = await import('../../src/livePlan');
  const { savePlannerData, loadPlannerData } = await import('../../src/plannerStore');

  const saved: any[] = []; const notes: string[] = [];
  eng.setEngineEnv({ save: (d, i, b) => saved.push({ d, i, b }), notify: (t) => notes.push(t) });
  st.setBeastSettings({ on: true, camera: false, graceSec: 10, excuseSec: 120, maxExcuses: 2, doneAtPct: 70 });

  const key = eng.todayKey();
  const mk = (id: string, subject: string) => ({ id, subject, detail: 'فصل ۱', grade: 'دوازدهم' as const, done: false });
  const data = loadPlannerData(); data.items[key] = [mk('p1', 'ریاضی'), mk('p2', 'فیزیک'), mk('p3', 'شیمی')]; savePlannerData(data);
  const parts = [rules.newPart(mk('p1', 'ریاضی'), 600, 660), rules.newPart(mk('p2', 'فیزیک'), 670, 730), rules.newPart(mk('p3', 'شیمی'), 740, 800)];
  st.signDay(key, parts);
  assert.equal(st.isDayLocked(key), true);
  const day = () => st.getDay(key)!;

  // ---- part 1: on time, one 14 s absence
  const a1 = eng.absMs(600), b1 = eng.absMs(660);
  T = a1 - 5000; eng.tick(T); assert.equal(day().parts[0].status, 'pending');
  T = a1 + 500; eng.tick(T);
  assert.equal(day().parts[0].status, 'running'); assert.equal(day().parts[0].lateSec, 0);
  const live = lp.getLivePlan()!; assert.ok(live.beast && live.beast.partId === 'p1');
  assert.equal(live.plannedSeconds, 3600);
  // pause / extend are refused for a Beast part
  lp.pauseLivePlan(); lp.extendLivePlan(5); assert.equal(lp.getLivePlan()!.running, true); assert.equal(lp.getLivePlan()!.extraSeconds, 0);
  for (let i = 0; i < 20; i++) { T += 1000; eng.tick(T); }
  eng.pageLeft();
  for (let i = 0; i < 14; i++) { T += 1000; eng.tick(T); }
  assert.equal(eng.getAlarmLevel(), 2);
  eng.pageBack();
  assert.equal(eng.getAlarmLevel(), 2); // level resets on the next present tick
  T += 1000; eng.tick(T);
  assert.equal(day().parts[0].awayMs, 14000 + 0); // whole stretch counted once it passed the grace period (pageBack tick included)
  while (T < b1 - 1000) { T += 1000; eng.tick(T); }
  T = b1; eng.tick(T);
  const p1 = day().parts[0];
  assert.equal(p1.status, 'done'); assert.equal(lp.getLivePlan(), null, 'live session ended by itself');
  assert.ok(rules.partPct(p1) >= 99, 'pct ' + rules.partPct(p1));
  assert.equal(saved.length, 1); assert.equal(saved[0].b.start, '10:00'); assert.equal(saved[0].b.study, true);
  assert.ok(/^(10:5\d|11:00)$/.test(saved[0].b.end), saved[0].b.end);
  assert.equal(loadPlannerData().items[key][0].done, true, 'card ticked done (≥ 70%)');

  // ---- part 2: the student shows up 90 s late (app was closed) and takes an excused break
  const a2 = eng.absMs(670), b2 = eng.absMs(730);
  T = a2 + 90000; eng.tick(T);
  const p2 = day().parts[1]; assert.equal(p2.status, 'running'); assert.equal(p2.lateSec, 90); assert.ok(p2.awayMs >= 90000);
  assert.ok(lp.getLivePlan()!.beast!.partId === 'p2');
  assert.equal(eng.startExcuse(), true);
  for (let i = 0; i < 60; i++) { T += 1000; eng.tick(T); }
  assert.equal(p2.excusedMs, 60000); const presentBefore = p2.presentMs;
  eng.endExcuse(); assert.equal(p2.excuseOn, false);
  assert.equal(eng.startExcuse(), true); eng.endExcuse(); assert.equal(eng.startExcuse(), false, 'only 2 excuses per part');
  for (let i = 0; i < 5; i++) { T += 1000; eng.tick(T); }
  assert.ok(p2.presentMs > presentBefore);
  T = b2 + 1; eng.tick(T);
  assert.equal(p2.status, 'done');
  assert.ok(rules.partPct(p2) < 100 && rules.partPct(p2) > 90);
  assert.equal(saved.length, 2);

  // ---- part 3: nobody opened the app at all → missed, day closes
  T = eng.absMs(800) + 5000; eng.tick(T);
  assert.equal(day().parts[2].status, 'missed');
  assert.equal(day().closed, true);
  const b = st.getBeast();
  assert.equal(b.unseen, key); const sum = b.history[key];
  assert.equal(sum.missed, 1); assert.ok(sum.pct > 50 && sum.pct < 75, 'day pct ' + sum.pct);
  assert.equal(b.streak.count, 0, 'a day under the threshold does not start a streak');
  assert.equal(saved.length, 2, 'missed part adds nothing to the report');
  assert.equal(st.isDayLocked(key), false);
  st.ackVerdict(); assert.equal(st.getBeast().unseen, '');
  // run state survives a reload (persisted) and the settings key is separate
  st.persistRunNow(); assert.ok(JSON.parse(store['planex_beast_run_v1']).days[key].closed === true); assert.ok(JSON.parse(store['planex_beast_v1']).history[key]);
  console.log('ENGINE SIMULATION OK', { pct1: rules.partPct(p1), pct2: rules.partPct(p2), day: sum.pct, notes: notes.length });
})().catch((e) => { console.error(e); process.exit(1); });
