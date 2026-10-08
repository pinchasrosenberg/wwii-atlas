/* Air movement and airfields on the timeline map (2026-09-24). Data: air/flights.json, air/airfields.json
   (tools/build_air_flights.py).
   • Flights: every Allied raid in THOR (1939–45) flies from its base to its target on the day of the raid —
     a stream of planes along an arc, colour by air force, number of planes by sorties. The base is ESTIMATED
     (nearest airfield the Allies could use that day); the card on the base says so.
   • Airfields: coloured by who held the ground on the shown day (red = Axis, blue = Allies, grey = neutral). */
(() => {
 'use strict';
 if (!window.L || typeof map === 'undefined') return;
 const EPOCH = Date.UTC(1937, 0, 1), MS = 864e5;
 const heDate = d => new Date(EPOCH + d * MS).toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: 'numeric' });
 const yearOf = d => new Date(EPOCH + d * MS).getUTCFullYear();
 const day0 = () => { const s = document.getElementById('slider'); return s ? +s.value : 0; };
 const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
 const FORCE = f => /USA/.test(f) && !/BRITAIN|AUSTRALIA|ZEALAND/.test(f) ? ['#fbbf24', 'חיל האוויר האמריקני'] :
  /GREAT BRITAIN/.test(f) ? ['#c084fc', 'חיל האוויר המלכותי'] : /AUSTRALIA|ZEALAND|SOUTH AFRICA/.test(f) ? ['#34d399', 'אוסטרליה / ניו זילנד / דרום אפריקה'] : ['#e2e8f0', 'לא צוין'];
 let fields = null, flights = null, byDay = new Map(), names = [], forces = [];
 let flyOn = true, fieldsOn = true;

 const pane = (n, z) => { const p = map.getPane(n) || map.createPane(n); p.style.zIndex = z; return p; };
 pane('ww2Air', 455).style.pointerEvents = 'none'; pane('ww2AirMk', 612);

 Promise.all([fetch('./air/airfields.json').then(r => r.json()), fetch('./air/flights.json').then(r => r.json())]).then(([A, F]) => {
  fields = A.fields; flights = F.flights; names = F.names; forces = F.forces;
  for (const f of flights) { let l = byDay.get(f[3]); if (!l) byDay.set(f[3], l = []); l.push(f); }
  for (const l of byDay.values()) l.sort((a, b) => b[4] - a[4]);
  refresh(true);
 }).catch(e => console.warn('ww2 air overlay:', e));

 // ── canvas: arcs + streams of planes ──
 let clock = 0, raf = 0, lastT = 0;
 const AirLayer = L.Layer.extend({
  onAdd(m) {
   this._m = m; const c = this._c = L.DomUtil.create('canvas', 'leaflet-zoom-animated');
   c.style.position = 'absolute'; c.style.pointerEvents = 'none'; m.getPane('ww2Air').appendChild(c);
   this._h = () => this._reset(); m.on('move zoom viewreset resize zoomend moveend', this._h, this); this._reset(); loop();
  },
  onRemove(m) { m.off('move zoom viewreset resize zoomend moveend', this._h, this); L.DomUtil.remove(this._c); this._c = null; },
  _reset() {
   const m = this._m, s = m.getSize(), c = this._c; if (!c) return;
   L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
   if (c.width !== s.x || c.height !== s.y) { c.width = s.x; c.height = s.y; }
   this.draw();
  },
  draw() {
   const m = this._m, c = this._c; if (!c) return;
   const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
   if (!flights || !flyOn) return;
   const d = day0(), b = m.getBounds().pad(.3), z = m.getZoom();
   const list = [];
   for (let t = d - 2; t <= d; t++) for (const f of (byDay.get(t) || [])) {
    const fb = fields[f[0]];
    if (!b.contains([f[2], f[1]]) && !b.contains([fb[2], fb[1]])) continue;
    list.push(f);
   }
   list.sort((a, b2) => (b2[3] - a[3]) || (b2[4] - a[4]));
   const show = list.slice(0, z >= 6 ? 320 : 220);
   const size = z >= 7 ? 10 : z >= 5 ? 8.5 : 7;
   ctx.lineCap = 'round';
   for (const f of show) {
    const fb = fields[f[0]];
    const a = m.latLngToContainerPoint([fb[2], fb[1]]), t = m.latLngToContainerPoint([f[2], f[1]]);
    const dx = t.x - a.x, dy = t.y - a.y, len = Math.hypot(dx, dy); if (len < 6) continue;
    const cx = (a.x + t.x) / 2 - dy * .16, cy = (a.y + t.y) / 2 + dx * .16;
    const age = d - f[3], today = age === 0;
    const [col] = FORCE(forces[f[6]] || '');
    // the lane
    ctx.globalAlpha = today ? .5 : age === 1 ? .28 : .14; ctx.strokeStyle = col; ctx.lineWidth = today ? 1.6 : 1.1;
    ctx.setLineDash(today ? [] : [4, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, t.x, t.y); ctx.stroke(); ctx.setLineDash([]);
    if (!today && age > 1) continue;
    // the planes: a stream flowing base → target
    const n = Math.min(7, 1 + Math.floor(Math.log2(1 + f[4])));
    const speed = 1 / Math.max(2.5, Math.min(7, len / 120));
    ctx.globalAlpha = today ? 1 : .55;
    for (let i = 0; i < n; i++) {
     const u = (clock * speed + i / n + (f[7] % 7) / 7) % 1;
     const x = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * cx + u * u * t.x, y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * cy + u * u * t.y;
     const tx = 2 * (1 - u) * (cx - a.x) + 2 * u * (t.x - cx), ty = 2 * (1 - u) * (cy - a.y) + 2 * u * (t.y - cy);
     plane(ctx, x, y, Math.atan2(ty, tx), size * (f[4] >= 50 ? 1.25 : 1), col);
    }
   }
   ctx.globalAlpha = 1;
  }
 });
 function plane(ctx, x, y, ang, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(s, 0); ctx.lineTo(-s * .55, s * .16); ctx.lineTo(-s * .2, s * .95); ctx.lineTo(-s * .45, s * .95); ctx.lineTo(-s * .75, s * .18);
  ctx.lineTo(-s, s * .45); ctx.lineTo(-s, -s * .45); ctx.lineTo(-s * .75, -s * .18); ctx.lineTo(-s * .45, -s * .95); ctx.lineTo(-s * .2, -s * .95);
  ctx.lineTo(-s * .55, -s * .16); ctx.closePath();
  ctx.fillStyle = col; ctx.strokeStyle = '#111827'; ctx.lineWidth = .8; ctx.fill(); ctx.stroke();
  ctx.restore();
 }
 const air = new AirLayer();
 function loop(ts) {
  if (!air._c) { raf = 0; return; }
  if (!ts || ts - lastT > 33) {                    // ~30 fps
   if (ts && lastT) clock += Math.min(.1, (ts - lastT) / 1000);
   lastT = ts || 0;
   if (!document.hidden) air.draw();
  }
  raf = requestAnimationFrame(loop);
 }

 // ── bases active on the day (clickable) ──
 const baseLayer = L.layerGroup();
 function drawBases(d) {
  baseLayer.clearLayers(); if (!flights || !flyOn) return;
  const b = map.getBounds().pad(.1), agg = new Map();
  for (const f of (byDay.get(d) || [])) {
   let o = agg.get(f[0]); if (!o) agg.set(f[0], o = { m: 0, t: 0, n: 0, tg: new Map(), fo: forces[f[6]] || '' });
   o.m += f[4]; o.t += f[5]; o.n++; const tn = names[f[7]] || 'מטרה'; o.tg.set(tn, (o.tg.get(tn) || 0) + f[4]);
  }
  let k = 0;
  for (const [fi, o] of [...agg.entries()].sort((a, b2) => b2[1].m - a[1].m)) {
   const fb = fields[fi]; if (!b.contains([fb[2], fb[1]])) continue; if (++k > 120) break;
   const [col, fn] = FORCE(o.fo);
   const tg = [...o.tg.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 5).map(([n, m]) => `${esc(n)} (${m})`).join(', ');
   const fc = forceFlag(o.fo), F = window.WW2Flags;
   L.marker([fb[2], fb[1]], { pane: 'ww2AirMk', icon: L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10],
    html: `<div class="ww2AirBase" style="border-color:${col}">✈${F && fc ? F.chip(fc).replace('class="ww2-fchip"', 'class="ww2-fchip ww2-fchip-abs"') : ''}</div>` }) })
    .bindTooltip(`🛫 ${esc(fb[0])} · ${o.m} גיחות`, { direction: 'top', offset: [0, -10] })
    .bindPopup(`<b>🛫 ${esc(fb[0])}</b><br>תאריך: ${heDate(d)}<br>משימות: ${o.n}<br>גיחות: ${o.m}<br>טון פצצות: ${Math.round(o.t).toLocaleString('en')}` +
     `<br>כוח: ${esc(fn)}<br>יעדים: ${tg}<br>מקור: THOR (הפצצות בעלות הברית)<br>שדה המוצא: משוער — השדה הקרוב ביותר שבעלות הברית יכלו להשתמש בו ביום זה`)
    .addTo(baseLayer);
  }
 }

 // ── all airfields, coloured by who held them ──
 const fieldLayer = L.layerGroup();
 const forceFlag = f => /USA/.test(f) && !/BRITAIN/.test(f) ? 'US' : /GREAT BRITAIN/.test(f) ? 'UK' : /AUSTRALIA/.test(f) ? 'AU' : /ZEALAND/.test(f) ? 'NZ' : /SOUTH AFRICA/.test(f) ? 'ZA' : '';
 // flag of whoever held the field that day: the Axis power of the region, or the country the field lies in
 const QFLAG = { Q145: 'UK', Q30: 'US', Q142: 'FR', Q408: 'AU', Q16: 'CA', Q668: 'UK', Q664: 'NZ', Q258: 'ZA', Q148: 'CN', Q928: 'US', Q252: 'NL',
  Q691: 'AU', Q685: 'UK', Q686: 'UK', Q55: 'NL', Q31: 'BE', Q20: 'NO', Q35: 'DK', Q38: 'IT', Q79: 'UK', Q233: 'UK', Q262: 'FR', Q1028: 'FR', Q948: 'FR',
  Q1016: 'UK', Q801: 'UK', Q796: 'UK', Q794: 'UK', Q810: 'UK', Q858: 'FR', Q822: 'FR', Q41: 'GR', Q36: 'PL', Q836: 'UK', Q833: 'UK', Q334: 'UK',
  Q869: 'TH', Q881: 'FR', Q159: 'SU', Q212: 'SU', Q184: 'SU', Q27: 'IE', Q34: 'SE', Q39: 'CH', Q29: 'ES', Q45: 'PT', Q43: 'TR', Q189: 'US', Q183: 'US',
  Q17: 'US', Q709: 'US', Q702: 'US', Q695: 'US', Q710: 'US', Q697: 'AU', Q865: 'US', Q884: 'US', Q213: 'SU', Q28: 'SU', Q218: 'SU', Q219: 'SU' };
 const ITALIAN = (x, y, d) => d < 2441 && ((y > 36 && y < 47.5 && x > 6.5 && x < 19) || (y > 19 && y < 33.5 && x > 9 && x < 25.5) || (y > 39.6 && y < 42.7 && x > 19 && x < 21.1));
 function holderFlag(f, d) {
  const axis = (f[4] === -1 || (f[4] > 0 && d >= f[4])) && !(f[5] > 0 && d >= f[5]);
  if (axis) return f[6] === 'v' ? 'FR' : (f[1] > 60 || f[1] < -150) ? 'JP' : ITALIAN(f[1], f[2], d) ? 'IT' : f[8] === 'Q33' ? 'FI' : f[8] === 'Q218' ? 'RO' : f[8] === 'Q28' ? 'HU' : f[8] === 'Q219' ? 'BG' : 'DE';
  return QFLAG[f[8]] || '';
 }
 function holder(f, d) {
  if (f[6] === 'n') return ['#9ca3af', 'שטח ניטרלי'];
  const axis = (f[4] === -1 || (f[4] > 0 && d >= f[4])) && !(f[5] > 0 && d >= f[5]);
  if (axis) return f[6] === 'v' ? ['#9a3412', 'בידי וישי / הציר'] : ['#b91c1c', 'בידי הציר'];
  return f[6] === 's' ? ['#1e40af', 'בידי ברית המועצות'] : ['#1d4ed8', 'בידי בעלות הברית'];
 }
 function drawFields(d) {
  fieldLayer.clearLayers(); if (!fields || !fieldsOn) return;
  const z = map.getZoom(), b = map.getBounds();
  // the island war is fought over single airfields: show them from zoom 5 there; elsewhere (hundreds of RAF stations) from zoom 7
  const c = b.getCenter(), isl = (c.lng > 110 || c.lng < -150) && c.lat > -25 && c.lat < 30;
  if (z < (isl ? 5 : 7)) return;
  let k = 0;
  for (const f of fields) {
   if (!b.contains([f[2], f[1]]) && !b.contains([f[2], f[1] - 360])) continue;
   if (f[3] && f[3] > d) continue;                     // not built / not in use yet
   if (++k > 260) break;
   const [col, st] = holder(f, d);
   const who = f[6] === 'v' ? 'בידי וישי / הציר' : 'בידי הציר';
   const span = f[4] ? (f[4] === -1 ? `${who} מלפני המלחמה` : `${who} מ־${heDate(f[4])}`) + (f[5] > 0 && f[5] < 99999 ? ` עד ${heDate(f[5])}` : '') : 'לא היה בידי הציר';
   L.marker([f[2], f[1]], { pane: 'ww2AirMk', icon: L.divIcon({ className: '', iconSize: [21, 16], iconAnchor: [10.5, 8], html: (() => { const hf = window.WW2Flags && holderFlag(f, d); return hf ? `<div class="ww2AirFlag" style="border-color:${col}">${WW2Flags.chip(hf)}<i>✈</i></div>` : `<div class="ww2AirField" style="background:${col}">✈</div>`; })() }), zIndexOffset: -200 })
    .bindTooltip(`${esc(f[0])} — ${st}`, { direction: 'top', offset: [0, -8] })
    .bindPopup(`<b>✈ ${esc(f[0])}</b><br>ביום ${heDate(d)}: ${st}<br>היסטוריה: ${span}` + (f[3] ? `<br>בשימוש מ־${heDate(f[3])}` : '') +
     `<br>מקור: ${f[7] ? 'רשימה ידנית (מיקום בקירוב)' : 'ויקיפדיה/ויקינתונים'}`).addTo(fieldLayer);
  }
 }

 let lastDay = -1;
 function refresh(force) {
  const d = day0();
  if (d !== lastDay || force) { lastDay = d; drawBases(d); drawFields(d); }
  air.draw();
 }
 map.on('moveend zoomend', () => { drawBases(day0()); drawFields(day0()); });
 const prev = tick; tick = function (d) { prev(d); try { refresh(); } catch (e) {} };

 const css = document.createElement('style');
 css.textContent = '.ww2AirFlag{position:relative;width:21px;height:15px;border-bottom:2.5px solid;border-radius:2px}.ww2AirFlag .ww2-fchip{width:21px;height:13px}.ww2AirFlag .ww2-fchip .ww2-unit-flag{transform:scale(.62)}' +
  '.ww2AirFlag i{position:absolute;right:-7px;bottom:-7px;font:normal 9px/12px system-ui;width:12px;height:12px;border-radius:50%;background:#0f1d33;color:#fff;text-align:center}' +
  '.ww2AirBase{position:relative;width:20px;height:20px;border-radius:50%;background:#0f1d33;border:2px solid;color:#fff;font-size:12px;line-height:16px;text-align:center;box-shadow:0 1px 5px #0008;box-sizing:border-box}' +
  '.ww2AirField{width:15px;height:15px;border-radius:4px;border:1.5px solid #fff;color:#fff;font-size:9.5px;line-height:12px;text-align:center;box-shadow:0 1px 4px #0006;box-sizing:border-box}';
 document.head.appendChild(css);
 function setFly(v) { flyOn = v; if (v) { air.addTo(map); baseLayer.addTo(map); } else { map.removeLayer(air); map.removeLayer(baseLayer); } refresh(true); }
 function setFields(v) { fieldsOn = v; if (v) fieldLayer.addTo(map); else map.removeLayer(fieldLayer); refresh(true); }
 const box = document.getElementById('ww2Enrich');
 if (box) {
  const l1 = document.createElement('label'); l1.style.display = 'block';
  l1.innerHTML = '<input type="checkbox" checked> ✈ תנועת מטוסים — הפצצות בעלות הברית, יום אחר יום';
  const l2 = document.createElement('label'); l2.style.display = 'block';
  l2.innerHTML = '<input type="checkbox" checked> 🛫 שדות תעופה לפי מי שהחזיק בהם';
  const n = document.createElement('div'); n.style.cssText = 'font-size:10px;color:#786a55;line-height:1.35';
  n.innerHTML = '<span style="color:#d97706">■</span> ארה״ב · <span style="color:#9333ea">■</span> בריטניה · <span style="color:#059669">■</span> אוסטרליה/ניו זילנד — כל מטוס בזרם מייצג חלק מהגיחות; קו מלא = היום, מקווקו = אתמול. ' +
   'שדה המוצא משוער (THOR נותן יעד ותאריך, לא בסיס). שדות: <span style="color:#b91c1c">■</span> ציר · <span style="color:#1d4ed8">■</span> בעלות הברית · <span style="color:#6b7280">■</span> ניטרלי.';
  box.append(l1, l2, n);
  l1.querySelector('input').onchange = e => setFly(e.target.checked);
  l2.querySelector('input').onchange = e => setFields(e.target.checked);
 }
 setFly(true); setFields(true);
 window.WW2Air = { setFly, setFields, refresh, get fields() { return fields; }, get flights() { return flights; } };
})();
