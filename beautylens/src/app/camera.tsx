/**
 * Face Camera Screen with AR Makeup Overlay
 *
 * Two rendering paths are supported, toggled by FeatureFlags.ENABLE_OPENMAKEUP_SDK:
 *
 *  A) OpenMakeupSDK path (new — realistic 3D makeup)
 *     Embeds a WebView that runs OpenMakeupSDK — MediaPipe FaceMesh + Three.js
 *     WebGL shaders with matte / shimmer / glossy / glitter material finishes.
 *     The SDK accesses the camera itself inside the WebView.
 *     See: src/components/ARMakeupWebView.tsx
 *
 *  B) Legacy path (Python API → SVG polygon overlay)
 *     Captures a photo every 500 ms, sends it to the Python backend, gets back
 *     468-landmark face-mesh data, and draws flat SVG polygons per product.
 *     Kept as a reliable offline fallback.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Image,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
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

// ── OpenMakeupSDK WebView (path A) ───────────────────────────────────────────
import ARMakeupWebView, {
  resolveLayer,
  type ARMakeupWebViewRef,
  type MakeupLayer,
  type ColorExtractResult,
} from '../components/ARMakeupWebView';

const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;
const FACE_DETECTION_INTERVAL = 500;
const FACE_CAPTURE_QUALITY = 0.45;

// ─────────────────────────────────────────────────────────────────────────────
//  Path A — OpenMakeupSDK screen (realistic 3D AR via WebView)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a shade name (or direct hex string) to a #rrggbb hex colour.
 * Tries in order: (1) literal hex, (2) keyword matching against a makeup
 * colour vocabulary.  Returns null if nothing matches.
 */
function shadeToHex(shade: string | undefined): string | null {
  if (!shade) return null;

  // 1 — literal hex embedded anywhere in the string
  const m = shade.match(/#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/);
  if (m) {
    const h = m[1];
    return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h);
  }

  const s = shade.toLowerCase();

  // 2 — keyword → hex (common makeup shade vocabulary)
  const MAP: [string[], string][] = [
    // Reds
    [['red','scarlet','ruby','cherry','crimson','fire','flame','lava','bordeaux','cardinal'],'#C62828'],
    // Vivid pinks
    [['hot pink','fuchsia','magenta','punch','shock','electric pink'],'#E91E8C'],
    // Soft pinks
    [['pink','rose','rosé','petal','ballet','blush pink','bubblegum','candy','watermelon'],'#E8628A'],
    // Corals & peaches
    [['coral','peach','apricot','melon','cantaloupe','tangerine','papaya'],'#FF7043'],
    // Berries / plums
    [['berry','plum','blackberry','mulberry','boysenberry','fig','currant','raisin'],'#7B2D48'],
    // Wines / burgundies
    [['wine','burgundy','merlot','cabernet','maroon','oxblood','sangria'],'#722F37'],
    // Mauves
    [['mauve','dusty rose','antique rose','smoky rose','rosewood'],'#A05070'],
    // Purples
    [['purple','violet','amethyst','orchid','grape','lavender','lilac','wisteria'],'#7B1FA2'],
    // Nudes / neutrals
    [['nude','naked','natural','bare','barely there','skin','flesh','porcelain'],'#C8956C'],
    [['beige','sand','wheat','bisque','champagne','linen','ivory'],'#D4A574'],
    // Browns & taupes
    [['brown','chocolate','espresso','mocha','coffee','cocoa','java'],'#795548'],
    [['taupe','mushroom','khaki','stone','greige','warm nude'],'#A0887C'],
    // Terracotta / bronze
    [['bronze','copper','terra','terracotta','sienna','rust','brick'],'#A0522D'],
    [['caramel','honey','toffee','amber','butterscotch','golden'],'#C68642'],
    // Darks / smoky
    [['black','onyx','jet','midnight','dark','smoky','charcoal','graphite','coal'],'#1A1A1A'],
    // Oranges
    [['orange','pumpkin','paprika'],'#E64A19'],
    // Golds / metallics
    [['gold','shimmer','glitter','metallic','mirror'],'#F0C040'],
  ];

  for (const [keywords, hex] of MAP) {
    if (keywords.some((kw) => s.includes(kw))) return hex;
  }
  return null;
}

