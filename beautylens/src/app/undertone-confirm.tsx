/**
 * Undertone questions, then the scan's result page.
 *
 * Step 1 is a short comparison questionnaire (every question has an "I don't
 * know" option, since the user isn't assumed to know these terms). The answers
 * matter: an uncalibrated photo's colour signal is unstable across captures,
 * so these are currently the steadiest evidence the estimate has.
 *
 * Step 2 is the result -- undertone, skin depth, and the closest foundation
 * shown as the user's own skin colour beside the shade's, plus what to look for
 * on a shade chart.
 *
 * It previously ended by asking the user to confirm or override the undertone
 * against four comparison cards. That asked them to arbitrate the exact
 * judgement they opened the app to get, so the estimate is now accepted on
 * their behalf and the screen reports rather than interrogates. Confidence is
 * still shown, and the undertone remains overridable from the scan record.
 */
import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  ChipGroup,
  QuestionCard,
  styles as shared,
  BODY,
  PAGE_BG,
  SERIF,
} from '../components/ProfileFields';
import { AppConfig } from '../config/featureFlags';
import { estimateUndertone, confirmUndertone, getRecommendations } from '../services/api';
import { setLocalScanId, getLocalProfileId } from '../utils/profileStorage';
import type {
  FoundationProblem,
  JewelryPreference,
  VeinColor,
  UndertoneCategory,
  UndertoneResult,
  RecommendationsResult,
} from '../types';

const PINK = '#C2185B';
const PINK_LIGHT = '#FDE8F0';

const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;

const FOUNDATION_PROBLEM_OPTIONS: { value: FoundationProblem; label: string }[] = [
  { value: 'too_orange', label: 'It looks too orange' },
  { value: 'too_pink', label: 'It looks too pink' },
  { value: 'ashy_grey', label: 'It looks grey or ashy' },
  { value: 'uncertain', label: "I don't know" },
];

const JEWELRY_OPTIONS: { value: JewelryPreference; label: string }[] = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'both', label: 'Both look fine' },
  { value: 'uncertain', label: "I don't know" },
];

const VEIN_OPTIONS: { value: VeinColor; label: string }[] = [
  { value: 'green', label: 'Mostly green' },
  { value: 'blue_purple', label: 'Mostly blue or purple' },
  { value: 'mixture', label: 'A mixture' },
  { value: 'uncertain', label: "I can't tell" },
];

const UNDERTONE_CARDS: { value: UndertoneCategory; label: string; description: string; color: string }[] = [
  { value: 'warm', label: 'Warm', description: 'Skin has more golden, yellow or peach qualities.', color: '#D98C4A' },
  { value: 'cool', label: 'Cool', description: 'Skin has more pink, red or bluish qualities.', color: '#C77B96' },
  { value: 'neutral', label: 'Neutral', description: 'Warm and cool qualities appear relatively balanced.', color: '#B39B7D' },
  { value: 'olive', label: 'Olive', description: 'A muted greenish or golden-grey quality, often hard to match with standard warm/cool shades.', color: '#8B8C5A' },
];

/** Shade-chart words to look for, per depth band. */
const DEPTH_HINTS: Record<string, string> = {
  fair: 'fair, porcelain or ivory',
  light: 'light, ivory or beige',
  'light-medium': 'light-medium, sand or nude',
  medium: 'medium, natural or golden beige',
  'medium-deep': 'tan, caramel or amber',
  deep: 'deep, chestnut or mocha',
  'rich-deep': 'rich, espresso or ebony',
};

/** What each undertone means when you're stood in front of a shade chart. */
const UNDERTONE_HINTS: Record<UndertoneCategory, string> = {
  warm: 'Golden and yellow-based shades. Often marked W, or described as golden, honey or caramel.',
  cool: 'Pink and red-based shades. Often marked C, or described as rosy, porcelain or beige-pink.',
  neutral: 'Balanced shades that lean neither gold nor pink. Often marked N or "natural".',
  olive: 'Green-grey based shades. Standard warm and cool ranges often read ashy, so look for shades named olive.',
};

