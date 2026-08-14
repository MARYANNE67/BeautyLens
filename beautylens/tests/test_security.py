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


# ── Rate limiting (unit tests of the middleware itself) ─────────────────────
# The shared conftest disables the middleware on the real app (the suite
# would trip it); these tests build a tiny app with injected limits, a fake
# clock, and a header-based key so identity and time are deterministic.

from fastapi import FastAPI

from src.api.rate_limit import RateLimitMiddleware


def make_limited_client(limit=2, window=60):
    app = FastAPI()

    @app.get("/ping")
    def ping():
        return {"ok": True}

    fake_time = {"now": 1000.0}
    app.add_middleware(
        RateLimitMiddleware,
        limits={"/ping": limit},
        window=window,
        key_func=lambda request: request.headers.get("X-Client", "anon"),
        clock=lambda: fake_time["now"],
    )
    return TestClient(app), fake_time


class TestRateLimiting:
    def test_requests_within_limit_pass(self):
        client, _ = make_limited_client(limit=2)
        assert client.get("/ping").status_code == 200
        assert client.get("/ping").status_code == 200

    def test_request_over_limit_is_429_with_retry_after(self):
        client, _ = make_limited_client(limit=2)
        client.get("/ping")
        client.get("/ping")
        r = client.get("/ping")
        assert r.status_code == 429
        assert int(r.headers["Retry-After"]) >= 1

    def test_limit_is_per_client(self):
        client, _ = make_limited_client(limit=1)
        assert client.get("/ping", headers={"X-Client": "a"}).status_code == 200
        # a is now exhausted, b is not
        assert client.get("/ping", headers={"X-Client": "a"}).status_code == 429
        assert client.get("/ping", headers={"X-Client": "b"}).status_code == 200

    def test_window_expiry_frees_the_client(self):
        client, fake_time = make_limited_client(limit=1, window=60)
        assert client.get("/ping").status_code == 200
        assert client.get("/ping").status_code == 429
        fake_time["now"] += 61
        assert client.get("/ping").status_code == 200

    def test_unlisted_paths_are_never_limited(self):
        client, _ = make_limited_client(limit=1)
        app = client.app

        @app.get("/free")
        def free():
            return {"ok": True}

        for _ in range(5):
            assert client.get("/free").status_code == 200
