/**
 * On-device face tracking via react-native-mediapipe + vision-camera.
 *
 * Replaces the server round trip (photo capture -> upload -> MediaPipe ->
 * landmarks back, ~4 Hz) with a native frame processor running the same
 * face-landmarker model on-device at camera frame rate -- the overlay
 * tracks the face instead of lagging behind it. Landmarks come back in
 * the same 468-index topology the whole zone system is built on, so
 * everything downstream (tutorialZones, faceGeometry, meshOverlays) is
 * unchanged; facial regions are rebuilt locally (utils/facialRegions.ts).
 *
 * IMPORTANT: this module must only be require()d behind a guard (see
 * camera.tsx) -- react-native-mediapipe throws AT IMPORT TIME when the
 * vision-camera native runtime isn't present (e.g. in Expo Go), which is
 * how the camera screen falls back to the server pipeline there.
 */

import React, { forwardRef, useCallback, useRef } from 'react';
import type { ViewStyle } from 'react-native';
import {
  MediapipeCamera,
  RunningMode,
  Delegate,
  useFaceLandmarkDetection,
  type FaceLandmarkDetectionResultBundle,
} from 'react-native-mediapipe';
import type { Camera } from 'react-native-vision-camera';

import { buildFacialRegions } from '../utils/facialRegions';
import type { FaceMeshResult, Landmark } from '../types';

const MODEL_FILE = 'face_landmarker.task'; // bundled by plugins/withMediapipeModel.js

// Same exponential smoothing idea as the server path, tuned snappier: at
// ~30 Hz the raw output only jitters by a pixel or two, so a high factor
// kills shimmer without adding visible lag.
const SMOOTHING_FACTOR = 0.75;

export interface OnDeviceFaceCameraProps {
  style: ViewStyle;
  /** Fired with a server-shaped FaceMeshResult every processed frame. */
  onFaceMesh: (result: FaceMeshResult) => void;
  /** Fired when a processed frame contains no face. */
  onNoFace: () => void;
}

/**
 * Camera preview + on-device landmark stream. Exposes the underlying
 * vision-camera Camera via ref (MediapipeCamera sets photo={true}) so the
 * existing capture flow can call takePhoto() on it.
 */
export const OnDeviceFaceCamera = forwardRef<Camera, OnDeviceFaceCameraProps>(
  function OnDeviceFaceCamera({ style, onFaceMesh, onNoFace }, ref) {
    const smoothedRef = useRef<Landmark[] | null>(null);

    const onResults = useCallback(
      (bundle: FaceLandmarkDetectionResultBundle) => {
        const normalized = bundle.results[0]?.faceLandmarks?.[0];
        if (!normalized || normalized.length === 0) {
          smoothedRef.current = null;
          onNoFace();
          return;
        }

        const width = bundle.inputImageWidth;
        const height = bundle.inputImageHeight;

        // Normalized (0-1) -> pixel space, the convention every consumer
        // already expects from the server pipeline (z scaled by width,
        // matching MediaPipe's own convention).
        let landmarks: Landmark[] = normalized.map((lm) => ({
          x: lm.x * width,
          y: lm.y * height,
          z: (lm.z ?? 0) * width,
        }));

        const prev = smoothedRef.current;
        if (prev && prev.length === landmarks.length) {
          landmarks = landmarks.map((lm, i) => ({
            x: prev[i].x + SMOOTHING_FACTOR * (lm.x - prev[i].x),
            y: prev[i].y + SMOOTHING_FACTOR * (lm.y - prev[i].y),
            z: prev[i].z + SMOOTHING_FACTOR * (lm.z - prev[i].z),
          }));
        }
        smoothedRef.current = landmarks;

        onFaceMesh({
          status: 'success',
          face_detected: true,
          landmarks,
          num_landmarks: landmarks.length,
          image_dimensions: { width, height },
          facial_regions: buildFacialRegions(landmarks),
        });
      },
      [onFaceMesh, onNoFace]
    );

    const onError = useCallback((error: { message?: string }) => {
      console.log('[OnDeviceFaceTracker] detection error:', error?.message);
    }, []);

    const solution = useFaceLandmarkDetection(
      onResults,
      onError,
      RunningMode.LIVE_STREAM,
      MODEL_FILE,
      {
        numFaces: 1,
        delegate: Delegate.GPU,
        // The server pipeline returns landmarks in unmirrored photo space
        // and camera.tsx's scalePoint() applies front-camera mirroring
        // itself -- keep the on-device stream in the same convention.
        mirrorMode: 'no-mirror',
      }
    );

    return <MediapipeCamera ref={ref} style={style} solution={solution} activeCamera="front" resizeMode="cover" />;
  }
);
