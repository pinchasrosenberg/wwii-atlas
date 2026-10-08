// Point the site at a deployed graph API: updates <meta name="ww2-graph-api"> and the CSP connect-src together.
//   node tools/set-api-url.mjs https://ww2-atlas-api.<account>.workers.dev
import { readFileSync, writeFileSync } from 'node:fs';

const url = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) {
  console.error('usage: node tools/set-api-url.mjs https://<host>');
  process.exit(2);
}
const file = new URL('../index.html', import.meta.url);
let html = readFileSync(file, 'utf8');
const current = html.match(/<meta name="ww2-graph-api" content="([^"]*)">/)[1];
html = html.replace(`<meta name="ww2-graph-api" content="${current}">`, `<meta name="ww2-graph-api" content="${url}">`);
html = html.replace(/(connect-src 'self' data: )[^;]*;/, `$1${url};`);
writeFileSync(file, html);
console.log(`graph API: ${current} -> ${url}`);
