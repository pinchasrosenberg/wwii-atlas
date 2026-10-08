"""Load a public WWII Atlas graph snapshot (nodes.jsonl + relationships.jsonl) into a hosted Neo4j.

    export NEO4J_URI=neo4j+s://<id>.databases.neo4j.io NEO4J_USER=neo4j NEO4J_PASSWORD=...
    python graph/load_snapshot.py path/to/snapshot [--replace]

Safety rails:
  * only encrypted remote targets (neo4j+s:// or bolt+s://) are accepted, never localhost;
  * refuses a database that already contains nodes outside the public schema;
  * --replace removes only nodes labelled :Public, in batches.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

from neo4j import GraphDatabase

IDENT = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
BATCH = 2000


def check_target(uri: str) -> None:
    parsed = urlparse(uri)
    if parsed.scheme not in {"neo4j+s", "bolt+s"}:
        sys.exit("NEO4J_URI must use an encrypted scheme (neo4j+s:// or bolt+s://)")
    host = (parsed.hostname or "").lower()
    if not host or host == "localhost" or host.endswith(".local"):
        sys.exit("refusing to load into a local database")
    try:
        if not ipaddress.ip_address(host).is_global:
            sys.exit("refusing to load into a private or loopback address")
    except ValueError:
        pass  # a hostname, fine


def ident(value: str) -> str:
    if not IDENT.match(value):
        raise ValueError(f"unsafe label or relationship type: {value!r}")
    return f"`{value}`"


def read_jsonl(path: Path):
    with path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("snapshot", type=Path)
    ap.add_argument("--replace", action="store_true", help="delete existing :Public nodes first")
    args = ap.parse_args()

    uri = os.environ.get("NEO4J_URI", "")
    user = os.environ.get("NEO4J_USER", "")
    password = os.environ.get("NEO4J_PASSWORD", "")
    if not (uri and user and password):
        sys.exit("set NEO4J_URI, NEO4J_USER and NEO4J_PASSWORD")
    check_target(uri)

    nodes = list(read_jsonl(args.snapshot / "nodes.jsonl"))
    public_labels = {label for n in nodes for label in n["labels"]}

    with GraphDatabase.driver(uri, auth=(user, password)) as driver, driver.session() as s:
        existing = {r["label"] for r in s.run("CALL db.labels() YIELD label RETURN label")}
        foreign = existing - public_labels - {"Public"}
        if foreign:
            sys.exit(f"target contains non-public labels {sorted(foreign)[:8]} — refusing (wrong database?)")
        count = s.run("MATCH (n:Public) RETURN count(n) AS c").single()["c"]
        if count and not args.replace:
            sys.exit(f"target already has {count} public nodes; rerun with --replace")
        if count:
            s.run("MATCH (n:Public) CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 5000 ROWS").consume()

        s.run("CREATE CONSTRAINT public_pid IF NOT EXISTS FOR (n:Public) REQUIRE n.pid IS UNIQUE").consume()

        by_labels = defaultdict(list)
        for n in nodes:
            by_labels[tuple(n["labels"])].append({"pid": n["id"], "props": n["props"]})
        for labels, rows in by_labels.items():
            label_expr = ":".join(ident(x) for x in ("Public", *labels))
            for i in range(0, len(rows), BATCH):
                s.run(f"UNWIND $rows AS row CREATE (n:{label_expr}) SET n = row.props, n.pid = row.pid",
                      rows=rows[i:i + BATCH]).consume()
            print(f"nodes {':'.join(labels):40} {len(rows):>7}")

        by_type = defaultdict(list)
        for r in read_jsonl(args.snapshot / "relationships.jsonl"):
            by_type[r["type"]].append({"s": r["start"], "e": r["end"], "props": r["props"]})
        for rtype, rows in by_type.items():
            for i in range(0, len(rows), BATCH):
                s.run(f"UNWIND $rows AS row MATCH (a:Public {{pid: row.s}}), (b:Public {{pid: row.e}}) "
                      f"CREATE (a)-[r:{ident(rtype)}]->(b) SET r = row.props", rows=rows[i:i + BATCH]).consume()
            print(f"rels  {rtype:40} {len(rows):>7}")

        s.run("CREATE FULLTEXT INDEX public_names IF NOT EXISTS FOR (n:Public) "
              "ON EACH [n.name, n.name_he, n.title, n.vessel_name, n.label]").consume()
        s.run("CREATE FULLTEXT INDEX public_facts IF NOT EXISTS FOR (n:AtlasFact) ON EACH [n.text, n.src_title]").consume()
        for label, prop in (("Battle", "timeline_date_from"), ("Driver", "driver_id"), ("Unit", "name")):
            s.run(f"CREATE INDEX IF NOT EXISTS FOR (n:{ident(label)}) ON (n.{prop})").consume()

        totals = s.run("MATCH (n:Public) WITH count(n) AS n MATCH ()-[r]->() RETURN n, count(r) AS r").single()
        print(f"done: {totals['n']} nodes, {totals['r']} relationships")


if __name__ == "__main__":
    main()
