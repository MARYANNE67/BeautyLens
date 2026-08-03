/**
 * Realistic, photo-based shade preview (Phase 7).
 *
 * Deliberately separate from the existing live AR try-on (camera.tsx +
 * meshOverlays.ts, reached via tryon.tsx) -- that flow is untouched. This
 * screen captures a single photo and sends it to POST /tryon/preview,
 * which blends the shade's real LAB color into the face region while
 * preserving the photo's own lighting/texture (see
 * src/api/tryon_render.py), instead of drawing a flat-opacity shape over
 * live video.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { SERIF } from '../components/ProfileFields';
import { AppConfig } from '../config/featureFlags';
import { previewShade } from '../services/api';

const PINK = '#C2185B';
const BG = '#F6F1F4';

const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;
const CAPTURE_QUALITY = 0.8;

type Step = 'capture' | 'processing' | 'result';

export default function ShadePreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shadeId, brand, shadeName } = useLocalSearchParams<{
    shadeId: string;
    brand?: string;
    shadeName?: string;
  }>();
  const shadeIdNum = Number(shadeId);

  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('capture');
  const [originalUri, setOriginalUri] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraRef = useRef<any>(null);

  const handleCapture = async () => {
    if (!cameraRef.current || !shadeIdNum) return;
    setError(null);
    setStep('processing');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: CAPTURE_QUALITY,
        base64: false,
        skipProcessing: true,
      });
      if (!photo?.uri) {
        setError('Failed to capture photo. Try again.');
        setStep('capture');
        return;
      }
      setOriginalUri(photo.uri);

      const result = await previewShade(API_BASE_URL, shadeIdNum, photo.uri);
      setPreviewImage(result.preview_image);
      setShowOriginal(false);
      setStep('result');
    } catch (e) {
      setError((e as Error).message || 'Could not generate preview. Try again.');
      setStep('capture');
    }
  };

  const retake = () => {
    setOriginalUri(null);
    setPreviewImage(null);
    setError(null);
    setStep('capture');
  };

  if (step === 'result' && previewImage && originalUri) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shade Preview</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.previewWrap}>
          <Image
            source={{ uri: showOriginal ? originalUri : previewImage }}
            style={styles.previewImage}
            resizeMode="cover"
          />
          <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowOriginal((v) => !v)} activeOpacity={0.85}>
            <Ionicons name="swap-horizontal" size={16} color="#fff" />
            <Text style={styles.toggleBtnText}>{showOriginal ? 'Show With Shade' : 'Show Original'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          {(brand || shadeName) && (
            <Text style={styles.shadeLabel}>
              {[brand, shadeName].filter(Boolean).join(', ')}
            </Text>
          )}
          <View style={styles.disclaimerBanner}>
            <Ionicons name="information-circle-outline" size={16} color="#7A5B00" />
            <Text style={styles.disclaimerText}>
              Visual approximation, not proof of shade accuracy. Confirm in natural light before
              buying.
            </Text>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={retake} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Retake Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneLink} onPress={() => router.back()}>
            <Text style={styles.doneLinkText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return (
      <View style={styles.cameraContainer}>
        <Text style={{ color: '#fff' }}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.cameraContainer}>
        <Text style={styles.errorText}>No access to camera</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.cameraScreen}>
      <StatusBar style="light" />
      <CameraView ref={cameraRef} style={styles.camera} facing="front" />

      <View style={styles.cameraOverlay} pointerEvents="box-none">
        <View style={styles.instructionBanner}>
          <Text style={styles.instructionTitle}>
            {[brand, shadeName].filter(Boolean).join(', ') || 'Shade Preview'}
          </Text>
          <Text style={styles.instructionSub}>Look straight at the camera in good lighting</Text>
        </View>

        {step === 'processing' && (
          <View style={styles.processingBanner}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.processingText}>Applying shade&#8230;</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#fff" />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}
      </View>

      <View style={[styles.controls, { paddingBottom: 20 + insets.bottom }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleCapture}
          disabled={step === 'processing'}
        >
          {step === 'processing' ? (
            <ActivityIndicator color={PINK} />
          ) : (
            <View style={styles.captureButtonInner} />
          )}
        </TouchableOpacity>

        <View style={{ minWidth: 80 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: SERIF, fontSize: 20, fontWeight: '700', color: '#1A1A1A' },

  previewWrap: { flex: 1, marginHorizontal: 16, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  previewImage: { width: '100%', height: '100%' },
  toggleBtn: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toggleBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  footer: { padding: 16 },
  shadeLabel: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', textAlign: 'center', marginBottom: 10 },
  disclaimerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF3D6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  disclaimerText: { flex: 1, fontSize: 13, color: '#7A5B00', lineHeight: 18 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PINK,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 10,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  doneLink: { alignItems: 'center' },
  doneLinkText: { fontSize: 14, fontWeight: '600', color: '#A0A0A0' },

  // Centred layout, used by the "requesting permission" / "no access" states.
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  /**
   * The live camera state needs the opposite layout. The camera and the overlay
   * are both absolutely positioned, so `controls` is the only child still in
   * flow -- under the centred style above it got parked in the middle of the
   * screen and shrink-wrapped by alignItems:'center'. Anchoring to flex-end
   * with the default stretch puts the shutter back at the bottom, full width.
   */
  cameraScreen: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-end',
  },
  camera: { flex: 1, ...StyleSheet.absoluteFillObject },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 60,
  },
  instructionBanner: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    maxWidth: '85%',
  },
  instructionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  instructionSub: { color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 2 },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    marginTop: 14,
  },
  processingText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(198,40,40,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 12,
    maxWidth: '85%',
  },
  errorBannerText: { color: '#fff', fontSize: 14, flexShrink: 1 },

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
  captureButtonInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: PINK },
  errorText: { fontSize: 18, color: '#F44336', textAlign: 'center', marginBottom: 10 },
  permissionButton: {
    marginTop: 8,
    padding: 15,
    backgroundColor: PINK,
    borderRadius: 25,
    alignItems: 'center',
  },
  permissionButtonText: { color: '#fff', fontWeight: 'bold' },
});
