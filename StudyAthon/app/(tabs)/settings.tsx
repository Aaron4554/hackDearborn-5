import { signOut } from 'firebase/auth';
import { useEffect, useState, useMemo, type ComponentProps } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';

import { auth } from '@/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { describeSocialError, updatePersonalInfo, type EducationLevel, type PersonalInfo } from '@/services/social';
import { useTheme, useThemePreference, type SchemePreference } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

const THEME_OPTIONS: { value: SchemePreference; label: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

const EDUCATION_OPTIONS: { value: EducationLevel; label: string }[] = [
  { value: 'k12', label: 'K–12' },
  { value: 'high_school', label: 'High school' },
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
  { value: 'graduate', label: 'Graduate school' },
  { value: 'other', label: 'Other' },
];
const SCHOOL_GRADES: Record<'k12' | 'high_school', string[]> = {
  k12: ['K', '1', '2', '3', '4', '5', '6', '7', '8'],
  high_school: ['9', '10', '11', '12'],
};
const EDUCATION_LABELS = Object.fromEntries(EDUCATION_OPTIONS.map((option) => [option.value, option.label])) as Record<EducationLevel, string>;
const GRADE_LABELS: Record<string, string> = {
  K: 'Kindergarten', '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th',
  '6': '6th', '7': '7th', '8': '8th', '9': '9th', '10': '10th', '11': '11th', '12': '12th',
};

export default function SettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);
  const { preference, setPreference } = useThemePreference();

  const { user, profile, personalInfo } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [draft, setDraft] = useState<PersonalInfo | null>(personalInfo);
  const [ageInput, setAgeInput] = useState(personalInfo?.age == null ? '' : String(personalInfo.age));
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsSaved, setDetailsSaved] = useState(false);

  useEffect(() => {
    setDraft(personalInfo);
    setAgeInput(personalInfo?.age == null ? '' : String(personalInfo.age));
  }, [personalInfo]);

  const updateDraft = (updates: Partial<PersonalInfo>) => {
    setDraft((current) => current ? { ...current, ...updates } : current);
    setDetailsError('');
    setDetailsSaved(false);
  };

  const saveDetails = async () => {
    if (!user || !draft) return;
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80) {
      setDetailsError('Enter your first and last name (up to 80 characters each).');
      return;
    }
    if ((draft.educationLevel === 'k12' || draft.educationLevel === 'high_school') && !draft.gradeLevel) {
      setDetailsError('Select your current grade.');
      return;
    }
    if (draft.educationLevel === 'high_school' && draft.takesAdvancedClasses === null) {
      setDetailsError('Choose whether you take AP or IB classes.');
      return;
    }
    const age = ageInput.trim() ? Number(ageInput) : null;
    if (age !== null && (!Number.isInteger(age) || age < 5 || age > 100)) {
      setDetailsError('Age is optional. If entered, use a whole number from 5 to 100.');
      return;
    }
    const updated: PersonalInfo = {
      ...draft,
      firstName,
      lastName,
      gradeLevel: draft.educationLevel === 'k12' || draft.educationLevel === 'high_school' ? draft.gradeLevel : null,
      takesAdvancedClasses: draft.educationLevel === 'high_school' ? draft.takesAdvancedClasses : null,
      age,
    };
    setIsSavingDetails(true);
    setDetailsError('');
    try {
      await updatePersonalInfo(user.uid, updated);
      setDraft(updated);
      setEditingDetails(false);
      setDetailsSaved(true);
    } catch (error) {
      setDetailsError(describeSocialError(error));
    } finally {
      setIsSavingDetails(false);
    }
  };

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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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

        <Text style={[styles.eyebrow, styles.studyEyebrow]}>STUDY PROFILE</Text>
        <Text style={styles.appearanceHint}>These details help match explanations and questions to your education level.</Text>
        <View style={styles.detailsCard}>
          {editingDetails && draft ? (
            <>
              <Text style={styles.inputLabel}>FIRST NAME</Text>
              <TextInput value={draft.firstName} onChangeText={(firstName) => updateDraft({ firstName })} placeholder="First name" placeholderTextColor={theme.textMuted} autoCapitalize="words" style={styles.textField} />
              <Text style={styles.inputLabel}>LAST NAME</Text>
              <TextInput value={draft.lastName} onChangeText={(lastName) => updateDraft({ lastName })} placeholder="Last name" placeholderTextColor={theme.textMuted} autoCapitalize="words" style={styles.textField} />

              <Text style={styles.inputLabel}>SCHOOL LEVEL</Text>
              <View style={styles.optionsWrap}>
                {EDUCATION_OPTIONS.map((option) => (
                  <OptionChip key={option.value} label={option.label} selected={draft.educationLevel === option.value} onPress={() => updateDraft({ educationLevel: option.value, gradeLevel: null, takesAdvancedClasses: null })} styles={styles} />
                ))}
              </View>
              {(draft.educationLevel === 'k12' || draft.educationLevel === 'high_school') ? (
                <>
                  <Text style={styles.inputLabel}>GRADE</Text>
                  <View style={styles.optionsWrap}>
                    {SCHOOL_GRADES[draft.educationLevel].map((grade) => (
                      <OptionChip key={grade} label={GRADE_LABELS[grade]} selected={draft.gradeLevel === grade} onPress={() => updateDraft({ gradeLevel: grade })} styles={styles} />
                    ))}
                  </View>
                </>
              ) : null}
              {draft.educationLevel === 'high_school' ? (
                <>
                  <Text style={styles.inputLabel}>AP OR IB CLASSES?</Text>
                  <View style={styles.optionsWrap}>
                    <OptionChip label="Yes" selected={draft.takesAdvancedClasses === true} onPress={() => updateDraft({ takesAdvancedClasses: true })} styles={styles} />
                    <OptionChip label="No" selected={draft.takesAdvancedClasses === false} onPress={() => updateDraft({ takesAdvancedClasses: false })} styles={styles} />
                  </View>
                </>
              ) : null}
              <Text style={styles.inputLabel}>AGE · OPTIONAL</Text>
              <TextInput value={ageInput} onChangeText={(value) => { setAgeInput(value.replace(/[^0-9]/g, '').slice(0, 3)); setDetailsError(''); }} placeholder="Skip if you prefer" placeholderTextColor={theme.textMuted} keyboardType="number-pad" style={styles.textField} />
              {detailsError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{detailsError}</Text> : null}
              <View style={styles.editActions}>
                <Pressable onPress={() => { setDraft(personalInfo); setAgeInput(personalInfo?.age == null ? '' : String(personalInfo.age)); setEditingDetails(false); setDetailsError(''); }} disabled={isSavingDetails} style={styles.cancelButton}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => void saveDetails()} disabled={isSavingDetails} style={[styles.saveButton, isSavingDetails && styles.disabled]}>
                  {isSavingDetails ? <ActivityIndicator size="small" color={theme.onAccent} /> : null}
                  <Text style={styles.saveText}>{isSavingDetails ? 'Saving…' : 'Save details'}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.detailsSummaryRow}>
                <View style={styles.detailsCopy}>
                  <Text style={styles.detailsName}>{personalInfo ? `${personalInfo.firstName} ${personalInfo.lastName}`.trim() : 'Learner details'}</Text>
                  <Text style={styles.detailsValue}>
                    {personalInfo ? EDUCATION_LABELS[personalInfo.educationLevel] ?? 'Education level not set' : 'No education details saved'}
                    {personalInfo?.gradeLevel ? ` · ${GRADE_LABELS[personalInfo.gradeLevel] ?? personalInfo.gradeLevel} grade` : ''}
                  </Text>
                  {personalInfo?.educationLevel === 'high_school' && personalInfo.takesAdvancedClasses !== null ? (
                    <Text style={styles.detailsValue}>AP/IB classes: {personalInfo.takesAdvancedClasses ? 'Yes' : 'No'}</Text>
                  ) : null}
                </View>
                <Feather name="user" size={18} color={theme.accentText} />
              </View>
              {detailsSaved ? <Text accessibilityLiveRegion="polite" style={styles.savedMessage}>Your study profile was updated.</Text> : null}
              <Pressable onPress={() => { setDraft(personalInfo); setAgeInput(personalInfo?.age == null ? '' : String(personalInfo.age)); setDetailsSaved(false); setEditingDetails(true); }} style={styles.editButton} accessibilityRole="button">
                <Feather name="edit-2" size={15} color={theme.accentText} />
                <Text style={styles.editButtonText}>Edit study profile</Text>
              </Pressable>
            </>
          )}
        </View>

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
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function OptionChip({
  label,
  selected,
  onPress,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.optionChip, selected && styles.optionChipSelected]}>
      <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.page },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 23, paddingBottom: 42 },
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
  studyEyebrow: { marginTop: 34, marginBottom: 0 },
  appearanceEyebrow: { marginTop: 34, marginBottom: 0 },
  appearanceHint: { color: theme.textMuted, fontSize: 13, marginTop: 8, marginBottom: 12 },
  detailsCard: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 17, padding: 14, gap: 11 },
  detailsSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailsCopy: { flex: 1, gap: 4 },
  detailsName: { color: theme.textPrimary, fontSize: 15, fontWeight: '800' },
  detailsValue: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  editButton: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  editButtonText: { color: theme.accentText, fontSize: 13, fontWeight: '700' },
  inputLabel: { color: theme.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 3 },
  textField: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.page, color: theme.textPrimary, fontSize: 14, paddingHorizontal: 11 },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  optionChip: { minHeight: 35, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.page, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 7 },
  optionChipSelected: { borderColor: theme.accentText, backgroundColor: theme.accentFill },
  optionChipText: { color: theme.textBody, fontSize: 12, fontWeight: '700' },
  optionChipTextSelected: { color: theme.onAccent },
  error: { color: theme.dangerText, fontSize: 12, lineHeight: 17 },
  savedMessage: { color: theme.accentText, fontSize: 12, fontWeight: '700' },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  cancelButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  cancelText: { color: theme.textBody, fontSize: 13, fontWeight: '700' },
  saveButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: theme.accentFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  saveText: { color: theme.onAccent, fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.55 },
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
