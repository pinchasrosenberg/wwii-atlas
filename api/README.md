# Public graph API (Cloudflare Worker)

This is the only component that can reach the hosted graph. The map, the build manager and any other client talk to
this Worker over HTTPS. The Worker talks to Neo4j through its Query API, with credentials stored as Worker secrets.

## Endpoints

| Method & path | Returns |
|---|---|
| `GET /health` | liveness plus a round-trip to the graph |
| `GET /entities/stats` | node, relationship and fact counts |
| `GET /battles?from=YYYY-MM-DD&to=YYYY-MM-DD&theater=&limit=` | battles active in a time window |
| `GET /battle/{id}` | one battle with its facts, casualties, units and commanders |
| `GET /entity/{id}` | any node with up to 100 neighbours |
| `GET /search?q=` | full-text search over names |
| `GET /delivers`, `GET /delivers/{driver_id}` | the Delivers catalog, versions and listeners |
| `GET /map/{battles\|places\|maritime\|infrastructure}` | map layer payloads (graph envelope passed through, edge-cached for 24 h) |
| `POST /pipeline/query` `{question}` | Graph-RAG retrieval: ranked facts plus the entities they mention |
| `POST /query` `{cypher, parameters, max_rows}` | owner-only read console (needs `Authorization: Bearer $CONSOLE_KEY`) |

## Security model

* **The database enforces read-only.** Every query is sent with `accessMode: Read`, so Neo4j itself rejects any
  write (`Neo.ClientError.Statement.AccessMode`), whatever the query text says.
* **No injection.** Public routes run fixed, parameterised Cypher, and user input is never interpolated. Full-text
  input is Lucene-escaped.
* **The owner console** needs a 32+ character `CONSOLE_KEY` (constant-time compare). It also accepts only a single
  read statement: write clauses, `CALL`, `LOAD CSV`, `USE`, admin commands and multiple statements are rejected
  before reaching the database.
* **Bounded:** server-side `maxExecutionTime`, row caps, request bodies capped while streaming, and per-IP rate
  limiting (60 requests per minute).
* **Cache-safe:** edge-cache keys keep only the parameters a route reads, so random query strings can't bypass the
  cache and push heavy queries onto the graph.
* **Fail closed, quietly:** database errors are logged, never echoed to public callers. Missing configuration
  returns a generic 500, and unknown routes return 404.
* **Headers:** CORS limited to `ALLOWED_ORIGINS` (with `Vary: Origin`), `Content-Security-Policy: default-src 'none';
  frame-ancestors 'none'`, `nosniff`, `no-referrer` and HSTS.
* A daily cron does one trivial read so the free hosted graph is not paused for inactivity.

Generate the console key with `openssl rand -hex 32`.

## Deploy

```bash
npm install
npx wrangler login
npx wrangler secret put NEO4J_QUERY_URL     # https://<id>.databases.neo4j.io/db/neo4j/query/v2
npx wrangler secret put NEO4J_USER
npx wrangler secret put NEO4J_PASSWORD
npx wrangler secret put CONSOLE_KEY         # optional
npx wrangler deploy
```

## Test

```bash
npm test      # node --test, with a fake graph; no network and no credentials
```
