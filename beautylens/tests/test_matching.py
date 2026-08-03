"""
Unit tests for src.api.matching's pure scoring/labeling/reasoning functions.
Uses SimpleNamespace stand-ins for ShadeProduct/UserProfile since these
functions only read plain attributes -- no DB session needed.
"""
from types import SimpleNamespace

import pytest

from src.api import matching


def make_shade(**overrides):
    defaults = dict(
        id=1, brand="TestBrand", product_line="Test Line", shade_name="10",
        category="foundation", depth_category="medium", undertone_category="neutral",
        lab_l=58.0, lab_a=7.0, lab_b=11.0, finish="natural", coverage="medium",
        skin_types="combination", price=20.0, currency="USD",
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def make_profile(**overrides):
    defaults = dict(
        skin_type="uncertain", coverage_preference="uncertain",
        finish_preference="uncertain", budget_max=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# -- delta_e_cie76 / undertone_distance --------------------------------------

def test_delta_e_zero_for_identical_lab():
    lab = {"l": 58.0, "a": 7.0, "b": 11.0}
    assert matching.delta_e_cie76(lab, lab) == 0.0


def test_delta_e_increases_with_distance():
    base = {"l": 58.0, "a": 7.0, "b": 11.0}
    near = {"l": 59.0, "a": 7.0, "b": 11.0}
    far = {"l": 70.0, "a": 7.0, "b": 11.0}
    assert matching.delta_e_cie76(base, near) < matching.delta_e_cie76(base, far)


def test_undertone_distance_same_is_zero():
    assert matching.undertone_distance("warm", "warm") == 0.0


def test_undertone_distance_opposite_ends_further_than_adjacent():
    assert matching.undertone_distance("cool", "warm") > matching.undertone_distance("cool", "neutral")
    assert matching.undertone_distance("cool", "warm") > matching.undertone_distance("neutral", "warm")


def test_undertone_distance_symmetric():
    assert matching.undertone_distance("cool", "olive") == matching.undertone_distance("olive", "cool")


# -- score_shade ---------------------------------------------------------------

def test_score_shade_penalizes_undertone_mismatch():
    profile = make_profile()
    scan_lab = {"l": 58.0, "a": 7.0, "b": 11.0}  # exactly matches "neutral" shade below
    matching_shade = make_shade(undertone_category="neutral")
    mismatched_shade = make_shade(undertone_category="cool")

    dist_match, _ = matching.score_shade(matching_shade, scan_lab, "neutral", profile)
    dist_mismatch, _ = matching.score_shade(mismatched_shade, scan_lab, "neutral", profile)

    assert dist_match < dist_mismatch


def test_score_shade_penalizes_over_budget():
    profile = make_profile(budget_max=15.0)
    scan_lab = {"l": 58.0, "a": 7.0, "b": 11.0}
    cheap = make_shade(price=10.0)
    expensive = make_shade(price=50.0)

    dist_cheap, _ = matching.score_shade(cheap, scan_lab, "neutral", profile)
    dist_expensive, _ = matching.score_shade(expensive, scan_lab, "neutral", profile)

    assert dist_cheap < dist_expensive


def test_score_shade_ignores_preferences_when_uncertain():
    profile = make_profile()  # everything "uncertain"/None
    scan_lab = {"l": 58.0, "a": 7.0, "b": 11.0}
    shade_a = make_shade(coverage="full", finish="matte", price=999.0)
    shade_b = make_shade(coverage="light", finish="radiant", price=1.0)

    dist_a, delta_e_a = matching.score_shade(shade_a, scan_lab, "neutral", profile)
    dist_b, delta_e_b = matching.score_shade(shade_b, scan_lab, "neutral", profile)

    # Same LAB/undertone -> same delta_e -> preferences (all uncertain) add
    # no penalty either way, so scores should be equal.
    assert dist_a == pytest.approx(dist_b)


# -- build_label ---------------------------------------------------------------

def test_build_label_rank_zero_is_best_overall():
    shade = make_shade()
    assert matching.build_label(0, shade, "neutral", "medium") == "Best overall match"


def test_build_label_warmer_and_cooler():
    warmer = make_shade(undertone_category="warm")
    cooler = make_shade(undertone_category="cool")
    assert matching.build_label(1, warmer, "neutral", "medium") == "Slightly warmer option"
    assert matching.build_label(1, cooler, "neutral", "medium") == "Slightly cooler option"


def test_build_label_depth_difference_when_undertone_matches():
    lighter = make_shade(undertone_category="neutral", depth_category="light")
    deeper = make_shade(undertone_category="neutral", depth_category="deep")
    assert matching.build_label(1, lighter, "neutral", "medium") == "Slightly lighter option"
    assert matching.build_label(1, deeper, "neutral", "medium") == "Slightly deeper option"


def test_build_label_olive_mismatch():
    shade = make_shade(undertone_category="olive")
    assert matching.build_label(1, shade, "warm", "medium") == "Different undertone family"


# -- build_reasons ---------------------------------------------------------------

def test_build_reasons_flags_budget_concern():
    profile = make_profile(budget_max=10.0)
    shade = make_shade(price=50.0)
    bullets, concerns = matching.build_reasons(shade, "medium", "neutral", profile)
    assert any("budget" in c for c in concerns)
    assert not any("Within your budget" in b for b in bullets)


def test_build_reasons_notes_within_budget():
    profile = make_profile(budget_max=100.0)
    shade = make_shade(price=20.0)
    bullets, concerns = matching.build_reasons(shade, "medium", "neutral", profile)
    assert any("Within your budget" in b for b in bullets)
    assert not concerns


def test_build_reasons_flags_coverage_and_finish_mismatch():
    profile = make_profile(coverage_preference="full", finish_preference="matte")
    shade = make_shade(coverage="light", finish="radiant")
    _, concerns = matching.build_reasons(shade, "medium", "neutral", profile)
    assert any("coverage" in c for c in concerns)
    assert any("finish" in c for c in concerns)


def test_build_reasons_flags_skin_type_mismatch():
    profile = make_profile(skin_type="oily")
    shade = make_shade(skin_types="dry,combination")
    _, concerns = matching.build_reasons(shade, "medium", "neutral", profile)
    assert any("Formulated primarily for" in c for c in concerns)
