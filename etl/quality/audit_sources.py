#!/usr/bin/env python3
"""בדיקת שלמות של מרשם המקורות והפקת תמונת מצב קצרה."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
AUDIT_FILE = ROOT / "config" / "source_audit.yaml"
VALID_STATUSES = {"approved", "conditional", "blocked", "reference"}
REQUIRED = {
    "name",
    "official_url",
    "layers",
    "grain",
    "authority",
    "evidence_role",
    "acquisition",
    "rights_status",
    "scientific_status",
    "coverage",
    "independence_group",
    "dimensions",
}


def audit() -> dict[str, object]:
    payload = yaml.safe_load(AUDIT_FILE.read_text(encoding="utf-8"))
    sources = payload.get("sources") or {}
    layers = payload.get("layer_plan") or {}
    errors: list[str] = []
    warnings: list[str] = []

    for source_id, source in sorted(sources.items()):
        missing = sorted(REQUIRED - set(source))
        if missing:
            errors.append(f"{source_id}: missing {', '.join(missing)}")
        if source.get("scientific_status") not in VALID_STATUSES:
            errors.append(f"{source_id}: invalid scientific_status")
        dims = source.get("dimensions") or {}
        for key in ("provenance", "authority", "temporal_precision",
                    "spatial_precision", "completeness"):
            value = dims.get(key)
            if not isinstance(value, (int, float)) or not 0 <= value <= 1:
                errors.append(f"{source_id}: dimensions.{key} must be 0..1")
        if source.get("scientific_status") == "blocked" and not source.get("blockers"):
            errors.append(f"{source_id}: blocked source must document blockers")

    referenced = {
        source_id
        for plan in layers.values()
        for source_id in (plan.get("primary") or []) + (plan.get("corroboration") or [])
    }
    unknown = sorted(referenced - set(sources))
    if unknown:
        errors.append(f"layer_plan references unknown sources: {', '.join(unknown)}")

    for layer_id, plan in sorted(layers.items()):
        if not plan.get("primary"):
            warnings.append(f"{layer_id}: no primary source")
        primary_statuses = [
            sources[sid]["scientific_status"]
            for sid in plan.get("primary") or []
            if sid in sources
        ]
        if primary_statuses and all(status == "blocked" for status in primary_statuses):
            warnings.append(f"{layer_id}: all primary sources are blocked")

    counts: dict[str, int] = {}
    for source in sources.values():
        status = source["scientific_status"]
        counts[status] = counts.get(status, 0) + 1

    return {
        "as_of": payload.get("as_of"),
        "source_count": len(sources),
        "layer_count": len(layers),
        "status_counts": dict(sorted(counts.items())),
        "errors": errors,
        "warnings": warnings,
        "valid": not errors,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = audit()
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print(
            f"{result['source_count']} מקורות · {result['layer_count']} שכבות · "
            f"{'תקין' if result['valid'] else 'לא תקין'}"
        )
        for warning in result["warnings"]:
            print(f"⚠ {warning}")
        for error in result["errors"]:
            print(f"✗ {error}")
    raise SystemExit(0 if result["valid"] else 2)


if __name__ == "__main__":
    main()
