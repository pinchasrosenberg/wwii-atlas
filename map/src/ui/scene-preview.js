/**
 * ‏דף תצוגה לשכבת הסצנה, בלי הגשר.
 *
 * ‏קיים כדי שאפשר יהיה לראות ולשפוט את התנועה גם כשהגשר כבוי, ובעיקר כדי
 * ‏שאפשר יהיה לבדוק את השכבה מול נתונים אמיתיים ולא מול פיקסטורה כתובה ביד:
 * ‏data/demo-front-scene.json נבנה דרך build_scene של השרת עצמו.
 */
import { BASEMAP_STYLE, EPOCH } from '../config.js?v=map-channel-19';
import { createSceneOverlayLayer, frontAtDay } from '../layers/scene-overlay.js?v=map-channel-19';

const { Deck, IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer, TripsLayer, PathStyleExtension } = deck;

// ‏מפתח גרסה: בלעדיו הדפדפן מגיש JSON ישן והדף מציג סצנה שכבר הוחלפה
const payload = await (await fetch('./data/demo-front-scene.json?v=map-channel-19')).json();
const overlay = createSceneOverlayLayer({
  ScatterplotLayer, PathLayer, TextLayer, IconLayer, PolygonLayer, TripsLayer,
  PathStyleExtension,
  CollisionFilterExtension: deck.CollisionFilterExtension,
});
const store = await overlay.spec.load();
store.apply(payload.scene, { features: payload.features });

const snapshots = payload.features.filter(
  (f) => f.properties.entity_kind === 'FrontLineSnapshot');
const dayMin = Math.min(...snapshots.map((f) => f.properties.day_from));
const dayMax = Math.max(...snapshots.map((f) => f.properties.day_from));

// ‏מסגרים לפי הנתונים עצמם במקום מספר קסם
const allCoords = payload.features.flatMap((f) => (
  f.geometry.type === 'LineString' ? f.geometry.coordinates : [f.geometry.coordinates]));
const lons = allCoords.map((c) => c[0]);
const lats = allCoords.map((c) => c[1]);
const view = {
  longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
  latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
  zoom: 5.1, pitch: 0, bearing: 0,
};
const map = new maplibregl.Map({
  container: 'map', style: BASEMAP_STYLE,
  center: [view.longitude, view.latitude], zoom: view.zoom,
  attributionControl: false, minZoom: 3, maxZoom: 9,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');

const deckgl = new Deck({
  parent: document.getElementById('map'),
  initialViewState: view, controller: false,
  style: { position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' },
  layers: [],
});
map.on('move', () => {
  const c = map.getCenter();
  Object.assign(view, { longitude: c.lng, latitude: c.lat, zoom: map.getZoom(),
    pitch: map.getPitch(), bearing: map.getBearing() });
  deckgl.setProps({ viewState: view });
  draw();
});

const dateEl = document.getElementById('date');
const basisEl = document.getElementById('basis');
const noteEl = document.getElementById('note');
const warnEl = document.getElementById('warn');
const slider = document.getElementById('slider');
const playBtn = document.getElementById('play');
const tip = document.getElementById('tip');

warnEl.textContent = (payload.scene.warnings || []).find((w) => w.includes('גאוקודינג')) || '';

function dayToText(day) {
  const d = new Date(EPOCH.getTime() + day * 86400000);
  return d.toISOString().slice(0, 10);
}

let day = dayMin;
let playing = true;
let t0 = performance.now();

function draw() {
  const at = frontAtDay(snapshots, Math.round(day));
  dateEl.textContent = dayToText(Math.round(day));
  basisEl.textContent = at.exact ? 'תצלום מתועד' : 'אינטרפולציה — שחזור';
  basisEl.className = 'tag ' + (at.exact ? 'exact' : 'recon');
  // ‏הפרויקט אוסר innerHTML לחלוטין; בונים צמתים.
  const line1 = document.createElement('div');
  line1.textContent = at.to
    ? `${snapshots.length} תצלומים · בין ${dayToText(at.from.properties.day_from)}`
      + ` ל־${dayToText(at.to.properties.day_from)}`
    : `${snapshots.length} תצלומים מתוארכים`;
  const line2 = document.createElement('div');
  line2.textContent = 'קו מלא = יום מתועד · קו מקווקו = שחזור';
  noteEl.replaceChildren(line1, line2);
  deckgl.setProps({
    viewState: view,
    layers: overlay.spec.build(store, {
      opacity: 1, zoom: view.zoom, day: Math.round(day),
      animationTime: (performance.now() - t0) / 1000, motionEnabled: true,
    }),
  });
}

function frame(now) {
  if (playing) {
    day += 0.55;
    if (day > dayMax) day = dayMin;
    slider.value = String(Math.round(((day - dayMin) / (dayMax - dayMin)) * 1000));
  }
  draw();
  requestAnimationFrame(frame);
}
slider.addEventListener('input', () => {
  playing = false; playBtn.textContent = '▶ הפעל';
  day = dayMin + (Number(slider.value) / 1000) * (dayMax - dayMin);
});
playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? '⏸ עצור' : '▶ הפעל';
});
// ‏‏MapLibre דוחה את אירוע load בטאב שאינו גלוי, ולכן אסור לתלות בו את
// ‏לולאת הציור: ‏deck.gl אינו זקוק לרקע כדי לצייר.
map.on('error', (event) => console.warn('basemap', event && event.error));
requestAnimationFrame(frame);
// ‏שליטה בזום מהקונסולה, לבדיקת כל רמות התצוגה
window.setZoom = (z) => { map.setZoom(z); view.zoom = z; deckgl.setProps({ viewState: view }); draw(); };
window.__preview = {
  store, snapshots, dayMin, dayMax, frontAtDay, map, deckgl,
  setDay: (d) => { playing = false; day = d; draw(); },
  layerIds: () => deckgl.props.layers.map((l) => l.id),
};
