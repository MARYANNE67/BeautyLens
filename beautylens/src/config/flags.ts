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
} as const;

export type FeatureFlagKey = keyof typeof FeatureFlags;
