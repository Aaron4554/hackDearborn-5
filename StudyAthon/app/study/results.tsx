import { useEffect, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStudy } from '@/contexts/StudyContext';
import MathText from '@/components/MathText';
import type { QuestionOutcome } from '@/services/agent';

type IconName = ComponentProps<typeof Ionicons>['name'];

const OUTCOME_META: Record<QuestionOutcome, { icon: IconName; color: string; label: string }> = {
  correct: { icon: 'checkmark', color: '#477B5B', label: 'Right' },
  incorrect: { icon: 'close', color: '#B9574B', label: 'Missed' },
  unanswered: { icon: 'remove', color: '#A2ACA5', label: 'Skipped' },
};

export default function StudyResultsScreen() {
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
                  const meta = OUTCOME_META[result.outcome];
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
              <Ionicons name="bulb-outline" size={17} color="#477B5B" />
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
                  <Ionicons name="checkmark-circle" size={15} color="#477B5B" />
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
            <Feather name="alert-circle" size={16} color="#B9574B" />
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
              <Feather name="arrow-up-right" size={17} color="#FFFFFF" />
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
  const color = tone === 'good' ? '#477B5B' : tone === 'bad' ? '#B9574B' : '#9AA39C';
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8F5' },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 20 },

  eyebrow: { color: '#6D9176', fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  title: {
    color: '#25342A',
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 10,
  },
  subtitle: { color: '#7D8880', fontSize: 14, lineHeight: 21, marginTop: 10 },

  statRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  stat: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E9EDE8',
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  statLabel: {
    color: '#9AA39C',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 3,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E9EDE8',
    padding: 18,
    marginTop: 16,
  },
  cardTitle: { color: '#29372D', fontSize: 14, fontWeight: '700' },

  recap: { marginTop: 12, gap: 11 },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  recapText: { flex: 1, color: '#5D6B62', fontSize: 12, lineHeight: 17 },
  recapLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },

  revealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E9EDE8',
    padding: 20,
    marginTop: 16,
  },
  revealIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: '#EDF5EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealTitle: {
    color: '#25342A',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 13,
  },
  revealBody: { color: '#7D8880', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 18 },

  answerBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F2EF',
  },
  answerStem: { color: '#34433A', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  answerPick: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  answerPickText: { flex: 1, color: '#477B5B', fontSize: 13, fontWeight: '700', lineHeight: 19 },
  answerExplanation: { color: '#5D6B62', fontSize: 12, lineHeight: 19, marginTop: 8 },

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

  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 26, gap: 9 },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#477B5B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryPressed: { backgroundColor: '#3E6C4E' },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  ghostButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9EDE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostPressed: { backgroundColor: '#F4F7F3' },
  ghostText: { color: '#58745F', fontSize: 13, fontWeight: '700' },
});
