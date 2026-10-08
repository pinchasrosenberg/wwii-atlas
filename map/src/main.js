/**
 * חיווט שלבים 1–8.
 *
 * הקובץ היחיד שמחבר בין המנוע הגנרי לבין תוכן האטלס. core/ אינו
 * מכיר גבולות, שיירות או אבדות ים.
 */

import {
  BASEMAP_STYLE, DEFAULT_DATE, DEFAULT_STEP_DAYS, EPOCH, HIGH_RES_WINDOWS,
  INITIAL_VIEW, REGION_VIEWS, TIMELINE_END, TIMELINE_START, formatDate,
} from './config.js?v=map-channel-19';

import { TimeEngine, fromDayIndex } from './core/time-engine.js?v=map-channel-19';
import { LayerRegistry } from './core/layer-registry.js?v=map-channel-19';
import { EntityCard } from './core/entity-card.js?v=map-channel-19';
import {
  PerfMonitor, TIER, TIER_CAPS, TIER_LABEL,
  attachContextLossHandler, detectTier, nextTierDown, nextTierUp,
} from './core/perf-tier.js?v=map-channel-19';
import { readState, throttleWriter } from './core/deep-link.js?v=map-channel-19';
import { loadAtlasData, loadJson } from './core/data-store.js?v=map-channel-19';
import { loadNetworkData } from './core/network-store.js?v=map-channel-19';
import { renderPixelRatio, zoomDetailLevel } from './core/map-performance.js?v=map-channel-19';

import { Timeline } from './ui/timeline.js?v=map-channel-19';
import { LayerPanel, Legend } from './ui/layer-panel.js?v=map-channel-19';
import { Workbench } from './ui/workbench.js?v=map-channel-19';
import { RelationPanel } from './ui/relation-panel.js?v=map-channel-19';
import {
  EventFeed,
  bucketActivityDensity,
  buildLegacyActivityDensity,
} from './ui/event-feed.js?v=map-channel-19';
import { AtlasDock } from './ui/atlas-dock.js?v=map-channel-19';
import { createTerrainLayer } from './layers/terrain.js?v=map-channel-19';
import { createHistoricalBordersLayer } from './layers/historical-borders.js?v=map-channel-19';
import { createBattlesLayer } from './layers/battles.js?v=map-channel-19';
import {
  buildMaritimeHistogram,
  createAirGapLayer,
  createConvoyRoutesLayer,
  createNavalLossesLayer,
} from './layers/maritime.js?v=map-channel-19';
import {
  createAirBridgesLayer,
  createLandSupplyLayer,
  createRailwaysLayer,
} from './layers/logistics.js?v=map-channel-19';
import {
  createFortificationsLayer,
  createFrontsLayer,
  createSubmarinePatrolsLayer,
} from './layers/operational.js?v=map-channel-19';
import {
  createCampsLayer,
  createTransportsLayer,
} from './layers/persecution.js?v=map-channel-19';
import {
  createAidOperationsLayer,
  createDemographicsLayer,
  createFaminesLayer,
  createRefugeesLayer,
} from './layers/humanitarian.js?v=map-channel-19';
import { createSupplyNetworkLayer } from './layers/supply-network.js?v=map-channel-19';
import { createSceneOverlayLayer, describeFeature } from './layers/scene-overlay.js?v=map-channel-19';
import { MapCommandClient } from './core/map-command-client.js?v=map-channel-19';
import { createScenePanel } from './ui/scene-panel.js?v=map-channel-19';
import { createLabelCanvas } from './ui/label-canvas.js?v=map-channel-19';
import { createTransportModeControl } from './ui/transport-mode.js?v=map-channel-19';
import { createPolygonSelect, selectionLayers } from './ui/polygon-select.js?v=map-channel-19';
import { detailFields, selectionFields } from './ui/entity-detail.js?v=map-channel-19';
import { mapBoundsArray } from './core/viewport-data.js?v=map-channel-19';
import { createLegacyMotionLayer } from './layers/legacy-motion.js?v=map-channel-19';
import {
  createLegacyBattlesLayer,
  createLegacyCitiesLayer,
  createLegacyInfrastructureLayer,
  createLegacyPoliticalLabelsLayer,
  createLegacyRailLayer,
  createLegacySitesLayer,
  createLegacyTerritoriesLayer,
} from './layers/legacy-parity.js?v=map-channel-19';

const {
  Deck,
  GeoJsonLayer,
  IconLayer,
  PathLayer,
  PolygonLayer,
  ScatterplotLayer,
  TextLayer,
  TripsLayer,
} = deck;

const urlState = readState();
const detection = detectTier();
let currentTier = detection.tier;
let mapMode = urlState.mode || 'overview';
let selectedEntityId = urlState.selected || null;
let networkData = null;
let relationPanel = null;
let overviewLayerIds = null;
let motionEnabled = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let animationTime = 0;
let animationFrame = null;

const STORY_VIEWS = {
  overview: {
    label: 'התמונה הכללית',
    layers: ['terrain-relief', 'historical-borders', 'legacy-territories', 'legacy-political-labels',
      'legacy-cities', 'legacy-battles', 'convoy-routes', 'naval-losses', 'campaign-motion'],
    view: REGION_VIEWS.europe,
  },
  front: {
    label: 'החזית',
    layers: ['terrain-relief', 'historical-borders', 'legacy-territories', 'legacy-political-labels',
      'legacy-cities', 'legacy-battles', 'legacy-railways', 'campaign-motion'],
    view: REGION_VIEWS.europe,
  },
  industry: {
    label: 'תעשייה ואספקה',
    layers: ['terrain-relief', 'historical-borders', 'legacy-territories', 'legacy-cities',
      'legacy-railways', 'legacy-infrastructure', 'legacy-battles', 'supply-corridors', 'campaign-motion'],
    view: REGION_VIEWS.europe,
  },
  persecution: {
    label: 'רדיפה וגירוש',
    layers: ['terrain-relief', 'historical-borders', 'legacy-territories', 'legacy-sites',
      'transports', 'legacy-railways', 'campaign-motion'],
    view: REGION_VIEWS.europe,
  },
  sea: {
    label: 'המלחמה בים',
    layers: ['terrain-relief', 'historical-borders', 'convoy-routes', 'naval-losses', 'air-gap', 'campaign-motion'],
    view: REGION_VIEWS.atlantic,
  },
};

