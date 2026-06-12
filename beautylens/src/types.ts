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

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface FacialRegions {
  outer_lip?: number[][];
  upper_lip: number[][];
  lower_lip: number[][];
  left_eye: number[][];
  right_eye: number[][];
  face_oval: number[][];
  left_under_eye?: number[][];
  right_under_eye?: number[][];
  around_mouth?: number[][];
  left_eyeshadow?: number[][];
  right_eyeshadow?: number[][];
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
