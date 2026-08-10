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
  Image,
  ScrollView
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { G, Path, Circle, Text as SvgText } from 'react-native-svg';
import { detectFaceMesh, detectHairline } from '../services/api';
import { AppConfig } from '../config/featureFlags';
import { FeatureFlags } from '../config/flags';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Linking from 'expo-linking';
import {
  renderDefaultMesh,
  renderClassBasedMesh,
  scalePoint,
  type ScalingParams,
  type MeshShape,
  type MeshPolygon,
  type MeshBand,
  type MeshMarker,
  type MeshLabel,
} from '../utils/meshOverlays';
import { renderTutorialZones, isPlacementCategory, CATEGORY_COLOR, type HairlinePoints } from '../utils/tutorialZones';
import { Ionicons } from '@expo/vector-icons';
import {
  classifyFaceShape,
  type FaceShape,
  LEFT_TEMPLE_INDEX,
  RIGHT_TEMPLE_INDEX,
  FOREHEAD_CENTER_INDEX,
} from '../utils/faceGeometry';
import type { FaceMeshResult, ImageShape } from '../types';

const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;
const FACE_DETECTION_INTERVAL = 250;
const FACE_CAPTURE_QUALITY = 0.45;
// takePictureAsync's `quality` only controls JPEG compression, not pixel
// dimensions -- without this, every polling tick uploads a full-sensor-
// resolution photo (e.g. 3000px+) over the network for face-mesh detection,
// which doesn't need anywhere near that resolution to find landmarks. This
// is very likely the dominant cost in the detect-face-mesh round trip
// (upload time + backend decode/inference time both scale with image size),
// well above the polling interval itself. Downscaling the long edge to this
// many pixels before upload is unverified against a live device, but is the
// standard fix for this exact "server round-trip is too slow" shape of
// problem.
const FACE_DETECTION_MAX_DIMENSION = 480;
// How long to keep sampling the face shape after a face is first detected,
// before locking it in and stopping further classification for the session.
// The window exists to ride out noisy early frames (mid-movement, partial
// face), not to gather a fixed sample count -- so when the first few
// samples all agree, waiting out the rest of the window adds nothing.
const FACE_SHAPE_LEARNING_DURATION_MS = 2500;
// Lock immediately once this many samples unanimously agree.
const FACE_SHAPE_EARLY_LOCK_SAMPLES = 4;

function mostFrequentFaceShape(samples: FaceShape[]): FaceShape {
  const counts = new Map<FaceShape, number>();
  for (const sample of samples) {
    counts.set(sample, (counts.get(sample) ?? 0) + 1);
  }
  let best = samples[0];
  let bestCount = 0;
  for (const [shape, count] of counts) {
    if (count > bestCount) {
      best = shape;
      bestCount = count;
    }
  }
  return best;
}

const FACE_SHAPE_LABEL: Record<FaceShape, string> = {
  oval: 'Oval',
  round: 'Round',
  square: 'Square',
  heart: 'Heart',
  long: 'Long',
};

// Shown as a bottom button bar when the screen is reached with no product
// info at all (the "Tutorial" shortcut on the scan screen) -- lets you
// toggle which placement categories' zones are drawn, live, without leaving
// the camera. Rendered as circular icon buttons (easier tap targets than
// word chips) tinted with the same CATEGORY_COLOR the overlay draws in;
// `selectedIconColor` is picked per swatch for contrast against that fill
// (dark icons on the light fills, white on the darker ones).
const PLACEMENT_CATEGORY_CHIPS: {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  selectedIconColor: string;
}[] = [
  { key: 'contour', label: 'Contour', icon: 'brush', color: CATEGORY_COLOR.contour, selectedIconColor: '#fff' },
  { key: 'concealer', label: 'Concealer', icon: 'eye', color: CATEGORY_COLOR.concealer, selectedIconColor: '#6B4A2F' },
  { key: 'highlighter', label: 'Highlighter', icon: 'sparkles', color: CATEGORY_COLOR.highlighter, selectedIconColor: '#6B5B1E' },
  { key: 'blush', label: 'Blush', icon: 'flower', color: CATEGORY_COLOR.blush, selectedIconColor: '#fff' },
  { key: 'bronzer', label: 'Bronzer', icon: 'sunny', color: CATEGORY_COLOR.bronzer, selectedIconColor: '#fff' },
];
const ALL_CHIP_COLOR = '#C2185B';

const buildClosedPath = (points: { x: number; y: number }[]) =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ') + ' Z';

