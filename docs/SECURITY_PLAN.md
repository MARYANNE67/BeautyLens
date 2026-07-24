# BeautyLens — Security Plan

**Team:** Masuma Begum · Chloe Quijano · Mary-Anne Ibeh
**Course:** SED800 Capstone II

## 1. Threat Identification

BeautyLens processes live camera images containing facial data, runs an object-detection model, and exposes a FastAPI backend over HTTP. The threat model covers three attack surfaces: the mobile client (React Native/Expo), the REST API endpoints, and the inference pipeline.

### 1.1 Potential Threats

- **Unauthorized access to API endpoints** — no authentication currently enforced on `/detect`, `/detect-face-mesh`, `/set-confidence`, or `/load-model`.
- **Malicious file upload** — attacker uploads a crafted file (executable, oversized image, malformed JPEG) to `/detect` or `/detect-face-mesh` to crash the server or exploit parsing libraries.
- **Hardcoded secrets** — model path and CORS origins previously hardcoded in source code, risking exposure in public repositories.
- **CORS misconfiguration** — `allow_origins=["*"]` in `main.py` permits any origin to call the API, enabling cross-site request forgery from untrusted domains.
- **Sensitive data exposure** — facial landmark data (468 3D coordinates) processed in memory; risk of accidental persistence to disk, logs, or database.
- **Model path traversal** — `/load-model` endpoint accepts an arbitrary file path; could be abused to load a file from an unexpected location on the server.
- **Dependency vulnerabilities** — YOLOv8 (ultralytics), MediaPipe, FastAPI, and Expo SDK dependencies may contain known CVEs.
- **Insecure transmission** — API currently served over HTTP (not HTTPS); data in transit can be intercepted on shared networks.
- **Denial of Service** — no rate limiting on inference endpoints; repeated large-image requests could exhaust CPU and memory.

### 1.2 Risk Prioritization

Each threat is rated by likelihood and impact to determine testing priority.

| Threat | Description | Likelihood | Impact |
|---|---|---|---|
| No API authentication | All endpoints publicly accessible | High | High |
| Malicious file upload | Crafted/oversized/non-image files sent to `/detect` | Medium | High |
| CORS wildcard | Any domain can call the API | Medium | Medium |
| Facial data persistence | Landmark coordinates accidentally written to disk/DB | Low | High |
| Path traversal (`/load-model`) | Arbitrary file path accepted as input | Low | Medium |
| Insecure transmission | API served over HTTP, not HTTPS | High | High |
| Dependency CVEs | Known vulnerabilities in third-party packages | Medium | Medium |
| Denial of Service | No rate limiting on inference endpoints | Medium | Medium |

### 1.3 Risk-to-Testing Mapping

| Risk | Primary Testing Focus |
|---|---|
| No API authentication | Authentication & Authorization Testing (Section 3) |
| Malicious file upload | Input Validation & Injection Testing (Section 4) |
| CORS wildcard | Authentication & Authorization Testing (Section 3) |
| Facial data persistence | Data Security & Privacy Checks (Section 5) |
| Path traversal | Input Validation & Injection Testing (Section 4) |
| Insecure transmission | Data Security & Privacy Checks (Section 5) |
| Dependency CVEs | Testing Techniques & Tools (Section 2) |
| Denial of Service | Input Validation & Injection Testing (Section 4) |

## 2. Testing Techniques and Tools

### 2.1 Static Application Security Testing (SAST)

SAST is performed on the codebase without executing the application, identifying vulnerabilities in source code before deployment.

- **Bandit** — Python static analysis tool scans `src/api/` for common security issues including hardcoded secrets, shell injection, use of insecure functions, and unsafe deserialization. Run as: `bandit -r src/api/ -ll`
- **ESLint with security plugins** — the React Native frontend is scanned using `eslint-plugin-security` to detect unsafe regular expressions, use of `eval()`, and prototype pollution risks.
- **Manual code review** — all changes to authentication logic, file upload handling, model loading, and CORS configuration are reviewed by a second team member before merging, enforced by the PR approval policy.

### 2.2 Dynamic Application Security Testing (DAST)

DAST tests the running application by sending requests and analysing responses for security weaknesses.

