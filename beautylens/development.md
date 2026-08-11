# Development

Run these commands from the repository root unless noted otherwise.

## Prerequisites

Use Node.js 20.x for the Expo app:

```bash
nvm install 20
nvm use 20
```

Use Python 3.11 for the backend.

## Frontend Setup

```bash
cd beautylens
npm install
```

## Backend Setup

```bash
cd beautylens
python3.11 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Environment / Firebase Setup

Required — the app will not start without it. Auth is Firebase on both sides.

```bash
cd beautylens
cp .env.example .env
```

`.env.example` documents every variable; the two that must be filled in:

1. **Backend service account.** Firebase Console → Project settings → Service
   accounts → *Generate new private key*. Save the `.json` **outside the repo**
   and point `FIREBASE_CREDENTIALS_FILE` at it. Without it the server logs a
   setup error on startup and every authenticated endpoint returns `503`.
2. **App web config.** Firebase Console → Project settings → Your apps → Web
   app (`</>`). Fill in the six `EXPO_PUBLIC_FIREBASE_*` values. These are not
   secrets. Restart Expo with `npx expo start -c` after changing them.

Enable **Email/Password** under Firebase Console → Authentication → Sign-in
method.

## Shade Catalog Setup

The shade matcher needs `beautylens/data/shade_catalog_seed.json`. It is not
committed, so a fresh clone has no catalog and recommendations come back empty.
Build it once:

```bash
cd beautylens
mkdir -p data/sources
curl -o data/sources/allShades.csv \
  https://raw.githubusercontent.com/the-pudding/data/master/foundation-names/allShades.csv
