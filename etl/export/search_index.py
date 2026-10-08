"""בניית אינדקס חיפוש סטטי — מסלול 2 ב-RAG.md.

זהו התחליף ל-RAG בזמן ריצה. במקום שרת מאזין שעונה על שאילתות, האינדקס
נבנה כאן פעם אחת ומוגש כקובץ סטטי. הדפדפן מחפש מקומית.

שני דרגים:
  1. לקסיקלי — אינדקס הפוך על שמות מקומות וישויות, כולל כל התעתיקים
     ההיסטוריים. קטן, מיידי, ללא תלויות. **ממומש כאן.**
  2. סמנטי — וקטורים מחושבים מראש לחיפוש חופשי. **שלד בלבד**, ראו
     האזהרה על זהות המודל למטה.

⚠️ אילוץ קריטי לדרג 2
המודל שמטמיע כאן והמודל שמטמיע את שאילתת המשתמש בדפדפן חייבים להיות
אותו מודל. `nomic-embed-text` (Ollama) משמש את מסלול 1 ואין לו מקבילה
בדפדפן — ולכן הוא אסור כאן. יש לבחור מודל עם שני מימושים, למשל
all-MiniLM-L6-v2. אי-התאמה לא תזרוק שגיאה: החיפוש יחזיר תוצאות שגויות
בשקט, וזה הכשל הגרוע מכולם.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select

from config.settings import OUT_DIR, SORT_BEFORE_EXPORT
from db.models import Battle, Camp, Place, PlaceName, SupplyRoute
from db.session import session_scope

INDEX_DIR = OUT_DIR / "search"
INDEX_DIR.mkdir(parents=True, exist_ok=True)

MIN_TOKEN = 2
MAX_POSTINGS = 40      # תקרה למונח נפוץ — מונע ניפוח האינדקס

# מודל ההטמעה לדרג 2. חייב להיות בעל מימוש בדפדפן.
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBED_MODEL_BROWSER = "Xenova/all-MiniLM-L6-v2"
EMBED_DIM = 384


# ══════════════════════════════════════════════════════════════════════════
#  נרמול
# ══════════════════════════════════════════════════════════════════════════
def normalize(text: str) -> str:
    """חייב להיות זהה ל-normalizeToken ב-src/core/search-index.js.

    כל סטייה בין השניים = מונח שנכנס לאינדקס בצורה אחת ומחופש בצורה
    אחרת, ואף פעם לא נמצא.
    """
    if not text:
        return ""
    s = unicodedata.normalize("NFKD", text.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    # שומר אותיות וספרות בכל כתב — לטינית, עברית, קירילית, יוונית.
    # \w בפייתון הוא Unicode-aware כברירת מחדל; ב-JavaScript הוא ASCII
    # בלבד, ולכן שם נדרש \p{L}\p{N} מפורש. שמות כמו Львів ו-Ελλάδα
    # מופיעים בפרויקט הזה, וכתיבה צרה מדי הייתה מוחקת אותם בשקט.
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
    return " ".join(s.split())


def tokenize(text: str) -> list[str]:
    return [t for t in normalize(text).split() if len(t) >= MIN_TOKEN]


# ══════════════════════════════════════════════════════════════════════════
#  דרג 1 — לקסיקלי
# ══════════════════════════════════════════════════════════════════════════
@dataclass
class Doc:
    ref: str                       # "place:Q270"
    label: str                     # השם להצגה
    kind: str                      # place | battle | camp | route
    lon: float | None = None
    lat: float | None = None
    day_from: int | None = None
    day_to: int | None = None
    aliases: list[str] = field(default_factory=list)
    text: str = ""                 # לדרג 2 בלבד


def collect_docs() -> list[Doc]:
    """אוסף את כל הישויות שניתן לחפש. כל סוג יודע מה השם שלו."""
    docs: list[Doc] = []

    with session_scope() as s:
        # ── מקומות: כל שם היסטורי הוא alias ──
        names_by_place: dict[str, list[str]] = defaultdict(list)
        for pn in s.scalars(select(PlaceName)):
            names_by_place[pn.place_id].append(pn.name)

        for p in s.scalars(select(Place)):
            docs.append(Doc(
                ref=f"place:{p.place_id}",
                label=p.canonical_name,
                kind="place",
                lon=p.lon, lat=p.lat,
                aliases=sorted(set(names_by_place.get(p.place_id, []))),
                text=f"{p.canonical_name} {' '.join(names_by_place.get(p.place_id, []))}",
            ))

        for b in s.scalars(select(Battle)):
            docs.append(Doc(
                ref=f"battle:{b.battle_id}",
                label=b.name_he or b.name_en,
                kind="battle",
                lon=b.lon, lat=b.lat,
                day_from=b.day_from, day_to=b.day_to,
                aliases=[x for x in (b.name_en, b.name_he) if x],
                text=f"{b.name_en} {b.name_he or ''} {b.theater}",
            ))

        for c in s.scalars(select(Camp)):
            docs.append(Doc(
                ref=f"camp:{c.camp_id}",
                label=c.name,
                kind="camp",
                lon=c.lon, lat=c.lat,
                day_from=c.day_from, day_to=c.day_to,
                text=f"{c.name} {c.camp_type}",
            ))

        for r in s.scalars(select(SupplyRoute)):
            docs.append(Doc(
                ref=f"route:{r.route_id}",
                label=r.name_he or r.name_en,
                kind="route",
                day_from=r.day_from, day_to=r.day_to,
                aliases=[x for x in (r.name_en, r.name_he) if x],
                text=f"{r.name_en} {r.name_he or ''} {r.route_class}",
            ))

    if SORT_BEFORE_EXPORT:
        docs.sort(key=lambda d: d.ref)     # דטרמיניזם
    return docs


def build_lexical(docs: list[Doc]) -> dict:
    """אינדקס הפוך: מונח → רשימת אינדקסים של מסמכים."""
    postings: dict[str, set[int]] = defaultdict(set)

    for i, d in enumerate(docs):
        for source in [d.label, *d.aliases]:
            for tok in tokenize(source):
                postings[tok].add(i)
                # קידומות — כדי שהקלדה חלקית תמצא ("ורש" → "ורשה")
                for n in range(3, min(len(tok), 8)):
                    postings[tok[:n]].add(i)

    terms = {
        t: sorted(ids)[:MAX_POSTINGS]
        for t, ids in sorted(postings.items())
        if len(ids) <= MAX_POSTINGS * 3
    }

    return {
        "version": 1,
        "normalizer": "nfkd-lower-strip-marks",
        "docs": [
            {
                "ref": d.ref, "label": d.label, "kind": d.kind,
                "lon": d.lon, "lat": d.lat,
                "from": d.day_from, "to": d.day_to,
                "alt": d.aliases[:6],
            }
            for d in docs
        ],
        "terms": terms,
    }


# ══════════════════════════════════════════════════════════════════════════
#  דרג 2 — סמנטי (שלד)
# ══════════════════════════════════════════════════════════════════════════
def build_semantic(docs: list[Doc]) -> dict | None:
    """מחשב וקטורים לכל מסמך. מחזיר None אם התלות אינה מותקנת.

    השלב הזה אופציונלי בכוונה: הוא מוסיף תלות כבדה ומאות מגהבייטים של
    מודל, והוא נדרש רק משלב 7 ואילך. עד אז דרג 1 מספיק.
    """
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        return None

    model = SentenceTransformer(EMBED_MODEL)
    texts = [d.text for d in docs]
    vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)

    if vecs.shape[1] != EMBED_DIM:
        raise ValueError(
            f"ממד לא צפוי {vecs.shape[1]} — הדפדפן מצפה ל-{EMBED_DIM}. "
            f"בדוק שהמודל תואם ל-{EMBED_MODEL_BROWSER}."
        )

    # float16 חוצה את הגודל; הדיוק מספיק לדמיון קוסינוס
    return {
        "version": 1,
        "model": EMBED_MODEL,
        "model_browser": EMBED_MODEL_BROWSER,   # הדפדפן מאמת התאמה
        "dim": EMBED_DIM,
        "count": len(docs),
        "vectors": vecs.astype("float16").tobytes().hex(),
    }


# ══════════════════════════════════════════════════════════════════════════
def build_all(with_semantic: bool = False) -> dict:
    docs = collect_docs()

    lex_path = INDEX_DIR / "lexical.json"
    lexical = build_lexical(docs)
    lex_path.write_text(
        json.dumps(lexical, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
        encoding="utf-8",
    )

    out = {
        "docs": len(docs),
        "terms": len(lexical["terms"]),
        "lexical_kb": round(lex_path.stat().st_size / 1024, 1),
        "semantic": "skipped",
    }

    if with_semantic:
        sem = build_semantic(docs)
        if sem is None:
            out["semantic"] = "sentence-transformers לא מותקן — דולג"
        else:
            sem_path = INDEX_DIR / "semantic.json"
            sem_path.write_text(json.dumps(sem, separators=(",", ":")), encoding="utf-8")
            out["semantic"] = f"{round(sem_path.stat().st_size / 1024)}KB"

    return out


if __name__ == "__main__":
    print(json.dumps(build_all(), ensure_ascii=False, indent=2))