const engine = new TimeEngine({
  epoch: EPOCH,
  start: TIMELINE_START,
  end: TIMELINE_END,
  defaultStep: DEFAULT_STEP_DAYS,
  windows: HIGH_RES_WINDOWS,
});

const registry = new LayerRegistry({ tierCaps: TIER_CAPS });
let highlightedRouteIds = new Set();
let workbench = null;
const getHighlightedRoutes = () => highlightedRouteIds;
const inspectRoute = (routeId) => workbench?.inspectRoute(routeId);
const getMapMode = () => mapMode;
const getSelectedId = () => selectedEntityId;
const layerSpecs = [
  createTerrainLayer(),
  createHistoricalBordersLayer({ GeoJsonLayer }),
  createBattlesLayer({ ScatterplotLayer, TextLayer, onWhy: showWhy }),
  createConvoyRoutesLayer({
    PathLayer,
    TripsLayer,
    ScatterplotLayer,
    TextLayer,
    getHighlightedRoutes,
    onInspectRoute: inspectRoute,
  }),
  createNavalLossesLayer({ ScatterplotLayer }),
  createAirGapLayer({ PolygonLayer }),
  createSubmarinePatrolsLayer({ PathLayer }),
  createLandSupplyLayer({
    PathLayer,
    ScatterplotLayer,
    TextLayer,
    getHighlightedRoutes,
    onInspectRoute: inspectRoute,
  }),
  createAirBridgesLayer({
    PathLayer,
    ScatterplotLayer,
    TextLayer,
    getHighlightedRoutes,
    onInspectRoute: inspectRoute,
  }),
  createRailwaysLayer({
    PathLayer,
    getHighlightedRoutes,
    onInspectRoute: inspectRoute,
  }),
  createFrontsLayer({ PathLayer, ScatterplotLayer }),
  createFortificationsLayer({ PathLayer }),
  createCampsLayer({ ScatterplotLayer, TextLayer }),
  createTransportsLayer({ PathLayer }),
  createAidOperationsLayer({ PathLayer, ScatterplotLayer }),
  createFaminesLayer({ PolygonLayer }),
  createRefugeesLayer({ PathLayer, ScatterplotLayer }),
  createDemographicsLayer({ ScatterplotLayer, TextLayer }),
  createSupplyNetworkLayer({
    PathLayer,
    ScatterplotLayer,
    TextLayer,
    getMapMode,
    getSelectedId,
    onSelect: selectNetworkEntity,
  }),
  createLegacyTerritoriesLayer({ GeoJsonLayer }),
  createLegacyPoliticalLabelsLayer(),
  createLegacyCitiesLayer({ ScatterplotLayer }),
  createLegacySitesLayer({ ScatterplotLayer, TextLayer }),
  createLegacyBattlesLayer({ ScatterplotLayer, TextLayer }),
  createLegacyRailLayer({ PathLayer }),
  createLegacyInfrastructureLayer({ PathLayer, ScatterplotLayer, TextLayer }),
  createLegacyMotionLayer({ IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer }),
];
// שכבת הסצנה הדינמית — היחידה שהצ׳אט יכול להזין, דרך חוזה סגור.
const sceneOverlay = createSceneOverlayLayer({
  ScatterplotLayer, PathLayer, TextLayer, IconLayer, PolygonLayer, TripsLayer,
  PathStyleExtension: deck.PathStyleExtension,
  CollisionFilterExtension: deck.CollisionFilterExtension,
});
layerSpecs.push(sceneOverlay.spec);

for (const spec of layerSpecs) registry.register(spec);

const card = new EntityCard(document.getElementById('cards'));
function openCard(entity, spec, extraFields = []) {
  if (!spec) return;
  const fmt = (dayIdx) => formatDate(fromDayIndex(dayIdx, EPOCH), 1);
  card.show(entity, {
    title: spec.title,
    subtitle: spec.subtitle,
    fields: [
      ...(spec.fieldsOf ? spec.fieldsOf(entity, fmt) : spec.fields || []),
      ...extraFields,
    ],
    sources: spec.sourcesOf ? spec.sourcesOf(entity) : spec.sources || [],
    charts: spec.chartsOf ? spec.chartsOf(entity) : spec.charts || [],
    actions: spec.actionsOf ? spec.actionsOf(entity) : spec.actions || [],
  });
}

/**
 * ‏לחיצה על ישות של סצנה: הכרטיס נפתח מיד עם מה שכבר ידוע, ובמקביל נשלפת
 * ‏שאילתת פירוט מהגרף — משתתפי הקרב, כוח אדם וציוד. הפתיחה אינה ממתינה
 * ‏לרשת, כי כרטיס שנפתח באיחור נקרא כלחיצה שלא נקלטה.
 */
let detailToken = 0;
function openSceneCard(entity, spec) {
  openCard(entity, spec);
  const entityId = entity?.properties?.entity_id;
  if (!entityId) return;
  const token = ++detailToken;
  mapCommand.detail(entityId)
    .then((payload) => {
      if (token !== detailToken || !payload?.detail) return;
      openCard(entity, spec, detailFields(payload.detail));
    })
    .catch(() => { /* ‏הפירוט הוא תוספת; כישלון שלו אינו סוגר את הכרטיס */ });
}

const analysisBanner = document.getElementById('analysis-banner');
async function showWhy(battle) {
  const context = battle.supply_context;
  if (!context) return;
  highlightedRouteIds = new Set(context.route_ids);
  const wanted = new Set();
  for (const routeId of context.route_ids) {
    if (routeId.startsWith('rail-')) wanted.add('railways');
    else if (['HX', 'SC', 'ON', 'PQ_JW', 'OG_HG'].includes(routeId)) wanted.add('convoy-routes');
    else if (['THE_HUMP', 'ALSIB', 'STALINGRAD_AIRLIFT'].includes(routeId)) wanted.add('air-bridges');
    else wanted.add('supply-corridors');
  }
  for (const id of wanted) await registry.setVisible(id, true, currentTier);
  analysisBanner.textContent = `מצב ״מדוע״ · ${battle.name_he}: ${context.bottleneck_note_he} ההצלבה אלגוריתמית ואינה מוצגת כעובדה מתועדת.`;
  analysisBanner.classList.add('show');
  refreshLayers();
}

