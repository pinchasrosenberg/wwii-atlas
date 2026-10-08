/**
 * ‏דירוג ביצועים — ומה שהוא עשה למפה בלי שאיש ביקש.
 *
 * ‏נמדד בדפדפן על ‏M5 עם ‏WebGL2 ו-32GB זיכרון: הזיהוי מחזיר `full`,
 * ‏אבל אחרי כמה שניות שהחלון אינו בפוקוס המפה מדווחת ‏0 FPS, יורדת
 * ‏פעמיים, ומגיעה ל-`minimal` — ושם פאנל השכבות מסרב להדליק שכבות
 * ‏ואומר ״הגעת למגבלת השכבות״. המשתמש רק עבר לאפליקציה אחרת.
 */
import assert from 'node:assert/strict';
import { PerfMonitor, TIER, nextTierDown, nextTierUp } from '../src/core/perf-tier.js';

function monitorFor(options = {}) {
  const events = { down: [], up: [], samples: [] };
  const monitor = new PerfMonitor({
    onDowngrade: (fps) => events.down.push(fps),
    onRecover: (fps) => events.up.push(fps),
    onSample: (fps) => events.samples.push(fps),
    schedule: () => 0, cancel: () => {},
    ...options,
  });
  monitor._reset(0);
  return { monitor, events };
}

/** ‏מריץ פריימים בקצב נתון לאורך זמן נתון. */
function run(monitor, { fps, ms, from = 0 }) {
  const step = 1000 / fps;
  let now = from;
  const until = from + ms;
  while (now < until) {
    now += step;
    monitor.frame(now);
  }
  return now;
}

// -- ‏‏60 FPS: שום דבר לא קורה --------------------------------------------
{
  const { monitor, events } = monitorFor({ recoverMs: 1e9 });
  run(monitor, { fps: 60, ms: 6000 });
  assert.equal(events.down.length, 0, 'ירידת דרג ב-60 FPS');
  assert.ok(events.samples.every((s) => s > 50));
}

// -- ‏מכונה איטית באמת: כן יורדת -------------------------------------------
{
  const { monitor, events } = monitorFor();
  run(monitor, { fps: 8, ms: 5000 });
  assert.ok(events.down.length >= 1, 'מכונה שבאמת מגמגמת חייבת לרדת דרג');
}

// -- ‏חלון מוסתר: אסור שייחשב כמכונה איטית ---------------------------------
{
  let hidden = false;
  const { monitor, events } = monitorFor({ isHidden: () => hidden });
  let now = run(monitor, { fps: 60, ms: 2000 });

  // ‏המשתמש עבר לאפליקציה אחרת. ‏rAF נחנק: פריים אחד לשנייה, עשר שניות.
  hidden = true;
  for (let i = 0; i < 10; i += 1) { now += 1000; monitor.frame(now); }
  assert.equal(events.down.length, 0,
    'חלון מוסתר הוריד דרג — המשתמש רק עבר לאפליקציה אחרת');

  // ‏חזר. הקצב בריא, ואסור שהחלון המוסתר יזלוג לתוך המדידה הראשונה.
  hidden = false;
  run(monitor, { fps: 60, ms: 3000, from: now });
  assert.equal(events.down.length, 0, 'שאריות של חלון מוסתר גלשו למדידה');
}

// -- ‏חלון שנחנק בלי דגל hidden (throttling של הדפדפן) ---------------------
{
  const { monitor, events } = monitorFor({ isHidden: () => false });
  let now = run(monitor, { fps: 60, ms: 1500 });
  // ‏שמונה ״פריימים״ במרווח של שנייה — הדפדפן הפסיק לצייר.
  for (let i = 0; i < 8; i += 1) { now += 1000; monitor.frame(now); }
  assert.equal(events.down.length, 0,
    'חלון של פריים אחד לשנייה הוא דפדפן שנחנק, לא GPU איטי');
}

// -- ‏החזרה למעלה ----------------------------------------------------------
{
  const { monitor, events } = monitorFor({ recoverFps: 50, recoverMs: 3000 });
  run(monitor, { fps: 60, ms: 6000 });
  assert.ok(events.up.length >= 1, 'קצב בריא לאורך זמן חייב להחזיר דרג');
}
{
  // ‏קצב בינוני — לא יורד, וגם לא מטפס
  const { monitor, events } = monitorFor({ recoverFps: 50, recoverMs: 3000 });
  run(monitor, { fps: 30, ms: 8000 });
  assert.equal(events.down.length, 0);
  assert.equal(events.up.length, 0, 'קצב בינוני אינו עילה להעלות דרג');
}

// -- ‏תקרת הדרג ------------------------------------------------------------
{
  assert.equal(nextTierUp(TIER.MINIMAL, TIER.FULL), TIER.REDUCED);
  assert.equal(nextTierUp(TIER.REDUCED, TIER.FULL), TIER.FULL);
  assert.equal(nextTierUp(TIER.FULL, TIER.FULL), TIER.FULL);
  // ‏מכונה שזוהתה כחלשה לא מטפסת מעל מה שזוהה לה, גם אחרי דקה שקטה.
  assert.equal(nextTierUp(TIER.MINIMAL, TIER.MINIMAL), TIER.MINIMAL);
  assert.equal(nextTierUp(TIER.REDUCED, TIER.REDUCED), TIER.REDUCED);
  assert.equal(nextTierDown(TIER.FULL), TIER.REDUCED);
  assert.equal(nextTierDown(TIER.MINIMAL), TIER.MINIMAL);
}

// -- ‏עלייה וירידה אינן יכולות לרוץ יחד ------------------------------------
{
  const { monitor, events } = monitorFor({ recoverFps: 50, recoverMs: 2000 });
  let now = run(monitor, { fps: 60, ms: 3000 });
  now = run(monitor, { fps: 5, ms: 4000, from: now });
  assert.ok(events.down.length >= 1);
  const upsAfterDown = events.up.length;
  now = run(monitor, { fps: 5, ms: 3000, from: now });
  assert.equal(events.up.length, upsAfterDown, 'עלייה נספרה בזמן קצב נמוך');
}

console.log('✅ דירוג ביצועים: הסתרה, חניקה, ירידה אמיתית והחזרה');
