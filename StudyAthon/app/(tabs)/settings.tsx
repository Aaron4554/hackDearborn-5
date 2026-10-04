import { signOut } from 'firebase/auth';
import { useState, useMemo, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';

import { auth } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, useThemePreference, type SchemePreference } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

const THEME_OPTIONS: { value: SchemePreference; label: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const { preference, setPreference } = useThemePreference();

  const { user, profile } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut(auth);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}><Ionicons name="person" size={23} color={theme.accentText} /></View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileTitle}>{profile ? `${profile.username}#${profile.tag}` : 'StudyAthon learner'}</Text>
            <Text style={styles.email}>{user?.email ?? 'Signed in'}</Text>
          </View>
          <Feather name="check-circle" size={19} color={theme.textMuted} />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void handleSignOut()}
          disabled={isSigningOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
          {isSigningOut ? <ActivityIndicator size="small" color={theme.brickText} /> : <Feather name="log-out" size={17} color={theme.brickText} />}
          <Text style={styles.signOutText}>{isSigningOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>

        <Text style={styles.note}>Your study progress starts with showing up.</Text>

        <Text style={[styles.eyebrow, styles.appearanceEyebrow]}>APPEARANCE</Text>
        <Text style={styles.appearanceHint}>
          System follows your device&apos;s light or dark setting.
        </Text>
        <View style={styles.segmented} accessibilityRole="radiogroup">
          {THEME_OPTIONS.map((option) => {
            const selected = preference === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                onPress={() => setPreference(option.value)}
                style={({ pressed }) => [
                  styles.segment,
                  selected && styles.segmentSelected,
                  pressed && !selected && styles.pressed,
                ]}>
                <Ionicons
                  name={option.icon}
                  size={15}
                  color={selected ? theme.onAccent : theme.textMuted}
                />
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.page },
  content: { padding: 23 },
  eyebrow: { color: theme.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 14 },
  title: { color: theme.accentText, fontSize: 32, fontWeight: '800', letterSpacing: -0.8, marginTop: 8, marginBottom: 22 },
  profileCard: { minHeight: 83, borderRadius: 18, paddingHorizontal: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' },
  profileCopy: { flex: 1, marginLeft: 12 },
  profileTitle: { color: theme.textBody, fontSize: 13, fontWeight: '700' },
  email: { color: theme.textMuted, fontSize: 13, marginTop: 5 },
  signOut: { minHeight: 50, borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: theme.warmSoft, borderRadius: 14, marginTop: 22, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  signOutText: { color: theme.brickText, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  note: { color: theme.textMuted, fontSize: 13, marginTop: 20 },
  appearanceEyebrow: { marginTop: 34, marginBottom: 0 },
  appearanceHint: { color: theme.textMuted, fontSize: 13, marginTop: 8, marginBottom: 12 },
  segmented: {
    flexDirection: 'row',
    gap: 6,
    padding: 5,
    borderRadius: 14,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  segmentSelected: { backgroundColor: theme.accentFill },
  segmentText: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
  segmentTextSelected: { color: theme.onAccent },

  });
}