const buildOpenPath = (points: { x: number; y: number }[]) =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

/**
 * Renders one mesh shape (color-fill polygon, tutorial band/marker/label) as
 * an SVG element. Shared by the live overlay and the captured-photo review
 * overlay so both stay visually consistent.
 */
function renderShapeElement(
  shape: MeshShape,
  key: string,
  polygonStrokeWidth: number,
  polygonDefaultStrokeOpacity: number
): React.ReactNode {
  switch (shape.type) {
    case 'polygon': {
      const polygon = shape as MeshPolygon;
      if (!polygon.points || polygon.points.length < 3) return null;
      const pathData = [
        buildClosedPath(polygon.points),
        ...(polygon.holes ?? []).map(buildClosedPath),
      ].join(' ');
      return (
        <Path
          key={key}
          d={pathData}
          fill={polygon.color || '#FF1493'}
          fillRule={polygon.holes?.length ? 'evenodd' : 'nonzero'}
          fillOpacity={polygon.opacity || 0.4}
          stroke={polygon.color || '#FF1493'}
          strokeWidth={polygonStrokeWidth}
          strokeOpacity={polygon.strokeOpacity ?? polygonDefaultStrokeOpacity}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      );
    }
    // Tutorial bands/markers mark general placement *areas*, not exact
    // lines/points, so both render as a soft "airbrushed" core-plus-halo
    // (a wider, fainter layer under the full-opacity one) rather than a
    // hard-edged stroke or dot. Layered strokes/circles are used instead
    // of SVG blur filters, which are expensive on the live overlay.
    case 'band': {
      const band = shape as MeshBand;
      if (!band.points || band.points.length < 2) return null;
      const d = buildOpenPath(band.points);
      const strokeProps = {
        d,
        fill: 'none',
        stroke: band.color,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
      } as const;
      return (
        <G key={key}>
          <Path {...strokeProps} strokeWidth={band.strokeWidth * 1.8} strokeOpacity={band.opacity * 0.3} />
          <Path {...strokeProps} strokeWidth={band.strokeWidth} strokeOpacity={band.opacity} />
        </G>
      );
    }
    case 'marker': {
      const marker = shape as MeshMarker;
      const circleProps = { cx: marker.x, cy: marker.y, fill: marker.color } as const;
      return (
        <G key={key}>
          <Circle {...circleProps} r={marker.radius * 1.9} fillOpacity={marker.opacity * 0.18} />
          <Circle {...circleProps} r={marker.radius * 1.45} fillOpacity={marker.opacity * 0.35} />
          <Circle {...circleProps} r={marker.radius} fillOpacity={marker.opacity} />
        </G>
      );
    }
    case 'label': {
      const label = shape as MeshLabel;
      return (
        <SvgText
          key={key}
          x={label.x}
          y={label.y}
          fill={label.color}
          fontSize={12}
          fontWeight="bold"
          textAnchor="middle"
        >
          {label.text}
        </SvgText>
      );
    }
    default:
      return null;
  }
}

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

  // Reached with no product info at all (the scan screen's "Tutorial"
  // shortcut) -- selectedProductTypes is already [] in that case, per the
  // memo above. Category selection then comes from the bottom chip bar
  // instead of route params, and can change live without re-navigating.
  const isCategoryPickerMode = selectedProductTypes.length === 0;
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const displayProductTypes = isCategoryPickerMode ? activeCategories : selectedProductTypes;

  const toggleCategory = (categoryKey: string) => {
    setActiveCategories((current) =>
      current.includes(categoryKey)
        ? current.filter((k) => k !== categoryKey)
        : [...current, categoryKey]
    );
  };
  const allCategoryKeys = PLACEMENT_CATEGORY_CHIPS.map((c) => c.key);
  const allCategoriesSelected = allCategoryKeys.every((k) => activeCategories.includes(k));
  const toggleAllCategories = () => {
    setActiveCategories(allCategoriesSelected ? [] : allCategoryKeys);
  };

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
  const smoothedLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);
  const SMOOTHING_FACTOR = 0.6; // lower = smoother but more lag, higher = snappier but shakier

  // Face shape is learned once per session, not re-checked every tick: sample
  // for FACE_SHAPE_LEARNING_DURATION_MS after the first detection, then lock
  // in whichever shape was seen most and stop classifying for this screen.
  const [detectedFaceShape, setDetectedFaceShape] = useState<FaceShape | null>(null);
  const detectedFaceShapeRef = useRef<FaceShape | null>(null);
  const faceShapeSamplesRef = useRef<FaceShape[]>([]);
  const faceShapeLearningStartedAtRef = useRef<number | null>(null);

  // Real hairline (hair/skin boundary), fetched once on the first successful
  // detection and never again -- face-mesh landmarks don't model hair at
  // all, so this is a supplement, not a per-tick replacement. Falls back to
  // the landmark-approximated hairline in tutorialZones.ts when null.
  const [detectedHairline, setDetectedHairline] = useState<HairlinePoints | null>(null);
  const hairlineFetchTriggeredRef = useRef(false);

  // Dev-only landmark inspector (see FeatureFlags.DEV_LANDMARK_DEBUG):
  // renders all 468 landmarks as dots and identifies the nearest landmark
  // indices on tap -- so placement bugs can be diagnosed from one screenshot
  // ("that's landmark 234 sitting at eye height") instead of guessing.
  const debugAvailable = __DEV__ && FeatureFlags.DEV_LANDMARK_DEBUG;
  const [debugLandmarksOn, setDebugLandmarksOn] = useState(false);
  const [debugTap, setDebugTap] = useState<{
    x: number;
    y: number;
    hits: { index: number; dist: number; x: number; y: number }[];
  } | null>(null);
  const debugScalingRef = useRef<ScalingParams | null>(null);
  const debugActive = debugAvailable && debugLandmarksOn;

  const handleDebugTap = (tapX: number, tapY: number) => {
    const meshData = faceMeshData || persistentMeshDataRef.current;
    const scaling = debugScalingRef.current;
    if (!meshData?.landmarks?.length || !scaling) return;
    const hits = meshData.landmarks
      .map((lm, index) => {
        const p = scalePoint(lm, scaling.scaleX, scaling.scaleY, scaling.offsetX, scaling.offsetY, scaling.mirrorX, scaling.viewWidth);
        return { index, dist: Math.hypot(p.x - tapX, p.y - tapY), x: p.x, y: p.y };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);
    setDebugTap({ x: tapX, y: tapY, hits });
  };



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
        detectedFaceShapeRef.current = null;
        setDetectedFaceShape(null);
        faceShapeSamplesRef.current = [];
        faceShapeLearningStartedAtRef.current = null;
        hairlineFetchTriggeredRef.current = false;
        setDetectedHairline(null);
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
    detectedFaceShapeRef.current = null;
    setDetectedFaceShape(null);
    faceShapeSamplesRef.current = [];
    faceShapeLearningStartedAtRef.current = null;
    hairlineFetchTriggeredRef.current = false;
    setDetectedHairline(null);
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

      // Downscale before upload -- see FACE_DETECTION_MAX_DIMENSION above.
      // Only the longer edge is constrained; ImageManipulator preserves
      // aspect ratio when only one dimension is given.
      const isLandscape = photo.width >= photo.height;
      const detectionPhoto = await ImageManipulator.manipulateAsync(
        photo.uri,
        [isLandscape
          ? { resize: { width: FACE_DETECTION_MAX_DIMENSION } }
          : { resize: { height: FACE_DETECTION_MAX_DIMENSION } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      if (detectionPhoto.width && detectionPhoto.height) {
        setPhotoDimensions({ width: detectionPhoto.width, height: detectionPhoto.height });
      }

      const result = await detectFaceMesh(API_BASE_URL, detectionPhoto.uri, false);

      if (result.status === 'error') {
        console.log('[Face Detection] API returned error:', result.message);
        setFaceDetected(false);
        return;
      }

      if (result.status === 'success') {
        // if (result.face_detected && result.landmarks && result.landmarks.length > 0) {
        //   const imgDims = result.image_dimensions || { width: photo.width, height: photo.height };
        //   setPhotoDimensions(imgDims);
        //   setFaceMeshData(result);
        //   persistentMeshDataRef.current = result;
        //   setFaceDetected(true);
        // } else {
        //   // Keep last mesh data to prevent blinking — only update detection status
        //   setFaceDetected(false);
        // }

        if (result.face_detected && result.landmarks && result.landmarks.length > 0) {
          const imgDims = result.image_dimensions || { width: detectionPhoto.width, height: detectionPhoto.height };
          setPhotoDimensions(imgDims);

          // Smooth landmarks — blend new positions with previous to reduce shakiness
          const newLandmarks = result.landmarks;
          if (smoothedLandmarksRef.current && smoothedLandmarksRef.current.length === newLandmarks.length) {
            const smoothed = newLandmarks.map((lm, i) => {
              const prev = smoothedLandmarksRef.current![i];
              return {
                x: prev.x + SMOOTHING_FACTOR * (lm.x - prev.x),
                y: prev.y + SMOOTHING_FACTOR * (lm.y - prev.y),
                z: prev.z + SMOOTHING_FACTOR * (lm.z - prev.z),
              };
            });
            smoothedLandmarksRef.current = smoothed;
            result.landmarks = smoothed;
          } else {
            smoothedLandmarksRef.current = newLandmarks;
          }

          setFaceMeshData(result);
          persistentMeshDataRef.current = result;
          setFaceDetected(true);

          if (!detectedFaceShapeRef.current) {
            if (faceShapeLearningStartedAtRef.current === null) {
              faceShapeLearningStartedAtRef.current = Date.now();
            }
            const sampledShape = classifyFaceShape(result.landmarks);
            if (sampledShape) {
              faceShapeSamplesRef.current.push(sampledShape);
            }

            const samples = faceShapeSamplesRef.current;
            const elapsed = Date.now() - faceShapeLearningStartedAtRef.current;
            const unanimous =
              samples.length >= FACE_SHAPE_EARLY_LOCK_SAMPLES &&
              samples.every((s) => s === samples[0]);
            if (unanimous || (elapsed >= FACE_SHAPE_LEARNING_DURATION_MS && samples.length > 0)) {
              const lockedShape = mostFrequentFaceShape(samples);
              detectedFaceShapeRef.current = lockedShape;
              setDetectedFaceShape(lockedShape);
            }
          }

          if (!hairlineFetchTriggeredRef.current) {
            hairlineFetchTriggeredRef.current = true;
            const hairlineAnchors = [
              LEFT_TEMPLE_INDEX,
              FOREHEAD_CENTER_INDEX,
              RIGHT_TEMPLE_INDEX,
            ].map((i) => result.landmarks[i]);
            const xPositions = hairlineAnchors.map((a) => a?.x ?? 0);

            // Fire-and-forget: this is a one-time-per-session lookup, not
            // part of the regular detection loop, so it shouldn't block or
            // slow down the polling tick that triggered it.
            detectHairline(API_BASE_URL, detectionPhoto.uri, xPositions)
              .then((hairlineResult) => {
                if (hairlineResult.status !== 'success') return;
                // Reject any point that isn't ABOVE the landmark whose x it
                // was sampled at. When hair fully covers a temple-side
                // forehead column, the scan's "first sustained face-skin run"
                // in that column is the CHEEK -- a real skin boundary, just
                // not the hairline (confirmed live via the landmark
                // inspector: a "hairline" point ringed at cheek height, which
                // stretched the heart-shape contour band down the cheek).
                // A rejected point becomes null, which tutorialZones.ts
                // already handles by falling back to the landmark
                // approximation for that zone.
                const [left, center, right] = hairlineResult.points.map((p, i) => {
                  const anchor = hairlineAnchors[i];
                  return p && anchor && p.y < anchor.y ? p : null;
                });
                // The temple-side points are only used by symmetric
                // left/right zone pairs (contour heart, bronzer square). If
                // exactly one side survives validation, that pair renders
                // one band to the real hairline and the other to the
                // landmark fallback -- visibly uneven (reported live).
                // Symmetry beats one-sided precision here: keep both or
                // drop both. The center point stays independent.
                const bothSides = left !== null && right !== null;
                setDetectedHairline({
                  left: bothSides ? left : null,
                  center,
                  right: bothSides ? right : null,
                });
              })
              .catch(() => {
                // Leave detectedHairline null -- tutorialZones.ts already
                // falls back to the landmark approximation for that case.
              });
          }
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

    // Cover-fit scaling — CameraView fills its container by cropping the
    // overflow (like every native camera preview), not by letterboxing with
    // blank bars. This must pick the LARGER of the two fill ratios so the
    // scaled image fully covers the view on both axes; the captured-photo
    // review below (Image resizeMode="cover") already does this correctly --
    // this block previously had the comparison backwards (contain instead of
    // cover), which is correct near the center of the face but increasingly
    // wrong toward the edges (worse toward the chin/hairline).
    if (imgAspectRatio > viewAspectRatio) {
      // Image relatively wider than the view — match height, crop left/right
      scaleY = viewHeight / imgHeight;
      scaleX = scaleY;
      offsetX = (viewWidth - imgWidth * scaleX) / 2;
    } else {
      // Image relatively taller than the view — match width, crop top/bottom
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
    debugScalingRef.current = scalingParams;

    let meshShapes: MeshShape[] = [];
    const isDefaultMesh = FeatureFlags.ENABLE_DEFAULT_FACE_MESH;

    if (isDefaultMesh) {
      meshShapes = renderDefaultMesh(landmarks, scalingParams);
    } else {
      meshShapes = displayProductTypes.flatMap((selectedType) =>
        isPlacementCategory(selectedType)
          ? renderTutorialZones(selectedType, meshDataToUse, scalingParams, detectedFaceShape, detectedHairline)
          : renderClassBasedMesh(selectedType, meshDataToUse, scalingParams)
      );
    }

    if ((!meshShapes || meshShapes.length === 0) && !debugActive) {
      return null;
    }

    if (!isDefaultMesh) {
      // Extra dev-inspector layers: all 468 landmarks as dots, the measured
      // hairline points as rings, and rings around the landmarks nearest to
      // the last tap (identified in the readout chip near the top).
      const debugDots = debugActive ? renderDefaultMesh(landmarks, scalingParams) : [];
      const debugHairline = debugActive && detectedHairline
        ? (['left', 'center', 'right'] as const)
            .filter((k) => detectedHairline[k] !== null)
            .map((k) => ({
              key: k,
              ...scalePoint(detectedHairline[k]!, scaleX, scaleY, offsetX, offsetY, mirrorX, viewWidth),
            }))
        : [];
      return (
        <View style={styles.meshOverlay} pointerEvents="none">
          <Svg style={StyleSheet.absoluteFill} width={viewWidth} height={viewHeight}>
            {meshShapes.map((shape) => renderShapeElement(shape, `live-${shape.key}`, 2, 0.6))}
            {debugDots.map((p) => (
              <Circle key={`dbg-${p.key}`} cx={p.x + 1.5} cy={p.y + 1.5} r={1.4} fill="#00FF88" fillOpacity={0.85} />
            ))}
            {debugHairline.map((p) => (
              <Circle key={`dbg-hairline-${p.key}`} cx={p.x} cy={p.y} r={6} fill="none" stroke="#00D4FF" strokeWidth={2} />
            ))}
            {debugActive && debugTap && (
              <G>
                <Circle cx={debugTap.x} cy={debugTap.y} r={3} fill="#FF3B30" />
                {debugTap.hits.map((h) => (
                  <Circle key={`dbg-hit-${h.index}`} cx={h.x} cy={h.y} r={7} fill="none" stroke="#FF3B30" strokeWidth={2} />
                ))}
              </G>
            )}
          </Svg>
        </View>
      );
    }

    // Fallback: point-based rendering for default mesh (468 landmark dots)
    const points = meshShapes as MeshShape[] & { x: number; y: number; size?: number }[];
    return (
      <View style={styles.meshOverlay} pointerEvents="none">
        {points.map((point) => {
          if (point.type !== 'landmark' && point.type !== 'lip' && point.type !== 'eye' && point.type !== 'face') {
            return null;
          }
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

    // Re-render overlay with correct scaling for the static photo.
    // Landmarks are scaled from the dimensions of the photo they were
    // DETECTED on (image_dimensions), not the displayed photo's dimensions:
    // if the final full-res detection failed, the retained landmarks came
    // from the downscaled polling-loop photo (see
    // FACE_DETECTION_MAX_DIMENSION), and scaling those by the full-res
    // photo's size would shrink the overlay into the corner. The aspect
    // ratios match, so the display math above is unaffected.
    const meshDataToUse = persistentMeshDataRef.current;
    const landmarkSpace = meshDataToUse?.image_dimensions ?? capturedPhotoSize;
    const scaleX = displayWidth / landmarkSpace.width;
    const scaleY = displayHeight / landmarkSpace.height;
    const overlayShapes = meshDataToUse?.landmarks && displayProductTypes.length > 0
      ? displayProductTypes.flatMap((type) => {
          const captureScalingParams = {
            landmarks: meshDataToUse.landmarks,
            viewWidth: screenWidth,
            viewHeight: screenHeight,
            scaleX,
            scaleY,
            offsetX,
            offsetY,
            mirrorX: true,
          };
          return isPlacementCategory(type)
            ? renderTutorialZones(type, meshDataToUse, captureScalingParams, detectedFaceShape, detectedHairline)
            : renderClassBasedMesh(type, meshDataToUse, captureScalingParams);
        })
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
            {overlayShapes.map((shape) => renderShapeElement(shape, `snap-${shape.key}`, 1.5, 0.2))}
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
              {isCategoryPickerMode
                ? activeCategories.length === 0
                  ? 'Choose a category below'
                  : activeCategories.length === 1
                  ? PLACEMENT_CATEGORY_CHIPS.find((c) => c.key === activeCategories[0])?.label ?? activeCategories[0]
                  : `${activeCategories.length} categories`
                : selectedProductTypes.length > 1
                ? `${selectedProductTypes.length} product look`
                : productName || productType || 'Tutorial'}
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
            {FeatureFlags.ENABLE_FACE_MESH && displayProductTypes.some(isPlacementCategory) && (detectedFaceShape || faceDetected) && (
              <Text style={styles.faceShapeHint}>
                {detectedFaceShape
                  ? `Face shape: ${FACE_SHAPE_LABEL[detectedFaceShape]}`
                  : 'Learning your face shape…'}
              </Text>
            )}
          </View>

          {FeatureFlags.ENABLE_FACE_MESH && renderFaceMesh()}

          {FeatureFlags.ENABLE_FACE_MESH && !faceDetected && !isDetecting && (
            <View style={styles.statusOverlay} pointerEvents="none">
              <Text style={styles.statusText}>Waiting for face detection...</Text>
            </View>
          )}

          {debugActive && (
            <View
              style={StyleSheet.absoluteFill}
              onStartShouldSetResponder={() => true}
              onResponderRelease={(e) =>
                handleDebugTap(e.nativeEvent.locationX, e.nativeEvent.locationY)
              }
            />
          )}

          {debugActive && debugTap && (
            <View style={styles.debugInfoChip} pointerEvents="none">
              <Text style={styles.debugInfoText}>
                {debugTap.hits.map((h) => `#${h.index} (${Math.round(h.dist)}px)`).join('   ')}
              </Text>
            </View>
          )}
        </View>

        {debugAvailable && (
          <TouchableOpacity
            style={[styles.debugToggle, debugLandmarksOn && styles.debugToggleOn]}
            onPress={() => {
              setDebugLandmarksOn((v) => !v);
              setDebugTap(null);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.debugToggleText}>468</Text>
          </TouchableOpacity>
        )}

        {isCategoryPickerMode && (
          <View style={styles.categoryChipBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipBarContent}
            >
              <TouchableOpacity
                style={styles.categoryCircleWrap}
                onPress={toggleAllCategories}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.categoryCircle,
                    { borderColor: ALL_CHIP_COLOR },
                    allCategoriesSelected && { backgroundColor: ALL_CHIP_COLOR },
                  ]}
                >
                  <Ionicons name="apps" size={22} color={allCategoriesSelected ? '#fff' : ALL_CHIP_COLOR} />
                </View>
                <Text style={styles.categoryCircleLabel}>All</Text>
              </TouchableOpacity>
              {PLACEMENT_CATEGORY_CHIPS.map((category) => {
                const isSelected = activeCategories.includes(category.key);
                return (
                  <TouchableOpacity
                    key={category.key}
                    style={styles.categoryCircleWrap}
                    onPress={() => toggleCategory(category.key)}
                    activeOpacity={0.85}
                  >
                    <View
                      style={[
                        styles.categoryCircle,
                        { borderColor: category.color },
                        isSelected && { backgroundColor: category.color },
                      ]}
                    >
                      <Ionicons
                        name={category.icon}
                        size={22}
                        color={isSelected ? category.selectedIconColor : category.color}
                      />
                    </View>
                    <Text style={styles.categoryCircleLabel}>{category.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

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
  debugToggle: {
    position: 'absolute',
    top: 56,
    right: 16,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 1,
    borderColor: '#00FF88',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  debugToggleOn: {
    backgroundColor: 'rgba(0,120,60,0.85)',
    borderStyle: 'solid',
  },
  debugToggleText: {
    color: '#00FF88',
    fontSize: 12,
    fontWeight: '700',
  },
  debugInfoChip: {
    position: 'absolute',
    bottom: 210,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  debugInfoText: {
    color: '#00FF88',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
  faceShapeHint: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    marginTop: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  categoryChipBar: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingVertical: 10,
  },
  categoryChipBarContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  categoryCircleWrap: {
    alignItems: 'center',
    width: 58,
  },
  categoryCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  categoryCircleLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
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
