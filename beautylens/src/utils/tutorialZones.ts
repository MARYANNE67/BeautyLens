/**
 * Tutorial-zone overlays for placement-driven product categories.
 *
 * Unlike the color-preview renderers in meshOverlays.ts (which paint the
 * actual product color over lips/eyes), these categories are about
 * technique, not color: contour, concealer, highlighter, blush, bronzer.
 * For these, the camera screen shows WHERE to place the product for the
 * user's specific face shape, as a traced line/band + a small text label,
 * rather than a filled color wash.
 *
 * Zones are built from face_oval-derived groups in faceGeometry.ts plus a
 * handful of already-validated single landmark indices (mouth corners,
 * cupid's bow) that are already used elsewhere in facial_regions.
 */

import type { FaceMeshResult, FacialRegions, Landmark } from '../types';
import {
  scalePoint,
  type ScalingParams,
  type MeshBand,
  type MeshMarker,
  type MeshLabel,
} from './meshOverlays';
import {
  getNewFacialRegions,
  LEFT_CHEEKBONE_INDEX,
  RIGHT_CHEEKBONE_INDEX,
  type FaceShape,
} from './faceGeometry';

export type TutorialShape = MeshBand | MeshMarker | MeshLabel;

const PLACEMENT_CATEGORIES = new Set([
  'contour',
  'concealer',
  'highlighter',
  'blush',
  'bronzer',
]);

export const isPlacementCategory = (productType: string | undefined): boolean => {
  if (!productType) return false;
  return PLACEMENT_CATEGORIES.has(productType.toLowerCase().trim());
};

// Mouth-corner / cupid's-bow indices, already used by outer_lip_indices in
// src/api/face_mesh.py — reused here as diagonal-contour anchor points.
const LEFT_MOUTH_CORNER_INDEX = 61;
const RIGHT_MOUTH_CORNER_INDEX = 291;
const CUPIDS_BOW_INDEX = 0;
const CHIN_TIP_INDEX = 152;
const FOREHEAD_CENTER_INDEX = 10;

function toScreenPoints(points: Landmark[], scalingParams: ScalingParams) {
  const { viewWidth, scaleX, scaleY, offsetX, offsetY, mirrorX } = scalingParams;
  return points.map((p) => scalePoint(p, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth));
}

function midpoint(points: { x: number; y: number }[]): { x: number; y: number } {
  const mid = points[Math.floor(points.length / 2)];
  return mid ?? { x: 0, y: 0 };
}

function band(
  key: string,
  region: string,
  rawPoints: Landmark[],
  scalingParams: ScalingParams,
  color: string,
  opacity: number,
  strokeWidth: number
): MeshBand | null {
  if (rawPoints.length < 2) return null;
  return {
    key,
    type: 'band',
    region,
    points: toScreenPoints(rawPoints, scalingParams),
    color,
    opacity,
    strokeWidth,
  };
}

function marker(
  key: string,
  region: string,
  rawPoint: Landmark | undefined,
  scalingParams: ScalingParams,
  color: string,
  opacity: number,
  radius: number
): MeshMarker | null {
  if (!rawPoint) return null;
  const [scaled] = toScreenPoints([rawPoint], scalingParams);
  return { key, type: 'marker', region, x: scaled.x, y: scaled.y, color, opacity, radius };
}

function labelNear(key: string, anchor: { x: number; y: number }, text: string, color: string): MeshLabel {
  return { key, type: 'label', x: anchor.x, y: anchor.y - 10, text, color };
}

const CONTOUR_COLOR = '#8A5A44';
const CONCEALER_COLOR = '#F5D9B8';
const HIGHLIGHTER_COLOR = '#F5E6A3';
const BLUSH_COLOR = '#E8748A';
const BRONZER_COLOR = '#B87840';

/**
 * Contour placement varies the most by face shape — the whole point of
 * contouring is correcting/complementing the shape's own proportions.
 */
