/**
 * ‏שומר boot — מסך טעינה שנתקע בלי הודעה הוא הכשל הכי מתסכל כאן.
 *
 * ⚠️ **למה זה קובץ ולא סקריפט בתוך הדף.** הוא נכתב כ-inline script,
 * ‏וה-CSP של הדף עצמו הוא `script-src 'self'` בלי hash ובלי nonce —
 * ‏כלומר הדפדפן חסם אותו בכל טעינה, והרשת שאמורה להסביר מסך תקוע
 * ‏מעולם לא רצה. הקובץ נטען כסקריפט קלאסי, ולכן הוא עדיין רץ לפני
 * ‏כל מודול — מודולים נדחים כברירת מחדל.
 */
// שומר boot — מסך טעינה שנתקע בלי הודעה הוא הכשל הכי מתסכל כאן, כי הוא
  // נראה זהה לרשת איטית, לשגיאת JS ולנתון חסר. הסקריפט הזה רץ לפני כל
  // מודול, אוסף שגיאות, ואחרי 12 שניות מחליף את "טוען את המנוע…" במה
  // שבאמת קרה.
  (function bootWatchdog() {
    var errors = [];
    window.__atlasBootErrors = errors;
    function note(kind, message, source) {
      errors.push({ kind: kind, message: String(message || ''), source: source || '' });
    }
    window.addEventListener('error', function (event) {
      note(event.filename ? 'script' : 'resource',
           event.message || (event.target && event.target.src) || 'שגיאה לא מזוהה',
           event.filename || (event.target && event.target.src) || '');
    }, true);
    window.addEventListener('unhandledrejection', function (event) {
      note('promise', (event.reason && (event.reason.message || event.reason)) || 'דחייה ללא סיבה');
    });
    // טאב מוסתר: MapLibre דוחה את אירוע ה-load ודפדפנים מחניקים טיימרים,
    // ולכן boot תקוע שם זה מצב תקין ולא כשל. סופרים רק זמן גלוי.
    var visibleMs = 0;
    var lastTick = Date.now();
    setInterval(function () {
      var now = Date.now();
      if (!document.hidden) visibleMs += now - lastTick;
      lastTick = now;
    }, 500);
    function report() {
      var boot = document.getElementById('boot');
      if (!boot) return;                       // עלה בזמן; אין מה לדווח
      if (visibleMs < 12000) { setTimeout(report, 2000); return; }
      var lines = ['הטעינה לא הושלמה'];
      if (errors.length) {
        for (var i = 0; i < Math.min(errors.length, 4); i += 1) {
          lines.push('· ' + errors[i].message.slice(0, 160));
        }
      } else {
        lines.push('· לא נרשמה שגיאה — כנראה טעינת נתונים שלא הסתיימה');
      }
      lines.push('פרטים מלאים ב-Console (window.__atlasBootErrors)');
      boot.textContent = lines.join('\n');
      boot.dataset.failed = 'true';
      console.error('[אטלס] boot לא הושלם', errors);
    }
    setTimeout(report, 12000);
  })();
