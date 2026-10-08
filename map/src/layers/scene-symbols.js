/**
 * ‏סמלי הסצנה — איורים, לא סמלולוגיה מופשטת.
 *
 * ‏עיר נראית כמו עיר, מחנה כמו מחנה, טנק כמו טנק. אין מעוינים, אין
 * ‏ריבועים, אין איקסים: מי שמסתכל על המפה מזהה מה הוא רואה בלי מקרא.
 * ‏האיורים עצמם יושבים ב-`scene-art.js`; הקובץ הזה עוסק בשאלה איך הם
 * ‏נצבעים, כמה הם ברורים, ומה קורה כשהראיה חלשה.
 *
 * ‏שלוש שכבות מסביב לכל איור, וכולן קיימות מסיבה מעשית:
 *   • **צל** אליפטי על הקרקע — נותן לאובייקט משקל ומפריד אותו מהרקע.
 *   • **הילה** בהירה — ה-casing הקרטוגרפי. בלעדיה איור כתום נעלם מעל שטח כתום.
 *   • **מתאר** כהה — קצה מוגדר בכל גודל.
 *
 * ‏דרגת הראיה משנה **רוויה ומילוי**, לא גוון: טענה מפורשת מצוירת מלאה,
 * ‏הערכה מצוירת חיוורת עם בסיס מקווקו. גוון אחר היה נקרא כצד אחר.
 */

import { CLAIM, HUES, INK, hexToRgb, shade, withAlpha } from './atlas-palette.js?v=map-channel-19';
import { ART, ART_GROUND, ART_SIZE } from './scene-art.js?v=map-channel-19';

const SIDE_COLORS = { ...HUES };
const QUALITY_STYLE = CLAIM;
const SIZE = ART_SIZE;

/** ‏דרג → כמה נקודות דרגה מתחת לאיור. אין איקסים; נקודות נספרות במבט. */
const ECHELON_BARS = {
  brigade: 1, division: 2, corps: 3, army: 4, 'army group': 5,
  regiment: 0, battalion: 0,
};

/**
 * ‏גוונים לפי סוג ישות, כשהצד אינו רלוונטי.
 *
 * ‏ביצור אינו ״של הציר״ או ״של הברית״ — הוא מבנה. עד עכשיו הוא ירש את
 * ‏גוון קבוצת החזית וצויר ורוד־כתום, מה שקרא כאירוע ולא כאבן.
 */
const KIND_HUES = {
  Fortification: 'fortification',
  Camp: 'persecution',
  Plant: 'logistics',
  Station: 'logistics',
  RailNode: 'logistics',
  Bridge: 'logistics',
  RiverCrossing: 'logistics',
  Port: 'naval',
  City: 'places',
  Sinking: 'naval',
  ConvoyVoyage: 'naval',
  NavalAsset: 'naval',
  AirRaid: 'air',
  RaidTarget: 'air',
  Battle: 'events',
  CaptureEvent: 'events',
};

export function sideOf(properties) {
  const byKind = KIND_HUES[properties.entity_kind];
  if (byKind) return byKind;
  const token = String(properties.style_token || '');
  if (token.includes('.axis')) return 'axis';
  if (token.includes('.allies')) return 'allies';
  if (token.includes('.soviet')) return 'soviet';
  return properties.group_id || 'unknown';
}

export function colorOf(properties) {
  return SIDE_COLORS[sideOf(properties)] || SIDE_COLORS.unknown;
}

export function rgbaOf(properties, alpha = 255) {
  return [...hexToRgb(colorOf(properties)), alpha];
}

/** ‏ענף היחידה → האיור. הערכים הם אלה שקיימים בגרף בפועל. */
const BRANCH_SHAPES = {
  armor: 'armor',
  mechanized_infantry: 'mech',
  motorized_infantry: 'motor',
  artillery: 'artillery',
  anti_tank: 'antitank',
  air_defense: 'airdefense',
  airborne: 'airborne',
  cavalry: 'cavalry',
  mountain_infantry: 'mountain',
  engineers: 'engineer',
  marines: 'marines',
  infantry: 'infantry',
};

/**
 * ‏דרגת היישוב לפי המשקל שהשרת חישב.
 *
 * ‏באטלס נייר, עיר גדולה מצוירת אחרת מכפר — לא רק גדולה יותר. ארבע
 * ‏הדרגות כאן הן ארבעה איורים שונים, ולכן הן נכנסות למפתח המטמון.
 * ‏המשקל מגיע מ-`population_today`, שהוא **פרוקסי מודרני ולא נתון
 * ‏מלחמתי** — ה-tooltip אומר זאת, כי גודל על מפה נקרא כטענה.
 */
function cityTier(properties) {
  const weight = Number(properties.display_weight);
  if (!Number.isFinite(weight)) return 'place_town';
  if (weight >= 0.82) return 'place_metro';
  if (weight >= 0.62) return 'place_city';
  if (weight >= 0.42) return 'place_town';
  return 'place_village';
}

