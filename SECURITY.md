# Security

## Reporting

Please report vulnerabilities privately through GitHub's **Report a vulnerability** (Security → Advisories) rather
than in a public issue.

## Security model

| Layer | Guarantee |
|---|---|
| Database | Holds only the curated public subset (see `graph/README.md`). It is reachable only from the API Worker, whose credentials are Worker secrets. |
| API (`api/`) | Every query runs with `accessMode: Read`, so the database itself rejects writes. Public routes use fixed, parameterised Cypher. The free-form console needs a 32+ character owner key and is validated as a single read statement. Requests are rate-limited per IP, bodies and rows are capped, execution time is bounded, cache keys are canonical, and database errors are never echoed to the public. |
| Map (`map/`) | Static timeline site. Its CSP allows data only from the API; no forms, plugins or base-URI changes. Leaflet is pinned with SRI, external links open with `noopener`, and Wikipedia links must be `https://*.wikipedia.org` or `wikidata.org`. `map/tools/check-site.mjs` enforces CSP, SRI and the absence of local references on every push. |
| Loader (`graph/`) | Writes only to encrypted, public, remote databases, and refuses one that contains non-public labels. |

