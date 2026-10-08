/**
 * לקוח נתונים לפי חלון המפה.
 *
 * בסביבת Sites הוא קורא מ־D1 דרך Worker. בהרצה מקומית עם
 * `python -m http.server` אין API ולכן מוחזר null והשכבות הסטטיות נשארות
 * פעילות. כך אפשר לפתח מקומית בלי להציג מסך ריק.
 */

function featureToItem(feature) {
  const item = { ...(feature.properties || {}) };
  const geometry = feature.geometry;
  if (geometry?.type === 'Point') item.position = geometry.coordinates;
  if (geometry?.type === 'LineString') item.path = geometry.coordinates;
  if (geometry?.type === 'Polygon') item.polygon = geometry.coordinates[0];
  if (geometry?.type === 'MultiPolygon') item.multipolygon = geometry.coordinates;
  return item;
}

function snapped(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export class ViewportDataClient {
  constructor({ endpoint = './api/features', ttlMs = 60_000 } = {}) {
    this.endpoint = endpoint;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.unavailableUntil = 0;
  }

  async query({ layer, bbox, zoom, day, limit = 800, signal } = {}) {
    if (Date.now() < this.unavailableUntil) return null;
    const safeBbox = bbox.map((value) => snapped(value));
    const params = new URLSearchParams({
      layer,
      bbox: safeBbox.join(','),
      z: String(snapped(zoom, 1)),
      day: String(Math.round(day)),
      limit: String(limit),
    });
    const key = params.toString();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.value;

    let response;
    try {
      response = await fetch(`${this.endpoint}?${params}`, {
        signal,
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      this.unavailableUntil = Date.now() + 30_000;
      return null;
    }
    if (response.status === 404 || response.status === 503) {
      this.unavailableUntil = Date.now() + 30_000;
      return null;
    }
    if (!response.ok) throw new Error(`שאילתת המפה נכשלה (${response.status})`);
    const payload = await response.json();
    const value = {
      ...payload,
      items: (payload.features || []).map(featureToItem),
    };
    this.cache.set(key, { at: Date.now(), value });
    if (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value);
    return value;
  }
}

export function mapBoundsArray(bounds) {
  let west = Math.max(-180, bounds.getWest());
  let east = Math.min(180, bounds.getEast());
  const south = Math.max(-90, bounds.getSouth());
  const north = Math.min(90, bounds.getNorth());
  if (west >= east) {
    west = -180;
    east = 180;
  }
  return [west, south, east, north];
}
