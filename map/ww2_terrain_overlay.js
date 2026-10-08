/* Terrain & landscape for the timeline map (v2, 2026-09-24).
   Base modes swap only the base tiles; "רגיל" keeps the original CARTO base.
   Landscape layers: rivers (always available, on by default), wetlands (GLWD v2), 1940 vegetation (LUH2),
   daily snow (ERA5, lazy-loaded per year), daily weather (ERA5: falling rain, and temperature / snow depth under
   the cursor; lazy-loaded per month) and hill shading.
   One slider sets how much of the occupation colouring shows over the ground. */
(() => {
 'use strict';
 if (!window.L || typeof map === 'undefined') return;

 const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

 // ── the original base layer (found, never recreated) ──
 let carto = null;
 map.eachLayer(l => { if (!carto && l instanceof L.TileLayer && String(l._url || '').includes('cartocdn')) carto = l; });
 // CARTO now stamps "API KEY REQUIRED" over every tile: the plain base comes from Esri's light-grey canvas instead (no key)
 if (carto) {
  try {
   const oldAttr = carto.options.attribution;
   carto.options.maxNativeZoom = 16; carto.options.subdomains = 'abc';
   carto.options.attribution = String(oldAttr || '').replace('CARTO', 'Esri');
   carto.setUrl('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}');
   if (map.attributionControl) { map.attributionControl.removeAttribution(oldAttr); map.attributionControl.addAttribution(carto.options.attribution); }
  } catch (e) {}
 }

 const pane = (name, z, blend, events) => {
  const p = map.getPane(name) || map.createPane(name);
  p.style.zIndex = z; if (!events) p.style.pointerEvents = 'none';
  if (blend) p.style.mixBlendMode = blend;
  return name;
 };
 pane('ww2Base', 150); pane('ww2Veg', 190); pane('ww2Wet', 205); pane('ww2Snow', 405);
 pane('ww2Dem', 215); pane('ww2Relief', 220, 'multiply'); pane('ww2Rivers', 420);

 const common = { pane: 'ww2Base', noWrap: true, maxZoom: 19, crossOrigin: true, keepBuffer: 4 };
 const bases = {
  // OpenTopoMap was slow and often left holes; Esri's terrain base is shaded relief without today's roads and names
  topo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', { ...common, maxNativeZoom: 9,   // no data past 9 ("not available" tiles)
   attribution: 'תבליט: Esri, USGS, NOAA' }),
  real: L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg', { ...common, maxNativeZoom: 15,
   attribution: 'Sentinel-2 cloudless 2020 – s2maps.eu, EOX IT Services (Copernicus Sentinel data)' }),
  photo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { ...common, maxNativeZoom: 18,
   attribution: 'צילום: Esri, Maxar, Earthstar Geographics' })
 };
 const relief = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', {
  pane: 'ww2Relief', noWrap: true, maxZoom: 19, maxNativeZoom: 15, opacity: .55, crossOrigin: true, attribution: 'תבליט: Esri' });

 // ── helpers ──
 const hash = (x, y) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
 const vnoise = (x, y, s) => {
  const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
 };
 const wrap180 = d => ((d + 180) % 360 + 360) % 360 - 180;
 const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
 // per-tile lon/lat lookup at a given resolution
 function tileGeo(coords, size, R) {
  const w = size.x / R, h = size.y / R, z = coords.z - Math.log2(R), ox = coords.x * w, oy = coords.y * h;
  const lon = new Float32Array(w), lat = new Float32Array(h);
  for (let x = 0; x < w; x++) lon[x] = wrap180(map.unproject([ox + x + .5, oy], z).lng);
  for (let y = 0; y < h; y++) lat[y] = map.unproject([ox, oy + y + .5], z).lat;
  return { w, h, z, ox, oy, lon, lat };
 }
 function finish(tile, work, full) {
  const ctx = tile.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(work, 0, 0, full.x, full.y);
 }
 // a raster (PNG) sampled bilinearly in lon/lat
 function loadRaster(url, bbox) {
  return new Promise((ok, bad) => {
   const img = new Image(); img.crossOrigin = 'anonymous';
   img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    ok({ w: img.width, h: img.height, bbox, px: g.getImageData(0, 0, img.width, img.height).data });
   };
   img.onerror = bad; img.src = url;
  });
 }
 function sample(r, lon, lat, ch) {           // bilinear, channel 0..3 → 0..1
  const fx = (lon - r.bbox[0]) / (r.bbox[2] - r.bbox[0]) * r.w - .5, fy = (r.bbox[3] - lat) / (r.bbox[3] - r.bbox[1]) * r.h - .5;
  if (fx < 0 || fy < 0 || fx > r.w - 1 || fy > r.h - 1) return 0;
  const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, x1 = Math.min(x0 + 1, r.w - 1), y1 = Math.min(y0 + 1, r.h - 1);
  const p = (x, y) => r.px[(y * r.w + x) * 4 + ch];
  return ((p(x0, y0) * (1 - tx) + p(x1, y0) * tx) * (1 - ty) + (p(x0, y1) * (1 - tx) + p(x1, y1) * tx) * ty) / 255;
 }

 // ── snow: ERA5 daily, one file per year ──
 const S = window.WW2_SNOW || null;
 const COVER = [0, .4, .8, 1];
 const snowYears = new Map(), snowCache = new Map();
 let snowKey = null, snowGrid = null;
 const yearOf = d => new Date(Date.UTC(1937, 0, 1) + d * 864e5).getUTCFullYear();
 function loadSnowYear(y) {
  if (!S || !S.years || !S.years[y]) return Promise.resolve(null);
  if (!snowYears.has(y)) snowYears.set(y, fetch(`./snow/snow_${y}.json`).then(r => r.ok ? r.json() : null).catch(() => null));
  return snowYears.get(y);
 }
 function decodeSnow(rle) {
  if (snowCache.has(rle)) return snowCache.get(rle);
  const out = new Float32Array(S.nx * S.ny); let k = 0;
  rle.replace(/([a-d])(\d*)/g, (_, c, n) => { const len = n ? +n : 1; out.fill(COVER[c.charCodeAt(0) - 97], k, k + len); k += len; return ''; });
  if (snowCache.size > 12) snowCache.delete(snowCache.keys().next().value);
  snowCache.set(rle, out); return out;
 }
 const SnowLayer = L.GridLayer.extend({
  createTile(coords) {
   const tile = document.createElement('canvas'), full = this.getTileSize();
   tile.width = full.x; tile.height = full.y;
   if (!snowGrid) return tile;
   const R = 2, g = tileGeo(coords, full, R), work = document.createElement('canvas'); work.width = g.w; work.height = g.h;
   const wctx = work.getContext('2d'), img = wctx.createImageData(g.w, g.h), px = img.data, grid = snowGrid;
   const scale = Math.pow(2, g.z), gS = Math.max(.35, 1.2 * 256 / scale); let any = false;
   for (let y = 0; y < g.h; y++) {
    const fy = (S.lat0 - g.lat[y]) / S.step; if (fy < 0 || fy > S.ny - 1) continue;
    const y0 = fy | 0, ty = fy - y0, y1 = Math.min(y0 + 1, S.ny - 1);
    for (let x = 0; x < g.w; x++) {
     const fx = (g.lon[x] - S.lon0) / S.step; if (fx < 0 || fx > S.nx - 1) continue;
     const x0 = fx | 0, tx = fx - x0, x1 = Math.min(x0 + 1, S.nx - 1);
     const c = (grid[y0 * S.nx + x0] * (1 - tx) + grid[y0 * S.nx + x1] * tx) * (1 - ty) + (grid[y1 * S.nx + x0] * (1 - tx) + grid[y1 * S.nx + x1] * tx) * ty;
     if (c <= .05) continue;
     const wx = (g.ox + x) * 256 / scale, wy = (g.oy + y) * 256 / scale;
     const n = vnoise(wx, wy, gS) * .7 + hash(g.ox + x, g.oy + y) * .3;
     // snow only where the ground is actually covered: a crisp snow line, patchy only at the margin
     const a = smooth(.52, .78, c + (n - .5) * .16);
     if (a < .03) continue;
     // clean white; the margin of the cover takes a faint blue-grey so the snow line reads on pale bases
     const edge = 1 - smooth(.45, .75, c), i = (y * g.w + x) * 4;
     px[i] = 250 - edge * 22 + n * 5; px[i + 1] = 252 - edge * 14 + n * 3; px[i + 2] = 255; px[i + 3] = a * (160 + n * 28); any = true;
    }
   }
   if (any) { wctx.putImageData(img, 0, 0); finish(tile, work, full); }
   return tile;
  }
 });
 // snowflake symbol with a white halo
 function flake(ctx, x, y, r, alpha) {
  ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
   ctx.strokeStyle = pass ? `rgba(70,118,166,${alpha})` : `rgba(255,255,255,${alpha * .9})`;
   ctx.lineWidth = pass ? Math.max(1, r / 4.5) : Math.max(1, r / 4.5) + 2.2;
   ctx.beginPath();
   for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
    ctx.moveTo(-ca * r, -sa * r); ctx.lineTo(ca * r, sa * r);
    for (const sgn of [-1, 1]) {                                // small branches at 60 % of each arm
     const bx = sgn * ca * r * .6, by = sgn * sa * r * .6, b = r * .32;
     for (const t of [a + Math.PI / 4, a - Math.PI / 4]) {
      const dir = sgn > 0 ? 1 : -1;
      ctx.moveTo(bx, by); ctx.lineTo(bx + dir * Math.cos(t) * b, by + dir * Math.sin(t) * b);
     }
    }
   }
   ctx.stroke();
  }
  ctx.restore();
 }
 // ❄ symbols where the ground is mostly or fully covered, on a grid anchored to the ground (stable while panning)
 function snowAt(grid, lon, lat) {
  const fy = (S.lat0 - lat) / S.step, fx = (lon - S.lon0) / S.step;
  if (fx < 0 || fy < 0 || fx > S.nx - 1 || fy > S.ny - 1) return 0;
  const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, x1 = Math.min(x0 + 1, S.nx - 1), y1 = Math.min(y0 + 1, S.ny - 1);
  return (grid[y0 * S.nx + x0] * (1 - tx) + grid[y0 * S.nx + x1] * tx) * (1 - ty) + (grid[y1 * S.nx + x0] * (1 - tx) + grid[y1 * S.nx + x1] * tx) * ty;
 }
 function frostSymbols(tile, coords) {
  const grid = snowGrid; if (!grid) return;
  const z = coords.z, n = 1 << z, W = n * 256, D = z <= 4 ? 42 : z <= 6 ? 50 : 60, r = z <= 4 ? 4.6 : z <= 6 ? 5.8 : 7;
  const gx0 = realX(coords, n) * 256, gy0 = coords.y * 256, ctx = tile.getContext('2d');
  for (let j = Math.floor((gy0 - D) / D); j <= Math.ceil((gy0 + 256 + D) / D); j++) {
   for (let i = Math.floor((gx0 - D) / D); i <= Math.ceil((gx0 + 256 + D) / D); i++) {
    const hx = hash(i * 7 + 3, j * 13 + 5), hy = hash(j * 11 + 1, i * 17 + 9);
    const X = (i + .15 + hx * .7) * D, Y = (j + .15 + hy * .7) * D, lx = X - gx0, ly = Y - gy0;
    if (lx < -r - 2 || ly < -r - 2 || lx > 256 + r + 2 || ly > 256 + r + 2) continue;
    const lon = wrap180(X / W * 360 - 180), lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * Y / W))) * 57.29578;
    const c = snowAt(grid, lon, lat);
    if (c < .72 || hash(i + 101, j + 57) > (c >= .95 ? .9 : .55)) continue;
    flake(ctx, lx, ly, r * (.85 + hash(i + 7, j + 3) * .35), c >= .95 ? .9 : .7);
   }
  }
 }
 const snow = new SnowLayer({ pane: 'ww2Snow', noWrap: true, maxZoom: 19, updateWhenZooming: false });
 // the ❄ symbols sit above the territory colours (the white cover itself stays under them, like the ground)
 pane('ww2Frost', 415);
 const Frost = L.GridLayer.extend({ createTile(coords) {
  const t = document.createElement('canvas'); t.width = t.height = 256; if (snowGrid) frostSymbols(t, coords); return t; } });
 const frost = new Frost({ pane: 'ww2Frost', noWrap: true, maxZoom: 19, updateWhenZooming: false });
 // new day → paint the new picture over the old one tile by tile (no blank frame in between)
 function repaintGrid(layer) {
  if (!map.hasLayer(layer)) return;
  for (const k in layer._tiles) {
   const t = layer._tiles[k]; if (!t.el || !t.el.getContext) continue;
   const fresh = layer.createTile(layer._wrapCoords(t.coords)), ctx = t.el.getContext('2d');
   ctx.clearRect(0, 0, t.el.width, t.el.height); ctx.drawImage(fresh, 0, 0);
  }
 }
 const refreshSnow = () => { repaintGrid(snow); repaintGrid(frost); };
 snow.on('add', () => frost.addTo(map)); snow.on('remove', () => map.removeLayer(frost));

 // ── falling snow: animated flakes over the ground where the ERA5 cover grew since the previous day ──
 pane('ww2SnowFall', 425);
 const reduceMotion = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
 const SnowFall = L.Layer.extend({
  onAdd(m) {
   this._c = L.DomUtil.create('canvas', 'leaflet-zoom-hide'); this._c.style.position = 'absolute'; this._c.style.pointerEvents = 'none';
   m.getPane('ww2SnowFall').appendChild(this._c); this._p = []; this._mask = null;
   m.on('moveend zoomend resize viewreset', this._onView, this); m.on('zoomstart', this._clear, this); this._reset(false);
  },
  _onView() { this._reset(false); },
  onRemove(m) { m.off('moveend zoomend resize viewreset', this._onView, this); m.off('zoomstart', this._clear, this); this._stop(); L.DomUtil.remove(this._c); },
  setGrid(g) { this._grid = g; if (this._map) this._reset(true); },
  _clear() { this._stop(); const c = this._c; c.getContext('2d').clearRect(0, 0, c.width, c.height); },
  _reset(keep) {
   const m = this._map, size = m.getSize(), c = this._c, CELL = 22;
   L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
   if (c.width !== size.x || c.height !== size.y) { c.width = size.x; c.height = size.y; }
   const cols = Math.ceil(size.x / CELL), rows = Math.ceil(size.y / CELL), mask = new Uint8Array(cols * rows), act = [];
   if (this._grid) for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const ll = m.containerPointToLatLng([(q + .5) * CELL, (r + .5) * CELL]);
    if (snowAt(this._grid, wrap180(ll.lng), ll.lat) > .18) { mask[r * cols + q] = 1; act.push(r * cols + q); }
   }
   this._mask = { mask, cols, rows, CELL, act };
   const want = Math.min(700, act.length * 2);
   // same view, new day: flakes still over snowfall keep falling; only the rest are replaced
   this._p = keep && act.length ? this._p.filter(p => { const q = Math.floor(p.x / CELL), r = Math.floor(p.y / CELL);
    return q >= 0 && r >= 0 && q < cols && r < rows && mask[r * cols + q]; }).slice(0, want) : [];
   while (act.length && this._p.length < want) this._p.push(this._spawn(true));
   if (act.length && !reduceMotion) this._start(); else this._clear();
   if (this._onCount) this._onCount(act.length);
  },
  _spawn(anywhere) {
   const M = this._mask, cell = M.act[(Math.random() * M.act.length) | 0], q = cell % M.cols, r = (cell / M.cols) | 0;
   return { x: (q + Math.random()) * M.CELL, y: (r + (anywhere ? Math.random() : 0)) * M.CELL, r: 1.2 + Math.random() * 2.1,
    v: .35 + Math.random() * .75, ph: Math.random() * 6.28, life: 0 };
  },
  _start() { if (this._raf) return; let last = performance.now();
   const tick = t => { this._raf = requestAnimationFrame(tick); const dt = Math.min(3, (t - last) / 16.7); last = t; this._frame(dt, t); };
   this._raf = requestAnimationFrame(tick); },
  _stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; },
  _frame(dt, t) {
   const M = this._mask, c = this._c, ctx = c.getContext('2d'); if (!M || !M.act.length) return this._clear();
   ctx.clearRect(0, 0, c.width, c.height);
   for (let i = 0; i < this._p.length; i++) {
    let p = this._p[i];
    p.y += p.v * p.r * .9 * dt; p.x += Math.sin(t / 900 + p.ph) * .35 * dt; p.life += dt;
    const q = Math.floor(p.x / M.CELL), r = Math.floor(p.y / M.CELL);
    if (q < 0 || r < 0 || q >= M.cols || r >= M.rows || !M.mask[r * M.cols + q]) { this._p[i] = this._spawn(false); continue; }
    const a = Math.min(1, p.life / 20) * .95;                       // fade in after spawning
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + .9, 0, 6.2832); ctx.fillStyle = `rgba(60,92,128,${a * .38})`; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
   }
  }
 });
 const snowFall = new SnowFall();

 // ── weather: ERA5 daily mean temperature, precipitation and snow depth, one PNG per month (see tools/build_weather.py) ──
 // R = °C + 60, G = snow depth cm (estimate), B = precipitation mm; rain = precipitation on a day above +0.5 °C
 let WX = null, wxGrid = null, wxDayShown = null;
 const wxMonths = new Map();
 const wxMeta = fetch('./weather/meta.json').then(r => r.ok ? r.json() : null).then(m => (WX = m)).catch(() => null);
 const dateOf = d => new Date(Date.UTC(1937, 0, 1) + d * 864e5);
 function loadWxMonth(ym) {
  if (!wxMonths.has(ym)) {
   wxMonths.set(ym, fetch(`./weather/wx_${ym}.png`).then(r => r.ok ? r.blob() : null)
    .then(b => b && createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
    .then(bmp => {
     if (!bmp) return null;
     const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
     const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
     return ctx.getImageData(0, 0, c.width, c.height).data;
    }).catch(() => null));
   if (wxMonths.size > 4) wxMonths.delete(wxMonths.keys().next().value);
  }
  return wxMonths.get(ym);
 }
 // the day's grid: { px (RGBA bytes of the whole month), off (first byte of the day) }
 async function wxForDay(d) {
  const m = await wxMeta; if (!m || !Number.isFinite(d)) return null;
  const t = dateOf(d), ym = t.getUTCFullYear() + String(t.getUTCMonth() + 1).padStart(2, '0');
  if (!m.months[ym]) return null;
  const px = await loadWxMonth(ym); if (!px) return null;
  return { px, off: (t.getUTCDate() - 1) * m.ny * m.nx * 4, d };
 }
 // bilinear value of one channel (0 R, 1 G, 2 B) at a point; null outside the grid
 function wxAt(g, ch, lon, lat) {
  const fy = (WX.lat0 - lat) / WX.step, fx = (lon - WX.lon0) / WX.step;
  if (!g || fx < -.5 || fy < -.5 || fx > WX.nx - .5 || fy > WX.ny - .5) return null;
  const cx = Math.max(0, Math.min(WX.nx - 1, fx)), cy = Math.max(0, Math.min(WX.ny - 1, fy));
  const x0 = cx | 0, y0 = cy | 0, tx = cx - x0, ty = cy - y0, x1 = Math.min(x0 + 1, WX.nx - 1), y1 = Math.min(y0 + 1, WX.ny - 1);
  const v = (x, y) => g.px[g.off + (y * WX.nx + x) * 4 + ch];
  return (v(x0, y0) * (1 - tx) + v(x1, y0) * tx) * (1 - ty) + (v(x0, y1) * (1 - tx) + v(x1, y1) * tx) * ty;
 }
 const rainLevel = (mm, c) => c <= .5 || mm < 1 ? 0 : mm < 5 ? 1 : mm < 15 ? 2 : 3;
 function wxText(ll) {
  if (!WX || !wxGrid) return '';
  const lon = wrap180(ll.lng), lat = ll.lat, T = wxAt(wxGrid, 0, lon, lat);
  if (T === null) return '';
  const c = T - 60, mm = wxAt(wxGrid, 2, lon, lat), cm = wxAt(wxGrid, 1, lon, lat), parts = [`🌡️ ${Math.round(c)}° (ממוצע יומי)`];
  if (mm >= 1) parts.push(c > .5 ? `🌧️ ${Math.round(mm)} מ״מ גשם` : `🌨️ ${Math.round(mm)} מ״מ משקעים (שלג)`);
  if (cm >= 1) parts.push(`❄️ עומק שלג כ־${cm < 50 ? Math.round(cm) : Math.round(cm / 5) * 5}${cm >= 254 ? '+' : ''} ס״מ (הערכה)`);
  return parts.join(' · ');
 }

 // ── falling rain: animated streaks where that day's precipitation fell as rain, denser where it rained harder ──
 pane('ww2RainFall', 426);
 const RainFall = L.Layer.extend({
  onAdd(m) {
   this._c = L.DomUtil.create('canvas', 'leaflet-zoom-hide'); this._c.style.position = 'absolute'; this._c.style.pointerEvents = 'none';
   m.getPane('ww2RainFall').appendChild(this._c); this._p = []; this._mask = null;
   m.on('moveend zoomend resize viewreset', this._onView, this); m.on('zoomstart', this._clear, this); this._reset();
  },
  _onView() { this._reset(); },
  onRemove(m) { m.off('moveend zoomend resize viewreset', this._onView, this); m.off('zoomstart', this._clear, this); this._stop(); L.DomUtil.remove(this._c); },
  setGrid(g) { this._grid = g; if (this._map) this._reset(); },
  _clear() { this._stop(); const c = this._c; c.getContext('2d').clearRect(0, 0, c.width, c.height); },
  _reset() {
   const m = this._map, size = m.getSize(), c = this._c, CELL = 22;
   L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
   if (c.width !== size.x || c.height !== size.y) { c.width = size.x; c.height = size.y; }
   const cols = Math.ceil(size.x / CELL), rows = Math.ceil(size.y / CELL), mask = new Uint8Array(cols * rows), act = [];
   let wet = 0;
   if (this._grid && WX) for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const ll = m.containerPointToLatLng([(q + .5) * CELL, (r + .5) * CELL]), lon = wrap180(ll.lng);
    const T = wxAt(this._grid, 0, lon, ll.lat); if (T === null) continue;
    const lv = rainLevel(wxAt(this._grid, 2, lon, ll.lat), T - 60);
    if (lv) { mask[r * cols + q] = lv; wet++; for (let k = 0; k < lv * lv; k++) act.push(r * cols + q); }   // heavier rain → more drops
   }
   this._mask = { mask, cols, rows, CELL, act };
   const want = Math.min(650, Math.round(act.length * .55));
   this._p = [];
   while (act.length && this._p.length < want) this._p.push(this._spawn(true));
   if (act.length && !reduceMotion) this._start(); else this._clear();
   if (this._onCount) this._onCount(wet);
  },
  _spawn(anywhere) {
   const M = this._mask, cell = M.act[(Math.random() * M.act.length) | 0], q = cell % M.cols, r = (cell / M.cols) | 0, lv = M.mask[cell];
   return { x: (q + Math.random()) * M.CELL, y: (r + (anywhere ? Math.random() : Math.random() * .4)) * M.CELL,
    len: 6 + lv * 2.5 + Math.random() * 5, v: 5 + lv + Math.random() * 3, life: 0, max: 5 + Math.random() * 6, lv };
  },
  _start() { if (this._raf) return; let last = performance.now();
   const tick = t => { this._raf = requestAnimationFrame(tick); const dt = Math.min(3, (t - last) / 16.7); last = t; this._frame(dt); };
   this._raf = requestAnimationFrame(tick); },
  _stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; },
  _frame(dt) {
   const M = this._mask, c = this._c, ctx = c.getContext('2d'); if (!M || !M.act.length) return this._clear();
   ctx.clearRect(0, 0, c.width, c.height); ctx.lineCap = 'round';
   const SLANT = .22;                                                // a little wind: streaks lean to the left as they fall
   for (const pass of [0, 1]) {                                      // light casing first, then the blue streaks
    ctx.beginPath();
    ctx.strokeStyle = pass ? 'rgba(38,84,150,.42)' : 'rgba(255,255,255,.3)'; ctx.lineWidth = pass ? 1 : 2.2;
    for (let i = 0; i < this._p.length; i++) {
     const p = this._p[i];
     if (!pass) {
      p.y += p.v * dt; p.x -= p.v * SLANT * dt; p.life += dt;
      const q = Math.floor(p.x / M.CELL), r = Math.floor(p.y / M.CELL);
      if (p.life > p.max || q < 0 || r < 0 || q >= M.cols || r >= M.rows || !M.mask[r * M.cols + q]) { this._p[i] = this._spawn(false); continue; }
     }
     ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len * SLANT, p.y - p.len);
    }
    ctx.stroke();
   }
  }
 });
 const rainFall = new RainFall();

 // ── wetlands (GLWD v2 share per 1/30°) — drawn with a marsh symbol, like on a paper map ──
 let wet = null;
 const marsh = (() => {
  const c = document.createElement('canvas'); c.width = 18; c.height = 12; const g = c.getContext('2d');
  g.fillStyle = 'rgba(96,150,138,.28)'; g.fillRect(0, 0, 18, 12);
  g.strokeStyle = 'rgba(44,96,120,.85)'; g.lineWidth = 1; g.lineCap = 'round';
  const tuft = (x, y) => { g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.moveTo(x, y); g.lineTo(x, y - 3);
   g.moveTo(x, y); g.lineTo(x - 2, y - 2.5); g.moveTo(x, y); g.lineTo(x + 2, y - 2.5); g.stroke(); };
  tuft(4.5, 5); tuft(13.5, 11);
  g.beginPath(); g.moveTo(9, 7.5); g.lineTo(16, 7.5); g.moveTo(1, 1.5); g.lineTo(6, 1.5); g.stroke();
  return c;
 })();
 const WetLayer = L.GridLayer.extend({
  createTile(coords) {
   const tile = document.createElement('canvas'), full = this.getTileSize();
   tile.width = full.x; tile.height = full.y;
   if (!wet) return tile;
   const b = wet.bbox, g = tileGeo(coords, full, 1);
   if (g.lon[g.w - 1] < b[0] || g.lon[0] > b[2] || g.lat[0] < b[1] || g.lat[g.h - 1] > b[3]) return tile;
   const mask = document.createElement('canvas'); mask.width = g.w; mask.height = g.h;
   const mctx = mask.getContext('2d'), img = mctx.createImageData(g.w, g.h), px = img.data; let any = false;
   for (let y = 0; y < g.h; y += 2) for (let x = 0; x < g.w; x += 2) {
    const s = sample(wet, g.lon[x], g.lat[y], 0);
    const a = smooth(.3, .6, s + (hash(g.ox + x, g.oy + y) - .5) * .1);
    if (a < .05) continue;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const i = ((y + dy) * g.w + x + dx) * 4; px[i + 3] = a * 255; }
    any = true;
   }
   if (!any) return tile;
   mctx.putImageData(img, 0, 0);
   const ctx = tile.getContext('2d'), pat = ctx.createPattern(marsh, 'repeat');
   pat.setTransform(new DOMMatrix().translate(-(g.ox % 18), -(g.oy % 12)));
   ctx.fillStyle = pat; ctx.fillRect(0, 0, full.x, full.y);
   ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0);
   return tile;
  }
 });
 const wetlands = new WetLayer({ pane: 'ww2Wet', noWrap: true, maxZoom: 19, minZoom: 3 });

 // ── vegetation 1940 (LUH2): forest drawn as a canopy texture, farmland as a light field tint ──
 let veg = null;
 const VegLayer = L.GridLayer.extend({
  createTile(coords) {
   const tile = document.createElement('canvas'), full = this.getTileSize();
   tile.width = full.x; tile.height = full.y;
   if (!veg) return tile;
   const R = 2, g = tileGeo(coords, full, R), work = document.createElement('canvas'); work.width = g.w; work.height = g.h;
   const wctx = work.getContext('2d'), img = wctx.createImageData(g.w, g.h), px = img.data; let any = false;
   const scale = Math.pow(2, g.z), cS = Math.max(.25, 1.5 * 256 / scale);
   for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const lo = g.lon[x], la = g.lat[y];
    const f = sample(veg, lo, la, 0), a = sample(veg, lo, la, 2);
    if (f < .08 && a < .15) continue;
    const wx = (g.ox + x) * 256 / scale, wy = (g.oy + y) * 256 / scale;
    const canopy = vnoise(wx, wy, cS) * .6 + hash(g.ox + x, g.oy + y) * .4, i = (y * g.w + x) * 4;
    const fa = smooth(.35, .85, f + (canopy - .5) * .3);
    if (fa > .05) {                                  // tree canopy: dark greens with light gaps
     const l = canopy;
     px[i] = 34 + l * 30; px[i + 1] = 72 + l * 40; px[i + 2] = 30 + l * 18; px[i + 3] = fa * 105; any = true;
    } else if (a > .15) {                            // cultivated land: straw / young-crop tint
     const s = vnoise(wx * 1.7, wy * .6, cS * 1.4);
     px[i] = 196 + s * 20; px[i + 1] = 178 + s * 22; px[i + 2] = 110 + s * 10; px[i + 3] = smooth(.15, .7, a) * 70; any = true;
    }
   }
   if (any) { wctx.putImageData(img, 0, 0); finish(tile, work, full); }
   return tile;
  }
 });
 const vegetation = new VegLayer({ pane: 'ww2Veg', noWrap: true, maxZoom: 19, updateWhenZooming: false });

 // ── elevation: contours with heights, slope hachures and a height tint (AWS Terrain Tiles, Terrarium) ──
 // Each map tile is drawn from the real elevation tile under it: tint by height, contour lines (every 5th one
 // thicker and labelled), and short strokes pointing downhill whose density and darkness grow with the slope.
 const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', DEM_MAX = 14;
 const demCache = new Map();                                  // 'z/x/y' → Promise<Float32Array|null>
 function demTile(z, x, y) {
  const k = z + '/' + x + '/' + y;
  if (demCache.has(k)) { const v = demCache.get(k); demCache.delete(k); demCache.set(k, v); return v; }
  const p = new Promise(ok => {
   let tries = 0;
   const img = new Image(); img.crossOrigin = 'anonymous';
   img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, 256, 256).data, e = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) e[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
    ok(e);
   };
   img.onerror = () => { if (++tries < 3) setTimeout(() => { img.src = DEM_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y) + '?r=' + tries; }, 400 * tries); else ok(null); };
   img.src = DEM_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  });
  demCache.set(k, p);
  if (demCache.size > 400) demCache.delete(demCache.keys().next().value);
  return p;
 }
 // real (unshifted) tile column under a map tile — the map projection may be recentred for endless scrolling
 const realX = (coords, n) => {
  const lng = wrap180(map.unproject([(coords.x + .5) * 256, (coords.y + .5) * 256], coords.z).lng);
  return ((Math.floor((lng + 180) / 360 * n) % n) + n) % n;
 };
 const TINT = [[0, 150, 190, 120, 0], [150, 170, 200, 125, .16], [400, 214, 210, 150, .24], [800, 222, 190, 130, .30],
  [1500, 196, 150, 100, .36], [2500, 165, 125, 95, .40], [3500, 190, 180, 175, .42], [5000, 250, 250, 250, .50]];
 function tint(h) {
  if (h <= 0) return null;
  let i = 1; while (i < TINT.length - 1 && h > TINT[i][0]) i++;
  const a = TINT[i - 1], b = TINT[i], t = Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0])));
  return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, a[4] + (b[4] - a[4]) * t];
 }
 const contourStep = z => z <= 5 ? 500 : z <= 8 ? 200 : z <= 10 ? 100 : z <= 12 ? 50 : z <= 13 ? 20 : 10;
 const DemLayer = L.GridLayer.extend({
  createTile(coords, done) {
   const tile = document.createElement('canvas'); tile.width = tile.height = 256;
   const n = 1 << coords.z, x = realX(coords, n);
   demTile(coords.z, x, coords.y).then(e => {
    if (e) try { drawDem(tile, e, coords.z, coords.y); } catch (err) {}
    done(null, tile);
   });
   return tile;
  }
 });
 function drawDem(tile, e, z, ty) {
  const ctx = tile.getContext('2d'), N = 256, at = (x, y) => e[(y < 0 ? 0 : y > 255 ? 255 : y) * N + (x < 0 ? 0 : x > 255 ? 255 : x)];
  // metres per pixel on each row (Web Mercator)
  const mpp = new Float32Array(N), n = 1 << z;
  for (let y = 0; y < N; y++) {
   const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty * N + y + .5) / (n * N))));
   mpp[y] = 40075016.686 * Math.cos(lat) / (n * N);
  }
  // 1) tint
  const img = ctx.createImageData(N, N), px = img.data;
  for (let i = 0; i < 65536; i++) {
   const c = tint(e[i]); if (!c) continue;
   px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = c[3] * 255;
  }
  ctx.putImageData(img, 0, 0);
  // 2) hachures: strokes pointing downhill; steeper → longer, thicker, darker
  const S = 6, T0 = 7, T1 = 38;                                   // gentle below T0°, full strength at T1°
  ctx.lineCap = 'round';
  for (let gy = S / 2; gy < N; gy += S) for (let gx = S / 2; gx < N; gx += S) {
   const jx = gx + (hash(gx + ty * 997, gy) - .5) * S * .6, jy = gy + (hash(gy, gx + ty * 991) - .5) * S * .6;
   const x = jx | 0, y = jy | 0, h = at(x, y); if (h <= 1) continue;
   const dx = (at(x + 1, y) - at(x - 1, y)) / (2 * mpp[y]), dy = (at(x, y + 1) - at(x, y - 1)) / (2 * mpp[y]);
   const g = Math.hypot(dx, dy), deg = Math.atan(g) * 57.2958; if (deg < T0 * .6) continue;
   // slopes read at map scale: a pixel spans hundreds of metres when zoomed out, so the same terrain looks gentler
   const k = Math.min(1, Math.max(0, (deg - T0 * .6) / (T1 - T0 * .6))), kk = Math.pow(k, 1.6);
   if (hash(x * 3 + 1, y * 7 + ty) > .35 + .65 * k) continue;         // gentle slopes: sparse strokes
   const len = S * (.4 + .55 * k), ux = -dx / g, uy = -dy / g;
   const zk = z >= 11 ? .75 : 1;
   ctx.strokeStyle = `rgba(78,54,32,${((.10 + .62 * kk) * zk).toFixed(3)})`; ctx.lineWidth = (.45 + 1.05 * kk) * zk;
   ctx.beginPath(); ctx.moveTo(jx - ux * len * .2, jy - uy * len * .2); ctx.lineTo(jx + ux * len * .8, jy + uy * len * .8); ctx.stroke();
  }
  // 3) contours (marching squares); every 5th level thicker with its height written on it
  const step = contourStep(z), labels = new Map();
  const segs = { minor: [], index: [] };
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
   const a = e[y * N + x], b = e[y * N + x + 1], c = e[(y + 1) * N + x + 1], d = e[(y + 1) * N + x];
   const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d); if (hi <= 0) continue;
   for (let lv = Math.ceil(Math.max(lo, 1) / step) * step; lv <= hi; lv += step) {
    const pts = [];
    const edge = (v0, v1, x0, y0, x1, y1) => { if ((v0 < lv) !== (v1 < lv)) { const t = (lv - v0) / (v1 - v0); pts.push(x0 + (x1 - x0) * t + .5, y0 + (y1 - y0) * t + .5); } };
    edge(a, b, x, y, x + 1, y); edge(b, c, x + 1, y, x + 1, y + 1); edge(d, c, x, y + 1, x + 1, y + 1); edge(a, d, x, y, x, y + 1);
    if (pts.length < 4) continue;
    const idx = lv % (step * 5) === 0, list = idx ? segs.index : segs.minor;
    list.push(pts[0], pts[1], pts[2], pts[3]); if (pts.length === 8) list.push(pts[4], pts[5], pts[6], pts[7]);
    if (idx && x > 20 && x < 236 && y > 12 && y < 244) { const l = labels.get(lv); if (!l || Math.abs(x - 128) + Math.abs(y - 128) < l.d) labels.set(lv, { x: (pts[0] + pts[2]) / 2, y: (pts[1] + pts[3]) / 2, a: Math.atan2(pts[3] - pts[1], pts[2] - pts[0]), d: Math.abs(x - 128) + Math.abs(y - 128) }); }
   }
  }
  const stroke = (list, w, col) => { if (!list.length) return; ctx.beginPath(); for (let i = 0; i < list.length; i += 4) { ctx.moveTo(list[i], list[i + 1]); ctx.lineTo(list[i + 2], list[i + 3]); } ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
  stroke(segs.minor, .6, 'rgba(140,92,48,.42)');
  stroke(segs.index, 1.25, 'rgba(112,70,34,.75)');
  ctx.font = '600 10px system-ui,Arial,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const placed = [];
  for (const [lv, l] of [...labels].sort((p, q) => p[1].d - q[1].d)) {
   if (placed.length >= 2 || placed.some(q => Math.hypot(q.x - l.x, q.y - l.y) < 70)) continue;
   placed.push(l);
   let a = l.a; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
   ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(a);
   ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,252,244,.92)'; ctx.strokeText(String(lv), 0, 0);
   ctx.fillStyle = '#6b3f17'; ctx.fillText(String(lv), 0, 0); ctx.restore();
  }
 }
 const dem = new DemLayer({ pane: 'ww2Dem', noWrap: true, minZoom: 3, maxZoom: 19, maxNativeZoom: DEM_MAX, updateWhenZooming: false, keepBuffer: 3 });
 // height and slope under the cursor
 const DemInfo = L.Control.extend({ options: { position: 'topright' }, onAdd() {
  const d = L.DomUtil.create('div', 'ww2DemInfo leaflet-control'); d.style.display = 'none'; return d; } });
 const demInfo = new DemInfo(); demInfo.addTo(map);
 let demHover = 0;
 const hover = { wx: '', dem: '' };
 function showHover() {
  const box = demInfo.getContainer(), lines = [hover.wx, hover.dem].filter(Boolean);
  box.replaceChildren(...lines.map(t => { const d = document.createElement('div'); d.textContent = t; return d; }));
  box.style.display = lines.length ? '' : 'none';
 }
 function probe(ll) {
  hover.wx = state.wx ? wxText(ll) : '';
  if (!map.hasLayer(dem)) { hover.dem = ''; return showHover(); }
  showHover();
  const t = ++demHover, z = Math.min(DEM_MAX, Math.max(3, Math.round(map.getZoom()))), n = 1 << z;
  const lng = wrap180(ll.lng), lat = Math.max(-85, Math.min(85, ll.lat));
  const fx = (lng + 180) / 360 * n * 256, fy = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * n * 256;
  const tx = Math.floor(fx / 256), tyy = Math.floor(fy / 256), px = Math.floor(fx) - tx * 256, py = Math.floor(fy) - tyy * 256;
  demTile(z, ((tx % n) + n) % n, tyy).then(e => {
   if (t !== demHover || !e) return;
   const at = (x, y) => e[Math.min(255, Math.max(0, y)) * 256 + Math.min(255, Math.max(0, x))];
   const h = at(px, py), m = 40075016.686 * Math.cos(lat * Math.PI / 180) / (n * 256);
   const g = Math.hypot((at(px + 1, py) - at(px - 1, py)) / (2 * m), (at(px, py + 1) - at(px, py - 1)) / (2 * m));
   hover.dem = h <= 0 ? '🌊 ים' : `⛰️ גובה ${Math.round(h).toLocaleString('he-IL')} מ׳ · שיפוע ${Math.round(Math.atan(g) * 57.2958)}°`;
   showHover();
  });
 }
 // a phone has no cursor: a tap on the map (not on a marker) shows the same readout for a few seconds
 const touchOnly = (() => { try { return matchMedia('(hover: none)').matches; } catch (e) { return false; } })();
 let probeHide = 0;
 if (touchOnly) map.on('click', ev => {
  probe(ev.latlng); clearTimeout(probeHide);
  probeHide = setTimeout(() => { hover.wx = hover.dem = ''; demHover++; showHover(); }, 7000);
 });
 else map.on('mousemove', ev => probe(ev.latlng));
 map.on('mouseout', () => { if (!touchOnly) demInfo.getContainer().style.display = 'none'; });

 // ── rivers (Natural Earth 10m) — strong blue with a light casing, Hebrew names on the big ones ──
 const riverRenderer = L.canvas({ pane: 'ww2Rivers', padding: .3 });
 const rivers = L.layerGroup(); let riverData = null; const riverLabels = L.layerGroup();
 function riverWidth(rank, z) {
  const base = rank <= 2 ? 3.4 : rank <= 4 ? 2.6 : rank <= 6 ? 1.8 : 1.2;
  return base * (z <= 3 ? .55 : z <= 4 ? .75 : z <= 6 ? 1 : 1.35);
 }
 // redrawn only when the zoom changes or the view leaves the (padded) area already drawn — clearing and
 // re-adding every river on each pan made them blink
 let riverDrawn = null;
 function drawRivers(force) {
  if (!riverData) return;
  const z = map.getZoom(), view = map.getBounds();
  if (!force && riverDrawn && riverDrawn.z === z && riverDrawn.b.contains(view)) return;
  rivers.clearLayers(); riverLabels.clearLayers();
  const maxRank = z <= 3 ? 3 : z <= 4 ? 5 : z <= 5 ? 7 : z <= 6 ? 8 : 12;
  const b = view.pad(.6), best = new Map(); riverDrawn = { z, b };
  for (const [rank, he, en, pts] of riverData) {
   if (rank > maxRank) continue;
   let inside = false; for (let k = 0; k < pts.length; k += 4) if (b.contains([pts[k][1], pts[k][0]])) { inside = true; break; }
   if (!inside) continue;
   const ll = pts.map(p => [p[1], p[0]]), w = riverWidth(rank, z);
   L.polyline(ll, { renderer: riverRenderer, color: '#f4f8fb', weight: w + 2.2, opacity: .85, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(rivers);
   L.polyline(ll, { renderer: riverRenderer, color: '#1f6fc9', weight: w, opacity: .95, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(rivers);
   const name = he || en;
   if (name && rank <= (z <= 4 ? 2 : z <= 5 ? 4 : z <= 6 ? 6 : 9) && (!best.has(name) || best.get(name).pts.length < pts.length)) best.set(name, { pts, rank });
  }
  for (const [name, r] of best) {
   const m = r.pts[Math.floor(r.pts.length / 2)];
   L.tooltip({ permanent: true, direction: 'center', className: 'ww2RiverLabel', interactive: false })
    .setLatLng([m[1], m[0]]).setContent(name).addTo(riverLabels);
  }
 }
 map.on('zoomend moveend', () => { if (state.rivers) drawRivers(); });

 // ── state & UI ──
 const modes = [['normal', 'רגיל'], ['topo', 'טופוגרפי'], ['real', 'לוויין'], ['photo', 'צילום אוויר']];
 const state = {
  mode: store.get('ww2.terrain.mode', 'topo'),     // default view: topographic relief with live snow cover
  relief: store.get('ww2.terrain.relief', '1') === '1',
  rivers: store.get('ww2.terrain.rivers', '1') === '1',
  wet: null, veg: null, snow: null, dem: null, wx: null, occ: null
 };
 const optDefault = (k, m) => ({ wet: m !== 'normal', veg: m !== 'normal' && m !== 'photo', snow: m !== 'normal', dem: m === 'topo', wx: true }[k]);
 for (const k of ['wet', 'veg', 'snow', 'dem', 'wx']) { const v = store.get('ww2.terrain.' + k, null); state[k] = v === null ? optDefault(k, state.mode) : v === '1'; }
 { const v = store.get('ww2.terrain.occ.' + (state.mode === 'normal' ? 'n' : 't'), null); state.occ = v === null ? (state.mode === 'normal' ? 100 : 80) : +v; }

 const css = document.createElement('style');
 css.textContent =
  '.ww2Terrain{direction:rtl;background:rgba(251,249,244,.97);border:1px solid #cfc6b8;border-radius:8px;' +
  'box-shadow:0 1px 5px rgba(0,0,0,.18);font:12px/1.45 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#2d2a27}' +
  '.ww2Terrain>button.tgl{display:block;border:0;background:transparent;padding:6px 10px;cursor:pointer;font:inherit;font-weight:600;color:inherit}' +
  '.ww2Terrain .body{display:none;padding:2px 10px 9px;width:224px}.ww2Terrain.open .body{display:block}' +
  '.ww2Terrain .seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:2px 0 7px}' +
  '.ww2Terrain .seg button{font:inherit;padding:5px 4px;border:1px solid #cfc6b8;border-radius:6px;background:#fff;cursor:pointer;color:inherit}' +
  '.ww2Terrain .seg button.on{background:#2f4f3a;border-color:#2f4f3a;color:#fff}' +
  '.ww2Terrain label{display:block;margin:3px 0;cursor:pointer}' +
  '.ww2Terrain .mix{margin:8px 0 2px;padding-top:7px;border-top:1px solid #e3dccf}' +
  '.ww2Terrain .mix .ends{display:flex;justify-content:space-between;font-size:10.5px;color:#6c6561}' +
  '.ww2Terrain .mix input{width:100%;margin:2px 0 0}' +
  '.ww2Terrain .note{color:#6c6561;font-size:10.5px;margin-top:6px}' +
  '.ww2Terrain .snowInfo{color:#3f5566;font-size:11px;margin-top:2px}' +
  '.leaflet-tooltip.ww2RiverLabel{background:transparent;border:0;box-shadow:none;padding:0;color:#15528f;' +
  'font:italic 600 11px system-ui,Arial,sans-serif;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff}' +
  '.leaflet-tooltip.ww2RiverLabel:before{display:none}' +
  '.ww2DemInfo{direction:rtl;background:rgba(251,249,244,.95);border:1px solid #cfc6b8;border-radius:6px;padding:3px 8px;' +
  'font:600 12px system-ui,Arial,sans-serif;color:#3b2a1a;box-shadow:0 1px 3px #0002;pointer-events:none;clear:both;margin-top:52px!important}';
 document.head.appendChild(css);

 const Ctl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd() {
   const el = L.DomUtil.create('div', 'ww2Terrain leaflet-control');
   el.id = 'terrainPanel';
   el.innerHTML =
    '<button type="button" class="tgl" aria-expanded="false" title="רקע טופוגרפי, נוף ושלג">🏔️ רקע</button>' +
    '<div class="body" role="group" aria-label="סוג רקע">' +
    '<div class="seg">' + modes.map(([k, t]) => '<button type="button" data-mode="' + k + '">' + t + '</button>').join('') + '</div>' +
    '<label><input type="checkbox" data-opt="rivers"> 〰️ נהרות</label>' +
    '<label><input type="checkbox" data-opt="wet"> 🌾 ביצות ואדמות כבול</label>' +
    '<label><input type="checkbox" data-opt="veg"> 🌲 יערות ושדות (1940)</label>' +
    '<label><input type="checkbox" data-opt="dem"> 📐 גבהים, קווי גובה ותלילות</label>' +
    '<label><input type="checkbox" data-opt="relief"> ⛰️ הצללת תבליט</label>' +
    '<label><input type="checkbox" data-opt="snow"> ❄️ שלג ביום המוצג (ושלג יורד)</label>' +
    '<div class="snowInfo" aria-live="polite"></div>' +
    '<label><input type="checkbox" data-opt="wx"> 🌦️ מזג אוויר: גשם יורד, וטמפרטורה ועומק שלג בנקודה (מעבר עכבר או הקשה)</label>' +
    '<div class="snowInfo wxInfo" aria-live="polite"></div>' +
    '<div class="mix"><div class="ends"><span>צבעי כיבוש</span><span>רקע נקי</span></div>' +
    '<input type="range" min="0" max="100" step="5" data-opt="occ" aria-label="כמה מצבעי הכיבוש מוצגים מעל הרקע"></div>' +
    '<div class="note"></div></div>';
   L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el);
   const tgl = el.querySelector('.tgl');
   tgl.onclick = () => { const o = el.classList.toggle('open'); tgl.setAttribute('aria-expanded', String(o)); };
   el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
   el.querySelectorAll('input[type=checkbox][data-opt]').forEach(c => c.onchange = () => {
    state[c.dataset.opt] = c.checked; store.set('ww2.terrain.' + c.dataset.opt, c.checked ? '1' : '0'); apply(); });
   el.querySelector('[data-opt="occ"]').oninput = e => {
    state.occ = +e.target.value; store.set('ww2.terrain.occ.' + (state.mode === 'normal' ? 'n' : 't'), String(state.occ)); applyOcc(); };
   return el;
  }
 });
 const ctl = new Ctl(); ctl.addTo(map);
 const el = ctl.getContainer();
 const notes = {
  normal: 'הרקע המקורי של המפה.',
  topo: 'תבליט, גוון לפי גובה, קווי גובה עם מספרים וקווקווי תלילות: ככל שהקווקווים צפופים וכהים יותר, המדרון תלול יותר. העבר את העכבר (או הקש בטלפון) כדי לראות גובה ושיפוע.',
  real: 'צבעי קרקע אמיתיים מלוויין Sentinel-2. זה צילום של היום — ערים, מאגרים ויערות חדשים לא היו ב־1940; שכבת "יערות ושדות (1940)" מראה את כיסוי הקרקע של אז.',
  photo: 'צילום אוויר מפורט (Esri) לזום קרוב. צילום עכשווי, לא מ־1940.'
 };

 // ── occupation strength: territory fills, the daily front grid and the estimated perimeters ──
 function scalePaths(group, k) {
  if (!group) return;
  group.eachLayer(l => {
   const set = p => { if (!p.setStyle || !p.options) return; if (p.options._ww2Fill == null) p.options._ww2Fill = p.options.fillOpacity ?? .2;
    p.setStyle({ fillOpacity: Math.min(.8, p.options._ww2Fill * k) }); };
   if (l.eachLayer) l.eachLayer(set); else set(l);
  });
 }
 function applyOcc() {
  // over imagery/topography the pale occupation fills vanish, so terrain modes get a gain:
  // e = slider × gain; above 1 the front grid is over-painted (see boostFront) instead of just made opaque
  const k = state.occ / 100, gain = state.mode === 'normal' ? 1 : OCC_GAIN, e = k * gain;
  try { if (typeof terrLayer !== 'undefined') scalePaths(terrLayer, e); } catch (err) {}
  try { if (typeof dctlLayer !== 'undefined') for (const g of Object.values(dctlLayer)) scalePaths(g, e); } catch (err) {}
  const changed = !window.WW2Occ || window.WW2Occ.e !== e;
  // on imagery/topography a translucent rust over green reads as brown and the pale "occupied" tone
  // disappears: terrain modes paint the Axis grid in crimson (core) and vivid orange (occupied) instead
  const colors = state.mode === 'normal' ? null : OCC_TERRAIN;
  const modeChanged = !window.WW2Occ || !!window.WW2Occ.colors !== !!colors;
  window.WW2Occ = { k, gain, e, colors };
  try { if (typeof frontLayer !== 'undefined' && frontLayer._c) { frontLayer._c.style.opacity = String(Math.min(1, e)); if ((changed || modeChanged) && frontLayer._map) frontLayer.draw(); } } catch (err) {}
  if (changed) document.dispatchEvent(new CustomEvent('ww2:occstrength', { detail: { k, e } }));
  const r = el.querySelector('[data-opt="occ"]'); if (r) r.value = state.occ;
 }
 // the front grid canvas: after each redraw, paint it over itself (e−1) more times in terrain modes
 const OCC_GAIN = 2.6, OCC_TERRAIN = { core: [350, 78, 46], occ: [24, 95, 55] };
 // cellColor (page, global) picks the grid colour per owner; in terrain modes swap the two Axis families only
 try {
  const origCell = window.cellColor;
  if (typeof origCell === 'function' && !origCell._ww2) {
   const cache = {};
   const cc = function (own, isAxis, fresh) {
    const o = window.WW2Occ && window.WW2Occ.colors;
    if (!o) return origCell(own, isAxis, fresh);
    let fam = isAxis ? 'axis' : 'allies';
    try { if (own >= 0 && FG.cls && FG.cls[own]) fam = FG.cls[own]; } catch (err) {}
    if (fam !== 'axis' && fam !== 'occ') return origCell(own, isAxis, fresh);
    const key = fam + (fresh ? 1 : 0);
    if (cache[key]) return cache[key];
    const [h, sat, l] = fam === 'axis' ? o.core : o.occ;
    return (cache[key] = `hsla(${h},${sat}%,${fresh ? l + 8 : l}%,${fresh ? .46 : .30})`);
   };
   cc._ww2 = true; window.cellColor = cc;
  }
 } catch (err) {}
 let boostTmp = null;
 function boostFront(c) {
  const e = (window.WW2Occ && window.WW2Occ.e) || 1; let extra = Math.min(2, e - 1);
  if (!c || extra <= .02 || !c.width) return;
  boostTmp = boostTmp || document.createElement('canvas');
  if (boostTmp.width !== c.width || boostTmp.height !== c.height) { boostTmp.width = c.width; boostTmp.height = c.height; }
  const t = boostTmp.getContext('2d'); t.clearRect(0, 0, c.width, c.height); t.drawImage(c, 0, 0);
  const ctx = c.getContext('2d'); ctx.save(); ctx.globalCompositeOperation = 'source-over';
  while (extra > .02) { ctx.globalAlpha = Math.min(1, extra); ctx.drawImage(boostTmp, 0, 0); extra -= 1; }
  ctx.restore();
 }
 try {
  if (typeof frontLayer !== 'undefined' && typeof frontLayer.draw === 'function' && !frontLayer._ww2Boost) {
   const od = frontLayer.draw; frontLayer._ww2Boost = true;
   frontLayer.draw = function (...a) { const r = od.apply(this, a); try { boostFront(this._c); } catch (err) {} return r; };
  }
 } catch (err) {}
 // keep the strength when the page redraws territories for a new period
 for (const fn of ['updateTerritories', 'updateDerived']) {
  try {
   const orig = window[fn];
   if (typeof orig === 'function') window[fn] = function (...a) { const r = orig.apply(this, a); applyOcc(); return r; };
  } catch (e) {}
 }

 const fmt = d => { const t = new Date(Date.UTC(1937, 0, 1) + d * 864e5); return t.getUTCDate() + '.' + (t.getUTCMonth() + 1) + '.' + t.getUTCFullYear(); };
 const currentDay = () => { const s = document.querySelector('#slider'); return s ? +s.value : NaN; };
 let fallDay = null;
 async function updateSnow(force) {
  const info = el.querySelector('.snowInfo'), d = currentDay();
  if (!state.snow || !S) { info.textContent = state.snow && !S ? 'נתוני השלג לא נטענו.' : ''; toggle(snowFall, false); if (snowGrid) { snowGrid = null; snowKey = null; refreshSnow(); } return; }
  const y = yearOf(d), frames = await loadSnowYear(y);
  const f = frames && frames.find(fr => fr[0] === d);
  if (!f) { info.textContent = 'אין נתוני שלג לתאריך הזה (הנתונים מכסים 1940–1945).'; toggle(snowFall, false); if (snowGrid) { snowGrid = null; snowKey = null; refreshSnow(); } return; }
  const base = 'שלג ב־' + fmt(d) + ' לפי ERA5 (עומק שלג יומי)';
  info.textContent = base;
  if (f[1] !== snowKey || force) { snowKey = f[1]; snowGrid = decodeSnow(f[1]); refreshSnow(); }
  // snowfall = cover that grew since yesterday (one level or more)
  const pf = (d - 1 >= (S.years[y] || [0])[0] ? frames : await loadSnowYear(yearOf(d - 1)) || []).find(fr => fr[0] === d - 1);
  if (currentDay() !== d) return;                                   // the timeline moved on while loading
  if (d === fallDay && !force) return;
  fallDay = d;
  let fall = null;
  if (pf) {
   const prev = decodeSnow(pf[1]), cur = snowGrid; fall = new Float32Array(cur.length); let any = false;
   for (let i = 0; i < cur.length; i++) if (cur[i] - prev[i] > .3) { fall[i] = 1; any = true; }
   if (!any) fall = null;
  }
  toggle(snowFall, !!fall && map.hasLayer(snow));
  snowFall._onCount = n => { info.textContent = n ? base + ' · ❄ שלג יורד באזורים המונפשים' : base; };
  snowFall.setGrid(fall);
 }
 async function updateWeather(force) {
  const info = el.querySelector('.wxInfo'), d = currentDay();
  if (!state.wx) { info.textContent = ''; wxGrid = null; wxDayShown = null; toggle(rainFall, false); return; }
  if (d === wxDayShown && !force) return;
  const g = await wxForDay(d);
  if (currentDay() !== d || !state.wx) return;                      // the timeline moved on while loading
  wxDayShown = d; wxGrid = g;
  if (!g) { info.textContent = WX ? 'אין נתוני מזג אוויר לתאריך הזה (הנתונים מכסים 1940–1945).' : 'נתוני מזג האוויר לא נטענו.'; toggle(rainFall, false); return; }
  const base = 'מזג אוויר ב־' + fmt(d) + ' לפי ERA5 · אין נתוני עננות';
  info.textContent = base;
  rainFall._onCount = n => { info.textContent = n ? base + ' · 🌧️ יורד גשם באזורים המונפשים' : base; };
  toggle(rainFall, true); rainFall.setGrid(g);
 }
 let loading = null;
 function ensureData() {
  if (loading) return loading;
  loading = Promise.all([
   fetch('./landscape/meta.json').then(r => r.json()).catch(() => null),
   fetch('./landscape/rivers.json').then(r => r.json()).catch(() => null)
  ]).then(async ([meta, rv]) => {
   riverData = rv;
   if (meta) {
    try { wet = await loadRaster('./landscape/wetlands_eu.png', meta.wetlands.bbox); } catch (e) {}
    try { veg = await loadRaster('./landscape/veg1940.png', meta.veg1940.bbox); } catch (e) {}
   }
  });
  return loading;
 }
 const toggle = (layer, on) => { if (on && !map.hasLayer(layer)) layer.addTo(map); else if (!on && map.hasLayer(layer)) map.removeLayer(layer); };
 async function apply() {
  const m = state.mode;
  for (const [k, layer] of Object.entries(bases)) toggle(layer, k === m);
  if (carto) toggle(carto, m === 'normal');
  toggle(relief, state.relief && m !== 'normal');
  const ov = map.getPane('overlayPane'); ov.style.mixBlendMode = m === 'normal' ? '' : 'multiply'; ov.style.opacity = '';
  el.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('on', b.dataset.mode === m); b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
  for (const k of ['rivers', 'wet', 'veg', 'relief', 'snow', 'dem', 'wx']) { const c = el.querySelector(`[data-opt="${k}"]`); if (c) c.checked = !!state[k]; }
  el.querySelector('[data-opt="relief"]').disabled = m === 'normal';
  el.querySelector('.note').textContent = notes[m];
  await ensureData();
  toggle(rivers, state.rivers); toggle(riverLabels, state.rivers); if (state.rivers) drawRivers(true);
  toggle(wetlands, state.wet && !!wet); toggle(vegetation, state.veg && !!veg); toggle(snow, state.snow && !!S);
  toggle(dem, !!state.dem); hover.dem = ''; hover.wx = ''; showHover();
  applyOcc(); updateSnow(true); updateWeather(true);
 }
 function setMode(m) {
  if (!modes.some(([k]) => k === m)) m = 'normal';
  state.mode = m; store.set('ww2.terrain.mode', m);
  for (const k of ['wet', 'veg', 'snow', 'dem', 'wx']) if (store.get('ww2.terrain.' + k, null) === null) state[k] = optDefault(k, m);
  const v = store.get('ww2.terrain.occ.' + (m === 'normal' ? 'n' : 't'), null); state.occ = v === null ? (m === 'normal' ? 100 : 80) : +v;
  apply();
 }
 apply();

 const slider = document.querySelector('#slider');
 const onDay = () => { updateSnow(); updateWeather(); };
 if (slider) { slider.addEventListener('input', onDay); slider.addEventListener('change', onDay); }
 document.addEventListener('ww2:daychange', onDay);
 let lastDay = NaN;
 setInterval(() => { const d = currentDay(); if (d !== lastDay) { lastDay = d; if (state.snow) updateSnow(); if (state.wx) updateWeather(); applyOcc(); } }, 400);

 window.WW2Terrain = { setMode, state, snow, snowFall, rainFall, wxText, wetlands, vegetation, rivers, bases, relief, dem, applyOcc };
})();
