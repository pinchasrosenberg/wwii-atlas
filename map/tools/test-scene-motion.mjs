import assert from 'node:assert/strict';
import {
  resample, tweenPaths, frontAtDay, positionOnTrack, isReconstructed, describeFeature,
  alignDirection,
} from '../src/layers/scene-overlay.js';
import {
  createSymbolCache, symbolKey, symbolSize, visibleAtZoom, rgbaOf,
} from '../src/layers/scene-symbols.js';
import { createSceneOverlayLayer } from '../src/layers/scene-overlay.js';

// -- resampling --------------------------------------------------------------
{
  const line = [[0, 0], [10, 0]];
  const out = resample(line, 11);
  assert.equal(out.length, 11);
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[10], [10, 0]);
  assert.ok(Math.abs(out[5][0] - 5) < 1e-9, 'points are evenly spaced by arc length');
}
{
  // uneven vertex spacing must still resample evenly
  const line = [[0, 0], [1, 0], [10, 0]];
  const out = resample(line, 5);
  const gaps = out.slice(1).map((p, i) => p[0] - out[i][0]);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1e-9);
}
assert.deepEqual(resample([[1, 1]], 4), [], 'a single point is not a line');
assert.deepEqual(resample(null, 4), []);

// -- tweening ----------------------------------------------------------------
{
  const a = [[0, 0], [10, 0]];
  const b = [[0, 5], [10, 5]];
  assert.deepEqual(tweenPaths(a, b, 0, 2), [[0, 0], [10, 0]]);
  assert.deepEqual(tweenPaths(a, b, 1, 2), [[0, 5], [10, 5]]);
  assert.deepEqual(tweenPaths(a, b, 0.5, 2), [[0, 2.5], [10, 2.5]]);
}
{
  // different vertex counts must still blend
  const a = [[0, 0], [5, 0], [10, 0]];
  const b = [[0, 4], [10, 4]];
  const mid = tweenPaths(a, b, 0.5, 3);
  assert.equal(mid.length, 3);
  assert.ok(Math.abs(mid[1][1] - 2) < 1e-6);
}
{
  const a = [[0, 0], [10, 0]];
  const b = [[0, 5], [10, 5]];
  assert.deepEqual(tweenPaths(a, b, -3, 2), [[0, 0], [10, 0]], 't is clamped');
  assert.deepEqual(tweenPaths(a, b, 9, 2), [[0, 5], [10, 5]]);
}

// -- the front on a given day ------------------------------------------------
const snap = (day, y) => ({
  geometry: { type: 'LineString', coordinates: [[0, y], [10, y]] },
  properties: { day_from: day, day_to: day, source_ids: ['loc_map'] },
});
const SNAPSHOTS = [snap(100, 0), snap(110, 10), snap(130, 30)];

{
  const exact = frontAtDay(SNAPSHOTS, 110);
  assert.equal(exact.exact, true, 'a documented date is drawn as documented');
  assert.deepEqual(exact.path[0], [0, 10]);
  assert.equal(exact.to, null);
}
{
  const between = frontAtDay(SNAPSHOTS, 105);
  assert.equal(between.exact, false, 'a date between snapshots is a reconstruction');
  assert.ok(Math.abs(between.path[0][1] - 5) < 1e-6, 'halfway between 0 and 10');
  assert.ok(between.from && between.to, 'both bracketing snapshots are reported');
}
{
  const before = frontAtDay(SNAPSHOTS, 50);
  assert.deepEqual(before.path[0], [0, 0], 'before the first snapshot it holds');
  const after = frontAtDay(SNAPSHOTS, 900);
  assert.deepEqual(after.path[0], [0, 30], 'after the last it holds');
  assert.equal(after.exact, false);
}
{
  // unevenly spaced dates must interpolate on time, not on index
  const at120 = frontAtDay(SNAPSHOTS, 120);
  assert.ok(Math.abs(at120.path[0][1] - 20) < 1e-6);
}
assert.deepEqual(frontAtDay([], 100).path, []);

