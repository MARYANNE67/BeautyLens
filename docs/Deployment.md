# 8. Deployment Guide

End-to-end instructions for deploying BeautyLens to your own accounts: the
FastAPI backend to Google Cloud Run, and the app to a physical phone. Every
step below was executed for the reference deployment; the Troubleshooting
section lists every failure actually hit on the way and its fix.

## 8.1 Architecture

```
iPhone / Android app  --HTTPS-->  Cloud Run (Docker, scale-to-zero)
                                    |-- YOLO weights + shade catalog (baked into image)
                                    |-- SQLite (ephemeral, reseeds catalog at boot)
                                    '-- Firebase Admin via service identity (no key file)
```

- **Region/shape used:** `us-central1`, 2 vCPU / 2GiB, `--max-instances 1`.
  The single instance is a correctness requirement, not just cost control:
  SQLite is a single-writer store and the rate limiter is per-process.
- **Cost:** Cloud Run's free tier covers demo traffic; the service scales to
  zero when idle. Expect roughly $0 for capstone usage.

## 8.2 Prerequisites

- Docker Desktop (only for local image verification; Cloud Build does the
  real builds)
- The gcloud CLI: `brew install --cask gcloud-cli`
- A Hugging Face account (free) for the artifact repo
- A Google account with Owner access to the Firebase project, with billing
  enabled (required even for free-tier usage; add a card at
  console.cloud.google.com/billing)
- Locally built artifacts: `beautylens/models/final/best.pt` and
  `beautylens/data/shade_catalog_seed.json` (see development.md for the
  catalog build)

## 8.3 One-Time: Artifact Repo (Hugging Face)

The weights and catalog are not in git (CI enforces no large `.pt` files;
the catalog is regenerable). They are baked into the Docker image at build
time, and `beautylens/deploy/fetch_artifacts.py` exists as a startup
fallback that downloads them from an HF model repo when absent.

```bash
beautylens/.venv/bin/hf auth login          # device-code flow, opens hf.co/oauth/device
beautylens/.venv/bin/hf repos create beautylens-artifacts --type model
beautylens/.venv/bin/hf upload YOUR_HF_USER/beautylens-artifacts beautylens/models/final/best.pt best.pt
beautylens/.venv/bin/hf upload YOUR_HF_USER/beautylens-artifacts beautylens/data/shade_catalog_seed.json shade_catalog_seed.json
```

**Do not rely on the runtime fetch as the primary path on Cloud Run.** The
filesystem is per-instance, so every cold start would re-download; anonymous
HF downloads from shared cloud egress IPs get rate-limited hard enough to
blow Cloud Run's 240s startup probe deadline and put the service in a boot
loop. This happened; baking the artifacts into the image is the fix.

## 8.4 One-Time: Google Project Setup

```bash
gcloud auth login                            # browser flow; use the Firebase project's account
gcloud config set project YOUR_FIREBASE_PROJECT_ID
gcloud billing accounts list                 # find ACCOUNT_ID
gcloud billing projects link YOUR_FIREBASE_PROJECT_ID --billing-account=ACCOUNT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

If your personal Google account is not on the Firebase project: in the
Firebase console, Project settings > Users and permissions > add it as
Owner. That maps to Cloud IAM. Allow a few minutes for the grant to
propagate; a fresh grant can still return `IAM_PERMISSION_DENIED` on the
first deploy attempt.

## 8.5 Deploy

From the **repository root** (the directory containing `Dockerfile` and
`.gcloudignore` -- deploying from the wrong directory silently builds a
broken buildpack image; see Troubleshooting):

```bash
gcloud run deploy beautylens-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi --cpu 2 \
  --max-instances 1 \
  --cpu-boost \
  --set-env-vars "HF_MODEL_REPO=YOUR_HF_USER/beautylens-artifacts,FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID" \
  --quiet
```

- **No Firebase key or secret anywhere:** on Cloud Run the backend
  authenticates through the runtime service account (Application Default
  Credentials -- a path `firebase_auth.py` supports natively).
  `FIREBASE_PROJECT_ID` tells token verification its audience.
- Do **not** set `ADMIN_ENDPOINTS_ENABLED` or `RATE_LIMIT_DISABLED`; the
  defaults (admin endpoints off, rate limiting on) are the production-safe
  ones.
- The container honours whatever `PORT` Cloud Run injects.
- First build takes 5-10 minutes on Cloud Build; redeploys are faster.

### Verify

```bash
URL=$(gcloud run services describe beautylens-api --region us-central1 --format="value(status.url)")
curl "$URL/health"                     # {"status":"healthy","model_loaded":true,...}
curl -X POST "$URL/set-confidence" -H "Content-Type: application/json" -d '{"threshold":0.5}'
                                       # must be 404: admin endpoints gated off
