import { loadAtlasData, sourceMap, sourcesFor } from '../core/data-store.js?v=map-channel-19';

const CLASS_COLORS = {
  land_corridor: [221, 169, 76, 235],
  pipeline: [119, 205, 157, 235],
  air_bridge: [151, 132, 226, 235],
};

const CARGO_HE = {
  fuel: 'דלק',
  ordnance: 'תחמושת',
  food: 'מזון',
  vehicles: 'כלי רכב',
  medical: 'ציוד רפואי',
  personnel: 'כוח אדם',
  aircraft: 'מטוסים',
};

function latestThroughput(route, day) {
  const records = route.throughput || [];
  let best = null;
  for (const record of records) {
    if (record.day <= day && (!best || record.day > best.day)) best = record;
  }
  return best || records[0] || null;
}

function routeCard(sources, { onInspectRoute } = {}) {
  return {
    title: (route) => route.name_he || route.name_en,
    subtitle: 'נתיב אספקה — כיסוי מייצג ומתועד',
    fieldsOf: (route) => {
      const record = latestThroughput(route, route._selectedDay ?? route.day_from);
      return [
        { label: 'מוצא', value: route.origin_name_he },
        { label: 'יעד', value: route.destination_name_he },
        { label: 'סוג', value: route.route_class === 'air_bridge' ? 'גשר אווירי'
          : route.route_class === 'pipeline' ? 'צינור' : 'מסדרון יבשתי' },
        { label: 'מטען', value: route.cargo.map((item) => CARGO_HE[item] || item).join(' · ') },
        { label: 'תפוקה קרובה', value: record ? `${record.tonnage.toLocaleString('he-IL')} טונות ארוכות` : null },
        { label: 'אבדות בתנועה', value: record ? `${record.losses_tonnage.toLocaleString('he-IL')} טונות` : null },
        { label: 'צוואר בקבוק', value: route.bottleneck },
        {
          label: 'גיאומטריה',
          value: 'מסדרון משוחזר בין נקודות מתועדות',
          derivation: route.derivation,
          note: 'הקו אינו טוען לשחזר כל נסיעה, טיסה או מקטע תשתית.',
        },
      ];
    },
    actionsOf: (route) => [{
      label: 'גרף תפוקה ומחשבון נתיב',
      action: () => onInspectRoute?.(route.route_id),
    }],
    sourcesOf: (route) => sourcesFor(route, sources),
  };
}

function makeRouteSpec({
  id,
  label,
  routeClasses,
  PathLayer,
  ScatterplotLayer,
  TextLayer,
  getHighlightedRoutes,
  onInspectRoute,
  defaultOn = false,
}) {
  let sources = new Map();
  const cardSpec = routeCard(sources, { onInspectRoute });
  return {
    id,
    label,
    group: 'אספקה ונתיבים',
    defaultOn,
    opacity: 0.9,
    legend: routeClasses.includes('air_bridge')
      ? [{ color: CLASS_COLORS.air_bridge.slice(0, 3), label: 'גשר אווירי', shape: 'square' }]
      : [
          { color: CLASS_COLORS.land_corridor.slice(0, 3), label: 'מסדרון יבשתי', shape: 'square' },
          { color: CLASS_COLORS.pipeline.slice(0, 3), label: 'צינור דלק', shape: 'square' },
        ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      Object.assign(cardSpec, routeCard(sources, { onInspectRoute }));
      return {
        routes: payload.supply_routes.filter((route) => routeClasses.includes(route.route_class)),
      };
    },
    build(data, ctx) {
      const { day, opacity, onClick, zoom = 3 } = ctx;
      const highlighted = getHighlightedRoutes?.() || new Set();
      const active = data.routes
        .filter((route) => route.day_from <= day && day <= route.day_to)
        .map((route) => ({ ...route, _selectedDay: day }));
      const terminals = active.flatMap((route) => [
        { position: route.path[0], route, role: 'origin', label: route.origin_name_he },
        {
          position: route.path[route.path.length - 1],
          route,
          role: 'destination',
          label: route.destination_name_he,
        },
      ]);
      const paths = new PathLayer({
        id: `${id}-paths`,
        data: active,
        pickable: true,
        opacity,
        getPath: (route) => route.path,
        getColor: (route) => highlighted.has(route.route_id)
          ? [255, 243, 160, 255]
          : (CLASS_COLORS[route.route_class] || [220, 170, 80, 235]),
        getWidth: (route) => {
          const throughput = latestThroughput(route, day)?.tonnage || 0;
          return (highlighted.has(route.route_id) ? 5 : 2)
            + Math.min(4, Math.log10(Math.max(10, throughput)) - 1);
        },
        widthUnits: 'pixels',
        widthMinPixels: 2,
        jointRounded: true,
        capRounded: true,
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
        updateTriggers: {
          getColor: [day, [...highlighted].join('|')],
          getWidth: [day, [...highlighted].join('|')],
        },
      });
      const points = new ScatterplotLayer({
        id: `${id}-terminals`,
        data: terminals,
        pickable: true,
        opacity,
        getPosition: (item) => item.position,
        getFillColor: (item) => item.role === 'origin'
          ? [119, 205, 157, 245] : [244, 190, 88, 245],
        getLineColor: [255, 246, 220, 235],
        getRadius: 5,
        radiusUnits: 'pixels',
        radiusMinPixels: 4,
        stroked: true,
        lineWidthMinPixels: 1,
        onClick: (info) => info.object && onClick?.(info.object.route, cardSpec),
      });
      const labels = zoom >= 4.2
        ? new TextLayer({
            id: `${id}-labels`,
            data: terminals,
            pickable: false,
            getPosition: (item) => item.position,
            getText: (item) => item.label,
            getColor: [45, 52, 55, 240],
            getSize: 10,
            sizeUnits: 'pixels',
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'bottom',
            getPixelOffset: [0, -9],
            characterSet: [...new Set(terminals.map((item) => item.label).join(''))],
            fontSettings: { sdf: true, fontSize: 64, buffer: 4 },
            outlineWidth: 3,
            outlineColor: [250, 247, 238, 235],
          })
        : null;
      return [paths, points, labels];
    },
    cardSpec,
  };
}