// -- a unit's position on a documented track ---------------------------------
const STOPS = [
  { at: [0, 0], day: 100 },
  { at: [10, 0], day: 110 },
  { at: [10, 10], day: 120 },
];
{
  assert.deepEqual(positionOnTrack(STOPS, 100), { at: [0, 0], exact: true });
  assert.deepEqual(positionOnTrack(STOPS, 110), { at: [10, 0], exact: false });
  const mid = positionOnTrack(STOPS, 105);
  assert.ok(Math.abs(mid.at[0] - 5) < 1e-6);
  assert.equal(mid.exact, false, 'a position between stops is never "exact"');
}
{
  assert.deepEqual(positionOnTrack(STOPS, 40).at, [0, 0], 'clamps before the first stop');
  assert.deepEqual(positionOnTrack(STOPS, 400).at, [10, 10], 'clamps after the last');
  assert.equal(positionOnTrack([{ at: [0, 0], day: 1 }], 5), null,
    'one point is a position, not a track');
}

// -- reconstruction must be declared -----------------------------------------
assert.equal(isReconstructed({ motion_basis: 'interpolated_between_documented_points' }), true);
assert.equal(isReconstructed({ motion_basis: 'scheduled_window_on_algorithmic_corridor' }), true);
assert.equal(isReconstructed({ quality: 'estimated' }), true);
assert.equal(isReconstructed({ motion_basis: 'documented_snapshots', quality: 'explicit' }), false);

// -- symbols -----------------------------------------------------------------
{
  // the key must separate everything that changes the drawing
  const base = { entity_kind: 'Unit', style_token: 'unit.armor.axis',
                 quality: 'explicit', echelon: 'division' };
  assert.notEqual(symbolKey(base), symbolKey({ ...base, quality: 'estimated' }));
  assert.notEqual(symbolKey(base), symbolKey({ ...base, echelon: 'army' }));
  assert.notEqual(symbolKey(base), symbolKey({ ...base, style_token: 'unit.armor.allies' }));
  assert.equal(symbolKey(base), symbolKey({ ...base, name: 'אחר' }),
    'the name must not fragment the cache');
}
{
  // a fake canvas keeps this runnable without a browser
  const drawn = [];
  const fakeCanvas = () => ({
    getContext: () => new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'setLineDash' || typeof prop === 'symbol') return () => {};
        return (...args) => { drawn.push(String(prop)); return args; };
      },
      set: () => true,
    }),
  });
  const cache = createSymbolCache({ makeCanvas: fakeCanvas });
  const a = cache.iconFor({ entity_kind: 'Unit', style_token: 'unit.armor.axis',
                            quality: 'explicit', echelon: 'division' });
  const b = cache.iconFor({ entity_kind: 'Unit', style_token: 'unit.armor.axis',
                            quality: 'explicit', echelon: 'division', name: 'x' });
  assert.equal(a, b, 'identical symbols are drawn once and reused');
  assert.equal(cache.cache.size, 1);
  cache.iconFor({ entity_kind: 'Battle', style_token: 'event.battle', quality: 'explicit' });
  assert.equal(cache.cache.size, 2);
  // ‏האיורים מצוירים במילוי, לא בקווי מתאר — טנק הוא צללית ולא סכמה.
  assert.ok(drawn.includes('fill'), 'the artwork was actually painted');
  assert.ok(drawn.includes('lineTo'), 'and it is a real path, not a single primitive');
}
{
  // zoom changes meaning, not just size
  const unit = { entity_kind: 'Unit', echelon: 'division' };
  assert.ok(symbolSize(unit, 9) > symbolSize(unit, 3));
  const army = { entity_kind: 'Unit', echelon: 'army' };
  assert.ok(symbolSize(army, 6) > symbolSize(unit, 6), 'higher echelon reads bigger');
  assert.equal(visibleAtZoom({ entity_kind: 'Battle' }, 2), true, 'battles always show');
  assert.equal(visibleAtZoom({ entity_kind: 'RailNode' }, 5), false);
  assert.equal(visibleAtZoom({ entity_kind: 'RailNode' }, 8), true);
  assert.equal(visibleAtZoom({ entity_kind: 'UnitTrack' }, 2), true);
}
{
  const axis = rgbaOf({ style_token: 'unit.armor.axis' });
  const allies = rgbaOf({ style_token: 'unit.armor.allies' });
  assert.notDeepEqual(axis, allies, 'the two sides must not share a colour');
  assert.equal(axis.length, 4);
  const unknown = rgbaOf({ style_token: 'rgb(255,0,0)' });
  assert.deepEqual(unknown.slice(0, 3), rgbaOf({ group_id: 'unknown' }).slice(0, 3),
    'an unknown token falls back; it is never used as a colour');
}

