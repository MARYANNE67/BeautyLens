"""
Unit tests for src.api.tryon_render: mask construction and the LAB blend
math. Uses a fake detector whose get_facial_regions() returns hand-crafted
square regions (rather than real MediaPipe landmark indices) -- this tests
tryon_render's own logic (mask building, feathering, per-pixel LAB blend),
not MediaPipe's region extraction, which is unchanged/untested here.

Layout on a 200x200 test image:
  face_oval:        (10,10)-(190,190)            -- most of the image
  left_eye:          (30,30)-(60,60)              -- hole
  right_eye:        (140,30)-(170,60)             -- hole
  outer_lip:         (80,140)-(120,170)           -- hole
  left_under_eye:    (30,65)-(60,85)
  right_under_eye:  (140,65)-(170,85)
"""
import cv2
import numpy as np
import pytest

from src.api import tryon_render

IMG_SIZE = 200

REGIONS = {
    "face_oval": [{"x": 10, "y": 10}, {"x": 190, "y": 10}, {"x": 190, "y": 190}, {"x": 10, "y": 190}],
    "left_eye": [{"x": 30, "y": 30}, {"x": 60, "y": 30}, {"x": 60, "y": 60}, {"x": 30, "y": 60}],
    "right_eye": [{"x": 140, "y": 30}, {"x": 170, "y": 30}, {"x": 170, "y": 60}, {"x": 140, "y": 60}],
    "outer_lip": [{"x": 80, "y": 140}, {"x": 120, "y": 140}, {"x": 120, "y": 170}, {"x": 80, "y": 170}],
    "left_under_eye": [{"x": 30, "y": 65}, {"x": 60, "y": 65}, {"x": 60, "y": 85}, {"x": 30, "y": 85}],
    "right_under_eye": [{"x": 140, "y": 65}, {"x": 170, "y": 65}, {"x": 170, "y": 85}, {"x": 140, "y": 85}],
}

FACE_DATA = {"landmarks": [], "bbox": {"x": 10, "y": 10, "width": 180, "height": 180}}


class FakeDetector:
    def __init__(self, face_data=FACE_DATA, regions=REGIONS):
        self._face_data = face_data
        self._regions = regions

    def detect_face_mesh(self, img):
        return self._face_data

    def get_facial_regions(self, face_data):
        return self._regions


def use_detector(monkeypatch, face_data=FACE_DATA, regions=REGIONS):
    monkeypatch.setattr(tryon_render, "get_face_mesh_detector", lambda: FakeDetector(face_data, regions))


def textured_image(base: int, size: int = IMG_SIZE, seed: int = 0, noise: int = 20) -> np.ndarray:
    rng = np.random.default_rng(seed)
    delta = rng.integers(-noise, noise + 1, size=(size, size, 1)).astype(np.int16)
    img = np.clip(base + delta, 0, 255).astype(np.uint8)
    return np.repeat(img, 3, axis=2)


# -- _build_mask ---------------------------------------------------------------

def test_build_mask_foundation_covers_face_but_not_eyes_or_lips():
    mask = tryon_render._build_mask((IMG_SIZE, IMG_SIZE), REGIONS, "foundation")

    assert mask[100, 100] == 255  # plain face area
    assert mask[45, 45] == 0      # left eye hole
    assert mask[45, 155] == 0     # right eye hole
    assert mask[155, 100] == 0    # lip hole
    assert mask[0, 0] == 0        # outside face oval entirely


def test_build_mask_concealer_only_under_eyes():
    mask = tryon_render._build_mask((IMG_SIZE, IMG_SIZE), REGIONS, "concealer")

    assert mask[75, 45] == 255    # left under-eye
    assert mask[75, 155] == 255   # right under-eye
    assert mask[100, 100] == 0    # plain cheek/face area -- not concealer's job
    assert mask[45, 45] == 0      # eye hole itself


# -- apply_shade_preview ---------------------------------------------------------------

def test_returns_none_when_no_face_detected(monkeypatch):
    use_detector(monkeypatch, face_data=None)
    img = textured_image(140)
    result = tryon_render.apply_shade_preview(img, "foundation", target_a=20.0, target_b=20.0, coverage="full", finish="natural")
    assert result is None


