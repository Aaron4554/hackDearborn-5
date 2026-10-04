import { useEffect, useState, useMemo } from 'react';
import { DeviceEventEmitter, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { recordStreakActivity, STREAK_CHANGED_EVENT } from '@/services/streak';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

export default function StreakBadge() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState(0);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    void recordStreakActivity(user.uid).then((value) => {
      if (mounted) setDays(value);
    });
    const subscription = DeviceEventEmitter.addListener(STREAK_CHANGED_EVENT, setDays);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [user]);

  if (!user) return null;

  return (
    <View pointerEvents="box-none" style={[styles.anchor, { top: insets.top + 5 }]}>
      <View accessible accessibilityLabel={`${days} day study streak`} style={styles.badge}>
        <Ionicons name="flame" size={17} color={theme.emberText} />
        <Text style={styles.count}>{days}</Text>
      </View>
    </View>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  anchor: { position: 'absolute', right: 15, zIndex: 100, elevation: 12 },
  badge: {
    height: 36,
    minWidth: 62,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: theme.warmSoft,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    shadowColor: '#334238',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  count: { color: theme.dangerText, fontSize: 12, fontWeight: '800' },

  });
}
