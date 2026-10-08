"""Build the browser payloads for atlas stages 1 through 8.

The script intentionally uses only the Python standard library so a clean
checkout can rebuild the first public prototype without installing the full
geospatial ETL stack.

Inputs:
  data/raw/cshapes/cshapes_2_gw.topojson.xz
  data/seed/convoy_routes.json
  data/seed/naval_losses.json
  data/seed/battles.json
  data/seed/stages_3_8.json

Outputs:
  ../web/data/stage1/historical-borders.geojson
  ../web/data/stage2/convoy-routes.json
  ../web/data/stage2/naval-losses.json
  ../web/data/stage2/battles.json
  ../web/data/stage2/manifest.json
  ../web/data/stage3-8/atlas.json
  ../web/data/search/lexical.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import lzma
import math
import re
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any, Iterable

from config.settings import EPOCH, ROOT, TIMELINE_END, TIMELINE_START, to_day_index

WEB_DATA = ROOT.parent / "web" / "data"
CSHAPES_PATH = ROOT / "data" / "raw" / "cshapes" / "cshapes_2_gw.topojson.xz"
SEED_DIR = ROOT / "data" / "seed"

NAME_HE = {
    "Albania": "אלבניה",
    "Austria": "אוסטריה",
    "Belgium": "בלגיה",
    "Bulgaria": "בולגריה",
    "Czechoslovakia": "צ׳כוסלובקיה",
    "Denmark": "דנמרק",
    "Estonia": "אסטוניה",
    "Finland": "פינלנד",
    "France": "צרפת",
    "Germany": "גרמניה",
    "Greece": "יוון",
    "Hungary": "הונגריה",
    "Iceland": "איסלנד",
    "Ireland": "אירלנד",
    "Italy": "איטליה",
    "Latvia": "לטביה",
    "Lithuania": "ליטא",
    "Luxembourg": "לוקסמבורג",
    "Netherlands": "הולנד",
    "Norway": "נורווגיה",
    "Poland": "פולין",
    "Portugal": "פורטוגל",
    "Romania": "רומניה",
    "Soviet Union": "ברית המועצות",
    "Spain": "ספרד",
    "Sweden": "שוודיה",
    "Switzerland": "שווייץ",
    "Turkey": "טורקיה",
    "United Kingdom": "הממלכה המאוחדת",
    "Yugoslavia": "יוגוסלביה",
}

# Gleditsch-Ward codes used by CShapes. This is a presentation grouping, not
# a claim about a state's status at every point in the war.
AXIS_CODES = {255, 310, 315, 317, 325, 355, 360}
ALLIED_CODES = {2, 20, 200, 210, 211, 220, 290, 365}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    path.write_text(text + "\n", encoding="utf-8")


def _arc(topology: dict, index: int) -> list[list[float]]:
    """Resolve one TopoJSON arc, including reverse references."""
    reverse = index < 0
    resolved = ~index if reverse else index
    coords = topology["arcs"][resolved]
    if reverse:
        return list(reversed(coords))
    return coords


def _stitch(topology: dict, indexes: Iterable[int]) -> list[list[float]]:
    line: list[list[float]] = []
    for index in indexes:
        arc = _arc(topology, index)
        if line and arc and line[-1] == arc[0]:
            line.extend(arc[1:])
        else:
            line.extend(arc)
    return line


def _sq_segment_distance(point: list[float], a: list[float], b: list[float]) -> float:
    x, y = a
    dx = b[0] - x
    dy = b[1] - y
    if dx or dy:
        t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy)
        if t > 1:
            x, y = b
        elif t > 0:
            x += dx * t
            y += dy * t
    dx = point[0] - x
    dy = point[1] - y
    return dx * dx + dy * dy


def _simplify(points: list[list[float]], tolerance: float = 0.035) -> list[list[float]]:
    """Deterministic Ramer–Douglas–Peucker simplification for stage payloads."""
    if len(points) <= 4:
        return points
    sq_tolerance = tolerance * tolerance

    def step(first: int, last: int, out: list[list[float]]) -> None:
        max_dist = sq_tolerance
        index = 0
        for i in range(first + 1, last):
            dist = _sq_segment_distance(points[i], points[first], points[last])
            if dist > max_dist:
                index, max_dist = i, dist
        if max_dist > sq_tolerance and index:
            if index - first > 1:
                step(first, index, out)
            out.append(points[index])
            if last - index > 1:
                step(index, last, out)

    output = [points[0]]
    step(0, len(points) - 1, output)
    output.append(points[-1])
    if output[0] != output[-1] and points[0] == points[-1]:
        output[-1] = output[0]
    return output


def _geometry(topology: dict, geometry: dict) -> dict:
    if geometry["type"] == "Polygon":
        coordinates = [_simplify(_stitch(topology, ring)) for ring in geometry["arcs"]]
    elif geometry["type"] == "MultiPolygon":
        coordinates = [
            [_simplify(_stitch(topology, ring)) for ring in polygon]
            for polygon in geometry["arcs"]
        ]
    else:
        raise ValueError(f"Unsupported geometry type: {geometry['type']}")
    return {"type": geometry["type"], "coordinates": coordinates}


def _iter_points(coordinates: Any) -> Iterable[list[float]]:
    if (
        isinstance(coordinates, list)
        and len(coordinates) >= 2
        and all(isinstance(n, (int, float)) for n in coordinates[:2])
    ):
        yield coordinates
        return
    for child in coordinates:
        yield from _iter_points(child)


def _intersects_bbox(geometry: dict, bbox: tuple[float, float, float, float]) -> bool:
    west, south, east, north = bbox
    for lon, lat, *_ in _iter_points(geometry["coordinates"]):
        if west <= lon <= east and south <= lat <= north:
            return True
    return False


def _side(props: dict) -> str:
    owner = int(props.get("owner") or props.get("gwcode") or 0)
    code = int(props.get("gwcode") or 0)
    if owner in AXIS_CODES or code in AXIS_CODES:
        return "axis"
    if owner in ALLIED_CODES or code in ALLIED_CODES:
        return "allied"
    return "neutral"


def _iso_day(value: str) -> int:
    return to_day_index(date.fromisoformat(value))


def build_stage1() -> dict:
    if not CSHAPES_PATH.exists():
        raise FileNotFoundError(
            f"Missing {CSHAPES_PATH}. Download CShapes 2.0 from CRAN first."
        )
    with lzma.open(CSHAPES_PATH, "rt", encoding="utf-8") as fh:
        topology = json.load(fh)

    obj = topology["objects"]["cshapes_2_gw"]
    features = []
    for item in obj["geometries"]:
        props = item["properties"]
        start = date.fromisoformat(props["start"])
        end = date.fromisoformat(props["end"])
        if end < TIMELINE_START or start > TIMELINE_END:
            continue
        geometry = _geometry(topology, item)

        name_en = props["country_name"]
        side = _side(props)
        features.append(
            {
                "type": "Feature",
                "id": f"cshapes:{props['gwcode']}:{props['start']}",
                "geometry": geometry,
                "properties": {
                    "polity_id": f"cshapes:{props['gwcode']}:{props['start']}",
                    "name_en": name_en,
                    "name_he": NAME_HE.get(name_en, name_en),
                    "status": props.get("status"),
                    "owner": str(props.get("owner") or ""),
                    "side": side,
                    "valid_from": props["start"],
                    "valid_to": props["end"],
                    "day_from": _iso_day(props["start"]),
                    "day_to": _iso_day(props["end"]),
                    "derivation": "source",
                    "source_ids": ["cshapes"],
                },
            }
        )

    features.sort(key=lambda f: (f["properties"]["day_from"], f["properties"]["name_en"]))
    output = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "Historical state borders, CShapes 2.0",
            "scope": "Global",
            "source_id": "cshapes",
            "source_url": "https://cran.r-project.org/package=cshapes",
            "source_sha256": _sha256(CSHAPES_PATH),
            "license": "GPL-2 | GPL-3",
            "coverage_note": (
                "CShapes represents interstate boundaries and dependencies. "
                "It is not yet the monthly military-control layer from Stanford."
            ),
        },
        "features": features,
    }
    target = WEB_DATA / "stage1" / "historical-borders.geojson"
    _write_json(target, output)
    return {"path": str(target), "features": len(features), "bytes": target.stat().st_size}


def _validate_routes(payload: dict) -> None:
    ids = set()
    for route in payload.get("routes", []):
        route["day_from"] = _iso_day(route["active_from"])
        route["day_to"] = _iso_day(route["active_to"])
        for period in route.get("risk_periods", []):
            period["day_from"] = _iso_day(period["from"])
            period["day_to"] = _iso_day(period["to"])
        route_id = route.get("route_id")
        if not route_id or route_id in ids:
            raise ValueError(f"Invalid or duplicate route_id: {route_id}")
        ids.add(route_id)
        path = route.get("path") or []
        if len(path) < 2:
            raise ValueError(f"{route_id}: route requires at least two positions")
        for lon, lat in path:
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError(f"{route_id}: invalid route position")
        if not route.get("origin_name_he") or not route.get("destination_name_he"):
            raise ValueError(f"{route_id}: missing origin or destination")
        if route.get("day_from", math.inf) > route.get("day_to", -math.inf):
            raise ValueError(f"{route_id}: reversed date range")
        if not route.get("source_ids"):
            raise ValueError(f"{route_id}: missing source_ids")


def _validate_losses(payload: dict) -> None:
    ids = set()
    for item in payload.get("losses", []):
        item_id = item.get("id")
        if not item_id or item_id in ids:
            raise ValueError(f"Invalid or duplicate loss id: {item_id}")
        ids.add(item_id)
        lon, lat = item.get("position", [None, None])
        if lon is None or lat is None or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError(f"{item_id}: invalid position")
        if not item.get("source_ids"):
            raise ValueError(f"{item_id}: missing source_ids")


def _validate_battles(payload: dict) -> None:
    known_sources = {
        item["id"] for item in payload.get("metadata", {}).get("sources", [])
    }
    ids = set()
    for item in payload.get("battles", []):
        item["day_from"] = _iso_day(item["active_from"])
        item["day_to"] = _iso_day(item["active_to"])
        item_id = item.get("id")
        if not item_id or item_id in ids:
            raise ValueError(f"Invalid or duplicate battle id: {item_id}")
        ids.add(item_id)
        lon, lat = item.get("position", [None, None])
        if lon is None or lat is None or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError(f"{item_id}: invalid position")
        if item["day_from"] > item["day_to"]:
            raise ValueError(f"{item_id}: reversed date range")
        if not item.get("source_ids") or not set(item["source_ids"]) <= known_sources:
            raise ValueError(f"{item_id}: missing or unknown source")


def build_stage2() -> dict:
    routes = _read_json(SEED_DIR / "convoy_routes.json")
    losses = _read_json(SEED_DIR / "naval_losses.json")
    battles = _read_json(SEED_DIR / "battles.json")
    _validate_routes(routes)
    _validate_losses(losses)
    _validate_battles(battles)

    route_target = WEB_DATA / "stage2" / "convoy-routes.json"
    loss_target = WEB_DATA / "stage2" / "naval-losses.json"
    battle_target = WEB_DATA / "stage2" / "battles.json"
    _write_json(route_target, routes)
    _write_json(loss_target, losses)
    _write_json(battle_target, battles)

    manifest = {
        "stage": 2,
        "status": "representative-open-data",
        "routes": len(routes["routes"]),
        "losses": len(losses["losses"]),
        "battles": len(battles["battles"]),
        "coverage": {
            "convoy_routes": (
                "Representative route corridors. Individual Arnold Hague and "
                "uboat.net sailings remain blocked pending permission."
            ),
            "naval_losses": (
                "Curated public-domain JANAC/NHHC records; not yet the full "
                "merchant-loss corpus."
            ),
            "battles": (
                "Representative global battles and campaigns synchronized to "
                "the selected day; map positions are anchors, not front lines."
            ),
        },
        "sources": sorted(
            {
                sid
                for dataset in (routes["routes"], losses["losses"], battles["battles"])
                for row in dataset
                for sid in row["source_ids"]
            }
        ),
        "checksums": {
            "convoy-routes.json": _sha256(route_target),
            "naval-losses.json": _sha256(loss_target),
            "battles.json": _sha256(battle_target),
        },
    }
    manifest_target = WEB_DATA / "stage2" / "manifest.json"
    _write_json(manifest_target, manifest)
    return {
        "routes": len(routes["routes"]),
        "losses": len(losses["losses"]),
        "battles": len(battles["battles"]),
        "bytes": (
            route_target.stat().st_size
            + loss_target.stat().st_size
            + battle_target.stat().st_size
        ),
    }


def _prepare_dates(row: dict, start_key: str, end_key: str) -> None:
    row["day_from"] = _iso_day(row[start_key])
    row["day_to"] = _iso_day(row[end_key])
    if row["day_from"] > row["day_to"]:
        raise ValueError(f"{row.get('id') or row.get('route_id')}: reversed date range")


def _validate_path(row: dict, key: str = "path") -> None:
    path = row.get(key) or []
    if len(path) < 2:
        raise ValueError(f"{row.get('id') or row.get('route_id')}: path is too short")
    for lon, lat in path:
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError(f"{row.get('id') or row.get('route_id')}: invalid coordinate")


def _normalise_search(text: str) -> str:
    value = unicodedata.normalize("NFKD", (text or "").lower())
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    return " ".join(value.split())


def _search_docs(stage2_routes: dict, battles: dict, atlas: dict) -> list[dict]:
    docs: list[dict] = []

    def add(
        ref: str,
        label: str,
        kind: str,
        *,
        position: list[float] | None = None,
        aliases: list[str] | None = None,
        day_from: int | None = None,
        day_to: int | None = None,
        layer: str | None = None,
    ) -> None:
        docs.append(
            {
                "ref": ref,
                "label": label,
                "kind": kind,
                "lon": position[0] if position else None,
                "lat": position[1] if position else None,
                "from": day_from,
                "to": day_to,
                "alt": aliases or [],
                "layer": layer,
            }
        )

    for item in battles["battles"]:
        add(
            f"battle:{item['id']}",
            item["name_he"],
            "battle",
            position=item["position"],
            aliases=[item.get("name_en", "")],
            day_from=item["day_from"],
            day_to=item["day_to"],
            layer="battles",
        )
    for item in stage2_routes["routes"]:
        if item.get("mode") != "ים":
            continue
        add(
            f"route:{item['route_id']}",
            item["name_he"],
            "route",
            position=item["path"][0],
            aliases=[item.get("name_en", ""), item.get("origin_name_he", ""),
                     item.get("destination_name_he", "")],
            day_from=item["day_from"],
            day_to=item["day_to"],
            layer="convoy-routes",
        )
    for item in atlas["supply_routes"]:
        add(
            f"route:{item['route_id']}",
            item["name_he"],
            "route",
            position=item["path"][0],
            aliases=[item.get("name_en", ""), item.get("origin_name_he", ""),
                     item.get("destination_name_he", "")],
            day_from=item["day_from"],
            day_to=item["day_to"],
            layer="supply-corridors",
        )
    for item in atlas["camps"]:
        add(
            f"camp:{item['id']}",
            item["name_he"],
            "camp",
            position=item["position"],
            aliases=[item.get("name_en", "")],
            day_from=item["day_from"],
            day_to=item["day_to"],
            layer="camps",
        )
    for item in atlas["demographics"]:
        add(
            f"place:{item['place_id']}",
            item["name_he"],
            "place",
            position=item["position"],
            aliases=[item.get("name_en", ""), *(item.get("aliases") or [])],
            layer="demographics",
        )

    docs.sort(key=lambda item: item["ref"])
    return docs


def _build_lexical(docs: list[dict]) -> dict:
    postings: dict[str, set[int]] = defaultdict(set)
    for index, doc in enumerate(docs):
        for source in [doc["label"], *doc.get("alt", [])]:
            for token in _normalise_search(source).split():
                if len(token) < 2:
                    continue
                postings[token].add(index)
                for size in range(3, min(len(token), 8)):
                    postings[token[:size]].add(index)
    return {
        "version": 1,
        "normalizer": "nfkd-lower-strip-marks",
        "docs": docs,
        "terms": {
            token: sorted(indexes)
            for token, indexes in sorted(postings.items())
            if len(indexes) <= 120
        },
    }


def build_stages_3_8() -> dict:
    atlas = _read_json(SEED_DIR / "stages_3_8.json")
    known_sources = {
        source["id"] for source in atlas.get("metadata", {}).get("sources", [])
    }

    for group in ("supply_routes", "submarine_patrols", "railways", "camps", "transports",
                  "fortifications", "aid_operations", "famines", "refugee_flows"):
        for row in atlas.get(group, []):
            _prepare_dates(row, "active_from", "active_to")
            if "path" in row:
                _validate_path(row)
            if not row.get("source_ids") or not set(row["source_ids"]) <= known_sources:
                raise ValueError(f"{group}/{row.get('id')}: missing or unknown source")

    for row in atlas.get("fronts", []):
        _prepare_dates(row, "valid_from", "valid_to")
        row["day"] = _iso_day(row["as_of"])
        _validate_path(row)
        if not row.get("source_ids") or not set(row["source_ids"]) <= known_sources:
            raise ValueError(f"front/{row.get('id')}: missing or unknown source")

    for route in atlas.get("supply_routes", []):
        for record in route.get("throughput", []):
            record["day"] = _iso_day(record["date"])

    for record in atlas.get("demographics", []):
        for observation in record.get("records", []):
            observation["day"] = _iso_day(observation["as_of"])

    for stop in atlas.get("tour", []):
        stop["day"] = _iso_day(stop["date"])

    target = WEB_DATA / "stage3-8" / "atlas.json"
    _write_json(target, atlas)

    stage2_routes = _read_json(WEB_DATA / "stage2" / "convoy-routes.json")
    battles = _read_json(WEB_DATA / "stage2" / "battles.json")
    lexical = _build_lexical(_search_docs(stage2_routes, battles, atlas))
    search_target = WEB_DATA / "search" / "lexical.json"
    _write_json(search_target, lexical)

    counts = {
        key: len(value)
        for key, value in atlas.items()
        if isinstance(value, list)
    }
    manifest = {
        "stage": "3-8",
        "status": atlas["metadata"]["status"],
        "counts": counts,
        "coverage_note_he": atlas["metadata"]["coverage_note_he"],
        "checksums": {
            "atlas.json": _sha256(target),
            "search/lexical.json": _sha256(search_target),
        },
    }
    manifest_target = WEB_DATA / "stage3-8" / "manifest.json"
    _write_json(manifest_target, manifest)
    return {
        **counts,
        "search_docs": len(lexical["docs"]),
        "search_terms": len(lexical["terms"]),
        "bytes": target.stat().st_size + search_target.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build stage 1–8 browser payloads")
    parser.add_argument("--stage", choices=("1", "2", "3-8", "all"), default="all")
    args = parser.parse_args()

    result = {}
    if args.stage in ("1", "all"):
        result["stage1"] = build_stage1()
    if args.stage in ("2", "all"):
        result["stage2"] = build_stage2()
    if args.stage in ("3-8", "all"):
        result["stages3_8"] = build_stages_3_8()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
