"""
Image-quality gating for skin-tone capture: brightness, blur, exposure, color
cast, and face position/size checks. Runs before a photo is accepted into the
3-shot skin scan (front/left/right) -- per the spec, we don't analyze every
photo, we check quality first and ask for a retake if something's off.

Thresholds below are heuristic (tuned by eye, not against a labeled dataset)
and kept in one place so they're easy to retune later.
"""
from typing import Optional

import cv2
import numpy as np

from src.api.face_mesh import get_face_mesh_detector

BRIGHTNESS_MIN = 60.0
BRIGHTNESS_MAX = 210.0
OVEREXPOSED_CLIP_FRACTION_MAX = 0.05
BLUR_VARIANCE_MIN = 80.0
SHADOW_DIFF_MAX = 35.0
COLOR_CAST_MAX = 25.0
FACE_AREA_MIN_RATIO = 0.05
FACE_AREA_MAX_RATIO = 0.85
FACE_OFFCENTER_MAX_RATIO = 0.22


class QualityCheckResult:
    def __init__(self, passed: bool, reason_code: str, message: str, metrics: dict):
        self.passed = passed
        self.reason_code = reason_code
        self.message = message
        self.metrics = metrics

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "reason_code": self.reason_code,
            "message": self.message,
            "metrics": self.metrics,
        }


