/**
 * Collection tab: the user's own makeup -- saved shades, products they own,
 * and open dates for expiry tracking.
 *
 * Placeholder for now. The tab exists so the navigation is final while the
 * feature is built; the copy states plainly that it's not ready rather than
 * showing an empty list that looks broken.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { MUTED, PAGE_BG, PINK, PINK_SOFT, SERIF, TEXT } from '../../components/ProfileFields';

const UPCOMING: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }[] = [
  {
    icon: 'bookmark',
    title: 'Saved shades',
    body: 'Keep the matches you liked from Shade Match in one place.',
  },
  {
    icon: 'cube',
    title: 'Your products',
    body: 'Add the foundations and concealers you already own.',
  },
  {
    icon: 'calendar',
    title: 'Open dates',
    body: 'Track when you opened a product so you know when to replace it.',
  },
];

export default function CollectionScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>Collection</Text>

        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="bag-handle-outline" size={38} color={PINK} />
          </View>
          <Text style={styles.emptyTitle}>Coming soon</Text>
          <Text style={styles.emptyBody}>
            This is where your makeup bag will live. Nothing to show yet.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>WHAT&apos;S COMING</Text>
        <View style={styles.group}>
          {UPCOMING.map((item, i) => (
            <View
              key={item.title}
              style={[styles.row, i < UPCOMING.length - 1 && styles.rowDivider]}
            >
              <View style={styles.rowIcon}>
                <Ionicons name={item.icon} size={18} color={PINK} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{item.title}</Text>
                <Text style={styles.rowHint}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
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

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 34,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: PINK_SOFT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: TEXT, marginBottom: 6 },
  emptyBody: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },

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
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F1E4EA' },
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
});
