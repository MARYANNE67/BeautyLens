/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',

  watchman: false,
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
    '<rootDir>/jest.setup.ts',
  ],

  // Allow jest to transform Expo / React Native packages (they ship as ESM).
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '(jest-)?react-native' +
      '|@react-native(-community)?' +
      '|expo(nent)?' +
      '|@expo(nent)?/.*' +
      '|@expo-google-fonts/.*' +
      '|react-navigation' +
      '|@react-navigation/.*' +
      '|@unimodules/.*' +
      '|unimodules' +
      '|react-native-svg' +
      '|react-native-safe-area-context' +
      '|react-native-reanimated' +
    '))',
  ],

  moduleNameMapper: {
    // Stub static assets (images, fonts) that Jest cannot process.
    '\\.(png|jpg|jpeg|gif|webp|ttf|otf|woff|woff2)$':
      '<rootDir>/__mocks__/fileMock.js',
  },

  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/*.test.{ts,tsx}',
  ],

  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
};