/** All toggleable makeup categories shown in the bottom palette */
const PALETTE_ITEMS: { category: string; label: string; color: string }[] = [
  { category: 'lipstick',   label: '💋 Lip',       color: '#C2185B' },
  { category: 'eyeshadow',  label: '👁 Shadow',     color: '#7B1FA2' },
  { category: 'eyeliner',   label: '✏ Liner',      color: '#1A237E' },
  { category: 'mascara',    label: '✦ Mascara',    color: '#37474F' },
  { category: 'blush',      label: '🌸 Blush',     color: '#C2185B' },
  { category: 'foundation', label: '✨ Base',       color: '#A1887F' },
];

function OpenMakeupScreen() {
  const router = useRouter();
  const { productType, productTypes, productImageUrl, productImageUrls, shade, brand, resolvedColor } =
    useLocalSearchParams<{
      productType?: string;
      productTypes?: string;
      productImageUrl?: string;
      productImageUrls?: string;  // JSON array of image URLs, one per product
      shade?: string;             // shade name e.g. "Ruby Red", "Coral Kiss"
      brand?: string;
      resolvedColor?: string;     // hex confirmed by user on the tryon screen — wins over everything
    }>();

  // ── 1. Stable list of product type strings ─────────────────────────────────
  const productTypeList = React.useMemo(() => {
    const types: string[] = [];
    if (productTypes) {
      try {
        const parsed = JSON.parse(productTypes);
        if (Array.isArray(parsed)) parsed.forEach((t) => typeof t === 'string' && types.push(t));
      } catch { /* ignore */ }
    }
    if (types.length === 0 && productType) types.push(productType);
    return types;
  }, [productType, productTypes]);

  // ── 2. colorMap: category → hex colour extracted from the product image ─────
  //    Falls back to resolveLayer() defaults until extraction completes.
  const [colorMap, setColorMap] = useState<Record<string, string>>({});

  // ── 3. Layers: merge base defaults with any extracted colours ───────────────
  const layers: MakeupLayer[] = React.useMemo(
    () =>
      productTypeList
        .map((t) => {
          const base = resolveLayer(t);
          if (!base) return null;
          return { ...base, color: colorMap[base.category] ?? base.color };
        })
        .filter((l): l is MakeupLayer => l !== null),
    [productTypeList, colorMap]
  );

  const webViewRef = useRef<ARMakeupWebViewRef>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Tracks which categories are currently toggled on in the palette
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    () => new Set(productTypeList.map((t) => resolveLayer(t)?.category).filter(Boolean) as string[])
  );

  // ── 4a. User-confirmed colour from the tryon shade picker (highest priority) ──
  //  resolvedColor is the hex the user explicitly chose on the tryon screen.
  //  It wins over both shade-name parsing AND image extraction.
  const shadeDerivedRef = useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!resolvedColor || productTypeList.length === 0) return;
    const primary = resolveLayer(productTypeList[0]);
    if (primary) {
      shadeDerivedRef.current.add(primary.category);
      setColorMap((prev) => ({ ...prev, [primary.category]: resolvedColor }));
    }
  }, [resolvedColor, productTypeList]);

  // ── 4b. Fallback: resolve shade name → hex if no resolvedColor ─────────────
  React.useEffect(() => {
    if (resolvedColor) return; // already handled above
    const hex = shadeToHex(shade);
    if (!hex || productTypeList.length === 0) return;
    const updates: Record<string, string> = {};
    const primary = resolveLayer(productTypeList[0]);
    if (primary) {
      updates[primary.category] = hex;
      shadeDerivedRef.current.add(primary.category); // protect from image override
    }
    if (Object.keys(updates).length > 0) {
      setColorMap((prev) => ({ ...prev, ...updates }));
    }
  }, [shade, productTypeList]);

  // ── 4. Ref to always-current activeCategories (avoids stale closure in callbacks)
  const activeCategoriesRef = useRef(activeCategories);
  activeCategoriesRef.current = activeCategories;

  // ── 5. Called when AR is ready — fetch images from RN side then extract colour
  //
  // Why fetch here rather than in the WebView?
  // The WebView's origin is cdn.jsdelivr.net, so any image from a different host
  // (your API, S3, etc.) is blocked by CORS when canvas.getImageData() is called.
  // React Native's fetch() has no CORS restriction, so we download each image,
  // encode it as a base64 data: URL, and hand *that* to the WebView canvas —
  // data: URLs are same-origin and never blocked.
  const handleReady = useCallback(() => {
    setSdkReady(true);

    // If the user already confirmed a shade on the tryon screen, skip image
    // extraction entirely — it would only risk overwriting the correct colour
    // with whatever the product packaging happens to look like.
    if (resolvedColor) return;

    const imageUrls: string[] = [];
    if (productImageUrls) {
      try {
        const parsed = JSON.parse(productImageUrls);
        if (Array.isArray(parsed)) imageUrls.push(...parsed.filter((u): u is string => typeof u === 'string'));
      } catch { /* ignore */ }
    }
    if (imageUrls.length === 0 && productImageUrl) imageUrls.push(productImageUrl);
    if (imageUrls.length === 0) return;

    (async () => {
      const items: { category: string; url: string }[] = [];

      await Promise.all(
        imageUrls.map(async (url, i) => {
          const type = productTypeList[i] ?? productTypeList[0];
          const base = type ? resolveLayer(type) : null;
          if (!base) return;

          let dataUrl = url; // fallback — canvas sampling will likely fail due to CORS
          try {
            const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
            const localPath = cacheDir + 'color_extract_' + i + '.jpg';
            const dl = await FileSystem.downloadAsync(url, localPath);
            if (dl.status === 200) {
              const b64 = await FileSystem.readAsStringAsync(localPath, { encoding: 'base64' });
              dataUrl = 'data:image/jpeg;base64,' + b64;
            }
          } catch (e) {
            console.warn('[ColorExtract] download failed, using raw URL:', e);
          }

          items.push({ category: base.category, url: dataUrl });
        })
      );

      if (items.length > 0) {
        webViewRef.current?.extractColors(items);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productImageUrl, productImageUrls, productTypeList, resolvedColor]);

  // ── 6. Receive extracted colours from the WebView ───────────────────────────
  const handleColorsExtracted = useCallback((results: ColorExtractResult[]) => {
    const updates: Record<string, string> = {};
    results.forEach(({ category, color }) => {
      // Never let image extraction overwrite a shade-name-derived colour.
      // Product packaging images are often a different colour from the actual
      // shade (e.g. a pink-labelled bottle has dark branding on it), so the
      // shade name text is always the more reliable signal.
      if (color && !shadeDerivedRef.current.has(category)) {
        updates[category] = color;
      }
    });
    if (Object.keys(updates).length === 0) return;

    setColorMap((prev) => ({ ...prev, ...updates }));

    // Re-apply only layers that are currently toggled on
    Object.entries(updates).forEach(([category, color]) => {
      if (activeCategoriesRef.current.has(category)) {
        const base = resolveLayer(category);
        if (base) webViewRef.current?.apply({ ...base, color });
      }
    });
  }, []);

  const toggleLayer = useCallback(
    (category: string) => {
      setActiveCategories((prev) => {
        const next = new Set(prev);
        if (next.has(category)) {
          next.delete(category);
          webViewRef.current?.clear(category);
        } else {
          next.add(category);
          const base = resolveLayer(category);
          if (base) {
            // Use extracted colour if available, otherwise keep default
            const color = colorMap[category] ?? base.color;
            webViewRef.current?.apply({ ...base, color });
          }
        }
        return next;
      });
    },
    [colorMap]
  );

  const handleCapture = useCallback(() => {
    webViewRef.current?.capture();
  }, []);

  const handleCaptured = useCallback((base64DataUrl: string) => {
    setCapturedImage(base64DataUrl);
  }, []);

  const handleSave = useCallback(async () => {
    if (!capturedImage || isSaving) return;
    setIsSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Linking.openSettings(); return; }

      // base64 data URL → temp file via expo-file-system
      const base64 = capturedImage.replace(/^data:image\/\w+;base64,/, '');
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
      const fileUri = dir + `beautylens_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: 'base64',
      });
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      await MediaLibrary.createAlbumAsync('BeautyLens', asset, false);
      Alert.alert('Saved! 💄', 'Look saved to your BeautyLens album.');
    } catch (err) {
      console.error('[OpenMakeupScreen] Save error:', err);
      Alert.alert('Error', 'Could not save the photo. Try again.');
    } finally {
      setIsSaving(false);
    }
  }, [capturedImage, isSaving]);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
  }, []);

  // ── Snapshot review ───────────────────────────────────────────────────────
  if (capturedImage) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Image
          source={{ uri: capturedImage }}
          style={{ flex: 1, width: '100%' }}
          resizeMode="cover"
        />
        <View style={styles.controls}>
          <TouchableOpacity style={styles.backButton} onPress={handleRetake}>
            <Text style={styles.backButtonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.captureButton, { backgroundColor: '#C2185B' }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
              {isSaving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsButton} onPress={() => router.back()}>
            <Text style={styles.settingsButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Live AR view ──────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* The WebView fills the screen and handles camera + AR rendering */}
      <ARMakeupWebView
        ref={webViewRef}
        layers={layers}
        onReady={handleReady}
        onCaptured={handleCaptured}
        onColorsExtracted={handleColorsExtracted}
        onError={(msg) => console.warn('[OpenMakeupSDK]', msg)}
        style={StyleSheet.absoluteFill}
      />

      {/* Top overlay: product label */}
      <View style={styles.productInfoOverlay} pointerEvents="none">
        <Text style={styles.productName} numberOfLines={1}>
          {activeCategories.size > 0
            ? activeCategories.size === 1
              ? [...activeCategories][0].charAt(0).toUpperCase() + [...activeCategories][0].slice(1)
              : `${activeCategories.size} product look`
            : 'Virtual Try-On'}
        </Text>
        <Text style={styles.instructionText}>
          {sdkReady ? 'Look natural — AR is live' : 'Loading AR engine…'}
        </Text>
      </View>

      {/* Bottom: palette chips + action controls — absolutely pinned to bottom */}
      <View style={styles.openMakeupBottom}>
        {/* Horizontally scrollable makeup category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.palette}
        >
          {PALETTE_ITEMS.map((item) => {
            const active = activeCategories.has(item.category);
            return (
              <TouchableOpacity
                key={item.category}
                style={[styles.chip, active && { backgroundColor: item.color, borderColor: item.color }]}
                onPress={() => toggleLayer(item.category)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Back / Capture controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.captureButton, !sdkReady && { opacity: 0.4 }]}
            onPress={handleCapture}
            disabled={!sdkReady}
          >
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
          <View style={{ width: 80 }} />
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Entry-point — routes to the correct path based on feature flag
// ─────────────────────────────────────────────────────────────────────────────

export default function FaceCameraScreen() {
  // Feature flag gate: use OpenMakeupSDK WebView or legacy SVG overlay
  if (FeatureFlags.ENABLE_OPENMAKEUP_SDK) {
    return <OpenMakeupScreen />;
  }
  return <LegacyCameraScreen />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Path B — Legacy camera screen (Python API + SVG polygon overlay)
// ─────────────────────────────────────────────────────────────────────────────

function LegacyCameraScreen() {
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
  const smoothedLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);
  const SMOOTHING_FACTOR = 0.35; // lower = smoother but more lag, higher = snappier but shakier



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
          const imgDims = result.image_dimensions || { width: photo.width, height: photo.height };
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
  /** Absolutely positioned wrapper pinning palette + controls to the bottom of the AR view */
  openMakeupBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  /** Horizontal chip row sitting just above the controls bar */
  palette: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
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
