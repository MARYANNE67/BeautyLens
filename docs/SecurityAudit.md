# 7. Security Audit

## 7.1 Scope and Method

The application was audited against the course's secure-development checklist: input validation, XSS/injection, secret handling, least privilege, insecure direct object references (IDOR), and deployment security. Three methods were combined:

1. **Manual code review** of the FastAPI backend (all endpoints, auth, ownership) and the React Native frontend (WebView HTML construction, external data flows).
2. **Automated dependency scanning**: `npm audit` (frontend) and `pip-audit` (backend), as recommended in the course notes.
3. **Regression tests** for every code fix (`tests/test_security.py`, 15 tests), so the fixes cannot silently regress.

## 7.2 Findings and Fixes

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | `/load-model` loaded an arbitrary caller-supplied file path | Fixed |
| 2 | Medium | Untrusted colour strings embedded into a camera-holding WebView's script context | Fixed |
| 3 | Medium | `/detect` missing upload size cap and confidence bounds | Fixed |
| 4 | Medium | `/detect-product-brand` missing upload size cap | Fixed |
| 5 | Low | 35 npm vulnerabilities in the build/test toolchain | 3 fixed, 32 accepted |
| 6 | Low | `protobuf 3.20.3` has 2 known CVEs | Accepted (pinned) |
| 7 | Info | Unowned pre-auth profiles claimable by id | Accepted (by design) |
| 8 | Medium | Revoked Firebase tokens stayed valid until natural expiry (dead revocation branch) | Fixed |
| 9 | Medium | Unauthenticated admin endpoints mutated global state for all users | Fixed |

### Finding 1: `/load-model` arbitrary path loading (High)

The unauthenticated `/load-model` endpoint passed any caller-supplied path straight to `YOLO(path)`. YOLO `.pt` files are pickle-based, so loading an attacker-chosen path is a code-execution primitive, and the per-path error messages ("Model file not found: {path}") doubled as a filesystem-probing oracle.

**Fix:** the endpoint now only accepts `.pt` files that resolve inside the repository's `models/` directory (`Path.resolve` + `is_relative_to`, which also defeats `../` traversal), and every rejection or loader error returns a generic message that neither confirms nor denies anything about paths outside that directory.

### Finding 2: WebView script-context injection (Medium)

`ARMakeupWebView` builds its HTML by embedding the makeup layers as JSON inside a `<script>` block. The colour strings in those layers originate from untrusted data: the third-party makeup API's `hex_value` fields and OCR-derived shade text. A value like `</script><script>...` would have broken out of the script context and executed inside a WebView holding a live camera stream.

**Fix:** two layers of defence. Every layer is validated against strict whitelists before embedding (colour must match `^#[0-9a-fA-F]{3,8}$`, finish and category must be known values; anything else falls back to safe defaults), and `<` is escaped to `\u003c` in the embedded JSON so a script-context breakout is impossible even if validation is ever bypassed. The same escaping was applied to `TutorialWebView`'s embed for defence in depth.

### Findings 3 and 4: missing input limits on detection endpoints (Medium)

Every upload endpoint enforced the 10MB `MAX_UPLOAD_SIZE` except the two most used ones: the live `/detect` (the check existed only in a commented-out older version of the endpoint) and `/detect-product-brand`. `/detect`'s `confidence` query parameter also accepted any float, while `/set-confidence` validates the identical value.

**Fix:** both endpoints now return `413` for oversized bodies, and `/detect` returns `400` for confidence outside `(0, 1]`, matching `/set-confidence`.

### Finding 5: npm dependency vulnerabilities (Low, partially accepted)

`npm audit` reported 35 vulnerabilities (20 moderate, 15 high), all in transitive dependencies of the build/test toolchain (`brace-expansion`, `uuid`, `postcss`, `nanoid`, `js-yaml`), not in code shipped inside the app bundle. `npm audit fix` resolved 3 without breaking changes; the remaining 32 require major-version upgrades to the Expo SDK 54 toolchain (`npm audit fix --force`), which the project pins deliberately for Expo Go compatibility. **Accepted for now; revisit at the next Expo SDK upgrade.**

### Finding 6: protobuf CVEs (Low, accepted)

`pip-audit` found 2 known vulnerabilities in `protobuf 3.20.3` (fixed in ≥4.25.8). `mediapipe 0.10.9` requires `protobuf<4`, and mediapipe itself is pinned because newer versions remove the `mediapipe.solutions` API the backend uses. The vulnerable surface (parsing untrusted protobuf messages) is not exposed: the backend only parses its own model/mediapipe data, never caller-supplied protobufs. **Accepted with this rationale; revisit if mediapipe is upgraded.**

### Finding 7: profile claiming by id (Info, accepted design tradeoff)

