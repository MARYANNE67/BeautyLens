"""
Guided skin-scan capture. Phase 2 covers quality-gating a single frame before
it's accepted into the 3-shot (front/left/right) scan; Phase 3 adds skin
depth estimation from the 3 accepted photos; Phase 4 adds undertone
estimation (image + questionnaire + optional owned-product evidence) and
lets the user confirm or override the result.
"""
import json
from typing import Literal, Optional

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.db import get_db
from src.api.firebase_auth import FirebaseUser, get_current_user
from src.api.models_db import SkinScan
from src.api.ownership import require_owned_profile, require_owned_scan
from src.api.skin_analysis import assess_capture_quality, estimate_skin_depth
from src.api.undertone import estimate_undertone

router = APIRouter(prefix="/skin-scan", tags=["skin-scan"])

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB, matches main.py's limit


def _scan_response(scan: SkinScan) -> dict:
    analysis = json.loads(scan.analysis_json) if scan.analysis_json else {}

    return {
        "status": "success",
        "scan_id": scan.id,
        "profile_id": scan.profile_id,
        "depth_category": scan.depth_category,
        "undertone_category": scan.undertone_category,
        "undertone_confirmed": scan.undertone_confirmed,
        "user_override_undertone": scan.user_override_undertone,
        "mean_lab": analysis.get("mean_lab"),
        "is_complete": bool(scan.depth_category and scan.undertone_category),
    }


@router.post("/quality-check")
async def quality_check(
    image: UploadFile = File(...),
    user: FirebaseUser = Depends(get_current_user),
):
    """
    Assess a single captured frame for brightness/blur/exposure/color-cast/
    face-position issues before it's accepted into the skin scan.
    """
    image_bytes = await image.read()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file received")
    if len(image_bytes) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds maximum allowed size of {MAX_UPLOAD_SIZE // (1024 * 1024)}MB",
        )

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image format - could not decode image")

    result = assess_capture_quality(img)
    return {"status": "success", **result.to_dict()}


def _decode_upload(image_bytes: bytes, field_name: str) -> np.ndarray:
    if not image_bytes:
        raise HTTPException(status_code=400, detail=f"Empty image file received for '{field_name}'")
    if len(image_bytes) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"'{field_name}' exceeds maximum allowed size of {MAX_UPLOAD_SIZE // (1024 * 1024)}MB",
        )
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail=f"Invalid image format for '{field_name}'")
    return img