async function highlightRoutes(ids) {
  highlightedRouteIds = new Set(ids);
  if (!ids.length) analysisBanner.classList.remove('show');
  for (const routeId of ids) {
    const layer = routeId.startsWith('rail-') ? 'railways'
      : ['HX', 'SC', 'ON', 'PQ_JW', 'OG_HG'].includes(routeId) ? 'convoy-routes'
      : ['THE_HUMP', 'ALSIB', 'STALINGRAD_AIRLIFT'].includes(routeId) ? 'air-bridges'
      : 'supply-corridors';
    await registry.setVisible(layer, true, currentTier);
  }
  refreshLayers();
}

let viewState = { ...INITIAL_VIEW, ...(urlState.view || {}) };
let zoomDetail = zoomDetailLevel(viewState.zoom);
const pushUrl = throttleWriter();
function pushState() {
  pushUrl({
    day: engine.day,
    layers: registry.serialize(),
    view: viewState,
    mode: mapMode,
    selected: mapMode === 'relations' ? selectedEntityId : null,
    scene: mapCommand?.scene?.scene_id || null,
  });
}

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP_STYLE,
  center: [viewState.longitude, viewState.latitude],
  zoom: viewState.zoom,
  bearing: viewState.bearing || 0,
  pitch: viewState.pitch || 0,
  minZoom: 0.8,
  maxZoom: 9,
  pixelRatio: renderPixelRatio(),
  refreshExpiredTiles: false,
  maxTileCacheZoomLevels: 3,
  attributionControl: false,
  interactive: true,
  dragRotate: false,
  pitchWithRotate: false,
  cooperativeGestures: false,
});
map.boxZoom.enable();
map.doubleClickZoom.enable();
map.dragPan.enable({ linearity: 0.3, maxSpeed: 1400, deceleration: 2500 });
map.dragRotate.disable();
map.keyboard.enable();
map.scrollZoom.enable();
map.touchZoomRotate.enable();
map.touchZoomRotate.disableRotation();
map.touchPitch?.disable();

const deckgl = new Deck({
  canvas: document.getElementById('deck-canvas'),
  viewState,
  controller: false,
  useDevicePixels: renderPixelRatio(),
  layers: [],
});

