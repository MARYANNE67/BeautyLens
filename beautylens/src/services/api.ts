/**
 * API Service for BeautyLens
 * Handles all communication with the FastAPI backend
 */

import type { DetectionResult, FaceMeshResult, HealthStatus } from '../types';

export const getHealthStatus = async (baseUrl: string): Promise<HealthStatus> => {
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Health check error:', error);
    throw new Error('Failed to connect to API server');
  }
};


export const detectProducts = async (
  baseUrl: string,
  imageUri: string,
  confidence = 0.25
): Promise<DetectionResult> => {
  try {
    const formData = new FormData();

    // Web vs mobile handling
    if (imageUri.startsWith('data:') || imageUri.startsWith('blob:')) {
      // Web — fetch the blob and append it
      const res = await fetch(imageUri);
      const blob = await res.blob();
      formData.append('image', blob, 'photo.jpg');
    } else {
      // Mobile — React Native URI format
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      } as any);
    }

    console.log(`[API] Sending detection request to ${baseUrl}/detect`);

    const response = await fetch(`${baseUrl}/detect?confidence=${confidence}`, {
      method: 'POST',
      body: formData,
    });

    console.log(`[API] Response status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = (errorData as any).detail;
      const errorMessage = Array.isArray(detail)
        ? detail.map((d: any) => d.msg).join(', ')
        : detail || `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    }

    const result: DetectionResult = await response.json();
    console.log(`[API] Detection successful: ${result.count ?? 0} detections`);
    return result;
  } catch (error) {
    console.error('[API] Detection error:', error);
    throw error;
  }
};


// export const detectProducts = async (
//   baseUrl: string,
//   imageUri: string,
//   confidence = 0.25
// ): Promise<DetectionResult> => {
//   try {
//     const formData = new FormData();
//     formData.append('image', {
//       uri: imageUri,
//       type: 'image/jpeg',
//       name: 'photo.jpg',
//     } as any);

//     console.log(`[API] Sending detection request to ${baseUrl}/detect`);

//     const response = await fetch(`${baseUrl}/detect?confidence=${confidence}`, {
//       method: 'POST',
//       body: formData,
//     });

//     console.log(`[API] Response status: ${response.status}`);

//     if (!response.ok) {
//       const errorData = await response.json().catch(() => ({}));
//       const errorMessage =
//         (errorData as any).detail || `HTTP error! status: ${response.status}`;
//       throw new Error(errorMessage);
//     }

//     const result: DetectionResult = await response.json();
//     console.log(`[API] Detection successful: ${result.count ?? 0} detections`);
//     return result;
//   } catch (error) {
//     console.error('[API] Detection error:', error);
//     throw error;
//   }
// };

export const detectProductsWithImage = async (
  baseUrl: string,
  imageUri: string,
  confidence = 0.25
): Promise<DetectionResult & { annotated_image?: string }> => {
  try {
    const formData = new FormData();
    const filename = imageUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('image', { uri: imageUri, type, name: filename } as any);

    const response = await fetch(`${baseUrl}/detect-with-image?confidence=${confidence}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Detection error:', error);
    throw error;
  }
};

export const loadModel = async (baseUrl: string, modelPath: string): Promise<unknown> => {
  try {
    const response = await fetch(`${baseUrl}/load-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_file: modelPath }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Load model error:', error);
    throw error;
  }
};

export const setConfidence = async (baseUrl: string, threshold: number): Promise<unknown> => {
  try {
    const response = await fetch(`${baseUrl}/set-confidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Set confidence error:', error);
    throw error;
  }
};

export const detectFaceMesh = async (
  baseUrl: string,
  imageUri: string,
  drawMesh = false
): Promise<FaceMeshResult> => {
  try {
    const formData = new FormData();
    const filename = imageUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('image', { uri: imageUri, type, name: filename } as any);

    const response = await fetch(`${baseUrl}/detect-face-mesh?draw_mesh=${drawMesh}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log('[Face Mesh API] Error response:', (errorData as any).detail);
      return {
        status: 'error',
        face_detected: false,
        landmarks: [],
        num_landmarks: 0,
        message: (errorData as any).detail || `HTTP error! status: ${response.status}`,
      };
    }

    return await response.json();
  } catch (error) {
    console.log('[Face Mesh API] Network error:', (error as Error).message);
    return {
      status: 'error',
      face_detected: false,
      landmarks: [],
      num_landmarks: 0,
      message: (error as Error).message || 'Network error',
    };
  }
};
