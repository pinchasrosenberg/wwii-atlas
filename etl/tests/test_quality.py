from quality.scoring import (
    assess_record,
    reconcile_numeric_estimates,
    robust_outlier_flags,
)


def test_hard_failure_rejects_even_high_score():
    result = assess_record(
        source_dimensions=[{"provenance": 1, "authority": 1}],
        rights_statuses=["verified_public_domain"],
        source_ids=["official"],
        temporal_precision=1,
        spatial_precision=1,
        corroboration=1,
        completeness=1,
        consistency=1,
        geometry_valid=False,
    )
    assert result.score == 100
    assert result.decision == "reject"
    assert "invalid_geometry" in result.flags


def test_rights_are_separate_from_historical_quality():
    result = assess_record(
        source_dimensions=[{"provenance": 0.98, "authority": 0.98}],
        rights_statuses=["permission_required"],
        source_ids=["museum"],
        temporal_precision=0.9,
        spatial_precision=0.8,
        corroboration=0.8,
        completeness=0.9,
        consistency=0.95,
    )
    assert result.score >= 85
    assert not result.publishable
    assert result.decision == "hold_rights"


def test_mad_flags_large_outlier():
    assert robust_outlier_flags([100, 101, 99, 102, 10_000]) == [
        False, False, False, False, True
    ]


def test_reconciliation_deduplicates_shared_provenance():
    result = reconcile_numeric_estimates([
        {"value": 100, "weight": 0.9, "source_id": "a", "independence_group": "archive-x"},
        {"value": 101, "weight": 0.8, "source_id": "b", "independence_group": "archive-x"},
        {"value": 110, "weight": 0.9, "source_id": "c", "independence_group": "archive-y"},
    ])
    assert result["independent_sources"] == 2
    assert result["range_min"] == 100
    assert result["range_max"] == 110


def test_reconciliation_preserves_excluded_values():
    result = reconcile_numeric_estimates([
        {"value": 100, "weight": 1, "source_id": "a"},
        {"value": 101, "weight": 1, "source_id": "b"},
        {"value": 99, "weight": 1, "source_id": "c"},
        {"value": 50_000, "weight": 1, "source_id": "d"},
    ])
    assert [item["source_id"] for item in result["excluded"]] == ["d"]
