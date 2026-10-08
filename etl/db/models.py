"""מודלי SQLAlchemy — מימוש מודל הנתונים מפרק 4 באפיון.

שני כללים שנאכפים ברמת הסכמה ולא רק בוולידציה:
  1. כל ישות תוכן יורשת מ-`Sourced` ← אין רשומה בלי מקור.
  2. כל מספר נפגעים הוא זוג `_min`/`_max` ← אין ערך בודד מתחזה לוודאות.
"""
from __future__ import annotations

import enum
from datetime import date

from sqlalchemy import (JSON, Boolean, CheckConstraint, Date, Enum, Float,
                        ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from db.types import Geometry


class Base(DeclarativeBase):
    pass


# ══════════════════════════════════════════════════════════════════════════
#  אנומים
# ══════════════════════════════════════════════════════════════════════════
class Derivation(str, enum.Enum):
    """האם הערך הגיע ממקור או חושב אלגוריתמית. שקיפות היא דרישה, לא נחמדות."""
    SOURCE = "source"
    ALGORITHMIC = "algorithmic"
    MANUAL = "manual"


class Confidence(str, enum.Enum):
    CENSUS = "census"
    PRIMARY_RECORD = "primary_record"
    OFFICIAL_ESTIMATE = "official_estimate"
    SCHOLARLY_ESTIMATE = "scholarly_estimate"
    RECONSTRUCTION = "reconstruction"


class PlaceType(str, enum.Enum):
    CITY = "city"; TOWN = "town"; VILLAGE = "village"; PORT = "port"
    JUNCTION = "junction"; AIRFIELD = "airfield"; FORTRESS = "fortress"; SITE = "site"


class CampType(str, enum.Enum):
    EXTERMINATION = "extermination"; CONCENTRATION = "concentration"
    LABOR = "labor"; TRANSIT = "transit"; POW = "POW"; GHETTO = "ghetto"
    MASS_SHOOTING_SITE = "mass_shooting_site"; SUBCAMP = "subcamp"


class RouteClass(str, enum.Enum):
    SEA_CONVOY = "sea_convoy"; LAND_CORRIDOR = "land_corridor"
    RAIL_CORRIDOR = "rail_corridor"; AIR_BRIDGE = "air_bridge"
    PIPELINE = "pipeline"; HUMANITARIAN = "humanitarian"


class Theater(str, enum.Enum):
    EASTERN = "eastern"; WESTERN = "western"; ITALIAN = "italian"
    NORTH_AFRICA = "north_africa"; ATLANTIC = "atlantic"; PACIFIC = "pacific"
    CBI = "cbi"; BALKANS = "balkans"; SCANDINAVIA = "scandinavia"


class RailImportance(str, enum.Enum):
    TRUNK = "trunk"; MAIN = "main"; SECONDARY = "secondary"; SPUR = "spur"


# ══════════════════════════════════════════════════════════════════════════
#  מקורות
# ══════════════════════════════════════════════════════════════════════════
class Source(Base):
    """מרשם המקורות. נטען מ-config/sources.yaml."""
    __tablename__ = "sources"

    source_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    url: Mapped[str | None] = mapped_column(Text)
    license: Mapped[str | None] = mapped_column(String(256))
    access: Mapped[str | None] = mapped_column(String(32))
    retrieved_at: Mapped[date | None] = mapped_column(Date)
    checksum: Mapped[str | None] = mapped_column(String(64))
    version: Mapped[str | None] = mapped_column(String(64))


class RawAsset(Base):
    """צילום גולמי בלתי משתנה של קובץ או תגובת מקור."""
    __tablename__ = "raw_assets"

    asset_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.source_id"), index=True)
    source_url: Mapped[str] = mapped_column(Text)
    retrieved_at: Mapped[str] = mapped_column(String(40), index=True)
    checksum_sha256: Mapped[str] = mapped_column(String(64))
    byte_size: Mapped[int] = mapped_column(Integer)
    media_type: Mapped[str | None] = mapped_column(String(128))
    local_path: Mapped[str] = mapped_column(Text)
    rights_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (
        UniqueConstraint("source_id", "checksum_sha256", name="uq_raw_asset_checksum"),
        CheckConstraint("byte_size >= 0", name="ck_raw_asset_size"),
    )


class SourceClaim(Base):
    """טענה אטומית עם מצביע מדויק למקור ושיטת חילוץ."""
    __tablename__ = "source_claims"

    claim_id: Mapped[str] = mapped_column(String(96), primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(64), index=True)
    entity_id: Mapped[str] = mapped_column(String(96), index=True)
    field_name: Mapped[str] = mapped_column(String(96), index=True)
    value_json: Mapped[dict] = mapped_column(JSON)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.source_id"), index=True)
    asset_id: Mapped[str | None] = mapped_column(ForeignKey("raw_assets.asset_id"))
    source_locator: Mapped[str | None] = mapped_column(Text)
    extraction_method: Mapped[str] = mapped_column(String(40))
    independence_group: Mapped[str] = mapped_column(String(96), index=True)
    extracted_at: Mapped[str] = mapped_column(String(40))
    reviewer: Mapped[str | None] = mapped_column(String(128))
    notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "extraction_method IN ('structured','manual_double_entry','ocr_verified',"
            "'georeferenced','algorithmic_candidate')",
            name="ck_claim_extraction_method",
        ),
    )


