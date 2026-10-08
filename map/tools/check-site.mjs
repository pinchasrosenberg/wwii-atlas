// Static checks for the public map (no browser, no network). Run: node map/tools/check-site.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'ww2_timeline_map.html'), 'utf8');
const problems = [];
const fail = (msg) => problems.push(msg);

// 1. every local script the page loads exists and parses
const scripts = [...html.matchAll(/<script[^>]+src="\.\/([^"?]+)/g)].map((m) => m[1]);
for (const s of scripts) {
  if (!existsSync(join(ROOT, s))) { fail(`missing script ${s}`); continue; }
  try { execFileSync(process.execPath, ['--check', join(ROOT, s)], { stdio: 'pipe' }); }
  catch (e) { fail(`syntax error in ${s}: ${String(e.stderr).split('\n')[0]}`); }
}
if (scripts.length < 20) fail(`expected the timeline overlays, found only ${scripts.length} scripts`);

// 2. strict-enough CSP: one API origin for data, nothing that can post anywhere else
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] || '';
if (!csp) fail('Content-Security-Policy is missing');
const connect = csp.match(/connect-src ([^;]+)/)?.[1] || '';
for (const src of connect.trim().split(/\s+/)) {
  if (!["'self'", 'https://s3.amazonaws.com'].includes(src) && !/^https:\/\/ww2-atlas-api\.[a-z0-9-]+\.workers\.dev$/.test(src)) {
    fail(`unexpected connect-src origin ${src}`);
  }
}
for (const d of ["object-src 'none'", "base-uri 'none'", "form-action 'none'"]) if (!csp.includes(d)) fail(`CSP lacks ${d}`);

// 3. third-party code is pinned with Subresource Integrity
for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https:\/\/unpkg\.com[^"]+)"[^>]*>/g)) {
  if (!/integrity="sha384-/.test(m[0])) fail(`no SRI on ${m[1]}`);
}

// 4. nothing in the shipped files points at the author's machine
const shipped = ['ww2_timeline_map.html', ...readdirSync(ROOT).filter((f) => f.endsWith('.js'))];
for (const f of shipped) {
  const text = readFileSync(join(ROOT, f), 'utf8');
  for (const bad of [/https?:\/\/(127\.0\.0\.1|localhost):87\d\d/, /\/Users\//, /Desktop\//]) {
    if (bad.test(text)) fail(`${f} references the local machine (${bad})`);
  }
}

if (problems.length) { console.error(problems.map((p) => '✗ ' + p).join('\n')); process.exit(1); }
console.log(`✓ map site OK: ${scripts.length} scripts parse, CSP and SRI in place, no local references`);
