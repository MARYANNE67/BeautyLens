/**
 * Shared building blocks for the beauty-profile questionnaire, used by both
 * the onboarding flow and the profile editor.
 *
 * These two screens ask exactly the same four questions, so they're extracted
 * rather than duplicated -- otherwise a styling tweak to one silently leaves
 * the other looking different (the same reason LensMark was pulled out).
 */
import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const PINK = '#C2185B';
export const PINK_SOFT = '#FDEEF4';
export const PINK_BORDER = '#F3A6C4';
export const TEXT = '#1A1A1A';
export const MUTED = '#8A8A8A';
export const BODY = '#5C5158';

/** Near-white with a pink tint -- every card surface, never pure white. */
export const CARD_BG = '#FDF7F9';
/**
 * The app's standard page background, matching Home. Used by every normal
 * screen; only the onboarding intro departs from it with PAGE_GRADIENT.
 */
export const PAGE_BG = '#F6F1F4';
/** Page background gradient: the deeper of the two, so cards read against it. */
export const PAGE_GRADIENT = ['#F7E7EE', '#F9F0F3'] as const;
/** Hero card gradient: near-white, lighter than the page. */
export const HERO_GRADIENT = ['#FCF4F7', '#FDF9FA'] as const;

// Both platforms ship a serif, so the headline look needs no bundled font.
export const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * Card with a pink icon badge and a heading.
 *
 * `style` overrides the default tinted surface -- the profile editor uses
 * white cards while onboarding keeps CARD_BG, so the fill has to be a
 * per-screen decision rather than baked into the shared style.
 */
export function QuestionCard({
  icon,
  title,
  hint,
  children,
  style,
}: {
  icon: IoniconName;
  title: string;
  hint?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Ionicons name={icon} size={18} color={PINK} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {hint && <Text style={styles.cardHint}>{hint}</Text>}
        </View>
      </View>
      {children}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
    shadowColor: '#B9718F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PINK_SOFT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  cardHint: { fontSize: 12.5, color: MUTED, marginTop: 2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1.3,
    borderColor: '#EDE2E7',
  },
  chipSelected: { backgroundColor: PINK_SOFT, borderColor: PINK_BORDER },
  chipText: { fontSize: 14, fontWeight: '600', color: BODY },
  chipTextSelected: { color: PINK, fontWeight: '700' },

  budgetInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.3,
    borderColor: '#EDE2E7',
    paddingHorizontal: 14,
  },
  budgetPrefix: { fontSize: 16, fontWeight: '700', color: MUTED, marginRight: 6 },
  budgetInput: { flex: 1, paddingVertical: 13, fontSize: 15.5, color: TEXT },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: PINK,
    borderRadius: 18,
    paddingVertical: 18,
    marginTop: 6,
    shadowColor: PINK,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  primaryBtnText: { fontSize: 16.5, fontWeight: '700', color: '#fff' },
});
