// Unit tests for the Worker with a fake graph (node --test). No network, no credentials.
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateReadCypher, CypherRejected } from '../src/cypher.js';

globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const worker = (await import('../src/index.js')).default;

function fakeGraph(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    const { fields, values } = handler(body);
    return new Response(JSON.stringify({ data: { fields, values } }), { status: 202 });
  };
  return calls;
}

const env = {
  NEO4J_QUERY_URL: 'https://example.databases.neo4j.io/db/neo4j/query/v2',
  NEO4J_USER: 'reader', NEO4J_PASSWORD: 'test-password', CONSOLE_KEY: 'k'.repeat(32),
};
const ctx = { waitUntil() {} };
const call = (path, init = {}, e = env) => worker.fetch(new Request('https://api.test' + path, init), e, ctx);

test('read cypher validation accepts reads and rejects writes', () => {
  assert.equal(validateReadCypher('MATCH (n) RETURN n LIMIT 1;'), 'MATCH (n) RETURN n LIMIT 1');
  assert.equal(validateReadCypher("MATCH (n {name:'CREATE'}) RETURN n"), "MATCH (n {name:'CREATE'}) RETURN n");
  for (const bad of ['CREATE (n) RETURN n', 'MATCH (n) DETACH DELETE n RETURN 1', 'MATCH (n) SET n.x=1 RETURN n',
                     'CALL db.labels()', 'MATCH (n) RETURN n; MATCH (m) RETURN m', 'LOAD CSV FROM "x" AS r RETURN r',
                     'MATCH (n) RETURN n /* */ ; DROP INDEX x', 'MATCH (n) WITH n MERGE (m) RETURN m']) {
    assert.throws(() => validateReadCypher(bad), CypherRejected, bad);
  }
});

test('battles endpoint passes parameters, never interpolates', async () => {
  const calls = fakeGraph(() => ({ fields: ['id', 'name'], values: [['0123456789abcdef', 'Kursk']] }));
  const res = await call('/battles?from=1943-07-01&to=1943-08-31&theater=Eastern%20Front');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.battles, [{ id: '0123456789abcdef', name: 'Kursk' }]);
  assert.equal(calls[0].body.parameters.theater, 'Eastern Front');
  assert.ok(!calls[0].body.statement.includes('Eastern'));
  assert.equal(calls[0].body.maxExecutionTime, 10);
});

test('bad dates are rejected before reaching the graph', async () => {
  const calls = fakeGraph(() => ({ fields: [], values: [] }));
  const res = await call("/battles?from=1943' OR 1=1");
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('console requires the owner key', async () => {
  const calls = fakeGraph(() => ({ fields: ['c'], values: [[1]] }));
  const body = JSON.stringify({ cypher: 'MATCH (n) RETURN count(n) AS c' });
  assert.equal((await call('/query', { method: 'POST', body })).status, 401);
  assert.equal((await call('/query', { method: 'POST', body, headers: { Authorization: 'Bearer wrong' } })).status, 401);
  const ok = await call('/query', { method: 'POST', body, headers: { Authorization: 'Bearer ' + env.CONSOLE_KEY } });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).rows, [['1']]);
  assert.equal(calls.length, 1);
});

