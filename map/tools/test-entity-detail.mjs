import assert from 'node:assert/strict';
import {
  NO_FIGURE, branchText, detailFields, participantLine, quantityText, selectionFields,
} from '../src/ui/entity-detail.js';

// -- numbers that do not exist -----------------------------------------------
//
// ‏מספרי כוח אדם קיימים ל-308 מצבי כוח בלבד בכל הגרף. הכלל היחיד שחייב
// ‏להחזיק: חוסר נתון מוצג כ״לא נרשם״ ולעולם לא כאפס.
assert.equal(quantityText(null, null), NO_FIGURE);
assert.equal(quantityText(0, 0), '0', 'a real zero is still a number');
assert.equal(quantityText(12000, 15000), '12,000–15,000');
assert.equal(quantityText(300, 300), '300');
assert.equal(quantityText(null, 500), 'עד 500');
assert.equal(quantityText(500, null), '500');

assert.equal(branchText('armor', 'name_pattern'), 'שריון (זוהה מהשם)');
assert.equal(branchText('armor', 'source'), 'שריון');
assert.equal(branchText(null, 'source'), null);
assert.equal(branchText('flame_troops', 'source'), null, 'an unknown branch is not invented');

// -- a battle ----------------------------------------------------------------
{
  const detail = {
    kind: 'battle',
    participants: [
      { name: '5th Panzer Division', nation: 'Germany', echelon: 'division',
        branch: 'armor', branch_basis: 'name_pattern',
        strength: { min: 12000, max: 14000 }, equipment: [] },
      { name: '13th Army', nation: 'Soviet Union', echelon: 'army',
        strength: null, equipment: [] },
    ],
    counts: { units: 2, with_manpower: 1 },
    notes: ['1 מתוך 2 יחידות עם מספר כוח אדם; לשאר אין תצפית כזאת בגרף'],
  };
  const fields = detailFields(detail);
  const byLabel = (label) => fields.find((f) => f.label === label);
  assert.equal(byLabel('יחידות שהשתתפו').value, '2');

  const strength = byLabel('כוח אדם מדווח');
  assert.equal(strength.value, '12,000–14,000');
  assert.ok(strength.note.includes('1 מתוך 2'),
    'a partial sum must say how partial it is');

  const german = fields.find((f) => String(f.value).includes('5th Panzer'));
  assert.ok(german.value.includes('שריון (זוהה מהשם)'));
  assert.ok(german.note.includes('12,000'));

  const soviet = fields.find((f) => String(f.value).includes('13th Army'));
  assert.equal(soviet.note, null, 'a unit with no figure gets no invented one');
  assert.ok(fields.some((f) => f.label === 'שקיפות'));
}
{
  // a battle where nothing is counted still reports the participants
  const fields = detailFields({
    kind: 'battle',
    participants: [{ name: 'X', strength: null, equipment: [] }],
    notes: ['לאף אחת מהיחידות בקרב הזה אין תצפית כוח אדם בגרף'],
  });
  assert.ok(!fields.some((f) => f.label === 'כוח אדם מדווח'),
    'no total is shown when nothing was counted');
  assert.ok(fields.some((f) => String(f.value).includes('אין תצפית כוח אדם')));
}
{
  const many = Array.from({ length: 40 }, (_, i) => ({ name: `U${i}`, strength: null }));
  const fields = detailFields({ kind: 'battle', participants: many, notes: [] });
  assert.ok(fields.some((f) => String(f.value).includes('ועוד 16 יחידות')));
}

// -- a unit ------------------------------------------------------------------
{
  const fields = detailFields({
    kind: 'unit', found: true, name: '3rd US Armored Division',
    nation: 'United States', echelon: 'division',
    branch: 'armor', branch_basis: 'name_pattern',
    manpower: [{ min: 14000, max: 14000, observed_on: '1944-12-16' }],
    equipment: [{ name: 'M4 Sherman', min: 232, max: 232, observed_on: '1944-12-16' }],
    battles: [{ name: 'קרב הבליטה', from: '1944-12-16' }],
    notes: [],
  });
  assert.ok(fields.some((f) => f.label.startsWith('כוח אדם') && f.value === '14,000'));
  assert.ok(fields.some((f) => String(f.value).includes('M4 Sherman: 232')));
  assert.ok(fields.some((f) => f.value === 'קרב הבליטה'));
  const branch = fields.find((f) => f.label === 'ענף');
  assert.equal(branch.derivation, 'algorithmic', 'a detected branch is not a source claim');
}
{
  const fields = detailFields({ kind: 'unit', found: false, notes: [] });
  assert.deepEqual(fields, [{ label: 'שקיפות', value: 'היחידה אינה בגרף' }]);
}
assert.deepEqual(detailFields(null), [], 'no payload yet is not an empty card of zeros');

// -- a polygon selection -----------------------------------------------------
{
  const fields = selectionFields({
    count: 12, by_kind: { Unit: 9, Battle: 3 }, by_side: { axis: 7, allies: 5 },
    by_quality: { explicit: 8, estimated: 4 }, reconstructed: 4, sources: 6,
    strength: { units: 2, min: 20000, max: 26000 }, items: [], notes: ['הערה'],
  });
  const byLabel = (l) => fields.find((f) => f.label === l);
  assert.equal(byLabel('פריטים בבחירה').value, '12');
  assert.ok(byLabel('לפי סוג').value.includes('Unit: 9'));
  assert.equal(byLabel('כוח אדם מדווח').value, '20,000–26,000');
  assert.ok(byLabel('כוח אדם מדווח').note.includes('2 יחידות'));
  assert.equal(byLabel('שחזור').value, '4 מתוך 12');
}
{
  const fields = selectionFields({ count: 0, by_kind: {}, by_side: {}, by_quality: {},
    reconstructed: 0, sources: 0, strength: null, items: [], notes: [] });
  assert.equal(fields.length, 1);
  assert.ok(fields[0].value.includes('אין פריטים'));
}
assert.deepEqual(selectionFields(null), []);

console.log('test-entity-detail.mjs ✓');
