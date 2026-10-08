#!/usr/bin/env python3
"""Build lightweight, local map assets without replacing canonical inputs."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image


REPO = Path(__file__).resolve().parents[2]
WEB = REPO / "web"
TILE_SIZE = 256
TERRAIN_MAX_ZOOM = 4
COORDINATE_PRECISION = 4


def rounded(value):
    if isinstance(value, list):
        return [rounded(item) for item in value]
    if isinstance(value, float):
        return round(value, COORDINATE_PRECISION)
    return value


def build_borders() -> None:
    source = (
        REPO
        / "data/historical_borders/02_parsed/historical-borders.full-precision.geojson"
    )
    linked = (
        REPO
        / "data/historical_borders/04_linked_build/historical-borders.optimized.geojson"
    )
    web_target = WEB / "data/stage1/historical-borders.geojson"
    payload = json.loads(source.read_text(encoding="utf-8"))
    for feature in payload["features"]:
        feature["geometry"]["coordinates"] = rounded(
            feature["geometry"]["coordinates"]
        )
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    linked.parent.mkdir(parents=True, exist_ok=True)
    linked.write_text(encoded, encoding="utf-8")
    web_target.write_text(encoded, encoding="utf-8")


def mercator_world(source: Image.Image, size: int) -> Image.Image:
    source = source.convert("RGB").resize((size, source.height), Image.Resampling.LANCZOS)
    pixels = np.asarray(source, dtype=np.float32)
    target_y = np.arange(size, dtype=np.float64) + 0.5
    mercator = math.pi - (2 * math.pi * target_y / size)
    latitude = np.degrees(np.arctan(np.sinh(mercator)))
    source_y = (85.0 - latitude) / 170.0 * (source.height - 1)
    source_y = np.clip(source_y, 0, source.height - 1)
    lower = np.floor(source_y).astype(np.int32)
    upper = np.minimum(lower + 1, source.height - 1)
    weight = (source_y - lower).astype(np.float32)[:, None, None]
    projected = pixels[lower] * (1 - weight) + pixels[upper] * weight
    return Image.fromarray(np.clip(projected, 0, 255).astype(np.uint8), "RGB")


def build_terrain_tiles() -> None:
    source = REPO / "data/terrain/02_parsed/natural-earth-2-relief.jpg"
    tile_root = WEB / "data/terrain/tiles"
    world_size = TILE_SIZE * (2**TERRAIN_MAX_ZOOM)
    world = mercator_world(Image.open(source), world_size)

    for zoom in range(TERRAIN_MAX_ZOOM + 1):
        side = TILE_SIZE * (2**zoom)
        level = world if side == world_size else world.resize(
            (side, side), Image.Resampling.LANCZOS
        )
        for x in range(2**zoom):
            column = tile_root / str(zoom) / str(x)
            column.mkdir(parents=True, exist_ok=True)
            for y in range(2**zoom):
                tile = level.crop(
                    (
                        x * TILE_SIZE,
                        y * TILE_SIZE,
                        (x + 1) * TILE_SIZE,
                        (y + 1) * TILE_SIZE,
                    )
                )
                tile.save(
                    column / f"{y}.jpg",
                    "JPEG",
                    quality=74,
                    optimize=True,
                    progressive=False,
                )


if __name__ == "__main__":
    build_borders()
    build_terrain_tiles()
    print("Built rounded historical borders and terrain tile pyramid z0-z4")
