/**
 * Global Jest setup — runs after the test framework is installed.
 * Mock every native / Expo module that isn't available in jsdom.
 */
import '@testing-library/jest-native/extend-expect';

// ── expo-router ───────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  })),
  useFocusEffect: (cb: () => () => void) => {
    // Run the effect once synchronously so the component gets initial data.
    const cleanup = cb();
    return cleanup;
  },
  useLocalSearchParams: jest.fn(() => ({})),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// ── expo-camera ───────────────────────────────────────────────────────────────
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: jest.fn(() => [
    { granted: true, status: 'granted' },
    jest.fn(),
  ]),
}));

// ── expo-linear-gradient ──────────────────────────────────────────────────────
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

// ── @expo/vector-icons ────────────────────────────────────────────────────────
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// ── expo-constants ────────────────────────────────────────────────────────────
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: { hostUri: '192.168.1.1:8081' },
  },
}));

// ── expo-status-bar ───────────────────────────────────────────────────────────
jest.mock('expo-status-bar', () => ({
  StatusBar: 'StatusBar',
}));

// ── react-native-safe-area-context ───────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// ── @react-native-async-storage/async-storage ─────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// ── Internal: local services that hit the real network ───────────────────────
jest.mock('./src/services/api', () => ({
  getLatestSkinScan: jest.fn(),
  getScan: jest.fn(),
  getHealthStatus: jest.fn(),
  detectProducts: jest.fn(),
  previewShade: jest.fn(),
}));

// ── Internal: profile storage (AsyncStorage wrappers) ────────────────────────
jest.mock('./src/utils/profileStorage', () => ({
  getLocalProfileId: jest.fn(() => Promise.resolve(null)),
  getLocalScanId: jest.fn(() => Promise.resolve(null)),
  setLocalScanId: jest.fn(() => Promise.resolve()),
}));

// ── Internal: local components that import native modules ────────────────────
jest.mock('./src/components/LensMark', () => ({
  LensMark: 'LensMark',
}));

jest.mock('./src/components/ProfileFields', () => ({
  SERIF: 'System',
}));