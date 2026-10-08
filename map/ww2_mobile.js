/* Phone support for the timeline map: popups are sized to the screen (some layers ask for 400–460px) and
   scroll inside instead of running off it. Layout lives in ww2_mobile.css. */
(() => {
 'use strict';
 if (!window.L || typeof map === 'undefined') return;
 const phone = matchMedia('(max-width: 700px)');
 map.on('popupopen', ev => {
  if (!phone.matches) return;
  const p = ev.popup, w = Math.max(200, innerWidth - 64), h = Math.round(innerHeight * .5);
  let changed = false;
  if (!p.options.maxWidth || p.options.maxWidth > w) { p.options.maxWidth = w; changed = true; }
  if (p.options.minWidth > w) { p.options.minWidth = Math.min(200, w); changed = true; }
  if (!p.options.maxHeight || p.options.maxHeight > h) { p.options.maxHeight = h; changed = true; }
  if (changed) p.update();
  document.body.classList.add('ww2Popup');
 });
 map.on('popupclose', () => document.body.classList.remove('ww2Popup'));
 // the address bar showing/hiding changes the height: keep the map filling the screen
 addEventListener('resize', () => map.invalidateSize({ pan: false }));
})();