function renderContourZones(
  landmarks: Landmark[],
  faceShape: FaceShape,
  scalingParams: ScalingParams
): TutorialShape[] {
  const shapes: TutorialShape[] = [];
  const regions = getNewFacialRegions(landmarks);
  const leftCheek = landmarks[LEFT_CHEEKBONE_INDEX];
  const rightCheek = landmarks[RIGHT_CHEEKBONE_INDEX];
  const leftMouthCorner = landmarks[LEFT_MOUTH_CORNER_INDEX];
  const rightMouthCorner = landmarks[RIGHT_MOUTH_CORNER_INDEX];

  const leftHollow = leftCheek && leftMouthCorner ? [leftCheek, leftMouthCorner] : [];
  const rightHollow = rightCheek && rightMouthCorner ? [rightCheek, rightMouthCorner] : [];

  const pushHollowCheekBands = () => {
    const l = band('contour-left-hollow', 'left-cheek-hollow', leftHollow, scalingParams, CONTOUR_COLOR, 0.55, 10);
    const r = band('contour-right-hollow', 'right-cheek-hollow', rightHollow, scalingParams, CONTOUR_COLOR, 0.55, 10);
    if (l) shapes.push(l);
    if (r) shapes.push(r);
    return l ?? r;
  };

  const pushJawlineBand = (opacity: number) => {
    const j = band('contour-jawline', 'jawline', regions.jawline, scalingParams, CONTOUR_COLOR, opacity, 8);
    if (j) shapes.push(j);
    return j;
  };

  const pushForeheadBand = (opacity: number) => {
    const f = band('contour-forehead', 'forehead', regions.forehead, scalingParams, CONTOUR_COLOR, opacity, 8);
    if (f) shapes.push(f);
    return f;
  };

  let labelAnchor: { x: number; y: number } | null = null;
  let labelText = 'Contour';

  switch (faceShape) {
    case 'round': {
      const j = pushJawlineBand(0.5);
      pushHollowCheekBands();
      labelAnchor = j ? midpoint(j.points) : null;
      labelText = 'Contour jaw + cheek hollows to add definition';
      break;
    }
    case 'square': {
      const l = pushHollowCheekBands();
      labelAnchor = l ? midpoint(l.points) : null;
      labelText = 'Soften jaw corners — light diagonal strokes only';
      break;
    }
    case 'heart': {
      const f = pushForeheadBand(0.5);
      labelAnchor = f ? midpoint(f.points) : null;
      labelText = 'Contour temples/forehead sides to narrow';
      break;
    }
    case 'long': {
      const f = pushForeheadBand(0.4);
      pushJawlineBand(0.35);
      labelAnchor = f ? midpoint(f.points) : null;
      labelText = 'Contour hairline + jaw to shorten — skip vertical lines';
      break;
    }
    case 'oval':
    default: {
      const l = pushHollowCheekBands();
      labelAnchor = l ? midpoint(l.points) : null;
      labelText = 'Light contour along the cheek hollows';
      break;
    }
  }

  if (labelAnchor) {
    shapes.push(labelNear('contour-label', labelAnchor, labelText, CONTOUR_COLOR));
  }

  return shapes;
}

function renderConcealerZones(
  facialRegions: FacialRegions | null,
  landmarks: Landmark[],
  scalingParams: ScalingParams
): TutorialShape[] {
  const shapes: TutorialShape[] = [];

  const underEyeConfigs: { key: keyof FacialRegions; shapeKey: string; region: string }[] = [
    { key: 'left_under_eye', shapeKey: 'concealer-left-under-eye', region: 'left-under-eye' },
    { key: 'right_under_eye', shapeKey: 'concealer-right-under-eye', region: 'right-under-eye' },
  ];

  let labelAnchor: { x: number; y: number } | null = null;

  for (const { key, shapeKey, region } of underEyeConfigs) {
    const points = facialRegions?.[key];
    const b = points ? band(shapeKey, region, points, scalingParams, CONCEALER_COLOR, 0.6, 10) : null;
    if (b) {
      shapes.push(b);
      labelAnchor = labelAnchor ?? midpoint(b.points);
    }
  }

  const centerPoints = [landmarks[FOREHEAD_CENTER_INDEX], landmarks[CHIN_TIP_INDEX]];
  centerPoints.forEach((p, i) => {
    const m = marker(`concealer-center-${i}`, 'center-face', p, scalingParams, CONCEALER_COLOR, 0.5, 8);
    if (m) shapes.push(m);
  });

  if (labelAnchor) {
    shapes.push(labelNear('concealer-label', labelAnchor, 'Concealer: brighten under-eyes + center face', CONCEALER_COLOR));
  }

  return shapes;
}

