import { loadJson } from '../core/data-store.js?v=map-channel-19';
import {
  cityBudget, polityFontSize, polityVisible,
} from './map-labels.js?v=map-channel-19';

const URLS = {
  territories: './data/legacy/territories.json',
  places: './data/legacy/places.json',
  battles: './data/legacy/battles.json',
  railways: './data/legacy/railways.json',
  infrastructure: './data/legacy/infrastructure.json',
};

// ‏המטמון הזה היה מקומי למודול, ולכן שכבות אחרות משכו את אותם קבצים
// ‏שוב ושוב. הוא עבר ל-`core/data-store.js` ומשותף עכשיו לכולן.

const SOURCE = [{
  id: 'legacy_ww2_timeline_map',
  name: 'קובץ האטלס המחקרי המקורי — ייבוא קריאה בלבד',
}];

const CONTROL_COLORS = {
  axis: [166, 76, 60, 102],
  occ: [194, 119, 103, 86],
  allies: [69, 119, 159, 88],
  neutral: [196, 188, 162, 70],
  other: [171, 163, 145, 60],
};

const POLITY_COLORS = {
  axis: [126, 55, 38, 238],
  occ: [157, 90, 68, 225],
  allies: [31, 79, 118, 238],
  neutral: [104, 98, 83, 220],
  other: [98, 92, 82, 205],
};

const SITE_STYLE = {
  extermination: { color: [119, 24, 22, 245], shape: '■', label: 'מרכז השמדה' },
  concentration: { color: [174, 54, 39, 240], shape: '●', label: 'מחנה ריכוז' },
  ghetto: { color: [42, 93, 130, 235], shape: '◆', label: 'גטו' },
  subcamp: { color: [134, 88, 72, 225], shape: '▪', label: 'מחנה משנה' },
};

const INDUSTRY_HE = {
  aero_engine: 'מנועי מטוסים', aircraft: 'מטוסים', aluminum: 'אלומיניום',
  armaments: 'חימוש', ball_bearing: 'מיסבים', chemical: 'כימיה',
  oil: 'דלק ונפט', shipbuilding: 'בניית אוניות', steel: 'פלדה',
  tank: 'טנקים ורכב משוריין', vehicle: 'רכב', other: 'תעשייה',
};

function periodAt(periods, day, from = 'day', to = 'until') {
  let selected = null;
  for (const period of periods || []) {
    if (period[from] <= day && day < period[to]) return period;
    if (period[from] <= day) selected = period;
  }
  return selected;
}

function value(value) {
  return value == null ? null : Number(value).toLocaleString('he-IL');
}

function legacyCard(title, subtitle, fieldsOf) {
  return {
    title,
    subtitle,
    fieldsOf,
    sourcesOf: () => SOURCE,
  };
}