export function createLandSupplyLayer(options) {
  return makeRouteSpec({
    ...options,
    id: 'supply-corridors',
    label: 'מסדרונות אספקה יבשתיים',
    routeClasses: ['land_corridor', 'pipeline'],
  });
}

export function createAirBridgesLayer(options) {
  return makeRouteSpec({
    ...options,
    id: 'air-bridges',
    label: 'גשרים אוויריים',
    routeClasses: ['air_bridge'],
  });
}

export function createRailwaysLayer({
  PathLayer,
  getHighlightedRoutes,
  onInspectRoute,
}) {
  let sources = new Map();
  const cardSpec = {
    title: (item) => item.name_he,
    subtitle: 'רשת מסילות מייצגת — גיאומטריה בלבד',
    fieldsOf: (item) => [
      { label: 'רוחב מסילה', value: `${item.gauge_mm.toLocaleString('he-IL')} מ״מ` },
      { label: 'מצב', value: {
        operational: 'פעילה',
        'gauge-converted': 'הוסבה בזמן המלחמה',
        'gauge-break': 'נקודת שינוי רוחב',
        'war-damaged': 'נזקי מלחמה',
      }[item.status] || item.status },
      {
        label: 'כיסוי',
        value: 'רשת גזע מייצגת',
        derivation: item.derivation,
        note: 'זו אינה עדיין רשת המסילות המלאה של אירופה; טרנספורטים מוצגים רק אם נבנה להם מסלול על הקווים הקיימים.',
      },
    ],
    actionsOf: (item) => [{
      label: 'פתח מחשבון נתיב',
      action: () => onInspectRoute?.(item.id),
    }],
    sourcesOf: (item) => sourcesFor(item, sources),
  };
  return {
    id: 'railways',
    label: 'רשת מסילות ורוחב מסילה',
    group: 'אספקה ונתיבים',
    defaultOn: false,
    opacity: 0.8,
    legend: [
      { color: [111, 185, 217], label: '1,435 מ״מ', shape: 'square' },
      { color: [202, 139, 218], label: '1,520 מ״מ', shape: 'square' },
      { color: [236, 171, 74], label: 'שינוי רוחב / נזק', shape: 'square' },
    ],
    async load() {
      const payload = await loadAtlasData();
      sources = sourceMap(payload);
      return payload.railways;
    },
    build(data, ctx) {
      const { day, opacity, onClick, zoom = 3 } = ctx;
      const highlighted = getHighlightedRoutes?.() || new Set();
      const active = data.filter((item) => item.day_from <= day && day <= item.day_to);
      return new PathLayer({
        id: 'railways',
        data: active,
        pickable: true,
        opacity,
        getPath: (item) => item.path,
        getColor: (item) => {
          if (highlighted.has(item.id)) return [255, 243, 160, 255];
          if (item.status === 'gauge-break' || item.status === 'war-damaged') {
            return [236, 171, 74, 230];
          }
          return item.gauge_mm >= 1500 ? [202, 139, 218, 225] : [111, 185, 217, 225];
        },
        getWidth: (item) => highlighted.has(item.id) ? 6 : zoom >= 6 ? 2.6 : 1.5,
        widthUnits: 'pixels',
        widthMinPixels: 1,
        jointRounded: true,
        capRounded: true,
        onClick: (info) => info.object && onClick?.(info.object, cardSpec),
        updateTriggers: {
          getColor: [[...highlighted].join('|')],
          getWidth: [zoom, [...highlighted].join('|')],
        },
      });
    },
    cardSpec,
  };
}
