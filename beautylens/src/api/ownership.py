"""
Ownership checks shared by the authenticated routers.

Every route that reads or writes user data resolves its target through here, so
the rule "you can only touch rows attached to your own verified uid" lives in
exactly one place rather than being re-implemented per endpoint.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.api.firebase_auth import FirebaseUser
from src.api.models_db import SkinScan, UserProfile


def require_owned_profile(db: Session, user: FirebaseUser, profile_id: int) -> UserProfile:
    profile = db.get(UserProfile, profile_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    if profile.firebase_uid != user.uid:
        # Deliberately 404 rather than 403: a caller probing profile ids should
        # not be able to tell "exists but isn't yours" from "doesn't exist".
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    return profile


def require_owned_scan(db: Session, user: FirebaseUser, scan_id: int) -> SkinScan:
    scan = db.get(SkinScan, scan_id)
    if scan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")

    require_owned_profile(db, user, scan.profile_id)
    return scan
