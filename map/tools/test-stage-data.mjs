/**
 * Structural and historical-safety checks for stage 1–2 browser payloads.
 *
 * These tests intentionally avoid a browser. GPU rendering is covered by the
 * browser smoke test; this file verifies that invalid or unsourced records
 * never reach the map.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const borders = read('data/stage1/historical-borders.geojson');
const routes = read('data/stage2/convoy-routes.json');
const losses = read('data/stage2/naval-losses.json');
const battles = read('data/stage2/battles.json');
const manifest = read('data/stage2/manifest.json');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}\n    ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('\nשלב 1 — גבולות');
test('קיים FeatureCollection עם גבולות רבים', () => {
  assert.equal(borders.type, 'FeatureCollection');
  assert.ok(borders.features.length >= 50);
});
test('כל גבול נושא חלון זמן ומקור', () => {
  for (const feature of borders.features) {
    const p = feature.properties;
    assert.ok(p.day_from <= p.day_to, p.polity_id);
    assert.ok(p.source_ids?.includes('cshapes'), p.polity_id);
    assert.ok(['allied', 'axis', 'neutral'].includes(p.side), p.polity_id);
  }
});
test('קיימות ישויות מכל שלוש קבוצות התצוגה', () => {
  const sides = new Set(borders.features.map((f) => f.properties.side));
  assert.deepEqual([...sides].sort(), ['allied', 'axis', 'neutral']);
});
test('שכבת הגבולות מכסה גם את אמריקה וגם את אסיה', () => {
  const longitudes = [];
  const collect = (value) => {
    if (
      Array.isArray(value)
      && value.length >= 2
      && typeof value[0] === 'number'
      && typeof value[1] === 'number'
    ) {
      longitudes.push(value[0]);
    } else if (Array.isArray(value)) {
      value.forEach(collect);
    }
  };
  borders.features.forEach((feature) => collect(feature.geometry.coordinates));
  assert.ok(Math.min(...longitudes) < -100);
  assert.ok(Math.max(...longitudes) > 120);
});

console.log('\nשלב 2 — הים');
test('נתיבי השיירות ייחודיים ומנותבים', () => {
  const ids = new Set();
  for (const route of routes.routes) {
    assert.ok(!ids.has(route.route_id), route.route_id);
    ids.add(route.route_id);
    assert.ok(route.path.length >= 2, route.route_id);
    assert.ok(route.day_from <= route.day_to, route.route_id);
    assert.equal(route.derivation, 'algorithmic');
    assert.ok(route.source_ids?.length, route.route_id);
    assert.ok(route.origin_name_he, route.route_id);
    assert.ok(route.destination_name_he, route.route_id);
    assert.ok(route.mode, route.route_id);
  }
  assert.ok(routes.routes.length >= 7);
});
test('אבדות הים מתוארכות, ממוקמות ומצוטטות', () => {
  for (const item of losses.losses) {
    assert.ok(Number.isInteger(item.day), item.id);
    assert.ok(item.position[0] >= -180 && item.position[0] <= 180, item.id);
    assert.ok(item.position[1] >= -90 && item.position[1] <= 90, item.id);
    assert.ok(item.source_ids?.length, item.id);
  }
});
test('המדגם כולל את האטלנטי ואת האוקיינוס השקט', () => {
  const theaters = new Set(losses.losses.map((item) => item.theater));
  assert.ok(theaters.has('atlantic'));
  assert.ok(theaters.has('pacific'));
});
test('המניפסט תואם למספר הרשומות', () => {
  assert.equal(manifest.routes, routes.routes.length);
  assert.equal(manifest.losses, losses.losses.length);
  assert.equal(manifest.battles, battles.battles.length);
});

console.log('\nהקשר עולמי — קרבות');
test('כל קרב מתוארך, ממוקם ומצוטט', () => {
  const ids = new Set();
  for (const battle of battles.battles) {
    assert.ok(!ids.has(battle.id), battle.id);
    ids.add(battle.id);
    assert.ok(Number.isInteger(battle.day_from), battle.id);
    assert.ok(Number.isInteger(battle.day_to), battle.id);
    assert.ok(battle.day_from <= battle.day_to, battle.id);
    assert.ok(battle.position[0] >= -180 && battle.position[0] <= 180, battle.id);
    assert.ok(battle.position[1] >= -90 && battle.position[1] <= 90, battle.id);
    assert.ok(battle.source_ids?.length, battle.id);
  }
  assert.ok(battles.battles.length >= 25);
});
test('הקרבות מכסים את אירופה, אסיה והאוקיינוס השקט', () => {
  const theaters = new Set(battles.battles.map((item) => item.theater));
  assert.ok(theaters.has('europe'));
  assert.ok(theaters.has('asia'));
  assert.ok(theaters.has('pacific'));
});

console.log(`\n${passed} בדיקות נתוני שלבים עברו\n`);
