# BeautyLens — Quality Assurance & Testing Strategy

**Project:** BeautyLens — Makeup Product Detection & AR Virtual Try-On  
**Course:** SED800 Capstone II  
**Team:** Masuma Begum, Chloe Quijano, Mary-Anne Ibeh  
**Repository:** `https://github.com/SED800/SkillCred`  
**Last Updated:** June 2026

---

## A. Testing Goals

### Why Testing Matters for BeautyLens

BeautyLens is an AI-powered application that makes real-time decisions about what a user sees on their face. A wrong classification does not just produce a bad result — it applies the wrong AR overlay to the wrong facial region entirely (e.g., rendering a foundation overlay on a user's lips because mascara was misclassified as lip gloss). In a beauty retail environment, this directly damages user trust and product credibility.

Testing ensures:

- The model classifies products correctly and consistently across all 19 makeup classes
- The API endpoints handle real-world inputs (valid images, invalid files, empty uploads) without crashing
- The face mesh pipeline reliably returns 468 landmarks and maps them to the correct facial regions
- The AR overlay renders on the correct facial region for every product category
- The mobile app works consistently on both iOS and Android devices
- The system performs within acceptable latency bounds for a live in-store demo

### Critical Failure Modes

These are the highest-risk failures for BeautyLens — the ones that would make the app unusable or embarrassing in a live demo or retail deployment:

| Failure | Impact | Risk Level |
|---|---|---|
| `normalize_class_name()` maps a product to the wrong class | Wrong AR overlay applied to wrong facial region | 🔴 Critical |
| `/detect` returns HTTP 500 on a valid product image | App crashes on scan | 🔴 Critical |
| `/detect-face-mesh` returns `face_detected: false` on a clear face photo | Try-on never launches | 🔴 Critical |
| AR overlay renders on wrong facial region (e.g., eye overlay on lips) | Visually broken demo | 🔴 Critical |
| Model confidence too low — no detection returned | User sees nothing after scanning | 🟠 High |
| AR overlay drops below 15 FPS on demo device | Overlay stutters in-store | 🟠 High |
| App behaves differently on iOS vs Android | Demo fails on one platform | 🟠 High |
| Non-image file uploaded to `/detect` — no 400 error returned | Security gap, potential crash | 🟡 Medium |
| Face image stored to disk after `/detect-face-mesh` call | Privacy violation | 🟡 Medium |

---

## B. Planned Types of Testing

---

### 1. Smoke Testing (Manual)

Smoke testing is performed manually after each deployment or major code change. It verifies the system is fundamentally working before running the full test suite.

**Manual smoke test checklist:**

- [ ] `docker-compose up` starts all services without errors
- [ ] `GET /health` returns `{ "status": "healthy", "model_loaded": true }`
- [ ] Open the React Native app — home screen loads without errors
- [ ] Point the camera at a MAC Studio Fix foundation — bounding box appears with a label and confidence score
- [ ] Tap "Try On" — face camera opens and the AR overlay renders visibly on the face
- [ ] The overlay colour visually matches the product being held (shade matching)
- [ ] Overlay is stable at ≥ 15 FPS — no visible stutter
- [ ] Test passes on at least one iOS device and one Android device

**Visual checks that cannot be automated:**
- AR overlay colour accuracy (shade matching quality is subjective)
- Overlay polygon alignment to the face (mesh rendering quality)
- UI polish — spacing, typography, and colour consistency across screens

---

### 2. Unit Testing

Unit tests verify individual functions in isolation, without calling the API or loading the YOLO model.

**Framework:** PyTest (backend) and Jest (frontend React Native)

**Minimum coverage goal:** 80% coverage on all utility and helper functions

#### Backend — PyTest (`src/tests/`)

The following functions in `src/api/product_classes.py` are unit tested:

| Function | Test Cases |
|---|---|
| `normalize_class_name()` | All 19 class names return the correct `ProductClass` enum |
| `normalize_class_name()` | Case variations: `"Eye Liner"`, `"EYE_LINER"`, `"eye-liner"` all return `ProductClass.EYE_LINER` |
| `normalize_class_name()` | Unknown input `"unknown_product"` returns `None` |
| `normalize_class_name()` | Empty string `""` returns `None` |
| `normalize_class_name()` | `None` input returns `None` without raising an exception |
| `get_display_name()` | Returns `"Eye Liner"` for `ProductClass.EYE_LINER` |
| `get_display_name()` | Returns `"Lip Stick"` for `ProductClass.LIP_STICK` |
| `is_valid_class()` | Returns `True` for `"foundation"`, `False` for `"toothbrush"` |
| `ProductClass.get_class_count()` | Returns `19` |
| `ProductClass.get_all_classes()` | Returns a list of exactly 19 strings |

The `/set-confidence` endpoint logic is also unit tested:

| Scenario | Expected Result |
|---|---|
| `POST /set-confidence { "threshold": 0.55 }` | Returns 200, `confidence_threshold` updated to `0.55` |
| `POST /set-confidence { "threshold": 1.5 }` | Returns 400 — out of range |
| `POST /set-confidence { "threshold": -0.1 }` | Returns 400 — out of range |
| `POST /set-confidence {}` | Returns 400 — missing field |

#### Frontend — Jest (`mobile/__tests__/`)

The following functions in `mobile/utils/productClasses.js` are unit tested:

| Function | Test Cases |
|---|---|
| `normalizeClassName()` | `"eye liner"` → `"eye liner"` |
| `normalizeClassName()` | `"Lip Stick"` → `"lip stick"` |
| `normalizeClassName()` | `"eyelash_curler"` → `"eyelash curler"` |
| `normalizeClassName()` | `null` → `null` without throwing |
| `normalizeClassName()` | `""` → `null` |
| `getAllClasses()` | Returns array of length 19 |
| `getClassCount()` | Returns `19` |
| `getDisplayName()` | `"eye liner"` → `"Eye Liner"` |
| `isValidClass()` | `"mascara"` → `true`, `"unknown"` → `false` |

The following functions in `mobile/utils/meshOverlays.js` are unit tested:

| Function | Test Cases |
|---|---|
| `getFacialRegions()` | Returns `facial_regions` object when valid face mesh data is provided |
| `getFacialRegions()` | Returns `null` when `faceMeshData` is `null` |
| `getFacialRegions()` | Returns `null` when `facial_regions` key is missing |
| `renderClassBasedMesh()` | `"lip stick"` maps to lip mesh renderer |
| `renderClassBasedMesh()` | `"foundation"` maps to face oval mesh renderer |
| `renderClassBasedMesh()` | `"eye liner"` maps to eye mesh renderer |
| `renderClassBasedMesh()` | Returns `null` when `landmarks` array is empty |

---

### 3. Integration Testing

Integration tests verify that system components work correctly together. These tests use the real FastAPI app via `httpx.AsyncClient` but mock the YOLO model and MediaPipe detector to avoid requiring GPU compute or large model files in CI.

**Framework:** PyTest with `httpx` and `unittest.mock`

#### API + Model Integration

| Test | Input | Expected Result |
|---|---|---|
| `POST /detect` with a valid JPEG | Real product JPEG (< 5MB) | HTTP 200, `detections` array returned, each item has `class_name`, `confidence`, `bbox` |
| `POST /detect` with a PNG file | Valid PNG image | HTTP 200, detection returned |
| `POST /detect` with a non-image file | A `.txt` file | HTTP 400 — `"Invalid image format"` |
| `POST /detect` with an empty file | 0-byte upload | HTTP 400 — `"Empty image file received"` |
| `POST /detect` when model not loaded | Valid JPEG, model unloaded | HTTP 503 — `"Model not loaded"` |
| `POST /detect-with-image` | Valid product JPEG | HTTP 200, `annotated_image` field is a base64 JPEG string starting with `data:image/jpeg;base64,` |

#### API + Face Mesh Integration

| Test | Input | Expected Result |
|---|---|---|
| `POST /detect-face-mesh` with a frontal face photo | Valid face JPEG | HTTP 200, `face_detected: true`, `num_landmarks: 468`, all `facial_regions` keys present (`upper_lip`, `lower_lip`, `left_eye`, `right_eye`, `face_oval`) |
| `POST /detect-face-mesh` with a non-face image | Product image with no face | HTTP 200, `face_detected: false` |
| `POST /detect-face-mesh` with an invalid file | `.pdf` file | HTTP 400 |
| Face data not persisted to disk | After a successful call | No face image files written to `uploads/` or any directory |

#### API + Database Integration

| Test | Expected Result |
|---|---|
| After a successful `/detect` call | A session log record is written to SQLite with `class_name`, `confidence`, and `timestamp` |
| Multiple sequential `/detect` calls | One record per call in the database, no duplicates |

---

### 4. End-to-End (E2E) Testing

E2E tests verify complete user workflows from the mobile app through to the AR overlay. These are partially automated and partially manual due to the camera and face requirements.

**Automated E2E (Detox or manual script):**

| Workflow | Steps | Pass Criteria |
|---|---|---|
| Product scan flow | Launch app → tap "Scan Product" → camera opens → present test image → verify detection card appears with class name and confidence | Detection card renders within 2 s of scan |
| Try-on launch flow | From detection card → tap "Try On" → VirtualTryOnScreen loads → tap "Start Virtual Try-On" → FaceCameraScreen opens | Face camera opens without error |
| Full AR flow | FaceCameraScreen active → present face to camera → verify AR overlay appears on the correct facial region | Overlay visible, correct region, ≥ 15 FPS |
| History flow | Complete a scan → navigate to scan history → verify scan record appears with product name, confidence, and timestamp | Record appears within 1 s of scan completion |

**Manual E2E verification (per platform):**

- iOS device: run all four workflows above, confirm no crashes or layout issues
- Android device: run all four workflows above, confirm camera permissions and overlay rendering match iOS behaviour

---

### 5. Performance / Load Testing

Performance testing verifies that BeautyLens meets its latency targets for a live in-store demo environment.

**Tools:** `pytest-benchmark` (backend), `console.time()` in `services/api.js` (frontend)

| Component | Metric | Target | Measurement Method |
|---|---|---|---|
| `/detect` endpoint | Response latency | < 500 ms | `pytest-benchmark` over 50 consecutive requests |
| `/detect-face-mesh` endpoint | Response latency | < 200 ms | `pytest-benchmark` over 50 consecutive requests |
| AR overlay rendering | Frame rate on demo device | ≥ 15 FPS | FPS counter in `FaceCameraScreen` during live session |
| App cold start | Time from launch to HomeScreen | < 3 s | Manual timing on both iOS and Android |
| `/detect` under load | 10 concurrent requests | No errors, all return within 1 s | `pytest` with `asyncio` concurrent tasks |

**Bottleneck risk:** YOLO inference on CPU is the most likely bottleneck. If `/detect` exceeds 500 ms, mitigation is to reduce input image resolution before sending to the API (resize to 640×640 in the app before upload).

---

### 6. Security Testing

BeautyLens processes live camera frames containing facial data. The following security concerns are tested:

#### Input Validation

| Test | Expected Behaviour |
|---|---|
| Upload a `.exe` file to `/detect` | HTTP 400 returned, no server crash |
| Upload a `.txt` file to `/detect` | HTTP 400 — `"Invalid image format"` |
| Upload a 50MB oversized image | Request rejected by Uvicorn max body size limit |
| Send a request with no `image` field | HTTP 422 — FastAPI validation error |

#### Privacy & Data Handling

| Test | Expected Behaviour |
|---|---|
| After `/detect-face-mesh` call | No image files written anywhere on disk — face data processed in RAM only |
| After `/detect` call | No uploaded product images persisted to disk |
| Check SQLite database after face mesh call | No face image data, face coordinates, or personal identifiers stored |

#### API Security

| Test | Expected Behaviour |
|---|---|
| CORS header on response | `Access-Control-Allow-Origin` present; in production, value is not `*` |
| `/set-confidence` with value `2.0` | HTTP 400 — out of range rejection |
| `/load-model` with a non-existent path | HTTP 400 — `"Model file not found"` |
| Rapid repeated `/detect` calls (rate limiting) | No server crash; note: rate limiting not yet implemented — flagged as a known gap for production deployment |

#### Known Security Gap

The current `main.py` contains a hardcoded absolute path referencing a developer's local OneDrive directory. This will be replaced with a `MODEL_PATH` environment variable loaded from `.env` before any production deployment. The CORS policy is currently set to `allow_origins=["*"]` — this must be restricted before any public deployment.

---

## C. Pull Request Quality Rules

The following rules apply to all Pull Requests in the BeautyLens repository:

1. **No direct pushes to `main`** — all changes must go through a Pull Request
2. **CI must pass before merge** — the GitHub Actions workflow must complete with all green checks
3. **At least one team member must review and approve** — no self-merges
4. **All new utility functions must include unit tests** — PRs adding functions to `product_classes.py`, `face_mesh.py`, `meshOverlays.js`, or `productClasses.js` must include corresponding test cases
5. **No hardcoded file paths** — use environment variables; PRs containing absolute paths will be rejected
6. **Linting must pass** — Pylint (backend) and ESLint (frontend) must produce zero errors
7. **PR description must include** — what was changed, how it was tested, and any known limitations

---

## D. Testing Responsibilities

| Team Member | Responsibility |
|---|---|
| Masuma Begum | PyTest backend unit and integration tests; `/detect` and `/set-confidence` test cases |
| Mary-Anne Ibeh | Jest frontend unit tests; `productClasses.js` and `meshOverlays.js` test cases |
| Chloe Quijano | E2E manual testing on iOS and Android; performance benchmarking; CI/CD workflow configuration |
| All members | Smoke testing after each major deployment; PR review |

---

## E. Test File Structure

```
sea710-project/
├── src/
│   └── tests/
│       ├── test_product_classes.py     # Unit tests for normalize_class_name, get_display_name
│       ├── test_api_endpoints.py       # Integration tests for /detect, /detect-face-mesh, /set-confidence
│       ├── test_face_mesh.py           # Unit tests for get_facial_regions
│       └── conftest.py                 # Shared fixtures, mock YOLO model, mock MediaPipe
├── mobile/
│   └── __tests__/
│       ├── productClasses.test.js      # Unit tests for normalizeClassName, getDisplayName
│       └── meshOverlays.test.js        # Unit tests for getFacialRegions, renderClassBasedMesh
└── .github/
    └── workflows/
        └── ci.yml                      # GitHub Actions CI pipeline
```