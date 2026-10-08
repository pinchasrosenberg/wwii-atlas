import pytest

from export.d1_serving import ServingExportError, feature_to_row, render_seed


def feature(**overrides):
    base = {
        "type": "Feature",
        "id": "battle-1",
        "geometry": {"type": "Point", "coordinates": [12.0, 45.0]},
        "properties": {
            "id": "battle-1",
            "layer": "battles",
            "entity_kind": "battle",
            "name_he": "קרב",
            "source_ids": ["official"],
            "quality_score": 90,
            "confidence": "high",
            "publish_status": "published",
            "min_zoom": 2,
            "max_zoom": 14,
            "updated_at": "2026-07-28T00:00:00Z",
        },
    }
    base["properties"].update(overrides)
    return base


def test_low_quality_never_reaches_serving():
    with pytest.raises(ServingExportError):
        feature_to_row(feature(quality_score=69))


def test_missing_source_never_reaches_serving():
    with pytest.raises(ServingExportError):
        feature_to_row(feature(source_ids=[]))


def test_seed_is_deterministic_and_marks_dataset_ready():
    first = render_seed([feature()], "v1")
    second = render_seed([feature()], "v1")
    assert first == second
    assert "dataset_version" in first
    assert first.endswith("COMMIT;\n")
