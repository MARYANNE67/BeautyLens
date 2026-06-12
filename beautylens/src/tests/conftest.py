"""
Shared fixtures for BeautyLens backend tests.
Provides mock YOLO model, mock MediaPipe, and test client.
"""
import io
import os
import pytest
import numpy as np
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


# ── Mock YOLO model ──────────────────────────────────────────────────────────

def make_mock_yolo_result(class_name: str = "lip stick", confidence: float = 0.85):
    """Create a fake YOLO result that mimics ultralytics output."""
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


def make_mock_yolo_model(class_name: str = "lip stick", confidence: float = 0.85):
    """Create a mock YOLO model instance."""
    mock_model = MagicMock()
    mock_model.return_value = make_mock_yolo_result(class_name, confidence)
    return mock_model


# ── Minimal valid JPEG bytes ──────────────────────────────────────────────────

def make_test_image(width: int = 100, height: int = 100) -> bytes:
    """Create a minimal valid JPEG image as bytes."""
    import cv2
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (120, 80, 60)  # BGR — brownish skin tone
    _, buffer = cv2.imencode(".jpg", img)
    return buffer.tobytes()


# ── Pytest fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def test_image_bytes():
    """Returns a minimal valid JPEG as bytes."""
    return make_test_image()


@pytest.fixture
def test_image_file(test_image_bytes):
    """Returns a file-like object for upload testing."""
    return io.BytesIO(test_image_bytes)


@pytest.fixture
def mock_model():
    """Returns a mock YOLO model."""
    return make_mock_yolo_model()


@pytest.fixture
def client_with_model(mock_model):
    """
    Returns a TestClient with a mock YOLO model loaded.
    Patches ultralytics.YOLO so no real model file is needed.
    """
    with patch("src.api.main.YOLO", return_value=mock_model):
        with patch("src.api.main.model", mock_model):
            with patch("src.api.main.model_path", "models/final/best.pt"):
                from src.api.main import app
                yield TestClient(app)


@pytest.fixture
def client_no_model():
    """
    Returns a TestClient with NO model loaded.
    Used to test 503 responses.
    """
    with patch("src.api.main.model", None):
        from src.api.main import app
        yield TestClient(app)
