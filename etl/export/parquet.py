"""ייצוא טבלאות אירועים ל-Parquet/Arrow.

למה לא GeoJSON: אלפי נקודות הטבעה ב-GeoJSON הן ~5–10 מגה של טקסט שהדפדפן
צריך לפרסר לפני שהוא מצייר משהו. אותם נתונים ב-Parquet הם מאות קילובייטים
בינאריים שנטענים ישירות לבאפרים של deck.gl בלי שלב פענוח.

חלוקה לפי שנה: הדפדפן טוען רק את פרוסת הזמן הנצפית, לא את כל המלחמה.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
from sqlalchemy import text

from config.settings import (OUT_DIR, PARQUET_PARTITION_BY_YEAR, PARQUET_TABLES,
                             SORT_BEFORE_EXPORT)
from db.session import session_scope

PARQUET_DIR = OUT_DIR / "data"
PARQUET_DIR.mkdir(parents=True, exist_ok=True)

# טבלה → (עמודת מיון, עמודת שנה, עמודות לייצוא)
EXPORT_SPEC = {
    "sinkings": (
        "id", "sunk_date",
        ["id", "vessel_name", "flag", "tonnage_grt", "day_index", "lon", "lat",
         "cause", "attacker_id", "convoy_id", "crew_lost"],
    ),
    "battles": (
        "battle_id", "valid_from",
        ["battle_id", "name_en", "name_he", "theater", "lon", "lat",
         "day_from", "day_to", "outcome", "casualties_min", "casualties_max"],
    ),
    "transports": (
        "transport_id", "departure_date",
        ["transport_id", "origin_place_id", "destination_camp_id",
         "day_from", "day_to", "persons_count", "survivors_count",
         "route_length_km", "routing_status"],
    ),
    "throughput": (
        "id", "period_from",
        ["id", "route_id", "period_from", "period_to", "tonnage",
         "losses_tonnage", "confidence"],
    ),
}


@dataclass
class ParquetResult:
    table: str
    path: Path
    rows: int
    bytes: int
    checksum: str


def _fetch(table: str) -> tuple[list[dict], str | None]:
    sort_col, year_col, cols = EXPORT_SPEC[table]
    col_sql = ", ".join(cols)
    order = f" ORDER BY {sort_col}" if SORT_BEFORE_EXPORT else ""

    # פילטר קשיח: לא מייצאים טרנספורט שלא נותב (כלל ברזל #4)
    where = " WHERE routing_status = 'routed'" if table == "transports" else ""

    with session_scope() as s:
        rows = [dict(r) for r in
                s.execute(text(f"SELECT {col_sql} FROM {table}{where}{order}")).mappings()]
    return rows, year_col


def export_table(table: str) -> list[ParquetResult]:
    rows, year_col = _fetch(table)
    if not rows:
        return []

    if PARQUET_PARTITION_BY_YEAR and year_col:
        buckets: dict[int | str, list[dict]] = {}
        for r in rows:
            v = r.get(year_col)
            year = getattr(v, "year", None) or "unknown"
            buckets.setdefault(year, []).append(r)
        return [_write(table, rs, suffix=str(y)) for y, rs in sorted(
            buckets.items(), key=lambda kv: str(kv[0]))]

    return [_write(table, rows)]


def _write(table: str, rows: list[dict], suffix: str | None = None) -> ParquetResult:
    name = f"{table}_{suffix}.parquet" if suffix else f"{table}.parquet"
    path = PARQUET_DIR / name

    arrays = {k: [r.get(k) for r in rows] for k in rows[0]}
    tbl = pa.table(arrays)

    pq.write_table(
        tbl, path,
        compression="zstd",
        # דטרמיניזם: בלי זה Parquet כותב חותמות זמן ומזהים משתנים
        write_statistics=True,
        store_schema=True,
        version="2.6",
    )
    data = path.read_bytes()
    return ParquetResult(table, path, len(rows), len(data),
                         hashlib.sha256(data).hexdigest()[:16])


def export_all() -> list[ParquetResult]:
    out: list[ParquetResult] = []
    for t in PARQUET_TABLES:
        if t in EXPORT_SPEC:
            out += export_table(t)
    return out
