#!/usr/bin/env bash
set -euo pipefail

MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
ANDROID_DIR="modules/expo-face-landmarker/android/src/main/assets"
IOS_DIR="modules/expo-face-landmarker/ios/Resources"

mkdir -p "$ANDROID_DIR" "$IOS_DIR"

curl -L "$MODEL_URL" -o "$ANDROID_DIR/face_landmarker.task"
cp "$ANDROID_DIR/face_landmarker.task" "$IOS_DIR/face_landmarker.task"

echo "Downloaded MediaPipe Face Landmarker model for Android and iOS."
