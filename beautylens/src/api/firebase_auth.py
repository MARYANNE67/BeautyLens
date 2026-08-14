"""
Firebase ID token verification.

The mobile app signs in with Firebase (email/password or Google) and sends the
resulting ID token as `Authorization: Bearer <token>`. Everything server-side
derives the user's identity from the *verified* token rather than from anything
the client claims, so a caller cannot read another user's scans by guessing a
profile id.

Two things are required, and both are checked at startup so a misconfiguration
shows up in the server log rather than as a 401 on every request:

  * a credential -- firebase-admin builds an AuthorizedSession to fetch Google's
    signing certs, so verify_id_token needs real credentials even though the
    cert endpoint itself is public.
  * a project id -- verify_id_token checks the token's `aud` claim against it.
    Taken from FIREBASE_PROJECT_ID, else the service-account file, else
    EXPO_PUBLIC_FIREBASE_PROJECT_ID (already set for the mobile app).

Credentials are resolved in this order:
  1. FIREBASE_CREDENTIALS_JSON  -- the service-account JSON inline (for hosts
     like Render/Railway where you can only set env vars, not upload files).
  2. FIREBASE_CREDENTIALS_FILE  -- path to the downloaded service-account .json.
  3. GOOGLE_APPLICATION_CREDENTIALS / workload identity -- the Google default,
     which is what you get for free on Cloud Run / GCE.
"""
import json
import os
import threading
from typing import Optional

import firebase_admin
from fastapi import Depends, HTTPException, Request, status
from firebase_admin import auth as firebase_auth_admin
from firebase_admin import credentials

_init_lock = threading.Lock()
_init_error: Optional[str] = None

CREDENTIAL_HINT = (
    "Firebase Admin has no usable credentials. In Firebase Console open "
    "Project settings > Service accounts > Generate new private key, save the "
    ".json outside the repo, and set FIREBASE_CREDENTIALS_FILE to its path in "
    ".env. See .env.example."
)

PROJECT_HINT = (
    "Firebase Admin has no project id. Set FIREBASE_PROJECT_ID (or "
    "EXPO_PUBLIC_FIREBASE_PROJECT_ID) in .env to your Firebase project id, e.g. "
    "beautylens-xxxxx. See .env.example."
)

# Kept for callers that just want "something is wrong with Firebase setup".
SETUP_HINT = CREDENTIAL_HINT


def _build_credential():
    inline = os.getenv("FIREBASE_CREDENTIALS_JSON")
    if inline:
        return credentials.Certificate(json.loads(inline))

    path = os.getenv("FIREBASE_CREDENTIALS_FILE")
    if path:
        if not os.path.exists(path):
            raise FileNotFoundError(f"FIREBASE_CREDENTIALS_FILE points to a missing file: {path}")
        return credentials.Certificate(path)

    # Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS, or the
    # metadata server on Cloud Run/GCE). Resolved eagerly here -- the object
    # itself is lazy, so without this call a missing ADC would only surface as a
    # DefaultCredentialsError on the first verified request.
    credential = credentials.ApplicationDefault()
    credential.get_credential()
    return credential


def _resolve_project_id(credential) -> Optional[str]:
    explicit = os.getenv("FIREBASE_PROJECT_ID")
    if explicit:
        return explicit

    project_id = getattr(credential, "project_id", None)
    if project_id:
        return project_id

    # The mobile app's own config already carries the project id, so a single
    # .env value configures both sides.
    return os.getenv("EXPO_PUBLIC_FIREBASE_PROJECT_ID")


def init_firebase() -> Optional[str]:
    """
    Initialise the Admin SDK once. Returns None on success, or an error string
    so startup can log a clear diagnostic instead of crashing the whole API
    (the YOLO detection endpoints don't need auth and should stay usable).
    """
    global _init_error

    with _init_lock:
        if firebase_admin._apps:
            return None
        try:
            credential = _build_credential()
        except Exception as e:  # noqa: BLE001 -- surfaced to the caller as a message
            _init_error = f"{CREDENTIAL_HINT} (underlying error: {e})"
            return _init_error

        try:
            project_id = _resolve_project_id(credential)
            if not project_id:
                # Without this, initialize_app succeeds but every verify_id_token
                # fails with "A project ID is required" -- fail loudly here instead.
                _init_error = PROJECT_HINT
                return _init_error

            firebase_admin.initialize_app(credential, options={"projectId": project_id})
            _init_error = None
        except Exception as e:  # noqa: BLE001 -- surfaced to the caller as a message
            _init_error = f"{CREDENTIAL_HINT} (underlying error: {e})"
        return _init_error


def _require_initialised() -> None:
    if not firebase_admin._apps:
        error = init_firebase()
        if error:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=error)


class FirebaseUser:
    """The verified caller. Only ever built from a token that passed verification."""

    def __init__(self, uid: str, email: Optional[str], name: Optional[str], email_verified: bool):
        self.uid = uid
        self.email = email
        self.name = name
        self.email_verified = email_verified


def _extract_bearer_token(request: Request) -> str:
    header = request.headers.get("Authorization") or request.headers.get("authorization")
    if not header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must be in the form 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token.strip()


def get_current_user(request: Request) -> FirebaseUser:
    """FastAPI dependency: verifies the bearer token and returns the caller."""
    _require_initialised()
    token = _extract_bearer_token(request)

    try:
        # check_revoked is required for RevokedIdTokenError to ever be raised;
        # without it the revoked-token branch below is dead code and a revoked
        # token keeps working until its natural ~1h expiry. Costs one extra
        # Firebase round-trip per verification -- acceptable at this app's
        # authenticated traffic volume.
        decoded = firebase_auth_admin.verify_id_token(token, check_revoked=True)
    except firebase_auth_admin.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ID token has expired. Refresh it and retry.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except firebase_auth_admin.RevokedIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ID token has been revoked. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid ID token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    uid = decoded.get("uid") or decoded.get("user_id")
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has no uid")

    return FirebaseUser(
        uid=uid,
        email=decoded.get("email"),
        name=decoded.get("name") or decoded.get("displayName"),
        email_verified=bool(decoded.get("email_verified")),
    )


CurrentUser = Depends(get_current_user)
