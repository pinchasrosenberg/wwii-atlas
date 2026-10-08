PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
    source_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    citation TEXT NOT NULL,
    url TEXT,
    publication_year INTEGER,
    license TEXT,
    access TEXT NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS raw_assets (
    asset_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    source_url TEXT NOT NULL,
    retrieved_at TEXT NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    media_type TEXT,
    local_path TEXT NOT NULL,
    page_count INTEGER,
    rights_snapshot_json TEXT NOT NULL,
    UNIQUE (source_id, checksum_sha256)
);

CREATE TABLE IF NOT EXISTS extraction_runs (
    run_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    asset_id TEXT NOT NULL REFERENCES raw_assets(asset_id),
    algorithm_version TEXT NOT NULL,
    extracted_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
    metrics_json TEXT NOT NULL DEFAULT '{}',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS camps (
    camp_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    entry_title TEXT NOT NULL,
    camp_type TEXT NOT NULL,
    section TEXT NOT NULL,
    parent_camp_id TEXT REFERENCES camps(camp_id),
    operator TEXT,
    lon REAL,
    lat REAL,
    valid_from TEXT,
    valid_to TEXT,
    peak_population INTEGER,
    deaths_min INTEGER,
    deaths_max INTEGER,
    victim_groups_json TEXT NOT NULL DEFAULT '[]',
    source_ids_json TEXT NOT NULL,
    derivation TEXT NOT NULL DEFAULT 'source',
    geocode_status TEXT NOT NULL DEFAULT 'pending',
    printed_page_start INTEGER NOT NULL,
    printed_page_end INTEGER,
    pdf_page_start INTEGER,
    pdf_page_end INTEGER,
    heading_confidence REAL NOT NULL,
    extraction_flags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT
);
CREATE INDEX IF NOT EXISTS ix_research_camps_parent ON camps(parent_camp_id);
CREATE INDEX IF NOT EXISTS ix_research_camps_type ON camps(camp_type);
CREATE INDEX IF NOT EXISTS ix_research_camps_pages
    ON camps(pdf_page_start, pdf_page_end);

CREATE TABLE IF NOT EXISTS camp_names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camp_id TEXT NOT NULL REFERENCES camps(camp_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    name_kind TEXT NOT NULL CHECK (name_kind IN ('canonical', 'alias', 'entry_title')),
    lang TEXT,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    source_locator TEXT NOT NULL,
    UNIQUE (camp_id, name, name_kind)
);
CREATE INDEX IF NOT EXISTS ix_research_camp_names_norm
    ON camp_names(name_normalized);

CREATE TABLE IF NOT EXISTS camp_entries (
    camp_id TEXT PRIMARY KEY REFERENCES camps(camp_id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    asset_id TEXT NOT NULL REFERENCES raw_assets(asset_id),
    printed_page_start INTEGER NOT NULL,
    printed_page_end INTEGER,
    pdf_page_start INTEGER,
    pdf_page_end INTEGER,
    entry_text_sha256 TEXT,
    extracted_character_count INTEGER NOT NULL DEFAULT 0,
    bibliography_present INTEGER NOT NULL DEFAULT 0,
    extraction_method TEXT NOT NULL,
    source_locator TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_claims (
    claim_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    value_json TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    asset_id TEXT REFERENCES raw_assets(asset_id),
    source_locator TEXT NOT NULL,
    evidence_excerpt TEXT,
    pdf_page INTEGER,
    printed_page INTEGER,
    extraction_method TEXT NOT NULL,
    independence_group TEXT NOT NULL,
    extracted_at TEXT NOT NULL,
    evidence_sha256 TEXT,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS ix_research_claims_entity
    ON source_claims(entity_type, entity_id, field_name);
CREATE INDEX IF NOT EXISTS ix_research_claims_page
    ON source_claims(source_id, pdf_page);

CREATE TABLE IF NOT EXISTS quality_assessments (
    assessment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    algorithm_version TEXT NOT NULL,
    assessed_at TEXT NOT NULL,
    quality_score INTEGER NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
    confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'insufficient')),
    publishable INTEGER NOT NULL CHECK (publishable IN (0, 1)),
    decision TEXT NOT NULL CHECK (decision IN ('publish', 'hold_rights', 'review', 'reject')),
    components_json TEXT NOT NULL,
    flags_json TEXT NOT NULL DEFAULT '[]',
    UNIQUE(entity_type, entity_id, algorithm_version)
);
CREATE INDEX IF NOT EXISTS ix_research_quality_decision
    ON quality_assessments(decision, quality_score DESC);