```

Startup logs should show `Model loaded` and `Seeded shade catalog` with
**no** `[deploy] fetched` lines (proof the artifacts are baked in). Check:
`gcloud logging read 'resource.type="cloud_run_revision"' --limit 10`.

### Local image verification (optional but recommended)

```bash
docker build -t beautylens-api .
docker run -d -p 7861:7860 beautylens-api     # artifacts baked in; no mounts needed
curl localhost:7861/health
```

## 8.6 Point the App at It

```bash
# beautylens/.env  (both lines; DEV makes Expo Go use the cloud API too)
EXPO_PUBLIC_API_BASE_URL_DEV=https://YOUR-SERVICE-URL.run.app
EXPO_PUBLIC_API_BASE_URL_PROD=https://YOUR-SERVICE-URL.run.app
```

`eas.json` carries the same PROD URL plus the six `EXPO_PUBLIC_FIREBASE_*`
web-config values (explicitly non-secret) in its build profiles, because
`.env` is gitignored and never reaches EAS build servers.

## 8.7 Phone Installs

**iPhone (free Apple account):** standalone install via cable.

```bash
cd beautylens
rm -rf ios
npx expo run:ios --device "DEVICE NAME" --configuration Release
```

- Find the device name with `xcrun devicectl list devices`. Passing
  `--device "name"` explicitly avoids the interactive picker.
- One-time on this Mac: Xcode > Settings > Accounts > add your Apple ID;
  then open `ios/beautylens.xcworkspace`, target > Signing & Capabilities >
  Automatically manage signing > select your Personal Team.
- One-time on the phone: enable Developer Mode
  (Settings > Privacy & Security), and trust the developer profile on first
  launch (Settings > General > VPN & Device Management).
- The keychain password prompt during the build wants your **Mac login
  password**; click "Always Allow".
- Free-account installs expire after **7 days**; rerun the same command to
  re-sign. The app is otherwise fully standalone: no Metro, no laptop, any
  network.

**Android:** `npx eas build -p android --profile preview` (free Expo
account required) produces a shareable APK that does not expire.

## 8.8 Operations

- **Cold starts:** ~20-40s after idle (scale-to-zero + model load). Warm it
  before a demo: `curl $URL/health`. `--min-instances 1` removes cold
  starts but forfeits scale-to-zero pricing.
- **Redeploy after backend changes:** rerun the section 8.5 command.
- **Model update:** replace `beautylens/models/final/best.pt` locally,
  upload the new version to the HF artifact repo (for the fallback), and
  redeploy.
- **Data persistence:** the SQLite database is ephemeral; the shade catalog
  reseeds itself at boot, but user profiles/scans reset when the instance
  is replaced. Documented tradeoff for the capstone; the upgrade path is a
  managed Postgres and a small `db.py` change to accept a full database URL.
- **Teardown:** `gcloud run services delete beautylens-api --region us-central1`
  and unlink billing if desired.

## 8.9 Troubleshooting (every one of these actually happened)

| Symptom | Cause | Fix |
|---|---|---|
| `PermissionError: [Errno 13] ... mkdir 'models'` at boot, only on Cloud Build images | `WORKDIR` creates directories root-owned on classic builders; only BuildKit (Docker 23+) chowns them to the active `USER`, so the image worked locally but not from Cloud Build | The Dockerfile creates and chowns the app dir explicitly while still root |
| Boot loop: `STARTUP TCP probe failed ... DEADLINE_EXCEEDED`, app requests aborted with "no available instance" | Cold starts re-downloading artifacts from HF anonymously; shared cloud IPs get rate-limited into exceeding the probe deadline | Bake artifacts into the image (current setup); keep the fetch only as fallback |
| `IAM_PERMISSION_DENIED` on first deploy right after being granted access | IAM propagation lag (minutes) | Wait and retry; confirm with `gcloud projects get-iam-policy` |
| `Missing required argument [--clear-base-image]` | A previous deploy from the wrong directory (no Dockerfile in context) built via buildpacks and left a base-image property on the service | Deploy from the repo root and pass `--clear-base-image` once |
| Deploy builds a buildpack image instead of the Dockerfile | `gcloud run deploy --source .` run from a subdirectory | Always deploy from the repository root |
| `Failed Registering Bundle Identifier` in Xcode | Apple permanently ties a bundle id to the first personal team that registers it; the committed id belongs to a teammate | Change `ios.bundleIdentifier` in `app.json` to something unique, regenerate `ios/`, and do not commit the change |
| `CommandError: Input is required ... Select a device` | `expo run:ios --device` prompt cannot run non-interactively | Pass the device name: `--device "Chloe Q"` (list with `xcrun devicectl list devices`) |
| `No code signing certificates are available` | No Apple ID/personal team configured in Xcode on this machine | One-time Xcode account + Signing & Capabilities setup (section 8.7) |
| `Developer Mode disabled` in build output | iOS blocks dev installs until Developer Mode is on | Settings > Privacy & Security > Developer Mode; phone restarts |
| App installed but launch fails / "Untrusted Developer" | First install from an untrusted personal team | Settings > General > VPN & Device Management > Trust |
| App stuck on the loading screen right after deploy | The single instance was cold or boot-looping, so `/auth/session` never answered | Fix the service first (see boot loop row), then Try Again in the app |
