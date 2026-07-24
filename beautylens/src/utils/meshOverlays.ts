/**
 * Mesh Overlay System
 *
 * Handles rendering of different mesh overlays based on product class.
 * Each product class can have its own custom mesh overlay implementation.
 *
 * Ported faithfully from the original mobile/utils/meshOverlays.js (sea710
 * reference repo) — same renderer-per-product-type architecture, same
 * scaling math, same duplicate-point deduplication for lips.
 */

import type { FaceMeshResult, FacialRegions, Landmark } from '../types';

export interface ScalingParams {
  landmarks: Landmark[];
  viewWidth: number;
  viewHeight: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  mirrorX: boolean;
}

export interface MeshPoint {
  key: string;
  x: number;
  y: number;
  type: 'landmark' | 'lip' | 'eye' | 'face';
  size?: number;
}

export interface MeshPolygon {
  key: string;
  type: 'polygon';
  points: { x: number; y: number }[];
  holes?: { x: number; y: number }[][];
  color: string;
  opacity: number;
  strokeOpacity?: number;
  region: string;
}

export type MeshShape = MeshPoint | MeshPolygon;

/**
 * Get facial regions from face mesh data
 */
export const getFacialRegions = (faceMeshData: FaceMeshResult | null): FacialRegions | null => {
  if (!faceMeshData || !faceMeshData.facial_regions) {
    return null;
  }
  return faceMeshData.facial_regions;
};

/**
 * Scale a single landmark/point from photo space to view space,
 * applying the letterbox/pillarbox offset and front-camera mirroring.
 */
function scalePoint(
  point: { x: number; y: number },
  scaleX: number,
  scaleY: number,
  offsetX: number,
  offsetY: number,
  mirrorX: boolean,
  viewWidth: number
): { x: number; y: number } {
  let scaledX = point.x * scaleX + offsetX;
  const scaledY = point.y * scaleY + offsetY;

  if (mirrorX) {
    scaledX = viewWidth - scaledX;
  }

  return { x: scaledX, y: scaledY };
}

/**
 * Render mesh overlay for a specific product class.
 * Maps product type strings to their dedicated renderer function.
 */
export const renderClassBasedMesh = (
  productType: string | undefined,
  faceMeshData: FaceMeshResult,
  scalingParams: ScalingParams
): MeshShape[] => {
  const { landmarks } = scalingParams;

  if (!landmarks || landmarks.length === 0) {
    return [];
  }

  const facialRegions = getFacialRegions(faceMeshData);
  const normalizedProductType = productType?.toLowerCase().trim();

  const meshRenderers: Record<
    string,
    (facialRegions: FacialRegions | null, scalingParams: ScalingParams) => MeshShape[]
  > = {
    // Lip products
    'lip stick': renderLipstickMesh,
    lipstick: renderLipstickMesh,
    'lip gloss': renderLipstickMesh,
    lipgloss: renderLipstickMesh,
    'lip liner': renderLipLinerMesh,
    lipliner: renderLipLinerMesh,
    'lip balm': renderLipstickMesh,
    lipbalm: renderLipstickMesh,

    // Face/base products
    foundation: renderFoundationMesh,
    concealer: renderConcealerMesh,
    powder: renderFoundationMesh,
    primer: renderFoundationMesh,

    // Eye products
    'eye liner': renderEyelinerMesh,
    eyeliner: renderEyelinerMesh,
    'eye-liner': renderEyelinerMesh,
    'eye shadow': renderEyeshadowMesh,
    eyeshadow: renderEyeshadowMesh,
    'eye-shadow': renderEyeshadowMesh,
    mascara: renderMascaraMesh,

    // Cheek products
    blush: renderBlushMesh,
    bronzer: renderBlushMesh,
    highlighter: renderHighlighterMesh,
  };

  const renderer = normalizedProductType ? meshRenderers[normalizedProductType] : undefined;

  if (renderer) {
    return renderer(facialRegions, scalingParams);
  }

  // Default: render all landmarks as dots if no specific renderer matches
  return renderDefaultMesh(landmarks, scalingParams);
};

/**
 * Render default mesh (all 468 landmarks as small dots)
 */
export const renderDefaultMesh = (
  landmarks: Landmark[],
  scalingParams: ScalingParams
): MeshPoint[] => {
  const { viewWidth, viewHeight, scaleX, scaleY, offsetX, offsetY, mirrorX } = scalingParams;

  const points: MeshPoint[] = [];

  landmarks.forEach((landmark, index) => {
    let scaledX = landmark.x * scaleX + offsetX;
    const scaledY = landmark.y * scaleY + offsetY;

    if (mirrorX) {
      scaledX = viewWidth - scaledX;
    }

    const margin = 10;
    if (
      scaledX < -margin ||
      scaledX > viewWidth + margin ||
      scaledY < -margin ||
      scaledY > viewHeight + margin
    ) {
      return;
    }

    points.push({
      key: `landmark-${index}`,
      x: scaledX - 1.5,
      y: scaledY - 1.5,
      type: 'landmark',
      size: 3,
    });
  });

  return points;
};

