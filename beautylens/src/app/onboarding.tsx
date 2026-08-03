/**
 * First-launch onboarding: the beauty-profile questionnaire (skin type,
 * coverage, finish, budget), asked once up front rather than only being
 * reachable from the profile editor. Nothing is pre-selected, including
 * "I don't know" -- every question requires an active tap before
 * Continue unlocks, so the saved profile always reflects a real choice,
 * not a default nobody picked.
 *
 * The camera-based skin scan is deliberately NOT part of this flow. It
 * needs camera permission and good lighting, which is real friction to put
 * in front of someone who hasn't seen any value yet. Saving instead drops
 * the user on Home, which shows a persistent "Start Skin Scan" prompt for as
 * long as no completed scan exists -- so the ask is still there, but only
 * once the user has seen what the app does.
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { LensMark } from '../components/LensMark';
import {
  ChipGroup,
  QuestionCard,
  styles as shared,
  HERO_GRADIENT,
  MUTED,
  PAGE_GRADIENT,
  PINK,
  SERIF,
  TEXT,
} from '../components/ProfileFields';
import { createProfile } from '../services/api';
import { AppConfig } from '../config/featureFlags';
import { setLocalProfileId } from '../utils/profileStorage';
import type { SkinType, CoveragePreference, FinishPreference } from '../types';



const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;

const SKIN_TYPE_OPTIONS: { value: SkinType; label: string }[] = [
  { value: 'dry', label: 'Dry' },
  { value: 'oily', label: 'Oily' },
  { value: 'combination', label: 'Combination' },
  { value: 'uncertain', label: "I don't know" },
];

const COVERAGE_OPTIONS: { value: CoveragePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'full', label: 'Full' },
  { value: 'uncertain', label: "I don't know" },
];

const FINISH_OPTIONS: { value: FinishPreference; label: string }[] = [
  { value: 'matte', label: 'Matte' },
  { value: 'natural', label: 'Natural' },
  { value: 'radiant', label: 'Radiant' },
  { value: 'uncertain', label: "I don't know" },
];

export default function OnboardingScreen() {
  const router = useRouter();

  const [skinType, setSkinType] = useState<SkinType | null>(null);
  const [coverage, setCoverage] = useState<CoveragePreference | null>(null);
  const [finish, setFinish] = useState<FinishPreference | null>(null);
  const [budgetText, setBudgetText] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = skinType != null && coverage != null && finish != null;

  const handleContinue = async () => {
    if (!allAnswered) return;
    setSaving(true);
    setError(null);
    try {
      const budget = budgetText.trim() === '' ? null : Number(budgetText);
      const created = await createProfile(API_BASE_URL, {
        skin_type: skinType!,
        coverage_preference: coverage!,
        finish_preference: finish!,
        budget_max: budget != null && !Number.isNaN(budget) ? budget : null,
      });
      await setLocalProfileId(created.id);
      // Straight to Home rather than an interstitial "Profile saved" screen:
      // Home already shows a persistent "Start Skin Scan" prompt whenever no
      // completed scan exists, so the interstitial only added a tap and asked
      // the same question in a form the user could dismiss forever.
      router.replace('/home');
    } catch (e) {
      setError((e as Error).message || 'Could not save your profile. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={PAGE_GRADIENT} style={StyleSheet.absoluteFillObject} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Hero */}
          <View style={styles.hero}>
            <LinearGradient
              colors={HERO_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Soft pink halo behind the product shot. Pink, not white: the
                card itself is near-white, so a white circle was invisible. */}
            <View style={styles.heroHalo} />
            <Image
              source={require('../../assets/images/makeup-product-onboarding_2.png')}
              style={styles.heroImage}
              resizeMode="contain"
            />

            <View style={styles.heroContent}>
              {/* Same pink brand mark as the home screen's scan card, rather
                  than a generic sparkles glyph. */}
              <LensMark size={48} style={{ marginBottom: 14 }} />
              <Text style={styles.heroWelcome}>Welcome to</Text>
              <Text style={styles.heroBrand}>BeautyLens</Text>
              <Text style={styles.heroBody}>
                A few quick questions help us match foundation and concealer shades to you.
                Answer honestly, including &quot;I don&apos;t know&quot; if you&apos;re not sure.
              </Text>
            </View>
          </View>

          {/* Solid glyphs rather than hairline outlines: at 18px inside a
              tinted circle the outline versions read as faint and generic. */}
          <QuestionCard icon="water" title="Is your skin usually...">
            <ChipGroup options={SKIN_TYPE_OPTIONS} value={skinType} onChange={setSkinType} />
          </QuestionCard>

          <QuestionCard icon="layers" title="Preferred coverage">
            <ChipGroup options={COVERAGE_OPTIONS} value={coverage} onChange={setCoverage} />
          </QuestionCard>

          {/* `contrast` depicts the matte-to-radiant spectrum this question
              asks about; `sparkles` was both vague and already in use for
              "Redo Skin Scan" in Settings. */}
          <QuestionCard icon="contrast" title="Preferred finish">
            <ChipGroup options={FINISH_OPTIONS} value={finish} onChange={setFinish} />
          </QuestionCard>

          <QuestionCard
            icon="pricetag"
            title="Approximate budget"
            hint="Optional, leave blank if you're not sure"
          >
            <View style={shared.budgetInputWrap}>
              <Text style={shared.budgetPrefix}>$</Text>
              <TextInput
                style={shared.budgetInput}
                value={budgetText}
                onChangeText={setBudgetText}
                placeholder="e.g. 40"
                placeholderTextColor="#B8B8B8"
                keyboardType="numeric"
              />
            </View>
          </QuestionCard>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[shared.primaryBtn, (!allAnswered || saving) && shared.primaryBtnDisabled]}
            onPress={handleContinue}
            disabled={!allAnswered || saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={shared.primaryBtnText}>Continue</Text>}
          </TouchableOpacity>

          {!allAnswered && (
            <Text style={styles.validationHint}>Answer all three questions above to continue</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9F0F3' },
  scroll: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 36 },

  /* Hero */
  hero: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    minHeight: 262,
    justifyContent: 'center',
  },
  heroHalo: {
    position: 'absolute',
    right: -40,
    top: 22,
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: 'rgba(240,203,221,0.55)',
  },
  // The artwork is 721x976 (portrait, ~0.739 w/h). Width is derived from that
  // ratio so `contain` fills the box exactly instead of letterboxing -- the
  // previous square dimensions were sized for the old 500x500 image.
  heroImage: {
    position: 'absolute',
    right: 2,
    bottom: 6,
    width: 163,
    height: 220,
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingVertical: 22,
    // Leaves the right side clear for the product shot.
    width: '62%',
  },
  heroWelcome: {
    fontFamily: SERIF,
    fontSize: 27,
    color: TEXT,
    lineHeight: 33,
  },
  heroBrand: {
    fontFamily: SERIF,
    fontSize: 27,
    fontWeight: '700',
    color: PINK,
    lineHeight: 34,
    marginBottom: 10,
  },
  heroBody: { fontSize: 13.5, color: '#5C5158', lineHeight: 19 },


  errorText: { color: '#C62828', fontSize: 14, textAlign: 'center', marginBottom: 10 },
  validationHint: { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 12 },

});
