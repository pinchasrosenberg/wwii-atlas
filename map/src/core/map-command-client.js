/**
 * MapCommandClient — מסלול A (שלד). אינו מכיר מלחמת עולם.
 *
 * מאזין ל־SSE של גשר הגרף המקומי, מושך metadata של סצנה, מבקש פיצ׳רים לפי
 * חלון הראייה, ומפעיל את המפה דרך הממשקים הקיימים בלבד: TimeEngine,
 * LayerRegistry ו־viewState. אין גישה ישירה ל־deck.gl ואין קוד מהצ׳אט.
 *
 * אם הגשר אינו זמין המפה נשארת כפי שהיא. סצנה קודמת לעולם אינה נמחקת
 * בגלל כשל של סצנה חדשה.
 */

// The public site has no scene bridge; a bridge URL must be passed explicitly to enable it.
const DEFAULT_BRIDGE = '';
const CLIENT_VERSION = 'map-command-client/1.0';
const RECONNECT_MS = [1000, 2000, 5000, 10000, 20000];
// ‏חייב להישאר זהה ל-MAX_PARALLEL_SCENES ב-map_contract.py. הגבול מתפרסם
// ‏לצ׳אט דרך /map/capabilities, ולכן גבול שהלקוח לא אוכף הוא הבטחה ריקה.
const MAX_PARALLEL_SCENES = 6;

/** ‏חיבור סיכומים מכמה סצנות מקבילות לסיכום אחד. */
function mergeSelections(results) {
  const merged = {
    count: 0, by_kind: {}, by_side: {}, by_quality: {}, reconstructed: 0,
    sources: 0, strength: null, items: [], notes: [], scenes: results.length,
  };
  for (const { selection } of results) {
    merged.count += selection.count;
    merged.reconstructed += selection.reconstructed;
    merged.sources += selection.sources;
    for (const key of ['by_kind', 'by_side', 'by_quality']) {
      for (const [name, n] of Object.entries(selection[key] || {})) {
        merged[key][name] = (merged[key][name] || 0) + n;
      }
    }
    if (selection.strength) {
      merged.strength = merged.strength || { units: 0, min: 0, max: 0 };
      merged.strength.units += selection.strength.units;
      merged.strength.min += selection.strength.min;
      merged.strength.max += selection.strength.max;
    }
    merged.items.push(...(selection.items || []));
    for (const note of selection.notes || []) {
      if (!merged.notes.includes(note)) merged.notes.push(note);
    }
  }
  return merged;
}

export class MapCommandClient {
  /**
   * @param {object} deps
   * @param {string} deps.bridgeUrl
   * @param {object} deps.store          — store של scene-overlay
   * @param {object} deps.registry       — LayerRegistry
   * @param {object} deps.engine         — TimeEngine
   * @param {Function} deps.getTier
   * @param {Function} deps.getViewport  — () => ({ bbox:[w,s,e,n], zoom })
   * @param {Function} deps.setCamera    — ({ bounds, maxZoom }) => void
   * @param {Function} deps.onScene      — (scene|null, status) => void
   * @param {Function} deps.onProgress   — (stageEvent) => void
   * @param {Function} deps.refreshLayers
   */
  constructor({
    bridgeUrl = DEFAULT_BRIDGE, store, registry, engine, getTier, getViewport,
    setCamera, onScene, onProgress, refreshLayers,
  }) {
    this.bridgeUrl = bridgeUrl.replace(/\/$/, '');
    this.store = store;
    this.registry = registry;
    this.engine = engine;
    this.getTier = getTier;
    this.getViewport = getViewport;
    this.setCamera = setCamera;
    this.onScene = onScene || (() => {});
    this.onProgress = onProgress || (() => {});
    this.refreshLayers = refreshLayers || (() => {});

    this.scene = null;
    // ‏‏operation:"add" מיזג סצנה חדשה לקיימת, אבל refreshViewport טען מחדש
    // ‏רק את הסצנה האחרונה ודרס את השאר — כל הזזה של המפה מחקה את השכבות
    // ‏המקבילות בשקט. הרשימה הזאת היא מקור האמת למה שמוצג בפועל.
    this.scenes = [];
    this.status = 'idle';
    this.previous = null;
    this.source = null;
    this.attempt = 0;
    this._viewportAbort = null;
    this._appliedIds = new Set();
  }

