"""
Session bootstrap: turns a verified Firebase identity into the beauty profile
the rest of the API keys off.

The app calls POST /auth/session right after sign-in. That endpoint is the only
place a profile becomes attached to a uid, and it handles the migration case:
profiles created before auth existed have no uid, so the first account to sign
in on that device can *claim* the existing profile and keep its scan history
instead of starting over with an empty one.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.db import get_db
from src.api.firebase_auth import FirebaseUser, get_current_user
from src.api.models_db import UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])


class SessionRequest(BaseModel):
    # The device-local profile id from AsyncStorage, if this device had one
    # before the user ever signed in. Only honoured when that profile is
    # genuinely unclaimed -- see _claim_profile.
    claim_profile_id: Optional[int] = None


class SessionOut(BaseModel):
    profile_id: int
    firebase_uid: str
    email: Optional[str]
    display_name: Optional[str]
    skin_type: str
    coverage_preference: str
    finish_preference: str
    budget_max: Optional[float]
    # "existing" | "claimed" | "created" -- lets the app decide whether to send
    # the user through onboarding or straight to their results.
    profile_origin: str


def _to_session_out(profile: UserProfile, origin: str) -> SessionOut:
    return SessionOut(
        profile_id=profile.id,
        firebase_uid=profile.firebase_uid,
        email=profile.email,
        display_name=profile.display_name,
        skin_type=profile.skin_type,
        coverage_preference=profile.coverage_preference,
        finish_preference=profile.finish_preference,
        budget_max=profile.budget_max,
        profile_origin=origin,
    )


def _claim_profile(db: Session, user: FirebaseUser, profile_id: int) -> Optional[UserProfile]:
    """
    Attach an existing uid-less profile to this account. Returns None if the
    profile doesn't exist or already belongs to someone else -- claiming is
    strictly opt-in on unowned rows, so one account can never take over
    another's history by passing its id.
    """
    candidate = db.get(UserProfile, profile_id)
    if candidate is None or candidate.firebase_uid is not None:
        return None

    candidate.firebase_uid = user.uid
    candidate.email = user.email
    candidate.display_name = user.name
    return candidate


@router.post("/session", response_model=SessionOut)
def create_session(
    data: SessionRequest,
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(UserProfile).filter(UserProfile.firebase_uid == user.uid).first()
    if existing is not None:
        # Keep the profile's contact details in step with the Firebase account
        # (e.g. the user changed their display name or verified a new email).
        existing.email = user.email
        existing.display_name = user.name
        db.commit()
        db.refresh(existing)
        return _to_session_out(existing, "existing")

    origin = "created"
    profile: Optional[UserProfile] = None

    if data.claim_profile_id is not None:
        profile = _claim_profile(db, user, data.claim_profile_id)
        if profile is not None:
            origin = "claimed"

    if profile is None:
        profile = UserProfile(
            firebase_uid=user.uid,
            email=user.email,
            display_name=user.name,
        )
        db.add(profile)

    db.commit()
    db.refresh(profile)
    return _to_session_out(profile, origin)


@router.get("/me", response_model=SessionOut)
def get_me(
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(UserProfile).filter(UserProfile.firebase_uid == user.uid).first()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile for this account yet. Call POST /auth/session first.",
        )
    return _to_session_out(profile, "existing")


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete this account's profile and everything hanging off it (scans, owned
    products, feedback all cascade). The Firebase user itself is deleted by the
    app via the client SDK, which requires a recent login.
    """
    profile = db.query(UserProfile).filter(UserProfile.firebase_uid == user.uid).first()
    if profile is not None:
        db.delete(profile)
        db.commit()
    return None
