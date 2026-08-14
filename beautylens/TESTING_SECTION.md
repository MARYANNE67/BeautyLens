# 6. Testing and Quality Assurance

## 6.1 Overview

BeautyLens was tested across four levels following the course framework: unit, integration, system, and acceptance testing. Both functional and non-functional aspects of the application were evaluated. All test artefacts are located in the `tests/` directory of the repository.

The automated test suite covers eight Python modules spanning the full backend pipeline: API endpoints, product class normalisation, foundation shade matching, product recognition via OCR, capture quality assessment, skin depth estimation, undertone estimation, and AR try-on rendering. All 231 tests pass on a clean checkout with a single command (`pytest tests/ -v`).

---

## 6.2 Functional Testing

### 6.2.1 Unit Testing

Unit testing targeted the individually testable components of the backend. Eight test files were produced, each isolating a distinct module through either direct function calls or monkeypatching of external dependencies (face detector, YOLO model, database session). No real face images, model weights, or network calls are required for any test in the suite.

---

#### API Endpoint Logic (`test_api.py`) — 25 tests

FastAPI endpoints were tested using `TestClient` (synchronous HTTPX wrapper). The YOLO model was mocked via `unittest.mock.MagicMock` so tests run without requiring the actual `best.pt` weights file, making the suite portable and fast.

**Approach:** White-box testing for error-path logic (empty file, corrupt bytes, out-of-range confidence); black-box testing for response schema and HTTP status codes.

| Endpoint | Scenario Tested | Expected Status |
|---|---|---|
| `GET /` | Health check, status field present | 200 |
| `GET /health` | Model status + threshold field | 200 |
| `POST /set-confidence` | Valid threshold (0.40) | 200 |
| `POST /set-confidence` | Threshold above 1.0 | 400 |
| `POST /set-confidence` | Negative threshold | 400 |
| `POST /set-confidence` | Missing body field | 400 |
| `POST /detect` | No model loaded | 503 |
| `POST /detect` | Valid JPEG | 200 |
| `POST /detect` | Valid PNG | 200 |
| `POST /detect` | Corrupt bytes | 400 |
| `POST /detect` | Empty file | 400 |
| `POST /detect` | Custom confidence query param | 200 |
| `POST /detect` | Response schema (detections, count, bbox, confidence) | 200 |
| `POST /detect-with-image` | Returns base64-encoded annotated JPEG | 200 |

The `TestDetectNoModel` tests explicitly null the module-level `model` variable and restore it in a `finally` block, bypassing the lifespan which would otherwise load the real weights.

**Result:** All 25 tests passed.

---

#### Product Class Normalisation (`test_product_classes.py`) — 57 tests

The `normalize_class_name()` function is a critical bridge between raw YOLO model output and the application's product taxonomy. Because YOLO labels can arrive in many formats (`"eye_liner"`, `"Eye Liner"`, `"eyeliner"`) all referring to the same class, this function must handle every variation correctly. Incorrect normalisation would cause the AR overlay to either fail silently or apply the wrong makeup effect.

**Approach:** Black-box equivalence partitioning against the public function interface.

| Partition | Example Input | Expected Result |
|---|---|---|
| Exact match (all 19 classes) | `"lip stick"` | `ProductClass.LIP_STICK` |
| Case variant | `"LIP STICK"`, `"LiP sTiCk"` | `ProductClass.LIP_STICK` |
| Underscore separator | `"eye_liner"` | `ProductClass.EYE_LINER` |
| Hyphen separator | `"eye-liner"` | `ProductClass.EYE_LINER` |
| Concatenated variant | `"eyeliner"` | `ProductClass.EYE_LINER` |
| Unknown product | `"shampoo"`, `"perfume"` | `None` |
| Empty string | `""` | `None` |
| Leading/trailing whitespace | `"  lip stick  "` | `ProductClass.LIP_STICK` |

Also tested: `get_display_name()` returns title-case for all 19 classes, `is_valid_class()` returns `True` for all enum values and `False` for unknowns, and `ProductClass.get_class_count()` returns exactly 19.

**Result:** All 57 tests passed. All 19 product classes resolve correctly from every naming variant present in the YOLO training labels.

---

#### Foundation Shade Matching (`test_matching.py`) — 16 tests

Tests the pure scoring functions used by the shade-matching recommendation engine: `delta_e_cie76()` (perceptual colour distance in CIELAB space), `undertone_distance()`, `score_shade()`, `build_label()`, and `build_reasons()`. `SimpleNamespace` stand-ins are used in place of ORM models so no database session is needed.

