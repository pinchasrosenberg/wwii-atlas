/**
 * ‏תוואי → צבע. אופן תובלה אחד נבחר, וכל תא נצבע לפי כמה הוא מקשה **עליו**.
 *
 * ⚠️ **למה בורר כלי ולא מספר אחד**
 * ‏‏5,936 מתוך 6,025 קטעי הנהר בסיווג `operational` הם גם נתיב שיט. אותו
 * ‏קטע עצמו הוא חסימה מוחלטת למשאית ועורק פתוח לדוברה. מפה שמציגה ״קושי
 * ‏תוואי״ במספר אחד חייבת לשקר על אחד מהם. לכן הבחירה היא של הצופה,
 * ‏והחלפה בין כלים היא החלפת שכבה מיידית — כל המקדמים כבר בתא.
 *
 * ⚠️ **תא פתוח מקבל רמז, לא כלום**
 * ‏הכלל הראשון היה ״1.0 שקוף לגמרי״, כדי שהעין תימשך רק לחיכוך. זה נכון
 * ‏מעל בסיס קרטוגרפי — אבל אריחי הבסיס של האטלס נגמרים ב-zoom 4, ובזום
 * ‏שבו שכבת התוואי בכלל שימושית (8 ומעלה) אין שום דבר מתחת. שם ״בלי
 * ‏מילוי״ נקרא בדיוק כמו ״מחוץ לרשת״ — כלומר תא שנמדד ונמצא פתוח נראה
 * ‏כמו אזור שאין עליו נתונים. לכן תא פתוח מקבל רמז חלש מאוד: מספיק כדי
 * ‏שהכיסוי ייקרא כגוף אחד, חלש מכל חיכוך.
 *
 * ⚠️ **״לא יודעים״ אינו נקודה על המדרג**
 * ‏תא בלי שום שכבת תוואי מחזיר 1.0 — אותו מספר כמו שדה שנמדד ונמצא פתוח.
 * ‏אילו הוא היה מקבל את אותו טיפול, ניחוש היה נראה בדיוק כמו מדידה. לכן
 * ‏הוא יוצא מהמדרג לגמרי: בלי מילוי, עם מסגרת מקווקוות בלבד.
 */

/** ‏האופנים, בסדר שבו הם מוצגים לצופה. חייב להתאים ל-TRANSPORT_MODES בשרת. */
export const TRANSPORT_MODES = [
  'wheeled', 'tracked', 'cart_foot', 'rail', 'barge', 'airdrop',
];

export const MODE_LABELS = {
  wheeled: 'משאית',
  tracked: 'זחל',
  cart_foot: 'רגלי ועגלה',
  rail: 'מסילה',
  barge: 'דוברה',
  airdrop: 'הצנחה',
};

/** ‏מה כל אופן באמת אומר — הטקסט שמופיע כשעוברים עליו. */
export const MODE_NOTES = {
  wheeled: 'משאית אספקה. נהר בסיווג operational הוא חסימה מוחלטת.',
  tracked: 'רכב זחלי. עובר במקום שמשאית נעצרת, אך לא חוצה נהר.',
  cart_foot: 'נושאי משא ועגלות. האופן העמיד ביותר לתוואי.',
  rail: 'מסילה. דורשת קטע מתוארך בתא עצמו — שלב 4, עוד לא בגרף.',
  barge: 'שיט פנים. אותו נהר שחוסם ביבשה הוא כאן העורק.',
  airdrop: 'הצנחה. תוואי אינו חוסם — אך אין בגרף שדות תעופה, ולכן טווח לא ידוע.',
};

/** ‏אופן שאין לו עדיין בסיס בגרף. מוצג, ונאמר עליו שהוא ריק. */
export const MODES_WITHOUT_BASIS = new Set(['rail']);

export const DEFAULT_MODE = 'wheeled';

/** ‏קצות המדרג: מקרקע בהירה אל אומבר כהה. גוון אדמה, לא גוון של צד. */
export const RAMP = { open: [201, 184, 148], blocked: [58, 38, 21] };

