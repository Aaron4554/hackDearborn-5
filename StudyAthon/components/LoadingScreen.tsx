import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

export default function LoadingScreen({ label = 'Getting things ready…' }: { label?: string }) {
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
      <View style={styles.logoMark}><Text style={styles.logoGlyph}>✦</Text></View>
      <View style={styles.book}>
        <View style={styles.leftPage} />
        <View style={styles.rightPage} />
        <View style={styles.spine} />
        <Animated.View style={[styles.flippingPage, pageStyle]} />
        <View style={styles.bookBase} />
      </View>
      <Text style={styles.brand}>studyathon</Text>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8F5',
  },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#477B5B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  logoGlyph: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  book: { width: 126, height: 86, flexDirection: 'row', position: 'relative' },
  leftPage: {
    width: 61,
    height: 72,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 5,
    backgroundColor: '#FFFFFF',
    borderColor: '#E3EAE3',
    borderWidth: 1,
    marginTop: 4,
  },
  rightPage: {
    width: 61,
    height: 72,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 5,
    backgroundColor: '#E9F0E8',
    borderColor: '#DCE6DB',
    borderWidth: 1,
    marginTop: 4,
  },
  spine: {
    position: 'absolute',
    zIndex: 2,
    left: 62,
    top: 6,
    bottom: 8,
    width: 2,
    backgroundColor: '#91AE96',
  },
  flippingPage: {
    position: 'absolute',
    zIndex: 3,
    left: 63,
    top: 4,
    width: 59,
    height: 73,
    backgroundColor: '#FFFFFF',
    borderColor: '#DFE8DF',
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
    backgroundColor: '#91AE96',
  },
  brand: { color: '#2B3A30', fontSize: 18, fontWeight: '800', marginTop: 24, letterSpacing: -0.4 },
  label: { color: '#869188', fontSize: 13, marginTop: 7 },
  progressTrack: { width: 88, height: 3, borderRadius: 2, backgroundColor: '#E5EBE4', marginTop: 22, overflow: 'hidden' },
  progressFill: { width: 44, height: 3, borderRadius: 2, backgroundColor: '#6D9675' },
});
