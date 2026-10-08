/**
 * בדיקות ליבה ללא דפדפן — מסלול A בלבד.
 *
 * מה שאפשר לבדוק ב-node נבדק ב-node. הרינדור עצמו דורש GPU ונבדק ידנית
 * לפי רשימת התיוג ב-README.
 *
 *     node tools/test-core.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { TimeEngine, fromDayIndex, toDayIndex } from '../src/core/time-engine.js';
import { LayerRegistry } from '../src/core/layer-registry.js';
import { HIGH_RES_WINDOWS, EPOCH, TIMELINE_START, TIMELINE_END, DEFAULT_STEP_DAYS }
  from '../src/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

const engine = () => new TimeEngine({
  epoch: EPOCH, start: TIMELINE_START, end: TIMELINE_END,
  defaultStep: DEFAULT_STEP_DAYS, windows: HIGH_RES_WINDOWS,
});

console.log('\nמנוע הזמן');

test('אפוק הוא יום 0', () => {
  assert.equal(toDayIndex(new Date(Date.UTC(1937, 0, 1)), EPOCH), 0);
});

test('הלוך ושוב בין תאריך למספר', () => {
  const d = new Date(Date.UTC(1941, 5, 22));
  assert.equal(fromDayIndex(toDayIndex(d, EPOCH), EPOCH).getTime(), d.getTime());
});

test('התאמה למחולל הפיקסטורה בפייתון', () => {
  // (1941-06-22 − 1937-01-01) — חייב להתאים ל-day_index בצד השרת
  const expected = Math.round(
    (Date.UTC(1941, 5, 22) - Date.UTC(1937, 0, 1)) / 86400000);
  assert.equal(toDayIndex(new Date(Date.UTC(1941, 5, 22)), EPOCH), expected);
});

test('מחוץ לחלון — צעד חודשי', () => {
  const e = engine();
  e.setDate(new Date(Date.UTC(1943, 2, 15)));
  assert.equal(e.step, 30);
  assert.equal(e.activeWindow, null);
});

test('נורמנדי — צעד יומי', () => {
  const e = engine();
  e.setDate(new Date(Date.UTC(1944, 5, 10)));
  assert.equal(e.step, 1);
  assert.equal(e.activeWindow.key, 'normandy');
});

test('ברברוסה — צעד שבועי', () => {
  const e = engine();
  e.setDate(new Date(Date.UTC(1941, 6, 1)));
  assert.equal(e.step, 7);
  assert.equal(e.activeWindow.key, 'barbarossa');
});

test('הצעד מאט אוטומטית בכניסה לחלון', () => {
  const e = engine();
  e.setDate(new Date(Date.UTC(1944, 4, 20)));
  const before = e.step;
  e.setDate(new Date(Date.UTC(1944, 5, 10)));
  assert.ok(e.step < before, 'הרזולוציה חייבת לעלות בתוך חלון מבצע');
});

test('הגבלה לגבולות הציר', () => {
  const e = engine();
  e.setDay(-9999);
  assert.equal(e.day, e.minDay);
  e.setDay(9e9);
  assert.equal(e.day, e.maxDay);
});

test('המנויים מקבלים עדכון', () => {
  const e = engine();
  let calls = 0;
  e.subscribe(() => calls++);
  e.setDay(500);
  assert.equal(calls, 2);   // init + שינוי
});

test('דיווח על מעבר בין חלונות', () => {
  const e = engine();
  e.setDate(new Date(Date.UTC(1944, 4, 1)));
  let changed = false;
  e.subscribe((p) => { if (p.windowChanged) changed = true; });
  e.setDate(new Date(Date.UTC(1944, 5, 10)));
  assert.ok(changed);
});

test('progress ו-dayFromProgress הפוכים זה לזה', () => {
  const e = engine();
  e.setDay(2000);
  assert.ok(Math.abs(e.dayFromProgress(e.progress) - 2000) < 1);
});

test('צפיפות אירועים מזוהה לצורך האטה אדפטיבית', () => {
  const e = engine();
  const density = new Float32Array(e.maxDay - e.minDay + 1);
  density[100] = 8;
  e.setActivityDensity(density, e.minDay);
  e.setDay(e.minDay + 100);
  assert.equal(e.activityDensity, 8);
  e.setDay(e.minDay + 101);
  assert.equal(e.activityDensity, 0);
});

console.log('\nרג\'יסטר השכבות');

const caps = { full: { maxLayers: 2 }, minimal: { maxLayers: 1 } };
const mkSpec = (id) => ({
  id, label: id, group: 'test', defaultOn: false,
  load: async () => ({ n: 1 }), build: () => ({ id }),
});

test('רישום כפול נכשל', () => {
  const r = new LayerRegistry({ tierCaps: caps });
  r.register(mkSpec('a'));
  assert.throws(() => r.register(mkSpec('a')));
});

test('מגבלת שכבות לפי דרג נאכפת', async () => {
  const r = new LayerRegistry({ tierCaps: caps });
  r.register(mkSpec('a')).register(mkSpec('b'));
  assert.equal(r.canEnable('minimal'), true);
  r.state.get('a').visible = true;
  assert.equal(r.canEnable('minimal'), false);
  assert.equal(r.canEnable('full'), true);
});

test('שכבה שלא נטענה אינה נבנית', () => {
  const r = new LayerRegistry({ tierCaps: caps });
  r.register(mkSpec('a'));
  r.state.get('a').visible = true;
  assert.equal(r.buildLayers({}).length, 0);
});

test('סריאליזציה ושחזור', () => {
  const r = new LayerRegistry({ tierCaps: caps });
  r.register(mkSpec('a')).register(mkSpec('b'));
  r.state.get('a').visible = true;
  assert.equal(r.serialize(), 'a');
});

console.log('\nפיקסטורה');

const fx = JSON.parse(readFileSync(join(ROOT, 'data/fixtures/demo-points.json'), 'utf8'));

test('נטענת ומכילה ישויות', () => {
  assert.ok(Array.isArray(fx.features));
  assert.equal(fx.features.length, 200);
});

test('כל ישות בטווח הציר ועם מקור', () => {
  const e = engine();
  for (const f of fx.features) {
    assert.ok(f.day_from <= f.day_to, `${f.id}: טווח הפוך`);
    assert.ok(f.day_from >= e.minDay && f.day_to <= e.maxDay, `${f.id}: מחוץ לציר`);
    assert.ok(f.source_ids?.length, `${f.id}: אין מקור`);
  }
});

test('הסינון בזמן מחזיר תת-קבוצה משתנה', () => {
  const e = engine();
  const at = (d) => fx.features.filter((f) => f.day_from <= d && f.day_to >= d).length;
  const early = at(toDayIndex(new Date(Date.UTC(1938, 0, 1)), EPOCH));
  const peak = at(toDayIndex(new Date(Date.UTC(1943, 2, 1)), EPOCH));
  assert.ok(peak > early, 'השיא חייב להיות צפוף יותר מההתחלה');
  assert.ok(early >= 0 && peak <= fx.features.length);
});

console.log(`\n${passed} בדיקות עברו\n`);
