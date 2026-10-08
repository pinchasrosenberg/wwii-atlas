/* Stable redraws (2026-09-27). Most overlays redraw by clearLayers() + re-adding every marker, on every day and
   every pan — so battles, bases, units and labels were torn down and rebuilt even when nothing about them changed
   (pulses restarted, icons blinked, labels re-laid out).
   Here a group that is cleared and refilled in the same step keeps each old marker/line whose look is identical
   (position, icon, style, popup, tooltip): the new copy is dropped and the old element stays on the map. Only real
   changes are added or removed. Nothing changes for code that does not use clearLayers(). */
(() => {
 'use strict';
 if (!window.L) return;
 const LG = L.LayerGroup.prototype;
 const r5 = v => Math.round(v * 1e5) / 1e5;
 const contentOf = b => { if (!b) return ''; const c = b._content; return typeof c === 'string' ? c : c && c.outerHTML ? c.outerHTML : typeof c === 'function' ? null : String(c); };
 const llSig = ll => {
  if (!ll) return '';
  if (ll.lat !== undefined) return r5(ll.lat) + ',' + r5(ll.lng);
  if (!Array.isArray(ll)) return '?';
  if (ll.length > 64) {                                        // long lines: length + a sample of points
   const out = [ll.length]; for (let i = 0; i < ll.length; i += Math.ceil(ll.length / 16)) out.push(llSig(ll[i]));
   out.push(llSig(ll[ll.length - 1])); return out.join(';');
  }
  return ll.map(llSig).join(';');
 };
 const STYLE = ['color', 'weight', 'opacity', 'fillColor', 'fillOpacity', 'dashArray', 'className', 'pane', 'fill', 'stroke',
  'lineCap', 'lineJoin', 'interactive', 'smoothFactor', 'noClip', 'zIndexOffset', 'riseOnHover', 'title', 'alt', 'draggable'];
 function sigOf(l) {
  let s;
  if (l instanceof L.Marker) {
   const io = l.options.icon && l.options.icon.options;
   s = 'M|' + llSig(l.getLatLng()) + '|' + (io ? JSON.stringify([io.html && (io.html.outerHTML || io.html), io.className, io.iconSize, io.iconAnchor, io.iconUrl]) : '');
  } else if (l instanceof L.CircleMarker) {
   s = (l instanceof L.Circle ? 'C|' : 'c|') + llSig(l.getLatLng()) + '|' + l.getRadius();
  } else if (l instanceof L.Polyline) {
   s = (l instanceof L.Polygon ? 'G|' : 'L|') + llSig(l.getLatLngs());
  } else return null;                                          // other layer types: never reused
  const o = l.options; for (const k of STYLE) if (o[k] !== undefined) s += '|' + k + '=' + o[k];
  if (o.renderer) s += '|r' + L.stamp(o.renderer);
  const pc = contentOf(l._popup), tc = contentOf(l._tooltip); if (pc === null || tc === null) return null;
  s += '|p' + pc + '|t' + tc + (l._tooltip ? JSON.stringify([l._tooltip.options.permanent, l._tooltip.options.direction, l._tooltip.options.className, l._tooltip.options.offset]) : '');
  return s;
 }
 function flush(g) {
  const pool = g._ww2Pool; if (!pool) return; g._ww2Pool = null;
  for (const list of pool.values()) for (const l of list) if (l._map && !g._layers[L.stamp(l)]) l._map.removeLayer(l);
 }
 const origClear = LG.clearLayers, origAdd = LG.addLayer, origRemove = LG.removeLayer, origHas = LG.hasLayer, origOnRemove = LG.onRemove;
 LG.clearLayers = function () {
  flush(this);
  if (!this._map) return origClear.call(this);                 // off the map: nothing to keep
  const pool = new Map();
  for (const id in this._layers) {
   const l = this._layers[id], s = sigOf(l);
   if (s === null) { this._map.removeLayer(l); continue; }
   let list = pool.get(s); if (!list) pool.set(s, list = []); list.push(l);
  }
  this._layers = {};
  this._ww2Pool = pool;
  Promise.resolve().then(() => flush(this));                   // after the synchronous redraw
  return this;
 };
 LG.addLayer = function (l) {
  const pool = this._ww2Pool;
  if (pool && pool.size && !(L.stamp(l) in this._layers)) {
   const s = sigOf(l), list = s !== null && pool.get(s);
   if (list && list.length) {
    const old = list.pop(); if (!list.length) pool.delete(s);
    if (l._events) old._events = l._events;                   // handlers bound on the new copy apply to the kept one
    l._ww2Alias = old;
    this._layers[L.stamp(old)] = old;
    return this;
   }
  }
  return origAdd.call(this, l);
 };
 LG.removeLayer = function (l) { return origRemove.call(this, (l && l._ww2Alias) || l); };
 LG.hasLayer = function (l) { return origHas.call(this, (l && l._ww2Alias) || l); };
 LG.onRemove = function (map) { flush(this); return origOnRemove.call(this, map); };
})();