// -- branch shapes ------------------------------------------------------------
//
// ‏השרת שולח detected_branch; אם המפה לא מכירה ערך, הוא נופל בשקט לחי"ר
// ‏ואיש לא מבחין. לכן כל ענף שהשרת יודע לשלוח נבדק כאן במפורש.
{
  const base = { entity_kind: 'Unit', style_token: 'unit.infantry.axis', quality: 'explicit' };
  const shapeOf = (branch) => symbolKey({ ...base, branch }).split('|')[0];
  const expected = {
    armor: 'armor',
    artillery: 'artillery',
    infantry: 'infantry',
    mechanized_infantry: 'mech',
    motorized_infantry: 'motor',
    anti_tank: 'antitank',
    air_defense: 'airdefense',
    airborne: 'airborne',
    cavalry: 'cavalry',
    mountain_infantry: 'mountain',
    engineers: 'engineer',
    marines: 'marines',
  };
  for (const [branch, shape] of Object.entries(expected)) {
    assert.equal(shapeOf(branch), shape, `branch ${branch} draws as ${shape}`);
  }
  assert.equal(shapeOf('flame_troops'), 'infantry', 'an unknown branch degrades, not throws');
  assert.equal(shapeOf(undefined), 'infantry');
  // ‏מפקדה גוברת על הענף: מפקדת דיוויזיה משוריינת היא עדיין מפקדה
  assert.equal(symbolKey({ ...base, branch: 'armor', style_token: 'unit.hq.axis' })
    .split('|')[0], 'hq');
}
{
  // ‏כל ענף מצייר בפועל, ושתי צורות שונות אינן מייצרות אותה תמונה
  const canvas = () => ({
    getContext: () => new Proxy({}, {
      get: (_t, prop) => (prop === 'setLineDash' || typeof prop === 'symbol'
        ? () => {} : (...args) => args),
      set: () => true,
    }),
  });
  const cache = createSymbolCache({ makeCanvas: canvas });
  const urls = new Map();
  for (const branch of ['armor', 'artillery', 'infantry', 'mechanized_infantry',
    'motorized_infantry', 'anti_tank', 'air_defense', 'airborne', 'cavalry',
    'mountain_infantry', 'engineers', 'marines']) {
    const icon = cache.iconFor({ entity_kind: 'Unit', quality: 'explicit',
      style_token: 'unit.infantry.axis', echelon: 'division', branch });
    assert.ok(icon && icon.id, `${branch} produced an icon`);
    assert.ok(!urls.has(icon.id), `${branch} has its own symbol key`);
    urls.set(icon.id, branch);
  }
}

// -- what the tooltip says ---------------------------------------------------
{
  const text = describeFeature({
    name: '5th Panzer Division', echelon: 'division', branch: 'armor',
    branch_basis: 'name_pattern', quality: 'derived', has_provenance: true,
  });
  assert.ok(text.includes('שריון'), 'the branch is named');
  assert.ok(text.includes('זוהה מהשם'), 'a name-detected branch says so');
  assert.ok(text.includes('נגזר'), 'the claim grade travels with it');

  const sourced = describeFeature({
    name: 'X', branch: 'artillery', branch_basis: 'source', has_provenance: true });
  assert.ok(!sourced.includes('זוהה מהשם'), 'a sourced branch carries no caveat');

  const track = describeFeature({
    name: 'HQ', motion_basis: 'interpolated_between_documented_points',
    quality: 'estimated', has_provenance: true });
  assert.ok(track.includes('שחזור'), 'reconstruction is stated, not implied');

  const bare = describeFeature({ name: 'Y', has_provenance: false });
  assert.ok(bare.includes('ללא מקור'));
  assert.equal(describeFeature(null), '');
  assert.equal(describeFeature({}), '');
}

