/**
 * Shared TypeScript types for BeautyLens
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  id: string;
  label: string;
  displayName: string;
  productName?: string;
  productImageUrl?: string;
  boundingBox: BoundingBox;
  confidence: number;
  priceRange?: string;
}

export interface ApiDetection {
  class_name: string;
  display_name: string;
  raw_class_name: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  productName?: string;
  productImageUrl?: string;
  priceRange?: string;
}

export interface ImageShape {
  width: number;
  height: number;
}

export interface DetectionResult {
  status: string;
  detections: ApiDetection[];
  count: number;
  image_shape?: ImageShape;
}

/**
 * A single MediaPipe landmark in pixel space (already scaled by the
 * backend to the source photo's width/height — NOT normalised 0-1).
 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * facial_regions as returned by get_facial_regions() in src/api/face_mesh.py.
 * Each key is already an ORDERED ARRAY OF RESOLVED {x,y,z} POINTS forming
 * (in most cases) a closed loop ready to render directly as a polygon —
 * there is no separate indices[] array and no client-side lookup needed.
 */
export interface FacialRegions {
  outer_lip: Landmark[];
  inner_lip: Landmark[];
  upper_lip: Landmark[];
  lower_lip: Landmark[];
  left_eye: Landmark[];
  right_eye: Landmark[];
  face_oval: Landmark[];
  left_under_eye: Landmark[];
  right_under_eye: Landmark[];
  around_mouth: Landmark[];
  left_eyeshadow: Landmark[];
  right_eyeshadow: Landmark[];
}

export interface FaceMeshResult {
  status: string;
  face_detected: boolean;
  landmarks: Landmark[];
  num_landmarks: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  image_dimensions?: ImageShape;
  facial_regions?: FacialRegions;
  message?: string;
}

export interface HealthStatus {
  status: string;
  model_loaded: boolean;
  model_path?: string;
  confidence_threshold?: number;
}

export type ApiStatus = 'ready' | 'no_model' | 'offline' | 'unknown';