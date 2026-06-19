import type { FacialRegions, Landmark } from '../types';

const getLandmarks = (landmarks: Landmark[], indices: number[]) =>
  indices.map((index) => landmarks[index]).filter((landmark): landmark is Landmark => Boolean(landmark));

const OUTER_LIP_INDICES = [
  61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78,
];
const INNER_LIP_INDICES = [
  78, 81, 80, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
];
const LEFT_EYE_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE_INDICES = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const LEFT_EYESHADOW_INDICES = [
  70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 124, 35, 31, 228, 229, 230, 231, 232, 233, 244,
  245, 122, 6, 197, 196, 3, 51, 48, 115, 131, 134, 102, 49, 220, 305, 281, 363, 360,
];
const RIGHT_EYESHADOW_INDICES = [
  300, 293, 334, 296, 336, 285, 295, 282, 283, 276, 353, 265, 261, 447, 448, 449, 450,
  451, 452, 453, 464, 351, 326, 425, 427, 411, 280, 278, 344, 340, 346, 347, 330, 279,
  358, 360, 440, 344,
];
const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400,
  377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const LEFT_UNDER_EYE_INDICES = [23, 24, 25, 110, 226, 31, 228, 229, 230, 231, 232, 233];
const RIGHT_UNDER_EYE_INDICES = [253, 254, 255, 339, 446, 260, 447, 448, 449, 450, 451, 452];
const AROUND_MOUTH_INDICES = [
  0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 269, 270, 271, 272, 308, 324, 318, 402, 317,
  14, 87, 178, 88, 95, 78,
];

export const buildFacialRegions = (landmarks: Landmark[]): FacialRegions => ({
  outer_lip: getLandmarks(landmarks, OUTER_LIP_INDICES),
  inner_lip: getLandmarks(landmarks, INNER_LIP_INDICES),
  upper_lip: getLandmarks(landmarks, OUTER_LIP_INDICES.slice(0, 10)),
  lower_lip: getLandmarks(landmarks, OUTER_LIP_INDICES.slice(10)),
  left_eye: getLandmarks(landmarks, LEFT_EYE_INDICES),
  right_eye: getLandmarks(landmarks, RIGHT_EYE_INDICES),
  face_oval: getLandmarks(landmarks, FACE_OVAL_INDICES),
  left_under_eye: getLandmarks(landmarks, LEFT_UNDER_EYE_INDICES),
  right_under_eye: getLandmarks(landmarks, RIGHT_UNDER_EYE_INDICES),
  around_mouth: getLandmarks(landmarks, AROUND_MOUTH_INDICES),
  left_eyeshadow: getLandmarks(landmarks, LEFT_EYESHADOW_INDICES),
  right_eyeshadow: getLandmarks(landmarks, RIGHT_EYESHADOW_INDICES),
});
