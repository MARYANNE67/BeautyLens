"""Loads data/shade_catalog_seed.json into the ShadeProduct table on startup, once."""
import json
from pathlib import Path

from sqlalchemy.orm import Session

from src.api.models_db import ShadeProduct

SEED_PATH = Path(__file__).resolve().parents[2] / "data" / "shade_catalog_seed.json"


def seed_shade_catalog(db: Session) -> int:
    """Insert seed shades if the table is empty. Returns number of rows inserted."""
    if db.query(ShadeProduct).first() is not None:
        return 0

    if not SEED_PATH.exists():
        print(f"Warning: shade catalog seed file not found at {SEED_PATH}")
        return 0

    shades = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    db.bulk_insert_mappings(ShadeProduct, shades)
    db.commit()
    return len(shades)
