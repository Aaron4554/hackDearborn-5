import { useEffect, type ComponentProps, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStudy } from '@/contexts/StudyContext';
import MathText from '@/components/MathText';
import type { QuestionOutcome } from '@/services/agent';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function getOutcomeMeta(theme: Theme) {
  return {
    correct: { icon: 'checkmark', color: theme.accentText, label: 'Right' },
    incorrect: { icon: 'close', color: theme.dangerText, label: 'Missed' },
    unanswered: { icon: 'remove', color: theme.textMuted, label: 'Skipped' },
  } as Record<QuestionOutcome, { icon: IconName; color: string; label: string }>;
}

export default function StudyResultsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const {
    phase,
    iteration,
    questions,
    summary,
    answers,
    finishedReason,
    busy,
    error,
    reveal,
    nextRound,
    end,
    reset,
  } = useStudy();

  useEffect(() => {
    if (phase === 'idle') router.replace('/study/setup');
  }, [phase]);

  const nextRoundReady = phase === 'results' && questions.length > 0;

  const restart = () => {
    reset();
    router.replace('/study/setup');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>
          {phase === 'finished' ? 'SESSION DONE' : `ROUND ${summary?.iteration ?? iteration}`}
        </Text>
        <Text style={styles.title}>
          {phase === 'finished'
            ? 'That is a wrap'
            : phase === 'reveal'
              ? 'Want the answers?'
              : summary?.all_correct
                ? 'Flawless round'
                : 'Here is the recap'}
        </Text>
        <Text style={styles.subtitle}>
          {phase === 'finished'
            ? (finishedReason ?? 'You finished this session.')
            : phase === 'reveal'
              ? 'We can walk you through the ones you missed and bring back fresh wording.'
              : summary?.all_correct
                ? 'Every question you answered was right, so the next set steps up in difficulty.'
                : 'Unanswered questions are ignored, so they will not appear in the next round.'}
        </Text>

        {summary ? (
          <>
            <View style={styles.statRow}>
              <Stat value={summary.correct} tone="good" label="Right" />
              <Stat value={summary.incorrect} tone="bad" label="Missed" />
              <Stat value={summary.unanswered} tone="muted" label="Skipped" />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>This round</Text>
              <View style={styles.recap}>
                {summary.results.map((result) => {
                  const meta = getOutcomeMeta(theme)[result.outcome];
                  return (
                    <View key={result.id} style={styles.recapRow}>
                      <Ionicons name={meta.icon} size={13} color={meta.color} />
                      <MathText numberOfLines={2} style={styles.recapText}>
                        {result.stem}
                      </MathText>
                      <Text style={[styles.recapLabel, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}

        {phase === 'reveal' ? (
          <View style={styles.revealCard}>
            <View style={styles.revealIcon}>
              <Ionicons name="bulb-outline" size={17} color={theme.accentText} />
            </View>
            <Text style={styles.revealTitle}>See how you did?</Text>
            <Text style={styles.revealBody}>
              Showing answers explains the misses and rewrites them for next time. Skipping keeps
              them exactly as they were.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void reveal(true)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>Show me the answers</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void reveal(false)}
              style={({ pressed }) => [styles.ghostButton, pressed && styles.ghostPressed]}
            >
              <Text style={styles.ghostText}>Ask me these again</Text>
            </Pressable>
          </View>
        ) : null}

        {answers && answers.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Answers</Text>
            {answers.map((answer) => (
              <View key={answer.id} style={styles.answerBlock}>
                <MathText style={styles.answerStem}>{answer.stem}</MathText>
                <View style={styles.answerPick}>
                  <Ionicons name="checkmark-circle" size={15} color={theme.accentText} />
                  <MathText style={styles.answerPickText}>
                    {answer.options[answer.correct_index] ?? 'Answer unavailable'}
                  </MathText>
                </View>
                <MathText style={styles.answerExplanation}>{answer.explanation}</MathText>
              </View>
            ))}
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={16} color={theme.dangerText} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {phase === 'finished' ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={restart}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>Start a new session</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                reset();
                router.replace('/(tabs)/home');
              }}
              style={({ pressed }) => [styles.ghostButton, pressed && styles.ghostPressed]}
            >
              <Text style={styles.ghostText}>Back home</Text>
            </Pressable>
          </>
        ) : null}

        {nextRoundReady ? (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                if (nextRound()) router.replace('/study/quiz');
              }}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>
                {/* `iteration` is already the round waiting behind this recap:
                    the backend increments before it hands the next set over. */}
                {summary?.all_correct ? 'Try the harder set' : `Start round ${iteration}`}
              </Text>
              <Feather name="arrow-up-right" size={17} color={theme.onAccent} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void end();
              }}
              style={({ pressed }) => [styles.ghostButton, pressed && styles.ghostPressed]}
            >
              <Text style={styles.ghostText}>Stop for now</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: 'good' | 'bad' | 'muted';
}) {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const color = tone === 'good' ? theme.accentText : tone === 'bad' ? theme.dangerText : theme.textMuted;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.page },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },

  eyebrow: { color: theme.accentText, fontSize: 12, fontWeight: '800', letterSpacing: 1.7 },
  title: {
    color: theme.textPrimary,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 10,
  },
  subtitle: { color: theme.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 10 },

  statRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  stat: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  statLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 3,
  },

  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
    marginTop: 16,
  },
  cardTitle: { color: theme.accentText, fontSize: 14, fontWeight: '700' },

  recap: { marginTop: 12, gap: 11 },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  recapText: { flex: 1, color: theme.textMuted, fontSize: 12, lineHeight: 17 },
  recapLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },

  revealCard: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    marginTop: 16,
  },
  revealIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: theme.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealTitle: {
    color: theme.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 13,
  },
  revealBody: { color: theme.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 18 },

  answerBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.surfaceSoft,
  },
  answerStem: { color: theme.textBody, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  answerPick: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  answerPickText: { flex: 1, color: theme.accentText, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  answerExplanation: { color: theme.textMuted, fontSize: 12, lineHeight: 19, marginTop: 8 },

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

  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 26, gap: 9 },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: theme.accentFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryPressed: { backgroundColor: theme.accentPressed },
  primaryText: { color: theme.onAccent, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  ghostButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostPressed: { backgroundColor: theme.surfaceAlt },
  ghostText: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },

  });
}
