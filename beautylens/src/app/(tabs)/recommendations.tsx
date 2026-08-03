/**
 * Recommendations tab: shows the top cross-brand matches for the user's
 * latest completed skin scan, filterable by makeup category. This is a
 * persistent tab (not a one-off screen reached only right after a scan) so
 * results stay reachable at any time, and a rescan naturally refreshes it.
 */
import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { SERIF } from '../../components/ProfileFields';

import { AppConfig } from '../../config/featureFlags';
import { getLatestSkinScan, getRecommendations, getScan } from '../../services/api';
import { getLocalProfileId, getLocalScanId, setLocalScanId } from '../../utils/profileStorage';
import type { ShadeCategory, ShadeRecommendation, RecommendationsResult, SkinScanStatus } from '../../types';

const PINK = '#C2185B';
const PINK_LIGHT = '#FDE8F0';
const BG = '#F6F1F4';
const AMBER = '#B26A00';

// Hero artwork geometry. shades.png is square with its strokes running corner
// to corner and only its left 7.6% transparent, so how much room it leaves the
// title is a fixed number of points -- not a fraction of the screen.
const SCREEN_W = Dimensions.get('window').width;
const HERO_PAD = 22;
// Fixed size on normal phones; stepped down on very narrow ones (iPhone SE 1st
// gen at 320pt), where a 186pt image leaves too little room for the title to
// render at a readable size.
const HERO_ART = SCREEN_W < 350 ? 132 : 186;
const HERO_ART_BLEED = 12;
const HERO_ART_EMPTY_LEFT = HERO_ART * (38 / 500); // transparent margin inside the png
// Width the title may occupy before it would run under the strokes. Derived
// rather than guessed: a fixed maxWidth overflowed into the artwork on 360pt
// devices, and a percentage shrank the column worst on exactly those screens.
const HERO_TEXT_MAX = Math.min(
  230,
  SCREEN_W -
    (HERO_ART - HERO_ART_BLEED) -
    HERO_ART_EMPTY_LEFT -
    HERO_PAD -
    12, // breathing room between text and strokes
);

// Title size is DERIVED from that column, not hardcoded.
//
// "Recommended" is a single 11-character word in a wide serif -- Georgia bold
// measures ~0.72em per character, so the word alone needs ~7.9x the font size
// in points. A word cannot wrap, so if the column is even a few points short,
// React Native breaks it mid-word ("Recommen / ded"). A fixed size therefore
// only ever fits the one screen it was tuned against, which is why this broke
// repeatedly at 360pt, then 390pt, then 430pt.
//
// adjustsFontSizeToFit is not a fix: it is unreliable on Android and does not
// guarantee whole words even on iOS. Computing the size that provably fits is
// deterministic and needs no runtime measurement.
// Measured at ~0.72em per character off a real screenshot; 0.78 is used so the
// computed size carries headroom. The estimate only has to be an upper bound --
// erring high costs a point or two of type, erring low breaks the word again.
const HERO_TITLE_EM = 0.78;
const HERO_TITLE_LONGEST_WORD = 'Recommended'.length;
const HERO_TITLE_SIZE = Math.max(
  16,
  Math.min(30, Math.floor(HERO_TEXT_MAX / (HERO_TITLE_LONGEST_WORD * HERO_TITLE_EM))),
);

const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;

const CATEGORY_OPTIONS: { value: ShadeCategory; label: string }[] = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'concealer', label: 'Concealer' },
];

function formatCategory(value: string): string {
  return value
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Lightest to darkest. Mirrors DEPTH_CATEGORY_MIDPOINT_L in skin_analysis.py. */
const DEPTH_ORDER = [
  'fair',
  'light',
  'light-medium',
  'medium',
  'medium-deep',
  'deep',
  'rich-deep',
];

/**
 * How this shade's depth compares to the user's own.
 *
 * Derived by comparing the two categories, not by hardcoding a word: the card
 * previously printed "Slightly deeper than your depth" for every shade that
 * wasn't an exact depth match, so a shade that was actually *lighter* than the
 * user was labelled deeper.
 */
function depthComparison(shadeDepth: string, userDepth: string | null): string {
  if (!userDepth || shadeDepth === userDepth) return 'Similar depth\nto your skin';
  const shadeIndex = DEPTH_ORDER.indexOf(shadeDepth);
  const userIndex = DEPTH_ORDER.indexOf(userDepth);
  if (shadeIndex === -1 || userIndex === -1) return 'Similar depth\nto your skin';
  return shadeIndex < userIndex ? 'Slightly lighter\nthan your depth' : 'Slightly deeper\nthan your depth';
}

/**
 * Open a shade's retailer page in the system browser.
 *
 * Only http(s) is followed. The URL arrives from the catalog, which is built
 * from third-party datasets, so treating it as an arbitrary deep link would
 * let a bad row in a data file launch another app.
 *
 * The catalog's product pages come from datasets snapshotted years ago, so a
 * discontinued product can 404. That is a dead link, not a crash, but it is
 * why the failure path says something instead of silently doing nothing.
 */
async function openProductPage(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      'Could not open link',
      'This product page could not be opened. It may have been discontinued.',
    );
  }
}

