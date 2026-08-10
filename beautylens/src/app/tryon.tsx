import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const PINK       = '#C2185B';
const PINK_LIGHT = '#FDE8F0';
const HERO_BG    = '#1C0814';
const BG         = '#F6F1F4';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type Swatch = { label: string; hex: string };

/** Normalise a brand name to the slug expected by makeup-api */
function normalizeBrand(text: string): string | null {
  const t = text.toLowerCase();
  const MAP: [string[], string][] = [
    [['nyx'],                              'nyx'],
    [['maybelline'],                       'maybelline'],
    [['m.a.c', ' mac ', 'mac cosmetics'],  'mac'],
    [["l'oreal", 'loreal', "l'oréal"],    "l'oreal"],
    [['revlon'],                           'revlon'],
    [['covergirl', 'cover girl'],          'covergirl'],
    [['e.l.f', ' elf '],                  'e.l.f.'],
    [['wet n wild', "wet'n'wild"],         'wet n wild'],
    [['milani'],                           'milani'],
    [['rimmel'],                           'rimmel'],
    [['essence'],                          'essence'],
    [['catrice'],                          'catrice'],
    [['physicians formula'],               'physicians formula'],
    [['barry m'],                          'barry m'],
    [['bourjois'],                         'bourjois'],
    [['colourpop', 'colour pop'],          'colourpop'],
    [['urban decay'],                      'urban decay'],
    [['too faced', 'toofaced'],            'too faced'],
    [['benefit'],                          'benefit'],
    [['fenty'],                            'fenty beauty'],
    [['charlotte tilbury'],               'charlotte tilbury'],
    [['nars'],                             'nars'],
    [['clinique'],                         'clinique'],
    [['bobbi brown'],                      'bobbi brown'],
    [['annabelle'],                        'annabelle'],
    [['zorah'],                            'zorah'],
    [['marcelle'],                         'marcelle'],
  ];
  for (const [aliases, slug] of MAP) {
    if (aliases.some((a) => t.includes(a))) return slug;
  }
  return null;
}

/** Map detected product type → makeup-api product_type strings (in priority order) */
function toApiTypes(productType: string | undefined): string[] {
  const t = (productType ?? '').toLowerCase();
  if (/lip\s?gloss|gloss/.test(t))         return ['lip_gloss', 'lipstick'];
  if (/lip\s?liner|lipliner/.test(t))      return ['lip_liner'];
  if (/lipstick|lip stick/.test(t))        return ['lipstick', 'lip_gloss'];
  if (/lip/.test(t))                        return ['lipstick', 'lip_gloss'];
  if (/eyeshadow|eye\s?shadow/.test(t))    return ['eyeshadow'];
  if (/eyeliner|eye\s?liner/.test(t))      return ['eyeliner'];
  if (/eyebrow|eye\s?brow/.test(t))        return ['eyebrow'];
  if (/blush/.test(t))                     return ['blush'];
  if (/bronzer/.test(t))                   return ['bronzer'];
  if (/mascara/.test(t))                   return ['mascara'];
  if (/foundation/.test(t))               return ['foundation'];
  if (/concealer/.test(t))               return ['foundation'];
  if (/nail/.test(t))                      return ['nail_polish'];
  return ['lipstick'];
}

/** Shade name → hex fallback (when Makeup API has no result) */
function shadeToHex(shade: string | undefined): string | null {
  if (!shade) return null;
  const m = shade.match(/#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/);
  if (m) {
    const h = m[1];
    return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h);
  }
  const s = shade.toLowerCase();
  const MAP: [string[], string][] = [
    [['red','scarlet','ruby','cherry','crimson','fire','flame'],'#C62828'],
    [['hot pink','fuchsia','magenta','punch','electric pink'],'#E91E8C'],
    [['pink','rose','rosé','petal','ballet','candy','watermelon'],'#E8628A'],
    [['coral','peach','apricot','melon','tangerine','papaya'],'#FF7043'],
    [['berry','plum','blackberry','mulberry','fig','currant'],'#7B2D48'],
    [['wine','burgundy','merlot','cabernet','maroon','oxblood'],'#722F37'],
    [['mauve','dusty rose','antique rose','smoky rose'],'#A05070'],
    [['purple','violet','amethyst','orchid','grape','lavender'],'#7B1FA2'],
    [['nude','naked','natural','bare','skin','flesh','porcelain'],'#C8956C'],
    [['beige','sand','wheat','bisque','champagne','ivory'],'#D4A574'],
    [['brown','chocolate','espresso','mocha','coffee','cocoa'],'#795548'],
    [['taupe','mushroom','khaki','stone','greige'],'#A0887C'],
    [['bronze','copper','terra','terracotta','sienna','rust'],'#A0522D'],
    [['caramel','honey','toffee','amber','butterscotch','golden'],'#C68642'],
    [['black','onyx','jet','midnight','smoky','charcoal','coal'],'#1A1A1A'],
    [['orange','pumpkin','paprika'],'#E64A19'],
    [['gold','shimmer','glitter','metallic'],'#F0C040'],
  ];
  for (const [kws, hex] of MAP) {
    if (kws.some((kw) => s.includes(kw))) return hex;
  }
  return null;
}

