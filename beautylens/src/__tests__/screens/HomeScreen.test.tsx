/**
 * Unit tests for src/app/(tabs)/home.tsx
 *
 * Strategy: render the screen with RNTL, override module mocks per-test to
 * control profileId / scan state, then assert on rendered text and router calls.
 *
 * What is NOT tested here (intentionally):
 *  - useFocusEffect network waterfalls (tested by integration tests)
 *  - LinearGradient / ImageBackground visual output (native rendering)
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

import { getLocalProfileId, getLocalScanId } from '../../utils/profileStorage';
import { getScan, getLatestSkinScan } from '../../services/api';
import { useRouter } from 'expo-router';

import HomeScreen from '../../app/(tabs)/home';

// Cast mocks so TypeScript knows they're jest.fn()
const mockGetLocalProfileId = getLocalProfileId as jest.Mock;
const mockGetLocalScanId    = getLocalScanId    as jest.Mock;
const mockGetScan           = getScan           as jest.Mock;
const mockGetLatestSkinScan = getLatestSkinScan as jest.Mock;
const mockPush              = jest.fn();

// Helper: render and flush all pending promises/state updates
async function renderScreen() {
  render(<HomeScreen />);
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: not logged in, no scan
  mockGetLocalProfileId.mockResolvedValue(null);
  mockGetLocalScanId.mockResolvedValue(null);
  (useRouter as jest.Mock).mockReturnValue({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  });
});

// ── Static content ─────────────────────────────────────────────────────────

describe('HomeScreen — static content', () => {
  it('renders the brand name and greeting', async () => {
    await renderScreen();

    expect(screen.getByText('Welcome back to')).toBeTruthy();
    expect(screen.getByText('BeautyLens')).toBeTruthy();
  });

  it('renders the hero headline', async () => {
    await renderScreen();

    expect(screen.getByText('Find My Shade')).toBeTruthy();
  });

  it('renders both secondary feature card titles', async () => {
    await renderScreen();

    expect(screen.getByText('Identify a Product')).toBeTruthy();
    expect(screen.getByText('Makeup Placement Tutorial')).toBeTruthy();
  });

  it('renders the feature card action buttons', async () => {
    await renderScreen();

    expect(screen.getByText('Scan Product')).toBeTruthy();
    expect(screen.getByText('Start Tutorial')).toBeTruthy();
  });
});

// ── Hero button label ──────────────────────────────────────────────────────

describe('HomeScreen — hero button label', () => {
  it('shows "Start Skin Scan" when no scan has been completed', async () => {
    mockGetLocalProfileId.mockResolvedValue(42);
    mockGetLocalScanId.mockResolvedValue(null);
    mockGetLatestSkinScan.mockResolvedValue({ is_complete: false, scan_id: null });

    await renderScreen();

    expect(screen.getByText('Start Skin Scan')).toBeTruthy();
  });

  it('shows "Rescan Skin" when a completed scan exists', async () => {
    mockGetLocalProfileId.mockResolvedValue(42);
    mockGetLocalScanId.mockResolvedValue(7);
    mockGetScan.mockResolvedValue({ is_complete: true, scan_id: 7 });

    await renderScreen();

    expect(screen.getByText('Rescan Skin')).toBeTruthy();
  });

  it('shows "Start Skin Scan" when localScanId exists but backend returns incomplete', async () => {
    mockGetLocalProfileId.mockResolvedValue(42);
    mockGetLocalScanId.mockResolvedValue(5);
    mockGetScan.mockResolvedValue({ is_complete: false, scan_id: 5 });
    mockGetLatestSkinScan.mockResolvedValue({ is_complete: false, scan_id: null });

    await renderScreen();

    expect(screen.getByText('Start Skin Scan')).toBeTruthy();
  });

  it('falls back to "Start Skin Scan" when the scan fetch throws', async () => {
    mockGetLocalProfileId.mockResolvedValue(42);
    mockGetLocalScanId.mockResolvedValue(99);
    mockGetScan.mockRejectedValue(new Error('network error'));
    mockGetLatestSkinScan.mockRejectedValue(new Error('network error'));

    await renderScreen();

    expect(screen.getByText('Start Skin Scan')).toBeTruthy();
  });
});

// ── Navigation ─────────────────────────────────────────────────────────────

describe('HomeScreen — navigation', () => {
  it('hero button navigates to /skin-scan when profileId is set', async () => {
    mockGetLocalProfileId.mockResolvedValue(42);
    mockGetLocalScanId.mockResolvedValue(null);
    mockGetLatestSkinScan.mockResolvedValue({ is_complete: false });

    await renderScreen();

    fireEvent.press(screen.getByText('Start Skin Scan'));
    expect(mockPush).toHaveBeenCalledWith('/skin-scan');
  });

  it('hero button navigates to /account when not logged in', async () => {
    mockGetLocalProfileId.mockResolvedValue(null);

    await renderScreen();

    fireEvent.press(screen.getByText('Start Skin Scan'));
    expect(mockPush).toHaveBeenCalledWith('/account');
  });

  it('"Scan Product" button navigates to /scan', async () => {
    await renderScreen();

    fireEvent.press(screen.getByText('Scan Product'));
    expect(mockPush).toHaveBeenCalledWith('/scan');
  });

  it('"Start Tutorial" button navigates to /tutorial', async () => {
    await renderScreen();

    fireEvent.press(screen.getByText('Start Tutorial'));
    expect(mockPush).toHaveBeenCalledWith('/tutorial');
  });
});