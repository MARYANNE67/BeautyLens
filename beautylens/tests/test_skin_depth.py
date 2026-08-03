"""
Unit tests for the skin-depth estimation logic in src.api.skin_analysis:
classify_depth (pure function, exact boundary math), sample_skin_regions,
and estimate_skin_depth. Uses synthetic uniform-color images with a
monkeypatched face detector -- no real face photos needed.
"""
import math

import numpy as np
import pytest

from src.api import skin_analysis

IMG_SIZE = 400


def make_face_data(size: int = IMG_SIZE) -> dict:
    """All 468 landmarks placed at the image center -- fine for uniform-color
    test images where sample position doesn't affect the result."""
    landmarks = [{"x": size / 2, "y": size / 2, "z": 0.0} for _ in range(468)]
    bbox = {"x": size * 0.25, "y": size * 0.2, "width": size * 0.5, "height": size * 0.6}
    return {"landmarks": landmarks, "bbox": bbox}


class ConditionalFakeDetector:
    """Returns fixed face data, except for images matching no_face_predicate
    (used to simulate a missed detection on one of the 3 angles)."""

    def __init__(self, face_data, no_face_predicate=None):
        self.face_data = face_data
        self.no_face_predicate = no_face_predicate or (lambda img: False)

    def detect_face_mesh(self, img):
        if self.no_face_predicate(img):
            return None
        return self.face_data

    def get_facial_regions(self, face_data):
        """Empty regions: the fake's landmarks are all stacked on one point, so
        an eye polygon would be degenerate. white_balance() falls back to
        shades-of-grey, which is the path worth exercising here anyway -- these
        tests use flat synthetic colour fields with no face to speak of."""
        return {}


def use_detector(monkeypatch, no_face_predicate=None):
    detector = ConditionalFakeDetector(make_face_data(), no_face_predicate)
    monkeypatch.setattr(skin_analysis, "get_face_mesh_detector", lambda: detector)


def solid_image(value: int, size: int = IMG_SIZE) -> np.ndarray:
    return np.full((size, size, 3), value, dtype=np.uint8)


# -- classify_depth: pure function, exact boundary math ---------------------

@pytest.mark.parametrize(
    "mean_l,expected",
    [
        (100.0, "fair"),
        (78.0, "fair"),
        (74.6, "fair"),
        (74.5, "fair"),          # fair/light boundary belongs to the lighter category (>=)
        (74.4, "light"),
        (71.0, "light"),
        (68.1, "light"),
        (68.0, "light"),         # light/light-medium boundary
        (67.9, "light-medium"),
        (65.0, "light-medium"),
        (61.6, "light-medium"),
        (61.5, "light-medium"),  # light-medium/medium boundary
        (61.4, "medium"),
        (58.0, "medium"),
        (54.6, "medium"),
        (54.5, "medium"),        # medium/medium-deep boundary
        (54.4, "medium-deep"),
        (51.0, "medium-deep"),
        (47.6, "medium-deep"),
        (47.5, "medium-deep"),   # medium-deep/deep boundary
        (47.4, "deep"),
        (44.0, "deep"),
        (39.1, "deep"),
        (39.0, "deep"),          # deep/rich-deep boundary
        (38.9, "rich-deep"),
        (10.0, "rich-deep"),
    ],
)
def test_classify_depth_boundaries(mean_l, expected):
    assert skin_analysis.classify_depth(mean_l) == expected


# -- sample_skin_regions ------------------------------------------------------

def test_sample_skin_regions_returns_all_points(monkeypatch):
    use_detector(monkeypatch)
    face_data = make_face_data()
    samples = skin_analysis.sample_skin_regions(solid_image(140), face_data)

    assert set(samples.keys()) == set(skin_analysis.SKIN_SAMPLE_POINTS.keys())
    for region, lab in samples.items():
        assert lab["l"] == pytest.approx(list(samples.values())[0]["l"], abs=0.5)
        assert "a" in lab and "b" in lab


# -- estimate_skin_depth ------------------------------------------------------

def test_estimate_skin_depth_aggregates_three_images(monkeypatch):
    use_detector(monkeypatch)
    images = {"front": solid_image(140), "left": solid_image(140), "right": solid_image(140)}

    result = skin_analysis.estimate_skin_depth(images)

    assert result["success"]
    assert result["images_used"] == ["front", "left", "right"]
    assert result["images_skipped"] == []
    assert len(result["contributing_regions"]) == 15  # 5 regions x 3 images
    assert result["depth_category"] == skin_analysis.classify_depth(result["mean_lab"]["l"])


def test_estimate_skin_depth_skips_image_with_no_face(monkeypatch):
    # Sentinel: a pure-black frame simulates a failed detection on that angle.
    use_detector(monkeypatch, no_face_predicate=lambda img: bool(np.all(img == 0)))
    images = {"front": solid_image(140), "left": solid_image(0), "right": solid_image(140)}

    result = skin_analysis.estimate_skin_depth(images)

    assert result["success"]
    assert result["images_skipped"] == ["left"]
    assert set(result["images_used"]) == {"front", "right"}
    assert len(result["contributing_regions"]) == 10  # 5 regions x 2 usable images


