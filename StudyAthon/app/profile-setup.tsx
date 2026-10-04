import { useState, useMemo } from 'react';
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
import { Feather, Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/contexts/AuthContext';
import {
  createUserProfile,
  describeSocialError,
  savePersonalInfo,
  validateUsername,
  type EducationLevel,
  type PersonalInfo,
} from '@/services/social';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

const educationOptions: { value: EducationLevel; label: string }[] = [
  { value: 'k12', label: 'K–12' },
  { value: 'high_school', label: 'High school' },
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
  { value: 'graduate', label: 'Graduate school' },
  { value: 'other', label: 'Other' },
];

const gradeOptions = {
  k12: ['K', '1', '2', '3', '4', '5', '6', '7', '8'],
  high_school: ['9', '10', '11', '12'],
};

const gradeLabels: Record<string, string> = {
  K: 'Kindergarten',
  '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th',
  '6': '6th', '7': '7th', '8': '8th', '9': '9th', '10': '10th',
  '11': '11th', '12': '12th',
};

const emptyPersonalInfo: PersonalInfo = {
  firstName: '',
  lastName: '',
  educationLevel: 'high_school',
  gradeLevel: null,
  takesAdvancedClasses: null,
  age: null,
};

export default function ProfileSetupScreen() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const { user, profile, personalInfo } = useAuth();
  const [continued, setContinued] = useState(false);
  const step = profile || continued ? 'personal' : 'username';
  const [username, setUsername] = useState(profile?.username ?? '');
  const [details, setDetails] = useState<PersonalInfo>(personalInfo ?? emptyPersonalInfo);
  const [ageInput, setAgeInput] = useState(personalInfo?.age == null ? '' : String(personalInfo.age));
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const updateDetails = (updates: Partial<PersonalInfo>) => {
    setDetails((current) => ({ ...current, ...updates }));
    setError('');
  };

  const continueToPersonalInfo = () => {
    const cleanUsername = username.trim();
    if (!validateUsername(cleanUsername)) {
      setError('Use 3–20 letters, numbers, or underscores.');
      return;
    }
    setUsername(cleanUsername);
    setError('');
    setContinued(true);
  };

  const saveProfile = async () => {
    setError('');
    if (!user) return;
    const firstName = details.firstName.trim();
    const lastName = details.lastName.trim();
    if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80) {
      setError('Enter your first and last name (up to 80 characters each).');
      return;
    }
    if ((details.educationLevel === 'k12' || details.educationLevel === 'high_school') && !details.gradeLevel) {
      setError('Choose your grade to continue.');
      return;
    }
    if (details.educationLevel === 'high_school' && details.takesAdvancedClasses === null) {
      setError('Please tell us whether you take AP or IB classes.');
      return;
    }
    const parsedAge = ageInput.trim() ? Number(ageInput) : null;
    if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 5 || parsedAge > 100)) {
      setError('Age is optional. If entered, use a whole number from 5 to 100.');
      return;
    }

    const savedDetails: PersonalInfo = {
      ...details,
      firstName,
      lastName,
      gradeLevel: details.educationLevel === 'k12' || details.educationLevel === 'high_school'
        ? details.gradeLevel
        : null,
      takesAdvancedClasses: details.educationLevel === 'high_school'
        ? details.takesAdvancedClasses
        : null,
      age: parsedAge,
    };

    setIsSaving(true);
    try {
      if (profile) {
        await savePersonalInfo(user.uid, savedDetails);
      } else {
        await createUserProfile(user.uid, username.trim(), savedDetails);
      }
    } catch (saveError) {
      setError(describeSocialError(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.brand}>
            <View style={styles.brandMark}><Ionicons name="book" size={18} color={theme.onAccent} /></View>
            <Text style={styles.brandName}>studyathon</Text>
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.eyebrow}>{step === 'username' ? 'YOUR STUDY PROFILE' : 'PERSONAL DETAILS'}</Text>
            <Text style={styles.progress}>{profile ? '1 of 1' : step === 'username' ? '1 of 2' : '2 of 2'}</Text>
          </View>
          {step === 'username' ? (
            <>
              <View style={styles.heroIcon}><Ionicons name="person-add-outline" size={27} color={theme.accentText} /></View>
              <Text style={styles.title}>Choose your{ '\n' }study username</Text>
              <Text style={styles.subtitle}>Your username and unique four-digit tag help friends find you.</Text>
              <Text style={styles.inputLabel}>USERNAME</Text>
              <View style={styles.inputWrap}>
                <Feather name="at-sign" size={17} color={theme.textMuted} />
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="studyfan"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Username"
                  style={styles.input}
                />
              </View>
              <Text style={styles.helper}>3–20 characters. Letters, numbers, and underscores.</Text>
              {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
              <Pressable onPress={continueToPersonalInfo} accessibilityRole="button" style={styles.button}>
                <Text style={styles.buttonText}>Continue</Text>
                <Feather name="arrow-right" size={17} color={theme.onAccent} />
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.heroIcon}><Ionicons name="school-outline" size={27} color={theme.accentText} /></View>
              <Text style={styles.title}>Make your study{ '\n' }space yours</Text>
              <Text style={styles.subtitle}>These details help us tailor study support. Age is optional.</Text>

              <Text style={styles.inputLabel}>FIRST NAME</Text>
              <TextInput
                value={details.firstName}
                onChangeText={(firstName) => updateDetails({ firstName })}
                placeholder="First name"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                accessibilityLabel="First name"
                style={styles.textField}
              />
              <Text style={[styles.inputLabel, styles.labelSpacing]}>LAST NAME</Text>
              <TextInput
                value={details.lastName}
                onChangeText={(lastName) => updateDetails({ lastName })}
                placeholder="Last name"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                accessibilityLabel="Last name"
                style={styles.textField}
              />

              <Text style={[styles.inputLabel, styles.labelSpacing]}>EDUCATION</Text>
              <View style={styles.optionsWrap}>
                {educationOptions.map((option) => (
                  <OptionChip
                    key={option.value}
                    label={option.label}
                    selected={details.educationLevel === option.value}
                    onPress={() => updateDetails({
                      educationLevel: option.value,
                      gradeLevel: null,
                      takesAdvancedClasses: null,
                    })}
                  />
                ))}
              </View>

              {(details.educationLevel === 'k12' || details.educationLevel === 'high_school') ? (
                <>
                  <Text style={[styles.inputLabel, styles.labelSpacing]}>GRADE</Text>
                  <View style={styles.optionsWrap}>
                    {gradeOptions[details.educationLevel].map((grade) => (
                      <OptionChip
                        key={grade}
                        label={gradeLabels[grade]}
                        selected={details.gradeLevel === grade}
                        onPress={() => updateDetails({ gradeLevel: grade })}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {details.educationLevel === 'high_school' ? (
                <>
                  <Text style={[styles.inputLabel, styles.labelSpacing]}>DO YOU TAKE AP OR IB CLASSES?</Text>
                  <View style={styles.optionsWrap}>
                    <OptionChip label="Yes" selected={details.takesAdvancedClasses === true} onPress={() => updateDetails({ takesAdvancedClasses: true })} />
                    <OptionChip label="No" selected={details.takesAdvancedClasses === false} onPress={() => updateDetails({ takesAdvancedClasses: false })} />
                  </View>
                </>
              ) : null}

              <Text style={[styles.inputLabel, styles.labelSpacing]}>AGE · OPTIONAL</Text>
              <TextInput
                value={ageInput}
                onChangeText={(value) => {
                  setAgeInput(value.replace(/[^0-9]/g, '').slice(0, 3));
                  setError('');
                }}
                placeholder="Skip if you prefer"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                accessibilityLabel="Age, optional"
                style={styles.textField}
              />
              <Text style={styles.helper}>Only you can view these personal details.</Text>

              {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                {!profile ? (
                  <Pressable onPress={() => { setError(''); setContinued(false); }} style={styles.backButton}>
                    <Feather name="arrow-left" size={16} color={theme.accentText} />
                    <Text style={styles.backText}>Back</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => void saveProfile()}
                  disabled={isSaving}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.button, styles.saveButton, (pressed || isSaving) && styles.pressed]}>
                  {isSaving ? <ActivityIndicator size="small" color={theme.onAccent} /> : null}
                  <Text style={styles.buttonText}>{isSaving ? 'Saving…' : 'Save my details'}</Text>
                  {!isSaving ? <Feather name="arrow-right" size={17} color={theme.onAccent} /> : null}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function OptionChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: theme.page },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 62, paddingBottom: 34 },
  brand: { position: 'absolute', top: 13, left: 24, flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 31, height: 31, borderRadius: 10, backgroundColor: theme.accentFill, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: theme.accentText, fontSize: 16, fontWeight: '800', letterSpacing: -0.5 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  heroIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  eyebrow: { color: theme.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  progress: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
  title: { color: theme.accentText, fontSize: 32, lineHeight: 37, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: theme.textMuted, fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 23, maxWidth: 315 },
  inputLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7 },
  labelSpacing: { marginTop: 17 },
  inputWrap: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, color: theme.textBody, fontSize: 14, paddingVertical: 12 },
  textField: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, color: theme.textBody, fontSize: 14, paddingHorizontal: 13 },
  helper: { color: theme.textMuted, fontSize: 12, marginTop: 8 },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 37, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' },
  chipSelected: { borderColor: theme.borderStrong, backgroundColor: theme.accentSoft },
  chipText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: theme.accentText },
  error: { color: theme.dangerText, fontSize: 13, lineHeight: 16, marginTop: 12 },
  button: { minHeight: 49, borderRadius: 14, marginTop: 22, backgroundColor: theme.accentFill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  buttonText: { color: theme.onAccent, fontSize: 13, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 3 },
  saveButton: { flex: 1 },
  backButton: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  backText: { color: theme.accentText, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.75 },

  });
}
