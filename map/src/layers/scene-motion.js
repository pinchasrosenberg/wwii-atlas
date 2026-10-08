/**
 * ‏תנועה: פונקציות ההאטה והקצב של השכבה.
 *
 * ‏למה קובץ נפרד ולמה בכלל easing: סינוס גולמי נותן תנועה מכנית ואחידה,
 * ‏והעין קוראת אותה כלולאה של מכונה. עקומות עם האצה והאטה נקראות כתנועה
 * ‏חיה — זה עיקרון אנימציה ותיק (ease in / ease out), לא קישוט.
 *
 * ‏השני: **stagger**. כשכל האובייקטים פועמים יחד המפה מהבהבת. כשלכל אחד
 * ‏יש היסט קבוע שנגזר מהזהות שלו, אותה אנימציה נקראת כשדה חי. ההיסט חייב
 * ‏להיות דטרמיניסטי — אחרת הסמל היה קופץ בכל ציור מחדש.
 */

/** ‏האטה משני הקצוות. הבסיס לכל תנועה שאמורה להיראות מכוונת. */
export function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
}

/** ‏האטה בסוף בלבד — למשהו שנכנס למקומו. */
export function easeOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

/** ‏חריגה קלה מעבר ליעד וחזרה. נותן לסמל שנכנס תחושת משקל. */
export function easeOutBack(t, overshoot = 1.7) {
  const x = Math.max(0, Math.min(1, t));
  const c = overshoot + 1;
  return 1 + c * (x - 1) ** 3 + overshoot * (x - 1) ** 2;
}

/**
 * ‏נשימה: 0→1→0 עם האטה בקצוות, במחזור אחיד.
 * @param {number} time ‏שניות
 * @param {number} period ‏אורך מחזור בשניות
 * @param {number} offset ‏היסט 0..1 לפיזור בין אובייקטים
 */
export function breathe(time, period = 2.6, offset = 0) {
  const phase = (((time / period) + offset) % 1 + 1) % 1;
  // ‏משולש 0→1→0, ואז האטה — במקום סינוס, שנקרא שטוח מדי בקצוות
  const triangle = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  return easeInOutCubic(triangle);
}

/**
 * ‏היסט קבוע לכל זהות. גיבוב פשוט ויציב — אותו מזהה תמיד יקבל אותו היסט,
 * ‏אחרת הפעימה הייתה קופצת בכל ציור מחדש.
 */
export function staggerOffset(id) {
  const text = String(id || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

/**
 * ‏פעימה של אירוע סביב התאריך שלו: חזקה ביום עצמו, דועכת ככל שמתרחקים.
 * ‏אירוע מלפני חודשיים לא אמור להבהב באותה עוצמה כמו זה של היום.
 */
export function eventIntensity(properties, day, { window: windowDays = 21 } = {}) {
  const from = properties.day_from;
  if (from == null) return 0.35;
  const to = properties.day_to ?? from;
  if (day >= from && day <= to) return 1;
  const distance = day < from ? from - day : day - to;
  if (distance >= windowDays) return 0;
  return easeOutCubic(1 - distance / windowDays);
}

/**
 * ‏ההתקדמות של קו לאורך הזמן — 0 בתחילת הקטע, 1 בסופו. משמש לחשיפה
 * ‏הדרגתית של נתיב במקום להופעה בבת אחת.
 */
export function revealFraction(properties, day) {
  const from = properties.day_from;
  const to = properties.day_to;
  if (from == null || to == null || to <= from) return 1;
  if (day <= from) return 0;
  if (day >= to) return 1;
  return easeInOutCubic((day - from) / (to - from));
}

/** ‏חיתוך נתיב לפי שבר התקדמות, כולל נקודת קצה מדויקת. */
export function partialPath(path, fraction) {
  if (!Array.isArray(path) || path.length < 2) return [];
  const f = Math.max(0, Math.min(1, fraction));
  if (f >= 1) return path.map((p) => [...p]);
  if (f <= 0) return [];
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    lengths.push(total);
  }
  if (total === 0) return [path[0], path[0]];
  const target = total * f;
  const out = [path[0]];
  for (let i = 1; i < path.length; i += 1) {
    if (lengths[i] < target) { out.push(path[i]); continue; }
    const span = lengths[i] - lengths[i - 1] || 1;
    const t = (target - lengths[i - 1]) / span;
    const a = path[i - 1];
    const b = path[i];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    break;
  }
  return out.length >= 2 ? out : [path[0], path[0]];
}
