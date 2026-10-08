/* Symbols (2026-09-25): national flags on every entity, clearer battles, darker bombing.
   ── Flags ──
   Units at every zoom (also the zoomed-out unit summaries), ships that sank, factories, airfields, air bases and
   islands carry the flag of the nation they belonged to instead of a bare colour.
   The 18 main flags reuse the drawing of ww2_military_overlay.js (.ww2-unit-flag.f-XX) so a flag looks the same
   everywhere; the others are added here. Additive: nothing is removed from the existing markers. */
(() => {
 'use strict';
 if (!window.L || typeof map === 'undefined') return;

 // ── names → flag code ──
 const EN = [
  [/kriegsmarine|nazi germany|luftwaffe|wehrmacht|deutsch|^germany|austria/i, 'DE'], [/soviet|ussr|estonian ssr/i, 'SU'],
  [/united states|^usa?$|u\.s\./i, 'US'], [/united kingdom|great britain|^uk$|^britain|royal navy|trinity house|british india|british raj|^india/i, 'UK'],
  [/japan/i, 'JP'], [/manchukuo/i, 'MN'], [/free fren|free france/i, 'FF'], [/vichy|^france|french|^fra$/i, 'FR'],
  [/italian social|marina nazionale|italy/i, 'IT'], [/poland|polish/i, 'PL'], [/finland/i, 'FI'], [/republic of china|^china/i, 'CN'],
  [/australia/i, 'AU'], [/canada/i, 'CA'], [/new zealand/i, 'NZ'], [/romania/i, 'RO'], [/hungary/i, 'HU'], [/greece/i, 'GR'],
  [/bulgaria/i, 'BG'], [/yugoslav/i, 'YU'], [/netherlands|dutch/i, 'NL'], [/belgium/i, 'BE'], [/norway/i, 'NO'], [/south africa/i, 'ZA'],
  [/slovakia/i, 'SK'], [/czech/i, 'CZ'], [/denmark|faroe|greenland/i, 'DK'], [/sweden|^swe$/i, 'SE'], [/panama/i, 'PA'], [/brazil/i, 'BR'],
  [/egypt/i, 'EG'], [/spain/i, 'ES'], [/portugal/i, 'PT'], [/turkey/i, 'TR'], [/estonia/i, 'EE'], [/latvia/i, 'LV'], [/lithuania/i, 'LT'],
  [/ireland/i, 'IE'], [/mexico/i, 'MX'], [/thailand/i, 'TH'], [/philippine/i, 'PH'], [/croatia/i, 'HR'], [/honduras/i, 'HN'], [/cuba/i, 'CU']];
 const HE = { 'גרמניה': 'DE', 'ברית המועצות': 'SU', 'בריה״מ': 'SU', 'ארצות הברית': 'US', 'ארה״ב': 'US', 'בריטניה': 'UK', 'יפן': 'JP', 'צרפת': 'FR',
  'איטליה': 'IT', 'פינלנד': 'FI', 'פולין': 'PL', 'אוסטרליה': 'AU', 'ניו זילנד': 'NZ', 'יוון': 'GR', 'סין': 'CN', 'קנדה': 'CA', 'רומניה': 'RO',
  'הונגריה': 'HU', 'בולגריה': 'BG', 'יוגוסלביה': 'YU', 'סלובקיה': 'SK', 'הולנד': 'NL', 'בלגיה': 'BE', 'נורווגיה': 'NO', 'דרום אפריקה': 'ZA',
  "ד׳ אפריקה": 'ZA', 'הודו': 'UK', 'דנמרק': 'DK', 'שוודיה': 'SE', 'תאילנד': 'TH', 'צ׳כוסלובקיה': 'CZ', 'מצרים': 'EG', 'ברזיל': 'BR' };
 const code = s => {
  if (!s) return '';
  s = String(s).replace(/^\d+px\s*\|?\s*/, '').trim();
  if (/^[A-Z]{2}$/.test(s)) return s === 'GB' ? 'UK' : s;
  if (HE[s]) return HE[s];
  for (const k of Object.keys(HE)) if (s.startsWith(k)) return HE[k];
  if (/\bor\b|unknown|unidentified/i.test(s)) return '';
  for (const [rx, c] of EN) if (rx.test(s)) return c;
  return '';
 };
 const NAME = { DE: 'גרמניה', SU: 'ברית המועצות', US: 'ארה״ב', UK: 'בריטניה', JP: 'יפן', FR: 'צרפת', FF: 'צרפת החופשית', IT: 'איטליה',
  PL: 'פולין', FI: 'פינלנד', CN: 'סין', AU: 'אוסטרליה', CA: 'קנדה', NZ: 'ניו זילנד', RO: 'רומניה', HU: 'הונגריה', GR: 'יוון', BG: 'בולגריה',
  YU: 'יוגוסלביה', NL: 'הולנד', BE: 'בלגיה', NO: 'נורווגיה', ZA: 'דרום אפריקה', SK: 'סלובקיה', CZ: 'צ׳כוסלובקיה', DK: 'דנמרק', SE: 'שוודיה',
  PA: 'פנמה', BR: 'ברזיל', EG: 'מצרים', ES: 'ספרד', PT: 'פורטוגל', TR: 'טורקיה', EE: 'אסטוניה', LV: 'לטביה', LT: 'ליטא', IE: 'אירלנד',
  MX: 'מקסיקו', TH: 'תאילנד', PH: 'הפיליפינים', MN: 'מנצ׳וקואו', HR: 'קרואטיה', HN: 'הונדורס', CU: 'קובה' };
 const chip = (c, big) => c ? `<span class="ww2-fchip${big ? ' big' : ''}" title="${NAME[c] || c}"><span class="ww2-unit-flag f-${c}"></span></span>` : '';

 // flags that ww2_military_overlay.js does not draw (it draws DE SU US UK JP IT FR PL FI CN AU CA NZ RO HU GR BG YU)
 const css = document.createElement('style');
 const f = (c, bg, extra) => `.ww2-unit-flag.f-${c}{background:${bg};color:transparent;font-size:0}` + (extra || '');
 css.textContent =
  '.ww2-fchip{position:relative;display:inline-block;width:19px;height:12.5px;overflow:hidden;border-radius:2px;box-shadow:0 0 0 1px #fff,0 1px 3px #0008;vertical-align:middle;flex:0 0 auto}' +
  '.ww2-fchip.big{width:24px;height:16px}' +
  '.ww2-fchip .ww2-unit-flag{position:absolute!important;left:0!important;top:0!important;width:34px!important;height:22px!important;border:0!important;' +
  'margin:0!important;transform:scale(.56);transform-origin:0 0;box-shadow:none!important;border-radius:0!important}' +
  '.ww2-fchip.big .ww2-unit-flag{transform:scale(.71)}' +
  '.ww2-fchip-abs{position:absolute;left:-7px;top:-7px;z-index:3}' +
  '.ww2-fstack{position:absolute;left:-8px;top:-9px;z-index:3;display:flex;gap:0}.ww2-fstack .ww2-fchip+.ww2-fchip{margin-left:-6px}' +
  '.ww2-fchip-mk{pointer-events:none}' +
  f('NL', 'linear-gradient(#ae1c28 0 33%,#fff 33% 66%,#21468b 66%)') +
  f('BE', 'linear-gradient(90deg,#111 0 33%,#fdda24 33% 66%,#ef3340 66%)') +
  f('NO', 'linear-gradient(90deg,transparent 0 28%,#fff 28% 31%,#00205b 31% 41%,#fff 41% 44%,transparent 44%),linear-gradient(transparent 0 36%,#fff 36% 41%,#00205b 41% 59%,#fff 59% 64%,transparent 64%),#ba0c2f') +
  f('DK', 'linear-gradient(90deg,transparent 0 30%,#fff 30% 42%,transparent 42%),linear-gradient(transparent 0 42%,#fff 42% 58%,transparent 58%),#c8102e') +
  f('SE', 'linear-gradient(90deg,transparent 0 30%,#fecc02 30% 42%,transparent 42%),linear-gradient(transparent 0 40%,#fecc02 40% 60%,transparent 60%),#006aa7') +
  f('ZA', 'linear-gradient(#e87722 0 33%,#fff 33% 66%,#0b3d91 66%)') +
  f('SK', 'linear-gradient(#fff 0 33%,#0b4ea2 33% 66%,#ee1c25 66%)') +
  f('CZ', 'linear-gradient(to right bottom,#11457e 0 50%,transparent 50%) left top/50% 50% no-repeat,linear-gradient(to right top,#11457e 0 50%,transparent 50%) left bottom/50% 50% no-repeat,linear-gradient(#fff 0 50%,#d7141a 50%)') +
  f('PA', 'linear-gradient(90deg,#fff 0 50%,#d21034 50%) top/100% 50% no-repeat,linear-gradient(90deg,#005293 0 50%,#fff 50%) bottom/100% 50% no-repeat') +
  f('BR', 'radial-gradient(circle,#002776 0 18%,transparent 19%),conic-gradient(from 45deg,#fedf00 0 25%,#fedf00 0 50%,#fedf00 0 75%,#fedf00 0) center/60% 70% no-repeat,#009c3b') +
  f('EG', '#1a7a3a', '.ww2-unit-flag.f-EG:after{content:"☪";position:absolute;left:10px;top:1px;color:#fff;font:14px/20px serif}') +
  f('TR', '#e30a17', '.ww2-unit-flag.f-TR:after{content:"☪";position:absolute;left:9px;top:1px;color:#fff;font:14px/20px serif}') +
  f('ES', 'linear-gradient(#c60b1e 0 25%,#ffc400 25% 75%,#c60b1e 75%)') +
  f('PT', 'linear-gradient(90deg,#046a38 0 40%,#da291c 40%)') +
  f('EE', 'linear-gradient(#0072ce 0 33%,#111 33% 66%,#fff 66%)') +
  f('LV', 'linear-gradient(#9e3039 0 40%,#fff 40% 60%,#9e3039 60%)') +
  f('LT', 'linear-gradient(#fdb913 0 33%,#006a44 33% 66%,#c1272d 66%)') +
  f('IE', 'linear-gradient(90deg,#169b62 0 33%,#fff 33% 66%,#ff883e 66%)') +
  f('MX', 'linear-gradient(90deg,#006847 0 33%,#fff 33% 66%,#ce1126 66%)') +
  f('TH', 'linear-gradient(#a51931 0 17%,#f4f5f8 17% 33%,#2d2a4a 33% 67%,#f4f5f8 67% 83%,#a51931 83%)') +
  f('PH', 'linear-gradient(to right bottom,#fff 0 50%,transparent 50%) left top/45% 50% no-repeat,linear-gradient(to right top,#fff 0 50%,transparent 50%) left bottom/45% 50% no-repeat,linear-gradient(#0038a8 0 50%,#ce1126 50%)') +
  f('MN', 'linear-gradient(#be1e2d 0 25%,#1e3f8f 25% 50%,#fff 50% 75%,#111 75%) left top/40% 40% no-repeat,#f2c200') +
  f('HR', 'linear-gradient(#e2231a 0 33%,#fff 33% 66%,#171796 66%)') +
  f('HN', 'linear-gradient(#0073cf 0 33%,#fff 33% 66%,#0073cf 66%)') +
  f('CU', 'linear-gradient(to right bottom,#cf142b 0 50%,transparent 50%) left top/42% 50% no-repeat,linear-gradient(to right top,#cf142b 0 50%,transparent 50%) left bottom/42% 50% no-repeat,repeating-linear-gradient(#002a8f 0 20%,#fff 20% 40%)') +
  f('FF', 'linear-gradient(90deg,#315c8d 0 33%,#f4f0e7 33% 66%,#b83b45 66%)', '.ww2-unit-flag.f-FF:after{content:"☨";position:absolute;left:12px;top:0;color:#b83b45;font:700 15px/22px serif}');
 document.head.appendChild(css);

 // ── the zoomed-out unit summaries and grey fallback flags of ww2_military_overlay.js ──
 const rowValue = (content, label) => {
  if (!content) return '';
  const el = typeof content === 'string' ? Object.assign(document.createElement('div'), { innerHTML: content }) : content;
  for (const row of el.querySelectorAll ? el.querySelectorAll('div') : []) {
   const b = row.querySelector('b'); if (b && b.textContent.trim() === label) return row.textContent.slice(b.textContent.length).trim();
  }
  return '';
 };
 function flagUnitIcon(layer) {
  const icon = layer._icon; if (!icon) return;
  const ov = icon.querySelector('.ww2-unit-overview');
  if (ov && !ov.querySelector('.ww2-fchip')) {
   const p = layer.getPopup && layer.getPopup(), content = p && p.getContent();
   // one nation ("מדינה") or the nations of a battle group ("מדינות: גרמניה · איטליה") — up to three flags, fanned
   const list = (rowValue(content, 'מדינה') || rowValue(content, 'מדינות')).split(/\s*·\s*/);
   const codes = [...new Set(list.map(code).filter(Boolean))].slice(0, 3);
   if (codes.length) ov.insertAdjacentHTML('afterbegin', `<span class="ww2-fstack">${codes.map(c => chip(c, codes.length === 1)).join('')}</span>`);
  }
  for (const fl of icon.querySelectorAll('.ww2-unit-flag:not([class*=" f-"])')) {
   const c = code(fl.getAttribute('title')) || code(fl.textContent.trim());
   if (c) { fl.classList.add('f-' + c); fl.textContent = ''; }
  }
 }

 // ── factories (plant markers are titled with the plant name) ──
 const plantByName = new Map(); try { for (const p of (D.plants || [])) plantByName.set(p.n, p); } catch (e) {}
 function flagPlant(layer) {
  const icon = layer._icon; if (!icon || icon.querySelector('.ww2-fchip')) return;
  let c = '';
  if (icon.classList.contains('ww2-factory-emoji')) { const p = plantByName.get(layer.options.title); c = p ? code(p.c) : ''; }
  else if (icon.classList.contains('ww2-factory-group')) { const t = layer.options.title || ''; c = t.startsWith('יפן') ? 'JP' : t.startsWith('ברית המועצות') ? 'SU' : ''; }
  if (!c) return;
  const host = icon.firstElementChild || icon; host.style.position = host.style.position || 'relative';
  host.insertAdjacentHTML('beforeend', chip(c).replace('class="ww2-fchip"', 'class="ww2-fchip ww2-fchip-abs"'));
 }

 // ── ships that sank: a small flag beside the loss marker ──
 let shipFlags = null;
 fetch('./cards/sinkings.json').then(r => r.ok ? r.json() : {}).then(j => { shipFlags = j; }).catch(() => { shipFlags = {}; });
 const sinkAt = new Map();
 const sinkIndex = () => { if (sinkAt.size) return; try { for (const k of (D.sea && D.sea.sink) || []) sinkAt.set(k.y.toFixed(3) + ',' + k.x.toFixed(3), k); } catch (e) {} };
 const shipPane = map.getPane('ww2FlagPane') || map.createPane('ww2FlagPane'); shipPane.style.zIndex = 615; shipPane.style.pointerEvents = 'none';
 function flagSink(layer) {
  if (!shipFlags || map.getZoom() < 5 || !layer.getLatLng) return;
  sinkIndex();
  const ll = layer.getLatLng(), k = sinkAt.get(ll.lat.toFixed(3) + ',' + ll.lng.toFixed(3)); if (!k) return;
  const det = shipFlags[`${(k.n || '').toLowerCase()}|${k.d}`]; const c = det && code(det.flag); if (!c) return;
  const key = k.y.toFixed(3) + ',' + k.x.toFixed(3) + '|' + k.d;
  let f = sinkFlags.get(key);
  if (!f) {
   const r = (layer.options.radius || 5) + 2;
   f = { mk: L.marker(ll, { pane: 'ww2FlagPane', interactive: false, keyboard: false,
    icon: L.divIcon({ className: 'ww2-fchip-mk', html: chip(c), iconSize: [19, 13], iconAnchor: [-r + 2, r + 12] }) }), refs: 0 };
   sinkFlags.set(key, f);
  }
  f.refs++; if (!f.mk._map) f.mk.addTo(map);
  layer._ww2FlagKey = key;
 }
 // the loss circles are redrawn every day (they fade); their flags are not — a flag leaves only when no circle claims it
 const sinkFlags = new Map();
 function releaseSinkFlag(key) {
  const f = sinkFlags.get(key); if (!f) return; f.refs--;
  Promise.resolve().then(() => { if (f.refs <= 0 && f.mk._map) map.removeLayer(f.mk); });
 }
 let sinkGroup = null; try { sinkGroup = sinkFx; } catch (e) {}

 map.on('layeradd', e => {
  const l = e.layer;
  try {
   if (l._icon) { flagUnitIcon(l); flagPlant(l); }
   else if (sinkGroup && sinkGroup.hasLayer(l) && l instanceof L.CircleMarker) flagSink(l);
  } catch (err) {}
 });
 map.on('layerremove', e => { const l = e.layer; if (l && l._ww2FlagKey) { releaseSinkFlag(l._ww2FlagKey); l._ww2FlagKey = null; } });
 // markers already on the map when this script ran
 map.eachLayer(l => { try { if (l._icon) { flagUnitIcon(l); flagPlant(l); } } catch (err) {} });

 window.WW2Flags = { code, chip, NAME };

 // ── battles: an active battle gets a bright ⚔ badge with a pulsing ring, so it reads as "fighting here now" ──
 const bpane = map.getPane('ww2BattlePane') || map.createPane('ww2BattlePane'); bpane.style.zIndex = 625;
 const bcss = document.createElement('style');
 bcss.textContent = '.ww2Bat{position:relative;width:26px;height:26px;border-radius:50%;background:#e11d2e;border:2px solid #fff;color:#fff;' +
  'display:flex;align-items:center;justify-content:center;font:700 14px/1 system-ui,sans-serif;box-shadow:0 0 0 2px #7f1d1d,0 2px 8px #000a;box-sizing:border-box;cursor:pointer}' +
  '.ww2Bat.big{width:32px;height:32px;font-size:17px}' +
  '.ww2Bat:before{content:"";position:absolute;inset:-7px;border-radius:50%;border:3px solid #ef4444;animation:ww2BatPulse 1.6s ease-out infinite}' +
  '@keyframes ww2BatPulse{0%{transform:scale(.7);opacity:.9}100%{transform:scale(1.5);opacity:0}}' +
  '@media (prefers-reduced-motion:reduce){.ww2Bat:before{animation:none;opacity:.6}}' +
  '.leaflet-tooltip.ww2BatLbl{background:#b91c1c;color:#fff;border:1.5px solid #fff;border-radius:7px;font:800 13px/1.3 system-ui,Heebo,Arial,sans-serif;' +
  'padding:2px 8px;box-shadow:0 2px 6px #000a;direction:rtl;white-space:nowrap;text-shadow:0 1px 1px #0006}' +
  '.leaflet-tooltip.ww2BatLbl:before{border-top-color:#b91c1c}';
 document.head.appendChild(bcss);
 const batFx = L.layerGroup().addTo(map);
 let batOn = true, lastKey = '';
 function drawBattles(day) {
  if (typeof BAT === 'undefined') return;
  const on = batOn && (typeof showBat === 'undefined' || showBat);
  const z = map.getZoom(), b = map.getBounds().pad(.1), key = day + '|' + z + '|' + b.toBBoxString() + on;
  if (key === lastKey) return; lastKey = key;
  const want = new Set();
  if (on) {
   let n = 0;
   for (let i = 0; i < BAT.length; i++) {
    const bt = BAT[i].b; if (bt.f == null || bt.x == null) continue;
    const end = Math.max(bt.e || bt.f, bt.f) + 1;
    if (day < bt.f || day > end || !b.contains([bt.y, bt.x])) continue;
    if (++n > 160) break;
    want.add(i);
   }
  }
  for (const [i, mk] of batMk) if (!want.has(i)) { batFx.removeLayer(mk); batMk.delete(i); }
  for (const i of want) {
   if (batMk.has(i)) continue;
   const o = BAT[i], bt = o.b, big = (bt.cas || 0) >= 10000;
   const mk = L.marker([bt.y, bt.x], { pane: 'ww2BattlePane', title: bt.n, riseOnHover: true,
    icon: L.divIcon({ className: '', iconSize: [big ? 32 : 26, big ? 32 : 26], iconAnchor: [big ? 16 : 13, big ? 16 : 13], html: `<div class="ww2Bat${big ? ' big' : ''}">⚔</div>` }) });
   const pop = o.m && o.m.getPopup && o.m.getPopup();
   if (pop) mk.bindPopup(pop.getContent(), { maxWidth: 400 });
   mk._ww2cas = bt.cas || 0; mk._ww2name = bt.n;
   mk.addTo(batFx); batMk.set(i, mk);
  }
  // a bold name above every active battle; when zoomed out, the largest ones first so labels don't pile up.
  // A label is re-bound only when it switches between permanent and hover, so it doesn't blink every day.
  const ms = [...batMk.values()].sort((a, c) => c._ww2cas - a._ww2cas);
  const cap = z >= 7 ? 160 : z >= 6 ? 60 : z >= 5 ? 30 : z >= 4 ? 16 : 8;
  ms.forEach((mk, i) => {
   const perm = i < cap; if (mk._ww2perm === perm) return; mk._ww2perm = perm;
   mk.unbindTooltip().bindTooltip('⚔ ' + mk._ww2name, { permanent: perm, direction: 'top', offset: [0, -17], className: 'ww2BatLbl' });
  });
 }
 const batMk = new Map();                                      // BAT index → its marker while the battle is shown
 const day0 = () => { const s = document.getElementById('slider'); return s ? +s.value : 0; };
 map.on('moveend zoomend', () => drawBattles(day0()));

 // ── bombing: a dark fire-and-smoke burst instead of the pale mushroom ──
 try {
  if (typeof window.drawBomb === 'function') {
   window.drawBomb = function (ctx, x, y, r, t) {
    ctx.save(); ctx.translate(x, y);
    const a = Math.max(0, Math.min(1, t));
    ctx.fillStyle = `rgba(20,10,8,${.28 * a})`;                        // ground shadow
    ctx.beginPath(); ctx.ellipse(0, r * .35, r * 1.05, r * .32, 0, 0, 6.2832); ctx.fill();
    const g = ctx.createRadialGradient(0, -r * .1, 0, 0, -r * .1, r);
    g.addColorStop(0, `rgba(255,196,64,${.95 * a})`); g.addColorStop(.28, `rgba(220,60,20,${.9 * a})`);
    g.addColorStop(.62, `rgba(120,20,12,${.85 * a})`); g.addColorStop(1, `rgba(28,16,14,${.75 * a})`);
    ctx.fillStyle = g; ctx.beginPath();
    for (let i = 0; i < 16; i++) {                                       // jagged burst
     const ang = i / 16 * 6.2832, rr = r * (i % 2 ? .62 : 1);
     const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr * .9 - r * .1;
     i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(20,8,6,${.8 * a})`; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
   };
  }
 } catch (e) {}

 const prevTick = tick; tick = function (d) { prevTick(d); try { drawBattles(d); } catch (e) {} };
 drawBattles(day0());
 window.WW2Symbols = { drawBattles, setBattles(v) { batOn = v; lastKey = ''; drawBattles(day0()); } };
})();
