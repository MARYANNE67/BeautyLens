/**
 * Scan Product Screen
 * Real-time camera interface for detecting makeup products using YOLOv8
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { detectProducts, getHealthStatus } from '../services/api';
import ProductCard from '../components/ProductCard';
import { normalizeClassName, getDisplayName } from '../utils/productClasses';
import { FeatureFlags, simulateMockDetection, AppConfig } from '../config/featureFlags';
import type { Detection, ApiDetection, ImageShape, ApiStatus } from '../types';

const PINK = '#C2185B';

const API_BASE_URL = __DEV__
  ? AppConfig.API_BASE_URL_DEV
  : AppConfig.API_BASE_URL_PROD;

const DETECTION_CONFIDENCE_THRESHOLD = AppConfig.DETECTION_CONFIDENCE_THRESHOLD;
const DETECTION_INTERVAL = AppConfig.DETECTION_INTERVAL;
const USE_MOCK_DETECTIONS = FeatureFlags.USE_MOCK_DETECTIONS;
const NO_VIRTUAL_TRYON = ['brush', 'eyelash curler', 'beauty blender'];

const getTryOnType = (product: Detection) => normalizeClassName(product.label) ?? product.label;

const supportsVirtualTryOn = (productType: string) =>
  !NO_VIRTUAL_TRYON.includes(productType.toLowerCase());

const transformDetection = (
  apiDetection: ApiDetection,
  index: number,
  imageShape: ImageShape | null,
  cameraViewSize: { width: number; height: number }
): Detection => {
  const bbox = apiDetection.bbox ?? {};
  const rawClassName = apiDetection.class_name ?? apiDetection.raw_class_name ?? 'Unknown';
  const normalizedClass = normalizeClassName(rawClassName);
  const displayName =
    apiDetection.display_name ?? getDisplayName(normalizedClass ?? rawClassName);

  let x = bbox.x1 ?? 0;
  let y = bbox.y1 ?? 0;
  let width = (bbox.x2 ?? 0) - (bbox.x1 ?? 0);
  let height = (bbox.y2 ?? 0) - (bbox.y1 ?? 0);

  if (imageShape && cameraViewSize && imageShape.width > 0 && imageShape.height > 0) {
    const scaleX = cameraViewSize.width / imageShape.width;
    const scaleY = cameraViewSize.height / imageShape.height;
    x *= scaleX;
    y *= scaleY;
    width *= scaleX;
    height *= scaleY;
  }

  return {
    id: `detection-${index}-${Date.now()}`,
    label: normalizedClass ?? rawClassName,
    displayName,
    productName:
      apiDetection.productName ?? (displayName ? `${displayName} Product` : undefined),
    productImageUrl: apiDetection.productImageUrl,
    boundingBox: { x, y, width, height },
    confidence: apiDetection.confidence ?? 0,
    priceRange: apiDetection.priceRange,
  };
};

export default function ScanProductScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraType, setCameraType] = useState<'back' | 'front'>('back');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Detection | null>(null);
  const [selectedLookTypes, setSelectedLookTypes] = useState<string[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>(
    USE_MOCK_DETECTIONS ? 'ready' : 'unknown'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastDetectionCount, setLastDetectionCount] = useState(0);
  const cameraRef = useRef<any>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraViewSizeRef = useRef({ width: 0, height: 0 });
  const apiStatusRef = useRef<ApiStatus>(apiStatus);
  const isDetectingRef = useRef(false);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const captureAndDetect = async () => {
    if (!USE_MOCK_DETECTIONS && (!cameraRef.current || isDetecting)) return;

    setIsDetecting(true);
    isDetectingRef.current = true;

    try {
      let result: any;

      if (USE_MOCK_DETECTIONS) {
        result = await simulateMockDetection();
      } else {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          base64: false,
          skipProcessing: true,
        });
        result = await detectProducts(API_BASE_URL, photo.uri, 0.25);
      }

      if (result.status === 'success') {
        if (result.detections?.length > 0) {
          const imageShape = result.image_shape ?? null;
          const cameraViewSize = cameraViewSizeRef.current;

          const transformed = result.detections
            .map((det: ApiDetection, idx: number) =>
              transformDetection(det, idx, imageShape, cameraViewSize)
            )
            .filter((det: Detection) => det.confidence >= DETECTION_CONFIDENCE_THRESHOLD);

          setDetections(transformed);
          setLastDetectionCount(transformed.length);
          setErrorMessage(null);

          const supportedTypes: string[] = Array.from(
            new Set(
              transformed
                .map(getTryOnType)
                .filter((type: string) => supportsVirtualTryOn(type))
            )
          );

          setSelectedLookTypes((current) => {
            const retained = current.filter((type) => supportedTypes.includes(type));
            if (retained.length > 0) return retained;
            return supportedTypes;
          });

          if (transformed.length > 0 && supportedTypes.length <= 1 && !selectedProduct) {
            const highest = transformed.reduce((prev: Detection, curr: Detection) =>
              prev.confidence > curr.confidence ? prev : curr
            );
            setSelectedProduct(highest);
          } else if (supportedTypes.length > 1) {
            setSelectedProduct(null);
          }
        } else {
          setDetections([]);
          setSelectedLookTypes([]);
          setLastDetectionCount(0);
          setErrorMessage('No products detected. Try pointing at a makeup product.');
        }
      }
    } catch (error) {
      setErrorMessage(`Error: ${(error as Error).message ?? 'Unknown error'}`);
      setDetections([]);
      setSelectedLookTypes([]);
    } finally {
      setIsDetecting(false);
      isDetectingRef.current = false;
    }
  };

  const checkApiHealth = async () => {
    try {
      const health = await getHealthStatus(API_BASE_URL);
      const newStatus: ApiStatus = health.model_loaded ? 'ready' : 'no_model';
      setApiStatus(newStatus);
      apiStatusRef.current = newStatus;
    } catch {
      setApiStatus('offline');
      apiStatusRef.current = 'offline';
    }
  };

  const startContinuousDetection = () => {
    detectionIntervalRef.current = setInterval(() => {
      const currentApiStatus = apiStatusRef.current;
      const currentlyDetecting = isDetectingRef.current;

      if (USE_MOCK_DETECTIONS) {
        if (!currentlyDetecting) captureAndDetect();
      } else {
        if (currentlyDetecting || !cameraRef.current || currentApiStatus !== 'ready') return;
        captureAndDetect();
      }
    }, DETECTION_INTERVAL);
  };

  useFocusEffect(
    React.useCallback(() => {
      if (!USE_MOCK_DETECTIONS) checkApiHealth();
      else setApiStatus('ready');
      startContinuousDetection();

      return () => {
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
          detectionIntervalRef.current = null;
        }
        setDetections([]);
        setSelectedProduct(null);
        setSelectedLookTypes([]);
      };
    }, [])
  );

  useEffect(() => {
    apiStatusRef.current = apiStatus;
  }, [apiStatus]);

  useEffect(() => {
    isDetectingRef.current = isDetecting;
  }, [isDetecting]);

  const handleTryVirtualLook = (product: Detection) => {
    const normalized = getTryOnType(product);
    router.push({
      pathname: '/tryon',
      params: {
        productType: normalized,
        productName: product.productName ?? product.displayName ?? product.label,
        productImageUrl: product.productImageUrl ?? '',
      },
    });
  };

  const uniqueTryOnProducts = detections.reduce<Detection[]>((products, detection) => {
    const type = getTryOnType(detection);
    if (!supportsVirtualTryOn(type)) return products;
    if (products.some((product) => getTryOnType(product) === type)) return products;
    return [...products, detection];
  }, []);

  const toggleLookType = (productType: string) => {
    setSelectedLookTypes((current) =>
      current.includes(productType)
        ? current.filter((type) => type !== productType)
        : [...current, productType]
    );
  };

  const handleTrySelectedLook = () => {
    const selectedProducts = uniqueTryOnProducts.filter((product) =>
      selectedLookTypes.includes(getTryOnType(product))
    );

    if (selectedProducts.length === 0) return;

    router.push({
      pathname: '/tryon',
      params: {
        productType: getTryOnType(selectedProducts[0]),
        productName:
          selectedProducts.length === 1
            ? selectedProducts[0].productName ?? selectedProducts[0].displayName ?? selectedProducts[0].label
            : `${selectedProducts.length} product look`,
        productImageUrl: selectedProducts[0].productImageUrl ?? '',
        productTypes: JSON.stringify(selectedProducts.map(getTryOnType)),
        productNames: JSON.stringify(
          selectedProducts.map((product) => product.productName ?? product.displayName ?? product.label)
        ),
      },
    });
  };

  const getStatusColor = () => {
    switch (apiStatus) {
      case 'ready': return PINK;
      case 'no_model': return '#FF9800';
      case 'offline': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getStatusText = () => {
    switch (apiStatus) {
      case 'ready': return 'API Ready';
      case 'no_model': return 'No Model Loaded';
      case 'offline': return 'API Offline';
      default: return 'Checking...';
    }
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

      {!USE_MOCK_DETECTIONS && (
        <View style={[styles.statusBar, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
          {isDetecting && (
            <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 10 }} />
          )}
        </View>
      )}

      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={cameraType}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          cameraViewSizeRef.current = { width, height };
        }}
      >
        <View style={styles.cameraOverlay}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.85}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          {!selectedProduct && (
            <View style={styles.helperTextContainer}>
              <Text style={styles.helperText}>
                {apiStatus === 'ready'
                  ? lastDetectionCount > 0
                    ? `${lastDetectionCount} product(s) detected`
                    : errorMessage ?? 'Point camera at a makeup product'
                  : apiStatus === 'no_model'
                  ? 'Waiting for model to load...'
                  : 'Connecting to server...'}
              </Text>
            </View>
          )}

          {detections.map((detection) => {
            const { x, y, width, height } = detection.boundingBox;
            if (!width || !height || width <= 0 || height <= 0) return null;
            const isSelected = selectedProduct?.id === detection.id;

            return (
              <TouchableOpacity
                key={detection.id}
                style={[
                  styles.boundingBox,
                  {
                    left: Math.max(0, x),
                    top: Math.max(0, y),
                    width: Math.max(10, width),
                    height: Math.max(10, height),
                    borderColor: isSelected ? PINK : '#FFD700',
                    borderWidth: isSelected ? 3 : 2,
                  },
                ]}
                onPress={() => setSelectedProduct(detection)}
                activeOpacity={0.8}
              >
                <View style={styles.labelContainer}>
                  <Text style={styles.labelText} numberOfLines={1}>
                    {detection.displayName ?? detection.label}
                  </Text>
                  <Text style={styles.confidenceText}>
                    {(detection.confidence * 100).toFixed(0)}%
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </CameraView>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => setCameraType(cameraType === 'back' ? 'front' : 'back')}
        >
          <Text style={styles.controlButtonText}>Flip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => { setDetections([]); setSelectedProduct(null); setSelectedLookTypes([]); }}
        >
          <Text style={styles.controlButtonText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {uniqueTryOnProducts.length > 1 && !selectedProduct && (
        <View style={styles.lookTray}>
          <View style={styles.lookHeader}>
            <Text style={styles.lookTitle}>Try selected look</Text>
            <Text style={styles.lookCount}>{selectedLookTypes.length}/{uniqueTryOnProducts.length}</Text>
          </View>
          <View style={styles.lookChips}>
            {uniqueTryOnProducts.map((product) => {
              const productType = getTryOnType(product);
              const isSelected = selectedLookTypes.includes(productType);
              return (
                <TouchableOpacity
                  key={productType}
                  style={[styles.lookChip, isSelected && styles.lookChipSelected]}
                  onPress={() => toggleLookType(productType)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.lookChipText, isSelected && styles.lookChipTextSelected]}>
                    {isSelected ? '✓ ' : ''}{product.displayName ?? product.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[
              styles.tryLookButton,
              selectedLookTypes.length === 0 && styles.tryLookButtonDisabled,
            ]}
            onPress={handleTrySelectedLook}
            disabled={selectedLookTypes.length === 0}
            activeOpacity={0.85}
          >
            <Text style={styles.tryLookButtonText}>Start Look</Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedProduct && (
        <ProductCard
          product={selectedProduct}
          onDismiss={() => setSelectedProduct(null)}
          onTryVirtualLook={handleTryVirtualLook}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  statusBar: { padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  statusText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, backgroundColor: 'transparent' },
  backButton: {
    position: 'absolute',
    top: 18,
    left: 16,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  backButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  helperTextContainer: { position: 'absolute', bottom: 120, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 20 },
  helperText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, overflow: 'hidden' },
  boundingBox: { position: 'absolute', backgroundColor: 'transparent' },
  labelContainer: { position: 'absolute', top: -25, left: 0, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, maxWidth: 200 },
  labelText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  confidenceText: { color: '#FFD700', fontSize: 10, marginTop: 2 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.7)' },
  controlButton: { padding: 12, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, minWidth: 80, alignItems: 'center' },
  controlButtonText: { color: '#fff', fontWeight: 'bold' },
  lookTray: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 88,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 14,
    padding: 12,
  },
  lookHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  lookTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  lookCount: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  lookChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  lookChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  lookChipSelected: {
    borderColor: PINK,
    backgroundColor: 'rgba(194,24,91,0.3)',
  },
  lookChipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  lookChipTextSelected: { color: '#fff' },
  tryLookButton: { backgroundColor: PINK, borderRadius: 18, paddingVertical: 11, alignItems: 'center' },
  tryLookButtonDisabled: { opacity: 0.45 },
  tryLookButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  permissionText: { color: '#fff', textAlign: 'center', marginTop: 40 },
  errorText: { fontSize: 18, color: '#F44336', textAlign: 'center', marginBottom: 10, marginTop: 40 },
  errorSubtext: { fontSize: 14, color: '#666', textAlign: 'center' },
  permissionButton: { marginTop: 20, padding: 15, backgroundColor: PINK, borderRadius: 25, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});
