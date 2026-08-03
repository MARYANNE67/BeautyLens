"""
SQLAlchemy models for the shade-matching feature.

DEPTH_CATEGORIES and UNDERTONE_CATEGORIES are the fixed vocabularies used
across the beauty profile, skin scans, and the shade catalog so matching
(src/api/matching.py, added in a later phase) can compare like-for-like.
"""
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text, ForeignKey, DateTime
)
from sqlalchemy.orm import relationship

from src.api.db import Base

DEPTH_CATEGORIES = [
    "fair", "light", "light-medium", "medium",
    "medium-deep", "deep", "rich-deep",
]
UNDERTONE_CATEGORIES = ["cool", "neutral", "warm", "olive"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True)
    # Firebase identity. Nullable because profiles created before auth existed
    # (and the device-local profiles the app still creates during onboarding)
    # have no uid until an account claims them -- see routers/auth.py.
    firebase_uid = Column(String, nullable=True, unique=True, index=True)
    email = Column(String, nullable=True)
    display_name = Column(String, nullable=True)

    skin_type = Column(String, nullable=False, default="uncertain")  # dry/oily/combination/uncertain
    coverage_preference = Column(String, nullable=False, default="uncertain")  # light/medium/full/uncertain
    finish_preference = Column(String, nullable=False, default="uncertain")  # matte/natural/radiant/uncertain
    budget_max = Column(Float, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    scans = relationship("SkinScan", back_populates="profile", cascade="all, delete-orphan")
    owned_products = relationship("OwnedProduct", back_populates="profile", cascade="all, delete-orphan")
    feedback = relationship("RecommendationFeedback", back_populates="profile", cascade="all, delete-orphan")


class ShadeProduct(Base):
    """Curated shade catalog (seeded from data/shade_catalog_seed.json)."""
    __tablename__ = "shade_products"

    id = Column(Integer, primary_key=True)
    brand = Column(String, nullable=False, index=True)
    product_line = Column(String, nullable=False)
    shade_name = Column(String, nullable=False)
    category = Column(String, nullable=False, index=True)  # foundation | concealer
    depth_category = Column(String, nullable=False, index=True)
    undertone_category = Column(String, nullable=False, index=True)
    # Approximate CIELAB coordinates for the shade, used for Delta E distance in matching.py
    lab_l = Column(Float, nullable=False)
    lab_a = Column(Float, nullable=False)
    lab_b = Column(Float, nullable=False)
    finish = Column(String, nullable=False)  # matte | natural | radiant
    coverage = Column(String, nullable=False)  # light | medium | full
    skin_types = Column(String, nullable=False, default="")  # comma-separated, e.g. "dry,combination"
    # Nullable because most sources don't publish price. NULL means "we don't
    # know", which the UI must render as unknown -- the previous non-null column
    # forced a fabricated per-brand guess onto 63% of the catalog and then
    # displayed it as if it were retail fact.
    price = Column(Float, nullable=True)
    currency = Column(String, nullable=True, default="USD")
    # Retailer/brand product page, when the source provides one.
    source_url = Column(String, nullable=True)


class SkinScan(Base):
    __tablename__ = "skin_scans"

    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("user_profiles.id"), nullable=False)

    quality_passed = Column(Boolean, nullable=False, default=False)
    depth_category = Column(String, nullable=True)
    undertone_category = Column(String, nullable=True)
    undertone_confidence = Column(Float, nullable=True)
    undertone_confirmed = Column(Boolean, nullable=False, default=False)
    user_override_undertone = Column(String, nullable=True)  # set if user disagrees with the estimate
    # JSON-encoded intermediate data: per-region LAB values, quality-check reasons,
    # questionnaire answers used for undertone scoring, etc. Kept as free-form JSON
    # rather than columns since the analysis pipeline (Phase 3/4) is still evolving.
    analysis_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    profile = relationship("UserProfile", back_populates="scans")


class OwnedProduct(Base):
    """A product the user says already works for them (spec's Mode A evidence)."""
    __tablename__ = "owned_products"

    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("user_profiles.id"), nullable=False)
    shade_product_id = Column(Integer, ForeignKey("shade_products.id"), nullable=True)
    brand = Column(String, nullable=True)  # free text if not matched to catalog
    shade_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    profile = relationship("UserProfile", back_populates="owned_products")
    shade_product = relationship("ShadeProduct")


class RecommendationFeedback(Base):
    __tablename__ = "recommendation_feedback"

    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("user_profiles.id"), nullable=False)
    scan_id = Column(Integer, ForeignKey("skin_scans.id"), nullable=True)
    shade_product_id = Column(Integer, ForeignKey("shade_products.id"), nullable=False)
    worked = Column(Boolean, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    profile = relationship("UserProfile", back_populates="feedback")
    scan = relationship("SkinScan")
    shade_product = relationship("ShadeProduct")