export function createLegacyTerritoriesLayer({ GeoJsonLayer }) {
  let cachedPeriod = null;
  let cachedFeatures = [];
  const card = legacyCard(
    (item) => item.properties?.name || 'שטח שליטה',
    'שליטה בפועל במפת המצב החודשית',
    (item) => {
      const p = item.properties || {};
      return [
        { label: 'סיווג', value: p.class_he },
        { label: 'תקופת מצב', value: p.period },
        { label: 'סטטוס', value: p.status },
        { label: 'ראש מדינה', value: p.head },
        { label: 'ממשלה גולה', value: p.exile },
        { label: 'רזולוציה', value: 'מפת מצב חודשית', derivation: 'algorithmic' },
      ];
    },
  );
  const classHe = {
    axis: 'מעצמת ציר', occ: 'כבוש בידי הציר', allies: 'בעלות הברית',
    neutral: 'ניטרלי', other: 'אחר',
  };

  return {
    id: 'legacy-territories',
    label: 'שליטה בפועל — 88 מפות מצב',
    group: 'שליטה ורקע',
    defaultOn: false,
    opacity: 0.86,
    legend: [
      { color: CONTROL_COLORS.axis.slice(0, 3), label: 'מעצמות הציר', shape: 'square' },
      { color: CONTROL_COLORS.occ.slice(0, 3), label: 'שטח כבוש', shape: 'square' },
      { color: CONTROL_COLORS.allies.slice(0, 3), label: 'בעלות הברית', shape: 'square' },
      { color: CONTROL_COLORS.neutral.slice(0, 3), label: 'ניטרלי', shape: 'square' },
    ],
    legendContext: 'פוליגוני מצב חודשיים מהאטלס המקורי; גריד החזית היומי מוצג מעליהם.',
    load: () => loadJson(URLS.territories),
    build(data, { day, opacity, onClick }) {
      const periods = data.territories?.periods || [];
      const pool = data.territories?.pool || [];
      const period = periodAt(periods, day);
      if (period !== cachedPeriod) {
        cachedPeriod = period;
        cachedFeatures = (period?.feats || []).map((item, index) => ({
          type: 'Feature',
          id: `territory:${period.day}:${index}`,
          geometry: pool[item.gi],
          properties: {
            name: item.r || 'לא ידוע', class: item.c, class_he: classHe[item.c] || item.c,
            period: period.label, status: item.s, head: item.h, exile: item.x,
          },
        }));
      }
      return new GeoJsonLayer({
        id: 'legacy-territory-polygons',
        data: { type: 'FeatureCollection', features: cachedFeatures },
        pickable: true,
        autoHighlight: true,
        filled: true,
        stroked: true,
        opacity,
        getFillColor: (feature) => CONTROL_COLORS[feature.properties.class] || CONTROL_COLORS.other,
        getLineColor: [112, 99, 77, 105],
        getLineWidth: 0.6,
        lineWidthUnits: 'pixels',
        onClick: (info) => info.object && onClick?.(info.object, card),
      });
    },
  };
}

//: ‏דיו לשמות מדינות. גוונים כהים על נייר — לא צבעי הצדדים, שלא
//: ‏ייקראו כטענת שליטה נוספת מעל השטיפה.
const POLITY_INK = {
  axis: '#7d3a18', occ: '#8a5a33', allies: '#1d4e73',
  neutral: '#6d6046', other: '#6b6257',
};

export function createLegacyPoliticalLabelsLayer() {
  let pendingLabels = [];
  return {
    labels: () => pendingLabels,
    id: 'legacy-political-labels',
    label: 'שמות מדינות משתנים בזמן',
    group: 'שליטה ורקע',
    defaultOn: false,
    opacity: 0.94,
    legend: [{ color: [52, 53, 50], label: 'שם הישות המדינית בתאריך', shape: 'square' }],
    load: () => loadJson(URLS.territories),
    build(data, { day, opacity, zoom = 3, project, viewportSize }) {
      const labels = data.political_labels || {};
      const period = periodAt(labels.periods, day, 'd', 'u');
      // ⚠️ ‏כאן היה **סף שטח קבוע**: בזום אירופה רק שטח ≥ 80 עבר, ובתקופה
      // ‏טיפוסית זו מדינה אחת. מפה של אירופה ב-1942 הראתה שם אחד.
      // ‏עכשיו מנסים את כולן לפי גודל, ומנוע הפריסה מוותר רק על מה
      // ‏שאין לו מקום.
      const ranked = (period?.l || [])
        .map((row) => ({
          name: labels.names[row[0]], position: [row[1], row[2]],
          area: row[3], cls: labels.cls[row[4]],
        }))
        .filter((item) => item.name && polityVisible(item.area, zoom))
        .sort((a, b) => b.area - a.area);

      // ⚠️ ‏התוויות אינן נמסרות ל-deck.gl אלא לקנבס התוויות: עברית
      // ‏ב-`TextLayer` **אינה מצוירת כלל**, גם עם characterSet מפורש.
      // ‏‏27 שמות מדינות נבנו כאן, והמסך נשאר בלי שם אחד.
      pendingLabels = project ? ranked.map((item) => ({
        text: item.name, size: polityFontSize(item.area, zoom),
        align: 'center', padding: 5, anchor: project(item.position),
        color: POLITY_INK[item.cls] || POLITY_INK.other,
        alpha: zoom >= 9 ? 0.62 : 0.9,
      })) : [];
      return null;
    },
  };
}

