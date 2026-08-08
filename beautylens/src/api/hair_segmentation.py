"""
MediaPipe Hair Segmentation

Face Mesh's 468 landmarks (see face_mesh.py) don't model hair at all -- the
closest stand-in, the face-oval-top boundary, approximates *average*
forehead height and undershoots for an above-average forehead. This module
measures the real hair/skin boundary at a few client-specified x positions
using MediaPipe's selfie_multiclass_256x256 segmentation model (Tasks API),
as a supplement to face-mesh landmarks for hairline-adjacent tutorial zones
(see src/utils/tutorialZones.ts and faceGeometry.ts on the client).

Uses the modern Tasks API (mediapipe.tasks.python.vision.ImageSegmenter),
not the legacy hair_segmentation.tflite model -- that one has a documented
input-tensor-shape incompatibility with this API (upstream GitHub issue
google-ai-edge/mediapipe#4266: expects 1x512x512x4, the API provides
1xHxWx3). selfie_multiclass_256x256 is designed for this API and outputs
6 classes: 0=background, 1=hair, 2=body-skin, 3=face-skin, 4=clothes,
5=other. Confirmed working under mediapipe==0.10.9 (this project's pinned
version) via a manual spike against a real photo before this was written.
"""
import os
from typing import List, Optional

import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

FACE_SKIN_CLASS_INDEX = 3

# Require this many *consecutive* face-skin rows before accepting a boundary,
# rather than the first single matching pixel. Segmentation near the edge of
# the head (e.g. at the temple, where hair typically covers the most) is
# noisier than toward the center -- a single misclassified pixel deep inside
# a hair region would otherwise be mistaken for the hairline. A real
# hairline transition has many consecutive skin rows below it; a noise
# pixel doesn't.
MIN_CONSECUTIVE_SKIN_ROWS = 8


def find_hairline_points(mask: np.ndarray, x_pixels: List[float]) -> List[Optional[dict]]:
    """
    Pure column-scan over an already-computed category mask -- separated from
    HairSegmenter so it's testable without loading the real model.

    Scans for the topmost *sustained run* of FACE_SKIN pixels, not the
    topmost single FACE_SKIN pixel -- an earlier version accepted the first
    matching pixel, which is vulnerable to an isolated misclassified pixel
    inside a hair region being mistaken for the real hairline (confirmed
    visually: a noticeable portion of the drawn line sat under real hair,
    not just touching its edge). An earlier version before that scanned for
    hair instead of skin at all, which finds the top of the hair
    *silhouette* (near the crown) rather than where hair meets skin --
    also wrong, for a different reason.

    Args:
        mask: 2D category mask (as returned by ImageSegmenter), values are
            class indices (FACE_SKIN_CLASS_INDEX = visible facial skin).
        x_pixels: pixel x-coordinates to sample, in the same pixel space as
            the mask -- callers typically pass the x of already-detected
            face-mesh landmarks (e.g. left-temple/forehead-center/right-
            temple) so the returned points line up with the rest of the mesh.

    Returns:
        One point per x_pixels entry, in order, each either
        {'x': float, 'y': float} (top of the first sustained face-skin run
        in that column) or None if no such run was found (fully occluded,
        off the face entirely, or too noisy to find a confident boundary)
        -- callers should fall back to a landmark approximation for that
        specific point, not guess.
    """
    height, width = mask.shape
    points: List[Optional[dict]] = []

    for x_raw in x_pixels:
        x = min(width - 1, max(0, int(round(x_raw))))
        is_skin = mask[:, x] == FACE_SKIN_CLASS_INDEX

        found_y: Optional[int] = None
        for y in range(height - MIN_CONSECUTIVE_SKIN_ROWS + 1):
            if is_skin[y:y + MIN_CONSECUTIVE_SKIN_ROWS].all():
                found_y = y
                break

        points.append({'x': float(x_raw), 'y': float(found_y)} if found_y is not None else None)

    return points


class HairSegmenter:
    """Hair/skin boundary detector using MediaPipe's ImageSegmenter."""

    def __init__(self, model_path: str):
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Hair segmentation model not found: {model_path}")

        base_options = mp_python.BaseOptions(model_asset_path=model_path)
        options = vision.ImageSegmenterOptions(
            base_options=base_options,
            output_category_mask=True,
        )
        self.segmenter = vision.ImageSegmenter.create_from_options(options)

    def detect_hairline(self, image: np.ndarray, x_pixels: List[float]) -> List[Optional[dict]]:
        """
        Args:
            image: BGR image (OpenCV convention, matches face_mesh.py).
            x_pixels: see find_hairline_points.

        Returns:
            See find_hairline_points.
        """
        rgb = np.ascontiguousarray(image[:, :, ::-1])  # BGR -> RGB
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self.segmenter.segment(mp_image)
        mask = result.category_mask.numpy_view()  # matches input image's H x W, no rescaling needed
        return find_hairline_points(mask, x_pixels)


_hair_segmenter: Optional[HairSegmenter] = None


def get_hair_segmenter(model_path: str) -> HairSegmenter:
    """Get or create the hair segmenter instance (singleton, matches
    face_mesh.py's get_face_mesh_detector() pattern)."""
    global _hair_segmenter
    if _hair_segmenter is None:
        _hair_segmenter = HairSegmenter(model_path)
    return _hair_segmenter
