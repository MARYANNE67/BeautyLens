/**
 * Feature flags -- kept in their own file, separate from the rest of
 * config/featureFlags.ts (AppConfig, mock-detection data, API host
 * resolution), so toggling a flag never means scrolling past unrelated
 * config to find it.
 */

export const FeatureFlags = {
  USE_MOCK_DETECTIONS: false,
  ENABLE_FACE_MESH: true,
  ENABLE_DEFAULT_FACE_MESH: false,
  ENABLE_SHADE_MATCHING: false,   // off until feat/shade-matching branch
  ENABLE_LOOK_BUILDER: false,     // off until feat/look-builder branch
  // Skips the login redirect and adds a "Skip login" button on the login
  // screen. Always AND-ed with __DEV__ at the call site, so a stray `true`
  // left on here can never affect a production/release build. Default off --
  // flip to true locally when you want to skip auth friction.
  DEV_BYPASS_LOGIN: true,
  // Adds a "468" toggle on the camera screen that renders every face-mesh
  // landmark as a dot and lets you tap anywhere to identify the nearest
  // landmark indices -- for diagnosing overlay-placement bugs with evidence
  // instead of guessing which landmark is misplaced. AND-ed with __DEV__ at
  // the call site like DEV_BYPASS_LOGIN above.
  DEV_LANDMARK_DEBUG: true,
  // Use the on-device face tracker (vision-camera + react-native-mediapipe
  // frame processor) instead of the server polling pipeline. Only takes
  // effect in builds that include the native modules (dev/EAS builds) --
  // in Expo Go the guarded require in camera.tsx fails and the screen
  // falls back to the server pipeline automatically, so leaving this on
  // is safe everywhere.
  ON_DEVICE_FACE_TRACKING: true,
} as const;

export type FeatureFlagKey = keyof typeof FeatureFlags;
