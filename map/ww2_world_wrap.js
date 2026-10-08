/* Endless east–west scrolling (2026-09-25). Replaces the fixed Pacific view: the map can be dragged east or west
   forever, like Google Maps, and every layer comes along — not only the base tiles.
   How: the projection is centred on a meridian that follows the view (in 45° steps, a whole number of tiles at
   every zoom ≥ 3). The seam of the world therefore always sits on the far side of the globe, off screen.
   • the projection wraps longitudes, so markers, canvases and latLngToContainerPoint land next to the view;
   • lines and polygons are unwrapped point by point, so nothing crossing the seam is drawn as a stripe;
   • tile columns are shifted by the same whole number of tiles, and tiles repeat (noWrap off);
   • map.getBounds() returns continuous longitudes and bounds.contains() accepts lng ± 360·k, so layers that
     cull by the visible area keep drawing on both sides of the date line;
   • when the view drifts toward the seam, the centre meridian is moved on moveend (one redraw).
   Only latitude is limited now; there is no longitude edge to bounce back from. */
(() => {
 'use strict';
 if (!window.L || typeof map === 'undefined') return;
 const STEP = 45;                                             // 2^3 tiles · 45/360 = 1 tile at zoom 3
 const LAT_MIN = -78, LAT_MAX = 85;
 let SHIFT = 0;                                               // current centre meridian
 const wrap = d => ((d + 180) % 360 + 360) % 360 - 180;
 const near = (lng, ref) => lng + 360 * Math.round((ref - lng) / 360);
 const SM = L.Projection.SphericalMercator;
 const Proj = {
  R: SM.R, MAX_LATITUDE: SM.MAX_LATITUDE, bounds: SM.bounds,
  project(ll) { return SM.project(L.latLng(ll.lat, wrap(ll.lng - SHIFT))); },
  unproject(p) { const ll = SM.unproject(p); return L.latLng(ll.lat, ll.lng + SHIFT); }
 };
 const WRAP = L.extend({}, L.CRS.EPSG3857, { projection: Proj, code: 'EPSG:3857-wrap', wrapLng: [-180, 179.999999] });
 const isWrap = m => m && m.options.crs === WRAP;

 // tiles: shifted projection → shifted tile columns
 const origUrl = L.TileLayer.prototype.getTileUrl;
 L.TileLayer.prototype.getTileUrl = function (c) {
  if (isWrap(this._map) && SHIFT) {
   const n = 1 << this._getZoomForUrl(), off = Math.round(n * SHIFT / 360);
   const cc = L.point((((c.x + off) % n) + n) % n, c.y); cc.z = c.z; c = cc;
  }
  return origUrl.call(this, c);
 };
 // every grid layer repeats across the world (existing ones are switched below)
 const unbound = l => { l.options.noWrap = false; l.options.bounds = null; };
 const origGridAdd = L.GridLayer.prototype.onAdd;
 L.GridLayer.prototype.onAdd = function (m) { if (isWrap(m)) unbound(this); return origGridAdd.call(this, m); };

 // lines/polygons: keep consecutive points on the same side of the seam
 const origProj = L.Polyline.prototype._projectLatlngs;
 L.Polyline.prototype._projectLatlngs = function (latlngs, result, projectedBounds) {
  if (!isWrap(this._map) || !(latlngs[0] instanceof L.LatLng)) return origProj.call(this, latlngs, result, projectedBounds);
  const W = WRAP.scale(this._map.getZoom()), ring = [];
  for (let i = 0; i < latlngs.length; i++) {
   const p = this._map.latLngToLayerPoint(latlngs[i]);
   if (i) { const q = ring[i - 1]; while (p.x - q.x > W / 2) p.x -= W; while (q.x - p.x > W / 2) p.x += W; }
   ring[i] = p; projectedBounds.extend(p);
  }
  result.push(ring);
 };
 // visible area with continuous longitudes, and a contains() that understands lng ± 360·k
 const origBounds = L.Map.prototype.getBounds;
 L.Map.prototype.getBounds = function () {
  if (!isWrap(this)) return origBounds.call(this);
  const pb = this.getPixelBounds(), W = WRAP.scale(this.getZoom());
  const lonAt = x => SHIFT - 180 + (x / W) * 360;
  const sw = this.unproject(pb.getBottomLeft()), ne = this.unproject(pb.getTopRight());
  return L.latLngBounds([sw.lat, lonAt(pb.min.x)], [ne.lat, lonAt(pb.max.x)]);
 };
 const origContains = L.LatLngBounds.prototype.contains;
 L.LatLngBounds.prototype.contains = function (obj) {
  if (!isWrap(map) || !obj || obj instanceof L.LatLngBounds || (Array.isArray(obj) && Array.isArray(obj[0])) ||
      !(Array.isArray(obj) || obj.lat !== undefined)) return origContains.call(this, obj);
  const ll = L.latLng(obj), c = (this._southWest.lng + this._northEast.lng) / 2;
  return origContains.call(this, L.latLng(ll.lat, near(ll.lng, c)));
 };
 // helper for layers that compare raw longitudes with getWest()/getEast()
 L.ww2NearLng = near;

 // canvas layers that draw their own lines point by point: a segment jumping across the world is the seam,
 // not geography — lift the pen instead of drawing a stripe across the whole map. The threshold is a third of the world: curves drawn through mid-points split a seam jump into two half-jumps.
 // Leaflet's own canvas renderer is exempt — its paths are already unwrapped above and may hold long legs.
 const seamPx = () => WRAP.scale(map.getZoom()) / 3;
 const inMap = cv => {
  if (cv._ww2InMap === undefined) cv._ww2InMap = !cv._ww2Leaflet && !!(cv.closest && cv.closest('.leaflet-container'));
  return cv._ww2InMap;
 };
 const origInit = L.Canvas.prototype._initContainer;
 L.Canvas.prototype._initContainer = function () { origInit.call(this); this._container._ww2Leaflet = true; };
 map.eachLayer(l => { if (l instanceof L.Canvas && l._container) l._container._ww2Leaflet = true; });
 const guardPath = (proto, canvasOf) => {
  const mt = proto.moveTo, cp = proto.closePath, bp = proto.beginPath, ar = proto.arc;
  // xs: every x of the segment (control points too — a curve whose control point sits across the seam
  // swings out over the whole map even when its end point lands nearby)
  const jumps = (self, xs) => {
   if (self._ww2x === undefined || !isWrap(map)) return false;
   const s = seamPx(); let far = false;
   for (const x of xs) if (Math.abs(x - self._ww2x) > s) { far = true; break; }
   return far && inMap(canvasOf(self));
  };
  const lift = (self, x, y) => { self._ww2x = self._ww2sx = x; return mt.call(self, x, y); };
  proto.moveTo = function (x, y) { return lift(this, x, y); };
  if (bp) proto.beginPath = function () { this._ww2x = this._ww2sx = undefined; return bp.call(this); };
  // every segment type ends at its last (x, y) pair
  for (const name of ['lineTo', 'quadraticCurveTo', 'bezierCurveTo']) {
   const orig = proto[name]; if (!orig) continue;
   proto[name] = function (...a) {
    const x = a[a.length - 2], y = a[a.length - 1];
    if (jumps(this, a.filter((v, i) => i % 2 === 0))) return lift(this, x, y);
    this._ww2x = x; return orig.apply(this, a);
   };
  }
  proto.closePath = function () {
   if (this._ww2sx !== undefined && this._ww2x !== undefined && Math.abs(this._ww2x - this._ww2sx) > seamPx() && isWrap(map)) return;
   this._ww2x = this._ww2sx; return cp.call(this);
  };
  proto.arc = function (x, y, r, a0, a1, ccw) {
   if (this._ww2sx === undefined) this._ww2sx = x + r * Math.cos(a0);
   this._ww2x = x + r * Math.cos(a1); return ar.call(this, x, y, r, a0, a1, ccw);
  };
 };
 guardPath(CanvasRenderingContext2D.prototype, ctx => ctx.canvas);   // only canvases inside the map

 function halfWidthDeg() { return map.getSize().x / 2 / WRAP.scale(map.getZoom()) * 360; }
 function reanchor(force) {
  const c = map.getCenter(), z = map.getZoom();
  const target = Math.round(c.lng / STEP) * STEP;
  // keep the seam at least one screen-width (plus margin) away from the centre
  if (!force && 180 - Math.abs(c.lng - SHIFT) > halfWidthDeg() * 1.25 + 10) return;
  if (!force && target === SHIFT) return;
  SHIFT = target;
  WRAP.wrapLng = [SHIFT - 180, SHIFT + 179.999999];
  map._resetView(c, z, true);
  map.eachLayer(l => { if (l instanceof L.GridLayer) l.redraw(); });
  map.fire('viewreset'); map.fire('zoomend'); map.fire('moveend');
 }
 function clampLat() {
  const c = map.getCenter();
  if (c.lat > LAT_MAX || c.lat < LAT_MIN) map.panTo([Math.max(LAT_MIN, Math.min(LAT_MAX, c.lat)), c.lng], { animate: false });
 }
 let busy = false;
 map.on('moveend zoomend', () => {
  if (busy) return; busy = true;
  try { clampLat(); reanchor(false); } finally { busy = false; }
 });

 // switch the live map over
 const c0 = map.getCenter();
 map.setMaxBounds(null);
 map.options.maxBounds = null;
 map.options.worldCopyJump = false;
 map.eachLayer(l => { if (l instanceof L.GridLayer) unbound(l); });
 map.options.crs = WRAP;
 busy = true;
 try { SHIFT = Math.round(c0.lng / STEP) * STEP; reanchor(true); } finally { busy = false; }

 // shortcut button: jump between Europe and the Pacific (scrolling works everywhere without it)
 const PAC = { c: [25, 160], z: 4 }, EUR = { c: [50, 16], z: 5 };
 const inPac = () => { const l = wrap(map.getCenter().lng); return l > 90 || l < -100; };
 let btn = null;
 const label = () => { if (btn) btn.innerHTML = inPac() ? '🌍 לאירופה' : '🌏 לאוקיינוס השקט'; };
 const Ctl = L.Control.extend({ options: { position: 'topleft' }, onAdd() {
  btn = L.DomUtil.create('a', 'ww2PacViewBtn'); btn.href = '#'; label();
  btn.title = 'קפיצה מהירה. המפה נגללת מזרחה ומערבה בלי סוף גם בלי הכפתור';
  L.DomEvent.disableClickPropagation(btn);
  L.DomEvent.on(btn, 'click', e => {
   L.DomEvent.preventDefault(e);
   const go = inPac() ? EUR : PAC, lng = near(go.c[1], map.getCenter().lng);
   map.setView([go.c[0], lng], Math.min(map.getZoom(), go.z));
   try { localStorage.setItem('ww2.view.pacific', go === PAC ? '1' : '0'); } catch (err) {}
  });
  return btn; } });
 new Ctl().addTo(map);
 map.on('moveend', label);
 const css = document.createElement('style');
 css.textContent = '.ww2PacViewBtn{display:block;direction:rtl;background:rgba(251,249,244,.97);border:1px solid #cfc6b8;border-radius:8px;padding:6px 10px;' +
  'font:600 13px system-ui,Heebo,Arial,sans-serif;color:#1f2a37!important;text-decoration:none;box-shadow:0 1px 4px #0002}.ww2PacViewBtn:hover{background:#fff;border-color:#8a7f70}';
 document.head.appendChild(css);
 let saved = '0'; try { saved = localStorage.getItem('ww2.view.pacific') || '0'; } catch (e) {}
 if (saved === '1') setTimeout(() => map.setView(PAC.c, Math.min(map.getZoom(), PAC.z)), 900);
 window.WW2WorldWrap = { get shift() { return SHIFT; }, reanchor: () => reanchor(true) };
 window.WW2PacificView = { setMode: pac => map.setView(pac ? PAC.c : EUR.c, pac ? PAC.z : EUR.z), isPacific: inPac };
})();