function RecommendationCard({
  item,
  rank,
  userDepth,
  onPreview,
}: {
  item: ShadeRecommendation;
  rank: number;
  userDepth: string | null;
  onPreview: (item: ShadeRecommendation) => void;
}) {
  const isHero = rank === 0;
  // The strongest concern gets surfaced on the card; the rest stay off it, so a
  // single meaningful caution isn't diluted by a list of minor ones.
  const topConcern = item.concerns[0] ?? null;

  return (
    <View style={[styles.card, !isHero && styles.cardCompact]}>
      <View style={styles.cardTopRow}>
        <View style={[styles.labelBadge, isHero && styles.labelBadgeBest]}>
          <Text style={[styles.labelBadgeText, isHero && styles.labelBadgeTextBest]}>{item.label}</Text>
        </View>
      </View>

      {/* Only the product's own colour. The user's measured tone is shown on
          the scan result screen, where the comparison is the point; here the
          page is a product list and a second circle per card read as clutter. */}
      <View style={styles.swatchRow}>
        <View
          style={[
            styles.swatch,
            !isHero && styles.swatchSmall,
            styles.swatchShade,
            { backgroundColor: item.swatch_hex },
          ]}
        />

        <View style={styles.swatchMeta}>
          <Text style={styles.brand}>{item.brand}</Text>
          <Text style={styles.productLine}>
            {item.product_line}, {item.shade_name}
          </Text>
        </View>

        {/* No pill at all when the catalog has no price. An empty "Price n/a"
            badge occupies the same visual weight as a real price while telling
            the user nothing. */}
        {item.price !== null && (
          <View style={styles.pricePill}>
            <Text style={styles.priceText}>${item.price.toFixed(0)}</Text>
          </View>
        )}
      </View>

      {isHero ? (
        <>
          {/* Attributes as icon columns rather than a bulleted list: four short
              facts scan faster side by side, and it keeps the tallest card from
              running to six stacked rows. */}
          <View style={styles.attrRow}>
            <AttrCell icon="leaf-outline" label={`${formatCategory(item.undertone_category)}\nundertone`} />
            <AttrCell icon="sparkles-outline" label={`${formatCategory(item.finish)}\nfinish`} divider />
            <AttrCell icon="water-outline" label={`${formatCategory(item.coverage)}\ncoverage`} divider />
            <AttrCell
              icon="color-palette-outline"
              label={depthComparison(item.depth_category, userDepth)}
              divider
            />
          </View>

          {topConcern && (
            <>
              <View style={styles.cardDivider} />
              <View style={styles.concernRow}>
                <Ionicons name="alert-circle" size={16} color={AMBER} />
                <Text style={styles.concernText}>{topConcern}</Text>
              </View>
            </>
          )}
        </>
      ) : (
        <Text style={styles.attrInline}>
          {formatCategory(item.undertone_category)} undertone · {formatCategory(item.finish)} finish ·{' '}
          {formatCategory(item.coverage)} coverage
        </Text>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.previewBtn} onPress={() => onPreview(item)} activeOpacity={0.85}>
          <Ionicons name="camera-outline" size={16} color={PINK} />
          <Text style={styles.previewBtnText}>Preview</Text>
        </TouchableOpacity>

        {/* Always shown: search_url is generated per request, so unlike the
            stored retailer link it cannot go stale or 404. */}
        <TouchableOpacity
          style={styles.shopBtn}
          onPress={() => openProductPage(item.search_url)}
          activeOpacity={0.85}
        >
          <Ionicons name="search-outline" size={16} color="#FFFFFF" />
          <Text style={styles.shopBtnText}>Find this shade</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** One labelled icon in the hero card's attribute strip. */
function AttrCell({
  icon,
  label,
  divider,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.attrCell, divider && styles.attrCellDivider]}>
      <View style={styles.attrIcon}>
        <Ionicons name={icon} size={17} color={PINK} />
      </View>
      <Text style={styles.attrLabel}>{label}</Text>
    </View>
  );
}

export default function RecommendationsTabScreen() {
  const router = useRouter();

  const [profileId, setProfileId] = useState<number | null>(null);
  const [scanId, setScanId] = useState<number | null>(null);
  const [category, setCategory] = useState<ShadeCategory>('foundation');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendationsResult | null>(null);

  const load = useCallback(async (pId: number, sId: number, cat: ShadeCategory) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRecommendations(API_BASE_URL, pId, sId, cat);
      setResult(res);
    } catch (e) {
      setError((e as Error).message || 'Could not load recommendations. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError(null);
        setResult(null);

        const pId = await getLocalProfileId();
        const localScanId = await getLocalScanId();
        if (cancelled) return;
        setProfileId(pId);

        if (!pId) {
          setScanId(null);
          setLoading(false);
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

          if (!scan?.is_complete) {
            scan = await getLatestSkinScan(API_BASE_URL, pId, true);
          }

          if (cancelled) return;

          if (!scan?.is_complete) {
            setScanId(null);
            setLoading(false);
            return;
          }

          setScanId(scan.scan_id);
          if (scan.scan_id !== localScanId) {
            await setLocalScanId(scan.scan_id);
          }
          await load(pId, scan.scan_id, category);
        } catch (e) {
          if (!cancelled) {
            setError((e as Error).message || 'Could not check your skin scan. Try again.');
            setScanId(null);
            setLoading(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category])
  );

  const handlePreview = (item: ShadeRecommendation) => {
    router.push({
      pathname: '/shade-preview',
      params: { shadeId: String(item.shade_id), brand: item.brand, shadeName: item.shade_name },
    });
  };

  const hasScan = profileId != null && scanId != null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Title and artwork share a row: the swatch image bleeds off the right
          edge behind the heading, which is what stops the top of the screen
          reading as a plain list header. */}
      <View style={styles.hero}>
        <Image
          source={require('../../../assets/images/shades.png')}
          style={styles.heroArt}
          resizeMode="contain"
        />
        <TouchableOpacity onPress={() => router.back()} style={styles.heroBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color="#3A2A30" />
        </TouchableOpacity>
        {/* Size is precomputed to fit this device's column (see
            HERO_TITLE_SIZE), so the word always fits and wrapping happens at
            the space, never inside "Recommended". */}
        <Text style={styles.heroTitle} numberOfLines={2}>
          Recommended Shades
        </Text>
        {result && (
          <Text style={styles.heroSubtitle}>
            Based on your <Text style={styles.heroSubtitleAccent}>{formatCategory(result.depth_category)}</Text> depth
            {'\n'}and <Text style={styles.heroSubtitleAccent}>{formatCategory(result.undertone_category)}</Text> undertone
          </Text>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {!hasScan && !loading && (
          <View style={styles.promptCard}>
            <Ionicons name="sparkles-outline" size={32} color={PINK} />
            <Text style={styles.promptText}>
              Waiting for you to complete a skin scan before showing personalized shade recommendations
              across brands
            </Text>
            <TouchableOpacity
              style={styles.promptBtn}
              onPress={() => {
                if (profileId == null) {
                  router.push('/account');
                } else {
                  router.push('/skin-scan');
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.promptBtnText}>
                {profileId == null ? 'Create Beauty Profile' : 'Start Skin Scan'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {hasScan && (
          <>
            <View style={styles.chipRow}>
              {CATEGORY_OPTIONS.map((opt) => {
                const selected = opt.value === category;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setCategory(opt.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {loading && (
              <View style={styles.centerBlock}>
                <ActivityIndicator color={PINK} size="large" />
              </View>
            )}

            {error && !loading && (
              <View style={styles.centerBlock}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => profileId && scanId && load(profileId, scanId, category)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {!loading && !error && result && result.recommendations.length === 0 && (
              <View style={styles.centerBlock}>
                <Text style={styles.emptyText}>No {category} matches found in the catalog yet.</Text>
              </View>
            )}

            {/* Lead with the truth when the catalog can't serve this skin
                tone. Burying it in a card's "concerns" list would let the
                headline still read as a confident match. */}
            {!loading && !error && result?.catalog_gap && (
              <View style={styles.gapBanner}>
                <Ionicons name="alert-circle" size={20} color="#8A4B00" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.gapTitle}>No close match in our range yet</Text>
                  <Text style={styles.gapBody}>
                    Our catalog doesn&apos;t currently carry a {category} close enough to your
                    skin tone. The options below are the nearest we have and will read
                    visibly off &mdash; we&apos;re expanding the range.
                  </Text>
                </View>
              </View>
            )}

            {!loading && !error && result?.best_match_quality === 'approximate' && (
              <View style={styles.approxBanner}>
                <Ionicons name="information-circle" size={18} color="#7A5B00" />
                <Text style={styles.approxText}>
                  These are close but not exact. Test in daylight before buying.
                </Text>
              </View>
            )}

            {!loading &&
              !error &&
              result?.recommendations.map((item, i) => (
                <RecommendationCard
                  key={item.shade_id}
                  item={item}
                  rank={i}
                  userDepth={result.depth_category}
                  onPreview={handlePreview}
                />
              ))}

            {!loading && !error && result && result.recommendations.length > 0 && (
              <Text style={styles.disclaimer}>
                These are estimates based on your photos and answers, not a guarantee. Lighting and
                camera settings can affect color accuracy. Confirm in natural light before buying.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  hero: { paddingHorizontal: HERO_PAD, paddingTop: 4, paddingBottom: 18 },
  heroArt: {
    position: 'absolute',
    // shades.png is square (500x500) with transparent corners, and its strokes
    // run corner to corner -- the artwork already reaches the right edge of its
    // own canvas (content bbox starts at x=38 and ends at x=500). So the bleed
    // is kept small: a large negative offset would cut into the darkest stroke
    // rather than into empty margin. width and height stay equal to preserve
    // the 1:1 ratio; `contain` then fills the box exactly with no letterboxing.
    right: -HERO_ART_BLEED,
    top: -20,
    width: HERO_ART,
    height: HERO_ART,
  },
  heroBack: { width: 34, height: 34, justifyContent: 'center', marginLeft: -6, marginBottom: 4 },
  heroTitle: {
    fontFamily: SERIF,
    fontSize: HERO_TITLE_SIZE,
    lineHeight: Math.round(HERO_TITLE_SIZE * 1.24),
    fontWeight: '700',
    color: '#3A0F22',
    // Fixed points, not a percentage. The artwork is a fixed width pinned to
    // the right edge, so the space it leaves is a constant -- a percentage
    // would shrink the text column on exactly the narrow screens where the
    // clearance is already tightest.
    maxWidth: HERO_TEXT_MAX,
  },
  heroSubtitle: { fontSize: 15.5, lineHeight: 23, color: '#5C5158', marginTop: 10, maxWidth: HERO_TEXT_MAX },
  heroSubtitleAccent: { color: PINK, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  promptCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  promptText: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 21 },
  promptBtn: { marginTop: 4, backgroundColor: PINK, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12 },
  promptBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  chipRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  chip: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  chipSelected: { backgroundColor: PINK },
  chipText: { fontSize: 16, fontWeight: '700', color: '#5C5158' },
  chipTextSelected: { color: '#fff' },

  centerBlock: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  errorText: { color: '#C62828', fontSize: 14, textAlign: 'center' },
  emptyText: { color: '#A0A0A0', fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: PINK_LIGHT },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: PINK },

  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 2,
  },
  cardCompact: { paddingVertical: 16 },
  cardTopRow: { flexDirection: 'row', marginBottom: 12 },
  labelBadge: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: '#F3EFF1' },
  labelBadgeBest: { backgroundColor: PINK_LIGHT },
  labelBadgeText: { fontSize: 13, fontWeight: '700', color: '#5C5158' },
  labelBadgeTextBest: { color: PINK },
  pricePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: PINK_LIGHT,
    alignSelf: 'flex-start',
  },
  priceText: { fontSize: 13, fontWeight: '700', color: '#8A3355' },

  attrRow: { flexDirection: 'row', marginTop: 18 },
  attrCell: { flex: 1, alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  attrCellDivider: { borderLeftWidth: 1, borderLeftColor: '#F1EAEE' },
  attrIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: PINK_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attrLabel: { fontSize: 12, lineHeight: 16, color: '#5C5158', textAlign: 'center', fontWeight: '600' },
  attrInline: { fontSize: 13, color: '#5C5158', marginTop: 12, lineHeight: 19 },

  cardDivider: { height: 1, backgroundColor: '#F1EAEE', marginTop: 16 },
  concernRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14 },
  concernText: { flex: 1, fontSize: 13.5, color: AMBER, lineHeight: 19, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  brand: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  productLine: { fontSize: 14, color: '#888', marginBottom: 10 },

  previewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#FFF5F8',
    borderWidth: 1,
    borderColor: '#F3C9D9',
  },
  previewBtnText: { fontSize: 15, fontWeight: '700', color: PINK },
  shopBtn: {
    flex: 1.25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: PINK,
  },
  shopBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  swatchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  swatch: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    // Neutral hairline so the swatch reads accurately against the card -- a
    // coloured border would bias how the shade itself is perceived.
    borderColor: 'rgba(0,0,0,0.14)',
  },
  swatchSmall: { width: 50, height: 50, borderRadius: 25 },
  swatchShade: { borderWidth: 2, borderColor: PINK },
  swatchMeta: { flex: 1, paddingTop: 2 },

  gapBanner: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'flex-start',
    backgroundColor: '#FFF1E0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  gapTitle: { fontSize: 14.5, fontWeight: '700', color: '#8A4B00', marginBottom: 3 },
  gapBody: { fontSize: 13, color: '#8A4B00', lineHeight: 19 },

  approxBanner: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E1',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  approxText: { flex: 1, fontSize: 13, color: '#7A5B00', lineHeight: 18 },

  disclaimer: { fontSize: 13, color: '#A0A0A0', textAlign: 'center', lineHeight: 18, marginTop: 8 },
});
