"""ייצור אריחים וקטוריים לפי רמת זום (סעיף 7.7).

העיקרון: **המשתמש לא מקבל יותר נתונים ממה שהוא יכול לראות.** האגרגציה
נצרבת לתוך האריחים בזמן ה-build ולא מחושבת בדפדפן — אריח בזום 3 פשוט
לא מכיל את הגיאומטריה של מחנות המשנה.

זו הסיבה שכל שכבה מיוצרת כמה פעמים עם פילטרים שונים, במקום פעם אחת עם
`minzoom` על הסגנון. סינון בסגנון עדיין מעביר את הנתונים ברשת.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import text

from config.settings import OUT_DIR, WORK_DIR, ZOOM_SPECS, ZoomSpec
from db.session import session_scope

TILES_DIR = OUT_DIR / "tiles"
TILES_DIR.mkdir(parents=True, exist_ok=True)

# שכבה → (טבלה/תצוגה, סוג גיאומטריה)
LAYER_SOURCES = {
    "rail_trunk":      ("graph_edges", "line"),
    "rail_main":       ("graph_edges", "line"),
    "rail_full":       ("graph_edges", "line"),
    "camps_parent":    ("camps", "point"),
    "camps_major":     ("camps", "point"),
    "camps_full":      ("camps", "point"),
    "sinkings_heat":   ("sinkings", "point"),
    "sinkings_points": ("sinkings", "point"),
    "battles_cluster": ("battles", "point"),
    "battles_points":  ("battles", "point"),
}


@dataclass
class TileResult:
    layer: str
    path: Path
    features: int
    bytes: int


def _check_tippecanoe() -> None:
    try:
        subprocess.run(["tippecanoe", "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        raise RuntimeError(
            "tippecanoe לא מותקן. macOS: brew install tippecanoe · "
            "Linux: build from github.com/felt/tippecanoe"
        ) from e


def dump_geojson(spec: ZoomSpec) -> tuple[Path, int]:
    """שולף מהמסד ל-GeoJSON זמני, לפי הפילטר של רמת הזום."""
    table, geom_kind = LAYER_SOURCES[spec.layer]
    where = f"WHERE {spec.filter_sql}" if spec.filter_sql else ""

    if geom_kind == "point":
        sql = f"""
            SELECT lon, lat, * FROM {table} {where}
            ORDER BY 1, 2
        """     # ORDER BY = דטרמיניזם: אותו קלט → אותו קובץ בייט-לבייט
    else:
        sql = f"SELECT * FROM {table} {where} ORDER BY edge_id"

    out = WORK_DIR / f"{spec.layer}.geojson"
    n = 0
    with session_scope() as s, out.open("w", encoding="utf-8") as fh:
        fh.write('{"type":"FeatureCollection","features":[\n')
        first = True
        for row in s.execute(text(sql)).mappings():
            feat = _to_feature(dict(row), geom_kind)
            if feat is None:
                continue
            if not first:
                fh.write(",\n")
            fh.write(json.dumps(feat, ensure_ascii=False, sort_keys=True))
            first = False
            n += 1
        fh.write("\n]}\n")
    return out, n


def _to_feature(row: dict, geom_kind: str) -> dict | None:
    props = {k: v for k, v in row.items()
             if k not in ("geom", "route_geom", "lon", "lat")
             and not isinstance(v, (bytes, bytearray))}
    if geom_kind == "point":
        lon, lat = row.get("lon"), row.get("lat")
        if lon is None or lat is None:
            return None
        geometry = {"type": "Point", "coordinates": [lon, lat]}
    else:
        wkt = row.get("geom")
        if not wkt:
            return None
        geometry = _wkt_linestring_to_geojson(str(wkt))
        if geometry is None:
            return None
    return {"type": "Feature", "geometry": geometry, "properties": props}


def _wkt_linestring_to_geojson(wkt: str) -> dict | None:
    if not wkt.upper().startswith("LINESTRING"):
        return None
    body = wkt[wkt.index("(") + 1: wkt.rindex(")")]
    coords = []
    for pair in body.split(","):
        parts = pair.strip().split()
        if len(parts) >= 2:
            coords.append([float(parts[0]), float(parts[1])])
    return {"type": "LineString", "coordinates": coords} if len(coords) >= 2 else None


def build_tiles(spec: ZoomSpec) -> TileResult:
    _check_tippecanoe()
    geojson, n = dump_geojson(spec)
    out = TILES_DIR / f"{spec.layer}.pmtiles"

    cmd = [
        "tippecanoe",
        "-o", str(out), "--force",
        "-Z", str(spec.minzoom), "-z", str(spec.maxzoom),
        "-l", spec.layer,
        "--simplification", str(spec.simplification),
        "--no-tile-compression" if spec.cluster else "--drop-densest-as-needed",
        # דטרמיניזם: בלי זה tippecanoe נושר אקראית ומייצר קובץ שונה בכל הרצה
        "--preserve-input-order",
        "--no-tile-stats",
    ]
    if spec.cluster:
        cmd += ["--cluster-densest-as-needed", "--accumulate-attribute", "count:sum"]
    cmd.append(str(geojson))

    subprocess.run(cmd, check=True, capture_output=True)
    return TileResult(spec.layer, out, n, out.stat().st_size)


def build_all() -> list[TileResult]:
    results = []
    for spec in ZOOM_SPECS:
        if spec.layer not in LAYER_SOURCES:
            continue
        results.append(build_tiles(spec))
    return results
