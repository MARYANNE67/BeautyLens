/**
 * Face Shape Tutorial — real-time placement guidance for technique-driven
 * categories (contour, concealer, highlighter, blush, bronzer), powered by
 * TutorialWebView's client-side face tracking. Standalone entry point from
 * Home, not tied to a scanned product or a completed skin scan.
 */
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Image, Alert, PanResponder } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Linking from 'expo-linking';

import TutorialWebView, {
  CATEGORY_COLOR,
  type TutorialWebViewRef,
  type TutorialLabelItem,
  type PlacementCategory,
  type FaceShape,
} from '../components/TutorialWebView';

// Same mixed Ionicons/MaterialCommunityIcons approach as the AR try-on
// palette (camera.tsx's PALETTE_ITEMS) -- picking a literal icon per
// category (a brush for contour, a shimmer for highlighter) rather than a
// generic stand-in, reusing 'flower'/'sunny' where AR try-on and the old
// tryon.tsx product config already established those as this app's blush/
// bronzer icons.
type CategoryItem =
  | { category: PlacementCategory; label: string; iconFamily: 'mci';      icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }
  | { category: PlacementCategory; label: string; iconFamily: 'ionicons'; icon: React.ComponentProps<typeof Ionicons>['name'] };

const CATEGORY_ITEMS: CategoryItem[] = [
  { category: 'contour',     label: 'Contour',     iconFamily: 'mci',      icon: 'brush' },
  { category: 'concealer',   label: 'Concealer',   iconFamily: 'ionicons', icon: 'water' },
  { category: 'highlighter', label: 'Highlight',   iconFamily: 'mci',      icon: 'shimmer' },
  { category: 'blush',       label: 'Blush',       iconFamily: 'ionicons', icon: 'flower' },
  { category: 'bronzer',     label: 'Bronzer',     iconFamily: 'ionicons', icon: 'sunny' },
];

const FACE_SHAPE_LABEL: Record<FaceShape, string> = {
  oval: 'Oval',
  round: 'Round',
  square: 'Square',
  heart: 'Heart',
  long: 'Long',
};

const INITIAL_CATEGORIES: PlacementCategory[] = [];