function syncDeckToMap() {
  const center = map.getCenter();
  viewState = {
    longitude: center.lng,
    latitude: center.lat,
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
  deckgl.setProps({ viewState });
  const nextDetail = zoomDetailLevel(viewState.zoom);
  if (nextDetail !== zoomDetail) {
    zoomDetail = nextDetail;
    refreshLayers();
  }
}

map.on('move', syncDeckToMap);
map.on('moveend', () => {
  pushState();
});
map.on('dragstart', () => setActiveRegion(null));
map.on('zoomstart', (event) => {
  if (event.originalEvent) setActiveRegion(null);
});

const mapTooltip = document.getElementById('map-tooltip');
map.on('mousemove', (event) => {
  const info = deckgl.pickObject({
    x: event.point.x,
    y: event.point.y,
    radius: 5,
  });
  const value = info?.object?.properties || info?.object;
  // ‏פיצ׳ר של סצנה מסביר את עצמו: מה, של מי, ועד כמה זה ידוע. שאר השכבות
  // ‏ממשיכות להראות שם בלבד.
  const text = value && (
    (value.subject_id ? describeFeature(value) : '')
    || value.name_he
    || value.name
    || value.name_en
    || value.label
    || value.route_id
  );
  mapTooltip.textContent = text || '';
  mapTooltip.classList.toggle('show', Boolean(text));
  if (text) {
    mapTooltip.style.left = `${event.point.x + 14}px`;
    mapTooltip.style.top = `${event.point.y + 14}px`;
  }
  map.getCanvas().style.cursor = text ? 'pointer' : '';
});
map.on('mouseout', () => {
  mapTooltip.classList.remove('show');
  map.getCanvas().style.cursor = '';
});
map.on('click', (event) => {
  const info = deckgl.pickObject({
    x: event.point.x,
    y: event.point.y,
    radius: 7,
  });
  const handler = info?.layer?.props?.onClick;
  if (typeof handler === 'function') {
    handler(info, { srcEvent: event.originalEvent });
  }
});

// ‏קנבס התוויות יושב מעל deck ומצייר את כל שמות המפה. ‏deck.gl אינו
// ‏מצייר עברית ב-TextLayer, ולכן כל שם על המפה עובר דרך כאן.
const labelCanvas = createLabelCanvas(document.getElementById('map'));

/** ‏אוסף מועמדי תוויות מכל שכבה גלויה שמספקת אותם, לפי סדר הרישום. */
function drawLabels() {
  const candidates = [];
  for (const id of registry.visibleIds) {
    const spec = registry.specs.get(id);
    if (typeof spec?.labels !== 'function') continue;
    const items = spec.labels();
    if (items?.length) candidates.push(...items);
  }
  labelCanvas.draw(candidates);
}

function refreshLayers() {
  deckgl.setProps({
    layers: [...registry.buildLayers({
      day: engine.day,
      minDay: engine.minDay,
      maxDay: engine.maxDay,
      tier: currentTier,
      zoom: viewState.zoom,
      // ‏השלכה למסך: מנוע התוויות צריך פיקסלים כדי לדעת מה חופף על מה.
      // ‏‏MapLibre הוא מקור האמת לתצוגה, ולכן הוא זה שמשליך.
      project: (lngLat) => {
        const point = map.project(lngLat);
        return [point.x, point.y];
      },
      viewportSize: [
        map.getContainer().clientWidth || window.innerWidth,
        map.getContainer().clientHeight || window.innerHeight,
      ],
      animationTime,
      motionEnabled,
      onClick: (entity, spec) => (entity?.properties?.subject_id
        ? openSceneCard(entity, spec)
        : openCard(entity, spec)),
    }),
    ...selectionLayers(polygonSelect, { PolygonLayer, PathLayer, ScatterplotLayer }),
    ],
  });
  // ‏אחרי הבנייה: ה-build של כל שכבה הוא זה שמחשב את המועמדים שלה.
  drawLabels();
}

// ---- ערוץ הצ׳אט → גרף → מפה ------------------------------------------
// הלקוח מפעיל את המפה דרך ה-API הקיים בלבד (TimeEngine, LayerRegistry,
// viewState). הוא אינו מריץ קוד מהצ׳אט ואינו ניגש ל-deck.gl ישירות.
const scenePanel = createScenePanel(document.getElementById('scene-panel'), {
  onFit: (scene) => {
    if (!scene?.camera?.bounds) return;
    const [west, south, east, north] = scene.camera.bounds;
    map.fitBounds([[west, south], [east, north]], {
      padding: { top: 80, bottom: 120, left: 80, right: 360 },
      maxZoom: scene.camera.max_zoom || 8,
      duration: 600,
    });
  },
  onUndo: () => mapCommand.undo(),
  onClear: () => mapCommand.clear(),
  onCopyLink: (scene) => {
    const link = scene?.deep_link || location.href;
    navigator.clipboard?.writeText(link).catch(() => {});
  },
  onLoadUnlocated: () => mapCommand.unlocated(),
});

// ‏בורר אופן התובלה — הפקד שהופך את שכבת התוואי משכבת קושי אחת לשש.
// ‏הוא נרשם על מחסן הסצנה עצמו, ולכן הוא מופיע ברגע שתאי תוואי נכנסים
// ‏ונעלם כשהסצנה מתנקה, בלי שאף אחד יצטרך לזכור לקרוא לו.
const transportControl = createTransportModeControl(
  document.getElementById('transport-mode'), {
    getMode: () => sceneOverlay.getTransportMode(),
    onChange: (mode) => {
      if (!sceneOverlay.setTransportMode(mode)) return false;
      refreshLayers();
      return true;
    },
  },
);
sceneOverlay.store.subscribe((store) => {
  const cells = store.features.filter(
    (f) => f.properties?.entity_kind === 'TerrainCell');
  transportControl.update({
    cells: cells.length,
    unknown: cells.filter((f) => f.properties.terrain_unknown).length,
  });
});

const mapCommand = new MapCommandClient({
  store: sceneOverlay.store,
  registry,
  engine,
  getTier: () => currentTier,
  getViewport: () => ({ bbox: mapBoundsArray(map.getBounds()), zoom: viewState.zoom }),
  setCamera: ({ bounds, maxZoom }) => {
    map.fitBounds(
      [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
      { padding: { top: 80, bottom: 120, left: 80, right: 360 },
        maxZoom: maxZoom || 8, duration: 700 },
    );
  },
  refreshLayers: () => refreshLayers(),
  onScene: (scene, status) => {
    scenePanel.onScene(scene, status);
    // ‏בלי סצנה אין מה לסכם בתוך מצולע, ולכן הכלי מוסתר
    selectTools.hidden = !scene;
    if (!scene && polygonSelect.active) polygonSelect.cancel();
  },
  onProgress: (event) => scenePanel.onProgress(event),
});

// ⚠️ **קנבס הבסיס לא גדל עם החלון.**
// ‏‏MapLibre קובע את גודל הקנבס לפי המכל ברגע היצירה. כאן הוא נוצר
// ‏בזמן שמסך הטעינה עוד פרוס, ונשאר **250×187 בזמן שהחלון 800×450** —
// ‏כלומר מפת הבסיס צוירה בפינה אחת והשאר היה רקע ‏CSS שטוח. זו הייתה
// ‏הסיבה האמיתית לכך שהמפה נראתה כמו כתם צבע בלי קרקע.
// ‏‏`ResizeObserver` ולא אירוע `resize` של החלון: המכל משתנה גם כשפאנל
// ‏נפתח או נסגר, בלי שהחלון זז.
if (typeof ResizeObserver === 'function') {
  const observer = new ResizeObserver(() => {
    map.resize();
    refreshLayers();
  });
  observer.observe(map.getContainer());
}
map.resize();

// ⚠️ ‏עוגני התוויות מחושבים ב-build של כל שכבה, ולכן תזוזה מחייבת
// ‏בנייה מחדש — אבל `move` יורה עשרות פעמים בשנייה, ובנייה מלאה של
// ‏שכבת מסילות עם 471,795 קודקודים בכל אחת מהן הורגת את הקצב.
// ‏חניקה לפריים: לכל היותר בנייה אחת לכל ציור מסך.
let movePending = false;
map.on('move', () => {
  if (movePending) return;
  movePending = true;
  requestAnimationFrame(() => { movePending = false; refreshLayers(); });
});
map.on('moveend', () => { mapCommand.refreshViewport().catch(() => {}); });

// ‏ידית אבחון. ‏**קריאה בלבד** — אין כאן שום דבר שהצ׳אט או דף חיצוני
// ‏יכולים להפעיל, והיא לא נוגעת בנתונים. היא קיימת כי אבחון של שכבה
// ‏שלא מציירת דורש גישה למצב האמיתי: פעמיים כבר נדרשה, ובלעדיה
// ‏התשובה היחידה ל״למה אין תוויות״ הייתה ניחוש.
window.__atlas = {
  get zoom() { return viewState.zoom; },
  get tier() { return currentTier; },
  layerStates: () => [...registry.specs.keys()].map((id) => {
    const state = registry.stateOf(id);
    return { id, visible: state.visible, status: state.status,
             error: state.error ? String(state.error).slice(0, 160) : null };
  }),
  built: () => {
    try {
      return registry.buildLayers({
        day: engine.day, minDay: engine.minDay, maxDay: engine.maxDay,
        tier: currentTier, zoom: viewState.zoom, animationTime, motionEnabled,
        project: (lngLat) => { const q = map.project(lngLat); return [q.x, q.y]; },
        viewportSize: [map.getContainer().clientWidth, map.getContainer().clientHeight],
      }).map((layer) => ({ id: layer.id, rows: layer.props?.data?.length ?? null }));
    } catch (error) { return { error: String(error).slice(0, 300) }; }
  },
};

// ---- בחירת מצולע -------------------------------------------------------
// ‏מציירים אזור על המפה ומקבלים סיכום של מה שבתוכו. הסיכום מחושב בשרת על
// ‏הסצנה עצמה, ולא על מה שבמקרה מצויר כרגע — אחרת התשובה הייתה תלויה בזום.
const selectTools = document.getElementById('select-tools');
const selectButton = document.getElementById('select-start');
const selectHint = document.getElementById('select-hint');

const polygonSelect = createPolygonSelect({
  onChange: () => {
    selectButton.setAttribute('aria-pressed', String(polygonSelect.active));
    selectButton.textContent = polygonSelect.active ? '✕ בטל בחירה' : '✧ בחר אזור';
    selectHint.hidden = !polygonSelect.active;
    map.getCanvas().style.cursor = polygonSelect.active ? 'crosshair' : '';
    // ‏גרירת המפה מושבתת בזמן ציור, אחרת כל קליק גם מזיז את הרקע
    if (polygonSelect.active) map.dragPan.disable();
    else map.dragPan.enable();
    refreshLayers();
  },
  onComplete: (ring) => {
    refreshLayers();
    mapCommand.selectPolygon(ring, { day: engine.day })
      .then((selection) => {
        if (!selection) return;
        card.show({ properties: { name: 'בחירת אזור' } }, {
          title: () => 'מה יש באזור שסימנת',
          subtitle: selection.scenes > 1
            ? `סיכום על ${selection.scenes} סצנות מקבילות`
            : 'סיכום על הסצנה המוצגת',
          fields: selectionFields(selection),
          sources: [],
        });
      })
      .catch(() => {});
  },
});

selectButton.addEventListener('click', () => {
  if (polygonSelect.active) polygonSelect.cancel();
  else polygonSelect.start();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && polygonSelect.active) polygonSelect.cancel();
  if (event.key === 'Backspace' && polygonSelect.active) {
    event.preventDefault();
    polygonSelect.undoPoint();
  }
});
map.on('click', (event) => {
  if (!polygonSelect.active) return;
  polygonSelect.addPoint([event.lngLat.lng, event.lngLat.lat]);
});
map.on('mousemove', (event) => {
  if (!polygonSelect.active) return;
  polygonSelect.moveTo([event.lngLat.lng, event.lngLat.lat]);
});

function syncNativeLayer(id) {
  const spec = registry.get(id);
  const state = registry.stateOf(id);
  if (!spec?.nativeLayerId || !state || !map.getLayer(spec.nativeLayerId)) return;
  map.setLayoutProperty(
    spec.nativeLayerId,
    'visibility',
    state.visible ? 'visible' : 'none',
  );
  if (spec.nativeLayerId === 'terrain-relief-map') {
    map.setPaintProperty(spec.nativeLayerId, 'raster-opacity', state.opacity);
  }
}

function syncNativeLayers() {
  for (const id of registry.specs.keys()) syncNativeLayer(id);
}

async function selectNetworkEntity(entityId, chainId = null) {
  if (!networkData) return;
  const entity = networkData.entityById.get(entityId);
  if (!entity) return;
  selectedEntityId = entityId;
  if (chainId && relationPanel) relationPanel.activeChainId = chainId;
  relationPanel?.render(entityId, engine.day);
  if (entity.position) {
    moveCamera({
      longitude: entity.position[0],
      latitude: entity.position[1],
      zoom: Math.max(4.2, viewState.zoom),
    });
  }
  refreshLayers();
  pushState();
}

function selectRelationChain(chainId, entityId) {
  if (!relationPanel || !networkData) return;
  const relations = networkData.relations.filter((relation) => relation.chain_id === chainId);
  const anchorDay = relations.length
    ? Math.max(...relations.map((relation) => relation.day_from ?? engine.day))
    : engine.day;
  relationPanel.activeChainId = chainId;
  engine.setDay(anchorDay, 'relation-chain');
  relationPanel.render(entityId, engine.day);
  toast(chainId.includes('persian')
    ? 'המסדרון הפרסי · ציר הזמן הותאם ל־1942'
    : 'השרשרת האטלנטית · ציר הזמן הותאם ל־1944');
}

async function setMapMode(nextMode, { initial = false } = {}) {
  const next = nextMode === 'relations' ? 'relations' : 'overview';
  if (next === mapMode && !initial) return;

  if (next === 'relations') {
    if (!overviewLayerIds) overviewLayerIds = [...registry.visibleIds];
    for (const id of [...registry.visibleIds]) {
      if (!['terrain-relief', 'historical-borders'].includes(id)) {
        await registry.setVisible(id, false, currentTier);
      }
    }
    await registry.setVisible('terrain-relief', true, currentTier);
    await registry.setVisible('historical-borders', true, currentTier);
    await registry.setVisible('supply-network', true, currentTier);
    mapMode = 'relations';
    if (!selectedEntityId || !networkData?.entityById.has(selectedEntityId)) {
      selectedEntityId = 'battle:normandy';
      engine.setDay(2713, 'relations-mode');
    }
    relationPanel?.render(selectedEntityId, engine.day);
  } else {
    mapMode = 'overview';
    await registry.setVisible('supply-network', false, currentTier);
    const restore = overviewLayerIds || (initial ? [...registry.visibleIds] : [
      'terrain-relief', 'historical-borders', 'legacy-territories', 'legacy-cities',
      'legacy-battles', 'convoy-routes', 'naval-losses', 'campaign-motion',
    ]);
    for (const id of restore) await registry.setVisible(id, true, currentTier);
  }

  document.body.dataset.mapMode = mapMode;
  atlasDock.setMode(mapMode);
  atlasDock.close();
  for (const button of document.querySelectorAll('.mode-switch [data-map-mode]')) {
    button.classList.toggle('is-active', button.dataset.mapMode === mapMode);
    button.setAttribute('aria-pressed', button.dataset.mapMode === mapMode ? 'true' : 'false');
  }
  refreshLayers();
  pushState();
}

const fpsEl = document.getElementById('fps');
const tierEl = document.getElementById('tier');
function renderTier() {
  tierEl.textContent = `מצב ${TIER_LABEL[currentTier]}`;
  tierEl.className = `stat tier-${currentTier}`;
  tierEl.title = detection.reason;
}

const monitor = new PerfMonitor({
  onSample: (fps) => {
    fpsEl.textContent = `${fps} FPS`;
    fpsEl.classList.toggle('warn', fps < 30);
  },
  onDowngrade: (fps) => {
    const next = nextTierDown(currentTier);
    if (next === currentTier) return;
    currentTier = next;
    renderTier();
    toast(`ירידה למצב ${TIER_LABEL[next]} — ${fps} FPS`);
    refreshLayers();
  },
  // ‏עלייה חזרה: ירידה חד-כיוונית הופכת גמגום של שתי שניות לנזק
  // ‏שנשאר לכל הסשן — ובמצב מינימלי פאנל השכבות כבר מסרב להדליק
  // ‏שכבות. התקרה היא תמיד מה שזוהה למכונה הזאת, לא יותר.
  onRecover: (fps) => {
    const next = nextTierUp(currentTier, detection.tier);
    if (next === currentTier) return;
    currentTier = next;
    renderTier();
    toast(`חזרה למצב ${TIER_LABEL[next]} — ${fps} FPS`);
    refreshLayers();
  },
});

const timeline = new Timeline(document.getElementById('timeline'), engine, {
  onScrub: pushState,
});
new LayerPanel(document.getElementById('layers'), registry, {
  getTier: () => currentTier,
});
const atlasDock = new AtlasDock(
  document.getElementById('atlas-dock'),
  document.getElementById('atlas-dock-toggle'),
);
const legend = new Legend(document.getElementById('legend'), registry, {
  getContext: () => ({
    day: engine.day,
    dateLabel: formatDate(engine.date, engine.step),
  }),
});

engine.subscribe(({ reason, windowChanged, window: activeWindow }) => {
  updateSeasonTint();
  refreshLayers();
  legend.render();
  if (mapMode === 'relations' && selectedEntityId) {
    relationPanel?.render(selectedEntityId, engine.day);
  }
  if (reason !== 'init') pushState();
  if (windowChanged && activeWindow) {
    toast(
      `${activeWindow.label} — רזולוציה ${activeWindow.step === 1 ? 'יומית' : 'שבועית'}`,
    );
  }
});

registry.subscribe((event) => {
  syncNativeLayer(event.id);
  if (event.type === 'status' && event.status === 'ready' && event.id === 'naval-losses') {
    const state = registry.stateOf(event.id);
    timeline.setHistogram(
      buildMaritimeHistogram(state.data.losses, engine.minDay, engine.maxDay),
    );
  }
  if (event.type === 'blocked') {
    toast(`הגעת למגבלת השכבות במצב ${TIER_LABEL[currentTier]}`);
  }
  refreshLayers();
});

attachContextLossHandler(document.getElementById('deck-canvas'), {
  onLost: () => {
    currentTier = TIER.MINIMAL;
    renderTier();
    toast('הקונטקסט הגרפי אבד — מעבר למצב מינימלי');
  },
  onRestored: () => refreshLayers(),
});

function setActiveRegion(key) {
  for (const item of document.querySelectorAll('[data-region]')) {
    item.classList.toggle('is-active', item.dataset.region === key);
  }
}

function moveCamera(next, regionKey = null) {
  setActiveRegion(regionKey);
  map.easeTo({
    center: [next.longitude, next.latitude],
    zoom: next.zoom,
    bearing: next.bearing || 0,
    pitch: next.pitch || 0,
    duration: 460,
    essential: true,
  });
}

for (const button of document.querySelectorAll('[data-region]')) {
  button.addEventListener('click', () => {
    const next = REGION_VIEWS[button.dataset.region];
    if (!next) return;
    moveCamera(next, button.dataset.region);
  });
}

for (const button of document.querySelectorAll('.mode-switch [data-map-mode]')) {
  button.addEventListener('click', () => setMapMode(button.dataset.mapMode));
}

for (const button of document.querySelectorAll('[data-map-action]')) {
  button.addEventListener('click', () => {
    const action = button.dataset.mapAction;
    if (action === 'zoom-in') {
      setActiveRegion(null);
      map.zoomIn({ duration: 180 });
      toast('זום פנימה');
    } else if (action === 'zoom-out') {
      setActiveRegion(null);
      map.zoomOut({ duration: 180 });
      toast('זום החוצה');
    } else if (action === 'world') {
      moveCamera(REGION_VIEWS.world, 'world');
      toast('תצוגה עולמית — הקרבות נשארים מסונכרנים לתאריך');
    } else if (action === 'motion') {
      motionEnabled = !motionEnabled;
      button.classList.toggle('is-active', motionEnabled);
      button.textContent = motionEnabled ? '◉' : '○';
      button.setAttribute('aria-label', motionEnabled ? 'השהיית אנימציות' : 'הפעלת אנימציות');
      button.title = motionEnabled ? 'השהיית אנימציות' : 'הפעלת אנימציות';
      toast(motionEnabled ? 'אנימציות תנועה הופעלו' : 'אנימציות תנועה הושהו');
      if (motionEnabled) startMotionClock();
      refreshLayers();
    }
  });
}

const motionButton = document.querySelector('[data-map-action="motion"]');
motionButton?.classList.toggle('is-active', motionEnabled);
if (motionButton) {
  motionButton.textContent = motionEnabled ? '◉' : '○';
  motionButton.setAttribute('aria-label', motionEnabled ? 'השהיית אנימציות' : 'הפעלת אנימציות');
  motionButton.title = motionEnabled ? 'השהיית אנימציות' : 'הפעלת אנימציות';
}

function updateSeasonTint() {
  const month = engine.date.getUTCMonth();
  const season = [11, 0, 1].includes(month) ? 'winter'
    : [2, 3, 4].includes(month) ? 'spring'
      : [5, 6, 7].includes(month) ? 'summer' : 'autumn';
  document.getElementById('season-tint')?.setAttribute('data-season', season);
  const seasonLabel = document.getElementById('season-label');
  if (seasonLabel) {
    seasonLabel.textContent = {
      winter: 'חורף',
      spring: 'אביב',
      summer: 'קיץ',
      autumn: 'סתיו',
    }[season];
  }
}

function startMotionClock() {
  if (animationFrame || !motionEnabled) return;
  let last = 0;
  const tick = (now) => {
    animationFrame = requestAnimationFrame(tick);
    if (!motionEnabled || document.hidden || mapMode === 'relations') return;
    const interval = currentTier === TIER.FULL ? 90 : currentTier === TIER.REDUCED ? 170 : 300;
    if (now - last < interval) return;
    last = now;
    animationTime = now;
    refreshLayers();
  };
  animationFrame = requestAnimationFrame(tick);
}

function toast(text) {
  const element = document.getElementById('toast');
  element.textContent = text;
  element.classList.add('show');
  clearTimeout(element._timer);
  element._timer = setTimeout(() => element.classList.remove('show'), 3200);
}

async function focusSearchResult(item) {
  const networkId = item.id?.includes(':') ? item.id : null;
  if (networkId && networkData?.entityById.has(networkId)) {
    await setMapMode('relations');
    await selectNetworkEntity(networkId);
    return;
  }
  if (Number.isFinite(item.from)) engine.setDay(item.from, 'search');
  if (item.layer && registry.get(item.layer)) {
    await registry.setVisible(item.layer, true, currentTier);
  }
  if (Number.isFinite(item.lon) && Number.isFinite(item.lat)) {
    moveCamera({
      longitude: item.lon,
      latitude: item.lat,
      zoom: Math.max(5, viewState.zoom),
    });
  }
  toast(`${item.label} — נמצא באינדקס המקומי`);
}

async function applyTourStep(item) {
  engine.setDay(item.day, 'tour');
  const wanted = new Set(item.layers || []);
  wanted.add('terrain-relief');
  for (const id of registry.specs.keys()) {
    const shouldShow = wanted.has(id);
    if (registry.stateOf(id).visible && !shouldShow) {
      await registry.setVisible(id, false, currentTier);
    }
  }
  for (const id of wanted) {
    if (registry.get(id)) await registry.setVisible(id, true, currentTier);
  }
  moveCamera(item.view);
  analysisBanner.textContent = `${item.title_he} · ${item.body_he}`;
  analysisBanner.classList.add('show');
  toast('תחנת הסיור נטענה');
}

async function applyStoryView(key) {
  const preset = STORY_VIEWS[key];
  if (!preset) return;
  if (mapMode !== 'overview') await setMapMode('overview');
  const wanted = new Set(preset.layers);
  for (const id of [...registry.visibleIds]) {
    if (!wanted.has(id)) await registry.setVisible(id, false, currentTier);
  }
  for (const id of preset.layers) {
    if (registry.get(id)) await registry.setVisible(id, true, currentTier);
  }
  overviewLayerIds = [...registry.visibleIds];
  moveCamera(preset.view, key === 'sea' ? 'atlantic' : 'europe');
  for (const button of document.querySelectorAll('[data-story-view]')) {
    const active = button.dataset.storyView === key;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  toast(`${preset.label} · השכבות הותאמו`);
  refreshLayers();
  pushState();
}

for (const button of document.querySelectorAll('[data-story-view]')) {
  button.addEventListener('click', () => applyStoryView(button.dataset.storyView));
}

function itemGeometry(item) {
  if (item.position) return { type: 'Point', coordinates: item.position };
  if (item.path) return { type: 'LineString', coordinates: item.path };
  if (item.polygon) return { type: 'Polygon', coordinates: [item.polygon] };
  return null;
}

function pointInBounds(position, bounds) {
  if (!position) return false;
  const [lon, lat] = position;
  return lon >= bounds.getWest() && lon <= bounds.getEast()
    && lat >= bounds.getSouth() && lat <= bounds.getNorth();
}

function geometryTouchesBounds(geometry, bounds) {
  if (!geometry) return false;
  if (geometry.type === 'Point') return pointInBounds(geometry.coordinates, bounds);
  const coordinates = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates;
  return coordinates.some((position) => pointInBounds(position, bounds));
}

function atlasRowsForExport(atlas) {
  const mapping = {
    supply_routes: 'supply-corridors',
    submarine_patrols: 'submarine-patrols',
    railways: 'railways',
    camps: 'camps',
    transports: 'transports',
    fronts: 'fronts',
    fortifications: 'fortifications',
    aid_operations: 'aid-operations',
    famines: 'famines',
    refugee_flows: 'refugees',
    demographics: 'demographics',
  };
  const rows = [];
  for (const [key, layer] of Object.entries(mapping)) {
    if (!registry.stateOf(layer)?.visible) continue;
    for (const item of atlas[key] || []) {
      const active = (item.day_from ?? -Infinity) <= engine.day
        && engine.day <= (item.day_to ?? Infinity);
      if (active || key === 'demographics') rows.push({ item, kind: key, layer });
    }
  }
  return rows;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCurrentView(format, atlas) {
  const bounds = map.getBounds();
  const features = atlasRowsForExport(atlas)
    .map(({ item, kind, layer }) => ({
      type: 'Feature',
      id: item.id || item.route_id || item.place_id,
      geometry: itemGeometry(item),
      properties: {
        id: item.id || item.route_id || item.place_id,
        name: item.name_he || item.name_en || item.id,
        kind,
        layer,
        valid_from: item.active_from || item.valid_from || null,
        valid_to: item.active_to || item.valid_to || null,
        derivation: item.derivation || null,
        source_ids: item.source_ids || [],
      },
    }))
    .filter((feature) => geometryTouchesBounds(feature.geometry, bounds));

  const stamp = formatDate(engine.date, engine.step).replace(/\s+/g, '-');
  if (format === 'geojson') {
    downloadText(
      `ww2-atlas-${stamp}.geojson`,
      `${JSON.stringify({ type: 'FeatureCollection', features }, null, 2)}\n`,
      'application/geo+json;charset=utf-8',
    );
  } else {
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const lines = [
      ['id', 'name', 'kind', 'layer', 'valid_from', 'valid_to', 'derivation', 'source_ids']
        .map(quote).join(','),
      ...features.map((feature) => {
        const p = feature.properties;
        return [p.id, p.name, p.kind, p.layer, p.valid_from, p.valid_to,
          p.derivation, p.source_ids.join('|')].map(quote).join(',');
      }),
    ];
    downloadText(`ww2-atlas-${stamp}.csv`, `${lines.join('\n')}\n`, 'text/csv;charset=utf-8');
  }
  toast(`יוצאו ${features.length} ישויות מהתצוגה`);
}

function toggleKiosk() {
  const active = document.body.classList.toggle('kiosk');
  toast(active ? 'מצב קיוסק פעיל · Esc ליציאה' : 'מצב קיוסק הסתיים');
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('kiosk')) {
    document.body.classList.remove('kiosk');
    toast('מצב קיוסק הסתיים');
  }
  const tag = event.target?.tagName?.toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return;
  if (event.target?.closest?.('.tl-track')
      && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  if (event.key === ' ' && !event.repeat) {
    event.preventDefault();
    engine.toggle();
  } else if (event.key === '/' && !event.repeat) {
    event.preventDefault();
    atlasDock.open('tools');
    workbench?.open('search');
  } else if ((event.key === 'f' || event.key === 'F') && !event.repeat) {
    event.preventDefault();
    toggleKiosk();
  } else if (event.key === 'Home') {
    engine.setDay(engine.minDay, 'keyboard');
  } else if (event.key === 'End') {
    engine.setDay(engine.maxDay, 'keyboard');
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const direction = event.key === 'ArrowLeft' ? 1 : -1;
    const days = event.ctrlKey || event.metaKey ? 365 : event.shiftKey ? 7 : engine.step;
    engine.setDay(engine.day + direction * days, 'keyboard');
    event.preventDefault();
  }
});

let booted = false;
async function boot() {
  if (booted) return;
  booted = true;

  renderTier();
  monitor.start();

  if (urlState.layers) registry.applySerialized(urlState.layers, currentTier);
  if (currentTier !== TIER.MINIMAL) {
    registry.stateOf('campaign-motion').visible = true;
    registry.stateOf('battles').visible = false;
    registry.stateOf('legacy-battles').visible = true;
  }
  if (currentTier === TIER.FULL) {
    registry.stateOf('legacy-territories').visible = true;
    registry.stateOf('legacy-political-labels').visible = true;
    registry.stateOf('legacy-cities').visible = true;
  }
  if (Number.isFinite(urlState.day)) engine.setDay(urlState.day, 'deeplink');
  else engine.setDate(DEFAULT_DATE);

  const cap = TIER_CAPS[currentTier].maxLayers;
  for (const id of registry.visibleIds.slice(cap)) {
    registry.stateOf(id).visible = false;
  }
  await Promise.all(registry.visibleIds.map((id) => registry.load(id)));

  const [atlas, maritime, battlesPayload, legacyBattles, legacyPlaces, legacyMaritime, legacyMotion] = await Promise.all([
    loadAtlasData(),
    // ‏דרך המטמון המשותף: אותם קבצים כבר נמשכו על ידי השכבות עצמן,
    // ‏ומשיכה נוספת כאן פירושה לפענח עוד פעם עשרות מגה-בייט של JSON.
    loadJson('./data/stage2/convoy-routes.json'),
    loadJson('./data/stage2/battles.json'),
    loadJson('./data/legacy/battles.json'),
    loadJson('./data/legacy/places.json'),
    loadJson('./data/legacy/maritime.json'),
    loadJson('./data/motion/motion.json'),
  ]);
  networkData = await loadNetworkData();
  relationPanel = new RelationPanel(
    document.getElementById('selection-panel'),
    document.getElementById('chain-dock'),
    networkData,
    { onSelect: selectNetworkEntity, onChainSelect: selectRelationChain },
  );
  workbench = new Workbench(document.getElementById('workbench'), {
    atlas,
    maritimeRoutes: maritime.routes.filter((route) => route.mode === 'ים'),
    engine,
    registry,
    onFocus: focusSearchResult,
    onTourStep: applyTourStep,
    onRouteHighlight: highlightRoutes,
    onExport: (format) => exportCurrentView(format, atlas),
    onKiosk: toggleKiosk,
  });
  await workbench.init();

  new EventFeed(document.getElementById('event-feed'), engine, {
    atlas,
    battles: battlesPayload.battles,
    legacyBattles,
    legacyPlaces,
    legacyMaritime,
    legacyMotion,
    onFocus: focusSearchResult,
  });
  const activityDensity = buildLegacyActivityDensity({
    battles: legacyBattles,
    places: legacyPlaces,
    maritime: legacyMaritime,
    motion: legacyMotion,
  }, engine.minDay, engine.maxDay);
  engine.setActivityDensity(activityDensity, engine.minDay);
  timeline.setHistogram(bucketActivityDensity(activityDensity));

  await setMapMode(mapMode, { initial: true });

  updateSeasonTint();
  startMotionClock();

  syncNativeLayers();
  refreshLayers();
  // המפה חייבת לסיים boot בלי תלות בערוץ הצ׳אט. ההפעלה נעשית אחרי הסרת
  // מסך הטעינה ובתוך try, כדי ששגיאה בערוץ לעולם לא תשאיר מסך תקוע.
  document.getElementById('boot')?.remove();
  try {
    mapCommand.start().catch((error) => {
      console.warn('ערוץ הסצנות אינו זמין:', error?.message || error);
    });
  } catch (error) {
    console.warn('ערוץ הסצנות נכשל בהפעלה:', error?.message || error);
  }
  console.info('[שלבים 1–8] דרג:', currentTier, '·', detection.reason, detection.gpu);
}

map.on('load', boot);
map.on('error', (event) => {
  console.warn('מפת הבסיס נכשלה:', event?.error?.message || event);
  if (document.getElementById('boot')) boot();
});
