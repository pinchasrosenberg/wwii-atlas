import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EntityRelationsClient } from '../src/core/network-store.js';

const entities = JSON.parse(await readFile(
  new URL('../data/network/entities.json', import.meta.url),
  'utf8',
)).entities;
const relations = JSON.parse(await readFile(
  new URL('../data/network/relations.json', import.meta.url),
  'utf8',
)).relations;

const ids = new Set(entities.map((item) => item.id));
assert.equal(ids.size, entities.length, 'מזהי ישויות חייבים להיות ייחודיים');
assert.ok(ids.has('factory:detroit-arsenal'));
assert.ok(ids.has('port:new-york'));
assert.ok(ids.has('headquarters:shaef-logistics'));
assert.ok(ids.has('battle:normandy'));
assert.ok(ids.has('route:HX'));

for (const entity of entities) {
  assert.ok(['real', 'mixed', 'mock'].includes(entity.data_status));
  assert.ok(entity.source_ids?.length, `מקור חסר ל-${entity.id}`);
  assert.ok(Array.isArray(entity.position), `מיקום חסר ל-${entity.id}`);
}

for (const relation of relations) {
  assert.ok(ids.has(relation.from_id), `מקור קשר לא קיים: ${relation.id}`);
  assert.ok(ids.has(relation.to_id), `יעד קשר לא קיים: ${relation.id}`);
  assert.ok(relation.source_ids?.length, `מקור חסר לקשר ${relation.id}`);
  assert.ok(relation.path?.length >= 2, `מסלול חסר לקשר ${relation.id}`);
  assert.notEqual(relation.data_status, 'real', 'קשרי העיצוב אינם רשאים להיראות אמיתיים');
}

assert.deepEqual(
  [...new Set(relations.map((item) => item.chain_id))].sort(),
  ['chain:atlantic-normandy', 'chain:persian-stalingrad'],
);

let calls = 0;
globalThis.fetch = async (url) => {
  calls++;
  if (String(url).includes('/relations?')) {
    return new Response(JSON.stringify({ relations: [relations[0]], count: 1 }), { status: 200 });
  }
  return new Response(JSON.stringify({ entity: entities[0] }), { status: 200 });
};

const client = new EntityRelationsClient({ endpoint: '/api/entities' });
assert.equal((await client.entity(entities[0].id, { includeMock: true })).id, entities[0].id);
assert.equal((await client.relations(entities[0].id, { day: 2713, includeMock: true })).count, 1);
assert.equal(calls, 2);

console.log('Supply network data, provenance and API client tests passed');
