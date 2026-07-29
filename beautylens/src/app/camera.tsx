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
  Image
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { detectFaceMesh } from '../services/api';
import { AppConfig, FeatureFlags } from '../config/featureFlags';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Linking from 'expo-linking';
import {
  renderDefaultMesh,
  renderClassBasedMesh,
  type MeshShape,
  type MeshPolygon,
} from '../utils/meshOverlays';
import type { FaceMeshResult, ImageShape } from '../types';

const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;
const FACE_DETECTION_INTERVAL = 500;
const FACE_CAPTURE_QUALITY = 0.45;

export default function FaceCameraScreen() {
  const router = useRouter();
  const { productType, productName, productTypes, productNames } = useLocalSearchParams<{
    productType: string;
    productName: string;
    productImageUrl?: string;
    productTypes?: string;
    productNames?: string;
  }>();
  const selectedProductTypes = React.useMemo(() => {
    if (!productTypes) return productType ? [productType] : [];
    try {
      const parsed = JSON.parse(productTypes);
      if (Array.isArray(parsed)) {
        const values = parsed.filter((type) => typeof type === 'string' && type.length > 0);
        return values.length > 0 ? Array.from(new Set(values)) : productType ? [productType] : [];
      }
    } catch {
      // Fall back to the single-product param below.
    }
    return productType ? [productType] : [];
  }, [productType, productTypes]);
  const selectedProductNames = React.useMemo(() => {
    if (!productNames) return [];
    try {
      const parsed = JSON.parse(productNames);
      return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : [];
    } catch {
      return [];
    }
  }, [productNames]);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraType = 'front' as const;
  const [faceMeshData, setFaceMeshData] = useState<FaceMeshResult | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedPhotoSize, setCapturedPhotoSize] = useState<{ width: number; height: number } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const [photoDimensions, setPhotoDimensions] = useState<ImageShape | null>(null);
  const [cameraViewDimensions, setCameraViewDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const cameraRef = useRef<any>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturedViewRef = useRef<View>(null);
  const persistentMeshDataRef = useRef<FaceMeshResult | null>(null);
  const isDetectingRef = useRef(false);



  const startFaceDetection = React.useCallback(() => {
    if (!FeatureFlags.ENABLE_FACE_MESH) return;
    detectionIntervalRef.current = setInterval(() => {
      if (!isDetectingRef.current && cameraRef.current) {
        detectFace();
      }
    }, FACE_DETECTION_INTERVAL);
  }, []);

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
    }, [startFaceDetection])
  );

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);

    try {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        base64: false,
        skipProcessing: false,
      });

      if (!photo?.uri) return;

      // Run face mesh one more time on the high quality photo
      const result = await detectFaceMesh(API_BASE_URL, photo.uri, false);
      if (result.face_detected && result.landmarks?.length > 0) {
        const imgDims = result.image_dimensions || { width: photo.width, height: photo.height };
        setPhotoDimensions(imgDims);
        setFaceMeshData(result);
        persistentMeshDataRef.current = result;
        setFaceDetected(true);
      }

      // Store both the photo URI and its actual pixel dimensions
      setCapturedPhotoSize({ width: photo.width, height: photo.height });
      setCapturedPhoto(photo.uri);

    } catch (error) {
      console.log('[Capture] Error:', (error as Error).message);
      startFaceDetection();
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSavePhoto = async () => {
    if (!capturedPhoto || !capturedViewRef.current) return;
    if (!photoLoaded) {
      alert('Please wait a moment for the photo to load.');
      return;
    }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Linking.openSettings();
        return;
      }

      // Small delay to ensure everything is rendered
     await new Promise(resolve => setTimeout(resolve, 1500));

      const uri = await captureRef(capturedViewRef, {
        format: 'jpg',
        quality: 0.92,
        result: 'tmpfile',
      });

      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('BeautyLens', asset, false);
      alert('Saved to BeautyLens album! 💄');
    } catch (error) {
      console.log('[Save] Error:', (error as Error).message);
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    setCapturedPhotoSize(null);
    setPhotoLoaded(false);
    setFaceMeshData(null);
    persistentMeshDataRef.current = null;
    setFaceDetected(false);
    startFaceDetection();
  };

  const detectFace = async () => {
    if (!cameraRef.current || isDetectingRef.current || !FeatureFlags.ENABLE_FACE_MESH) {
      return;
    }

    isDetectingRef.current = true;
    setIsDetecting(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: FACE_CAPTURE_QUALITY,
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
      // Keep the last successful mesh visible during transient capture/network errors.
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
      meshShapes = selectedProductTypes.flatMap((selectedType) =>
        renderClassBasedMesh(selectedType, meshDataToUse, scalingParams)
      );
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
                const buildClosedPath = (points: { x: number; y: number }[]) =>
                  points
                    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
                    .join(' ') + ' Z';
                const pathData = [
                  buildClosedPath(shape.points),
                  ...(shape.holes ?? []).map(buildClosedPath),
                ].join(' ');

                return (
                  <Path
                    key={`live-${shape.key}`}
                    d={pathData}
                    fill={shape.color || '#FF1493'}
                    fillRule={shape.holes?.length ? 'evenodd' : 'nonzero'}
                    fillOpacity={shape.opacity || 0.4}
                    stroke={shape.color || '#FF1493'}
                    strokeWidth={2}
                    strokeOpacity={shape.strokeOpacity ?? 0.6}
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

  if (capturedPhoto && capturedPhotoSize) {
    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height - 120; // subtract controls height

    // Calculate how the image fits on screen with resizeMode="cover"
    const photoAspect = capturedPhotoSize.width / capturedPhotoSize.height;
    const screenAspect = screenWidth / screenHeight;

    let displayWidth: number;
    let displayHeight: number;
    let offsetX = 0;
    let offsetY = 0;

    if (photoAspect > screenAspect) {
      // Photo wider than screen — letterbox on sides
      displayHeight = screenHeight;
      displayWidth = screenHeight * photoAspect;
      offsetX = (screenWidth - displayWidth) / 2;
    } else {
      // Photo taller than screen — letterbox top/bottom
      displayWidth = screenWidth;
      displayHeight = screenWidth / photoAspect;
      offsetY = (screenHeight - displayHeight) / 2;
    }

    const scaleX = displayWidth / capturedPhotoSize.width;
    const scaleY = displayHeight / capturedPhotoSize.height;

    // Re-render overlay with correct scaling for the static photo
    const meshDataToUse = persistentMeshDataRef.current;
    const overlayShapes = meshDataToUse?.landmarks && selectedProductTypes.length > 0
      ? selectedProductTypes.flatMap((type) =>
          renderClassBasedMesh(type, meshDataToUse, {
            landmarks: meshDataToUse.landmarks,
            viewWidth: screenWidth,
            viewHeight: screenHeight,
            scaleX,
            scaleY,
            offsetX,
            offsetY,
            mirrorX: true,
          })
        )
      : [];

    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View ref={capturedViewRef} collapsable={false} style={{ flex: 1, backgroundColor: '#000' }}>
            <Image
              source={{ uri: capturedPhoto }}
              style={{ 
                width: screenWidth, 
                height: screenHeight,
                transform: [{ scaleX: -1 }]
              }}
              resizeMode="cover"
              onLoadEnd={() => setPhotoLoaded(true)}
            />
            <Svg
              style={StyleSheet.absoluteFill}
              width={screenWidth}
              height={screenHeight}
              pointerEvents="none"
            >
            {overlayShapes.map((shape) => {
              if (shape.type !== 'polygon') return null;
              const poly = shape as MeshPolygon;
              if (!poly.points?.length) return null;
              const pathData =
                poly.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
              return (
                <Path
                  key={`snap-${poly.key}`}
                  d={pathData}
                  fill={poly.color}
                  fillOpacity={poly.opacity}
                  stroke={poly.color}
                  strokeWidth={1.5}
                  strokeOpacity={poly.strokeOpacity ?? 0.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}
           </Svg>
          </View>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity style={styles.backButton} onPress={handleRetake}>
            <Text style={styles.backButtonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.captureButton, { backgroundColor: '#C2185B' }]}
            onPress={handleSavePhoto}
          >
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsButton} onPress={() => router.back()}>
            <Text style={styles.settingsButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
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
              {selectedProductTypes.length > 1
                ? `${selectedProductTypes.length} product look`
                : productName || productType || 'Virtual Try-On'}
            </Text>
            {selectedProductNames.length > 1 && (
              <Text style={styles.lookProducts} numberOfLines={1}>
                {selectedProductNames.join(' · ')}
              </Text>
            )}
            <Text style={styles.instructionText}>
              {FeatureFlags.ENABLE_FACE_MESH
                ? faceDetected
                  ? 'Face detected!'
                  : 'Position your face in the frame'
                : 'Face mesh detection disabled'}
            </Text>
            {isDetecting && FeatureFlags.ENABLE_FACE_MESH && !persistentMeshDataRef.current && (
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
            onPress={handleCapture}
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
  lookProducts: {
    color: '#fff',
    fontSize: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
    maxWidth: '90%',
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
  capturedContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  capturedImage: {
  flex: 1,
  width: '100%',
},
});