function shapeFor(properties) {
  const kind = properties.entity_kind;
  if (kind === 'Battle' || kind === 'MapAnchor') return 'battle';
  if (kind === 'Sinking') return 'sinking';
  if (kind === 'AirRaid' || kind === 'RaidTarget') return 'air';
  if (kind === 'Camp' || kind === 'TransportDestination') return 'camp';
  if (kind === 'Fortification') return 'fort';
  if (kind === 'Port') return 'port';
  if (kind === 'ConvoyVoyage' || kind === 'NavalAsset') return 'ship';
  if (kind === 'Station' || kind === 'RailNode' || kind === 'Bridge'
      || kind === 'RiverCrossing') return 'rail';
  if (kind === 'Plant') return 'plant';
  if (kind === 'SupplyObservation') return 'supply';
  if (kind === 'City' || kind === 'CPPlace' || kind === 'TransportOrigin') {
    return cityTier(properties);
  }
  if (kind === 'CaptureEvent') return 'capture';
  const token = String(properties.style_token || '');
  if (token.includes('unit.hq') || properties.location_role === 'headquarters') return 'hq';
  const branch = BRANCH_SHAPES[String(properties.branch || '').toLowerCase()];
  if (branch) return branch;
  if (token.includes('armor')) return 'armor';
  return 'infantry';
}

/** ‏האיורים שמייצגים יחידה, ולכן נושאים נקודות דרג. */
const UNIT_ART = new Set(['infantry', 'armor', 'mech', 'motor', 'artillery',
  'antitank', 'airdefense', 'airborne', 'cavalry', 'mountain', 'engineer',
  'marines', 'hq']);

/**
 * ‏ערכת הצבע לאיור אחד. ‏`fill` היא הדרך היחידה שהאיורים צובעים, כדי
 * ‏שדרגת הראיה תשלוט בכולם ממקום אחד.
 */
