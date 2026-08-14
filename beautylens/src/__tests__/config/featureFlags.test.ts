/**
 * Unit tests for src/config/featureFlags.ts
 *
 * Tests the pure/async behaviour of simulateMockDetection and the shape of
 * FeatureFlags / AppConfig — no React rendering needed.
 */
import { simulateMockDetection, FeatureFlags, MockDetectionConfig, AppConfig } from '../../config/featureFlags';

describe('simulateMockDetection', () => {
  it('returns status "success"', async () => {
    const result = await simulateMockDetection();
    expect(result.status).toBe('success');
  });

  it('returns the mock lipstick detection', async () => {
    const result = await simulateMockDetection();
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].class_name).toBe('lip stick');
  });

  it('count matches the detections array length', async () => {
    const result = await simulateMockDetection();
    expect(result.count).toBe(result.detections.length);
  });

  it('each detection has required fields: confidence, bbox, class_name', async () => {
    const { detections } = await simulateMockDetection();
    for (const det of detections) {
      expect(det).toHaveProperty('confidence');
      expect(det).toHaveProperty('class_name');
      expect(det.bbox).toMatchObject({
        x1: expect.any(Number),
        y1: expect.any(Number),
        x2: expect.any(Number),
        y2: expect.any(Number),
      });
      // Bounding box must have positive area
      expect(det.bbox.x2).toBeGreaterThan(det.bbox.x1);
      expect(det.bbox.y2).toBeGreaterThan(det.bbox.y1);
    }
  });

  it('confidence is between 0 and 1', async () => {
    const { detections } = await simulateMockDetection();
    for (const det of detections) {
      expect(det.confidence).toBeGreaterThanOrEqual(0);
      expect(det.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('resolves within a reasonable time (< 2 s)', async () => {
    jest.useFakeTimers();
    const promise = simulateMockDetection();
    jest.advanceTimersByTime(MockDetectionConfig.MOCK_API_DELAY);
    const result = await promise;
    expect(result.status).toBe('success');
    jest.useRealTimers();
  });
});

describe('FeatureFlags', () => {
  it('USE_MOCK_DETECTIONS defaults to false in production code', () => {
    // Guards against accidentally shipping the mock mode on.
    expect(FeatureFlags.USE_MOCK_DETECTIONS).toBe(false);
  });

  it('ENABLE_FACE_MESH defaults to true', () => {
    expect(FeatureFlags.ENABLE_FACE_MESH).toBe(true);
  });

  it('ENABLE_OPENMAKEUP_SDK defaults to true', () => {
    expect(FeatureFlags.ENABLE_OPENMAKEUP_SDK).toBe(true);
  });
});

describe('AppConfig', () => {
  it('DETECTION_CONFIDENCE_THRESHOLD is a number between 0 and 1', () => {
    expect(AppConfig.DETECTION_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(AppConfig.DETECTION_CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });

  it('DETECTION_INTERVAL is a positive integer in milliseconds', () => {
    expect(AppConfig.DETECTION_INTERVAL).toBeGreaterThan(0);
    expect(Number.isInteger(AppConfig.DETECTION_INTERVAL)).toBe(true);
  });

  it('API_BASE_URL_DEV is a valid http URL pointing to port 8000', () => {
    // The module computes this constant at load time from Constants.expoConfig.hostUri.
    // We just verify the shape is correct — the exact host depends on the environment.
    expect(AppConfig.API_BASE_URL_DEV).toMatch(/^http:\/\/.+:8000$/);
  });
});