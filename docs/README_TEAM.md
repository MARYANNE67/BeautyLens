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
