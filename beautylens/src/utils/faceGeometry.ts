/**
 * Face-shape geometry for the placement-based tutorial overlays.
 *
 * Builds new named landmark groups (jawline, chin, temples, forehead) as
 * sub-arcs of MediaPipe's canonical face-oval loop -- the same
 * `face_oval_indices` already used (and visually validated in production)
 * by `renderFoundationMesh` in meshOverlays.ts and `get_facial_regions()` in
 * src/api/face_mesh.py. Reusing only already-validated indices means these
 * new groups inherit that same confidence, rather than introducing
 * unverified interior landmark picks.
 */

import type { Landmark } from '../types';

export type FaceShape = 'oval' | 'round' | 'square' | 'heart' | 'long';

const getLandmarks = (landmarks: Landmark[], indices: number[]): Landmark[] =>
  indices.filter((i) => i >= 0 && i < landmarks.length).map((i) => landmarks[i]);

// Right-side and left-side jaw sub-arcs of face_oval_indices, from the
// temple/cheek transition (234/454) down through the chin (152).
export const JAWLINE_INDICES = [
  454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234,
];

// Chin tip plus its immediate oval neighbours.
export const CHIN_INDICES = [148, 152, 377];

// Single points where the oval loop turns from jaw/cheek into forehead --
// the standard proxy for "temple" / overall face width at ear level.
export const LEFT_TEMPLE_INDEX = 127;
export const RIGHT_TEMPLE_INDEX = 356;

// Upper arc of face_oval_indices, from LEFT_TEMPLE_INDEX (127) through the
// top (10) to RIGHT_TEMPLE_INDEX (356) -- hairline-ish boundary of the
// forehead. Order matters: this must walk the oval loop's actual sequence
// (127,162,21,54,103,67,109,10,338,297,332,284,251,389,356), not an
// arbitrary re-ordering -- an earlier version mixed forward/reverse
// segments and dropped 162/389, which made the polyline zigzag back on
// itself instead of tracing a smooth arc (visually confirmed broken: a
// self-crossing triangular flap near the temple instead of a hairline arc).
export const FOREHEAD_INDICES = [
  127, 162, 21, 54, 103, 67, 109,
  10,
  338, 297, 332, 284, 251, 389, 356,
];

// Short sub-arcs at just the temple corners of the forehead (same oval loop,
// order preserved) -- for techniques that target the sides specifically
// (e.g. narrowing a heart-shaped forehead) rather than a line across the
// full width, which for a taller/larger forehead can land mid-forehead
// instead of near the hairline (MediaPipe's oval-top landmarks approximate
// average facial proportions; there's no dedicated hairline landmark here).
export const LEFT_FOREHEAD_SIDE_INDICES = [127, 162, 21];
export const RIGHT_FOREHEAD_SIDE_INDICES = [356, 389, 251];

// Widest point of the face oval -- the standard MediaPipe proxy for
// zygomatic/cheekbone width. Correct for *measuring* face width (see
// classifyFaceShape below), but wrong as a "cheek" placement anchor: these
// sit on the silhouette edge next to the ear at eye-corner height
// (verified by annotating them on a real portrait -- they hug the outer
// eye corner, matching live reports of cheek markers landing "near the
// eye"). Use the interior cheek anchors below for placement instead.
export const LEFT_CHEEKBONE_INDEX = 234;
export const RIGHT_CHEEKBONE_INDEX = 454;

// Interior cheek-surface anchors, chosen by annotating candidate indices
// (50/280, 205/425, 101/330, 187/411, 117/346) on a real portrait via the
// backend's own face-mesh detector and picking visually:
//  - 50/280 sit squarely on the cheek body below the eye -- the
//    "apple / top of cheekbone" spot for highlighter and blush.
//  - 205/425 sit slightly lower and more outward -- the contour hollow
//    under the cheekbone, for contour and bronzer sweeps.
// Rejected: 117/346 (under-eye height, too high), 101/330 (too close to
// the nose), 187/411 (too low, near the jaw).
export const LEFT_CHEEK_INDEX = 50;
export const RIGHT_CHEEK_INDEX = 280;
export const LEFT_CHEEK_HOLLOW_INDEX = 205;
export const RIGHT_CHEEK_HOLLOW_INDEX = 425;