@router.post("/analyze")
async def analyze_skin_scan(
    profile_id: int = Form(...),
    front: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Estimate skin depth from the 3 quality-gated captures (see
    /skin-scan/quality-check, which the frontend runs on each photo before
    it's ever sent here) and persist a SkinScan row for this profile.
    """
    require_owned_profile(db, user, profile_id)

    images = {
        "front": _decode_upload(await front.read(), "front"),
        "left": _decode_upload(await left.read(), "left"),
        "right": _decode_upload(await right.read(), "right"),
    }

    result = estimate_skin_depth(images)

    if not result["success"]:
        raise HTTPException(
            status_code=422,
            detail="No face detected in any of the 3 photos. Please retake the scan.",
        )

    scan = SkinScan(
        profile_id=profile_id,
        quality_passed=True,
        depth_category=result["depth_category"],
        # Everything the estimate was derived from is persisted, not just its
        # output. A wrong shade is otherwise undiagnosable after the fact: the
        # photos are gone, so without the per-region samples, the white-balance
        # gains and the rejected samples there is no way to tell a bad landmark
        # from a bad correction from genuinely unusual skin.
        analysis_json=json.dumps({
            "mean_lab": result["mean_lab"],
            "contributing_regions": result["contributing_regions"],
            "images_used": result["images_used"],
            "images_skipped": result["images_skipped"],
            "per_image_regions": result["per_image_regions"],
            "white_balance": result["white_balance"],
            "rejected_regions": result["rejected_regions"],
        }),
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    return {
        "status": "success",
        "scan_id": scan.id,
        "depth_category": scan.depth_category,
        "mean_lab": result["mean_lab"],
        "contributing_regions": result["contributing_regions"],
        "images_used": result["images_used"],
        "images_skipped": result["images_skipped"],
    }


@router.get("/latest")
def get_latest_scan(
    profile_id: int,
    completed_only: bool = False,
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch the newest skin scan for a profile. This lets the mobile app recover
    after local AsyncStorage loses the scan id while the backend still has a
    completed scan for the profile.
    """
    require_owned_profile(db, user, profile_id)

    query = db.query(SkinScan).filter(SkinScan.profile_id == profile_id)
    if completed_only:
        query = query.filter(
            SkinScan.depth_category.isnot(None),
            SkinScan.undertone_category.isnot(None),
        )

    scan = query.order_by(SkinScan.created_at.desc(), SkinScan.id.desc()).first()
    if scan is None:
        raise HTTPException(status_code=404, detail="Skin scan not found")

    return _scan_response(scan)


@router.get("/{scan_id}")
def get_scan(
    scan_id: int,
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch a previously completed scan -- lets the app check whether a
    profile already has a finished skin scan (and skip straight to
    recommendations) instead of always re-running the capture flow.
    """
    return _scan_response(require_owned_scan(db, user, scan_id))


FoundationProblem = Literal["too_orange", "too_pink", "ashy_grey", "uncertain"]
JewelryPreference = Literal["gold", "silver", "both", "uncertain"]
VeinColor = Literal["green", "blue_purple", "mixture", "uncertain"]
UndertoneCategory = Literal["cool", "neutral", "warm", "olive"]


class UndertoneRequest(BaseModel):
    scan_id: int
    foundation_problem: FoundationProblem = "uncertain"
    jewelry_preference: JewelryPreference = "uncertain"
    vein_color: VeinColor = "uncertain"
    owned_undertone: Optional[UndertoneCategory] = None


@router.post("/undertone")
def undertone(
    data: UndertoneRequest,
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Estimate undertone for a scan that already has a depth analysis (see
    /skin-scan/analyze), combining its LAB signal with the questionnaire
    answers, and persist the result onto the same SkinScan row.
    """
    scan = require_owned_scan(db, user, data.scan_id)
    if not scan.analysis_json:
        raise HTTPException(
            status_code=400,
            detail="Scan has no depth analysis yet. Run /skin-scan/analyze first.",
        )

    analysis = json.loads(scan.analysis_json)
    mean_lab = analysis.get("mean_lab")
    if not mean_lab:
        raise HTTPException(status_code=400, detail="Scan analysis is missing LAB data")

    result = estimate_undertone(
        mean_a=mean_lab["a"],
        mean_b=mean_lab["b"],
        foundation_problem=data.foundation_problem,
        jewelry_preference=data.jewelry_preference,
        vein_color=data.vein_color,
        owned_undertone=data.owned_undertone,
        # Scored against the centers for this scan's own depth band, so the
        # estimate isn't just re-reading depth as undertone.
        depth_category=scan.depth_category,
    )

    analysis["undertone"] = {
        "category": result["category"],
        "confidence": result["confidence"],
        "scores": result["scores"],
        "reasoning": result["reasoning"],
        "signals_used": result["signals_used"],
        "questionnaire": {
            "foundation_problem": data.foundation_problem,
            "jewelry_preference": data.jewelry_preference,
            "vein_color": data.vein_color,
            "owned_undertone": data.owned_undertone,
        },
    }
    scan.analysis_json = json.dumps(analysis)
    scan.undertone_category = result["category"]
    scan.undertone_confidence = float(result["confidence"])
    db.commit()
    db.refresh(scan)

    return {
        "status": "success",
        "scan_id": scan.id,
        "category": result["category"],
        "confidence": result["confidence"],
        "reasoning": result["reasoning"],
        "scores": result["scores"],
    }


class UndertoneConfirmRequest(BaseModel):
    confirmed: bool
    override_category: Optional[UndertoneCategory] = None


@router.patch("/{scan_id}/confirm-undertone")
def confirm_undertone(
    scan_id: int,
    data: UndertoneConfirmRequest,
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record whether the user agreed with the estimated undertone, or
    picked a different category from the comparison cards."""
    scan = require_owned_scan(db, user, scan_id)

    scan.undertone_confirmed = data.confirmed
    if data.override_category:
        scan.user_override_undertone = data.override_category
    db.commit()
    db.refresh(scan)

    return {
        "status": "success",
        "scan_id": scan.id,
        "undertone_category": scan.undertone_category,
        "undertone_confirmed": scan.undertone_confirmed,
        "user_override_undertone": scan.user_override_undertone,
    }