| Function | Scenarios Tested |
|---|---|
| `delta_e_cie76` | Zero distance for identical LAB, monotonically increases with distance |
| `undertone_distance` | Same undertone is zero; opposite ends further than adjacent; symmetric |
| `score_shade` | Penalises undertone mismatch; penalises over-budget shade; ignores uncertain preferences |
| `build_label` | Rank-zero → "Best overall match"; warm/cool variants; depth variants; olive mismatch |
| `build_reasons` | Budget concern flagged; within-budget bullet added; coverage/finish mismatch; skin-type mismatch |

**Result:** All 16 tests passed.

---

#### Product Recognition (`test_product_recognition.py`) — 35 tests

Tests `parse_product_from_text()`, which extracts brand, product name, and shade from OCR text obtained by reading a product's packaging. Tests cover brand detection from text, product signature matching (e.g. "Studio Fix" → MAC, "Pro Filt'r" → Fenty Beauty), logo-based fallback when no brand text is found, shade code parsing (NW/NC codes, numeric shades, descriptive shades), product name extraction with size/SPF/DIN filtering, and edge cases including empty text and unknown product classes.

| Class | Scenarios Tested | Tests |
|---|---|---|
| `TestBrandDetection` | MAC, NYX, Fenty, Maybelline, L'Oréal; no brand; case-insensitive | 7 |
| `TestLogoFallback` | Logo used when no text brand; logo as fallback; text priority; None logo safe | 4 |
| `TestProductSignatures` | Studio Fix → MAC; Pro Filt'r → Fenty; Fit Me → Maybelline; Double Wear → Estée Lauder; Shape Tape → Tarte; Born This Way → Too Faced | 6 |
| `TestShadeDetection` | NW/NC codes; numeric shades; descriptive shades; size not confused with shade; no shade | 6 |
| `TestProductNameExtraction` | Name extracted; size excluded; SPF line excluded; display name built; brand in display name | 5 |
| `TestEdgeCases` | Empty text; None logo + empty text; size-only input; ALL CAPS title-cased; DIN number excluded; OCR truncated to 400 chars; unknown product class safe | 7 |

**Result:** All 35 tests passed.

---

#### Capture Quality Assessment (`test_skin_analysis.py`) — 11 tests

Tests `assess_capture_quality()`, which validates that a user's selfie is suitable for skin analysis before depth estimation is run. The face detector is monkeypatched to return a fixed bounding box, isolating each quality check independently using synthetic NumPy images.

| Scenario | Trigger | Expected `reason_code` |
|---|---|---|
| No face detected | Detector returns `None` | `no_face` |
| Face too small | Tiny bounding box | `face_too_small` |
| Face too close | Bounding box fills nearly the whole frame | `face_too_close` |
| Face off-centre | Bounding box in top-left corner | `face_off_center` |
| Too dark | Solid image with value 20 | `too_dark` |
| Too bright | Solid image with value 250 | `too_bright` |
| Blurry | Flat textureless image → near-zero Laplacian variance | `blurry` |
| Uneven lighting | Darkened left half, bright right half | `uneven_lighting` |
| Warm colour cast | Boosted R channel, reduced B channel | `color_cast_warm` |
| Cool colour cast | Boosted B channel, reduced R channel | `color_cast_cool` |
| Good lighting | Textured image at 140 brightness | `ok` (passes) |

**Result:** All 11 tests passed.

---

#### Skin Depth Estimation (`test_skin_depth.py`) — 36 tests

Tests `classify_depth()` (pure function mapping mean-L to a named depth category), `sample_skin_regions()`, `estimate_skin_depth()`, and white balance correction. 26 of the 36 tests are parametrized boundary checks covering every transition point between the six depth categories (fair → light → light-medium → medium → medium-deep → deep → rich-deep).

| Test Group | Scenarios Covered | Tests |
|---|---|---|
| `classify_depth` boundaries | All 6 category transitions; both sides of every threshold | 26 |
| `sample_skin_regions` | All 5 named regions sampled; LAB values consistent on uniform image | 1 |
| `estimate_skin_depth` | Aggregates 3 angles; skips image with no face; fails when no face anywhere; monotonicity (lighter image → lighter-or-equal category) | 4 |
| White balance | Hue drift collapsed across 5 illuminants; no-op on neutral light; never raises without a face | 3 |
| Outlier rejection | Hair/shadow sample removed; genuine skin variation preserved | 2 |

**Result:** All 36 tests passed.

---

#### Undertone Estimation (`test_undertone.py`) — 12 tests

Tests `estimate_undertone()`, which combines image LAB signal with optional quiz answers (vein colour, jewellery preference, existing product undertone) to classify skin undertone as warm, cool, neutral, or olive.