/** ‏תא ללא שום שכבה — נייטרלי, ולעולם לא נקרא כ״קל״ או כ״קשה״. */
export const UNKNOWN_INK = [138, 132, 120];

/** ‏רצפת האטימות — הרמז שאומר ״התא הזה נמדד, והוא פתוח״. */
export const FLOOR_ALPHA = 26;
export const MAX_ALPHA = 214;

export function isKnownMode(mode) {
  return TRANSPORT_MODES.includes(mode);
}

/** ‏המקדם של התא לאופן הנבחר, או null אם אין. */
export function coefficientOf(properties, mode) {
  const table = properties?.passability;
  if (!table || !isKnownMode(mode)) return null;
  const value = table[mode];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function isUnknownCell(properties) {
  return properties?.terrain_unknown === true;
}

/**
 * ‏צבע התא לאופן הנבחר: ‏[r,g,b,a].
 * ‏‏1.0 (פתוח) → שקוף לגמרי · ‏0.0 (חסום) → אומבר כהה ואטום.
 */
export function fillFor(properties, mode, opacity = 1) {
  if (isUnknownCell(properties)) return [0, 0, 0, 0];
  const coefficient = coefficientOf(properties, mode);
  if (coefficient == null) return [0, 0, 0, 0];
  const friction = Math.max(0, Math.min(1, 1 - coefficient));
  // ‏עקומה מעט לא-ליניארית: חיכוך קל צריך להיות נראה, אחרת כל התחום
  // ‏שבין 0.9 ל-1.0 — שבו יושבים רוב תאי אירופה — נבלע ברקע.
  const eased = Math.pow(friction, 0.72);
  const mix = (a, b) => Math.round(a + (b - a) * eased);
  return [
    mix(RAMP.open[0], RAMP.blocked[0]),
    mix(RAMP.open[1], RAMP.blocked[1]),
    mix(RAMP.open[2], RAMP.blocked[2]),
    Math.round(FLOOR_ALPHA + (MAX_ALPHA - FLOOR_ALPHA) * eased) * (opacity ?? 1),
  ];
}

/** ‏מסגרת: רק תא ״לא ידוע״ מקבל אחת, וזה מה שמבדיל אותו במבט. */
export function lineFor(properties, opacity = 1) {
  if (!isUnknownCell(properties)) return [0, 0, 0, 0];
  return [...UNKNOWN_INK, Math.round(150 * (opacity ?? 1))];
}

/** ‏מקווקו לתא ״לא ידוע״, מלא לכל היתר — ההבחנה קיימת גם בלי צבע. */
export function dashFor(properties) {
  return isUnknownCell(properties) ? [3, 3] : [0, 0];
}

/** ‏טקסט קצר לתא, לכרטיס ולרמז. */
export function describeCell(properties, mode) {
  if (isUnknownCell(properties)) {
    return 'אין שום שכבת תוואי על התא הזה — לא ידוע, לא ״עביר״';
  }
  const coefficient = coefficientOf(properties, mode);
  if (coefficient == null) return 'אין מקדם לאופן הזה';
  const label = MODE_LABELS[mode] || mode;
  if (coefficient === 0) return `${label}: חסום`;
  if (coefficient >= 1) return `${label}: ללא חיכוך תוואי`;
  return `${label}: ${Math.round(coefficient * 100)}% מהמהירות הפתוחה`;
}

/**
 * ‏מקרא לאופן הנבחר. חמישה שלבים — פחות מזה קורא כמו בינארי, יותר
 * ‏מזה בלתי אפשרי להבחין בהצצה.
 */
export function legendFor(mode, opacity = 1) {
  const steps = [1, 0.75, 0.5, 0.25, 0];
  const labels = ['פתוח — נמדד', 'קל', 'בינוני', 'קשה', 'חסום'];
  const entries = steps.map((coefficient, i) => ({
    color: fillFor({ passability: { [mode]: coefficient } }, mode, opacity),
    label: labels[i],
    shape: 'square',
  }));
  entries.push({
    color: [...UNKNOWN_INK, 150], label: 'לא ידוע — אין שכבה', shape: 'line',
  });
  return entries;
}