type Step = 'questions' | 'result';

export default function UndertoneConfirmScreen() {
  const router = useRouter();
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const scanIdNum = Number(scanId);

  const [step, setStep] = useState<Step>('questions');
  const [foundationProblem, setFoundationProblem] = useState<FoundationProblem | null>(null);
  const [jewelryPreference, setJewelryPreference] = useState<JewelryPreference | null>(null);
  const [veinColor, setVeinColor] = useState<VeinColor | null>(null);
  const allAnswered = foundationProblem != null && jewelryPreference != null && veinColor != null;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UndertoneResult | null>(null);
  const [recs, setRecs] = useState<RecommendationsResult | null>(null);

  const handleEstimate = async () => {
    if (!scanIdNum) {
      setError('Missing scan. Go back and complete a skin scan first.');
      return;
    }
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await estimateUndertone(API_BASE_URL, scanIdNum, {
        foundation_problem: foundationProblem!,
        jewelry_preference: jewelryPreference!,
        vein_color: veinColor!,
      });
      setResult(res);

      // The estimate is accepted on the user's behalf rather than asked about.
      // The scan still needs marking as confirmed for the rest of the flow, and
      // the four comparison cards this replaced asked people to arbitrate a
      // judgement they came here to get an answer to.
      await confirmUndertone(API_BASE_URL, res.scan_id, true, null);
      await setLocalScanId(res.scan_id);

      // Best match is fetched here so the result page can show the actual shade
      // colour. A failure is non-fatal -- the depth/undertone overview is still
      // worth showing, and the recommendations tab remains reachable.
      const profileId = await getLocalProfileId();
      if (profileId != null) {
        try {
          setRecs(await getRecommendations(API_BASE_URL, profileId, res.scan_id, 'foundation'));
        } catch {
          setRecs(null);
        }
      }
      setStep('result');
    } catch (e) {
      setError((e as Error).message || 'Could not estimate undertone. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'questions') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>A Few Quick Questions</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.hero}>
            <Text style={styles.heroLead}>A few</Text>
            <Text style={styles.heroTitle}>Quick Questions</Text>
            <Text style={styles.heroBody}>
              These help us refine your undertone estimate. &quot;I don&apos;t know&quot; is
              always a valid answer.
            </Text>
          </View>

          <QuestionCard
            icon="color-filter"
            title="Which foundation problem happens most often?"
            style={styles.whiteCard}
          >
            <ChipGroup options={FOUNDATION_PROBLEM_OPTIONS} value={foundationProblem} onChange={setFoundationProblem} />
          </QuestionCard>

          <QuestionCard
            icon="diamond"
            title="Which jewellery looks more natural on you?"
            style={styles.whiteCard}
          >
            <ChipGroup options={JEWELRY_OPTIONS} value={jewelryPreference} onChange={setJewelryPreference} />
          </QuestionCard>

          <QuestionCard
            icon="pulse"
            title="What colour do your wrist veins appear in daylight?"
            style={styles.whiteCard}
          >
            <ChipGroup options={VEIN_OPTIONS} value={veinColor} onChange={setVeinColor} />
          </QuestionCard>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[shared.primaryBtn, (!allAnswered || submitting) && shared.primaryBtnDisabled]}
            onPress={handleEstimate}
            disabled={!allAnswered || submitting}
            activeOpacity={0.85}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={shared.primaryBtnText}>Continue</Text>}
          </TouchableOpacity>

          {!allAnswered && (
            <Text style={styles.validationHint}>Answer all three questions above to continue</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'result' && result) {
    const topMatch = recs?.recommendations?.[0] ?? null;
    const depthCategory = recs?.depth_category ?? '';
    const depthLabel = depthCategory
      ? depthCategory.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : null;

    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>Your Result</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {(() => {
            const match = UNDERTONE_CARDS.find((c) => c.value === result.category);
            const accent = match?.color ?? PINK;
            const lowConfidence = result.confidence < 45;
            return (
              <View style={styles.resultSummary}>
                <View style={[styles.resultAccent, { backgroundColor: accent }]} />
                <Text style={styles.resultLabel}>LIKELY UNDERTONE</Text>

                <View style={styles.resultValueRow}>
                  <View style={[styles.resultDot, { backgroundColor: accent }]} />
                  <Text style={styles.resultValue}>{match?.label}</Text>
                </View>

                {/* Confidence as a bar, not a bare "49%". A percentage invites
                    the reader to treat it as precision; a part-filled bar reads
                    as "this much sure", which is what it actually means. */}
                <View style={styles.confidenceTrack}>
                  <View
                    style={[
                      styles.confidenceFill,
                      { width: `${Math.max(4, Math.min(100, result.confidence))}%`, backgroundColor: accent },
                    ]}
                  />
                </View>
                <Text style={styles.confidenceCaption}>
                  {result.confidence}% confident
                  {lowConfidence ? ' · treat as a starting point' : ''}
                </Text>

                {match ? <Text style={styles.resultDescription}>{match.description}</Text> : null}

                {/* Depth sits alongside undertone because they are the two axes
                    of a shade match, and a user reading only one of them will
                    pick the wrong product. */}
                {depthLabel ? (
                  <View style={styles.depthChip}>
                    <Text style={styles.depthChipLabel}>SKIN DEPTH</Text>
                    <Text style={styles.depthChipValue}>{depthLabel}</Text>
                  </View>
                ) : null}
              </View>
            );
          })()}

          {/* The match itself. Two swatches side by side answer "did this work?"
              far more directly than a Delta E number or a shade code. */}
          {topMatch && (
            <View style={styles.matchCard}>
              <Text style={styles.sectionLabel}>YOUR CLOSEST FOUNDATION</Text>

              <View style={styles.swatchPairRow}>
                {recs?.skin_hex ? (
                  <View style={styles.swatchCol}>
                    <View style={[styles.bigSwatch, { backgroundColor: recs.skin_hex }]} />
                    <Text style={styles.swatchCaption}>Your skin</Text>
                  </View>
                ) : null}
                <View style={styles.swatchCol}>
                  <View style={[styles.bigSwatch, styles.bigSwatchShade, { backgroundColor: topMatch.swatch_hex }]} />
                  <Text style={styles.swatchCaption}>This shade</Text>
                </View>
              </View>

              <Text style={styles.matchBrand}>{topMatch.brand}</Text>
              <Text style={styles.matchProduct}>{topMatch.product_line}</Text>
              <View style={styles.shadeNamePill}>
                <Text style={styles.shadeNameText}>Shade {topMatch.shade_name}</Text>
              </View>

              {recs?.catalog_gap ? (
                <Text style={styles.matchWarn}>
                  Nothing in our range is a close colour match yet. This is the nearest we carry.
                </Text>
              ) : null}
            </View>
          )}

          <View style={styles.guideCard}>
            <Text style={styles.sectionLabel}>WHAT TO LOOK FOR</Text>
            <View style={styles.guideRow}>
              <Ionicons name="color-filter-outline" size={17} color={PINK} />
              <Text style={styles.guideText}>
                <Text style={styles.guideStrong}>Depth · </Text>
                Shades labelled {DEPTH_HINTS[depthCategory] ?? 'close to your skin depth'}.
              </Text>
            </View>
            <View style={styles.guideRow}>
              <Ionicons name="sunny-outline" size={17} color={PINK} />
              <Text style={styles.guideText}>
                <Text style={styles.guideStrong}>Undertone · </Text>
                {UNDERTONE_HINTS[result.category]}
              </Text>
            </View>
            <View style={styles.guideRow}>
              <Ionicons name="bulb-outline" size={17} color={PINK} />
              <Text style={styles.guideText}>
                <Text style={styles.guideStrong}>Before you buy · </Text>
                Swatch along your jaw and check it in daylight. The shade that disappears is the match.
              </Text>
            </View>
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={() => router.replace('/recommendations')}
          >
            <Text style={styles.primaryBtnText}>See Recommended Shades</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.retakeLink} onPress={() => router.replace('/home')}>
            <Text style={styles.retakeLinkText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
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

  hero: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 22,
    marginBottom: 16,
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  heroLead: { fontFamily: SERIF, fontSize: 27, color: '#1A1A1A', lineHeight: 33 },
  heroTitle: {
    fontFamily: SERIF,
    fontSize: 27,
    fontWeight: '700',
    color: PINK,
    lineHeight: 34,
    marginBottom: 10,
  },
  heroBody: { fontSize: 13.5, color: BODY, lineHeight: 19 },
  whiteCard: { backgroundColor: '#fff' },

  resultSummary: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginBottom: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  // Accent stripe carries the undertone's own colour, so the card is tinted by
  // the result rather than by the app's brand pink.
  resultAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  resultLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#A899A1',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  resultValueRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 },
  resultDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  resultValue: { fontFamily: SERIF, fontSize: 29, fontWeight: '700', color: '#1A1A1A' },
  confidenceTrack: {
    width: '68%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EFE7EB',
    overflow: 'hidden',
  },
  confidenceFill: { height: '100%', borderRadius: 3 },
  confidenceCaption: {
    fontSize: 12.5,
    color: '#8A7C83',
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 12,
  },
  resultDescription: {
    fontSize: 14,
    color: '#6E6169',
    textAlign: 'center',
    lineHeight: 20.5,
  },
  depthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F6F1F4',
  },
  depthChipLabel: { fontSize: 9.5, fontWeight: '800', color: '#A899A1', letterSpacing: 1 },
  depthChipValue: { fontSize: 13.5, fontWeight: '800', color: '#1A1A1A' },

  sectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#A899A1',
    letterSpacing: 1.2,
    marginBottom: 14,
    textAlign: 'center',
  },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  swatchPairRow: { flexDirection: 'row', gap: 18, marginBottom: 18 },
  swatchCol: { alignItems: 'center', gap: 7 },
  bigSwatch: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  bigSwatchShade: { borderWidth: 2, borderColor: PINK },
  swatchCaption: { fontSize: 11, fontWeight: '600', color: '#8A7C83' },
  matchBrand: { fontFamily: SERIF, fontSize: 20, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  matchProduct: {
    fontSize: 13.5,
    color: '#7C6F75',
    textAlign: 'center',
    marginTop: 3,
    marginBottom: 12,
    lineHeight: 19,
  },
  shadeNamePill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: PINK_LIGHT,
  },
  shadeNameText: { fontSize: 14, fontWeight: '800', color: PINK },
  matchWarn: {
    fontSize: 12.5,
    color: '#B26A00',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },

  guideCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  guideRow: { flexDirection: 'row', gap: 11, marginBottom: 13, alignItems: 'flex-start' },
  guideText: { flex: 1, fontSize: 13.5, color: '#6E6169', lineHeight: 20 },
  guideStrong: { fontWeight: '800', color: '#1A1A1A' },



  errorText: { color: '#C62828', fontSize: 14, textAlign: 'center', marginBottom: 10 },

  primaryBtn: {
    backgroundColor: PINK,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: PINK,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  validationHint: { fontSize: 13, color: '#A0A0A0', textAlign: 'center', marginTop: 10 },

  retakeLink: { alignItems: 'center', marginTop: 16 },
  retakeLinkText: { fontSize: 14, fontWeight: '600', color: '#A0A0A0' },
});
