/**
 * שכבת הסצנה הדינמית — הפלט היחיד של ערוץ הצ׳אט→גרף→מפה.
 *
 * השכבה אינה יודעת דבר על מלחמת העולם השנייה מעבר ל-style tokens ול-motion
 * roles שהשרת מחזיר. היא מקבלת GeoJSON מוכן, בוחרת סמל וצבע מתוך טבלה סגורה,
 * ומציירת. הצ׳אט אינו יכול להזריק צבע, CSS, HTML או נכס גרפי.
 *
 * שלוש הבחנות שהשכבה מחויבת להן ויזואלית, וגם באנימציה:
 *   explicit  — מילוי מלא
 *   derived   — מילוי בהיר
 *   estimated — מסגרת מקווקוות בלבד
 *   context   — מקווקו דק, לעולם לא כטענה עובדתית
 *
 * ותוספת שנדרשת ברגע שיש תנועה: כל מה שזז בין שתי נקודות מתועדות מצויר
 * כשחזור — מקווקו, שקוף יותר, ועם תג ‏reconstruction שאי אפשר לכבות. תנועה
 * חלקה משכנעת מדי מכדי להשאיר אותה בלי סימון.
 */

import {
  colorOf, createSymbolCache, rgbaOf, symbolSize, visibleAtZoom, SYMBOL_COLORS,
} from './scene-symbols.js?v=map-channel-19';
import { casingOf, hexToRgb } from './atlas-palette.js?v=map-channel-19';
import {
  breathe, easeOutCubic, eventIntensity, partialPath, revealFraction, staggerOffset,
} from './scene-motion.js?v=map-channel-19';
import {
  DEFAULT_MODE, MODE_LABELS, MODE_NOTES, TRANSPORT_MODES,
  dashFor, fillFor, isKnownMode, lineFor,
} from './terrain-passability.js?v=map-channel-19';

const RECONSTRUCTED = new Set([
  'interpolated_between_documented_points',
  'scheduled_window_on_algorithmic_corridor',
]);

/** האם התנועה של הפיצ׳ר הזה היא שחזור ולא תיעוד. */
export function isReconstructed(properties) {
  return RECONSTRUCTED.has(properties.motion_basis)
    || properties.quality === 'estimated';
}

/** ‏מה שהעכבר צריך לומר: מה זה, של מי, ועד כמה זה ידוע. */
const BRANCH_HE = {
  armor: 'שריון', artillery: 'ארטילריה', infantry: 'חי"ר',
  mechanized_infantry: 'חי"ר מכני', motorized_infantry: 'חי"ר ממונע',
  anti_tank: 'נ"ט', air_defense: 'הגנה אווירית', airborne: 'מוטס',
  cavalry: 'פרשים', mountain_infantry: 'חי"ר הררי', engineers: 'הנדסה',
  marines: 'נחתים',
};
const QUALITY_HE = {
  explicit: 'מתועד', derived: 'נגזר', estimated: 'הערכה',
  context: 'הקשר', unknown: 'לא ידוע',
};
const MOTION_HE = {
  documented_snapshots: 'רצף תצלומים מתוארכים',
  interpolated_between_documented_points: 'שחזור בין נקודות מתועדות',
  scheduled_window_on_algorithmic_corridor: 'חלון זמן על פרוזדור מחושב',
};

export function describeFeature(properties) {
  if (!properties) return '';
  const parts = [properties.name_he || properties.name || properties.name_en];
  if (properties.echelon) parts.push(String(properties.echelon));
  if (properties.branch && BRANCH_HE[properties.branch]) {
    // ‏הענף זוהה מתבנית בשם היחידה ולא ממקור. אומרים את זה, לא מסתירים.
    const detected = properties.branch_basis === 'name_pattern';
    parts.push(BRANCH_HE[properties.branch] + (detected ? ' (זוהה מהשם)' : ''));
  }
  if (properties.quality && QUALITY_HE[properties.quality]) {
    parts.push(QUALITY_HE[properties.quality]);
  }
  if (MOTION_HE[properties.motion_basis]) parts.push(MOTION_HE[properties.motion_basis]);
  const said = parts.filter(Boolean);
  // ‏״ללא מקור״ הוא הערה על משהו; בלי שום תוכן אחר אין על מה להעיר.
  if (!said.length) return '';
  if (properties.has_provenance === false) said.push('ללא מקור');
  return said.join(' · ');
}

