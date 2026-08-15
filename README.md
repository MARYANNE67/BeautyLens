# BeautyLens: Makeup Detection, Shade Matching & AR Try-On Platform

## Team Information

| Name | Email | Role |
|---|---|---|
| Masuma Begum | mbegum24@myseneca.ca | Full Stack Developer / Tech Lead |
| Chloe Quijano | cquijano@myseneca.ca | Full Stack Developer / Tech Lead |
| Mary-Anne Ibeh | mibeh@myseneca.ca | Full Stack Developer / Tech Lead |

- **Course:** SED800 Capstone II — 2026
- **Instructors:** Miguel Watler, Marcel Jar
- **Repository:** https://github.com/MARYANNE67/BeautyLens

## Project Description

BeautyLens is a computer vision and augmented reality application that allows users to automatically identify makeup products using their device camera and virtually try those products on their own face in real time. The project directly addresses a gap in online and in-store beauty retail: consumers cannot easily visualize how a product will look on them before purchasing.

The system is built on a YOLOv8s object-detection model fine-tuned on a 2,715-image, 19-class makeup dataset, a MediaPipe Face Mesh engine returning 468 3D facial landmarks, a FastAPI backend, and a React Native mobile application. The application is being developed to production standards suitable for deployment in a real beauty retail environment.

The codebase originates from the SkillCred project developed in Capstone I; the FastAPI backend, SQLite persistence layer, and project management artefacts carried over. Capstone II delivered the live AR try-on and face-shape placement tutorial (both on client-side face tracking), cross-brand shade matching from a guided skin scan, a 276-test backend and 119-test frontend suite run in CI, a security audit with fixes, and a Dockerized deployment to Google Cloud Run verified end-to-end from a physical phone. The remaining model-accuracy target (mAP@0.5 ≥ 0.70) is tracked in the issue backlog — see docs/Handoff.md.

## Features

- **Product detection**: point the camera at a makeup product for real-time YOLOv8s detection, with OCR brand/shade recognition (Google Vision API) as a fallback when the visual match is uncertain.
- **Skin scan & shade matching**: a guided front/left/right capture estimates skin depth and undertone, then returns cross-brand foundation/concealer recommendations, refined by the user's beauty profile (skin type, coverage, finish, budget).
- **Live AR virtual try-on**: real-time lipstick, eyeshadow, eyeliner, mascara, blush, and foundation overlays, rendered entirely client-side via MediaPipe face tracking (no per-frame server round-trip).
- **Face-shape placement tutorial**: live contour/concealer/highlighter/blush/bronzer placement guidance, keyed to a face shape classified from measured facial ratios, with the same client-side face-tracking approach as AR try-on.
- **Collection tracking**: save shades from recommendations, track opened/printed expiry dates, and get reminders before a product should be retired.
- **Accounts**: Firebase authentication with an editable profile (display name, beauty preferences).

## Documentation

- [Development guide](beautylens/development.md) — local setup, running backend/frontend, iOS rebuild gotchas
- [Testing](docs/Testing.md) — unit/integration/system/acceptance testing (395 automated tests)
- [Security audit](docs/SecurityAudit.md) — findings, fixes, accepted risks, CI scanners
- [Deployment guide](docs/Deployment.md) — Cloud Run backend, phone installs, troubleshooting
- [Handoff](docs/Handoff.md) — pending work, known limitations, operational details
- [Third-party notices](NOTICE.md) and [LICENSE](LICENSE)

## Firebase Setup

Auth is Firebase on both the backend and the app, and the app will not start without it.

```bash
cd beautylens
cp .env.example .env
```

`.env.example` documents every variable; two must be filled in:

1. **Backend service account**: Firebase Console → Project settings → Service accounts → *Generate new private key*. Save the downloaded `.json` **outside the repo** and point `FIREBASE_CREDENTIALS_FILE` at its path. Without this, the server logs a setup error on startup and every authenticated endpoint returns `503`.
2. **App web config**: Firebase Console → Project settings → Your apps → Web app (`</>`). Copy the six `EXPO_PUBLIC_FIREBASE_*` values in. These are not secrets. Restart Expo with `npx expo start -c` after changing them.

Then enable **Email/Password** sign-in under Firebase Console → Authentication → Sign-in method.

See `beautylens/development.md` for the rest of local setup (shade catalog, running the backend/frontend, etc.).
