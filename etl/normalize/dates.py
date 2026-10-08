"""נרמול תאריכים.

הזמן במוצר מיוצג כ**מספר שלם** — ימים מאז 1937-01-01 — ולא כאובייקט Date.
זה מה שמאפשר ל-deck.gl לסנן ב-shader דרך DataFilterExtension במקום ללולאה
ב-JavaScript, וזה ההבדל בין 60 FPS ל-5 FPS.
"""
from __future__ import annotations

import re
from datetime import date, datetime

from dateutil import parser as dtparser

from config.settings import EPOCH, TIMELINE_END, TIMELINE_START, to_day_index

# פורמטים נפוצים במקורות התקופה
_PATTERNS = [
    (re.compile(r"^(\d{4})-(\d{2})-(\d{2})$"), lambda m: date(*map(int, m.groups()))),
    (re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$"),                 # 22.6.1941
     lambda m: date(int(m.group(3)), int(m.group(2)), int(m.group(1)))),
    (re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$"),                   # 6/6/1944 (US)
     lambda m: date(int(m.group(3)), int(m.group(1)), int(m.group(2)))),
    (re.compile(r"^(\d{4})-(\d{2})$"),                               # 1943-05
     lambda m: date(int(m.group(1)), int(m.group(2)), 1)),
    (re.compile(r"^(\d{4})$"), lambda m: date(int(m.group(1)), 1, 1)),
]


class DateError(ValueError):
    pass


def parse_date(value, *, dayfirst: bool = True, strict: bool = False) -> date | None:
    """ממיר קלט לתאריך. מחזיר None במקום לנחש, אלא אם strict."""
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()

    s = str(value).strip()
    for pat, fn in _PATTERNS:
        m = pat.match(s)
        if m:
            try:
                return fn(m)
            except ValueError as e:
                if strict:
                    raise DateError(f"תאריך לא תקין: {value!r}") from e
                return None
    try:
        return dtparser.parse(s, dayfirst=dayfirst).date()
    except (ValueError, OverflowError) as e:
        if strict:
            raise DateError(f"לא ניתן לפרסר תאריך: {value!r}") from e
        return None


def in_timeline(d: date | None) -> bool:
    return d is not None and TIMELINE_START <= d <= TIMELINE_END


def day_index(value) -> int | None:
    """קלט כלשהו → ימים מאז EPOCH. זה מה שנשלח ל-deck.gl."""
    d = parse_date(value)
    return to_day_index(d) if d else None


def span(start, end) -> tuple[date | None, date | None, int | None, int | None]:
    """מחזיר (from, to, day_from, day_to) עם בדיקת סדר.

    מפיל בגלוי במקום להחליף בשקט — סדר הפוך הוא בדרך כלל סימן לבלבול
    בין פורמט אמריקאי לאירופאי, וזה באג שכדאי לראות.
    """
    s, e = parse_date(start), parse_date(end)
    if s and e and s > e:
        raise DateError(f"תאריך סיום קודם לתאריך התחלה: {s} → {e}")
    return s, e, (to_day_index(s) if s else None), (to_day_index(e) if e else None)


def month_range(start: date, end: date):
    """מייצר את תחילת כל חודש בטווח — לשכבות ברזולוציה חודשית."""
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield date(y, m, 1)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


__all__ = ["parse_date", "day_index", "span", "in_timeline", "month_range",
           "DateError", "EPOCH"]