export function createLegacyCitiesLayer({ ScatterplotLayer }) {
  let pendingCityLabels = [];
  const card = legacyCard(
    (item) => item.n,
    'עיר והקשרה המשתנה בזמן',
    (item, formatDay) => [
      { label: 'מדינה', value: item.country },
      { label: 'אוכלוסייה יהודית', value: value(item.jpop) },
      { label: 'גטו הוקם', value: item.d0 ? formatDay(item.d0) : null },
      { label: 'גטו חוסל', value: item.d1 ? formatDay(item.d1) : null },
      { label: 'נרצחו', value: item.kmax ? `${value(item.kmin)}–${value(item.kmax)}` : null },
      { label: 'יעדי גירוש', value: item.dep?.join(' · ') },
      { label: 'נכבשה', value: item.fell > 0 ? formatDay(item.fell) : item.fell === -1 ? 'לפני המלחמה' : null },
      { label: 'שוחררה', value: item.freed > 0 ? formatDay(item.freed) : null },
      { label: 'צומת מסילה', value: item.junction ? `${item.junction} קטעים` : null },
      { label: 'פשיטות', value: item.raids ? `${value(item.raids)} · ${value(item.tons)} טון` : null },
      { label: 'מרחק למסילה', value: item.rail_km != null ? `${item.rail_km} ק״מ` : null },
    ],
  );
  return {
    id: 'legacy-cities',
    label: '741 ערים משתנות בזמן',
    group: 'אתרים ותוויות',
    defaultOn: false,
    opacity: 0.95,
    legend: [
      { color: [168, 90, 37], label: 'עיר בשליטת הציר', shape: 'circle' },
      { color: [47, 110, 163], label: 'עיר ששוחררה', shape: 'circle' },
      { color: [117, 130, 140], label: 'עיר אחרת', shape: 'circle' },
    ],
    legendContext: 'סדר התוויות נגזר מגודל הקהילה היהודית במאגר המקורי — '
      + 'זה הדירוג היחיד שיש בו. גודל הנקודה אחיד ואינו מייצג אוכלוסייה.',
    labels: () => pendingCityLabels,
    async load() {
      const data = await loadJson(URLS.places);
      data.cities.sort((a, b) => (b.jpop || 0) - (a.jpop || 0));
      return data;
    },
    build(data, { day, opacity, zoom = 3, onClick, project, viewportSize }) {
      const caps = zoom < 4 ? 80 : zoom < 5 ? 150 : zoom < 6 ? 300 : zoom < 7 ? 520 : 741;
      const visible = data.cities.slice(0, caps);
      const color = (item) => {
        if (item.freed > 0 && day >= item.freed) return [47, 110, 163, 240];
        const axis = (item.fell === -1 || (item.fell > 0 && day >= item.fell))
          && !(item.freed > 0 && day >= item.freed);
        return axis ? [168, 90, 37, 240] : [117, 130, 140, 220];
      };
      // ⚠️ ‏הרדיוס נגזר מ-`jpop` — גודל הקהילה היהודית. קורא שרואה
      // ‏עיגול גדול מבין ״עיר גדולה״, וזה **לא** מה שהמספר אומר. אין
      // ‏במאגר הזה אוכלוסייה כללית, ולכן הנקודה אחידה: הצבע נושא את
      // ‏מה שידוע (נפלה · שוחררה · אחר), והגודל אינו טוען דבר.
      const points = new ScatterplotLayer({
        id: 'legacy-city-points', data: visible, pickable: true, autoHighlight: true, opacity,
        getPosition: (item) => [item.x, item.y], getFillColor: color,
        getLineColor: [250, 247, 239, 245], stroked: true, lineWidthMinPixels: 1,
        getRadius: 3.4, radiusUnits: 'pixels', radiusMinPixels: 3,
        onClick: (info) => info.object && onClick?.(info.object, card),
      });

      // ⚠️ ‏שמות ערים היו כבויים לגמרי מתחת לזום 5.5 — כלומר בחצי
      // ‏מרמות הזום המפה הייתה כתמי צבע בלי אף שם. ‏הפריסה עצמה קורית
      // ‏בקנבס התוויות; כאן רק מדרגים ומצמצמים לתקציב הזום.
      const budget = cityBudget(zoom);
      const size = zoom >= 7 ? 12 : 11;
      pendingCityLabels = (budget && project)
        ? visible.slice(0, budget * 3).map((item) => ({
          text: item.n, size, anchor: project([item.x, item.y]),
          offset: [9, 0], padding: 2, color: '#16232d', weight: 600, leader: true,
        }))
        : [];
      return points;
    },
  };
}

