/* Navy theme (2026-09-27) — the whole interface in the palette of the shipping-lines page
   (ww2_shipping_lines.html): panels, menus, timeline, legend, controls, popups, cards and every inner component.
   Two layers:
   1. explicit styles for the known components (below, CSS);
   2. a pass over every interface element that overlays create — including inline colours and elements added later
      (a popup when it opens, a card, a panel section): pale/cream backgrounds become navy, dark text becomes light
      (hue kept, so a red warning stays red — just readable), pale borders become navy lines.
   Map data keeps its own colours: markers, flags, front/territory colours and labels drawn on the map are not touched. */
(() => {
 'use strict';
 const P = { bg: '#0b1626', panel: '#12213a', panel2: '#162947', line: '#23406a', line2: '#1d3557', tx: '#e8eef6', mut: '#93a9c4',
  dim: '#6f86a3', acc: '#3b82f6', acc2: '#60a5fa', inp: '#0e1b2f', chip: '#1c3a66', chipB: '#2c5a96' };
 const UI = ['.panel', '#mapTools', '#mapToolsMenu', '#clean', '#timebar', '.leaflet-control', '.leaflet-popup', '#ww2Enrich',
  '#ww2ShipPanel', '#live-scene', '#militaryPanel', '#terrainPanel'];
 const S = UI.join(',');
 const css = `
 :root{--ink:${P.tx};--ink-soft:${P.mut};--paper:${P.panel};--line:${P.line};
  --e1:0 1px 4px rgba(0,0,0,.35);--e2:0 8px 26px rgba(0,0,0,.45);
  --nv-bg:${P.bg};--nv-panel:${P.panel};--nv-panel2:${P.panel2};--nv-line:${P.line};--nv-tx:${P.tx};--nv-mut:${P.mut};--nv-acc:${P.acc};--nv-acc2:${P.acc2}}
 html,body{color:${P.tx}}
 /* surfaces */
 .panel,#mapTools,#mapToolsMenu,#clean,.leaflet-bar,.leaflet-control-layers,.leaflet-control-attribution,
 .ww2Terrain,.ww2ShipBtn,.ww2PacViewBtn,.ww2DemInfo,#ww2Enrich,#ww2ShipPanel,#live-scene,#militaryPanel{
  background:rgba(18,33,58,.95)!important;color:${P.tx}!important;border-color:${P.line}!important;
  box-shadow:0 6px 22px rgba(0,0,0,.4)!important;color-scheme:dark}
 .panel,#mapToolsMenu,#ww2ShipPanel,#live-scene,#militaryPanel,#ww2Enrich{border-radius:14px!important}
 .ww2ShipBtn,.ww2PacViewBtn{color:${P.tx}!important}
 .ww2ShipBtn:hover,.ww2PacViewBtn:hover,#clean:hover{background:${P.chip}!important;border-color:${P.acc2}!important;color:#fff!important}
 .leaflet-bar a,.leaflet-bar a:hover{background:${P.panel}!important;color:${P.tx}!important;border-color:${P.line}!important}
 .leaflet-bar a:hover{background:${P.chip}!important}
 .leaflet-control-attribution,.leaflet-control-attribution a{color:${P.dim}!important}
 .leaflet-control-attribution{background:rgba(11,22,38,.8)!important;box-shadow:none!important}
 /* text */
 #hdr p,#seasonLbl,#years u,#legend .grpH,#feed h2,.fold,#qres small{color:${P.mut}!important}
 #legend .grpH:hover,.fold:hover{color:${P.tx}!important}
 #legend .row:hover,#qres div:hover,#qres div.sel{background:rgba(59,130,246,.16)!important}
 #legend .grp+.grp,#legend hr{border-color:${P.line2}!important}
 #tempo{color:#f2d27a!important}
 /* buttons */
 #views button,#play,#speed,#mapToolsMenu button,.ww2Terrain .seg button{
  background:#1b3357!important;border:1px solid ${P.line}!important;color:${P.tx}!important}
 #mapToolsMenu button{background:transparent!important;border-color:transparent!important}
 #views button:hover,#play:hover,#mapToolsMenu button:hover,.ww2Terrain .seg button:hover{background:${P.chip}!important;border-color:${P.acc2}!important;color:#fff!important}
 #views button.on,.ww2Terrain .seg button.on,:is(${S}) button.on,:is(${S}) button[aria-pressed=true]{
  background:${P.acc}!important;border-color:${P.acc}!important;color:#fff!important}
 :is(${S}) button:not(.on):not([aria-pressed=true]):hover{background-color:rgba(59,130,246,.2)!important}
 .nv-btn{background:#1b3357!important;border-color:${P.line}!important;color:${P.tx}!important}
 .nv-btn-flat{color:${P.tx}!important;border-color:${P.line}!important}
 .nv-btn:hover,.nv-btn-flat:hover{border-color:${P.acc2}!important}
 /* inputs */
 :is(${S}) :is(input[type=text],input[type=search],input[type=number],input[type=date],input:not([type]),select,textarea),#search input{
  background:${P.inp}!important;color:${P.tx}!important;border:1px solid ${P.line}!important;color-scheme:dark}
 #search input:focus{box-shadow:0 0 0 3px rgba(59,130,246,.3)!important;border-color:${P.acc}!important}
 :is(${S}) :is(input[type=checkbox],input[type=radio],input[type=range]),#timebar input[type=range]{accent-color:${P.acc}}
 :is(${S}) ::placeholder{color:${P.dim}!important}
 :is(${S}) a:not(.leaflet-popup-close-button){color:${P.acc2}}
 /* events feed */
 #feed .ev{background:${P.panel2}!important;border-color:${P.line2}!important;color:${P.tx}!important}
 #feed .ev:hover{background:#1b3357!important;border-color:${P.acc}!important}
 /* timeline */
 #ticks b{background:rgba(18,33,58,.9)!important;color:${P.mut}!important}
 #ticks i{background:rgba(147,169,196,.5)}
 #years s{background:${P.line}!important}
 #timebar input[type=range]::-webkit-slider-runnable-track{background:linear-gradient(90deg,${P.acc} 0%,${P.acc} var(--pp,50%),rgba(147,169,196,.28) var(--pp,50%))!important}
 #timebar input[type=range]::-webkit-slider-thumb{background:${P.tx}!important;border-color:${P.acc}!important}
 /* popups & ordinary tooltips (map labels keep their own look) */
 .leaflet-popup-content-wrapper,.leaflet-popup-tip,.leaflet-popup.ww2-card .leaflet-popup-content-wrapper{
  background:${P.panel}!important;color:${P.tx}!important;border:1px solid ${P.line};box-shadow:0 10px 30px rgba(0,0,0,.5)!important}
 .leaflet-popup-content{color:${P.tx}}
 .leaflet-container a.leaflet-popup-close-button{color:${P.mut}!important}
 .leaflet-container a.leaflet-popup-close-button:hover{color:#fff!important;background:transparent!important}
 .leaflet-tooltip.nv-tip{background:${P.panel}!important;color:${P.tx}!important;border-color:${P.line}!important;box-shadow:0 4px 14px rgba(0,0,0,.45)!important}
 .leaflet-tooltip-top.nv-tip:before{border-top-color:${P.panel}!important}
 .leaflet-tooltip-bottom.nv-tip:before{border-bottom-color:${P.panel}!important}
 .leaflet-tooltip-left.nv-tip:before{border-left-color:${P.panel}!important}
 .leaflet-tooltip-right.nv-tip:before{border-right-color:${P.panel}!important}
 /* scrollbars inside the interface */
 :is(${S}) *{scrollbar-color:${P.line} transparent}
 `;
 const style = document.createElement('style'); style.id = 'ww2-theme-navy'; style.textContent = css;
 const keepLast = () => { if (document.head.lastElementChild !== style) document.head.appendChild(style); };
 keepLast();
 new MutationObserver(keepLast).observe(document.head, { childList: true });   // overlays inject styles later

 // ── the pass: convert what the explicit styles don't know about ──
 const parse = c => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
 const hsl = ({ r, g, b }) => {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
   h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return { h, s, l };
 };
 // data swatches and symbols keep their colours
 const SKIP = '.dot,.sq,.rl,.tag,.ww2-fchip,.ec-flag,.ww2-unit-flag,.ww2-fstack,.ec-badge,.badge,img,svg,canvas,.leaflet-marker-icon,.ww2Bat,[class*="flag"],[class*="swatch"],[class*="chipcol"]';
 const done = new WeakSet();
 function fix(el) {
  if (done.has(el) || el.nodeType !== 1) return; done.add(el);
  if (el.closest(SKIP)) return;
  const cs = getComputedStyle(el);
  if (el.tagName === 'BUTTON') {                               // buttons: a class, so pressed/active styles still win
   const b = parse(cs.backgroundColor), q = b && b.a > .25 && hsl(b);
   if (!b || b.a <= .25 || q.l > .8) el.classList.add(b && b.a > .25 ? 'nv-btn' : 'nv-btn-flat');   // pale (even a warm cream, which HSL calls saturated)
   return;
  }
  const bg = parse(cs.backgroundColor);
  if (bg && bg.a > .25) {
   const q = hsl(bg);
   if (q.l > .82 && q.s < .55) el.style.setProperty('background-color', el.matches('input,select,textarea') ? P.inp : 'rgba(22,41,71,' + Math.min(.95, bg.a).toFixed(2) + ')', 'important');
   else if (q.l > .8) el.style.setProperty('background-color', `hsla(${q.h|0},45%,24%,${Math.min(.9, bg.a).toFixed(2)})`, 'important');  // pale tint → deep tint of the same hue
  }
  if (cs.backgroundImage && /gradient/.test(cs.backgroundImage) && /rgb\(2[3-5]\d, 2[3-5]\d, 2[2-5]\d\)|#f[0-9a-f]{5}|white/.test(cs.backgroundImage)) el.style.setProperty('background-image', 'none', 'important');
  const tx = parse(cs.color);
  if (tx && el.childNodes.length) {
   const q = hsl(tx);
   if (q.l < .5) el.style.setProperty('color', q.s < .25 ? (q.l < .3 ? P.tx : P.mut) : `hsl(${q.h|0},${Math.round(Math.min(90, q.s * 100))}%,72%)`, 'important');
  }
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
   const w = parseFloat(cs['border' + side + 'Width']); if (!w) continue;
   const bc = parse(cs['border' + side + 'Color']); if (!bc || bc.a < .2) continue;
   const q = hsl(bc); if (q.l > .7 && q.s < .45) el.style.setProperty('border-' + side.toLowerCase() + '-color', P.line, 'important');
  }
 }
 function fixTree(root) { if (!root || root.nodeType !== 1) return; fix(root); for (const el of root.querySelectorAll('*')) fix(el); }
 function isUI(el) { return el.closest && (el.closest(S) || el.classList.contains('leaflet-tooltip')); }
 function fixTooltip(t) {
  // a hover tooltip with a pale box → navy; labels drawn on the map (transparent, or coloured badges) stay as they are
  const bg = parse(getComputedStyle(t).backgroundColor); if (!bg || bg.a < .5) return;
  const q = hsl(bg); if (q.l > .82 && q.s < .5) { t.classList.add('nv-tip'); for (const el of t.querySelectorAll('*')) fix(el); }
 }
 let queue = new Set(), raf = 0;
 const run = () => { raf = 0; const q = queue; queue = new Set();
  for (const el of q) { if (!el.isConnected) continue; if (el.classList && el.classList.contains('leaflet-tooltip')) fixTooltip(el); else fixTree(el); } };
 const enqueue = el => { queue.add(el); if (!raf) raf = requestAnimationFrame(run); };
 new MutationObserver(ms => {
  for (const m of ms) for (const n of m.addedNodes) {
   if (n.nodeType !== 1) continue;
   if (n.classList.contains('leaflet-tooltip')) { enqueue(n); continue; }
   const ui = isUI(n) ? (n.closest('.leaflet-tooltip') || n) : null;
   if (ui) enqueue(ui.classList.contains('leaflet-tooltip') ? ui : n);
   else if (n.querySelector) for (const u of n.querySelectorAll(S)) enqueue(u);
  }
 }).observe(document.body, { childList: true, subtree: true });
 const initial = () => { for (const u of document.querySelectorAll(S)) enqueue(u); };
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initial); else initial();
 setTimeout(initial, 1500);                                     // panels built by late overlays
})();
