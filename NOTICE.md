# Third-Party Notices and Attributions

BeautyLens is built on the following third-party software, models, data, and
published content. Each remains under its own license; nothing in this
project's MIT license re-licenses them.

## Models and ML frameworks

- **Ultralytics YOLOv8** (AGPL-3.0) — object-detection architecture and
  training/inference library (`ultralytics` package); the product-detection
  model `best.pt` is a YOLOv8s fine-tune. AGPL-3.0 carries obligations
  beyond MIT (including for network-served use); this dependency's terms
  apply to the detection component independently of the project license.
  https://github.com/ultralytics/ultralytics
- **Google MediaPipe** (Apache-2.0) — 468-landmark Face Mesh, used both
  server-side (`mediapipe` package) and client-side in the AR/tutorial
  WebViews (`@mediapipe/face_mesh`, `@mediapipe/camera_utils`, loaded from
  the jsDelivr CDN). https://github.com/google-ai-edge/mediapipe

## Data sources

- **The Pudding — "foundation-names" dataset** — the shade catalog
  (`shade_catalog_seed.json`, ~5,100 shades) is built from the measured
  swatch colours in The Pudding's open dataset accompanying their story
  "The Naked Truth". https://github.com/the-pudding/data (foundation-names)
- **Makeup API** (open source) — runtime source of real product shade lists
  for the try-on shade picker. https://makeup-api.herokuapp.com

## Services and SDKs

- **Firebase** (SDK: Apache-2.0) — authentication (client SDK and
  `firebase-admin`).
- **Google Cloud Vision API** — OCR for product brand/shade text recognition.
- **Expo / React Native** (MIT) — application framework.
  `beautylens/LICENSE` is Expo's own template license file (copyright 650
  Industries, Inc.) and covers the Expo template code.
- **FastAPI, SQLAlchemy, OpenCV, and other dependencies** — under their
  respective permissive licenses; see `beautylens/requirements.txt` and
  `beautylens/package.json` for the full inventories.

## Published content adapted as data

- The makeup **placement-tutorial rules** (contour/blush/bronzer/highlighter
  zones per face shape, nose-contour techniques) are adapted from published
  guides by Charlotte Tilbury, Treasure House of Makeup, NYX, Beautyblender,
  and others; each rule's source is cited inline in
  `beautylens/src/components/TutorialWebView.tsx` and the original
  `tutorialZones.ts`.
- Face-shape and nose-shape classification thresholds draw on the Farkas
  facial index, the neoclassical facial-thirds canon, and the anthropometric
  nasal index, adapted as documented in code comments.

## Assets

- Test fixture photographs (`beautylens/tests/fixtures/*.HEIC`) and app
  artwork/icons are the team's own.
