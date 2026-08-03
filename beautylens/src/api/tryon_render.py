"""
Realistic, photo-based shade preview.

This is deliberately separate from the existing live AR overlay
(/detect-face-mesh + camera.tsx + meshOverlays.ts), which draws a flat-
opacity SVG polygon over the live camera feed -- a fixed color with no
relationship to the user's actual skin tone, lighting, or texture. That
flow is untouched.

v1 of this module did a flat per-pixel LAB blend (keep L, shift a/b toward
the target uniformly across the whole region). That preserved lighting but
still read as a color-graded filter rather than makeup, because a uniform
hue shift over a face-sized area *is* the visual signature of a skin
filter -- the missing piece wasn't luminance, it was texture and
selectivity.

v2 (this version) uses frequency separation, the standard technique behind
both professional photo retouching and real beauty-AR products: split each
channel into a low-frequency "tone" layer (broad color/shading, pore-scale
detail removed) and a high-frequency "detail" layer (pores, fine blemish
texture, brush-scale variation). Only the tone layer gets recolored; the
detail layer is added back on top, scaled by how much of the original
texture should still show through (`detail retention`, driven by the
shade's coverage -- full coverage keeps less of the original blemish/pore
detail, light coverage keeps most of it, mirroring how real foundation
coverage works). The result has the new color sitting *on* visible skin
texture instead of replacing it, which is what actually distinguishes
"makeup" from "filter" to the eye.
"""
import cv2
import numpy as np

from src.api.face_mesh import get_face_mesh_detector

COVERAGE_ALPHA = {"light": 0.30, "medium": 0.50, "full": 0.68}
DEFAULT_ALPHA = 0.45

# How much of the original high-frequency detail (pores, blemish texture) to
# keep, per coverage level. 1.0 = fully preserved (no evening out), lower =
# more smoothed/covered. Full coverage foundation visibly evens out
# redness/blemishes; light coverage barely touches them.
DETAIL_RETENTION = {"light": 0.85, "medium": 0.65, "full": 0.45}
DEFAULT_DETAIL_RETENTION = 0.7

# Feather radius (mask edge softness) and frequency-separation kernel, both
# as a fraction of face bbox width so they scale across photo resolutions.
# The freq-separation kernel is deliberately small -- it should only strip
# out pore/blemish-scale detail, not broad shading/contour (which needs to
# stay in the "tone" layer and get recolored along with everything else, or
# the face loses its real depth/shape).
FEATHER_RATIO = 0.14
FREQ_SEPARATION_RATIO = 0.05


def _polygon_points(landmarks: list) -> np.ndarray:
    return np.array([[int(p["x"]), int(p["y"])] for p in landmarks], dtype=np.int32)


def _build_mask(shape: tuple, regions: dict, category: str) -> np.ndarray:
    """Binary (0/255) region mask before feathering. `regions` is the dict
    returned by FaceMeshDetector.get_facial_regions()."""
    h, w = shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    if category == "concealer":
        for region_key in ("left_under_eye", "right_under_eye"):
            pts = regions.get(region_key)
            if pts:
                cv2.fillPoly(mask, [_polygon_points(pts)], 255)
        return mask

    # foundation: face oval minus eyes and lips -- we don't want to recolor
    # the eyes or mouth themselves.
    face_oval = regions.get("face_oval")
    if face_oval:
        cv2.fillPoly(mask, [_polygon_points(face_oval)], 255)
    for hole_key in ("left_eye", "right_eye", "outer_lip"):
        pts = regions.get(hole_key)
        if pts:
            cv2.fillPoly(mask, [_polygon_points(pts)], 0)
    return mask


def _odd(n: float) -> int:
    n = max(int(n), 3)
    return n if n % 2 == 1 else n + 1


def _separate(channel: np.ndarray, kernel: int) -> tuple:
    """Returns (low_frequency_tone, high_frequency_detail)."""
    low = cv2.GaussianBlur(channel, (kernel, kernel), 0)
    return low, channel - low


def apply_shade_preview(
    img: np.ndarray,
    category: str,
    target_a: float,
    target_b: float,
    coverage: str,
    finish: str,
):
    """Returns the blended BGR image, or None if no face was detected."""
    detector = get_face_mesh_detector()
    face_data = detector.detect_face_mesh(img)
    if face_data is None:
        return None

    regions = detector.get_facial_regions(face_data)
    mask = _build_mask(img.shape, regions, category)

    bbox_width = face_data["bbox"]["width"]
    feather_kernel = _odd(bbox_width * FEATHER_RATIO)
    feathered = cv2.GaussianBlur(mask, (feather_kernel, feather_kernel), 0).astype(np.float32) / 255.0
    freq_kernel = _odd(bbox_width * FREQ_SEPARATION_RATIO)

    coverage_alpha = COVERAGE_ALPHA.get(coverage, DEFAULT_ALPHA)
    detail_retention = DETAIL_RETENTION.get(coverage, DEFAULT_DETAIL_RETENTION)
    if finish == "matte":
        detail_retention *= 0.8   # a bit more evened-out/flattened
    elif finish == "radiant":
        detail_retention = min(detail_retention * 1.15, 1.0)  # let more natural texture/shine show

    alpha = feathered * coverage_alpha
    # Blend of full retention outside the mask (seamless border) down to
    # `detail_retention` at full mask strength.
    retention_map = 1.0 - feathered * (1.0 - detail_retention)

    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)

    # target_a/target_b are standard CIELAB (roughly -128..127); cv2's 8-bit
    # LAB a/b channels are offset by +128.
    target_a_cv = target_a + 128.0
    target_b_cv = target_b + 128.0

    new_channels = {}
    for idx, target in ((1, target_a_cv), (2, target_b_cv)):
        low, detail = _separate(lab[:, :, idx], freq_kernel)
        new_low = low * (1 - alpha) + target * alpha
        new_channels[idx] = new_low + detail * retention_map

    low_l, detail_l = _separate(lab[:, :, 0], freq_kernel)
    new_low_l = low_l
    if finish == "radiant":
        new_low_l = np.clip(low_l + alpha * 4.0, 0, 255)
    new_l = new_low_l + detail_l * retention_map

    lab[:, :, 0] = np.clip(new_l, 0, 255)
    lab[:, :, 1] = np.clip(new_channels[1], 0, 255)
    lab[:, :, 2] = np.clip(new_channels[2], 0, 255)

    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)