class QualityAssessment(Base):
    """ציון איכות גרסאי; אינו חלק מהעדות הגולמית."""
    __tablename__ = "quality_assessments"

    assessment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(64), index=True)
    entity_id: Mapped[str] = mapped_column(String(96), index=True)
    algorithm_version: Mapped[str] = mapped_column(String(32))
    assessed_at: Mapped[str] = mapped_column(String(40))
    quality_score: Mapped[int] = mapped_column(Integer, index=True)
    confidence: Mapped[str] = mapped_column(String(20))
    publishable: Mapped[bool] = mapped_column(Boolean)
    decision: Mapped[str] = mapped_column(String(24), index=True)
    components: Mapped[dict] = mapped_column(JSON)
    flags: Mapped[list] = mapped_column(JSON, default=list)

    __table_args__ = (
        UniqueConstraint(
            "entity_type", "entity_id", "algorithm_version",
            name="uq_quality_entity_version",
        ),
        CheckConstraint("quality_score BETWEEN 0 AND 100", name="ck_quality_score"),
        CheckConstraint(
            "confidence IN ('high','medium','low','insufficient')",
            name="ck_quality_confidence",
        ),
        CheckConstraint(
            "decision IN ('publish','hold_rights','review','reject')",
            name="ck_quality_decision",
        ),
    )


