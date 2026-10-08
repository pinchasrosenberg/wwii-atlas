"""נרמול יחידות מידה — הכול ל-long tons.

זהו סעיף R8 בטבלת הסיכונים, והוא שם לא במקרה. מקורות בריטיים ואמריקאיים
מהתקופה משתמשים ב-long ton (1,016 ק"ג); מקורות אמריקאיים מודרניים לעיתים
ב-short ton (907 ק"ג); מקורות אירופאיים בטונה מטרית (1,000 ק"ג). הפער בין
long ל-short הוא 12% — מספיק כדי להפוך השוואה בין מסלולים לשקר, ולא מספיק
כדי שמישהו ישים לב.

לכן: אין המרה ידנית בקוד. הכול עובר דרך כאן, והיחידה המקורית נשמרת
בשדה `tonnage_unit_original` כדי שתמיד אפשר יהיה לחזור אחורה.
"""
from __future__ import annotations

from dataclasses import dataclass

# יחס המרה ל-long ton (1 long ton = 1016.0469088 ק"ג)
_KG_PER_LONG_TON = 1016.0469088

TO_LONG_TONS: dict[str, float] = {
    "long_ton":      1.0,
    "lt":            1.0,
    "ton":           1.0,        # במקורות בריטיים מהתקופה "ton" = long ton
    "gross_ton":     1.0,        # GRT — נפח, לא מסה; ראו אזהרה למטה
    "grt":           1.0,
    "short_ton":     907.18474 / _KG_PER_LONG_TON,      # ≈ 0.8929
    "st":            907.18474 / _KG_PER_LONG_TON,
    "metric_ton":    1000.0 / _KG_PER_LONG_TON,         # ≈ 0.9842
    "tonne":         1000.0 / _KG_PER_LONG_TON,
    "t":             1000.0 / _KG_PER_LONG_TON,
    "kg":            1.0 / _KG_PER_LONG_TON,
    "lb":            0.45359237 / _KG_PER_LONG_TON,
    "pood":          16.3807 / _KG_PER_LONG_TON,        # מקורות רוסיים
}

# יחידות שאינן מסה ואסור להמיר אותן בשקט
_VOLUME_UNITS = {"gross_ton", "grt", "register_ton"}


@dataclass(frozen=True)
class Tonnage:
    value: float
    unit_original: str
    is_volume: bool = False

    def __post_init__(self):
        if self.value < 0:
            raise ValueError(f"טונאז' שלילי: {self.value}")


class UnitError(ValueError):
    pass


def normalize_unit(unit: str | None) -> str:
    if not unit:
        return "long_ton"       # ברירת מחדל למקורות בריטיים מהתקופה
    u = unit.strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {
        "long_tons": "long_ton", "longtons": "long_ton",
        "short_tons": "short_ton", "shorttons": "short_ton",
        "metric_tons": "metric_ton", "tonnes": "tonne",
        "gross_register_tons": "grt", "gross_registered_tons": "grt",
        "kilograms": "kg", "kilos": "kg", "pounds": "lb",
    }
    u = aliases.get(u, u)
    if u not in TO_LONG_TONS:
        raise UnitError(f"יחידה לא מוכרת: {unit!r}. הוסף אותה ל-TO_LONG_TONS במפורש.")
    return u


def to_long_tons(value: float | None, unit: str | None = None) -> Tonnage | None:
    """ממיר ערך ליחידת התקן של האטלס.

    >>> round(to_long_tons(1000, "metric_ton").value, 1)
    984.2
    >>> round(to_long_tons(1000, "short_ton").value, 1)
    892.9
    """
    if value is None:
        return None
    u = normalize_unit(unit)

    if u in _VOLUME_UNITS:
        # GRT הוא מדד נפח פנימי של אנייה, לא מסת מטען. אנחנו לא מתרגמים
        # אותו — רק מסמנים, כדי שלא ייסכם בטעות יחד עם טונאז' מטען.
        return Tonnage(float(value), u, is_volume=True)

    return Tonnage(float(value) * TO_LONG_TONS[u], u)


def sum_tonnage(items: list[Tonnage | None]) -> float:
    """סכימה בטוחה — מתעלמת מ-None וזורקת על ערבוב נפח במסה."""
    vals = [t for t in items if t is not None]
    if any(t.is_volume for t in vals) and any(not t.is_volume for t in vals):
        raise UnitError("ניסיון לסכם GRT (נפח) יחד עם טונאז' מטען (מסה).")
    return sum(t.value for t in vals)


# ── ערכי ייחוס לבדיקת רגרסיה (סעיף 7.6) ──────────────────────────────────
# מספרים מוסכמים מהספרות. אם ה-build מייצר משהו אחר — משהו נשבר בהמרה.
REFERENCE_TOTALS_LONG_TONS = {
    "lend_lease_total_ussr":   17_500_000,
    "persian_corridor":         7_900_000,
    "north_russia_route":       3_964_000,
    "soviet_far_east_route":    8_224_000,
    "soviet_arctic_route":        452_000,
}

REFERENCE_LOSS_RATES = {
    "north_russia_route":     0.07,
    "soviet_far_east_route":  0.01,
    "soviet_arctic_route":    0.00,
}


def check_against_reference(key: str, computed: float, tolerance: float = 0.05) -> bool:
    """האם הסכום המחושב תואם את ערך הייחוס. False מפיל את ה-build."""
    ref = REFERENCE_TOTALS_LONG_TONS.get(key)
    if ref is None:
        return True
    return abs(computed - ref) / ref <= tolerance
