import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  ImageBackground,
  Animated,
  PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const PINK      = '#C2185B';
const PINK_MID  = '#E91E8C';
const PINK_DARK = '#880E4F';

const TRYON_BG  = '#C2185B';
const BG        = '#F6F1F4';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const PRODUCT_CONFIG: Record<string, { swatch: string; icon: IoniconName }> = {
  Foundation:  { swatch: '#C8956C', icon: 'water-outline' },
  Powder:      { swatch: '#E8A598', icon: 'cloud-outline' },
  Lipstick:    { swatch: '#C62828', icon: 'heart-outline' },
  Blush:       { swatch: '#E88FAE', icon: 'flower-outline' },
  Concealer:   { swatch: '#D4A574', icon: 'water-outline' },
  Mascara:     { swatch: '#37474F', icon: 'eye-outline' },
  Eyeshadow:   { swatch: '#7B1FA2', icon: 'color-palette-outline' },
  Bronzer:     { swatch: '#A0522D', icon: 'sunny-outline' },
  Highlighter: { swatch: '#F9C74F', icon: 'star-outline' },
};

const FALLBACK_CONFIG: { swatch: string; icon: IoniconName } = {
  swatch: '#C2185B',
  icon: 'color-palette-outline',
};

type ScanItem = {
  product: string;
  confidence: number;
  ago: string;
  brand: string;
  shade: string;
  category: string;
};

const RECENT_SCANS: ScanItem[] = [
  { product: 'Foundation', confidence: 52, ago: '2 min ago', brand: 'Fenty Beauty',   shade: '230N Medium',   category: 'Face' },
  { product: 'Powder',     confidence: 81, ago: '1 hr ago',  brand: 'MAC Cosmetics',  shade: 'Light',         category: 'Face' },
];

/** Concentric rings → camera/lens metaphor (ACTIVE) */
function LensMark() {
  return (
    <View style={lens.wrap}>
      <View style={lens.outerRing} />
      <View style={lens.midRing} />
      <View style={lens.core} />
      <View style={lens.glint} />
    </View>
  );
}

/* ARMark — corner brackets + face oval → AR face-tracking metaphor (swap in to try)
function ARMark() {
  return (
    <View style={ar.wrap}>
      <View style={[ar.corner, { top: 0,    left: 0,  borderTopWidth: 3,    borderLeftWidth: 3   }]} />
      <View style={[ar.corner, { top: 0,    right: 0, borderTopWidth: 3,    borderRightWidth: 3  }]} />
      <View style={[ar.corner, { bottom: 0, left: 0,  borderBottomWidth: 3, borderLeftWidth: 3   }]} />
      <View style={[ar.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3  }]} />
      <View style={ar.oval} />
      <View style={[ar.dot, { top: 20, left: 22 }]} />
      <View style={[ar.dot, { top: 20, right: 22 }]} />
      <View style={[ar.dot, { bottom: 22, left: 36 }]} />
    </View>
  );
} */

