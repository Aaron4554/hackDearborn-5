import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { Feather, Ionicons } from '@expo/vector-icons';

import { auth } from '@/firebase';
import { createUserProfile, validateUsername } from '@/services/social';

type AuthFormProps = { mode: 'login' | 'sign-up' };

function firebaseErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email.';
    case 'auth/weak-password':
      return 'Choose a password with at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Check your internet connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return 'We could not complete that request. Please try again.';
  }
}

export default function AuthForm({ mode }: AuthFormProps) {
  const isSignUp = mode === 'sign-up';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setError('');
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    if (isSignUp && !validateUsername(username.trim())) {
      setError('Your username needs 3–20 letters, numbers, or underscores.');
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError('Your passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await createUserProfile(credential.user.uid, username.trim());
      } else {
        await signInWithEmailAndPassword(auth, normalizedEmail, password);
      }
      // The auth state listener in the root layout opens the study tabs.
    } catch (requestError) {
      setError(firebaseErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <View style={styles.brandMark}><Ionicons name="book" size={18} color="#FFFFFF" /></View>
              <Text style={styles.brandName}>studyathon</Text>
            </View>
            <View style={styles.topNote}><View style={styles.onlineDot} /><Text style={styles.topNoteText}>YOUR STUDY SPACE</Text></View>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name={isSignUp ? 'sparkles-outline' : 'book-outline'} size={28} color="#477B5B" />
            </View>
            <Text style={styles.eyebrow}>{isSignUp ? 'START YOUR NEXT CHAPTER' : 'A LITTLE PROGRESS, EVERY DAY'}</Text>
            <Text style={styles.title}>{isSignUp ? 'Create your\nstudy space' : 'Welcome\nback'}</Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? 'Make an account and build a study habit that sticks.'
                : 'Pick up where you left off and keep your momentum going.'}
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{isSignUp ? 'Create account' : 'Sign in'}</Text>
            <Text style={styles.formSubtitle}>
              {isSignUp ? 'Use your email to get started.' : 'Enter your details to continue.'}
            </Text>

            {isSignUp ? (
              <>
                <Text style={[styles.inputLabel, styles.firstLabel]}>USERNAME</Text>
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
                    returnKeyType="next"
                    style={styles.input}
                  />
                </View>
                <Text style={styles.helperText}>You’ll get a unique four-digit tag, like studyfan#0427.</Text>
              </>
            ) : null}

            <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
            <View style={styles.inputWrap}>
              <Feather name="mail" size={17} color="#8A978D" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#ABB4AD"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                accessibilityLabel="Email address"
                returnKeyType="next"
                style={styles.input}
              />
            </View>

            <Text style={styles.inputLabel}>PASSWORD</Text>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={17} color="#8A978D" />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                placeholderTextColor="#ABB4AD"
                secureTextEntry
                textContentType={isSignUp ? 'newPassword' : 'password'}
                accessibilityLabel="Password"
                returnKeyType={isSignUp ? 'next' : 'done'}
                onSubmitEditing={isSignUp ? undefined : () => void submit()}
                style={styles.input}
              />
            </View>

            {isSignUp ? (
              <>
                <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
                <View style={styles.inputWrap}>
                  <Feather name="check-circle" size={17} color="#8A978D" />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Enter your password again"
                    placeholderTextColor="#ABB4AD"
                    secureTextEntry
                    textContentType="newPassword"
                    accessibilityLabel="Confirm password"
                    returnKeyType="done"
                    onSubmitEditing={() => void submit()}
                    style={styles.input}
                  />
                </View>
              </>
            ) : null}

            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={() => void submit()}
              disabled={isSubmitting}
              accessibilityRole="button"
              style={({ pressed }) => [styles.submitButton, (pressed || isSubmitting) && styles.pressed]}>
              {isSubmitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={styles.submitText}>
                {isSubmitting ? 'Please wait…' : isSignUp ? 'Create my account' : 'Sign in'}
              </Text>
              {!isSubmitting ? <Feather name="arrow-right" size={17} color="#FFFFFF" /> : null}
            </Pressable>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                {isSignUp ? 'Already have an account? ' : 'New to StudyAthon? '}
              </Text>
              <Link href={isSignUp ? '/login' : '/sign-up'} asChild>
                <Text accessibilityRole="link" style={styles.switchLink}>
                  {isSignUp ? 'Sign in' : 'Create an account'}
                </Text>
              </Link>
            </View>
          </View>

          <Text style={styles.footer}>Small steps add up. You’ve got this.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8F5' },
  keyboardView: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 23, paddingBottom: 28 },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#477B5B', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: '#26352B', fontSize: 16, fontWeight: '800', letterSpacing: -0.5 },
  topNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#82A889' },
  topNoteText: { color: '#95A097', fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  hero: { marginTop: 24, marginBottom: 24 },
  heroIcon: { width: 52, height: 52, backgroundColor: '#EAF2EB', borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  eyebrow: { color: '#6F9176', fontSize: 9, fontWeight: '800', letterSpacing: 1.55, marginBottom: 9 },
  title: { color: '#26352B', fontSize: 37, lineHeight: 41, letterSpacing: -1.1, fontWeight: '800' },
  subtitle: { color: '#879189', fontSize: 13, lineHeight: 19, marginTop: 10, maxWidth: 300 },
  formCard: { borderRadius: 22, padding: 19, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EDE8', shadowColor: '#29372D', shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  formTitle: { color: '#2C3B31', fontSize: 17, fontWeight: '800' },
  formSubtitle: { color: '#939D95', fontSize: 11, marginTop: 5, marginBottom: 20 },
  inputLabel: { color: '#89958C', fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7, marginTop: 14 },
  firstLabel: { marginTop: 0 },
  helperText: { color: '#9AA49C', fontSize: 10, marginTop: 7 },
  inputWrap: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: '#E5EAE5', backgroundColor: '#FBFCFA', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, color: '#34433A', fontSize: 13, paddingVertical: 11 },
  error: { color: '#B9574B', fontSize: 11, lineHeight: 16, marginTop: 12 },
  submitButton: { minHeight: 49, borderRadius: 14, marginTop: 21, backgroundColor: '#477B5B', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  submitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: 17 },
  switchText: { color: '#929B94', fontSize: 11 },
  switchLink: { color: '#477B5B', fontWeight: '800', fontSize: 11 },
  footer: { color: '#9AA49C', fontSize: 10, textAlign: 'center', marginTop: 22 },
});