// -- inconsistent vertex order ------------------------------------------------
//
// ‏קווי החזית בגרף אינם שמורים בכיוון עקבי: 1944-12-01 רץ צפון→דרום,
// ‏1945-01-22 רץ דרום→צפון. מיזוג לפי אינדקס בין השניים מסובב את הקו סביב
// ‏עצמו — הצפון קופץ לדרום ובחזרה. זה נראה כמו תקלה גרפית, לא כמו חזית.
{
  const north = [[4, 51.5], [6, 50], [7, 48]];
  const alsoNorth = [[4.2, 51.6], [6.2, 50.1], [7.2, 48.1]];
  const reversed = [...alsoNorth].reverse();

  assert.deepEqual(alignDirection(north, alsoNorth), alsoNorth,
    'a path already in the same direction is left alone');
  assert.deepEqual(alignDirection(north, reversed), alsoNorth,
    'a reversed path is flipped back before blending');

  const good = tweenPaths(north, alsoNorth, 0.5, 3);
  const fixed = tweenPaths(north, reversed, 0.5, 3);
  for (let i = 0; i < good.length; i += 1) {
    assert.ok(Math.hypot(good[i][0] - fixed[i][0], good[i][1] - fixed[i][1]) < 1e-9,
      'the same two lines blend identically whichever way one is stored');
  }
  // ‏בלי התיקון, אמצע הקו היה נגרר לרוחב כל החזית
  assert.ok(Math.abs(fixed[1][1] - 50.05) < 0.2, 'the middle stays in the middle');
}
{
  // ‏קו קצר מדי מכדי לקבוע לו כיוון מוחזר כמות שהוא
  assert.deepEqual(alignDirection([[0, 0], [1, 1]], [[5, 5]]), [[5, 5]]);
}

// -- dashes actually reach deck.gl -------------------------------------------
//
// ‏‏deck.gl מתעלם מ-getDashArray אלא אם PathStyleExtension מחובר לשכבה. בלי
// ‏החיבור הזה כל קו ״מקווקו״ נרסם כקו מלא: השחזור נראה בדיוק כמו התיעוד,
// ‏בלי שגיאה ובלי אזהרה. זו ההבחנה היחידה שהמשתמש ביקש, ולכן היא נבדקת.
{
  class Fake { constructor(props) { Object.assign(this, props); this.kind = this.constructor.name; } }
  class ScatterplotLayer extends Fake {}
  class PathLayer extends Fake {}
  class TextLayer extends Fake {}
  class IconLayer extends Fake {}
  class PolygonLayer extends Fake {}
  class TripsLayer extends Fake {}
  class PathStyleExtension { constructor(opts) { this.opts = opts; } }
  globalThis.document = globalThis.document || {
    createElement: () => ({ width: 0, height: 0,
      getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
      toDataURL: () => 'data:image/png;base64,' }),
  };

  const snap = (id, d, coords) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: { entity_id: id, entity_kind: 'FrontLineSnapshot', name: `front ${d}`,
      day_from: d, day_to: d, quality: 'derived', style_token: 'line.front',
      motion_basis: 'documented_snapshots', group_id: 'fronts', source_ids: ['s'] },
  });
  const features = [snap('a', 100, [[4, 51], [6, 50], [7, 48]]),
                    snap('b', 200, [[5, 51.4], [7, 50.4], [8, 48.4]])];

  const build = (extension) => {
    const overlay = createSceneOverlayLayer({ ScatterplotLayer, PathLayer, TextLayer,
      IconLayer, PolygonLayer, TripsLayer, PathStyleExtension: extension });
    overlay.store.apply({ counts: { located: 2, unlocated: 0 } }, { features });
    return (atDay) => overlay.spec.build(overlay.store,
      { zoom: 6, day: atDay, opacity: 1, animationTime: 0, motionEnabled: false });
  };

  const withExt = build(PathStyleExtension);
  const between = withExt(150).find((l) => l.id === 'scene-front-line');
  assert.ok(between, 'the interpolated front line is drawn');
  assert.deepEqual(between.getDashArray, [6, 4], 'an interpolated day is dashed');
  assert.ok(Array.isArray(between.extensions) && between.extensions.length === 1,
    'PathStyleExtension is attached, or deck.gl silently ignores the dash');
  assert.ok(between.extensions[0].opts.dash === true);

  const onSnapshot = withExt(100).find((l) => l.id === 'scene-front-line');
  assert.equal(onSnapshot.getDashArray, undefined, 'a documented day is a solid line');
  assert.ok(onSnapshot.getWidth > between.getWidth,
    'the documented line also reads heavier than the reconstruction');

  // ‏בלי התוסף ההבחנה חייבת לשרוד ברוחב ובאטימות, לא להיעלם
  const withoutExt = build(undefined);
  const plain = withoutExt(150).find((l) => l.id === 'scene-front-line');
  const plainExact = withoutExt(100).find((l) => l.id === 'scene-front-line');
  assert.equal(plain.extensions, undefined);
  assert.ok(plain.getWidth < plainExact.getWidth,
    'without the extension the reconstruction is still visibly lighter');
}

