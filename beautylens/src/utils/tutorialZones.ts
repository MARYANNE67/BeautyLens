/**
 * Tutorial-zone overlays for placement-driven product categories.
 *
 * Unlike the color-preview renderers in meshOverlays.ts (which paint the
 * actual product color over lips/eyes), these categories are about
 * technique, not color: contour, concealer, highlighter, blush, bronzer.
 * For these, the camera screen shows WHERE to place the product for the
 * user's specific face shape, as a traced line/band on the face -- no text
 * is drawn on the overlay itself -- rather than a filled color wash.
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
  LEFT_CHEEK_INDEX,
  RIGHT_CHEEK_INDEX,
  LEFT_CHEEK_HOLLOW_INDEX,
  RIGHT_CHEEK_HOLLOW_INDEX,
  LEFT_TEMPLE_INDEX,
  RIGHT_TEMPLE_INDEX,
  LEFT_MOUTH_CORNER_INDEX,
  RIGHT_MOUTH_CORNER_INDEX,
  LEFT_JAW_CORNER_INDEX,
  RIGHT_JAW_CORNER_INDEX,
  CUPIDS_BOW_INDEX,
  FOREHEAD_CENTER_INDEX,
  CHIN_BUTTON_INDEX,
  NOSE_BRIDGE_INDEX,
} from './faceGeometry';

// A "push toward the hairline" extrapolation (from the glabella) was tried
// and reverted: it moves points radially away from a center reference,
// which for the temple-side points (already well off-center) pushes them
// sideways as much as upward -- confirmed visually to land outside the face
// entirely. The real fix is the hairline detection below (backed by
// src/api/hair_segmentation.py's actual hair/skin boundary measurement,
// not a landmark approximation) -- forehead-touching zones prefer that
// when available and fall back to the landmark approximation otherwise.

/** left/center/right x-sample keys for the real (segmentation-measured)
 * hairline -- see camera.tsx, which fetches this once per session at the
 * x-positions of LEFT_TEMPLE_INDEX/FOREHEAD_CENTER_INDEX/RIGHT_TEMPLE_INDEX. */
export type HairlineKey = 'left' | 'center' | 'right';
export type HairlinePoints = Record<HairlineKey, Pick<Landmark, 'x' | 'y'> | null>;

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

// Exported so UI affordances (the camera screen's category buttons) can
// match the color each category's overlay actually draws in.
export const CATEGORY_COLOR: Record<PlacementCategory, string> = {
  contour: '#8A5A44',
  concealer: '#F5D9B8',
  highlighter: '#F5E6A3',
  blush: '#E8748A',
  bronzer: '#B87840',
};

// --- Point resolution -------------------------------------------------

/** Where a zone's points come from. `sequence` concatenates sub-sources
 * in order, so a band can be composed from several already-trusted
 * anchors (e.g. "under-eye, swept out toward the temple"). `interpolate`
 * produces a synthetic point a fraction `t` of the way from landmark `a`
 * to landmark `b` -- e.g. stopping short of a landmark rather than running
 * a band all the way to it. `hairlineOr` uses the real (segmentation-
 * measured) hairline point(s) when all requested keys are non-null,
 * falling back to `fallback` (a landmark approximation) otherwise -- an
 * all-or-nothing choice per zone, not point-by-point substitution. */
type PointSource =
  | { region: keyof FacialRegions }
  | { newRegion: keyof NewFacialRegions }
  | { indices: number[] }
  | { sequence: PointSource[] }
  | { interpolate: { a: number; b: number; t: number } }
  | { hairlineOr: { keys: HairlineKey[]; fallback: PointSource } }
  // Every point of `region` slid fraction `t` toward landmark `toward` --
  // shifts a whole band face-proportionally while staying between
  // already-trusted points, the same safety argument as `interpolate`.
  // Added for the under-eye concealer bands: the under-eye region
  // landmarks hug the lower lash line, so a soft wide band anchored there
  // bleeds up over the eye (reported live); sliding toward the same-side
  // mouth corner drops it into the under-eye hollow.
  | { regionToward: { region: keyof FacialRegions; toward: number; t: number } };

