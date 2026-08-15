# 9. Handoff: Pending Work, Known Limitations, and Future Development

State of the project at handoff, and everything a future developer (or
grader) should know that isn't obvious from the code. Each pending item
links its GitHub issue; the issue tracker is curated and current.

## 9.1 What is complete

- **Product detection** (YOLOv8s, 19 classes) with OCR brand/shade
  enrichment; **skin scan → depth/undertone → cross-brand shade matching**;
  **live AR try-on** and the **face-shape placement tutorial**, both running
  client-side face tracking; **collection tracking**; **Firebase auth** with
  per-user ownership scoping.
- **Test suites**: 276 backend tests + 119 frontend Jest tests, run in CI on
  every PR with a coverage gate, dependency audits, and secret scanning
  (docs/Testing.md, chapter 6).
- **Security audit**: 9 findings (6 fixed, 3 accepted with rationale), 4
  preventive hardening measures (docs/SecurityAudit.md, chapter 7).
- **Deployment**: Dockerized backend deployed to Google Cloud Run and
  verified end-to-end from a physical iPhone; full runbook plus a
  troubleshooting table of every failure hit doing it (docs/Deployment.md,
  chapter 8). The cloud service is torn down between uses to avoid charges;
  redeploying is one documented command.

## 9.2 Pending work (open issues, triaged)

**High value / small:**

- [#13](https://github.com/MARYANNE67/BeautyLens/issues/13) Performance
  benchmarks -- the course's benchmarking module has no report yet; natural
  chapter 9 companion (detect latency, cold vs warm serving, AR frame-rate
  before/after the client-side tracking migration).
- [#19](https://github.com/MARYANNE67/BeautyLens/issues/19) Endpoint tests
  for `/detect-face-mesh` -- the last untested backend module.
- [#165](https://github.com/MARYANNE67/BeautyLens/issues/165) Stop returning
  `model_path` from `/health` -- two-line information-disclosure fix.
- [#12](https://github.com/MARYANNE67/BeautyLens/issues/12) E2E release
  checklist -- run in the week of the final demo.
- [#21](https://github.com/MARYANNE67/BeautyLens/issues/21) Android
  verification -- iOS is verified end-to-end on hardware; Android needs one
  test pass (EAS APK path is fully configured), especially the
  camera-in-WebView AR flows.
- [#161](https://github.com/MARYANNE67/BeautyLens/issues/161) docker-compose
  wrapper -- thin addition on top of the existing Dockerfile.

**The model-quality cluster (one decision, then work):**

- [#27](https://github.com/MARYANNE67/BeautyLens/issues/27) mAP@0.5 >= 0.70
  target, with [#2](https://github.com/MARYANNE67/BeautyLens/issues/2),
  [#3](https://github.com/MARYANNE67/BeautyLens/issues/3),
  [#28](https://github.com/MARYANNE67/BeautyLens/issues/28),
  [#26](https://github.com/MARYANNE67/BeautyLens/issues/26). The README
  states the mAP target as a Capstone II objective, so it should not be
  skipped silently: **measure the current model's mAP first** (training
  scripts are in open PR
  [#123](https://github.com/MARYANNE67/BeautyLens/pull/123)), then either
  retrain to close the gap or document the measured number and rationale.

**Future features (post-capstone):**

- [#160](https://github.com/MARYANNE67/BeautyLens/issues/160) Persistent
  multi-product look-builder state (the scan screen's look tray covers the
  demo case today).
- [#5](https://github.com/MARYANNE67/BeautyLens/issues/5) AR intensity
  slider (a before/after toggle already exists on the shade-preview screen).

## 9.3 Known limitations (accepted, documented)

- **Ephemeral cloud database**: Cloud Run's filesystem is per-instance, so
  user profiles/scans reset on cold starts and redeploys (the catalog
  reseeds itself; the app self-heals by creating a fresh profile at next
  sign-in). Accepted for demo cadence. Upgrade path: free hosted Postgres
  (Neon/Supabase) + a small `db.py` change to accept a full `DATABASE_URL`.
- **Cold starts** of ~20-40s after idle; warm the service before demos with
  one `/health` request.
- **iOS distribution ceiling**: free Apple accounts allow 7-day cable
  installs only (re-run the build command to re-sign); TestFlight requires a
  paid developer account. Android has no such ceiling (EAS APK).
- **Per-team iOS bundle identifiers**: Apple ties a bundle id to the first
  personal team registering it; teammates must use unique local ids (see
  development.md).
- **OCR requires a Google Vision API key**; without one the feature degrades
  gracefully to detection-only. The deployed setup used a Vision-restricted
  key in Secret Manager.
- **Nose/face-shape landmark anchors** in the tutorial are canonical
  MediaPipe picks, marked moderate-confidence in code comments; a visual
  verification pass against annotated portraits would firm them up.
- **npm/pip audit residue**: 32 npm advisories in the Expo build toolchain
  (need breaking SDK upgrades) and 2 protobuf CVEs pinned by mediapipe --
  both accepted with rationale in docs/SecurityAudit.md; revisit at the next
  SDK/mediapipe upgrade.

## 9.4 Operational handoff

- **Cloud**: Google project = the Firebase project (`beautylens-65391`);
  Cloud Run service name `beautylens-api` in `us-central1`; the deploy
  command and required env are in docs/Deployment.md §8.5. Secret Manager
  holds the Vision API key (`google-vision-api-key`).
- **Model artifacts**: HF model repo `chloeq/beautylens-artifacts`
  (`best.pt` + `shade_catalog_seed.json`); baked into the Docker image at
  build time, fetched at startup only as fallback.
- **CI**: `.github/workflows/ci.yml` -- type check/lint/Jest + web export,
  pylint + pytest with >=80% coverage gate, pip-audit/npm-audit/gitleaks
  (scoped allowlist in `.gitleaks.toml` for the public Firebase web key in
  `eas.json`).
- **Local setup**: development.md is the canonical guide (Firebase env,
  shade catalog build, iOS native regeneration gotchas).
