// WWII Atlas public graph API (Cloudflare Worker).
//
// The only component that holds database credentials. Browsers and tools talk to this
// Worker; the Worker talks to the hosted Neo4j graph through its HTTPS Query API.
//
//  * Public endpoints run fixed, parameterised, read-only Cypher.
//  * POST /query (free-form read Cypher) requires the owner's CONSOLE_KEY.
//  * No endpoint writes. Rows, string lengths and execution time are capped.

import { validateReadCypher, CypherRejected } from './cypher.js';

const MAX_ROWS = 200;
const DEFAULT_TIMEOUT_S = 10;
const CACHE_SECONDS = 300;
const MAP_CACHE_SECONDS = 86_400; // map layers change only when a new snapshot is loaded

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), env, request);
    try {
      const limited = await rateLimited(request, env);
      if (limited) return cors(json({ ok: false, error: 'rate limited' }, 429), env, request);

      const url = new URL(request.url);
      const route = ROUTES.find((r) => r.method === request.method && r.pattern.test(url.pathname));
      if (!route) return cors(json({ ok: false, error: 'not found' }, 404), env, request);

      if (request.method === 'GET') {
        // The cache key keeps only the parameters a route reads, in a fixed order: appending random
        // query strings cannot bypass the edge cache and push heavy queries onto the graph.
        const cache = caches.default;
        const key = new Request(cacheKey(url, route), { method: 'GET' });
        const hit = await cache.match(key);
        if (hit) return cors(hit, env, request);
        const res = await route.handler({ request, env, url, params: url.pathname.match(route.pattern) });
        if (res.status === 200) {
          res.headers.set('Cache-Control', `public, max-age=${url.pathname.startsWith('/map/') ? MAP_CACHE_SECONDS : CACHE_SECONDS}`);
          ctx.waitUntil(cache.put(key, res.clone()));
        }
        return cors(res, env, request);
      }
      return cors(await route.handler({ request, env, url, params: url.pathname.match(route.pattern) }), env, request);
    } catch (err) {
      if (err instanceof CypherRejected || err instanceof BadRequest) {
        return cors(json({ ok: false, error: err.message }, 400), env, request);
      }
      if (err instanceof GraphError && err.status >= 400 && err.status < 500 && err.status !== 401) {
        console.error('graph rejected a query:', err.message);
        return cors(json({ ok: false, error: 'bad request' }, 400), env, request);
      }
      console.error(err && err.stack || err);
      return cors(json({ ok: false, error: 'internal error' }, 500), env, request);
    }
  },

  // Weekly cron (wrangler.toml): a trivial read keeps the free hosted graph from pausing.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env, 'RETURN 1 AS ok'));
  },
};

class BadRequest extends Error {}
class GraphError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// ---------------------------------------------------------------- routes

const ROUTES = [
  { method: 'GET', pattern: /^\/health$/, handler: health },
  { method: 'GET', pattern: /^\/entities\/stats$/, handler: stats },
  { method: 'GET', pattern: /^\/battles$/, handler: battles, query: ['from', 'to', 'theater', 'limit'] },
  { method: 'GET', pattern: /^\/battle\/([0-9a-f]{16})$/, handler: battle },
  { method: 'GET', pattern: /^\/entity\/([0-9a-f]{16})$/, handler: entity },
  { method: 'GET', pattern: /^\/search$/, handler: search, query: ['q', 'limit'] },
  { method: 'GET', pattern: /^\/delivers$/, handler: delivers },
  { method: 'GET', pattern: /^\/delivers\/([A-Za-z0-9:_.-]{1,120})$/, handler: deliver },
  { method: 'GET', pattern: /^\/map\/(battles|places|maritime|infrastructure)$/, handler: mapLayer },
  { method: 'POST', pattern: /^\/pipeline\/query$/, handler: pipelineQuery },
  { method: 'POST', pattern: /^\/query$/, handler: consoleQuery },
];

function cacheKey(url, route) {
  const key = new URL(url.origin + url.pathname);
  for (const name of route.query || []) {
    const value = url.searchParams.get(name);
    if (value !== null) key.searchParams.set(name, value);
  }
  return key.toString();
}

