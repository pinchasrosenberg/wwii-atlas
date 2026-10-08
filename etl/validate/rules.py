"""כללי הוולידציה מסעיף 7.6 באפיון.

כלל שנכשל ברמת ERROR מפיל את ה-build. זו לא חומרה מוגזמת: מסמך אפיון
שקובע "אין ישות בלי מקור" ואז מפרסם ישויות בלי מקור הוא מסמך חסר ערך.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum

from sqlalchemy import func, select

from config.settings import TIMELINE_END, TIMELINE_START
from db.models import (Battle, Camp, Convoy, DemographicRecord, Place,
                       SupplyRoute, ThroughputRecord, Transport)
from db.session import session_scope


class Level(str, Enum):
    ERROR = "error"       # מפיל את ה-build
    WARNING = "warning"   # מדווח ולא מפיל


@dataclass
class Finding:
    rule: str
    level: Level
    count: int
    message: str
    samples: list = None


RULES: list = []


def rule(name: str, level: Level = Level.ERROR):
    def deco(fn):
        fn._rule_name, fn._level = name, level
        RULES.append(fn)
        return fn
    return deco


# ── 1. מקורות ─────────────────────────────────────────────────────────────
@rule("every_entity_has_source")
def _sources(s) -> Finding | None:
    bad = []
    for model, key in ((Place, "place_id"), (Battle, "battle_id"),
                       (Camp, "camp_id"), (SupplyRoute, "route_id"),
                       (Transport, "transport_id")):
        for e in s.scalars(select(model)):
            if not getattr(e, "source_ids", None):
                bad.append(f"{model.__tablename__}:{getattr(e, key)}")
    if bad:
        return Finding("every_entity_has_source", Level.ERROR, len(bad),
                       "ישויות ללא source_ids", bad[:20])


# ── 2. תאריכים ────────────────────────────────────────────────────────────
@rule("dates_within_timeline")
def _timeline(s) -> Finding | None:
    bad = []
    for e in s.scalars(select(Battle)):
        for d in (e.valid_from, e.valid_to):
            if d and not (TIMELINE_START <= d <= TIMELINE_END):
                bad.append(f"battle:{e.battle_id}:{d}")
    for c in s.scalars(select(Camp)):
        for d in (c.valid_from, c.valid_to):
            if d and not (TIMELINE_START <= d <= TIMELINE_END):
                bad.append(f"camp:{c.camp_id}:{d}")
    if bad:
        return Finding("dates_within_timeline", Level.ERROR, len(bad),
                       f"תאריכים מחוץ לטווח {TIMELINE_START}–{TIMELINE_END}", bad[:20])


@rule("end_after_start")
def _order(s) -> Finding | None:
    bad = [f"battle:{b.battle_id}" for b in s.scalars(select(Battle))
           if b.valid_from and b.valid_to and b.valid_from > b.valid_to]
    bad += [f"transport:{t.transport_id}" for t in s.scalars(select(Transport))
            if t.departure_date and t.arrival_date and t.departure_date > t.arrival_date]
    if bad:
        return Finding("end_after_start", Level.ERROR, len(bad),
                       "תאריך סיום קודם לתאריך התחלה", bad[:20])


# ── 3. עקביות טרנספורטים ──────────────────────────────────────────────────
@rule("transport_arrives_at_active_camp")
def _camp_active(s) -> Finding | None:
    """טרנספורט שמגיע למחנה שטרם נפתח או שכבר נסגר.

    כמעט תמיד סימן לשגיאת תאריך באחד משני הצדדים.
    """
    bad = []
    for t in s.scalars(select(Transport)):
        if not (t.destination_camp_id and t.arrival_date):
            continue
        c = s.get(Camp, t.destination_camp_id)
        if not c:
            continue
        if c.valid_from and t.arrival_date < c.valid_from:
            bad.append(f"{t.transport_id}→{c.camp_id} (הגעה לפני פתיחה)")
        if c.valid_to and t.arrival_date > c.valid_to:
            bad.append(f"{t.transport_id}→{c.camp_id} (הגעה אחרי סגירה)")
    if bad:
        return Finding("transport_arrives_at_active_camp", Level.ERROR,
                       len(bad), "טרנספורט למחנה לא פעיל בתאריך ההגעה", bad[:20])


@rule("no_unrouted_transport_in_output")
def _routed(s) -> Finding | None:
    """כלל ברזל #4 — אין קו אווירי."""
    bad = [t.transport_id for t in s.scalars(select(Transport))
           if t.routing_status == "routed" and not t.route_node_ids]
    if bad:
        return Finding("no_unrouted_transport_in_output", Level.ERROR, len(bad),
                       "טרנספורט מסומן 'routed' ללא מסלול בפועל", bad[:20])


@rule("routing_coverage", Level.WARNING)
def _coverage(s) -> Finding | None:
    total = s.scalar(select(func.count()).select_from(Transport)) or 0
    if not total:
        return None
    routed = s.scalar(select(func.count()).select_from(Transport)
                      .where(Transport.routing_status == "routed")) or 0
    share = routed / total
    if share < 0.7:
        return Finding("routing_coverage", Level.WARNING, total - routed,
                       f"רק {share:.0%} מהטרנספורטים נותבו — בדוק את כיסוי גרף המסילות (R9)")


