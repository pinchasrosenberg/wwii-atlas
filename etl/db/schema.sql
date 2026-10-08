-- ═══════════════════════════════════════════════════════════════════════
--  אטלס מלחמת העולם השנייה — DDL ל-PostgreSQL + PostGIS
--
--  זהו הביטוי המפורש של הסכמה שמודלי SQLAlchemy מייצרים. הוא נשמר בנפרד
--  כי אילוצים ואינדקסים מרחביים קריאים יותר ב-SQL, וכי אנחנו רוצים
--  שהחוזה יהיה מתועד ולא נגזר מקוד.
--
--  הרצה:  psql -d ww2atlas -f db/schema.sql
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- התאמת שמות מטושטשת

-- ── מקורות ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sources (
    source_id    TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    url          TEXT,
    license      TEXT,
    access       TEXT CHECK (access IN ('open','attributed','permission','manual')),
    retrieved_at DATE,
    checksum     TEXT,
    version      TEXT
);

-- עותק גולמי בלתי משתנה של כל קובץ/תגובה שנקלטו.
CREATE TABLE IF NOT EXISTS raw_assets (
    asset_id       TEXT PRIMARY KEY,
    source_id      TEXT NOT NULL REFERENCES sources(source_id),
    source_url     TEXT NOT NULL,
    retrieved_at   TIMESTAMPTZ NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    byte_size      BIGINT NOT NULL CHECK (byte_size >= 0),
    media_type     TEXT,
    local_path     TEXT NOT NULL,
    rights_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (source_id, checksum_sha256)
);
CREATE INDEX IF NOT EXISTS ix_raw_assets_source_time
    ON raw_assets (source_id, retrieved_at);

-- טענה אטומית: מי אמר מה, איפה במסמך ואיך היא חולצה.
-- הערך הנורמלי בטבלת הישות לעולם אינו מוחק את הטענות שסותרות אותו.
CREATE TABLE IF NOT EXISTS source_claims (
    claim_id          TEXT PRIMARY KEY,
    entity_type       TEXT NOT NULL,
    entity_id         TEXT NOT NULL,
    field_name        TEXT NOT NULL,
    value_json        JSONB NOT NULL,
    source_id         TEXT NOT NULL REFERENCES sources(source_id),
    asset_id          TEXT REFERENCES raw_assets(asset_id),
    source_locator    TEXT,
    extraction_method TEXT NOT NULL
                      CHECK (extraction_method IN
                             ('structured','manual_double_entry','ocr_verified',
                              'georeferenced','algorithmic_candidate')),
    independence_group TEXT NOT NULL,
    extracted_at      TIMESTAMPTZ NOT NULL,
    reviewer          TEXT,
    notes             TEXT
);
CREATE INDEX IF NOT EXISTS ix_source_claims_entity
    ON source_claims (entity_type, entity_id, field_name);
CREATE INDEX IF NOT EXISTS ix_source_claims_source
    ON source_claims (source_id, independence_group);

-- הערכה גרסאית. שינוי באלגוריתם אינו דורס ציון קודם.
CREATE TABLE IF NOT EXISTS quality_assessments (
    assessment_id   BIGSERIAL PRIMARY KEY,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    algorithm_version TEXT NOT NULL,
    assessed_at     TIMESTAMPTZ NOT NULL,
    quality_score   INTEGER NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
    confidence      TEXT NOT NULL CHECK (confidence IN ('high','medium','low','insufficient')),
    publishable     BOOLEAN NOT NULL,
    decision        TEXT NOT NULL CHECK (decision IN ('publish','hold_rights','review','reject')),
    components      JSONB NOT NULL,
    flags           JSONB NOT NULL DEFAULT '[]'::jsonb,
    UNIQUE (entity_type, entity_id, algorithm_version)
);
CREATE INDEX IF NOT EXISTS ix_quality_decision_score
    ON quality_assessments (decision, quality_score DESC);

