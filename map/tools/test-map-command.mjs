import assert from 'node:assert/strict';
import { MapCommandClient, featureBudget } from '../src/core/map-command-client.js';
import { createSceneOverlayLayer } from '../src/layers/scene-overlay.js';

// -- deck.gl stand-ins -------------------------------------------------------
class FakeLayer {
  constructor(props) { Object.assign(this, props); this.kind = this.constructor.name; }
}
class ScatterplotLayer extends FakeLayer {}
class PathLayer extends FakeLayer {}
class TextLayer extends FakeLayer {}
class IconLayer extends FakeLayer {}
class PolygonLayer extends FakeLayer {}
class TripsLayer extends FakeLayer {}
// the symbol cache paints to a canvas; node has none
globalThis.document = globalThis.document || {
  createElement: () => ({ width: 0, height: 0,
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
    toDataURL: () => 'data:image/png;base64,' }),
};

const SCENE = {
  version: 'ww2-atlas.map-scene.v1',
  scene_id: 'scn_abc123',
  status: 'ready',
  title_he: 'קרב קורסק — 1943-07-07',
  temporal: { day: 2378, date: '1943-07-07', precision: 'day' },
  camera: { strategy: 'fit_bounds', bounds: [35.5, 51.1, 36.7, 52.3], max_zoom: 8 },
  active_layers: ['battles', 'scene-overlay'],
  counts: { features: 3, located: 2, unlocated: 1, sources: 4 },
  presentation: { color_by: 'side', label_by: 'name', size_by: 'echelon' },
};

const FEATURES = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'battle:wd:Q130861',
      geometry: { type: 'Point', coordinates: [36.1, 51.7] },
      properties: { entity_id: 'battle:wd:Q130861', entity_kind: 'Battle',
        name: 'קרב קורסק', group_id: 'events', quality: 'explicit',
        style_token: 'event.battle', source_ids: ['wd:Q130861'] } },
    { type: 'Feature', id: 'unit:1',
      geometry: { type: 'Point', coordinates: [36.3, 51.4] },
      properties: { entity_id: 'unit:1', entity_kind: 'Unit', name: '17th Panzer',
        group_id: 'axis', quality: 'derived', echelon: 'division',
        style_token: 'unit.armor.axis', source_ids: ['nafziger_carl:5407'],
        location_derivation: 'place_centroid' } },
    { type: 'Feature', id: 'unit:2', geometry: null,
      properties: { entity_id: 'unit:2', entity_kind: 'Unit', name: '13th Army',
        group_id: 'allies', quality: 'unknown', source_ids: ['wikipedia_battles_east'] } },
  ],
};

// ‏סצנה שנייה, לבדיקת שכבות מקבילות
const SCENE_B = { ...SCENE, scene_id: 'scn_def456', title_he: 'מבצע באגרטיון',
  active_layers: ['fronts', 'scene-overlay'] };
const FEATURES_B = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'battle:bagration',
      geometry: { type: 'Point', coordinates: [30.2, 53.9] },
      properties: { entity_id: 'battle:bagration', entity_kind: 'Battle',
        name: 'מבצע באגרטיון', group_id: 'events', quality: 'explicit',
        style_token: 'event.battle', source_ids: ['wd:Q157123'] } },
  ],
};

