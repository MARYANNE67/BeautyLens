# BeautyLens — Quality Assurance & Testing Strategy

**Project:** BeautyLens — Makeup Product Detection & AR Virtual Try-On
**Course:** SED800 Capstone II
**Team:** Masuma Begum, Chloe Quijano, Mary-Anne Ibeh
**Repository:** `https://github.com/SED800/SkillCred`
**Last Updated:** June 2026
**Version:** 2.0 — updated to include shade matching and multi-product look building features

---

## A. Testing Goals

### Why Testing Matters for BeautyLens

BeautyLens is an AI-powered application that makes real-time decisions about what a user sees on their face. A wrong classification does not just produce a bad result — it applies the wrong AR overlay to the wrong facial region entirely (e.g., rendering a foundation overlay on a user's lips because mascara was misclassified as lip gloss). In a beauty retail environment, this directly damages user trust and product credibility.

With the addition of skin tone–aware shade matching and multi-product look building, the risk surface has grown. Shade matching must reliably extract a representative skin tone and return a meaningful recommendation. Multi-product look building must stack overlays from multiple scans without state corruption, visual conflicts, or memory leaks.

Testing ensures:

- The model classifies products correctly and consistently across all 19 makeup classes
- The API endpoints handle real-world inputs (valid images, invalid files, empty uploads) without crashing
- The face mesh pipeline reliably returns 468 landmarks and maps them to the correct facial regions
- The AR overlay renders on the correct facial region for every product category
- Skin tone extraction from the face oval region returns a valid, representative LAB colour value
- Shade matching correctly compares product colour against skin tone and returns a meaningful recommendation
- Multi-product look building stacks overlays from multiple product scans without visual conflicts or state corruption
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
| Skin tone extraction returns null or an unrepresentative colour | Shade recommendation is wrong or missing | 🔴 Critical |
| Multi-product overlays conflict visually (e.g., lip overlay overwrites eye overlay) | Combined look is broken | 🔴 Critical |
| Multi-product state not cleared on new session — previous look bleeds into next scan | User sees wrong combined look | 🔴 Critical |
| Model confidence too low — no detection returned | User sees nothing after scanning | 🟠 High |
| AR overlay drops below 15 FPS when multiple overlays are stacked | Overlay stutters in-store | 🟠 High |
| Shade match recommendation is always "good match" regardless of actual colours | Feature appears non-functional | 🟠 High |
| App behaves differently on iOS vs Android | Demo fails on one platform | 🟠 High |
| Non-image file uploaded to `/detect` — no 400 error returned | Security gap, potential crash | 🟡 Medium |
| Face image stored to disk after `/detect-face-mesh` call | Privacy violation | 🟡 Medium |

---

## B. Planned Types of Testing

### 1. Smoke Testing (Manual)

Smoke testing is performed manually after each deployment or major code change. It verifies the system is fundamentally working before running the full test suite.

**Manual smoke test checklist:**

- [ ] `docker-compose up` starts all services without errors
- [ ] `GET /health` returns `{ "status": "healthy", "model_loaded": true }`
- [ ] Open the React Native app — home screen loads without errors
- [ ] Point the camera at a MAC Studio Fix foundation — bounding box appears with a label and confidence score
- [ ] Tap "Try On" — face camera opens and the AR overlay renders visibly on the face
- [ ] The overlay colour visually matches the product being held (shade matching)
- [ ] Shade matching recommendation appears on screen with a "match" or "try lighter/darker" message
- [ ] Scan a second product (e.g., lipstick after foundation) — both overlays appear simultaneously on the face
- [ ] Clearing the look removes all stacked overlays
- [ ] Overlay is stable at ≥ 15 FPS with at least two overlays active — no visible stutter
- [ ] Test passes on at least one iOS device and one Android device

**Visual checks that cannot be automated:**

- AR overlay colour accuracy (shade matching quality is subjective)
- Overlay polygon alignment to the face (mesh rendering quality)
- Stacked overlay visual harmony — no jarring colour conflicts between layers
- Shade recommendation text is readable and contextually accurate
- UI polish — spacing, typography, and colour consistency across screens

---

### 2. Unit Testing

Unit tests verify individual functions in isolation, without calling the API or loading the YOLO model.

**Framework:** PyTest (backend) and Jest (frontend React Native)

**Minimum coverage goal:** 80% coverage on all utility and helper functions

#### Backend — PyTest (`tests/`)

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

**New — Shade Matching unit tests (`tests/test_shade_matching.py`):**

| Function | Test Cases |
|---|---|
| `extract_dominant_colour(bbox_region)` | Returns a valid LAB colour tuple `(L, A, B)` for a non-empty image region |
| `extract_dominant_colour(bbox_region)` | Returns `None` when the bounding box region is empty or all-black |
| `extract_dominant_colour(bbox_region)` | K-means with k=3 returns the most dominant cluster centre, not an average |
| `compare_skin_to_shade(skin_lab, product_lab)` | Returns `"good_match"` when delta-E < 15 |
| `compare_skin_to_shade(skin_lab, product_lab)` | Returns `"try_lighter"` when product L value is significantly lower than skin L |
| `compare_skin_to_shade(skin_lab, product_lab)` | Returns `"try_darker"` when product L value is significantly higher than skin L |
| `compare_skin_to_shade(None, product_lab)` | Returns `None` without raising — graceful fallback when skin extraction failed |
| `compare_skin_to_shade(skin_lab, None)` | Returns `None` without raising — graceful fallback when product extraction failed |
| `get_shade_recommendation(class_name, skin_lab, product_lab)` | Returns `None` for non-colour classes (e.g., `"eyelash curler"`, `"brush"`) |
| `get_shade_recommendation(class_name, skin_lab, product_lab)` | Returns a recommendation string for colour classes (lip_stick, foundation, blush, etc.) |

#### Frontend — Jest (co-located `*.test.js` files)

The following functions in `src/utils/productClasses.js` are unit tested:

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

The following functions in `src/utils/meshOverlays.js` are unit tested:

| Function | Test Cases |
|---|---|
| `getFacialRegions()` | Returns `facial_regions` object when valid face mesh data is provided |
| `getFacialRegions()` | Returns `null` when `faceMeshData` is `null` |
| `getFacialRegions()` | Returns `null` when `facial_regions` key is missing |
| `renderClassBasedMesh()` | `"lip stick"` maps to lip mesh renderer |
| `renderClassBasedMesh()` | `"foundation"` maps to face oval mesh renderer |
| `renderClassBasedMesh()` | `"eye liner"` maps to eye mesh renderer |
| `renderClassBasedMesh()` | Returns `null` when `landmarks` array is empty |

**New — Multi-product look state unit tests (`src/__tests__/lookBuilder.test.js`):**

| Function | Test Cases |
|---|---|
| `addProductToLook(product, overlayConfig)` | Adds product to the active look state; length increases by 1 |
| `addProductToLook(product, overlayConfig)` | Adding the same product class twice replaces the previous entry — no duplicates |
| `removeProductFromLook(className)` | Removes the specified class from look state; length decreases by 1 |
| `removeProductFromLook("nonexistent")` | Returns look state unchanged without throwing |
| `clearLook()` | Returns empty look state `[]` |
| `getLookOverlays()` | Returns an array of overlay configs in correct render order (face → eyes → lips) |
| `getLookOverlays()` | Returns empty array when look state is empty |
| `hasProductInLook(className)` | Returns `true` when class is in current look, `false` otherwise |
| `getProductCountInLook()` | Returns correct count after adding and removing products |

**New — Shade matching display unit tests (`src/__tests__/shadeDisplay.test.js`):**

| Function | Test Cases |
|---|---|
| `formatShadeRecommendation("good_match")` | Returns a user-facing string confirming the shade works for their skin tone |
| `formatShadeRecommendation("try_lighter")` | Returns a user-facing suggestion to try a lighter shade |
| `formatShadeRecommendation("try_darker")` | Returns a user-facing suggestion to try a darker shade |
| `formatShadeRecommendation(null)` | Returns `null` — no recommendation displayed |
| `getOverlayColourFromProduct(productBbox, fallbackColour)` | Returns extracted hex colour string when bbox is valid |
| `getOverlayColourFromProduct(null, fallbackColour)` | Returns `fallbackColour` when extraction fails |
| `isColourApplicableClass(className)` | Returns `true` for `"lip_stick"`, `"foundation"`, `"blush"` — `false` for `"brush"`, `"eyelash_curler"` |

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

#### New — Shade Matching Integration

| Test | Input | Expected Result |
|---|---|---|
| `POST /detect` with product image → extract bbox region → run `extract_dominant_colour()` | Real product JPEG | Dominant colour returned is a non-null LAB tuple with L in range [0, 100] |
| `POST /detect-face-mesh` → extract face oval region → run `extract_dominant_colour()` | Real face JPEG | Skin tone returned as non-null LAB tuple; L value within realistic skin range [30, 90] |
| Full shade match pipeline: detect product → extract product colour → extract skin tone → compare | Real product + real face | `compare_skin_to_shade()` returns one of `"good_match"`, `"try_lighter"`, `"try_darker"` |
| Shade matching for non-colour class (e.g., `"brush"`) | Any image | `get_shade_recommendation()` returns `None` — no recommendation generated |

#### New — Multi-Product Look Building Integration

| Test | Steps | Expected Result |
|---|---|---|
| Scan two different product categories | Scan foundation → scan lipstick → open face camera | Both overlays rendered simultaneously: face oval (foundation) + lip region (lipstick) |
| Scan same product class twice | Scan lipstick (red) → scan lipstick (pink) → open face camera | Only one lip overlay shown — latest scan replaces previous; no duplicate lip overlays |
| Clear look mid-session | Scan two products → tap "Clear Look" → open face camera | Face camera shows no overlays; look state is empty |
| Look state persists across screen navigation | Scan product → navigate to HomeScreen → navigate back to FaceCameraScreen | Previous look overlays are still active |
| Look state clears on explicit new session | Tap "Start New Look" | All previous overlays cleared; look state reset to empty |

---

### 4. End-to-End (E2E) Testing

E2E tests verify complete user workflows from the mobile app through to the AR overlay. These are partially automated and partially manual due to the camera and face requirements.

**Automated E2E (Detox or manual script):**

| Workflow | Steps | Pass Criteria |
|---|---|---|
| Product scan flow | Launch app → tap "Scan Product" → camera opens → present test image → verify detection card appears with class name and confidence | Detection card renders within 2 s of scan |
| Try-on launch flow | From detection card → tap "Try On" → VirtualTryOnScreen loads → tap "Start Virtual Try-On" → FaceCameraScreen opens | Face camera opens without error |
| Full AR flow | FaceCameraScreen active → present face to camera → verify AR overlay appears on the correct facial region | Overlay visible, correct region, ≥ 15 FPS |
| Shade match flow | Scan a coloured product → open try-on → verify shade recommendation text appears below overlay | Recommendation text visible; reads "good match", "try lighter", or "try darker" |
| Multi-product flow | Scan foundation → add to look → scan lipstick → add to look → open face camera | Both face oval and lip overlays visible simultaneously; no visual conflict |
| Look clear flow | Build a two-product look → tap "Clear Look" → verify overlays disappear | Face camera shows bare face with no overlays |
| History flow | Complete a scan → navigate to scan history → verify scan record appears with product name, confidence, and timestamp | Record appears within 1 s of scan completion |

**Manual E2E verification (per platform):**

- iOS device: run all seven workflows above, confirm no crashes or layout issues
- Android device: run all seven workflows above, confirm camera permissions and overlay rendering match iOS behaviour
- Specific multi-product check: verify that stacking 3+ products does not cause a visible FPS drop below 15 on the demo device

---

### 5. Performance / Load Testing

Performance testing verifies that BeautyLens meets its latency targets for a live in-store demo environment.

**Tools:** `pytest-benchmark` (backend), `console.time()` in `services/api.js` (frontend)

| Component | Metric | Target | Measurement Method |
|---|---|---|---|
| `/detect` endpoint | Response latency | < 500 ms | `pytest-benchmark` over 50 consecutive requests |
| `/detect-face-mesh` endpoint | Response latency | < 200 ms | `pytest-benchmark` over 50 consecutive requests |
| Shade colour extraction | Time per call | < 100 ms | `pytest-benchmark` on `extract_dominant_colour()` with a 640×640 image |
| Multi-product overlay rendering | Frame rate with 3 active overlays | ≥ 15 FPS | FPS counter in `FaceCameraScreen` during multi-product session |
| Look state update | Time to add/remove product from look | < 50 ms | Jest `performance.now()` around `addProductToLook()` and `removeProductFromLook()` |
| App cold start | Time from launch to HomeScreen | < 3 s | Manual timing on both iOS and Android |
| `/detect` under load | 10 concurrent requests | No errors, all return within 1 s | `pytest` with `asyncio` concurrent tasks |

**Bottleneck risks:**

- YOLO inference on CPU is the most likely bottleneck for `/detect`. Mitigation: resize to 640×640 in the app before upload.
- K-means colour extraction runs on each product bbox and the face oval region. With k=3 and a cropped region this should be < 100 ms on CPU. If slower, reduce k to 1 (mean colour) as a fallback.
- Stacking 3+ overlays in `FaceCameraScreen` increases polygon rendering work per frame. Mitigation: batch overlay renders into a single SVG/Canvas draw call rather than one per product.

---

### 6. Negative Testing

Negative testing verifies that the system fails gracefully and returns meaningful errors when given invalid, unexpected, or malicious inputs. Every endpoint and utility function must handle bad input without crashing.

#### Backend — API Negative Tests (`tests/test_negative.py`)

**`/detect` endpoint — invalid inputs:**

| Test | Input | Expected Behaviour |
|---|---|---|
| Empty file upload | 0-byte JPEG | HTTP 400 — `"Empty image file received"` |
| Non-image file | `.txt` file content | HTTP 400 — `"Invalid image format"` |
| Executable file | `.exe` file | HTTP 400 — no crash, no execution |
| Corrupted image | Random bytes with `.jpg` extension | HTTP 400 — `"Could not decode image"` |
| Missing image field | Form with no `image` key | HTTP 422 — FastAPI validation error |
| Oversized image | 50MB file | HTTP 413 — request rejected by size limit |
| Wrong content type | JSON body instead of form data | HTTP 422 — FastAPI validation error |

**`/detect-face-mesh` endpoint — invalid inputs:**

| Test | Input | Expected Behaviour |
|---|---|---|
| No face in image | Product image with no person | HTTP 200, `face_detected: false` — no crash |
| Non-image file | `.pdf` upload | HTTP 400 |
| Empty file | 0-byte upload | HTTP 400 |
| Very small image | 10×10 pixel image | HTTP 200, `face_detected: false` — too small to detect |
| Completely dark image | All-black image | HTTP 200, `face_detected: false` — no crash |

**`/set-confidence` endpoint — boundary and invalid values:**

| Test | Input | Expected Behaviour |
|---|---|---|
| Above maximum | `{ "threshold": 1.1 }` | HTTP 400 — out of range |
| Below minimum | `{ "threshold": -0.5 }` | HTTP 400 — out of range |
| String instead of number | `{ "threshold": "high" }` | HTTP 422 — type validation error |
| Null value | `{ "threshold": null }` | HTTP 422 — type validation error |
| Empty body | `{}` | HTTP 400 — missing required field |
| Exactly 0.0 | `{ "threshold": 0.0 }` | HTTP 200 — boundary accepted |
| Exactly 1.0 | `{ "threshold": 1.0 }` | HTTP 200 — boundary accepted |

**`/load-model` endpoint — invalid paths:**

| Test | Input | Expected Behaviour |
|---|---|---|
| Non-existent path | `"/fake/path/model.pt"` | HTTP 400 — `"Model file not found"` |
| Directory instead of file | `"/tmp/"` | HTTP 400 — not a valid model |
| Missing field | `{}` | HTTP 400 |

#### Frontend — Negative Tests (Jest)

**`normalizeClassName()` — invalid inputs:**

| Test | Input | Expected Behaviour |
|---|---|---|
| Null | `null` | Returns `null` — no exception thrown |
| Undefined | `undefined` | Returns `null` — no exception thrown |
| Empty string | `""` | Returns `null` |
| Whitespace only | `"   "` | Returns `null` |
| Unknown class | `"toothbrush"` | Returns `null` |

**`addProductToLook()` — invalid inputs:**

| Test | Input | Expected Behaviour |
|---|---|---|
| Null product | `addProductToLook(null, config)` | Returns current look unchanged — no crash |
| Duplicate class | Add `"lip stick"` twice | Second entry replaces first — no duplicates |
| Empty overlay config | `addProductToLook(product, null)` | Returns current look unchanged |

**`removeProductFromLook()` — invalid inputs:**

| Test | Input | Expected Behaviour |
|---|---|---|
| Non-existent class | `removeProductFromLook("toothbrush")` | Returns look unchanged — no crash |
| Null class name | `removeProductFromLook(null)` | Returns look unchanged — no crash |
| Empty look | Remove from empty state | Returns empty array — no crash |

**`compare_skin_to_shade()` — invalid inputs:**

| Test | Input | Expected Behaviour |
|---|---|---|
| Null skin LAB | `compare_skin_to_shade(None, product_lab)` | Returns `None` — no crash |
| Null product LAB | `compare_skin_to_shade(skin_lab, None)` | Returns `None` — no crash |
| Both null | `compare_skin_to_shade(None, None)` | Returns `None` — no crash |

**`getOverlayColourFromProduct()` — invalid inputs:**

| Test | Input | Expected Behaviour |
|---|---|---|
| Null bbox | `getOverlayColourFromProduct(null, "#C2185B")` | Returns fallback colour `"#C2185B"` |
| Zero-size bbox | bbox with `width: 0, height: 0` | Returns fallback colour — no division by zero |

#### Negative Smoke Tests (Manual)

These negative scenarios must be verified manually before each release:

- [ ] Upload a selfie (face only, no product) to `/detect` — app shows "No products detected", does not crash
- [ ] Hold a non-makeup object (book, water bottle) at the camera — no bounding box shown
- [ ] Kill the API server while scan screen is running — app shows "API Offline", does not crash
- [ ] Tap "Try On" with no internet connection — app shows friendly error, does not crash
- [ ] Rapid-tap the scan button 10 times quickly — no duplicate requests, no race condition crash
- [ ] Rotate phone mid-detection — bounding boxes reposition correctly, no layout crash
- [ ] Tap "Clear Look" when no look has been built — button is no-op, no crash
- [ ] Navigate away from face camera mid-detection — camera releases cleanly, no memory leak warning

---

### 7. Security Testing

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
| After shade matching call | Extracted skin tone colour value is not stored in the database — used only in memory for the current session |

#### API Security

| Test | Expected Behaviour |
|---|---|
| CORS header on response | `Access-Control-Allow-Origin` present; in production, value is not `*` |
| `/set-confidence` with value `2.0` | HTTP 400 — out of range rejection |
| `/load-model` with a non-existent path | HTTP 400 — `"Model file not found"` |
| Rapid repeated `/detect` calls (rate limiting) | No server crash; note: rate limiting not yet implemented — flagged as a known gap for production deployment |

#### Known Security Gaps

The current `main.py` contains a hardcoded absolute path referencing a developer's local OneDrive directory. This will be replaced with a `MODEL_PATH` environment variable loaded from `.env` before any production deployment. The CORS policy is currently set to `allow_origins=["*"]` — this must be restricted before any public deployment.

Shade matching extracts skin tone from the face oval region. The extracted LAB colour tuple is used only in memory during the current API request and is never logged, stored, or transmitted beyond the single response. This must be verified by code review on every PR that touches the shade matching pipeline.

---

## C. CI Pipeline (`ci.yml`)

The GitHub Actions workflow runs on every Pull Request to `main` and every push to `main`. Both jobs must pass before merge is permitted.

### Frontend job

| Step | Tool | Failure condition |
|---|---|---|
| TypeScript type check | `tsc --noEmit` | Any type error |
| Lint | `expo lint` (ESLint) | Any error (zero errors required) |
| Unit tests | Jest `--passWithNoTests` | Any test failure |
| Expo export | `expo export --platform web` | Bundler error — missing asset, broken import, or component that crashes the build |

The Expo export step verifies the app produces a valid production bundle. It catches issues that TypeScript and ESLint cannot — such as missing image assets, unresolved module paths, or runtime-crashing components — because it actually executes the bundler rather than statically analysing the code.

### Backend job

| Step | Tool | Failure condition |
|---|---|---|
| Pylint | `pylint src/api/ --errors-only` | Any error (zero errors required) |
| PyTest + coverage | `pytest --cov=src/api --cov-fail-under=80` | Any test failure, or coverage drops below 80% |

Coverage reporting uses `--cov-report=term-missing` to print uncovered lines directly in the CI log. The 80% threshold aligns with the minimum coverage goal in Section B. Coverage enforcement is skipped until test files are present.

---

## D. Pull Request Quality Rules

The following rules apply to all Pull Requests in the BeautyLens repository:

1. **No direct pushes to `main`** — all changes must go through a Pull Request
2. **CI must pass before merge** — the GitHub Actions workflow must complete with all green checks
3. **At least one team member must review and approve** — no self-merges
4. **All new utility functions must include unit tests** — PRs adding functions to `product_classes.py`, `face_mesh.py`, `meshOverlays.js`, `productClasses.js`, shade matching utils, or look builder utils must include corresponding test cases
5. **No hardcoded file paths** — use environment variables; PRs containing absolute paths will be rejected
6. **Linting must pass** — Pylint (backend) and ESLint (frontend) must produce zero errors
7. **Shade matching PRs must verify privacy** — any PR touching the shade extraction or skin tone pipeline must confirm in the PR description that no skin tone data is persisted
8. **Look state PRs must include a clear test** — any PR touching look builder state management must include a Jest test verifying that `clearLook()` fully resets state
9. **PR description must include** — what was changed, how it was tested, and any known limitations

---

## E. Testing Responsibilities

| Team Member | Responsibility |
|---|---|
| Masuma Begum | PyTest backend unit and integration tests; `/detect`, `/set-confidence`, and shade matching pipeline test cases |
| Mary-Anne Ibeh | Jest frontend unit tests; `productClasses.js`, `meshOverlays.js`, `shadeDisplay.js`, and look builder state tests |
| Chloe Quijano | E2E manual testing on iOS and Android; multi-product look building E2E flows; performance benchmarking; CI/CD workflow configuration |
| All members | Smoke testing after each major deployment; PR review; shade matching privacy verification |

---

## F. Test File Structure

```
beautylens/
├── src/
│   └── utils/
│       ├── productClasses.js
│       ├── productClasses.test.js      # Unit tests for normalizeClassName, getDisplayName
│       ├── meshOverlays.js
│       ├── meshOverlays.test.js        # Unit tests for getFacialRegions, renderClassBasedMesh
│       ├── lookBuilder.js
│       ├── lookBuilder.test.js         # Unit tests for addProductToLook, removeProductFromLook, clearLook, getLookOverlays
│       ├── shadeDisplay.js
│       └── shadeDisplay.test.js        # Unit tests for formatShadeRecommendation, getOverlayColourFromProduct, isColourApplicableClass
├── tests/
│   ├── test_product_classes.py         # Unit tests for normalize_class_name, get_display_name
│   ├── test_api_endpoints.py           # Integration tests for /detect, /detect-face-mesh, /set-confidence
│   ├── test_face_mesh.py               # Unit tests for get_facial_regions
│   ├── test_shade_matching.py          # Unit + integration tests for extract_dominant_colour, compare_skin_to_shade, get_shade_recommendation
│   └── conftest.py                     # Shared fixtures, mock YOLO model, mock MediaPipe, mock colour extractor
└── .github/
    └── workflows/
        └── ci.yml                      # GitHub Actions CI pipeline
```

---

## G. Testing Backlog — GitHub Issues

The following GitHub Issues track outstanding testing and quality assurance work. Each issue should be linked to its corresponding PR when resolved.

| Issue | Type | Assigned To |
|---|---|---|
| Create unit tests for `normalize_class_name()` and `product_classes.py` | Backend unit tests | Masuma Begum |
| Create unit tests for `/set-confidence` endpoint | Backend unit tests | Masuma Begum |
| Create unit tests for `extract_dominant_colour()` and shade matching pipeline | Backend unit tests | Masuma Begum |
| Create integration tests for `/detect` and `/detect-face-mesh` endpoints | Backend integration tests | Masuma Begum |
| Create integration tests for shade matching full pipeline | Backend integration tests | Masuma Begum |
| Create `conftest.py` with mock YOLO model, mock MediaPipe, and mock colour extractor | Backend test fixtures | Masuma Begum |
| Create Jest unit tests for `productClasses.js` | Frontend unit tests | Mary-Anne Ibeh |
| Create Jest unit tests for `meshOverlays.js` | Frontend unit tests | Mary-Anne Ibeh |
| Create Jest unit tests for look builder state (`lookBuilder.test.js`) | Frontend unit tests | Mary-Anne Ibeh |
| Create Jest unit tests for shade display utilities (`shadeDisplay.test.js`) | Frontend unit tests | Mary-Anne Ibeh |
| Configure GitHub Actions CI pipeline | CI/CD | Chloe Quijano |
| Verify E2E flows on iOS and Android devices | E2E manual testing | Chloe Quijano |
| Run performance benchmarks for `/detect` and `/detect-face-mesh` before M.11 | Performance testing | Chloe Quijano |

---

*This document will be updated as new tests are added throughout Capstone II. All test files referenced above must exist and pass before the M.11 final release milestone.*
