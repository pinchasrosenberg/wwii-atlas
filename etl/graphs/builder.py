"""בניית שלושת הגרפים ב-NetworkX.

הפרדה לשלושה גרפים אינה קפריזה: לרשת מסילות ולנתיב ימי אין אותה טופולוגיה
ואין אותה פונקציית משקל. ניסיון לאחד אותם לגרף אחד מייצר מסלולים אבסורדיים
— רכבת שממשיכה לים.

  rail      — צמתים=תחנות, קשתות=מקטעי מסילה, משקל=זמן + קנס שינוי רוחב
  maritime  — צמתים=נמלים ונקודות דרך, משקל=זמן + פרופיל סיכון
  land      — צמתים=צמתי דרכים, משקל=זמן, עם קיבולת יומית בטונות
"""
from __future__ import annotations

from datetime import date

import networkx as nx
from sqlalchemy import select

from config.settings import TH
from db.models import GraphEdge, GraphNode
from db.session import session_scope

GRAPHS = ("rail", "maritime", "land")


def build_graph(graph: str, as_of: date | None = None) -> nx.DiGraph:
    """טוען גרף מהמסד לזיכרון, מסונן לתאריך נתון.

    as_of חשוב: רשת המסילות של 1939 אינה זו של 1944 — קווים נבנו, נהרסו
    ושונו ברוחבם. ניתוב טרנספורט מ-1942 על רשת של 1945 הוא שגיאה.
    """
    if graph not in GRAPHS:
        raise ValueError(f"גרף לא מוכר: {graph}")

    g = nx.DiGraph(name=graph, as_of=as_of.isoformat() if as_of else None)

    with session_scope() as s:
        for n in s.scalars(select(GraphNode).where(GraphNode.graph == graph)):
            g.add_node(n.node_id, lon=n.lon, lat=n.lat,
                       place_id=n.place_id, kind=n.node_kind, gauge=n.gauge_mm)

        q = select(GraphEdge).where(GraphEdge.graph == graph)
        for e in s.scalars(q):
            if as_of and not _edge_active(e, as_of):
                continue
            w = _weight(e)
            g.add_edge(e.from_node, e.to_node, key=e.edge_id, weight=w,
                       length_km=e.length_km, gauge=e.gauge_mm,
                       importance=e.importance, damaged=e.is_damaged,
                       capacity=e.capacity_tons_day, risk=e.risk_factor)
            g.add_edge(e.to_node, e.from_node, key=e.edge_id, weight=w,
                       length_km=e.length_km, gauge=e.gauge_mm,
                       importance=e.importance, damaged=e.is_damaged,
                       capacity=e.capacity_tons_day, risk=e.risk_factor)
    return g


def _edge_active(e: GraphEdge, d: date) -> bool:
    if e.valid_from and d < e.valid_from:
        return False
    if e.valid_to and d > e.valid_to:
        return False
    return True


def _weight(e: GraphEdge) -> float:
    """פונקציית המשקל. זה המקום היחיד שבו 'עלות' מוגדרת."""
    w = e.weight_hours or (e.length_km / 30.0)
    if e.is_damaged:
        w *= TH.damaged_segment_penalty
    if e.risk_factor:
        w *= (1.0 + e.risk_factor)      # גרף ימי — סיכון מייקר את המסלול
    return w


def apply_gauge_penalties(g: nx.DiGraph) -> nx.DiGraph:
    """מוסיף קנס במעבר בין רוחבי מסילה שונים.

    זו לא אופטימיזציה — זה הסיפור. הגבול בין רוחב אירופאי (1,435 מ"מ)
    לרוחב רוסי (1,520 מ"מ) חייב העמסה מחדש של כל מטען, והוא אחד ההסברים
    המרכזיים לקריסת הלוגיסטיקה הגרמנית בברברוסה. הקנס הופך את זה למשהו
    שהניתוב מרגיש, ולכן למשהו שהמפה מראה.
    """
    for u, v, d in g.edges(data=True):
        gu = g.nodes[u].get("gauge")
        gv = g.nodes[v].get("gauge")
        if gu and gv and gu != gv:
            d["weight"] += TH.gauge_break_penalty_hours
            d["gauge_break"] = True
    return g


def build_all(as_of: date | None = None) -> dict[str, nx.DiGraph]:
    out = {}
    for name in GRAPHS:
        g = build_graph(name, as_of)
        if name == "rail":
            g = apply_gauge_penalties(g)
        out[name] = g
    return out


def coverage_report(g: nx.DiGraph) -> dict:
    """מדד כיסוי — סיכון R9 באפיון.

    גרף מקוטע מייצר טרנספורטים שאי אפשר לנתב. עדיף לדעת את זה מראש
    מאשר לגלות שחצי מהטרנספורטים נכשלו.
    """
    und = g.to_undirected()
    components = list(nx.connected_components(und)) if g.number_of_nodes() else []
    largest = max((len(c) for c in components), default=0)
    return {
        "graph": g.graph.get("name"),
        "nodes": g.number_of_nodes(),
        "edges": g.number_of_edges(),
        "components": len(components),
        "largest_component": largest,
        "largest_share": (largest / g.number_of_nodes()) if g.number_of_nodes() else 0.0,
        "isolated_nodes": sum(1 for n in g if und.degree(n) == 0),
    }
