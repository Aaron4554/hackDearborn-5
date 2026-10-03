import { signOut } from 'firebase/auth';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';

import { auth } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsScreen() {
  const { user } = useAuth();
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
          <View style={styles.avatar}><Ionicons name="person" size={23} color="#477B5B" /></View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileTitle}>StudyAthon learner</Text>
            <Text style={styles.email}>{user?.email ?? 'Signed in'}</Text>
          </View>
          <Feather name="check-circle" size={19} color="#6A9874" />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void handleSignOut()}
          disabled={isSigningOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
          {isSigningOut ? <ActivityIndicator size="small" color="#B65F55" /> : <Feather name="log-out" size={17} color="#B65F55" />}
          <Text style={styles.signOutText}>{isSigningOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>

        <Text style={styles.note}>Your study progress starts with showing up.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8F5' },
  content: { padding: 23 },
  eyebrow: { color: '#6F9176', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 14 },
  title: { color: '#26352B', fontSize: 32, fontWeight: '800', letterSpacing: -0.8, marginTop: 8, marginBottom: 22 },
  profileCard: { minHeight: 83, borderRadius: 18, paddingHorizontal: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EDE8', flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#EAF2EB', alignItems: 'center', justifyContent: 'center' },
  profileCopy: { flex: 1, marginLeft: 12 },
  profileTitle: { color: '#34433A', fontSize: 13, fontWeight: '700' },
  email: { color: '#929B94', fontSize: 11, marginTop: 5 },
  signOut: { minHeight: 50, borderWidth: 1, borderColor: '#F0DDD9', backgroundColor: '#FFF9F8', borderRadius: 14, marginTop: 22, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  signOutText: { color: '#B65F55', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  note: { color: '#98A299', fontSize: 11, marginTop: 20 },
});
