"""הצלבת ערים ↔ מפקדי אוכלוסין, עם ולידציית ±2%.

שתי מלכודות מתודולוגיות שהקוד חייב לשמור עליהן:

1. **kind אינו נתון נלווה.** מפקד פולין 1931 מדד שפת אם ודת, לא לאום.
   מפקדים אחרים מדדו לאום. איחוד הקטגוריות בין מפקדים שמדדו דברים שונים
   הוא הטעיה, ולכן `breakdown_kind` נשמר ואין מיזוג בין kinds שונים.

2. **אין ניחוש בהתאמת שמות.** ציון מתחת לסף → review_queue, לא לפלט.
"""
from __future__ import annotations

from sqlalchemy import select

from config.settings import TH
from db.models import DemographicRecord, Place, PlaceName, ReviewItem
from db.session import session_scope
from normalize.names import NameMatcher


def _load_matcher(session) -> NameMatcher:
    """בונה מתאים מכל השמות ההיסטוריים — לא רק מהשם הקנוני."""
    rows = session.execute(
        select(PlaceName.place_id, PlaceName.name, Place.lon, Place.lat)
        .join(Place, Place.place_id == PlaceName.place_id)
        .order_by(PlaceName.place_id, PlaceName.name)
    ).all()
    return NameMatcher([(r[0], r[1], r[2], r[3]) for r in rows])


def link_census_rows(census_rows: list[dict], source_id: str) -> dict:
    """מקשר שורות מפקד לישויות Place ויוצר רשומות דמוגרפיות.

    census_rows: [{name, region?, lon?, lat?, as_of, total, kind, breakdown}]
    """
    stats = {"total": 0, "linked": 0, "review": 0, "sum_mismatch": 0}

    with session_scope() as s:
        matcher = _load_matcher(s)

        for row in sorted(census_rows, key=lambda r: (r.get("name") or "")):
            stats["total"] += 1
            near = None
            if row.get("lon") is not None and row.get("lat") is not None:
                near = (row["lon"], row["lat"])

            m = matcher.match(row.get("name", ""), near=near)

            if not m.accepted:
                stats["review"] += 1
                s.add(ReviewItem(
                    kind="name_match", entity_type="census_row",
                    entity_id=f"{source_id}:{row.get('name')}",
                    payload={"input": row.get("name"),
                             "best_guess": m.matched_name,
                             "method": m.method,
                             "distance_km": m.distance_km},
                    score=m.score,
                ))
                continue

            ok, detail = validate_breakdown(row.get("total"), row.get("breakdown") or [])
            if not ok:
                stats["sum_mismatch"] += 1
                s.add(ReviewItem(
                    kind="demographic_mismatch", entity_type="place",
                    entity_id=m.place_id or "?",
                    payload={"input_name": row.get("name"), **detail},
                    score=detail.get("deviation"),
                ))
                continue

            s.add(DemographicRecord(
                place_id=m.place_id,
                as_of=row["as_of"],
                total=row.get("total"),
                record_type=row.get("record_type", "prewar_population"),
                confidence=row.get("confidence", "census"),
                breakdown=row.get("breakdown") or [],
                breakdown_kind=row.get("kind"),   # ← לא לאבד. ראו מלכודת 1.
                source_ids=[source_id],
            ))
            stats["linked"] += 1

    return stats


def validate_breakdown(total: int | None, breakdown: list[dict]) -> tuple[bool, dict]:
    """סכום הפילוח לא חורג מ-±2% מהסך הכולל (סעיף 7.6).

    חריגה גדולה מסמנת בדרך כלל אחד משניים: קטגוריה שנשמטה בקריאת ה-OCR,
    או ערבוב בין שני מפקדים שונים.
    """
    if total is None or not breakdown:
        return True, {}
    s = sum(item.get("count") or 0 for item in breakdown)
    if total == 0:
        return s == 0, {"total": total, "sum": s}
    dev = abs(s - total) / total
    return dev <= TH.demographic_sum_tolerance, {
        "total": total, "sum": s, "deviation": round(dev, 4),
        "tolerance": TH.demographic_sum_tolerance,
    }


def refresh_battle_counts() -> int:
    """מרענן את Place.battle_count מטבלת הקישור.

    זהו שדה נגזר — הוא לעולם לא מוזן ידנית, ומחושב מחדש בכל build.
    """
    from db.models import BattlePlace
    updated = 0
    with session_scope() as s:
        counts: dict[str, int] = {}
        for bp in s.scalars(select(BattlePlace)):
            counts[bp.place_id] = counts.get(bp.place_id, 0) + 1
        for p in s.scalars(select(Place)):
            new = counts.get(p.place_id, 0)
            if p.battle_count != new:
                p.battle_count = new
                updated += 1
    return updated