test('console rejects writes even with the key', async () => {
  const calls = fakeGraph(() => ({ fields: [], values: [] }));
  const res = await call('/query', { method: 'POST', body: JSON.stringify({ cypher: 'MATCH (n) DETACH DELETE n' }),
                                     headers: { Authorization: 'Bearer ' + env.CONSOLE_KEY } });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('console is disabled when no key is configured', async () => {
  fakeGraph(() => ({ fields: [], values: [] }));
  const res = await call('/query', { method: 'POST', body: '{"cypher":"RETURN 1"}', headers: { Authorization: 'Bearer ' } },
                         { ...env, CONSOLE_KEY: '' });
  assert.equal(res.status, 401);
});

test('pipeline query returns the GraphRagService contract', async () => {
  const calls = fakeGraph(() => ({ fields: ['text', 'source', 'confidence', 'entities', 'score'],
                                   values: [['6th Army encircled', 'Battle of Stalingrad', 0.9, ['Battle of Stalingrad'], 3.2]] }));
  const res = await call('/pipeline/query', { method: 'POST', body: JSON.stringify({ question: 'Who was encircled at Stalingrad?' }) });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.match(body.context, /6th Army encircled/);
  assert.deepEqual(body.used_entity_names, ['Battle of Stalingrad']);
  assert.match(calls[0].body.parameters.terms, /Stalingrad/);
});

test('unknown routes and missing configuration fail closed', async () => {
  assert.equal((await call('/admin')).status, 404);
  const res = await call('/health', {}, {});
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { ok: false, error: 'internal error' });
});

test('map layers pass the graph envelope through and are cacheable', async () => {
  const calls = fakeGraph(() => ({ fields: ['payload'], values: [[{ battles: [{ id: 'a', f: 1195 }] }]] }));
  for (const layer of ['battles', 'places', 'maritime', 'infrastructure']) {
    const res = await call('/map/' + layer);
    assert.equal(res.status, 200, layer);
    const body = await res.json();
    assert.equal(body.data.values[0][0].battles[0].f, 1195);
    assert.match(res.headers.get('Cache-Control'), /max-age=86400/);
  }
  assert.equal(calls.length, 4);
  for (const c of calls) assert.doesNotMatch(c.body.statement, /\b(CREATE|MERGE|SET|DELETE)\b/);
  assert.equal((await call('/map/railways')).status, 404);
});

test('every query runs in a read-only transaction', async () => {
  const calls = fakeGraph(() => ({ fields: ['ok'], values: [[1]] }));
  await call('/health');
  await call('/battles');
  await call('/map/places');
  await call('/pipeline/query', { method: 'POST', body: JSON.stringify({ question: 'Stalingrad encirclement' }) });
  await call('/query', { method: 'POST', body: JSON.stringify({ cypher: 'MATCH (n) RETURN count(n) AS c' }),
                         headers: { Authorization: 'Bearer ' + env.CONSOLE_KEY } });
  assert.equal(calls.length, 5);
  for (const c of calls) assert.equal(c.body.accessMode, 'Read');
});

test('random query strings cannot bypass the edge cache', async () => {
  const keys = [];
  globalThis.caches = { default: { match: async (req) => { keys.push(req.url); }, put: async () => {} } };
  fakeGraph(() => ({ fields: ['payload'], values: [[{}]] }));
  await call('/map/battles?bust=1');
  await call('/map/battles?bust=2&x=y');
  await call('/battles?to=1943-01-01&junk=1&from=1942-01-01');
  assert.equal(keys[0], 'https://api.test/map/battles');
  assert.equal(keys[1], 'https://api.test/map/battles');
  assert.equal(keys[2], 'https://api.test/battles?from=1942-01-01&to=1943-01-01');
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
});

test('database error messages never reach public callers', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ errors: [{ code: 'Neo.ClientError.Statement.SyntaxError',
    message: 'Invalid input near secret_schema_detail' }] }), { status: 400 });
  const res = await call('/search?q=kursk');
  assert.equal(res.status, 400);
  assert.doesNotMatch(await res.text(), /secret_schema_detail/);
  globalThis.fetch = async () => new Response(JSON.stringify({ errors: [{ message: 'auth failed for user neo4j' }] }), { status: 401 });
  const auth = await call('/health');
  assert.equal(auth.status, 500);
  assert.doesNotMatch(await auth.text(), /neo4j|auth/);
});

test('oversized bodies are rejected without buffering them', async () => {
  const calls = fakeGraph(() => ({ fields: [], values: [] }));
  const big = JSON.stringify({ question: 'x'.repeat(30_000) });
  assert.equal((await call('/pipeline/query', { method: 'POST', body: big })).status, 400);
  assert.equal((await call('/pipeline/query', { method: 'POST', body: '{}', headers: { 'Content-Length': '999999999' } })).status, 400);
  assert.equal(calls.length, 0);
});