// -- casing: every line survives a busy basemap -------------------------------
//
// ‏קו כתום מעל שטח כתום נעלם. הטכניקה הקרטוגרפית היא casing: קו כהה ורחב
// ‏מתחת וקו הצבע מעליו. בלי שכבת ה-casing הקו נראה מצוין על רקע לבן
// ‏בבדיקה, ונעלם על המפה האמיתית — ולכן קיומה נבדק.
{
  class Fake { constructor(p) { Object.assign(this, p); this.kind = this.constructor.name; } }
  class ScatterplotLayer extends Fake {}
  class PathLayer extends Fake {}
  class TextLayer extends Fake {}
  class IconLayer extends Fake {}
  class PolygonLayer extends Fake {}
  class TripsLayer extends Fake {}
  class PathStyleExtension { constructor(o) { this.opts = o; } }
  globalThis.document = globalThis.document || {
    createElement: () => ({ width: 0, height: 0,
      getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
      toDataURL: () => 'data:image/png;base64,' }),
  };

  const snap = (id, d, coords) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: { entity_id: id, entity_kind: 'FrontLineSnapshot', name: `front ${d}`,
      day_from: d, day_to: d, quality: 'derived', style_token: 'line.front',
      motion_basis: 'documented_snapshots', group_id: 'fronts', source_ids: ['s'] },
  });
  const overlay = createSceneOverlayLayer({ ScatterplotLayer, PathLayer, TextLayer,
    IconLayer, PolygonLayer, TripsLayer, PathStyleExtension });
  overlay.store.apply({ counts: { located: 2, unlocated: 0 } }, {
    features: [snap('a', 100, [[4, 51], [6, 50], [7, 48]]),
               snap('b', 200, [[5, 51.4], [7, 50.4], [8, 48.4]])],
  });
  const at = (d, t = 0) => overlay.spec.build(overlay.store,
    { zoom: 6, day: d, opacity: 1, animationTime: t, motionEnabled: true });

  const ids = at(150).map((l) => l.id);
  assert.ok(ids.includes('scene-front-line-casing'), 'the front line is cased');
  const casing = at(150).find((l) => l.id === 'scene-front-line-casing');
  const line = at(150).find((l) => l.id === 'scene-front-line');
  assert.ok(casing.getWidth > line.getWidth, 'the casing is the wider of the two');
  assert.ok(ids.indexOf('scene-front-line-casing') < ids.indexOf('scene-front-line'),
    'and it is drawn underneath, not on top');
  assert.notDeepEqual(casing.getColor.slice(0, 3), line.getColor.slice(0, 3),
    'a casing in the same colour is not a casing');
  assert.ok(ids.includes('scene-front-hit'),
    'a transparent wide path keeps the thin line clickable');
}
{
  // ‏ההילה נושמת: אותה סצנה בשני זמנים נותנת שני רוחבים
  class Fake { constructor(p) { Object.assign(this, p); } }
  class L extends Fake {}
  globalThis.document = globalThis.document || {
    createElement: () => ({ width: 0, height: 0,
      getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
      toDataURL: () => 'data:image/png;base64,' }),
  };
  const overlay = createSceneOverlayLayer({ ScatterplotLayer: L, PathLayer: L,
    TextLayer: L, IconLayer: L, PolygonLayer: L, TripsLayer: L });
  overlay.store.apply({ counts: {} }, { features: [{
    type: 'Feature', geometry: { type: 'LineString', coordinates: [[4, 51], [7, 48]] },
    properties: { entity_id: 'a', entity_kind: 'FrontLineSnapshot', day_from: 100,
      day_to: 100, quality: 'derived', style_token: 'line.front', group_id: 'fronts',
      source_ids: ['s'] } }] });
  const glowAt = (t, motion = true) => overlay.spec
    .build(overlay.store, { zoom: 6, day: 100, opacity: 1, animationTime: t,
      motionEnabled: motion })
    .find((l) => l.id === 'scene-front-glow');
  assert.notEqual(glowAt(0).getWidth, glowAt(1.3).getWidth, 'the glow breathes');
  assert.equal(glowAt(0, false).getWidth, glowAt(1.3, false).getWidth,
    'and holds still when motion is switched off');
}