- **OWASP ZAP (Zed Attack Proxy)** — used in passive scan mode against the running FastAPI backend to detect missing security headers, CORS misconfigurations, and information disclosure in error responses.
- **Burp Suite Community Edition** — used for manual interception and manipulation of API requests to `/detect` and `/detect-face-mesh` to test input validation, file type enforcement, and error handling.
- **curl / Postman** — used to manually craft malformed requests (wrong Content-Type, oversized payloads, non-image file bodies) against all four API endpoints.

### 2.3 Dependency Vulnerability Scanning

- **pip-audit** — scans `requirements.txt` against the Python Packaging Advisory Database (PyPA) for known CVEs in ultralytics, mediapipe, fastapi, uvicorn, and opencv-python.
- **npm audit** — scans `package.json` for known vulnerabilities in Expo SDK, react-native, expo-camera, and react-native-svg packages.
- **GitHub Dependabot** — enabled on the repository (`.github/dependabot.yml`) to automatically flag new CVEs in both the `pip` (`beautylens/`) and `npm` (`beautylens/`) dependency ecosystems as they are published.

### 2.4 CI-Integrated Security Checks

The GitHub Actions CI pipeline includes a dedicated `security` job that runs on every pull request and push to `main`:

- Checks for hardcoded absolute paths (e.g., OneDrive paths) in `src/` Python files — fails the build if found.
- Confirms `.env` is not committed to the repository.
- Checks for large model weight files (`.pt`) committed to the repository — fails if files over 5MB are detected.

## 3. Authentication and Authorization Testing

### 3.1 Current State

The BeautyLens FastAPI backend currently has no authentication mechanism. All endpoints (`/detect`, `/detect-face-mesh`, `/set-confidence`, `/load-model`, `/health`) are publicly accessible to any client that can reach the server. This is an accepted risk for the Capstone II demo environment (local network only) but must be addressed before any public deployment.

### 3.2 Tests for Missing Authentication

| Test | Description | Expected Result |
|---|---|---|
| Unauthenticated `/detect` call | POST a valid image to `/detect` with no API key or auth header | Currently returns 200 — flagged as vulnerability |
| Unauthenticated `/set-confidence` call | POST `{"threshold": 0.1}` with no credentials | Currently returns 200 — should require auth in production |
| Unauthenticated `/load-model` call | POST a model path with no credentials | Currently returns 200 or 400 — critical endpoint must be protected |
| CORS origin enforcement | Send requests from a non-whitelisted origin, verify CORS headers | Should reject non-whitelisted origins in production |

### 3.3 Access Privileges

- The `/set-confidence` and `/load-model` endpoints modify server-side state and must be restricted to authorised operators only — not accessible from the mobile client in a production deployment.
- The `/detect` and `/detect-face-mesh` endpoints are the only endpoints intended to be called by the mobile client and should be rate-limited per IP address.
- Recommended fix: implement API key authentication using FastAPI's `HTTPBearer` dependency, with keys stored as environment variables and never committed to the repository.

### 3.4 Password Entropy

BeautyLens does not currently implement user accounts, login, or password-based authentication. If user accounts are added in a future sprint, the following password requirements will be enforced:

- Minimum 12 characters.
- At least one uppercase letter, one number, and one special character.
- Passwords stored as bcrypt hashes — never in plaintext.
- No password reuse across the last 5 passwords.

## 4. Input Validation and Injection Testing

### 4.1 Server-Side Input Validation (FastAPI)

All input validation for the API is performed server-side in `src/api/main.py`. Client-side validation in the mobile app is treated as a convenience measure only, not a security control.

| Endpoint | Input Test | Expected Behaviour | Severity |
|---|---|---|---|
| `/detect` | Upload a 0-byte file | HTTP 400 — empty image rejected | High |
| `/detect` | Upload a `.exe` file with `image/jpeg` Content-Type | HTTP 400 — invalid format | High |
| `/detect` | Upload a 50MB image file | HTTP 413 — rejected, enforced by a 10MB `MAX_UPLOAD_SIZE` check | Medium |
| `/detect` | Upload a valid JPEG with embedded script content in EXIF | HTTP 200 — EXIF not executed; OpenCV decodes pixels only | Low |
| `/set-confidence` | POST `{"threshold": 2.0}` | HTTP 400 — out of range | Medium |
| `/set-confidence` | POST `{"threshold": "high"}` | HTTP 422 — type validation error | Low |
| `/load-model` | POST `{"model_file": "../../etc/passwd"}` | HTTP 400 — file not found or rejected | High |
| `/detect-face-mesh` | Upload a PDF file | HTTP 400 — invalid format | Medium |

