import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

export default function LoadingScreen({ label = 'Getting things ready…' }: { label?: string }) {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const pageProgress = useSharedValue(0);

  useEffect(() => {
    pageProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 720, easing: Easing.inOut(Easing.cubic) }),
        withDelay(220, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );

    return () => cancelAnimation(pageProgress);
  }, [pageProgress]);

  const pageStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 850 },
      { rotateY: `${interpolate(pageProgress.value, [0, 1], [0, -180])}deg` },
    ],
    opacity: interpolate(pageProgress.value, [0, 0.48, 0.52, 1], [1, 1, 0, 0.92]),
  }));
  const progressStyle = useAnimatedStyle(() => ({
    width: interpolate(pageProgress.value, [0, 1], [18, 70]),
  }));

  return (
    <View style={styles.screen} accessibilityRole="progressbar" accessibilityLabel={label}>
      <View style={styles.brandRow}>
        <View style={styles.book}>
          <View style={[styles.page, styles.leftPage]}>
            <View style={styles.pageLines}><View style={styles.pageLine} /><View style={styles.pageLine} /><View style={[styles.pageLine, styles.shortLine]} /></View>
          </View>
          <View style={[styles.page, styles.rightPage]}>
            <View style={styles.pageLines}><View style={styles.pageLine} /><View style={styles.pageLine} /><View style={[styles.pageLine, styles.shortLine]} /></View>
          </View>
          <View style={styles.spine} />
          <Animated.View style={[styles.flippingPage, pageStyle]} />
          <View style={styles.bookBase} />
        </View>
        <View style={styles.brandLockup}>
          <View style={styles.logoMark}><Ionicons name="book" size={18} color={theme.onAccent} /></View>
          <Text style={styles.brand}>studyathon</Text>
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>
    </View>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.page,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoMark: { width: 31, height: 31, borderRadius: 10, backgroundColor: theme.accentFill, alignItems: 'center', justifyContent: 'center' },
  book: { width: 112, height: 78, flexDirection: 'row', position: 'relative' },
  page: { width: 54, height: 66, borderWidth: 1, marginTop: 3 },
  leftPage: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 5,
    backgroundColor: theme.surface,
    borderColor: theme.border,
  },
  rightPage: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 5,
    backgroundColor: theme.accentSoft,
    borderColor: theme.borderStrong,
  },
  pageLines: { gap: 6, marginTop: 15, marginHorizontal: 8 },
  pageLine: { height: 2, borderRadius: 2, backgroundColor: theme.borderStrong, opacity: 0.75 },
  shortLine: { width: '65%' },
  spine: {
    position: 'absolute',
    zIndex: 2,
    left: 55,
    top: 6,
    bottom: 8,
    width: 2,
    backgroundColor: theme.neutralFill,
  },
  flippingPage: {
    position: 'absolute',
    zIndex: 3,
    left: 56,
    top: 4,
    width: 53,
    height: 67,
    backgroundColor: theme.surface,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 5,
    transformOrigin: 'left center',
    backfaceVisibility: 'hidden',
  },
  bookBase: {
    position: 'absolute',
    left: 2,
    right: 2,
    bottom: 4,
    height: 4,
    borderRadius: 3,
    backgroundColor: theme.neutralFill,
  },
  brand: { color: theme.accentText, fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  label: { color: theme.textMuted, fontSize: 13, marginTop: 7 },
  progressTrack: { width: 88, height: 3, borderRadius: 2, backgroundColor: theme.accentSoft, marginTop: 22, overflow: 'hidden' },
  progressFill: { width: 44, height: 3, borderRadius: 2, backgroundColor: theme.memoryFill },

  });
}
