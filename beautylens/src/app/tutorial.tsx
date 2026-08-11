/**
 * Face Shape Tutorial — real-time placement guidance for technique-driven
 * categories (contour, concealer, highlighter, blush, bronzer), powered by
 * TutorialWebView's client-side face tracking. Standalone entry point from
 * Home, not tied to a scanned product or a completed skin scan.
 */
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import TutorialWebView, {
  CATEGORY_COLOR,
  type TutorialWebViewRef,
  type PlacementCategory,
  type FaceShape,
} from '../components/TutorialWebView';

const CATEGORY_ITEMS: { category: PlacementCategory; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { category: 'contour',     label: 'Contour',     icon: 'contrast' },
  { category: 'concealer',   label: 'Concealer',   icon: 'water' },
  { category: 'highlighter', label: 'Highlight',   icon: 'star' },
  { category: 'blush',       label: 'Blush',       icon: 'flower' },
  { category: 'bronzer',     label: 'Bronzer',     icon: 'sunny' },
];

const FACE_SHAPE_LABEL: Record<FaceShape, string> = {
  oval: 'Oval',
  round: 'Round',
  square: 'Square',
  heart: 'Heart',
  long: 'Long',
};

export default function TutorialScreen() {
  const router = useRouter();
  const webViewRef = useRef<TutorialWebViewRef>(null);

  const [activeCategory, setActiveCategory] = useState<PlacementCategory>('contour');
  const [sdkReady, setSdkReady] = useState(false);
  const [label, setLabel] = useState('Loading tutorial…');
  const [faceShape, setFaceShape] = useState<FaceShape | null>(null);

  const handleSelectCategory = useCallback((category: PlacementCategory) => {
    setActiveCategory(category);
    webViewRef.current?.setCategory(category);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <TutorialWebView
        ref={webViewRef}
        initialCategory={activeCategory}
        onReady={() => setSdkReady(true)}
        onLabel={setLabel}
        onShapeLocked={setFaceShape}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Face Shape Tutorial</Text>
            {faceShape && <Text style={styles.headerSubtitle}>{FACE_SHAPE_LABEL[faceShape]} face shape</Text>}
          </View>
          <View style={{ width: 38 }} />
        </View>

        <View style={styles.spacer} />

        <View style={styles.instructionWrap}>
          {!sdkReady && <ActivityIndicator color="#fff" style={{ marginBottom: 8 }} />}
          <Text style={styles.instructionText}>{label}</Text>
        </View>

        <View style={styles.paletteRow}>
          {CATEGORY_ITEMS.map((item) => {
            const active = activeCategory === item.category;
            const color = CATEGORY_COLOR[item.category];
            return (
              <TouchableOpacity
                key={item.category}
                style={styles.categoryCircleWrap}
                onPress={() => handleSelectCategory(item.category)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.categoryCircle,
                    { borderColor: color },
                    active && { backgroundColor: color },
                  ]}
                >
                  <Ionicons name={item.icon} size={20} color={active ? '#fff' : color} />
                </View>
                <Text style={styles.categoryCircleLabel}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
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
  instructionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },

  paletteRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  categoryCircleWrap: { alignItems: 'center', width: 58 },
  categoryCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  categoryCircleLabel: { color: '#fff', fontSize: 10, fontWeight: '600', marginTop: 4 },
});
