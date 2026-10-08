# Security

## Reporting

Please report vulnerabilities privately through GitHub's **Report a vulnerability** (Security → Advisories) rather
than in a public issue.

## Security model

| Layer | Guarantee |
|---|---|
| Database | Holds only the curated public subset (see `graph/README.md`). It is reachable only from the API Worker, whose credentials are Worker secrets. |
| API (`api/`) | Every query runs with `accessMode: Read`, so the database itself rejects writes. Public routes use fixed, parameterised Cypher. The free-form console needs a 32+ character owner key and is validated as a single read statement. Requests are rate-limited per IP, bodies and rows are capped, execution time is bounded, cache keys are canonical, and database errors are never echoed to the public. |
| Map (`map/`) | Static site with a strict CSP (`script-src 'self'`). The only remote origin is the API, and only in `connect-src`. No `innerHTML` (enforced by a test), only `https:` links, and every library is self-hosted. If the API fails, the site still loads. |
| Loader (`graph/`) | Writes only to encrypted, public, remote databases, and refuses one that contains non-public labels. |

## Known, accepted advisories

* `deck.gl` 9.0.35 → `@loaders.gl/zip` → `fflate` 0.7.x (GHSA-px8p-9vwx-vf98): an infinite loop on malformed
  ZIP64 archives. The atlas never loads ZIP or 3D-tile data, so this code path is unreachable. Newer deck.gl
  releases currently pull in more advisories, not fewer.
