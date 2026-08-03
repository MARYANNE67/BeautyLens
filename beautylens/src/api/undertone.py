"""
Rule-based multi-signal undertone estimation: combines the skin scan's LAB
color signal with a short comparison questionnaire (and, when available,
evidence from a product the user already owns and likes). Deliberately not
ML-trained -- there's no labeled undertone dataset to train against, and a
transparent, tunable rule set is more honest than a black-box guess given
how easily lighting/camera settings can distort a single selfie's color.
"""
import math
from typing import Optional

CATEGORIES = ["cool", "neutral", "warm", "olive"]

# Measured a*/b* centroids of the real shade catalog, per undertone category.
# Regenerate after any catalog rebuild with:
#     python data/build_catalog_from_shades.py --emit-anchors
#
# These replace hand-picked centers that were carried over from the old
# synthetic catalog. They were wrong on both scale and direction: they placed
# cool at b* 6.0 when real cool shades average b* 20.1, and they had warm skin
# at a HIGHER a* than cool, when the measured catalog is the other way round.
# The practical effect was that 8 of 9 skin depths estimated "warm".
UNDERTONE_AB_CENTERS = {
    "warm": (11.9, 27.0),
    "neutral": (13.9, 25.2),
    "cool": (15.1, 20.1),
    "olive": (8.3, 25.9),
}

# The same centroids split by depth band -- because b* climbs with melanin,
# a single global center set mostly re-measures depth and calls the answer
# undertone. Across the catalog b* moves ~10 units between depth bands but
# only ~5 units between undertones *within* a band, so the depth signal
# swamps the undertone signal unless it is held constant. Comparing a face
# against the centers for its own depth band is the same correction
# build_catalog_from_shades.py applies when it assigns undertone by hue
# percentile within a band.
UNDERTONE_AB_CENTERS_BY_DEPTH = {
    "fair": {"warm": (8.2, 23.7), "neutral": (10.0, 21.9), "cool": (12.0, 18.1), "olive": (4.6, 21.2)},
    "light": {"warm": (12.3, 29.7), "neutral": (13.9, 27.1), "cool": (15.6, 22.9), "olive": (8.4, 29.0)},
    "light-medium": {"warm": (14.3, 31.4), "neutral": (15.8, 28.7), "cool": (17.8, 24.6), "olive": (11.0, 30.9)},
    "medium": {"warm": (15.5, 32.0), "neutral": (17.4, 29.8), "cool": (18.6, 24.0), "olive": (10.7, 30.1)},
    "medium-deep": {"warm": (17.1, 31.3), "neutral": (19.5, 28.9), "cool": (18.6, 19.6), "olive": (13.3, 31.2)},
    "deep": {"warm": (16.3, 27.1), "neutral": (20.0, 27.7), "cool": (19.5, 19.8), "olive": (13.3, 28.6)},
    "rich-deep": {"warm": (13.7, 20.5), "neutral": (17.7, 21.1), "cool": (15.9, 14.1), "olive": (12.4, 24.4)},
}

# Owned-product evidence is weighted highest (per the spec: "the strongest
# evidence may be a product the user already owns"). The image signal is
# next -- it's an objective measurement, but only of one moment's lighting.
# Each questionnaire answer carries less weight individually since any one
# of them is a weak, indirect proxy.
# Lowered from 3.0. The image signal is measurably unstable: across 16 scans of
# one person its hue angle moved 14+ degrees, enough to cross category
# boundaries, while that person's questionnaire answers are the same every time.
# Until capture is white-balanced and stabilised, a single uncalibrated frame
# should not be able to outvote two consistent answers about the same face.
IMAGE_SIGNAL_WEIGHT = 2.0
QUESTION_WEIGHT = 1.5
OWNED_PRODUCT_WEIGHT = 5.0

FOUNDATION_PROBLEM_MAP = {
    "too_orange": "cool",   # foundation reads warmer than skin -> skin is the cooler one
    "too_pink": "warm",     # foundation reads cooler/pinker than skin -> skin is the warmer one
    "ashy_grey": "olive",   # classic olive complaint: standard warm/cool shades read ashy
}
JEWELRY_MAP = {"gold": "warm", "silver": "cool", "both": "neutral"}
VEIN_MAP = {"green": "warm", "blue_purple": "cool", "mixture": "neutral"}

IMAGE_DESCRIPTIONS = {
    "warm": "Your photos appear to have a golden, yellow quality.",
    "cool": "Your photos appear to have a pink or rosy quality.",
    "neutral": "Your photos appear fairly balanced between warm and cool.",
    "olive": "Your photos appear to have a muted, olive quality.",
}


