"""הגדרות מרכזיות לצינור ה-ETL.

כל ערך שניתן לכוונן נמצא כאן ולא מפוזר בקוד — כדי ששינוי סף ביטחון או רדיוס
חיפוש יהיה החלטה מתועדת ולא עריכה מקומית בקובץ אקראי.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── נתיבים ────────────────────────────────────────────────────────────────
RAW_DIR = ROOT / "data" / "raw"            # קבצי מקור ללא שינוי — לעולם לא נערכים
WORK_DIR = ROOT / "data" / "work"          # תוצרי ביניים
OUT_DIR = ROOT / "data" / "out"            # פלט סופי: PMTiles, Parquet, manifest
REVIEW_DIR = ROOT / "data" / "review"      # תור בדיקה ידנית

for _d in (RAW_DIR, WORK_DIR, OUT_DIR, REVIEW_DIR):
    _d.mkdir(parents=True, exist_ok=True)


# ── ציר הזמן ──────────────────────────────────────────────────────────────
EPOCH = date(1937, 1, 1)                   # יום 0. הזמן מיוצג כמספר ימים מכאן.
TIMELINE_START = date(1937, 1, 1)
TIMELINE_END = date(1946, 12, 31)


def to_day_index(d: date) -> int:
    """תאריך → ימים מאז EPOCH. זה הייצוג שעובר ל-deck.gl לסינון ב-shader."""
    return (d - EPOCH).days


# ── חלונות רזולוציה גבוהה (סעיף 5.2 באפיון) ───────────────────────────────
# מחוץ לחלונות האלה הרזולוציה הטריטוריאלית חודשית.
@dataclass(frozen=True)
class ResolutionWindow:
    key: str
    label_he: str
    start: date
    end: date
    step_days: int                         # 1 = יומי, 7 = שבועי
    source: str


HIGH_RES_WINDOWS: tuple[ResolutionWindow, ...] = (
    ResolutionWindow("poland_1939", "פלישה לפולין",
                     date(1939, 9, 1), date(1939, 10, 6), 7, "manual_digitization"),
    ResolutionWindow("fall_of_france", "נפילת צרפת",
                     date(1940, 5, 10), date(1940, 6, 22), 7, "manual_digitization"),
    ResolutionWindow("barbarossa", "פתיחת ברברוסה",
                     date(1941, 6, 22), date(1941, 12, 5), 7, "manual_digitization"),
    ResolutionWindow("normandy", "נחיתת נורמנדי ופריצת הראש",
                     date(1944, 6, 6), date(1944, 8, 25), 1, "loc_situation_maps"),
    ResolutionWindow("market_garden", "מבצע מרקט גארדן",
                     date(1944, 9, 17), date(1944, 9, 25), 1, "loc_situation_maps"),
    ResolutionWindow("bulge", "קרב הבליטה",
                     date(1944, 12, 16), date(1945, 1, 25), 1, "loc_situation_maps"),
    ResolutionWindow("vistula_oder", "מבצע ויסלה-אודר",
                     date(1945, 1, 12), date(1945, 2, 2), 7, "manual_digitization"),
    ResolutionWindow("rhine", "חציית הריין",
                     date(1945, 3, 22), date(1945, 4, 1), 1, "loc_situation_maps"),
    ResolutionWindow("berlin", "קרב ברלין",
                     date(1945, 4, 16), date(1945, 5, 2), 1, "loc_situation_maps"),
)

DEFAULT_STEP_DAYS = 30                     # רזולוציה חודשית מחוץ לחלונות


def step_for(d: date) -> int:
    """מחזיר את צעד הרזולוציה החל על תאריך נתון."""
    for w in HIGH_RES_WINDOWS:
        if w.start <= d <= w.end:
            return w.step_days
    return DEFAULT_STEP_DAYS


# ── בסיס נתונים ───────────────────────────────────────────────────────────
DB_URLS = {
    "sqlite": f"sqlite:///{WORK_DIR / 'atlas.sqlite'}",
    "postgis": os.getenv("ATLAS_DB_URL", "postgresql+psycopg://atlas:atlas@localhost:5432/ww2atlas"),
}
DEFAULT_DIALECT = os.getenv("ATLAS_DIALECT", "sqlite")
SRID = 4326                                # WGS84 לכל הגיאומטריות


# ── ספי אלגוריתמים ────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Thresholds:
    # התאמת שמות מקומות היסטוריים (crossref/demographics.py)
    name_match_accept: int = 92            # ≥ מתקבל אוטומטית
    name_match_review: int = 78            # בין review ל-accept → תור בדיקה ידנית
    name_match_max_km: float = 25.0        # התאמה מטושטשת פסולה מעבר למרחק הזה

    # ולידציה דמוגרפית (סעיף 7.6)
    demographic_sum_tolerance: float = 0.02   # ±2% מהסך הכולל

    # supply_context (crossref/supply_context.py)
    supply_radius_km: float = 250.0        # רדיוס חיפוש נתיבים פעילים סביב קרב
    supply_window_days: int = 30           # חלון זמן סביב תאריך הקרב

    # ניתוב טרנספורטים (graphs/routing.py)
    route_speed_kmh_freight: float = 25.0  # מהירות ממוצעת לרכבת משא בתנאי מלחמה
    route_duration_tolerance: float = 2.5  # פי כמה מותר לחרוג ממשך המסע המתועד

    # גרף מסילות
    gauge_break_penalty_hours: float = 12.0   # קנס העמסה מחדש בשינוי רוחב מסילה
    damaged_segment_penalty: float = 3.0      # מכפיל זמן למקטע פגוע


TH = Thresholds()


# ── רמות זום לייצור אריחים (סעיף 7.7) ─────────────────────────────────────
@dataclass(frozen=True)
class ZoomSpec:
    layer: str
    minzoom: int
    maxzoom: int
    simplification: int = 4                # דרגת פישוט tippecanoe
    filter_sql: str | None = None          # תנאי SQL לבחירת תת-קבוצה בטווח הזום
    cluster: bool = False


ZOOM_SPECS: tuple[ZoomSpec, ...] = (
    # ── מסילות (L6) ──
    ZoomSpec("rail_trunk", 0, 5, simplification=10, filter_sql="importance = 'trunk'"),
    ZoomSpec("rail_main", 6, 8, simplification=6, filter_sql="importance IN ('trunk','main')"),
    ZoomSpec("rail_full", 9, 14, simplification=2, filter_sql=None),

    # ── מחנות (L14) ──
    ZoomSpec("camps_parent", 0, 5, filter_sql="parent_camp_id IS NULL"),
    ZoomSpec("camps_major", 6, 8,
             filter_sql="parent_camp_id IS NULL OR camp_type IN ('extermination','concentration')"),
    ZoomSpec("camps_full", 9, 14, filter_sql=None),

    # ── אירועים (L2, L12) ──
    ZoomSpec("sinkings_heat", 0, 5, cluster=True),
    ZoomSpec("sinkings_points", 6, 14),
    ZoomSpec("battles_cluster", 0, 5, cluster=True),
    ZoomSpec("battles_points", 6, 14),
)


# ── ייצוא Parquet ─────────────────────────────────────────────────────────
PARQUET_TABLES = ("sinkings", "battles", "transports", "throughput")
PARQUET_PARTITION_BY_YEAR = True           # הדפדפן טוען רק את פרוסת הזמן הנצפית

# ── דטרמיניזם ─────────────────────────────────────────────────────────────
RANDOM_SEED = 1939                         # אין רנדומיות בצינור, אבל אם תיכנס — נעולה
SORT_BEFORE_EXPORT = True                  # מיון יציב לפני כל ייצוא, לפלט זהה בייט-לבייט
