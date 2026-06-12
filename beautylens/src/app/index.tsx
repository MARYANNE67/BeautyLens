/**
 * Home Screen — BeautyLens entry point
 * Branded screen with scan CTA and recent scans panel
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';

const PINK = '#C2185B';
const PINK_LIGHT = '#FCE4EC';
const PINK_DARK = '#880E4F';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo + brand */}
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>💄</Text>
          </View>
          <Text style={styles.title}>BeautyLens</Text>
          <Text style={styles.subtitle}>
            Scan products to get tutorials and try virtual looks
          </Text>
        </View>

        {/* Primary CTA */}
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => router.push('/scan')}
          activeOpacity={0.85}
        >
          <Text style={styles.scanButtonText}>📷  Scan a Product</Text>
        </TouchableOpacity>

        {/* Recent scans placeholder */}
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent Scans</Text>
          <View style={styles.recentRow}>
            <View style={styles.recentChip}>
              <Text style={styles.recentChipText}>Foundation</Text>
              <Text style={styles.recentChipSub}>52% · 2m ago</Text>
            </View>
            <View style={styles.recentChip}>
              <Text style={styles.recentChipText}>Powder</Text>
              <Text style={styles.recentChipSub}>81% · 1h ago</Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: PINK_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  logoEmoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: PINK,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  scanButton: {
    backgroundColor: PINK,
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 30,
    minWidth: 220,
    alignItems: 'center',
    shadowColor: PINK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 40,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  recentSection: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 20,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  recentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  recentChip: {
    flex: 1,
    backgroundColor: PINK_LIGHT,
    borderRadius: 10,
    padding: 12,
  },
  recentChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: PINK_DARK,
  },
  recentChipSub: {
    fontSize: 11,
    color: PINK,
    marginTop: 2,
  },
});