-- ── מקומות ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS places (
    place_id       TEXT PRIMARY KEY,
    wikidata_qid   TEXT,
    canonical_name TEXT NOT NULL,
    place_type     TEXT NOT NULL,
    geom           geometry(Point, 4326),
    lon            DOUBLE PRECISION,
    lat            DOUBLE PRECISION,
    is_rail_node   BOOLEAN NOT NULL DEFAULT FALSE,
    is_port        BOOLEAN NOT NULL DEFAULT FALSE,
    battle_count   INTEGER NOT NULL DEFAULT 0,
    source_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
    derivation     TEXT NOT NULL DEFAULT 'source',
    notes          TEXT,
    -- כלל ברזל #1: אין ישות בלי מקור.
    CONSTRAINT ck_places_has_source CHECK (jsonb_array_length(source_ids) > 0)
);
CREATE INDEX IF NOT EXISTS ix_places_geom ON places USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_places_name ON places USING GIN (canonical_name gin_trgm_ops);

-- שמות היסטוריים: Lwów / Lviv / Lemberg / למברג
CREATE TABLE IF NOT EXISTS place_names (
    id              BIGSERIAL PRIMARY KEY,
    place_id        TEXT NOT NULL REFERENCES places(place_id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    lang            TEXT NOT NULL,
    valid_from      DATE,
    valid_to        DATE,
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (place_id, name, lang)
);
CREATE INDEX IF NOT EXISTS ix_place_names_norm
    ON place_names USING GIN (name_normalized gin_trgm_ops);

-- ── דמוגרפיה ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demographics (
    id             BIGSERIAL PRIMARY KEY,
    place_id       TEXT NOT NULL REFERENCES places(place_id),
    as_of          DATE NOT NULL,
    total          INTEGER,
    record_type    TEXT NOT NULL
                   CHECK (record_type IN ('prewar_population','wartime_population',
                                          'postwar_population','victims')),
    confidence     TEXT NOT NULL,
    -- kind ∈ ethnicity|language|religion — מפקד פולין 1931 מדד שפה ודת, לא לאום.
    -- איחוד קטגוריות בין מפקדים שמדדו דברים שונים הוא הטעיה.
    breakdown_kind TEXT CHECK (breakdown_kind IN ('ethnicity','language','religion')),
    breakdown      JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
    derivation     TEXT NOT NULL DEFAULT 'source',
    CONSTRAINT ck_demo_total CHECK (total IS NULL OR total >= 0),
    CONSTRAINT ck_demo_source CHECK (jsonb_array_length(source_ids) > 0)
);
CREATE INDEX IF NOT EXISTS ix_demo_place_date ON demographics (place_id, as_of);

-- ── קרבות ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS battles (
    battle_id           TEXT PRIMARY KEY,
    name_he             TEXT,
    name_en             TEXT NOT NULL,
    theater             TEXT NOT NULL,
    geom                geometry(Point, 4326),
    lon                 DOUBLE PRECISION,
    lat                 DOUBLE PRECISION,
    valid_from          DATE,
    valid_to            DATE,
    day_from            INTEGER,
    day_to              INTEGER,
    outcome             TEXT,
    parent_operation_id TEXT,
    belligerents        JSONB NOT NULL DEFAULT '[]'::jsonb,
    casualties_min      INTEGER,
    casualties_max      INTEGER,
    -- מחושב ב-crossref/supply_context.py. נושא derivation='algorithmic'.
    supply_context      JSONB,
    source_ids          JSONB NOT NULL DEFAULT '[]'::jsonb,
    derivation          TEXT NOT NULL DEFAULT 'source',
    notes               TEXT,
    -- כלל ברזל #2: אין מספר נפגעים בודד.
    CONSTRAINT ck_battle_casualties
        CHECK (casualties_min IS NULL OR casualties_max IS NULL
               OR casualties_min <= casualties_max),
    CONSTRAINT ck_battle_dates CHECK (valid_from IS NULL OR valid_to IS NULL
                                      OR valid_from <= valid_to),
    CONSTRAINT ck_battle_source CHECK (jsonb_array_length(source_ids) > 0)
);
CREATE INDEX IF NOT EXISTS ix_battles_geom ON battles USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_battles_days ON battles (day_from, day_to);

CREATE TABLE IF NOT EXISTS battle_places (
    battle_id TEXT NOT NULL REFERENCES battles(battle_id) ON DELETE CASCADE,
    place_id  TEXT NOT NULL REFERENCES places(place_id)   ON DELETE CASCADE,
    PRIMARY KEY (battle_id, place_id)
);

-- ── מחנות ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS camps (
    camp_id               TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    camp_type             TEXT NOT NULL,
    -- ההיררכיה היא מה שמאפשר אגרגציה לפי זום. בלעדיה המפה בזום נמוך
    -- בלתי קריאה — אלפי מחנות משנה על גבי מחנות האם.
    parent_camp_id        TEXT REFERENCES camps(camp_id),
    operator              TEXT,
    geom                  geometry(Point, 4326),
    lon                   DOUBLE PRECISION,
    lat                   DOUBLE PRECISION,
    valid_from            DATE,
    valid_to              DATE,
    day_from              INTEGER,
    day_to                INTEGER,
    peak_population       INTEGER,
    deaths_min            INTEGER,
    deaths_max            INTEGER,
    victim_groups         JSONB NOT NULL DEFAULT '[]'::jsonb,
    rail_station_place_id TEXT REFERENCES places(place_id),
    has_dedicated_spur    BOOLEAN NOT NULL DEFAULT FALSE,
    contested             BOOLEAN NOT NULL DEFAULT FALSE,
    interpretations       JSONB,
    source_ids            JSONB NOT NULL DEFAULT '[]'::jsonb,
    derivation            TEXT NOT NULL DEFAULT 'source',
    notes                 TEXT,
    CONSTRAINT ck_camp_deaths CHECK (deaths_min IS NULL OR deaths_max IS NULL
                                     OR deaths_min <= deaths_max),
    CONSTRAINT ck_camp_source CHECK (jsonb_array_length(source_ids) > 0)
);
CREATE INDEX IF NOT EXISTS ix_camps_geom   ON camps USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_camps_parent ON camps (parent_camp_id);
CREATE INDEX IF NOT EXISTS ix_camps_type   ON camps (camp_type);
CREATE INDEX IF NOT EXISTS ix_camps_days   ON camps (day_from, day_to);

-- ── טרנספורטים ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transports (
    transport_id        TEXT PRIMARY KEY,
    origin_place_id     TEXT NOT NULL REFERENCES places(place_id),
    destination_camp_id TEXT REFERENCES camps(camp_id),
    pickup_place_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
    departure_date      DATE,
    arrival_date        DATE,
    day_from            INTEGER,
    day_to              INTEGER,
    persons_count       INTEGER,
    survivors_count     INTEGER,
    transport_mode      TEXT,
    -- כלל ברזל #4: אין קו אווירי. NULL כאן = לא מוצג במפה.
    route_geom          geometry(LineString, 4326),
    route_node_ids      JSONB,
    route_length_km     DOUBLE PRECISION,
    routing_status      TEXT NOT NULL DEFAULT 'pending'
                        CHECK (routing_status IN ('pending','routed','unroutable',
                                                  'implausible_duration')),
    source_ids          JSONB NOT NULL DEFAULT '[]'::jsonb,
    derivation          TEXT NOT NULL DEFAULT 'source',
    notes               TEXT,
    CONSTRAINT ck_transport_dates CHECK (departure_date IS NULL OR arrival_date IS NULL
                                         OR departure_date <= arrival_date),
    CONSTRAINT ck_transport_survivors CHECK (survivors_count IS NULL OR persons_count IS NULL
                                             OR survivors_count <= persons_count)
);
CREATE INDEX IF NOT EXISTS ix_transports_route ON transports USING GIST (route_geom);
CREATE INDEX IF NOT EXISTS ix_transports_dates ON transports (departure_date);

-- ── לוגיסטיקה ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supply_routes (
    route_id               TEXT PRIMARY KEY,
    name_he                TEXT,
    name_en                TEXT NOT NULL,
    route_class            TEXT NOT NULL,
    geom                   geometry(LineString, 4326),
    origin_place_id        TEXT REFERENCES places(place_id),
    destination_place_id   TEXT REFERENCES places(place_id),
    operator_polity        TEXT,
    valid_from             DATE,
    valid_to               DATE,
    day_from               INTEGER,
    day_to                 INTEGER,
    risk_profile           JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_ids             JSONB NOT NULL DEFAULT '[]'::jsonb,
    derivation             TEXT NOT NULL DEFAULT 'source',
    notes                  TEXT,
    CONSTRAINT ck_route_source CHECK (jsonb_array_length(source_ids) > 0)
);
CREATE INDEX IF NOT EXISTS ix_routes_geom ON supply_routes USING GIST (geom);

CREATE TABLE IF NOT EXISTS throughput (
    id                     BIGSERIAL PRIMARY KEY,
    route_id               TEXT NOT NULL REFERENCES supply_routes(route_id) ON DELETE CASCADE,
    period_from            DATE NOT NULL,
    period_to              DATE NOT NULL,
    -- תמיד long tons. ההמרה ב-normalize/units.py.
    tonnage                DOUBLE PRECISION,
    losses_tonnage         DOUBLE PRECISION,
    tonnage_unit_original  TEXT,
    cargo_mix              JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence             TEXT NOT NULL,
    source_ids             JSONB NOT NULL DEFAULT '[]'::jsonb,
    derivation             TEXT NOT NULL DEFAULT 'source',
    CONSTRAINT ck_throughput_period CHECK (period_from <= period_to),
    CONSTRAINT ck_throughput_losses CHECK (losses_tonnage IS NULL OR tonnage IS NULL
                                           OR losses_tonnage <= tonnage)
);
CREATE INDEX IF NOT EXISTS ix_throughput_route_period ON throughput (route_id, period_from);

CREATE TABLE IF NOT EXISTS convoys (
    convoy_id          TEXT PRIMARY KEY,
    route_code         TEXT NOT NULL,
    sail_date          DATE,
    arrival_date       DATE,
    ships_total        INTEGER,
    ships_lost         INTEGER,
    escort_composition TEXT,
    geom               geometry(LineString, 4326),
    source_ids         JSONB NOT NULL DEFAULT '[]'::jsonb,
    derivation         TEXT NOT NULL DEFAULT 'source',
    CONSTRAINT ck_convoy_losses CHECK (ships_lost IS NULL OR ships_total IS NULL
                                       OR ships_lost <= ships_total)
);

CREATE TABLE IF NOT EXISTS sinkings (
    id           BIGSERIAL PRIMARY KEY,
    vessel_name  TEXT,
    flag         TEXT,
    tonnage_grt  DOUBLE PRECISION,
    sunk_date    DATE,
    day_index    INTEGER,
    lon          DOUBLE PRECISION,
    lat          DOUBLE PRECISION,
    geom         geometry(Point, 4326),
    cause        TEXT,
    attacker_id  TEXT,
    convoy_id    TEXT REFERENCES convoys(convoy_id),
    cargo        TEXT,
    crew_lost    INTEGER,
    source_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
    derivation   TEXT NOT NULL DEFAULT 'source'
);
CREATE INDEX IF NOT EXISTS ix_sinkings_geom ON sinkings USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_sinkings_day  ON sinkings (day_index);

CREATE TABLE IF NOT EXISTS aid_operations (
    aid_id               TEXT PRIMARY KEY,
    agency               TEXT NOT NULL,
    aid_type             TEXT NOT NULL,
    negotiated_status    TEXT,
    geom                 geometry(LineString, 4326),
    valid_from           DATE,
    valid_to             DATE,
    day_from             INTEGER,
    day_to               INTEGER,
    tonnage              DOUBLE PRECISION,
    beneficiary_estimate INTEGER,
    source_ids           JSONB NOT NULL DEFAULT '[]'::jsonb,
    derivation           TEXT NOT NULL DEFAULT 'source',
    notes                TEXT
);

-- ── גרפים ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS graph_nodes (
    node_id   TEXT NOT NULL,
    graph     TEXT NOT NULL CHECK (graph IN ('rail','maritime','land')),
    place_id  TEXT REFERENCES places(place_id),
    lon       DOUBLE PRECISION NOT NULL,
    lat       DOUBLE PRECISION NOT NULL,
    node_kind TEXT,
    gauge_mm  INTEGER,
    PRIMARY KEY (node_id, graph)
);

CREATE TABLE IF NOT EXISTS graph_edges (
    edge_id           TEXT PRIMARY KEY,
    graph             TEXT NOT NULL CHECK (graph IN ('rail','maritime','land')),
    from_node         TEXT NOT NULL,
    to_node           TEXT NOT NULL,
    length_km         DOUBLE PRECISION NOT NULL,
    weight_hours      DOUBLE PRECISION NOT NULL,
    capacity_tons_day DOUBLE PRECISION,
    gauge_mm          INTEGER,
    importance        TEXT,
    is_damaged        BOOLEAN NOT NULL DEFAULT FALSE,
    risk_factor       DOUBLE PRECISION,
    valid_from        DATE,
    valid_to          DATE,
    day_from          INTEGER,
    day_to            INTEGER,
    geom              geometry(LineString, 4326)
);
CREATE INDEX IF NOT EXISTS ix_edges_graph_nodes ON graph_edges (graph, from_node, to_node);
CREATE INDEX IF NOT EXISTS ix_edges_geom        ON graph_edges USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_edges_importance  ON graph_edges (importance);

-- ── תור בדיקה ידנית ────────────────────────────────────────────────────
-- כל מה שהאלגוריתם לא הכריע בביטחון. פריט כאן = פריט שלא נכנס לפלט.
CREATE TABLE IF NOT EXISTS review_queue (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    payload     JSONB NOT NULL,
    score       DOUBLE PRECISION,
    resolved    BOOLEAN NOT NULL DEFAULT FALSE,
    resolution  TEXT
);
CREATE INDEX IF NOT EXISTS ix_review_kind ON review_queue (kind, resolved);

CREATE TABLE IF NOT EXISTS build_runs (
    id               BIGSERIAL PRIMARY KEY,
    started_at       TEXT NOT NULL,
    git_sha          TEXT,
    dialect          TEXT NOT NULL,
    stages           JSONB NOT NULL DEFAULT '[]'::jsonb,
    output_checksums JSONB NOT NULL DEFAULT '{}'::jsonb,
    status           TEXT NOT NULL DEFAULT 'running'
);


-- ═══════════════════════════════════════════════════════════════════════
--  תצוגות עזר לייצוא
-- ═══════════════════════════════════════════════════════════════════════

-- מחנות אם בלבד — מזין את אריחי זום 0–5 (סעיף 7.7)
CREATE OR REPLACE VIEW v_camps_parent AS
SELECT camp_id, name, camp_type, lon, lat, geom, day_from, day_to,
       deaths_min, deaths_max
FROM camps
WHERE parent_camp_id IS NULL;

-- ספירת קרבות לעיר — Place.battle_count נגזר מכאן ולא מוזן ידנית
CREATE OR REPLACE VIEW v_place_battle_counts AS
SELECT p.place_id, p.canonical_name, COUNT(bp.battle_id) AS battle_count
FROM places p
LEFT JOIN battle_places bp ON bp.place_id = p.place_id
GROUP BY p.place_id, p.canonical_name;

-- טונאז' חודשי לפי נתיב — מזין את גרף הטונאז' (FR-14)
CREATE OR REPLACE VIEW v_monthly_throughput AS
SELECT route_id,
       date_trunc('month', period_from)::date AS month,
       SUM(tonnage)        AS tonnage,
       SUM(losses_tonnage) AS losses,
       CASE WHEN SUM(tonnage) > 0
            THEN SUM(losses_tonnage) / SUM(tonnage) END AS loss_rate
FROM throughput
GROUP BY route_id, date_trunc('month', period_from);
