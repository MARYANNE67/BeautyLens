"""
Shared pytest configuration for BeautyLens test suite.
"""
import sys
from pathlib import Path

# Make sure src/ is importable regardless of where pytest is run from
repo_root = Path(__file__).resolve().parents[1]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))
# Rate limiting off for the suite: dozens of tests hammer /detect from the
# same TestClient "IP" and would trip the per-client limits. The middleware
# itself is unit-tested directly in test_security.py with injected limits.
import os  # noqa: E402
os.environ.setdefault("RATE_LIMIT_DISABLED", "1")
# Admin endpoints (/load-model, /set-confidence) are gated off by default;
# the suite exercises them directly, so enable them here. Disabled-state
# behaviour is tested explicitly in test_security.py.
os.environ.setdefault("ADMIN_ENDPOINTS_ENABLED", "1")
