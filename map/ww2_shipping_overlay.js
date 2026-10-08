/* "קווי ספנות" on the timeline map (24.9.2026).
   ww2_timeline_map.html#shipq={json}  → the map jumps to the start date, stays paused, and shows the report's
   lanes, ports, convoys (moving along their lane while the timeline plays) and losses (appearing on their day).
   Same engine as ww2_shipping_lines.html (ww2_shipping_engine.js). Also adds "קווי ספנות" to the tools menu. */
(() => {
 'use strict';
 if (!window.L || typeof map === 'undefined') return;
 const S = window.WW2Ship;
 const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
 const PAGE = './ww2_shipping_lines.html';

 // tools menu entry
 const menu = document.getElementById('mapToolsMenu');
 if (menu && !menu.querySelector('[data-ww2-ship]')) {
  const b = document.createElement('button'); b.type = 'button'; b.dataset.ww2Ship = '1'; b.textContent = '🚢 קווי ספנות';
  b.onclick = e => { e.stopPropagation(); (window.top || window).location.href = new URL(PAGE, location.href).href; };
  const last = menu.querySelector('[data-panel="none"]'); menu.insertBefore(b, last || null);
 }
 // a button on the map itself (under "רקע"), so the page is one click away
 try {
  const Btn = L.Control.extend({ options: { position: 'topleft' }, onAdd() {
   const a = L.DomUtil.create('a', 'ww2ShipBtn'); a.href = PAGE; a.target = '_top';
   a.innerHTML = '🚢 קווי ספנות'; a.title = 'מה עבר בים בין מדינות ונמלים — דוחות ומפה';
   L.DomEvent.disableClickPropagation(a); return a; } });
  new Btn().addTo(map);
  const bcss = document.createElement('style');
  bcss.textContent = '.ww2ShipBtn{display:block;direction:rtl;background:rgba(251,249,244,.97);border:1px solid #cfc6b8;border-radius:8px;padding:6px 10px;' +
   'font:600 13px system-ui,Heebo,Arial,sans-serif;color:#1f2a37!important;text-decoration:none;box-shadow:0 1px 4px #0002}.ww2ShipBtn:hover{background:#fff;border-color:#8a7f70}';
  document.head.appendChild(bcss);
 } catch (e) {}
 if (!S) return;

 const pane = (n, z, pe) => { const p = map.getPane(n) || map.createPane(n); p.style.zIndex = z; if (pe) p.style.pointerEvents = pe; return n; };
 pane('ww2ShipLanes', 430, 'none'); pane('ww2ShipMk', 640);
 const laneR = L.svg({ pane: 'ww2ShipLanes' });
 const G = { lanes: L.layerGroup(), ports: L.layerGroup(), conv: L.layerGroup(), loss: L.layerGroup() };
 let R = null, panel = null, lossMk = [], convMk = [];

 const css = document.createElement('style');
 css.textContent = `
#ww2ShipPanel{position:absolute;top:64px;left:12px;z-index:1200;width:300px;max-width:calc(100vw - 24px);direction:rtl;background:#12213aF2;color:#e8eef6;
 border:1px solid #23406a;border-radius:14px;box-shadow:0 12px 32px #0007;font:13px/1.45 system-ui,Heebo,Arial,sans-serif;overflow:hidden}
#ww2ShipPanel .h{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-bottom:1px solid #1d3557}
#ww2ShipPanel .h .ic{width:34px;height:34px;border-radius:10px;background:#1c3a66;display:flex;align-items:center;justify-content:center;font-size:18px;flex:0 0 auto}
#ww2ShipPanel .h .t{font-weight:700;font-size:13.5px}#ww2ShipPanel .h .s{color:#93a9c4;font-size:11.5px}
#ww2ShipPanel .h button{margin-inline-start:auto;border:0;background:transparent;color:#93a9c4;font-size:15px;cursor:pointer}
#ww2ShipPanel .k{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 14px}
#ww2ShipPanel .k div{background:#162947;border:1px solid #1d3557;border-radius:10px;padding:6px 8px}#ww2ShipPanel .k b{display:block;font-size:16px}
#ww2ShipPanel .k span{color:#93a9c4;font-size:10.5px}
#ww2ShipPanel .lg{padding:0 14px 8px;color:#c9d6e6;font-size:11.5px;display:grid;gap:4px}
#ww2ShipPanel .lg i{display:inline-block;vertical-align:middle;margin-inline-end:6px}
#ww2ShipPanel .lgt{padding:0 14px 6px;color:#60a5fa;font-size:11.5px;cursor:pointer;user-select:none}
#ww2ShipPanel .now{padding:0 14px 8px;color:#93a9c4;font-size:11.5px}
#ww2ShipPanel .b{display:flex;gap:6px;padding:0 14px 12px}
#ww2ShipPanel .b a,#ww2ShipPanel .b button{flex:1;text-align:center;text-decoration:none;background:#1b3357;border:1px solid #23406a;color:#e8eef6;border-radius:9px;padding:6px 8px;font:inherit;cursor:pointer}
#ww2ShipPanel .b .pri{background:#3b82f6;border-color:#3b82f6;font-weight:600}
.leaflet-tooltip.ww2ShipLbl{background:#0f1d33e6;color:#e8eef6;border:1px solid #2c5a96;border-radius:8px;font:600 11px system-ui,Heebo,Arial,sans-serif;direction:rtl;box-shadow:none}
.leaflet-tooltip.ww2ShipLbl:before{display:none}
.ww2ShipConv{display:flex;align-items:center;gap:4px;white-space:nowrap;background:#0f1d33;color:#fff;border:1.5px solid #f59e0b;border-radius:999px;padding:1px 7px 1px 5px;
 font:700 10.5px system-ui,Heebo,Arial,sans-serif;box-shadow:0 2px 6px #0006;transform:translate(-50%,-50%);width:max-content}
.ww2ShipPort{width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid #0f766e;display:flex;align-items:center;justify-content:center;font-size:10px;box-shadow:0 1px 4px #0005}
`;
 document.head.appendChild(css);

 const laneColor = c => c.basis === 'graph' ? '#0f766e' : '#7c3aed';
 function mid(path) { return path[Math.floor(path.length / 2)]; }
 function along(path, t) {       // point at fraction t of a polyline (by length)
  const seg = []; let tot = 0;
  for (let i = 1; i < path.length; i++) { const dx = (path[i][0] - path[i - 1][0]) * Math.cos(path[i][1] * Math.PI / 180), dy = path[i][1] - path[i - 1][1]; const l = Math.hypot(dx, dy); seg.push(l); tot += l; }
  let want = Math.max(0, Math.min(1, t)) * tot;
  for (let i = 0; i < seg.length; i++) { if (want <= seg[i] || i === seg.length - 1) { const f = seg[i] ? want / seg[i] : 0; return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f]; } want -= seg[i]; }
  return path[0];
 }
 const ll = ([x, y]) => [y, x];

 function clear() {
  for (const g of Object.values(G)) { g.clearLayers(); if (map.hasLayer(g)) map.removeLayer(g); }
  if (panel) { panel.remove(); panel = null; }
  R = null; lossMk = []; convMk = [];
 }
 function draw(r) {
  clear(); R = r;
  const bounds = [];
  for (const l of r.lanes) {
   const pts = l.sub.map(ll); bounds.push(...pts);
   const col = laneColor(l.c);
   L.polyline(pts, { renderer: laneR, color: '#ffffff', weight: 7, opacity: .75, interactive: false }).addTo(G.lanes);
   L.polyline(pts, { renderer: laneR, color: col, weight: 3.5, opacity: .95, dashArray: '10 7', interactive: false }).addTo(G.lanes);
   L.marker(ll(mid(l.sub)), { pane: 'ww2ShipMk', interactive: false, icon: L.divIcon({ className: '', html: '', iconSize: [0, 0] }) })
    .bindTooltip(`🚢 ${esc(l.c.he)}`, { permanent: true, direction: 'center', className: 'ww2ShipLbl' }).addTo(G.lanes);
  }
  const ports = new Set(); r.lanes.forEach(l => l.c.ports.forEach(p => ports.add(p)));
  for (const id of ports) {
   const p = S.idx.port[id]; if (!p) continue;
   L.marker([p.y, p.x], { pane: 'ww2ShipMk', icon: L.divIcon({ className: '', html: '<div class="ww2ShipPort">⚓</div>', iconSize: [18, 18], iconAnchor: [9, 9] }) })
    .bindTooltip(esc(p.he || p.n), { direction: 'top', offset: [0, -8] })
    .bindPopup(`<b>⚓ ${esc(p.he || p.n)}</b><br>מדינה: ${esc(S.countryHe(p.cc))}<br>נתיבים בדוח: ${esc(r.lanes.filter(l => l.c.ports.includes(id)).map(l => l.c.he).join(', '))}`).addTo(G.ports);
  }
  // convoys: one marker each, positioned per day
  for (const v of r.convoys) {
   const c = S.idx.corr[v.corr]; if (!c) continue;
   const path = v.dir < 0 ? c.path.slice().reverse() : c.path;
   const m = L.marker(ll(path[0]), { pane: 'ww2ShipMk', icon: L.divIcon({ className: '', html: `<div class="ww2ShipConv">🚢 ${esc(v.n)}</div>`, iconSize: [0, 0] }) })
    .bindPopup(`<b>🚢 שיירה ${esc(v.n)}</b><br>נתיב: ${esc(c.he)}<br>יציאה: ${S.heDate(v.d0)}<br>סיום: ${S.heDate(v.d1)}` +
     (v.sailed ? `<br>יצאו: ${v.sailed} אוניות` : '') + `<br>אבדו: ${v.lost || 0}` + ((S.data.cargo[v.k] || []).length ? `<br>מניפסט: ${(S.data.cargo[v.k] || []).length} אוניות עם מטען` : '') +
     (v.res ? `<br>תוצאה: ${esc(v.res)}` : '') + `<br>מיקום: משוער — התקדמות אחידה לאורך הנתיב בין תאריך היציאה לסיום`);
   convMk.push({ v, m, path });
  }
  // losses with a known place
  const kinds = [['convoy', '#ef4444', 'אבדה בשיירה'], ['voyage', '#ef4444', 'אבדה במסלול מתועד'], ['corridor', '#fb923c', 'אבדה באזור הנתיב'], ['other', '#94a3b8', 'דגל אחר באזור הנתיב']];
  for (const [k, col, lab] of kinds) for (const s of r.losses[k]) {
   if (s.x == null) continue;
   const m = L.circleMarker([s.y, s.x], { pane: 'ww2ShipMk', radius: 5, color: '#fff', weight: 1.4, fillColor: col, fillOpacity: .95 })
    .bindPopup(`<b>${esc(s.n || 'אונייה')}</b><br>${lab}<br>תאריך: ${S.heDate(s.d)}<br>דגל: ${esc(S.countryHe(s.fl))}` + (s.type ? `<br>סוג: ${esc(s.type)}` : '') +
     (s.cause ? `<br>סיבה: ${esc(S.CAUSE[s.cause] || s.cause)}` : '') + (s.ck ? `<br>שיירה: ${esc((S.idx.conv[s.ck] || {}).n || s.ck)}` : '') +
     (s.fr || s.to ? `<br>מסלול: ${esc(S.portHe(s.fr))} → ${esc(S.portHe(s.to))}` : '') + (s.att ? `<br>תוקף: ${esc(s.att)}` : '') + (s.km != null ? `<br>מרחק מהנתיב: ${s.km} ק״מ` : ''));
   lossMk.push({ s, m });
  }
  for (const g of Object.values(G)) g.addTo(map);
  // panel
  panel = document.createElement('div'); panel.id = 'ww2ShipPanel';
  panel.innerHTML = `<div class="h"><div class="ic">🚢</div><div><div class="t">${esc(r.title)}</div><div class="s">קווי ספנות · המפה נעצרה בתאריך ההתחלה</div></div><button title="סגור" data-x>✕</button></div>
   <div class="k"><div><b>${r.lanes.length}</b><span>נתיבים</span></div><div><b>${r.convoys.length}</b><span>שיירות</span></div><div><b>${r.kpi.lost}</b><span>אבדות</span></div></div>
   <div class="now" data-now></div>
   <div class="lgt" data-lg>מקרא ▾</div><div class="lg"><div><i style="width:26px;border-top:3px dashed #0f766e"></i>נתיב מתועד בגרף</div><div><i style="width:26px;border-top:3px dashed #7c3aed"></i>מסדרון סכמטי (משורטט בין הנמלים)</div>
    <div><i style="width:12px;height:12px;border-radius:50%;background:#ef4444;border:1.5px solid #fff"></i>אונייה שאבדה בשיירה / במסלול</div>
    <div><i style="width:12px;height:12px;border-radius:50%;background:#fb923c;border:1.5px solid #fff"></i>אוניית אחד הצדדים שאבדה ליד הנתיב</div>
    <div><i style="width:12px;height:12px;border-radius:50%;background:#94a3b8;border:1.5px solid #fff"></i>דגל אחר ליד הנתיב</div>
    <div><i style="font-style:normal">🚢</i>שיירה בדרך (מיקום משוער)</div></div>
   <div class="b"><button class="pri" data-play>▶ המשך</button><a href="${PAGE}" target="_top">הדוח המלא</a></div>`;
  map.getContainer().appendChild(panel);
  const lgBtn = panel.querySelector('[data-lg]'), lg = panel.querySelector('.lg');
  const setLg = open => { lg.style.display = open ? '' : 'none'; lgBtn.textContent = open ? 'מקרא ▴' : 'מקרא ▾'; };
  setLg(map.getContainer().clientWidth >= 900); lgBtn.onclick = () => setLg(lg.style.display === 'none');
  L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel);
  panel.querySelector('[data-x]').onclick = () => { clear(); history.replaceState(null, '', location.pathname + location.search + hashWithout()); };
  const pb = panel.querySelector('[data-play]'), play = document.getElementById('play');
  pb.onclick = () => { if (play) play.click(); syncPlay(); };
  if (bounds.length) try { map.fitBounds(L.latLngBounds(bounds).pad(.12), { animate: false, maxZoom: 6 }); } catch (e) {}
  update(currentDay());
 }
 function syncPlay() {
  if (!panel) return; const play = document.getElementById('play');
  panel.querySelector('[data-play]').textContent = play && play.textContent.includes('⏸') ? '⏸ עצור' : '▶ המשך';
 }
 const currentDay = () => { const s = document.getElementById('slider'); return s ? +s.value : 0; };
 function update(d) {
  if (!R) return;
  let nc = 0, nl = 0;
  for (const { v, m, path } of convMk) {
   const on = d >= v.d0 && d <= v.d1;
   if (on) { const t = v.d1 > v.d0 ? (d - v.d0) / (v.d1 - v.d0) : .5; m.setLatLng(ll(along(path, t))); if (!G.conv.hasLayer(m)) G.conv.addLayer(m); nc++; }
   else if (G.conv.hasLayer(m)) G.conv.removeLayer(m);
  }
  for (const { s, m } of lossMk) {
   const on = s.d <= d && s.d >= R.D0;
   if (on) { const age = d - s.d; m.setStyle({ radius: age <= 10 ? 7.5 : 5, fillOpacity: age <= 10 ? 1 : .8, opacity: 1 }); if (!G.loss.hasLayer(m)) G.loss.addLayer(m); nl++; }
   else if (G.loss.hasLayer(m)) G.loss.removeLayer(m);
  }
  const now = panel && panel.querySelector('[data-now]');
  if (now) now.textContent = d < R.D0 ? 'לפני תחילת הטווח' : d > R.D1 ? `אחרי סוף הטווח (${S.heDate(R.D1)})` : `ביום ${S.heDate(d)}: ${nc} שיירות בדרך · ${nl} אבדות עד כה`;
  syncPlay();
 }
 const prev = tick; tick = function (d) { prev(d); try { update(d); } catch (e) {} };

 function hashQ() {
  const h = new URLSearchParams(location.hash.slice(1)).get('shipq');
  if (!h) return null; try { return JSON.parse(h); } catch (e) { return null; }
 }
 function hashWithout() { const h = new URLSearchParams(location.hash.slice(1)); h.delete('shipq'); const s = h.toString(); return s ? '#' + s : ''; }
 function apply() {
  const q = hashQ(); if (!q) return;
  S.load('./').then(() => {
   const r = S.run(q);
   const play = document.getElementById('play');
   if (play && play.textContent.includes('⏸')) play.click();          // paused at the start date
   const s = document.getElementById('slider');
   if (s) { s.value = r.D0; try { paintTrack(); } catch (e) {} tick(r.D0); }
   draw(r);
  }).catch(e => console.warn('ww2 shipping overlay:', e));
 }
 window.addEventListener('hashchange', apply);
 // wait a moment so the page's own start-up (date restore, scenes) settles before we set the date
 setTimeout(apply, 600);
 window.WW2ShippingMap = { apply, clear, get report() { return R; } };
})();
