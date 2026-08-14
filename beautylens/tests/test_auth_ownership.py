"""
Tests for firebase_auth.py (bearer-token verification) and ownership.py
(per-user row scoping) -- the security layer every authenticated endpoint
depends on.

Firebase itself is never contacted: firebase_admin is made to look
initialised and verify_id_token is monkeypatched per test, so the suite
exercises OUR handling of every verification outcome (missing/malformed
header, expired/revoked/invalid token, uid extraction) rather than
Google's SDK. Ownership checks run against an in-memory SQLite database.
"""
from unittest.mock import MagicMock

import firebase_admin
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from firebase_admin import auth as firebase_auth_admin
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import src.api.firebase_auth as fa
from src.api.db import Base
from src.api.firebase_auth import FirebaseUser, get_current_user
from src.api.models_db import SkinScan, UserProfile
from src.api.ownership import require_owned_profile, require_owned_scan


# ── Minimal app exposing the dependency under test ──────────────────────────

app = FastAPI()


@app.get("/whoami")
def whoami(user: FirebaseUser = Depends(get_current_user)):
    return {
        "uid": user.uid,
        "email": user.email,
        "name": user.name,
        "email_verified": user.email_verified,
    }


client = TestClient(app)


@pytest.fixture
def initialised(monkeypatch):
    """Make firebase_admin look initialised without real credentials."""
    monkeypatch.setattr(firebase_admin, "_apps", {"[DEFAULT]": MagicMock()})


@pytest.fixture
def verify(monkeypatch, initialised):
    """Patch verify_id_token; tests set .return_value / .side_effect."""
    mock = MagicMock()
    monkeypatch.setattr(fa.firebase_auth_admin, "verify_id_token", mock)
    return mock


# ── Bearer-token extraction ──────────────────────────────────────────────────

class TestBearerExtraction:
    def test_missing_header_is_401(self, initialised):
        resp = client.get("/whoami")
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Missing Authorization header"
        assert resp.headers["WWW-Authenticate"] == "Bearer"

    def test_non_bearer_scheme_is_401(self, initialised):
        resp = client.get("/whoami", headers={"Authorization": "Basic abc123"})
        assert resp.status_code == 401
        assert "Bearer <token>" in resp.json()["detail"]

    def test_bearer_with_empty_token_is_401(self, initialised):
        resp = client.get("/whoami", headers={"Authorization": "Bearer   "})
        assert resp.status_code == 401
        assert "Bearer <token>" in resp.json()["detail"]

    def test_scheme_is_case_insensitive(self, verify):
        verify.return_value = {"uid": "u1"}
        resp = client.get("/whoami", headers={"Authorization": "bearer tok"})
        assert resp.status_code == 200
        verify.assert_called_once_with("tok")

    def test_token_is_stripped(self, verify):
        verify.return_value = {"uid": "u1"}
        resp = client.get("/whoami", headers={"Authorization": "Bearer  tok  "})
        assert resp.status_code == 200
        verify.assert_called_once_with("tok")


# ── Verification outcomes ─────────────────────────────────────────────────────

class TestVerification:
    def test_valid_token_maps_all_claims(self, verify):
        verify.return_value = {
            "uid": "u1",
            "email": "a@b.c",
            "name": "Ada",
            "email_verified": True,
        }
        resp = client.get("/whoami", headers={"Authorization": "Bearer t"})
        assert resp.status_code == 200
        assert resp.json() == {
            "uid": "u1", "email": "a@b.c", "name": "Ada", "email_verified": True,
        }

    def test_user_id_claim_is_accepted_as_uid_fallback(self, verify):
        verify.return_value = {"user_id": "u2"}
        resp = client.get("/whoami", headers={"Authorization": "Bearer t"})
        assert resp.status_code == 200
        assert resp.json()["uid"] == "u2"

    def test_display_name_claim_is_accepted_as_name_fallback(self, verify):
        verify.return_value = {"uid": "u1", "displayName": "Ada"}
        resp = client.get("/whoami", headers={"Authorization": "Bearer t"})
        assert resp.json()["name"] == "Ada"

    def test_token_without_uid_is_401(self, verify):
        verify.return_value = {"email": "a@b.c"}
        resp = client.get("/whoami", headers={"Authorization": "Bearer t"})
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Token has no uid"

    def test_expired_token_is_401_with_refresh_hint(self, verify):
        verify.side_effect = firebase_auth_admin.ExpiredIdTokenError("expired", None)
        resp = client.get("/whoami", headers={"Authorization": "Bearer t"})
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    def test_revoked_token_is_401_with_signin_hint(self, verify):
        verify.side_effect = firebase_auth_admin.RevokedIdTokenError("revoked")
        resp = client.get("/whoami", headers={"Authorization": "Bearer t"})
        assert resp.status_code == 401
        assert "revoked" in resp.json()["detail"].lower()

    def test_any_other_verification_error_is_generic_401(self, verify):
        # The generic catch must not leak SDK internals to the client.
        verify.side_effect = ValueError("internal cert fetch details")
        resp = client.get("/whoami", headers={"Authorization": "Bearer t"})
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid ID token"

    def test_uninitialised_firebase_is_503_with_setup_hint(self, monkeypatch):
        monkeypatch.setattr(firebase_admin, "_apps", {})
        monkeypatch.setattr(fa, "init_firebase", lambda: "setup hint here")
        resp = client.get("/whoami", headers={"Authorization": "Bearer t"})
        assert resp.status_code == 503
        assert resp.json()["detail"] == "setup hint here"


# ── Ownership scoping ─────────────────────────────────────────────────────────

@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def _user(uid="owner-uid"):
    return FirebaseUser(uid=uid, email=None, name=None, email_verified=True)


@pytest.fixture
def owned_profile(db):
    profile = UserProfile(firebase_uid="owner-uid")
    db.add(profile)
    db.commit()
    return profile


class TestOwnership:
    def test_missing_profile_is_404(self, db):
        with pytest.raises(Exception) as exc:
            require_owned_profile(db, _user(), 999)
        assert exc.value.status_code == 404

    def test_owned_profile_is_returned(self, db, owned_profile):
        result = require_owned_profile(db, _user(), owned_profile.id)
        assert result.id == owned_profile.id

    def test_foreign_profile_is_404_not_403(self, db, owned_profile):
        # Deliberately indistinguishable from "doesn't exist": a caller
        # probing ids must not learn that a profile exists but isn't theirs.
        with pytest.raises(Exception) as exc:
            require_owned_profile(db, _user(uid="attacker-uid"), owned_profile.id)
        assert exc.value.status_code == 404
        assert exc.value.detail == "Profile not found"

    def test_missing_scan_is_404(self, db):
        with pytest.raises(Exception) as exc:
            require_owned_scan(db, _user(), 999)
        assert exc.value.status_code == 404

    def test_owned_scan_is_returned(self, db, owned_profile):
        scan = SkinScan(profile_id=owned_profile.id)
        db.add(scan)
        db.commit()
        result = require_owned_scan(db, _user(), scan.id)
        assert result.id == scan.id

    def test_scan_of_foreign_profile_is_404(self, db, owned_profile):
        scan = SkinScan(profile_id=owned_profile.id)
        db.add(scan)
        db.commit()
        with pytest.raises(Exception) as exc:
            require_owned_scan(db, _user(uid="attacker-uid"), scan.id)
        assert exc.value.status_code == 404
