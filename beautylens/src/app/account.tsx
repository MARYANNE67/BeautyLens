/**
 * Beauty profile editor: the same four questions onboarding asks, reachable
 * later from Home's avatar and the Settings tab so answers can be changed
 * without redoing onboarding.
 *
 * Shares its card/chip components with onboarding (see components/ProfileFields)
 * so the two stay visually identical.
 */
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { LensMark } from '../components/LensMark';
import {
  ChipGroup,
  QuestionCard,
  styles as shared,
  BODY,
  PAGE_BG,
  PINK,
  SERIF,
  TEXT,
} from '../components/ProfileFields';
import { AppConfig } from '../config/featureFlags';
import { createProfile, getProfile, updateProfile } from '../services/api';
import { getLocalProfileId, setLocalProfileId } from '../utils/profileStorage';
import type {
  BeautyProfileInput,
  CoveragePreference,
  FinishPreference,
  SkinType,
} from '../types';


const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;

const DEFAULT_PROFILE: BeautyProfileInput = {
  skin_type: 'uncertain',
  coverage_preference: 'uncertain',
  finish_preference: 'uncertain',
  budget_max: null,
};

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

export default function AccountScreen() {
  const router = useRouter();

  const [profileId, setProfileId] = useState<number | null>(null);
  const [profile, setProfile] = useState<BeautyProfileInput>(DEFAULT_PROFILE);
  const [budgetText, setBudgetText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const localId = await getLocalProfileId();
        if (localId != null) {
          const existing = await getProfile(API_BASE_URL, localId);
          setProfileId(existing.id);
          setProfile({
            skin_type: existing.skin_type,
            coverage_preference: existing.coverage_preference,
            finish_preference: existing.finish_preference,
            budget_max: existing.budget_max,
          });
          setBudgetText(existing.budget_max != null ? String(existing.budget_max) : '');
        }
      } catch (e) {
        console.log('[Account] Failed to load existing profile:', (e as Error).message);
        // Falls back to a fresh profile form — the user can still create a new one.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const budget = budgetText.trim() === '' ? null : Number(budgetText);
      const payload: BeautyProfileInput = {
        ...profile,
        budget_max: budget != null && !Number.isNaN(budget) ? budget : null,
      };

      if (profileId == null) {
        const created = await createProfile(API_BASE_URL, payload);
        setProfileId(created.id);
        await setLocalProfileId(created.id);
      } else {
        await updateProfile(API_BASE_URL, profileId, payload);
      }
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.screen}>
          <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={PINK} size="large" />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Beauty Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Hero, matching onboarding's welcome panel */}
            <View style={styles.hero}>
              <View style={styles.heroContent}>
                <LensMark size={48} style={{ marginBottom: 14 }} />
                <Text style={styles.heroWelcome}>Your</Text>
                <Text style={styles.heroBrand}>Beauty Profile</Text>
                <Text style={styles.heroBody}>
                  These answers shape your foundation and concealer matches. Change
                  them any time &mdash; &quot;I don&apos;t know&quot; is always a valid answer.
                </Text>
              </View>
            </View>

            <QuestionCard icon="water" title="Is your skin usually..." style={styles.whiteCard}>
              <ChipGroup
                options={SKIN_TYPE_OPTIONS}
                value={profile.skin_type}
                onChange={(v) => setProfile((p) => ({ ...p, skin_type: v }))}
              />
            </QuestionCard>

            <QuestionCard icon="layers" title="Preferred coverage" style={styles.whiteCard}>
              <ChipGroup
                options={COVERAGE_OPTIONS}
                value={profile.coverage_preference}
                onChange={(v) => setProfile((p) => ({ ...p, coverage_preference: v }))}
              />
            </QuestionCard>

            <QuestionCard icon="contrast" title="Preferred finish" style={styles.whiteCard}>
              <ChipGroup
                options={FINISH_OPTIONS}
                value={profile.finish_preference}
                onChange={(v) => setProfile((p) => ({ ...p, finish_preference: v }))}
              />
            </QuestionCard>

            <QuestionCard
              icon="pricetag"
              title="Approximate budget"
              hint="Leave blank if you're not sure"
              style={styles.whiteCard}
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
            {savedAt && !error && <Text style={styles.savedText}>Profile saved</Text>}

            <TouchableOpacity
              style={[shared.primaryBtn, saving && shared.primaryBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={shared.primaryBtnText}>
                  {profileId == null ? 'Save Profile' : 'Update Profile'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 36 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: SERIF, fontSize: 20, fontWeight: '700', color: TEXT },

  hero: {
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  whiteCard: { backgroundColor: '#fff' },
  heroContent: { paddingHorizontal: 20, paddingVertical: 22 },
  heroWelcome: { fontFamily: SERIF, fontSize: 27, color: TEXT, lineHeight: 33 },
  heroBrand: {
    fontFamily: SERIF,
    fontSize: 27,
    fontWeight: '700',
    color: PINK,
    lineHeight: 34,
    marginBottom: 10,
  },
  heroBody: { fontSize: 13.5, color: BODY, lineHeight: 19 },

  errorText: { color: '#C62828', fontSize: 14, textAlign: 'center', marginBottom: 10 },
  savedText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
});