### 4.2 Injection Attack Testing

- **SQL Injection** — BeautyLens uses SQLite for session logging. All database writes use parameterized queries via SQLAlchemy's ORM, eliminating raw string interpolation. No SQL injection vectors exist in the current implementation.
- **Command Injection** — the model path received by `/load-model` is passed to `ultralytics.YOLO()` as a string. This does not execute a shell command, so direct command injection is not applicable. However, path traversal (e.g., `../../`) is tested to ensure only expected directories are accessible.
- **Cross-Site Scripting (XSS)** — BeautyLens is a native mobile app, not a web application. XSS is not applicable to the React Native client. The web preview (used in development only) does not render user-supplied HTML.
- **File Upload Injection** — crafted files (polyglots, oversized, double-extension) are sent to `/detect` and `/detect-face-mesh` to confirm OpenCV's decoding step rejects files that are not valid images before they reach the model.

### 4.3 Client-Side Validation

- The mobile app validates that only JPEG/PNG files captured by the device camera are sent to the API — it does not accept arbitrary file uploads from the file system.
- Image frames are captured directly from `expo-camera` using `takePictureAsync()` and are not user-supplied paths, eliminating a class of client-side path manipulation risks.

## 5. Data Security and Privacy Checks

### 5.1 Secure Transmission

- **Current state:** The FastAPI backend is served over HTTP (port 8000) in the development and demo environment. This is an accepted risk for the local-network Capstone II demo only.
- **Required for production:** All API traffic must be served over HTTPS with a valid TLS certificate (minimum TLS 1.2, recommended TLS 1.3). This can be achieved by placing the FastAPI app behind an nginx reverse proxy with Let's Encrypt certificates.
- The mobile app uses `fetch()` for all API calls. In a production deployment, the `API_BASE_URL_PROD` constant in `featureFlags.ts` must point to an `https://` endpoint, and HTTP cleartext traffic must be disabled in `app.json` using Expo's network security configuration.

### 5.2 Data Encryption

- **Data in transit:** No encryption in the current development deployment (HTTP only). Production deployment requires TLS as described above.
- **Data at rest:** SQLite session logs store `class_name`, confidence score, and timestamp only — no images, no facial coordinates, no personally identifiable information. The database file is stored locally on the server and is not encrypted at rest in the current implementation. Production deployments should use an encrypted database or encrypted filesystem.
- **Model weights (`best.pt`):** The YOLOv8 model file is stored locally and gitignored. It is not transmitted over the network by the application.

### 5.3 Facial Data Privacy

This is the highest-sensitivity data BeautyLens processes. The following controls are verified by code review and testing:

- Facial landmark data (468 `{x, y, z}` coordinates) is processed in RAM only during the `/detect-face-mesh` request and is never written to disk, database, or logs.
- Camera frames sent to `/detect-face-mesh` are processed and immediately discarded — no face images are persisted on the server.
- The SQLite database schema contains no columns for facial data. This is verified by inspecting the database schema after a face mesh detection call.
- **Test:** After calling `/detect-face-mesh` with a real face image, inspect the server's filesystem and database to confirm no image files or landmark data have been written.
- Any PR that touches the face mesh pipeline, shade matching pipeline, or database schema must include a privacy verification statement in the PR description — enforced by team PR rules in `QA.md`.

### 5.4 Sensitive Configuration

- `MODEL_PATH` and `ALLOWED_ORIGINS` are loaded from a `.env` file via `python-dotenv`. The `.env` file is gitignored and documented in `.env.example`.
- The CI/CD pipeline includes a security job that fails the build if a `.env` file is committed to the repository.
- No API keys, tokens, database passwords, or cloud credentials are used in the current implementation. If added in future, they must be stored as GitHub Actions secrets and injected at build time.

### 5.5 Data Leakage Checks

- FastAPI error responses are inspected to confirm they do not expose stack traces, internal file paths, model paths, or server configuration details to the client.
- The `/health` endpoint exposes `model_loaded` status and `model_path` — in production, `model_path` should be removed from the response to avoid disclosing server filesystem structure.
- HTTP response headers are inspected using OWASP ZAP to confirm no sensitive server information (`X-Powered-By`, `Server` version) is exposed.

