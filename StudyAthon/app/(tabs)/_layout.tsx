import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IconName = ComponentProps<typeof Ionicons>['name'];
type TabRoute = { key: string; name: string; params?: object };
type FloatingTabBarProps = {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: { tabBarLabel?: unknown; tabBarAccessibilityLabel?: string } }>;
  navigation: {
    navigate: (name: string, params?: object) => void;
  };
};
const tabMeta: Record<string, { label: string; icon: IconName; color: string }> = {
  home: { label: 'Home', icon: 'home-outline', color: '#477B5B' },
  friends: { label: 'Friends', icon: 'people-outline', color: '#68699B' },
  games: { label: 'Games', icon: 'game-controller-outline', color: '#C66D3F' },
  settings: { label: 'Settings', icon: 'settings-outline', color: '#5D7C80' },
};

function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.dockPosition, { bottom: Math.max(insets.bottom, 8) + 8 }]}>
      <View style={styles.dock}>
        {state.routes.map((route, index) => {
          const meta = tabMeta[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : meta.label;
          const color = focused ? meta.color : '#89958D';
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
              <View style={[styles.iconWrap, focused && { backgroundColor: `${meta.color}16` }]}>
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
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#F7F8F5' } }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends' }} />
      <Tabs.Screen name="games" options={{ title: 'Games' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dockPosition: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  dock: {
    width: '88%',
    maxWidth: 410,
    minHeight: 66,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8ECE7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#22332A',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 12,
  },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconWrap: { width: 34, height: 29, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 9, lineHeight: 12, fontWeight: '600' },
  activeLabel: { fontWeight: '800' },
});
