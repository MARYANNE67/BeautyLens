/**
 * Face Camera Screen with AR Mesh Overlay
 * Front-facing camera interface that detects face mesh landmarks using
 * MediaPipe and renders product-specific AR overlays (lipstick, eyeshadow,
 * foundation, etc.)
 *
 * Ported faithfully from the original mobile/screens/FaceCameraScreen.js
 * (sea710 reference repo) — same letterbox/pillarbox aspect-ratio scaling,
 * same persistent-mesh-data pattern to prevent overlay blinking, same
 * delegation to renderClassBasedMesh() in utils/meshOverlays.ts.
 */

import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { detectFaceMesh } from '../services/api';
import { AppConfig, FeatureFlags } from '../config/featureFlags';
import {
  renderDefaultMesh,
  renderClassBasedMesh,
  getFacialRegions,
  type MeshShape,
  type MeshPolygon,
} from '../utils/meshOverlays';
import type { FaceMeshResult, ImageShape } from '../types';

const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;
const FACE_DETECTION_INTERVAL = 1000;

export default function FaceCameraScreen() {
  const router = useRouter();
  const { productType, productName } = useLocalSearchParams<{
    productType: string;
    productName: string;
    productImageUrl?: string;
  }>();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraType = 'front' as const;
  const [faceMeshData, setFaceMeshData] = useState<FaceMeshResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [photoDimensions, setPhotoDimensions] = useState<ImageShape | null>(null);
  const [cameraViewDimensions, setCameraViewDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const cameraRef = useRef<any>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const persistentMeshDataRef = useRef<FaceMeshResult | null>(null);
  const isDetectingRef = useRef(false);

  useFocusEffect(
    React.useCallback(() => {
      console.log('[Face Detection] Screen focused - starting face detection');
      if (FeatureFlags.ENABLE_FACE_MESH) {
        startFaceDetection();
      }
      return () => {
        console.log('[Face Detection] Screen blurred - stopping face detection');
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
          detectionIntervalRef.current = null;
        }
        setFaceMeshData(null);
        setFaceDetected(false);
      };
    }, [])
  );

  const startFaceDetection = () => {
    if (!FeatureFlags.ENABLE_FACE_MESH) return;
    detectionIntervalRef.current = setInterval(() => {
      if (!isDetectingRef.current && cameraRef.current) {
        detectFace();
      }
    }, FACE_DETECTION_INTERVAL);
  };

  const detectFace = async () => {
    if (!cameraRef.current || isDetectingRef.current || !FeatureFlags.ENABLE_FACE_MESH) {
      return;
    }

    isDetectingRef.current = true;
    setIsDetecting(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        skipProcessing: true,
      });

      if (!photo || !photo.uri) {
        console.error('[Face Detection] Failed to capture photo');
        return;
      }

      if (photo.width && photo.height) {
        setPhotoDimensions({ width: photo.width, height: photo.height });
      }

      const result = await detectFaceMesh(API_BASE_URL, photo.uri, false);

      if (result.status === 'error') {
        console.log('[Face Detection] API returned error:', result.message);
        setFaceDetected(false);
        return;
      }

      if (result.status === 'success') {
        if (result.face_detected && result.landmarks && result.landmarks.length > 0) {
          const imgDims = result.image_dimensions || { width: photo.width, height: photo.height };
          setPhotoDimensions(imgDims);
          setFaceMeshData(result);
          persistentMeshDataRef.current = result;
          setFaceDetected(true);
        } else {
          // Keep last mesh data to prevent blinking — only update detection status
          setFaceDetected(false);
        }
      } else {
        setFaceDetected(false);
      }
    } catch (error) {
      console.log('[Face Detection] Unexpected error (handled silently):', (error as Error).message);
      setFaceMeshData(null);
      setFaceDetected(false);
    } finally {
      isDetectingRef.current = false;
      setIsDetecting(false);
    }
  };

  const renderFaceMesh = () => {
    const meshDataToUse = faceMeshData || persistentMeshDataRef.current;

    if (!meshDataToUse || !meshDataToUse.landmarks) {
      return null;
    }

    const { landmarks } = meshDataToUse;

    const viewDims = cameraViewDimensions || Dimensions.get('window');
    const viewWidth = viewDims.width;
    const viewHeight = viewDims.height;

    const imgDims = meshDataToUse.image_dimensions || photoDimensions;

    if (!imgDims) {
      console.warn('[Face Mesh] No image dimensions available, using fallback scaling');
      return null;
    }

    const imgWidth = imgDims.width;
    const imgHeight = imgDims.height;

    const imgAspectRatio = imgWidth / imgHeight;
    const viewAspectRatio = viewWidth / viewHeight;

    let scaleX: number;
    let scaleY: number;
    let offsetX = 0;
    let offsetY = 0;

    const isFrontCamera = cameraType === 'front';
    const mirrorX = isFrontCamera;

    // Letterbox/pillarbox aware scaling — matches how CameraView fills the view
    if (viewAspectRatio > imgAspectRatio) {
      // View wider than image — scale to fill height, pillarbox on sides
      scaleY = viewHeight / imgHeight;
      scaleX = scaleY;
      offsetX = (viewWidth - imgWidth * scaleX) / 2;
    } else {
      // View taller than image — scale to fill width, letterbox top/bottom
      scaleX = viewWidth / imgWidth;
      scaleY = scaleX;
      offsetY = (viewHeight - imgHeight * scaleY) / 2;
    }

    const scalingParams = {
      landmarks,
      viewWidth,
      viewHeight,
      scaleX,
      scaleY,
      offsetX,
      offsetY,
      mirrorX,
    };

    let meshShapes: MeshShape[] = [];

    if (FeatureFlags.ENABLE_DEFAULT_FACE_MESH) {
      meshShapes = renderDefaultMesh(landmarks, scalingParams);
    } else {
      meshShapes = renderClassBasedMesh(productType, meshDataToUse, scalingParams);
    }

    if (!meshShapes || meshShapes.length === 0) {
      return null;
    }

    const isShapeBased = meshShapes.length > 0 && meshShapes[0].type === 'polygon';

    if (isShapeBased) {
      const polygons = meshShapes as MeshPolygon[];
      return (
        <View style={styles.meshOverlay} pointerEvents="none">
          <Svg style={StyleSheet.absoluteFill} width={viewWidth} height={viewHeight}>
            {polygons.map((shape) => {
              if (shape.type === 'polygon' && shape.points && shape.points.length >= 3) {
                const pathData =
                  shape.points
                    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
                    .join(' ') + ' Z';

                return (
                  <Path
                    key={shape.key}
                    d={pathData}
                    fill={shape.color || '#FF1493'}
                    fillOpacity={shape.opacity || 0.4}
                    stroke={shape.color || '#FF1493'}
                    strokeWidth={2}
                    strokeOpacity={0.6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                );
              }
              return null;
            })}
          </Svg>
        </View>
      );
    }

    // Fallback: point-based rendering for default mesh (468 landmark dots)
    return (
      <View style={styles.meshOverlay} pointerEvents="none">
        {meshShapes.map((point) => {
          if (point.type === 'polygon') return null;
          return (
            <View
              key={point.key}
              style={[
                styles.landmarkPoint,
                {
                  left: point.x,
                  top: point.y,
                  width: point.size || 3,
                  height: point.size || 3,
                  borderRadius: (point.size || 3) / 2,
                },
              ]}
            />
          );
        })}
      </View>
    );
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No access to camera</Text>
        <Text style={styles.errorSubtext}>
          Please enable camera permissions in your device settings
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={cameraType}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setCameraViewDimensions({ width, height });
        }}
      />

      <View style={styles.cameraOverlay} pointerEvents="box-none">
        <View style={styles.productInfoOverlay} pointerEvents="none">
          <Text style={styles.productName} numberOfLines={1}>
            {productName || productType || 'Virtual Try-On'}
          </Text>
          <Text style={styles.instructionText}>
            {FeatureFlags.ENABLE_FACE_MESH
              ? faceDetected
                ? 'Face detected!'
                : 'Position your face in the frame'
              : 'Face mesh detection disabled'}
          </Text>
          {isDetecting && FeatureFlags.ENABLE_FACE_MESH && (
            <ActivityIndicator size="small" color="#fff" style={{ marginTop: 8 }} />
          )}
        </View>

        {FeatureFlags.ENABLE_FACE_MESH && renderFaceMesh()}

        {FeatureFlags.ENABLE_FACE_MESH && !faceDetected && !isDetecting && (
          <View style={styles.statusOverlay} pointerEvents="none">
            <Text style={styles.statusText}>Waiting for face detection...</Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.captureButton}
          onPress={() => console.log('Capture virtual try-on')}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => console.log('Open settings')}
        >
          <Text style={styles.settingsButtonText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  productInfoOverlay: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  productName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 10,
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 15,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  backButton: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  backButtonText: { color: '#fff', fontWeight: 'bold' },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#333',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  settingsButton: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  settingsButtonText: { color: '#fff', fontWeight: 'bold' },
  errorText: { fontSize: 18, color: '#F44336', textAlign: 'center', marginBottom: 10 },
  errorSubtext: { fontSize: 14, color: '#666', textAlign: 'center' },
  permissionButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#C2185B',
    borderRadius: 25,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  meshOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  landmarkPoint: {
    position: 'absolute',
    backgroundColor: '#00FF00',
    borderWidth: 0.5,
    borderColor: '#000000',
  },
  statusOverlay: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 15,
  },
});
