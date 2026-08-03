/**
 * Sign in / create account.
 *
 * One screen handles both modes so the user never loses what they typed when
 * they realise they're on the wrong one -- the email and password carry over
 * when toggling. Routing away after success is handled centrally by the auth
 * gate in _layout.tsx, so this screen never navigates by itself.
 *
 * Layout is a full-bleed photo with the brand mark over it and the form in a
 * white card anchored to the bottom.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { LensMark } from '../components/LensMark';
import { SERIF } from '../components/ProfileFields';
import { useAuth } from '../contexts/AuthContext';
import { FIREBASE_SETUP_HINT } from '../config/firebase';

const PINK = '#C2185B';
const TEXT = '#1A1A1A';
const MUTED = '#8A8A8A';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const {
    isConfigured,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
  } = useAuth();

  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length > 0 && !busy,
    [email, password, busy]
  );

  const switchMode = useCallback(() => {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setError(null);
    setNotice(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
      // No navigation here: the auth gate reacts to the new user and redirects.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canSubmit, isSignUp, signUpWithEmail, signInWithEmail, email, password, name]);

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim()) {
      setError('Enter your email address first, then tap “Forgot password”.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await sendPasswordReset(email);
      setNotice(`Password reset link sent to ${email.trim()}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [email, sendPasswordReset]);

  return (
    <ImageBackground
      source={require('../../assets/images/sign-in-image.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <StatusBar barStyle="light-content" />

      {/* Keeps the white brand text legible over the brighter parts of the
          photo without dulling the image behind the card. */}
      <LinearGradient
        colors={['rgba(30,10,22,0.35)', 'rgba(30,10,22,0.10)', 'rgba(30,10,22,0.30)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.hero}>
            <LensMark size={80} onColor style={{ marginBottom: 12 }} />
            <Text style={styles.heroTitle}>BeautyLens</Text>
            <Text style={styles.heroSubtitle}>Find your perfect shade</Text>
          </View>

          {!isConfigured && (
            <View style={styles.setupBanner}>
              <Ionicons name="warning-outline" size={18} color="#8A6100" />
              <Text style={styles.setupBannerText}>{FIREBASE_SETUP_HINT}</Text>
            </View>
          )}

          <View style={[styles.card, { paddingBottom: 24 + insets.bottom }]}>
            <View style={styles.segment}>
              <TouchableOpacity
                style={[styles.segmentBtn, !isSignUp && styles.segmentBtnActive]}
                onPress={() => (isSignUp ? switchMode() : undefined)}
                activeOpacity={0.85}
              >
                <Text style={[styles.segmentText, !isSignUp && styles.segmentTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, isSignUp && styles.segmentBtnActive]}
                onPress={() => (!isSignUp ? switchMode() : undefined)}
                activeOpacity={0.85}
              >
                <Text style={[styles.segmentText, isSignUp && styles.segmentTextActive]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {isSignUp && (
              <View style={styles.field}>
                <Text style={styles.label}>Name</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={18} color={MUTED} />
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="How should we greet you?"
                    placeholderTextColor="#B8B8B8"
                    autoCapitalize="words"
                    autoComplete="name"
                    editable={!busy}
                  />
                </View>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={18} color={MUTED} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#B8B8B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!busy}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={MUTED} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignUp ? 'At least 6 characters' : 'Your password'}
                  placeholderTextColor="#B8B8B8"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  editable={!busy}
                  onSubmitEditing={handleSubmit}
                  returnKeyType="go"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((s) => !s)}
                  hitSlop={10}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={MUTED}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {!isSignUp && (
              <TouchableOpacity
                onPress={handleForgotPassword}
                disabled={busy}
                style={styles.forgotBtn}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={17} color="#C62828" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {notice && (
              <View style={styles.noticeBox}>
                <Ionicons name="checkmark-circle-outline" size={17} color="#2E7D32" />
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={switchMode} disabled={busy} style={styles.switchBtn}>
              <Text style={styles.switchText}>
                {isSignUp ? 'Already have an account? ' : 'New here? '}
                <Text style={styles.switchTextAccent}>
                  {isSignUp ? 'Sign in' : 'Create one'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#2A1620' },
  // flexGrow + flex-end keeps the card pinned to the bottom on tall screens
  // while still allowing the whole thing to scroll when the keyboard is up.
  scroll: { flexGrow: 1, justifyContent: 'flex-end' },

  hero: {
    flex: 1,
    // flex-end, not center: centering pushed the wordmark up over the model's
    // face. Anchoring to the bottom keeps the logo/title/subtitle grouped just
    // above the card, and lets the photo breathe above them.
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 34,
    minHeight: 240,
  },
  heroTitle: {
    // The brand wordmark is always set in the serif, on every screen.
    // Georgia ships regular + bold only, so 700 rather than 800.
    fontFamily: SERIF,
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  heroSubtitle: {
    fontSize: 14.5,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  setupBanner: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: '#FFF6DF',
    borderRadius: 12,
    padding: 13,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  setupBannerText: {
    flex: 1,
    fontSize: 12.5,
    color: '#8A6100',
    lineHeight: 18,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    marginHorizontal: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },

  segment: {
    flexDirection: 'row',
    backgroundColor: '#F7EFF3',
    borderRadius: 14,
    padding: 5,
    marginBottom: 22,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: { fontSize: 15.5, fontWeight: '700', color: MUTED },
  segmentTextActive: { color: PINK },

  field: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F7F3F5',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 15.5,
    color: TEXT,
  },

  forgotBtn: { alignSelf: 'flex-end', paddingVertical: 4, marginBottom: 10 },
  forgotText: { fontSize: 14, fontWeight: '700', color: PINK },

  errorBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#FDECEC',
    borderRadius: 11,
    padding: 11,
    marginBottom: 12,
  },
  errorText: { flex: 1, fontSize: 13.5, color: '#C62828', lineHeight: 19 },

  noticeBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#E9F6EA',
    borderRadius: 11,
    padding: 11,
    marginBottom: 12,
  },
  noticeText: { flex: 1, fontSize: 13.5, color: '#2E7D32', lineHeight: 19 },

  primaryBtn: {
    backgroundColor: PINK,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    shadowColor: PINK,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  primaryBtnText: { fontSize: 16.5, fontWeight: '700', color: '#fff' },

  switchBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 4 },
  switchText: { fontSize: 14.5, color: MUTED },
  switchTextAccent: { color: PINK, fontWeight: '700' },
});
