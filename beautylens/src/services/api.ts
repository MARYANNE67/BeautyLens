/**
 * API Service for BeautyLens
 * Handles all communication with the FastAPI backend
 */

import { authHeaders } from './authToken';
import type {
  AuthSession,
  DetectionResult,
  FaceMeshResult,
  HealthStatus,
  BeautyProfile,
  BeautyProfileInput,
  QualityCheckResult,
  SkinScanAngle,
  SkinScanAnalysis,
  UndertoneQuestionnaire,
  UndertoneResult,
  UndertoneConfirmResult,
  UndertoneCategory,
  ShadeCategory,
  RecommendationsResult,
  ShadePreviewResult,
  SkinScanStatus,
} from '../types';

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
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    } as any);

    console.log(`[API] Sending detection request to ${baseUrl}/detect`);

    const response = await fetch(`${baseUrl}/detect?confidence=${confidence}`, {
      method: 'POST',
      body: formData,
    });

    console.log(`[API] Response status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        (errorData as any).detail || `HTTP error! status: ${response.status}`;
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

/**
 * Exchanges the signed-in Firebase identity for this account's profile,
 * optionally handing the backend the device's pre-auth profile id so an
 * existing scan history can be claimed instead of orphaned.
 */
export const createSession = async (
  baseUrl: string,
  claimProfileId?: number | null
): Promise<AuthSession> => {
  const response = await fetch(`${baseUrl}/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ claim_profile_id: claimProfileId ?? null }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const deleteAccount = async (baseUrl: string): Promise<void> => {
  const response = await fetch(`${baseUrl}/auth/account`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }
};

export const createProfile = async (
  baseUrl: string,
  profile: BeautyProfileInput
): Promise<BeautyProfile> => {
  const response = await fetch(`${baseUrl}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const getProfile = async (baseUrl: string, profileId: number): Promise<BeautyProfile> => {
  const response = await fetch(`${baseUrl}/profile/${profileId}`, {
    headers: await authHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const updateProfile = async (
  baseUrl: string,
  profileId: number,
  updates: Partial<BeautyProfileInput>
): Promise<BeautyProfile> => {
  const response = await fetch(`${baseUrl}/profile/${profileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const checkCaptureQuality = async (
  baseUrl: string,
  imageUri: string
): Promise<QualityCheckResult> => {
  const formData = new FormData();
  const filename = imageUri.split('/').pop() || 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  formData.append('image', { uri: imageUri, type, name: filename } as any);

  const response = await fetch(`${baseUrl}/skin-scan/quality-check`, {
    method: 'POST',
    headers: await authHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const analyzeSkinScan = async (
  baseUrl: string,
  profileId: number,
  images: Record<SkinScanAngle, string>
): Promise<SkinScanAnalysis> => {
  const formData = new FormData();
  formData.append('profile_id', String(profileId));

  (Object.keys(images) as SkinScanAngle[]).forEach((angle) => {
    const uri = images[angle];
    const filename = uri.split('/').pop() || `${angle}.jpg`;
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';
    formData.append(angle, { uri, type, name: filename } as any);
  });

  const response = await fetch(`${baseUrl}/skin-scan/analyze`, {
    method: 'POST',
    headers: await authHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const estimateUndertone = async (
  baseUrl: string,
  scanId: number,
  questionnaire: UndertoneQuestionnaire
): Promise<UndertoneResult> => {
  const response = await fetch(`${baseUrl}/skin-scan/undertone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ scan_id: scanId, ...questionnaire }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const confirmUndertone = async (
  baseUrl: string,
  scanId: number,
  confirmed: boolean,
  overrideCategory?: UndertoneCategory | null
): Promise<UndertoneConfirmResult> => {
  const response = await fetch(`${baseUrl}/skin-scan/${scanId}/confirm-undertone`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ confirmed, override_category: overrideCategory ?? null }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const getRecommendations = async (
  baseUrl: string,
  profileId: number,
  scanId: number,
  category: ShadeCategory = 'foundation'
): Promise<RecommendationsResult> => {
  const params = new URLSearchParams({
    profile_id: String(profileId),
    scan_id: String(scanId),
    category,
  });

  const response = await fetch(`${baseUrl}/recommendations?${params.toString()}`, {
    headers: await authHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const previewShade = async (
  baseUrl: string,
  shadeId: number,
  imageUri: string
): Promise<ShadePreviewResult> => {
  const formData = new FormData();
  formData.append('shade_id', String(shadeId));
  const filename = imageUri.split('/').pop() || 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';
  formData.append('image', { uri: imageUri, type, name: filename } as any);

  const response = await fetch(`${baseUrl}/tryon/preview`, {
    method: 'POST',
    headers: await authHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const getScan = async (baseUrl: string, scanId: number): Promise<SkinScanStatus> => {
  const response = await fetch(`${baseUrl}/skin-scan/${scanId}`, {
    headers: await authHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

export const getLatestSkinScan = async (
  baseUrl: string,
  profileId: number,
  completedOnly = false
): Promise<SkinScanStatus | null> => {
  const params = new URLSearchParams({
    profile_id: String(profileId),
    completed_only: String(completedOnly),
  });

  const response = await fetch(`${baseUrl}/skin-scan/latest?${params.toString()}`, {
    headers: await authHeaders(),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).detail || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
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