async function health({ env }) {
  const started = Date.now();
  await run(env, 'RETURN 1 AS ok');
  return json({ ok: true, service: 'ww2-atlas-public-graph', neo4j: 'hosted', model: 'fulltext',
                latency_ms: Date.now() - started });
}

async function stats({ env }) {
  const rows = await run(env, `
    CALL () { MATCH (n:Public) RETURN count(n) AS nodeCount }
    CALL () { MATCH ()-[r]->() RETURN count(r) AS relCount }
    CALL () { MATCH (f:AtlasFact) RETURN count(f) AS insightCount }
    RETURN nodeCount, relCount, insightCount`);
  return json({ ok: true, ...rows[0] });
}

async function battles({ env, url }) {
  const from = isoDate(url.searchParams.get('from'), '1939-01-01');
  const to = isoDate(url.searchParams.get('to'), '1945-12-31');
  const theater = text(url.searchParams.get('theater'), 80);
  const limit = clamp(url.searchParams.get('limit'), 1, 3000, 1000);
  const rows = await run(env, `
    MATCH (b:Battle)
    WHERE b.timeline_date_from <= $to AND coalesce(b.timeline_date_to, b.timeline_date_from) >= $from
      AND ($theater IS NULL OR b.theater_canonical = $theater)
    RETURN b.pid AS id, b.name AS name, b.name_he AS name_he, b.timeline_date_from AS date_from,
           b.timeline_date_to AS date_to, b.lat AS lat, b.lon AS lon, b.theater_canonical AS theater,
           b.wiki_title AS wiki_title
    ORDER BY date_from LIMIT $limit`, { from, to, theater, limit });
  return json({ ok: true, count: rows.length, battles: rows });
}

async function battle({ env, params }) {
  const rows = await run(env, `
    MATCH (b:Battle {pid: $id})
    OPTIONAL MATCH (f:AtlasFact)-[:ABOUT_BATTLE]->(b)
    WITH b, collect(f { .text, .confidence, .fact_class, .src_title })[..40] AS facts
    OPTIONAL MATCH (c:CasualtyFigure)-[:CASUALTIES_AT]->(b)
    WITH b, facts, collect(c { .category, .quantity, .quantity_min, .quantity_max, .side_index, .uncertainty })[..40] AS casualties
    OPTIONAL MATCH (u:Unit)-[:FOUGHT_IN_BATTLE|PARTICIPATED_ORBAT|FOUGHT_IN]->(b)
    WITH b, facts, casualties, collect(DISTINCT u { id: u.pid, .name, .nation, .echelon_canonical })[..80] AS units
    OPTIONAL MATCH (cmd:Commander)-[:COMMANDED_AT]->(b)
    RETURN b { .*, id: b.pid } AS battle, facts, casualties, units,
           collect(DISTINCT cmd { id: cmd.pid, .name, .rank, .nation })[..40] AS commanders`, { id: params[1] });
  if (!rows.length) return json({ ok: false, error: 'not found' }, 404);
  return json({ ok: true, ...rows[0] });
}

async function entity({ env, params }) {
  const rows = await run(env, `
    MATCH (n:Public {pid: $id})
    OPTIONAL MATCH (n)-[r]-(m:Public)
    WITH n, collect({ type: type(r), outgoing: startNode(r) = n, id: m.pid,
                      labels: [l IN labels(m) WHERE l <> 'Public'],
                      name: coalesce(m.name, m.title, m.vessel_name, m.label, left(m.text, 120)) })[..100] AS neighbours
    RETURN [l IN labels(n) WHERE l <> 'Public'] AS labels, properties(n) AS properties, neighbours`,
    { id: params[1] });
  if (!rows.length) return json({ ok: false, error: 'not found' }, 404);
  return json({ ok: true, id: params[1], ...rows[0] });
}

