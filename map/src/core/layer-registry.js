/**
 * רג'יסטר השכבות — מסלול A.
 *
 * המנוע אינו מכיר את משמעות השכבות. שכבה נרשמת עם מפרט — מזהה, קבוצה,
 * פונקציית טעינה, פונקציית בנייה — והרג'יסטר מנהל מצב, נראות, שקיפות
 * וסדר. אותו קוד יריץ שכבת מחנות, שכבת נתיבי סחר רומיים או שכבת
 * תחנות אוטובוס.
 *
 * `build(ctx)` מקבל את הקונטקסט המלא (יום נוכחי, דרג ביצועים, שקיפות)
 * ומחזיר מערך שכבות deck.gl. השכבה מחליטה בעצמה איך להתנהג בדרג נמוך.
 */

export class LayerRegistry {
  constructor({ tierCaps }) {
    this.specs = new Map();
    this.groups = new Map();
    this.state = new Map();
    this.tierCaps = tierCaps;
    this._listeners = new Set();
    this._loading = new Set();
  }

  /**
   * @param {object} spec
   * @param {string} spec.id
   * @param {string} spec.label       — שם לתצוגה
   * @param {string} spec.group       — קבוצה בפאנל
   * @param {boolean} spec.defaultOn
   * @param {Function} spec.load      — async () => data
   * @param {Function} spec.build     — (data, ctx) => Layer | Layer[]
   * @param {Array}  spec.legend      — [{color:[r,g,b], label}]
   */
  register(spec) {
    if (this.specs.has(spec.id)) throw new Error(`שכבה כפולה: ${spec.id}`);
    this.specs.set(spec.id, spec);
    this.state.set(spec.id, {
      visible: spec.defaultOn ?? false,
      opacity: spec.opacity ?? 1,
      data: null,
      status: 'idle',
      error: null,
    });
    if (!this.groups.has(spec.group)) this.groups.set(spec.group, []);
    this.groups.get(spec.group).push(spec.id);
    return this;
  }

  get(id) { return this.specs.get(id); }
  stateOf(id) { return this.state.get(id); }

  get visibleIds() {
    return [...this.specs.keys()].filter((id) => this.state.get(id).visible);
  }

  /** האם ניתן להדליק עוד שכבה בדרג הנוכחי. */
  canEnable(tier) {
    return this.visibleIds.length < this.tierCaps[tier].maxLayers;
  }

  async setVisible(id, visible, tier) {
    const st = this.state.get(id);
    if (!st || st.visible === visible) return;

    if (visible && !this.canEnable(tier)) {
      this._emit({ type: 'blocked', id, reason: 'cap' });
      return;
    }

    st.visible = visible;
    this._emit({ type: 'visibility', id, visible });

    if (visible && st.status === 'idle') await this.load(id);
  }

  setOpacity(id, opacity) {
    const st = this.state.get(id);
    if (!st) return;
    st.opacity = Math.max(0, Math.min(1, opacity));
    this._emit({ type: 'opacity', id });
  }

  /** טעינה עצלה — שכבה נטענת רק כשמדליקים אותה. */
  async load(id) {
    const spec = this.specs.get(id);
    const st = this.state.get(id);
    if (!spec || !st || this._loading.has(id)) return;

    this._loading.add(id);
    st.status = 'loading';
    st.error = null;
    this._emit({ type: 'status', id, status: 'loading' });

    try {
      st.data = await spec.load();
      st.status = 'ready';
      this._emit({ type: 'status', id, status: 'ready' });
    } catch (err) {
      st.status = 'error';
      st.error = err?.message || String(err);
      this._emit({ type: 'status', id, status: 'error', error: st.error });
    } finally {
      this._loading.delete(id);
    }
  }

  /** בונה את מערך שכבות deck.gl למצב הנוכחי. */
  buildLayers(ctx) {
    const out = [];
    for (const [id, spec] of this.specs) {
      const st = this.state.get(id);
      if (!st.visible || st.status !== 'ready') continue;
      const built = spec.build(st.data, { ...ctx, opacity: st.opacity, id });
      if (Array.isArray(built)) out.push(...built.filter(Boolean));
      else if (built) out.push(built);
    }
    return out;
  }

  /** המקרא הדינמי — רק שכבות פעילות (סעיף 8.1 באפיון). */
  activeLegend(context = {}) {
    const items = [];
    for (const id of this.visibleIds) {
      const spec = this.specs.get(id);
      if (spec.legend) {
        items.push({
          layer: spec.label,
          entries: spec.legend,
          context: typeof spec.legendContext === 'function'
            ? spec.legendContext(context)
            : spec.legendContext,
        });
      }
    }
    return items;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(e) { for (const fn of this._listeners) fn(e); }

  /** מצב מסריאליזבילי לקישור עומק. */
  serialize() {
    const on = this.visibleIds;
    return on.length ? on.join(',') : '';
  }

  applySerialized(str, tier) {
    if (typeof str !== 'string') return;
    const wanted = new Set(str.split(',').filter(Boolean));
    for (const id of this.specs.keys()) {
      const shouldShow = wanted.has(id);
      if (this.state.get(id).visible !== shouldShow) {
        this.setVisible(id, shouldShow, tier);
      }
    }
  }

  /**
   * מחליף רק את פרוסת ה-serving של שכבות פעילות. null פירושו שה־API
   * אינו זמין, ולכן הנתונים הסטטיים המקומיים נשארים ללא שינוי.
   */
  async refreshFromDatabase(client, context) {
    const generation = (this._databaseGeneration || 0) + 1;
    this._databaseGeneration = generation;
    this._databaseAbort?.abort();
    const controller = new AbortController();
    this._databaseAbort = controller;

    const requests = [];
    for (const id of this.visibleIds) {
      const spec = this.specs.get(id);
      const st = this.state.get(id);
      if (!spec?.database || st?.status !== 'ready') continue;
      requests.push((async () => {
        const payload = await client.query({
          layer: spec.database.layer || id,
          bbox: context.bbox,
          zoom: context.zoom,
          day: context.day,
          limit: spec.database.limit || 800,
          signal: controller.signal,
        });
        if (!payload || generation !== this._databaseGeneration) return;

        if (spec.database.shape === 'geojson') {
          st.data = {
            type: 'FeatureCollection',
            features: payload.features,
          };
        } else if (Array.isArray(st.data)) {
          st.data = payload.items;
        } else {
          const key = spec.database.dataKey;
          st.data = { ...st.data, [key]: payload.items };
          if (spec.database.clearTrips) st.data.trips = [];
        }
        this._emit({
          type: 'database-data',
          id,
          count: payload.meta?.count ?? payload.items.length,
          truncated: Boolean(payload.meta?.truncated),
        });
      })());
    }
    await Promise.all(requests);
  }
}