/** Fallback palettes when the API returns nothing */
const FALLBACK_PALETTES: Record<string, Swatch[]> = {
  lipstick: [
    { label: 'Nude',    hex: '#C8956C' }, { label: 'Pink',    hex: '#E8628A' },
    { label: 'Coral',   hex: '#FF7043' }, { label: 'Red',     hex: '#C62828' },
    { label: 'Berry',   hex: '#7B2D48' }, { label: 'Wine',    hex: '#722F37' },
    { label: 'Mauve',   hex: '#A05070' }, { label: 'Fuchsia', hex: '#E91E8C' },
  ],
  blush: [
    { label: 'Baby Pink', hex: '#F4A7B9' }, { label: 'Peach', hex: '#FFAD88' },
    { label: 'Coral',     hex: '#FF7043' }, { label: 'Rose',  hex: '#E8628A' },
    { label: 'Mauve',     hex: '#A05070' }, { label: 'Brick', hex: '#A0522D' },
  ],
  eyeshadow: [
    { label: 'Brown',  hex: '#795548' }, { label: 'Taupe',  hex: '#A0887C' },
    { label: 'Purple', hex: '#7B1FA2' }, { label: 'Gold',   hex: '#F0C040' },
    { label: 'Gray',   hex: '#607080' }, { label: 'Navy',   hex: '#1A237E' },
    { label: 'Rose',   hex: '#C48080' }, { label: 'Black',  hex: '#1A1A1A' },
  ],
  foundation: [
    { label: 'Porcelain', hex: '#F5DEB3' }, { label: 'Ivory',   hex: '#E8C99A' },
    { label: 'Beige',     hex: '#D4A574' }, { label: 'Sand',    hex: '#C19A6B' },
    { label: 'Tan',       hex: '#A0785A' }, { label: 'Caramel', hex: '#8B5A2B' },
  ],
  default: [
    { label: 'Pink',   hex: '#E8628A' }, { label: 'Red',    hex: '#C62828' },
    { label: 'Nude',   hex: '#C8956C' }, { label: 'Berry',  hex: '#7B2D48' },
    { label: 'Coral',  hex: '#FF7043' }, { label: 'Brown',  hex: '#795548' },
    { label: 'Purple', hex: '#7B1FA2' }, { label: 'Mauve',  hex: '#A05070' },
  ],
};

function fallbackPalette(productType: string | undefined): Swatch[] {
  const t = (productType ?? '').toLowerCase();
  if (/lip/.test(t))        return FALLBACK_PALETTES.lipstick;
  if (/blush/.test(t))      return FALLBACK_PALETTES.blush;
  if (/shadow/.test(t))     return FALLBACK_PALETTES.eyeshadow;
  if (/foundation/.test(t)) return FALLBACK_PALETTES.foundation;
  return FALLBACK_PALETTES.default;
}