function renderHighlighterZones(
  landmarks: Landmark[],
  scalingParams: ScalingParams
): TutorialShape[] {
  const shapes: TutorialShape[] = [];
  const points: { key: string; region: string; landmark: Landmark | undefined }[] = [
    { key: 'highlighter-left-cheekbone', region: 'left-cheekbone', landmark: landmarks[LEFT_CHEEKBONE_INDEX] },
    { key: 'highlighter-right-cheekbone', region: 'right-cheekbone', landmark: landmarks[RIGHT_CHEEKBONE_INDEX] },
    { key: 'highlighter-cupids-bow', region: 'cupids-bow', landmark: landmarks[CUPIDS_BOW_INDEX] },
    { key: 'highlighter-chin', region: 'chin', landmark: landmarks[CHIN_TIP_INDEX] },
  ];

  let labelAnchor: { x: number; y: number } | null = null;

  for (const { key, region, landmark } of points) {
    const m = marker(key, region, landmark, scalingParams, HIGHLIGHTER_COLOR, 0.7, 9);
    if (m) {
      shapes.push(m);
      labelAnchor = labelAnchor ?? { x: m.x, y: m.y };
    }
  }

  if (labelAnchor) {
    shapes.push(labelNear('highlighter-label', labelAnchor, 'Highlight: cheekbones, cupid\'s bow, chin', HIGHLIGHTER_COLOR));
  }

  return shapes;
}

function renderBlushZones(
  landmarks: Landmark[],
  scalingParams: ScalingParams
): TutorialShape[] {
  const shapes: TutorialShape[] = [];
  const left = marker('blush-left-cheek', 'left-cheek', landmarks[LEFT_CHEEKBONE_INDEX], scalingParams, BLUSH_COLOR, 0.5, 16);
  const right = marker('blush-right-cheek', 'right-cheek', landmarks[RIGHT_CHEEKBONE_INDEX], scalingParams, BLUSH_COLOR, 0.5, 16);
  if (left) shapes.push(left);
  if (right) shapes.push(right);

  const anchor = left ?? right;
  if (anchor) {
    shapes.push(labelNear('blush-label', { x: anchor.x, y: anchor.y }, 'Blush: apples of the cheeks', BLUSH_COLOR));
  }

  return shapes;
}

function renderBronzerZones(
  landmarks: Landmark[],
  scalingParams: ScalingParams
): TutorialShape[] {
  const shapes: TutorialShape[] = [];
  const regions = getNewFacialRegions(landmarks);

  const jaw = band('bronzer-jawline', 'jawline', regions.jawline, scalingParams, BRONZER_COLOR, 0.3, 12);
  const forehead = band('bronzer-forehead', 'forehead', regions.forehead, scalingParams, BRONZER_COLOR, 0.3, 12);
  if (jaw) shapes.push(jaw);
  if (forehead) shapes.push(forehead);

  const leftCheek = marker('bronzer-left-cheek', 'left-cheek', landmarks[LEFT_CHEEKBONE_INDEX], scalingParams, BRONZER_COLOR, 0.35, 14);
  const rightCheek = marker('bronzer-right-cheek', 'right-cheek', landmarks[RIGHT_CHEEKBONE_INDEX], scalingParams, BRONZER_COLOR, 0.35, 14);
  if (leftCheek) shapes.push(leftCheek);
  if (rightCheek) shapes.push(rightCheek);

  const anchor = jaw ? midpoint(jaw.points) : forehead ? midpoint(forehead.points) : null;
  if (anchor) {
    shapes.push(labelNear('bronzer-label', anchor, 'Bronzer: warm the perimeter — forehead, cheeks, jaw', BRONZER_COLOR));
  }

  return shapes;
}

/**
 * Renders a tutorial (placement) overlay for one of the 5 technique-driven
 * categories. Mirrors renderClassBasedMesh's dispatch shape in
 * meshOverlays.ts, but returns bands/markers/labels instead of color fills.
 *
 * `faceShape` is classified once per session by the caller (camera.tsx
 * samples for a few seconds after the first detection, then locks it in)
 * rather than being re-derived here on every call -- this function returns
 * nothing until a shape has been learned.
 */
export const renderTutorialZones = (
  productType: string | undefined,
  faceMeshData: FaceMeshResult,
  scalingParams: ScalingParams,
  faceShape: FaceShape | null
): TutorialShape[] => {
  const { landmarks } = scalingParams;
  if (!landmarks || landmarks.length === 0 || !isPlacementCategory(productType) || !faceShape) {
    return [];
  }

  const normalized = productType!.toLowerCase().trim();

  switch (normalized) {
    case 'contour':
      return renderContourZones(landmarks, faceShape, scalingParams);
    case 'concealer':
      return renderConcealerZones(faceMeshData.facial_regions ?? null, landmarks, scalingParams);
    case 'highlighter':
      return renderHighlighterZones(landmarks, scalingParams);
    case 'blush':
      return renderBlushZones(landmarks, scalingParams);
    case 'bronzer':
      return renderBronzerZones(landmarks, scalingParams);
    default:
      return [];
  }
};