def assess_capture_quality(img: np.ndarray) -> QualityCheckResult:
    """Run the full quality gate on a single BGR frame and return the first
    (highest-priority) failing check, or a passing result if none fail."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    brightness_mean = float(np.mean(gray))
    blur_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    overexposed_fraction = float(np.mean(gray >= 250))
    # img channels are BGR (OpenCV convention): index 0=B, 2=R.
    b_mean, r_mean = float(np.mean(img[:, :, 0])), float(np.mean(img[:, :, 2]))
    color_cast = r_mean - b_mean  # positive = warm/yellow cast, negative = cool/blue cast

    detector = get_face_mesh_detector()
    face_data = detector.detect_face_mesh(img)

    metrics = {
        "brightness_mean": round(brightness_mean, 1),
        "blur_variance": round(blur_variance, 1),
        "overexposed_fraction": round(overexposed_fraction, 3),
        "color_cast": round(color_cast, 1),
        "face_detected": face_data is not None,
    }

    # Face presence/position gates everything else -- can't judge lighting on
    # a face that isn't there or is barely in frame.
    if face_data is None:
        return QualityCheckResult(
            False, "no_face",
            "No face detected. Make sure your face is fully visible.",
            metrics,
        )

    bbox = face_data["bbox"]
    face_area_ratio = (bbox["width"] * bbox["height"]) / (w * h)
    face_cx = bbox["x"] + bbox["width"] / 2
    face_cy = bbox["y"] + bbox["height"] / 2
    offcenter_x = abs(face_cx - w / 2) / w
    offcenter_y = abs(face_cy - h / 2) / h
    metrics.update({
        "face_area_ratio": round(face_area_ratio, 3),
        "offcenter_x": round(offcenter_x, 3),
        "offcenter_y": round(offcenter_y, 3),
    })

    # Shadow check: compare brightness of the left vs right half of the face bbox.
    x0, y0 = max(int(bbox["x"]), 0), max(int(bbox["y"]), 0)
    x1, y1 = min(int(bbox["x"] + bbox["width"]), w), min(int(bbox["y"] + bbox["height"]), h)
    face_gray = gray[y0:y1, x0:x1]
    shadow_diff = None
    if face_gray.size > 0 and face_gray.shape[1] >= 2:
        mid = face_gray.shape[1] // 2
        shadow_diff = abs(float(np.mean(face_gray[:, :mid])) - float(np.mean(face_gray[:, mid:])))
    metrics["shadow_diff"] = round(shadow_diff, 1) if shadow_diff is not None else None

    if face_area_ratio < FACE_AREA_MIN_RATIO:
        return QualityCheckResult(False, "face_too_small", "Move closer.", metrics)
    if face_area_ratio > FACE_AREA_MAX_RATIO:
        return QualityCheckResult(
            False, "face_too_close",
            "Move back a little so your whole face fits in the frame.",
            metrics,
        )
    if offcenter_x > FACE_OFFCENTER_MAX_RATIO or offcenter_y > FACE_OFFCENTER_MAX_RATIO:
        return QualityCheckResult(False, "face_off_center", "Keep your face inside the frame.", metrics)

    if brightness_mean < BRIGHTNESS_MIN:
        return QualityCheckResult(
            False, "too_dark",
            "Lighting is too dark. Face a window or use neutral white lighting.",
            metrics,
        )
    if brightness_mean > BRIGHTNESS_MAX or overexposed_fraction > OVEREXPOSED_CLIP_FRACTION_MAX:
        return QualityCheckResult(
            False, "too_bright",
            "Lighting is too bright or overexposed. Move away from direct light.",
            metrics,
        )
    if blur_variance < BLUR_VARIANCE_MIN:
        return QualityCheckResult(False, "blurry", "Image is too blurry. Hold the camera steady.", metrics)
    if shadow_diff is not None and shadow_diff > SHADOW_DIFF_MAX:
        return QualityCheckResult(
            False, "uneven_lighting",
            "One side of your face is shadowed. Face a light source directly.",
            metrics,
        )
    if color_cast > COLOR_CAST_MAX:
        return QualityCheckResult(
            False, "color_cast_warm",
            "Lighting is too yellow. Try neutral white lighting.",
            metrics,
        )
    if color_cast < -COLOR_CAST_MAX:
        return QualityCheckResult(
            False, "color_cast_cool",
            "Lighting is too blue. Try neutral white lighting.",
            metrics,
        )

    return QualityCheckResult(True, "ok", "Looks good.", metrics)


# ---------------------------------------------------------------------------
# Skin depth estimation
# ---------------------------------------------------------------------------

# Single-point sample locations rather than full polygons: each index lands
# on flat, texture-free skin (forehead center, cheeks, jaw sides) away from
# eyes/brows/lips/hairline, so no explicit region masking is needed -- the
# point choice itself is the exclusion. left_jaw/right_jaw reuse two of the
# points already trusted as jawline landmarks in face_mesh.py's
# face_oval_indices. These are a starting heuristic, not visually calibrated
# against real photos yet -- worth spot-checking on real captures and
# adjusting if a sample point turns out to land on hair/shadow for some
# face shapes.
SKIN_SAMPLE_POINTS = {
    "forehead": 151,
    "left_cheek": 50,
    "right_cheek": 280,
    "left_jaw": 172,
    "right_jaw": 397,
}

# Patch half-width as a fraction of face bbox width.
PATCH_SIZE_RATIO = 0.035

# Depth category L* midpoints (CIELAB, 0-100 scale), lightest to darkest.
# Must stay consistent with the DEPTH_L values in
# data/generate_seed_catalog.py, which used the same midpoints to build the
# shipped shade catalog -- otherwise a scan's depth category wouldn't line
# up with the catalog's depth categories during matching (Phase 5).
DEPTH_CATEGORY_MIDPOINT_L = [
    ("fair", 78.0),
    ("light", 71.0),
    ("light-medium", 65.0),
    ("medium", 58.0),
    ("medium-deep", 51.0),
    ("deep", 44.0),
    ("rich-deep", 34.0),
]


# ---------------------------------------------------------------------------
# Illuminant estimation / white balance
# ---------------------------------------------------------------------------
#
# Without this the pipeline reads absolute colour off an auto-white-balanced,
# auto-exposed phone camera under unknown light -- a quantity the input does not
# actually carry. Measured over 18 scans of one person, that produced 7.3 L* and
# 14.6 deg of hue drift, enough to cross both depth and undertone boundaries.
#
# Grey-world on the whole frame is the usual first reach and is wrong here: a
# selfie is dominated by skin, and skin is not neutral, so forcing the average
# to grey strips out genuine warmth and biases everyone toward the same tone.
# The sclera is used instead -- it is the one broadly neutral surface reliably
# present in a face shot, which is why illuminant estimation from facial
# features is long-established practice. Shades-of-grey over the non-face region
# is the fallback when the eyes are unusable (closed, too small, heavy shadow).

SCLERA_MIN_PIXELS = 40           # below this the estimate is noise
SCLERA_VALUE_PERCENTILE = 80.0   # sclera is the brightest part of the eye opening
SCLERA_MAX_SATURATION = 0.18     # ...and near-neutral; skin sits well above this
MINKOWSKI_P = 6.0                # shades-of-grey norm; p=1 is grey-world, p=inf is max-RGB
MAX_CHANNEL_GAIN = 2.0           # clamp: a wilder correction means a bad estimate

# Human skin is never neutral on the green-red axis -- haemoglobin puts a* well
# above zero at every depth and in every population. So a "correction" that
# leaves skin at a* ~ 0 has not removed a colour cast, it has removed the
# person's actual colour.
#
# This is not hypothetical. The first version of this module white-balanced a
# real scan to a* = 0.0, because the sclera sampler had picked up eyelid skin
# instead of eye-white: balancing skin against skin makes skin grey by
# construction. The estimate looked perfectly reasonable from the inside -- only
# the physically impossible output gave it away, which is why the check is on
# the result rather than on the estimate.
MIN_PLAUSIBLE_SKIN_A = 3.0


def _apply_gains(img: np.ndarray, illuminant: np.ndarray) -> tuple:
    """von Kries correction: scale each channel so the estimated illuminant
    becomes neutral grey. Returns (corrected_bgr, gains)."""
    illuminant = np.maximum(illuminant.astype(np.float64), 1e-6)
    gains = illuminant.mean() / illuminant
    gains = np.clip(gains, 1.0 / MAX_CHANNEL_GAIN, MAX_CHANNEL_GAIN)
    corrected = np.clip(img.astype(np.float32) * gains, 0, 255).astype(np.uint8)
    return corrected, gains


def estimate_illuminant_sclera(img: np.ndarray, regions: dict):
    """Mean BGR of the eye-white pixels, or None if there aren't enough."""
    h, w = img.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    for key in ("left_eye", "right_eye"):
        pts = regions.get(key)
        if pts:
            cv2.fillPoly(mask, [np.array([[int(p["x"]), int(p["y"])] for p in pts], dtype=np.int32)], 255)
    if not mask.any():
        return None

    pixels = img[mask > 0].astype(np.float32)
    if len(pixels) < SCLERA_MIN_PIXELS:
        return None

    value = pixels.max(axis=1)
    # Saturation as defined for HSV: (max-min)/max. Sclera is bright and grey;
    # iris, lashes and lid shadow are darker or more saturated.
    saturation = np.where(value > 0, (value - pixels.min(axis=1)) / np.maximum(value, 1e-6), 0.0)
    keep = (value >= np.percentile(value, SCLERA_VALUE_PERCENTILE)) & (saturation <= SCLERA_MAX_SATURATION)
    if keep.sum() < SCLERA_MIN_PIXELS:
        return None
    return pixels[keep].mean(axis=0)


