from pathlib import Path

from ingest.loc_catalog import parse_loc_catalog


def test_downloaded_loc_catalog_has_expected_time_window():
    path = Path(__file__).parents[1] / "data" / "raw" / "loc_situation_maps" / "collection.json"
    parsed = parse_loc_catalog(path)
    summary = parsed["summary"]
    assert summary["loc_item_records"] == 416
    assert summary["individual_sheet_records"] == 415
    assert summary["aggregate_records"] == 1
    assert summary["first_sheet_date"] == "1944-06-06"
    assert summary["last_sheet_date"] == "1945-07-26"
    assert summary["coverage_warning"]
