import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

import {
  MAX_RENDER_PIXEL_RATIO,
  TERRAIN_TILE_MAX_ZOOM,
  renderPixelRatio,
  zoomDetailLevel,
} from '../src/core/map-performance.js';
import { BASEMAP_STYLE } from '../src/config.js';

assert.equal(renderPixelRatio(1), 1);
assert.equal(renderPixelRatio(2), MAX_RENDER_PIXEL_RATIO);
assert.equal(renderPixelRatio(Number.NaN), 1);
assert.equal(zoomDetailLevel(2.14), 0);
assert.equal(zoomDetailLevel(2.15), 1);
assert.equal(zoomDetailLevel(9), 8);

const terrainSource = BASEMAP_STYLE.sources['terrain-relief-tiles'];
const terrainLayer = BASEMAP_STYLE.layers.find((layer) => layer.id === 'terrain-relief-map');
const paperLayer = BASEMAP_STYLE.layers.find((layer) => layer.id === 'paper');
assert.match(paperLayer.paint['background-color'], /^#[0-9a-f]{6}$/i);
assert.equal(terrainSource.type, 'raster');
assert.equal(terrainSource.maxzoom, TERRAIN_TILE_MAX_ZOOM);
assert.equal(terrainLayer.type, 'raster');

// ⚠️ ‏מקור בסיס מודרני נושא גבולות ושמות של היום. על אטלס של 1943 זה
// ‏שקר קרטוגרפי, ולכן גם כשיתווסף מקור אריחים הוא לא יהיה מפת רחוב.
for (const source of Object.values(BASEMAP_STYLE.sources)) {
  assert.doesNotMatch(String(source.tiles[0]),
    /labels|street|road|topo|osm|openstreetmap/i,
    'אריחים עם שמות או כבישים מודרניים');
  assert.doesNotMatch(String(source.tiles[0]), /^https?:/,
    'אריחים ממארח מרוחק: המפה תיעלם ברגע שהוא ייחסם');
}

let tileBytes = 0;
let tileCount = 0;
for (let zoom = 0; zoom <= TERRAIN_TILE_MAX_ZOOM; zoom += 1) {
  for (let x = 0; x < 2 ** zoom; x += 1) {
    for (let y = 0; y < 2 ** zoom; y += 1) {
      const url = new URL(`../data/terrain/tiles/${zoom}/${x}/${y}.jpg`, import.meta.url);
      const image = await readFile(url);
      assert.deepEqual([...image.subarray(0, 2)], [0xff, 0xd8]);
      tileBytes += (await stat(url)).size;
      tileCount += 1;
    }
  }
}
assert.equal(tileCount, 341);
assert.ok(tileBytes < 6_000_000, 'terrain tiles should stay lightweight');

// The full-precision CShapes parse is a build input that is not committed (size). When it is present,
// the shipped, rounded borders are checked against it; otherwise only the shipped file is checked.
const canonical = await readFile(new URL(
  '../../data/historical_borders/02_parsed/historical-borders.full-precision.geojson',
  import.meta.url,
)).then(JSON.parse, () => null);
const optimizedUrl = new URL('../data/stage1/historical-borders.geojson', import.meta.url);
const optimizedText = await readFile(optimizedUrl, 'utf8');
const optimized = JSON.parse(optimizedText);
assert.ok(optimized.features.length > 0);
if (canonical) {
  assert.equal(optimized.features.length, canonical.features.length);
  assert.ok(
    optimizedText.length < JSON.stringify(canonical).length * 0.55,
    'rounded borders should be at least 45% smaller',
  );
  assert.deepEqual(
    optimized.features.map((feature) => feature.properties),
    canonical.features.map((feature) => feature.properties),
  );
}

console.log(`Map performance assets passed: ${tileCount} tiles, ${tileBytes} bytes`);
