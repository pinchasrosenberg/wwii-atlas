/**
 * Lightweight build-time security policy checks from specification §12.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(ROOT, 'index.html'), 'utf8');

function filesBelow(path) {
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    return statSync(full).isDirectory() ? filesBelow(full) : [full];
  });
}

const sourceText = filesBelow(join(ROOT, 'src'))
  .filter((path) => /\.(js|css)$/.test(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}\n    ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('\nאבטחת build');

test('CSP חוסמת אובייקטים, ומסגור נחסם במקום שבו זה בכלל עובד', () => {
  assert.match(index, /object-src\s+'none'/);
  assert.match(index, /connect-src\s+'self'/);

  // ⚠️ ‏‏`frame-ancestors` **אינו פועל דרך `<meta>`** — הדפדפן מתעלם
  // ‏ממנו ורושם שגיאה בכל טעינה. הוא היה כתוב שם והבדיקה הזאת אכפה
  // ‏את קיומו, ושניהם יחד יצרו הגנה שנראתה קיימת ולא הייתה.
  const meta = index.match(
    /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  assert.ok(meta, 'אין CSP ב-meta');
  assert.doesNotMatch(meta[1], /frame-ancestors/,
    'הנחיה שהדפדפן מתעלם ממנה בתוך ה-meta מייצרת ביטחון מדומה');

  // ‏ההגנה עצמה חיה בשרת, ככותרת, שם היא באמת חלה.
  const server = readFileSync(new URL('./serve.py', import.meta.url), 'utf8');
  assert.match(server, /frame-ancestors 'none'/);
  assert.match(server, /"X-Frame-Options": "DENY"/);
  assert.match(server, /"X-Content-Type-Options": "nosniff"/);
  assert.match(server, /Content-Security-Policy/);
});

test('connect-src נפתח ל־API הציבורי של הגרף בלבד', () => {
  // ‏האתר הציבורי קורא את תוכן המלחמה רק מה־API לקריאה בלבד שמוגדר בתגית
  // ‏ww2-graph-api. אין גישה ל־localhost, לגשר מקומי או לכל מקור אחר.
  const policy = index.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)[1];
  const connect = policy.match(/connect-src([^;]*);/)[1].trim().split(/\s+/);
  const api = index.match(/<meta name="ww2-graph-api" content="([^"]*)"/)[1];
  assert.match(api, /^https:\/\/[^/]+$/);
  // ‏‏deck.gl מושך כל אייקון דרך fetch, גם data URL שנוצר בדפדפן.
  assert.deepEqual(connect.sort(), ["'self'", 'data:', api].sort());
  assert.doesNotMatch(policy, /localhost|127\.0\.0\.1/);
});

test('התלויות נטענות מאירוח עצמי', () => {
  assert.match(index, /type="module" src="\.\/vendor\/maplibre-global\.mjs"/);
  assert.match(index, /src="\.\/vendor\/deck\.gl\.min\.js"/);
  assert.doesNotMatch(index, /<script[^>]+https?:\/\//i);
});

test('אין הזרקת innerHTML בקוד המוצר', () => {
  assert.doesNotMatch(sourceText, /\.innerHTML\s*=/);
  assert.doesNotMatch(sourceText, /insertAdjacentHTML\s*\(/);
});

test('אין בקשות runtime ל-localhost', () => {
  assert.doesNotMatch(sourceText, /fetch\s*\(\s*['"`]https?:\/\/(?:localhost|127\.0\.0\.1)/i);
});

test('אין מפתחות או אסימונים חשודים בקוד הלקוח', () => {
  assert.doesNotMatch(sourceText, /(?:api[_-]?key|secret|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_-]{16,}/i);
});



// ‏‏---------------------------------------------------------------- מטמון
// ⚠️ ‏מפתחות הגרסה על ה-import היו **שבעה שונים** שתוחזקו ביד. מודול
// ‏ששונה בלי לעדכן את המפתח שלו נשאר במטמון הדפדפן, והאפליקציה נשברה
// ‏עם `does not provide an export named …` על מסך טעינה תקוע. עכשיו יש
// ‏מפתח אחד לכל הלקוח, והבדיקה הזאת נכשלת ברגע שמישהו מוסיף שני.
test('מפתח גרסה אחד לכל הלקוח', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|html)$/.test(entry)) files.push(full);
    }
  };
  walk(join(ROOT, 'src'));
  for (const page of readdirSync(ROOT)) {
    if (page.endsWith('.html')) files.push(join(ROOT, page));
  }
  const keys = new Set();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/\?v=([A-Za-z0-9._-]+)/g)) {
      keys.add(match[1]);
    }
  }
  assert.equal(keys.size, 1,
    `נמצאו ${keys.size} מפתחות גרסה: ${[...keys].join(', ')} — ` +
    'מודול ששונה בלי לעדכן את המפתח שלו נשאר במטמון ושובר את הטעינה');
});


// ⚠️ ‏מודול שמיובא **גם עם מפתח גרסה וגם בלי** נטען פעמיים כשני
// ‏מודולים נפרדים, עם שני מצבים נפרדים. זה קרה בפועל ל-`data-store.js`
// ‏ופשוט ביטל את המטמון המשותף שזה עתה נבנה — בלי שגיאה, רק בקשות
// ‏כפולות. הכלל: כל ייבוא יחסי בתוך src נושא את המפתח.
test('כל ייבוא יחסי נושא את מפתח הגרסה', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.js')) {
        const text = readFileSync(full, 'utf8');
        for (const m of text.matchAll(/(?:from|import\()\s*['"](\.[^'"]*\.js)(\?[^'"]*)?['"]/g)) {
          if (!m[2]) offenders.push(`${full} → ${m[1]}`);
        }
      }
    }
  };
  walk(join(ROOT, 'src'));
  assert.deepEqual(offenders, [],
    'ייבוא בלי מפתח גרסה נטען כמודול נפרד מזה שעם המפתח');
});


// ⚠️ ‏נוסתה שכבת אריחים מרוחקת, והיא נחסמה בסביבת ההרצה עד שהמפה
// ‏נתקעה על מסך הטעינה. ‏**תלות מרוחקת הפכה מפה שעבדה למפה שלא
// ‏נפתחת.** הבדיקה הזאת אוכפת שהאטלס נשאר עצמאי.
test('אין מקור מרוחק במדיניות ובסגנון הבסיס', async () => {
  const meta = index.match(
    /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
  // ‏המקור המרוחק היחיד המותר הוא ה־API של הגרף, ורק ב־connect-src. שאר
  // ‏הדירקטיבות (סקריפטים, סגנונות, תמונות, אריחים) נשארות מקומיות.
  const api = index.match(/<meta name="ww2-graph-api" content="([^"]*)"/)[1];
  const withoutConnect = meta.replace(/connect-src[^;]*;/, '');
  assert.doesNotMatch(withoutConnect, /https:\/\//,
    'מארח מרוחק במדיניות — האטלס מפסיק להיות עצמאי');
  assert.deepEqual([...meta.matchAll(/https:\/\/[^\s;]+/g)].map((m) => m[0]), [api]);
  const config = readFileSync(join(ROOT, 'src', 'config.js'), 'utf8');
  const styleTiles = [...config.matchAll(/tiles: \[([^\]]*)\]/g)].map((m) => m[1]);
  for (const tiles of styleTiles) {
    assert.doesNotMatch(tiles, /https?:/,
      'אריחים ממארח מרוחק: המפה תיעלם ברגע שהוא ייחסם');
  }
});

console.log(`\n${passed} בדיקות אבטחה עברו\n`);

test('כשל ב־API של הגרף מחזיר שכבה ריקה ואינו מפיל את המפה', async () => {
  globalThis.document = { querySelector: () => ({ content: 'https://api.example.test' }) };
  globalThis.fetch = async () => { throw new Error('offline'); };
  const store = await import('../src/core/data-store.js?v=api-failure');
  const battles = await store.loadJson('./data/legacy/battles.json');
  assert.deepEqual(battles.battles, []);
  assert.equal(store.graphApiState.status, 'unavailable');
  const rail = await store.loadJson('./data/legacy/railways.json');
  assert.deepEqual(rail.railways, []);
});
