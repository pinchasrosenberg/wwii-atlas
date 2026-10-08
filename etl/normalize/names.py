"""נרמול והתאמת שמות מקומות היסטוריים.

זו הבעיה הקשה בפרויקט (R1). Lwów / Lviv / Lemberg / Львів / למברג הם אותה
עיר בחמש שפות ובארבעה משטרים. מפקד פולין 1931 קורא לה Lwów; USHMM קורא לה
Lvov; ויקידאטה קוראת לה Lviv.

הכלל: **אין ניחוש.** התאמה מתחת לסף הביטחון נכנסת ל-review_queue ולא לפלט.
עדיף חור בנתונים מאשר עיר שגויה על המפה.
"""
from __future__ import annotations

from dataclasses import dataclass

from rapidfuzz import fuzz, process
from unidecode import unidecode

from config.settings import TH
from db.session import haversine_km

# תעתיקים נפוצים שהתאמה מטושטשת לבדה מפספסת
TRANSLITERATIONS = {
    "ł": "l", "ń": "n", "ś": "s", "ż": "z", "ź": "z", "ć": "c", "ą": "a", "ę": "e",
    "ö": "oe", "ä": "ae", "ü": "ue", "ß": "ss",
    "š": "s", "č": "c", "ř": "r", "ě": "e", "ů": "u", "ý": "y",
    "ș": "s", "ț": "t", "ă": "a", "î": "i", "â": "a",
}

# תחיליות/סיומות שאפשר להתעלם מהן בהשוואה
_NOISE = ("stadt", "dorf", "ville", "burg", "grad", "gorod", "nad", "am", "an der",
          "upper", "lower", "north", "south", "east", "west",
          "górny", "dolny", "wielki", "mały", "stary", "nowy")


def normalize(name: str) -> str:
    """שם → צורה מנורמלת להשוואה. דטרמיניסטי לחלוטין."""
    if not name:
        return ""
    s = name.strip().lower()
    for src, dst in TRANSLITERATIONS.items():
        s = s.replace(src, dst)
    s = unidecode(s)
    s = "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in s)
    return " ".join(s.split())


def strip_noise(normalized: str) -> str:
    parts = [p for p in normalized.split() if p not in _NOISE]
    return " ".join(parts) or normalized


@dataclass
class MatchResult:
    place_id: str | None
    matched_name: str | None
    score: float
    method: str                 # exact | normalized | fuzzy | none
    needs_review: bool
    distance_km: float | None = None

    @property
    def accepted(self) -> bool:
        return self.place_id is not None and not self.needs_review


class NameMatcher:
    """התאמה מדורגת: מדויק → מנורמל → מטושטש עם סינון גיאוגרפי.

    candidates: [(place_id, name, lon, lat), ...] — כל השמות ההיסטוריים
    מטבלת place_names, לא רק השם הקנוני.
    """

    def __init__(self, candidates: list[tuple[str, str, float | None, float | None]]):
        # שם → רשימת מזהים. חייב להיות רשימה ולא ערך יחיד: Frankfurt am Main
        # ו-Frankfurt an der Oder נושאות את אותו שם בדיוק, ובחירה שרירותית
        # ביניהן שמה עיר על המפה במקום הלא נכון.
        self.by_exact: dict[str, list[str]] = {}
        self.by_norm: dict[str, list[str]] = {}
        self.coords: dict[str, tuple[float | None, float | None]] = {}
        self._norm_keys: list[str] = []

        for pid, name, lon, lat in candidates:
            self.by_exact.setdefault(name, []).append(pid)
            n = normalize(name)
            self.by_norm.setdefault(n, []).append(pid)
            self.coords[pid] = (lon, lat)
        self._norm_keys = sorted(self.by_norm)   # מיון = דטרמיניזם

    def match(self, name: str,
              near: tuple[float, float] | None = None) -> MatchResult:
        # 1. התאמה מדויקת
        if name in self.by_exact:
            ids = sorted(self.by_exact[name])
            if len(ids) == 1 and near is None:
                return MatchResult(ids[0], name, 100.0, "exact", False)
            if near:
                best = self._closest(ids, near)
                if best and best[1] <= TH.name_match_max_km:
                    return MatchResult(best[0], name, 100.0, "exact", False, best[1])
                # שם זהה אך רחוק מהמיקום הצפוי — כמעט תמיד עיר אחרת
                return MatchResult(None, name, 100.0, "exact", True,
                                   best[1] if best else None)
            if len(ids) == 1:
                return MatchResult(ids[0], name, 100.0, "exact", False)
            # שם עמום ואין רמז גיאוגרפי — לא מנחשים
            return MatchResult(None, name, 100.0, "exact", True)

        # 2. התאמה מנורמלת
        n = normalize(name)
        if n in self.by_norm:
            ids = sorted(self.by_norm[n])
            if len(ids) == 1:
                return MatchResult(ids[0], name, 98.0, "normalized", False)
            # עמימות — מכריעים גיאוגרפית אם אפשר, אחרת לבדיקה
            if near:
                best = self._closest(ids, near)
                if best and best[1] <= TH.name_match_max_km:
                    return MatchResult(best[0], name, 95.0, "normalized",
                                       False, best[1])
            return MatchResult(None, name, 90.0, "normalized", True)

        # 3. התאמה מטושטשת
        hit = process.extractOne(strip_noise(n), self._norm_keys,
                                 scorer=fuzz.WRatio,
                                 score_cutoff=TH.name_match_review)
        if not hit:
            return MatchResult(None, None, 0.0, "none", True)

        key, score, _ = hit
        ids = sorted(self.by_norm[key])
        dist = None
        if near:
            best = self._closest(ids, near)
            if best:
                pid, dist = best
                if dist > TH.name_match_max_km:
                    # שם דומה אבל רחוק מדי — כמעט תמיד עיר אחרת
                    return MatchResult(None, key, score, "fuzzy", True, dist)
                ids = [pid]

        return MatchResult(
            ids[0] if score >= TH.name_match_accept else None,
            key, float(score), "fuzzy",
            needs_review=score < TH.name_match_accept,
            distance_km=dist,
        )

    def _closest(self, ids: list[str],
                 near: tuple[float, float]) -> tuple[str, float] | None:
        lon0, lat0 = near
        best = None
        for pid in ids:
            lon, lat = self.coords.get(pid, (None, None))
            if lon is None or lat is None:
                continue
            d = haversine_km(lon0, lat0, lon, lat)
            if best is None or d < best[1]:
                best = (pid, d)
        return best