/** Fetch real shades from the Makeup API for a detected product */
async function fetchProductShades(
  productName: string | undefined,
  productType: string | undefined,
): Promise<Swatch[] | null> {
  const searchText = productName ?? '';
  const brandSlug = normalizeBrand(searchText);
  const apiTypes  = toApiTypes(productType);

  for (const pType of apiTypes) {
    try {
      const params = new URLSearchParams({ product_type: pType });
      if (brandSlug) params.set('brand', brandSlug);

      const url = `https://makeup-api.herokuapp.com/api/v1/products.json?${params}`;
      const resp = await Promise.race([
        fetch(url),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
      ]) as Response;

      if (!resp.ok) continue;
      const data: any[] = await resp.json();
      if (!data?.length) continue;

      // Score each product by how many words of the detected name appear in its title
      const words = searchText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const scored = data.map((p) => {
        const n = (p.name ?? '').toLowerCase();
        return { p, score: words.filter((w) => n.includes(w)).length };
      });
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0]?.p;

      const colors: Swatch[] = (best?.product_colors ?? [])
        .filter((c: any) => c.hex_value && c.hex_value !== 'null' && c.hex_value !== '#null')
        .map((c: any) => ({
          label: c.colour_name ?? 'Shade',
          hex: c.hex_value.startsWith('#') ? c.hex_value : `#${c.hex_value}`,
        }));

      if (colors.length > 0) return colors;
    } catch { /* timeout or network error — try next type */ }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Product UI config
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_CONFIG: Record<string, { icon: IoniconName; category: string }> = {
  Foundation:  { icon: 'water-outline',          category: 'Face' },
  Powder:      { icon: 'cloud-outline',          category: 'Face' },
  Lipstick:    { icon: 'heart-outline',          category: 'Lips' },
  Blush:       { icon: 'flower-outline',         category: 'Cheeks' },
  Concealer:   { icon: 'water-outline',          category: 'Face' },
  Mascara:     { icon: 'eye-outline',            category: 'Eyes' },
  Eyeshadow:   { icon: 'color-palette-outline',  category: 'Eyes' },
  Bronzer:     { icon: 'sunny-outline',          category: 'Face' },
  Highlighter: { icon: 'star-outline',           category: 'Face' },
};

const FALLBACK_CFG = { icon: 'color-palette-outline' as IoniconName, category: 'Makeup' };

const EXPECT_ITEMS: { icon: IoniconName; text: string }[] = [
  { icon: 'videocam-outline',      text: 'Real-time AR overlay on your face' },
  { icon: 'color-palette-outline', text: 'See how the shade looks on your skin' },
  { icon: 'sunny-outline',         text: 'Works in different lighting conditions' },
  { icon: 'camera-outline',        text: 'Capture and save your favourite looks' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function VirtualTryOnScreen() {
  const router = useRouter();
  const {
    productType, productName, productImageUrl,
    brand, shade, productTypes, productNames,
  } = useLocalSearchParams<{
    productType?: string; productName?: string; productImageUrl?: string;
    brand?: string; shade?: string; productTypes?: string; productNames?: string;
  }>();

  const selectedProductNames = React.useMemo(() => {
    if (!productNames) return [];
    try {
      const parsed = JSON.parse(productNames);
      return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string') : [];
    } catch { return []; }
  }, [productNames]);

  const selectedCount = selectedProductNames.length;
  const label = selectedCount > 1
    ? `${selectedCount} product look`
    : productName ?? productType ?? 'Product';

  const cfgKey = (productType ?? productName ?? '');
  const cfgK   = cfgKey.charAt(0).toUpperCase() + cfgKey.slice(1).toLowerCase();
  const cfg    = PRODUCT_CONFIG[cfgK] ?? FALLBACK_CFG;

  // ── Shade state ─────────────────────────────────────────────────────────────
  const [shades,          setShades]          = React.useState<Swatch[]>(fallbackPalette(productType));
  const [loadingShades,   setLoadingShades]   = React.useState(true);
  const [shadesSource,    setShadesSource]    = React.useState<'api' | 'fallback'>('fallback');
  const [selectedSwatch,  setSelectedSwatch]  = React.useState<Swatch>(() => {
    const hex = shadeToHex(shade);
    const fb  = fallbackPalette(productType);
    return fb.find((s) => hex && s.hex.toLowerCase() === hex.toLowerCase()) ?? fb[0];
  });

  // ── Fetch real shades on mount ───────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setLoadingShades(true);

    (async () => {
      const searchName = [brand, productName].filter(Boolean).join(' ');
      const apiShades  = await fetchProductShades(searchName || productName, productType);

      if (cancelled) return;

      if (apiShades && apiShades.length > 0) {
        setShades(apiShades);
        setShadesSource('api');

        // Pre-select: try to match shade name or param hex
        const shadeHex = shadeToHex(shade);
        const match =
          (shade
            ? apiShades.find((s) => s.label.toLowerCase().includes(shade.toLowerCase()))
            : null) ??
          (shadeHex
            ? apiShades.find((s) => s.hex.toLowerCase() === shadeHex.toLowerCase())
            : null) ??
          apiShades[0];

        setSelectedSwatch(match);
      } else {
        setShadesSource('fallback');
        // keep existing fallback palette but try to pre-select by shade name
        const hex = shadeToHex(shade);
        if (hex) {
          const fb   = fallbackPalette(productType);
          const best = fb.find((s) => s.hex.toLowerCase() === hex.toLowerCase()) ?? fb[0];
          setSelectedSwatch(best);
        }
      }
      setLoadingShades(false);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Virtual Try-On</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Hero ── */}
        <View style={styles.heroCard}>
          <View style={[styles.dec, { width: 220, height: 220, top: -80, right: -80, backgroundColor: 'rgba(194,24,91,0.14)' }]} />
          <View style={[styles.dec, { width: 130, height: 130, bottom: -40, left: -30, backgroundColor: 'rgba(233,30,140,0.10)' }]} />
          <View style={styles.arWrap}>
            {(['tl','tr','bl','br'] as const).map((pos) => (
              <View key={pos} style={[styles.corner, {
                top:    pos.startsWith('t') ? 0 : undefined,
                bottom: pos.startsWith('b') ? 0 : undefined,
                left:   pos.endsWith('l')   ? 0 : undefined,
                right:  pos.endsWith('r')   ? 0 : undefined,
                borderTopWidth:    pos.startsWith('t') ? 3 : undefined,
                borderBottomWidth: pos.startsWith('b') ? 3 : undefined,
                borderLeftWidth:   pos.endsWith('l')   ? 3 : undefined,
                borderRightWidth:  pos.endsWith('r')   ? 3 : undefined,
              }]} />
            ))}
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
          <View style={[styles.productSwatch, { backgroundColor: selectedSwatch.hex }]} />
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={1}>{label}</Text>
            <Text style={styles.productCategory}>
              {selectedCount > 1
                ? selectedProductNames.join(' · ')
                : [brand, shade].filter(Boolean).join(' · ') || cfg.category}
            </Text>
          </View>
          <View style={styles.selectedSwatchPill}>
            <Text style={styles.selectedSwatchName} numberOfLines={1}>{selectedSwatch.label}</Text>
          </View>
        </View>

        {/* ── Shade picker ── */}
        <View style={styles.shadeCard}>

          <View style={styles.shadeHeaderRow}>
            <View style={styles.shadeHeaderLeft}>
              <Ionicons name="color-palette-outline" size={16} color={PINK} />
              <Text style={styles.shadeTitle}>Choose Shade</Text>
            </View>
            {loadingShades ? (
              <View style={styles.sourceBadge}>
                <ActivityIndicator size="small" color={PINK} />
                <Text style={styles.sourceBadgeText}>fetching shades…</Text>
              </View>
            ) : (
              <View style={[styles.sourceBadge, shadesSource === 'api' && styles.sourceBadgeApi]}>
                <Ionicons
                  name={shadesSource === 'api' ? 'checkmark-circle' : 'albums-outline'}
                  size={12}
                  color={shadesSource === 'api' ? '#2E7D32' : '#A0A0A0'}
                />
                <Text style={[styles.sourceBadgeText, shadesSource === 'api' && { color: '#2E7D32' }]}>
                  {shadesSource === 'api' ? `${shades.length} real shades` : 'generic palette'}
                </Text>
              </View>
            )}
          </View>

          {/* Selected shade preview */}
          <View style={styles.selectedPreview}>
            <View style={[styles.selectedPreviewCircle, { backgroundColor: selectedSwatch.hex }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedPreviewName}>{selectedSwatch.label}</Text>
              <Text style={styles.selectedPreviewHex}>{selectedSwatch.hex.toUpperCase()}</Text>
            </View>
            <Text style={styles.selectedPreviewHint}>Tap a shade below to change</Text>
          </View>

          {/* Shade grid */}
          {loadingShades ? (
            <View style={styles.loadingShades}>
              <ActivityIndicator color={PINK} />
              <Text style={styles.loadingText}>
                Looking up real shades for {productName ?? productType}…
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.swatchRow}
            >
              {shades.map((sw, i) => {
                const active = sw.hex.toLowerCase() === selectedSwatch.hex.toLowerCase();
                return (
                  <TouchableOpacity
                    key={`${sw.hex}-${i}`}
                    style={styles.swatchItem}
                    onPress={() => setSelectedSwatch(sw)}
                    activeOpacity={0.75}
                  >
                    <View style={[
                      styles.swatchCircle,
                      { backgroundColor: sw.hex },
                      active && styles.swatchCircleActive,
                    ]}>
                      {active && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                    <Text
                      style={[styles.swatchLabel, active && { color: PINK, fontWeight: '700' }]}
                      numberOfLines={2}
                    >
                      {sw.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── Start button ── */}
        <TouchableOpacity
          style={[styles.startBtn, { backgroundColor: selectedSwatch.hex }]}
          onPress={() =>
            router.push({
              pathname: '/camera',
              params: {
                productType,
                productName,
                productImageUrl: productImageUrl ?? '',
                productTypes:    productTypes ?? '',
                productNames:    productNames ?? '',
                shade:           shade ?? '',
                brand:           brand ?? '',
                resolvedColor:   selectedSwatch.hex,
              },
            })
          }
          activeOpacity={0.85}
        >
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.startBtnText}>Start Try-On</Text>
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

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BG,
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },

  scroll: { paddingBottom: 40 },

  /* Hero */
  heroCard: {
    margin: 16, backgroundColor: HERO_BG, borderRadius: 24,
    padding: 28, alignItems: 'center', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  dec: { position: 'absolute', borderRadius: 999 },
  arWrap: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  corner: { position: 'absolute', width: 16, height: 16, borderColor: 'rgba(255,255,255,0.8)', borderRadius: 2 },
  arOval: { width: 38, height: 48, borderRadius: 19, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  arDot: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.8)' },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 8 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 20 },

  /* Product pill */
  productPill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginHorizontal: 16, borderRadius: 16, padding: 14, gap: 12, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  productSwatch: { width: 44, height: 44, borderRadius: 22 },
  productInfo: { flex: 1 },
  productName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  productCategory: { fontSize: 12, color: '#A0A0A0' },
  selectedSwatchPill: { backgroundColor: PINK_LIGHT, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  selectedSwatchName: { fontSize: 11, fontWeight: '700', color: PINK, maxWidth: 80 },

  /* Shade picker card */
  shadeCard: {
    backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16,
    padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  shadeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  shadeHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shadeTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  sourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0F0F0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
  },
  sourceBadgeApi: { backgroundColor: '#E8F5E9' },
  sourceBadgeText: { fontSize: 11, color: '#A0A0A0' },

  /* Selected preview row */
  selectedPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F8F4F6', borderRadius: 12, padding: 12, marginBottom: 14,
  },
  selectedPreviewCircle: { width: 42, height: 42, borderRadius: 21 },
  selectedPreviewName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  selectedPreviewHex: { fontSize: 12, color: '#A0A0A0', marginTop: 1 },
  selectedPreviewHint: { fontSize: 10, color: '#C0A0B0', textAlign: 'right', flex: 1 },

  /* Loading state */
  loadingShades: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  loadingText: { fontSize: 13, color: '#A0A0A0', textAlign: 'center' },

  /* Swatch horizontal scroll */
  swatchRow: { paddingBottom: 4, gap: 12 },
  swatchItem: { alignItems: 'center', width: 52 },
  swatchCircle: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  swatchCircleActive: {
    borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
    transform: [{ scale: 1.12 }],
  },
  swatchLabel: { fontSize: 9, color: '#777', marginTop: 4, textAlign: 'center' },

  /* Start button */
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginHorizontal: 16, paddingVertical: 20, borderRadius: 16, marginBottom: 24,
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  startBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },

  /* What to expect */
  section: {
    backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 16 },
  expectRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  expectIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: PINK_LIGHT,
    justifyContent: 'center', alignItems: 'center',
  },
  expectText: { flex: 1, fontSize: 14, color: '#555', lineHeight: 20 },
});