def estimate_illuminant_shades_of_grey(img: np.ndarray, exclude_mask=None):
    """Minkowski-norm colour constancy over the region outside `exclude_mask`.
    p=6 is the standard compromise between grey-world and max-RGB."""
    pixels = img.astype(np.float32)
    pixels = pixels[exclude_mask == 0] if exclude_mask is not None else pixels.reshape(-1, 3)
    if len(pixels) < SCLERA_MIN_PIXELS:
        return None
    return np.power(np.mean(np.power(pixels, MINKOWSKI_P), axis=0), 1.0 / MINKOWSKI_P)


def white_balance(img: np.ndarray, face_data=None, regions=None) -> tuple:
    """Returns (corrected_image, info). Never raises -- if no illuminant can be
    estimated the image is returned untouched with method='none', so a scan
    degrades to the old behaviour rather than failing."""
    illuminant, method = None, "none"

    if regions:
        illuminant = estimate_illuminant_sclera(img, regions)
        if illuminant is not None:
            method = "sclera"

    if illuminant is None:
        exclude = None
        if face_data is not None:
            bbox = face_data["bbox"]
            exclude = np.zeros(img.shape[:2], dtype=np.uint8)
            x0, y0 = max(int(bbox["x"]), 0), max(int(bbox["y"]), 0)
            x1 = min(int(bbox["x"] + bbox["width"]), img.shape[1])
            y1 = min(int(bbox["y"] + bbox["height"]), img.shape[0])
            exclude[y0:y1, x0:x1] = 255
            if (exclude == 0).sum() < img.size * 0.05:
                exclude = None  # face fills the frame; nothing neutral to look at
        illuminant = estimate_illuminant_shades_of_grey(img, exclude)
        if illuminant is not None:
            method = "shades_of_grey"

    if illuminant is None:
        return img, {"method": "none", "gains": None}

    corrected, gains = _apply_gains(img, illuminant)

    # Reject a correction that produces impossible skin. Better to keep a mild
    # colour cast than to hand the matcher a face with the blood taken out of it.
    skin_a = _face_centre_a(corrected, face_data)
    if skin_a is not None and skin_a < MIN_PLAUSIBLE_SKIN_A:
        return img, {
            "method": "rejected_implausible",
            "gains": [round(float(g), 4) for g in gains],
            "rejected_from": method,
            "skin_a_after": round(skin_a, 2),
        }

    return img if method == "none" else corrected, {
        "method": method,
        "gains": [round(float(g), 4) for g in gains],
        "skin_a_after": None if skin_a is None else round(skin_a, 2),
    }


