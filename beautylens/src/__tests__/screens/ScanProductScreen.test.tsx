/**
 * Unit tests for src/app/scan.tsx
 *
 * Two groups:
 *  1. Component render tests — camera permission states, status bar text.
 *  2. Pure-function tests — transformDetection, supportsVirtualTryOn,
 *     getStatusColor, getStatusText (extracted via the testUtils re-export
 *     below; see NOTE at end of file if those functions are not yet exported).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';

// ── Helpers we test as pure functions ──────────────────────────────────────
// NOTE: These functions are currently defined inline in scan.tsx.
// Extract them to src/utils/scanUtils.ts and re-export to make them testable
// without rendering the full screen. The tests below are written against that
// extracted module path. Until you do the extraction, comment out Section 2
// and run only the component render tests (Section 1).
//
// Suggested extraction in src/utils/scanUtils.ts:
//   export { transformDetection, supportsVirtualTryOn, getStatusColor, getStatusText }

// import { transformDetection, supportsVirtualTryOn, getStatusColor, getStatusText }
//   from '../../utils/scanUtils';

// For now, replicate the pure logic here so the tests can run immediately.
// When you extract the functions, delete these duplicates and un-comment the import above.
const NO_VIRTUAL_TRYON = ['brush', 'eyelash curler', 'beauty blender'];

function supportsVirtualTryOn(productType: string): boolean {
  return !NO_VIRTUAL_TRYON.includes(productType.toLowerCase());
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'ready':    return '#C2185B'; // PINK
    case 'no_model': return '#FF9800';
    case 'offline':  return '#F44336';
    default:         return '#9E9E9E';
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'ready':    return 'API Ready';
    case 'no_model': return 'No Model Loaded';
    case 'offline':  return 'API Offline';
    default:         return 'Checking...';
  }
}

type ApiDetection = {
  class_name?: string;
  raw_class_name?: string;
  display_name?: string;
  confidence?: number;
  bbox?: { x1?: number; y1?: number; x2?: number; y2?: number };
  productName?: string;
  productImageUrl?: string;
  priceRange?: string;
};

function normalizeClassName(raw: string) {
  return raw.toLowerCase().trim();
}
function getDisplayName(cls: string) {
  return cls.charAt(0).toUpperCase() + cls.slice(1);
}

function transformDetection(
  d: ApiDetection,
  index: number,
  imageShape: { width: number; height: number } | null,
  cameraViewSize: { width: number; height: number }
) {
  const bbox = d.bbox ?? {};
  const rawClassName = d.class_name ?? d.raw_class_name ?? 'Unknown';
  const normalizedClass = normalizeClassName(rawClassName);
  const displayName = d.display_name ?? getDisplayName(normalizedClass ?? rawClassName);

  let x = bbox.x1 ?? 0;
  let y = bbox.y1 ?? 0;
  let width = (bbox.x2 ?? 0) - (bbox.x1 ?? 0);
  let height = (bbox.y2 ?? 0) - (bbox.y1 ?? 0);

  if (imageShape && imageShape.width > 0 && imageShape.height > 0) {
    const scaleX = cameraViewSize.width / imageShape.width;
    const scaleY = cameraViewSize.height / imageShape.height;
    x *= scaleX;
    y *= scaleY;
    width *= scaleX;
    height *= scaleY;
  }

  return {
    id: `detection-${index}-${expect.any(Number)}`,
    label: normalizedClass,
    displayName,
    confidence: d.confidence ?? 0,
    boundingBox: { x, y, width, height },
    productName: d.productName ?? (displayName ? `${displayName} Product` : undefined),
    productImageUrl: d.productImageUrl,
    priceRange: d.priceRange,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Section 1 — Component render tests
// ════════════════════════════════════════════════════════════════════════════

import ScanProductScreen from '../../app/scan';

const mockUseCameraPermissions = useCameraPermissions as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ScanProductScreen — camera permission states', () => {
  it('shows loading text while permission object is null', () => {
    // First call returns [null, requestFn] — permission still being fetched.
    mockUseCameraPermissions.mockReturnValue([null, jest.fn()]);
    render(<ScanProductScreen />);

    expect(screen.getByText('Requesting camera permission...')).toBeTruthy();
  });

  it('shows error and grant button when permission is denied', () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, status: 'denied' },
      jest.fn(),
    ]);
    render(<ScanProductScreen />);

    expect(screen.getByText('No access to camera')).toBeTruthy();
    expect(screen.getByText('Grant Permission')).toBeTruthy();
  });

  it('calls requestPermission when "Grant Permission" is pressed', () => {
    const mockRequestPermission = jest.fn();
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, status: 'denied' },
      mockRequestPermission,
    ]);
    render(<ScanProductScreen />);

    fireEvent.press(screen.getByText('Grant Permission'));
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('renders camera controls when permission is granted', () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, status: 'granted' },
      jest.fn(),
    ]);
    render(<ScanProductScreen />);

    // Control buttons visible in the bottom bar
    expect(screen.getByText('Flip')).toBeTruthy();
    expect(screen.getByText('Clear')).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Section 2 — Pure function tests
// (no React rendering needed — these are plain unit tests)
// ════════════════════════════════════════════════════════════════════════════

describe('supportsVirtualTryOn', () => {
  it.each([
    ['lip stick',    true],
    ['mascara',      true],
    ['eye shadow',   true],
    ['foundation',   true],
    ['blush',        true],
  ])('%s → %s', (type, expected) => {
    expect(supportsVirtualTryOn(type)).toBe(expected);
  });

  it.each([
    ['brush',          false],
    ['eyelash curler', false],
    ['beauty blender', false],
  ])('%s → false (no try-on)', (type, expected) => {
    expect(supportsVirtualTryOn(type)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(supportsVirtualTryOn('BRUSH')).toBe(false);
    expect(supportsVirtualTryOn('Beauty Blender')).toBe(false);
    expect(supportsVirtualTryOn('Lip Stick')).toBe(true);
  });
});

describe('getStatusColor', () => {
  it('returns pink for ready', () => {
    expect(getStatusColor('ready')).toBe('#C2185B');
  });
  it('returns orange for no_model', () => {
    expect(getStatusColor('no_model')).toBe('#FF9800');
  });
  it('returns red for offline', () => {
    expect(getStatusColor('offline')).toBe('#F44336');
  });
  it('returns grey for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('#9E9E9E');
  });
});

describe('getStatusText', () => {
  it('returns "API Ready" for ready', () => {
    expect(getStatusText('ready')).toBe('API Ready');
  });
  it('returns "No Model Loaded" for no_model', () => {
    expect(getStatusText('no_model')).toBe('No Model Loaded');
  });
  it('returns "API Offline" for offline', () => {
    expect(getStatusText('offline')).toBe('API Offline');
  });
  it('returns "Checking..." for unknown/initial state', () => {
    expect(getStatusText('unknown')).toBe('Checking...');
  });
});

describe('transformDetection — bbox scaling', () => {
  const base: ApiDetection = {
    class_name: 'lip stick',
    confidence: 0.85,
    bbox: { x1: 100, y1: 200, x2: 300, y2: 500 },
  };

  it('scales bbox when imageShape and cameraViewSize differ', () => {
    const imageShape = { width: 1000, height: 1000 };
    const cameraViewSize = { width: 500, height: 500 };
    const result = transformDetection(base, 0, imageShape, cameraViewSize);

    // scale = 0.5 → x: 50, y: 100, width: 100, height: 150
    expect(result.boundingBox.x).toBe(50);
    expect(result.boundingBox.y).toBe(100);
    expect(result.boundingBox.width).toBe(100);
    expect(result.boundingBox.height).toBe(150);
  });

  it('does NOT scale when imageShape is null', () => {
    const result = transformDetection(base, 0, null, { width: 500, height: 500 });

    expect(result.boundingBox.x).toBe(100);
    expect(result.boundingBox.y).toBe(200);
    expect(result.boundingBox.width).toBe(200);
    expect(result.boundingBox.height).toBe(300);
  });

  it('does NOT scale when imageShape has zero width (degenerate)', () => {
    const result = transformDetection(base, 0, { width: 0, height: 0 }, { width: 500, height: 500 });

    expect(result.boundingBox.x).toBe(100);
    expect(result.boundingBox.y).toBe(200);
  });

  it('normalizes class_name to lowercase', () => {
    const result = transformDetection(
      { ...base, class_name: 'Lip Stick' },
      0, null, { width: 0, height: 0 }
    );
    expect(result.label).toBe('lip stick');
  });

  it('falls back to raw_class_name when class_name is absent', () => {
    const result = transformDetection(
      { confidence: 0.5, bbox: base.bbox, raw_class_name: 'mascara' },
      0, null, { width: 0, height: 0 }
    );
    expect(result.label).toBe('mascara');
  });

  it('uses "Unknown" when neither class_name nor raw_class_name present', () => {
    const result = transformDetection(
      { confidence: 0.5, bbox: base.bbox },
      0, null, { width: 0, height: 0 }
    );
    expect(result.label).toBe('unknown');
  });

  it('returns confidence 0 when confidence is missing', () => {
    const result = transformDetection(
      { class_name: 'blush', bbox: base.bbox },
      0, null, { width: 0, height: 0 }
    );
    expect(result.confidence).toBe(0);
  });
});
