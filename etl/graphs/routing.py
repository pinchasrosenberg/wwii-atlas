"""ניתוב על גרף — דייקסטרה / A* עם אימות היתכנות.

כלל ברזל #4: **אין קו אווירי.** טרנספורט שלא נותב על מסילות אמיתיות אינו
מוצג במפה — הוא נכנס לתור הבדיקה. קו ישר בין ורשה לטרבלינקה נראה סביר
ומטעה לחלוטין: הוא מוחק את העובדה שהמסלול עבר דרך מלקיניה, ושהמסע ארך
שעות ולא דקות.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import networkx as nx

from config.settings import TH
from db.session import haversine_km


@dataclass
class Route:
    node_ids: list[str] = field(default_factory=list)
    coords: list[tuple[float, float]] = field(default_factory=list)
    length_km: float = 0.0
    duration_hours: float = 0.0
    gauge_breaks: int = 0
    status: str = "routed"     # routed | unroutable | implausible_duration
    reason: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == "routed"

    def to_wkt(self) -> str | None:
        if len(self.coords) < 2:
            return None
        pts = ", ".join(f"{lon} {lat}" for lon, lat in self.coords)
        return f"LINESTRING({pts})"


def _heuristic(g: nx.DiGraph, speed_kmh: float):
    """הערכת A*: זמן טיסה ישרה. אף פעם לא מעריכה ביתר — תנאי לנכונות."""
    def h(u, v):
        nu, nv = g.nodes[u], g.nodes[v]
        if None in (nu.get("lon"), nu.get("lat"), nv.get("lon"), nv.get("lat")):
            return 0.0
        return haversine_km(nu["lon"], nu["lat"], nv["lon"], nv["lat"]) / speed_kmh
    return h


def shortest_path(g: nx.DiGraph, source: str, target: str,
                  speed_kmh: float = TH.route_speed_kmh_freight) -> Route:
    """מסלול קצר ביותר בין שני צמתים. A* אם יש קואורדינטות, אחרת דייקסטרה."""
    if source not in g:
        return Route(status="unroutable", reason=f"צומת מוצא לא בגרף: {source}")
    if target not in g:
        return Route(status="unroutable", reason=f"צומת יעד לא בגרף: {target}")
    if source == target:
        return Route(node_ids=[source], status="routed")

    try:
        has_coords = all(g.nodes[n].get("lon") is not None for n in (source, target))
        if has_coords:
            path = nx.astar_path(g, source, target, heuristic=_heuristic(g, speed_kmh),
                                 weight="weight")
        else:
            path = nx.dijkstra_path(g, source, target, weight="weight")
    except nx.NetworkXNoPath:
        return Route(status="unroutable",
                     reason="אין מסלול בגרף בין המוצא ליעד בתאריך הנתון")
    except nx.NodeNotFound as e:
        return Route(status="unroutable", reason=str(e))

    return _materialize(g, path)


def route_via(g: nx.DiGraph, waypoints: list[str],
              speed_kmh: float = TH.route_speed_kmh_freight) -> Route:
    """מסלול דרך נקודות ביניים — טרנספורטים רבים אספו בכמה תחנות."""
    stops = [w for i, w in enumerate(waypoints) if i == 0 or w != waypoints[i - 1]]
    if len(stops) < 2:
        return Route(status="unroutable", reason="פחות משתי נקודות")

    total = Route()
    for a, b in zip(stops, stops[1:]):
        leg = shortest_path(g, a, b, speed_kmh)
        if not leg.ok:
            return leg
        if total.node_ids and leg.node_ids and total.node_ids[-1] == leg.node_ids[0]:
            leg.node_ids = leg.node_ids[1:]
            leg.coords = leg.coords[1:]
        total.node_ids += leg.node_ids
        total.coords += leg.coords
        total.length_km += leg.length_km
        total.duration_hours += leg.duration_hours
        total.gauge_breaks += leg.gauge_breaks
    return total


def _materialize(g: nx.DiGraph, path: list[str]) -> Route:
    r = Route(node_ids=path)
    for n in path:
        nd = g.nodes[n]
        if nd.get("lon") is not None and nd.get("lat") is not None:
            r.coords.append((nd["lon"], nd["lat"]))
    for u, v in zip(path, path[1:]):
        d = g.edges[u, v]
        r.length_km += d.get("length_km") or 0.0
        r.duration_hours += d.get("weight") or 0.0
        if d.get("gauge_break"):
            r.gauge_breaks += 1
    return r


def validate_duration(route: Route, documented_days: float | None) -> Route:
    """בדיקת סבירות מול משך המסע המתועד.

    פער חריג פירושו שאחד מהשלושה שגוי: זיהוי המקום, התאריך, או המסלול.
    בכל אחד מהמקרים — עדיף שהרשומה תגיע לבדיקה ולא למפה.
    """
    if documented_days is None or not route.ok:
        return route
    documented_hours = documented_days * 24
    if documented_hours <= 0:
        return route
    ratio = route.duration_hours / documented_hours
    if ratio > TH.route_duration_tolerance or ratio < 1 / TH.route_duration_tolerance:
        route.status = "implausible_duration"
        route.reason = (f"מסלול מחושב {route.duration_hours:.0f} שעות מול "
                        f"{documented_hours:.0f} שעות מתועדות (יחס {ratio:.1f})")
    return route


def nearest_node(g: nx.DiGraph, lon: float, lat: float,
                 max_km: float = 30.0) -> str | None:
    """הצומת הקרוב ביותר לנקודה. משמש לעיגון מחנה או עיר לגרף."""
    best, best_d = None, math.inf
    for n, d in g.nodes(data=True):
        if d.get("lon") is None:
            continue
        dist = haversine_km(lon, lat, d["lon"], d["lat"])
        if dist < best_d:
            best, best_d = n, dist
    return best if best_d <= max_km else None
