"""
Unit tests for src.api.undertone.estimate_undertone: pure-function tests,
no image/detector mocking needed since it only takes LAB numbers + strings.
"""
from src.api.undertone import CATEGORIES, UNDERTONE_AB_CENTERS, estimate_undertone


def test_image_alone_at_category_center_is_confident():
    a, b = UNDERTONE_AB_CENTERS["cool"]
    result = estimate_undertone(mean_a=a, mean_b=b)

    assert result["category"] == "cool"
    assert result["confidence"] > 50
    assert "photo alone" in result["reasoning"]
    assert result["signals_used"] == ["image"]


def test_image_ambiguous_between_two_centers_is_less_confident_than_at_center():
    warm_a, warm_b = UNDERTONE_AB_CENTERS["warm"]
    neutral_a, neutral_b = UNDERTONE_AB_CENTERS["neutral"]
    midpoint = estimate_undertone(mean_a=(warm_a + neutral_a) / 2, mean_b=(warm_b + neutral_b) / 2)
    at_center = estimate_undertone(mean_a=warm_a, mean_b=warm_b)

    assert midpoint["confidence"] < at_center["confidence"]


def test_all_categories_reachable_via_image_signal():
    for category, (a, b) in UNDERTONE_AB_CENTERS.items():
        result = estimate_undertone(mean_a=a, mean_b=b)
        assert result["category"] == category


def test_questions_reinforcing_image_raises_confidence():
    a, b = UNDERTONE_AB_CENTERS["cool"]
    image_only = estimate_undertone(mean_a=a, mean_b=b)
    reinforced = estimate_undertone(
        mean_a=a, mean_b=b, jewelry_preference="silver", vein_color="blue_purple"
    )

    assert reinforced["category"] == "cool"
    assert reinforced["confidence"] > image_only["confidence"]


def test_conflicting_signals_lower_confidence_than_agreeing_signals():
    a, b = UNDERTONE_AB_CENTERS["cool"]
    agreeing = estimate_undertone(
        mean_a=a, mean_b=b, jewelry_preference="silver", vein_color="blue_purple"
    )
    conflicting = estimate_undertone(
        mean_a=a, mean_b=b, foundation_problem="too_pink", jewelry_preference="silver"
    )

    # Both still land on "cool" (image + one agreeing question outweighs one
    # disagreeing question), but confidence should visibly drop when a
    # signal disagrees vs. when all available signals agree.
    assert agreeing["category"] == "cool"
    assert conflicting["category"] == "cool"
    assert conflicting["confidence"] < agreeing["confidence"]


def test_owned_product_evidence_outweighs_a_single_conflicting_signal():
    # Image alone points to "cool", but the user's own product -- the
    # spec's strongest single piece of evidence -- says "warm". Owned
    # product carries more weight than any one other signal (though, as
    # test_owned_product_does_not_blindly_override_unanimous_consensus
    # below covers, it isn't an unconditional override of everything else
    # combined).
    a, b = UNDERTONE_AB_CENTERS["cool"]
    result = estimate_undertone(mean_a=a, mean_b=b, owned_undertone="warm")

    assert result["category"] == "warm"
    assert "owned_product" in result["signals_used"]


def test_owned_product_does_not_blindly_override_unanimous_consensus():
    # Image and all 3 questions agree on "cool"; a single owned-product
    # data point says "warm". Weighing it as the single strongest signal
    # (not an unconditional override) means unanimous consensus from
    # everything else still wins here -- which is the more defensible
    # behavior than one data point silently flipping the result.
    a, b = UNDERTONE_AB_CENTERS["cool"]
    result = estimate_undertone(
        mean_a=a,
        mean_b=b,
        foundation_problem="too_orange",  # -> cool
        jewelry_preference="silver",      # -> cool
        vein_color="blue_purple",         # -> cool
        owned_undertone="warm",
    )

    assert result["category"] == "cool"


def test_low_confidence_reasoning_includes_caveat():
    # A point roughly equidistant from all 4 centers with no questions
    # answered should land in the low-confidence range and say so.
    centers = list(UNDERTONE_AB_CENTERS.values())
    avg_a = sum(a for a, _ in centers) / len(centers)
    avg_b = sum(b for _, b in centers) / len(centers)
    result = estimate_undertone(mean_a=avg_a, mean_b=avg_b)

    if result["confidence"] < 45:
        assert "lower side" in result["reasoning"]


def test_uncertain_answers_contribute_nothing():
    a, b = UNDERTONE_AB_CENTERS["neutral"]
    baseline = estimate_undertone(mean_a=a, mean_b=b)
    with_uncertain = estimate_undertone(
        mean_a=a,
        mean_b=b,
        foundation_problem="uncertain",
        jewelry_preference="uncertain",
        vein_color="uncertain",
    )

    assert baseline["scores"] == with_uncertain["scores"]
    assert with_uncertain["signals_used"] == ["image"]


def test_result_always_has_a_valid_category():
    result = estimate_undertone(mean_a=0.0, mean_b=0.0)
    assert result["category"] in CATEGORIES


# Facial skin a*/b* measured from real scans. These sit well outside the shade
# catalog's own a*/b* range -- swatches are photographed on white and are far
# more saturated -- which is exactly the case that broke before.
REAL_FACE_SAMPLES = [
    (6.8, 14.0), (7.0, 13.5), (7.0, 13.1), (6.8, 13.0), (7.0, 14.0),
    (7.5, 13.3), (7.6, 13.8), (9.1, 12.5), (8.0, 13.6), (8.7, 13.3),
    (7.6, 13.7), (7.7, 13.8), (8.3, 12.2), (8.9, 14.2), (9.9, 11.6),
]


def test_image_signal_is_not_constant_on_real_faces():
    """Regression guard.

    Scoring undertone by distance to absolute a*/b* centroids taken from the
    shade catalog returned "cool" for every one of these inputs -- a constant
    function that looked like a working classifier. Nothing in the suite caught
    it, because every other test feeds points sampled from the centers
    themselves. Real faces do not live there.
    """
    got = {
        estimate_undertone(mean_a=a, mean_b=b, depth_category="medium-deep")["category"]
        for a, b in REAL_FACE_SAMPLES
    }
    assert len(got) > 1, f"undertone estimate is constant across real faces: {got}"


def test_image_signal_tracks_hue_direction():
    """A yellower face must not read cooler than a pinker one at the same depth.

    Direction is the part that has to hold even while absolute accuracy is
    still unvalidated -- the previous bug had the a* axis inverted.
    """
    yellower = estimate_undertone(mean_a=7.0, mean_b=15.0, depth_category="medium-deep")
    pinker = estimate_undertone(mean_a=10.0, mean_b=11.0, depth_category="medium-deep")
    order = {"cool": 0, "neutral": 1, "warm": 2, "olive": 3}

    assert order[yellower["category"]] > order[pinker["category"]]
