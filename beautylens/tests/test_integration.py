"""
Integration tests for BeautyLens — Interface 1: Camera → Detection API → App response.

Tests hit a LIVE server with the real best.pt model loaded.
All HEIC/JPG/PNG images in tests/fixtures/ are tested individually.

Setup:
    pip install pillow-heif
    uvicorn src.api.main:app --host 127.0.0.1 --port 8000
    pytest tests/test_integration.py -v -s
"""

import io
import pytest
import requests
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"
FIXTURES_DIR = Path(__file__).parent / "fixtures"
SUPPORTED_EXTENSIONS = (".heic", ".HEIC", ".jpg", ".jpeg", ".png")

VALID_CLASS_NAMES = {
    "beauty blender", "blush", "bronzer", "brush", "concealer",
    "eye liner", "eye shadow", "eyelash curler", "foundation",
    "highlighter", "lip balm", "lip gloss", "lip liner", "lip stick",
    "mascara", "nail polish", "powder", "primer", "setting spray",
}


# ── helpers ───────────────────────────────────────────────────────────────────

def all_fixture_images() -> list[Path]:
    if not FIXTURES_DIR.exists():
        return []
    return [
        p for p in sorted(FIXTURES_DIR.iterdir())
        if p.suffix in SUPPORTED_EXTENSIONS
    ]


def to_jpeg_bytes(path: Path) -> bytes:
    if path.suffix.lower() in (".jpg", ".jpeg", ".png"):
        return path.read_bytes()
    try:
        import pillow_heif
        from PIL import Image
        pillow_heif.register_heif_opener()
        img = Image.open(path).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=92)
        return buf.getvalue()
    except ImportError:
        pytest.fail("Run: pip install pillow-heif")


def server_is_up() -> bool:
    try:
        return requests.get(f"{BASE_URL}/", timeout=3).status_code == 200
    except requests.exceptions.ConnectionError:
        return False


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module", autouse=True)
def require_server():
    if not server_is_up():
        pytest.skip(
            "Live server not running.\n"
            "Start with: uvicorn src.api.main:app --host 127.0.0.1 --port 8000"
        )


def pytest_generate_tests(metafunc):
    """Parametrize any test that declares a `fixture_image` argument."""
    if "fixture_image" in metafunc.fixturenames:
        images = all_fixture_images()
        if not images:
            pytest.skip("No images in tests/fixtures/")
        metafunc.parametrize(
            "fixture_image",
            images,
            ids=[p.stem for p in images],
        )


# ════════════════════════════════════════════════════════════════════════════
# Health check (runs once)
# ════════════════════════════════════════════════════════════════════════════

class TestLiveServer:

    def test_server_is_healthy_and_model_loaded(self):
        r = requests.get(f"{BASE_URL}/health")
        assert r.status_code == 200
        assert r.json().get("model_loaded") is True, (
            "Model not loaded — confirm best.pt exists at models/final/best.pt"
        )


# ════════════════════════════════════════════════════════════════════════════
# Per-image detection tests (one run per fixture image)
# ════════════════════════════════════════════════════════════════════════════

class TestDetectEachFixture:

    @pytest.fixture(autouse=True)
    def _detect(self, fixture_image):
        """POST to /detect with confidence=0.40 once per image."""
        img_bytes = to_jpeg_bytes(fixture_image)
        r = requests.post(
            f"{BASE_URL}/detect?confidence=0.40",
            files={"image": (fixture_image.name, img_bytes, "image/jpeg")},
        )
        assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
        self.body = r.json()
        self.image_name = fixture_image.stem

    def test_returns_200(self, fixture_image):
        pass  # assertion already in _detect fixture

    def test_has_detections_list_and_count(self, fixture_image):
        assert "detections" in self.body
        assert "count" in self.body
        assert self.body["count"] == len(self.body["detections"])

    def test_at_least_one_product_detected(self, fixture_image):
        assert self.body["count"] >= 1, (
            f"No products detected in {self.image_name} — "
            "try a clearer photo or lower the confidence threshold"
        )

    def test_class_names_are_valid(self, fixture_image):
        for det in self.body["detections"]:
            assert det["class_name"] in VALID_CLASS_NAMES, (
                f"Unknown class_name: {det['class_name']!r}"
            )

    def test_confidence_in_range(self, fixture_image):
        for det in self.body["detections"]:
            assert 0.0 <= det["confidence"] <= 1.0

    def test_bbox_coordinates_valid(self, fixture_image):
        for det in self.body["detections"]:
            bbox = det["bbox"]
            assert bbox["x2"] > bbox["x1"] and bbox["y2"] > bbox["y1"]

    def test_print_results(self, fixture_image):
        """Shows what was detected — visible with pytest -s."""
        print(f"\n{'─' * 60}")
        print(f"  Image: {self.image_name}   detections: {self.body['count']}  (confidence ≥ 0.40)")
        print(f"{'─' * 60}")
        for i, det in enumerate(self.body["detections"], 1):
            print(
                f"  [{i}] class={det['class_name']:<15} "
                f"conf={det['confidence']:.0%}  "
                f"bbox=({det['bbox']['x1']:.0f},{det['bbox']['y1']:.0f},"
                f"{det['bbox']['x2']:.0f},{det['bbox']['y2']:.0f})"
            )
        print(f"{'─' * 60}")
        assert True


# ════════════════════════════════════════════════════════════════════════════
# Error handling (runs once, uses a synthetic bad image)
# ════════════════════════════════════════════════════════════════════════════

class TestErrorHandling:

    def test_corrupt_image_returns_400(self):
        r = requests.post(
            f"{BASE_URL}/detect",
            files={"image": ("bad.jpg", b"not-an-image", "image/jpeg")},
        )
        assert r.status_code == 400

    def test_detect_with_image_returns_base64_jpeg(self):
        images = all_fixture_images()
        if not images:
            pytest.skip("No fixture images")
        img_bytes = to_jpeg_bytes(images[0])
        r = requests.post(
            f"{BASE_URL}/detect-with-image",
            files={"image": (images[0].name, img_bytes, "image/jpeg")},
        )
        assert r.status_code == 200
        assert r.json().get("annotated_image", "").startswith("data:image/jpeg;base64,")