/**
 * Face Camera Screen with AR Mesh Overlay
 * Front-facing camera that detects face mesh landmarks using MediaPipe
 * and renders product-specific AR overlays
 */

import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Polygon } from 'react-native-svg';
import { detectFaceMesh } from '../services/api';
import { AppConfig, FeatureFlags } from '../config/featureFlags';
import type { FaceMeshResult } from '../types';

const PINK = '#C2185B';
const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;
const FACE_DETECTION_INTERVAL = 1000;

// Map product types to their overlay facial region + colour
const PRODUCT_OVERLAY_MAP: Record<string, { regions: string[]; color: string; opacity: number }> = {
  'lip stick':   { regions: ['upper_lip', 'lower_lip', 'outer_lip'], color: PINK, opacity: 0.55 },
  'lip gloss':   { regions: ['upper_lip', 'lower_lip', 'outer_lip'], color: '#E91E63', opacity: 0.45 },
  'lip liner':   { regions: ['upper_lip', 'lower_lip'], color: '#880E4F', opacity: 0.5 },
  'lip balm':    { regions: ['upper_lip', 'lower_lip', 'outer_lip'], color: '#F06292', opacity: 0.35 },
  'eye liner':   { regions: ['left_eye', 'right_eye'], color: '#212121', opacity: 0.6 },
  'eye shadow':  { regions: ['left_eyeshadow', 'right_eyeshadow'], color: '#7B1FA2', opacity: 0.45 },
  'mascara':     { regions: ['left_eye', 'right_eye'], color: '#1A1A1A', opacity: 0.55 },
  'foundation':  { regions: ['face_oval'], color: '#FFCC80', opacity: 0.3 },
  'powder':      { regions: ['face_oval'], color: '#FFE0B2', opacity: 0.28 },
  'primer':      { regions: ['face_oval'], color: '#FFF9C4', opacity: 0.25 },
  'blush':       { regions: ['face_oval'], color: '#F48FB1', opacity: 0.35 },
  'bronzer':     { regions: ['face_oval'], color: '#A1887F', opacity: 0.3 },
  'highlighter': { regions: ['face_oval'], color: '#FFF9C4', opacity: 0.4 },
  'concealer':   { regions: ['left_under_eye', 'right_under_eye', 'around_mouth'], color: '#FFECB3', opacity: 0.35 },
};

function landmarksToPoints(
  landmarks: { x: number; y: number }[],
  indices: number[][],
  scaleX: number,
  scaleY: number,
  mirrorX: boolean,
  viewWidth: number
): string {
  return indices
    .map(([i]) => {
      const lm = landmarks[i];
      if (!lm) return '';
      const x = mirrorX ? viewWidth - lm.x * scaleX : lm.x * scaleX;
      const y = lm.y * scaleY;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');
}

export default function FaceCameraScreen() {
  const router = useRouter();
  const { productType, productName } = useLocalSearchParams<{
    productType: string;
    productName: string;
    productImageUrl?: string;
  }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [faceMeshData, setFaceMeshData] = useState<FaceMeshResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [cameraViewDimensions, setCameraViewDimensions] = useState({ width: 0, height: 0 });
  const [photoDimensions, setPhotoDimensions] = useState({ width: 1, height: 1 });
  const cameraRef = useRef<any>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const persistentMeshRef = useRef<FaceMeshResult | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      if (FeatureFlags.ENABLE_FACE_MESH) startFaceDetection();
      return () => {
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
    detectionIntervalRef.current = setInterval(() => {
      if (!isDetecting && cameraRef.current) detectFace();
    }, FACE_DETECTION_INTERVAL);
  };

  const detectFace = async () => {
    if (!cameraRef.current || isDetecting) return;
    setIsDetecting(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        skipProcessing: true,
      });
      if (!photo?.uri) return;

      if (photo.width && photo.height) {
        setPhotoDimensions({ width: photo.width, height: photo.height });
      }

      const result = await detectFaceMesh(API_BASE_URL, photo.uri, false);

      if (result.status === 'error') {
        setFaceDetected(false);
        return;
      }

      if (result.status === 'success') {
        if (result.face_detected && result.landmarks?.length > 0) {
          const imgDims = result.image_dimensions ?? {
            width: photo.width,
            height: photo.height,
          };
          setPhotoDimensions(imgDims);
          setFaceMeshData(result);
          persistentMeshRef.current = result;
          setFaceDetected(true);
        } else {
          setFaceDetected(false);
        }
      }
    } catch (error) {
      console.log('[Face Detection] Error:', (error as Error).message);
    } finally {
      setIsDetecting(false);
    }
  };

  const renderOverlay = () => {
    const mesh = faceMeshData ?? persistentMeshRef.current;
    if (!mesh?.landmarks || !mesh.facial_regions) return null;

    const normalizedType = productType?.toLowerCase().trim() ?? '';
    const overlayConfig = PRODUCT_OVERLAY_MAP[normalizedType];
    if (!overlayConfig) return null;

    const scaleX = cameraViewDimensions.width / photoDimensions.width;
    const scaleY = cameraViewDimensions.height / photoDimensions.height;
    const mirrorX = true; // front camera mirrors

    return (
      <Svg
        style={StyleSheet.absoluteFill}
        width={cameraViewDimensions.width}
        height={cameraViewDimensions.height}
      >
        {overlayConfig.regions.map((regionKey) => {
          const region = (mesh.facial_regions as any)[regionKey];
          if (!region?.length) return null;
          const points = landmarksToPoints(
            mesh.landmarks,
            region,
            scaleX,
            scaleY,
            mirrorX,
            cameraViewDimensions.width
          );
          if (!points) return null;
          return (
            <Polygon
              key={regionKey}
              points={points}
              fill={overlayConfig.color}
              fillOpacity={overlayConfig.opacity}
              stroke={overlayConfig.color}
              strokeWidth={1}
              strokeOpacity={overlayConfig.opacity * 0.5}
            />
          );
        })}
      </Svg>
    );
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Camera access required</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top labels */}
      <View style={styles.topBar}>
        {productType && (
          <View style={styles.productBadge}>
            <Text style={styles.productBadgeText}>
              {productType.charAt(0).toUpperCase() + productType.slice(1)}
            </Text>
          </View>
        )}
        {faceDetected && (
          <View style={styles.faceDetectedBadge}>
            <Text style={styles.faceDetectedText}>Face detected!</Text>
          </View>
        )}
      </View>

      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="front"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCameraViewDimensions({ width, height });
        }}
      >
        {renderOverlay()}
      </CameraView>

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.controlBtn} onPress={() => router.back()}>
          <Text style={styles.controlBtnText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureBtn}>
          {isDetecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.captureInner} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => {
            setFaceMeshData(null);
            persistentMeshRef.current = null;
            setFaceDetected(false);
          }}
        >
          <Text style={styles.controlBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 10,
    paddingHorizontal: 16,
  },
  productBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  productBadgeText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  faceDetectedBadge: {
    backgroundColor: 'rgba(76,175,80,0.85)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  faceDetectedText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  controlBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
  },
  controlBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  captureBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: PINK,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: PINK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  captureInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    opacity: 0.9,
  },
  permissionText: { color: '#fff', textAlign: 'center', marginTop: 40 },
  errorText: { fontSize: 18, color: '#F44336', textAlign: 'center', marginTop: 40 },
  permissionButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: PINK,
    borderRadius: 25,
    alignItems: 'center',
    marginHorizontal: 40,
  },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});
