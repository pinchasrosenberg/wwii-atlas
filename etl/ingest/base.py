"""מחלקת בסיס לקליטת מקורות.

שני עקרונות:
  1. `raw/` הוא ארכיון בלתי משתנה. קובץ שהורד לא נערך אף פעם — כל עיבוד
     מייצר קובץ חדש. זה מה שמאפשר לשחזר build ישן.
  2. הורדה מדולגת אם ה-checksum זהה. בנייה חוזרת לא מפציצה שרתים.

אכיפת רישוי: מקור עם `access: permission` נחסם עד שמישהו מסמן במפורש
שהתקבל אישור. זו לא בירוקרטיה — uboat.net ויד ושם הם מקורות שהגישה
אליהם דורשת הסכמה, וגרידה בלי אישור פוגעת בפרויקט ובמוסדות.
"""
from __future__ import annotations

import hashlib
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import httpx
import yaml
from tenacity import retry, stop_after_attempt, wait_exponential

from config.settings import RAW_DIR, ROOT

SOURCES_YAML = ROOT / "config" / "sources.yaml"
PERMISSION_FILE = ROOT / "config" / "permissions_granted.yaml"

USER_AGENT = "ww2-atlas-etl/1.0 (research project; contact: maintainer@example.org)"


class PermissionDenied(RuntimeError):
    """מקור שדורש אישור ואין אישור. מכוון — לא באג."""


@dataclass
class SourceSpec:
    source_id: str
    name: str
    url: str | None
    download: str | None
    access: str
    license: str | None
    fmt: str | None
    refresh: str | None
    layers: list[str]
    raw: dict


def load_sources() -> dict[str, SourceSpec]:
    data = yaml.safe_load(SOURCES_YAML.read_text(encoding="utf-8"))
    out: dict[str, SourceSpec] = {}
    for sid, s in (data.get("sources") or {}).items():
        out[sid] = SourceSpec(
            source_id=sid, name=s.get("name", sid), url=s.get("url"),
            download=s.get("download"), access=s.get("access", "permission"),
            license=s.get("license"), fmt=s.get("format"),
            refresh=s.get("refresh"), layers=s.get("layers", []), raw=s,
        )
    return out


def _granted() -> set[str]:
    """מקורות שהתקבל עבורם אישור בכתב. נערך ידנית, במכוון."""
    if not PERMISSION_FILE.exists():
        return set()
    data = yaml.safe_load(PERMISSION_FILE.read_text(encoding="utf-8")) or {}
    return {k for k, v in (data.get("granted") or {}).items() if v}


class Ingestor(ABC):
    """בסיס לכל קולט מקור.

    מימוש מינימלי דורש `source_id` ו-`parse()`. ההורדה, המטמון ואכיפת
    הרישוי מטופלים כאן.
    """

    source_id: str = ""

    def __init__(self) -> None:
        self.spec = load_sources()[self.source_id]
        self.dir = RAW_DIR / self.source_id
        self.dir.mkdir(parents=True, exist_ok=True)

    # ── רישוי ────────────────────────────────────────────────────────────
    def check_access(self) -> None:
        if self.spec.access == "permission" and self.source_id not in _granted():
            raise PermissionDenied(
                f"[{self.source_id}] דורש אישור בכתב לפני גישה אוטומטית.\n"
                f"  רישיון: {self.spec.license}\n"
                f"  אחרי קבלת אישור: הוסף '{self.source_id}: true' תחת 'granted:' "
                f"בקובץ {PERMISSION_FILE.name}"
            )
        if self.spec.access == "manual":
            raise PermissionDenied(
                f"[{self.source_id}] אין הורדה אוטומטית — דיגיטציה/הזנה ידנית."
            )

    # ── הורדה ────────────────────────────────────────────────────────────
    @retry(stop=stop_after_attempt(4), wait=wait_exponential(min=2, max=30))
    def _get(self, url: str) -> bytes:
        with httpx.Client(timeout=90, follow_redirects=True,
                          headers={"User-Agent": USER_AGENT}) as c:
            r = c.get(url)
            r.raise_for_status()
            return r.content

    def fetch(self, url: str, filename: str, force: bool = False) -> Path:
        """מוריד ל-raw/. מדלג אם ה-checksum זהה."""
        self.check_access()
        dest = self.dir / filename
        meta_path = self.dir / f"{filename}.meta.json"

        content = self._get(url)
        checksum = hashlib.sha256(content).hexdigest()

        if dest.exists() and meta_path.exists() and not force:
            old = json.loads(meta_path.read_text())
            if old.get("checksum") == checksum:
                return dest    # ללא שינוי — לא נוגעים בקובץ

        dest.write_bytes(content)
        meta_path.write_text(json.dumps({
            "source_id": self.source_id,
            "url": url,
            "checksum": checksum,
            "bytes": len(content),
            "retrieved_at": date.today().isoformat(),
            "license": self.spec.license,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        return dest

    # ── ממשק המימוש ──────────────────────────────────────────────────────
    @abstractmethod
    def download(self) -> list[Path]:
        """מוריד את כל הקבצים הדרושים ומחזיר את נתיביהם."""

    @abstractmethod
    def parse(self, paths: list[Path]) -> dict[str, list[dict]]:
        """ממיר קבצים גולמיים לדיקטים מנורמלים, לפי שם טבלה.

        מחזיר: {"places": [...], "camps": [...], ...}
        אין כתיבה למסד כאן — זה תפקיד שלב הטעינה.
        """

    def run(self) -> dict[str, list[dict]]:
        return self.parse(self.download())
