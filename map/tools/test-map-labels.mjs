/**
 * ‏מנוע התוויות.
 *
 * ‏מה שהוא בא לתקן: השכבות סיננו תוויות לפי סף שטח קבוע, ובזום אירופה
 * ‏רק מדינה אחת בכל תקופה עברה את הסף — מפה של אירופה ב-1942 עם שם
 * ‏אחד. שמות הערים היו כבויים לגמרי מתחת לזום 5.5.
 */
import assert from 'node:assert/strict';
import {
  cityBudget, layoutLabels, measureText, polityFontSize, polityVisible,
} from '../src/layers/map-labels.js';

const measure = (text, size) => String(text).length * size * 0.5;
const frame = { width: 1000, height: 600, measure };

// -- ‏הבסיס: מה שנכנס נכנס -------------------------------------------------
{
  const out = layoutLabels([
    { id: 'a', text: 'ברלין', size: 12, anchor: [100, 100] },
    { id: 'b', text: 'המבורג', size: 12, anchor: [400, 300] },
  ], frame);
  assert.equal(out.length, 2);
  assert.ok(out[0].box && out[0].position);
}

// -- ‏חפיפה: הראשון בתור מנצח ----------------------------------------------
{
  const out = layoutLabels([
    { id: 'חשוב', text: 'ברלין', size: 14, anchor: [100, 100] },
    { id: 'פחות', text: 'פוטסדם', size: 12, anchor: [104, 102] },
  ], frame);
  assert.deepEqual(out.map((l) => l.id), ['חשוב'],
    'שתי תוויות זו על זו — רק הראשונה בתור נשארת');
}
{
  // ‏סדר הכניסה הוא סדר החשיבות, ולכן היפוך הסדר הופך את התוצאה
  const out = layoutLabels([
    { id: 'פחות', text: 'פוטסדם', size: 12, anchor: [104, 102] },
    { id: 'חשוב', text: 'ברלין', size: 14, anchor: [100, 100] },
  ], frame);
  assert.deepEqual(out.map((l) => l.id), ['פחות']);
}

// -- ‏קרוב אבל לא חופף — שתיהן נשארות --------------------------------------
{
  const out = layoutLabels([
    { id: 'a', text: 'ברלין', size: 12, anchor: [100, 100] },
    { id: 'b', text: 'ברלין', size: 12, anchor: [100, 140] },
  ], frame);
  assert.equal(out.length, 2, 'הפרדה אנכית סבירה נחסמה בטעות');
}

// -- ‏מחוץ למסך: לא נספר ולא חוסם ------------------------------------------
{
  const out = layoutLabels([
    { id: 'רחוק', text: 'ולדיווסטוק', size: 12, anchor: [5000, 300] },
    { id: 'קרוב', text: 'פריז', size: 12, anchor: [200, 300] },
  ], frame);
  assert.deepEqual(out.map((l) => l.id), ['קרוב'],
    'תווית מחוץ למסך אסור שתתפוס מקום למישהו על המסך');
}

// -- ‏עוגן, היסט ויישור ----------------------------------------------------
{
  const [label] = layoutLabels(
    [{ id: 'a', text: 'ליון', size: 10, anchor: [200, 200], offset: [9, 0] }], frame);
  assert.equal(label.position[0], 209, 'היסט אופקי לא הוחל');
}
{
  const [label] = layoutLabels(
    [{ id: 'a', text: 'ליון', size: 10, anchor: [200, 200], align: 'center' }], frame);
  assert.ok(label.position[0] < 200, 'יישור למרכז מזיז את נקודת ההתחלה שמאלה');
}

