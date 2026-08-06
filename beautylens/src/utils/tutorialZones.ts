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
 * Placement rules live in a single declarative table (PLACEMENT_RULES)
 * rather than one bespoke render function per category -- adding a shape or
 * a category means adding a data entry, not new render logic. Each zone
 * references points either from the existing backend-resolved
 * FacialRegions, the face_oval-derived NewFacialRegions (faceGeometry.ts),
 * or explicit single landmark indices -- never invented coordinates.
 *
 * Placement content is sourced from published face-shape-specific makeup
 * guides, cited per rule below; where no shape-specific source was found
 * for a category (concealer, and heart-shaped bronzer), the same
 * shape-agnostic technique is reused across shapes rather than fabricating
 * a difference the sources don't support. Some shapes reuse very similar
 * anchor points for a given category (e.g. blush for "round" and "long")
 * because the available landmarks don't have finer cheek granularity to
 * distinguish the described techniques further -- documented per rule.
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
  type NewFacialRegions,
  type FaceShape,
  LEFT_CHEEKBONE_INDEX,
  RIGHT_CHEEKBONE_INDEX,
  LEFT_TEMPLE_INDEX,
  RIGHT_TEMPLE_INDEX,
  LEFT_MOUTH_CORNER_INDEX,
  RIGHT_MOUTH_CORNER_INDEX,
  LEFT_JAW_CORNER_INDEX,
  RIGHT_JAW_CORNER_INDEX,
  CUPIDS_BOW_INDEX,
  FOREHEAD_CENTER_INDEX,
  CHIN_TIP_INDEX,
  NOSE_BRIDGE_INDEX,
} from './faceGeometry';

export type TutorialShape = MeshBand | MeshMarker | MeshLabel;
export type PlacementCategory = 'contour' | 'concealer' | 'highlighter' | 'blush' | 'bronzer';

const PLACEMENT_CATEGORIES = new Set<PlacementCategory>([
  'contour',
  'concealer',
  'highlighter',
  'blush',
  'bronzer',
]);

export const isPlacementCategory = (productType: string | undefined): boolean => {
  if (!productType) return false;
  return PLACEMENT_CATEGORIES.has(productType.toLowerCase().trim() as PlacementCategory);
};

const CATEGORY_COLOR: Record<PlacementCategory, string> = {
  contour: '#8A5A44',
  concealer: '#F5D9B8',
  highlighter: '#F5E6A3',
  blush: '#E8748A',
  bronzer: '#B87840',
};

// --- Point resolution -------------------------------------------------

/** Where a zone's points come from. `sequence` concatenates sub-sources
 * in order, so a band can be composed from several already-trusted
 * anchors (e.g. "under-eye, swept out toward the temple"). */
type PointSource =
  | { region: keyof FacialRegions }
  | { newRegion: keyof NewFacialRegions }
  | { indices: number[] }
  | { sequence: PointSource[] };

function resolvePoints(
  source: PointSource,
  facialRegions: FacialRegions | null,
  newRegions: NewFacialRegions,
  landmarks: Landmark[]
): Landmark[] {
  if ('sequence' in source) {
    return source.sequence.flatMap((s) => resolvePoints(s, facialRegions, newRegions, landmarks));
  }
  if ('region' in source) return facialRegions?.[source.region] ?? [];
  if ('newRegion' in source) return newRegions[source.newRegion] ?? [];
  return source.indices.filter((i) => i >= 0 && i < landmarks.length).map((i) => landmarks[i]);
}

// --- Rule schema --------------------------------------------------------

interface ZoneRule {
  key: string;
  kind: 'band' | 'marker';
  source: PointSource;
  opacity: number;
  strokeWidth?: number; // band only
  radius?: number; // marker only
}

interface ShapeCategoryRule {
  zones: ZoneRule[];
  label: string;
}

type PlacementRules = Record<PlacementCategory, Record<FaceShape, ShapeCategoryRule>>;

