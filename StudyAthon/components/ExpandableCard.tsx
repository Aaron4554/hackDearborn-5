import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Rect = { x: number; y: number; width: number; height: number };

function animateBack(
  x: SharedValue<number>,
  y: SharedValue<number>,
  width: SharedValue<number>,
  height: SharedValue<number>,
  rect: Rect,
  onFinish: () => void,
) {
  const timing = { duration: 220, easing: Easing.inOut(Easing.cubic) };
  x.value = withTiming(rect.x, timing);
  y.value = withTiming(rect.y, timing);
  width.value = withTiming(rect.width, timing);
  height.value = withTiming(rect.height, timing, (finished) => {
    if (finished) runOnJS(onFinish)();
  });
}

/** A tappable card that expands from its position into a centered, scrollable reader. */
export default function ExpandableCard({
  children,
  label = 'Read full text',
  backgroundColor = '#FFFFFF',
  borderColor = '#E5EAE5',
  textColor = '#26372B',
  style,
  expandButtonOnly = false,
  showExpandButton = true,
  expandedContent,
  autoExpand = false,
  confirmLabel,
  onConfirm,
  contentLength = 100,
}: {
  children: ReactNode;
  label?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
  /** Show a separate zoom control so the card itself can keep its own tap action. */
  expandButtonOnly?: boolean;
  showExpandButton?: boolean;
  expandedContent?: ReactNode;
  autoExpand?: boolean;
  confirmLabel?: string;
  onConfirm?: () => void;
  contentLength?: number;
}) {
  const anchor = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [anchorRect, setAnchorRect] = useState<Rect | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  const finishClose = () => {
    setVisible(false);
    setExpanded(false);
    onConfirm?.();
  };
  const animatedCardStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: width.value,
    height: height.value,
  }));

  const open = useCallback(() => {
    anchor.current?.measureInWindow((left, top, measuredWidth, measuredHeight) => {
      const rect = { x: left, y: top, width: measuredWidth, height: measuredHeight };
      const targetWidth = Math.max(0, Math.min(screenWidth - 40, 480));
      const availableHeight = screenHeight - insets.top - insets.bottom - 32;
      const estimatedLines = Math.max(1, Math.ceil(contentLength / Math.max(20, Math.floor(targetWidth / 11))));
      const targetHeight = Math.min(availableHeight, 112 + estimatedLines * 30);
      const targetY = insets.top + (screenHeight - insets.top - insets.bottom - targetHeight) / 2;
      setAnchorRect(rect);
      x.value = left;
      y.value = top;
      width.value = measuredWidth;
      height.value = measuredHeight;
      setExpanded(false);
      setVisible(true);
      requestAnimationFrame(() => {
        const timing = { duration: 260, easing: Easing.out(Easing.cubic) };
        x.value = withTiming((screenWidth - targetWidth) / 2, timing);
        y.value = withTiming(targetY, timing);
        width.value = withTiming(targetWidth, timing);
        height.value = withTiming(targetHeight, timing, (finished) => {
          if (finished) runOnJS(setExpanded)(true);
        });
      });
    });
  }, [contentLength, height, insets.bottom, insets.top, screenHeight, screenWidth, width, x, y]);

  useEffect(() => {
    if (autoExpand) requestAnimationFrame(open);
  }, [autoExpand, open]);

  const close = () => {
    if (!anchorRect) {
      setVisible(false);
      return;
    }
    animateBack(x, y, width, height, anchorRect, finishClose);
    setExpanded(false);
  };

  return (
    <>
      {expandButtonOnly ? (
        <View ref={anchor} collapsable={false} style={[styles.anchor, { backgroundColor, borderColor }, style]}>
          {children}
          {showExpandButton ? (
            <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={open} style={styles.expandButton}>
              <Text style={styles.expandButtonText}>↗</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Opens this card in a larger reading view"
          onPress={open}
        >
          <View ref={anchor} collapsable={false} style={[styles.anchor, { backgroundColor, borderColor }, style]}>
            {children}
          </View>
        </Pressable>
      )}
      <Modal transparent visible={visible} animationType="none" onRequestClose={close} statusBarTranslucent>
        <View style={styles.overlay}>
          <Animated.View
            style={[
              styles.readerCard,
              { backgroundColor, borderColor },
              animatedCardStyle,
            ]}
          >
            <View style={styles.readerHeader}>
                  <Text style={[styles.readerHint, { color: textColor }]}>{expanded ? (confirmLabel ? 'READ THE CARD' : 'FULL QUESTION') : ''}</Text>
                  {expanded ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={confirmLabel ?? 'Close expanded card'} onPress={close} hitSlop={10} style={styles.closeButton}>
                  <Text style={styles.closeText}>{confirmLabel ?? 'Close  ×'}</Text>
                </Pressable>
              ) : null}
            </View>
            <ScrollView showsVerticalScrollIndicator={expanded} contentContainerStyle={styles.readerContent}>
              {expandedContent ?? children}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: { borderWidth: 1, borderRadius: 18, padding: 16 },
  expandButton: { position: 'absolute', top: 4, right: 4, width: 29, height: 29, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  expandButtonText: { color: '#34463A', fontSize: 18, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(12, 20, 15, 0.62)' },
  readerCard: { position: 'absolute', borderWidth: 1, borderRadius: 24, overflow: 'hidden', padding: 18 },
  readerHeader: { minHeight: 32, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  readerHint: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  closeButton: { backgroundColor: 'rgba(130,145,132,0.16)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  closeText: { color: '#34463A', fontSize: 13, fontWeight: '800' },
  readerContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 16 },
});