// -- ‏הסף הישן מול פריסה: זו כל הנקודה -------------------------------------
{
  // ‏שמונה מדינות אירופיות בזום 3.6, בפיזור סביר. הסף הישן היה משאיר
  // ‏רק את מי ששטחו ≥ 80 — כלומר אחת. הפריסה שמה את כולן.
  const areas = [692, 78, 77, 72, 63, 55, 53, 52];
  const candidates = areas.map((area, i) => ({
    id: `c${i}`, text: 'מדינה', size: polityFontSize(area, 3.6),
    anchor: [90 + i * 105, 120 + (i % 3) * 90], align: 'center',
  }));
  const out = layoutLabels(candidates, frame);
  assert.equal(out.length, 8,
    'מפה של אירופה חייבת להראות יותר משם אחד');
  assert.ok(out.filter((l) => areas[Number(l.id.slice(1))] < 80).length >= 6,
    'מדינות קטנות מהסף הישן חייבות להופיע כשיש להן מקום');
}

// -- ‏גודל לפי שטח, ונסיגה בזום עירוני -------------------------------------
{
  assert.ok(polityFontSize(692, 4) > polityFontSize(52, 4), 'שטח גדול = שם גדול');
  assert.ok(polityFontSize(692, 9) < polityFontSize(692, 4),
    'בזום עירוני שם המדינה חייב לסגת, אחרת הוא מנצח את שמות הערים');
  assert.ok(polityFontSize(0, 4) >= 11 && polityFontSize(1e6, 4) <= 25,
    'הגודל חייב להישאר בתחום קריא');
}

// -- ‏תקציב ערים לפי זום ---------------------------------------------------
{
  assert.equal(cityBudget(3), 0, 'בזום עולמי שמות ערים הם רעש');
  let previous = -1;
  for (const zoom of [4, 5, 6, 7, 8, 9]) {
    const budget = cityBudget(zoom);
    assert.ok(budget > previous, `התקציב אינו עולה בזום ${zoom}`);
    previous = budget;
  }
  assert.ok(cityBudget(5) > 0,
    'שמות ערים היו כבויים מתחת לזום 5.5 — חצי מרמות הזום בלי אף שם');
}

// -- ‏שם מדינה נעלם רק כשהוא באמת מיותר ------------------------------------
{
  assert.equal(polityVisible(692, 11), true, 'מדינה גדולה נשארת בכל זום');
  assert.equal(polityVisible(12, 11), false, 'מדינה זעירה בזום רחוב היא רעש');
  assert.equal(polityVisible(12, 6), true);
}

// -- ‏מדידה: לא קורסת בלי דפדפן -------------------------------------------
{
  const w = measureText('ברלין', 12);
  assert.ok(w > 0 && Number.isFinite(w));
}

console.log('✅ מנוע התוויות: פריסה, חפיפה, עדיפות, גודל ותקציב');

// ‏‏------------------------------------------------- התפר מול deck.gl
// ⚠️ ‏‏`TextLayer` בונה אטלס גופנים מקבוצת תווים, וברירת המחדל שלו
// ‏לטינית. שכבה עם טקסט עברי ובלי `characterSet` פשוט **אינה מציירת
// ‏כלום** — בלי שגיאה, בלי אזהרה, סתם מפה בלי שמות. בדיוק זה קרה
// ‏לשמות המדינות ולשמות הערים.
{
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.js')) files.push(full);
    }
  };
  walk(SRC);

  const offenders = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    // ‏כל בלוק שמתחיל ב-`new TextLayer({` ועד הסוגר המאזן הראשון
    for (const match of text.matchAll(/new TextLayer\(\{/g)) {
      let depth = 0;
      let i = match.index + match[0].length - 1;
      for (; i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') { depth -= 1; if (depth === 0) break; }
      }
      const block = text.slice(match.index, i + 1);
      const hasHebrew = /[֐-׿]/.test(block);
      const hebrewData = /name_he|\.name\b|item\.n\b|getText/.test(block);
      if ((hasHebrew || hebrewData) && !/characterSet/.test(block)) {
        offenders.push(`${file.split('/src/')[1]} @${match.index}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'שכבת טקסט בלי characterSet — טקסט עברי בה לא ייראה כלל');
}

console.log('✅ ‏כל שכבות הטקסט מצהירות characterSet');
