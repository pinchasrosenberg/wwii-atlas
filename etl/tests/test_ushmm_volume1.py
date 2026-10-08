from ingest.ushmm_volume1 import (
    canonicalize_title,
    extract_aliases,
    normalize_name,
)


def test_alias_extraction():
    title = "KAUEN MAIN CAMP [AKA KAUNAS, KOVNO, KOWNO, ALSO SLOBODKA]"
    assert extract_aliases(title) == ["KAUNAS", "KOVNO", "KOWNO", "SLOBODKA"]


def test_canonical_title_drops_alias_and_class_suffix():
    assert canonicalize_title("BERGEN- BELSEN MAIN CAMP") == "BERGEN-BELSEN"
    assert canonicalize_title("AUSCHWITZ SUBCAMP SYSTEM") == "AUSCHWITZ"


def test_name_normalization_is_diacritic_and_punctuation_tolerant():
    assert normalize_name("Kraków–Płaszów") == "krakow płaszow"
