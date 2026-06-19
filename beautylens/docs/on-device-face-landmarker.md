# On-Device Face Landmarker

BeautyLens now prefers an on-device MediaPipe Face Landmarker path for virtual try-on face mesh detection.
The app still falls back to the FastAPI `/detect-face-mesh` endpoint when the native module is unavailable,
which keeps Expo Go usable during development.

## What Changed

- `src/app/camera.tsx` calls `detectFaceMeshForTryOn(...)`.
- `src/services/faceMesh.ts` chooses on-device detection first.
- `src/services/onDeviceFaceLandmarker.ts` wraps the native module.
- `src/utils/faceMeshRegions.ts` recreates the backend MediaPipe region mapping on the client.
- `modules/expo-face-landmarker` contains the local Expo native module scaffold.

## Requirements

This native module does not run in plain Expo Go. Use a development build.

```bash
npx expo install expo-dev-client
npm install
bash scripts/download-face-landmarker-model.sh
npx expo prebuild
npx expo run:ios
# or
npx expo run:android
```

The model download script copies `face_landmarker.task` into:

- `modules/expo-face-landmarker/android/src/main/assets/face_landmarker.task`
- `modules/expo-face-landmarker/ios/Resources/face_landmarker.task`

## Current Scope

This first native step runs MediaPipe on captured still images from `expo-camera`.
That removes the network round trip while preserving the existing camera and overlay code.
The next performance step is replacing `expo-camera` snapshots with a live frame processor.