async function search({ env, url }) {
  const q = text(url.searchParams.get('q'), 200);
  if (!q) throw new BadRequest('q is required');
  const limit = clamp(url.searchParams.get('limit'), 1, 50, 20);
  const rows = await run(env, `
    CALL db.index.fulltext.queryNodes('public_names', $q, {limit: $limit}) YIELD node, score
    RETURN node.pid AS id, [l IN labels(node) WHERE l <> 'Public'] AS labels,
           coalesce(node.name, node.title, node.vessel_name, node.label) AS name, score`,
    { q: luceneEscape(q), limit });
  return json({ ok: true, results: rows });
}

async function delivers({ env }) {
  const rows = await run(env, `
    MATCH (d:Driver)
    OPTIONAL MATCH (d)-[:DRIVER_CURRENT_VERSION]->(v:DriverVersion)
    RETURN d.driver_id AS driver_id, d.name AS name, d.status AS status, d.enabled AS enabled,
           'Deliver' IN labels(d) AS is_deliver, v.version AS version, v.executor_type AS executor_type,
           v.capability_signature AS capability_signature
    ORDER BY driver_id`);
  return json({ ok: true, count: rows.length, delivers: rows });
}

async function deliver({ env, params }) {
  const rows = await run(env, `
    MATCH (d:Driver {driver_id: $id})
    OPTIONAL MATCH (d)-[:DRIVER_HAS_VERSION]->(v:DriverVersion)
    WITH d, v ORDER BY v.version DESC
    WITH d, collect(v { .version, .status, .executor_type, .capability_signature, .spec_json,
                        .graph_policy_json, .evidence_policy_json, .budget_policy_json })[..10] AS versions
    OPTIONAL MATCH (d)-[:DRIVER_CURRENT_VERSION]->(:DriverVersion)-[:HAS_LISTENER]->(l:DeliverListener)
    RETURN d { .driver_id, .name, .status, .enabled, .routing_mode } AS deliver, versions,
           collect(l { .listener_id, .event_types, .keywords_any, .priority }) AS listeners`, { id: params[1] });
  if (!rows.length) return json({ ok: false, error: 'not found' }, 404);
  return json({ ok: true, ...rows[0] });
}

// Map layers. Each query builds one JSON payload in the shape the map's layers already read.
// The graph's response envelope is passed through untouched (no parsing here), so large layers
// cost the Worker almost no CPU; the browser unwraps data.values[0][0]. Responses are edge-cached.
const DAY = "duration.inDays(date('1937-01-01'), date(substring(toString($v), 0, 10))).days";
const day = (expr) => DAY.replace('$v', expr);