def _face_centre_a(img: np.ndarray, face_data) -> Optional[float]:
    """Median a* of a small patch at the centre of the face box -- a cheap
    stand-in for "is this still skin-coloured?"."""
    if not face_data:
        return None
    bbox = face_data["bbox"]
    cx = int(bbox["x"] + bbox["width"] / 2)
    cy = int(bbox["y"] + bbox["height"] / 2)
    half = max(int(bbox["width"] * 0.08), 3)
    h, w = img.shape[:2]
    patch = img[max(cy - half, 0):min(cy + half, h), max(cx - half, 0):min(cx + half, w)]
    if patch.size == 0:
        return None
    return bgr_patch_to_lab(patch)[1]


def bgr_patch_to_lab(patch: np.ndarray) -> tuple:
    """Median CIELAB of a BGR patch: L in 0-100, a/b roughly -128..127.

    Median, not mean: a patch can clip a stray eyelash, a specular highlight or
    a shadow edge, and a mean lets a handful of such pixels move the result.
    For the 1x1 patches used when converting catalog hex values the two are
    identical, so the catalog is unaffected."""
    lab = cv2.cvtColor(patch, cv2.COLOR_BGR2LAB).astype(np.float32)
    l = float(np.median(lab[:, :, 0])) * (100.0 / 255.0)
    a = float(np.median(lab[:, :, 1])) - 128.0
    b = float(np.median(lab[:, :, 2])) - 128.0
    return l, a, b


def lab_to_hex(l: float, a: float, b: float) -> str:
    """Inverse of bgr_patch_to_lab: CIELAB -> "#rrggbb" for display.

    Deliberately the exact mirror of the forward conversion (same OpenCV path,
    same 0-100 / +128 scaling), so a swatch rendered in the UI is the colour
    the matcher actually scored -- not a second, slightly different opinion of
    it."""
    lab = np.array([[[
        np.clip(l * (255.0 / 100.0), 0, 255),
        np.clip(a + 128.0, 0, 255),
        np.clip(b + 128.0, 0, 255),
    ]]], dtype=np.uint8)
    blue, green, red = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)[0][0]
    return f"#{red:02X}{green:02X}{blue:02X}"


def classify_depth(mean_l: float) -> str:
    """Map a mean L* value to the nearest depth category, using the midpoint
    between each pair of adjacent category centers as the boundary."""
    centers = DEPTH_CATEGORY_MIDPOINT_L
    for i in range(len(centers) - 1):
        category, center = centers[i]
        _, next_center = centers[i + 1]
        boundary = (center + next_center) / 2
        if mean_l >= boundary:
            return category
    return centers[-1][0]


def sample_skin_regions(img: np.ndarray, face_data: dict) -> dict:
    """Sample mean LAB at each of SKIN_SAMPLE_POINTS for one image.
    Returns {region_name: {"l": ..., "a": ..., "b": ...}}, omitting any
    region whose landmark index or patch falls outside the image."""
    h, w = img.shape[:2]
    landmarks = face_data["landmarks"]
    bbox = face_data["bbox"]
    half = max(int(bbox["width"] * PATCH_SIZE_RATIO), 3)

    samples = {}
    for region, idx in SKIN_SAMPLE_POINTS.items():
        if idx >= len(landmarks):
            continue
        lm = landmarks[idx]
        cx, cy = int(lm["x"]), int(lm["y"])
        x0, x1 = max(cx - half, 0), min(cx + half, w)
        y0, y1 = max(cy - half, 0), min(cy + half, h)
        patch = img[y0:y1, x0:x1]
        if patch.size == 0:
            continue
        l, a, b = bgr_patch_to_lab(patch)
        samples[region] = {"l": round(l, 1), "a": round(a, 1), "b": round(b, 1)}
    return samples


# A sample point can land on hair, a shadow edge, a nostril or a specular
# highlight. With only ~15 samples a single such reading visibly moves a plain
# mean, so samples are rejected on median absolute deviation before averaging.
# 3.5 is deliberately loose -- this is meant to drop landmarks that missed the
# skin, not to trim genuine facial variation (a forehead really is lighter than
# a jaw). The floor stops a tight cluster from making MAD ~0 and rejecting
# almost everything.
MAD_REJECT_THRESHOLD = 3.5
MAD_FLOOR_L = 1.5

