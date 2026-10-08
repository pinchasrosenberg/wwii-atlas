/**
 * ‏דף תצוגה לשכבת התוואי, בלי הגשר.
 *
 * ‏אותה סיבה שבגללה קיים scene-preview: אפשר לשפוט שכבה רק כשרואים
 * ‏אותה. הפיקסטורה כאן היא **214 תאים אמיתיים מהגרף** סביב באסטון,
 * ‏שעברו דרך `adapter_terrain` של השרת עצמו — לא מספרים שהומצאו לדף.
 *
 * ‏מה שצריך לראות: יער הארדנים כתם כהה, נהר האור כרצועה, והשטח הפתוח
 * ‏ממערב **בלי צבע כלל**. ולחיצה על ״זחל״ מבהירה את כל התמונה בבת אחת.
 */
import { BASEMAP_STYLE } from '../config.js?v=map-channel-19';
import { createSceneOverlayLayer } from '../layers/scene-overlay.js?v=map-channel-19';
import { createTransportModeControl } from './transport-mode.js?v=map-channel-19';

const { Deck, IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer, TripsLayer,
        PathStyleExtension } = deck;

const payload = await (await fetch('./data/demo-terrain-scene.json?v=map-channel-19')).json();
const overlay = createSceneOverlayLayer({
  ScatterplotLayer, PathLayer, TextLayer, IconLayer, PolygonLayer, TripsLayer,
  PathStyleExtension, CollisionFilterExtension: deck.CollisionFilterExtension,
});
const store = await overlay.spec.load();
store.apply(payload.scene, { features: payload.features });

// ⚠️ ‏פוליגון הוא רשימת **טבעות**, לא רשימת נקודות. שיטוח לפי סוג
// ‏הגיאומטריה ולא ניחוש — אחרת המרכז יוצא NaN והדף נפתח על אוקיינוס.
function pointsOf(geometry) {
  if (!geometry) return [];
  const c = geometry.coordinates;
  switch (geometry.type) {
    case 'Point': return [c];
    case 'LineString': return c;
    case 'Polygon': return c.flat();
    case 'MultiPolygon': return c.flat(2);
    default: return [];
  }
}
const points = payload.features.flatMap((f) => pointsOf(f.geometry));
const lons = points.map((p) => p[0]);
const lats = points.map((p) => p[1]);
const view = {
  longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
  latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
  zoom: 9.2, pitch: 0, bearing: 0,
};

const map = new maplibregl.Map({
  container: 'map', style: BASEMAP_STYLE,
  center: [view.longitude, view.latitude], zoom: view.zoom,
  attributionControl: false, minZoom: 5, maxZoom: 12,
});
map.on('error', (event) => console.warn('basemap', event && event.error));

const deckgl = new Deck({
  parent: document.getElementById('map'),
  initialViewState: view, controller: false,
  style: { position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' },
  layers: [],
});
map.on('move', () => {
  const c = map.getCenter();
  Object.assign(view, { longitude: c.lng, latitude: c.lat, zoom: map.getZoom() });
  deckgl.setProps({ viewState: view });
  draw();
});

function draw() {
  deckgl.setProps({
    viewState: view,
    layers: overlay.spec.build(store, {
      opacity: 1, zoom: view.zoom, day: 0, animationTime: 0, motionEnabled: false,
    }),
  });
}

const control = createTransportModeControl(document.getElementById('transport-mode'), {
  getMode: () => overlay.getTransportMode(),
  onChange: (mode) => {
    if (!overlay.setTransportMode(mode)) return false;
    draw();
    return true;
  },
});
const cells = payload.features.filter((f) => f.properties.entity_kind === 'TerrainCell');
control.update({
  cells: cells.length,
  unknown: cells.filter((f) => f.properties.terrain_unknown).length,
});

document.getElementById('warn').textContent = (payload.scene.warnings || []).join(' · ');
draw();

window.__terrainPreview = {
  store, overlay, map, deckgl, draw,
  setMode: (mode) => { overlay.setTransportMode(mode); draw(); },
  layerIds: () => deckgl.props.layers.map((l) => l.id),
};