export function createLegacySitesLayer({ ScatterplotLayer, TextLayer }) {
  const card = legacyCard(
    (item) => item.name,
    'מחנה, גטו או אתר רדיפה מהאטלס המלא',
    (item, formatDay) => [
      { label: 'סוג', value: SITE_STYLE[item.type]?.label || item.type },
      { label: 'פעיל מ־', value: item.day_from != null ? formatDay(item.day_from) : 'תאריך חסר' },
      { label: 'פעיל עד', value: item.day_to != null ? formatDay(item.day_to) : 'תאריך חסר' },
      { label: 'אוכלוסייה', value: value(item.population) },
      { label: 'נרצחו', value: item.deaths_max ? `${value(item.deaths_min)}–${value(item.deaths_max)}` : null },
      { label: 'מחנה־אם', value: item.parent },
      { label: 'מרחק למסילה', value: item.rail_km != null ? `${item.rail_km} ק״מ` : null },
    ],
  );
  return {
    id: 'legacy-sites',
    label: '1,878 מחנות, גטאות ואתרים',
    group: 'רדיפה',
    defaultOn: false,
    opacity: 0.96,
    legend: Object.values(SITE_STYLE).map((item) => ({
      color: item.color.slice(0, 3), label: item.label, shape: item.shape === '■' ? 'square' : 'circle',
    })),
    async load() {
      const data = await loadJson(URLS.places);
      const rank = { extermination: 0, concentration: 1, ghetto: 2, subcamp: 3 };
      data.sites.sort((a, b) => (rank[a.type] ?? 5) - (rank[b.type] ?? 5)
        || (b.population || b.deaths_max || 0) - (a.population || a.deaths_max || 0));
      return data;
    },
    build(data, { day, opacity, zoom = 3, onClick }) {
      const cap = zoom < 4 ? 55 : zoom < 5 ? 110 : zoom < 6 ? 230 : zoom < 7 ? 480 : zoom < 8 ? 950 : 1500;
      const active = data.sites.filter((item) => {
        if (item.day_from == null && item.day_to == null) return zoom >= 9;
        return day >= (item.day_from ?? -Infinity) && day <= (item.day_to ?? Infinity);
      }).slice(0, cap);
      const points = new ScatterplotLayer({
        id: 'legacy-site-points', data: active, pickable: true, autoHighlight: true, opacity,
        getPosition: (item) => item.position,
        getFillColor: (item) => SITE_STYLE[item.type]?.color || [110, 90, 80, 220],
        getLineColor: [250, 247, 239, 245], stroked: true, lineWidthMinPixels: 1,
        getRadius: (item) => item.type === 'extermination' ? 8 : item.type === 'concentration' ? 6 : 4,
        radiusUnits: 'pixels',
        onClick: (info) => info.object && onClick?.(info.object, card),
      });
      const liquidations = active.filter((item) => item.type === 'ghetto' && item.day_to != null
        && day >= item.day_to - 5 && day <= item.day_to + 25);
      const pulses = new ScatterplotLayer({
        id: 'legacy-site-liquidation-pulses', data: liquidations, pickable: false,
        getPosition: (item) => item.position, filled: false, stroked: true,
        getLineColor: [126, 20, 20, 155], getRadius: (item) => 8 + (day - item.day_to + 5) * 0.7,
        radiusUnits: 'pixels', lineWidthMinPixels: 1.5,
      });
      const labels = zoom >= 7.5 ? active.slice(0, 170) : [];
      const text = new TextLayer({
        id: 'legacy-site-labels', data: labels, pickable: false, opacity,
        characterSet: [...new Set(labels.map((item) => item.name).join(''))],
        fontSettings: { sdf: true, fontSize: 64, buffer: 4 },
        getPosition: (item) => item.position, getText: (item) => item.name,
        getColor: (item) => SITE_STYLE[item.type]?.color || [92, 57, 47, 235],
        getSize: 10.5, getPixelOffset: [0, -10], sizeUnits: 'pixels',
        outlineWidth: 3, outlineColor: [250, 247, 239, 230],
      });
      return [points, pulses, text];
    },
  };
}

