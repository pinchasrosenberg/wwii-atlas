/**
 * Stage 2 — maritime routes, losses, and the mid-Atlantic air gap.
 *
 * Route geometry is explicitly marked as algorithmic. The repository does not
 * scrape uboat.net or the Arnold Hague database while permission is pending.
 * Loss points are a curated public-domain JANAC/NHHC subset.
 */

import { EPOCH } from '../config.js?v=map-channel-19';
import { toDayIndex } from '../core/time-engine.js?v=map-channel-19';
import { loadJson } from '../core/data-store.js?v=map-channel-19';

const ROUTES_URL = './data/stage2/convoy-routes.json';
const LOSSES_URL = './data/stage2/naval-losses.json';
const MANIFEST_URL = './data/stage2/manifest.json';

const AIR_GAP_END = toDayIndex(new Date(Date.UTC(1943, 4, 31)), EPOCH);
const AIR_GAP_START = toDayIndex(new Date(Date.UTC(1939, 8, 1)), EPOCH);
const AIR_GAP_POLYGON = [
  [-48.0, 48.5],
  [-31.0, 48.5],
  [-27.0, 54.0],
  [-31.0, 59.5],
  [-47.0, 59.0],
];

function dayOf(iso) {
  return toDayIndex(new Date(`${iso}T00:00:00Z`), EPOCH);
}

function riskAt(route, day) {
  const period = route.risk_periods.find((item) => {
    const from = item.day_from ?? dayOf(item.from);
    const to = item.day_to ?? dayOf(item.to);
    return from <= day && day <= to;
  });
  return period?.index ?? 0.2;
}

function riskColor(index, alpha = 220) {
  const t = Math.max(0, Math.min(1, index));
  return [
    Math.round(70 + 175 * t),
    Math.round(154 - 92 * t),
    Math.round(205 - 140 * t),
    alpha,
  ];
}

function routesCard(getSource, { onInspectRoute } = {}) {
  return {
    title: (route) => route.name_he || route.name_en,
    subtitle: 'נתיב אספקה מלא ממקור ליעד',
    fieldsOf: (route) => [
      { label: 'קוד', value: route.route_id },
      { label: 'מוצא', value: route.origin_name_he },
      { label: 'יעד', value: route.destination_name_he },
      { label: 'אמצעי', value: route.mode },
      { label: 'פעיל מ־', value: route.active_from },
      { label: 'פעיל עד', value: route.active_to },
      { label: 'משך טיפוסי', value: `${route.duration_days} ימים` },
      { label: 'מטען', value: route.cargo.join(' · ') },
      {
        label: 'גיאומטריה',
        value: route.geometry_note,
        derivation: route.derivation,
        note: 'הקו מציג מסדרון מחקרי בין נקודות הקצה, ולא יומן הפלגה של שיירה יחידה.',
      },
    ],
    actionsOf: (route) => [{
      label: 'גרף נתיב וסיכון',
      action: () => onInspectRoute?.(route.route_id),
    }],
    sourcesOf: (route) => route.source_ids.map(getSource).filter(Boolean),
  };
}

function lossesCard() {
  return {
    title: (item) => item.name,
    subtitle: 'אבדת כלי שיט — תת־מערך פתוח',
    fieldsOf: (item) => [
      { label: 'תאריך', value: item.date },
      { label: 'סוג', value: item.vessel_type },
      { label: 'טונאז׳', value: item.tonnage ? item.tonnage.toLocaleString('he-IL') : null },
      { label: 'גורם', value: item.agent },
      { label: 'זירה', value: item.theater === 'atlantic' ? 'האטלנטי' : 'האוקיינוס השקט' },
      {
        label: 'כיסוי',
        value: 'מדגם שלב 2',
        note: 'זו אינה עדיין רשימת כל אבדות הסוחר במלחמה. מקורות מוגבלים יתווספו רק לאחר אישור שימוש.',
      },
    ],
    sourcesOf: (item) => item.source_ids.includes('janac_1947')
      ? [{
          id: 'janac_1947',
          name: 'JANAC — Japanese Naval and Merchant Shipping Losses, 1947',
          url: 'https://www.history.navy.mil/research/library/online-reading-room/title-list-alphabetically/j/japanese-naval-merchant-shipping-losses-wwii.html',
        }]
      : [{
          id: 'nhhc_u_boat_reports',
          name: 'NHHC — declassified U-boat post-mortem reports',
          url: 'https://www.history.navy.mil/research/library/online-reading-room/subject-list.html',
        }],
  };
}

function createTrips(routes) {
  const trips = [];
  for (const route of routes) {
    for (
      let departure = route.day_from;
      departure <= route.day_to;
      departure += route.sailing_interval_days
    ) {
      const last = Math.min(route.day_to, departure + route.duration_days);
      const timestamps = route.path.map((_, index) => (
        Math.round(departure + ((last - departure) * index) / (route.path.length - 1))
      ));
      trips.push({
        ...route,
        trip_id: `${route.route_id}:${departure}`,
        timestamps,
      });
    }
  }
  return trips;
}