/**
 * Render lipstick mesh overlay.
 * Uses outer_lip if available (already ordered for a closed path),
 * falls back to combining upper_lip + reversed lower_lip.
 * Deduplicates near-identical points before building the polygon.
 */
function renderLipstickMesh(
  facialRegions: FacialRegions | null,
  scalingParams: ScalingParams
): MeshShape[] {
  const { viewWidth, scaleX, scaleY, offsetX, offsetY, mirrorX } = scalingParams;
  const shapes: MeshShape[] = [];

  if (facialRegions) {
    const lipSurfaceConfigs: { key: keyof FacialRegions; shapeKey: string; region: string }[] = [
      { key: 'upper_lip', shapeKey: 'upper-lip-overlay', region: 'upper-lip' },
      { key: 'lower_lip', shapeKey: 'lower-lip-overlay', region: 'lower-lip' },
    ];

    for (const { key, shapeKey, region } of lipSurfaceConfigs) {
      const lipSurface = facialRegions[key];
      if (lipSurface && lipSurface.length >= 3) {
        const pathPoints = lipSurface.map((point) =>
          scalePoint(point, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth)
        );

        shapes.push({
          key: shapeKey,
          type: 'polygon',
          points: pathPoints,
          color: '#C2185B',
          opacity: 0.55,
          strokeOpacity: 0.2,
          region,
        });
      }
    }

    if (shapes.length > 0) {
      return shapes;
    }

    let lipPoints: Landmark[] = [];

    if (facialRegions.outer_lip && facialRegions.outer_lip.length > 0) {
      lipPoints = facialRegions.outer_lip;
    } else if (facialRegions.upper_lip && facialRegions.lower_lip) {
      const upperLip = facialRegions.upper_lip;
      const lowerLip = [...facialRegions.lower_lip].reverse();
      lipPoints = [...upperLip, ...lowerLip];
    }

    if (lipPoints.length >= 3) {
      // Deduplicate near-identical points (small tolerance)
      const uniquePoints: Landmark[] = [];
      const seen = new Set<string>();
      const tolerance = 0.5;

      for (const point of lipPoints) {
        const key = `${Math.round(point.x / tolerance)},${Math.round(point.y / tolerance)}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniquePoints.push(point);
        }
      }

      if (uniquePoints.length >= 3) {
        const pathPoints = uniquePoints.map((point) =>
          scalePoint(point, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth)
        );
        const innerLipPoints =
          facialRegions.inner_lip && facialRegions.inner_lip.length >= 3
            ? facialRegions.inner_lip.map((point) =>
                scalePoint(point, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth)
              )
            : undefined;

        shapes.push({
          key: 'lip-overlay',
          type: 'polygon',
          points: pathPoints,
          holes: innerLipPoints ? [innerLipPoints] : undefined,
          color: '#C2185B',
          opacity: 0.55,
          strokeOpacity: 0.2,
          region: 'lips',
        });
      }
    }
  }

  return shapes;
}

/**
 * Render lip liner mesh overlay — same shape as lipstick, more transparent.
 */
function renderLipLinerMesh(
  facialRegions: FacialRegions | null,
  scalingParams: ScalingParams
): MeshShape[] {
  const shapes = renderLipstickMesh(facialRegions, scalingParams);
  return shapes.map((shape) => ({ ...shape, opacity: 0.35, strokeOpacity: 0.25 })) as MeshShape[];
}

/**
 * Render foundation mesh overlay — face oval region, gold tint.
 */
function renderFoundationMesh(
  facialRegions: FacialRegions | null,
  scalingParams: ScalingParams
): MeshShape[] {
  const { viewWidth, scaleX, scaleY, offsetX, offsetY, mirrorX } = scalingParams;
  const shapes: MeshShape[] = [];

  if (facialRegions?.face_oval && facialRegions.face_oval.length > 0) {
    const pathPoints = facialRegions.face_oval.map((point) =>
      scalePoint(point, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth)
    );

    shapes.push({
      key: 'face-overlay',
      type: 'polygon',
      points: pathPoints,
      color: '#D4956A',
      opacity: 0.22,
      region: 'face',
    });
  }

  return shapes;
}

/**
 * Render concealer mesh overlay — under-eye regions + around mouth.
 */
function renderConcealerMesh(
  facialRegions: FacialRegions | null,
  scalingParams: ScalingParams
): MeshShape[] {
  const { viewWidth, scaleX, scaleY, offsetX, offsetY, mirrorX } = scalingParams;
  const shapes: MeshShape[] = [];

  if (!facialRegions) return shapes;

  const regionConfigs: { key: keyof FacialRegions; shapeKey: string; region: string }[] = [
    { key: 'left_under_eye', shapeKey: 'left-under-eye-overlay', region: 'left-under-eye' },
    { key: 'right_under_eye', shapeKey: 'right-under-eye-overlay', region: 'right-under-eye' },
    { key: 'around_mouth', shapeKey: 'around-mouth-overlay', region: 'around-mouth' },
  ];

  for (const { key, shapeKey, region } of regionConfigs) {
    const regionPoints = facialRegions[key];
    if (regionPoints && regionPoints.length > 0) {
      const pathPoints = regionPoints.map((point) =>
        scalePoint(point, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth)
      );

      shapes.push({
        key: shapeKey,
        type: 'polygon',
        points: pathPoints,
        color: '#E8C9A0',
        opacity: 0.3,
        strokeOpacity: 0.05,
        region,
      });
    }
  }

  return shapes;
}

/**
 * Render eyeliner mesh overlay — left + right eye regions, blue.
 */
function renderEyelinerMesh(
  facialRegions: FacialRegions | null,
  scalingParams: ScalingParams
): MeshShape[] {
  const { viewWidth, scaleX, scaleY, offsetX, offsetY, mirrorX } = scalingParams;
  const shapes: MeshShape[] = [];

  if (!facialRegions) return shapes;

  const leftEye = facialRegions.left_eye || [];
  const rightEye = facialRegions.right_eye || [];

  if (leftEye.length >= 3) {
    const leftEyePoints = leftEye.map((point) =>
      scalePoint(point, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth)
    );
    shapes.push({
      key: 'left-eye-overlay',
      type: 'polygon',
      points: leftEyePoints,
      color: '#1A1A1A',
      opacity: 0.7,
      region: 'left-eye',
    });
  }

  if (rightEye.length >= 3) {
    const rightEyePoints = rightEye.map((point) =>
      scalePoint(point, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth)
    );
    shapes.push({
      key: 'right-eye-overlay',
      type: 'polygon',
      points: rightEyePoints,
      color: '#1A1A1A',
      opacity: 0.7,
      region: 'right-eye',
    });
  }

  return shapes;
}

/**
 * Render eyeshadow mesh overlay — eyebrow/upper-eyelid region, purple.
 */
function renderEyeshadowMesh(
  facialRegions: FacialRegions | null,
  scalingParams: ScalingParams
): MeshShape[] {
  const { viewWidth, scaleX, scaleY, offsetX, offsetY, mirrorX } = scalingParams;
  const shapes: MeshShape[] = [];

  if (!facialRegions) return shapes;

  if (facialRegions.left_eyeshadow && facialRegions.left_eyeshadow.length >= 3) {
    const leftEyeshadowPoints = facialRegions.left_eyeshadow.map((point) =>
      scalePoint(point, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth)
    );
    shapes.push({
      key: 'left-eyeshadow-overlay',
      type: 'polygon',
      points: leftEyeshadowPoints,
      color: '#6D3B7C',
      opacity: 0.35,
      strokeOpacity: 0.1,
      region: 'left-eyeshadow',
    });
  }

  if (facialRegions.right_eyeshadow && facialRegions.right_eyeshadow.length >= 3) {
    const rightEyeshadowPoints = facialRegions.right_eyeshadow.map((point) =>
      scalePoint(point, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth)
    );
    shapes.push({
      key: 'right-eyeshadow-overlay',
      type: 'polygon',
      points: rightEyeshadowPoints,
      color: '#6D3B7C',
      opacity: 0.35,
      strokeOpacity: 0.1,
      region: 'right-eyeshadow',
    });
  }

  return shapes;
}

/**
 * Render mascara mesh overlay — same shape as eyeliner, black + darker.
 */
function renderMascaraMesh(
  facialRegions: FacialRegions | null,
  scalingParams: ScalingParams
): MeshShape[] {
  const shapes = renderEyelinerMesh(facialRegions, scalingParams);
  return shapes.map((shape) => ({ ...shape, opacity: 0.65, color: '#1A1A1A' })) as MeshShape[];
}

/**
 * Render blush mesh overlay — same shape as foundation, hot pink.
 */
function renderBlushMesh(
  facialRegions: FacialRegions | null,
  scalingParams: ScalingParams
): MeshShape[] {
  const shapes = renderFoundationMesh(facialRegions, scalingParams);
  return shapes.map((shape) => ({ ...shape, opacity: 0.3, color: '#E8748A' })) as MeshShape[];
}

/**
 * Render highlighter mesh overlay — same shape as foundation, yellow + lighter.
 */
function renderHighlighterMesh(
  facialRegions: FacialRegions | null,
  scalingParams: ScalingParams
): MeshShape[] {
  const shapes = renderFoundationMesh(facialRegions, scalingParams);
  return shapes.map((shape) => ({ ...shape, opacity: 0.3, color: '#F5E6A3' })) as MeshShape[];
}