def test_estimate_skin_depth_fails_when_no_face_anywhere(monkeypatch):
    use_detector(monkeypatch, no_face_predicate=lambda img: True)
    images = {"front": solid_image(140), "left": solid_image(140), "right": solid_image(140)}

    result = skin_analysis.estimate_skin_depth(images)

    assert not result["success"]
    assert result["depth_category"] is None
    assert set(result["images_skipped"]) == {"front", "left", "right"}


def test_lighter_image_yields_lighter_or_equal_category_rank(monkeypatch):
    """Sanity/monotonicity check: a lighter uniform image should never be
    classified as a *darker* category than a darker uniform image."""
    use_detector(monkeypatch)
    categories = [c for c, _ in skin_analysis.DEPTH_CATEGORY_MIDPOINT_L]  # lightest -> darkest

    light_result = skin_analysis.estimate_skin_depth(
        {"front": solid_image(230), "left": solid_image(230), "right": solid_image(230)}
    )
    dark_result = skin_analysis.estimate_skin_depth(
        {"front": solid_image(30), "left": solid_image(30), "right": solid_image(30)}
    )

    assert categories.index(light_result["depth_category"]) <= categories.index(dark_result["depth_category"])


# ---------------------------------------------------------------------------
# White balance
# ---------------------------------------------------------------------------

SKIN_BGR = (97, 119, 155)
WALL_BGR = (180, 180, 178)
ILLUMINANTS = {
    "tungsten": (0.78, 0.95, 1.22),
    "daylight": (1.20, 1.02, 0.88),
    "fluorescent": (1.05, 1.12, 0.92),
    "neutral": (1.0, 1.0, 1.0),
    "shade": (1.28, 1.05, 0.85),
}
FACE_BBOX = {"bbox": {"x": 90, "y": 90, "width": 120, "height": 120}}


def _scene_under(cast):
    """A skin patch on a near-neutral wall, lit by `cast`."""
    img = np.zeros((300, 300, 3), dtype=np.float64)
    img[:, :] = WALL_BGR
    img[90:210, 90:210] = SKIN_BGR
    return np.clip(img * np.array(cast), 0, 255).astype(np.uint8)


def _hue_of(lab):
    return math.degrees(math.atan2(lab[2], lab[1]))


def test_white_balance_collapses_hue_drift_across_illuminants():
    """One skin tone under five illuminants must resolve to one hue.

    This is the failure the whole capture path exists to prevent: 18 real scans
    of one person drifted 14.6 degrees of hue, enough to cross undertone
    boundaries and hand the user a different answer each time.
    """
    raw, corrected = [], []
    for cast in ILLUMINANTS.values():
        img = _scene_under(cast)
        raw.append(skin_analysis.bgr_patch_to_lab(img[120:180, 120:180]))
        balanced, _ = skin_analysis.white_balance(img, FACE_BBOX, None)
        corrected.append(skin_analysis.bgr_patch_to_lab(balanced[120:180, 120:180]))

    raw_spread = max(map(_hue_of, raw)) - min(map(_hue_of, raw))
    fixed_spread = max(map(_hue_of, corrected)) - min(map(_hue_of, corrected))

    assert raw_spread > 40.0, "test scene no longer reproduces the drift it is guarding against"
    assert fixed_spread < 10.0, f"hue still drifts {fixed_spread:.1f} deg after white balance"


def test_white_balance_is_a_noop_on_neutral_light():
    """Correcting an already-neutral scene must not invent a colour shift."""
    img = _scene_under(ILLUMINANTS["neutral"])
    before = skin_analysis.bgr_patch_to_lab(img[120:180, 120:180])
    balanced, info = skin_analysis.white_balance(img, FACE_BBOX, None)
    after = skin_analysis.bgr_patch_to_lab(balanced[120:180, 120:180])

    assert abs(_hue_of(after) - _hue_of(before)) < 5.0
    assert info["method"] in ("sclera", "shades_of_grey")


def test_white_balance_never_raises_without_a_face():
    """Degrade to the uncorrected image rather than failing a scan."""
    img = _scene_under(ILLUMINANTS["daylight"])
    out, info = skin_analysis.white_balance(img, None, None)

    assert out.shape == img.shape
    assert info["method"] in ("none", "shades_of_grey")


def test_outlier_sample_does_not_move_the_estimate():
    """A landmark that lands on hair or shadow must not drag the result."""
    clean = [(f"front:r{i}", 50.0 + (i % 3), 8.0, 14.0) for i in range(8)]
    with_outlier = clean + [("front:hair", 12.0, 8.0, 14.0)]

    kept, rejected = skin_analysis._reject_outliers(with_outlier)

    assert "front:hair" in rejected
    assert len(kept) == len(clean)


def test_outlier_rejection_keeps_genuine_variation():
    """Foreheads really are lighter than jaws -- that is signal, not noise."""
    samples = [(f"front:r{i}", l, 8.0, 14.0) for i, l in enumerate([48, 50, 52, 54, 56, 51, 49, 53])]

    kept, rejected = skin_analysis._reject_outliers(samples)

    assert rejected == []
    assert len(kept) == len(samples)
