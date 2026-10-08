/**
 * ‏האיורים — כל ישות מצוירת כמו שהיא נראית, לא כסמל מופשט.
 *
 * ‏עיר היא בתים. טנק הוא גוף, צריח, קנה וזחלים. מחנה הוא צריפים ומגדל
 * ‏שמירה. אין מעוינים, אין ריבועים, אין איקסים — מי שמסתכל על המפה מזהה
 * ‏מה הוא רואה בלי מקרא ובלי הכשרה צבאית.
 *
 * ‏כל איור מצויר בתיבה 72×72 עם ״קרקע״ בגובה ‏y=58, כדי שכל האובייקטים
 * ‏יעמדו על אותו קו ולא ירחפו בגבהים שונים. הפונקציות מקבלות רק ctx
 * ‏וערכת צבע; הן אינן יודעות דבר על deck.gl או על הגרף.
 *
 * ‏המשקל האופטי מכוון לקריאוּת ב-20px: פחות פרטים דקים, יותר צללית.
 */

export const ART_SIZE = 72;
const G = 58;          // קו הקרקע

/** קיצור: נתיב מנקודות. */
function poly(c, pts, close = true) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  if (close) c.closePath();
}

/**
 * ‏כל איור מקבל ערכה: ‏body (הצללית), ‏dark (קווי פנים), ‏light (הדגשה).
 * ‏הצייר מצייר; ההילה, המתאר והצל נוספים מסביב על ידי הקורא.
 */