export default function HomeScreen() {
  const router = useRouter();
  const [selectedScan, setSelectedScan] = useState<ScanItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const sheetY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = sheetY.interpolate({
    inputRange: [0, 300],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Animate sheet in when modal opens; sheetY reset handled by closeModal on close
  useEffect(() => {
    if (modalVisible) {
      sheetY.setValue(300);
      Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    }
  }, [modalVisible, sheetY]);

  // Animate sheet off-screen, then hide Modal — selectedScan data stays intact so
  // content doesn't unmount mid-animation causing a flicker
  const closeModal = () => {
    Animated.timing(sheetY, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => {
      setModalVisible(false);
    });
  };

  // Applied only to the handle bar — claims touch immediately so nothing competes
  const handleDrag = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) sheetY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 80 || vy > 0.5) {
          Animated.timing(sheetY, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => {
            setModalVisible(false);
          });
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >

        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.brand}>BeautyLens</Text>
          </View>
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => router.push('/account')}
            activeOpacity={0.8}
          >
            <Ionicons name="person" size={20} color={PINK} />
          </TouchableOpacity>
        </View>

        {/* ── Scan card ── */}
        <ImageBackground
          source={require('../../../assets/images/home-makeup-image.png')}
          style={styles.scanCard}
          imageStyle={{ borderRadius: 24 }}
          resizeMode="cover"
        >
          {/* Left-to-right gradient: opaque on left (text), transparent on right (image shows) */}
          <LinearGradient
            colors={['rgba(20,5,15,0.92)', 'rgba(20,5,15,0.55)', 'rgba(20,5,15,0.0)']}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />

          <LensMark />

          <Text style={styles.cardHeadline}>Identify Any{'\n'}Makeup Product</Text>
          <Text style={styles.cardBody}>
            Point your camera at any makeup product to instantly identify it
          </Text>

          <TouchableOpacity
            style={styles.lightPill}
            onPress={() => router.push('/scan')}
            activeOpacity={0.8}
          >
            <Text style={styles.lightPillText}>Scan Now</Text>
            <Text style={styles.lightPillArrow}>→</Text>
          </TouchableOpacity>
        </ImageBackground>

        {/* ── Try-On card (disabled — Try-On is only accessible after scanning a product) ──
        <TouchableOpacity
          style={styles.tryOnCard}
          onPress={() => router.push('/tryon')}
          activeOpacity={0.9}
        >
          <View style={[styles.dec, { width: 200, height: 200, top: -60, right: -60, backgroundColor: 'rgba(255,255,255,0.08)' }]} />
          <View style={[styles.dec, { width: 120, height: 120, bottom: -40, left: -20, backgroundColor: 'rgba(255,255,255,0.05)' }]} />

          <ARMark />

          <Text style={styles.cardHeadline}>Virtual Try-On</Text>
          <Text style={styles.cardBody}>
            See exactly how any shade looks on your face before you buy
          </Text>

          <View style={styles.darkPill}>
            <Text style={styles.darkPillText}>Try It Now</Text>
            <Text style={styles.darkPillArrow}>→</Text>
          </View>
        </TouchableOpacity>
        ── */}

        {/* ── Recent scans ── */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recent Scans</Text>
            <TouchableOpacity onPress={() => router.push('/history')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {RECENT_SCANS.map((item) => {
            const cfg = PRODUCT_CONFIG[item.product] ?? FALLBACK_CONFIG;
            return (
              <TouchableOpacity
                key={item.product}
                style={styles.recentCard}
                activeOpacity={0.75}
                onPress={() => { setSelectedScan(item); setModalVisible(true); }}
              >
                <View style={[styles.swatch, { backgroundColor: cfg.swatch }]}>
                  <Ionicons name={cfg.icon} size={22} color="#fff" />
                </View>

                <View style={styles.recentInfo}>
                  <Text style={styles.recentName}>{item.product}</Text>
                  <Text style={styles.recentAgo}>{item.ago}</Text>
                </View>

                <View style={[styles.badge, { backgroundColor: cfg.swatch + '22' }]}>
                  <Text style={[styles.badgeText, { color: cfg.swatch }]}>
                    {item.confidence}%
                  </Text>
                </View>

                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>

      </ScrollView>

      {/* ── Scan result modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closeModal}
      >
        {/* Single full-screen container — backdrop covers all, sheet sits at bottom */}
        <View style={modal.container}>
          <Animated.View style={[modal.backdrop, { opacity: backdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={closeModal} />
          </Animated.View>

          {selectedScan && ((() => {
            const cfg = PRODUCT_CONFIG[selectedScan.product] ?? FALLBACK_CONFIG;
            return (
              <Animated.View
                style={[modal.sheet, { transform: [{ translateY: sheetY }] }]}
              >
                {/* Handle — drag zone for swipe-to-dismiss */}
                <View style={modal.handleZone} {...handleDrag.panHandlers}>
                  <View style={modal.handle} />
                </View>

                {/* Header */}
                <View style={modal.header}>
                  <View style={[modal.swatch, { backgroundColor: cfg.swatch }]}>
                    <Ionicons name={cfg.icon} size={26} color="#fff" />
                  </View>
                  <View style={modal.headerText}>
                    <Text style={modal.productName}>{selectedScan.product}</Text>
                    <Text style={modal.scannedAgo}>{selectedScan.ago}</Text>
                  </View>
                  <TouchableOpacity onPress={closeModal} style={modal.closeBtn}>
                    <Ionicons name="close" size={20} color="#999" />
                  </TouchableOpacity>
                </View>

                {/* Confidence bar */}
                <View style={modal.section}>
                  <View style={modal.row}>
                    <Text style={modal.label}>Confidence</Text>
                    <Text style={[modal.value, { color: cfg.swatch }]}>{selectedScan.confidence}%</Text>
                  </View>
                  <View style={modal.barBg}>
                    <View style={[modal.barFill, { width: `${selectedScan.confidence}%` as any, backgroundColor: cfg.swatch }]} />
                  </View>
                </View>

                {/* Details */}
                <View style={modal.section}>
                  <View style={modal.detailRow}>
                    <Text style={modal.label}>Brand</Text>
                    <Text style={modal.value}>{selectedScan.brand}</Text>
                  </View>
                  <View style={modal.divider} />
                  <View style={modal.detailRow}>
                    <Text style={modal.label}>Shade</Text>
                    <Text style={modal.value}>{selectedScan.shade}</Text>
                  </View>
                  <View style={modal.divider} />
                  <View style={modal.detailRow}>
                    <Text style={modal.label}>Category</Text>
                    <Text style={modal.value}>{selectedScan.category}</Text>
                  </View>
                </View>

                {/* CTA */}
                <TouchableOpacity
                  style={[modal.tryOnBtn, { backgroundColor: cfg.swatch }]}
                  onPress={() => {
                    setModalVisible(false);
                    router.push({
                      pathname: '/tryon',
                      params: {
                        productName: selectedScan.product,
                        productType: selectedScan.category,
                        brand: selectedScan.brand,
                        shade: selectedScan.shade,
                      },
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={modal.tryOnText}>Virtual Try-On</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              </Animated.View>
            );
          })())}
        </View>
      </Modal>

    </SafeAreaView>
  );
}

/* ── Lens mark styles (ACTIVE) ── */
const lens = StyleSheet.create({
  wrap:      { width: 76, height: 76, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  outerRing: { position: 'absolute', width: 76, height: 76, borderRadius: 38, borderWidth: 1.5, borderColor: 'rgba(194,24,91,0.35)' },
  midRing:   { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: PINK, shadowColor: PINK_MID, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 10, elevation: 6 },
  core:      { width: 18, height: 18, borderRadius: 9, backgroundColor: PINK, shadowColor: PINK_MID, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8, elevation: 4 },
  glint:     { position: 'absolute', top: 11, right: 11, width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
});

/* ── AR mark styles (swap LensMark → ARMark in the card to try this)
const ar = StyleSheet.create({
  wrap:   { width: 76, height: 76, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  corner: { position: 'absolute', width: 16, height: 16, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 2 },
  oval:   { width: 36, height: 44, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  dot:    { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.8)' },
}); */

/* ── Screen styles ── */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 32,
  },

  /* Top bar */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 13,
    color: '#A0A0A0',
    fontWeight: '500',
    marginBottom: 2,
  },
  brand: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: 0.2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F9C0D6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Shared card dec circle */
  dec: {
    position: 'absolute',
    borderRadius: 999,
  },

  /* Scan card */
  scanCard: {
    marginHorizontal: 24,
    borderRadius: 24,
    padding: 28,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 10,
  },

  /* Try-On card */
  tryOnCard: {
    marginHorizontal: 24,
    backgroundColor: TRYON_BG,
    borderRadius: 24,
    padding: 28,
    overflow: 'hidden',
    marginBottom: 28,
    shadowColor: PINK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },

  /* Shared card text */
  cardHeadline: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 34,
    marginBottom: 10,
  },
  cardBody: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 21,
    marginBottom: 22,
    maxWidth: '52%',
  },

  /* Pills */
  lightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 50,
  },
  lightPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: PINK_DARK,
  },
  lightPillArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: PINK_DARK,
  },
  darkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 50,
  },
  darkPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  darkPillArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Recent scans */
  section: {
    paddingHorizontal: 24,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '600',
    color: PINK,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  swatch: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentInfo: {
    flex: 1,
    gap: 3,
  },
  recentName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  recentAgo: {
    fontSize: 13,
    color: '#A0A0A0',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  chevron: {
    fontSize: 22,
    color: '#D0D0D0',
    fontWeight: '300',
  },
});

/* ── Modal styles ── */
const modal = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
  },
  handleZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
  },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  productName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  scannedAgo: {
    fontSize: 13,
    color: '#A0A0A0',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    backgroundColor: '#F9F6F8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  barBg: {
    height: 8,
    backgroundColor: '#EEDDE6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0ECF0',
  },
  label: {
    fontSize: 13,
    color: '#A0A0A0',
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  tryOnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
    marginTop: 4,
  },
  tryOnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