// --- Placement rules table ----------------------------------------------
//
// Sources (fetched and summarized when this table was written):
//  - Contour: charlottetilbury.com/us/secrets/how-to-contour-every-face-shape,
//    beautyblender.com/blogs/beauty-101/how-to-contour-for-your-face-shape
//  - Blush: nyxcosmetics.com/blog/where-how-to-apply-blush-for-your-face-shape.html,
//    charlottetilbury.com/us/secrets/how-to-apply-blush-to-suit-your-face-shape
//  - Highlighter/bronzer: gloskinbeauty.com/blog/how-to-contour-highlight-for-every-face-shape,
//    global.kryolan.com/blog/posts/where-place-highlighter-blush-and-bronzer,
//    100percentpure.com/blogs/feed/how-to-contour-an-oblong-face
//  - Concealer: refinery29.com/en-gb/tiktok-triangle-geometric-concealer-hack
//    (the "concealer geometry" triangle technique) -- described as a
//    universal technique, not shape-conditional, so it's the same for every
//    FaceShape key below rather than 5 fabricated variants.
export const PLACEMENT_RULES: PlacementRules = {
  contour: {
    oval: {
      zones: [
        { key: 'contour-left-hollow', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [{ indices: [LEFT_CHEEKBONE_INDEX] }, { indices: [LEFT_MOUTH_CORNER_INDEX] }] } },
        { key: 'contour-right-hollow', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [{ indices: [RIGHT_CHEEKBONE_INDEX] }, { indices: [RIGHT_MOUTH_CORNER_INDEX] }] } },
      ],
      label: 'Light contour along the cheek hollows',
    },
    round: {
      zones: [
        { key: 'contour-jawline', kind: 'band', opacity: 0.5, strokeWidth: 8, source: { newRegion: 'jawline' } },
        { key: 'contour-left-hollow', kind: 'band', opacity: 0.55, strokeWidth: 10, source: { sequence: [{ indices: [LEFT_CHEEKBONE_INDEX] }, { indices: [LEFT_MOUTH_CORNER_INDEX] }] } },
        { key: 'contour-right-hollow', kind: 'band', opacity: 0.55, strokeWidth: 10, source: { sequence: [{ indices: [RIGHT_CHEEKBONE_INDEX] }, { indices: [RIGHT_MOUTH_CORNER_INDEX] }] } },
      ],
      label: 'Contour jaw + cheek hollows to add definition',
    },
    square: {
      zones: [
        { key: 'contour-left-hollow', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [{ indices: [LEFT_CHEEKBONE_INDEX] }, { indices: [LEFT_MOUTH_CORNER_INDEX] }] } },
        { key: 'contour-right-hollow', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [{ indices: [RIGHT_CHEEKBONE_INDEX] }, { indices: [RIGHT_MOUTH_CORNER_INDEX] }] } },
        { key: 'contour-left-temple', kind: 'band', opacity: 0.3, strokeWidth: 6, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, { indices: [LEFT_JAW_CORNER_INDEX] }] } },
        { key: 'contour-right-temple', kind: 'band', opacity: 0.3, strokeWidth: 6, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, { indices: [RIGHT_JAW_CORNER_INDEX] }] } },
      ],
      label: 'Soften jaw corners + temples — light diagonal strokes only',
    },
    heart: {
      zones: [
        { key: 'contour-forehead', kind: 'band', opacity: 0.5, strokeWidth: 8, source: { newRegion: 'forehead' } },
      ],
      label: 'Contour temples/forehead sides to narrow',
    },
    long: {
      zones: [
        { key: 'contour-forehead', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { newRegion: 'forehead' } },
        { key: 'contour-jawline', kind: 'band', opacity: 0.35, strokeWidth: 8, source: { newRegion: 'jawline' } },
        { key: 'contour-chin', kind: 'band', opacity: 0.35, strokeWidth: 6, source: { newRegion: 'chin' } },
      ],
      label: 'Contour hairline + jaw + chin to shorten — skip vertical lines',
    },
  },

  // Same universal "triangle geometry" technique for every shape -- no
  // shape-specific concealer source was found, so this isn't varied per
  // FaceShape the way contour/blush/bronzer/highlighter are.
  concealer: (() => {
    const rule: ShapeCategoryRule = {
      zones: [
        { key: 'concealer-left-under-eye', kind: 'band', opacity: 0.6, strokeWidth: 10, source: { region: 'left_under_eye' } },
        { key: 'concealer-right-under-eye', kind: 'band', opacity: 0.6, strokeWidth: 10, source: { region: 'right_under_eye' } },
        { key: 'concealer-forehead', kind: 'marker', opacity: 0.5, radius: 8, source: { indices: [FOREHEAD_CENTER_INDEX] } },
        { key: 'concealer-chin', kind: 'marker', opacity: 0.5, radius: 8, source: { indices: [CHIN_TIP_INDEX] } },
        { key: 'concealer-nose-bridge', kind: 'marker', opacity: 0.5, radius: 6, source: { indices: [NOSE_BRIDGE_INDEX] } },
        { key: 'concealer-left-smile-line', kind: 'marker', opacity: 0.4, radius: 6, source: { indices: [LEFT_MOUTH_CORNER_INDEX] } },
        { key: 'concealer-right-smile-line', kind: 'marker', opacity: 0.4, radius: 6, source: { indices: [RIGHT_MOUTH_CORNER_INDEX] } },
      ],
      label: 'Concealer: under-eyes, nose bridge, chin, smile lines',
    };
    return { oval: rule, round: rule, square: rule, heart: rule, long: rule };
  })(),

  highlighter: {
    oval: {
      zones: [
        { key: 'highlighter-left-cheekbone', kind: 'marker', opacity: 0.7, radius: 9, source: { indices: [LEFT_CHEEKBONE_INDEX] } },
        { key: 'highlighter-right-cheekbone', kind: 'marker', opacity: 0.7, radius: 9, source: { indices: [RIGHT_CHEEKBONE_INDEX] } },
        { key: 'highlighter-nose-bridge', kind: 'marker', opacity: 0.6, radius: 6, source: { indices: [NOSE_BRIDGE_INDEX] } },
        { key: 'highlighter-cupids-bow', kind: 'marker', opacity: 0.6, radius: 6, source: { indices: [CUPIDS_BOW_INDEX] } },
        { key: 'highlighter-chin', kind: 'marker', opacity: 0.6, radius: 8, source: { indices: [CHIN_TIP_INDEX] } },
        { key: 'highlighter-left-under-eye', kind: 'band', opacity: 0.3, strokeWidth: 6, source: { region: 'left_under_eye' } },
        { key: 'highlighter-right-under-eye', kind: 'band', opacity: 0.3, strokeWidth: 6, source: { region: 'right_under_eye' } },
      ],
      label: "Highlight: cheekbones, nose bridge, cupid's bow, chin, under-eyes",
    },
    round: {
      zones: [
        { key: 'highlighter-left-cheek-lift', kind: 'band', opacity: 0.5, strokeWidth: 8, source: { sequence: [{ indices: [LEFT_CHEEKBONE_INDEX] }, { indices: [LEFT_TEMPLE_INDEX] }] } },
        { key: 'highlighter-right-cheek-lift', kind: 'band', opacity: 0.5, strokeWidth: 8, source: { sequence: [{ indices: [RIGHT_CHEEKBONE_INDEX] }, { indices: [RIGHT_TEMPLE_INDEX] }] } },
        { key: 'highlighter-cupids-bow', kind: 'marker', opacity: 0.6, radius: 6, source: { indices: [CUPIDS_BOW_INDEX] } },
        { key: 'highlighter-chin', kind: 'marker', opacity: 0.6, radius: 8, source: { indices: [CHIN_TIP_INDEX] } },
      ],
      label: 'Highlight cheekbones, blending up toward temples to lift',
    },
    square: {
      zones: [
        { key: 'highlighter-left-cheekbone', kind: 'marker', opacity: 0.7, radius: 9, source: { indices: [LEFT_CHEEKBONE_INDEX] } },
        { key: 'highlighter-right-cheekbone', kind: 'marker', opacity: 0.7, radius: 9, source: { indices: [RIGHT_CHEEKBONE_INDEX] } },
        { key: 'highlighter-nose-bridge', kind: 'marker', opacity: 0.6, radius: 6, source: { indices: [NOSE_BRIDGE_INDEX] } },
        { key: 'highlighter-chin', kind: 'marker', opacity: 0.5, radius: 7, source: { indices: [CHIN_TIP_INDEX] } },
      ],
      label: 'Highlight cheekbones + nose bridge + chin for radiance',
    },
    heart: {
      zones: [
        { key: 'highlighter-left-cheekbone', kind: 'marker', opacity: 0.65, radius: 8, source: { indices: [LEFT_CHEEKBONE_INDEX] } },
        { key: 'highlighter-right-cheekbone', kind: 'marker', opacity: 0.65, radius: 8, source: { indices: [RIGHT_CHEEKBONE_INDEX] } },
        { key: 'highlighter-chin', kind: 'marker', opacity: 0.7, radius: 11, source: { indices: [CHIN_TIP_INDEX] } },
        { key: 'highlighter-cupids-bow', kind: 'marker', opacity: 0.6, radius: 6, source: { indices: [CUPIDS_BOW_INDEX] } },
      ],
      label: 'Highlight the chin to add balance, plus the cheekbones',
    },
    long: {
      zones: [
        { key: 'highlighter-left-cheekbone', kind: 'marker', opacity: 0.65, radius: 9, source: { indices: [LEFT_CHEEKBONE_INDEX] } },
        { key: 'highlighter-right-cheekbone', kind: 'marker', opacity: 0.65, radius: 9, source: { indices: [RIGHT_CHEEKBONE_INDEX] } },
        { key: 'highlighter-chin', kind: 'marker', opacity: 0.65, radius: 11, source: { indices: [CHIN_TIP_INDEX] } },
        { key: 'highlighter-left-under-eye-wide', kind: 'band', opacity: 0.35, strokeWidth: 8, source: { sequence: [{ region: 'left_under_eye' }, { indices: [LEFT_TEMPLE_INDEX] }] } },
        { key: 'highlighter-right-under-eye-wide', kind: 'band', opacity: 0.35, strokeWidth: 8, source: { sequence: [{ region: 'right_under_eye' }, { indices: [RIGHT_TEMPLE_INDEX] }] } },
      ],
      label: 'Highlight chin + cheekbones; sweep under-eyes toward temples to widen',
    },
  },

  blush: {
    // Round and long reuse a very similar temple<->cheekbone band -- the
    // sourced techniques ("straight line toward center" vs "short straight
    // line, don't blend too far") are genuinely close, and the available
    // landmarks don't give finer cheek granularity to separate them further.
    oval: {
      zones: [
        { key: 'blush-left-cheek', kind: 'marker', opacity: 0.5, radius: 14, source: { indices: [LEFT_CHEEKBONE_INDEX] } },
        { key: 'blush-right-cheek', kind: 'marker', opacity: 0.5, radius: 14, source: { indices: [RIGHT_CHEEKBONE_INDEX] } },
      ],
      label: 'Blush: highest point of the cheekbones, diffused outward',
    },
    round: {
      zones: [
        { key: 'blush-left-line', kind: 'band', opacity: 0.5, strokeWidth: 10, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, { indices: [LEFT_CHEEKBONE_INDEX] }] } },
        { key: 'blush-right-line', kind: 'band', opacity: 0.5, strokeWidth: 10, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, { indices: [RIGHT_CHEEKBONE_INDEX] }] } },
      ],
      label: 'Blush: straight line from ear toward center, along the cheekbone — skip the apples',
    },
    square: {
      zones: [
        { key: 'blush-left-cheek', kind: 'marker', opacity: 0.45, radius: 18, source: { indices: [LEFT_CHEEKBONE_INDEX] } },
        { key: 'blush-right-cheek', kind: 'marker', opacity: 0.45, radius: 18, source: { indices: [RIGHT_CHEEKBONE_INDEX] } },
      ],
      label: 'Blush: soft, rounded on the apples — avoid sharp diagonal lines',
    },
    heart: {
      zones: [
        { key: 'blush-left-up', kind: 'band', opacity: 0.5, strokeWidth: 9, source: { sequence: [{ indices: [LEFT_CHEEKBONE_INDEX] }, { indices: [LEFT_TEMPLE_INDEX] }] } },
        { key: 'blush-right-up', kind: 'band', opacity: 0.5, strokeWidth: 9, source: { sequence: [{ indices: [RIGHT_CHEEKBONE_INDEX] }, { indices: [RIGHT_TEMPLE_INDEX] }] } },
      ],
      label: 'Blush: tops of the cheekbones, blended up toward the brow tail',
    },
    long: {
      zones: [
        { key: 'blush-left-line', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, { indices: [LEFT_CHEEKBONE_INDEX] }] } },
        { key: 'blush-right-line', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, { indices: [RIGHT_CHEEKBONE_INDEX] }] } },
      ],
      label: "Blush: short straight line on the apples — don't blend too far out",
    },
  },

  bronzer: {
    oval: {
      zones: [
        { key: 'bronzer-left-sweep', kind: 'band', opacity: 0.28, strokeWidth: 10, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, { indices: [LEFT_CHEEKBONE_INDEX] }, { indices: [LEFT_JAW_CORNER_INDEX] }] } },
        { key: 'bronzer-right-sweep', kind: 'band', opacity: 0.28, strokeWidth: 10, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, { indices: [RIGHT_CHEEKBONE_INDEX] }, { indices: [RIGHT_JAW_CORNER_INDEX] }] } },
      ],
      label: 'Bronzer: light sweep from temple, under the cheekbone, to the jaw',
    },
    round: {
      zones: [
        { key: 'bronzer-left-lift', kind: 'band', opacity: 0.3, strokeWidth: 10, source: { sequence: [{ indices: [LEFT_CHEEKBONE_INDEX] }, { indices: [LEFT_TEMPLE_INDEX] }] } },
        { key: 'bronzer-right-lift', kind: 'band', opacity: 0.3, strokeWidth: 10, source: { sequence: [{ indices: [RIGHT_CHEEKBONE_INDEX] }, { indices: [RIGHT_TEMPLE_INDEX] }] } },
      ],
      label: 'Bronzer: cheekbones blending up toward the temples to lift',
    },
    square: {
      zones: [
        { key: 'bronzer-left-temple-hairline', kind: 'band', opacity: 0.3, strokeWidth: 10, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, { newRegion: 'forehead' }] } },
        { key: 'bronzer-right-temple-hairline', kind: 'band', opacity: 0.3, strokeWidth: 10, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, { newRegion: 'forehead' }] } },
        { key: 'bronzer-jawline', kind: 'band', opacity: 0.25, strokeWidth: 8, source: { newRegion: 'jawline' } },
        { key: 'bronzer-chin', kind: 'band', opacity: 0.25, strokeWidth: 6, source: { newRegion: 'chin' } },
      ],
      label: 'Bronzer: temples toward the hairline, plus light jaw + chin contour',
    },
    // No heart-specific bronzer source was found; reuses the general
    // 3-point sweep (temple / cheek hollow / jaw) rather than inventing one.
    heart: {
      zones: [
        { key: 'bronzer-left-sweep', kind: 'band', opacity: 0.28, strokeWidth: 10, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, { indices: [LEFT_CHEEKBONE_INDEX] }, { indices: [LEFT_JAW_CORNER_INDEX] }] } },
        { key: 'bronzer-right-sweep', kind: 'band', opacity: 0.28, strokeWidth: 10, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, { indices: [RIGHT_CHEEKBONE_INDEX] }, { indices: [RIGHT_JAW_CORNER_INDEX] }] } },
      ],
      label: 'Bronzer: general sweep — temple, cheek hollow, jaw',
    },
    long: {
      zones: [
        { key: 'bronzer-forehead', kind: 'band', opacity: 0.3, strokeWidth: 10, source: { newRegion: 'forehead' } },
        { key: 'bronzer-left-hollow', kind: 'band', opacity: 0.3, strokeWidth: 8, source: { sequence: [{ indices: [LEFT_CHEEKBONE_INDEX] }, { indices: [LEFT_MOUTH_CORNER_INDEX] }] } },
        { key: 'bronzer-right-hollow', kind: 'band', opacity: 0.3, strokeWidth: 8, source: { sequence: [{ indices: [RIGHT_CHEEKBONE_INDEX] }, { indices: [RIGHT_MOUTH_CORNER_INDEX] }] } },
        { key: 'bronzer-jawline', kind: 'band', opacity: 0.3, strokeWidth: 8, source: { newRegion: 'jawline' } },
        { key: 'bronzer-chin', kind: 'band', opacity: 0.3, strokeWidth: 6, source: { newRegion: 'chin' } },
      ],
      label: 'Bronzer: hairline + cheek hollows + jaw + chin to shorten the face',
    },
  },
};