export function createLegacyBattlesLayer({ ScatterplotLayer, TextLayer }) {
  const card = legacyCard(
    (item) => item.n,
    'קרב או מערכה ממאגר 1,002 הקרבות',
    (item, formatDay) => {
      const hierarchy = [item.frt, item.cmp, item.par, item.n].filter(Boolean)
        .filter((entry, index, all) => all.indexOf(entry) === index).join(' › ');
      const oob = (item.oob || []).map((row) => {
        const parts = [row.polity_he || row.polity, row.side === 'attacker' ? 'תוקף' : row.side === 'defender' ? 'מגן' : row.side];
        if (row.strength) parts.push(`${value(row.strength)} חיילים`);
        if (row.tanks) parts.push(`${value(row.tanks)} טנקים`);
        if (row.artillery) parts.push(`${value(row.artillery)} קני ארטילריה`);
        if (row.commander) parts.push(`מפקד: ${row.commander}`);
        return parts.filter(Boolean).join(' · ');
      }).join('\n');
      return [
        { label: 'היררכיה', value: hierarchy },
        { label: 'התחלה', value: item.f != null ? formatDay(item.f) : null },
        { label: 'סיום', value: item.e != null ? formatDay(item.e) : null },
        { label: 'דיוק התאריך', value: item.prec === 'day' ? 'יום מדויק' : item.prec || 'לא ידוע' },
        { label: 'צדדים', value: item.bl?.join(' · ') },
        { label: 'אבדות', value: value(item.cas) },
        { label: 'סדר כוחות', value: oob },
        { label: 'תתי־קרבות', value: item.child_names?.join(' · ') },
        { label: 'מרחק למסילה', value: item.rk != null ? `${item.rk} ק״מ` : null },
        { label: 'נתיבי אספקה פעילים', value: item.rt?.join(' · ') },
        { label: 'הטבעות סמוכות', value: item.sk || null },
      ];
    },
  );
  return {
    id: 'legacy-battles',
    label: '1,002 קרבות וסדרי כוחות',
    group: 'לחימה וטריטוריה',
    defaultOn: false,
    opacity: 0.96,
    legend: [
      { color: [160, 54, 40], label: 'קרב פעיל', shape: 'circle' },
      { color: [112, 42, 35], label: 'קרב עם סדר כוחות', shape: 'square' },
    ],
    async load() {
      const data = await loadJson(URLS.battles);
      const children = new Map();
      for (const battle of data.battles) {
        if (!battle.par) continue;
        if (!children.has(battle.par)) children.set(battle.par, []);
        children.get(battle.par).push(battle.n);
      }
      for (const battle of data.battles) battle.child_names = (children.get(battle.n) || []).slice(0, 14);
      return data;
    },
    build(data, { day, opacity, zoom = 3, onClick }) {
      const active = data.battles.filter((item) => item.f != null
        && day >= item.f && day <= (item.e || item.f) + 30);
      active.sort((a, b) => (b.cas || 0) - (a.cas || 0));
      const cap = zoom < 4 ? 120 : zoom < 5 ? 260 : 650;
      const visible = active.slice(0, cap);
      const points = new ScatterplotLayer({
        id: 'legacy-battle-points-full', data: visible, pickable: true, autoHighlight: true, opacity,
        getPosition: (item) => [item.x, item.y],
        getFillColor: (item) => item.oob?.length ? [125, 42, 34, 245] : [171, 69, 45, 235],
        getLineColor: [250, 247, 239, 245], stroked: true, lineWidthMinPixels: 1.2,
        getRadius: (item) => item.cas ? Math.min(12, 5 + Math.log10(item.cas + 1)) : 5,
        radiusUnits: 'pixels',
        onClick: (info) => info.object && onClick?.(info.object, card),
      });
      const labels = zoom >= 5.5 ? visible.slice(0, zoom >= 7 ? 180 : 70) : [];
      const text = new TextLayer({
        id: 'legacy-battle-labels-full', data: labels, pickable: false, opacity,
        characterSet: [...new Set(labels.map((item) => item.n).join(''))],
        fontSettings: { sdf: true, fontSize: 64, buffer: 4 },
        getPosition: (item) => [item.x, item.y], getText: (item) => item.n,
        getColor: [110, 34, 28, 240], getSize: 10.5,
        getPixelOffset: [0, -12], sizeUnits: 'pixels',
        outlineWidth: 3, outlineColor: [250, 247, 239, 235],
      });
      return [points, text];
    },
  };
}