// -- harness -----------------------------------------------------------------
function harness({ sceneStatus = 200, featureStatus = 200 } = {}) {
  const calls = [];
  globalThis.performance = globalThis.performance || { now: () => 0 };
  globalThis.sessionStorage = {
    _v: {},
    getItem(k) { return this._v[k] ?? null; },
    setItem(k, v) { this._v[k] = v; },
    removeItem(k) { delete this._v[k]; },
  };
  globalThis.location = { pathname: '/', search: '', hash: '' };
  globalThis.history = { replaceState(_a, _b, url) { globalThis.location.hash = String(url).split('#')[1] || ''; } };
  globalThis.AbortController = globalThis.AbortController || class { abort() {} signal = null; };

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ url: href, method: options.method || 'GET' });
    const second = href.includes('scn_def456');
    if (href.includes('/features')) {
      return new Response(JSON.stringify(second ? FEATURES_B : FEATURES),
        { status: featureStatus });
    }
    if (href.includes('/ack')) return new Response('{}', { status: 200 });
    // ‏הסצנה שחוזרת נושאת את המזהה שהתבקש, אחרת כל בקשה נראית לזיהוי
    // ‏כמו אותה סצנה ובדיקת המקביליות הייתה בודקת כלום
    const asked = (href.match(/scn_[a-z0-9]+/i) || [])[0];
    const base = second ? SCENE_B : SCENE;
    return new Response(
      JSON.stringify({ ok: true, scene: asked ? { ...base, scene_id: asked } : base }),
      { status: sceneStatus });
  };

  const { spec, store } = createSceneOverlayLayer({ ScatterplotLayer, PathLayer, TextLayer,
    IconLayer, PolygonLayer, TripsLayer });
  const visible = new Set();
  const registry = {
    visibleIds: [],
    async setVisible(id) { visible.add(id); this.visibleIds = [...visible]; },
  };
  let day = null;
  let camera = null;
  let refreshed = 0;
  const client = new MapCommandClient({
    store,
    registry,
    engine: { setDay(value) { day = value; } },
    getTier: () => 'high',
    getViewport: () => ({ bbox: [30, 45, 45, 56], zoom: 6 }),
    setCamera: (value) => { camera = value; },
    refreshLayers: () => { refreshed += 1; },
    onScene: () => {},
  });
  return { client, store, spec, calls, visible,
    getDay: () => day, getCamera: () => camera, getRefreshed: () => refreshed };
}

// -- tests -------------------------------------------------------------------

// applying a scene drives time, layers and camera through public APIs only
{
  const h = harness();
  const scene = await h.client.applyScene('scn_abc123');
  assert.equal(scene.scene_id, 'scn_abc123');
  assert.equal(h.getDay(), 2378, 'the scene sets the map day');
  assert.ok(h.visible.has('battles') && h.visible.has('scene-overlay'));
  assert.deepEqual(h.getCamera(), { bounds: [35.5, 51.1, 36.7, 52.3], maxZoom: 8 });
  assert.ok(h.getRefreshed() >= 1);
}

// unlocated entities never reach the renderer
{
  const h = harness();
  await h.client.applyScene('scn_abc123');
  assert.equal(h.store.features.length, 2, 'only located features are drawn');
  assert.ok(!h.store.features.some((f) => f.properties.entity_id === 'unit:2'));
}

// ...but they are still retrievable for the panel
{
  const h = harness();
  await h.client.applyScene('scn_abc123');
  const missing = await h.client.unlocated();
  assert.equal(missing.length, 1);
  assert.equal(missing[0].properties.name, '13th Army');
}

// the scene id round-trips through the URL for refresh and sharing
{
  const h = harness();
  await h.client.applyScene('scn_abc123');
  assert.ok(globalThis.location.hash.includes('scene=scn_abc123'));
  await h.client.clear();
  assert.ok(!globalThis.location.hash.includes('scene='));
}

// a malformed scene id never reaches the network
{
  const h = harness();
  await assert.rejects(() => h.client.applyScene('../../etc/passwd'));
  assert.equal(h.calls.length, 0);
}

// a failing scene must not wipe the scene already on screen
{
  const h = harness();
  await h.client.applyScene('scn_abc123');
  const before = h.store.features.length;
  globalThis.fetch = async () => new Response('nope', { status: 503 });
  await assert.rejects(() => h.client.applyScene('scn_zzz999'));
  assert.equal(h.store.features.length, before, 'previous scene survives a failure');
}

// undo restores the scene that was on screen before the last apply
{
  const h = harness();
  await h.client.applyScene('scn_abc123');   // previous = empty map
  await h.client.applyScene('scn_abc123');   // previous = the 2 drawn features
  h.store.clear();
  assert.equal(h.store.features.length, 0);
  assert.equal(h.client.undo(), true);
  assert.equal(h.store.features.length, 2);
  assert.equal(h.client.undo(), false, 'undo is one step, not a history stack');
}