export const ART = {

  // ---- יחידות יבשה ----

  /** טנק בפרופיל: זחל, גלגלים, גוף משופע, צריח וקנה. */
  armor(c, p) {
    // זחל
    p.fill(c, [[14, G - 2], [58, G - 2], [58, G - 10], [14, G - 10]], 'dark');
    c.save();
    c.fillStyle = p.body;
    for (let i = 0; i < 5; i += 1) {
      c.beginPath();
      c.arc(19 + i * 8.5, G - 6, 3.1, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // גוף
    p.fill(c, [[13, G - 10], [59, G - 10], [56, G - 20], [17, G - 20]], 'body');
    // צריח
    p.fill(c, [[27, G - 20], [47, G - 20], [44, G - 30], [31, G - 30]], 'body');
    // קנה
    p.fill(c, [[44, G - 27], [68, G - 27], [68, G - 23.5], [44, G - 23.5]], 'body');
    // חריץ הצריח, לעומק
    p.fill(c, [[33, G - 27], [42, G - 27], [42, G - 24], [33, G - 24]], 'dark');
  },

  /** חייל: קסדה, כתפיים, רובה על הכתף. */
  infantry(c, p) {
    // רובה
    c.save();
    c.strokeStyle = p.dark; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(46, G - 4); c.lineTo(30, G - 42); c.stroke();
    c.restore();
    // גוף
    p.fill(c, [[24, G], [48, G], [46, G - 22], [38, G - 27], [34, G - 27],
      [26, G - 22]], 'body');
    // ראש
    c.beginPath(); c.arc(36, G - 32, 6.4, 0, Math.PI * 2);
    c.fillStyle = p.body; c.fill();
    // קסדה
    c.beginPath();
    c.arc(36, G - 33, 9.2, Math.PI * 1.03, Math.PI * 1.97);
    c.lineTo(46, G - 32.4); c.lineTo(26, G - 32.4); c.closePath();
    c.fillStyle = p.dark; c.fill();
  },

  /** תותח שדה: קנה משופע, מגן, רגלי מזחלת וגלגל. */
  artillery(c, p) {
    // רגלי מזחלת
    c.save();
    c.strokeStyle = p.body; c.lineWidth = 4.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(38, G - 16); c.lineTo(15, G - 1); c.stroke();
    c.beginPath(); c.moveTo(38, G - 16); c.lineTo(22, G - 1); c.stroke();
    c.restore();
    // קנה
    c.save();
    c.strokeStyle = p.body; c.lineWidth = 5.6; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(33, G - 17); c.lineTo(63, G - 36); c.stroke();
    c.restore();
    // מגן
    p.fill(c, [[26, G - 10], [40, G - 10], [40, G - 26], [26, G - 24]], 'body');
    // גלגל
    c.beginPath(); c.arc(31, G - 8, 8.6, 0, Math.PI * 2);
    c.fillStyle = p.dark; c.fill();
    c.beginPath(); c.arc(31, G - 8, 3.4, 0, Math.PI * 2);
    c.fillStyle = p.light; c.fill();
  },

  /** נגמ״ש: גוף זוויתי על זחל, ללא צריח גדול. */
  mech(c, p) {
    p.fill(c, [[14, G - 2], [58, G - 2], [58, G - 9], [14, G - 9]], 'dark');
    c.save(); c.fillStyle = p.body;
    for (let i = 0; i < 4; i += 1) {
      c.beginPath(); c.arc(20 + i * 10.5, G - 5.5, 2.8, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    p.fill(c, [[13, G - 9], [59, G - 9], [59, G - 22], [34, G - 22],
      [24, G - 28], [13, G - 28]], 'body');
    p.fill(c, [[17, G - 15], [28, G - 15], [28, G - 24], [19, G - 24]], 'dark');
  },

  /** משאית: תא נהג, ארגז מטען, שני גלגלים. */
  motor(c, p) {
    p.fill(c, [[13, G - 8], [36, G - 8], [36, G - 27], [13, G - 27]], 'body');
    p.fill(c, [[36, G - 8], [58, G - 8], [58, G - 20], [52, G - 26], [36, G - 26]], 'body');
    p.fill(c, [[40, G - 15], [51, G - 15], [51, G - 23], [45, G - 23]], 'dark');
    for (const x of [22, 50]) {
      c.beginPath(); c.arc(x, G - 5, 6.6, 0, Math.PI * 2); c.fillStyle = p.dark; c.fill();
      c.beginPath(); c.arc(x, G - 5, 2.6, 0, Math.PI * 2); c.fillStyle = p.light; c.fill();
    }
  },

  /** תותח נ״ט: קנה ארוך ונמוך עם מגן רחב. */
  antitank(c, p) {
    c.save();
    c.strokeStyle = p.body; c.lineWidth = 4.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(34, G - 18); c.lineTo(14, G - 2); c.stroke();
    c.beginPath(); c.moveTo(34, G - 18); c.lineTo(21, G - 2); c.stroke();
    c.lineWidth = 4.4; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(30, G - 20); c.lineTo(66, G - 26); c.stroke();
    c.restore();
    p.fill(c, [[24, G - 8], [40, G - 8], [42, G - 28], [22, G - 28]], 'body');
    c.beginPath(); c.arc(29, G - 6, 7, 0, Math.PI * 2); c.fillStyle = p.dark; c.fill();
  },

  /** תותח נ״מ: קנה תלול מעלה על מכלול מרובע. */
  airdefense(c, p) {
    c.save();
    c.strokeStyle = p.body; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(32, G - 16); c.lineTo(52, G - 44); c.stroke();
    c.restore();
    p.fill(c, [[20, G - 2], [48, G - 2], [44, G - 16], [24, G - 16]], 'body');
    p.fill(c, [[27, G - 16], [39, G - 16], [37, G - 24], [29, G - 24]], 'dark');
  },

  /** צנחן: כיפת מצנח, חבלים, דמות תלויה. */
  airborne(c, p) {
    c.beginPath();
    c.arc(36, G - 30, 19, Math.PI * 1.02, Math.PI * 1.98);
    c.quadraticCurveTo(36, G - 22, 17, G - 30);
    c.closePath();
    c.fillStyle = p.body; c.fill();
    c.save();
    c.strokeStyle = p.dark; c.lineWidth = 1.9;
    for (const x of [19, 28.5, 43.5, 53]) {
      c.beginPath(); c.moveTo(x, G - 29); c.lineTo(36, G - 13); c.stroke();
    }
    c.restore();
    p.fill(c, [[32, G - 13], [40, G - 13], [39, G - 1], [33, G - 1]], 'dark');
    c.beginPath(); c.arc(36, G - 15, 4.2, 0, Math.PI * 2); c.fillStyle = p.dark; c.fill();
  },

  /** סוס: צללית ראש, גוף ורגליים. */
  cavalry(c, p) {
    p.fill(c, [[18, G], [22, G - 18], [30, G - 24], [44, G - 24], [50, G - 18],
      [54, G], [47, G], [44, G - 12], [28, G - 12], [25, G]], 'body');
    p.fill(c, [[44, G - 22], [50, G - 32], [58, G - 40], [63, G - 38],
      [60, G - 28], [54, G - 21]], 'body');
    p.fill(c, [[50, G - 33], [57, G - 41], [55, G - 33]], 'dark');
    c.beginPath(); c.arc(59, G - 35, 1.7, 0, Math.PI * 2);
    c.fillStyle = p.light; c.fill();
  },

  /** פסגות מושלגות. */
  mountain(c, p) {
    p.fill(c, [[8, G], [27, G - 34], [46, G]], 'body');
    p.fill(c, [[33, G], [50, G - 26], [66, G]], 'body');
    p.fill(c, [[27, G - 34], [34, G - 22], [29, G - 21], [24, G - 24], [20, G - 22]], 'light');
    p.fill(c, [[50, G - 26], [55, G - 17], [51, G - 16], [46, G - 17]], 'light');
  },

  /** גשר קשתי — חיל הנדסה. */
  engineer(c, p) {
    c.save();
    c.strokeStyle = p.body; c.lineWidth = 5;
    c.beginPath(); c.moveTo(10, G - 12); c.quadraticCurveTo(36, G - 40, 62, G - 12);
    c.stroke();
    c.restore();
    p.fill(c, [[8, G - 14], [64, G - 14], [64, G - 20], [8, G - 20]], 'body');
    c.save();
    c.strokeStyle = p.dark; c.lineWidth = 2.6;
    for (const x of [20, 36, 52]) {
      c.beginPath(); c.moveTo(x, G - 20); c.lineTo(x, G - 30); c.stroke();
    }
    c.restore();
    p.fill(c, [[6, G - 20], [12, G - 20], [12, G], [6, G]], 'dark');
    p.fill(c, [[60, G - 20], [66, G - 20], [66, G], [60, G]], 'dark');
  },

  /** נחתת עם רמפה פתוחה. */
  marines(c, p) {
    p.fill(c, [[12, G - 6], [58, G - 6], [52, G - 20], [18, G - 20]], 'body');
    p.fill(c, [[12, G - 6], [6, G + 4], [22, G - 6]], 'dark');
    p.fill(c, [[26, G - 20], [42, G - 20], [42, G - 32], [26, G - 32]], 'body');
    c.save();
    c.strokeStyle = p.light; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(16, G - 1); c.quadraticCurveTo(30, G + 4, 44, G - 1);
    c.quadraticCurveTo(56, G - 5, 64, G - 1); c.stroke();
    c.restore();
  },

  /** אוהל מפקדה עם דגל. */
  hq(c, p) {
    p.fill(c, [[12, G], [36, G - 28], [60, G]], 'body');
    p.fill(c, [[30, G], [36, G - 17], [42, G]], 'dark');
    c.save();
    c.strokeStyle = p.dark; c.lineWidth = 3;
    c.beginPath(); c.moveTo(36, G - 28); c.lineTo(36, G - 50); c.stroke();
    c.restore();
    p.fill(c, [[36, G - 50], [58, G - 44], [36, G - 38]], 'body');
  },

  // ---- אירועים ----

  /** חרבות שלובות מעל התלקחות — קרב. */
  battle(c, p) {
    // ‏ההתלקחות היא רקע, לא הנושא. היא קטנה יותר מהחרבות ובוהקת מאחוריהן,
    // ‏אחרת הסמל נקרא ככוכב צהוב וההצלבה נעלמת.
    c.save();
    c.globalAlpha = 0.7;
    c.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 27 : 14;
      const x = 36 + Math.cos(a) * r;
      const y = 34 + Math.sin(a) * r;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
    c.fillStyle = p.light;
    c.fill();
    c.restore();
    // ‏שתי חרבות שלובות בצבע הגוף המלא — הן הנושא, ולכן הן הכהות והגדולות
    for (const dir of [1, -1]) {
      c.save();
      c.translate(36, 34);
      c.rotate(dir * Math.PI / 4);
      p.fill(c, [[-4.6, -30], [4.6, -30], [5.6, 8], [-5.6, 8]], 'body');
      p.fill(c, [[-5.6, -33], [5.6, -33], [0, -41]], 'body');
      p.fill(c, [[-14, 8], [14, 8], [14, 13.5], [-14, 13.5]], 'dark');
      p.fill(c, [[-4, 13.5], [4, 13.5], [4, 27], [-4, 27]], 'dark');
      c.restore();
    }
  },

  /** דגל נעוץ בתל — כיבוש. */
  capture(c, p) {
    p.fill(c, [[16, G], [56, G], [48, G - 8], [24, G - 8]], 'dark');
    c.save();
    c.strokeStyle = p.dark; c.lineWidth = 3.4;
    c.beginPath(); c.moveTo(28, G - 6); c.lineTo(28, G - 44); c.stroke();
    c.restore();
    c.beginPath();
    c.moveTo(28, G - 44);
    c.quadraticCurveTo(44, G - 40, 58, G - 44);
    c.quadraticCurveTo(50, G - 32, 58, G - 26);
    c.quadraticCurveTo(44, G - 22, 28, G - 26);
    c.closePath();
    c.fillStyle = p.body; c.fill();
  },

  /** מצודה: חומה משוננת בין שני מגדלים. */
  fort(c, p) {
    p.fill(c, [[20, G], [52, G], [52, G - 22], [20, G - 22]], 'body');
    for (let i = 0; i < 3; i += 1) {
      p.fill(c, [[22 + i * 11, G - 22], [30 + i * 11, G - 22],
        [30 + i * 11, G - 28], [22 + i * 11, G - 28]], 'body');
    }
    for (const x of [8, 48]) {
      p.fill(c, [[x, G], [x + 16, G], [x + 16, G - 32], [x, G - 32]], 'body');
      for (let i = 0; i < 2; i += 1) {
        p.fill(c, [[x + 1 + i * 9, G - 32], [x + 7 + i * 9, G - 32],
          [x + 7 + i * 9, G - 38], [x + 1 + i * 9, G - 38]], 'body');
      }
    }
    // שער
    c.beginPath();
    c.moveTo(30, G); c.lineTo(30, G - 10);
    c.quadraticCurveTo(36, G - 18, 42, G - 10); c.lineTo(42, G);
    c.closePath(); c.fillStyle = p.dark; c.fill();
  },

  /** ספינת מלחמה שוקעת בין גלים. */
  sinking(c, p) {
    c.save();
    c.translate(36, G - 12); c.rotate(-0.36); c.translate(-36, -(G - 12));
    p.fill(c, [[14, G - 12], [58, G - 12], [50, G - 3], [22, G - 3]], 'body');
    p.fill(c, [[30, G - 12], [44, G - 12], [44, G - 22], [30, G - 22]], 'body');
    p.fill(c, [[46, G - 12], [52, G - 12], [52, G - 24], [46, G - 24]], 'dark');
    c.restore();
    c.save();
    c.strokeStyle = p.light; c.lineWidth = 3.2; c.lineCap = 'round';
    for (const dy of [0, 7]) {
      c.beginPath();
      c.moveTo(8, G - 2 + dy);
      c.quadraticCurveTo(20, G - 8 + dy, 32, G - 2 + dy);
      c.quadraticCurveTo(46, G + 4 + dy, 64, G - 2 + dy);
      c.stroke();
    }
    c.restore();
  },

  /** ספינת מלחמה: גוף, מבנה־על, ארובה. */
  ship(c, p) {
    p.fill(c, [[10, G - 14], [62, G - 14], [54, G - 3], [20, G - 3]], 'body');
    p.fill(c, [[26, G - 14], [46, G - 14], [46, G - 24], [26, G - 24]], 'body');
    p.fill(c, [[32, G - 24], [40, G - 24], [40, G - 32], [32, G - 32]], 'dark');
    p.fill(c, [[48, G - 14], [54, G - 14], [54, G - 27], [48, G - 27]], 'dark');
    c.save();
    c.strokeStyle = p.light; c.lineWidth = 2.8; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(6, G); c.quadraticCurveTo(22, G + 5, 36, G);
    c.quadraticCurveTo(52, G - 5, 66, G); c.stroke();
    c.restore();
  },

  /** מפציץ במבט־על. */
  air(c, p) {
    p.fill(c, [[33, 12], [39, 12], [42, 44], [39, 56], [33, 56], [30, 44]], 'body');
    p.fill(c, [[8, 30], [64, 30], [64, 38], [8, 38]], 'body');
    p.fill(c, [[22, 50], [50, 50], [50, 55], [22, 55]], 'body');
    for (const x of [20, 52]) {
      p.fill(c, [[x - 4, 28], [x + 4, 28], [x + 4, 40], [x - 4, 40]], 'dark');
    }
    c.beginPath(); c.arc(36, 20, 3.4, 0, Math.PI * 2);
    c.fillStyle = p.light; c.fill();
  },

  // ---- מקומות ----

  /**
   * ‏כפר: שני בתים נמוכים עם גגות רעפים. הדרגה הקטנה ביותר.
   */
  place_village(c, p) {
    p.fill(c, [[16, G], [34, G], [34, G - 16], [16, G - 16]], 'body');
    p.fill(c, [[13, G - 16], [37, G - 16], [25, G - 26]], 'dark');
    p.fill(c, [[38, G], [54, G], [54, G - 12], [38, G - 12]], 'body');
    p.fill(c, [[35, G - 12], [57, G - 12], [46, G - 21]], 'dark');
    c.fillStyle = p.light;
    c.fillRect(22, G - 10, 6, 6);
    c.fillRect(43, G - 8, 5, 5);
  },

  /** עיירה: שלושה בתים, אחד עם גג רעפים, בלי צריח. */
  place_town(c, p) {
    p.fill(c, [[10, G], [28, G], [28, G - 20], [10, G - 20]], 'body');
    p.fill(c, [[28, G], [46, G], [46, G - 30], [28, G - 30]], 'body');
    p.fill(c, [[25, G - 30], [49, G - 30], [37, G - 40]], 'dark');
    p.fill(c, [[46, G], [62, G], [62, G - 16], [46, G - 16]], 'body');
    c.fillStyle = p.light;
    for (const [x, y] of [[15, G - 15], [15, G - 8], [22, G - 15], [22, G - 8],
      [32, G - 25], [39, G - 25], [32, G - 16], [39, G - 16], [51, G - 11]]) {
      c.fillRect(x, y, 4.6, 4.6);
    }
  },

  /** עיר: קו רקיע עם צריח כנסייה. */
  place_city(c, p) {
    p.fill(c, [[6, G], [24, G], [24, G - 24], [6, G - 24]], 'body');
    p.fill(c, [[24, G], [44, G], [44, G - 38], [24, G - 38]], 'body');
    p.fill(c, [[22, G - 38], [46, G - 38], [34, G - 48]], 'dark');
    p.fill(c, [[44, G], [58, G], [58, G - 20], [44, G - 20]], 'body');
    p.fill(c, [[58, G], [68, G], [68, G - 30], [58, G - 30]], 'body');
    p.fill(c, [[56, G - 30], [70, G - 30], [63, G - 42]], 'dark');
    c.fillStyle = p.light;
    for (const [x, y] of [[11, G - 19], [11, G - 11], [18, G - 19], [18, G - 11],
      [28, G - 33], [36, G - 33], [28, G - 24], [36, G - 24], [28, G - 15],
      [36, G - 15], [48, G - 15], [61, G - 24], [61, G - 15]]) {
      c.fillRect(x, y, 4.8, 4.8);
    }
  },

  /** מטרופולין: מגדלים גבוהים, קו רקיע צפוף. */
  place_metro(c, p) {
    p.fill(c, [[4, G], [18, G], [18, G - 28], [4, G - 28]], 'body');
    p.fill(c, [[18, G], [32, G], [32, G - 46], [18, G - 46]], 'body');
    p.fill(c, [[20, G - 46], [30, G - 46], [25, G - 56]], 'dark');
    p.fill(c, [[32, G], [46, G], [46, G - 36], [32, G - 36]], 'body');
    p.fill(c, [[46, G], [58, G], [58, G - 52], [46, G - 52]], 'body');
    p.fill(c, [[50, G - 52], [54, G - 52], [54, G - 62], [50, G - 62]], 'dark');
    p.fill(c, [[58, G], [70, G], [70, G - 24], [58, G - 24]], 'body');
    c.fillStyle = p.light;
    for (let col = 0; col < 5; col += 1) {
      const heights = [28, 46, 36, 52, 24];
      const x0 = [4, 18, 32, 46, 58][col];
      const w = [14, 14, 14, 12, 12][col];
      for (let y = G - 8; y > G - heights[col] + 6; y -= 9) {
        for (let x = x0 + 3; x < x0 + w - 4; x += 7) c.fillRect(x, y, 4.2, 4.6);
      }
    }
  },

  /** מחנה: שני צריפים, מגדל שמירה וגדר. */
  camp(c, p) {
    // גדר
    c.save();
    c.strokeStyle = p.dark; c.lineWidth = 2;
    c.beginPath(); c.moveTo(4, G - 6); c.lineTo(68, G - 6); c.stroke();
    c.beginPath(); c.moveTo(4, G - 12); c.lineTo(68, G - 12); c.stroke();
    for (let x = 8; x <= 64; x += 14) {
      c.beginPath(); c.moveTo(x, G - 2); c.lineTo(x, G - 16); c.stroke();
    }
    c.restore();
    // צריפים
    p.fill(c, [[8, G - 16], [30, G - 16], [30, G - 28], [8, G - 28]], 'body');
    p.fill(c, [[6, G - 28], [32, G - 28], [19, G - 35]], 'body');
    p.fill(c, [[34, G - 16], [52, G - 16], [52, G - 26], [34, G - 26]], 'body');
    p.fill(c, [[32, G - 26], [54, G - 26], [43, G - 32]], 'body');
    // מגדל שמירה
    p.fill(c, [[56, G - 16], [60, G - 16], [58.5, G - 40], [57.5, G - 40]], 'dark');
    p.fill(c, [[62, G - 16], [66, G - 16], [64.5, G - 40], [63.5, G - 40]], 'dark');
    p.fill(c, [[52, G - 40], [70, G - 40], [70, G - 48], [52, G - 48]], 'body');
    p.fill(c, [[50, G - 48], [72, G - 48], [61, G - 54]], 'dark');
  },

  /** מפעל: גג משונן ושתי ארובות עם עשן. */
  plant(c, p) {
    p.fill(c, [[8, G], [50, G], [50, G - 20], [8, G - 20]], 'body');
    for (let i = 0; i < 3; i += 1) {
      const x = 8 + i * 14;
      p.fill(c, [[x, G - 20], [x + 14, G - 20], [x + 14, G - 27], [x + 7, G - 32],
        [x, G - 27]], 'body');
    }
    p.fill(c, [[54, G], [62, G], [62, G - 40], [54, G - 40]], 'body');
    p.fill(c, [[52, G - 40], [64, G - 40], [64, G - 44], [52, G - 44]], 'dark');
    c.save();
    c.fillStyle = p.light;
    for (const [x, y, r] of [[60, G - 50, 5], [50, G - 56, 6.5], [38, G - 60, 5.5]]) {
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    c.fillStyle = p.dark;
    for (const [x, y] of [[13, G - 14], [22, G - 14], [31, G - 14], [40, G - 14]]) {
      c.fillRect(x, y, 5.4, 7);
    }
  },

  /** קטר על מסילה. */
  rail(c, p) {
    c.save();
    c.strokeStyle = p.dark; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(4, G); c.lineTo(68, G); c.stroke();
    for (let x = 8; x <= 64; x += 9) {
      c.beginPath(); c.moveTo(x, G - 3); c.lineTo(x, G + 3); c.stroke();
    }
    c.restore();
    p.fill(c, [[14, G - 6], [58, G - 6], [58, G - 22], [40, G - 22],
      [40, G - 34], [16, G - 34], [14, G - 22]], 'body');
    p.fill(c, [[42, G - 22], [56, G - 22], [56, G - 30], [42, G - 30]], 'dark');
    p.fill(c, [[46, G - 30], [52, G - 30], [52, G - 42], [46, G - 42]], 'dark');
    c.fillStyle = p.dark;
    c.fillRect(20, G - 30, 6, 7);
    c.fillRect(29, G - 30, 6, 7);
    for (const x of [22, 34, 50]) {
      c.beginPath(); c.arc(x, G - 6, 5, 0, Math.PI * 2); c.fillStyle = p.dark; c.fill();
    }
  },

  /** נמל: מנוף מזח מעל מים. */
  port(c, p) {
    c.save();
    c.strokeStyle = p.light; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(4, G + 1); c.quadraticCurveTo(20, G + 6, 36, G + 1);
    c.quadraticCurveTo(52, G - 4, 68, G + 1); c.stroke();
    c.restore();
    p.fill(c, [[6, G - 4], [46, G - 4], [46, G - 12], [6, G - 12]], 'body');
    p.fill(c, [[16, G - 12], [24, G - 12], [24, G - 46], [16, G - 46]], 'body');
    p.fill(c, [[14, G - 46], [58, G - 46], [58, G - 40], [14, G - 40]], 'body');
    c.save();
    c.strokeStyle = p.dark; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(52, G - 40); c.lineTo(52, G - 22); c.stroke();
    c.restore();
    p.fill(c, [[46, G - 22], [58, G - 22], [58, G - 15], [46, G - 15]], 'dark');
  },

  /** צריף מחסן עם ארגזים — אספקה. */
  supply(c, p) {
    p.fill(c, [[10, G], [46, G], [46, G - 22], [10, G - 22]], 'body');
    p.fill(c, [[8, G - 22], [48, G - 22], [28, G - 34]], 'body');
    p.fill(c, [[22, G], [34, G], [34, G - 14], [22, G - 14]], 'dark');
    p.fill(c, [[50, G], [66, G], [66, G - 14], [50, G - 14]], 'body');
    c.save();
    c.strokeStyle = p.dark; c.lineWidth = 2;
    c.beginPath(); c.moveTo(58, G); c.lineTo(58, G - 14); c.stroke();
    c.beginPath(); c.moveTo(50, G - 7); c.lineTo(66, G - 7); c.stroke();
    c.restore();
  },
};

/** ‏גובה קו הקרקע, לשימוש מי שמצייר צל מתחת לאיור. */
export const ART_GROUND = G;
export { poly };
