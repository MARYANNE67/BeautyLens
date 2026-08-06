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

// Upper arc of face_oval_indices: hairline-ish boundary of the forehead.
// Approximates the forehead region using only already-validated points --
// it traces the outer boundary, not a hairline-to-brow interior fill.
export const FOREHEAD_INDICES = [
  10, 338, 297, 332, 284, 251, 356,
  127, 109, 67, 103, 54, 21,
];

// Widest point of the face oval -- the standard MediaPipe proxy for
// zygomatic/cheekbone width. Single points (not a filled region): there's
// no validated interior cheek landmark set to build a polygon from yet.
export const LEFT_CHEEKBONE_INDEX = 234;
export const RIGHT_CHEEKBONE_INDEX = 454;

// Landmark used as "top of face" for length measurement (forehead/hairline centre).
const FACE_TOP_INDEX = 10;
// Landmark used as "bottom of face" for length measurement (chin tip).
const FACE_BOTTOM_INDEX = 152;
// Jaw-width reference points (mandible angle area, part of JAWLINE_INDICES).
const LEFT_JAW_WIDTH_INDEX = 172;
const RIGHT_JAW_WIDTH_INDEX = 397;

export interface NewFacialRegions {
  jawline: Landmark[];
  chin: Landmark[];
  left_temple: Landmark[];
  right_temple: Landmark[];
  forehead: Landmark[];
}

export const getNewFacialRegions = (landmarks: Landmark[]): NewFacialRegions => ({
  jawline: getLandmarks(landmarks, JAWLINE_INDICES),
  chin: getLandmarks(landmarks, CHIN_INDICES),
  left_temple: getLandmarks(landmarks, [LEFT_TEMPLE_INDEX]),
  right_temple: getLandmarks(landmarks, [RIGHT_TEMPLE_INDEX]),
  forehead: getLandmarks(landmarks, FOREHEAD_INDICES),
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
 * Classifies a face shape from standard beauty-industry conventions:
 *  - long: notably longer than wide
 *  - round: close to as wide as long, full/soft jaw near cheekbone width
 *  - square: forehead/cheek/jaw widths close together, minimal taper
 *  - heart: forehead notably wider than jaw, tapered chin
 *  - oval: balanced, moderate taper -- the fallback default
 * This is a heuristic, not a clinical measurement -- thresholds were chosen
 * to match commonly cited proportions, not derived from a labeled dataset.
 */
export const classifyFaceShape = (landmarks: Landmark[]): FaceShape | null => {
  const ratios = computeFaceShapeRatios(landmarks);
  if (!ratios) return null;

  const { lengthToWidthRatio, jawToCheekRatio, foreheadToCheekRatio, foreheadToJawRatio } = ratios;

  if (lengthToWidthRatio >= 1.6) return 'long';
  if (foreheadToJawRatio >= 1.15) return 'heart';
  if (jawToCheekRatio >= 0.92 && foreheadToCheekRatio >= 0.92 && lengthToWidthRatio < 1.45) return 'square';
  if (lengthToWidthRatio <= 1.15 && jawToCheekRatio >= 0.9) return 'round';
  return 'oval';
};
