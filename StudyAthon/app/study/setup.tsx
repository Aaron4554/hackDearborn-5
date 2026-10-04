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

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 50;
const MIN_MINUTES = 5;
const MAX_MINUTES = 120;

const COUNT_PRESETS = [5, 10, 20];

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
            <Feather name="chevron-left" size={22} color="#29372D" />
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
                <Ionicons name="document-text-outline" size={16} color="#477B5B" />
              </View>
              <Text style={styles.cardTitle}>Your material</Text>
            </View>

            <TextInput
              multiline
              onChangeText={setText}
              placeholder="Paste notes or enter a topic, like human anatomy..."
              placeholderTextColor="#9AA49D"
              style={styles.textarea}
              textAlignVertical="top"
              value={text}
            />

            <View style={styles.divider} />

            <View style={styles.linkRow}>
              <Feather name="link" size={15} color="#9AA39C" />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={setUrl}
                placeholder="Or a link (optional)"
                placeholderTextColor="#9AA39C"
                style={styles.linkInput}
                value={url}
              />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardIcon}>
                <Ionicons name="help-circle-outline" size={16} color="#477B5B" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Questions this round</Text>
                <Text style={styles.cardHint}>
                  Between {MIN_QUESTIONS} and {MAX_QUESTIONS}.
                </Text>
              </View>
            </View>

            <View style={styles.stepperRow}>
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
                <Ionicons name="timer-outline" size={16} color="#477B5B" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Work on a timer</Text>
                <Text style={styles.cardHint}>The loop stops when time runs out.</Text>
              </View>
              <Switch
                onValueChange={setTimerOn}
                trackColor={{ false: '#E4E9E4', true: '#B7CFBB' }}
                thumbColor={timerOn ? '#477B5B' : '#FFFFFF'}
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
              <Feather name="alert-circle" size={16} color="#B9574B" />
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
            <Feather name="arrow-up-right" size={17} color="#FFFFFF" />
          </Pressable>

          {!canStart ? (
            <Text style={styles.footnote}>Add some notes or a link to get started.</Text>
          ) : null}
        </ScrollView>

        {busy ? (
          <View style={styles.overlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#477B5B" size="small" />
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
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.stepperButton, pressed && styles.stepperButtonPressed]}
    >
      <Ionicons name={icon} size={20} color="#29372D" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8F5' },
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9EDE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: '#6D9176',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
  },
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 },

  title: {
    color: '#25342A',
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '800',
    letterSpacing: -1,
  },
  subtitle: { color: '#7D8880', fontSize: 14, lineHeight: 21, marginTop: 10 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E9EDE8',
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
    backgroundColor: '#EDF5EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: '#29372D', fontSize: 14, fontWeight: '700' },
  cardHint: { color: '#9AA39C', fontSize: 11, marginTop: 3 },

  textarea: {
    minHeight: 118,
    color: '#34433A',
    fontSize: 14,
    lineHeight: 21,
    padding: 0,
    marginTop: 14,
  },
  divider: { height: 1, backgroundColor: '#F0F2EF', marginVertical: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  linkInput: { flex: 1, color: '#34433A', fontSize: 14, padding: 0 },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  stepperSpaced: { marginTop: 18 },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#F4F7F3',
    borderWidth: 1,
    borderColor: '#E9EDE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonPressed: { backgroundColor: '#E7EDE7' },
  stepperValue: { alignItems: 'center' },
  stepperNumber: {
    color: '#25342A',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  stepperUnit: {
    color: '#9AA39C',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  presetRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  preset: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F4F7F3',
  },
  presetActive: { backgroundColor: '#477B5B' },
  presetText: { color: '#7D8880', fontSize: 11, fontWeight: '700' },
  presetTextActive: { color: '#FFFFFF' },

  errorCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#FCEFEC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3D8D2',
    padding: 14,
    marginTop: 16,
  },
  errorText: { flex: 1, color: '#B9574B', fontSize: 12, lineHeight: 18 },

  startButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#477B5B',
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  startButtonPressed: { backgroundColor: '#3E6C4E' },
  startButtonDisabled: { backgroundColor: '#B4C4B8' },
  startButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  footnote: { color: '#98A19A', fontSize: 11, textAlign: 'center', marginTop: 12 },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(247,248,245,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E9EDE8',
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  loadingTitle: {
    color: '#25342A',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 14,
    letterSpacing: -0.3,
  },
  loadingBody: { color: '#5D6B62', fontSize: 13, lineHeight: 21, marginTop: 12 },
  loadingHint: { color: '#9AA39C', fontSize: 11, lineHeight: 16, marginTop: 14 },
});
