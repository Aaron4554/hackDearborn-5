import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStudy } from '@/contexts/StudyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 50;
const MIN_MINUTES = 5;
const MAX_MINUTES = 120;

const COUNT_PRESETS = [5, 10, 20, 30, 50];

/**
 * Ingestion is four sequential model calls, so a cold session can take a while.
 * Naming the stages keeps the wait legible instead of looking like a hang.
 */
const INGEST_STAGES = [
  'Reading your material',
  'Pulling out the key concepts',
  'Writing questions',
  'Checking every question against the source',
];

export default function StudySetupScreen() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const { start, busy, error } = useStudy();
  const { personalInfo } = useAuth();
  const params = useLocalSearchParams<{ topic?: string; text?: string }>();

  const [text, setText] = useState(params.topic || params.text || '');
  const [url, setUrl] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [timerOn, setTimerOn] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(20);

  const canStart = useMemo(() => text.trim().length > 0 || url.trim().length > 0, [text, url]);

  const bumpCount = (delta: number) => {
    setQuestionCount((current) => Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, current + delta)));
  };

  const bumpMinutes = (delta: number) => {
    setTimerMinutes((current) => Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, current + delta)));
  };

  const onStart = async () => {
    if (!canStart) return;
    const ok = await start({
      text,
      urls: url.trim() ? [url.trim()] : [],
      questionCount,
      timerMinutes: timerOn ? timerMinutes : null,
      educationLevel: personalInfo?.educationLevel,
      gradeLevel: personalInfo?.gradeLevel,
      takesAdvancedClasses: personalInfo?.takesAdvancedClasses,
    });
    if (ok) router.replace('/study/quiz');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={22} color={theme.accentText} />
          </Pressable>
          <Text style={styles.eyebrow}>STUDY LOOP</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>What are we{`\n`}working through?</Text>
          <Text style={styles.subtitle}>
            Paste your notes, enter a topic, or drop in a link. We will match the quiz to your material.
          </Text>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardIcon}>
                <Ionicons name="document-text-outline" size={16} color={theme.accentText} />
              </View>
              <Text style={styles.cardTitle}>Your material</Text>
            </View>

            <TextInput
              multiline
              onChangeText={setText}
              placeholder="Paste notes or enter a topic, like human anatomy..."
              placeholderTextColor={theme.textMuted}
              style={styles.textarea}
              textAlignVertical="top"
              value={text}
            />

            <View style={styles.divider} />

            <View style={styles.linkRow}>
              <Feather name="link" size={15} color={theme.textMuted} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={setUrl}
                placeholder="Or a link (optional)"
                placeholderTextColor={theme.textMuted}
                style={styles.linkInput}
                value={url}
              />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardIcon}>
                <Ionicons name="help-circle-outline" size={16} color={theme.accentText} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Questions per round</Text>
                <Text style={styles.cardHint}>
                  Between {MIN_QUESTIONS} and {MAX_QUESTIONS}.
                </Text>
              </View>
            </View>

            <View style={styles.stepperGroup}>
              <StepperButton icon="remove" label="Fewer questions" onPress={() => bumpCount(-1)} />
              <View style={styles.stepperValue}>
                <Text style={styles.stepperNumber}>{questionCount}</Text>
                <Text style={styles.stepperUnit}>questions</Text>
              </View>
              <StepperButton icon="add" label="More questions" onPress={() => bumpCount(1)} />
            </View>

            <View style={styles.presetRow}>
              {COUNT_PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => setQuestionCount(preset)}
                  style={[styles.preset, questionCount === preset && styles.presetActive]}
                >
                  <Text style={[styles.presetText, questionCount === preset && styles.presetTextActive]}>
                    {preset}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardIcon}>
                <Ionicons name="timer-outline" size={16} color={theme.accentText} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Work on a timer</Text>
                <Text style={styles.cardHint}>The loop stops when time runs out.</Text>
              </View>
              <Switch
                onValueChange={setTimerOn}
                trackColor={{ false: theme.border, true: theme.borderStrong }}
                thumbColor={timerOn ? theme.accentText : theme.onAccent}
                value={timerOn}
              />
            </View>

            {timerOn ? (
              <View style={[styles.stepperRow, styles.stepperSpaced]}>
                <StepperButton icon="remove" label="Fewer minutes" onPress={() => bumpMinutes(-5)} />
                <View style={styles.stepperValue}>
                  <Text style={styles.stepperNumber}>{timerMinutes}</Text>
                  <Text style={styles.stepperUnit}>minutes</Text>
                </View>
                <StepperButton icon="add" label="More minutes" onPress={() => bumpMinutes(5)} />
              </View>
            ) : null}
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={16} color={theme.dangerText} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={!canStart || busy}
            onPress={onStart}
            style={({ pressed }) => [
              styles.startButton,
              (!canStart || busy) && styles.startButtonDisabled,
              pressed && canStart && styles.startButtonPressed,
            ]}
          >
            <Text style={styles.startButtonText}>Build my questions</Text>
            <Feather name="arrow-up-right" size={17} color={theme.onAccent} />
          </Pressable>

          {!canStart ? (
            <Text style={styles.footnote}>Add some notes or a link to get started.</Text>
          ) : null}
        </ScrollView>

        {busy ? (
          <View style={styles.overlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator color={theme.accentText} size="small" />
              <Text style={styles.loadingTitle}>Reading your material</Text>
              <Text style={styles.loadingBody}>
                {INGEST_STAGES.map((stage, index) => (
                  <Text key={stage}>
                    {index + 1}. {stage}
                    {'\n'}
                  </Text>
                ))}
              </Text>
              <Text style={styles.loadingHint}>
                This runs on the study agent, so it can take up to a minute.
              </Text>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepperButton({
  icon,
  label,
  onPress,
}: {
  icon: 'add' | 'remove';
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.stepperButton, pressed && styles.stepperButtonPressed]}
    >
      <Ionicons name={icon} size={20} color={theme.accentText} />
    </Pressable>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.page },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: theme.accentText,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.7,
  },
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 },

  title: {
    color: theme.textPrimary,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '800',
    letterSpacing: -1,
  },
  subtitle: { color: theme.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 10 },

  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
    marginTop: 16,
    shadowColor: '#26352B',
    shadowOpacity: 0.045,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardIcon: {
    width: 29,
    height: 29,
    borderRadius: 10,
    backgroundColor: theme.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: theme.accentText, fontSize: 14, fontWeight: '700' },
  cardHint: { color: theme.textMuted, fontSize: 13, marginTop: 3 },

  textarea: {
    minHeight: 118,
    color: theme.textBody,
    fontSize: 14,
    lineHeight: 21,
    padding: 0,
    marginTop: 14,
  },
  divider: { height: 1, backgroundColor: theme.accentSoft, marginVertical: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  linkInput: { flex: 1, color: theme.textBody, fontSize: 14, padding: 0 },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  // Count stepper: the pair sits close together and centred, directly above the
  // presets it drives. `space-between` pushed them to opposite card edges, which
  // read as two unrelated controls rather than one stepper.
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
  },
  stepperSpaced: { marginTop: 18 },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonPressed: { backgroundColor: theme.accentSoft },
  stepperValue: { alignItems: 'center', minWidth: 78 },
  stepperNumber: {
    color: theme.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  stepperUnit: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // Five presets share the row evenly, so 50 sits the same distance from 30 as
  // 30 does from 20 instead of trailing off to the right.
  presetRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  preset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: theme.surfaceAlt,
  },
  presetActive: { backgroundColor: theme.accentFill },
  presetText: { color: theme.textSecondary, fontSize: 13, fontWeight: '700' },
  presetTextActive: { color: theme.onAccent },

  errorCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: theme.dangerSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    padding: 14,
    marginTop: 16,
  },
  errorText: { flex: 1, color: theme.dangerText, fontSize: 12, lineHeight: 18 },

  startButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: theme.accentFill,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  startButtonPressed: { backgroundColor: theme.accentPressed },
  startButtonDisabled: { backgroundColor: theme.neutralFill },
  startButtonText: { color: theme.onAccent, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  footnote: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 12 },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: `${theme.page}F0`,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  loadingCard: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  loadingTitle: {
    color: theme.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 14,
    letterSpacing: -0.3,
  },
  loadingBody: { color: theme.textMuted, fontSize: 13, lineHeight: 21, marginTop: 12 },
  loadingHint: { color: theme.textMuted, fontSize: 13, lineHeight: 16, marginTop: 14 },

  });
}
