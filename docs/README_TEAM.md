# BeautyLens — Team Dev Guide

BeautyLens is a computer vision and AR mobile application for makeup product detection and virtual try-on. Users scan a makeup product with their camera, the model identifies it, and an AR overlay applies the product shade to their face in real time.

**SED800 Capstone II — 2026**
Masuma Begum · Chloe Quijano · Mary-Anne Ibeh

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Local Setup](#local-setup)
- [Architecture](#architecture)
- [API Routes](#api-routes)
- [Data Flows](#data-flows)
- [Shade Matching](#shade-matching)
- [Model & Dataset](#model--dataset)
- [Git Workflow](#git-workflow)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native (Expo) |
| API | FastAPI + Uvicorn |
| Detection | YOLOv8s — 19-class makeup model |
| Face Mesh | MediaPipe Face Mesh — 468 3D landmarks |
| Persistence | SQLite |
| Infrastructure | Docker Compose |

---

## Local Setup

```bash
# 1. Clone
git clone https://github.com/SED800/SkillCred.git
cd SkillCred

# 2. Start all services (API + model server)
docker-compose up

# 3. Start the mobile app (separate terminal)
cd mobile
npx expo start
```

The API runs at `http://localhost:8000`. Use the Expo Go app or a simulator to run the mobile client.

To adjust the detection confidence threshold at runtime:

```bash
curl -X POST http://localhost:8000/set-confidence \
  -H "Content-Type: application/json" \
  -d '{"threshold": 0.55}'
```

---

## Architecture

| Layer | Component |
|---|---|
| Mobile App | React Native (Expo) — HomeScreen → ScanProductScreen → VirtualTryOnScreen → FaceCameraScreen |
| API Layer | FastAPI + Uvicorn — `/detect`, `/detect-with-image`, `/detect-face-mesh`, `/health`, `/set-confidence` |
| Detection Engine | YOLOv8s fine-tuned model (`models/final/best.pt`) — 19-class makeup detection, mAP@0.5 target ≥ 0.70 |
| Face Mesh Engine | MediaPipe Face Mesh — 468 3D landmarks, facial region extraction (lips, eyes, face oval) |
| Persistence | SQLite — session logs, detection class, confidence, timestamp |
| Infrastructure | Docker Compose — `docker-compose up` brings up all services |

---

## API Routes

| Method | Route | Description |
|---|---|---|
| GET | `/health` | Service health check |
| POST | `/detect` | JPEG frame → class, confidence, bounding box |
| POST | `/detect-with-image` | JPEG frame → detections + annotated image |
| POST | `/detect-face-mesh` | Face JPEG → 468 landmarks + facial region polygons |
| POST | `/set-confidence` | Update detection confidence threshold |

### Detection response shape

```json
[
  {
    "class_name": "lip_stick",
    "display_name": "Lipstick",
    "confidence": 0.82,
    "bbox": [x1, y1, x2, y2]
  }
]
```

### Face mesh response shape

```json
{
  "facial_regions": {
    "upper_lip": [[x, y], ...],
    "lower_lip": [[x, y], ...],
    "left_eye":  [[x, y], ...],
    "right_eye": [[x, y], ...],
    "face_oval": [[x, y], ...]
  }
}
```

---

## Data Flows

### Product Detection

```
User taps SCAN → App captures JPEG frame
  → services/api.js → POST /detect
  → FastAPI: cv2.imdecode → YOLOv8s inference → normalize_class_name()
  → JSON: [{ class_name, display_name, confidence, bbox }]
  → App renders bounding box + product card → User taps Try On
```

### AR Virtual Try-On

```
User taps TRY ON → FaceCameraScreen captures face frame
  → POST /detect-face-mesh
  → FastAPI: MediaPipe FaceMesh → 468 landmarks → get_facial_regions()
  → JSON: { facial_regions: { upper_lip, lower_lip, left_eye, right_eye, face_oval } }
  → productClasses.js maps product → region → shade extracted from bbox
  → meshOverlays.js renders shade-matched polygon at 15–20 FPS
```

---

## Shade Matching

Added in `feat/shade-matching`. Users scan their face and get foundation and
concealer shades matched to their skin, across brands.

### What a user does

1. **Sign in.** Accounts are Firebase email/password. Scans and matches are
   saved to the account.
2. **Answer four questions.** Skin type, preferred coverage, preferred finish,
   budget. "I don't know" is always an option — the app is built for people who
   don't know the terminology.
3. **Take three photos.** Front, left, right. Each is checked for lighting,
   blur, and framing before it's accepted, with a plain-language reason if a
   retake is needed.
4. **Answer three more questions.** Jewellery preference, vein colour, and how
   past foundations have gone wrong. These refine the undertone estimate.
5. **See the result.** Skin depth, undertone with a confidence level, the
   closest matching shade, and what to look for on a shade chart.
6. **Browse recommendations.** Top matches for foundation or concealer, each
   with the shade's real colour, why it was picked, and a search link to find
   it at a retailer.

### Features

| Feature | What it does |
|---|---|
| Skin depth | Places the user on a seven-band scale, fair through rich-deep |
| Undertone | Estimates warm, cool, neutral or olive, with a confidence score |
| Cross-brand matching | Ranks ~5,100 real shades by colour distance, then by the user's stated preferences |
| Colour swatches | Shows the shade's actual colour beside the user's measured skin tone |
| Honest results | Says when nothing in the range is a close match, instead of presenting the nearest as a good one |
| Shade preview | Applies a shade to a photo of the user's face |
| Find in store | Search link per shade, generated live so it never goes stale |

### The shade catalog

Built from real product swatch colours published by retailers, covering ~5,100
foundation and concealer shades across brands. Depth and undertone labels are
derived from the measured colour rather than from marketing copy, so two
products described the same way can still be told apart.

The catalog file isn't committed — see `development.md` for the one-time build
step.

### Known gaps

- **Concealer is thin.** The colour data source is a foundation dataset, so
  concealer matching is weak for deeper skin. The app flags this rather than
  hiding it.
- **Lighting still matters.** Room lighting shifts results between scans. The
  app corrects for colour casts but not for exposure, so a poorly lit scan can
  still land a band off.
- **Accuracy is unvalidated.** There's no ground-truth set yet — no group of
  people whose correct shade is known — so match quality is measured for
  consistency, not correctness.

---

## Model & Dataset

| Property | Value |
|---|---|
| Model | YOLOv8s |
| Dataset size | 2,715 images |
| Classes | 19 makeup product categories |
| Annotation | Roboflow (YOLO-format labels) |
| Capstone I mAP@0.5 | 0.614 |
| Capstone II target mAP@0.5 | ≥ 0.70 |
| Inference latency target | < 500 ms per frame |
| Face mesh latency target | < 200 ms per frame |
| AR overlay frame rate target | ≥ 15 FPS on demo device |

The model weights live at `models/final/best.pt`. To retrain, update the dataset, run class balancing, and tune per-class confidence thresholds before saving a new `best.pt`.

---

## Git Workflow

Branch naming convention: `<type>/<short-description>`

| Prefix | Use |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `chore/` | Cleanup, dependency updates |
| `docs/` | Documentation only |

- `main` holds all code
- PRs require at least one team member approval before merging
- Update `docs/CHANGELOG.md` in the same PR as the feature
- Use Squash and Merge; delete the branch after merging