def _hue(a: float, b: float) -> float:
    """CIELAB hue angle in degrees -- the same quantity
    build_catalog_from_shades.py ranks shades by when it assigns undertone."""
    return math.degrees(math.atan2(b, a))


def _hue_centers(centers: dict) -> dict:
    return {cat: _hue(a, b) for cat, (a, b) in centers.items()}


def _image_signal(mean_a: float, mean_b: float, depth_category: Optional[str] = None) -> dict:
    """Inverse-distance-weighted score across all 4 categories, scored on HUE
    ANGLE rather than absolute a*/b* position.

    Why hue and not position: the catalog's a*/b* come from foundation swatches
    photographed against white, while a scan's a*/b* come from facial skin under
    room light. Swatches are markedly more saturated -- measured across this
    catalog and 16 real scans, chroma differs by roughly 14 units while hue
    differs by about 3 degrees. So the two live at nearly the same ANGLE but
    very different RADIUS.

    Nearest-centroid on raw position therefore fails badly: a real face sits
    outside the swatch cluster entirely, and the nearest centroid is then always
    whichever one is closest to the cluster edge -- it returned "cool" for 16 of
    16 real scans regardless of input, a constant rather than a classifier.
    Projecting onto hue cancels the chroma gap and restores the signal.

    Scored against the centers for the face's own depth band when known, so the
    estimate isn't just re-reading depth (b* climbs with melanin)."""
    centers = UNDERTONE_AB_CENTERS_BY_DEPTH.get(depth_category, UNDERTONE_AB_CENTERS)
    face_hue = _hue(mean_a, mean_b)
    distances = {cat: abs(face_hue - h) for cat, h in _hue_centers(centers).items()}
    # +1.0 rather than +0.5: degrees, not LAB units, so the softening constant
    # has to be on the scale of the spread between categories (a few degrees).
    inv = {cat: 1.0 / (d + 1.0) for cat, d in distances.items()}
    total = sum(inv.values())
    return {cat: (v / total) * IMAGE_SIGNAL_WEIGHT for cat, v in inv.items()}


def estimate_undertone(
    mean_a: float,
    mean_b: float,
    foundation_problem: str = "uncertain",
    jewelry_preference: str = "uncertain",
    vein_color: str = "uncertain",
    owned_undertone: Optional[str] = None,
    depth_category: Optional[str] = None,
) -> dict:
    """Combine the image signal with whichever questionnaire answers and
    owned-product evidence are available (each is optional -- "uncertain"/
    None simply contributes nothing) into a category + confidence."""
    scores = {cat: 0.0 for cat in CATEGORIES}

    image_scores = _image_signal(mean_a, mean_b, depth_category)
    for cat, v in image_scores.items():
        scores[cat] += v
    image_lean = max(image_scores, key=image_scores.get)

    answered = []
    if foundation_problem in FOUNDATION_PROBLEM_MAP:
        scores[FOUNDATION_PROBLEM_MAP[foundation_problem]] += QUESTION_WEIGHT
        answered.append("foundation_problem")
    if jewelry_preference in JEWELRY_MAP:
        scores[JEWELRY_MAP[jewelry_preference]] += QUESTION_WEIGHT
        answered.append("jewelry_preference")
    if vein_color in VEIN_MAP:
        scores[VEIN_MAP[vein_color]] += QUESTION_WEIGHT
        answered.append("vein_color")
    if owned_undertone in CATEGORIES:
        scores[owned_undertone] += OWNED_PRODUCT_WEIGHT
        answered.append("owned_product")

    total = sum(scores.values())
    category = max(scores, key=scores.get)
    confidence = round((scores[category] / total) * 100) if total > 0 else 0

    return {
        "category": category,
        "confidence": confidence,
        "scores": {k: round(v, 2) for k, v in scores.items()},
        "reasoning": _build_reasoning(image_lean, category, answered, confidence),
        "signals_used": ["image"] + answered,
    }


def _build_reasoning(image_lean: str, category: str, answered: list, confidence: int) -> str:
    """Only states things we can stand behind.

    This used to open by narrating the image lean ("Your photos appear to have a
    pink or rosy quality") and then, when the answers disagreed, admit they had
    "shifted the estimate toward warm". Both sentences were removed: the image
    lean is measurably unreliable on an uncalibrated photo -- it drifted across
    18 scans of one face -- so telling someone their skin reads rosy presents an
    artefact of their lighting as a fact about them, and the pair together
    contradicted each other on screen.
    """
    parts = []

    if not answered:
        parts.append(
            "This is based on your photo alone -- answering a few quick questions "
            "would improve accuracy."
        )

    if confidence < 45:
        parts.append(
            "Confidence is on the lower side, so treat this as a starting point "
            "rather than a final answer."
        )

    return " ".join(parts)