export function createLegacyRailLayer({ PathLayer }) {
  return {
    id: 'legacy-railways',
    label: 'רשת המסילות המלאה — 471,795 קודקודים',
    group: 'תשתית',
    defaultOn: false,
    opacity: 0.72,
    legend: [{ color: [54, 55, 52], label: 'מסילה; הפירוט גדל בזום', shape: 'square' }],
    async load() {
      const data = await loadJson(URLS.railways);
      data.lod = new Map();
      return data;
    },
    build(data, { zoom = 3, opacity }) {
      const stride = zoom < 4 ? 40 : zoom < 5 ? 18 : zoom < 6 ? 7 : zoom < 7 ? 3 : 1;
      if (!data.lod.has(stride)) data.lod.set(stride, data.railways.filter((_, index) => index % stride === 0));
      const paths = data.lod.get(stride);
      const halo = new PathLayer({
        id: 'legacy-railway-halo', data: paths, getPath: (item) => item,
        getColor: [250, 247, 239, Math.round(150 * opacity)], getWidth: zoom >= 7 ? 2.4 : 1.8,
        widthUnits: 'pixels', pickable: false,
      });
      const lines = new PathLayer({
        id: 'legacy-railway-lines', data: paths, getPath: (item) => item,
        getColor: [54, 55, 52, Math.round(185 * opacity)], getWidth: zoom >= 7 ? 1.15 : 0.8,
        widthUnits: 'pixels', pickable: false,
      });
      return [halo, lines];
    },
  };
}