// --- Rendering ------------------------------------------------------------

function toScreenPoints(points: Landmark[], scalingParams: ScalingParams) {
  const { viewWidth, scaleX, scaleY, offsetX, offsetY, mirrorX } = scalingParams;
  return points.map((p) => scalePoint(p, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth));
}

function midpoint(points: { x: number; y: number }[]): { x: number; y: number } {
  return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
}

function labelNear(key: string, anchor: { x: number; y: number }, text: string, color: string): MeshLabel {
  return { key, type: 'label', x: anchor.x, y: anchor.y - 10, text, color };
}

/** Builds the rendered shapes for one category+faceShape rule. */
function buildZonesFromRules(
  rule: ShapeCategoryRule,
  color: string,
  facialRegions: FacialRegions | null,
  newRegions: NewFacialRegions,
  landmarks: Landmark[],
  scalingParams: ScalingParams
): TutorialShape[] {
  const shapes: TutorialShape[] = [];
  let labelAnchor: { x: number; y: number } | null = null;

  for (const zone of rule.zones) {
    const rawPoints = resolvePoints(zone.source, facialRegions, newRegions, landmarks);
    if (zone.kind === 'band') {
      if (rawPoints.length < 2) continue;
      const screenPoints = toScreenPoints(rawPoints, scalingParams);
      shapes.push({
        key: zone.key,
        type: 'band',
        region: zone.key,
        points: screenPoints,
        color,
        opacity: zone.opacity,
        strokeWidth: zone.strokeWidth ?? 8,
      });
      labelAnchor = labelAnchor ?? midpoint(screenPoints);
    } else {
      rawPoints.forEach((point, i) => {
        const [scaled] = toScreenPoints([point], scalingParams);
        shapes.push({
          key: `${zone.key}-${i}`,
          type: 'marker',
          region: zone.key,
          x: scaled.x,
          y: scaled.y,
          color,
          opacity: zone.opacity,
          radius: zone.radius ?? 8,
        });
        labelAnchor = labelAnchor ?? scaled;
      });
    }
  }

  if (labelAnchor) {
    shapes.push(labelNear(`${rule.zones[0]?.key ?? 'zone'}-label`, labelAnchor, rule.label, color));
  }

  return shapes;
}

/**
 * Renders a tutorial (placement) overlay for one of the 5 technique-driven
 * categories. Mirrors renderClassBasedMesh's dispatch shape in
 * meshOverlays.ts, but looks up a data-table rule and returns
 * bands/markers/labels instead of color fills.
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

  const category = productType!.toLowerCase().trim() as PlacementCategory;
  const rule = PLACEMENT_RULES[category]?.[faceShape];
  if (!rule) return [];

  const newRegions = getNewFacialRegions(landmarks);
  return buildZonesFromRules(rule, CATEGORY_COLOR[category], faceMeshData.facial_regions ?? null, newRegions, landmarks, scalingParams);
};
