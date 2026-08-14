"""
Regression tests for the security-audit fixes: upload size limits and
confidence bounds on the unauthenticated detection endpoints, and the
/load-model path restriction (a .pt file is a pickle, so loading an
attacker-chosen path is a code-execution primitive; per-path error
messages would also double as a filesystem-probing oracle).

Follows test_api.py's conventions: TestClient over the real app, the YOLO
model mocked where a loaded model is needed.
"""

import numpy as np
import cv2
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock


def make_test_image(width=64, height=64, color=(120, 80, 60)) -> bytes:
    img = np.full((height, width, 3), color, dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


@pytest.fixture(scope="module")
def client():
    from src.api.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def mocked_model(monkeypatch):
    import src.api.main as main
    mock = MagicMock()
    mock.return_value = []  # no detections
    monkeypatch.setattr(main, "model", mock)
    return mock


# ── Upload size limits ────────────────────────────────────────────────────────

class TestUploadSizeLimits:
    def test_detect_rejects_oversized_upload(self, client, mocked_model):
        import src.api.main as main
        oversized = b"x" * (main.MAX_UPLOAD_SIZE + 1)
        r = client.post("/detect", files={"image": ("big.jpg", oversized, "image/jpeg")})
        assert r.status_code == 413

    def test_detect_product_brand_rejects_oversized_upload(self, client):
        import src.api.main as main
        oversized = b"x" * (main.MAX_UPLOAD_SIZE + 1)
        r = client.post(
            "/detect-product-brand",
            files={"image": ("big.jpg", oversized, "image/jpeg")},
        )
        assert r.status_code == 413

    def test_detect_accepts_normal_upload(self, client, mocked_model):
        r = client.post(
            "/detect", files={"image": ("ok.jpg", make_test_image(), "image/jpeg")}
        )
        assert r.status_code == 200


# ── Confidence bounds on /detect ─────────────────────────────────────────────

class TestDetectConfidenceBounds:
    @pytest.mark.parametrize("bad", [-0.5, 0, 1.5, 100])
    def test_out_of_range_confidence_is_400(self, client, mocked_model, bad):
        r = client.post(
            f"/detect?confidence={bad}",
            files={"image": ("ok.jpg", make_test_image(), "image/jpeg")},
        )
        assert r.status_code == 400

    def test_boundary_confidence_1_is_accepted(self, client, mocked_model):
        r = client.post(
            "/detect?confidence=1",
            files={"image": ("ok.jpg", make_test_image(), "image/jpeg")},
        )
        assert r.status_code == 200


# ── /load-model path restriction ─────────────────────────────────────────────

class TestLoadModelPathRestriction:
    def test_missing_model_file_field_is_400(self, client):
        r = client.post("/load-model", json={})
        assert r.status_code == 400

    @pytest.mark.parametrize(
        "path",
        [
            "/etc/passwd",                      # absolute path outside models/
            "../beautylens.db",                 # traversal out of models/
            "../../.env",                       # deeper traversal
            "final/best.onnx",                  # inside models/ but not a .pt
        ],
    )
    def test_paths_outside_models_dir_or_wrong_type_are_400(self, client, path):
        r = client.post("/load-model", json={"model_file": path})
        assert r.status_code == 400

    def test_rejection_does_not_echo_the_requested_path(self, client):
        # The error text must not confirm anything about paths the caller
        # probed -- no filesystem oracle.
        r = client.post("/load-model", json={"model_file": "/etc/passwd"})
        assert "/etc/passwd" not in r.json()["detail"]

    def test_missing_pt_inside_models_dir_is_404_without_path_echo(self, client):
        r = client.post("/load-model", json={"model_file": "nonexistent.pt"})
        assert r.status_code == 404
        assert "nonexistent" not in r.json()["detail"]