// -- city size ---------------------------------------------------------------
//
// ‏אטלס מצייר בירה אחרת מכפר. ארבע דרגות היישוב הן ארבעה איורים שונים,
// ‏ולכן הן חייבות להיכנס למפתח המטמון — אחרת כל הערים היו חולקות תמונה.
{
  const city = (weight) => ({ entity_kind: 'City', group_id: 'places',
    quality: 'explicit', ...(weight == null ? {} : { display_weight: weight }) });
  const tier = (w) => symbolKey(city(w)).split('|')[0];
  assert.equal(tier(0.95), 'place_metro');
  assert.equal(tier(0.70), 'place_city');
  assert.equal(tier(0.50), 'place_town');
  assert.equal(tier(0.10), 'place_village');
  assert.equal(tier(null), 'place_town', 'no figure falls back to a town, not a capital');
  assert.notEqual(tier(0.95), tier(0.10), 'the tiers do not share a cached image');

  // גודל בפיקסלים עולה עם המשקל, בכל רמת זום
  for (const zoom of [3, 5, 7, 9]) {
    assert.ok(symbolSize(city(0.95), zoom) > symbolSize(city(0.10), zoom),
      `a capital outdraws a village at zoom ${zoom}`);
  }
  // ‏וגודל עולה עם הזום, לכל משקל
  assert.ok(symbolSize(city(0.5), 9) > symbolSize(city(0.5), 3));
}
{
  // ‏מה נראה בכל זום: הבירה מוקדם, הכפר רק כשמתקרבים
  const at = (w, z) => visibleAtZoom({ entity_kind: 'City', display_weight: w }, z);
  assert.equal(at(0.95, 3), true, 'a capital is on the map from far out');
  assert.equal(at(0.10, 3), false, 'a village is not');
  assert.equal(at(0.10, 8), true, 'but it appears when you zoom in');
  assert.equal(at(0.50, 3), false);
  assert.equal(at(0.50, 6.5), true);
  assert.equal(visibleAtZoom({ entity_kind: 'City' }, 7), true,
    'a city with no weight still appears at close zoom');
  assert.equal(visibleAtZoom({ entity_kind: 'City' }, 4), false);
  // ‏מונוטוני: מה שנראה בזום נמוך נראה גם בגבוה
  for (const w of [0.1, 0.5, 0.7, 0.9]) {
    let seen = false;
    for (const z of [3, 4, 5, 6, 7, 8, 9]) {
      const now = at(w, z);
      assert.ok(!(seen && !now), `weight ${w} must not vanish as you zoom in`);
      seen = seen || now;
    }
  }
}

console.log('test-scene-motion.mjs ✓');