// 'add' merges instead of replacing, and never duplicates an entity
{
  const h = harness();
  await h.client.applyScene('scn_abc123');
  await h.client.applyScene('scn_abc123', { operation: 'add' });
  const ids = h.store.features.map((f) => f.properties.entity_id);
  assert.equal(new Set(ids).size, ids.length, 'add must not duplicate entities');
}

// the overlay renders through injected deck.gl layers only
{
  const h = harness();
  await h.client.applyScene('scn_abc123');
  const layers = h.spec.build(h.store, { opacity: 1, zoom: 6, day: 2378, onClick() {} });
  const ids = layers.map((l) => l.id);
  assert.ok(ids.includes('scene-symbols'), 'points are drawn as symbols');
  assert.ok(ids.includes('scene-battle-pulse'), 'an active battle pulses');
  assert.ok(layers.every((l) => l instanceof FakeLayer),
    'nothing is constructed outside the injected deck.gl classes');
}

// certainty is carried by the symbol itself, so it cannot be lost in a redraw
{
  const { symbolKey } = await import('../src/layers/scene-symbols.js');
  const explicit = { entity_kind: 'Unit', style_token: 'unit.armor.axis',
                     quality: 'explicit', echelon: 'division' };
  const derived = { ...explicit, quality: 'derived' };
  const estimated = { ...explicit, quality: 'estimated' };
  assert.notEqual(symbolKey(explicit), symbolKey(derived));
  assert.notEqual(symbolKey(derived), symbolKey(estimated));
}

// a reconstructed track never renders as a documented one
{
  const { isReconstructed } = await import('../src/layers/scene-overlay.js');
  assert.equal(isReconstructed({ motion_basis: 'interpolated_between_documented_points' }), true);
  assert.equal(isReconstructed({ motion_basis: 'documented_snapshots', quality: 'explicit' }), false);
}

// the overlay carries no colour or markup from the server beyond a known token
{
  const { rgbaOf } = await import('../src/layers/scene-symbols.js');
  const injected = rgbaOf({ style_token: 'rgb(255,0,0)', group_id: 'axis' });
  const known = rgbaOf({ style_token: 'unit.armor.axis' });
  assert.deepEqual(injected, known,
    'an unrecognised token falls back to the group colour, it is never used raw');
}

// a dated feature is drawn only inside its own window; an undated one always
{
  const h = harness();
  const dated = {
    type: 'Feature', id: 'raid:1',
    geometry: { type: 'Point', coordinates: [36, 51] },
    properties: { entity_id: 'raid:1', entity_kind: 'AirRaid', name: 'תקיפה',
      group_id: 'air', quality: 'explicit', style_token: 'event.airraid',
      day_from: 2378, day_to: 2378, source_ids: ['x'] },
  };
  const undated = {
    type: 'Feature', id: 'camp:1',
    geometry: { type: 'Point', coordinates: [19, 50] },
    properties: { entity_id: 'camp:1', entity_kind: 'Camp', name: 'אתר',
      group_id: 'persecution', quality: 'explicit', style_token: 'place.camp',
      day_from: null, day_to: null, source_ids: ['x'] },
  };
  h.store.apply(SCENE, { features: [dated, undated] });

  const onDay = h.spec.build(h.store, { opacity: 1, zoom: 6, day: 2378, onClick() {} })
    .find((l) => l.id === 'scene-symbols');
  assert.equal(onDay.data.length, 2, 'on the day, both are drawn');

  const offDay = h.spec.build(h.store, { opacity: 1, zoom: 6, day: 9999, onClick() {} })
    .find((l) => l.id === 'scene-symbols');
  assert.equal(offDay.data.length, 1, 'the dated raid drops out of its window');
  assert.equal(offDay.data[0].properties.entity_kind, 'Camp',
    'an undated entity cannot be time-filtered, so it stays');
}