  // -- lifecycle ---------------------------------------------------------

  async start() {
    if (!this.bridgeUrl) return;
    const fromUrl = new URLSearchParams(location.hash.replace(/^#/, '')).get('scene')
      || sessionStorage.getItem('atlas.last_scene_id');
    this._connect();
    if (fromUrl) {
      try {
        await this.applyScene(fromUrl, { restoring: true });
      } catch {
        this._setStatus('scene_unavailable');
      }
    }
  }

  stop() {
    this.source?.close();
    this.source = null;
    this._viewportAbort?.abort();
  }

  _connect() {
    if (typeof EventSource === 'undefined') return;
    try {
      this.source = new EventSource(`${this.bridgeUrl}/map/events`);
    } catch {
      this._setStatus('bridge_unavailable');
      return;
    }
    this.source.onopen = () => {
      this.attempt = 0;
      this._setStatus(this.scene ? 'ready' : 'waiting');
    };
    // שלבי בנייה משודרים תוך כדי, כדי שהמפה לא תיראה תקועה בזמן שהגרף עובד.
    this.source.addEventListener('scene_progress', (event) => {
      const data = safeJson(event.data);
      if (data?.stage) this.onProgress(data);
    });
    this.source.addEventListener('scene_ready', (event) => {
      const data = safeJson(event.data);
      if (data?.scene_id) this.applyScene(data.scene_id, { operation: data.operation });
    });
    this.source.addEventListener('scene_cleared', (event) => {
      const data = safeJson(event.data);
      // "#מפה נקה" מייצר scene_id חדש שאינו הסצנה הנוכחית; פקודת ניקוי
      // מזוהה לפי ה-operation ולא לפי התאמת מזהה.
      const explicitClear = data?.operation === 'clear';
      if (explicitClear || !data?.scene_id || data.scene_id === this.scene?.scene_id) {
        this.clear();
      }
    });
    this.source.addEventListener('scene_failed', () => {
      // סצנה שנכשלה אינה מחליפה את הסצנה האחרונה שהוצגה בהצלחה.
      this._setStatus('scene_failed');
    });
    this.source.onerror = () => {
      this.source?.close();
      this.source = null;
      this._setStatus('bridge_unavailable');
      const delay = RECONNECT_MS[Math.min(this.attempt, RECONNECT_MS.length - 1)];
      this.attempt += 1;
      setTimeout(() => { if (!this.source) this._connect(); }, delay);
    };
  }

  // -- applying a scene ---------------------------------------------------

  async applyScene(sceneId, { operation = 'replace', restoring = false } = {}) {
    if (!/^scn_[a-z0-9]{4,32}$/i.test(sceneId)) throw new Error('scene_id לא תקין');
    this._setStatus('loading');
    const started = performance.now();

    const payload = await this._json(`/map/scenes/${encodeURIComponent(sceneId)}`);
    const scene = payload?.scene;
    if (!scene || scene.version !== 'ww2-atlas.map-scene.v1') {
      this._setStatus('scene_unavailable');
      throw new Error('גרסת סצנה לא נתמכת');
    }
    if (scene.status === 'expired' || scene.status === 'cleared') {
      this._setStatus('scene_expired');
      throw new Error('הסצנה פגה');
    }

    this.previous = {
      scene: this.scene, scenes: [...this.scenes], features: [...this.store.features],
    };
    const additive = operation === 'add' && !restoring;
    if (additive) {
      const kept = this.scenes.filter((s) => s.scene_id !== scene.scene_id);
      // ‏מעבר לגבול, הוותיקה ביותר יורדת. עדיף להפיל את הישנה מאשר לדחות
      // ‏את מה שהמשתמש הרגע ביקש.
      this.scenes = [...kept, scene].slice(-MAX_PARALLEL_SCENES);
      this.droppedForLimit = kept.length + 1 > MAX_PARALLEL_SCENES;
    } else {
      this.scenes = [scene];
      this.droppedForLimit = false;
    }
    this.scene = scene;

    if (scene.temporal?.day != null) this.engine.setDay(scene.temporal.day);

    const tier = this.getTier();
    for (const layerId of scene.active_layers || []) {
      await this.registry.setVisible(layerId, true, tier);
    }
    await this.registry.setVisible('scene-overlay', true, tier);

    const features = await this._loadViewportFeatures(scene);
    if (additive) this.store.merge(scene, features);
    else this.store.apply(scene, features);

    if (scene.camera?.bounds && scene.camera.strategy === 'fit_bounds') {
      this.setCamera({ bounds: scene.camera.bounds, maxZoom: scene.camera.max_zoom });
    }

    this.refreshLayers();
    this._rememberInUrl(scene);
    this._appliedIds.add(scene.scene_id);
    this._setStatus('ready');

    this._ack(scene.scene_id, {
      render_ms: Math.round(performance.now() - started),
      visible_features: this.store.features.length,
      active_layers: this.registry.visibleIds,
      client_version: CLIENT_VERSION,
    });
    return scene;
  }

  /** נקרא ב-moveend/zoomend: אותה סצנה, חלון נתונים אחר. */
  async refreshViewport() {
    if (!this.scenes.length) return;
    // ‏כל הסצנות הפעילות נטענות מחדש, לא רק האחרונה. אחרת הזזת המפה
    // ‏מוחקת את השכבות שנטענו במקביל.
    const loaded = [];
    for (const scene of this.scenes) {
      const features = await this._loadViewportFeatures(scene, { keepAbort: true });
      if (features) loaded.push([scene, features]);
    }
    if (!loaded.length) return;
    const [firstScene, firstFeatures] = loaded[0];
    this.store.apply(firstScene, firstFeatures);
    for (const [scene, features] of loaded.slice(1)) this.store.merge(scene, features);
    this.store.scene = this.scene;
    this.refreshLayers();
  }

  /** הסרת סצנה אחת מתוך כמה שמוצגות במקביל. */
  async removeScene(sceneId) {
    const next = this.scenes.filter((s) => s.scene_id !== sceneId);
    if (next.length === this.scenes.length) return false;
    this.previous = {
      scene: this.scene, scenes: [...this.scenes], features: [...this.store.features],
    };
    this.scenes = next;
    this.scene = next[next.length - 1] || null;
    if (!next.length) {
      this.store.clear();
      this.refreshLayers();
      this._setStatus('cleared');
      return true;
    }
    await this.refreshViewport();
    this._setStatus('ready');
    return true;
  }

  /** מה מוצג כרגע — לפאנל ולבורר השכבות. */
  activeScenes() {
    return this.scenes.map((scene) => ({
      scene_id: scene.scene_id,
      question: scene.question || scene.intent?.question || scene.scene_id,
      counts: scene.counts,
    }));
  }

  async _loadViewportFeatures(scene, { keepAbort = false } = {}) {
    // ‏ברענון של כמה סצנות אסור שכל בקשה תבטל את קודמתה — הן חלק מאותו רענון
    if (!keepAbort || !this._viewportAbort) {
      this._viewportAbort?.abort();
      this._viewportAbort = new AbortController();
    }
    const controller = this._viewportAbort;
    const { bbox, zoom } = this.getViewport();
    const params = new URLSearchParams({
      bbox: bbox.map((n) => n.toFixed(2)).join(','),
      z: String(Math.round(zoom * 10) / 10),
      limit: String(featureBudget(zoom)),
    });
    if (scene.temporal?.day != null) params.set('day', String(scene.temporal.day));
    try {
      return await this._json(
        `/map/scenes/${encodeURIComponent(scene.scene_id)}/features?${params}`,
        { signal: controller.signal },
      );
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      throw error;
    }
  }

  /**
   * ‏פירוט מלא לישות אחת. הלחיצה על קרב שואבת את המשתתפים והכוחות מהגרף
   * ולא מסתפקת במה שנכנס לתקציב חלון הראייה — אחרת ״מי היה בקרב״ היה תלוי
   * ‏במקרה בכמה פיצ׳רים נכנסו למסך.
   */
  async detail(entityId) {
    // ‏הישות עשויה להגיע מכל אחת מהסצנות המקבילות; מחפשים מהאחרונה אחורה
    for (const candidate of [...this.scenes].reverse()) {
      try {
        const payload = await this._json(
          `/map/scenes/${encodeURIComponent(candidate.scene_id)}`
          + `/entities/${encodeURIComponent(entityId)}?detail=1`);
        if (payload?.feature) return { ...payload, scene_id: candidate.scene_id };
      } catch (error) {
        if (!String(error.message).includes('404')) throw error;
      }
    }
    return null;
  }

  /**
   * ‏סיכום של מה שנמצא בתוך מצולע שהמשתמש צייר. הסיכום מחושב בשרת על
   * ‏הסצנה עצמה, ולא על מה שבמקרה מצויר כרגע על המסך.
   */
  async selectPolygon(polygon, { day = null } = {}) {
    if (!this.scenes.length) return null;
    const results = [];
    for (const scene of this.scenes) {
      const payload = await this._json(
        `/map/scenes/${encodeURIComponent(scene.scene_id)}/select`,
        { method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ polygon, day }) });
      if (payload?.selection) results.push({ scene, selection: payload.selection });
    }
    if (!results.length) return null;
    return results.length === 1
      ? { ...results[0].selection, scenes: 1 }
      : mergeSelections(results);
  }

