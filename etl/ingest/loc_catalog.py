"""פענוח דטרמיניסטי של יצוא JSON הרשמי של Library of Congress."""
from __future__ import annotations

import json
from pathlib import Path

AGGREGATE_ITEM_ID = "http://www.loc.gov/item/2001628569/"


def parse_loc_catalog(path: Path) -> dict[str, object]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    results = payload.get("results") or []
    items = []
    for item in results:
        item_id = item.get("id") or ""
        if "/item/" not in item_id or "map" not in (item.get("original_format") or []):
            continue
        resources = item.get("resources") or []
        resource = resources[0] if resources else {}
        image_urls = item.get("image_url") or []
        items.append({
            "document_id": item_id.rstrip("/").rsplit("/", 1)[-1],
            "source_id": "loc_situation_maps",
            "source_url": item.get("url") or item_id,
            "title": item.get("title"),
            "document_date": item.get("date"),
            "locations": item.get("location") or [],
            "resource_url": resource.get("url"),
            "image_url": image_urls[0] if image_urls else resource.get("image"),
            "is_aggregate_record": item_id == AGGREGATE_ITEM_ID,
            "derivation": "source",
        })
    items.sort(key=lambda item: (
        str(item.get("document_date") or ""),
        str(item.get("document_id") or ""),
    ))
    sheets = [item for item in items if not item["is_aggregate_record"]]
    return {
        "documents": items,
        "summary": {
            "api_total": payload.get("pagination", {}).get("of") or payload.get("total"),
            "loc_item_records": len(items),
            "individual_sheet_records": len(sheets),
            "aggregate_records": len(items) - len(sheets),
            "first_sheet_date": sheets[0]["document_date"] if sheets else None,
            "last_sheet_date": sheets[-1]["document_date"] if sheets else None,
            "expected_printed_maps": 416,
            "coverage_warning": (
                None if len(sheets) == 416
                else "מספר רשומות הגיליונות ב-API אינו תואם ל-416 המפות בתיאור האוסף"
            ),
        },
    }
