"""
Cross-brand shade recommendations: given a completed skin scan (depth +
undertone) and the owning profile's preferences, return the top matches from
the shade catalog with plain-language explanations.
"""
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.api.db import get_db
from src.api.firebase_auth import FirebaseUser, get_current_user
from src.api.matching import MATCH_QUALITY_POOR, find_matches
from src.api.ownership import require_owned_profile, require_owned_scan
from src.api.skin_analysis import lab_to_hex

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("")
def get_recommendations(
    profile_id: int,
    scan_id: int,
    category: Literal["foundation", "concealer"] = "foundation",
    top_n: int = Query(default=5, ge=1, le=10),
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = require_owned_profile(db, user, profile_id)
    scan = require_owned_scan(db, user, scan_id)

    if scan.profile_id != profile_id:
        raise HTTPException(status_code=400, detail="Scan does not belong to this profile")

    try:
        matches = find_matches(db, scan, profile, category=category, top_n=top_n)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Quality of the *best* match, so the app can lead with an honest headline
    # instead of presenting a poor match as if it were a good one.
    best_quality = matches[0]["match_quality"] if matches else MATCH_QUALITY_POOR

    # The scan's own measured colour, so the UI can put the user's tone beside
    # each shade swatch -- a match is far easier to judge as a comparison than
    # as a Delta E number.
    analysis = json.loads(scan.analysis_json) if scan.analysis_json else {}
    mean_lab = analysis.get("mean_lab") or {}
    skin_hex = (
        lab_to_hex(mean_lab["l"], mean_lab["a"], mean_lab["b"])
        if {"l", "a", "b"} <= mean_lab.keys() else None
    )

    return {
        "status": "success",
        "scan_id": scan.id,
        "skin_hex": skin_hex,
        "depth_category": scan.depth_category,
        "undertone_category": scan.user_override_undertone or scan.undertone_category,
        "category": category,
        "best_match_quality": best_quality,
        # True when nothing in the catalog is genuinely close -- a gap in our
        # shade range, not a failure of the user's scan. Worth saying plainly.
        "catalog_gap": best_quality == MATCH_QUALITY_POOR,
        "recommendations": matches,
    }