  /** רשימת ה"ידוע אך לא ממוקם" לפאנל — לא נכנסת לרינדור. */
  async unlocated() {
    if (!this.scene) return [];
    const payload = await this._json(
      `/map/scenes/${encodeURIComponent(this.scene.scene_id)}/features?unlocated=1&limit=2000`);
    return (payload?.features || []).filter((f) => !f.geometry);
  }

  async clear() {
    this.store.clear();
    this.scene = null;
    this.scenes = [];
    this._rememberInUrl(null);
    this.refreshLayers();
    this._setStatus('cleared');
  }

  undo() {
    if (!this.previous) return false;
    this.scene = this.previous.scene;
    this.scenes = this.previous.scenes || (this.previous.scene ? [this.previous.scene] : []);
    this.store.apply(this.previous.scene, { features: this.previous.features });
    this.previous = null;
    this.refreshLayers();
    this._setStatus(this.scene ? 'ready' : 'cleared');
    return true;
  }

  // -- plumbing -----------------------------------------------------------

  async _json(path, options = {}) {
    const response = await fetch(`${this.bridgeUrl}${path}`, {
      ...options,
      headers: { accept: 'application/json' },
      mode: 'cors',
    });
    if (!response.ok) throw new Error(`bridge ${response.status}`);
    return response.json();
  }

  _ack(sceneId, body) {
    fetch(`${this.bridgeUrl}/map/scenes/${encodeURIComponent(sceneId)}/ack`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      mode: 'cors',
    }).catch(() => {});
  }

  _rememberInUrl(scene) {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (scene) {
      hash.set('scene', scene.scene_id);
      try { sessionStorage.setItem('atlas.last_scene_id', scene.scene_id); } catch { /* ignore */ }
    } else {
      hash.delete('scene');
      try { sessionStorage.removeItem('atlas.last_scene_id'); } catch { /* ignore */ }
    }
    history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
  }

  _setStatus(status) {
    this.status = status;
    this.onScene(this.scene, status);
  }
}

/** תקציב פיצ׳רים לפי זום — סעיף 10 במפרט. */
export function featureBudget(zoom) {
  if (zoom < 4) return 300;
  if (zoom < 6) return 700;
  if (zoom < 8) return 1200;
  return 2000;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
