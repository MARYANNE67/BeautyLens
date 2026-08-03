import { useEffect } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../contexts/AuthContext';

const PINK = '#C2185B';
const BG = '#F6F1F4';

/**
 * Post-login landing decision.
 *
 * Identity now comes from the auth session rather than a bare AsyncStorage id,
 * so this waits for POST /auth/session to report which profile this account
 * owns. A freshly created profile has nothing in it, so that user goes to
 * onboarding; a profile that already existed (or was just claimed from this
 * device's pre-auth data) goes straight to home with its scan history intact.
 *
 * Imperative router.replace() rather than the declarative <Redirect>
 * component, since <Redirect> into a nested tab navigator is a known
 * source of navigation-ready-timing issues on some Expo Router versions.
 */
export default function Index() {
  const router = useRouter();
  const { profileId, profileOrigin, sessionError, refreshSession } = useAuth();

  useEffect(() => {
    if (profileId == null) return;
    router.replace(profileOrigin === 'created' ? '/onboarding' : '/home');
  }, [profileId, profileOrigin, router]);

  if (sessionError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Can&apos;t reach the server</Text>
        <Text style={styles.errorBody}>{sessionError}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void refreshSession()}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator color={PINK} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BG,
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 14,
    color: '#8A8A8A',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: PINK,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 34,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