`POST /auth/session` lets a signed-in account claim any *unowned* profile by id (profiles created on-device before sign-in). An account can never take over another account's profile, but it could claim a stranger's pre-auth scan history by guessing ids. This is a deliberate migration tradeoff, documented in `routers/auth.py`. A future hardening would be a device-held claim token instead of a raw id.

### Finding 8: dead token-revocation branch (Medium)

`firebase_auth.py` handled `RevokedIdTokenError`, but `verify_id_token(token)` was called without `check_revoked=True`, so that branch could never fire: a revoked token (user signed out everywhere, account disabled) kept working until its natural ~1 hour expiry.

**Fix:** `check_revoked=True` is now passed, making revocation effective at the cost of one extra Firebase round-trip per verification, acceptable at this application's authenticated traffic volume. The auth test suite asserts the flag is present so it cannot silently regress.

### Finding 9: unauthenticated global-state admin endpoints (Medium)

`/set-confidence` and `/load-model` are development tools that no app screen calls, yet both were reachable unauthenticated and mutate global state for every user: one changes the detection threshold app-wide, the other swaps the served model. An anonymous caller could degrade detection for all users with a single request.

**Fix:** both endpoints now only exist when `ADMIN_ENDPOINTS_ENABLED=1` is set (off by default, documented in `.env.example` as dev-only), answering `404` rather than `403` when disabled so their presence isn't advertised. Related cleanups in the same pass: CORS `allow_credentials` turned off (the API is bearer-header-only, so there are no cookies for CORS to share), the OCR key log no longer prints the secret's length, and the 104-line commented-out old `/detect` (whose dead size-check disguised Finding 3) was deleted.

## 7.3 Hardening Round 2

Beyond the direct findings, four preventive measures were added:

1. **Rate limiting** (`src/api/rate_limit.py`): per-client sliding-window limits on the unauthenticated, compute-expensive endpoints. They run YOLO inference per request, and `/detect-product-brand` additionally proxies to the paid Google Vision API, so an anonymous caller could previously exhaust compute or run up the Vision bill in a loop. Limits are sized from the app's own call patterns (`/detect` 90/min, `/detect-face-mesh` 150/min, `/detect-with-image` 30/min, `/detect-product-brand` 10/min) and return `429` with a `Retry-After` header. The implementation is in-memory and per-process, matching the single-process uvicorn deployment; a multi-instance deployment needs a shared store (e.g. Redis). Covered by 5 unit tests with injected clock and identity.
2. **Dependency scanners in CI**: `pip-audit` (failing on anything except the two accepted protobuf advisories) and `npm audit --audit-level=critical` (moderate/high toolchain findings accepted per Finding 5) now run on every pull request, plus a `gitleaks` secret scan that catches keys committed inside source files, which the existing ".env is not committed" check cannot see.
3. **WebView navigation lockdown**: both camera WebViews previously used `originWhitelist={['*']}`. They now whitelist only their own origin (the `cdn.jsdelivr.net` baseUrl) and refuse all other navigation via `onShouldStartLoadWithRequest`, so a WebView holding a live camera stream can never be steered to an arbitrary URL.
4. **CSRF: documented as not applicable.** The API authenticates exclusively via the `Authorization: Bearer` header (no cookies, no ambient credentials), so a cross-site request cannot carry a victim's credentials; CSRF tokens would add nothing.

## 7.4 Verified Sound (no change needed)

- **IDOR protection:** every data route resolves through `ownership.py`; a foreign profile returns `404` deliberately indistinguishable from "does not exist" (covered by `test_auth_ownership.py`).
- **Authentication:** identity always derives from the *verified* Firebase ID token, never from client-supplied ids; expired/revoked/invalid tokens each return correct 401s without leaking SDK internals (tested).
- **Secrets:** all keys live in environment variables; `.env` is gitignored and CI fails if one is ever committed. Passwords are never stored (Firebase handles credentials).
- **SQL injection:** all queries go through the SQLAlchemy ORM; the only raw SQL is fixed migration DDL with no string interpolation of user input.
- **CORS:** origins come from `ALLOWED_ORIGINS` with a localhost default, not a wildcard.
- **CI hygiene checks:** hardcoded user paths, committed `.env` files, and oversized model weights each fail the Security job.

## 7.5 Remaining Recommendations

- Serve the production API over HTTPS only (the `EXPO_PUBLIC_API_BASE_URL_PROD` placeholder must become an `https://` URL backed by a trusted certificate).
- Revoke superseded Firebase service-account keys in the console when rotating (deleting the file does not invalidate the key).
- Move Firebase auth-state persistence from AsyncStorage (plaintext on device) to `expo-secure-store` (Keychain/Keystore).
- Replace raw-id profile claiming with a device-held claim token (Finding 7).
- Consider Firebase App Check to attest that only the genuine app can use the Firebase project.
- If the backend ever runs multi-process or multi-instance, move rate limiting to a shared store (Redis).
