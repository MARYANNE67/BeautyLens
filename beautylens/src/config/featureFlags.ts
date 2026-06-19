/**
 * Feature Flags and Configuration
 * Centralized configuration for feature toggles, testing modes, and app settings.
 */

import { Dimensions } from 'react-native';
import Constants from 'expo-constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const FeatureFlags = {
  USE_MOCK_DETECTIONS: false,
  ENABLE_FACE_MESH: true,
  ENABLE_DEFAULT_FACE_MESH: false,
  ENABLE_SHADE_MATCHING: false,   // off until feat/shade-matching branch
  ENABLE_LOOK_BUILDER: false,     // off until feat/look-builder branch
} as const;

export type FeatureFlagKey = keyof typeof FeatureFlags;

export interface MockDetection {
  class_name: string;
  display_name: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  productName: string;
  priceRange: string;
}

export const MockDetectionConfig = {
  MOCK_DETECTIONS: [
    {
      class_name: 'lip stick',
      display_name: 'Lip Stick',
      confidence: 0.85,
      bbox: {
        x1: SCREEN_WIDTH * 0.3,
        y1: SCREEN_HEIGHT * 0.4,
        x2: SCREEN_WIDTH * 0.7,
        y2: SCREEN_HEIGHT * 0.6,
      },
      productName: 'Fenty Beauty Pro Filtr Lipstick',
      priceRange: '$30-$40',
    },
  ] as MockDetection[],
  MOCK_API_DELAY: 500,
};

export const simulateMockDetection = (): Promise<{
  status: string;
  detections: MockDetection[];
  count: number;
}> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        status: 'success',
        detections: MockDetectionConfig.MOCK_DETECTIONS,
        count: MockDetectionConfig.MOCK_DETECTIONS.length,
      });
    }, MockDetectionConfig.MOCK_API_DELAY);
  });
};

export const AppConfig = {
  DETECTION_CONFIDENCE_THRESHOLD: 0.3,
  DETECTION_INTERVAL: 500,
  API_BASE_URL_DEV:
    (Constants.expoConfig?.extra?.apiBaseUrlDev as string) || 'http://localhost:8000',
  API_BASE_URL_PROD:
    (Constants.expoConfig?.extra?.apiBaseUrlProd as string) ||
    'https://your-production-api.com',
};