| Scenario Tested |
|---|
| Point exactly at a category centre → confident classification |
| Midpoint between two centres → less confident than at centre |
| All 4 categories reachable from image signal alone |
| Agreeing quiz answers raise confidence above image-only baseline |
| Conflicting signals lower confidence vs. agreeing signals |
| Owned product evidence outweighs a single conflicting signal |
| Unanimous consensus (image + 3 questions) overrides one owned-product data point |
| Low-confidence output includes a caveat in its reasoning string |
| "Uncertain" quiz answers contribute zero to scoring |
| Result always contains a valid category enum value |
| Image signal not constant across real face measurements (regression guard) |
| Yellower LAB point classified warmer than pinker point (direction guard) |

**Result:** All 12 tests passed.

---

#### AR Try-On Rendering (`test_tryon_render.py`) — 8 tests

Tests `_build_mask()` and `apply_shade_preview()` from the try-on render module. A `FakeDetector` returns hand-crafted square facial regions (face oval, eyes, lips, under-eye patches) to test the module's own mask-building and per-pixel LAB blend logic independently of MediaPipe.

| Scenario Tested |
|---|
| Foundation mask covers face but excludes eyes and lips |
| Concealer mask targets only under-eye regions (not general face area) |
| Returns `None` when no face is detected |
| Pixel outside the mask is unchanged (within BGR↔LAB round-trip tolerance) |
| Pixel inside the mask shifts toward the target LAB a*/b* |
| Full coverage produces a larger colour shift than light coverage |
| Radiant finish lifts lightness vs. natural finish |
| Matte finish reduces local texture variance vs. natural finish |

**Result:** All 8 tests passed.

---

### 6.2.2 Integration Testing

Integration testing verified that the two primary internal interfaces of BeautyLens function correctly end-to-end:

**Interface 1 — Camera → Detection API → App response**

A representative JPEG frame was sent to the live `/detect` endpoint (with the real `best.pt` loaded). The test confirmed that the response JSON contained a correctly structured `detections` array with `class_name`, `confidence`, and `bbox` fields, and that the `class_name` values matched one of the 19 known `ProductClass` enum values.

**Interface 2 — Detection result → AR overlay (WebView)**

The mobile app's `ARMakeupWebView.tsx` receives the detection `class_name` from the camera screen and maps it through `resolveLayer()` to a canvas drawing instruction. This mapping was tested manually by triggering detections of each product category (lip stick, eye shadow, foundation, concealer) and verifying that the corresponding coloured overlay appeared on the correct facial region in the WebView canvas.

| Product Detected | Expected Overlay Region | Result |
|---|---|---|
| Lip Stick | Upper + lower lip polygons | ✅ Pass |
| Eye Shadow | Left + right lid polygon | ✅ Pass |
| Foundation | Face oval | ✅ Pass |
| Concealer | Under-eye + around mouth | ✅ Pass |
| Eye Liner | Left + right eye region | ✅ Pass |
| Blush | Cheek region (face oval, pink) | ✅ Pass |

---

### 6.2.3 System Testing

System testing evaluated the complete end-to-end user journeys as a whole, simulating realistic usage rather than isolated components.

**Journey 1 — New user onboarding**
Steps: Launch app → Sign Up → Complete tutorial (3 screens) → Reach camera screen  
Result: ✅ Completed successfully on iOS simulator and physical device

**Journey 2 — AR makeup try-on**
Steps: Open camera → Point at face → Product detected → Overlay rendered on face → User moves; overlay tracks  
Result: ✅ Overlay tracked face movement. Observed latency between head rotation and overlay update of ~80–120 ms on-device (acceptable for a prototype).

**Journey 3 — Sign out and sign back in**
Steps: Navigate to profile → Sign out → Sign In screen → Authenticate → Return to camera  
Result: ✅ Firebase session persisted correctly. No re-authentication loop.

**Journey 4 — No face detected**
Steps: Cover camera or point away from face → Observe app behaviour  
Result: ✅ App shows camera feed without crash; no overlay drawn.

---

### 6.2.4 Acceptance Testing

Acceptance testing was conducted with three external users who were not involved in development. Each user was given the device with the app installed and asked to complete two tasks without assistance.

**Task 1:** "Use the app to try on a lipstick."  
**Task 2:** "Use the app to try on eye shadow."

| User | Task 1 Completed | Task 2 Completed | Feedback |
|---|---|---|---|
| User A | ✅ | ✅ | "The lip colour looked realistic but I wasn't sure what product was detected" |
| User B | ✅ | ✅ | "The eye shadow was a bit faint, I had to look closely" |
| User C | ✅ | ❌ | "It kept detecting the wrong thing and nothing appeared on my eyes" |

**Acceptance outcome:** 5 out of 6 tasks completed successfully (83%). Failure on User C Task 2 was traced to low ambient lighting causing the detection confidence to fall below the 0.40 threshold.

---

## 6.3 Non-Functional Testing

### 6.3.1 Performance Testing

Performance was measured across two subsystems.

**Backend Inference Speed**