function painterFor(colour, style) {
  // ‏הלבנה לכיוון הקרקע במקום הורדת אטימות: איור שקוף מגלה את השטח
  // ‏שמתחתיו והופך לבוצי, איור מולבן נשאר נקי ורק נסוג אחורה.
  const wash = (hex) => shade(hex, style.wash * 0.9);
  const tones = {
    body: wash(colour),
    dark: wash(shade(colour, -0.42)),
    light: wash(shade(colour, 0.52)),
  };
  const outlined = style.fill < 0.5;
  return {
    ...tones,
    fill(ctx, points, tone = 'body') {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = withAlpha(tones[tone] || tones.body,
        outlined ? style.fill : style.ink);
      ctx.fill();
      if (outlined) {
        // ‏הערכה והקשר מצוירים כקווי מתאר: הצופה רואה מיד שזה לא ציור מלא
        ctx.strokeStyle = withAlpha(shade(colour, -0.25), style.stroke * 0.85);
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    },
  };
}

/** ‏צל רך על הקרקע — מה שנותן לאיור לעמוד ולא לרחף. */
function groundShadow(ctx, alpha) {
  // ‏קנבס ללא gradient (בדיקות, סביבות חלקיות) מקבל צבע שטוח במקום לקרוס.
  let paintStyle = withAlpha(INK.outline, 0.16 * alpha);
  const grad = ctx.createRadialGradient
    ? ctx.createRadialGradient(36, ART_GROUND + 3, 2, 36, ART_GROUND + 3, 26)
    : null;
  if (grad && typeof grad.addColorStop === 'function') {
    grad.addColorStop(0, withAlpha(INK.outline, 0.30 * alpha));
    grad.addColorStop(1, withAlpha(INK.outline, 0));
    paintStyle = grad;
  }
  ctx.save();
  ctx.scale(1, 0.32);
  ctx.fillStyle = paintStyle;
  ctx.beginPath();
  ctx.arc(36, (ART_GROUND + 3) / 0.32, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** ‏נקודות דרג מתחת לאיור. אין איקסים; נקודות נספרות במבט אחד. */
function echelonPips(ctx, colour, count) {
  if (!count) return;
  const spacing = 8;
  const startX = 36 - ((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i += 1) {
    const x = startX + i * spacing;
    ctx.beginPath();
    ctx.arc(x, ART_GROUND + 9, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(INK.halo, 0.94);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, ART_GROUND + 9, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  }
}

/** ‏בסיס מקווקו לטענה שאינה מפורשת. */
function estimatedBase(ctx, colour) {
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = withAlpha(colour, 0.75);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, ART_GROUND + 3);
  ctx.lineTo(60, ART_GROUND + 3);
  ctx.stroke();
  ctx.restore();
}

/**
 * מפתח סמל — מה שקובע אם צריך לצייר מחדש.
 * @returns {string} shape|side|quality|bars
 */
export function symbolKey(properties) {
  const quality = QUALITY_STYLE[properties.quality] ? properties.quality : 'unknown';
  const bars = ECHELON_BARS[String(properties.echelon || '').toLowerCase()] ?? 0;
  return `${shapeFor(properties)}|${sideOf(properties)}|${quality}|${bars}`;
}

/**
 * אטלס סמלים לפי דרישה. מחזיר {url, width, height, anchorY} ל-IconLayer.
 * @param {Function} makeCanvas — הזרקה לצורך בדיקה ללא דפדפן
 */
export function createSymbolCache({ makeCanvas } = {}) {
  const cache = new Map();
  const create = makeCanvas || ((size) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  });

  function iconFor(properties) {
    const key = symbolKey(properties);
    const hit = cache.get(key);
    if (hit) return hit;

    const [shape, side, quality, bars] = key.split('|');
    const canvas = create(SIZE);
    const ctx = canvas.getContext('2d');
    const colour = SIDE_COLORS[side] || SIDE_COLORS.unknown;
    const style = QUALITY_STYLE[quality] || QUALITY_STYLE.unknown;
    const paint = ART[shape] || ART.place_town;
    const painter = painterFor(colour, style);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    groundShadow(ctx, style.halo);
    if (style.fill <= 0.5) estimatedBase(ctx, colour);

    // ‏ההילה: מציירים את האיור דרך צל־קנבס בהיר. זו הדרך הנכונה לעטוף
    // ‏צללית שרירותית — מתאר ידני היה דורש לדעת את הנתיב מראש, והאיורים
    // ‏מורכבים מעשרות נתיבים נפרדים.
    ctx.save();
    ctx.shadowColor = withAlpha(INK.halo, 0.95 * style.halo);
    ctx.shadowBlur = 7;
    paint(ctx, painter);
    paint(ctx, painter);
    ctx.restore();

    // ‏צל דק וכהה נותן עומק ומפריד את האיור מהשטח שמאחוריו.
    ctx.save();
    ctx.shadowColor = withAlpha(INK.outline, 0.42 * style.stroke);
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1.4;
    paint(ctx, painter);
    ctx.restore();

    paint(ctx, painter);
    if (UNIT_ART.has(shape)) echelonPips(ctx, colour, Number(bars) || 0);

    const icon = {
      id: key,
      url: canvas.toDataURL ? canvas.toDataURL('image/png') : `symbol:${key}`,
      width: SIZE,
      height: SIZE,
      anchorY: SIZE * 0.82,
      mask: false,
    };
    cache.set(key, icon);
    return icon;
  }

  return { iconFor, symbolKey, size: SIZE, cache };
}

/**
 * ‏גודל הסמל בפיקסלים.
 *
 * ‏שני דברים משפיעים: הזום, ו-`display_weight` — משקל 0..1 שהשרת מחשב
 * ‏לישות. עיר גדולה מצוירת גדולה מעיירה, וקרב גדול גדול מתקרית. בלי
 * ‏משקל, הדרג הוא מה שקובע.
 */
export function symbolSize(properties, zoom) {
  const echelonWeight = ECHELON_BARS[String(properties.echelon || '').toLowerCase()] ?? 0;
  const base = zoom < 4 ? 18 : zoom < 6 ? 26 : zoom < 8 ? 34 : 42;
  const weight = Number(properties.display_weight);
  const importance = Number.isFinite(weight)
    ? 0.62 + Math.max(0, Math.min(1, weight)) * 0.78
    : 1 + echelonWeight * 0.09;
  const kindBoost = properties.entity_kind === 'Battle' ? 1.3 : 1;
  return Math.round(base * importance * kindBoost);
}

/** האם הישות הזו נכנסת לתצוגה ברמת הזום הנוכחית (סעיף 10 במפרט). */
export function visibleAtZoom(properties, zoom) {
  const kind = properties.entity_kind;
  const alwaysOn = new Set(['Battle', 'FrontLineSnapshot', 'FrontLine',
    'CaptureEvent', 'ConvoyVoyage', 'UnitTrack']);
  if (alwaysOn.has(kind)) return true;
  // ‏עיר גדולה נראית מוקדם, כפר מופיע רק בזום גבוה — כמו בכל אטלס.
  if (kind === 'City') {
    const weight = Number(properties.display_weight);
    if (!Number.isFinite(weight)) return zoom >= 7;
    if (weight >= 0.82) return zoom >= 3;
    if (weight >= 0.62) return zoom >= 4.5;
    if (weight >= 0.42) return zoom >= 6;
    return zoom >= 7.5;
  }
  if (kind === 'RailNode' || kind === 'Station' || kind === 'Bridge'
      || kind === 'RiverCrossing') return zoom >= 7;
  if (kind === 'Fortification') return zoom >= 6;
  if (kind === 'Sinking' || kind === 'AirRaid') return zoom >= 4;
  return zoom >= 5;
}

export const SYMBOL_COLORS = SIDE_COLORS;
export const SYMBOL_QUALITY = QUALITY_STYLE;
export { BRANCH_SHAPES, ECHELON_BARS };
