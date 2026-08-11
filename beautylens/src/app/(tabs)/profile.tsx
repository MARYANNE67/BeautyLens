/**
 * Profile tab: who you're signed in as, plus account actions.
 *
 * The editable beauty profile (skin type, coverage, finish, budget) lives on
 * its own /account screen; this tab links to it rather than duplicating it.
 *
 * Uses the app's standard page background (PAGE_BG, same as Home) with white
 * grouped cards -- chrome, not a branded flow, so it skips the onboarding
 * gradient. "Profile" is a screen title, not the brand wordmark, so it stays
 * sans; only "BeautyLens" itself is set in the serif.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  MUTED,
  PAGE_BG,
  PINK,
  PINK_SOFT,
  TEXT,
  type IoniconName,
  SERIF,
} from '../../components/ProfileFields';
import { useAuth } from '../../contexts/AuthContext';

function Row({
  icon,
  label,
  hint,
  onPress,
  disabled,
  isLast,
}: {
  icon: IoniconName;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, !isLast && styles.rowDivider, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={PINK} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={17} color="#CDBFC6" />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profileId, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const displayName = user?.displayName?.trim() || 'Beauty Lover';
  const email = user?.email || 'No email on file';
  const initial = (user?.displayName?.trim() || user?.email || '?').charAt(0).toUpperCase();

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign out?',
      'Your scans and matches stay saved to your account. You can sign back in any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await signOut();
              // The auth gate in _layout.tsx sees the cleared user and routes
              // to /login, so there's nothing to navigate to from here.
            } catch (e) {
              Alert.alert('Could not sign out', (e as Error).message);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [signOut]);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.screenTitle}>Profile</Text>

          <View style={styles.accountCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.accountEmail} numberOfLines={1}>
                {email}
              </Text>
            </View>
            {user?.emailVerified && (
              <View style={styles.verifiedPill}>
                <Ionicons name="checkmark-circle" size={13} color="#2E7D32" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.group}>
            <Row
              icon="color-palette"
              label="Beauty Profile"
              hint="Skin type, coverage, finish and budget"
              onPress={() => router.push('/account')}
              disabled={busy}
            />
            <Row
              icon="scan"
              label="Redo Skin Scan"
              hint="Recapture your depth and undertone"
              onPress={() => router.push('/skin-scan')}
              disabled={busy}
              isLast
            />
          </View>

          <Text style={styles.sectionLabel}>SESSION</Text>
          <View style={styles.group}>
            <Row
              icon="log-out"
              label="Sign Out"
              hint="You'll need to sign in again to see your matches"
              onPress={handleSignOut}
              disabled={busy}
              isLast
            />
          </View>

          {busy && (
            <View style={styles.busyRow}>
              <ActivityIndicator color={PINK} />
            </View>
          )}

          <Text style={styles.footnote}>
            BeautyLens{profileId != null ? ` · Profile #${profileId}` : ''}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { paddingHorizontal: 14, paddingBottom: 40 },

  screenTitle: {
    fontFamily: SERIF,
    fontSize: 28,
    fontWeight: '700',
    color: TEXT,
    marginTop: 10,
    marginBottom: 18,
    marginLeft: 4,
  },

  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: PINK_SOFT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: PINK },
  accountName: { fontSize: 16.5, fontWeight: '700', color: TEXT },
  accountEmail: { fontSize: 13.5, color: MUTED, marginTop: 2 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E9F6EA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  verifiedText: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },

  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B49AA6',
    letterSpacing: 0.8,
    marginTop: 26,
    marginBottom: 9,
    marginLeft: 6,
  },
  group: {
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  // Inset divider, aligned to the label rather than the card edge.
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F1E4EA' },
  rowDisabled: { opacity: 0.5 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PINK_SOFT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: { fontSize: 15.5, fontWeight: '700', color: TEXT },
  rowHint: { fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 17 },

  busyRow: { marginTop: 20, alignItems: 'center' },

  footnote: {
    fontSize: 12,
    color: '#C2B3BA',
    textAlign: 'center',
    marginTop: 30,
  },
});