export function createLegacyInfrastructureLayer({ PathLayer, ScatterplotLayer, TextLayer }) {
  const card = legacyCard(
    (item) => item.name || item.n,
    'תעשייה, נמל או צומת לוגיסטי',
    (item, formatDay) => [
      { label: 'סוג', value: item.kind_he },
      { label: 'ענף', value: INDUSTRY_HE[item.ind] || item.ind },
      { label: 'מדינה', value: item.c || item.admin },
      { label: 'צד', value: item.side === 'allied' ? 'בעלות הברית' : item.side === 'axis' ? 'הציר' : item.side },
      { label: 'דרגת צומת', value: item.deg },
      { label: 'מספר הפצצות', value: item.r || item.raids },
      { label: 'טונאז׳ פצצות', value: value(item.t || item.tons) },
      { label: 'תיעוד מ־', value: item.d0 ? formatDay(item.d0) : null },
      { label: 'תיעוד עד', value: item.d1 ? formatDay(item.d1) : null },
      { label: 'קיבולת/תפוקה', value: item.cap_max ? `${value(item.cap_min)}–${value(item.cap_max)} long tons/יום` : null },
      { label: 'כיסוי', value: item.coverage },
    ],
  );
  return {
    id: 'legacy-infrastructure',
    label: 'מפעלים, נמלים וצמתי מסילה',
    group: 'תעשייה ואספקה',
    defaultOn: false,
    opacity: 0.94,
    legend: [
      { color: [152, 61, 44], label: 'מפעל ציר', shape: 'square' },
      { color: [43, 104, 150], label: 'מפעל בעלות הברית', shape: 'square' },
      { color: [31, 112, 105], label: 'נמל אספקה', shape: 'circle' },
      { color: [190, 117, 48], label: 'צומת מסילה שהופצץ', shape: 'circle' },
      { color: [102, 75, 47], label: 'קשר מפעל–נמל/מסילה/הפצצה', shape: 'square' },
    ],
    async load() {
      const data = await loadJson(URLS.infrastructure);
      const plants = new Map(data.plants.map((item) => [item.id, item]));
      const links = [];
      for (const item of data.plant_links?.poe || []) {
        const plant = plants.get(item.id);
        if (plant) links.push({ kind: 'port', path: [[plant.x, plant.y], [item.px, item.py]], ...item });
      }
      for (const item of data.plant_links?.rail || []) {
        const plant = plants.get(item.id);
        if (plant) links.push({ kind: 'rail', path: [[plant.x, plant.y], [item.nx, item.ny]], ...item });
      }
      for (const item of data.plant_links?.bomb || []) {
        const plant = plants.get(item.id);
        const target = data.bombing_targets[item.r];
        if (plant && target) links.push({ kind: 'bomb', path: [[plant.x, plant.y], [target.x, target.y]], ...item });
      }
      data.links = links;
      data.nodes = [
        ...data.plants.map((item) => ({ ...item, name: item.n, kind: 'plant', kind_he: 'מפעל', position: [item.x, item.y] })),
        ...data.ports.map((item) => ({ ...item, name: item.n, kind: 'port', kind_he: 'נמל', position: [item.x, item.y] })),
        ...data.supply_ports.map((item) => ({ ...item, name: item.n_he || item.n, kind: 'supply', kind_he: 'נמל אספקה', position: [item.x, item.y] })),
      ];
      return data;
    },
    build(data, { day, zoom = 3, opacity, onClick }) {
      const links = zoom >= 4.5 ? data.links.filter((item) => item.kind !== 'bomb'
        || (day >= item.d0 - 90 && day <= item.d1 + 90)) : [];
      const paths = new PathLayer({
        id: 'legacy-industry-links', data: links, getPath: (item) => item.path,
        getColor: (item) => item.kind === 'bomb' ? [143, 78, 38, 105]
          : item.kind === 'port' ? [38, 96, 126, 100] : [76, 67, 54, 90],
        getWidth: (item) => item.kind === 'port' ? 1.4 + (item.s || 0) * 2 : 1,
        widthUnits: 'pixels', pickable: false, opacity,
      });
      const points = new ScatterplotLayer({
        id: 'legacy-industry-nodes', data: data.nodes, pickable: true, autoHighlight: true, opacity,
        getPosition: (item) => item.position,
        getFillColor: (item) => item.kind === 'supply' ? [31, 112, 105, 245]
          : item.kind === 'port' ? [36, 88, 121, 235]
            : item.side === 'allied' ? [43, 104, 150, 235] : [152, 61, 44, 235],
        getLineColor: [250, 247, 239, 245], stroked: true, lineWidthMinPixels: 1,
        getRadius: (item) => item.kind === 'supply' ? 8 : item.kind === 'port' ? 6 : 5,
        radiusUnits: 'pixels',
        onClick: (info) => info.object && onClick?.(info.object, card),
      });
      const activeInterdictions = data.rail_interdictions.filter((item) => day >= item.d0 && day <= item.d1
        && (item.dd || []).some((raidDay) => Math.abs(day - raidDay) <= 4));
      const interdictions = new TextLayer({
        id: 'legacy-rail-interdictions', data: activeInterdictions, pickable: true, opacity,
        characterSet: ['✚'],
        getPosition: (item) => [item.x, item.y], getText: () => '✚',
        getColor: [190, 117, 48, 245], getSize: (item) => Math.min(22, 10 + item.deg * 2),
        sizeUnits: 'pixels', outlineWidth: 2, outlineColor: [250, 247, 239, 230],
        onClick: (info) => {
          if (!info.object) return;
          const item = { ...info.object, name: info.object.n, kind_he: 'צומת מסילה שהופצץ' };
          onClick?.(item, card);
        },
      });
      const labels = zoom >= 6 ? data.nodes.filter((item) => item.kind !== 'plant').slice(0, 80) : [];
      const text = new TextLayer({
        id: 'legacy-industry-labels', data: labels, pickable: false, opacity,
        characterSet: [...new Set(labels.map((item) => item.name).join(''))],
        fontSettings: { sdf: true, fontSize: 64, buffer: 4 },
        getPosition: (item) => item.position, getText: (item) => item.name,
        getColor: [40, 60, 66, 235], getSize: 10.5, getPixelOffset: [0, -11],
        outlineWidth: 3, outlineColor: [250, 247, 239, 230],
      });
      return [paths, points, interdictions, text];
    },
  };
}