export default function TutorialScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<TutorialWebViewRef>(null);

  const [activeCategories, setActiveCategories] = useState<Set<PlacementCategory>>(
    () => new Set(INITIAL_CATEGORIES)
  );
  const [sdkReady, setSdkReady] = useState(false);
  const [labels, setLabels] = useState<TutorialLabelItem[]>([]);
  const [faceShape, setFaceShape] = useState<FaceShape | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  // Swipe-down-to-dismiss on the instruction panel. Picking a new category
  // brings it back (there's new guidance worth reading), so this is a "get
  // it out of the way for a moment" gesture, not a permanent opt-out.
  const dismissPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => gesture.dy > 6 && Math.abs(gesture.dx) < Math.abs(gesture.dy),
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > 24) setShowInstructions(false);
      },
    })
  ).current;

  // Tapping an already-active category turns its overlay off; tapping an
  // inactive one turns it on. Several can be layered on at once.
  const handleToggleCategory = useCallback((category: PlacementCategory) => {
    setShowInstructions(true);
    setActiveCategories((prev) => {
      const next = new Set(prev);
      const willBeActive = !next.has(category);
      if (willBeActive) next.add(category);
      else next.delete(category);
      webViewRef.current?.setCategory(category, willBeActive);
      return next;
    });
  }, []);

  const handleCapture = useCallback(() => {
    webViewRef.current?.capture();
  }, []);

  const handleCaptured = useCallback((base64DataUrl: string) => {
    setCapturedImage(base64DataUrl);
  }, []);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
  }, []);

  // Mirrors camera.tsx's handleSave -- same base64 -> temp file -> MediaLibrary
  // asset -> BeautyLens album flow, using expo-file-system/legacy (the plain
  // 'expo-file-system' entry point's writeAsStringAsync/cacheDirectory throw
  // in SDK 54's rewritten API).
  const handleSave = useCallback(async () => {
    if (!capturedImage || isSaving) return;
    setIsSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Linking.openSettings(); return; }

      const base64 = capturedImage.replace(/^data:image\/\w+;base64,/, '');
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
      const fileUri = dir + `beautylens_tutorial_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      await MediaLibrary.createAlbumAsync('BeautyLens', asset, false);
      Alert.alert('Saved!', 'Photo saved to your BeautyLens album.');
    } catch (err) {
      console.error('[TutorialScreen] Save error:', err);
      Alert.alert('Error', 'Could not save the photo. Try again.');
    } finally {
      setIsSaving(false);
    }
  }, [capturedImage, isSaving]);

  if (capturedImage) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Image source={{ uri: capturedImage }} style={{ flex: 1, width: '100%' }} resizeMode="cover" />
        <View style={styles.reviewControls}>
          <TouchableOpacity style={styles.reviewBtn} onPress={handleRetake}>
            <Text style={styles.reviewBtnText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.captureButton, { backgroundColor: '#C2185B' }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.saveBtnText}>{isSaving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reviewBtn} onPress={() => router.back()}>
            <Text style={styles.reviewBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <TutorialWebView
        ref={webViewRef}
        initialCategories={INITIAL_CATEGORIES}
        onReady={() => setSdkReady(true)}
        onLabels={setLabels}
        onShapeLocked={(shape) => setFaceShape(shape)}
        onCaptured={handleCaptured}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.overlay} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Makeup Placement Tutorial</Text>
            {faceShape && <Text style={styles.headerSubtitle}>{FACE_SHAPE_LABEL[faceShape]} face shape</Text>}
          </View>
          <View style={{ width: 38 }} />
        </View>

        <View style={styles.spacer} />

        {showInstructions && (
        <View style={styles.instructionWrap} {...dismissPanResponder.panHandlers}>
          {/* Only shown once there's an actual guidance label to dismiss --
              not during loading/learning, and not on the "tap a category"
              prompt, which is the primary call-to-action, not content to
              swipe away. Not reserving a placeholder slot when absent:
              instructionWrap's own symmetric padding already looks even on
              its own, and an empty reserved row above bare "Tap a
              category" text read as a bigger gap than it needed to. */}
          {sdkReady && faceShape && activeCategories.size > 0 && (
            <TouchableOpacity
              style={styles.dismissHandle}
              onPress={() => setShowInstructions(false)}
              hitSlop={{ top: 8, bottom: 8, left: 20, right: 20 }}
            >
              <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
          {!sdkReady || !faceShape ? (
            <>
              <ActivityIndicator color="#fff" style={{ marginBottom: 8 }} />
              <Text style={styles.instructionText}>
                {!sdkReady ? 'Loading tutorial…' : 'Hold still, learning your face shape…'}
              </Text>
            </>
          ) : activeCategories.size === 0 ? (
            <Text style={styles.instructionText}>Tap a category below to see placement guidance</Text>
          ) : (
            labels.map((item) => (
              <View key={item.category} style={styles.labelRow}>
                <View style={[styles.labelDot, { backgroundColor: CATEGORY_COLOR[item.category] }]} />
                <Text style={[styles.instructionText, styles.labelText]}>{item.label}</Text>
              </View>
            ))
          )}
        </View>
        )}

        {!showInstructions && (
          <TouchableOpacity
            style={styles.reopenHandle}
            onPress={() => setShowInstructions(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        )}

        {/* One panel, one background -- covers the palette row, the capture
            button row, and the bottom safe-area inset below them, so there's
            no gap of bare camera feed showing through under the button and
            no visible seam between two differently-shaded bars. */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.paletteRow}>
            {CATEGORY_ITEMS.map((item) => {
              const active = activeCategories.has(item.category);
              const color = CATEGORY_COLOR[item.category];
              return (
                <TouchableOpacity
                  key={item.category}
                  style={styles.categoryCircleWrap}
                  onPress={() => handleToggleCategory(item.category)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.categoryCircle,
                      { borderColor: color },
                      active && { backgroundColor: color },
                    ]}
                  >
                    {item.iconFamily === 'mci' ? (
                      <MaterialCommunityIcons name={item.icon} size={20} color={active ? '#fff' : color} />
                    ) : (
                      <Ionicons name={item.icon} size={20} color={active ? '#fff' : color} />
                    )}
                  </View>
                  <Text style={styles.categoryCircleLabel}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.controls}>
            <View style={{ width: 80 }} />
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextWrap: { alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', marginTop: 2 },

  spacer: { flex: 1 },

  instructionWrap: {
    marginHorizontal: 20,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  dismissHandle: { alignSelf: 'center', paddingBottom: 4 },
  reopenHandle: {
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    marginBottom: 6,
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingVertical: 3,
  },
  labelDot: { width: 8, height: 8, borderRadius: 4 },
  labelText: { flex: 1, textAlign: 'left' },

  bottomBar: { backgroundColor: 'rgba(0,0,0,0.65)' },
  paletteRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryCircleWrap: { alignItems: 'center', width: 58 },
  categoryCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  categoryCircleLabel: { color: '#fff', fontSize: 10, fontWeight: '600', marginTop: 4 },

  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
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
  captureButtonInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },

  reviewControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  reviewBtn: {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  reviewBtnText: { color: '#fff', fontWeight: 'bold' },
  saveBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
});
