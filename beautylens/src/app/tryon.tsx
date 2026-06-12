/**
 * Virtual Try-On Screen
 * Intermediate screen displaying product info before entering AR face camera
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

const PINK = '#C2185B';
const PINK_LIGHT = '#FCE4EC';
const PINK_DARK = '#880E4F';

export default function VirtualTryOnScreen() {
  const router = useRouter();
  const { productType, productName, productImageUrl } = useLocalSearchParams<{
    productType: string;
    productName: string;
    productImageUrl?: string;
  }>();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>

        {/* Product header */}
        <View style={styles.productCard}>
          <View style={styles.productIconContainer}>
            <Text style={styles.productIcon}>💄</Text>
          </View>
          <View style={styles.productInfo}>
            <Text style={styles.productName}>
              {productName ?? productType ?? 'Product'}
            </Text>
            <Text style={styles.productType}>
              {productType ? productType.charAt(0).toUpperCase() + productType.slice(1) : ''} · Face product
            </Text>
          </View>
        </View>

        {/* Main CTA area */}
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaTitle}>Virtual Try-On</Text>
          <Text style={styles.ctaSubtitle}>
            Experience how this product looks on you
          </Text>
          <Text style={styles.ctaDescription}>
            Use your front-facing camera to see how this product looks on your
            face in real-time.
          </Text>
        </View>

        {/* Start button */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={() =>
            router.push({
              pathname: '/camera',
              params: { productType, productName, productImageUrl: productImageUrl ?? '' },
            })
          }
          activeOpacity={0.85}
        >
          <Text style={styles.startButtonText}>Start Virtual Try-On</Text>
        </TouchableOpacity>

        {/* What to expect */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>What to Expect</Text>
          {[
            'Real-time AR overlay of the product',
            'See how it looks in different lighting',
            'Try different shades and colors',
            'Save your favourite looks',
          ].map((item) => (
            <View key={item} style={styles.infoRow}>
              <View style={styles.checkDot} />
              <Text style={styles.infoText}>{item}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PINK_LIGHT,
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
    gap: 12,
  },
  productIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productIcon: { fontSize: 24 },
  productInfo: { flex: 1 },
  productName: { fontSize: 15, fontWeight: '600', color: PINK_DARK },
  productType: { fontSize: 12, color: PINK, marginTop: 2 },
  ctaContainer: { alignItems: 'center', paddingVertical: 20, marginBottom: 8 },
  ctaTitle: { fontSize: 26, fontWeight: 'bold', color: '#111', marginBottom: 6 },
  ctaSubtitle: { fontSize: 14, color: '#888', marginBottom: 10 },
  ctaDescription: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  startButton: {
    backgroundColor: PINK,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: PINK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  startButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  infoSection: { backgroundColor: '#f8f8f8', padding: 18, borderRadius: 14 },
  infoTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  checkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PINK },
  infoText: { fontSize: 13, color: '#555', flex: 1 },
});
