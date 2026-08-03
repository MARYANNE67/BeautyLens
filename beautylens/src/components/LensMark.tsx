/**
 * The BeautyLens brand mark: concentric rings with a glowing core, drawn as
 * plain Views so it stays crisp at any size and needs no asset.
 *
 * Originally lived inside home.tsx; extracted so the login screen shows the
 * same logo instead of a lookalike. Proportions are ratios of `size`, so the
 * two placements can differ in scale without drifting apart visually.
 *
 * Defaults reproduce the pink mark used on the home scan card. Pass `onColor`
 * for placement on a saturated background (e.g. the login screen's pink
 * gradient), where the pink-on-pink version would disappear.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const PINK = '#C2185B';
const PINK_MID = '#E91E8C';

// Ratios taken from the original 76px mark so the design is preserved exactly.
const MID_RATIO = 52 / 76;
const CORE_RATIO = 18 / 76;
const GLINT_RATIO = 7 / 76;
const GLINT_INSET_RATIO = 11 / 76;

export function LensMark({
  size = 76,
  onColor = false,
  style,
}: {
  size?: number;
  /** True when rendered on a saturated background -- switches to a white mark. */
  onColor?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const mid = size * MID_RATIO;
  const core = size * CORE_RATIO;
  const glint = size * GLINT_RATIO;
  const glintInset = size * GLINT_INSET_RATIO;

  const ringColor = onColor ? '#fff' : PINK;
  const glowColor = onColor ? '#fff' : PINK_MID;
  const outerRingColor = onColor ? 'rgba(255,255,255,0.45)' : 'rgba(194,24,91,0.35)';
  const glintColor = onColor ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)';

  return (
    <View
      style={[
        { width: size, height: size, justifyContent: 'center', alignItems: 'center' },
        style,
      ]}
    >
      <View
        style={[
          styles.absolute,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderColor: outerRingColor,
          },
        ]}
      />
      <View
        style={[
          styles.absolute,
          styles.glow,
          {
            width: mid,
            height: mid,
            borderRadius: mid / 2,
            borderWidth: 3,
            borderColor: ringColor,
            shadowColor: glowColor,
            shadowRadius: 10,
            shadowOpacity: 0.9,
          },
        ]}
      />
      <View
        style={[
          styles.glow,
          {
            width: core,
            height: core,
            borderRadius: core / 2,
            backgroundColor: ringColor,
            shadowColor: glowColor,
            shadowRadius: 8,
            shadowOpacity: 1,
          },
        ]}
      />
      <View
        style={{
          position: 'absolute',
          top: glintInset,
          right: glintInset,
          width: glint,
          height: glint,
          borderRadius: glint / 2,
          backgroundColor: glintColor,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: { position: 'absolute' },
  glow: {
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});

export default LensMark;
