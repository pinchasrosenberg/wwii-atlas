"""ניתוב טרנספורטים על גרף המסילות.

כלל ברזל #4 מיושם כאן: טרנספורט שלא נותב מקבל routing_status != 'routed'
ולא נכנס לפלט. הוא אינו מוצג כקו אווירי.
"""
from __future__ import annotations

from sqlalchemy import select

from db.models import Camp, Place, ReviewItem, Transport
from db.session import session_scope
from graphs.builder import build_graph
from graphs.routing import nearest_node, route_via, validate_duration


def _anchor(g, place: Place | Camp) -> str | None:
    """מוצא את הצומת בגרף המייצג מקום. עדיפות לצומת מסילה מפורש."""
    pid = getattr(place, "place_id", None)
    if pid:
        for n, d in g.nodes(data=True):
            if d.get("place_id") == pid:
                return n
    if place.lon is not None and place.lat is not None:
        return nearest_node(g, place.lon, place.lat)
    return None


def run(rebuild_graph_per_year: bool = True) -> dict:
    """מנתב את כל הטרנספורטים.

    rebuild_graph_per_year: רשת המסילות של 1939 אינה זו של 1944. ניתוב על
    הרשת הלא נכונה מייצר מסלולים שלא היו קיימים. יקר יותר, נכון יותר.
    """
    stats = {"total": 0, "routed": 0, "unroutable": 0, "implausible": 0}
    graph_cache: dict[int | None, object] = {}

    with session_scope() as s:
        transports = s.scalars(
            select(Transport).order_by(Transport.transport_id)).all()

        for t in transports:
            stats["total"] += 1

            year = t.departure_date.year if (t.departure_date and rebuild_graph_per_year) else None
            if year not in graph_cache:
                as_of = t.departure_date if year else None
                graph_cache[year] = build_graph("rail", as_of=as_of)
            g = graph_cache[year]

            origin = s.get(Place, t.origin_place_id)
            dest_camp = s.get(Camp, t.destination_camp_id) if t.destination_camp_id else None

            waypoints: list[str] = []
            src = _anchor(g, origin) if origin else None
            if src:
                waypoints.append(src)

            for pid in (t.pickup_place_ids or []):
                p = s.get(Place, pid)
                n = _anchor(g, p) if p else None
                if n:
                    waypoints.append(n)

            dst = _anchor(g, dest_camp) if dest_camp else None
            if dst:
                waypoints.append(dst)

            if len(waypoints) < 2:
                _fail(s, t, "unroutable", "לא נמצאו צמתי עיגון בגרף המסילות", stats)
                continue

            route = route_via(g, waypoints)

            documented_days = None
            if t.departure_date and t.arrival_date:
                documented_days = (t.arrival_date - t.departure_date).days or 0.5
            route = validate_duration(route, documented_days)

            if not route.ok:
                _fail(s, t, route.status, route.reason or "", stats)
                continue

            t.route_node_ids = route.node_ids
            t.route_length_km = round(route.length_km, 2)
            t.routing_status = "routed"
            # הגיאומטריה נכתבת כ-WKT; שכבת Geometry ממירה לפי דיאלקט
            t.route_geom = route.to_wkt()
            stats["routed"] += 1

    return stats


def _fail(session, t: Transport, status: str, reason: str, stats: dict) -> None:
    t.routing_status = status
    t.route_geom = None
    t.route_node_ids = None
    stats["implausible" if status == "implausible_duration" else "unroutable"] += 1
    session.add(ReviewItem(
        kind=status, entity_type="transport", entity_id=t.transport_id,
        payload={
            "origin": t.origin_place_id,
            "destination": t.destination_camp_id,
            "departure": t.departure_date.isoformat() if t.departure_date else None,
            "reason": reason,
        },
    ))
