import { requireNativeModule } from 'expo-modules-core';
import type { FaceMeshResult, ImageShape, Landmark } from '../types';
import { buildFacialRegions } from '../utils/faceMeshRegions';

interface NativeFaceLandmarkerResult {
  status: string;
  face_detected: boolean;
  landmarks?: Landmark[];
  num_landmarks?: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  image_dimensions?: ImageShape;
  message?: string;
}

interface ExpoFaceLandmarkerModule {
  detectFromImageAsync: (imageUri: string) => Promise<NativeFaceLandmarkerResult>;
}

let nativeModule: ExpoFaceLandmarkerModule | null | undefined;

const getNativeModule = () => {
  if (nativeModule !== undefined) return nativeModule;

  try {
    nativeModule = requireNativeModule<ExpoFaceLandmarkerModule>('ExpoFaceLandmarker');
  } catch {
    nativeModule = null;
  }

  return nativeModule;
};

export const isOnDeviceFaceLandmarkerAvailable = () =>
  typeof getNativeModule()?.detectFromImageAsync === 'function';

export const detectFaceMeshOnDevice = async (imageUri: string): Promise<FaceMeshResult> => {
  const faceLandmarker = getNativeModule();

  if (!faceLandmarker) {
    return {
      status: 'error',
      face_detected: false,
      landmarks: [],
      num_landmarks: 0,
      message: 'On-device Face Landmarker native module is not available',
    };
  }

  const result = await faceLandmarker.detectFromImageAsync(imageUri);
  const landmarks = result.landmarks ?? [];

  return {
    status: result.status,
    face_detected: result.face_detected,
    landmarks,
    num_landmarks: result.num_landmarks ?? landmarks.length,
    bbox: result.bbox,
    image_dimensions: result.image_dimensions,
    facial_regions: landmarks.length > 0 ? buildFacialRegions(landmarks) : undefined,
    message: result.message,
  };
};
