# The public WWII knowledge graph

The atlas's research graph holds more than 4 million nodes: raw source passages, map-extraction runs, candidate claims,
terrain grids and pipeline bookkeeping. This directory describes the **curated public subset** that is hosted online
and served by [`../api`](../api).

| | |
|---|---|
| Nodes | **163,124** |
| Relationships | **204,628** |
| Host | Neo4j Aura (free tier: 200k nodes / 400k relationships) |
| Access | read-only, only through the API; no client ever holds database credentials |

## What is in it

| Domain | Labels (count) |
|---|---|
| Battles & operations | `Battle` (2,544), `Campaign` (76), `Theater` (38), `Front` (9), `FrontLine` (33) |
| Forces | `Unit` (5,055 canonical formations), `Formation` (403), `Commander` (6,553), `Belligerent` (263), `Polity` (33) |
| Verified facts | `AtlasFact` (62,120), attached to battles and units with confidence and source title |
| Losses & strength | `CasualtyFigure` (18,361), `StrengthFigure` (3,790) |
| War at sea | `Sinking` (22,114), `VesselInstance` (3,950), `Convoy` (310), `Port` (109), `SeaRoute` (11) |
| Air war | `AirRaid` (13,283) |
| Industry & equipment | `Plant` (7,699), `Manufacturer` (1,681), `EquipmentItem` (2,152), `EquipmentType` (98), `EquipmentModel` (83), `AircraftModel` (28) |
| Camps & places | `Camp` (1,878), `Facility` (4,070), `City` (1,950) |
| Provenance | `Source` (4,261): title, URL, license and collection. No source text is included. |
| Delivers catalog | `Driver`/`Deliver` (51), `DriverVersion` (96), `DeliverListener` (11), `DriverArtifact` (9), `StateChannel` (2) |

Every node also carries the `Public` label and a stable `pid`. The most common relationships are `ABOUT_BATTLE`,
`CASUALTIES_AT`, `ABOUT_UNIT`, `PARTICIPATED_ORBAT`, `COMMANDED_AT`, `SUBORDINATE_TO`, `IN_COMMAND_TREE`,
`BUILT_BY`, `HAD_COMBATANT` and `CAN_PRODUCE`.

## How the subset was chosen

* **Fact gate.** Where the research pipeline marks a record `safe_for_factual_answer`, only those records are
  included. Quarantined and excluded records are left out, and so are non-canonical duplicate units.
* **No raw text.** Source passages, OCR, Wikipedia evidence windows and extraction candidates stay private. Facts
  derived from Wikipedia are cleaned of markup and keep their article title for attribution (CC BY-SA). Prose from
  sources that are not openly licensed (for example the plant descriptions in Dexter & Rodionov's guide to the Soviet
  defence industry) is dropped, and only the factual attributes are kept, with the source cited in `source_ids`.
* **No pipeline internals.** Normalisation versions, derivation logs, embeddings, storage keys, local file paths
  and run history are stripped property by property. A final scan rejects any value that looks like a path, host,
  credential or personal identifier.
* **Closed set.** A relationship is published only when both of its endpoints are published.

## Loading it into a fresh database

```bash
pip install neo4j
export NEO4J_URI=neo4j+s://<id>.databases.neo4j.io NEO4J_USER=neo4j NEO4J_PASSWORD=...
python graph/load_snapshot.py path/to/snapshot          # nodes.jsonl + relationships.jsonl
```

The loader refuses to touch anything except an encrypted, public, remote database. It rejects `localhost`, private
IP addresses, unencrypted schemes, and any database that already contains labels outside the public schema. It then
creates the `pid` uniqueness constraint, the full-text indexes `public_names` and `public_facts`, and lookup indexes.

```bash
python -m unittest graph/test_load_snapshot.py
```

## Main sources in the public graph

Wikipedia and Wikidata (CC BY-SA / CC0), THOR (USAF Theater History of Operations), JANAC 1947, the NHHC U-boat
casualty lists, U.S. Navy shore activities, the USHMM Encyclopedia of Camps and Ghettos (structured facts only),
CDB90, the Nafziger Order of Battle Collection (U.S. Army CARL), and Dexter & Rodionov, *The Factories, Research
and Design Establishments of the Soviet Defence Industry* (facts only, attributed).
