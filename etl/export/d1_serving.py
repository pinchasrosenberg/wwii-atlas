#!/usr/bin/env python3
"""ייצוא רשומות מאושרות ל־SQL של מסד ה-serving.

הקלט הוא GeoJSON מנורמל שכבר עבר את צינור האיכות. הכלי מסרב לייצא
רשומה ללא מקור, ציון, סטטוס פרסום או טווח זום. הוא אינו משדר דבר לענן;
הפלט הוא artifact מקומי שניתן לבדוק לפני יצירת migration.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator

from config.settings import OUT_DIR

ALLOWED_GEOMETRIES = {"Point", "LineString", "Polygon", "MultiPolygon"}
ALLOWED_CONFIDENCE = {"high", "medium", "low"}


class ServingExportError(ValueError):
    pass


def _positions(value: object) -> Iterator[tuple[float, float]]:
    if (
        isinstance(value, list)
        and len(value) >= 2
        and isinstance(value[0], (int, float))
        and isinstance(value[1], (int, float))
    ):
        yield float(value[0]), float(value[1])
    elif isinstance(value, list):
        for child in value:
            yield from _positions(child)


def geometry_bbox(geometry: dict) -> tuple[float, float, float, float]:
    if geometry.get("type") not in ALLOWED_GEOMETRIES:
        raise ServingExportError(f"גאומטריה לא נתמכת: {geometry.get('type')}")
    points = list(_positions(geometry.get("coordinates")))
    if not points:
        raise ServingExportError("גאומטריה ללא קואורדינטות")
    lon = [point[0] for point in points]
    lat = [point[1] for point in points]
    if min(lon) < -180 or max(lon) > 180 or min(lat) < -90 or max(lat) > 90:
        raise ServingExportError("קואורדינטות מחוץ ל־WGS84")
    return min(lon), min(lat), max(lon), max(lat)


def _sql(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


@dataclass(frozen=True)
class ServingRow:
    feature_id: str
    values: tuple[object, ...]


def feature_to_row(feature: dict) -> ServingRow:
    properties = dict(feature.get("properties") or {})
    feature_id = str(feature.get("id") or properties.get("id") or "")
    layer = str(properties.get("layer") or "")
    source_ids = properties.get("source_ids") or []
    quality_score = properties.get("quality_score")
    confidence = properties.get("confidence")
    publish_status = properties.get("publish_status")
    min_zoom = properties.get("min_zoom")
    max_zoom = properties.get("max_zoom")

    errors = []
    if not feature_id:
        errors.append("id")
    if not layer:
        errors.append("layer")
    if not source_ids:
        errors.append("source_ids")
    if not isinstance(quality_score, int) or not 0 <= quality_score <= 100:
        errors.append("quality_score")
    if confidence not in ALLOWED_CONFIDENCE:
        errors.append("confidence")
    if publish_status != "published":
        errors.append("publish_status")
    if not isinstance(min_zoom, int) or not 0 <= min_zoom <= 14:
        errors.append("min_zoom")
    if not isinstance(max_zoom, int) or not min_zoom <= max_zoom <= 14:
        errors.append("max_zoom")
    if errors:
        raise ServingExportError(f"{feature_id or '<unknown>'}: שדות serving לא תקינים: {errors}")
    if quality_score < 70:
        raise ServingExportError(f"{feature_id}: ציון {quality_score} נמוך מסף הפרסום 70")

    geometry = feature.get("geometry") or {}
    west, south, east, north = geometry_bbox(geometry)
    search_text = " ".join(
        str(value) for value in [
            properties.get("name_he"),
            properties.get("name_en"),
            *(properties.get("aliases") or []),
        ] if value
    ).casefold()
    public_properties = {
        key: value
        for key, value in properties.items()
        if key not in {"private_notes", "reviewer", "raw_locator"}
    }
    values = (
        feature_id,
        layer,
        properties.get("entity_kind", layer),
        properties.get("name_he"),
        properties.get("name_en"),
        search_text,
        geometry["type"],
        json.dumps(geometry["coordinates"], ensure_ascii=False, separators=(",", ":")),
        west,
        south,
        east,
        north,
        properties.get("day_from"),
        properties.get("day_to"),
        min_zoom,
        max_zoom,
        float(properties.get("rank", 0)),
        quality_score,
        confidence,
        publish_status,
        json.dumps(public_properties, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
        json.dumps(source_ids, ensure_ascii=False, separators=(",", ":")),
        properties.get("updated_at"),
    )
    return ServingRow(feature_id=feature_id, values=values)


COLUMNS = (
    "feature_id", "layer_id", "entity_kind", "name_he", "name_en", "search_text",
    "geometry_type", "geometry_json", "min_lon", "min_lat", "max_lon", "max_lat",
    "day_from", "day_to", "min_zoom", "max_zoom", "rank", "quality_score",
    "confidence", "publish_status", "properties_json", "source_ids_json", "updated_at",
)


def render_seed(features: Iterable[dict], dataset_version: str) -> str:
    rows = sorted((feature_to_row(feature) for feature in features), key=lambda row: row.feature_id)
    if not rows:
        raise ServingExportError("אין רשומות מאושרות לייצוא")
    statements = ["BEGIN TRANSACTION;", "DELETE FROM atlas_features;"]
    for row in rows:
        statements.append(
            f"INSERT INTO atlas_features ({', '.join(COLUMNS)}) VALUES "
            f"({', '.join(_sql(value) for value in row.values)});"
        )
    statements.append(
        "INSERT OR REPLACE INTO atlas_meta (key, value) VALUES "
        f"('dataset_version', {_sql(dataset_version)});"
    )
    statements.append("COMMIT;")
    return "\n".join(statements) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path, help="GeoJSON שעבר quality gate")
    parser.add_argument(
        "--output",
        type=Path,
        default=OUT_DIR / "d1" / "dataset.sql",
    )
    parser.add_argument("--version", help="גרסת dataset; ברירת מחדל SHA-256")
    args = parser.parse_args()

    raw = args.input.read_bytes()
    payload = json.loads(raw)
    if payload.get("type") != "FeatureCollection":
        raise ServingExportError("הקלט חייב להיות FeatureCollection")
    version = args.version or hashlib.sha256(raw).hexdigest()[:16]
    sql = render_seed(payload.get("features") or [], version)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(sql, encoding="utf-8")
    print(f"{len(payload['features'])} רשומות → {args.output} · dataset {version}")


if __name__ == "__main__":
    main()