def test_pixel_outside_mask_is_essentially_unchanged(monkeypatch):
    use_detector(monkeypatch)
    img = textured_image(140)
    result = tryon_render.apply_shade_preview(img, "foundation", target_a=30.0, target_b=30.0, coverage="full", finish="natural")

    original_px = img[0, 0].astype(int)
    result_px = result[0, 0].astype(int)
    # Small tolerance for BGR<->LAB round-trip rounding, not blend drift.
    assert np.max(np.abs(original_px - result_px)) <= 3


def test_pixel_inside_mask_shifts_toward_target(monkeypatch):
    use_detector(monkeypatch)
    img = textured_image(140)  # neutral gray -> LAB a/b near 128 (i.e. ~0 in standard scale)
    target_a, target_b = 30.0, 30.0  # push warm/positive

    result = tryon_render.apply_shade_preview(img, "foundation", target_a=target_a, target_b=target_b, coverage="full", finish="natural")

    orig_lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    new_lab = cv2.cvtColor(result, cv2.COLOR_BGR2LAB).astype(np.float32)

    y, x = 100, 100  # well inside face_oval, away from any hole or edge
    assert new_lab[y, x, 1] > orig_lab[y, x, 1]  # a shifted toward target
    assert new_lab[y, x, 2] > orig_lab[y, x, 2]  # b shifted toward target
    # L (lightness) is mostly preserved -- but not perfectly, by design: full
    # coverage now also damps high-frequency L detail a bit (the "evens out
    # skin" effect from frequency separation), so a few units of drift on a
    # single noisy pixel is expected. A near-total L rewrite would still fail
    # this (the noise amplitude here is +/-20).
    assert abs(new_lab[y, x, 0] - orig_lab[y, x, 0]) < 8


def test_full_coverage_shifts_more_than_light_coverage(monkeypatch):
    use_detector(monkeypatch)
    img = textured_image(140)
    kwargs = dict(target_a=30.0, target_b=30.0, finish="natural")

    light = tryon_render.apply_shade_preview(img, "foundation", coverage="light", **kwargs)
    full = tryon_render.apply_shade_preview(img, "foundation", coverage="full", **kwargs)

    orig_lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    light_lab = cv2.cvtColor(light, cv2.COLOR_BGR2LAB).astype(np.float32)
    full_lab = cv2.cvtColor(full, cv2.COLOR_BGR2LAB).astype(np.float32)

    y, x = 100, 100
    light_shift = abs(light_lab[y, x, 1] - orig_lab[y, x, 1])
    full_shift = abs(full_lab[y, x, 1] - orig_lab[y, x, 1])
    assert full_shift > light_shift


def test_radiant_finish_lifts_lightness(monkeypatch):
    use_detector(monkeypatch)
    img = textured_image(140)
    kwargs = dict(target_a=7.0, target_b=11.0, coverage="full")  # neutral-ish target, isolates the finish effect

    natural = tryon_render.apply_shade_preview(img, "foundation", finish="natural", **kwargs)
    radiant = tryon_render.apply_shade_preview(img, "foundation", finish="radiant", **kwargs)

    natural_lab = cv2.cvtColor(natural, cv2.COLOR_BGR2LAB).astype(np.float32)
    radiant_lab = cv2.cvtColor(radiant, cv2.COLOR_BGR2LAB).astype(np.float32)

    y, x = 100, 100
    assert radiant_lab[y, x, 0] > natural_lab[y, x, 0]


def test_matte_finish_reduces_local_texture_variance(monkeypatch):
    use_detector(monkeypatch)
    img = textured_image(140, noise=25)  # noisier so smoothing has something to remove
    kwargs = dict(target_a=7.0, target_b=11.0, coverage="full")

    natural = tryon_render.apply_shade_preview(img, "foundation", finish="natural", **kwargs)
    matte = tryon_render.apply_shade_preview(img, "foundation", finish="matte", **kwargs)

    # Compare local L variance in a patch well inside the masked region.
    natural_l = cv2.cvtColor(natural, cv2.COLOR_BGR2LAB)[:, :, 0].astype(np.float32)
    matte_l = cv2.cvtColor(matte, cv2.COLOR_BGR2LAB)[:, :, 0].astype(np.float32)

    patch = (slice(70, 130), slice(70, 130))
    assert np.var(matte_l[patch]) < np.var(natural_l[patch])
