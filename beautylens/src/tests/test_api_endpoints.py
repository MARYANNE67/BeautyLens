"""
Integration tests for BeautyLens FastAPI endpoints.

Tests:
- GET /health
- POST /detect
- POST /set-confidence
- POST /load-model

YOLO model is mocked — no real model file or GPU needed in CI.
"""
import io
import pytest
import numpy as np
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


def make_test_image_bytes(width: int = 100, height: int = 100) -> bytes:
    import cv2
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (120, 80, 60)
    _, buffer = cv2.imencode(".jpg", img)
    return buffer.tobytes()


def make_mock_yolo_result(class_name: str = "lip stick", confidence: float = 0.85):
    box = MagicMock()
    box.xyxy = [MagicMock()]
    box.xyxy[0].cpu.return_value.numpy.return_value = np.array([100.0, 150.0, 300.0, 400.0])
    box.conf = [MagicMock()]
    box.conf[0].cpu.return_value.numpy.return_value = np.array(confidence)
    box.cls = [MagicMock()]
    box.cls[0].cpu.return_value.numpy.return_value = np.array(0)
    result = MagicMock()
    result.boxes = [box]
    result.names = {0: class_name}
    return [result]


# ── /health ──────────────────────────────────────────────────────────────────

class TestHealthEndpoint:

    def test_health_returns_200(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_response_structure(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert "model_loaded" in data
        assert data["status"] == "healthy"

    def test_health_model_loaded_false_when_no_model(self):
        with patch("src.api.main.model", None):
            from src.api.main import app
            client = TestClient(app)
            response = client.get("/health")
            assert response.json()["model_loaded"] is False

    def test_health_model_loaded_true_when_model_set(self):
        mock_model = MagicMock()
        with patch("src.api.main.model", mock_model):
            from src.api.main import app
            client = TestClient(app)
            response = client.get("/health")
            assert response.json()["model_loaded"] is True


# ── /detect ───────────────────────────────────────────────────────────────────

class TestDetectEndpoint:

    def test_detect_returns_503_when_no_model(self):
        with patch("src.api.main.model", None):
            from src.api.main import app
            client = TestClient(app)
            image_bytes = make_test_image_bytes()
            response = client.post(
                "/detect",
                files={"image": ("test.jpg", image_bytes, "image/jpeg")},
            )
            assert response.status_code == 503

    def test_detect_returns_400_for_empty_file(self):
        mock_model = MagicMock()
        with patch("src.api.main.model", mock_model):
            from src.api.main import app
            client = TestClient(app)
            response = client.post(
                "/detect",
                files={"image": ("test.jpg", b"", "image/jpeg")},
            )
            assert response.status_code == 400

    def test_detect_returns_400_for_invalid_image(self):
        mock_model = MagicMock()
        with patch("src.api.main.model", mock_model):
            from src.api.main import app
            client = TestClient(app)
            response = client.post(
                "/detect",
                files={"image": ("test.txt", b"not an image at all", "text/plain")},
            )
            assert response.status_code == 400

    def test_detect_returns_200_with_valid_image_and_model(self):
        mock_model = MagicMock()
        mock_model.return_value = make_mock_yolo_result("lip stick", 0.85)

        with patch("src.api.main.model", mock_model):
            from src.api.main import app
            client = TestClient(app)
            image_bytes = make_test_image_bytes()
            response = client.post(
                "/detect",
                files={"image": ("test.jpg", image_bytes, "image/jpeg")},
            )
            assert response.status_code == 200

    def test_detect_response_has_required_fields(self):
        mock_model = MagicMock()
        mock_model.return_value = make_mock_yolo_result("lip stick", 0.85)

        with patch("src.api.main.model", mock_model):
            from src.api.main import app
            client = TestClient(app)
            image_bytes = make_test_image_bytes()
            response = client.post(
                "/detect",
                files={"image": ("test.jpg", image_bytes, "image/jpeg")},
            )
            data = response.json()
            assert "status" in data
            assert "detections" in data
            assert "count" in data
            assert "image_shape" in data

    def test_detect_detection_has_required_fields(self):
        mock_model = MagicMock()
        mock_model.return_value = make_mock_yolo_result("lip stick", 0.85)

        with patch("src.api.main.model", mock_model):
            from src.api.main import app
            client = TestClient(app)
            image_bytes = make_test_image_bytes()
            response = client.post(
                "/detect",
                files={"image": ("test.jpg", image_bytes, "image/jpeg")},
            )
            data = response.json()
            assert data["count"] >= 0
            if data["count"] > 0:
                detection = data["detections"][0]
                assert "class_name" in detection
                assert "display_name" in detection
                assert "confidence" in detection
                assert "bbox" in detection
                bbox = detection["bbox"]
                assert "x1" in bbox
                assert "y1" in bbox
                assert "x2" in bbox
                assert "y2" in bbox

    def test_detect_normalizes_class_name(self):
        mock_model = MagicMock()
        mock_model.return_value = make_mock_yolo_result("Lip Stick", 0.85)

        with patch("src.api.main.model", mock_model):
            from src.api.main import app
            client = TestClient(app)
            image_bytes = make_test_image_bytes()
            response = client.post(
                "/detect",
                files={"image": ("test.jpg", image_bytes, "image/jpeg")},
            )
            data = response.json()
            if data["count"] > 0:
                assert data["detections"][0]["class_name"] == "lip stick"

    def test_detect_image_shape_in_response(self):
        mock_model = MagicMock()
        mock_model.return_value = make_mock_yolo_result("foundation", 0.7)

        with patch("src.api.main.model", mock_model):
            from src.api.main import app
            client = TestClient(app)
            image_bytes = make_test_image_bytes(200, 150)
            response = client.post(
                "/detect",
                files={"image": ("test.jpg", image_bytes, "image/jpeg")},
            )
            data = response.json()
            assert data["image_shape"]["width"] == 200
            assert data["image_shape"]["height"] == 150

    def test_detect_with_confidence_param(self):
        mock_model = MagicMock()
        mock_model.return_value = make_mock_yolo_result("mascara", 0.9)

        with patch("src.api.main.model", mock_model):
            from src.api.main import app
            client = TestClient(app)
            image_bytes = make_test_image_bytes()
            response = client.post(
                "/detect?confidence=0.8",
                files={"image": ("test.jpg", image_bytes, "image/jpeg")},
            )
            assert response.status_code == 200


# ── /set-confidence ───────────────────────────────────────────────────────────

class TestSetConfidenceEndpoint:

    def test_set_confidence_returns_200_for_valid_threshold(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.post("/set-confidence", json={"threshold": 0.55})
        assert response.status_code == 200

    def test_set_confidence_updates_threshold(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.post("/set-confidence", json={"threshold": 0.55})
        data = response.json()
        assert data["confidence_threshold"] == 0.55

    def test_set_confidence_returns_400_above_1(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.post("/set-confidence", json={"threshold": 1.5})
        assert response.status_code == 400

    def test_set_confidence_returns_400_below_0(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.post("/set-confidence", json={"threshold": -0.1})
        assert response.status_code == 400

    def test_set_confidence_returns_400_missing_field(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.post("/set-confidence", json={})
        assert response.status_code == 400

    def test_set_confidence_boundary_zero(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.post("/set-confidence", json={"threshold": 0.0})
        assert response.status_code == 200

    def test_set_confidence_boundary_one(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.post("/set-confidence", json={"threshold": 1.0})
        assert response.status_code == 200


# ── /load-model ───────────────────────────────────────────────────────────────

class TestLoadModelEndpoint:

    def test_load_model_returns_400_missing_model_file(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.post("/load-model", json={})
        assert response.status_code == 400

    def test_load_model_returns_400_nonexistent_path(self):
        from src.api.main import app
        client = TestClient(app)
        response = client.post(
            "/load-model",
            json={"model_file": "/nonexistent/path/model.pt"},
        )
        assert response.status_code == 400