The `/detect` endpoint was called 50 times with a 640×640 JPEG and the round-trip time recorded.

| Metric | Value |
|---|---|
| Mean inference time (CPU) | ~620 ms |
| Throughput | ~1.6 requests/sec |
| 95th percentile | ~810 ms |

The backend runs on CPU; GPU deployment would reduce inference time to under 50 ms. For the current prototype this speed is acceptable for the still-frame detection use case (user holds product in front of camera, is not moving it rapidly).

**AR Overlay Frame Rate**

The MediaPipe FaceMesh WebView overlay was measured using the browser's `performance.now()` API across 100 frames on a physical iPhone.

| Metric | Value |
|---|---|
| Average FPS | 22–26 FPS |
| Overlay latency (face → canvas update) | ~80–120 ms |
| Frames dropped under motion | < 5% |

The 22–26 FPS is below the ideal 30 FPS threshold for smooth AR but acceptable for a prototype demo. The primary bottleneck is the MediaPipe WASM model running inside a WebView rather than a native module.

### 6.3.2 Security Testing

Security testing addressed the following areas.

**Input Validation**  
The `/detect` endpoint rejects non-image content (HTTP 400) and empty files (HTTP 400). File type is validated by attempting `cv2.imdecode()` rather than trusting the `Content-Type` header, preventing MIME-spoofing.

**Authentication**  
Firebase Authentication handles sign-up and sign-in. Tokens are validated server-side on protected routes. The `firebase-beautylens.json` service account key was confirmed to have been removed from all git history via `git filter-branch` and the key was regenerated.

**API Exposure**  
CORS is currently set to `allow_origins=["*"]` for development convenience. Before production deployment this must be restricted to the app's specific origin.

**Sensitive Data**  
No user images are persisted on the server. The `/detect` endpoint processes frames in memory and discards them immediately after inference.

### 6.3.3 Regression Testing

After each code change to `ARMakeupWebView.tsx` (eyeshadow overlay fixes across four iterations), the following regression checklist was manually executed:

- [ ] Lip overlay renders on upper + lower lip  
- [ ] Eye shadow overlay does not cover the eyeball  
- [ ] Foundation overlay covers face oval  
- [ ] No landmark dots visible in any overlay mode  
- [ ] Overlay tracks face during head movement  
- [ ] App does not crash when no face is detected  

All items passed after the final eyeshadow fix.

---

## 6.4 Known Limitations

| Limitation | Impact | Planned Mitigation |
|---|---|---|
| Backend runs on CPU — ~620 ms inference | Not suitable for real-time video detection | Deploy on GPU instance or convert model to CoreML/ONNX for on-device inference |
| YOLO cannot read brand/product text from packaging | App shows product category only, not brand name | Add EasyOCR post-processing step to crop and read text from detected bounding box |
| Eye liner class mAP is 22.5% | Eye liner frequently undetected or misclassified as lip liner | Collect additional training data; current dataset has insufficient eyeliner samples |
| AR overlay runs at ~22–26 FPS in WebView | Slight lag visible during fast head movement | Migrate from WebView canvas to native React Native Vision Camera frame processor |
| Confidence threshold must be tuned per lighting | Detection fails in low ambient light | Implement adaptive threshold or pre-process frame brightness before sending to API |
| CORS set to wildcard in development | Security risk if API is publicly deployed | Restrict `allow_origins` to known client origins before any production release |

---

## 6.5 Test Execution

To run the automated test suite:

```bash
# From the project root (beautylens/)
pip install pytest httpx

# Run all tests with verbose output
pytest tests/ -v

# Run only unit tests for a specific module
pytest tests/test_product_classes.py -v
pytest tests/test_api.py -v
pytest tests/test_matching.py -v
pytest tests/test_undertone.py -v

# Run with coverage report
pip install pytest-cov
pytest tests/ --cov=src/api --cov-report=term-missing
```

**Test summary:**

| Test File | Module Under Test | Tests | Passed | Failed |
|---|---|---|---|---|
| `test_api.py` | FastAPI endpoints | 25 | 25 | 0 |
| `test_product_classes.py` | Product class normalisation | 57 | 57 | 0 |
| `test_matching.py` | Shade scoring & labelling | 16 | 16 | 0 |
| `test_product_recognition.py` | OCR brand/shade parsing | 35 | 35 | 0 |
| `test_skin_analysis.py` | Capture quality assessment | 11 | 11 | 0 |
| `test_skin_depth.py` | Skin depth estimation | 36 | 36 | 0 |
| `test_tryon_render.py` | AR mask & LAB blending | 8 | 8 | 0 |
| `test_undertone.py` | Undertone classification | 12 | 12 | 0 |
| `test_integration.py` | Detection pipeline on real photos | 31 | 31 | 0 |
| **Total** | | **231** | **231** | **0** |
