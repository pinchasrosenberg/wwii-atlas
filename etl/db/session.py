"""ניהול חיבור למסד, עם זיהוי דיאלקט אוטומטי.

אותו קוד רץ מול SQLite (פיתוח מהיר) ומול PostGIS (build מלא). ההבדל היחיד
שדורש טיפול הוא שאילתות מרחביות — ראו `spatial_within_km`.
"""
from __future__ import annotations

import math
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from config.settings import DB_URLS, DEFAULT_DIALECT

_engine: Engine | None = None
_Session: sessionmaker | None = None
_dialect: str = DEFAULT_DIALECT


def init_db(dialect: str = DEFAULT_DIALECT, echo: bool = False) -> Engine:
    """אתחול המנוע. נקרא פעם אחת בתחילת הצינור."""
    global _engine, _Session, _dialect
    _dialect = dialect
    url = DB_URLS[dialect]
    _engine = create_engine(url, echo=echo, future=True)

    if dialect == "sqlite":
        @event.listens_for(_engine, "connect")
        def _sqlite_pragmas(conn, _):
            cur = conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")     # אילוצים לא נאכפים בלי זה
            try:
                # WAL מאיץ משמעותית, אבל נכשל על מערכות קבצים מרושתות
                # ועל תיקיות מסונכרנות (Dropbox/iCloud/mounts). לא סיבה
                # להפיל את הצינור — נופלים בחזרה ל-journal רגיל.
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA synchronous=NORMAL")
            except Exception:                          # noqa: BLE001
                cur.execute("PRAGMA journal_mode=DELETE")
            cur.close()
    else:
        with _engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))

    _Session = sessionmaker(bind=_engine, future=True, expire_on_commit=False)
    return _engine


def get_engine() -> Engine:
    if _engine is None:
        init_db()
    return _engine  # type: ignore[return-value]


def dialect() -> str:
    return _dialect


def is_postgis() -> bool:
    return _dialect == "postgis"


@contextmanager
def session_scope() -> Iterator[Session]:
    """סשן עם commit/rollback אוטומטי."""
    if _Session is None:
        init_db()
    s = _Session()  # type: ignore[misc]
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


# ── שאילתות מרחביות דו-דיאלקטיות ──────────────────────────────────────────

def spatial_within_km(table: str, geom_col: str, lon: float, lat: float,
                      km: float, extra_where: str = "") -> tuple[str, dict]:
    """בונה שאילתת 'בתוך רדיוס' המתאימה לדיאלקט הפעיל.

    PostGIS: ST_DWithin על geography — מדויק.
    SQLite:  bounding box על lon/lat + סינון Haversine מדויק בפייתון.
             פחות אלגנטי, אבל אין תלות ב-SpatiaLite.

    מחזיר (sql, params). המסנן הגס ב-SQLite מחייב סינון עדין אחריו —
    ראו crossref/supply_context.py.
    """
    where = f" AND {extra_where}" if extra_where else ""

    if is_postgis():
        sql = f"""
            SELECT * FROM {table}
            WHERE ST_DWithin({geom_col}::geography,
                             ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                             :meters){where}
        """
        return sql, {"lon": lon, "lat": lat, "meters": km * 1000}

    # SQLite — מסנן bbox גס; דיוק מושג בשלב הסינון בפייתון
    dlat = km / 111.32
    dlon = km / (111.32 * max(math.cos(math.radians(lat)), 0.01))
    sql = f"""
        SELECT * FROM {table}
        WHERE lat BETWEEN :lat_min AND :lat_max
          AND lon BETWEEN :lon_min AND :lon_max{where}
    """
    return sql, {
        "lat_min": lat - dlat, "lat_max": lat + dlat,
        "lon_min": lon - dlon, "lon_max": lon + dlon,
    }


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """מרחק מעגל גדול בק\"מ. משמש לסינון העדין ב-SQLite ולבדיקות סבירות."""
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