class Sourced:
    """מיקסין: כל ישות תוכן חייבת source_ids לא ריק."""
    source_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    derivation: Mapped[Derivation] = mapped_column(
        Enum(Derivation), default=Derivation.SOURCE, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class TimeBounded:
    """מיקסין: חלון תוקף בזמן, כולל אינדקס ימים לסינון ב-shader."""
    valid_from: Mapped[date | None] = mapped_column(Date, index=True)
    valid_to: Mapped[date | None] = mapped_column(Date, index=True)
    day_from: Mapped[int | None] = mapped_column(Integer, index=True)
    day_to: Mapped[int | None] = mapped_column(Integer, index=True)


# ══════════════════════════════════════════════════════════════════════════
#  מקומות
# ══════════════════════════════════════════════════════════════════════════
class Place(Base, Sourced):
    __tablename__ = "places"

    place_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    wikidata_qid: Mapped[str | None] = mapped_column(String(32), index=True)
    canonical_name: Mapped[str] = mapped_column(String(256), index=True)
    place_type: Mapped[PlaceType] = mapped_column(Enum(PlaceType))

    geom = mapped_column(Geometry("POINT"))
    lon: Mapped[float | None] = mapped_column(Float, index=True)  # לשאילתות SQLite
    lat: Mapped[float | None] = mapped_column(Float, index=True)

    is_rail_node: Mapped[bool] = mapped_column(Boolean, default=False)
    is_port: Mapped[bool] = mapped_column(Boolean, default=False)

    # מחושב ב-crossref — לא מוזן ידנית
    battle_count: Mapped[int] = mapped_column(Integer, default=0)

    names: Mapped[list["PlaceName"]] = relationship(back_populates="place",
                                                    cascade="all, delete-orphan")
    demographics: Mapped[list["DemographicRecord"]] = relationship(back_populates="place")

    __table_args__ = (Index("ix_places_lonlat", "lon", "lat"),)


class PlaceName(Base):
    """Lwów / Lviv / Lemberg / למברג — עם תקופת תוקף לכל שם.

    זו הטבלה שמאפשרת לחיפוש 'למברג' למצוא את Lviv, ולממשק להציג את השם
    הנכון לתאריך שנבחר.
    """
    __tablename__ = "place_names"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    place_id: Mapped[str] = mapped_column(ForeignKey("places.place_id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(256), index=True)
    name_normalized: Mapped[str] = mapped_column(String(256), index=True)  # להתאמה מטושטשת
    lang: Mapped[str] = mapped_column(String(8))
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    place: Mapped[Place] = relationship(back_populates="names")

    __table_args__ = (UniqueConstraint("place_id", "name", "lang", name="uq_place_name"),)


class DemographicRecord(Base, Sourced):
    __tablename__ = "demographics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    place_id: Mapped[str] = mapped_column(ForeignKey("places.place_id"), index=True)
    as_of: Mapped[date] = mapped_column(Date, index=True)
    total: Mapped[int | None] = mapped_column(Integer)
    record_type: Mapped[str] = mapped_column(String(32))   # prewar/wartime/postwar/victims
    confidence: Mapped[Confidence] = mapped_column(Enum(Confidence))

    # [{category, kind, count, share}] — kind ∈ ethnicity|language|religion
    # ההבחנה קריטית: מפקד פולין 1931 מדד שפה ודת, לא לאום.
    breakdown: Mapped[list] = mapped_column(JSON, default=list)
    breakdown_kind: Mapped[str | None] = mapped_column(String(16))

    place: Mapped[Place] = relationship(back_populates="demographics")

    __table_args__ = (
        CheckConstraint("total IS NULL OR total >= 0", name="ck_demo_total_nonneg"),
    )


# ══════════════════════════════════════════════════════════════════════════
#  לחימה
# ══════════════════════════════════════════════════════════════════════════
class Battle(Base, Sourced, TimeBounded):
    __tablename__ = "battles"

    battle_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name_he: Mapped[str | None] = mapped_column(String(256))
    name_en: Mapped[str] = mapped_column(String(256), index=True)
    theater: Mapped[Theater] = mapped_column(Enum(Theater), index=True)

    geom = mapped_column(Geometry("POINT"))
    lon: Mapped[float | None] = mapped_column(Float, index=True)
    lat: Mapped[float | None] = mapped_column(Float, index=True)

    outcome: Mapped[str | None] = mapped_column(String(32))
    parent_operation_id: Mapped[str | None] = mapped_column(String(64), index=True)

    # [{polity, side, strength, casualties_min, casualties_max}]
    belligerents: Mapped[list] = mapped_column(JSON, default=list)

    casualties_min: Mapped[int | None] = mapped_column(Integer)
    casualties_max: Mapped[int | None] = mapped_column(Integer)

    # מחושב אוטומטית ב-crossref/supply_context.py — לעולם לא מוזן ידנית
    supply_context: Mapped[dict | None] = mapped_column(JSON)

    __table_args__ = (
        CheckConstraint("casualties_min IS NULL OR casualties_max IS NULL "
                        "OR casualties_min <= casualties_max",
                        name="ck_battle_casualty_range"),
    )


class BattlePlace(Base):
    """קשר רבים-לרבים קרב↔מקום. מזין את Place.battle_count."""
    __tablename__ = "battle_places"

    battle_id: Mapped[str] = mapped_column(ForeignKey("battles.battle_id"), primary_key=True)
    place_id: Mapped[str] = mapped_column(ForeignKey("places.place_id"), primary_key=True)


# ══════════════════════════════════════════════════════════════════════════
#  מחנות וטרנספורטים
# ══════════════════════════════════════════════════════════════════════════
class Camp(Base, Sourced, TimeBounded):
    __tablename__ = "camps"

    camp_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), index=True)
    camp_type: Mapped[CampType] = mapped_column(Enum(CampType), index=True)

    # ההיררכיה היא מה שמאפשר את האגרגציה לפי זום (7.7).
    # בלעדיה המפה בזום נמוך בלתי קריאה.
    parent_camp_id: Mapped[str | None] = mapped_column(
        ForeignKey("camps.camp_id"), index=True)

    operator: Mapped[str | None] = mapped_column(String(64))
    geom = mapped_column(Geometry("POINT"))
    lon: Mapped[float | None] = mapped_column(Float, index=True)
    lat: Mapped[float | None] = mapped_column(Float, index=True)

    peak_population: Mapped[int | None] = mapped_column(Integer)
    deaths_min: Mapped[int | None] = mapped_column(Integer)
    deaths_max: Mapped[int | None] = mapped_column(Integer)

    # [{group, count_min, count_max}] — כל קבוצה בנפרד ובשמה
    victim_groups: Mapped[list] = mapped_column(JSON, default=list)

    rail_station_place_id: Mapped[str | None] = mapped_column(ForeignKey("places.place_id"))
    has_dedicated_spur: Mapped[bool] = mapped_column(Boolean, default=False)

    contested: Mapped[bool] = mapped_column(Boolean, default=False)
    interpretations: Mapped[list | None] = mapped_column(JSON)

    subcamps: Mapped[list["Camp"]] = relationship()

    __table_args__ = (
        CheckConstraint("deaths_min IS NULL OR deaths_max IS NULL "
                        "OR deaths_min <= deaths_max", name="ck_camp_death_range"),
    )


class Transport(Base, Sourced):
    __tablename__ = "transports"

    transport_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    origin_place_id: Mapped[str] = mapped_column(ForeignKey("places.place_id"), index=True)
    destination_camp_id: Mapped[str | None] = mapped_column(
        ForeignKey("camps.camp_id"), index=True)

    pickup_place_ids: Mapped[list] = mapped_column(JSON, default=list)

    departure_date: Mapped[date | None] = mapped_column(Date, index=True)
    arrival_date: Mapped[date | None] = mapped_column(Date, index=True)
    day_from: Mapped[int | None] = mapped_column(Integer, index=True)
    day_to: Mapped[int | None] = mapped_column(Integer, index=True)

    persons_count: Mapped[int | None] = mapped_column(Integer)
    survivors_count: Mapped[int | None] = mapped_column(Integer)
    transport_mode: Mapped[str | None] = mapped_column(String(32))

    # מנותב על גרף המסילות. NULL = לא נותב → לא מוצג. אף פעם לא קו אווירי.
    route_geom = mapped_column(Geometry("LINESTRING"))
    route_node_ids: Mapped[list | None] = mapped_column(JSON)
    route_length_km: Mapped[float | None] = mapped_column(Float)
    routing_status: Mapped[str] = mapped_column(String(24), default="pending")
    # pending | routed | unroutable | implausible_duration


# ══════════════════════════════════════════════════════════════════════════
#  לוגיסטיקה
# ══════════════════════════════════════════════════════════════════════════
class SupplyRoute(Base, Sourced, TimeBounded):
    __tablename__ = "supply_routes"

    route_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name_he: Mapped[str | None] = mapped_column(String(256))
    name_en: Mapped[str] = mapped_column(String(256))
    route_class: Mapped[RouteClass] = mapped_column(Enum(RouteClass), index=True)

    geom = mapped_column(Geometry("LINESTRING"))
    origin_place_id: Mapped[str | None] = mapped_column(ForeignKey("places.place_id"))
    destination_place_id: Mapped[str | None] = mapped_column(ForeignKey("places.place_id"))
    operator_polity: Mapped[str | None] = mapped_column(String(64))

    # [{period_from, period_to, loss_rate}] — מקודד כצבע הקו
    risk_profile: Mapped[list] = mapped_column(JSON, default=list)

    throughput: Mapped[list["ThroughputRecord"]] = relationship(back_populates="route")


class ThroughputRecord(Base, Sourced):
    """רשומת תפוקה — זה מה שמניע את אנימציית הזרימה ואת גרף הטונאז'."""
    __tablename__ = "throughput"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_id: Mapped[str] = mapped_column(ForeignKey("supply_routes.route_id"), index=True)
    period_from: Mapped[date] = mapped_column(Date, index=True)
    period_to: Mapped[date] = mapped_column(Date, index=True)

    # תמיד long tons. ההמרה נעשית ב-normalize/units.py, לא כאן.
    tonnage: Mapped[float | None] = mapped_column(Float)
    losses_tonnage: Mapped[float | None] = mapped_column(Float)
    tonnage_unit_original: Mapped[str | None] = mapped_column(String(32))

    # [{category, share}] — ordnance|fuel|food|vehicles|aircraft|raw_materials|medical|personnel
    cargo_mix: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[Confidence] = mapped_column(Enum(Confidence))

    route: Mapped[SupplyRoute] = relationship(back_populates="throughput")

    __table_args__ = (
        CheckConstraint("losses_tonnage IS NULL OR tonnage IS NULL "
                        "OR losses_tonnage <= tonnage", name="ck_losses_le_tonnage"),
        CheckConstraint("period_from <= period_to", name="ck_throughput_period"),
    )


class Convoy(Base, Sourced):
    __tablename__ = "convoys"

    convoy_id: Mapped[str] = mapped_column(String(64), primary_key=True)  # HX 133, PQ 17
    route_code: Mapped[str] = mapped_column(String(16), index=True)
    sail_date: Mapped[date | None] = mapped_column(Date, index=True)
    arrival_date: Mapped[date | None] = mapped_column(Date)
    ships_total: Mapped[int | None] = mapped_column(Integer)
    ships_lost: Mapped[int | None] = mapped_column(Integer)
    escort_composition: Mapped[str | None] = mapped_column(Text)
    geom = mapped_column(Geometry("LINESTRING"))

    __table_args__ = (
        CheckConstraint("ships_lost IS NULL OR ships_total IS NULL "
                        "OR ships_lost <= ships_total", name="ck_ships_lost"),
    )


class Sinking(Base, Sourced):
    """אנייה שהוטבעה. אלפי רשומות — מיוצאת ל-Parquet ולא ל-GeoJSON."""
    __tablename__ = "sinkings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vessel_name: Mapped[str | None] = mapped_column(String(256))
    flag: Mapped[str | None] = mapped_column(String(64))
    tonnage_grt: Mapped[float | None] = mapped_column(Float)
    sunk_date: Mapped[date | None] = mapped_column(Date, index=True)
    day_index: Mapped[int | None] = mapped_column(Integer, index=True)
    lon: Mapped[float | None] = mapped_column(Float, index=True)
    lat: Mapped[float | None] = mapped_column(Float, index=True)
    geom = mapped_column(Geometry("POINT"))
    cause: Mapped[str | None] = mapped_column(String(64))    # u-boat, aircraft, mine...
    attacker_id: Mapped[str | None] = mapped_column(String(32))
    convoy_id: Mapped[str | None] = mapped_column(ForeignKey("convoys.convoy_id"))
    cargo: Mapped[str | None] = mapped_column(Text)
    crew_lost: Mapped[int | None] = mapped_column(Integer)


class AidOperation(Base, Sourced, TimeBounded):
    __tablename__ = "aid_operations"

    aid_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    agency: Mapped[str] = mapped_column(String(64), index=True)
    aid_type: Mapped[str] = mapped_column(String(32))
    negotiated_status: Mapped[str | None] = mapped_column(String(32))
    geom = mapped_column(Geometry("LINESTRING"))
    tonnage: Mapped[float | None] = mapped_column(Float)
    beneficiary_estimate: Mapped[int | None] = mapped_column(Integer)


# ══════════════════════════════════════════════════════════════════════════
#  גרפים
# ══════════════════════════════════════════════════════════════════════════
class GraphNode(Base):
    """צומת באחד משלושת הגרפים. `graph` מפריד ביניהם."""
    __tablename__ = "graph_nodes"

    node_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    graph: Mapped[str] = mapped_column(String(16), primary_key=True)  # rail|maritime|land
    place_id: Mapped[str | None] = mapped_column(ForeignKey("places.place_id"))
    lon: Mapped[float] = mapped_column(Float)
    lat: Mapped[float] = mapped_column(Float)
    node_kind: Mapped[str | None] = mapped_column(String(32))
    gauge_mm: Mapped[int | None] = mapped_column(Integer)   # רק בגרף המסילתי


class GraphEdge(Base, TimeBounded):
    __tablename__ = "graph_edges"

    edge_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    graph: Mapped[str] = mapped_column(String(16), index=True)
    from_node: Mapped[str] = mapped_column(String(64), index=True)
    to_node: Mapped[str] = mapped_column(String(64), index=True)

    length_km: Mapped[float] = mapped_column(Float)
    weight_hours: Mapped[float] = mapped_column(Float)      # פונקציית המשקל לניתוב
    capacity_tons_day: Mapped[float | None] = mapped_column(Float)

    gauge_mm: Mapped[int | None] = mapped_column(Integer)
    importance: Mapped[RailImportance | None] = mapped_column(Enum(RailImportance), index=True)
    is_damaged: Mapped[bool] = mapped_column(Boolean, default=False)
    risk_factor: Mapped[float | None] = mapped_column(Float)  # גרף ימי

    geom = mapped_column(Geometry("LINESTRING"))


# ══════════════════════════════════════════════════════════════════════════
#  תור בדיקה ידנית
# ══════════════════════════════════════════════════════════════════════════
class ReviewItem(Base):
    """כל מה שהאלגוריתם לא הצליח להכריע בביטחון.

    זה המנגנון שמונע ניחושים שקטים. פריט כאן = פריט שלא נכנס לפלט.
    """
    __tablename__ = "review_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(48), index=True)
    # name_match | unroutable_transport | demographic_mismatch |
    # implausible_duration | missing_source | geocode_failed

    entity_type: Mapped[str] = mapped_column(String(48))
    entity_id: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    score: Mapped[float | None] = mapped_column(Float)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    resolution: Mapped[str | None] = mapped_column(Text)


class BuildRun(Base):
    """רישום הרצה — לדטרמיניזם ולמעקב רגרסיות."""
    __tablename__ = "build_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[str] = mapped_column(String(32))
    git_sha: Mapped[str | None] = mapped_column(String(40))
    dialect: Mapped[str] = mapped_column(String(16))
    stages: Mapped[list] = mapped_column(JSON, default=list)
    output_checksums: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="running")
