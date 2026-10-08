/* Shipping-lines engine (24.9.2026): one query → one report. Shared by ww2_shipping_lines.html and the map
   overlay (ww2_shipping_overlay.js), so the page and the map always show the same answer.
   Data: shipping/shipping_data.json (tools/build_shipping_lines.py). */
(function () {
 'use strict';
 const EPOCH = Date.UTC(1937, 0, 1), MS = 864e5;
 const toDay = iso => Math.round((Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') - EPOCH) / MS);
 const toIso = d => new Date(EPOCH + d * MS).toISOString().slice(0, 10);
 const heDate = d => new Date(EPOCH + d * MS).toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: 'numeric' });
 const heMonth = d => new Date(EPOCH + d * MS).toLocaleDateString('he-IL', { year: 'numeric', month: 'short' });
 const CAUSE = { torpedo: 'טורפדו', air_attack: 'תקיפה אווירית', aircraft: 'תקיפה אווירית', mine: 'מוקש', gunfire: 'ירי ארטילרי',
  scuttled: 'הוטבעה בידי צוותה', depth_charge: 'פצצות עומק', grounding: 'עלתה על שרטון', collision: 'התנגשות', rammed: 'נגיחה',
  foundered: 'שקעה בסערה', wrecked: 'נטרפה', capsized: 'התהפכה', fire: 'שריפה' };
 let data = null, loading = null;
 const idx = { port: {}, corr: {}, conv: {} };

 function load(base) {
  if (data) return Promise.resolve(data);
  if (loading) return loading;
  loading = fetch((base || './') + 'shipping/shipping_data.json').then(r => { if (!r.ok) throw new Error('shipping_data.json ' + r.status); return r.json(); })
   .then(j => { data = j; for (const p of j.ports) idx.port[p.id] = p; for (const c of j.corridors) { c.path = unwrap(c.path); idx.corr[c.id] = c; } for (const c of j.convoys) idx.conv[c.k] = c; return j; });
  return loading;
 }
 // keep a lane continuous across the antimeridian
 function unwrap(path) {
  const out = []; let prev = null;
  for (const [x0, y] of path) { let x = x0; if (prev !== null) { while (x - prev > 180) x -= 360; while (prev - x > 180) x += 360; } out.push([x, y]); prev = x; }
  return out;
 }
 const powerOf = cc => (data && data.power[cc]) || cc;
 const countryHe = cc => (data && data.countries[cc] && data.countries[cc][0]) || cc || 'לא ידוע';
 const portHe = id => (idx.port[id] && (idx.port[id].he || idx.port[id].n)) || id;
 // colonies=true: a country also stands for its colonies and dependencies (Britain → Gibraltar, Malta, Freetown…)
 function sideSet(side, colonies) {
  const countries = new Set(side && side.countries || []), ports = new Set(side && side.ports || []);
  const has = cc => !!cc && (countries.has(cc) || (colonies && countries.has(powerOf(cc))));
  return { countries, ports, empty: !countries.size && !ports.size,
   port(id) { const p = idx.port[id]; if (!p) return false; if (ports.size) return ports.has(id); return has(p.cc); },
   flag(cc) { return !!cc && (has(cc) || [...ports].some(id => idx.port[id] && (idx.port[id].cc === cc || powerOf(idx.port[id].cc) === cc))); } };
 }
 // distance point → polyline (km), equirectangular locally
 function distKm(x, y, path) {
  let best = 1e9;
  for (let i = 1; i < path.length; i++) {
   let [x1, y1] = path[i - 1], [x2, y2] = path[i];
   let px = x; while (px - x1 > 180) px -= 360; while (x1 - px > 180) px += 360;
   const k = Math.cos(((y1 + y2 + 2 * y) / 4) * Math.PI / 180) * 111.32, ky = 110.57;
   const ax = (x2 - x1) * k, ay = (y2 - y1) * ky, bx = (px - x1) * k, by = (y - y1) * ky;
   const L = ax * ax + ay * ay, t = L ? Math.max(0, Math.min(1, (ax * bx + ay * by) / L)) : 0;
   const dx = bx - t * ax, dy = by - t * ay, d = Math.sqrt(dx * dx + dy * dy);
   if (d < best) best = d;
  }
  return best;
 }
 function nearestVertex(path, p) {
  let bi = 0, bd = 1e18;
  path.forEach(([x, y], i) => { let dx = x - p.x; while (dx > 180) dx -= 360; while (dx < -180) dx += 360; const d = dx * dx + (y - p.y) ** 2; if (d < bd) { bd = d; bi = i; } });
  return bi;
 }
 function subPath(c, i0, i1) {
  const a = nearestVertex(c.path, idx.port[c.ports[i0]]), b = nearestVertex(c.path, idx.port[c.ports[i1]]);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return hi > lo ? c.path.slice(lo, hi + 1) : c.path;
 }

 /* q = { d0:'1942-01-01', d1:'1942-12-31', a:{countries:[], ports:[]}, b:{countries:[], ports:[]},
         both:true, buffer:200, allFlags:false } */
 function run(q) {
  if (!data) throw new Error('load() first');
  const D0 = toDay(q.d0), D1 = toDay(q.d1), A = sideSet(q.a, !!q.colonies), B = sideSet(q.b, !!q.colonies), both = q.both !== false, buf = +q.buffer || 200;
  if (A.empty) throw new Error('בחר לפחות מדינה או נמל אחד בצד הראשון');
  // 1) lanes
  const lanes = [];
  for (const c of data.corridors) {
   if (c.d1 < D0 || c.d0 > D1) continue;
   const ia = [], ib = [];
   c.ports.forEach((p, i) => { if (A.port(p)) ia.push(i); if (!B.empty && B.port(p)) ib.push(i); });
   if (!ia.length) continue;
   let fwd = false, back = false, i0 = null, i1 = null;
   if (B.empty) { fwd = back = true; i0 = 0; i1 = c.ports.length - 1; }
   else {
    for (const i of ia) for (const j of ib) { if (i < j) { fwd = true; if (i0 === null || j - i > i1 - i0) { i0 = i; i1 = j; } } if (j < i) back = true; }
    if (!fwd && back) { for (const i of ia) for (const j of ib) if (j < i && (i0 === null || i - j > i1 - i0)) { i0 = j; i1 = i; } }
   }
   // a lane is drawn whenever it links the two sides; direction is decided per convoy (HG north / OG south share one lane)
   if (!(fwd || back)) continue;
   lanes.push({ c, fwd, back, sub: subPath(c, i0, i1), from: c.ports[i0], to: c.ports[i1] });
  }
  const laneOf = Object.fromEntries(lanes.map(l => [l.c.id, l]));
  // 2) convoys on those lanes, in the chosen direction
  const convoys = data.convoys.filter(v => {
   const l = v.corr && laneOf[v.corr]; if (!l || v.d1 < D0 || v.d0 > D1) return false;
   if (B.empty) return true;
   const aToB = (v.dir >= 0 && l.fwd) || (v.dir < 0 && l.back), bToA = (v.dir >= 0 && l.back) || (v.dir < 0 && l.fwd);
   return aToB || (both && bToA) || (!v.dir && l.c.basis === 'curated');
  });
  const convSet = new Set(convoys.map(v => v.k));
  // 3) cargo
  const vessels = [], commod = {};
  for (const v of convoys) for (const [n, fl, txt, cm] of (data.cargo[v.k] || [])) {
   vessels.push({ convoy: v.n, k: v.k, name: n, flag: fl, cargo: txt, cm }); commod[cm] = (commod[cm] || 0) + 1;
  }
  // 4) losses
  const L = { convoy: [], voyage: [], corridor: [], other: [] }, seen = new Set();
  const anyFlag = cc => A.flag(cc) || (!B.empty && B.flag(cc));
  for (const s of data.sinks) {
   const [d, n, fl, x, y, cause, ck, att, fr, to] = s;
   if (d < D0 || d > D1) continue;
   const rec = { d, n, fl, x, y, cause, ck, att, fr, to, type: s[11] || '', crew: s[12] || null };
   if (ck && convSet.has(ck)) { L.convoy.push({ ...rec, why: 'convoy' }); seen.add(s); continue; }
   if (fr && to && ((A.port(fr) && (B.empty || B.port(to))) || ((both || B.empty) && A.port(to) && (B.empty || B.port(fr))))) { L.voyage.push({ ...rec, why: 'voyage' }); seen.add(s); continue; }
   if (x == null || !lanes.length) continue;
   let near = null, nd = buf;
   for (const l of lanes) { const dd = distKm(x, y, l.sub); if (dd <= nd) { nd = dd; near = l.c.id; } }
   if (!near) continue;
   if (anyFlag(fl) || q.allFlags) L.corridor.push({ ...rec, why: 'corridor', lane: near, km: Math.round(nd) });
   else L.other.push({ ...rec, why: 'other', lane: near, km: Math.round(nd) });
  }
  // 5) months
  const months = {};
  const mk = d => toIso(d).slice(0, 7);
  for (const v of convoys) { const m = mk(Math.max(v.d0, D0)); (months[m] = months[m] || { conv: 0, lost: 0 }).conv++; }
  for (const k of ['convoy', 'voyage', 'corridor']) for (const s of L[k]) { const m = mk(s.d); (months[m] = months[m] || { conv: 0, lost: 0 }).lost++; }
  const own = [...L.convoy, ...L.voyage, ...L.corridor];
  const kpi = {
   lanes: lanes.length, convoys: convoys.length,
   sailed: convoys.reduce((s, v) => s + (v.sailed || 0), 0), sailedKnown: convoys.filter(v => v.sailed).length,
   cargoRows: vessels.length, lost: own.length, lostConvoy: L.convoy.length, crew: own.reduce((s, x) => s + (x.crew || 0), 0),
   other: L.other.length
  };
  const title = q.title || [sideTitle(q.a), B.empty ? '' : (both ? '⇄' : '→'), sideTitle(q.b)].filter(Boolean).join(' ') + ` · ${heDate(D0)} – ${heDate(D1)}`;
  return { q, D0, D1, title, lanes, convoys, vessels, commod, losses: L, months, kpi };
 }
 function sideTitle(s) {
  if (!s) return '';
  if (s.ports && s.ports.length) return s.ports.map(portHe).join(', ');
  return (s.countries || []).map(countryHe).join(', ');
 }
 window.WW2Ship = { load, run, toDay, toIso, heDate, heMonth, CAUSE, countryHe, portHe, sideTitle, get data() { return data; }, idx };
})();