// Landmark used as "top of face" for length measurement (forehead/hairline centre).
const FACE_TOP_INDEX = 10;
// Landmark used as "bottom of face" for length measurement (chin tip).
const FACE_BOTTOM_INDEX = 152;
// Jaw-width reference points (mandible angle area, part of JAWLINE_INDICES).
const LEFT_JAW_WIDTH_INDEX = 172;
const RIGHT_JAW_WIDTH_INDEX = 397;

// Single-point anchors used by the placement rules table in tutorialZones.ts.
// FOREHEAD_CENTER/CHIN_TIP/LEFT_TEMPLE/RIGHT_TEMPLE/LEFT_CHEEKBONE/
// RIGHT_CHEEKBONE (above) are already validated via face_oval_indices. The
// ones below are additional single canonical MediaPipe indices commonly
// cited for these features -- moderate confidence like the region groups
// above, not yet visually verified against a real face in this codebase.
export const CUPIDS_BOW_INDEX = 0; // already in outer_lip_indices
export const FOREHEAD_CENTER_INDEX = FACE_TOP_INDEX; // 10
export const CHIN_TIP_INDEX = FACE_BOTTOM_INDEX; // 152
export const LEFT_MOUTH_CORNER_INDEX = 61; // already in outer_lip_indices
export const RIGHT_MOUTH_CORNER_INDEX = 291; // already in outer_lip_indices
export const NOSE_BRIDGE_INDEX = 6; // commonly-cited MediaPipe nose-bridge point
export const LEFT_JAW_CORNER_INDEX = 58; // already in JAWLINE_INDICES
export const RIGHT_JAW_CORNER_INDEX = 288; // already in JAWLINE_INDICES
// Glabella (between the eyebrows) -- used as the reference point for
// extrapolating forehead-touching zones further toward the hairline, since
// FOREHEAD_INDICES/LEFT_FOREHEAD_SIDE_INDICES/RIGHT_FOREHEAD_SIDE_INDICES
// approximate average forehead height and undershoot for a taller forehead.
export const GLABELLA_INDEX = 9;

export interface NewFacialRegions {
  jawline: Landmark[];
  chin: Landmark[];
  left_temple: Landmark[];
  right_temple: Landmark[];
  forehead: Landmark[];
  left_forehead_side: Landmark[];
  right_forehead_side: Landmark[];
}

export const getNewFacialRegions = (landmarks: Landmark[]): NewFacialRegions => ({
  jawline: getLandmarks(landmarks, JAWLINE_INDICES),
  chin: getLandmarks(landmarks, CHIN_INDICES),
  left_temple: getLandmarks(landmarks, [LEFT_TEMPLE_INDEX]),
  right_temple: getLandmarks(landmarks, [RIGHT_TEMPLE_INDEX]),
  forehead: getLandmarks(landmarks, FOREHEAD_INDICES),
  left_forehead_side: getLandmarks(landmarks, LEFT_FOREHEAD_SIDE_INDICES),
  right_forehead_side: getLandmarks(landmarks, RIGHT_FOREHEAD_SIDE_INDICES),
});

const distance = (a: Landmark, b: Landmark): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export interface FaceShapeRatios {
  faceLength: number;
  cheekboneWidth: number;
  jawWidth: number;
  foreheadWidth: number;
  lengthToWidthRatio: number;
  jawToCheekRatio: number;
  foreheadToCheekRatio: number;
  foreheadToJawRatio: number;
}

