/**
 * Home: the launch pad. One primary action (skin scan) plus the two secondary
 * entry points.
 *
 * Shade recommendations deliberately do NOT appear here -- they have their own
 * Shade Match tab, and duplicating the list on Home meant maintaining two
 * copies of the same fetch, empty state and detail sheet.
 */
import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ImageBackground,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { LensMark } from '../../components/LensMark';
import { SERIF } from '../../components/ProfileFields';
import { AppConfig } from '../../config/featureFlags';
import { getLatestSkinScan, getScan } from '../../services/api';
import { getLocalProfileId, getLocalScanId, setLocalScanId } from '../../utils/profileStorage';
import type { SkinScanStatus } from '../../types';

const PINK = '#C2185B';
const BG = '#F6F1F4';

const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;

export default function HomeScreen() {
  const router = useRouter();

  const [profileId, setProfileId] = useState<number | null>(null);
  // Only drives the hero button's label. The scan itself is the point of this
  // screen, so "Start" vs "Rescan" is the one piece of status Home still needs.
  const [hasCompletedScan, setHasCompletedScan] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        const localProfileId = await getLocalProfileId();
        const localScanId = await getLocalScanId();
        if (cancelled) return;
        setProfileId(localProfileId);

        if (!localProfileId) {
          setHasCompletedScan(false);
          return;
        }

        try {
          let scan: SkinScanStatus | null = null;

          if (localScanId) {
            try {
              scan = await getScan(API_BASE_URL, localScanId);
            } catch {
              scan = null;
            }
          }

          // Recovers when AsyncStorage lost the scan id but the backend still
          // has a completed scan for this profile.
          if (!scan?.is_complete) {
            scan = await getLatestSkinScan(API_BASE_URL, localProfileId, true);
          }

          if (cancelled) return;

          if (!scan?.is_complete) {
            setHasCompletedScan(false);
            return;
          }

          setHasCompletedScan(true);
          if (scan.scan_id !== localScanId) {
            await setLocalScanId(scan.scan_id);
          }
        } catch (e) {
          console.log('[Home] Failed to load scan status:', (e as Error).message);
          if (!cancelled) setHasCompletedScan(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Single button, single purpose: start or redo the skin scan. Viewing
  // existing results lives in the Shade Match tab, not behind this button.
  const handleSkinScanPress = () => {
    if (!profileId) {
      router.push('/account');
      return;
    }
    router.push('/skin-scan');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Top bar. No avatar shortcut here -- the Profile tab already links
            to the beauty profile, and two entry points to the same editor was
            just clutter. */}
        <View style={styles.topBar}>
          <Text style={styles.greeting}>Welcome back to</Text>
          <Text style={styles.brand}>BeautyLens</Text>
        </View>

        {/* Hero: the primary action, skin scanning */}
        <ImageBackground
          source={require('../../../assets/images/homepage-image-card.png')}
          style={styles.heroCard}
          imageStyle={{ borderRadius: 24 }}
          resizeMode="cover"
        >
          {/* The model sits on the right of the artwork, so the scrim is
              strongest on the left where the copy goes and clears away to
              the right. */}
          <LinearGradient
            colors={['rgba(74,26,48,0.94)', 'rgba(74,26,48,0.62)', 'rgba(74,26,48,0.0)']}
            locations={[0, 0.48, 0.82]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />

          <LensMark size={64} onColor style={{ marginBottom: 26 }} />

          <Text style={styles.heroHeadline}>Find My Shade</Text>
          <Text style={styles.heroBody}>
            Scan your skin to discover{'\n'}your perfect foundation match.
          </Text>

          <TouchableOpacity
            style={styles.heroBtn}
            onPress={handleSkinScanPress}
            activeOpacity={0.85}
          >
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.heroBtnText}>
              {hasCompletedScan ? 'Rescan Skin' : 'Start Skin Scan'}
            </Text>
          </TouchableOpacity>
        </ImageBackground>

        {/* Secondary actions */}
        <View style={styles.featureRow}>
          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name="color-wand-outline" size={20} color={PINK} />
            </View>
            <Text style={styles.featureTitle}>Identify a Product</Text>
            <Text style={styles.featureBody}>
              Scan any makeup product to identify it instantly.
            </Text>
            <TouchableOpacity
              style={styles.featureBtn}
              onPress={() => router.push('/scan')}
              activeOpacity={0.8}
            >
              <Ionicons name="scan-outline" size={15} color={PINK} />
              <Text style={styles.featureBtnText}>Scan Product</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name="contrast-outline" size={20} color={PINK} />
            </View>
            <Text style={styles.featureTitle}>Face Shape Tutorial</Text>
            <Text style={styles.featureBody}>
              Live placement guidance for contour, blush and more, tailored to your face shape.
            </Text>
            <TouchableOpacity
              style={styles.featureBtn}
              onPress={() => router.push('/tutorial')}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-outline" size={15} color={PINK} />
              <Text style={styles.featureBtnText}>Start Tutorial</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flexGrow: 1, paddingBottom: 32 },

  /* Top bar */
  topBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: '#A0A0A0',
    fontWeight: '500',
    marginBottom: 2,
  },
  brand: {
    // Brand wordmark -- serif everywhere it appears.
    fontFamily: SERIF,
    fontSize: 30,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: 0.2,
  },

  /* Hero card */
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    paddingHorizontal: 26,
    paddingTop: 26,
    paddingBottom: 30,
    overflow: 'hidden',
    marginBottom: 16,
    minHeight: 320,
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  heroHeadline: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 36,
    marginBottom: 10,
  },
  heroBody: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 21,
    marginBottom: 22,
  },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    alignSelf: 'flex-start',
    backgroundColor: '#EE4C8B',
    paddingHorizontal: 26,
    paddingVertical: 15,
    borderRadius: 50,
  },
  heroBtnText: { fontSize: 15.5, fontWeight: '700', color: '#FFFFFF' },

  /* Secondary feature cards */
  featureRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  featureCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
    minHeight: 208,
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDEEF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  featureTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 6 },
  featureBody: { fontSize: 12.5, color: '#7C7076', lineHeight: 18, marginBottom: 14 },
  featureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 'auto',
    borderWidth: 1.4,
    borderColor: '#F2C3D7',
    borderRadius: 50,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
  },
  featureBtnText: { fontSize: 13, fontWeight: '700', color: PINK },
});
