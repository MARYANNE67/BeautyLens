/**
 * App configuration: mock-detection data, dev API host resolution, and
 * detection tuning constants. Feature flags live in ./flags.ts.
 */

import { Dimensions } from 'react-native';
import Constants from 'expo-constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

/**
 * Dev API host resolution, in priority order:
 * 1. EXPO_PUBLIC_API_BASE_URL_DEV (from .env, gitignored) -- explicit override,
 *    e.g. for a tunnel URL or a non-default backend port.
 * 2. Metro's own hostUri (e.g. "192.168.2.66:8081") -- Expo Go/dev-client
 *    already connected to this machine to load the JS bundle, so its IP is
 *    known to be reachable *right now*. This means the backend URL survives
 *    Wi-Fi/DHCP changes without editing any config file.
 * 3. localhost -- web/simulator fallback where the device shares the host's
 *    network namespace.
 */
function resolveDevApiBaseUrl(): string {
  const envOverride = process.env.EXPO_PUBLIC_API_BASE_URL_DEV;
  if (envOverride) return envOverride;

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;

  return 'http://localhost:8000';
}

export const AppConfig = {
  DETECTION_CONFIDENCE_THRESHOLD: 0.3,
  DETECTION_INTERVAL: 500,
  API_BASE_URL_DEV: resolveDevApiBaseUrl(),
  API_BASE_URL_PROD: process.env.EXPO_PUBLIC_API_BASE_URL_PROD || 'https://your-production-api.com',
};