export function createConvoyRoutesLayer({
  PathLayer,
  TripsLayer,
  ScatterplotLayer,
  TextLayer,
  getHighlightedRoutes,
  onInspectRoute,
}) {
  let sourceIndex = new Map();
  const cardSpec = routesCard((id) => sourceIndex.get(id), { onInspectRoute });
  return {
    id: 'convoy-routes',
    label: 'נתיבי אספקה ושיירות',
    group: 'אספקה ונתיבים',
    defaultOn: true,
    opacity: 0.9,
    legend: [
      { color: [82, 168, 214], label: 'סיכון נמוך', shape: 'square' },
      { color: [226, 85, 63], label: 'סיכון גבוה', shape: 'square' },
      { color: [119, 205, 157], label: 'נקודת מוצא', shape: 'circle' },
      { color: [244, 190, 88], label: 'נקודת יעד', shape: 'circle' },
    ],

    async load() {
      const payload = await loadJson(ROUTES_URL);
      sourceIndex = new Map(
        (payload.metadata?.sources || []).map((source) => [source.id, source]),
      );
      const routes = payload.routes.filter((route) => route.mode === 'ים');
      return { ...payload, routes, trips: createTrips(routes) };
    },

    build(data, ctx) {
      const { day, tier, opacity, onClick, zoom = 3 } = ctx;
      const highlighted = getHighlightedRoutes?.() || new Set();
      const active = data.routes.filter((route) => route.day_from <= day && day <= route.day_to);
      const terminals = active.flatMap((route) => [
        {
          role: 'origin',
          label: route.origin_name_he,
          position: route.path[0],
          route,
        },
        {
          role: 'destination',
          label: route.destination_name_he,
          position: route.path[route.path.length - 1],
          route,
        },
      ]);
      const base = new PathLayer({
        id: 'convoy-routes-paths',
        data: active,
        pickable: true,
        opacity,
        getPath: (route) => route.path,
        getColor: (route) => highlighted.has(route.route_id)
          ? [255, 243, 160, 255]
          : riskColor(riskAt(route, day)),
        getWidth: (route) => (highlighted.has(route.route_id) ? 6 : 2.5)
          + riskAt(route, day) * 3.5,
        widthUnits: 'pixels',
        widthMinPixels: 2,
        jointRounded: true,
        capRounded: true,
        onClick: (info) => {
          if (info.object) onClick?.(info.object, cardSpec);
        },
        updateTriggers: {
          getColor: [day, [...highlighted].join('|')],
          getWidth: [day, [...highlighted].join('|')],
        },
      });

      const terminalPoints = new ScatterplotLayer({
        id: 'supply-route-terminals',
        data: terminals,
        pickable: true,
        opacity,
        getPosition: (item) => item.position,
        getFillColor: (item) => item.role === 'origin'
          ? [119, 205, 157, 245]
          : [244, 190, 88, 245],
        getLineColor: [255, 246, 220, 235],
        getRadius: 6,
        radiusUnits: 'pixels',
        radiusMinPixels: 5,
        radiusMaxPixels: 9,
        stroked: true,
        lineWidthMinPixels: 1,
        onClick: (info) => {
          if (info.object) onClick?.(info.object.route, cardSpec);
        },
      });

      const endpointLabels = zoom >= 2.8
        ? new TextLayer({
            id: 'supply-route-terminal-labels',
            data: terminals,
            pickable: false,
            opacity,
            getPosition: (item) => item.position,
            getText: (item) => item.label,
            getColor: [45, 52, 55, 240],
            getSize: 10,
            sizeUnits: 'pixels',
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'bottom',
            getPixelOffset: [0, -10],
            characterSet: [...new Set(terminals.map((item) => item.label).join(''))],
            fontSettings: { sdf: true, fontSize: 64, buffer: 4 },
            outlineWidth: 3,
            outlineColor: [250, 247, 238, 235],
          })
        : null;

      if (tier !== 'full') return [base, terminalPoints, endpointLabels];

      const trips = new TripsLayer({
        id: 'convoy-routes-trips',
        data: data.trips,
        opacity: Math.min(1, opacity + 0.08),
        getPath: (trip) => trip.path,
        getTimestamps: (trip) => trip.timestamps,
        getColor: (trip) => riskColor(riskAt(trip, day), 245),
        getWidth: 3.2,
        widthUnits: 'pixels',
        currentTime: day,
        trailLength: 18,
        fadeTrail: true,
        jointRounded: true,
        capRounded: true,
        shadowEnabled: false,
        updateTriggers: { getColor: [day] },
      });
      return [base, trips, terminalPoints, endpointLabels];
    },
    cardSpec,
  };
}

