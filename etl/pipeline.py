#!/usr/bin/env python3
"""תזמור צינור ה-ETL.

כל שלב קורא מהמסד וכותב למסד. אין העברת נתונים בזיכרון בין שלבים —
זה מה שמאפשר להריץ שלב בודד מחדש בלי להריץ את כל הצינור.

    python pipeline.py --all
    python pipeline.py --stage crossref
    python pipeline.py --db postgis --skip tiles
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from rich.console import Console
from rich.table import Table

from config.settings import OUT_DIR, ROOT
from db.session import init_db, session_scope

console = Console()

STAGES = ["ingest", "normalize", "load", "geocode", "graphs",
          "crossref", "validate", "export"]


# ══════════════════════════════════════════════════════════════════════════
#  שלבים
# ══════════════════════════════════════════════════════════════════════════
def stage_ingest(args) -> dict:
    from ingest.base import PermissionDenied, load_sources
    from ingest.cshapes import CShapesIngestor

    registry = {"cshapes": CShapesIngestor}
    wanted = [args.source] if args.source else list(registry)
    stats = {"ok": [], "blocked": [], "failed": []}

    for sid in wanted:
        cls = registry.get(sid)
        if cls is None:
            console.print(f"  [dim]{sid}: אין קולט ממומש עדיין[/dim]")
            continue
        try:
            cls().run()
            stats["ok"].append(sid)
        except PermissionDenied as e:
            console.print(f"  [yellow]⚠ {e}[/yellow]")
            stats["blocked"].append(sid)
        except Exception as e:                              # noqa: BLE001
            console.print(f"  [red]✗ {sid}: {e}[/red]")
            stats["failed"].append(sid)

    # מקורות חסומים אינם כשל — הם מצב ידוע שמתועד באפיון
    for sid, spec in load_sources().items():
        if spec.access in ("permission", "manual") and sid not in stats["ok"]:
            stats.setdefault("awaiting_permission", []).append(sid)
    return stats


def stage_normalize(args) -> dict:
    """הנרמול מתרחש בתוך הקולטים; כאן רק בדיקת שפיות על היחידות."""
    from normalize.units import TO_LONG_TONS, to_long_tons
    checks = {
        "metric_ton→long": round(to_long_tons(1000, "metric_ton").value, 2),
        "short_ton→long": round(to_long_tons(1000, "short_ton").value, 2),
        "known_units": len(TO_LONG_TONS),
    }
    return checks


def stage_load(args) -> dict:
    from db.models import Base
    from db.session import get_engine
    Base.metadata.create_all(get_engine())
    return {"tables": len(Base.metadata.tables)}


def stage_geocode(args) -> dict:
    from db.models import Place
    from sqlalchemy import select
    with session_scope() as s:
        total = len(s.scalars(select(Place)).all())
        missing = len([p for p in s.scalars(select(Place)) if p.lon is None])
    return {"places": total, "missing_coords": missing}


def stage_graphs(args) -> dict:
    from graphs.builder import GRAPHS, build_graph, coverage_report
    out = {}
    for name in GRAPHS:
        g = build_graph(name)
        out[name] = coverage_report(g)
    return out


def stage_crossref(args) -> dict:
    from crossref import supply_context, transports
    from crossref.demographics import refresh_battle_counts
    return {
        "transports": transports.run(),
        "supply_context": supply_context.run(),
        "battle_counts_updated": refresh_battle_counts(),
    }


def stage_validate(args) -> dict:
    from quality.audit_sources import audit as audit_sources
    from validate.rules import Level, run_all

    source_audit = audit_sources()
    if not source_audit["valid"]:
        for error in source_audit["errors"]:
            console.print(f"  [red]✗ source_audit: {error}[/red]")
        console.print("[red bold]✗ מרשם המקורות אינו תקין — ה-build נעצר.[/red bold]")
        sys.exit(2)
    for warning in source_audit["warnings"]:
        console.print(f"  [yellow]⚠ source_audit: {warning}[/yellow]")

    findings, valid = run_all()

    if findings:
        t = Table(title="ממצאי ולידציה", show_lines=False)
        t.add_column("כלל"); t.add_column("רמה"); t.add_column("מס'"); t.add_column("הודעה")
        for f in findings:
            color = "red" if f.level == Level.ERROR else "yellow"
            t.add_row(f.rule, f"[{color}]{f.level.value}[/{color}]",
                      str(f.count), f.message)
        console.print(t)

    if not valid:
        console.print("[red bold]✗ הוולידציה נכשלה — ה-build נעצר.[/red bold]")
        sys.exit(2)
    return {
        "findings": len(findings),
        "valid": valid,
        "source_audit": {
            "sources": source_audit["source_count"],
            "layers": source_audit["layer_count"],
            "status_counts": source_audit["status_counts"],
            "warnings": len(source_audit["warnings"]),
        },
    }


def stage_export(args) -> dict:
    from export.parquet import export_all as export_parquet
    out: dict = {}

    pq_results = export_parquet()
    out["parquet"] = {r.path.name: {"rows": r.rows, "sha": r.checksum}
                      for r in pq_results}

    if "tiles" not in (args.skip or []):
        try:
            from export.tiles import build_all as build_tiles
            out["tiles"] = {r.layer: {"features": r.features, "bytes": r.bytes}
                            for r in build_tiles()}
        except RuntimeError as e:
            console.print(f"  [yellow]⚠ אריחים דולגו: {e}[/yellow]")
            out["tiles"] = "skipped"
    else:
        out["tiles"] = "skipped"

    _write_manifest(out)
    return out


# ══════════════════════════════════════════════════════════════════════════
#  מניפסט ודטרמיניזם
# ══════════════════════════════════════════════════════════════════════════
def _git_sha() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT,
                                       stderr=subprocess.DEVNULL).decode().strip()
    except Exception:                                        # noqa: BLE001
        return None


def _write_manifest(export_out: dict) -> Path:
    from ingest.base import load_sources
    manifest = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "git_sha": _git_sha(),
        "sources": {sid: {"name": s.name, "license": s.license, "url": s.url}
                    for sid, s in sorted(load_sources().items())},
        "outputs": export_out,
    }
    path = OUT_DIR / "manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2,
                               sort_keys=True), encoding="utf-8")
    return path


def output_fingerprint() -> str:
    """טביעת אצבע של כל הפלט — בדיקת דטרמיניזם.

    הרצה חוזרת על אותם קלטים חייבת לייצר את אותה טביעה. manifest.json
    מוחרג כי הוא מכיל חותמת זמן.
    """
    h = hashlib.sha256()
    for p in sorted(OUT_DIR.rglob("*")):
        if p.is_file() and p.name != "manifest.json":
            h.update(p.name.encode())
            h.update(p.read_bytes())
    return h.hexdigest()


# ══════════════════════════════════════════════════════════════════════════
#  CLI
# ══════════════════════════════════════════════════════════════════════════
RUNNERS = {
    "ingest": stage_ingest, "normalize": stage_normalize, "load": stage_load,
    "geocode": stage_geocode, "graphs": stage_graphs, "crossref": stage_crossref,
    "validate": stage_validate, "export": stage_export,
}


def main() -> None:
    ap = argparse.ArgumentParser(description="צינור ה-ETL של אטלס מלחמת העולם השנייה")
    ap.add_argument("--db", choices=["sqlite", "postgis"], default="sqlite")
    ap.add_argument("--stage", choices=STAGES, help="הרצת שלב בודד")
    ap.add_argument("--all", action="store_true", help="הרצת כל השלבים")
    ap.add_argument("--skip", nargs="*", default=[], help="שלבים לדילוג")
    ap.add_argument("--source", help="מקור בודד לקליטה")
    ap.add_argument("--fingerprint", action="store_true",
                    help="הדפסת טביעת אצבע של הפלט (בדיקת דטרמיניזם)")
    ap.add_argument("--echo", action="store_true", help="הדפסת SQL")
    args = ap.parse_args()

    init_db(args.db, echo=args.echo)
    console.print(f"[bold]אטלס מלחמת העולם השנייה — ETL[/bold]  ([dim]{args.db}[/dim])\n")

    if args.fingerprint:
        console.print(output_fingerprint())
        return

    to_run = [args.stage] if args.stage else \
             [s for s in STAGES if s not in args.skip]

    results: dict = {}
    for name in to_run:
        console.print(f"[cyan]▶ {name}[/cyan]")
        try:
            results[name] = RUNNERS[name](args)
        except SystemExit:
            raise
        except Exception as e:                               # noqa: BLE001
            console.print(f"[red]✗ {name} נכשל: {e}[/red]")
            raise
        console.print(f"  [green]✓[/green] {results[name]}\n")

    console.print("[green bold]✓ הצינור הושלם.[/green bold]")
    console.print(f"[dim]פלט: {OUT_DIR}[/dim]")


if __name__ == "__main__":
    main()
