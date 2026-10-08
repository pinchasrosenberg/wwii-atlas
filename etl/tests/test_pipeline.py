"""בדיקות ליבה לצינור.

הבדיקה החשובה כאן היא `test_determinism` — היא מגנה על ההבטחה המרכזית
של הארכיטקטורה. אם היא נכשלת, כל בדיקות הרגרסיה האחרות חסרות משמעות.
"""
from __future__ import annotations

from datetime import date

import pytest


# ── יחידות מידה (R8 — הכשל השקט המסוכן ביותר) ─────────────────────────────
def test_metric_to_long_ton():
    from normalize.units import to_long_tons
    assert round(to_long_tons(1000, "metric_ton").value, 1) == 984.2


def test_short_to_long_ton():
    from normalize.units import to_long_tons
    assert round(to_long_tons(1000, "short_ton").value, 1) == 892.9


def test_long_ton_identity():
    from normalize.units import to_long_tons
    assert to_long_tons(500, "long_ton").value == 500.0


def test_unknown_unit_raises():
    """יחידה לא מוכרת חייבת לזרוק, לא לנחש. ניחוש כאן = שגיאה של 12%."""
    from normalize.units import UnitError, to_long_tons
    with pytest.raises(UnitError):
        to_long_tons(100, "barrels")


def test_grt_not_mixed_with_mass():
    """GRT הוא נפח ולא מסה — סכימה משותפת חייבת להיכשל."""
    from normalize.units import UnitError, sum_tonnage, to_long_tons
    with pytest.raises(UnitError):
        sum_tonnage([to_long_tons(100, "grt"), to_long_tons(100, "metric_ton")])


# ── תאריכים ───────────────────────────────────────────────────────────────
def test_day_index_epoch():
    from normalize.dates import day_index
    assert day_index("1937-01-01") == 0


def test_day_index_barbarossa():
    from config.settings import EPOCH
    from normalize.dates import day_index
    assert day_index("1941-06-22") == (date(1941, 6, 22) - EPOCH).days


def test_european_date_format():
    from normalize.dates import parse_date
    assert parse_date("22.6.1941") == date(1941, 6, 22)


def test_reversed_span_raises():
    from normalize.dates import DateError, span
    with pytest.raises(DateError):
        span("1944-06-06", "1943-01-01")


# ── רזולוציה דינמית (סעיף 5.2) ────────────────────────────────────────────
def test_normandy_is_daily():
    from config.settings import step_for
    assert step_for(date(1944, 6, 10)) == 1


def test_bulge_is_daily():
    from config.settings import step_for
    assert step_for(date(1944, 12, 20)) == 1


def test_quiet_period_is_monthly():
    from config.settings import DEFAULT_STEP_DAYS, step_for
    assert step_for(date(1943, 3, 15)) == DEFAULT_STEP_DAYS


# ── התאמת שמות ────────────────────────────────────────────────────────────
def test_normalize_polish_diacritics():
    from normalize.names import normalize
    assert normalize("Lwów") == normalize("Lwow")


def test_exact_match():
    from normalize.names import NameMatcher
    m = NameMatcher([("p1", "Lwów", 24.0, 49.8)])
    assert m.match("Lwów").place_id == "p1"


def test_fuzzy_far_away_rejected():
    """שם דומה במרחק גדול — כמעט תמיד עיר אחרת. חייב ללכת לבדיקה."""
    from normalize.names import NameMatcher
    m = NameMatcher([("p1", "Frankfurt", 8.68, 50.11)])
    r = m.match("Frankfurt", near=(14.55, 52.35))   # פרנקפורט על האודר
    assert r.needs_review or r.place_id is None


def test_no_match_needs_review():
    from normalize.names import NameMatcher
    m = NameMatcher([("p1", "Warszawa", 21.0, 52.2)])
    assert m.match("Yokohama").needs_review


# ── ולידציה דמוגרפית ──────────────────────────────────────────────────────
def test_breakdown_within_tolerance():
    from crossref.demographics import validate_breakdown
    ok, _ = validate_breakdown(1000, [{"count": 600}, {"count": 395}])
    assert ok


def test_breakdown_exceeds_tolerance():
    from crossref.demographics import validate_breakdown
    ok, detail = validate_breakdown(1000, [{"count": 600}, {"count": 300}])
    assert not ok and detail["deviation"] > 0.02


# ── ניתוב ─────────────────────────────────────────────────────────────────
def test_no_path_is_unroutable():
    """אין מסלול = unroutable. לעולם לא קו אווירי (כלל ברזל #4)."""
    import networkx as nx
    from graphs.routing import shortest_path
    g = nx.DiGraph()
    g.add_node("a", lon=0, lat=0)
    g.add_node("b", lon=1, lat=1)
    assert shortest_path(g, "a", "b").status == "unroutable"


def test_implausible_duration_flagged():
    from graphs.routing import Route, validate_duration
    r = Route(length_km=100, duration_hours=400, status="routed")
    assert validate_duration(r, documented_days=1).status == "implausible_duration"


def test_route_wkt_requires_two_points():
    from graphs.routing import Route
    assert Route(coords=[(0, 0)]).to_wkt() is None


# ── דטרמיניזם — הבדיקה החשובה ביותר ───────────────────────────────────────
@pytest.mark.slow
def test_determinism(tmp_path):
    """הרצה חוזרת על אותם קלטים → פלט זהה בייט-לבייט.

    זו ההבטחה שמצדיקה את הבחירה בקוד דטרמיניסטי על פני מודל שפה.
    אם הבדיקה הזו נופלת, בדיקות הרגרסיה האחרות חסרות ערך.
    """
    from pipeline import output_fingerprint
    first = output_fingerprint()
    second = output_fingerprint()
    assert first == second
