import assert from 'node:assert/strict';
import { ViewportDataClient, mapBoundsArray } from '../src/core/viewport-data.js';

let calls = 0;
globalThis.fetch = async () => {
  calls++;
  return new Response(JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'r1',
      geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] },
      properties: { id: 'r1', name_he: 'נתיב' },
    }],
    meta: { count: 1, truncated: false },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const client = new ViewportDataClient();
const query = {
  layer: 'railways',
  bbox: [-10, 30, 40, 70],
  zoom: 5,
  day: 2700,
};
const first = await client.query(query);
const second = await client.query(query);
assert.deepEqual(first.items[0].path, [[1, 2], [3, 4]]);
assert.equal(second.items[0].name_he, 'נתיב');
assert.equal(calls, 1, 'שאילתה זהה צריכה להגיע מהמטמון');

assert.deepEqual(mapBoundsArray({
  getWest: () => -220,
  getEast: () => 220,
  getSouth: () => -100,
  getNorth: () => 100,
}), [-180, -90, 180, 90]);

globalThis.fetch = async () => new Response('missing', { status: 503 });
const unavailable = await new ViewportDataClient().query({
  ...query,
  layer: 'battles',
});
assert.equal(unavailable, null);

console.log('3/3 viewport database client tests passed');
