#!/usr/bin/env python3
"""שרת סטטי למפה, עם הכותרות שהדף עצמו אינו יכול להגדיר.

    python3 tools/serve.py           # פורט 8000
    python3 tools/serve.py 8080

⚠️ **למה זה קיים**
‏‏`frame-ancestors` — ההגנה מפני הטמעת הדף ב-iframe זר — **אינו פועל
‏כשהוא מגיע דרך `<meta>`**. הדפדפן מתעלם ממנו ורושם שגיאה בקונסולה
‏בכל טעינה. הוא היה כתוב שם, בדיקת האבטחה של הפרויקט אכפה את קיומו,
‏ושניהם יחד יצרו הגנה שנראתה קיימת ולא הייתה. ‏CSP מלא נשלח כאן
‏ככותרת, שם הוא באמת חל.

‏שאר ההגנות מאותה משפחה — `X-Content-Type-Options`, `Referrer-Policy`,
‏`X-Frame-Options` לדפדפנים ישנים — גם הן קיימות רק ככותרת.
"""
from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

#: ‏אותה מדיניות כמו ב-`<meta>` שבדף, ועוד ההנחיות שרק כותרת יכולה לשאת.
CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "connect-src 'self' data: http://127.0.0.1:8787 http://localhost:8787; "
    "worker-src 'self' blob:; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'none'; "
    "frame-ancestors 'none'"
)

HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
}


#: ‏תיקיות שאינן האטלס עצמו. ‏`legacy-maps/` מחזיקה את המפות
#: ‏העצמאיות (קובץ אחד כל אחת, ‏Leaflet, תלויות מהרשת). מדיניות
#: ‏האטלס חוסמת אותן לחלוטין, ולכן היא אינה חלה עליהן.
ARCHIVE_PREFIXES = ("/legacy-maps/", "/_to_delete/", "/_compare/")


class AtlasHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        # ⚠️ ‏**מדיניות של אפליקציה אחת אינה חלה על אפליקציה אחרת.**
        # ‏ה-CSP הסגור של האטלס חסם את ‏Leaflet ואת אריחי הבסיס של
        # ‏המפה השמורה להשוואה — כלומר השרת החדש שבר מפה שעבדה.
        archived = self.path.split("?")[0].startswith(ARCHIVE_PREFIXES)
        for name, value in HEADERS.items():
            if archived and name in ("Content-Security-Policy",
                                     "Cross-Origin-Opener-Policy"):
                continue
            self.send_header(name, value)
        # ⚠️ ‏**הדף עצמו לעולם לא מהמטמון.**
        # ‏כל ה-import-ים נושאים מפתח גרסה, אבל `index.html` עצמו לא —
        # ‏ולכן הדפדפן הגיש גרסה ישנה שלו, עם מפתחות ישנים, והמפה נראתה
        # ‏כאילו שום תיקון לא נכנס. ‏HTML נטען תמיד מחדש; הנכסים
        # ‏הממוספרים נשמרים במטמון לשנה, כי המפתח כבר מבטיח רעננות.
        path = self.path.split('?')[0]
        if path.endswith(('.html', '/')) or path == '':
            self.send_header('Cache-Control', 'no-cache, must-revalidate')
        elif '?v=' in self.path:
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:      # noqa: A003
        # ‏שורה לכל אריח מציפה את המסך; שגיאות בלבד.
        if not str(args[1] if len(args) > 1 else "").startswith("2"):
            super().log_message(fmt, *args)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(AtlasHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"המפה מוגשת מ-http://127.0.0.1:{port}/  (Ctrl-C לעצירה)")
        print("‏כותרות אבטחה פעילות: " + ", ".join(HEADERS))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nנעצר")


if __name__ == "__main__":
    main()