// ---- גאומטריה של תנועה ----------------------------------------------------

/** דגימה מחדש של קו ל-n נקודות שוות־מרחק, כדי שאפשר יהיה למזג שני קווים. */
export function resample(path, n = 96) {
  if (!Array.isArray(path) || path.length < 2) return [];
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    lengths.push(total);
  }
  if (total === 0) return new Array(n).fill(path[0]);
  const out = [];
  let cursor = 1;
  for (let i = 0; i < n; i += 1) {
    const target = (i / (n - 1)) * total;
    while (cursor < lengths.length - 1 && lengths[cursor] < target) cursor += 1;
    const span = lengths[cursor] - lengths[cursor - 1] || 1;
    const t = (target - lengths[cursor - 1]) / span;
    const a = path[cursor - 1];
    const b = path[cursor];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * ‏כיוון אחיד לשני קווים לפני מיזוג.
 *
 * ‏קווי החזית בגרף אינם שמורים בכיוון עקבי: חלקם רצים צפון→דרום וחלקם
 * ‏דרום→צפון. מיזוג לפי אינדקס בין שני כיוונים הפוכים מסובב את הקו סביב
 * ‏עצמו — הצפון קופץ לדרום ובחזרה. הבדיקה: אם היפוך הקו השני מקרב את שני
 * ‏הקצוות, הוא הפוך.
 */
export function alignDirection(a, b) {
  if (a.length < 2 || b.length < 2) return b;
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const asIs = d(a[0], b[0]) + d(a[a.length - 1], b[b.length - 1]);
  const flipped = d(a[0], b[b.length - 1]) + d(a[a.length - 1], b[0]);
  return flipped < asIs ? [...b].reverse() : b;
}

/** מיזוג שני קווים — הבסיס לזחילת קו החזית בין שני תאריכים מתועדים. */
export function tweenPaths(from, to, t, n = 96) {
  const a = resample(from, n);
  const b = alignDirection(a, resample(to, n));
  if (!a.length || !b.length) return a.length ? a : b;
  const k = Math.max(0, Math.min(1, t));
  return a.map((point, i) => [
    point[0] + (b[i][0] - point[0]) * k,
    point[1] + (b[i][1] - point[1]) * k,
  ]);
}

/**
 * הקו שיוצג ביום נתון, מתוך רצף תצלומים מתוארכים.
 * @returns {{path:Array, exact:boolean, from:?object, to:?object}}
 */
export function frontAtDay(snapshots, day) {
  const ordered = [...snapshots]
    .filter((f) => f.geometry && Number.isFinite(f.properties.day_from))
    .sort((x, y) => x.properties.day_from - y.properties.day_from);
  if (!ordered.length) return { path: [], exact: false, from: null, to: null };

  let before = ordered[0];
  let after = null;
  for (const snapshot of ordered) {
    if (snapshot.properties.day_from <= day) before = snapshot;
    else { after = snapshot; break; }
  }
  if (before.properties.day_from === day || !after) {
    return {
      path: before.geometry.coordinates,
      exact: before.properties.day_from === day,
      from: before, to: null,
    };
  }
  const span = after.properties.day_from - before.properties.day_from || 1;
  const t = (day - before.properties.day_from) / span;
  return {
    path: tweenPaths(before.geometry.coordinates, after.geometry.coordinates, t),
    exact: false, from: before, to: after,
  };
}

/** מיקום על מסלול מתוארך ביום נתון. מחזיר null מחוץ לטווח המתועד. */
export function positionOnTrack(stops, day) {
  if (!Array.isArray(stops) || stops.length < 2) return null;
  if (day <= stops[0].day) return { at: stops[0].at, exact: day === stops[0].day };
  const last = stops[stops.length - 1];
  if (day >= last.day) return { at: last.at, exact: day === last.day };
  for (let i = 1; i < stops.length; i += 1) {
    if (stops[i].day < day) continue;
    const a = stops[i - 1];
    const b = stops[i];
    const span = b.day - a.day || 1;
    const t = (day - a.day) / span;
    return {
      at: [a.at[0] + (b.at[0] - a.at[0]) * t, a.at[1] + (b.at[1] - a.at[1]) * t],
      exact: false,
    };
  }
  return null;
}

// ---- השכבה ----------------------------------------------------------------

export function createSceneOverlayLayer({
  ScatterplotLayer, PathLayer, TextLayer, IconLayer, PolygonLayer, TripsLayer,
  PathStyleExtension, CollisionFilterExtension,
}) {
  const symbols = createSymbolCache();

  // ‏אופן התובלה שנבחר. יושב כאן ולא בסצנה, כי הוא שאלה של הצופה ולא
  // ‏של הנתון: אותו תא בדיוק נותן תשובות הפוכות למשאית ולדוברה, וכל
  // ‏המקדמים כבר הגיעו עם התא. החלפה היא ציור מחדש, לא סיבוב לשרת.
  let transportMode = DEFAULT_MODE;

  // ‏‏deck.gl מתעלם מ-getDashArray אלא אם PathStyleExtension מחובר לשכבה.
  // ‏בלעדיו כל קו ״מקווקו״ נרסם כקו מלא, והשחזור נראה בדיוק כמו התיעוד —
  // ‏כלומר ההבחנה היחידה שהמשתמש ביקש נעלמת בלי שום שגיאה.
  const dashExtension = typeof PathStyleExtension === 'function'
    ? [new PathStyleExtension({ dash: true, highPrecisionDash: true })]
    : null;

  // ‏תוויות שמתנגשות זו בזו הופכות אשכול ערים לכתם. ‏CollisionFilterExtension
  // ‏משאיר את החשובה ומסתיר את השאר — מה שאטלס נייר עושה ביד.
  const collisionExtension = typeof CollisionFilterExtension === 'function'
    ? [new CollisionFilterExtension()]
    : null;

  /** תכונות הקו לפי מצב: מקווקו כשאפשר, ואחרת דק ושקוף יותר. */
  function dashed(dashArray, { width, colour }) {
    if (dashExtension) {
      return {
        getDashArray: dashArray,
        dashJustified: true,
        extensions: dashExtension,
        getWidth: width,
        getColor: colour,
      };
    }
    // ‏נפילה חיננית: בלי התוסף שומרים על ההבחנה ברוחב ובאטימות
    const thin = (value) => (typeof value === 'function'
      ? (f) => value(f) * 0.6 : value * 0.6);
    const faded = (value) => (typeof value === 'function'
      ? (f) => { const c = value(f); return c ? [c[0], c[1], c[2], Math.round((c[3] ?? 255) * 0.55)] : c; }
      : [colour[0], colour[1], colour[2], Math.round((colour[3] ?? 255) * 0.55)]);
    return { getWidth: thin(width), getColor: faded(colour) };
  }

  /**
   * ‏קו עם casing: קו כהה ורחב מתחת, קו הצבע מעליו.
   *
   * ‏זו הטכניקה הקרטוגרפית הרגילה להפרדת קו מרקע רועש — בלעדיה קו חזית
   * ‏כתום נעלם מעל שטח כתום. מחזיר שתי שכבות ולא אחת, כי deck.gl מצייר
   * ‏לפי סדר המערך.
   */
  function casedPath(id, { data, getPath, width, colour, casing, dash, pickable,
                           onPick }) {
    // ‏רוחב קבוע נשאר מספר ולא הופך לפונקציה: deck.gl מקבל accessor זול
    // ‏יותר, והבדיקות יכולות להשוות רוחב לרוחב.
    const isFn = typeof width === 'function';
    const widthOf = isFn ? width : () => width;
    const under = new PathLayer({
      id: `${id}-casing`,
      data,
      getPath,
      widthUnits: 'pixels',
      getWidth: isFn ? (f) => widthOf(f) + 3.2 : width + 3.2,
      widthMinPixels: 2,
      getColor: casing,
      pickable: false,
      parameters: { depthTest: false },
    });
    const over = new PathLayer({
      id,
      data,
      getPath,
      widthUnits: 'pixels',
      widthMinPixels: 1.4,
      ...(dash
        ? dashed(dash, { width: isFn ? widthOf : width, colour })
        : { getWidth: width, getColor: colour }),
      pickable: Boolean(pickable),
      onClick: onPick ? (info) => onPick(info) : undefined,
      parameters: { depthTest: false },
    });
    return [under, over];
  }

  // גרסאות deck.gl שונות אורזות סט שכבות שונה. אם IconLayer אינו זמין,
  // הסמלים יורדים לעיגולים במקום להפיל את כל הסצנה.
  const hasIcons = typeof IconLayer === 'function';
  function symbolLayer(id, { data, position, feature, onPick }) {
    if (hasIcons) {
      return new IconLayer({
        id, data, pickable: true, sizeUnits: 'pixels',
        getPosition: position,
        getIcon: (d) => symbols.iconFor(feature(d)),
        getSize: (d) => symbolSize(feature(d), lastZoom),
        onClick: (info) => onPick?.(info.object),
        updateTriggers: { getSize: [lastZoom], getIcon: [store.features.length] },
      });
    }
    return new ScatterplotLayer({
      id, data, pickable: true, radiusUnits: 'pixels', stroked: true,
      getPosition: position,
      getRadius: (d) => symbolSize(feature(d), lastZoom) * 0.42,
      getFillColor: (d) => rgbaOf(feature(d), 210),
      getLineColor: (d) => rgbaOf(feature(d), 255),
      onClick: (info) => onPick?.(info.object),
      updateTriggers: { getRadius: [lastZoom] },
    });
  }
  let lastZoom = 3;

  const store = {
    scene: null,
    features: [],
    listeners: new Set(),
    apply(scene, featureCollection) {
      this.scene = scene || null;
      this.features = (featureCollection?.features || []).filter((f) => f.geometry);
      for (const fn of this.listeners) fn(this);
    },
    merge(scene, featureCollection) {
      this.scene = scene || this.scene;
      const seen = new Set(this.features.map((f) => f.properties.entity_id));
      for (const feature of featureCollection?.features || []) {
        if (!feature.geometry) continue;
        if (seen.has(feature.properties.entity_id)) continue;
        seen.add(feature.properties.entity_id);
        this.features.push(feature);
      }
      for (const fn of this.listeners) fn(this);
    },
    clear() {
      this.scene = null;
      this.features = [];
      for (const fn of this.listeners) fn(this);
    },
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  };

  const cardSpec = {
    title: (item) => item.properties.name,
    subtitle: 'ישות מסצנה שהצ׳אט ביקש להציג',
    fieldsOf: (item, formatDay) => {
      const p = item.properties;
      // ‏תא תוואי אינו ישות היסטורית: אין לו צד, דרג או תאריך, וכל
      // ‏השדות הרגילים היו יוצאים ריקים. מה שיש לו הוא מקדם לכל כלי
      // ‏— והשורה החשובה היא זו שמראה שני כלים שלא מסכימים.
      if (p.entity_kind === 'TerrainCell') {
        const table = p.passability || {};
        const rows = TRANSPORT_MODES
          .filter((mode) => typeof table[mode] === 'number')
          .map((mode) => ({
            label: MODE_LABELS[mode] || mode,
            value: table[mode] === 0 ? 'חסום' : `${Math.round(table[mode] * 100)}%`,
            derivation: 'algorithmic',
            note: MODE_NOTES[mode],
          }));
        rows.push({
          label: 'מה משפיע',
          value: (p.factors || []).join(' · ') || 'שום שכבה לא חלה',
          derivation: 'algorithmic',
        });
        rows.push({
          label: 'על מה זה נשען',
          value: (p.coverage || []).join(' · ') || 'אין שכבה',
          derivation: 'algorithmic',
          note: p.terrain_unknown
            ? 'אין שום שכבת תוואי על התא הזה. המקדם 1.0 אינו ראיה שהתא פתוח.'
            : null,
        });
        if (p.relief_m != null) {
          rows.push({
            label: 'תבליט',
            value: `${p.relief_m} מ׳`,
            derivation: 'algorithmic',
            note: p.relief_scope === 'inherited_from_T0'
              ? 'נמדד כהפרש בין חמש דגימות על צלב של 1.8 ק״מ בתא־האב, ולא בתא הזה'
              : 'נמדד כהפרש בין חמש דגימות על צלב של 1.8 ק״מ',
          });
        }
        rows.push({
          label: 'סוג הטענה',
          value: p.quality,
          derivation: p.quality === 'derived' ? 'source' : 'algorithmic',
          note: 'פרופיל היתכנות — לא מסלול אספקה ולא קשר לתא שכן',
        });
        return rows.filter((row) => row.value != null && row.value !== '');
      }
      return [
        { label: 'סוג', value: p.entity_kind },
        { label: 'צד', value: p.nation || p.group_id },
        { label: 'דרג', value: p.echelon },
        { label: 'מתוארך', value: p.day_from == null ? 'לא ידוע' : formatDay(p.day_from) },
        { label: 'רזולוציית זמן', value: p.temporal_precision },
        { label: 'כמות', value: p.quantity_max ?? p.quantity_min },
        { label: 'נקודות מתועדות', value: p.stop_count },
        {
          label: 'סוג הטענה',
          value: p.quality,
          derivation: p.quality === 'explicit' ? 'source' : 'algorithmic',
          note: isReconstructed(p)
            ? 'התנועה המוצגת היא שחזור בין נקודות מתועדות, לא מסלול מתועד'
            : p.location_note || p.note || null,
        },
      ].filter((row) => row.value != null && row.value !== '');
    },
    sourcesOf: (item) => (item.properties.source_ids || []).map((id) => ({
      id, title: id, kind: 'source',
    })),
  };

  return {
    spec: {
      id: 'scene-overlay',
      label: 'סצנה מהצ׳אט',
      group: 'שאילתות',
      defaultOn: false,
      opacity: 1,
      cardSpec,
      legend: [
        { color: [222, 214, 198], label: 'טענה מפורשת', shape: 'square' },
        { color: [190, 182, 168], label: 'נגזר ממקור', shape: 'square' },
        { color: [160, 152, 140], label: 'שחזור — לא תיעוד', shape: 'line' },
        { color: [128, 122, 112], label: 'הקשר בלבד', shape: 'line' },
      ],
      legendContext: () => (store.scene
        ? `${store.scene.counts.located} ממוקמים · ${store.scene.counts.unlocated} ללא מיקום`
        : 'ממתין לפקודת צ׳אט'),

      async load() { return store; },

      build(data, ctx) {
        const {
          opacity = 1, onClick, zoom = 3, day = 0,
          animationTime = 0, motionEnabled = true,
        } = ctx;
        lastZoom = zoom;
        const features = store.features;
        if (!features.length) return [];

        const layers = [];
        const byKind = (kind) => features.filter((f) => f.properties.entity_kind === kind);

        // ---- תוואי: מצע החיכוך, מתחת לכל השאר ----
        //
        // ‏נדחף ראשון כדי שיצויר ראשון. תא מלא שמצויר אחרי סמל היה מכסה
        // ‏אותו, וקרב היה נעלם מתחת לקרקע שלו.
        const cells = byKind('TerrainCell');
        if (cells.length && PolygonLayer) {
          layers.push(new PolygonLayer({
            id: 'scene-terrain',
            data: cells,
            getPolygon: (f) => f.geometry.coordinates[0],
            filled: true,
            stroked: true,
            extruded: false,
            getFillColor: (f) => fillFor(f.properties, transportMode, opacity),
            getLineColor: (f) => lineFor(f.properties, opacity),
            getDashArray: (f) => dashFor(f.properties),
            dashJustified: true,
            extensions: dashExtension || [],
            getLineWidth: 1,
            lineWidthUnits: 'pixels',
            lineWidthMinPixels: 1,
            pickable: true,
            onClick: (info) => onClick?.(info.object, cardSpec),
            updateTriggers: {
              getFillColor: [transportMode, opacity],
              getLineColor: [opacity],
              getDashArray: [transportMode],
            },
          }));
        }
        const inWindow = (f) => {
          const { day_from: from, day_to: to } = f.properties;
          if (from == null) return true;
          return from <= day && (to ?? from) >= day;
        };
        // ‏נשימה עם האטה בקצוות במקום סינוס גולמי: סינוס נקרא כלולאה של
        // ‏מכונה, עקומה עם ease-in-out נקראת כתנועה מכוונת.
        const pulse = motionEnabled ? breathe(animationTime, 2.6) : 0.6;

        // ---- קו חזית: זוחל בין תצלומים מתוארכים ----
        const snapshots = byKind('FrontLineSnapshot');
        if (snapshots.length) {
          const { path, exact, from, to } = frontAtDay(snapshots, day);
          if (path.length > 1) {
            const colour = SYMBOL_COLORS.fronts;
            const rgb = hexToRgb(colour);
            // ‏הילה רחבה שנושמת: נותנת לחזית נוכחות של אזור לחימה ולא של
            // ‏קו על מפה. ‏blending חיבורי גורם לחפיפות להאיר במקום להכהות.
            layers.push(new PathLayer({
              id: 'scene-front-glow',
              data: [{ path }],
              getPath: (d) => d.path,
              widthUnits: 'pixels',
              getWidth: 15 + pulse * 7,
              widthMinPixels: 10,
              getColor: [...rgb, Math.round((34 + pulse * 26) * opacity)],
              pickable: false,
              parameters: { depthTest: false },
              updateTriggers: { getWidth: [pulse], getColor: [pulse] },
            }));
            layers.push(...casedPath('scene-front-line', {
              data: [{ path, exact }],
              getPath: (d) => d.path,
              width: exact ? 3.6 : 2.8,
              colour: [...rgb, Math.round((exact ? 252 : 205) * opacity)],
              casing: [...hexToRgb(casingOf(colour)), Math.round(210 * opacity)],
              dash: exact ? null : [6, 4],
            }));
            layers.push(new PathLayer({
              id: 'scene-front-hit',
              data: [{ path, exact }],
              getPath: (d) => d.path,
              widthUnits: 'pixels',
              getWidth: 12,
              getColor: [0, 0, 0, 0],
              pickable: true,
              onClick: (info) => onClick?.({
                properties: {
                  name: exact
                    ? `קו חזית ${from?.properties.day_from != null ? '' : ''}`.trim() || 'קו חזית'
                    : 'קו חזית — מסגרת מוערכת',
                  entity_kind: 'FrontLineSnapshot',
                  quality: exact ? 'explicit' : 'estimated',
                  motion_basis: exact ? 'documented_snapshot'
                    : 'interpolated_between_documented_points',
                  day_from: day,
                  source_ids: from?.properties.source_ids || [],
                },
              }, cardSpec),
            }));
            // שיני מסור לצד המחזיק — הופך קו לחזית עם כיוון
            if (zoom >= 5) {
              const teeth = [];
              for (let i = 2; i < path.length - 2; i += 4) {
                const [x1, y1] = path[i - 1];
                const [x2, y2] = path[i + 1];
                const dx = x2 - x1;
                const dy = y2 - y1;
                const len = Math.hypot(dx, dy) || 1;
                const size = 0.055;
                teeth.push({ path: [
                  path[i],
                  [path[i][0] - (dy / len) * size, path[i][1] + (dx / len) * size],
                ] });
              }
              layers.push(new PathLayer({
                id: 'scene-front-teeth',
                data: teeth,
                getPath: (d) => d.path,
                widthUnits: 'pixels',
                getWidth: 1.8,
                getColor: [...rgb, Math.round(200 * opacity)],
                pickable: false,
              }));
            }
          }
        }

        // ---- מסלולי יחידות: קו מקווקו + סמל שנע עליו ----
        const tracks = byKind('UnitTrack').filter((f) =>
          f.properties.day_from <= day && f.properties.day_to >= day);
        if (tracks.length) {
          // ‏המסלול נחשף בהדרגה עד היום הנוכחי במקום להופיע שלם. הקו
          // ‏עדיין מקווקו — הוא שחזור — אבל הוא גם לא מקדים את הזמן.
          const revealed = tracks.map((f) => ({
            feature: f,
            path: partialPath(f.geometry.coordinates,
              revealFraction(f.properties, day)),
          })).filter((d) => d.path.length >= 2);
          layers.push(...casedPath('scene-track-lines', {
            data: revealed,
            getPath: (d) => d.path,
            width: 1.9,
            colour: (d) => rgbaOf(d.feature.properties, Math.round(165 * opacity)),
            // ‏אותו כלל כמו בשאר הקווים: casing כהה מהצבע עצמו. הילה
            // ‏בהירה עובדת רק מעל קרקע בהירה, וכאן הרקע משתנה.
            casing: (d) => [...hexToRgb(casingOf(colorOf(d.feature.properties))),
              Math.round(150 * opacity)],
            dash: [5, 4],
            pickable: true,
            onPick: (info) => onClick?.(info.object?.feature, cardSpec),
          }));
          // הנקודות המתועדות עצמן — מלאות, בניגוד לקו שביניהן
          const stops = tracks.flatMap((f) => (f.properties.stops || [])
            .map((stop) => ({ ...stop, parent: f.properties })));
          layers.push(new ScatterplotLayer({
            id: 'scene-track-stops',
            data: stops,
            getPosition: (d) => d.at,
            radiusUnits: 'pixels',
            getRadius: 3.2,
            getFillColor: (d) => rgbaOf(d.parent, Math.round(235 * opacity)),
            pickable: false,
          }));
          const moving = tracks
            .map((f) => {
              const at = positionOnTrack(f.properties.stops, day);
              return at ? { feature: f, position: at.at, exact: at.exact } : null;
            })
            .filter(Boolean);
          if (moving.length) {
            layers.push(symbolLayer('scene-track-markers', {
              data: moving,
              position: (d) => d.position,
              feature: (d) => d.feature.properties,
              onPick: (d) => onClick?.(d.feature, cardSpec),
            }));
          }
        }

        // ---- הפלגות: ספינה שנעה בין אבדות מתועדות ----
        const voyages = byKind('ConvoyVoyage').filter(inWindow);
        if (voyages.length && TripsLayer) {
          const sailing = voyages
            .map((f) => {
              const losses = f.properties.losses || [];
              if (losses.length < 2) return null;
              const stops = losses
                .filter((l) => Number.isFinite(l.day))
                .sort((a, b) => a.day - b.day);
              const at = positionOnTrack(stops, day);
              return at ? { feature: f, position: at.at } : null;
            })
            .filter(Boolean);
          if (sailing.length) {
            layers.push(symbolLayer('scene-voyage-ships', {
              data: sailing,
              position: (d) => d.position,
              feature: (d) => d.feature.properties,
              onPick: (d) => onClick?.(d.feature, cardSpec),
            }));
          }
        }

        // ---- קווים ופוליגונים כלליים ----
        const lines = features.filter((f) =>
          f.geometry.type === 'LineString'
          && !['FrontLineSnapshot', 'UnitTrack'].includes(f.properties.entity_kind)
          && inWindow(f));
        if (lines.length) {
          layers.push(...casedPath('scene-lines', {
            data: lines,
            getPath: (f) => f.geometry.coordinates,
            width: (f) => (f.properties.quality === 'explicit' ? 3 : 2),
            colour: (f) => rgbaOf(f.properties, Math.round(214 * opacity)),
            casing: (f) => [...hexToRgb(casingOf(colorOf(f.properties))),
              Math.round(185 * opacity)],
            dash: (f) => (isReconstructed(f.properties) ? [5, 4] : [0, 0]),
            pickable: true,
            onPick: (info) => onClick?.(info.object, cardSpec),
          }));
        }

        // ---- נקודות: סמלים, עם LOD ----
        const points = features.filter((f) =>
          f.geometry.type === 'Point'
          && !['ConvoyVoyage'].includes(f.properties.entity_kind)
          && inWindow(f)
          && visibleAtZoom(f.properties, zoom));

        if (points.length) {
          // הילת פעימה לקרבות פעילים — האירוע הכי חשוב על המסך
          const battles = points.filter((f) => f.properties.entity_kind === 'Battle');
          if (battles.length) {
            // ‏כל קרב פועם בפאזה משלו ובעוצמה שנגזרת מהתאריך שלו. פעימה
            // ‏אחידה לכולם קוראת כמו הבהוב של המסך; פאזות מפוזרות קוראות
            // ‏כשדה חי. קרב שהיום רחוק ממנו דועך ואינו מבהב לשווא.
            const beat = (f) => (motionEnabled
              ? breathe(animationTime, 2.6, staggerOffset(f.properties.entity_id))
              : 0.6);
            const heat = (f) => eventIntensity(f.properties, day);
            for (const [id, scale, alpha] of [
              ['scene-battle-halo', 1.85, 26], ['scene-battle-pulse', 1.15, 58]]) {
              layers.push(new ScatterplotLayer({
                id,
                data: battles,
                getPosition: (f) => f.geometry.coordinates,
                radiusUnits: 'pixels',
                getRadius: (f) => symbolSize(f.properties, zoom) * scale
                  * (0.72 + beat(f) * 0.55) * (0.55 + heat(f) * 0.45),
                getFillColor: (f) => rgbaOf(
                  f.properties, Math.round(alpha * opacity * (0.35 + heat(f) * 0.65))),
                pickable: false,
                updateTriggers: {
                  getRadius: [animationTime, zoom, day, motionEnabled],
                  getFillColor: [day, opacity],
                },
              }));
            }
          }
          layers.push(symbolLayer('scene-symbols', {
            data: points,
            position: (f) => f.geometry.coordinates,
            feature: (f) => f.properties,
            onPick: (f) => onClick?.(f, cardSpec),
          }));

          if (zoom >= 6) {
            // ‏אטלס נייר לא מתייג כל כפר. ככל שמתרחקים, רק הישויות הכבדות
            // ‏מקבלות שם — זה מה שמונע את כתם התוויות באשכולות ערים.
            const labelFloor = zoom >= 8 ? 0 : zoom >= 7 ? 0.42 : 0.62;
            const labelled = points
              .filter((f) => {
                const weight = Number(f.properties.display_weight);
                if (!Number.isFinite(weight)) return zoom >= 7;
                return weight >= labelFloor;
              })
              .sort((a, b) => (Number(b.properties.display_weight) || 0)
                - (Number(a.properties.display_weight) || 0))
              .slice(0, 120);
            layers.push(new TextLayer({
              id: 'scene-labels',
              data: labelled,
              getPosition: (f) => f.geometry.coordinates,
              getText: (f) => f.properties.name || '',
              getSize: (f) => (f.properties.display_weight >= 0.62 ? 13 : 11),
              getPixelOffset: (f) => [0, -symbolSize(f.properties, zoom) * 0.62 - 4],
              getColor: [247, 243, 233, Math.round(242 * opacity)],
              fontFamily: 'system-ui, sans-serif',
              fontWeight: 600,
              // ‏רקע כהה במקום מתאר: ‏outlineWidth ב-deck.gl דורש אטלס SDF,
              // ‏ואטלס כזה נכשל בשקט על מחרוזות עבריות ומעלים את כל התוויות.
              // ‏שבב רקע קריא מעל כל שטח, וזה גם מה שאטלס נייר עושה.
              background: true,
              getBackgroundColor: [26, 23, 19, Math.round(198 * opacity)],
              backgroundPadding: [5, 2, 5, 2],
              getBorderColor: [247, 243, 233, Math.round(64 * opacity)],
              getBorderWidth: 0.8,
              characterSet: 'auto',
              pickable: false,
              // ‏‏CollisionFilterExtension נוסה כאן והעלים את **כל** התוויות
              // ‏בלי שגיאה. במקום סינון התנגשויות, התוויות מוגבלות לישויות
              // ‏החשובות בזום הנוכחי — פחות תוויות, ולכן פחות התנגשויות.
              updateTriggers: { getSize: [zoom], getPixelOffset: [zoom] },
            }));
          }

          // תג ציוד: כמות ליד היחידה, רק כשיש זום ומספר
          if (zoom >= 8) {
            const withQuantity = points.filter((f) =>
              f.properties.quantity_max != null || f.properties.quantity_min != null);
            if (withQuantity.length) {
              layers.push(new TextLayer({
                id: 'scene-quantities',
                data: withQuantity,
                // ‏ספרות בלבד, אבל מוצהר במפורש: אטלס גופנים שנבנה
                // ‏מברירת מחדל הוא בדיוק מה שהעלים את שאר התוויות.
                characterSet: [...'0123456789,.-'],
                getPosition: (f) => f.geometry.coordinates,
                getText: (f) => String(f.properties.quantity_max ?? f.properties.quantity_min),
                getSize: 10,
                getPixelOffset: (f) => [symbolSize(f.properties, zoom) * 0.62, 4],
                getColor: [244, 186, 83, Math.round(240 * opacity)],
                fontFamily: 'ui-monospace, monospace',
                outlineWidth: 2,
                outlineColor: [16, 19, 23, 230],
                pickable: false,
              }));
            }
          }
        }

        return layers;
      },
    },
    store,
    symbols,
    /** ‏האופן הנבחר. הקורא אחראי לקרוא ל-refreshLayers אחרי החלפה. */
    getTransportMode: () => transportMode,
    setTransportMode(mode) {
      if (!isKnownMode(mode)) return false;
      transportMode = mode;
      return true;
    },
  };
}
