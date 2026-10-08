/**
 * Shared, same-origin data loader.
 *
 * Every stage 3–8 layer reads the same immutable payload. Keeping one promise
 * here guarantees a single network request and one parsed object in memory.
 */

const ATLAS_URL = './data/stage3-8/atlas.json';

/**
 * ‏‏JSON סטטי, בקשה אחת לכל כתובת.
 *
 * ⚠️ ‏כל שכבה משכה את הקבצים שלה בעצמה, ולכן `battles.json`,
 * ‏`places.json` ו-`convoy-routes.json` נמשכו **שלוש פעמים כל אחד**
 * ‏בכל טעינה — ‏85 בקשות רשת שבהן עשרות מגה-בייט של JSON מפוענחים
 * ‏שוב ושוב. שום דבר לא נשבר, רק לקח 15 שניות עד שהמפה עלתה.
 *
 * ‏דחייה אינה נשמרת: טעינה שנכשלה חייבת להיות ניתנת לניסיון חוזר,
 * ‏אחרת כשל רגעי ברשת נועל את השכבה לכל הסשן.
 */
const jsonCache = new Map();

/**
 * WWII content (battles, camps, sinkings, industry) is not shipped with the site: it is read live from the
 * public graph API declared in index.html (<meta name="ww2-graph-api">). The API answers with the graph's
 * own response envelope ({data: {values: [[payload]]}}), which is unwrapped here.
 * Layers that have no counterpart in the public graph get an empty payload of the same shape.
 */
const GRAPH_ENDPOINTS = {
  './data/legacy/battles.json': '/map/battles',
  './data/legacy/places.json': '/map/places',
  './data/legacy/maritime.json': '/map/maritime',
  './data/legacy/infrastructure.json': '/map/infrastructure',
};
const EMPTY_PAYLOADS = {
  './data/legacy/battles.json': () => ({ metadata: {}, battles: [], standalone_oob: [] }),
  './data/legacy/places.json': () => ({ metadata: {}, sites: [], cities: [] }),
  './data/legacy/maritime.json': () => ({ metadata: {}, routes: [], sinkings: [], transports: [] }),
  './data/legacy/infrastructure.json': () => ({ metadata: {}, rail_interdictions: [], bombing_targets: [], ports: [],
                                                supply_ports: [], plants: [], plant_links: [] }),
  './data/legacy/railways.json': () => ({ metadata: {}, railways: [] }),
  './data/legacy/territories.json': () => ({ metadata: {}, territories: { pool: [], periods: [] },
                                             political_labels: { names: [], cls: [], periods: [] } }),
  './data/motion/motion.json': () => ({ metadata: {}, front_grid: null, front_contours: [], attack_arrows: [],
                                        formation_tracks: [], air_raids: [], deportation_routes: [] }),
};

export function graphApiUrl() {
  const value = globalThis.document?.querySelector('meta[name="ww2-graph-api"]')?.content || '';
  return /^https:\/\/[^/]+$/.test(value.trim()) ? value.trim() : '';
}

/** 'ok' | 'unavailable' — read by the UI to explain empty WWII layers. */
export const graphApiState = { status: 'pending', error: null };

/**
 * The base map never depends on the API: when it is unreachable the layer gets an empty payload of the
 * right shape, the map still boots, and graphApiState / a 'ww2-graph-api' event report why.
 */
function fetchGraphPayload(path, key) {
  return fetchGraphEnvelope(path).then((payload) => {
    graphApiState.status = 'ok';
    return payload;
  }, (error) => {
    graphApiState.status = 'unavailable';
    graphApiState.error = String(error?.message || error);
    console.warn('[graph-api]', graphApiState.error);
    globalThis.dispatchEvent?.(new CustomEvent('ww2-graph-api', { detail: { ...graphApiState } }));
    return EMPTY_PAYLOADS[key]();
  });
}

function fetchGraphEnvelope(path) {
  const base = graphApiUrl();
  if (!base) return Promise.reject(new Error('כתובת ה־API של הגרף לא הוגדרה'));
  return fetch(base + path, { credentials: 'omit', referrerPolicy: 'no-referrer' }).then((response) => {
    if (!response.ok) throw new Error(`טעינת ${path} מה־API נכשלה (${response.status})`);
    return response.json();
  }).then((envelope) => {
    const payload = envelope?.data?.values?.[0]?.[0];
    if (!payload || typeof payload !== 'object') throw new Error(`תשובה לא תקינה מ־${path}`);
    return payload;
  });
}

export function loadJson(url) {
  if (!jsonCache.has(url)) {
    const key = url.split('?')[0];
    const pending = GRAPH_ENDPOINTS[key] ? fetchGraphPayload(GRAPH_ENDPOINTS[key], key)
      : EMPTY_PAYLOADS[key] ? Promise.resolve(EMPTY_PAYLOADS[key]())
      : fetch(url).then((response) => {
        if (!response.ok) throw new Error(`טעינת ${url} נכשלה (${response.status})`);
        return response.json();
      });
    pending.catch(() => jsonCache.delete(url));
    jsonCache.set(url, pending);
  }
  return jsonCache.get(url);
}

export function loadAtlasData() {
  return loadJson(ATLAS_URL);
}

export function sourceMap(payload) {
  return new Map(
    (payload?.metadata?.sources || []).map((source) => [source.id, source]),
  );
}

export function sourcesFor(item, sources) {
  return (item?.source_ids || []).map((id) => sources.get(id)).filter(Boolean);
}

