"""חישוב supply_context לכל קרב.

זהו האלגוריתם שמזין את מצב "מדוע" (FR-13) — התכונה המבדלת של המוצר.

⚠️ אזהרה מתודולוגית מרכזית
הקישור בין קרב לנתיב אספקה הוא **הסקה אלגוריתמית** המבוססת על קרבה במרחב
ובזמן — לא עובדה מתועדת. השדה נושא derivation='algorithmic', והממשק חייב
לנסח זאת כ"נתיבי אספקה פעילים באזור ובתקופה" ולא כ"הנתיב שהזין את הקרב".
ראו סיכון R10 באפיון.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, timedelta

from sqlalchemy import select

from config.settings import TH
from db.models import (Battle, Derivation, ReviewItem, SupplyRoute,
                       ThroughputRecord)
from db.session import haversine_km, session_scope


@dataclass
class SupplyContext:
    active_routes: list[str] = field(default_factory=list)
    supply_lag_km: float | None = None
    monthly_tonnage_available: float | None = None
    rail_gauge_break: bool = False
    bottleneck_note: str | None = None
    derivation: str = "algorithmic"
    method: str = "spatiotemporal_proximity"
    radius_km: float = TH.supply_radius_km
    window_days: int = TH.supply_window_days

    def to_json(self) -> dict:
        return asdict(self)


def _route_min_distance_km(route_geom_coords, lon: float, lat: float) -> float:
    """המרחק המינימלי מנקודה לנתיב. גס בכוונה — דיוק סנטימטרי חסר משמעות כאן."""
    if not route_geom_coords:
        return float("inf")
    return min(haversine_km(lon, lat, x, y) for x, y in route_geom_coords)


def compute_for_battle(session, battle: Battle) -> SupplyContext | None:
    if battle.lon is None or battle.lat is None or battle.valid_from is None:
        return None

    d0 = battle.valid_from
    win_start = d0 - timedelta(days=TH.supply_window_days)
    win_end = (battle.valid_to or d0) + timedelta(days=TH.supply_window_days)

    routes = session.scalars(
        select(SupplyRoute).where(
            (SupplyRoute.valid_from.is_(None) | (SupplyRoute.valid_from <= win_end)),
            (SupplyRoute.valid_to.is_(None) | (SupplyRoute.valid_to >= win_start)),
        )
    ).all()

    ctx = SupplyContext()
    nearest = float("inf")
    tonnage_total = 0.0

    for r in routes:
        coords = _coords_of(r)
        dist = _route_min_distance_km(coords, battle.lon, battle.lat)
        if dist > TH.supply_radius_km:
            continue

        ctx.active_routes.append(r.route_id)
        nearest = min(nearest, dist)

        for tp in session.scalars(
            select(ThroughputRecord).where(
                ThroughputRecord.route_id == r.route_id,
                ThroughputRecord.period_to >= win_start,
                ThroughputRecord.period_from <= win_end,
            )
        ):
            if tp.tonnage:
                tonnage_total += _prorate(tp, win_start, win_end)

    if not ctx.active_routes:
        return None

    ctx.active_routes.sort()                       # מיון = דטרמיניזם
    ctx.supply_lag_km = round(nearest, 1)
    ctx.monthly_tonnage_available = round(tonnage_total, 1)
    ctx.rail_gauge_break = _has_gauge_break(session, ctx.active_routes)
    ctx.bottleneck_note = _identify_bottleneck(ctx)
    return ctx


def _coords_of(route: SupplyRoute) -> list[tuple[float, float]]:
    g = getattr(route, "geom", None)
    if g is None:
        return []
    try:
        return list(g.coords)
    except (AttributeError, NotImplementedError):
        return []


def _prorate(tp: ThroughputRecord, win_start: date, win_end: date) -> float:
    """חלוקה יחסית של טונאז' לפי החפיפה בין תקופת הרשומה לחלון."""
    span = (tp.period_to - tp.period_from).days + 1
    if span <= 0:
        return 0.0
    ov_start = max(tp.period_from, win_start)
    ov_end = min(tp.period_to, win_end)
    overlap = (ov_end - ov_start).days + 1
    return (tp.tonnage or 0.0) * max(overlap, 0) / span


def _has_gauge_break(session, route_ids: list[str]) -> bool:
    """האם באחד הנתיבים יש מעבר רוחב מסילה.

    זהו הפרט שהופך את בעיית הלוגיסטיקה בברברוסה מהערת שוליים
    לגורם חזותי מרכזי.
    """
    from db.models import GraphEdge
    rows = session.scalars(
        select(GraphEdge).where(GraphEdge.graph == "rail",
                                GraphEdge.gauge_mm.isnot(None))
    ).all()
    gauges = {e.gauge_mm for e in rows}
    return len(gauges) > 1


def _identify_bottleneck(ctx: SupplyContext) -> str | None:
    if ctx.rail_gauge_break:
        return "נדרשת העמסה מחדש בשל שינוי רוחב מסילה"
    if ctx.supply_lag_km and ctx.supply_lag_km > 150:
        return f"קצה קו האספקה במרחק {ctx.supply_lag_km:.0f} ק\"מ"
    if ctx.monthly_tonnage_available is not None and ctx.monthly_tonnage_available < 1000:
        return "טונאז' זמין נמוך בתקופה"
    return None


def run() -> dict:
    """מריץ על כל הקרבות. נקרא מ-pipeline.py."""
    stats = {"processed": 0, "with_context": 0, "no_routes": 0}

    with session_scope() as s:
        battles = s.scalars(select(Battle).order_by(Battle.battle_id)).all()
        for b in battles:
            stats["processed"] += 1
            ctx = compute_for_battle(s, b)
            if ctx is None:
                stats["no_routes"] += 1
                b.supply_context = None
                continue
            b.supply_context = ctx.to_json()
            b.derivation = Derivation.SOURCE      # הישות עצמה עדיין ממקור
            stats["with_context"] += 1

        # שיעור כיסוי נמוך = הנתיבים חסרים, לא הקרבות
        if stats["processed"] and stats["with_context"] / stats["processed"] < 0.4:
            s.add(ReviewItem(
                kind="low_supply_coverage", entity_type="global", entity_id="-",
                payload=stats, score=stats["with_context"] / stats["processed"],
            ))
    return stats
