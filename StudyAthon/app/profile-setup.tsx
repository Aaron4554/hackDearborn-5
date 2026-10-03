import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/contexts/AuthContext';
import { createUserProfile, describeSocialError, validateUsername } from '@/services/social';

export default function ProfileSetupScreen() {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const saveProfile = async () => {
    const cleanUsername = username.trim();
    setError('');
    if (!user) return;
    if (!validateUsername(cleanUsername)) {
      setError('Use 3–20 letters, numbers, or underscores.');
      return;
    }

    setIsSaving(true);
    try {
      await createUserProfile(user.uid, cleanUsername);
    } catch (saveError) {
      setError(describeSocialError(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><Ionicons name="book" size={18} color="#FFFFFF" /></View>
          <Text style={styles.brandName}>studyathon</Text>
        </View>

        <View style={styles.heroIcon}><Ionicons name="person-add-outline" size={27} color="#477B5B" /></View>
        <Text style={styles.eyebrow}>ONE LAST STEP</Text>
        <Text style={styles.title}>Choose your{ '\n' }study username</Text>
        <Text style={styles.subtitle}>Your username and unique four-digit tag help friends find you.</Text>

        <Text style={styles.inputLabel}>USERNAME</Text>
        <View style={styles.inputWrap}>
          <Feather name="at-sign" size={17} color="#8A978D" />
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="studyfan"
            placeholderTextColor="#ABB4AD"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Username"
            style={styles.input}
          />
        </View>
        <Text style={styles.helper}>3–20 characters. Letters, numbers, and underscores.</Text>

        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={() => void saveProfile()}
          disabled={isSaving}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, (pressed || isSaving) && styles.pressed]}>
          {isSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
          <Text style={styles.buttonText}>{isSaving ? 'Setting up…' : 'Create my profile'}</Text>
          {!isSaving ? <Feather name="arrow-right" size={17} color="#FFFFFF" /> : null}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8F5' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 30 },
  brand: { position: 'absolute', top: 13, left: 24, flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#477B5B', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: '#26352B', fontSize: 16, fontWeight: '800', letterSpacing: -0.5 },
  heroIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#EAF2EB', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  eyebrow: { color: '#6F9176', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 9 },
  title: { color: '#26352B', fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: '#879189', fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 26, maxWidth: 315 },
  inputLabel: { color: '#89958C', fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7 },
  inputWrap: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: '#E5EAE5', backgroundColor: '#FFFFFF', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, color: '#34433A', fontSize: 14, paddingVertical: 12 },
  helper: { color: '#9AA49C', fontSize: 10, marginTop: 8 },
  error: { color: '#B9574B', fontSize: 11, lineHeight: 16, marginTop: 12 },
  button: { minHeight: 49, borderRadius: 14, marginTop: 22, backgroundColor: '#477B5B', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
