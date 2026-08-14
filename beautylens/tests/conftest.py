"""
Shared pytest configuration for BeautyLens test suite.
"""
import sys
from pathlib import Path

# Make sure src/ is importable regardless of where pytest is run from
repo_root = Path(__file__).resolve().parents[1]
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))