test('a short console key disables the console', async () => {
  fakeGraph(() => ({ fields: ['c'], values: [[1]] }));
  const weak = { ...env, CONSOLE_KEY: 'short' };
  const res = await call('/query', { method: 'POST', body: '{"cypher":"RETURN 1"}', headers: { Authorization: 'Bearer short' } }, weak);
  assert.equal(res.status, 401);
});

test('responses carry hardening headers', async () => {
  fakeGraph(() => ({ fields: ['ok'], values: [[1]] }));
  const res = await call('/health', { headers: { Origin: 'https://evil.example' } }, { ...env, ALLOWED_ORIGINS: 'https://pinchasrosenberg.github.io' });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://pinchasrosenberg.github.io');
  assert.match(res.headers.get('Vary'), /Origin/);
  assert.match(res.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('ship card endpoint: validated input, parameters only, card-shaped rows', async () => {
  const calls = fakeGraph(() => ({ fields: ['builders', 'city', 'label', 'wiki', 'vs', 'attacker'],
                                   values: [[['Blohm & Voss'], ['Hamburg'], 'Type VIIC', 'https://en.wikipedia.org/wiki/U-47', 'sourced', []]] }));
  const res = await call('/ship?n=U-47&d=1941-03-07');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.rows[0][0], ['Blohm & Voss']);
  assert.equal(calls[0].body.parameters.n, 'U-47');
  assert.doesNotMatch(calls[0].body.statement, /U-47/);
  assert.equal((await call('/ship?n=U-47&d=yesterday')).status, 400);
  assert.equal((await call('/ship?d=1941-03-07')).status, 400);
});

test('wiki endpoint: exact page by name, never anything but a Wikipedia/Wikidata URL', async () => {
  const calls = fakeGraph(() => ({ fields: ['title', 'qid', 'nation'], values: [['6th Army (Wehrmacht)', 'Q151208', null]] }));
  const res = await call('/wiki?kind=unit&name=6th%20Army&nation=Germany');
  assert.deepEqual(await res.json(), { ok: true, url: 'https://en.wikipedia.org/wiki/6th_Army_(Wehrmacht)' });
  assert.equal(calls[0].body.parameters.name, '6th Army');
  // a Soviet "6th Army" card must never link to the Wehrmacht page, and an unknown country never guesses
  assert.deepEqual(await (await call('/wiki?kind=unit&name=6th%20Army&nation=Soviet%20Union')).json(), { ok: true, url: null });
  assert.deepEqual(await (await call('/wiki?kind=unit&name=6th%20Army')).json(), { ok: true, url: null });
  const { pickUnitPage } = await import('../src/index.js');
  assert.equal(pickUnitPage([{ title: '5th Tank Army', qid: null, nation: 'Soviet Union' }], 'Soviet Union'), 'https://en.wikipedia.org/wiki/5th_Tank_Army');
  assert.equal(pickUnitPage([{ title: '5th Tank Army', qid: null, nation: null }], 'Soviet Union'), null);
  assert.equal(pickUnitPage([{ title: 'XX Corps (United Kingdom)' }, { title: 'XX Corps (United States)' }], 'United States'),
               'https://en.wikipedia.org/wiki/XX_Corps_(United_States)');
  assert.equal((await call('/wiki?kind=admin&name=x')).status, 400);
  const { wikiUrl } = await import('../src/index.js');
  assert.equal(wikiUrl({ title: null, qid: 'Q42' }), 'https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/Q42');
  assert.equal(wikiUrl({ title: null, qid: 'javascript:alert(1)' }), null);
  assert.equal(wikiUrl({ title: '"><script>', qid: null }), 'https://en.wikipedia.org/wiki/%22%3E%3Cscript%3E');
  assert.equal(wikiUrl(undefined), null);
});
