/**
 * ‏פלטת האטלס — מקור אמת אחד לצבע.
 *
 * ‏מבוססת על שלושה דברים שנקראו ולא נוחשו:
 *
 * 1. **Okabe-Ito** — הפלטה שנשארת נבדלת בכל סוגי עיוורון הצבעים. הגוונים
 *    ‏שלה הם הבסיס לצדדים, כי צד שלא ניתן להבחין בו הוא באג נגישות ולא
 *    ‏העדפה אסתטית.
 * 2. **קרטוגרפיה היסטורית** — קרקע פרגמנט חמה, מילויים עמומים, דיו סֶפְּיָה.
 *    ‏הצבעים הרוויים נשמרים לנתונים בלבד; הרקע לעולם אינו מתחרה בהם.
 * 3. **הרמוניה ולא אחוזים** — אשכול אנלוגי אחד (חום־כתום־אדמה) עם מבטא
 *    ‏משלים קטן (כחול). ״הצבע לא מחולק לפי שטח אלא לפי מה שצריך לבלוט״.
 *
 * ‏הכלל שמחזיק את הכול: **הצורה נושאת את המשמעות, הצבע רק מחזק אותה.**
 * ‏צופה עם עיוורון צבעים חייב לקרוא את המפה נכון גם בלי שום צבע.
 */

/** גווני הבסיס. אלה ועוד הנגזרות שלהם — שום צבע אחר בקוד. */
export const HUES = {
  // ‏ציר וברית: ורמיליון מול כחול. הזוג הכי נבדל ב-Okabe-Ito.
  axis: '#c1552f',
  allies: '#2f6f9f',
  soviet: '#a83f3a',
  neutral: '#8a8478',
  unknown: '#9a9284',

  // ‏תחומים — כל אחד מבודד מהשניים שלמעלה
  naval: '#4f93a8',
  air: '#d99a3c',
  fronts: '#e0743f',
  events: '#e0b040',
  logistics: '#8a8066',
  persecution: '#a8506a',
  places: '#7f8d6a',
  // ‏ביצור הוא אבן, לא צד ולא אירוע. גוון אפור־חום חם שאינו מתחרה
  // ‏בקרבות ואינו נקרא כשטח כבוש.
  fortification: '#8d8072',
  context: '#7a746a',
};

/** דיו והילה — הבסיס לטכניקת ה-casing. */
export const INK = {
  /** מתאר כהה שנותן לסמל קצה מוגדר מעל כל רקע. */
  outline: '#2b2721',
  /** הילה בהירה שמפרידה את הסמל מהשטח שמתחתיו. */
  halo: '#f6f1e6',
  /** טקסט על הקרקע החמה. */
  label: '#3a332b',
  labelHalo: '#faf6ec',
};

/**
 * ‏עוצמת הטענה. זה **לא** מדד יופי אלא מדד ראיה, ולכן הוא משנה מילוי
 * ‏וקו־מקווקו — לא גוון. שינוי גוון היה גורם לקורא לחשוב שמדובר בצד אחר.
 */
export const CLAIM = {
  // ‏‏`ink` היא עוצמת האיור עצמו ו-`wash` היא כמה הוא מולבן לכיוון הקרקע.
  // ‏שני הערכים יחד הם מה שגורם להערכה להיראות כמו הערכה כבר במבט חטוף:
  // ‏טענה מפורשת היא ציור מלא, הקשר הוא רמז חיוור.
  explicit: { fill: 1.00, ink: 1.00, wash: 0.00, stroke: 1.00, dash: null, width: 1.7, halo: 1.0 },
  derived: { fill: 1.00, ink: 0.78, wash: 0.22, stroke: 0.98, dash: null, width: 1.8, halo: 0.9 },
  estimated: { fill: 0.26, ink: 0.42, wash: 0.46, stroke: 0.95, dash: [4, 3], width: 1.9, halo: 0.8 },
  context: { fill: 0.12, ink: 0.26, wash: 0.62, stroke: 0.70, dash: [2, 3], width: 1.4, halo: 0.6 },
  unknown: { fill: 0.10, ink: 0.22, wash: 0.70, stroke: 0.60, dash: [1, 2], width: 1.3, halo: 0.5 },
};

export function hexToRgb(hex) {
  const value = parseInt(String(hex).slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function withAlpha(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * ‏הבהרה/הכהיה בערוץ הבהירות בלבד, כדי שהגוון לא ינדוד.
 * @param {string} hex
 * @param {number} amount ‏חיובי = בהיר יותר, שלילי = כהה יותר, בטווח 1-.. 1
 */
export function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const mix = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const channel = (c) => Math.round(c + (mix - c) * t);
  const hexed = (c) => channel(c).toString(16).padStart(2, '0');
  return `#${hexed(r)}${hexed(g)}${hexed(b)}`;
}

/** ‏גרסה בהירה יותר להילה של אותו צבע — ה-casing של הקווים. */
export function casingOf(hex) {
  return shade(hex, -0.55);
}