export const computeFaceShapeRatios = (landmarks: Landmark[]): FaceShapeRatios | null => {
  const top = landmarks[FACE_TOP_INDEX];
  const bottom = landmarks[FACE_BOTTOM_INDEX];
  const leftCheek = landmarks[LEFT_CHEEKBONE_INDEX];
  const rightCheek = landmarks[RIGHT_CHEEKBONE_INDEX];
  const leftJaw = landmarks[LEFT_JAW_WIDTH_INDEX];
  const rightJaw = landmarks[RIGHT_JAW_WIDTH_INDEX];
  const leftForehead = landmarks[LEFT_TEMPLE_INDEX];
  const rightForehead = landmarks[RIGHT_TEMPLE_INDEX];

  if (!top || !bottom || !leftCheek || !rightCheek || !leftJaw || !rightJaw || !leftForehead || !rightForehead) {
    return null;
  }

  const faceLength = distance(top, bottom);
  const cheekboneWidth = distance(leftCheek, rightCheek);
  const jawWidth = distance(leftJaw, rightJaw);
  const foreheadWidth = distance(leftForehead, rightForehead);

  if (cheekboneWidth === 0 || jawWidth === 0) return null;

  return {
    faceLength,
    cheekboneWidth,
    jawWidth,
    foreheadWidth,
    lengthToWidthRatio: faceLength / cheekboneWidth,
    jawToCheekRatio: jawWidth / cheekboneWidth,
    foreheadToCheekRatio: foreheadWidth / cheekboneWidth,
    foreheadToJawRatio: foreheadWidth / jawWidth,
  };
};

/**
 * Classifies a face shape from a length-to-width ratio plus which of the
 * three widths (forehead/cheekbone/jaw) dominate:
 *  - long: notably longer than wide
 *  - round: close to as wide as long, full/soft jaw near cheekbone width
 *  - square: forehead/cheek/jaw widths close together, minimal taper
 *  - heart: forehead notably wider than jaw, tapered chin
 *  - oval: balanced, moderate taper -- the fallback default
 *
 * The general method -- classifying facial shape from length/width
 * proportions -- is established craniofacial anthropometry (Farkas's
 * facial index: https://www.qoves.com/insights/measurements/facial-index).
 * Farkas's own index uses different reference points (nasion-to-gnathion
 * over bizygomatic width, 3 broad categories) than the 5-shape oval/round/
 * square/heart/long taxonomy used here, which is a popularized beauty-
 * industry concept rather than a peer-reviewed classification. The
 * `lengthToWidthRatio` cutoffs below (round/square below ~1.25, oval around
 * 1.5, long/oblong above ~1.6) are aggregated from several independently
 * published face-shape calculators that use the same hairline-to-chin /
 * cheekbone-width measurement convention this module does, e.g.
 * https://loopedinlooks.com/tools/face-shape-calculator/ -- not a single
 * peer-reviewed source. The forehead-vs-jaw and forehead/jaw-vs-cheekbone
 * thresholds are a looser heuristic: sources describe these qualitatively
 * ("wide forehead over narrow jaw is heart", "square's forehead is almost
 * as wide as the cheekbones and jawline") without an agreed-upon numeric cutoff.
 */
export const classifyFaceShape = (landmarks: Landmark[]): FaceShape | null => {
  const ratios = computeFaceShapeRatios(landmarks);
  if (!ratios) return null;

  const { lengthToWidthRatio, jawToCheekRatio, foreheadToCheekRatio, foreheadToJawRatio } = ratios;

  if (lengthToWidthRatio >= 1.6) return 'long';
  if (foreheadToJawRatio >= 1.15) return 'heart';
  if (jawToCheekRatio >= 0.92 && foreheadToCheekRatio >= 0.92 && lengthToWidthRatio < 1.25) return 'square';
  if (lengthToWidthRatio <= 1.25 && jawToCheekRatio >= 0.9) return 'round';
  return 'oval';
};
