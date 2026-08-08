import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const PINK       = '#C2185B';
const PINK_LIGHT = '#FDE8F0';
const HERO_BG    = '#1C0814';
const BG         = '#F6F1F4';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const PRODUCT_CONFIG: Record<string, { swatch: string; icon: IoniconName; category: string }> = {
  Foundation:  { swatch: '#C8956C', icon: 'water-outline',          category: 'Face' },
  Powder:      { swatch: '#E8A598', icon: 'cloud-outline',          category: 'Face' },
  Lipstick:    { swatch: '#C62828', icon: 'heart-outline',          category: 'Lips' },
  Blush:       { swatch: '#E88FAE', icon: 'flower-outline',         category: 'Cheeks' },
  Concealer:   { swatch: '#D4A574', icon: 'water-outline',          category: 'Face' },
  Mascara:     { swatch: '#37474F', icon: 'eye-outline',            category: 'Eyes' },
  Eyeshadow:   { swatch: '#7B1FA2', icon: 'color-palette-outline',  category: 'Eyes' },
  Bronzer:     { swatch: '#A0522D', icon: 'sunny-outline',          category: 'Face' },
  Highlighter: { swatch: '#F9C74F', icon: 'star-outline',           category: 'Face' },
};

const FALLBACK = { swatch: PINK, icon: 'color-palette-outline' as IoniconName, category: 'Makeup' };

const EXPECT_ITEMS: { icon: IoniconName; text: string }[] = [
  { icon: 'videocam-outline',     text: 'Real-time AR overlay on your face' },
  { icon: 'color-palette-outline', text: 'See how the shade looks on your skin' },
  { icon: 'sunny-outline',        text: 'Works in different lighting conditions' },
  { icon: 'camera-outline',       text: 'Capture and save your favourite looks' },
];

export default function TutorialScreen() {
  const router = useRouter();
  const { productType, productName, productImageUrl, brand, shade, productTypes, productNames } = useLocalSearchParams<{
    productType?: string;
    productName?: string;
    productImageUrl?: string;
    brand?: string;
    shade?: string;
    productTypes?: string;
    productNames?: string;
  }>();
  const selectedProductNames = React.useMemo(() => {
    if (!productNames) return [];
    try {
      const parsed = JSON.parse(productNames);
      return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : [];
    } catch {
      return [];
    }
  }, [productNames]);
  const selectedCount = selectedProductNames.length;

  const label = selectedCount > 1 ? `${selectedCount} product look` : productName ?? productType ?? 'Product';
  const configLabel = productType ?? productName ?? 'Product';
  const key   = configLabel.charAt(0).toUpperCase() + configLabel.slice(1).toLowerCase();
  const cfg   = PRODUCT_CONFIG[key] ?? FALLBACK;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Custom header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tutorial</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Hero card ── */}
        <View style={styles.heroCard}>
          <View style={[styles.dec, { width: 220, height: 220, top: -80, right: -80, backgroundColor: 'rgba(194,24,91,0.14)' }]} />
          <View style={[styles.dec, { width: 130, height: 130, bottom: -40, left: -30, backgroundColor: 'rgba(233,30,140,0.10)' }]} />

          {/* AR face mark */}
          <View style={styles.arWrap}>
            <View style={[styles.corner, { top: 0,    left: 0,  borderTopWidth: 3,    borderLeftWidth: 3   }]} />
            <View style={[styles.corner, { top: 0,    right: 0, borderTopWidth: 3,    borderRightWidth: 3  }]} />
            <View style={[styles.corner, { bottom: 0, left: 0,  borderBottomWidth: 3, borderLeftWidth: 3   }]} />
            <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3  }]} />
            <View style={styles.arOval} />
            <View style={[styles.arDot, { top: 18, left: 20 }]} />
            <View style={[styles.arDot, { top: 18, right: 20 }]} />
            <View style={[styles.arDot, { bottom: 20, alignSelf: 'center' }]} />
          </View>

          <Text style={styles.heroTitle}>See It On You</Text>
          <Text style={styles.heroSub}>
            Your camera will overlay the product on your face in real time
          </Text>
        </View>

        {/* ── Product pill ── */}
        <View style={styles.productPill}>
          <View style={[styles.productSwatch, { backgroundColor: cfg.swatch }]}>
            <Ionicons name={cfg.icon} size={18} color="#fff" />
          </View>
          <View style={styles.productInfo}>
            <Text style={styles.productName}>{label}</Text>
            <Text style={styles.productCategory}>
              {selectedCount > 1
                ? selectedProductNames.join(' · ')
                : [brand, shade].filter(Boolean).join(' · ') || cfg.category}
            </Text>
          </View>
          <View style={[styles.categoryBadge, { backgroundColor: cfg.swatch + '22' }]}>
            <Text style={[styles.categoryBadgeText, { color: cfg.swatch }]}>{cfg.category}</Text>
          </View>
        </View>

        {/* ── Start button ── */}
        <TouchableOpacity
          style={[styles.startBtn, { backgroundColor: cfg.swatch }]}
          onPress={() =>
            router.push({
              pathname: '/camera',
              params: {
                productType,
                productName,
                productImageUrl: productImageUrl ?? '',
                productTypes: productTypes ?? '',
                productNames: productNames ?? '',
              },
            })
          }
          activeOpacity={0.85}
        >
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.startBtnText}>Start Tutorial</Text>
        </TouchableOpacity>

        {/* ── What to expect ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What to Expect</Text>
          {EXPECT_ITEMS.map((item) => (
            <View key={item.text} style={styles.expectRow}>
              <View style={styles.expectIcon}>
                <Ionicons name={item.icon} size={18} color={PINK} />
              </View>
              <Text style={styles.expectText}>{item.text}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BG,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  scroll: { paddingBottom: 40 },

  /* Hero */
  heroCard: {
    margin: 16,
    backgroundColor: HERO_BG,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  dec: {
    position: 'absolute',
    borderRadius: 999,
  },
  arWrap: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  corner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 2,
  },
  arOval: {
    width: 38,
    height: 48,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  arDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
  },

  /* Product pill */
  productPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  productSwatch: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: { flex: 1 },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  productCategory: {
    fontSize: 12,
    color: '#A0A0A0',
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  /* Start button */
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    paddingVertical: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: PINK,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  startBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  /* What to expect */
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  expectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  expectIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: PINK_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expectText: {
    flex: 1,
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
});