function resolvePoints(
  source: PointSource,
  facialRegions: FacialRegions | null,
  newRegions: NewFacialRegions,
  landmarks: Landmark[],
  hairline: HairlinePoints | null
): Landmark[] {
  if ('sequence' in source) {
    return source.sequence.flatMap((s) => resolvePoints(s, facialRegions, newRegions, landmarks, hairline));
  }
  if ('region' in source) return facialRegions?.[source.region] ?? [];
  if ('newRegion' in source) return newRegions[source.newRegion] ?? [];
  if ('hairlineOr' in source) {
    const { keys, fallback } = source.hairlineOr;
    if (hairline && keys.every((k) => hairline[k] !== null)) {
      return keys.map((k) => ({ ...hairline[k]!, z: 0 }));
    }
    return resolvePoints(fallback, facialRegions, newRegions, landmarks, hairline);
  }
  if ('interpolate' in source) {
    const { a, b, t } = source.interpolate;
    const pointA = landmarks[a];
    const pointB = landmarks[b];
    if (!pointA || !pointB) return [];
    return [{
      x: pointA.x + t * (pointB.x - pointA.x),
      y: pointA.y + t * (pointB.y - pointA.y),
      z: pointA.z + t * (pointB.z - pointA.z),
    }];
  }
  if ('regionToward' in source) {
    const { region, toward, t } = source.regionToward;
    const target = landmarks[toward];
    if (!target) return [];
    return (facialRegions?.[region] ?? [])
      .map((p) => ({
        x: p.x + t * (target.x - p.x),
        y: p.y + t * (target.y - p.y),
        z: p.z + t * (target.z - p.z),
      }));
  }
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

// Cheek anchors. An earlier version anchored these to LEFT_CHEEKBONE_INDEX/
// RIGHT_CHEEKBONE_INDEX (234/454) -- the standard face-*width* landmarks --
// which sit on the silhouette edge at eye-corner height, so every cheek
// marker rendered "near the eye" (reported live, then confirmed by
// annotating 234/454 on a real portrait). A 30%-toward-mouth-corner
// interpolation hack partially compensated; replaced outright with the
// interior cheek-surface landmarks verified in faceGeometry.ts:
// 50/280 = apple / top of cheekbone (markers, upward blend bands),
// 205/425 = contour hollow under the cheekbone (hollow bands, sweeps).
const LEFT_CHEEK_MARKER: PointSource = { indices: [LEFT_CHEEK_INDEX] };
const RIGHT_CHEEK_MARKER: PointSource = { indices: [RIGHT_CHEEK_INDEX] };
const LEFT_HOLLOW: PointSource = { indices: [LEFT_CHEEK_HOLLOW_INDEX] };
const RIGHT_HOLLOW: PointSource = { indices: [RIGHT_CHEEK_HOLLOW_INDEX] };

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
        { key: 'contour-left-hollow', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [LEFT_HOLLOW, { interpolate: { a: LEFT_CHEEK_HOLLOW_INDEX, b: LEFT_MOUTH_CORNER_INDEX, t: 0.55 } }] } },
        { key: 'contour-right-hollow', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [RIGHT_HOLLOW, { interpolate: { a: RIGHT_CHEEK_HOLLOW_INDEX, b: RIGHT_MOUTH_CORNER_INDEX, t: 0.55 } }] } },
      ],
      label: 'Light contour along the cheek hollows',
    },
    round: {
      zones: [
        { key: 'contour-jawline', kind: 'band', opacity: 0.5, strokeWidth: 8, source: { newRegion: 'jawline' } },
        { key: 'contour-left-hollow', kind: 'band', opacity: 0.55, strokeWidth: 10, source: { sequence: [LEFT_HOLLOW, { interpolate: { a: LEFT_CHEEK_HOLLOW_INDEX, b: LEFT_MOUTH_CORNER_INDEX, t: 0.55 } }] } },
        { key: 'contour-right-hollow', kind: 'band', opacity: 0.55, strokeWidth: 10, source: { sequence: [RIGHT_HOLLOW, { interpolate: { a: RIGHT_CHEEK_HOLLOW_INDEX, b: RIGHT_MOUTH_CORNER_INDEX, t: 0.55 } }] } },
      ],
      label: 'Contour jaw + cheek hollows to add definition',
    },
    square: {
      zones: [
        { key: 'contour-left-hollow', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [LEFT_HOLLOW, { interpolate: { a: LEFT_CHEEK_HOLLOW_INDEX, b: LEFT_MOUTH_CORNER_INDEX, t: 0.55 } }] } },
        { key: 'contour-right-hollow', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [RIGHT_HOLLOW, { interpolate: { a: RIGHT_CHEEK_HOLLOW_INDEX, b: RIGHT_MOUTH_CORNER_INDEX, t: 0.55 } }] } },
        { key: 'contour-left-temple', kind: 'band', opacity: 0.3, strokeWidth: 6, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, { indices: [LEFT_JAW_CORNER_INDEX] }] } },
        { key: 'contour-right-temple', kind: 'band', opacity: 0.3, strokeWidth: 6, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, { indices: [RIGHT_JAW_CORNER_INDEX] }] } },
      ],
      label: 'Soften jaw corners + temples — light diagonal strokes only',
    },
    heart: {
      zones: [
        { key: 'contour-left-forehead-side', kind: 'band', opacity: 0.5, strokeWidth: 8, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, { hairlineOr: { keys: ['left'], fallback: { newRegion: 'left_forehead_side' } } }] } },
        { key: 'contour-right-forehead-side', kind: 'band', opacity: 0.5, strokeWidth: 8, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, { hairlineOr: { keys: ['right'], fallback: { newRegion: 'right_forehead_side' } } }] } },
      ],
      label: 'Contour temples/forehead sides to narrow',
    },
    long: {
      zones: [
        { key: 'contour-forehead', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { hairlineOr: { keys: ['left', 'center', 'right'], fallback: { newRegion: 'forehead' } } } },
        { key: 'contour-jawline', kind: 'band', opacity: 0.35, strokeWidth: 8, source: { newRegion: 'jawline' } },
        { key: 'contour-chin', kind: 'band', opacity: 0.35, strokeWidth: 6, source: { newRegion: 'chin' } },
      ],
      label: 'Contour hairline + jaw + chin to shorten — skip vertical lines',
    },
  },

  // Same universal "triangle geometry" technique for every shape -- no
  // shape-specific concealer source was found, so this isn't varied per
  // FaceShape the way contour/blush/bronzer/highlighter are.
  //
  // (History: these zones used to filter out right_under_eye's index 6 --
  // landmark 447 -- as a "spatial outlier". The real cause was that
  // face_mesh.py's right_under_eye_indices tail was off by one relative to
  // the left list's mirrors; fixed at the source there once the correct
  // mirror landmarks were verified against a reflected-left-side
  // comparison on a real portrait, so no client-side filtering remains.)
  concealer: (() => {
    const rule: ShapeCategoryRule = {
      zones: [
        { key: 'concealer-left-under-eye', kind: 'band', opacity: 0.6, strokeWidth: 10, source: { regionToward: { region: 'left_under_eye', toward: LEFT_MOUTH_CORNER_INDEX, t: 0.09 } } },
        { key: 'concealer-right-under-eye', kind: 'band', opacity: 0.6, strokeWidth: 10, source: { regionToward: { region: 'right_under_eye', toward: RIGHT_MOUTH_CORNER_INDEX, t: 0.09 } } },
        { key: 'concealer-forehead', kind: 'marker', opacity: 0.5, radius: 8, source: { indices: [FOREHEAD_CENTER_INDEX] } },
        { key: 'concealer-chin', kind: 'marker', opacity: 0.5, radius: 8, source: { indices: [CHIN_BUTTON_INDEX] } },
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
        { key: 'highlighter-left-cheekbone', kind: 'marker', opacity: 0.7, radius: 9, source: LEFT_CHEEK_MARKER },
        { key: 'highlighter-right-cheekbone', kind: 'marker', opacity: 0.7, radius: 9, source: RIGHT_CHEEK_MARKER },
        { key: 'highlighter-nose-bridge', kind: 'marker', opacity: 0.6, radius: 6, source: { indices: [NOSE_BRIDGE_INDEX] } },
        { key: 'highlighter-cupids-bow', kind: 'marker', opacity: 0.6, radius: 6, source: { indices: [CUPIDS_BOW_INDEX] } },
        { key: 'highlighter-chin', kind: 'marker', opacity: 0.6, radius: 8, source: { indices: [CHIN_BUTTON_INDEX] } },
        { key: 'highlighter-left-under-eye', kind: 'band', opacity: 0.3, strokeWidth: 6, source: { regionToward: { region: 'left_under_eye', toward: LEFT_MOUTH_CORNER_INDEX, t: 0.09 } } },
        { key: 'highlighter-right-under-eye', kind: 'band', opacity: 0.3, strokeWidth: 6, source: { regionToward: { region: 'right_under_eye', toward: RIGHT_MOUTH_CORNER_INDEX, t: 0.09 } } },
      ],
      label: "Highlight: cheekbones, nose bridge, cupid's bow, chin, under-eyes",
    },
    round: {
      zones: [
        { key: 'highlighter-left-cheek-lift', kind: 'band', opacity: 0.5, strokeWidth: 8, source: { sequence: [LEFT_CHEEK_MARKER, { indices: [LEFT_TEMPLE_INDEX] }] } },
        { key: 'highlighter-right-cheek-lift', kind: 'band', opacity: 0.5, strokeWidth: 8, source: { sequence: [RIGHT_CHEEK_MARKER, { indices: [RIGHT_TEMPLE_INDEX] }] } },
        { key: 'highlighter-cupids-bow', kind: 'marker', opacity: 0.6, radius: 6, source: { indices: [CUPIDS_BOW_INDEX] } },
        { key: 'highlighter-chin', kind: 'marker', opacity: 0.6, radius: 8, source: { indices: [CHIN_BUTTON_INDEX] } },
      ],
      label: 'Highlight cheekbones, blending up toward temples to lift',
    },
    square: {
      zones: [
        { key: 'highlighter-left-cheekbone', kind: 'marker', opacity: 0.7, radius: 9, source: LEFT_CHEEK_MARKER },
        { key: 'highlighter-right-cheekbone', kind: 'marker', opacity: 0.7, radius: 9, source: RIGHT_CHEEK_MARKER },
        { key: 'highlighter-nose-bridge', kind: 'marker', opacity: 0.6, radius: 6, source: { indices: [NOSE_BRIDGE_INDEX] } },
        { key: 'highlighter-chin', kind: 'marker', opacity: 0.5, radius: 7, source: { indices: [CHIN_BUTTON_INDEX] } },
      ],
      label: 'Highlight cheekbones + nose bridge + chin for radiance',
    },
    heart: {
      zones: [
        { key: 'highlighter-left-cheekbone', kind: 'marker', opacity: 0.65, radius: 8, source: LEFT_CHEEK_MARKER },
        { key: 'highlighter-right-cheekbone', kind: 'marker', opacity: 0.65, radius: 8, source: RIGHT_CHEEK_MARKER },
        { key: 'highlighter-chin', kind: 'marker', opacity: 0.7, radius: 11, source: { indices: [CHIN_BUTTON_INDEX] } },
        { key: 'highlighter-cupids-bow', kind: 'marker', opacity: 0.6, radius: 6, source: { indices: [CUPIDS_BOW_INDEX] } },
      ],
      label: 'Highlight the chin to add balance, plus the cheekbones',
    },
    long: {
      zones: [
        { key: 'highlighter-left-cheekbone', kind: 'marker', opacity: 0.65, radius: 9, source: LEFT_CHEEK_MARKER },
        { key: 'highlighter-right-cheekbone', kind: 'marker', opacity: 0.65, radius: 9, source: RIGHT_CHEEK_MARKER },
        { key: 'highlighter-chin', kind: 'marker', opacity: 0.65, radius: 11, source: { indices: [CHIN_BUTTON_INDEX] } },
        { key: 'highlighter-left-under-eye-wide', kind: 'band', opacity: 0.35, strokeWidth: 8, source: { sequence: [{ regionToward: { region: 'left_under_eye', toward: LEFT_MOUTH_CORNER_INDEX, t: 0.09 } }, { indices: [LEFT_TEMPLE_INDEX] }] } },
        { key: 'highlighter-right-under-eye-wide', kind: 'band', opacity: 0.35, strokeWidth: 8, source: { sequence: [{ regionToward: { region: 'right_under_eye', toward: RIGHT_MOUTH_CORNER_INDEX, t: 0.09 } }, { indices: [RIGHT_TEMPLE_INDEX] }] } },
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
        { key: 'blush-left-cheek', kind: 'marker', opacity: 0.5, radius: 14, source: LEFT_CHEEK_MARKER },
        { key: 'blush-right-cheek', kind: 'marker', opacity: 0.5, radius: 14, source: RIGHT_CHEEK_MARKER },
      ],
      label: 'Blush: highest point of the cheekbones, diffused outward',
    },
    round: {
      zones: [
        { key: 'blush-left-line', kind: 'band', opacity: 0.5, strokeWidth: 10, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, LEFT_CHEEK_MARKER] } },
        { key: 'blush-right-line', kind: 'band', opacity: 0.5, strokeWidth: 10, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, RIGHT_CHEEK_MARKER] } },
      ],
      label: 'Blush: straight line from ear toward center, along the cheekbone — skip the apples',
    },
    square: {
      zones: [
        { key: 'blush-left-cheek', kind: 'marker', opacity: 0.45, radius: 18, source: LEFT_CHEEK_MARKER },
        { key: 'blush-right-cheek', kind: 'marker', opacity: 0.45, radius: 18, source: RIGHT_CHEEK_MARKER },
      ],
      label: 'Blush: soft, rounded on the apples — avoid sharp diagonal lines',
    },
    heart: {
      zones: [
        { key: 'blush-left-up', kind: 'band', opacity: 0.5, strokeWidth: 9, source: { sequence: [LEFT_CHEEK_MARKER, { indices: [LEFT_TEMPLE_INDEX] }] } },
        { key: 'blush-right-up', kind: 'band', opacity: 0.5, strokeWidth: 9, source: { sequence: [RIGHT_CHEEK_MARKER, { indices: [RIGHT_TEMPLE_INDEX] }] } },
      ],
      label: 'Blush: tops of the cheekbones, blended up toward the brow tail',
    },
    long: {
      zones: [
        { key: 'blush-left-line', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, LEFT_CHEEK_MARKER] } },
        { key: 'blush-right-line', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, RIGHT_CHEEK_MARKER] } },
      ],
      label: "Blush: short straight line on the apples — don't blend too far out",
    },
  },

  bronzer: {
    oval: {
      zones: [
        { key: 'bronzer-left-sweep', kind: 'band', opacity: 0.45, strokeWidth: 12, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, LEFT_HOLLOW, { indices: [LEFT_JAW_CORNER_INDEX] }] } },
        { key: 'bronzer-right-sweep', kind: 'band', opacity: 0.45, strokeWidth: 12, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, RIGHT_HOLLOW, { indices: [RIGHT_JAW_CORNER_INDEX] }] } },
      ],
      label: 'Bronzer: light sweep from temple, under the cheekbone, to the jaw',
    },
    round: {
      zones: [
        { key: 'bronzer-left-lift', kind: 'band', opacity: 0.48, strokeWidth: 12, source: { sequence: [LEFT_CHEEK_MARKER, { indices: [LEFT_TEMPLE_INDEX] }] } },
        { key: 'bronzer-right-lift', kind: 'band', opacity: 0.48, strokeWidth: 12, source: { sequence: [RIGHT_CHEEK_MARKER, { indices: [RIGHT_TEMPLE_INDEX] }] } },
      ],
      label: 'Bronzer: cheekbones blending up toward the temples to lift',
    },
    square: {
      zones: [
        { key: 'bronzer-left-temple-hairline', kind: 'band', opacity: 0.48, strokeWidth: 12, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, { hairlineOr: { keys: ['left'], fallback: { newRegion: 'forehead' } } }] } },
        { key: 'bronzer-right-temple-hairline', kind: 'band', opacity: 0.48, strokeWidth: 12, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, { hairlineOr: { keys: ['right'], fallback: { newRegion: 'forehead' } } }] } },
        { key: 'bronzer-jawline', kind: 'band', opacity: 0.4, strokeWidth: 10, source: { newRegion: 'jawline' } },
        { key: 'bronzer-chin', kind: 'band', opacity: 0.4, strokeWidth: 8, source: { newRegion: 'chin' } },
      ],
      label: 'Bronzer: temples toward the hairline, plus light jaw + chin contour',
    },
    // No heart-specific bronzer source was found; reuses the general
    // 3-point sweep (temple / cheek hollow / jaw) rather than inventing one.
    heart: {
      zones: [
        { key: 'bronzer-left-sweep', kind: 'band', opacity: 0.45, strokeWidth: 12, source: { sequence: [{ indices: [LEFT_TEMPLE_INDEX] }, LEFT_HOLLOW, { indices: [LEFT_JAW_CORNER_INDEX] }] } },
        { key: 'bronzer-right-sweep', kind: 'band', opacity: 0.45, strokeWidth: 12, source: { sequence: [{ indices: [RIGHT_TEMPLE_INDEX] }, RIGHT_HOLLOW, { indices: [RIGHT_JAW_CORNER_INDEX] }] } },
      ],
      label: 'Bronzer: general sweep — temple, cheek hollow, jaw',
    },
    long: {
      zones: [
        { key: 'bronzer-forehead', kind: 'band', opacity: 0.48, strokeWidth: 12, source: { hairlineOr: { keys: ['left', 'center', 'right'], fallback: { newRegion: 'forehead' } } } },
        { key: 'bronzer-left-hollow', kind: 'band', opacity: 0.48, strokeWidth: 10, source: { sequence: [LEFT_HOLLOW, { interpolate: { a: LEFT_CHEEK_HOLLOW_INDEX, b: LEFT_MOUTH_CORNER_INDEX, t: 0.55 } }] } },
        { key: 'bronzer-right-hollow', kind: 'band', opacity: 0.48, strokeWidth: 10, source: { sequence: [RIGHT_HOLLOW, { interpolate: { a: RIGHT_CHEEK_HOLLOW_INDEX, b: RIGHT_MOUTH_CORNER_INDEX, t: 0.55 } }] } },
        { key: 'bronzer-jawline', kind: 'band', opacity: 0.48, strokeWidth: 10, source: { newRegion: 'jawline' } },
        { key: 'bronzer-chin', kind: 'band', opacity: 0.48, strokeWidth: 8, source: { newRegion: 'chin' } },
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

/** Builds the rendered shapes for one category+faceShape rule. No text is
 * ever drawn on the camera overlay -- rule.label exists for callers that
 * want to show instructional copy in their own UI (e.g. a chip bar), not
 * for rendering onto the face. */
// These zones mark general placement *areas* ("along the cheek hollow",
// "the cheekbone") rather than exact points, so the drawn size is
// deliberately larger than the rule table's base strokeWidth/radius values
// -- scaled up here in one place rather than inflating every one of the
// ~50 zone definitions individually, so the "how much bigger" tuning stays
// a single knob.
const BAND_WIDTH_SCALE = 1.8;
const MARKER_RADIUS_SCALE = 1.6;

function buildZonesFromRules(
  rule: ShapeCategoryRule,
  color: string,
  facialRegions: FacialRegions | null,
  newRegions: NewFacialRegions,
  landmarks: Landmark[],
  scalingParams: ScalingParams,
  hairline: HairlinePoints | null
): TutorialShape[] {
  const shapes: TutorialShape[] = [];

  for (const zone of rule.zones) {
    const rawPoints = resolvePoints(zone.source, facialRegions, newRegions, landmarks, hairline);
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
        strokeWidth: (zone.strokeWidth ?? 8) * BAND_WIDTH_SCALE,
      });
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
          radius: (zone.radius ?? 8) * MARKER_RADIUS_SCALE,
        });
      });
    }
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
  faceShape: FaceShape | null,
  hairline: HairlinePoints | null = null
): TutorialShape[] => {
  const { landmarks } = scalingParams;
  if (!landmarks || landmarks.length === 0 || !isPlacementCategory(productType) || !faceShape) {
    return [];
  }

  const category = productType!.toLowerCase().trim() as PlacementCategory;
  const rule = PLACEMENT_RULES[category]?.[faceShape];
  if (!rule) return [];

  const newRegions = getNewFacialRegions(landmarks);
  return buildZonesFromRules(rule, CATEGORY_COLOR[category], faceMeshData.facial_regions ?? null, newRegions, landmarks, scalingParams, hairline);
};
