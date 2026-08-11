/**
 * Client-side facial region builder for on-device face tracking.
 *
 * The server pipeline returns pre-grouped facial_regions with every
 * /detect-face-mesh response (see get_facial_regions() in
 * src/api/face_mesh.py). The on-device tracker (react-native-mediapipe)
 * returns only the raw landmark array, so this module rebuilds the same
 * groups locally. The index lists below are a direct port of
 * face_mesh.py's -- if one changes, change both (the comment there points
 * back here).
 */

import type { FacialRegions, Landmark } from '../types';

// Outer and inner mouth loops from MediaPipe's canonical lip contours.
const OUTER_LIP = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const INNER_LIP = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];

// Closed filled lip surfaces: outside contour corner-to-corner, returning
// along the inner contour (avoids filling teeth).
const UPPER_LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78];
const LOWER_LIP = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];

const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];

const LEFT_EYESHADOW = [130, 247, 30, 29, 27, 28, 56, 190, 243, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const RIGHT_EYESHADOW = [359, 467, 260, 259, 257, 258, 286, 414, 463, 362, 398, 384, 385, 386, 387, 388, 466, 263];

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

const LEFT_UNDER_EYE = [23, 24, 25, 110, 226, 31, 228, 229, 230, 231, 232, 233];
// Position-by-position mirrors of LEFT_UNDER_EYE -- see the symmetry note
// in face_mesh.py (an off-by-one tail here previously made the under-eye
// bands visibly uneven).
const RIGHT_UNDER_EYE = [253, 254, 255, 339, 446, 261, 448, 449, 450, 451, 452, 453];

const AROUND_MOUTH = [0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 269, 270, 271, 272, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];

const pick = (landmarks: Landmark[], indices: number[]): Landmark[] =>
  indices.filter((i) => i >= 0 && i < landmarks.length).map((i) => landmarks[i]);

/** Build the same FacialRegions shape the backend returns, from raw
 * landmarks already converted to pixel space. */
export function buildFacialRegions(landmarks: Landmark[]): FacialRegions {
  return {
    outer_lip: pick(landmarks, OUTER_LIP),
    inner_lip: pick(landmarks, INNER_LIP),
    upper_lip: pick(landmarks, UPPER_LIP),
    lower_lip: pick(landmarks, LOWER_LIP),
    left_eye: pick(landmarks, LEFT_EYE),
    right_eye: pick(landmarks, RIGHT_EYE),
    face_oval: pick(landmarks, FACE_OVAL),
    left_under_eye: pick(landmarks, LEFT_UNDER_EYE),
    right_under_eye: pick(landmarks, RIGHT_UNDER_EYE),
    around_mouth: pick(landmarks, AROUND_MOUTH),
    left_eyeshadow: pick(landmarks, LEFT_EYESHADOW),
    right_eyeshadow: pick(landmarks, RIGHT_EYESHADOW),
  };
}