// level of detail budget follows the spec's zoom table
assert.equal(featureBudget(3), 300);
assert.equal(featureBudget(5), 700);
assert.equal(featureBudget(7), 1200);
assert.equal(featureBudget(10), 2000);

// -- parallel scenes ---------------------------------------------------------
//
// ‏‏operation:"add" מיזג נכון בטעינה, אבל refreshViewport טען מחדש רק את
// ‏הסצנה האחרונה ודרס את הקודמות: כל הזזה של המפה מחקה את השכבה המקבילה
// ‏בלי שום שגיאה. זה הבדיקה שמונעת חזרה.
{
  const h = harness();
  await h.client.applyScene('scn_abc123');
  await h.client.applyScene('scn_def456', { operation: 'add' });
  assert.equal(h.client.scenes.length, 2, 'two scenes stay active');
  assert.equal(h.store.features.length, 3, 'both scenes are on the map');

  await h.client.refreshViewport();
  assert.equal(h.store.features.length, 3,
    'panning the map must not drop the parallel scene');
  assert.ok(h.store.features.some((f) => f.properties.entity_id === 'battle:bagration'));
  assert.ok(h.store.features.some((f) => f.properties.entity_id === 'battle:wd:Q130861'));
}
{
  // replace אחרי add מנקה את המצטבר — זו המשמעות של replace
  const h = harness();
  await h.client.applyScene('scn_abc123');
  await h.client.applyScene('scn_def456', { operation: 'add' });
  await h.client.applyScene('scn_abc123', { operation: 'replace' });
  assert.equal(h.client.scenes.length, 1);
  assert.equal(h.store.features.length, 2);
}
{
  // אותה סצנה פעמיים ב-add אינה נספרת פעמיים
  const h = harness();
  await h.client.applyScene('scn_abc123');
  await h.client.applyScene('scn_abc123', { operation: 'add' });
  assert.equal(h.client.scenes.length, 1);
}
{
  // הסרה של שכבה אחת משאירה את השאר
  const h = harness();
  await h.client.applyScene('scn_abc123');
  await h.client.applyScene('scn_def456', { operation: 'add' });
  assert.equal(await h.client.removeScene('scn_abc123'), true);
  assert.equal(h.client.scenes.length, 1);
  assert.ok(h.store.features.every((f) => f.properties.entity_id !== 'unit:1'));
  assert.equal(await h.client.removeScene('scn_nope99'), false, 'unknown id is a no-op');
  assert.equal(await h.client.removeScene('scn_def456'), true);
  assert.equal(h.store.features.length, 0, 'removing the last scene clears the map');
}
{
  // undo מחזיר את כל הערימה, לא רק את הסצנה האחרונה
  const h = harness();
  await h.client.applyScene('scn_abc123');
  await h.client.applyScene('scn_def456', { operation: 'add' });
  await h.client.applyScene('scn_abc123', { operation: 'replace' });
  assert.equal(h.client.undo(), true);
  assert.equal(h.client.scenes.length, 2, 'undo restores both parallel scenes');
}
{
  const h = harness();
  await h.client.applyScene('scn_abc123');
  await h.client.applyScene('scn_def456', { operation: 'add' });
  const listed = h.client.activeScenes();
  assert.equal(listed.length, 2);
  assert.ok(listed.every((s) => s.scene_id && s.counts));
}

{
  // ‏הגבול נאכף: הסצנה השביעית מפילה את הוותיקה ביותר, לא נדחית
  const h = harness();
  await h.client.applyScene('scn_abc123');
  for (let i = 0; i < 8; i += 1) {
    await h.client.applyScene(`scn_x${i}0000`, { operation: 'add' });
  }
  assert.equal(h.client.scenes.length, 6, 'six parallel scenes is the published cap');
  assert.equal(h.client.scenes[h.client.scenes.length - 1].scene_id, 'scn_x70000',
    'the newest request always survives');
  assert.equal(h.client.droppedForLimit, true, 'and the drop is recorded, not silent');
}

console.log('test-map-command.mjs ✓');