const MAP_QUERIES = {
  battles: `
    MATCH (b:Battle) WHERE b.lat IS NOT NULL AND b.lon IS NOT NULL AND b.day_from IS NOT NULL
    OPTIONAL MATCH (b)-[:PART_OF]->(c:Campaign)
    OPTIONAL MATCH (b)-[:PART_OF]->(parent:Battle)
    WITH b, head(collect(c.name)) AS campaign, head(collect(coalesce(parent.name_he, parent.name))) AS par
    WITH collect({ id: b.pid, n: coalesce(b.name_he, b.name), he: b.name_he IS NOT NULL, en: b.name,
                   x: b.lon, y: b.lat, cmp: campaign, cmpn: null, frt: b.theater, th: b.theater_canonical,
                   par: par, prec: b.date_precision, anc: b.day_from, ff: b.day_from, fk: 'fall', dff: 0,
                   f: b.day_from, e: coalesce(b.day_to, b.day_from), cas: b.cas_max, casmin: b.cas_min,
                   oob: [], bl: [], rt: [], rk: 0, sk: 0 }) AS battles
    RETURN { metadata: { derivation: 'public_graph', source_ids: ['ww2_atlas_public_graph'], domain: 'battles' },
             battles: battles, standalone_oob: [] } AS payload`,
  places: `
    CALL () {
      MATCH (s:Camp) WHERE s.lat IS NOT NULL AND s.lon IS NOT NULL
      RETURN collect({ id: s.pid, name: s.name, position: [s.lon, s.lat], type: s.type, day_from: null, day_to: null,
                       deaths_min: s.deaths_min, deaths_max: s.deaths_max, population: s.peak_population,
                       parent: null, rail_km: null }) AS sites
    }
    CALL () {
      MATCH (c:City) WHERE c.jewish_pop IS NOT NULL AND c.lat IS NOT NULL
      RETURN collect({ n: c.name, x: c.lon, y: c.lat, jpop: c.jewish_pop, d0: c.ghetto_from, d1: c.ghetto_to,
                       kmin: c.killed_min, kmax: c.killed_max, dep: [], country: c.country_code, rail_km: c.rail_km,
                       fell: null, freed: null, holder: null, holder_cls: 'other', junction: 0, rank: 0 }) AS cities
    }
    RETURN { metadata: { derivation: 'public_graph', source_ids: ['ww2_atlas_public_graph'], domain: 'camps' },
             sites: sites, cities: cities } AS payload`,
  maritime: `
    MATCH (s:Sinking)
    WHERE s.lat IS NOT NULL AND s.lon IS NOT NULL AND coalesce(s.coordinate_safe_for_factual_answer, true)
      AND (s.day_index IS NOT NULL OR s.sunk_date IS NOT NULL)
    WITH collect({ id: s.pid, x: s.lon, y: s.lat, d: coalesce(s.day_index, ${day('s.sunk_date')}),
                   n: s.vessel_name, c: s.convoy, t: s.tonnage, cl: s.loss_class }) AS sinkings
    RETURN { metadata: { derivation: 'public_graph', source_ids: ['ww2_atlas_public_graph'], domain: 'supply_routes' },
             routes: [], sinkings: sinkings, transports: [] } AS payload`,
  infrastructure: `
    CALL () {
      MATCH (p:Plant) WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL AND coalesce(p.coordinate_safe_for_factual_answer, true)
      RETURN collect({ id: p.pid, n: p.name, x: p.lon, y: p.lat, ind: p.industry, c: p.country, side: p.side }) AS plants
    }
    CALL () {
      MATCH (r:AirRaid) WHERE r.lat IS NOT NULL AND r.target_name IS NOT NULL
      WITH r.target_name AS n, avg(r.lon) AS x, avg(r.lat) AS y, sum(coalesce(r.tons, 0)) AS t,
           min(r.day) AS d0, count(*) AS raids
      ORDER BY t DESC LIMIT 1500
      RETURN collect({ n: n, x: x, y: y, r: 0, t: toInteger(t), d0: d0, raids: raids }) AS targets
    }
    CALL () {
      MATCH (p:Port) WHERE p.lat IS NOT NULL
      RETURN collect({ n: p.name, x: p.lon, y: p.lat }) AS ports
    }
    RETURN { metadata: { derivation: 'public_graph', source_ids: ['ww2_atlas_public_graph'], domain: 'factories' },
             rail_interdictions: [], bombing_targets: targets, ports: ports, supply_ports: [],
             plants: plants, plant_links: [] } AS payload`,
};

