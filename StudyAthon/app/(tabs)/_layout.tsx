import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState, useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type TabRoute = { key: string; name: string; params?: object };
const DOCK_HORIZONTAL_INSET = 10;
type FloatingTabBarProps = {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: { tabBarLabel?: unknown; tabBarAccessibilityLabel?: string } }>;
  navigation: {
    navigate: (name: string, params?: object) => void;
  };
};
function getTabMeta(theme: Theme): Record<string, { label: string; icon: IconName; color: string }> {
  return {
    home: { label: 'Home', icon: 'home-outline', color: theme.dockAccentGreen },
    friends: { label: 'Friends', icon: 'people-outline', color: theme.dockAccentBlue },
    games: { label: 'Games', icon: 'game-controller-outline', color: theme.dockAccentAmber },
    settings: { label: 'Settings', icon: 'settings-outline', color: theme.dockAccentBlue },
  };
}

function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const insets = useSafeAreaInsets();
  const [dockWidth, setDockWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const tabMeta = getTabMeta(theme);
  const activeColor = tabMeta[state.routes[state.index]?.name]?.color ?? theme.dockAccentGreen;
  // The tabs and animated highlight share the dock's padded inner width.
  const segmentWidth = Math.max(
    0,
    (dockWidth - 2 - DOCK_HORIZONTAL_INSET * 2) / state.routes.length,
  );

  useEffect(() => {
    if (segmentWidth > 0) {
      indicatorX.value = withSpring(state.index * segmentWidth, {
        damping: 19,
        stiffness: 175,
        mass: 0.75,
      });
    }
  }, [indicatorX, segmentWidth, state.index]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: indicatorX.value }],
    backgroundColor: `${activeColor}18`,
    borderColor: `${activeColor}32`,
  }));

  return (
    <View pointerEvents="box-none" style={[styles.dockPosition, { bottom: Math.max(insets.bottom, 8) + 8 }]}>
      <View onLayout={(event) => setDockWidth(event.nativeEvent.layout.width)} style={styles.dock}>
        {segmentWidth > 0 ? <Animated.View pointerEvents="none" style={[styles.slider, indicatorStyle]} /> : null}
        {state.routes.map((route, index) => {
          const meta = getTabMeta(theme)[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : meta.label;
          const color = focused ? meta.color : theme.dockMuted;
          const onPress = () => {
            if (!focused) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              style={styles.tab}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={meta.icon} size={21} color={color} />
              </View>
              <Text style={[styles.label, { color }, focused && styles.activeLabel]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.page } }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends' }} />
      <Tabs.Screen name="games" options={{ title: 'Games' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  dockPosition: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  dock: {
    width: '90%',
    maxWidth: 410,
    minHeight: 66,
    paddingHorizontal: DOCK_HORIZONTAL_INSET,
    paddingVertical: 7,
    borderRadius: 23,
    backgroundColor: theme.dockSurface,
    borderWidth: 1,
    borderColor: theme.dockBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#22332A',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 12,
  },
  slider: {
    position: 'absolute',
    left: DOCK_HORIZONTAL_INSET,
    top: 7,
    bottom: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconWrap: { width: 34, height: 29, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 12, fontWeight: '600' },
  activeLabel: { fontWeight: '800' },

  });
}
