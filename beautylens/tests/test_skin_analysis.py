"""
Unit tests for src.api.skin_analysis.assess_capture_quality using synthetic
numpy images -- no real face photos needed. The face detector is monkeypatched
to return a fixed bbox so each test can isolate one quality check at a time.
"""
import numpy as np
import pytest

from src.api import skin_analysis

IMG_SIZE = 300
# Centered bbox covering ~16% of the image area -- passes the position/size
# checks so tests can focus on brightness/blur/shadow/color-cast instead.
NORMAL_BBOX = {"x": 90.0, "y": 90.0, "width": 120.0, "height": 120.0}


class FakeDetector:
    def __init__(self, face_data):
        self._face_data = face_data

    def detect_face_mesh(self, img):
        return self._face_data


def use_face(monkeypatch, bbox=NORMAL_BBOX):
    face_data = None if bbox is None else {"bbox": bbox}
    monkeypatch.setattr(skin_analysis, "get_face_mesh_detector", lambda: FakeDetector(face_data))


def solid_image(value: int, size: int = IMG_SIZE) -> np.ndarray:
    return np.full((size, size, 3), value, dtype=np.uint8)


def textured_image(base: int, size: int = IMG_SIZE, seed: int = 0, noise: int = 20) -> np.ndarray:
    """Uniform base brightness with per-pixel grayscale noise (same delta on
    every channel) so it has texture (passes the blur check) without shading
    one side darker than the other or introducing a color cast."""
    rng = np.random.default_rng(seed)
    delta = rng.integers(-noise, noise + 1, size=(size, size, 1)).astype(np.int16)
    img = np.clip(base + delta, 0, 255).astype(np.uint8)
    return np.repeat(img, 3, axis=2)


def test_no_face_detected(monkeypatch):
    use_face(monkeypatch, bbox=None)
    result = skin_analysis.assess_capture_quality(solid_image(140))
    assert not result.passed
    assert result.reason_code == "no_face"


def test_face_too_small(monkeypatch):
    use_face(monkeypatch, bbox={"x": 140.0, "y": 140.0, "width": 20.0, "height": 20.0})
    result = skin_analysis.assess_capture_quality(solid_image(140))
    assert not result.passed
    assert result.reason_code == "face_too_small"


def test_face_too_close(monkeypatch):
    use_face(monkeypatch, bbox={"x": 5.0, "y": 5.0, "width": 290.0, "height": 290.0})
    result = skin_analysis.assess_capture_quality(solid_image(140))
    assert not result.passed
    assert result.reason_code == "face_too_close"


def test_face_off_center(monkeypatch):
    use_face(monkeypatch, bbox={"x": 10.0, "y": 10.0, "width": 100.0, "height": 100.0})
    result = skin_analysis.assess_capture_quality(solid_image(140))
    assert not result.passed
    assert result.reason_code == "face_off_center"


def test_too_dark(monkeypatch):
    use_face(monkeypatch)
    result = skin_analysis.assess_capture_quality(solid_image(20))
    assert not result.passed
    assert result.reason_code == "too_dark"


def test_too_bright(monkeypatch):
    use_face(monkeypatch)
    result = skin_analysis.assess_capture_quality(solid_image(250))
    assert not result.passed
    assert result.reason_code == "too_bright"


def test_blurry(monkeypatch):
    use_face(monkeypatch)
    # Flat, textureless image at a valid brightness -> near-zero Laplacian variance.
    result = skin_analysis.assess_capture_quality(solid_image(140))
    assert not result.passed
    assert result.reason_code == "blurry"


def test_uneven_lighting(monkeypatch):
    use_face(monkeypatch)
    img = textured_image(130, noise=8)
    img[:, : IMG_SIZE // 2] = np.clip(img[:, : IMG_SIZE // 2].astype(int) - 45, 0, 255).astype(np.uint8)
    img[:, IMG_SIZE // 2 :] = np.clip(img[:, IMG_SIZE // 2 :].astype(int) + 45, 0, 255).astype(np.uint8)
    result = skin_analysis.assess_capture_quality(img)
    assert not result.passed
    assert result.reason_code == "uneven_lighting"


def test_color_cast_warm(monkeypatch):
    use_face(monkeypatch)
    img = textured_image(130, noise=10)
    img = img.astype(np.int16)
    img[:, :, 2] = np.clip(img[:, :, 2] + 40, 0, 255)  # boost R
    img[:, :, 0] = np.clip(img[:, :, 0] - 20, 0, 255)  # cut B
    result = skin_analysis.assess_capture_quality(img.astype(np.uint8))
    assert not result.passed
    assert result.reason_code == "color_cast_warm"


def test_color_cast_cool(monkeypatch):
    use_face(monkeypatch)
    img = textured_image(130, noise=10)
    img = img.astype(np.int16)
    img[:, :, 0] = np.clip(img[:, :, 0] + 40, 0, 255)  # boost B
    img[:, :, 2] = np.clip(img[:, :, 2] - 20, 0, 255)  # cut R
    result = skin_analysis.assess_capture_quality(img.astype(np.uint8))
    assert not result.passed
    assert result.reason_code == "color_cast_cool"


def test_passes_with_good_lighting(monkeypatch):
    use_face(monkeypatch)
    img = textured_image(140, noise=15)
    result = skin_analysis.assess_capture_quality(img)
    assert result.passed
    assert result.reason_code == "ok"
