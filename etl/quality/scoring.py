"""ציון איכות, זיהוי חריגים ויישוב טענות מספריות.

הקוד בכוונה אינו משתמש במודל שפה ואינו "מתקן" את המקור. הוא מחזיר הערכה
נגזרת, דגלים וטווח קונצנזוס, תוך שמירה על כל הערכים הגולמיים.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from statistics import median
from typing import Iterable, Mapping, Sequence


WEIGHTS = {
    "provenance": 0.22,
    "authority": 0.18,
    "temporal_precision": 0.13,
    "spatial_precision": 0.13,
    "corroboration": 0.14,
    "completeness": 0.10,
    "consistency": 0.10,
}

PUBLISHABLE_RIGHTS = {
    "verified_public_domain",
    "attributed_sharealike",
    "citation_required",
}


@dataclass(frozen=True)
class QualityAssessment:
    score: int
    confidence: str
    publishable: bool
    decision: str
    flags: tuple[str, ...]
    components: Mapping[str, float]


def _unit_interval(value: object, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not isfinite(number):
        return default
    return max(0.0, min(1.0, number))


def assess_record(
    *,
    source_dimensions: Sequence[Mapping[str, float]],
    rights_statuses: Sequence[str],
    source_ids: Sequence[str],
    temporal_precision: float,
    spatial_precision: float,
    corroboration: float,
    completeness: float,
    consistency: float,
    required_fields_present: bool = True,
    geometry_valid: bool = True,
    dates_valid: bool = True,
) -> QualityAssessment:
    """הערכה שקופה של רשומה לאחר נרמול.

    מקור בעל סמכות גבוהה אינו מפצה על גאומטריה שבורה או תאריך הפוך. שלושת
    התנאים הקשיחים הופכים את ההחלטה ל־reject גם אם הציון המספרי גבוה.
    זכויות הן שער פרסום נפרד מהאמת ההיסטורית.
    """
    flags: list[str] = []
    if not source_ids:
        flags.append("missing_source")
    if not required_fields_present:
        flags.append("missing_required_fields")
    if not geometry_valid:
        flags.append("invalid_geometry")
    if not dates_valid:
        flags.append("invalid_dates")

    if source_dimensions:
        provenance = sum(
            _unit_interval(item.get("provenance")) for item in source_dimensions
        ) / len(source_dimensions)
        authority = sum(
            _unit_interval(item.get("authority")) for item in source_dimensions
        ) / len(source_dimensions)
    else:
        provenance = 0.0
        authority = 0.0

    components = {
        "provenance": provenance,
        "authority": authority,
        "temporal_precision": _unit_interval(temporal_precision),
        "spatial_precision": _unit_interval(spatial_precision),
        "corroboration": _unit_interval(corroboration),
        "completeness": _unit_interval(completeness),
        "consistency": _unit_interval(consistency),
    }
    score = round(100 * sum(components[key] * weight for key, weight in WEIGHTS.items()))

    hard_failure = bool(
        {"missing_source", "missing_required_fields", "invalid_geometry", "invalid_dates"}
        & set(flags)
    )
    publishable = bool(rights_statuses) and all(
        status in PUBLISHABLE_RIGHTS for status in rights_statuses
    )
    if not publishable:
        flags.append("rights_not_cleared")

    if score >= 85:
        confidence = "high"
    elif score >= 70:
        confidence = "medium"
    elif score >= 55:
        confidence = "low"
    else:
        confidence = "insufficient"

    if hard_failure or score < 55:
        decision = "reject"
    elif score < 70:
        decision = "review"
    elif not publishable:
        decision = "hold_rights"
    else:
        decision = "publish"

    return QualityAssessment(
        score=score,
        confidence=confidence,
        publishable=publishable,
        decision=decision,
        flags=tuple(sorted(set(flags))),
        components=components,
    )


def _quartiles(values: Sequence[float]) -> tuple[float, float]:
    ordered = sorted(values)
    n = len(ordered)
    if n < 4:
        return ordered[0], ordered[-1]
    lower = ordered[: n // 2]
    upper = ordered[(n + 1) // 2 :]
    return median(lower), median(upper)


def robust_outlier_flags(values: Iterable[float], threshold: float = 3.5) -> list[bool]:
    """מסמן חריגים בעזרת MAD, עם IQR כגיבוי כאשר MAD=0.

    הפלט מיושר לסדר הקלט. ערך לא־סופי מסומן תמיד כחריג.
    """
    original = list(values)
    finite = [float(value) for value in original if isfinite(float(value))]
    # בשלוש תצפיות כל אי־הסכמה אמיתית עלולה להיראות כחריג מושלם.
    # אין מספיק מידע סטטיסטי להוצאה אוטומטית; משאירים לבדיקה.
    if len(finite) < 4:
        return [not isfinite(float(value)) for value in original]

    center = median(finite)
    deviations = [abs(value - center) for value in finite]
    mad = median(deviations)
    if mad > 0:
        return [
            (not isfinite(float(value)))
            or (0.6745 * abs(float(value) - center) / mad > threshold)
            for value in original
        ]

    q1, q3 = _quartiles(finite)
    iqr = q3 - q1
    if iqr == 0:
        return [not isfinite(float(value)) or float(value) != center for value in original]
    low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return [
        not isfinite(float(value)) or not (low <= float(value) <= high)
        for value in original
    ]


def _weighted_quantile(pairs: Sequence[tuple[float, float]], quantile: float) -> float:
    ordered = sorted((value, max(0.0, weight)) for value, weight in pairs)
    total = sum(weight for _, weight in ordered)
    if total <= 0:
        return median(value for value, _ in ordered)
    target = total * quantile
    cumulative = 0.0
    for value, weight in ordered:
        cumulative += weight
        if cumulative >= target:
            return value
    return ordered[-1][0]


def reconcile_numeric_estimates(
    estimates: Sequence[Mapping[str, object]],
) -> dict[str, object]:
    """מחזיר טווח מוסכם בלי למחוק או לממוצע את העדויות הגולמיות.

    כל הערכה צריכה לכלול `value`, `source_id` ו־`weight`. מקורות מאותה
    `independence_group` נספרים פעם אחת במשקל המרבי, כדי למנוע "אימות"
    מזויף כאשר כמה אתרים העתיקו מאותו מסמך.
    """
    usable: list[dict[str, object]] = []
    for item in estimates:
        try:
            value = float(item["value"])
            weight = _unit_interval(item.get("weight"), 0.5)
        except (KeyError, TypeError, ValueError):
            continue
        if not isfinite(value):
            continue
        usable.append({**item, "value": value, "weight": weight})

    if not usable:
        return {
            "status": "no_usable_estimates",
            "range_min": None,
            "range_max": None,
            "agreement": 0.0,
            "included": [],
            "excluded": [],
        }

    flags = robust_outlier_flags(item["value"] for item in usable)
    included_raw = [item for item, flag in zip(usable, flags) if not flag]
    excluded = [item for item, flag in zip(usable, flags) if flag]
    if not included_raw:
        included_raw = usable
        excluded = []

    independent: dict[str, dict[str, object]] = {}
    for item in included_raw:
        group = str(item.get("independence_group") or item.get("source_id") or "unknown")
        current = independent.get(group)
        if current is None or float(item["weight"]) > float(current["weight"]):
            independent[group] = item
    pairs = [(float(item["value"]), float(item["weight"])) for item in independent.values()]

    lower = _weighted_quantile(pairs, 0.10)
    upper = _weighted_quantile(pairs, 0.90)
    center = _weighted_quantile(pairs, 0.50)
    spread = upper - lower
    scale = max(abs(center), 1.0)
    agreement = max(0.0, min(1.0, 1.0 - spread / scale))

    return {
        "status": "consensus" if len(independent) >= 2 else "single_independent_source",
        "range_min": lower,
        "range_max": upper,
        "central_estimate": center,
        "agreement": round(agreement, 4),
        "independent_sources": len(independent),
        "included": included_raw,
        "excluded": excluded,
        "derivation": "algorithmic",
        "method": "weighted_10_90_quantiles_after_MAD_IQR_outlier_screen",
    }
