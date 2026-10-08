import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const meta = JSON.parse(await readFile(new URL('../data/terrain/terrain.meta.json', import.meta.url)));
const image = await readFile(new URL('../data/terrain/natural-earth-2-relief.jpg', import.meta.url));
// The raw Natural Earth download and the linked build are not committed (size); when present they are
// cross-checked, otherwise the shipped asset is still verified against its own metadata.
const optional = (rel) => readFile(new URL(rel, import.meta.url)).then(JSON.parse, () => null);
const source = await optional('../../data/terrain/01_raw_downloads/source.manifest.json');
const linked = await optional('../../data/terrain/04_linked_build/terrain.meta.json');

assert.equal(meta.temporal_semantics, 'physical_context_stable_1939_1946');
assert.equal(meta.valid_from, '1939-01-01');
assert.equal(meta.valid_to, '1946-12-31');
assert.deepEqual(meta.bounds, [-180, -85, 180, 85]);
assert.deepEqual([...image.subarray(0, 2)], [0xff, 0xd8], 'terrain asset must be a JPEG');
assert.equal(createHash('sha256').update(image).digest('hex'), meta.asset_sha256);
if (source && linked) {
  assert.equal(source.source_id, meta.source_ids[0]);
  assert.equal(source.license, 'public_domain');
  assert.match(source.source_url, /^https:\/\/naturalearth\.s3\.amazonaws\.com\//);
  assert.equal(source.raw_sha256, linked.raw_sha256);
  assert.equal(linked.asset_sha256, meta.asset_sha256);
  assert.equal(linked.temporal_semantics, meta.temporal_semantics);
}

console.log('Terrain provenance, time semantics and asset checksum passed');
