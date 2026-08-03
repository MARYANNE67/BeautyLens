/**
 * Guided skin-scan capture (Phases 2-3 of the shade-matching flow).
 *
 * Captures 3 angles (front/left/right) of the user's face, quality-gating
 * each frame against src/api/skin_analysis.py's assess_capture_quality
 * before accepting it, per the spec's "check lighting before analyzing"
 * requirement. Once all 3 are accepted, they're sent to
 * POST /skin-scan/analyze for skin depth estimation. Undertone analysis of
 * the result is added in a later phase.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { SERIF } from '../../components/ProfileFields';
import { AppConfig } from '../../config/featureFlags';
import { checkCaptureQuality, analyzeSkinScan } from '../../services/api';
import { getLocalProfileId } from '../../utils/profileStorage';
import type { SkinScanAngle, SkinScanAnalysis } from '../../types';

const PINK = '#C2185B';
const PINK_LIGHT = '#FDE8F0';
const BG = '#F6F1F4';

const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;
// Higher than the 0.45 used for live try-on preview frames -- these captures
// feed skin-color analysis later, so we keep more detail.
const CAPTURE_QUALITY = 0.7;

type Step = 'guide' | 'capturing' | 'complete';

const ANGLES: { key: SkinScanAngle; label: string; instruction: string }[] = [
  { key: 'front', label: 'Front', instruction: 'Look straight at the camera' },
  { key: 'left', label: 'Left', instruction: 'Turn your head slightly to the left' },
  { key: 'right', label: 'Right', instruction: 'Turn your head slightly to the right' },
];

// Illustration per angle, keyed so it can't drift out of step with ANGLES.
const ANGLE_ART: Record<SkinScanAngle, ImageSourcePropType> = {
  front: require('../../../assets/images/scan-face-images/front.png'),
  left: require('../../../assets/images/scan-face-images/left.png'),
  right: require('../../../assets/images/scan-face-images/right.png'),
};

const GUIDE_TIPS: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'sunny-outline', text: 'Face a window or use neutral white lighting' },
  { icon: 'happy-outline', text: 'Remove strong makeup if possible' },
  { icon: 'scan-outline', text: 'Keep your face inside the frame for all 3 photos' },
];

function formatDepthCategory(category: string): string {
  return category
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Plain-language meaning of each depth band, phrased around the shade names a
 * user will actually see on a product. "Medium Deep" on its own tells someone
 * nothing they can act on; knowing it maps to tan/caramel/amber labels does.
 *
 * Depth is how light or deep the skin is. It is a separate axis from undertone
 * (warm/cool/neutral/olive), which is why the copy avoids colour words here.
 */
const DEPTH_DESCRIPTIONS: Record<string, string> = {
  fair: 'The lightest range. Usually labelled fair, porcelain or ivory on a shade chart.',
  light: 'A light range. Usually labelled light, ivory or beige.',
  'light-medium': 'Between light and medium. Usually labelled light-medium, sand or nude.',
  medium: 'A mid range. Usually labelled medium, natural or golden beige.',
  'medium-deep': 'Between medium and deep. Usually labelled tan, caramel or amber.',
  deep: 'A deep range. Usually labelled deep, chestnut or mocha.',
  'rich-deep': 'The deepest range. Usually labelled rich, espresso or ebony.',
};

