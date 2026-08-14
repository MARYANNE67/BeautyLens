"""
BeautyLens API Test Suite
Functional and integration tests for the FastAPI detection backend.

Run with:
    pip install pytest pytest-asyncio httpx
    pytest tests/ -v
"""

import io
import pytest
import numpy as np
import cv2
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# ── helpers ──────────────────────────────────────────────────────────────────

def make_test_image(width=640, height=640, color=(120, 80, 60)) -> bytes:
    """Create a solid-colour JPEG in memory."""
    img = np.full((height, width, 3), color, dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def make_corrupt_bytes() -> bytes:
    return b"not-an-image-at-all"


# ── app import (done here so the lifespan doesn't try to load a real model) ──

@pytest.fixture(scope="module")
def client():
    from src.api.main import app
    with TestClient(app) as c:
        yield c


# ════════════════════════════════════════════════════════════════════════════
# 1. HEALTH CHECKS
# ════════════════════════════════════════════════════════════════════════════

class TestHealthEndpoints:
    def test_root_returns_200(self, client):
        r = client.get("/")
        assert r.status_code == 200

    def test_root_has_status_field(self, client):
        r = client.get("/")
        assert "status" in r.json()
        assert r.json()["status"] == "running"

    def test_root_model_loaded_field_exists(self, client):
        r = client.get("/")
        assert "model_loaded" in r.json()

    def test_health_returns_200(self, client):
        r = client.get("/health")
        assert r.status_code == 200

    def test_health_has_confidence_threshold(self, client):
        r = client.get("/health")
        assert "confidence_threshold" in r.json()


# ════════════════════════════════════════════════════════════════════════════
# 2. CONFIDENCE THRESHOLD ENDPOINT
# ════════════════════════════════════════════════════════════════════════════

class TestSetConfidence:
    def test_valid_threshold(self, client):
        r = client.post("/set-confidence", json={"threshold": 0.40})
        assert r.status_code == 200
        assert r.json()["confidence_threshold"] == 0.40

    def test_threshold_zero_allowed(self, client):
        r = client.post("/set-confidence", json={"threshold": 0.0})
        assert r.status_code == 200

    def test_threshold_one_allowed(self, client):
        r = client.post("/set-confidence", json={"threshold": 1.0})
        assert r.status_code == 200

    def test_threshold_above_one_rejected(self, client):
        r = client.post("/set-confidence", json={"threshold": 1.5})
        assert r.status_code == 400

    def test_threshold_negative_rejected(self, client):
        r = client.post("/set-confidence", json={"threshold": -0.1})
        assert r.status_code == 400

    def test_missing_threshold_rejected(self, client):
        r = client.post("/set-confidence", json={})
        assert r.status_code == 400


# ════════════════════════════════════════════════════════════════════════════
# 3. DETECT ENDPOINT — no model loaded
# ════════════════════════════════════════════════════════════════════════════

class TestDetectNoModel:
    def test_returns_503_when_no_model(self, client):
        """Endpoint must return 503 when model is explicitly unloaded."""
        import src.api.main as main_module
        original = main_module.model
        main_module.model = None
        try:
            img_bytes = make_test_image()
            r = client.post(
                "/detect",
                files={"image": ("test.jpg", img_bytes, "image/jpeg")},
            )
            assert r.status_code == 503
        finally:
            main_module.model = original

    def test_503_message_is_informative(self, client):
        import src.api.main as main_module
        original = main_module.model
        main_module.model = None
        try:
            img_bytes = make_test_image()
            r = client.post(
                "/detect",
                files={"image": ("test.jpg", img_bytes, "image/jpeg")},
            )
            assert "model" in r.json()["detail"].lower()
        finally:
            main_module.model = original


# ════════════════════════════════════════════════════════════════════════════
# 4. DETECT ENDPOINT — with mocked model
# ════════════════════════════════════════════════════════════════════════════

def _make_mock_box(x1=100, y1=100, x2=300, y2=300, conf=0.85, cls=13):
    """Build a mock YOLO box object."""
    import torch
    box = MagicMock()
    box.xyxy = [torch.tensor([x1, y1, x2, y2], dtype=torch.float32)]
    box.conf  = [torch.tensor(conf)]
    box.cls   = [torch.tensor(cls)]
    return box


def _make_mock_result(boxes):
    result = MagicMock()
    result.boxes = boxes
    result.names = {
        0: "beauty blender", 1: "blush", 2: "bronzer", 3: "brush",
        4: "concealer", 5: "eye liner", 6: "eye shadow", 7: "eyelash curler",
        8: "foundation", 9: "highlighter", 10: "lip balm", 11: "lip gloss",
        12: "lip liner", 13: "lip stick", 14: "mascara", 15: "nail polish",
        16: "powder", 17: "primer", 18: "setting spray",
    }
    return result


@pytest.fixture
def client_with_model(client):
    """Patch global `model` so detect endpoints work."""
    import src.api.main as main_module
    mock_model = MagicMock()
    mock_result = _make_mock_result([_make_mock_box()])
    mock_model.return_value = [mock_result]

    original = main_module.model
    main_module.model = mock_model
    yield client
    main_module.model = original


class TestDetectWithModel:
    def test_valid_image_returns_200(self, client_with_model):
        r = client_with_model.post(
            "/detect",
            files={"image": ("t.jpg", make_test_image(), "image/jpeg")},
        )
        assert r.status_code == 200

    def test_response_has_detections_list(self, client_with_model):
        r = client_with_model.post(
            "/detect",
            files={"image": ("t.jpg", make_test_image(), "image/jpeg")},
        )
        body = r.json()
        assert "detections" in body
        assert isinstance(body["detections"], list)

    def test_detection_has_required_fields(self, client_with_model):
        r = client_with_model.post(
            "/detect",
            files={"image": ("t.jpg", make_test_image(), "image/jpeg")},
        )
        det = r.json()["detections"][0]
        for field in ("class_name", "display_name", "confidence", "bbox"):
            assert field in det, f"Missing field: {field}"

    def test_bbox_has_four_coords(self, client_with_model):
        r = client_with_model.post(
            "/detect",
            files={"image": ("t.jpg", make_test_image(), "image/jpeg")},
        )
        bbox = r.json()["detections"][0]["bbox"]
        for coord in ("x1", "y1", "x2", "y2"):
            assert coord in bbox

    def test_confidence_in_range(self, client_with_model):
        r = client_with_model.post(
            "/detect",
            files={"image": ("t.jpg", make_test_image(), "image/jpeg")},
        )
        conf = r.json()["detections"][0]["confidence"]
        assert 0.0 <= conf <= 1.0

    def test_corrupt_image_returns_400(self, client_with_model):
        r = client_with_model.post(
            "/detect",
            files={"image": ("bad.jpg", make_corrupt_bytes(), "image/jpeg")},
        )
        assert r.status_code == 400

    def test_empty_file_returns_400(self, client_with_model):
        r = client_with_model.post(
            "/detect",
            files={"image": ("empty.jpg", b"", "image/jpeg")},
        )
        assert r.status_code == 400

    def test_count_matches_detections_length(self, client_with_model):
        r = client_with_model.post(
            "/detect",
            files={"image": ("t.jpg", make_test_image(), "image/jpeg")},
        )
        body = r.json()
        assert body["count"] == len(body["detections"])

    def test_custom_confidence_param(self, client_with_model):
        """Passing ?confidence= query param should be accepted."""
        r = client_with_model.post(
            "/detect?confidence=0.6",
            files={"image": ("t.jpg", make_test_image(), "image/jpeg")},
        )
        assert r.status_code == 200

    def test_png_image_accepted(self, client_with_model):
        img = np.zeros((640, 640, 3), dtype=np.uint8)
        _, buf = cv2.imencode(".png", img)
        r = client_with_model.post(
            "/detect",
            files={"image": ("t.png", buf.tobytes(), "image/png")},
        )
        assert r.status_code == 200


# ════════════════════════════════════════════════════════════════════════════
# 5. DETECT-WITH-IMAGE (annotated)
# ════════════════════════════════════════════════════════════════════════════

class TestDetectWithImage:
    def test_returns_annotated_image_field(self, client_with_model):
        r = client_with_model.post(
            "/detect-with-image",
            files={"image": ("t.jpg", make_test_image(), "image/jpeg")},
        )
        assert r.status_code == 200
        assert "annotated_image" in r.json()

    def test_annotated_image_is_base64_jpeg(self, client_with_model):
        r = client_with_model.post(
            "/detect-with-image",
            files={"image": ("t.jpg", make_test_image(), "image/jpeg")},
        )
        img_str = r.json()["annotated_image"]
        assert img_str.startswith("data:image/jpeg;base64,")