# Shadow and hair only ever darken a sample, never lighten it, so contamination
# is one-sided and MAD -- which assumes outliers scattered around a good median
# -- is the wrong tool. On a real scan the jaw points landed on hair at L* 29.9
# against a forehead of 62.5, and MAD rejected nothing: five bad samples out of
# fifteen inflate the deviation until the threshold stops excluding anything.
#
# So samples are also gated against the well-lit skin on the same face. The
# reference is the 85th percentile rather than the maximum, which ignores a
# single specular highlight, and the tolerance is generous enough to keep real
# facial variation (a forehead genuinely is lighter than a jaw) while dropping
# anything that is a different surface altogether.
SHADOW_REFERENCE_PERCENTILE = 85.0
SHADOW_TOLERANCE_L = 14.0


def _reject_outliers(samples: list) -> tuple:
    """samples: list of (label, l, a, b). Returns (kept, rejected_labels),
    judged on L* -- the axis that carries depth and the one a bad landmark
    moves most."""
    if len(samples) < 4:
        return samples, []  # too few to tell an outlier from the signal

    ls = np.array([s[1] for s in samples], dtype=np.float64)

    # 1. One-sided shadow/hair gate, relative to the lit skin on this same face.
    lit_reference = float(np.percentile(ls, SHADOW_REFERENCE_PERCENTILE))
    shadow_floor = lit_reference - SHADOW_TOLERANCE_L

    # 2. Two-sided MAD gate, for sporadic outliers in either direction.
    median_l = float(np.median(ls))
    mad = float(np.median(np.abs(ls - median_l))) * 1.4826  # -> stdev-equivalent
    limit = MAD_REJECT_THRESHOLD * max(mad, MAD_FLOOR_L)

    kept, rejected = [], []
    for s in samples:
        too_dark = s[1] < shadow_floor
        too_far = abs(s[1] - median_l) > limit
        (rejected if (too_dark or too_far) else kept).append(s)

    # Never reject so much that the estimate rests on a couple of points. If the
    # gate would take most of the face, the problem is the lighting rather than
    # a few samples, and the honest result is the uncorrected one.
    if len(kept) < max(3, len(samples) // 3):
        return samples, []
    return kept, [s[0] for s in rejected]


def estimate_skin_depth(images: dict) -> dict:
    """Estimate skin depth from the 3-angle capture set.

    Args:
        images: {"front": bgr_ndarray, "left": bgr_ndarray, "right": bgr_ndarray}

    Returns a dict with success, depth_category, mean_lab, contributing_regions
    (list of "angle:region" strings), per_image_regions, images_used, and
    images_skipped. An image is skipped (not failed) if no face is detected
    in it -- the estimate still proceeds on whichever images are usable,
    since Phase 2's quality gate already screened these at capture time and
    a single re-detection miss shouldn't block the whole scan.
    """
    detector = get_face_mesh_detector()
    per_image_samples = {}
    images_skipped = []
    white_balance_info = {}

    for angle, img in images.items():
        face_data = detector.detect_face_mesh(img)
        if face_data is None:
            images_skipped.append(angle)
            continue
        # Each frame is corrected against its own illuminant estimate -- the
        # three shots can be taken seconds apart with the camera re-deciding its
        # white balance in between, so a single shared correction would not hold.
        regions = detector.get_facial_regions(face_data)
        balanced, wb = white_balance(img, face_data, regions)
        white_balance_info[angle] = wb
        per_image_samples[angle] = sample_skin_regions(balanced, face_data)

    samples = [
        (f"{angle}:{region}", lab["l"], lab["a"], lab["b"])
        for angle, regions in per_image_samples.items()
        for region, lab in regions.items()
    ]

    if not samples:
        return {
            "success": False,
            "depth_category": None,
            "mean_lab": None,
            "contributing_regions": [],
            "per_image_regions": {},
            "images_used": [],
            "images_skipped": list(images.keys()),
            "white_balance": white_balance_info,
            "rejected_regions": [],
        }

    kept, rejected = _reject_outliers(samples)

    # Median rather than mean over what survives: belt-and-braces against an
    # outlier that sat just inside the rejection threshold.
    mean_l = float(np.median([s[1] for s in kept]))
    mean_a = float(np.median([s[2] for s in kept]))
    mean_b = float(np.median([s[3] for s in kept]))

    return {
        "success": True,
        "depth_category": classify_depth(mean_l),
        "mean_lab": {"l": round(mean_l, 1), "a": round(mean_a, 1), "b": round(mean_b, 1)},
        "contributing_regions": [s[0] for s in kept],
        "per_image_regions": per_image_samples,
        "images_used": list(per_image_samples.keys()),
        "images_skipped": images_skipped,
        "white_balance": white_balance_info,
        "rejected_regions": rejected,
    }
