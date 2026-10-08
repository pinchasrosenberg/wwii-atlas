"""Build the design-only supply network used by the map UI.

The builder never edits research inputs. It combines explicitly marked design
entities with existing representative battles and routes, validates references,
and writes deterministic static fallbacks for the read-only API contract.
"""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
OUT = WEB / "data" / "network"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def entity_files() -> list[Path]:
    return [
        ROOT / "data/factories/04_linked_build/design.entities.json",
        ROOT / "data/headquarters/04_linked_build/design.entities.json",
        ROOT / "data/ports/04_linked_build/design.entities.json",
    ]


def load_entities() -> list[dict]:
    entities: list[dict] = []
    for path in entity_files():
        entities.extend(read_json(path)["entities"])

    battles = read_json(WEB / "data/stage2/battles.json")
    for item in battles["battles"]:
        if item["id"] not in {"normandy", "stalingrad"}:
            continue
        entities.append({
            "id": f"battle:{item['id']}",
            "entity_type": "battle",
            "name_he": item["name_he"],
            "name_en": item["name_en"],
            "position": item["position"],
            "day_from": item["day_from"],
            "day_to": item["day_to"],
            "data_status": "real",
            "publish_status": "published",
            "confidence": item.get("confidence", "high"),
            "source_ids": item["source_ids"],
            "summary_he": item["summary_he"],
        })

    routes = read_json(WEB / "data/stage2/convoy-routes.json")["routes"]
    for item in routes:
        if item["route_id"] not in {"HX", "PERSIAN_CORRIDOR"}:
            continue
        midpoint = item["path"][len(item["path"]) // 2]
        entities.append({
            "id": f"route:{item['route_id']}",
            "entity_type": "supply_route",
            "name_he": item["name_he"],
            "name_en": item["name_en"],
            "position": midpoint,
            "path": item["path"],
            "day_from": item["day_from"],
            "day_to": item["day_to"],
            "data_status": "real",
            "publish_status": "published",
            "confidence": item.get("confidence", "medium"),
            "source_ids": item["source_ids"],
            "summary_he": item.get("coverage_note_he") or item.get("name_he"),
        })
    entities.sort(key=lambda item: item["id"])
    return entities


def validate(entities: list[dict], relations: list[dict]) -> None:
    ids = [item["id"] for item in entities]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate entity id in design network")
    known = set(ids)
    for entity in entities:
        if entity["data_status"] not in {"real", "mixed", "mock"}:
            raise ValueError(f"invalid data_status for {entity['id']}")
        if not entity.get("source_ids"):
            raise ValueError(f"missing source_ids for {entity['id']}")
    relation_ids: set[str] = set()
    for relation in relations:
        if relation["id"] in relation_ids:
            raise ValueError(f"duplicate relation id {relation['id']}")
        relation_ids.add(relation["id"])
        if relation["from_id"] not in known or relation["to_id"] not in known:
            raise ValueError(f"unknown endpoint in {relation['id']}")
        if relation["derivation"] == "design_mock" and relation["data_status"] == "real":
            raise ValueError(f"mock derivation marked real in {relation['id']}")
        if len(relation.get("path") or []) < 2:
            raise ValueError(f"relation path missing in {relation['id']}")


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    entities = load_entities()
    relation_payload = read_json(
        ROOT / "data/relations/04_linked_build/design.relations.json"
    )
    relations = sorted(relation_payload["relations"], key=lambda item: item["id"])
    validate(entities, relations)
    write_json(OUT / "entities.json", {
        "version": 1,
        "mode": "design_mixed_data",
        "entities": entities,
    })
    write_json(OUT / "relations.json", {
        "version": 1,
        "mode": "design_mock_relations",
        "warning_he": relation_payload["warning_he"],
        "relations": relations,
    })
    print(f"Built {len(entities)} entities and {len(relations)} design relations")


if __name__ == "__main__":
    main()