python data/build_catalog_from_shades.py --source data/sources/allShades.csv
```

That writes ~5,100 shades built from measured swatch colour. Optional follow-ups:

```bash
python data/check_product_links.py    # drop retailer links that 404
python data/evaluate_matching.py      # match quality per depth band
```

The SQLite database (`beautylens/beautylens.db`) is created and seeded
automatically on first backend start. Seeding is skipped when the table already
has rows, so after rebuilding the catalog you must clear it to pick up changes:

```bash
python -c "from src.api.db import SessionLocal; from src.api.models_db import ShadeProduct; \
d=SessionLocal(); print('deleted', d.query(ShadeProduct).delete()); d.commit()"
```

## Run Backend

The FastAPI backend runs on port `8000`.

```bash
cd beautylens
source venv/bin/activate          # Windows: venv\Scripts\activate
python -m src.api.main
```

Alternative:

```bash
cd beautylens
./start_api.sh
```

Check that the backend is running:

```bash
curl http://localhost:8000/health
```

For phone testing, no manual IP config needed — the app auto-detects your
computer's LAN IP from the Metro connection Expo Go already made (see
`src/config/featureFlags.ts`). If that ever doesn't work for your setup
(e.g. a tunnel URL), override it in `beautylens/.env`:

```bash
EXPO_PUBLIC_API_BASE_URL_DEV=http://YOUR_COMPUTER_IP:8000
```

Restart `npx expo start` after adding/changing this file.

## Run Frontend With Expo Go

Use this for normal frontend testing:

```bash
cd beautylens
npx expo start --lan
```

Scan the QR code with Expo Go.

## Run Frontend With iOS Simulator

```bash
cd beautylens
npx expo run:ios
```

## Run Frontend With Android Emulator

```bash
cd beautylens
npx expo run:android
```

## Run On A Physical Phone

Connect the phone to your computer, then run one of:

```bash
cd beautylens
npx expo run:ios --device
```

```bash
cd beautylens
npx expo run:android --device
```

Then start Metro:

```bash
cd beautylens
npx expo start --lan
```

Open the installed BeautyLens app on the phone, or scan the QR with Expo Go if using Expo Go mode.

## iOS Native Rebuild (Xcode)

`ios/` is gitignored — it is never committed, generated locally per machine by
`npx expo prebuild` (or automatically by `npx expo run:ios`). A fresh clone has
no `ios/` directory at all until you generate one.

You need to **regenerate it** whenever `main` picks up a change that adds or
changes a *native* dependency (anything requiring a CocoaPods relink, not a
pure-JS package) — for example `react-native-webview` and `expo-media-library`,
both already in use for the AR try-on and tutorial camera screens. Pulling
those commits without regenerating is the most common cause of Xcode
"workspace" errors (missing frameworks, `Sandbox not in sync with the
Podfile.lock`, module-not-found) on a previously-working local `ios/` checkout.

```bash
cd beautylens
rm -rf ios
npx expo prebuild --clean -p ios
cd ios && pod install
```

Then open **`ios/beautylens.xcworkspace`** in Xcode — not `.xcodeproj`.
CocoaPods dependencies only link through the workspace; opening the project
file directly is the other common source of the same class of error.

If you're not sure whether a pulled change added a native dependency, diff
`package.json`:

```bash
git diff <old-commit> <new-commit> -- package.json
```

Any new entry there (other than a pure-JS/TypeScript-only package) is a signal
to regenerate.

## Shade Matching Flow

The path a user takes, and where each step lives:

| Step | Screen | Endpoint | Logic |
| --- | --- | --- | --- |
| Sign in | `login.tsx` | `POST /auth/session` | `firebase_auth.py` |
| Beauty profile | `account.tsx` | `POST /profile` | `routers/profile.py` |
| Capture 3 photos | `skin-scan/index.tsx` | `POST /skin-scan/quality-check` | `skin_analysis.py` |
| Estimate depth | same | `POST /skin-scan/analyze` | `skin_analysis.py` |
| Undertone + result | `undertone-confirm.tsx` | `POST /skin-scan/undertone` | `undertone.py` |
| Recommendations | `(tabs)/recommendations.tsx` | `GET /recommendations` | `matching.py` |
| Shade preview | `shade-preview.tsx` | `POST /tryon/preview` | `tryon_render.py` |

Full API docs while the backend runs: <http://localhost:8000/docs>

Testing the flow needs a signed-in Firebase user, a saved beauty profile, and a
completed scan — every shade endpoint is scoped to the caller's own profile
(`ownership.py`), so requests without a valid ID token return `401`.

## Troubleshooting

**Every authenticated endpoint returns `503`** — the backend has no Firebase
credentials. Set `FIREBASE_CREDENTIALS_FILE` in `beautylens/.env` and restart.

**Recommendations come back empty** — the catalog was never built. See
[Shade Catalog Setup](#shade-catalog-setup).

**Catalog changes don't show up** — seeding is skipped when `shade_products`
already has rows. Clear the table (command in the same section) and restart.

**Code changes don't take effect** — the backend does not hot-reload. Restart
`python -m src.api.main` after editing anything under `src/api/`.

**Undertone looks wrong for everyone** — the constants in `undertone.py` are
calibrated against the catalog. If you rebuilt it, regenerate them with
`--emit-anchors` (see Notes).

**Xcode build fails with workspace/pod/framework errors** — your local `ios/`
is out of sync with a native dependency change on `main`. See
[iOS Native Rebuild (Xcode)](#ios-native-rebuild-xcode).

## Useful Checks

Run lint:

```bash
cd beautylens
npm run lint
```

Run TypeScript check:

```bash
cd beautylens
npx tsc --noEmit
```

Run backend tests:

```bash
cd beautylens
source venv/bin/activate          # Windows: venv\Scripts\activate
python -m pytest tests/ -q
```

Check backend Python syntax:

```bash
cd beautylens
env PYTHONPYCACHEPREFIX=/private/tmp python3 -m py_compile src/api/main.py src/api/face_mesh.py
```

## Notes

- Product detection uses the FastAPI backend.
- AR face mesh currently uses the backend `/detect-face-mesh` endpoint on this branch.
- Restart the backend after changing `src/api/face_mesh.py` or `src/api/main.py`.
- Restart Expo after changing route params or native/app config.
- `beautylens/data/` is untracked. It holds the built catalog, the downloaded
  source CSV, and any locally captured scan measurements — regenerate it with
  the commands above rather than expecting it from a clone.
- Rebuilding the catalog changes the colour distribution the undertone
  estimator is calibrated against. Regenerate its constants with
  `python data/build_catalog_from_shades.py --emit-anchors` and paste the two
  blocks into `src/api/undertone.py`; leaving them stale silently degrades
  undertone accuracy.
