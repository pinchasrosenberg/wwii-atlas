/**
 * ‏שכבת התוואי על המפה — הצד הלקוח.
 *
 * ‏שלוש הטענות שהבדיקות כאן שומרות עליהן:
 *   1. ‏בחירת הכלי משנה את התמונה. אם היא לא — הפקד הוא קישוט.
 *   2. ‏צבע נעדר במקום שבו התנועה חופשית, כדי שהעין תימשך רק לחיכוך.
 *   3. ‏״לא יודעים״ יוצא מהמדרג לגמרי, ולא מקבל את צבעו של ״קל״.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  DEFAULT_MODE, MODES_WITHOUT_BASIS, MODE_LABELS, MODE_NOTES, RAMP,
  TRANSPORT_MODES, coefficientOf, dashFor, describeCell, fillFor, isKnownMode,
  isUnknownCell, legendFor, lineFor,
} from '../src/layers/terrain-passability.js';
import { createSceneOverlayLayer } from '../src/layers/scene-overlay.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const cell = (passability, extra = {}) => ({ passability, ...extra });

// -- אוצר המילים ------------------------------------------------------------
{
  assert.ok(TRANSPORT_MODES.includes(DEFAULT_MODE));
  for (const mode of TRANSPORT_MODES) {
    assert.ok(MODE_LABELS[mode], `${mode} בלי תווית`);
    assert.ok(MODE_NOTES[mode], `${mode} בלי הסבר — הצופה לא ידע מה בחר`);
    assert.ok(isKnownMode(mode));
  }
  assert.ok(!isKnownMode('teleport'));
  // ‏מסילה מוצגת אף שאין לה עדיין בסיס, ולכן היא חייבת להיות מסומנת ככזו.
  assert.ok(MODES_WITHOUT_BASIS.has('rail'));
}

// -- ‏המדרג: פתוח = שקוף, חסום = כהה, ומונוטוני ביניהם ------------------------
{
  // ‏תא פתוח מקבל רמז ולא כלום: אריחי הבסיס נגמרים ב-zoom 4, ובזום
  // ‏שבו השכבה שימושית אין מפה מתחת — ואז ״בלי מילוי״ נקרא כמו
  // ‏״מחוץ לרשת״, כלומר מדידה נראית כמו היעדר נתונים.
  const open = fillFor(cell({ wheeled: 1 }), 'wheeled');
  assert.ok(open[3] > 0 && open[3] <= 40,
    'תא פתוח חייב רמז חלש: לא אפס, וגם לא כתם');

  const blocked = fillFor(cell({ wheeled: 0 }), 'wheeled');
  assert.deepEqual(blocked.slice(0, 3), RAMP.blocked);
  assert.ok(blocked[3] > 180, 'תא חסום חייב להיות אטום');

  assert.ok(fillFor(cell({ wheeled: 0.9 }), 'wheeled')[3] > open[3] * 1.5,
    'חיכוך קל חייב להיות חזק בבירור מהרמז של תא פתוח');

  let previousAlpha = -1;
  for (const coefficient of [1, 0.9, 0.75, 0.5, 0.25, 0]) {
    const alpha = fillFor(cell({ wheeled: coefficient }), 'wheeled')[3];
    assert.ok(alpha > previousAlpha,
      `המדרג אינו מונוטוני סביב ${coefficient}`);
    previousAlpha = alpha;
  }
}
{
  // ‏חיכוך קל חייב להיראות: רוב תאי אירופה יושבים בין 0.9 ל-1.0.
  const light = fillFor(cell({ wheeled: 0.9 }), 'wheeled');
  assert.ok(light[3] >= 45, 'חיכוך קל נבלע ברקע ולא נראה בכלל');
}

// -- ‏ההיפוך: אותו תא, שתי תשובות -------------------------------------------
{
  // ‏הריין ב-operational: קיר למשאית, עורק פתוח לדוברה.
  const rhine = cell({ wheeled: 0, tracked: 0, cart_foot: 0.1, barge: 1, rail: 0, airdrop: 1 });
  const asTruck = fillFor(rhine, 'wheeled');
  const asBarge = fillFor(rhine, 'barge');
  assert.ok(asTruck[3] > 180, 'למשאית הנהר חייב להיות חסום');
  assert.ok(asBarge[3] < 40,
    'לדוברה אותו נהר הוא נתיב פתוח — אם שני הכלים נראים אותו דבר, ' +
    'הבורר לא עושה כלום');
  assert.ok(asTruck[3] - asBarge[3] > 150, 'ההבדל חייב לקפוץ לעין');
}

// -- ‏״לא יודעים״ אינו נקודה על המדרג ----------------------------------------
{
  const blank = cell({ wheeled: 1, tracked: 1, cart_foot: 1, barge: 0, rail: 0, airdrop: 1 },
    { terrain_unknown: true });
  const measuredOpen = cell({ wheeled: 1, tracked: 1, cart_foot: 1, barge: 0, rail: 0, airdrop: 1 });

  assert.ok(isUnknownCell(blank) && !isUnknownCell(measuredOpen));
  // ‏תא פתוח שנמדד מקבל רמז; תא לא ידוע לא מקבל מילוי בכלל, ובמקומו
  // ‏מסגרת מקווקוות. שתי הבחנות נפרדות, ואף אחת לא נשענת רק על גוון.
  assert.deepEqual(fillFor(blank, 'wheeled'), [0, 0, 0, 0]);
  assert.ok(fillFor(measuredOpen, 'wheeled')[3] > 0);
  // ‏שני התאים מחזירים 1.0. ההבחנה חייבת לחיות במקום אחר — במסגרת.
  assert.ok(lineFor(blank)[3] > 0, 'תא לא ידוע חייב מסגרת, אחרת הוא נעלם');
  assert.equal(lineFor(measuredOpen)[3], 0);
  assert.deepEqual(dashFor(blank), [3, 3]);
  assert.deepEqual(dashFor(measuredOpen), [0, 0]);
  assert.match(describeCell(blank, 'wheeled'), /לא ידוע/);
}
{
  // ‏תא ״קל״ ותא ״לא ידוע״ אסור שייראו אותו דבר בשום ערוץ.
  const easy = cell({ wheeled: 0.9 });
  const blank = cell({ wheeled: 1 }, { terrain_unknown: true });
  const same = JSON.stringify([fillFor(easy, 'wheeled'), lineFor(easy), dashFor(easy)])
            === JSON.stringify([fillFor(blank, 'wheeled'), lineFor(blank), dashFor(blank)]);
  assert.ok(!same, 'ניחוש נראה בדיוק כמו מדידה');
}

// -- ‏מקדם חסר אינו אפס ------------------------------------------------------
{
  assert.equal(coefficientOf(cell({ wheeled: 0.5 }), 'barge'), null);
  assert.deepEqual(fillFor(cell({ wheeled: 0.5 }), 'barge'), [0, 0, 0, 0],
    'אופן בלי מקדם חייב לא להיצבע — צביעה כאילו 0 היא המצאה של חסימה, ' +
    'וצביעה כאילו 1 היא המצאה של כיסוי');
  assert.equal(coefficientOf(null, 'wheeled'), null);
  assert.equal(coefficientOf(cell({ wheeled: 0.5 }), 'teleport'), null);
}

// -- המקרא -------------------------------------------------------------------
{
  const legend = legendFor('wheeled');
  assert.ok(legend.length >= 5);
  assert.ok(legend.some((entry) => /לא ידוע/.test(entry.label)),
    'מקרא בלי ״לא ידוע״ משאיר את ההבחנה החשובה ביותר בלי הסבר');
  assert.ok(legend.some((entry) => entry.shape === 'line'),
    'ההבחנה חייבת לשרוד גם בלי צבע — צורה ולא רק גוון');
}

// -- ‏השכבה עצמה: הפוליגון נצבע ומשתנה עם הכלי -------------------------------
{
  const built = [];
  class FakePolygonLayer {
    constructor(props) { this.props = props; built.push(props); }
  }
  const Noop = class { constructor(props) { this.props = props; } };
  const overlay = createSceneOverlayLayer({
    ScatterplotLayer: Noop, PathLayer: Noop, TextLayer: Noop, IconLayer: Noop,
    PolygonLayer: FakePolygonLayer, TripsLayer: Noop,
    PathStyleExtension: null, CollisionFilterExtension: null,
  });

  const ring = [[5.7, 50], [5.75, 50], [5.75, 50.05], [5.7, 50.05], [5.7, 50]];
  const feature = {
    type: 'Feature', id: 'terrain:T1|114|1000',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {
      entity_id: 'terrain:T1|114|1000', entity_kind: 'TerrainCell',
      name: 'תא', group_id: 'terrain', quality: 'estimated',
      style_token: 'terrain.cell', day_from: null, day_to: null,
      passability: { wheeled: 0, tracked: 0, cart_foot: 0.1, rail: 0, barge: 1, airdrop: 1 },
      factors: ['river_operational', 'navigable_river'],
      coverage: ['forest_frac', 'relief', 'river'], terrain_unknown: false,
    },
  };
  overlay.store.apply({ scene: { counts: { located: 1, unlocated: 0 } } },
    { features: [feature] });

  overlay.spec.build(overlay.store, { zoom: 8, day: 0, opacity: 1 });
  assert.equal(built.length, 1, 'תא תוואי לא צויר כלל');
  const asTruck = built[0].getFillColor(feature);
  assert.ok(asTruck[3] > 180);
  assert.deepEqual(built[0].getPolygon(feature), ring);

  built.length = 0;
  assert.equal(overlay.setTransportMode('barge'), true);
  assert.equal(overlay.getTransportMode(), 'barge');
  overlay.spec.build(overlay.store, { zoom: 8, day: 0, opacity: 1 });
  const asBarge = built[0].getFillColor(feature);
  assert.ok(asBarge[3] < 40 && asTruck[3] - asBarge[3] > 150,
    'החלפת הכלי לא שינתה את הציור — הבורר לא מחובר לשכבה');
  assert.ok(built[0].updateTriggers?.getFillColor?.includes('barge'),
    'בלי updateTriggers ‏deck.gl ישאיר את הצבע הישן במטמון');

  assert.equal(overlay.setTransportMode('teleport'), false,
    'אופן שאינו קיים חייב להידחות ולא לרוקן את השכבה');
  assert.equal(overlay.getTransportMode(), 'barge');
}

// -- ‏הכרטיס: תא תוואי אינו ישות היסטורית ------------------------------------
{
  const overlay = createSceneOverlayLayer({
    ScatterplotLayer: class {}, PathLayer: class {}, TextLayer: class {},
    IconLayer: class {}, PolygonLayer: class {}, TripsLayer: class {},
  });
  const rows = overlay.spec.cardSpec.fieldsOf({
    properties: {
      entity_kind: 'TerrainCell', quality: 'unknown', terrain_unknown: true,
      passability: { wheeled: 1, barge: 0 }, factors: [], coverage: [],
    },
  }, () => '');
  const text = JSON.stringify(rows);
  assert.match(text, /לא ידוע|אין שכבה/);
  assert.ok(!/דרג|צד/.test(text), 'שדות של יחידה צצים על תא תוואי');
  assert.match(text, /לא מסלול אספקה/);
}

// -- ‏התפר בין הלקוח לשרת ----------------------------------------------------
{
  // ‏חיפוש כלפי מעלה ולא נתיב קשיח: בדיקה עם נתיב מוחלט עוברת רק על
  // ‏מכונה אחת, ואז היא נכשלת בכל מקום אחר מסיבה שאינה קשורה לקוד.
  const relative = join('mcp_server', 'map_scene.py');
  const candidates = [];
  if (process.env.ATLAS_ETL) candidates.push(join(process.env.ATLAS_ETL, relative));
  let cursor = HERE;
  for (let depth = 0; depth < 6; depth += 1) {
    candidates.push(join(cursor, 'ww2-atlas-etl', relative));
    candidates.push(join(cursor, 'Desktop', 'ww2-atlas-etl', relative));
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const found = candidates.find((path) => existsSync(path));
  if (found) {
    const source = readFileSync(found, 'utf8');
    const match = source.match(/TRANSPORT_MODES = \(([^)]*)\)/);
    assert.ok(match, 'לא נמצא TRANSPORT_MODES בשרת');
    const server = [...match[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    assert.deepEqual(new Set(server), new Set(TRANSPORT_MODES),
      'הלקוח והשרת חלוקים על רשימת אופני התובלה — אופן שנוסף בצד אחד ' +
      'פשוט לא יופיע בצד השני, בלי שום שגיאה');
  } else {
    console.log('  ⓘ ‏עץ ה-ETL לא נמצא; בדיקת התפר מול השרת דולגה');
  }
}

console.log('✅ שכבת התוואי: מדרג, היפוך, ״לא ידוע״, ציור ותפר');
