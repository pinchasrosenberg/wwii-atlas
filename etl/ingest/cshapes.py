"""קליטת CShapes 2.0 — גבולות מדינות היסטוריים.

מקור פתוח, מובנה היטב — לכן זהו הקולט הראשון שכדאי לממש. הוא משמש
כתבנית לשאר הקולטים.
"""
from __future__ import annotations

import zipfile
from pathlib import Path

import geopandas as gpd

from config.settings import TIMELINE_END, TIMELINE_START, to_day_index
from ingest.base import Ingestor

CSHAPES_ZIP = "https://icr.ethz.ch/data/cshapes/CShapes-2.0.zip"


class CShapesIngestor(Ingestor):
    source_id = "cshapes"

    def download(self) -> list[Path]:
        z = self.fetch(CSHAPES_ZIP, "cshapes-2.0.zip")
        out = self.dir / "extracted"
        out.mkdir(exist_ok=True)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(out)
        return sorted(out.rglob("*.shp"))

    def parse(self, paths: list[Path]) -> dict[str, list[dict]]:
        if not paths:
            return {"polities": []}

        gdf = gpd.read_file(paths[0]).to_crs(epsg=4326)

        # CShapes מקודד תוקף כשדות y/m/d נפרדים
        gdf["start"] = gpd.pd.to_datetime(
            dict(year=gdf["gwsyear"], month=gdf["gwsmonth"], day=gdf["gwsday"]),
            errors="coerce")
        gdf["end"] = gpd.pd.to_datetime(
            dict(year=gdf["gweyear"], month=gdf["gwemonth"], day=gdf["gweday"]),
            errors="coerce")

        # רק מה שחופף לטווח האטלס
        mask = (gdf["end"] >= gpd.pd.Timestamp(TIMELINE_START)) & \
               (gdf["start"] <= gpd.pd.Timestamp(TIMELINE_END))
        gdf = gdf[mask]

        rows = []
        for _, r in gdf.iterrows():
            s, e = r["start"].date(), r["end"].date()
            rows.append({
                "polity_id": f"cshapes:{r.get('gwcode')}:{s.isoformat()}",
                "name_en": r.get("cntry_name"),
                "iso_code": r.get("isoname"),
                "valid_from": s,
                "valid_to": e,
                "day_from": to_day_index(s),
                "day_to": to_day_index(e),
                "geometry_wkt": r.geometry.wkt if r.geometry else None,
                "source_ids": [self.source_id],
                "derivation": "source",
            })
        return {"polities": rows}
