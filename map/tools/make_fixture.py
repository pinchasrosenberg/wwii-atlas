#!/usr/bin/env python3
"""מחולל הפיקסטורה הסינתטית של שלב 0.

⚠️ הנתונים אינם היסטוריים. מטרתם היחידה להוכיח שצינור התצוגה עובד.

שני עקרונות שנשמרים כאן ויימשכו לנתונים האמיתיים:

1. **דטרמיניזם.** זרע קבוע, מיון יציב, ו-JSON עם מפתחות ממוינים —
   הרצה חוזרת מייצרת קובץ זהה בייט-לבייט. זו אותה הבטחה שהצינור
   האמיתי נותן, ובדיקתה מתחילה כאן.

2. **אותו מבנה כמו ישות אמיתית.** day_from/day_to, source_ids,
   derivation. זה מה שיאפשר להחליף את הנתונים בשלב 1 בלי לגעת במנוע.

    python3 tools/make_fixture.py
"""
from __future__ import annotations

import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fixtures" / "demo-points.json"

EPOCH = date(1937, 1, 1)
START = date(1937, 1, 1)
END = date(1946, 12, 31)
SEED = 1939
COUNT = 200

# תיבה גסה סביב אירופה — רק כדי שהנקודות ייפלו על המסך
LON_MIN, LON_MAX = -9.0, 40.0
LAT_MIN, LAT_MAX = 36.0, 60.0

CATEGORIES = ("alpha", "beta", "gamma")


def day_index(d: date) -> int:
    return (d - EPOCH).days


def build() -> dict:
    rng = random.Random(SEED)
    min_day, max_day = day_index(START), day_index(END)
    span = max_day - min_day

    features = []
    for i in range(COUNT):
        # פיזור לא אחיד בזמן: שיא סביב 1942–1944, כדי שההיסטוגרמה
        # בסרגל הזמן תראה צורה ולא קו ישר
        peak = day_index(date(1943, 3, 1))
        start = int(rng.gauss(peak, span * 0.22))
        start = max(min_day, min(max_day - 60, start))
        duration = int(abs(rng.gauss(400, 260))) + 45
        end = min(max_day, start + duration)

        lon = round(rng.uniform(LON_MIN, LON_MAX), 4)
        lat = round(rng.uniform(LAT_MIN, LAT_MAX), 4)
        cat = CATEGORIES[i % len(CATEGORIES)]

        features.append({
            "id": f"demo-{i:03d}",
            "name": f"ישות בדיקה {i:03d}",
            "category": cat,
            "position": [lon, lat],
            "day_from": start,
            "day_to": end,
            "magnitude": round(2 + abs(math.sin(i * 0.7)) * 9, 1),
            # שדה שמודגם ככזה שחושב ולא נלקח ממקור — מפעיל את תג
            # ההסקה בכרטיס הישות
            "derived_score": round((duration / 365) * 10, 1),
            "derivation": "source",
            "source_ids": ["synthetic"],
        })

    features.sort(key=lambda f: f["id"])   # מיון יציב = פלט דטרמיניסטי

    return {
        "meta": {
            "generator": "tools/make_fixture.py",
            "seed": SEED,
            "count": COUNT,
            "epoch": EPOCH.isoformat(),
            "warning": "נתונים סינתטיים — אינם היסטוריים ואינם מייצגים דבר",
        },
        "features": features,
    }


def validate(doc: dict) -> list[str]:
    """אותם כללים כמו validate/rules.py, בזעיר אנפין."""
    errs = []
    min_day, max_day = day_index(START), day_index(END)
    for f in doc["features"]:
        if f["day_from"] > f["day_to"]:
            errs.append(f"{f['id']}: תאריך סיום קודם להתחלה")
        if not (min_day <= f["day_from"] <= max_day):
            errs.append(f"{f['id']}: day_from מחוץ לטווח")
        if not (min_day <= f["day_to"] <= max_day):
            errs.append(f"{f['id']}: day_to מחוץ לטווח")
        if not f.get("source_ids"):
            errs.append(f"{f['id']}: אין source_ids")
        lon, lat = f["position"]
        if not (LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX):
            errs.append(f"{f['id']}: מיקום מחוץ לתיבה")
    return errs


def main() -> None:
    doc = build()
    errs = validate(doc)
    if errs:
        for e in errs[:10]:
            print(f"  ✗ {e}")
        raise SystemExit(f"הוולידציה נכשלה — {len(errs)} שגיאות")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    days = [f["day_to"] - f["day_from"] for f in doc["features"]]
    print(f"✓ {OUT.relative_to(ROOT)}")
    print(f"  {len(doc['features'])} ישויות · משך ממוצע {sum(days)//len(days)} ימים")


if __name__ == "__main__":
    main()
