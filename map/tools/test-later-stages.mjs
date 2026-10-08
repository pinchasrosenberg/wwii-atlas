/**
 * Structural, ethical, and coverage checks for stages 3–8.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const atlas = read('data/stage3-8/atlas.json');
const search = read('data/search/lexical.json');

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

const timedGroups = [
  'supply_routes', 'submarine_patrols', 'railways', 'camps', 'transports',
  'fronts', 'fortifications', 'aid_operations', 'famines', 'refugee_flows',
];

console.log('\nשלבים 3–8 — נתונים ושקיפות');

test('כל קבוצות הנתונים של השלבים המאוחרים קיימות', () => {
  for (const key of [...timedGroups, 'demographics', 'supply_context', 'tour']) {
    assert.ok(Array.isArray(atlas[key]) && atlas[key].length > 0, key);
  }
});

test('כל ישות מתוזמנת נושאת מקור וטווח תקין', () => {
  const known = new Set(atlas.metadata.sources.map((source) => source.id));
  for (const group of timedGroups) {
    for (const item of atlas[group]) {
      assert.ok(Number.isInteger(item.day_from), `${group}/${item.id}`);
      assert.ok(Number.isInteger(item.day_to), `${group}/${item.id}`);
      assert.ok(item.day_from <= item.day_to, `${group}/${item.id}`);
      assert.ok(item.source_ids?.length, `${group}/${item.id}`);
      assert.ok(item.source_ids.every((id) => known.has(id)), `${group}/${item.id}`);
    }
  }
});

test('כל טרנספורט מנותב על מסלול רב-נקודתי ומסומן כהסקה', () => {
  for (const item of atlas.transports) {
    assert.ok(item.path.length >= 3, item.id);
    assert.equal(item.derivation, 'algorithmic', item.id);
    assert.ok(item.coverage_he.includes('מייצג'), item.id);
  }
});

test('חזיתות משוחזרות מסומנות בנפרד ממפות מצב', () => {
  const values = new Set(atlas.fronts.map((item) => item.confidence));
  assert.ok(values.has('reconstruction'));
  assert.ok(values.has('primary_map'));
});

test('מצב מדוע מקשר קרבות לנתיבים ומסמן גזירה אלגוריתמית', () => {
  for (const item of atlas.supply_context) {
    assert.ok(item.battle_id);
    assert.ok(item.route_ids.length);
    assert.equal(item.derivation, 'algorithmic');
    assert.ok(item.bottleneck_note_he);
  }
});

test('סיור מודרך כולל לפחות עשר תחנות עולמיות', () => {
  assert.ok(atlas.tour.length >= 10);
  assert.ok(atlas.tour.every((item) => Number.isInteger(item.day)));
  assert.ok(atlas.tour.some((item) => item.view.longitude > 80));
  assert.ok(atlas.tour.some((item) => item.view.longitude < -20));
});

test('אינדקס החיפוש מכיל תעתיקים היסטוריים', () => {
  assert.ok(search.docs.length >= 50);
  const lviv = search.docs.find((doc) => doc.ref === 'place:lviv');
  assert.ok(lviv);
  assert.ok(lviv.alt.includes('Lemberg'));
  assert.ok(search.terms['למברג']?.includes(search.docs.indexOf(lviv)));
});

test('אין נתון דמוגרפי מומצא במקום שבו האימות ממתין', () => {
  for (const place of atlas.demographics) {
    for (const record of place.records) {
      if (record.confidence?.startsWith('pending')) {
        assert.equal(record.breakdown.length, 0, `${place.id}/${record.as_of}`);
      }
    }
  }
});

console.log(`\n${passed} בדיקות שלבים 3–8 עברו\n`);