export function createNavalLossesLayer({ ScatterplotLayer }) {
  const cardSpec = lossesCard();
  return {
    id: 'naval-losses',
    label: 'הטבעות ואבדות ים',
    group: 'מלחמת הים',
    defaultOn: true,
    opacity: 0.92,
    legend: [
      { color: [242, 173, 69], label: 'אירוע בחודש הנבחר', shape: 'circle' },
      { color: [207, 64, 54], label: 'צפיפות בחצי השנה האחרונה', shape: 'circle' },
    ],

    async load() {
      const [payload, manifest] = await Promise.all([
        loadJson(LOSSES_URL),
        loadJson(MANIFEST_URL).catch(() => null),   // ‏מניפסט חסר אינו כשל
      ]);
      return { ...payload, manifest };
    },

    build(data, ctx) {
      const { day, opacity, onClick } = ctx;
      const rolling = data.losses.filter((item) => item.day <= day && item.day >= day - 183);
      const current = data.losses.filter((item) => Math.abs(item.day - day) <= 31);

      // A broad, translucent density field. ScatterplotLayer is used instead
      // of GPU aggregation so the standalone Deck.gl bundle stays warning-free
      // on both WebGL and WebGPU-capable browsers.
      const density = new ScatterplotLayer({
        id: 'naval-losses-density',
        data: rolling,
        pickable: false,
        opacity: opacity * 0.28,
        getPosition: (item) => item.position,
        getFillColor: (item) => item.theater === 'atlantic'
          ? [206, 67, 52, 115]
          : [224, 137, 54, 105],
        getRadius: (item) => 28 + Math.min(42, Math.sqrt(item.tonnage || 500) / 3),
        radiusUnits: 'pixels',
        radiusMinPixels: 24,
        radiusMaxPixels: 70,
        stroked: false,
      });

      const points = new ScatterplotLayer({
        id: 'naval-losses-points',
        data: current,
        pickable: true,
        opacity,
        getPosition: (item) => item.position,
        getFillColor: (item) => item.theater === 'atlantic'
          ? [236, 113, 72, 235]
          : [242, 179, 72, 235],
        getLineColor: [255, 238, 204, 220],
        getRadius: (item) => Math.max(4, Math.sqrt(item.tonnage || 500) / 9),
        radiusUnits: 'pixels',
        radiusMinPixels: 4,
        radiusMaxPixels: 16,
        stroked: true,
        lineWidthMinPixels: 1,
        onClick: (info) => {
          if (info.object) onClick?.(info.object, cardSpec);
        },
      });
      return [density, points];
    },
    cardSpec,
  };
}

export function createAirGapLayer({ PolygonLayer }) {
  const cardSpec = {
    title: () => 'פער האוויר במרכז האוקיינוס האטלנטי',
    subtitle: 'שחזור מרחבי משוער',
    fieldsOf: () => [
      { label: 'פעיל עד', value: 'מאי 1943' },
      {
        label: 'משמעות',
        value: 'מחוץ לטווח סיור יבשתי רציף',
        derivation: 'algorithmic',
        note: 'הפוליגון הוא המחשה כללית של אזור הכיסוי החסר, לא גבול מבצעי קשיח.',
      },
    ],
    sourcesOf: () => [{
      id: 'nhhc_battle_atlantic',
      name: 'NHHC — Battle of the Atlantic',
      url: 'https://www.history.navy.mil/browse-by-topic/wars-conflicts-and-operations/world-war-ii/1943/atlantic-continued.html',
    }],
  };
  const data = [{ id: 'air-gap', polygon: AIR_GAP_POLYGON }];

  return {
    id: 'air-gap',
    label: 'פער האוויר האטלנטי',
    group: 'מלחמת הים',
    defaultOn: true,
    opacity: 0.72,
    legend: [
      { color: [153, 44, 42], label: 'ללא כיסוי אווירי רציף', shape: 'square' },
    ],
    async load() {
      return data;
    },
    build(loaded, ctx) {
      const { day, opacity, onClick } = ctx;
      if (day < AIR_GAP_START || day > AIR_GAP_END) return null;
      return new PolygonLayer({
        id: 'air-gap',
        data: loaded,
        pickable: true,
        opacity,
        getPolygon: (item) => item.polygon,
        getFillColor: [153, 44, 42, 80],
        getLineColor: [222, 105, 76, 215],
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        stroked: true,
        filled: true,
        onClick: (info) => {
          if (info.object) onClick?.(info.object, cardSpec);
        },
      });
    },
    cardSpec,
  };
}

export function buildMaritimeHistogram(losses, minDay, maxDay, buckets = 120) {
  const out = new Array(buckets).fill(0);
  const span = maxDay - minDay;
  for (const item of losses) {
    const index = Math.max(
      0,
      Math.min(buckets - 1, Math.floor(((item.day - minDay) / span) * buckets)),
    );
    out[index] += Math.max(1, Math.log2((item.tonnage || 500) / 250));
  }
  return out;
}