## 6. Reporting and Risk Mitigation Plan

### 6.1 Discovered Vulnerabilities

| # | Vulnerability | Severity | Description | Status |
|---|---|---|---|---|
| V-1 | No API authentication | High | All endpoints publicly accessible — any client can call `/detect`, `/set-confidence`, `/load-model` with no credentials. | Accepted (demo scope) |
| V-2 | CORS wildcard | Medium | `allow_origins=["*"]` permitted any web origin to call the API. | **Resolved** — CORS origins now loaded from `ALLOWED_ORIGINS` in `.env` instead of a hardcoded wildcard. |
| V-3 | HTTP only (no TLS) | High | API served over HTTP in dev environment. Data in transit is unencrypted. | Accepted (demo scope) |
| V-4 | Path traversal on `/load-model` | Medium | Arbitrary file paths accepted. Test with `../../etc/passwd` confirmed 400 response — partial mitigation only. | Fix planned |
| V-5 | `model_path` in `/health` response | Low | Server filesystem path exposed in API response — discloses directory structure. | Fix planned |
| V-6 | No rate limiting | Medium | Repeated large-image requests to `/detect` can exhaust CPU. No per-IP throttling implemented. | Fix planned |
| V-7 | Hardcoded OneDrive path (fixed) | High | Model path was hardcoded to a developer's local OneDrive directory in `main.py`. Fixed: replaced with `MODEL_PATH` env variable. | Resolved |
| V-8 | No upload size limit | Medium | `/detect`, `/detect-face-mesh`, and `/detect-with-image` had no maximum request size — large payloads could exhaust CPU/memory. | **Resolved** — added a 10MB `MAX_UPLOAD_SIZE` check; oversized uploads now return HTTP 413. |

### 6.2 Proposed Fixes

- **V-1 (No authentication):** Implement `HTTPBearer` API key authentication on FastAPI using a key stored in `.env`. The mobile app sends the key in the `Authorization` header. The `/detect` and `/detect-face-mesh` endpoints get a client key; `/set-confidence` and `/load-model` get a separate operator key.
- **V-2 (CORS wildcard):** ~~Replace~~ Replaced `allow_origins=["*"]` with `ALLOWED_ORIGINS` loaded from `.env`. In production, set to the specific mobile app origin or IP range.
- **V-3 (HTTP only):** Deploy FastAPI behind nginx with Let's Encrypt TLS in production. Update `API_BASE_URL_PROD` in `featureFlags.ts` to `https://`.
- **V-4 (Path traversal):** Add an allowlist of permitted model directories in `main.py`. Reject any `/load-model` request whose path does not start with the approved `models/` directory.
- **V-5 (`model_path` exposure):** Remove `model_path` from the `/health` response in production builds.
- **V-6 (Rate limiting):** Add `slowapi` rate limiting middleware to FastAPI — limit `/detect` and `/detect-face-mesh` to 10 requests/minute per IP address.
- **V-8 (No size limit):** Added a `MAX_UPLOAD_SIZE = 10 * 1024 * 1024` check to `/detect`, `/detect-face-mesh`, and `/detect-with-image`; requests over the limit now return HTTP 413 instead of being processed.

### 6.3 Accepted Risks

The following vulnerabilities are accepted for the Capstone II demo scope with the stated justification:

- **V-1 (No authentication):** The API is deployed on a local network and not publicly accessible during the demo. Authentication will be required before any public deployment.
- **V-3 (HTTP only):** TLS certificate provisioning requires a public domain name. The demo runs on a local WiFi network only. HTTPS will be enforced in any external deployment.

### 6.4 Re-Testing Plan

After each fix is merged to `main`, the following re-testing steps are performed before closing the vulnerability:

- Re-run OWASP ZAP passive scan and confirm the finding no longer appears.
- Re-run the affected test cases from Section 4 manually using Burp Suite or curl.
- Confirm the CI security job passes on the PR that includes the fix.
- Update this Security Plan with the new status (Resolved) and commit alongside the fix.
- All vulnerability fixes must be submitted as pull requests with a linked issue and reviewer approval — the same GitHub workflow as all other changes.

This Security Plan will be updated after each sprint as new features (shade matching, look builder, user accounts) are added to the attack surface.
