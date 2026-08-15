#!/bin/sh
set -e

# Model weights and the shade catalog live in a Hugging Face model repo, not
# in git -- fetch them once at container start (skipped when both exist, e.g.
# in a local build where they were present in the build context).
if [ ! -f "${MODEL_PATH:-models/final/best.pt}" ] || [ ! -f "data/shade_catalog_seed.json" ]; then
  python deploy/fetch_artifacts.py
fi

# Single worker on purpose: the rate limiter is in-memory/per-process, and
# SQLite is a single-writer store.
exec uvicorn src.api.main:app --host 0.0.0.0 --port "${PORT:-7860}" --workers 1
