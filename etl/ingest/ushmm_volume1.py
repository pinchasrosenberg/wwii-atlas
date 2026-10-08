"""Deterministic extraction of camp records from USHMM Encyclopedia, Volume I.

The source PDF is copyrighted. This importer stores structured factual claims,
short evidence excerpts, hashes, and exact page provenance. It deliberately
does not store a reconstructable copy of the narrative text.

Run from ``etl``:

    python3 -m ingest.ushmm_volume1 --pdf /absolute/path/to/file.pdf
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import sqlite3
import sys
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import pdfplumber
from pypdf import PdfReader


SOURCE_ID = "ushmm_encyclopedia_camps_ghettos_v1_2009"
INDEPENDENCE_GROUP = "ushmm_encyclopedia_editorial_project"
ALGORITHM_VERSION = "ushmm-v1-structured-1.0.0"
TOC_FIRST_PDF_PAGE = 14
TOC_LAST_PDF_PAGE = 27
MAX_EVIDENCE_CHARS = 320


@dataclass
class TocEntry:
    title: str
    printed_page: int
    section: str
    camp_type: str
    canonical_name: str
    aliases: list[str]
    camp_id: str = ""
    parent_camp_id: str | None = None
    printed_page_end: int | None = None
    pdf_page: int | None = None
    heading_start: int | None = None
    heading_confidence: float = 0.0
    flags: list[str] = field(default_factory=list)


CATEGORY_RULES: dict[str, tuple[str, ...]] = {
    "death": (
        r"\b(?:killed|murdered|died|deaths?|executed|shot|hanged|gassed|"
        r"massacre|mortality|cremator|corpse|corpses)\b",
    ),
    "population": (
        r"\b(?:prisoners?|inmates?|detainees?|internees?|laborers?|workers?|"
        r"men|women|children|boys|girls|people|persons|population|capacity)\b",
        r"\b(?:numbered|held|housed|registered|imprisoned|interned)\b",
    ),
    "chronology": (
        r"\b(?:opened|established|created|founded|began|commenced|converted|"
        r"transformed|became|closed|dissolved|liquidated|evacuated|liberated|"
        r"arrived|departed|transferred|abandoned|ceased|expanded|constructed)\b",
        r"\b(?:18|19|20)\d{2}\b",
    ),
    "location": (
        r"\b(?:located|situated|stood|site|address|street|road|district|"
        r"suburb|village|town|city|kilometers?|kilometres?|miles?|north|south|"
        r"east|west|near|outside|within|territory|border|railway station)\b",
    ),
    "administration": (
        r"\b(?:commandant|commander|camp leader|guard|guards|staff|administ|"
        r"operated|controlled|authority|authorities|gestapo|police|ss-|ss |"
        r"kapo|overseer|supervisor)\b",
    ),
    "transport_evacuation": (
        r"\b(?:transport|deport|transfer|evacuat|death march|train|rail|"
        r"truck|ship|column|route|destination|arriv|depart)\w*\b",
    ),
    "forced_labor": (
        r"\b(?:forced labor|labour|work detail|worked|factory|plant|mine|"
        r"quarry|construction|armament|aircraft|munitions|workshop|company|"
        r"firm|enterprise|production|excavat|tunnel)\w*\b",
    ),
    "victim_group": (
        r"\b(?:jewish|jews|roma|sinti|polish|poles|soviet|russian|ukrainian|"
        r"french|german|czech|hungarian|dutch|belgian|italian|spanish|"
        r"political prisoners?|prisoners? of war|pows?|homosexuals?|"
        r"jehovah|women|men|children|youth)\b",
    ),
    "conditions": (
        r"\b(?:conditions|barracks?|hunger|starvation|food|ration|disease|"
        r"epidemic|typhus|sanitation|medical|hospital|infirmary|sick|torture|"
        r"punish|beaten|abuse|clothing|overcrowd|accommodation)\w*\b",
    ),
    "infrastructure": (
        r"\b(?:barracks?|fence|watchtower|gate|cremator|gas chamber|bunker|"
        r"rail spur|railway|kitchen|hospital|workshop|factory|warehouse|"
        r"building|compound|camp complex)\b",
    ),
}

GROUP_PATTERNS: dict[str, str] = {
    "Jews": r"\b(?:Jewish|Jews)\b",
    "Roma and Sinti": r"\b(?:Roma|Sinti|Gypsies)\b",
    "Poles": r"\b(?:Polish|Poles)\b",
    "Soviet prisoners": r"\b(?:Soviet|Russian)\b",
    "POWs": r"\b(?:prisoners? of war|POWs?)\b",
    "political prisoners": r"\bpolitical prisoners?\b",
    "women": r"\bwomen\b",
    "men": r"\bmen\b",
    "children/youth": r"\b(?:children|boys|girls|youth)\b",
}

MONTHS = (
    "January|February|March|April|May|June|July|August|September|October|"
    "November|December"
)
DATE_RE = re.compile(
    rf"\b(?:{MONTHS})\s+\d{{1,2}}(?:,\s*|\s+)(?:18|19|20)\d{{2}}\b|"
    rf"\b(?:{MONTHS})\s+(?:18|19|20)\d{{2}}\b|"
    r"\b(?:18|19|20)\d{2}\b",
    re.IGNORECASE,
)
NUMBER_RE = re.compile(r"(?<![\w.-])\d{1,3}(?:,\d{3})+(?!\w)|(?<![\w.-])\d{2,7}(?!\w)")


def compact_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_search(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(ch.lower() for ch in decomposed if ch.isalnum())


def normalize_name(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    letters = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    letters = letters.replace("–", "-").replace("—", "-")
    return compact_space(re.sub(r"[^\w]+", " ", letters, flags=re.UNICODE).lower())


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


def json_text(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def strip_toc_headers(line: str) -> str:
    line = re.sub(r"^\s*[XVI]+\s+CONTENTS\s*", "", line)
    line = re.sub(r"^\s*CONTENTS\s+[XVI]+\s*", "", line)
    line = re.sub(r"^\s*PART\s+[AB]\s*", "", line)
    return line.strip()


def extract_aliases(title: str) -> list[str]:
    aliases: list[str] = []
    for match in re.finditer(
        r"\[\s*(?:aka|also)\s*:?\s*(.*?)\]", title, re.IGNORECASE
    ):
        raw = compact_space(match.group(1))
        for item in re.split(r"\s*,\s*|\s+or\s+", raw, flags=re.IGNORECASE):
            item = re.sub(r"^(?:also|aka)\s+", "", item, flags=re.IGNORECASE)
            item = item.strip(" ;“”\"'")
            if item and normalize_name(item) not in {normalize_name(a) for a in aliases}:
                aliases.append(item)
    return aliases


def canonicalize_title(title: str) -> str:
    value = re.sub(
        r"\[\s*(?:aka|also).*?\]", "", title, flags=re.IGNORECASE
    )
    value = re.sub(r"\bMAIN CAMP\b", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\bSUBCAMP SYSTEM\b", "", value, flags=re.IGNORECASE)
    value = compact_space(value)
    value = re.sub(r"\s*-\s*", "-", value)
    return value.strip(" ,")


def parse_toc(reader: PdfReader) -> list[TocEntry]:
    records: list[tuple[str, int]] = []
    buffer: list[str] = []
    for page_index in range(TOC_FIRST_PDF_PAGE - 1, TOC_LAST_PDF_PAGE):
        for raw_line in (reader.pages[page_index].extract_text() or "").splitlines():
            line = strip_toc_headers(raw_line)
            if not line:
                continue
            buffer.append(line)
            match = re.search(r"\s(\d{1,4})\s*$", line)
            if not match:
                continue
            joined = compact_space(" ".join(buffer))
            row = re.match(r"(.+?)\s+(\d{1,4})$", joined)
            buffer = []
            if row:
                title = compact_space(row.group(1))
                records.append((title, int(row.group(2))))

    selected: list[tuple[str, int]] = []
    for title, page in records:
        is_camp_range = (
            17 <= page <= 179
            or 197 <= page <= 1517
            or 1527 <= page <= 1532
        )
        if is_camp_range:
            selected.append((title, page))

    entries: list[TocEntry] = []
    current_parent: str | None = None
    current_section = ""
    for title, printed_page in selected:
        upper = title.upper()
        if printed_page <= 179:
            section = "early_camps"
            camp_type = "early_camp"
            current_parent = None
        elif printed_page >= 1527:
            section = "youth_camps"
            camp_type = "youth_camp"
            current_parent = None
        else:
            section = "ss_camps"
            if "MAIN CAMP" in upper:
                camp_type = "main_camp"
            elif "SUBCAMP SYSTEM" in upper:
                camp_type = "camp_system_overview"
            elif "SS- BAUBRIGADEN" in upper or "SS-BAUBRIGADEN" in upper:
                camp_type = "construction_brigade_system"
            elif current_section == "construction_brigades":
                camp_type = "ss_construction_brigade"
            else:
                camp_type = "subcamp"

        canonical = canonicalize_title(title)
        entry = TocEntry(
            title=title,
            printed_page=printed_page,
            section=section,
            camp_type=camp_type,
            canonical_name=canonical,
            aliases=extract_aliases(title),
        )
        context_parent = current_parent or ""
        entry.camp_id = stable_id("camp", section, context_parent, title)

        if camp_type == "main_camp":
            current_parent = entry.camp_id
            current_section = "main_camp"
        elif camp_type == "construction_brigade_system":
            current_parent = entry.camp_id
            current_section = "construction_brigades"
        elif camp_type == "camp_system_overview":
            entry.parent_camp_id = current_parent
        elif camp_type in {"subcamp", "ss_construction_brigade"}:
            entry.parent_camp_id = current_parent

        entries.append(entry)

    for index, entry in enumerate(entries):
        if index + 1 < len(entries):
            next_page = entries[index + 1].printed_page
            entry.printed_page_end = max(entry.printed_page, next_page)
        else:
            entry.printed_page_end = 1534
    return entries


def normalized_with_positions(text: str) -> tuple[str, list[int]]:
    normalized: list[str] = []
    positions: list[int] = []
    for pos, char in enumerate(text):
        decomposed = unicodedata.normalize("NFKD", char)
        for part in decomposed:
            if part.isalnum():
                normalized.append(part.lower())
                positions.append(pos)
    return "".join(normalized), positions


def mask_running_headers(text: str) -> str:
    """Blank running headers/footers while preserving character offsets."""
    masked: list[str] = []
    for line in text.splitlines(keepends=True):
        compact = compact_space(line)
        letters = [char for char in compact if char.isalpha()]
        uppercase_share = (
            sum(char.isupper() for char in letters) / len(letters) if letters else 0.0
        )
        is_running_header = (
            "ENCYCLOPEDIA OF CAMPS AND GHETTOS" in compact.upper()
            or compact.upper().startswith("VOLUME I: PART")
            or (
                uppercase_share > 0.8
                and (
                    re.match(r"^\d{1,4}\s+", compact)
                    or re.search(r"\s\d{1,4}$", compact)
                )
            )
        )
        if is_running_header:
            masked.append("".join("\n" if char == "\n" else " " for char in line))
        else:
            masked.append(line)
    return "".join(masked)


def heading_variants(entry: TocEntry) -> list[str]:
    variants = [
        entry.title,
        re.sub(
            r"\[\s*(?:aka|also).*?\]", "", entry.title, flags=re.IGNORECASE
        ),
        entry.canonical_name,
        *entry.aliases,
    ]
    if entry.camp_type == "main_camp":
        variants.append(f"{entry.canonical_name} MAIN CAMP")
    unique: list[str] = []
    for value in variants:
        normalized = normalize_search(value)
        if len(normalized) >= 5 and normalized not in unique:
            unique.append(normalized)
    return sorted(unique, key=len, reverse=True)


def locate_heading(entry: TocEntry, page_texts: dict[int, str]) -> tuple[int | None, int | None, float]:
    expected = [entry.printed_page + 43, entry.printed_page + 44]
    candidates: list[int] = []
    for center in expected:
        for delta in (0, -1, 1, -2, 2, -3, 3):
            page = center + delta
            if page in page_texts and page not in candidates:
                candidates.append(page)

    variants = heading_variants(entry)
    best: tuple[int | None, int | None, float] = (None, None, 0.0)
    for page in candidates:
        text = page_texts[page]
        lines = text.splitlines(keepends=True)
        offsets: list[int] = []
        cursor = 0
        for line in lines:
            offsets.append(cursor)
            cursor += len(line)
        for line_index in range(len(lines)):
            for span in range(1, 5):
                selected = lines[line_index : line_index + span]
                if len(selected) != span:
                    continue
                candidate = compact_space(" ".join(selected))
                if not candidate:
                    continue
                if (
                    candidate.endswith((",", "-", "/", "(", "["))
                    or candidate.count("(") != candidate.count(")")
                    or candidate.count("[") != candidate.count("]")
                ):
                    continue
                letters = [char for char in candidate if char.isalpha()]
                uppercase_share = (
                    sum(char.isupper() for char in letters) / len(letters)
                    if letters
                    else 0.0
                )
                if uppercase_share < 0.72:
                    continue
                if mask_running_headers(candidate).strip() == "":
                    continue
                candidate_normalized = normalize_search(candidate)
                for variant_index, target in enumerate(variants):
                    exact = candidate_normalized == target
                    if not exact:
                        continue
                    confidence = (
                        1.0 if exact and variant_index == 0
                        else 0.94 if exact or variant_index < 3
                        else 0.88
                    )
                    if confidence > best[2]:
                        best = (page, offsets[line_index], confidence)
        if best[2] >= 1.0:
            break

    if best[0] is not None:
        return best

    # Conservative fuzzy fallback for extraction artifacts inside uppercase
    # headings (for example, a stray word crossing the column gutter).
    target = normalize_search(entry.canonical_name)
    fuzzy_best: tuple[int | None, int | None, float] = (None, None, 0.0)
    prefix_best: tuple[int | None, int | None, int] = (None, None, 0)
    for page in candidates:
        text = page_texts[page]
        lines = text.splitlines(keepends=True)
        offsets: list[int] = []
        cursor = 0
        for line in lines:
            offsets.append(cursor)
            cursor += len(line)
        for line_index in range(len(lines)):
            for span in range(1, 5):
                selected = lines[line_index : line_index + span]
                if len(selected) != span:
                    continue
                candidate = compact_space(" ".join(selected))
                letters = [char for char in candidate if char.isalpha()]
                uppercase_share = (
                    sum(char.isupper() for char in letters) / len(letters)
                    if letters
                    else 0.0
                )
                if uppercase_share < 0.62 or not mask_running_headers(candidate).strip():
                    continue
                candidate_normalized = normalize_search(candidate)
                if not candidate_normalized or not target:
                    continue
                roman_pattern = r"\b(?:VIII|VII|VI|IV|V|III|II|IX|X|I)\b"
                target_roman = re.findall(
                    roman_pattern, entry.canonical_name.upper()
                )
                candidate_roman = re.findall(roman_pattern, candidate.upper())
                if (
                    target_roman
                    and candidate_roman
                    and "".join(target_roman) != "".join(candidate_roman)
                ):
                    continue
                for variant in variants:
                    if (
                        len(candidate_normalized) >= 12
                        and variant.startswith(candidate_normalized)
                        and len(candidate_normalized) > prefix_best[2]
                    ):
                        prefix_best = (
                            page,
                            offsets[line_index],
                            len(candidate_normalized),
                        )
                ratio = max(
                    difflib.SequenceMatcher(
                        None, variant, candidate_normalized
                    ).ratio()
                    for variant in variants
                )
                if ratio >= 0.78 and ratio > fuzzy_best[2]:
                    fuzzy_best = (page, offsets[line_index], ratio)
    if fuzzy_best[0] is not None:
        return fuzzy_best[0], fuzzy_best[1], min(0.87, fuzzy_best[2])
    if prefix_best[0] is not None:
        return prefix_best[0], prefix_best[1], 0.72
    return None, None, 0.0


def strip_page_noise(text: str) -> str:
    kept: list[str] = []
    for line in text.splitlines():
        compact = compact_space(line)
        upper = compact.upper()
        if not compact:
            kept.append("")
            continue
        if upper.startswith("VOLUME I: PART"):
            continue
        if "ENCYCLOPEDIA OF CAMPS AND GHETTOS, 1933" in upper:
            continue
        if re.match(r"^\d{1,4}\s{2,}[A-Z0-9 -]{2,}$", compact):
            continue
        if re.match(r"^[A-Z0-9 -]{2,}\s{2,}\d{1,4}$", compact):
            continue
        if "COURTESY OF" in upper or upper.startswith("USHMM WS #"):
            continue
        kept.append(line)
    value = "\n".join(kept)
    value = re.sub(r"(?<=[a-z])-\s*\n\s*(?=[a-z])", "", value)
    value = re.sub(r"\s*\n\s*", " ", value)
    return compact_space(value)


def entry_text(
    entry: TocEntry,
    next_entry: TocEntry | None,
    page_texts: dict[int, str],
) -> tuple[str, list[tuple[int, str]], bool]:
    if entry.pdf_page is None:
        return "", [], False
    end_page = next_entry.pdf_page if next_entry and next_entry.pdf_page else entry.pdf_page
    if end_page < entry.pdf_page:
        end_page = entry.pdf_page

    page_slices: list[tuple[int, str]] = []
    for page in range(entry.pdf_page, min(end_page, entry.pdf_page + 30) + 1):
        text = page_texts.get(page, "")
        start = entry.heading_start or 0 if page == entry.pdf_page else 0
        end = len(text)
        if (
            next_entry
            and next_entry.pdf_page == page
            and next_entry.heading_start is not None
        ):
            end = next_entry.heading_start
        if page == entry.pdf_page and next_entry is entry:
            end = len(text)
        selected = text[start:end]
        if selected.strip():
            page_slices.append((page, selected))

    joined = "\n".join(text for _, text in page_slices)
    bibliography = re.search(r"(?m)^\s*SOURCES\b", joined)
    bibliography_present = bibliography is not None
    if bibliography:
        joined = joined[: bibliography.start()]
        trimmed: list[tuple[int, str]] = []
        remaining = len(joined)
        for page, text in page_slices:
            piece = text[:remaining]
            if piece:
                trimmed.append((page, piece))
            remaining -= len(text) + 1
            if remaining <= 0:
                break
        page_slices = trimmed
    return strip_page_noise(joined), page_slices, bibliography_present


def split_sentences(text: str) -> list[str]:
    text = compact_space(text)
    raw = re.split(r"(?<=[.!?])\s+(?=[A-ZÄÖÜÀ-Ž“‘(])", text)
    sentences: list[str] = []
    for sentence in raw:
        sentence = compact_space(sentence)
        if len(sentence) < 25:
            continue
        if len(sentence) <= 700:
            sentences.append(sentence)
            continue
        chunks = re.split(r";\s+|:\s+(?=[A-Z])", sentence)
        sentences.extend(compact_space(chunk) for chunk in chunks if len(compact_space(chunk)) >= 25)
    return sentences


def classify_sentence(sentence: str) -> list[str]:
    categories: list[str] = []
    for category, patterns in CATEGORY_RULES.items():
        if any(re.search(pattern, sentence, re.IGNORECASE) for pattern in patterns):
            categories.append(category)
    return categories


def sentence_payload(sentence: str, categories: list[str]) -> dict[str, object]:
    numbers: list[int] = []
    for token in NUMBER_RE.findall(sentence):
        try:
            number = int(token.replace(",", ""))
        except ValueError:
            continue
        if number not in numbers:
            numbers.append(number)
    dates = list(dict.fromkeys(match.group(0) for match in DATE_RE.finditer(sentence)))
    groups = [
        label
        for label, pattern in GROUP_PATTERNS.items()
        if re.search(pattern, sentence, re.IGNORECASE)
    ]
    qualifiers = [
        word
        for word in ("approximately", "about", "more than", "at least", "up to", "between")
        if re.search(rf"\b{re.escape(word)}\b", sentence, re.IGNORECASE)
    ]
    return {
        "categories": categories,
        "numbers": numbers,
        "date_expressions": dates,
        "victim_groups": groups,
        "qualifiers": qualifiers,
    }


def printed_page_for(entry: TocEntry, pdf_page: int) -> int:
    if entry.pdf_page is None:
        return entry.printed_page
    return max(entry.printed_page, entry.printed_page + (pdf_page - entry.pdf_page))


def page_for_sentence(
    sentence: str,
    entry: TocEntry,
    page_slices: list[tuple[int, str]],
) -> int | None:
    needle = normalize_search(sentence[:120])
    if not needle:
        return entry.pdf_page
    for page, text in page_slices:
        if needle[:40] in normalize_search(text):
            return page
    return entry.pdf_page


def ensure_schema(connection: sqlite3.Connection, schema_path: Path) -> None:
    connection.executescript(schema_path.read_text(encoding="utf-8"))


def upsert_source(
    connection: sqlite3.Connection,
    pdf_path: Path,
    checksum: str,
    page_count: int,
    extracted_at: str,
) -> tuple[str, str]:
    asset_id = f"asset_{checksum[:24]}"
    citation = (
        "Geoffrey P. Megargee, ed., Encyclopedia of Camps and Ghettos, "
        "1933–1945, Volume I (USHMM / Indiana University Press, 2009)"
    )
    connection.execute(
        """
        INSERT INTO sources(
            source_id, name, citation, url, publication_year, license, access, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET
            name=excluded.name, citation=excluded.citation, url=excluded.url,
            publication_year=excluded.publication_year, license=excluded.license,
            access=excluded.access, notes=excluded.notes
        """,
        (
            SOURCE_ID,
            "USHMM Encyclopedia of Camps and Ghettos, Volume I",
            citation,
            "https://muse.jhu.edu/resource/6",
            2009,
            "All rights reserved; structured research extraction only",
            "manual",
            "Scholarly secondary reference. Publication rights are not cleared for atlas serving.",
        ),
    )
    connection.execute(
        """
        INSERT INTO raw_assets(
            asset_id, source_id, source_url, retrieved_at, checksum_sha256,
            byte_size, media_type, local_path, page_count, rights_snapshot_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(asset_id) DO UPDATE SET
            local_path=excluded.local_path, byte_size=excluded.byte_size,
            page_count=excluded.page_count, rights_snapshot_json=excluded.rights_snapshot_json
        """,
        (
            asset_id,
            SOURCE_ID,
            f"file://{pdf_path}",
            extracted_at,
            checksum,
            pdf_path.stat().st_size,
            "application/pdf",
            str(pdf_path),
            page_count,
            json_text(
                {
                    "copyright": "2009 United States Holocaust Memorial Museum",
                    "publisher": "Indiana University Press",
                    "status": "all_rights_reserved",
                    "use": "local structured research extraction",
                }
            ),
        ),
    )
    run_id = stable_id("run", SOURCE_ID, checksum, ALGORITHM_VERSION)
    connection.execute(
        """
        INSERT INTO extraction_runs(
            run_id, source_id, asset_id, algorithm_version, extracted_at, status
        ) VALUES (?, ?, ?, ?, ?, 'running')
        ON CONFLICT(run_id) DO UPDATE SET
            extracted_at=excluded.extracted_at, status='running', metrics_json='{}'
        """,
        (run_id, SOURCE_ID, asset_id, ALGORITHM_VERSION, extracted_at),
    )
    return asset_id, run_id


def clear_previous_extraction(connection: sqlite3.Connection) -> None:
    camp_ids = [
        row[0]
        for row in connection.execute(
            "SELECT camp_id FROM camps WHERE source_ids_json LIKE ?", (f"%{SOURCE_ID}%",)
        )
    ]
    if not camp_ids:
        return
    placeholders = ",".join("?" for _ in camp_ids)
    connection.execute(
        f"DELETE FROM quality_assessments WHERE entity_type='camp' AND entity_id IN ({placeholders})",
        camp_ids,
    )
    connection.execute(
        f"DELETE FROM source_claims WHERE entity_type='camp' AND entity_id IN ({placeholders})",
        camp_ids,
    )
    connection.execute(f"DELETE FROM camp_entries WHERE camp_id IN ({placeholders})", camp_ids)
    connection.execute(f"DELETE FROM camp_names WHERE camp_id IN ({placeholders})", camp_ids)
    connection.execute(f"DELETE FROM camps WHERE camp_id IN ({placeholders})", camp_ids)


def insert_identity_claim(
    connection: sqlite3.Connection,
    *,
    entry: TocEntry,
    asset_id: str,
    extracted_at: str,
    field_name: str,
    value: object,
    evidence: str,
) -> None:
    locator = f"PDF p. {entry.pdf_page or '?'}; printed p. {entry.printed_page}"
    claim_id = stable_id(
        "claim", entry.camp_id, field_name, json_text(value), locator
    )
    connection.execute(
        """
        INSERT INTO source_claims(
            claim_id, entity_type, entity_id, field_name, value_json, source_id,
            asset_id, source_locator, evidence_excerpt, pdf_page, printed_page,
            extraction_method, independence_group, extracted_at, evidence_sha256
        ) VALUES (?, 'camp', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'structured', ?, ?, ?)
        """,
        (
            claim_id,
            entry.camp_id,
            field_name,
            json_text(value),
            SOURCE_ID,
            asset_id,
            locator,
            compact_space(evidence)[:MAX_EVIDENCE_CHARS],
            entry.pdf_page,
            entry.printed_page,
            INDEPENDENCE_GROUP,
            extracted_at,
            hashlib.sha256(evidence.encode("utf-8")).hexdigest(),
        ),
    )


def insert_entry(
    connection: sqlite3.Connection,
    *,
    entry: TocEntry,
    next_entry: TocEntry | None,
    page_texts: dict[int, str],
    asset_id: str,
    extracted_at: str,
) -> tuple[int, Counter[str], list[str]]:
    narrative, page_slices, bibliography_present = entry_text(
        entry, next_entry, page_texts
    )

    flags = list(entry.flags)
    if entry.pdf_page is None:
        flags.append("heading_not_found")
    if entry.parent_camp_id is None and entry.camp_type in {
        "subcamp", "ss_construction_brigade"
    }:
        flags.append("parent_not_resolved")

    pdf_end = next_entry.pdf_page if next_entry and next_entry.pdf_page else entry.pdf_page
    if pdf_end is not None and entry.pdf_page is not None:
        pdf_end = max(entry.pdf_page, pdf_end)

    connection.execute(
        """
        INSERT INTO camps(
            camp_id, name, entry_title, camp_type, section, parent_camp_id,
            source_ids_json, derivation, geocode_status, printed_page_start,
            printed_page_end, pdf_page_start, pdf_page_end, heading_confidence,
            extraction_flags_json, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'source', 'pending', ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            entry.camp_id,
            entry.canonical_name,
            entry.title,
            entry.camp_type,
            entry.section,
            entry.parent_camp_id,
            json_text([SOURCE_ID]),
            entry.printed_page,
            entry.printed_page_end,
            entry.pdf_page,
            pdf_end,
            entry.heading_confidence,
            json_text(flags),
            "Coordinates intentionally unset pending independent geocoding and review.",
        ),
    )

    locator = f"PDF p. {entry.pdf_page or '?'}; printed p. {entry.printed_page}"
    for name, kind in [
        (entry.canonical_name, "canonical"),
        (entry.title, "entry_title"),
        *((alias, "alias") for alias in entry.aliases),
    ]:
        connection.execute(
            """
            INSERT OR IGNORE INTO camp_names(
                camp_id, name, name_normalized, name_kind, lang, source_id, source_locator
            ) VALUES (?, ?, ?, ?, NULL, ?, ?)
            """,
            (
                entry.camp_id,
                name,
                normalize_name(name),
                kind,
                SOURCE_ID,
                locator,
            ),
        )

    narrative_hash = hashlib.sha256(narrative.encode("utf-8")).hexdigest() if narrative else None
    connection.execute(
        """
        INSERT INTO camp_entries(
            camp_id, source_id, asset_id, printed_page_start, printed_page_end,
            pdf_page_start, pdf_page_end, entry_text_sha256,
            extracted_character_count, bibliography_present, extraction_method,
            source_locator
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'structured_text', ?)
        """,
        (
            entry.camp_id,
            SOURCE_ID,
            asset_id,
            entry.printed_page,
            entry.printed_page_end,
            entry.pdf_page,
            pdf_end,
            narrative_hash,
            len(narrative),
            int(bibliography_present),
            locator,
        ),
    )

    insert_identity_claim(
        connection,
        entry=entry,
        asset_id=asset_id,
        extracted_at=extracted_at,
        field_name="identity",
        value={
            "name": entry.canonical_name,
            "entry_title": entry.title,
            "camp_type": entry.camp_type,
        },
        evidence=entry.title,
    )
    if entry.parent_camp_id:
        insert_identity_claim(
            connection,
            entry=entry,
            asset_id=asset_id,
            extracted_at=extracted_at,
            field_name="parent_camp_id",
            value={"parent_camp_id": entry.parent_camp_id},
            evidence=entry.title,
        )
    for alias in entry.aliases:
        insert_identity_claim(
            connection,
            entry=entry,
            asset_id=asset_id,
            extracted_at=extracted_at,
            field_name="alias",
            value={"alias": alias},
            evidence=entry.title,
        )

    category_counts: Counter[str] = Counter()
    fact_claims = 0
    seen_evidence: set[tuple[str, int | None]] = set()
    for sentence in split_sentences(narrative):
        categories = classify_sentence(sentence)
        if not categories:
            continue
        pdf_page = page_for_sentence(sentence, entry, page_slices)
        evidence = compact_space(sentence)[:MAX_EVIDENCE_CHARS]
        evidence_key = (hashlib.sha256(evidence.encode("utf-8")).hexdigest(), pdf_page)
        if evidence_key in seen_evidence:
            continue
        seen_evidence.add(evidence_key)
        payload = sentence_payload(sentence, categories)
        printed_page = printed_page_for(entry, pdf_page) if pdf_page else entry.printed_page
        source_locator = f"PDF p. {pdf_page or '?'}; printed p. {printed_page}"
        for category in categories:
            value = dict(payload)
            value["primary_category"] = category
            claim_id = stable_id(
                "claim", entry.camp_id, category, evidence_key[0], str(pdf_page)
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO source_claims(
                    claim_id, entity_type, entity_id, field_name, value_json,
                    source_id, asset_id, source_locator, evidence_excerpt,
                    pdf_page, printed_page, extraction_method, independence_group,
                    extracted_at, evidence_sha256
                ) VALUES (?, 'camp', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'structured',
                          ?, ?, ?)
                """,
                (
                    claim_id,
                    entry.camp_id,
                    category,
                    json_text(value),
                    SOURCE_ID,
                    asset_id,
                    source_locator,
                    evidence,
                    pdf_page,
                    printed_page,
                    INDEPENDENCE_GROUP,
                    extracted_at,
                    evidence_key[0],
                ),
            )
            fact_claims += 1
            category_counts[category] += 1

    if fact_claims == 0:
        flags.append("no_mappable_facts_extracted")
        connection.execute(
            "UPDATE camps SET extraction_flags_json=? WHERE camp_id=?",
            (json_text(flags), entry.camp_id),
        )

    page_score = 1.0 if entry.pdf_page else 0.0
    fact_score = min(1.0, fact_claims / 8)
    hierarchy_score = (
        1.0
        if entry.camp_type not in {"subcamp", "ss_construction_brigade"}
        or entry.parent_camp_id
        else 0.0
    )
    score = round(
        45 * entry.heading_confidence
        + 30 * fact_score
        + 15 * page_score
        + 10 * hierarchy_score
    )
    if entry.heading_confidence >= 0.94 and fact_claims >= 4:
        confidence = "high"
    elif entry.pdf_page and fact_claims:
        confidence = "medium"
    elif entry.pdf_page:
        confidence = "low"
    else:
        confidence = "insufficient"
    decision = "hold_rights" if confidence in {"high", "medium"} else "review"
    qa_flags = ["rights_restricted", "geocode_pending", *flags]
    connection.execute(
        """
        INSERT INTO quality_assessments(
            entity_type, entity_id, algorithm_version, assessed_at,
            quality_score, confidence, publishable, decision,
            components_json, flags_json
        ) VALUES ('camp', ?, ?, ?, ?, ?, 0, ?, ?, ?)
        """,
        (
            entry.camp_id,
            ALGORITHM_VERSION,
            extracted_at,
            score,
            confidence,
            decision,
            json_text(
                {
                    "heading": entry.heading_confidence,
                    "page_linkage": page_score,
                    "facts": fact_score,
                    "hierarchy": hierarchy_score,
                }
            ),
            json_text(list(dict.fromkeys(qa_flags))),
        ),
    )
    return fact_claims, category_counts, flags


def validate_database(connection: sqlite3.Connection) -> dict[str, object]:
    metrics: dict[str, object] = {}
    metrics["camps"] = connection.execute("SELECT COUNT(*) FROM camps").fetchone()[0]
    metrics["claims"] = connection.execute("SELECT COUNT(*) FROM source_claims").fetchone()[0]
    metrics["unique_fact_excerpts"] = connection.execute(
        """
        SELECT COUNT(DISTINCT evidence_sha256 || ':' || COALESCE(pdf_page, -1))
        FROM source_claims
        WHERE field_name NOT IN ('identity', 'alias', 'parent_camp_id')
        """
    ).fetchone()[0]
    metrics["aliases"] = connection.execute(
        "SELECT COUNT(*) FROM camp_names WHERE name_kind='alias'"
    ).fetchone()[0]
    metrics["unlocated_headings"] = connection.execute(
        "SELECT COUNT(*) FROM camps WHERE pdf_page_start IS NULL"
    ).fetchone()[0]
    metrics["geocoded"] = connection.execute(
        "SELECT COUNT(*) FROM camps WHERE lon IS NOT NULL AND lat IS NOT NULL"
    ).fetchone()[0]
    metrics["publishable"] = connection.execute(
        "SELECT COUNT(*) FROM quality_assessments WHERE publishable=1"
    ).fetchone()[0]
    metrics["missing_parent"] = connection.execute(
        """
        SELECT COUNT(*) FROM camps
        WHERE camp_type IN ('subcamp', 'ss_construction_brigade')
          AND parent_camp_id IS NULL
        """
    ).fetchone()[0]
    metrics["zero_fact_entries"] = connection.execute(
        """
        SELECT COUNT(*) FROM camps c
        WHERE NOT EXISTS (
            SELECT 1 FROM source_claims sc
            WHERE sc.entity_id=c.camp_id
              AND sc.field_name NOT IN ('identity', 'alias', 'parent_camp_id')
        )
        """
    ).fetchone()[0]
    metrics["camp_types"] = dict(
        connection.execute(
            "SELECT camp_type, COUNT(*) FROM camps GROUP BY camp_type ORDER BY camp_type"
        ).fetchall()
    )
    metrics["claim_categories"] = dict(
        connection.execute(
            """
            SELECT field_name, COUNT(*) FROM source_claims
            WHERE field_name NOT IN ('identity', 'alias', 'parent_camp_id')
            GROUP BY field_name ORDER BY field_name
            """
        ).fetchall()
    )
    metrics["quality_decisions"] = dict(
        connection.execute(
            "SELECT decision, COUNT(*) FROM quality_assessments GROUP BY decision"
        ).fetchall()
    )
    metrics["quality_confidence"] = dict(
        connection.execute(
            "SELECT confidence, COUNT(*) FROM quality_assessments GROUP BY confidence"
        ).fetchall()
    )

    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    foreign_keys = connection.execute("PRAGMA foreign_key_check").fetchall()
    metrics["integrity_check"] = integrity
    metrics["foreign_key_violations"] = len(foreign_keys)
    if integrity != "ok" or foreign_keys:
        raise RuntimeError(
            f"Database integrity failed: integrity={integrity}, foreign_keys={foreign_keys[:5]}"
        )
    return metrics


def write_report(
    report_path: Path,
    *,
    pdf_path: Path,
    db_path: Path,
    checksum: str,
    page_count: int,
    metrics: dict[str, object],
    samples: list[dict[str, object]],
) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "source": {
            "source_id": SOURCE_ID,
            "pdf": str(pdf_path),
            "sha256": checksum,
            "page_count": page_count,
            "rights": "all_rights_reserved",
        },
        "output": {"sqlite_database": str(db_path)},
        "algorithm_version": ALGORITHM_VERSION,
        "metrics": metrics,
        "sample_records": samples,
        "scientific_status": {
            "source_quality": "scholarly_secondary_reference",
            "coordinates": "not_extracted; independent geocoding required",
            "cross_source_corroboration": "not_yet_performed",
            "serving_status": "blocked",
            "reason": "rights clearance, geocoding, and independent corroboration pending",
        },
    }
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def deterministic_timestamp(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).replace(
        microsecond=0
    ).isoformat()


def _words_to_lines(words: list[dict[str, object]]) -> str:
    if not words:
        return ""
    ordered = sorted(words, key=lambda word: (float(word["top"]), float(word["x0"])))
    lines: list[list[dict[str, object]]] = []
    line_tops: list[float] = []
    for word in ordered:
        top = float(word["top"])
        if not lines or abs(top - line_tops[-1]) > 3.0:
            lines.append([word])
            line_tops.append(top)
        else:
            lines[-1].append(word)
            line_tops[-1] = (line_tops[-1] + top) / 2
    return "\n".join(
        " ".join(str(word["text"]) for word in sorted(line, key=lambda item: float(item["x0"])))
        for line in lines
    )


def extract_two_column_text(page: pdfplumber.page.Page) -> str:
    """Read the encyclopedia's two columns in visual order without gutter bleed."""
    midpoint = page.width / 2
    words = page.extract_words(
        x_tolerance=2,
        y_tolerance=3,
        keep_blank_chars=False,
        use_text_flow=False,
    )
    left: list[dict[str, object]] = []
    right: list[dict[str, object]] = []
    for word in words:
        center = (float(word["x0"]) + float(word["x1"])) / 2
        (left if center < midpoint else right).append(word)
    return f"{_words_to_lines(left)}\n{_words_to_lines(right)}"


def run(pdf_path: Path, db_path: Path, report_path: Path, schema_path: Path) -> dict[str, object]:
    if not pdf_path.is_file():
        raise FileNotFoundError(pdf_path)
    checksum = sha256_file(pdf_path)
    extracted_at = deterministic_timestamp(pdf_path)
    reader = PdfReader(str(pdf_path))
    entries = parse_toc(reader)
    if len(entries) < 500:
        raise RuntimeError(f"TOC extraction produced only {len(entries)} camp entries")

    min_expected = min(entry.printed_page for entry in entries) + 40
    max_expected = max(entry.printed_page for entry in entries) + 47
    max_expected = min(max_expected, len(reader.pages))
    with pdfplumber.open(str(pdf_path)) as layout_pdf:
        page_texts = {
            page: extract_two_column_text(layout_pdf.pages[page - 1])
            for page in range(max(1, min_expected), max_expected + 1)
        }

    for entry in entries:
        page, start, confidence = locate_heading(entry, page_texts)
        entry.pdf_page = page
        entry.heading_start = start
        entry.heading_confidence = confidence
        if page is None:
            entry.flags.append("heading_not_found")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        ensure_schema(connection, schema_path)
        connection.execute("BEGIN")
        asset_id, run_id = upsert_source(
            connection, pdf_path, checksum, len(reader.pages), extracted_at
        )
        clear_previous_extraction(connection)

        category_totals: Counter[str] = Counter()
        extracted_facts = 0
        all_flags: Counter[str] = Counter()
        for index, entry in enumerate(entries):
            next_entry = entries[index + 1] if index + 1 < len(entries) else None
            fact_count, categories, flags = insert_entry(
                connection,
                entry=entry,
                next_entry=next_entry,
                page_texts=page_texts,
                asset_id=asset_id,
                extracted_at=extracted_at,
            )
            extracted_facts += fact_count
            category_totals.update(categories)
            all_flags.update(flags)

        metrics = validate_database(connection)
        metrics["toc_entries"] = len(entries)
        metrics["fact_claims"] = extracted_facts
        metrics["extraction_flags"] = dict(all_flags)
        metrics["checksum_sha256"] = checksum
        connection.execute(
            """
            UPDATE extraction_runs
            SET status='complete', metrics_json=?
            WHERE run_id=?
            """,
            (json_text(metrics), run_id),
        )
        connection.commit()

        samples = [
            {
                "camp_id": row[0],
                "name": row[1],
                "camp_type": row[2],
                "parent_camp_id": row[3],
                "pdf_page": row[4],
                "printed_page": row[5],
                "quality_score": row[6],
            }
            for row in connection.execute(
                """
                SELECT c.camp_id, c.name, c.camp_type, c.parent_camp_id,
                       c.pdf_page_start, c.printed_page_start, qa.quality_score
                FROM camps c
                JOIN quality_assessments qa
                  ON qa.entity_type='camp' AND qa.entity_id=c.camp_id
                WHERE lower(c.name) IN ('ahrensbök-holstendorf', 'dachau',
                                        'krakau-plaszow',
                                        'youth protection camp moringen')
                ORDER BY c.printed_page_start
                """
            ).fetchall()
        ]
        write_report(
            report_path,
            pdf_path=pdf_path,
            db_path=db_path,
            checksum=checksum,
            page_count=len(reader.pages),
            metrics=metrics,
            samples=samples,
        )
        return metrics
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def build_parser() -> argparse.ArgumentParser:
    etl_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="Extract structured camp claims from USHMM Encyclopedia Volume I"
    )
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument(
        "--db", type=Path, default=etl_root / "data/work/atlas_research.sqlite"
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=etl_root / "data/out/ushmm_volume1_extraction_report.json",
    )
    parser.add_argument(
        "--schema", type=Path, default=etl_root / "db/research_sqlite.sql"
    )
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    metrics = run(
        args.pdf.expanduser().resolve(),
        args.db.expanduser().resolve(),
        args.report.expanduser().resolve(),
        args.schema.expanduser().resolve(),
    )
    print(json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
