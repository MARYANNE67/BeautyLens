"""
Beauty profile endpoints: skin type, coverage/finish preference, budget.
"I don't know" is a first-class value ("uncertain") everywhere, since the
target user is not assumed to know makeup terminology.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.api.db import get_db
from src.api.firebase_auth import FirebaseUser, get_current_user
from src.api.models_db import UserProfile
from src.api.ownership import require_owned_profile

router = APIRouter(prefix="/profile", tags=["profile"])

SkinType = Literal["dry", "oily", "combination", "uncertain"]
Coverage = Literal["light", "medium", "full", "uncertain"]
Finish = Literal["matte", "natural", "radiant", "uncertain"]


class ProfileCreate(BaseModel):
    skin_type: SkinType = "uncertain"
    coverage_preference: Coverage = "uncertain"
    finish_preference: Finish = "uncertain"
    budget_max: Optional[float] = Field(default=None, ge=0)


class ProfileUpdate(BaseModel):
    skin_type: Optional[SkinType] = None
    coverage_preference: Optional[Coverage] = None
    finish_preference: Optional[Finish] = None
    budget_max: Optional[float] = Field(default=None, ge=0)


class ProfileOut(BaseModel):
    id: int
    skin_type: str
    coverage_preference: str
    finish_preference: str
    budget_max: Optional[float]

    class Config:
        from_attributes = True


@router.post("", response_model=ProfileOut, status_code=201)
def create_profile(
    data: ProfileCreate,
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create this account's profile, or update it if one already exists.

    Upserting on uid rather than blindly inserting is deliberate: the old
    behaviour minted a fresh row on every call, which is how one person ended
    up with several profiles and an orphaned scan history.
    """
    existing = db.query(UserProfile).filter(UserProfile.firebase_uid == user.uid).first()
    if existing is not None:
        for field, value in data.model_dump().items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing

    profile = UserProfile(
        firebase_uid=user.uid,
        email=user.email,
        display_name=user.name,
        **data.model_dump(),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=ProfileOut)
def get_profile(
    profile_id: int,
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return require_owned_profile(db, user, profile_id)


@router.patch("/{profile_id}", response_model=ProfileOut)
def update_profile(
    profile_id: int,
    data: ProfileUpdate,
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = require_owned_profile(db, user, profile_id)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    return profile
