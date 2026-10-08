import assert from 'node:assert/strict';
import {
  breathe, easeInOutCubic, easeOutBack, easeOutCubic, eventIntensity,
  partialPath, revealFraction, staggerOffset,
} from '../src/layers/scene-motion.js';

// -- easing ------------------------------------------------------------------
for (const ease of [easeInOutCubic, easeOutCubic]) {
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.equal(ease(-5), 0, 'clamped below');
  assert.equal(ease(5), 1, 'clamped above');
}
assert.ok(Math.abs(easeInOutCubic(0.5) - 0.5) < 1e-9, 'symmetric at the midpoint');
{
  // the whole point of easing: slow at the ends, fast in the middle
  const early = easeInOutCubic(0.1) - easeInOutCubic(0.0);
  const middle = easeInOutCubic(0.55) - easeInOutCubic(0.45);
  assert.ok(middle > early * 2, 'motion accelerates instead of running flat');
}
assert.ok(easeOutBack(0.75) > 1, 'back easing overshoots before settling');
assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-9, 'and still lands exactly on target');

// -- breathing ---------------------------------------------------------------
{
  const period = 2;
  assert.ok(breathe(0, period) < 0.01, 'starts closed');
  assert.ok(breathe(period / 2, period) > 0.99, 'fully open at half a period');
  assert.ok(breathe(period, period) < 0.01, 'and closes again');
  // ‏אותו זמן, אותו ערך — האנימציה לא תלויה במצב פנימי
  assert.equal(breathe(0.7, period), breathe(0.7, period));
  for (let t = 0; t < 6; t += 0.13) {
    const v = breathe(t, period);
    assert.ok(v >= 0 && v <= 1, 'stays inside its range');
  }
}
{
  // ‏היסט מפזר את הפעימה במקום שהכול יהבהב יחד
  const a = staggerOffset('battle:kursk');
  const b = staggerOffset('battle:bagration');
  assert.notEqual(a, b, 'different entities get different phases');
  assert.equal(a, staggerOffset('battle:kursk'), 'and the phase is stable');
  assert.ok(a >= 0 && a < 1);
  assert.equal(staggerOffset(''), staggerOffset(null), 'a missing id is not a crash');
  const spread = new Set(Array.from({ length: 50 },
    (_, i) => Math.floor(staggerOffset(`unit:${i}`) * 10)));
  assert.ok(spread.size >= 6, 'the phases actually spread out');
}

// -- event intensity ---------------------------------------------------------
{
  const props = { day_from: 100, day_to: 104 };
  assert.equal(eventIntensity(props, 100), 1, 'full on the first day');
  assert.equal(eventIntensity(props, 104), 1, 'and on the last');
  assert.ok(eventIntensity(props, 110) > 0, 'still glowing shortly after');
  assert.ok(eventIntensity(props, 110) < 1, 'but weaker');
  assert.equal(eventIntensity(props, 200), 0, 'a battle two months gone is quiet');
  assert.ok(eventIntensity(props, 96) > 0, 'and it warns shortly before, symmetrically');
  assert.equal(eventIntensity({}, 100), 0.35, 'an undated event is steady, not flashing');
}

// -- progressive reveal ------------------------------------------------------
{
  const props = { day_from: 100, day_to: 200 };
  assert.equal(revealFraction(props, 50), 0);
  assert.equal(revealFraction(props, 300), 1);
  assert.ok(Math.abs(revealFraction(props, 150) - 0.5) < 1e-9);
  assert.equal(revealFraction({ day_from: 100 }, 150), 1, 'no end date means fully drawn');
  assert.equal(revealFraction({ day_from: 100, day_to: 100 }, 100), 1,
    'a single-day line is not divided by zero');
}
{
  const path = [[0, 0], [10, 0], [20, 0]];
  assert.deepEqual(partialPath(path, 1), path);
  assert.deepEqual(partialPath(path, 0), []);
  const half = partialPath(path, 0.5);
  assert.deepEqual(half[half.length - 1], [10, 0], 'ends exactly at the halfway point');
  const quarter = partialPath(path, 0.25);
  assert.deepEqual(quarter[quarter.length - 1], [5, 0], 'and interpolates inside a segment');
  assert.deepEqual(partialPath([[3, 3]], 0.5), [], 'a single point is not a path');
  assert.equal(partialPath([[1, 1], [1, 1]], 0.5).length, 2,
    'a zero-length path degrades instead of dividing by zero');
}

console.log('test-scene-animation.mjs ✓');
