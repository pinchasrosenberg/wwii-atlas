/* Japanese control in East Asia and the Pacific (2026-09-24, v2). Data: ww2_pacific_control.js.
   Occupied land is painted like the European front grid, CLIPPED TO THE LAND OUTLINE — no colour on the sea.
   Each island takes its dates from anchors on the same island (tools/build_pacific_control.py).
   Islands recaptured by the Allies turn blue. Island markers show who held them on the shown day, and an ✈
   marks an island with an airfield (air/airfields.json). */
(() => {
 'use strict';
 const P = window.WW2_PACIFIC;
 if (!window.L || typeof map === 'undefined' || !P) return;
 const day0 = () => { const s = document.querySelector('#slider'); return s ? +s.value : 0; };
 const held = (f, fr, d) => (f === -1 || (f > 0 && d >= f)) && !(fr > 0 && d >= fr);
 const freed = (f, fr, d) => (f === -1 || f > 0) && fr > 0 && d >= fr && (f === -1 || d >= f);
 const heDate = d => new Date(Date.UTC(1937, 0, 1) + d * 864e5).toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: 'numeric' });
 const k = () => (window.WW2Occ && typeof window.WW2Occ.k === 'number') ? window.WW2Occ.k : 1;
 const eff = () => (window.WW2Occ && typeof window.WW2Occ.e === 'number') ? window.WW2Occ.e : k();
 let on = true;

 const mk = (n, z) => { const p = map.getPane(n) || map.createPane(n); p.style.zIndex = z; return p; };
 mk('ww2Pac', 395).style.pointerEvents = 'none';
 mk('ww2PacUnits', 396).style.pointerEvents = 'none'; mk('ww2PacIsl', 470);

 // land outline (lon/lat rings) with a bbox per polygon, for clipping
 const LAND = (P.land || []).map(rings => {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const [x, y] of rings[0]) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return { rings, bb: [a, b, c, d] };
 });

 // ── occupied land: soft discs per 0.25° cell, clipped to the coast ──
 const PacLayer = L.Layer.extend({
  onAdd(m) {
   this._m = m; const c = this._c = L.DomUtil.create('canvas', 'leaflet-zoom-animated');
   c.style.position = 'absolute'; c.style.pointerEvents = 'none'; m.getPane('ww2Pac').appendChild(c);
   this._h = () => { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this._reset(); }); };
   m.on('move zoom viewreset resize zoomend moveend', this._h, this); this._reset();
  },
  onRemove(m) { m.off('move zoom viewreset resize zoomend moveend', this._h, this); L.DomUtil.remove(this._c); },
  _reset() {
   const m = this._m, s = m.getSize(), c = this._c;
   L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
   if (c.width !== s.x || c.height !== s.y) { c.width = s.x; c.height = s.y; }
   this.draw();
  },
  draw() {
   const m = this._m, c = this._c; if (!c) return;
   const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
   const d = day0(), st = P.step, [x0, y0] = P.bbox, b = m.getBounds().pad(.1);
   const W = b.getWest(), S = b.getSouth(), E = b.getEast(), N = b.getNorth();
   const latN = Math.min(55, Math.max(Math.abs(N), Math.abs(S))), lonC = b.getCenter().lng;
   const p1 = m.latLngToContainerPoint([latN - st, lonC]), p2 = m.latLngToContainerPoint([latN, lonC + st]);
   const R = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y)) * .8;
   const core = new Path2D(), occ = new Path2D(), lib = new Path2D(); let nc = 0, no = 0, nl = 0;
   for (let i = 0; i < P.cx.length; i++) {
    const f = P.fall[i], fr = P.free[i];
    const h = held(f, fr, d), l = !h && freed(f, fr, d);
    if (!h && !l) continue;
    const lon = (L.ww2NearLng || (v => v))(x0 + (P.cx[i] + .5) * st, lonC), lat = y0 + (P.cy[i] + .5) * st;
    if (lon < W || lon > E || lat < S || lat > N) continue;
    const q = m.latLngToContainerPoint([lat, lon]), path = l ? lib : f === -1 ? core : occ;
    path.moveTo(q.x + R, q.y); path.arc(q.x, q.y, R, 0, 6.2832);
    l ? nl++ : f === -1 ? nc++ : no++;
   }
   if (!nc && !no && !nl) return;
   // clip to land
   const clip = new Path2D(); let any = false;
   for (const p of LAND) {
    const [a, bb, cc, dd] = p.bb; if (cc < W || a > E || dd < S || bb > N) continue;
    for (const ring of p.rings) {
     ring.forEach(([x, y], j) => { const q = m.latLngToContainerPoint([y, x]); j ? clip.lineTo(q.x, q.y) : clip.moveTo(q.x, q.y); });
     clip.closePath(); any = true;
    }
   }
   ctx.save();
   if (any) ctx.clip(clip, 'evenodd');
   const e = eff(); ctx.globalAlpha = Math.min(1, e);
   const a = (.42 * Math.min(1.6, Math.max(1, e))).toFixed(3), tc = window.WW2Occ && window.WW2Occ.colors;
   const hs = (v, dflt) => v ? `hsla(${v[0]},${v[1]}%,${v[2]}%,${a})` : dflt;
   if (nc) { ctx.fillStyle = hs(tc && tc.core, `hsla(20,62%,37%,${a})`); ctx.fill(core); }
   if (no) { ctx.fillStyle = hs(tc && tc.occ, `hsla(28,52%,56%,${a})`); ctx.fill(occ); }
   if (nl) { ctx.fillStyle = `hsla(212,55%,46%,${(a * .75).toFixed(3)})`; ctx.fill(lib); }
   ctx.restore();
  }
 });
 const land = new PacLayer();

 // ── Japan, its colonies and Thailand (exact CShapes outlines) ──
 const svgUnits = L.svg({ pane: 'ww2PacUnits' });
 const unitLayer = L.layerGroup();
 const kf = () => { const e = eff(); return e <= 1 ? e : Math.min(1.5, e); };
 const unitStyle = u => ({ renderer: svgUnits, color: u.status === 'ally' ? 'hsl(32,40%,52%)' : 'hsl(20,62%,32%)', weight: 1.2, opacity: .85,
  fillColor: u.status === 'ally' ? 'hsl(32,34%,64%)' : (window.WW2Occ && window.WW2Occ.colors ? `hsl(${window.WW2Occ.colors.core[0]},${window.WW2Occ.colors.core[1]}%,${window.WW2Occ.colors.core[2]}%)` : 'hsl(20,62%,40%)'), fillOpacity: Math.min(.75, (u.status === 'ally' ? .34 : .46) * kf()) });
 const unitPaths = P.units.map(u => {
  const l = L.geoJSON({ type: 'Feature', geometry: u.g }, { style: () => unitStyle(u) });
  l.bindPopup(`<b>${u.n}</b><br>${u.status === 'ally' ? 'בעלת ברית של יפן' : 'שטח יפני לפני המלחמה (ציר)'}` +
   (u.fall > 0 ? `<br>מ־${heDate(u.fall)}` : '') + `<br>עד ${heDate(u.free)}` + (u.note ? `<br>${u.note}` : ''));
  return { u, l };
 });

 // ── islands: a round badge per island, ✈ when it has an airfield ──
 const islLayer = L.layerGroup();
 let fields = [];                               // [name, lon, lat, opened, axFrom, axTo, kind, curated]
 const isl = P.islands.map(([n, lon, lat, f, fr, stt]) => ({ n, lon, lat, f, fr, stt, af: [], mk: L.marker([lat, lon], { pane: 'ww2PacIsl', keyboard: false }) }));
 fetch('./air/airfields.json').then(r => r.ok ? r.json() : null).then(j => {
  if (!j) return; fields = j.fields;
  for (const it of isl) it.af = fields.filter(f => Math.abs(f[1] - it.lon) < .45 && Math.abs(f[2] - it.lat) < .45 &&
   Math.hypot((f[1] - it.lon) * Math.cos(it.lat * Math.PI / 180), f[2] - it.lat) * 111 < 40);
  if (on) drawIslands(day0(), true);
 }).catch(() => {});
 let lastKey = '';
 // the Allied power that held or retook each island
 const ALLY = { 'Hong Kong': 'UK', 'Port Blair (Andaman)': 'UK', 'Car Nicobar': 'UK', 'Christmas Island': 'UK', 'Banaba (Ocean I.)': 'UK', 
  'Nauru': 'AU', 'Timor (Koepang)': 'NL', 'Paramushir (Kurils)': 'SU' };
 function drawIslands(d, force) {
  const z = map.getZoom(), sz = z >= 6 ? 22 : z >= 4 ? 18 : 14;
  const key = d + '|' + sz + '|' + fields.length;
  if (key === lastKey && !force) return; lastKey = key;
  for (const it of isl) {
   const h = held(it.f, it.fr, d);
   const fill = h ? (it.stt === 'axis' ? '#9b1c2c' : '#d9480f') : '#1d5fb4';
   const af = it.af.filter(f => !f[3] || f[3] <= d);
   // the flag of whoever held the island that day; ✈ in the corner when it has an airfield
   const F = window.WW2Flags, fc = h ? 'JP' : (ALLY[it.n] || 'US');
   let s, html;
   if (F) {
    s = af.length ? 24 : 19;
    html = `<div class="ww2IslF${af.length ? ' af' : ''}" style="border-color:${fill}">${F.chip(fc, af.length > 0)}${af.length ? '<i>✈</i>' : ''}</div>`;
   } else {
    const plane = af.length ? '<span style="font-size:' + Math.round(sz * .62) + 'px;line-height:1">✈</span>' : '';
    s = af.length ? sz : Math.round(sz * .6);
    html = `<div class="ww2IslB" style="width:${s}px;height:${s}px;background:${fill}">${plane}</div>`;
   }
   // unchanged island (same holder, airfields and size): leave its icon, tooltip and popup alone
   const look = html + '|' + s + '|' + (it.f !== -1 && d < it.f); if (it._look === look && !force) continue; it._look = look;
   it.mk.setIcon(L.divIcon({ className: '', iconSize: [s, Math.round(s * .7)], iconAnchor: [s / 2, s * .35], html }));
   const state = h ? (it.stt === 'axis' ? 'בשליטת יפן (שטח יפני לפני המלחמה)' : 'בכיבוש יפני') : (it.f !== -1 && d < it.f ? 'לפני הכיבוש היפני' : 'בידי בעלות הברית');
   it.mk.unbindTooltip().bindTooltip(`${af.length ? '✈ ' : ''}${it.n} — ${h ? 'יפן' : 'בעלות הברית'}`, { direction: 'top', offset: [0, -s / 2], className: 'ww2IslLabel' });
   it.mk.bindPopup(`<b>${af.length ? '✈ ' : ''}${it.n}</b><br>מצב: ${state}` + (it.f > 0 ? `<br>נכבש: ${heDate(it.f)}` : '') +
    `<br>${it.f === -1 ? 'נכבש/נכנע' : 'שוחרר'}: ${heDate(it.fr)}` +
    (af.length ? `<br>שדות תעופה: ${af.map(f => f[0]).join(', ')}<br>השדה בידי: ${h ? 'יפן' : 'בעלות הברית'}` : ''));
  }
 }
 function redrawUnits(d) {
  for (const { u, l } of unitPaths) {
   const act = held(u.fall, u.free, d);
   if (act && on) { if (!unitLayer.hasLayer(l)) { unitLayer.addLayer(l); l.setStyle(unitStyle(u)); } }
   else if (unitLayer.hasLayer(l)) unitLayer.removeLayer(l);
  }
 }
 function draw() {
  const d = day0();
  if (!on) return;
  land.draw(); redrawUnits(d); drawIslands(d);
 }
 function setOn(v) {
  on = v;
  for (const l of [land, unitLayer, islLayer]) { if (v && !map.hasLayer(l)) l.addTo(map); if (!v && map.hasLayer(l)) map.removeLayer(l); }
  if (v) { isl.forEach(it => islLayer.addLayer(it.mk)); drawIslands(day0(), true); draw(); }
 }
 const css = document.createElement('style');
 css.textContent = '.leaflet-tooltip.ww2IslLabel{font:600 11px system-ui,Arial,sans-serif;direction:rtl}' +
  '.ww2IslF{position:relative;display:inline-block;border-bottom:3px solid;border-radius:2px;line-height:0;cursor:pointer}' +
  '.ww2IslF i{position:absolute;right:-8px;bottom:-8px;width:14px;height:14px;border-radius:50%;background:#0f1d33;color:#fff;font:normal 10px/14px system-ui;text-align:center;box-shadow:0 0 0 1.5px #fff}' +
  '.ww2IslB{border-radius:50%;border:2px solid #fff;box-shadow:0 1px 5px #0007;display:flex;align-items:center;justify-content:center;color:#fff;box-sizing:border-box;cursor:pointer}';
 document.head.appendChild(css);

 // the older perimeter estimated from battles (buffers that also cover the sea) stays available, off by default
 let perimOn = false;
 const setPerim = v => { perimOn = v; try { if (typeof dctlLayer !== 'undefined' && dctlLayer.pacific) { if (v && !map.hasLayer(dctlLayer.pacific)) dctlLayer.pacific.addTo(map); if (!v && map.hasLayer(dctlLayer.pacific)) map.removeLayer(dctlLayer.pacific); } } catch (e) {} };
 setPerim(false);
 // updateDerived re-adds it on period changes — keep it off unless asked for
 try { const ud = window.updateDerived; if (typeof ud === 'function') window.updateDerived = function (...a) { const r = ud.apply(this, a); if (!perimOn) setPerim(false); return r; }; } catch (e) {}

 const box = document.getElementById('ww2Enrich');
 if (box) {
  const label = document.createElement('label'); label.style.display = 'block';
  label.innerHTML = '<input type="checkbox" id="ww2PacificToggle" checked> 🗾 שליטה יפנית במזרח הרחוק ובאיים';
  box.append(label);
  label.querySelector('input').onchange = e => setOn(e.target.checked);
  const l2 = document.createElement('label'); l2.style.display = 'block';
  l2.innerHTML = '<input type="checkbox" id="ww2PacPerim"> פרימטר משוער מקרבות (שכבה ישנה, צובעת גם ים)';
  box.append(l2); l2.querySelector('input').onchange = e => setPerim(e.target.checked);
  const note = document.createElement('div'); note.style.cssText = 'font-size:10px;color:#786a55;line-height:1.35';
  note.textContent = 'הצבע רק על היבשה: כהה = יפן ומושבותיה, בהיר = שטח כבוש, כחול = שוחרר. עיגול על אי: אדום = בידי יפן, כחול = בידי בעלות הברית; ✈ = יש באי שדה תעופה. ' + P.note;
  box.append(note);
 }
 document.addEventListener('ww2:occstrength', () => { if (on) { land.draw(); redrawUnits(day0()); } });
 map.on('zoomend', () => { if (on) drawIslands(day0()); });
 const prev = tick; tick = function (d) { prev(d); if (on) draw(); };
 setOn(true);
 window.WW2Pacific = { setOn, draw, setPerim, count: P.cx.length };
})();
