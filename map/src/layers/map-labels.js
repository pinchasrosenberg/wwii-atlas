/**
 * ‏פריסת תוויות — מי נכנס ומי נופל.
 *
 * ⚠️ **למה זה קיים בכלל**
 * ‏השכבות סיננו תוויות לפי **סף שטח קבוע**: בזום אירופה הסף היה 80,
 * ‏ובתקופה טיפוסית רק מדינה אחת עוברת אותו. כלומר מפה של אירופה
 * ‏ב-1942 הראתה שם אחד. שמות הערים היו כבויים מתחת לזום 5.5, ולכן
 * ‏חצי מרמות הזום היו מפה בלי אף שם — כתמי צבע.
 *
 * ‏אטלס אמיתי לא עובד עם סף. הוא מנסה לשים **הכול**, לפי סדר חשיבות,
 * ‏ומוותר רק כשאין מקום. זה מה שקורה כאן: תיבה לכל תווית, בדיקת
 * ‏חפיפה מול מה שכבר הונח, והראשון בתור מנצח.
 *
 * ‏המודול אינו יודע דבר על מלחמה, על deck.gl או על MapLibre. הוא מקבל
 * ‏מועמדים עם מיקום מסך ומחזיר את מי ששרד — ולכן אפשר לבדוק אותו במלואו.
 */

/** ‏רוחב טקסט משוער כשאין קנבס למדוד בו (בדיקות, ‏SSR). */
const AVERAGE_GLYPH = 0.54;

let measureCtx = null;

/**
 * ‏מדידת רוחב אמיתית כשיש דפדפן. ‏deck.gl מרנדר באטלס גופנים משלו,
 * ‏ולכן המדידה אינה מדויקת לפיקסל — היא רק צריכה להיות קרובה מספיק
 * ‏כדי שהתיבות לא ישקרו.
 */
export function measureText(text, size, family = 'Heebo, system-ui, sans-serif') {
  if (typeof document === 'undefined') return String(text).length * size * AVERAGE_GLYPH;
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  if (!measureCtx) return String(text).length * size * AVERAGE_GLYPH;
  measureCtx.font = `700 ${size}px ${family}`;
  return measureCtx.measureText(String(text)).width;
}

/**
 * ‏פורס תוויות לפי סדר העדיפות שבו הן הגיעו.
 *
 * ‏`candidates`: ‏{ id, text, size, anchor:[x,y] במסך, offset:[dx,dy],
 *                 align:'left'|'center', padding }
 * ‏מחזיר את אותם אובייקטים, רק את מי שנכנס, עם `box` מחושב.
 */
export function layoutLabels(candidates, {
  width, height, margin = 40, measure = measureText,
} = {}) {
  const placed = [];
  const boxes = [];
  for (const candidate of candidates) {
    const size = candidate.size || 12;
    const textWidth = candidate.width ?? measure(candidate.text, size);
    const [ax, ay] = candidate.anchor;
    const [dx, dy] = candidate.offset || [0, 0];
    const x = candidate.align === 'center' ? ax + dx - textWidth / 2 : ax + dx;
    const y = ay + dy;
    const pad = candidate.padding ?? 2;
    const box = {
      x0: x - pad, y0: y - size * 0.62 - pad,
      x1: x + textWidth + pad, y1: y + size * 0.62 + pad,
    };
    // ‏מחוץ למסך (בשוליים סבירים) — לא מנסים בכלל
    if (box.x1 < -margin || box.x0 > width + margin
        || box.y1 < -margin || box.y0 > height + margin) continue;
    let hit = false;
    for (const other of boxes) {
      if (box.x0 < other.x1 && box.x1 > other.x0
          && box.y0 < other.y1 && box.y1 > other.y0) { hit = true; break; }
    }
    if (hit) continue;
    boxes.push(box);
    placed.push({ ...candidate, size, width: textWidth, box, position: [x, y] });
  }
  return placed;
}

/**
 * ‏גודל גופן לשם מדינה: לפי שטח, ונסוג בזום עירוני.
 *
 * ⚠️ ‏בלי הנסיגה, ״גרמניה״ בגודל 25 בזום 9 מתחרה בשמות הערים ומנצח
 * ‏אותם — ואז רואים מדינה אחת ענקית ואף עיר.
 */
//: ‏שטח המדינה הגדולה בנתונים. הסקאלה מנורמלת אליו ולא לקבוע שרירותי.
const LARGEST_POLITY_AREA = 700;

export function polityFontSize(area, zoom) {
  // ⚠️ ‏הנוסחה הראשונה הייתה `min(sqrt(area) * 1.5, 10.5)`, וכל שטח מעל
  // ‏‏49 קיבל בדיוק את אותו גודל — כלומר ברית המועצות ובלגיה נראו זהות.
  // ‏נרמול לשורש של השטח הגדול ביותר פורש את כל הטווח.
  const ratio = Math.min(Math.sqrt(Math.max(area, 0))
                       / Math.sqrt(LARGEST_POLITY_AREA), 1);
  const base = 11 + 9 * ratio;
  const scaled = base * (zoom >= 8 ? 0.72 : 1);
  return Math.round(Math.max(11, Math.min(scaled, 25)));
}

/** ‏כמה שמות ערים בכלל שווה לנסות בזום נתון. */
export function cityBudget(zoom) {
  if (zoom < 4) return 0;
  if (zoom < 5) return 26;
  if (zoom < 6) return 46;
  if (zoom < 7) return 70;
  if (zoom < 8) return 110;
  if (zoom < 9) return 150;
  return 200;
}

/** ‏האם שם המדינה עדיין רלוונטי בזום הזה. */
export function polityVisible(area, zoom) {
  return !(zoom >= 10 && area < 40);
}
