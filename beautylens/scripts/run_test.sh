#!/bin/bash
# ─────────────────────────────────────────────────────────────
# BeautyLens — Backend Test Runner
# Run from: ~/Desktop/SkillCred/beautylens
# Usage:    bash scripts/run_tests.sh
# ─────────────────────────────────────────────────────────────

set -e  # Exit on first failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     BeautyLens Backend Test Runner       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Check we're in the right place ───────────────────
if [ ! -f "$PROJECT_DIR/requirements.txt" ]; then
  echo "❌  Error: Run this script from beautylens/"
  echo "    cd ~/Desktop/SkillCred/beautylens"
  echo "    bash scripts/run_tests.sh"
  exit 1
fi

cd "$PROJECT_DIR"

# ── Step 2: Activate venv ────────────────────────────────────
if [ -f "venv/bin/activate" ]; then
  echo "✓  Activating virtual environment..."
  source venv/bin/activate
else
  echo "⚠️  No venv found — using system Python"
  echo "   Create one with: python3.11 -m venv venv"
fi

echo "✓  Python: $(python --version)"
echo "✓  Location: $(which python)"
echo ""

# ── Step 3: Install test dependencies ────────────────────────
echo "📦  Installing test dependencies..."
pip install pytest httpx pytest-asyncio fastapi --quiet
echo "✓  Dependencies ready"
echo ""

# ── Step 4: Set environment variables ────────────────────────
export MODEL_PATH="models/final/best.pt"
export ALLOWED_ORIGINS="http://localhost:19000"
export PYTHONPATH="$PROJECT_DIR"

# ── Step 5: Run tests ─────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪  TEST 1: Product Classes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
python -m pytest src/tests/test_product_classes.py -v --tb=short
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪  TEST 2: API Endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
python -m pytest src/tests/test_api_endpoints.py -v --tb=short
echo ""

# ── Step 6: Run all together with coverage summary ───────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊  FULL SUITE SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
python -m pytest src/tests/ -v --tb=short --no-header \
  --ignore=src/tests/__init__.py 2>&1 | tail -20

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║            Tests Complete ✓              ║"
echo "╚══════════════════════════════════════════╝"
echo ""