export default function SkinScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('guide');
  const [angleIndex, setAngleIndex] = useState(0);
  const [capturedUris, setCapturedUris] = useState<Partial<Record<SkinScanAngle, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const [profileId, setProfileId] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<SkinScanAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const cameraRef = useRef<any>(null);
  const currentAngle = ANGLES[angleIndex];

  useEffect(() => {
    getLocalProfileId().then(setProfileId);
  }, []);

  const runAnalysis = useCallback(async () => {
    const { front, left, right } = capturedUris;
    if (!front || !left || !right || profileId == null) return;

    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await analyzeSkinScan(API_BASE_URL, profileId, { front, left, right });
      setAnalysisResult(result);
    } catch (e) {
      setAnalysisError((e as Error).message || 'Could not analyze your photos. Try again.');
    } finally {
      setAnalyzing(false);
    }
  }, [capturedUris, profileId]);

  useEffect(() => {
    if (step === 'complete' && profileId != null && !analysisResult && !analyzing && !analysisError) {
      runAnalysis();
    }
  }, [step, profileId, analysisResult, analyzing, analysisError, runAnalysis]);

  const handleCapture = async () => {
    if (!cameraRef.current || submitting) return;
    setSubmitting(true);
    setLastError(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: CAPTURE_QUALITY,
        base64: false,
        skipProcessing: true,
      });

      if (!photo?.uri) {
        setLastError('Failed to capture photo. Try again.');
        return;
      }

      const result = await checkCaptureQuality(API_BASE_URL, photo.uri);

      if (!result.passed) {
        setLastError(result.message);
        return;
      }

      setCapturedUris((prev) => ({ ...prev, [currentAngle.key]: photo.uri }));

      if (angleIndex + 1 < ANGLES.length) {
        setAngleIndex((i) => i + 1);
      } else {
        setStep('complete');
      }
    } catch (e) {
      setLastError((e as Error).message || 'Could not check photo quality. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'guide') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Skin Scan</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.durationPill}>
            <Ionicons name="time-outline" size={14} color={PINK} />
            <Text style={styles.durationText}>Takes less than 1 minute</Text>
          </View>

          <View style={styles.introCard}>
            <Image
              source={require('../../../assets/images/scan-face-images/main.png')}
              style={styles.introArt}
              resizeMode="contain"
            />
            <Text style={styles.introTitle}>3 quick photos</Text>
            <Text style={styles.introText}>
              We&apos;ll guide you through front, left, and right angles. Each photo is
              checked for lighting and framing before it&apos;s accepted.
            </Text>

            <View style={styles.angleRow}>
              {ANGLES.map((angle, i) => (
                <React.Fragment key={angle.key}>
                  <View style={styles.angleItem}>
                    <Image
                      source={ANGLE_ART[angle.key]}
                      style={styles.angleArt}
                      resizeMode="contain"
                    />
                    <View style={styles.angleLabelPill}>
                      <Text style={styles.angleLabelText}>{angle.label}</Text>
                    </View>
                  </View>

                  {/* Step connector between thumbnails, not after the last one. */}
                  {i < ANGLES.length - 1 && (
                    <View style={styles.connector}>
                      <View style={styles.connectorDots} />
                      <View style={styles.connectorNum}>
                        <Text style={styles.connectorNumText}>{i + 1}</Text>
                      </View>
                      <View style={styles.connectorDots} />
                    </View>
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            {GUIDE_TIPS.map((tip, i) => (
              <View
                key={tip.text}
                style={[styles.tipRow, i < GUIDE_TIPS.length - 1 && styles.tipRowDivider]}
              >
                <View style={styles.tipIcon}>
                  <Ionicons name={tip.icon} size={18} color={PINK} />
                </View>
                <Text style={styles.tipText}>{tip.text}</Text>
              </View>
            ))}
          </View>

          <View style={styles.privacyRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={PINK} />
            <Text style={styles.privacyText}>Private and used only for your shade match</Text>
          </View>

          {!permission?.granted && (
            <Text style={styles.permissionHint}>
              You&apos;ll be asked for camera permission on the next step.
            </Text>
          )}

          <TouchableOpacity
            style={styles.startBtn}
            activeOpacity={0.85}
            onPress={async () => {
              if (!permission?.granted) {
                const res = await requestPermission();
                if (!res.granted) return;
              }
              setStep('capturing');
            }}
          >
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={styles.startBtnText}>Start Scan</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.laterLink} onPress={() => router.back()}>
            <Text style={styles.laterLinkText}>Maybe later</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'complete') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>Skin Scan</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* The photos are the content of this screen, so they lead. The
              previous layout buried them under a full-width success card with a
              72px tick, which is the generic pattern this replaces. */}
          <View style={styles.reviewHeader}>
            <View style={styles.reviewBadge}>
              <Ionicons name="checkmark" size={13} color="#FFFFFF" />
              <Text style={styles.reviewBadgeText}>3 of 3</Text>
            </View>
            <Text style={styles.reviewTitle}>All photos captured</Text>
            <Text style={styles.reviewSubtitle}>
              {profileId == null
                ? 'Save your beauty profile first so we know where to attach this scan.'
                : "Next, we'll estimate your skin depth and undertone."}
            </Text>
          </View>

          <View style={styles.thumbRow}>
            {ANGLES.map((a) => (
              <View key={a.key} style={styles.thumbWrap}>
                <View style={styles.thumbFrame}>
                  {capturedUris[a.key] ? (
                    <Image source={{ uri: capturedUris[a.key] }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Ionicons name="image-outline" size={20} color="#C9BCC3" />
                    </View>
                  )}
                  {/* Label sits on the image rather than below it: keeps the row
                      compact and stops three grey captions competing with the
                      photos for attention. */}
                  <View style={styles.thumbLabelChip}>
                    <Text style={styles.thumbLabelText}>{a.label}</Text>
                  </View>
                  <View style={styles.thumbCheck}>
                    <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                  </View>
                </View>
              </View>
            ))}
          </View>

          {profileId == null && (
            <TouchableOpacity
              style={styles.startBtn}
              activeOpacity={0.85}
              onPress={() => router.replace('/account')}
            >
              <Text style={styles.startBtnText}>Go to Beauty Profile</Text>
            </TouchableOpacity>
          )}

          {analyzing && (
            <View style={styles.resultCard}>
              <ActivityIndicator color={PINK} />
              <Text style={styles.resultLoadingText}>Estimating your skin depth&#8230;</Text>
            </View>
          )}

          {analysisError && !analyzing && (
            <View style={styles.resultCard}>
              <Text style={styles.errorText}>{analysisError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={runAnalysis} activeOpacity={0.8}>
                <Text style={styles.retryBtnText}>Retry Analysis</Text>
              </TouchableOpacity>
            </View>
          )}

          {analysisResult && !analyzing && (
            <View style={styles.depthCard}>
              <Text style={styles.depthLabel}>ESTIMATED SKIN DEPTH</Text>
              <Text style={styles.depthValue}>
                {formatDepthCategory(analysisResult.depth_category)}
              </Text>
              <View style={styles.depthDivider} />
              <Text style={styles.depthDescription}>
                {DEPTH_DESCRIPTIONS[analysisResult.depth_category] ??
                  'How light or deep your skin is. Undertone is estimated separately, next.'}
              </Text>
              {analysisResult.images_skipped.length > 0 && (
                <View style={styles.depthWarnRow}>
                  <Ionicons name="alert-circle-outline" size={14} color="#B26A00" />
                  <Text style={styles.depthWarnText}>
                    No face found in {analysisResult.images_skipped.join(', ')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {analysisResult ? (
            <>
              <TouchableOpacity
                style={styles.startBtn}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/undertone-confirm',
                    params: { scanId: String(analysisResult.scan_id) },
                  })
                }
              >
                <Text style={styles.startBtnText}>Continue to Undertone</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.retakeLink} onPress={() => router.back()}>
                <Text style={styles.retakeLinkText}>Not now</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.startBtn}
              activeOpacity={0.85}
              onPress={() => router.back()}
            >
              <Text style={styles.startBtnText}>Done</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // step === 'capturing'
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
      {/* Set here rather than relying on the `name="skin-scan/index"` entry in
          _layout.tsx: that name-based match doesn't take for this nested index
          route, which left the parent stack drawing a pink "skin-scan/index"
          header over the camera. Declaring options from inside the screen is
          name-independent. */}
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <CameraView ref={cameraRef} style={styles.camera} facing="front" />

      <View style={styles.cameraOverlay} pointerEvents="box-none">
        <View style={styles.progressRow}>
          {ANGLES.map((a, i) => (
            <View
              key={a.key}
              style={[
                styles.progressDot,
                i < angleIndex && styles.progressDotDone,
                i === angleIndex && styles.progressDotActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.instructionBanner}>
          <Text style={styles.instructionTitle}>{currentAngle.label}</Text>
          <Text style={styles.instructionSub}>{currentAngle.instruction}</Text>
        </View>

        {lastError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#fff" />
            <Text style={styles.errorBannerText}>{lastError}</Text>
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
          disabled={submitting}
        >
          {submitting ? (
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
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: PINK_LIGHT,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 50,
    marginBottom: 16,
  },
  durationText: { fontSize: 13, fontWeight: '600', color: PINK },

  introCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  introArt: { width: 168, height: 168, marginBottom: 6 },
  introTitle: {
    fontFamily: SERIF,
    fontSize: 27,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  introText: { fontSize: 14.5, color: '#666', textAlign: 'center', lineHeight: 21 },

  /* Front / Left / Right walkthrough */
  angleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  angleItem: { alignItems: 'center' },
  angleArt: { width: 76, height: 76, marginBottom: 8 },
  angleLabelPill: {
    backgroundColor: PINK_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 50,
  },
  angleLabelText: { fontSize: 12.5, fontWeight: '700', color: '#1A1A1A' },
  connector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    // Lifted so the dots line up with the artwork, not the labels below it.
    marginBottom: 30,
    paddingHorizontal: 4,
  },
  connectorDots: { width: 12, height: 1.5, backgroundColor: '#F3C3D8' },
  connectorNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PINK_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectorNumText: { fontSize: 11.5, fontWeight: '700', color: PINK },

  section: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  tipRowDivider: { borderBottomWidth: 1, borderBottomColor: '#F4EAEE' },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PINK_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipText: { flex: 1, fontSize: 14, color: '#4A4247', lineHeight: 20 },

  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 16,
  },
  privacyText: { fontSize: 13, color: '#8A8A8A' },

  permissionHint: { fontSize: 13, color: '#A0A0A0', textAlign: 'center', marginBottom: 12 },

  laterLink: { alignItems: 'center', marginTop: 16, paddingVertical: 6 },
  laterLinkText: { fontSize: 14.5, fontWeight: '700', color: PINK },

  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: PINK,
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: PINK,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  reviewHeader: { alignItems: 'center', paddingTop: 8, paddingBottom: 22 },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2E7D32',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  reviewBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  reviewTitle: {
    fontFamily: SERIF,
    fontSize: 25,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
    textAlign: 'center',
  },
  reviewSubtitle: {
    fontSize: 14.5,
    color: '#7C6F75',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 12,
  },

  thumbRow: { flexDirection: 'row', gap: 10, marginBottom: 26 },
  thumbWrap: { flex: 1 },
  thumbFrame: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#EFE7EB',
    borderWidth: 1,
    borderColor: 'rgba(194,24,91,0.10)',
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 9,
    elevation: 3,
  },
  thumb: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#EFE7EB' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbLabelChip: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 999,
    // Dark scrim rather than a tinted pill: the label has to stay legible over
    // an unknown photo, and any brand colour here fights the skin tones behind it.
    backgroundColor: 'rgba(20,12,16,0.62)',
  },
  thumbLabelText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 },
  thumbCheck: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
  },

  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  resultLoadingText: { marginTop: 10, fontSize: 14, color: '#666' },

  // The result gets a tinted, accented card so it reads as the outcome of the
  // screen rather than as one more white block in the stack.
  depthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(194,24,91,0.14)',
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  depthLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#A899A1',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  depthValue: {
    fontFamily: SERIF,
    fontSize: 30,
    fontWeight: '700',
    color: PINK,
    textAlign: 'center',
  },
  depthDivider: {
    width: 34,
    height: 2,
    borderRadius: 1,
    backgroundColor: PINK_LIGHT,
    marginVertical: 14,
  },
  depthDescription: {
    fontSize: 13.5,
    color: '#7C6F75',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  depthWarnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  depthWarnText: { fontSize: 12.5, color: '#B26A00', fontWeight: '600' },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: PINK_LIGHT,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: PINK },
  retakeLink: { alignItems: 'center', marginTop: 12 },
  retakeLinkText: { fontSize: 14, fontWeight: '600', color: '#A0A0A0' },

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
  progressRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  progressDotDone: { backgroundColor: '#4CAF50' },
  progressDotActive: { backgroundColor: PINK },
  instructionBanner: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  instructionTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  instructionSub: { color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 2 },
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
