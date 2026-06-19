import { FeatureFlags } from '../config/featureFlags';
import type { FaceMeshResult } from '../types';
import { detectFaceMesh } from './api';
import {
  detectFaceMeshOnDevice,
  isOnDeviceFaceLandmarkerAvailable,
} from './onDeviceFaceLandmarker';

export const detectFaceMeshForTryOn = async (
  baseUrl: string,
  imageUri: string,
  drawMesh = false
): Promise<FaceMeshResult> => {
  if (FeatureFlags.USE_ON_DEVICE_FACE_MESH && isOnDeviceFaceLandmarkerAvailable()) {
    const result = await detectFaceMeshOnDevice(imageUri).catch((error) => ({
      status: 'error',
      face_detected: false,
      landmarks: [],
      num_landmarks: 0,
      message: (error as Error).message,
    }));

    if (result.status === 'success' || !FeatureFlags.ENABLE_BACKEND_FACE_MESH_FALLBACK) {
      return result;
    }

    console.log('[Face Mesh] On-device detection failed, falling back:', result.message);
  }

  if (!FeatureFlags.ENABLE_BACKEND_FACE_MESH_FALLBACK) {
    return {
      status: 'error',
      face_detected: false,
      landmarks: [],
      num_landmarks: 0,
      message: 'On-device Face Landmarker is unavailable and backend fallback is disabled',
    };
  }

  return detectFaceMesh(baseUrl, imageUri, drawMesh);
};
