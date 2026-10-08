/**
 * הגדרות האטלס — הגבול בין מסלול A למסלולים B ו-C.
 *
 * זהו הקובץ היחיד בצד הלקוח שיודע שמדובר במלחמת העולם השנייה.
 * כל מה שתחת src/core/ אינו מכיר את התוכן ואינו מייבא מכאן.
 * החלפת הקובץ הזה + תיקיית השכבות = אטלס אחר לגמרי על אותו מנוע.
 *
 * הערכים חייבים להישאר מסונכרנים עם config/settings.py בצינור ה-ETL.
 */

export const EPOCH = new Date(Date.UTC(1937, 0, 1));
export const TIMELINE_START = new Date(Date.UTC(1937, 0, 1));
export const TIMELINE_END = new Date(Date.UTC(1946, 11, 31));
export const DEFAULT_STEP_DAYS = 30;
/** תאריך פתיחה עשיר בהתרחשויות מקבילות בכמה זירות. */
export const DEFAULT_DATE = new Date(Date.UTC(1942, 5, 4));

/** חלונות רזולוציה גבוהה — סעיף 5.2 באפיון. */
export const HIGH_RES_WINDOWS = [
  { key: 'poland_1939', label: 'פלישה לפולין',
    start: new Date(Date.UTC(1939, 8, 1)), end: new Date(Date.UTC(1939, 9, 6)), step: 7 },
  { key: 'fall_of_france', label: 'נפילת צרפת',
    start: new Date(Date.UTC(1940, 4, 10)), end: new Date(Date.UTC(1940, 5, 22)), step: 7 },
  { key: 'barbarossa', label: 'פתיחת ברברוסה',
    start: new Date(Date.UTC(1941, 5, 22)), end: new Date(Date.UTC(1941, 11, 5)), step: 7 },
  { key: 'normandy', label: 'נחיתת נורמנדי',
    start: new Date(Date.UTC(1944, 5, 6)), end: new Date(Date.UTC(1944, 7, 25)), step: 1 },
  { key: 'market_garden', label: 'מרקט גארדן',
    start: new Date(Date.UTC(1944, 8, 17)), end: new Date(Date.UTC(1944, 8, 25)), step: 1 },
  { key: 'bulge', label: 'קרב הבליטה',
    start: new Date(Date.UTC(1944, 11, 16)), end: new Date(Date.UTC(1945, 0, 25)), step: 1 },
  { key: 'vistula_oder', label: 'ויסלה-אודר',
    start: new Date(Date.UTC(1945, 0, 12)), end: new Date(Date.UTC(1945, 1, 2)), step: 7 },
  { key: 'rhine', label: 'חציית הריין',
    start: new Date(Date.UTC(1945, 2, 22)), end: new Date(Date.UTC(1945, 3, 1)), step: 1 },
  { key: 'berlin', label: 'קרב ברלין',
    start: new Date(Date.UTC(1945, 3, 16)), end: new Date(Date.UTC(1945, 4, 2)), step: 1 },
];

export const INITIAL_VIEW = {
  longitude: 15.0,
  latitude: 50.0,
  zoom: 3.6,
  pitch: 0,
  bearing: 0,
};

/**
 * מפת בסיס — מסלול B.
 * שלב 0 משתמש בסגנון דמו של MapLibre. שלב 1 מחליף אותו בסגנון וקטורי
 * מוחלש בגוונים ניטרליים, כדי שהגבולות ההיסטוריים יבלטו מעליו.
 */
/**
 * ⚠️ **למה אין כאן מקור אריחים מרוחק**
 * ‏נוסתה שכבת תבליט עולמית מ-Esri כדי לתת פירוט מזום 5 ומעלה. היא
 * ‏נחסמה בסביבת ההרצה (‏`ERR_BLOCKED_BY_CLIENT`), והמפה נתקעה על מסך
 * ‏הטעינה — כלומר **תלות מרוחקת הפכה מפה שעבדה למפה שלא נפתחת**. זה
 * ‏בדיוק הכשל שהאטלס נבנה כדי למנוע: הוא מוגש מקומית, ‏CSP סגור, וכל
 * ‏הנכסים אצלו.
 *
 * ‏הפירוט הקרטוגרפי בזום גבוה יגיע מהנתונים שלנו — שמות, גבולות
 * ‏מתוארכים, תוואי — ולא ממארח שעלול להיעלם. מפה של 1943 ממילא אינה
 * ‏צריכה כבישים ושמות של היום.
 *
 * ⚠️ **נייר, לא מסך.** הרקע חם ונסוג; הנתונים הם הדמות.
 */
export const BASEMAP_ATTRIBUTION = 'Natural Earth II';

export const BASEMAP_STYLE = {
  version: 8,
  name: 'WW2 Atlas base',
  sources: {
    'terrain-relief-tiles': {
      type: 'raster',
      tiles: ['./data/terrain/tiles/{z}/{x}/{y}.jpg'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 4,
      attribution: 'Natural Earth II',
    },
  },
  layers: [
    {
      id: 'paper',
      type: 'background',
      paint: { 'background-color': '#e7ddc9' },
    },
    {
      id: 'terrain-relief-map',
      type: 'raster',
      source: 'terrain-relief-tiles',
      paint: {
        'raster-opacity': 0.5,
        'raster-fade-duration': 0,
        'raster-resampling': 'linear',
        'raster-saturation': -0.5,
        'raster-contrast': 0.05,
        'raster-brightness-max': 0.97,
      },
    },
  ],
};

export const REGION_VIEWS = {
  world: { longitude: 18, latitude: 23, zoom: 1.25, pitch: 0, bearing: 0 },
  europe: { longitude: 15, latitude: 50, zoom: 3.6, pitch: 0, bearing: 0 },
  atlantic: { longitude: -31, latitude: 48, zoom: 2.7, pitch: 0, bearing: 0 },
  pacific: { longitude: 132, latitude: 20, zoom: 2.25, pitch: 0, bearing: 0 },
};

export const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function formatDate(date, step) {
  const m = MONTHS_HE[date.getUTCMonth()];
  const y = date.getUTCFullYear();
  return step <= 7 ? `${date.getUTCDate()} ב${m} ${y}` : `${m} ${y}`;
}