# ── 4. דמוגרפיה ───────────────────────────────────────────────────────────
@rule("demographic_sum_within_tolerance")
def _demo(s) -> Finding | None:
    from crossref.demographics import validate_breakdown
    bad = []
    for d in s.scalars(select(DemographicRecord)):
        ok, detail = validate_breakdown(d.total, d.breakdown)
        if not ok:
            bad.append(f"{d.place_id}@{d.as_of}: {detail}")
    if bad:
        return Finding("demographic_sum_within_tolerance", Level.ERROR,
                       len(bad), "סכום הפילוח חורג מ-±2%", bad[:20])


@rule("demographic_kind_present")
def _demo_kind(s) -> Finding | None:
    """kind חסר = הנתון בלתי ניתן לפרשנות ואסור להציגו."""
    bad = [f"{d.place_id}@{d.as_of}" for d in s.scalars(select(DemographicRecord))
           if d.breakdown and not d.breakdown_kind]
    if bad:
        return Finding("demographic_kind_present", Level.ERROR, len(bad),
                       "פילוח דמוגרפי ללא breakdown_kind (לאום/שפה/דת)", bad[:20])


# ── 5. עקביות מספרית ──────────────────────────────────────────────────────
@rule("numeric_consistency")
def _numeric(s) -> Finding | None:
    bad = []
    for c in s.scalars(select(Convoy)):
        if c.ships_lost is not None and c.ships_total is not None \
                and c.ships_lost > c.ships_total:
            bad.append(f"convoy:{c.convoy_id}")
    for tp in s.scalars(select(ThroughputRecord)):
        if tp.losses_tonnage is not None and tp.tonnage is not None \
                and tp.losses_tonnage > tp.tonnage:
            bad.append(f"throughput:{tp.id}")
    for cm in s.scalars(select(Camp)):
        if cm.deaths_min is not None and cm.deaths_max is not None \
                and cm.deaths_min > cm.deaths_max:
            bad.append(f"camp:{cm.camp_id}")
    if bad:
        return Finding("numeric_consistency", Level.ERROR, len(bad),
                       "אבדות גדולות מהסך, או טווח הפוך", bad[:20])


# ── 6. שלמות הפניות ───────────────────────────────────────────────────────
@rule("no_orphan_places")
def _orphans(s) -> Finding | None:
    ids = {p.place_id for p in s.scalars(select(Place))}
    bad = [f"transport:{t.transport_id}" for t in s.scalars(select(Transport))
           if t.origin_place_id not in ids]
    if bad:
        return Finding("no_orphan_places", Level.ERROR, len(bad),
                       "הפניה ל-place_id שאינו קיים", bad[:20])


# ── 7. שקיפות ─────────────────────────────────────────────────────────────
@rule("supply_context_marked_algorithmic")
def _derivation(s) -> Finding | None:
    """סיכון R10 — הסקה אלגוריתמית חייבת להיות מסומנת ככזו."""
    bad = [b.battle_id for b in s.scalars(select(Battle))
           if b.supply_context and b.supply_context.get("derivation") != "algorithmic"]
    if bad:
        return Finding("supply_context_marked_algorithmic", Level.ERROR,
                       len(bad), "supply_context ללא derivation='algorithmic'", bad[:20])


# ── 8. רגרסיית טונאז' ─────────────────────────────────────────────────────
@rule("tonnage_reference_check")
def _tonnage(s) -> Finding | None:
    """מגן מפני שגיאות המרת יחידות (R8) — הכשל השקט המסוכן ביותר."""
    from normalize.units import REFERENCE_TOTALS_LONG_TONS, check_against_reference
    bad = []
    for route_key in REFERENCE_TOTALS_LONG_TONS:
        total = s.scalar(
            select(func.sum(ThroughputRecord.tonnage))
            .where(ThroughputRecord.route_id == route_key)
        )
        if total and not check_against_reference(route_key, float(total)):
            bad.append(f"{route_key}: {total:,.0f} מול "
                       f"{REFERENCE_TOTALS_LONG_TONS[route_key]:,} צפוי")
    if bad:
        return Finding("tonnage_reference_check", Level.ERROR, len(bad),
                       "סכום טונאז' חורג מערך הייחוס — חשד לשגיאת המרת יחידות", bad)


# ── מריץ ──────────────────────────────────────────────────────────────────
def run_all() -> tuple[list[Finding], bool]:
    """מחזיר (ממצאים, האם ה-build תקף)."""
    findings: list[Finding] = []
    with session_scope() as s:
        for fn in RULES:
            try:
                f = fn(s)
            except Exception as e:                      # noqa: BLE001
                f = Finding(getattr(fn, "_rule_name", fn.__name__), Level.ERROR,
                            1, f"הכלל עצמו נכשל: {e}")
            if f:
                f.level = f.level or fn._level
                findings.append(f)
    has_errors = any(f.level == Level.ERROR for f in findings)
    return findings, not has_errors
