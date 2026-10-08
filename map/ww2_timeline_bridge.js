/* Read-only #מפה scenes on the original Leaflet timeline. No remote code or HTML. */
(function () {
  'use strict';

  // Live #map scenes are driven from a chat extension through a bridge on the author's own machine.
  // The public site has no such bridge, so the panel is not created at all.
  const BRIDGE = '';
  if (!BRIDGE) return;
  const SCENE_ID = /^scn_[a-z0-9]{4,32}$/i;
  const MAX_SCENES = 6;
  const MAX_FEATURES = 4000;
  const COLORS = {axis: '#a65a31', allies: '#2b6ca3', neutral: '#9a8d75', unknown: '#745c86'};
  const QUALITY = {explicit: 'מתועד', derived: 'נגזר', estimated: 'הערכה', context: 'הקשר', unknown: 'לא ידוע'};

  function validSceneId(value) { return typeof value === 'string' && SCENE_ID.test(value); }
  function visibleOnDay(feature, day) {
    const p = feature.properties || {};
    return (p.day_from == null || day >= p.day_from) && (p.day_to == null || day <= p.day_to);
  }
  function featureColor(feature) {
    const p = feature.properties || {};
    return COLORS[p.side] || COLORS[p.group_id] || COLORS.unknown;
  }
  function featureStyle(feature) {
    const q = feature.properties?.quality || 'unknown';
    const color = featureColor(feature);
    return {
      color, weight: q === 'explicit' ? 2.5 : 1.8,
      opacity: q === 'context' ? .42 : q === 'estimated' ? .65 : .9,
      fillColor: color, fillOpacity: q === 'explicit' ? .30 : q === 'derived' ? .17 : .07,
      dashArray: q === 'estimated' ? '5,5' : q === 'context' ? '2,5' : undefined,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {validSceneId, visibleOnDay, featureColor, featureStyle};
  }
  if (typeof window === 'undefined' || !window.L || !window.document) return;

  let leafletMap, timeSlider, timelineTick;
  try { leafletMap = map; timeSlider = slider; timelineTick = tick; }
  catch { return; }
  if (!leafletMap || !timeSlider || typeof timelineTick !== 'function') return;

  const css = document.createElement('style');
  css.textContent = `
    #live-scene{top:138px;right:14px;width:280px;max-height:34vh;overflow:auto;
      z-index:1001;font-size:12px;line-height:1.45}
    #live-scene h2{font-size:12px;margin:0 0 5px;font-weight:800}
    #live-scene .bridge-state{color:var(--ink-soft);margin:4px 0}
    #live-scene .bridge-state[data-state=error]{color:#a63c2e}
    #live-scene .scene-item{border-top:1px solid var(--line);padding:7px 0}
    #live-scene .scene-title{font-weight:700}
    #live-scene .scene-meta,#live-scene .scene-warning{font-size:10.5px;color:var(--ink-soft)}
    #live-scene .scene-warning{color:#8b5b22}
    #live-scene .scene-missing,#live-scene .selection-result{margin-top:5px;font-size:11px;
      color:var(--ink-soft);max-height:120px;overflow:auto}
    #live-scene .selection-result{border-top:1px solid var(--line);padding-top:5px}
    #live-scene .scene-missing div,#live-scene .selection-result div{margin:3px 0}
    #live-scene button{font:inherit;color:var(--ink);background:#fff;border:1px solid var(--line);
      border-radius:var(--r1);cursor:pointer;padding:2px 6px;margin-inline-start:5px}
    #live-scene button:disabled{opacity:.45;cursor:default}
    #live-scene .scene-tools{margin-top:7px}
    #live-scene label{cursor:pointer}
    @media(max-width:700px){#live-scene{top:auto;bottom:calc(var(--tlH) + 112px);
      right:14px;width:min(240px,42vw);max-height:24vh}}
    body.clean #live-scene{opacity:0;pointer-events:none}`;
  document.head.appendChild(css);

  const panel = document.createElement('section');
  panel.id = 'live-scene'; panel.className = 'panel';
  panel.innerHTML = '<h2>סצנות חיות · #מפה</h2><div class="bridge-state" role="status"></div>' +
    '<div class="scene-list"></div><div class="scene-tools"><label><input type="checkbox" checked> הצג שכבות חיות</label>' +
    '<button type="button" class="scene-clear" title="ניקוי התצוגה המקומית בלבד">נקה תצוגה</button>' +
    '<button type="button" class="scene-select">בחר אזור</button>' +
    '<button type="button" class="scene-summarise" hidden disabled>סכם אזור</button>' +
    '<button type="button" class="scene-cancel" hidden>בטל</button></div>' +
    '<div class="selection-result" aria-live="polite" hidden></div>';
  document.body.appendChild(panel);
  const statusNode = panel.querySelector('.bridge-state');
  const listNode = panel.querySelector('.scene-list');
  const enabledNode = panel.querySelector('input');
  const selectButton = panel.querySelector('.scene-select');
  const summariseButton = panel.querySelector('.scene-summarise');
  const cancelButton = panel.querySelector('.scene-cancel');
  const selectionNode = panel.querySelector('.selection-result');
  const layers = new Map();
  const initialHash = new URLSearchParams(location.hash.slice(1));
  let source = null;
  let renderTimer = null;
  let loadSerial = Promise.resolve();
  let viewSerial = 0;
  let selecting = false;
  let selectedPoints = [];
  let outline = null;

  function status(text, state = 'ok') {
    statusNode.textContent = text;
    statusNode.dataset.state = state;
  }
  function readSceneIds() {
    const hash = new URLSearchParams(location.hash.slice(1));
    const ids = (hash.get('scenes') || hash.get('scene') || '').split(',').filter(validSceneId);
    if (ids.length) return ids.slice(-MAX_SCENES);
    try { return JSON.parse(sessionStorage.getItem('ww2.timeline.scenes') || '[]').filter(validSceneId).slice(-MAX_SCENES); }
    catch { return []; }
  }
  function remember() {
    const ids = [...layers.keys()];
    try { sessionStorage.setItem('ww2.timeline.scenes', JSON.stringify(ids)); } catch {}
    const hash = new URLSearchParams(location.hash.slice(1));
    hash.delete('scene');
    if (ids.length) hash.set('scenes', ids.join(',')); else hash.delete('scenes');
    history.replaceState(null, '', location.pathname + location.search + (hash.size ? '#' + hash : ''));
  }
  function saveDay(day) {
    try { sessionStorage.setItem('ww2.timeline.day', String(day)); } catch {}
  }
  function restoredDay(fallback) {
    if (!initialHash.has('scenes')) return fallback;
    try {
      const value = sessionStorage.getItem('ww2.timeline.day');
      const day = value === null ? NaN : Number(value);
      return Number.isFinite(day) ? day : fallback;
    } catch { return fallback; }
  }
  async function json(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(BRIDGE + path, {mode:'cors', cache:'no-store', signal:controller.signal,
        headers:{accept:'application/json'}, ...options});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    } finally { clearTimeout(timer); }
  }
  async function allFeatures(id) {
    const features = [];
    let cursor = 0;
    for (let page = 0; page < 20 && features.length < MAX_FEATURES; page++) {
      const result = await json('/map/scenes/' + encodeURIComponent(id) +
        '/features?limit=500&cursor=' + cursor);
      if (!Array.isArray(result.features)) throw new Error('תשובת פיצ׳רים לא תקינה');
      features.push(...result.features);
      if (!result.meta?.truncated) return features;
      const next = Number(result.meta.cursor);
      if (!Number.isInteger(next) || next <= cursor) throw new Error('סמן המשך לא תקין');
      cursor = next;
    }
    return features.slice(0, MAX_FEATURES);
  }
  function text(tag, value) {
    const node = document.createElement(tag);
    node.textContent = String(value ?? '');
    return node;
  }
  async function detail(sceneId, feature, target) {
    const p = feature.properties || {};
    const id = p.entity_id;
    if (!id) return;
    try {
      const result = await json('/map/scenes/' + encodeURIComponent(sceneId) +
        '/entities/' + encodeURIComponent(id) + '?detail=1');
      const detail = result.detail;
      if (!detail) return;
      const pre = text('pre', JSON.stringify(detail, null, 2).slice(0, 5000));
      pre.style.cssText = 'white-space:pre-wrap;max-height:250px;overflow:auto;font-size:10px;direction:ltr';
      target.appendChild(pre);
    } catch { target.appendChild(text('small', 'פירוט נוסף אינו זמין כרגע')); }
  }
  function layerFor(sceneId, feature) {
    if (!feature.geometry) return null;
    const style = featureStyle(feature);
    try {
      const result = L.geoJSON(feature, {
        style: () => style,
        pointToLayer: (_f, ll) => L.circleMarker(ll, {
          ...style, radius: feature.properties?.entity_kind === 'Battle' ? 8 : 5.5,
          weight: style.weight, fillOpacity: style.fillOpacity + .4,
        }),
      });
      result.eachLayer(layer => layer.on('click', () => {
        const p = feature.properties || {};
        const body = document.createElement('div');
        body.dir = 'rtl';
        body.appendChild(text('b', p.name_he || p.name || p.name_en || p.entity_id || 'ישות'));
        body.appendChild(document.createElement('br'));
        body.appendChild(text('span', [p.entity_kind, QUALITY[p.quality] || p.quality,
          p.motion_basis?.includes('interpolated') ? 'שחזור בין נקודות' : null]
          .filter(Boolean).join(' · ')));
        if (p.location_note) { body.appendChild(document.createElement('br')); body.appendChild(text('small', p.location_note)); }
        if (p.source_ids?.length) { body.appendChild(document.createElement('br')); body.appendChild(text('small', 'מקורות: ' + p.source_ids.slice(0, 5).join(', '))); }
        if (p.has_provenance === false) { body.appendChild(document.createElement('br')); body.appendChild(text('small', 'ללא מקור מאומת')); }
        const button = text('button', 'פרטים מהגרף');
        button.type = 'button'; button.onclick = () => { button.disabled = true; detail(sceneId, feature, body); };
        body.appendChild(document.createElement('br')); body.appendChild(button);
        layer.bindPopup(body).openPopup();
      }));
      return result;
    } catch (error) { console.warn('[timeline scene] skipped geometry', error); return null; }
  }
  function drawDay() {
    const day = Number(timeSlider.value);
    let visible = 0;
    for (const record of layers.values()) {
      for (const item of record.items) {
        const shouldShow = enabledNode.checked && visibleOnDay(item.feature, day);
        if (shouldShow && !item.shown) { record.group.addLayer(item.layer); item.shown = true; }
        else if (!shouldShow && item.shown) { record.group.removeLayer(item.layer); item.shown = false; }
        if (shouldShow) visible++;
      }
    }
    panel.dataset.visibleFeatures = String(visible);
  }
  function scheduleDraw() {
    if (renderTimer != null) return;
    renderTimer = requestAnimationFrame(() => { renderTimer = null; drawDay(); });
  }
  function summary() {
    listNode.replaceChildren();
    for (const [id, record] of layers) {
      const row = document.createElement('div'); row.className = 'scene-item';
      row.appendChild(text('div', record.scene.title_he || record.scene.question || id)).className = 'scene-title';
      const count = record.scene.counts || {};
      row.appendChild(text('div', `${count.located ?? record.items.length} ממוקמים · ${count.unlocated ?? 0} ללא מיקום · ${count.sources ?? 0} מקורות`)).className = 'scene-meta';
      if (record.scene.warnings?.length) row.appendChild(text('div', record.scene.warnings.slice(0, 2).join(' · '))).className = 'scene-warning';
      if (count.unlocated > 0) {
        const missingButton = text('button', `הצג ${count.unlocated} ללא מיקום`);
        missingButton.type = 'button';
        const missingNode = document.createElement('div'); missingNode.className = 'scene-missing';
        missingButton.onclick = async () => {
          missingButton.disabled = true;
          missingNode.replaceChildren(text('div', 'טוען ישויות ללא מיקום…'));
          try {
            const payload = await json('/map/scenes/' + encodeURIComponent(id) + '/features?unlocated=1&limit=200');
            const missing = (payload.features || []).filter(feature => !feature.geometry);
            missingNode.replaceChildren();
            for (const feature of missing.slice(0, 30)) {
              const p = feature.properties || {};
              missingNode.appendChild(text('div', `${p.name_he || p.name || p.entity_id || 'ישות'} · ${p.entity_kind || 'סוג לא ידוע'}`));
            }
            if (count.unlocated > missing.length) missingNode.appendChild(text('div', `מוצגות ${missing.length} מתוך ${count.unlocated}`));
          } catch (error) { missingNode.replaceChildren(text('div', 'לא ניתן לטעון: ' + error.message)); }
          finally { missingButton.disabled = false; }
        };
        row.appendChild(missingButton); row.appendChild(missingNode);
      }
      const remove = text('button', 'הסר'); remove.type = 'button'; remove.onclick = () => removeScene(id);
      row.appendChild(remove); listNode.appendChild(row);
    }
  }
  function removeScene(id) {
    const record = layers.get(id); if (!record) return;
    leafletMap.removeLayer(record.group); layers.delete(id);
    remember(); summary(); scheduleDraw();
    status(layers.size ? `${layers.size} סצנות פעילות` : 'ממתין לפקודת #מפה');
  }
  function clear() {
    cancelSelection();
    for (const id of [...layers.keys()]) removeScene(id);
    status('התצוגה המקומית נוקתה; שכבות האטלס נשארו');
  }
  function cancelSelection() {
    selecting = false; selectedPoints = [];
    if (outline) { leafletMap.removeLayer(outline); outline = null; }
    leafletMap.doubleClickZoom.enable();
    leafletMap.getContainer().style.cursor = '';
    selectButton.hidden = false; summariseButton.hidden = true; cancelButton.hidden = true;
  }
  function startSelection() {
    if (!layers.size) { status('טען קודם סצנה באמצעות #מפה', 'error'); return; }
    cancelSelection(); selecting = true;
    leafletMap.doubleClickZoom.disable();
    leafletMap.getContainer().style.cursor = 'crosshair';
    selectButton.hidden = true; summariseButton.hidden = false; cancelButton.hidden = false;
    summariseButton.disabled = true;
    selectionNode.hidden = false;
    selectionNode.replaceChildren(text('div', 'לחץ על 3 נקודות לפחות במפה, ואז על ״סכם אזור״. Esc מבטל.'));
  }
  function addSelectionPoint(event) {
    if (!selecting || selectedPoints.length >= 199) return;
    selectedPoints.push([event.latlng.lng, event.latlng.lat]);
    if (outline) leafletMap.removeLayer(outline);
    outline = selectedPoints.length >= 3
      ? L.polygon(selectedPoints.map(([lon, lat]) => [lat, lon]), {color:'#446b85', weight:2, fillOpacity:.12}).addTo(leafletMap)
      : L.polyline(selectedPoints.map(([lon, lat]) => [lat, lon]), {color:'#446b85', weight:2}).addTo(leafletMap);
    summariseButton.disabled = selectedPoints.length < 3;
    selectionNode.replaceChildren(text('div', `${selectedPoints.length} נקודות סומנו`));
  }
  async function summariseSelection() {
    if (!selecting || selectedPoints.length < 3) return;
    const polygon = selectedPoints.slice();
    const day = Number(timeSlider.value);
    cancelSelection();
    selectionNode.hidden = false;
    selectionNode.replaceChildren(text('div', 'מחשב סיכום לאזור…'));
    try {
      const results = await Promise.all([...layers.keys()].map(async id => {
        const payload = await json('/map/scenes/' + encodeURIComponent(id) + '/select', {
          method:'POST', headers:{'content-type':'application/json', accept:'application/json'},
          body:JSON.stringify({polygon, day})
        });
        return {id, selection:payload.selection};
      }));
      selectionNode.replaceChildren();
      for (const {id, selection} of results) {
        if (!selection) continue;
        const title = layers.get(id)?.scene.title_he || id;
        selectionNode.appendChild(text('div', `${title}: ${selection.count} פריטים באזור · ${selection.sources} מקורות`));
        const qualities = Object.entries(selection.by_quality || {}).map(([q, n]) => `${QUALITY[q] || q} ${n}`).join(' · ');
        if (qualities) selectionNode.appendChild(text('div', qualities));
        for (const note of (selection.notes || []).slice(0, 2)) selectionNode.appendChild(text('div', note));
      }
    } catch (error) { selectionNode.replaceChildren(text('div', 'סיכום האזור נכשל: ' + error.message)); }
  }
  async function applyScene(id, operation = 'replace', restore = false) {
    if (!validSceneId(id)) throw new Error('מזהה סצנה לא תקין');
    if (operation === 'clear') { clear(); return; }
    if (operation === 'remove') { removeScene(id); return; }
    status('טוען סצנה מהגרף…');
    const payload = await json('/map/scenes/' + encodeURIComponent(id));
    const scene = payload.scene;
    if (!scene || scene.version !== 'ww2-atlas.map-scene.v1' || scene.status !== 'ready')
      throw new Error('סצנה חסרה, פגה או בגרסה שאינה נתמכת');
    if (scene.operation === 'clear') { clear(); return; }
    const features = await allFeatures(id);
    const group = L.layerGroup();
    const items = features.map(feature => ({feature, layer:layerFor(id, feature)}))
      .filter(item => item.layer);
    const old = layers.get(id);
    if (old) leafletMap.removeLayer(old.group);
    if (operation !== 'add' && !restore) clear();
    const wasEmpty = layers.size === 0;
    layers.delete(id);
    layers.set(id, {scene, group, items});
    while (layers.size > MAX_SCENES) removeScene(layers.keys().next().value);
    group.addTo(leafletMap);
    if (Number.isFinite(scene.temporal?.day) && (!restore || wasEmpty)) {
      const day = restore ? restoredDay(scene.temporal.day) : scene.temporal.day;
      timeSlider.value = Math.max(Number(timeSlider.min), Math.min(Number(timeSlider.max), day));
      saveDay(Number(timeSlider.value));
      // Use the current tick binding so later date-aware overlays update too.
      paintTrack(); tick(Number(timeSlider.value));
    }
    if (!restore && scene.camera?.strategy === 'fit_bounds' && scene.camera.bounds) {
      const [w,s,e,n] = scene.camera.bounds;
      if ([w,s,e,n].every(Number.isFinite))
        leafletMap.fitBounds([[s,w],[n,e]], {padding:[30,30], maxZoom:Math.min(scene.camera.max_zoom || 9, 10)});
    }
    remember(); summary(); scheduleDraw();
    status(`${layers.size} סצנות פעילות · ${items.length} פיצ׳רים ממוקמים`);
    fetch(BRIDGE + '/map/scenes/' + encodeURIComponent(id) + '/ack', {
      method:'POST', mode:'cors', headers:{'content-type':'application/json'},
      body:JSON.stringify({client_version:'ww2-timeline-leaflet/1.0', visible_features:items.length})
    }).catch(() => {});
  }
  function queueScene(id, operation, restore = false) {
    loadSerial = loadSerial.then(() => applyScene(id, operation, restore)).catch(error => {
      status('הסצנה לא נטענה: ' + String(error.message || error), 'error');
    });
    return loadSerial;
  }
  function connect() {
    if (location.protocol === 'file:') {
      status('פתח דרך http://localhost:8000/ww2_timeline_map.html כדי לחבר #מפה', 'error');
      return;
    }
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
      status('חיבור לגרף מותר רק מדף מקומי', 'error'); return;
    }
    try { source = new EventSource(BRIDGE + '/map/events'); }
    catch (error) { status('לא ניתן לפתוח ערוץ סצנות: ' + error.message, 'error'); return; }
    source.onopen = () => status(layers.size ? `${layers.size} סצנות פעילות · מחובר` : 'מחובר · ממתין לפקודת #מפה');
    source.onerror = () => status('גשר המפה אינו זמין; מנסה להתחבר מחדש', 'error');
    source.addEventListener('scene_progress', event => {
      try { const data = JSON.parse(event.data); if (data.stage) status('בונה סצנה: ' + data.stage); } catch {}
    });
    source.addEventListener('scene_ready', event => {
      try { const data = JSON.parse(event.data); if (validSceneId(data.scene_id)) queueScene(data.scene_id, data.operation || 'replace'); } catch {}
    });
    source.addEventListener('scene_cleared', event => {
      try {
        const data = JSON.parse(event.data);
        if (data.operation === 'clear' || !data.scene_id) clear();
        else removeScene(data.scene_id);
      } catch { status('אירוע ניקוי לא תקין; הסצנות הקיימות נשמרו', 'error'); }
    });
    source.addEventListener('scene_failed', () => status('בניית הסצנה נכשלה; התצוגה הקודמת נשמרה', 'error'));
  }

  enabledNode.onchange = scheduleDraw;
  panel.querySelector('.scene-clear').onclick = clear;
  selectButton.onclick = startSelection;
  summariseButton.onclick = summariseSelection;
  cancelButton.onclick = cancelSelection;
  leafletMap.on('click', addSelectionPoint);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && selecting) cancelSelection(); });
  timeSlider.addEventListener('input', scheduleDraw);
  const baseTick = tick;
  tick = function (day) { const result = baseTick(day); saveDay(day); scheduleDraw(); return result; };
  window.WW2TimelineBridge = {applyScene: queueScene, clear, state: () => ({scenes:[...layers.keys()], visible:Number(panel.dataset.visibleFeatures || 0)})};
  connect();
  for (const id of readSceneIds()) queueScene(id, 'add', true);
})();