async function mapLayer({ env, params }) {
  const res = await graphFetch(env, MAP_QUERIES[params[1]], {}, 20);
  if (!res.ok) throw new Error(`graph returned ${res.status}`);
  const out = new Response(res.body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  return out;
}

// Graph-RAG style retrieval: full-text over verified facts + entity names.
// Contract matches the build manager's GraphRagService (/pipeline/query).
async function pipelineQuery({ request, env }) {
  const body = await readJson(request, 20_000);
  const question = text(body.question, 12_000);
  if (!question) throw new BadRequest('question is required');
  const terms = searchTerms(question);
  if (!terms) return json({ ok: true, context: '', used_entity_names: [] });
  const rows = await run(env, `
    CALL db.index.fulltext.queryNodes('public_facts', $terms, {limit: 24}) YIELD node, score
    OPTIONAL MATCH (node)-[:ABOUT_BATTLE|ABOUT_UNIT]->(e)
    RETURN node.text AS text, node.src_title AS source, node.confidence AS confidence,
           collect(DISTINCT coalesce(e.name, e.title))[..3] AS entities, score
    ORDER BY score DESC`, { terms });
  const used = [...new Set(rows.flatMap((r) => r.entities).filter(Boolean))].slice(0, 30);
  const context = rows.map((r) =>
    `--- FACT (${r.source || 'source'}; confidence ${r.confidence ?? 'n/a'})\n${r.text}`).join('\n\n');
  return json({ ok: true, context, used_entity_names: used });
}

// Owner-only console: free-form, validated read Cypher.
async function consoleQuery({ request, env }) {
  if (!env.CONSOLE_KEY || env.CONSOLE_KEY.length < 32 || !timingSafeEqual(bearer(request), env.CONSOLE_KEY)) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  const body = await readJson(request, 40_000);
  const cypher = validateReadCypher(body.cypher);
  const parameters = body.parameters && typeof body.parameters === 'object' ? body.parameters : {};
  const maxRows = clamp(body.max_rows, 1, MAX_ROWS, 100);
  let result;
  try {
    result = await runRaw(env, cypher, parameters, clamp(body.timeout_seconds, 1, 15, 10));
  } catch (err) {
    if (err instanceof GraphError && err.status >= 400 && err.status < 500) throw new BadRequest(err.message.slice(0, 300));
    throw err;
  }
  const { fields, values } = result;
  const rows = values.slice(0, maxRows).map((row) => row.map(cell));
  return json({ ok: true, columns: fields, rows, count: rows.length, truncated: values.length > maxRows });
}

// ---------------------------------------------------------------- neo4j

async function run(env, statement, parameters = {}) {
  const { fields, values } = await runRaw(env, statement, parameters, DEFAULT_TIMEOUT_S);
  return values.map((row) => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
}

function graphFetch(env, statement, parameters, timeoutSeconds) {
  if (!env.NEO4J_QUERY_URL || !env.NEO4J_USER || !env.NEO4J_PASSWORD) {
    throw new Error('graph connection is not configured');
  }
  return fetch(env.NEO4J_QUERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Basic ' + btoa(`${env.NEO4J_USER}:${env.NEO4J_PASSWORD}`),
    },
    // accessMode Read: the database itself rejects any write (Neo.ClientError.Statement.AccessMode),
    // independent of the validation above. This is the real guarantee that nothing can write.
    body: JSON.stringify({ statement, parameters, accessMode: 'Read', maxExecutionTime: timeoutSeconds }),
  });
}

async function runRaw(env, statement, parameters, timeoutSeconds) {
  const res = await graphFetch(env, statement, parameters, timeoutSeconds);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.errors?.length) {
    // Logged server-side only; callers of public routes get a generic 500.
    throw new GraphError(payload.errors?.[0]?.message || `graph returned ${res.status}`, res.status);
  }
  return { fields: payload.data?.fields || [], values: payload.data?.values || [] };
}

// ---------------------------------------------------------------- helpers

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cors(res, env, request) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = request.headers.get('Origin');
  const value = allowed.includes('*') ? '*' : (origin && allowed.includes(origin) ? origin : allowed[0]);
  const out = new Response(res.body, res);
  out.headers.set('Access-Control-Allow-Origin', value);
  out.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  out.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (value !== '*') out.headers.append('Vary', 'Origin');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  out.headers.set('Referrer-Policy', 'no-referrer');
  out.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return out;
}

async function rateLimited(request, env) {
  if (!env.RATE_LIMITER) return false;
  const key = request.headers.get('CF-Connecting-IP') || 'anonymous';
  const { success } = await env.RATE_LIMITER.limit({ key });
  return !success;
}

async function readJson(request, maxBytes) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > maxBytes) throw new BadRequest('request body too large');
  const raw = await readCapped(request, maxBytes);
  try {
    const value = JSON.parse(raw || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new BadRequest('body must be a JSON object');
  }
}

async function readCapped(request, maxBytes) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new BadRequest('request body too large');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cell(v) {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function text(v, max) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function clamp(v, lo, hi, dflt) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

function isoDate(v, dflt) {
  if (!v) return dflt;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequest('dates must be YYYY-MM-DD');
  return v;
}

export function luceneEscape(s) {
  return s.replace(/[+\-!(){}[\]^"~*?:\\/&|]/g, (c) => '\\' + c);
}

export function searchTerms(question) {
  const words = (question.match(/[\p{L}\p{N}]{3,}/gu) || []).slice(0, 24);
  return words.map(luceneEscape).join(' OR ');
}
