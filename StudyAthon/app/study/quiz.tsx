import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStudy } from '@/contexts/StudyContext';
import MathText from '@/components/MathText';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function StudyQuizScreen() {
  const {
    phase,
    iteration,
    questions,
    cursor,
    currentQuestion,
    secondsRemaining,
    busy,
    error,
    answer,
    end,
  } = useStudy();

  // One tap, one answer. The context also guards against this, but locking in
  // the view stops the card from flickering through a second selection.
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (phase === 'reveal' || phase === 'results' || phase === 'finished') {
      router.replace('/study/results');
    } else if (phase === 'idle') {
      router.replace('/study/setup');
    }
  }, [phase]);

  useEffect(() => {
    if (!locked) return undefined;
    const timer = setTimeout(() => setLocked(false), 400);
    return () => clearTimeout(timer);
  }, [locked]);

  if (!currentQuestion) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Loading your questions</Text>
        </View>
      </SafeAreaView>
    );
  }

  const total = questions.length;
  const answered = Math.min(cursor + 1, total);
  const progress = total > 0 ? answered / total : 0;
  const runningOut = secondsRemaining != null && secondsRemaining <= 60;

  const choose = (index: number) => {
    if (locked || busy) return;
    setLocked(true);
    void answer(index);
  };

  const skip = () => {
    if (locked || busy) return;
    setLocked(true);
    void answer(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="End session"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            void end();
            router.replace('/study/results');
          }}
          style={styles.closeButton}
        >
          <Feather name="x" size={20} color="#29372D" />
        </Pressable>

        <View style={styles.iterationPill}>
          <Text style={styles.iterationText}>ROUND {iteration}</Text>
        </View>

        {secondsRemaining != null ? (
          <View style={[styles.timerPill, runningOut && styles.timerPillUrgent]}>
            <Ionicons name="timer-outline" size={13} color={runningOut ? '#B9574B' : '#477B5B'} />
            <Text style={[styles.timerText, runningOut && styles.timerTextUrgent]}>
              {formatClock(secondsRemaining)}
            </Text>
          </View>
        ) : (
          <Text style={styles.counter}>{answered}/{total}</Text>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.questionMeta}>
          <View style={styles.difficultyPill}>
            <Text style={styles.difficultyText}>{currentQuestion.difficulty.toUpperCase()}</Text>
          </View>
          <Text style={styles.counter}>
            {answered} of {total}
          </Text>
        </View>

        <MathText style={styles.stem}>{currentQuestion.stem}</MathText>

        <View style={styles.options}>
          {currentQuestion.options.map((option, index) => (
            <Pressable
              key={`${currentQuestion.id}-${index}`}
              accessibilityRole="button"
              disabled={locked || busy}
              onPress={() => choose(index)}
              style={({ pressed }) => [
                styles.option,
                pressed && !locked && styles.optionPressed,
              ]}
            >
              <View style={styles.optionLetter}>
                <Text style={styles.optionLetterText}>{OPTION_LETTERS[index] ?? index + 1}</Text>
              </View>
              <MathText style={styles.optionText}>{option}</MathText>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={locked || busy}
          onPress={skip}
          style={styles.skipButton}
        >
          <Text style={styles.skipText}>Skip this one</Text>
          <Text style={styles.skipHint}>Unanswered questions do not count against you.</Text>
        </Pressable>

        {error ? (
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={16} color="#B9574B" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8F5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#7D8880', fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 14,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9EDE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iterationPill: {
    backgroundColor: '#EEF3EE',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  iterationText: { color: '#58745F', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF3EE',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  timerPillUrgent: { backgroundColor: '#FCEFEC' },
  timerText: { color: '#477B5B', fontSize: 12, fontWeight: '700' },
  timerTextUrgent: { color: '#B9574B' },
  counter: { color: '#9AA39C', fontSize: 11, fontWeight: '600' },

  progressTrack: {
    height: 3,
    backgroundColor: '#E9EDE8',
    marginHorizontal: 20,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: '#477B5B', borderRadius: 2 },

  content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 40 },
  questionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  difficultyPill: {
    backgroundColor: '#FFF2E7',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  difficultyText: { color: '#D47732', fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  stem: {
    color: '#25342A',
    fontSize: 23,
    lineHeight: 31,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 16,
  },

  options: { marginTop: 22, gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E9EDE8',
    paddingHorizontal: 15,
    paddingVertical: 16,
  },
  optionPressed: { backgroundColor: '#EDF5EF', borderColor: '#C8DACB' },
  optionLetter: {
    width: 27,
    height: 27,
    borderRadius: 9,
    backgroundColor: '#F4F7F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLetterText: { color: '#58745F', fontSize: 11, fontWeight: '800' },
  optionText: { flex: 1, color: '#34433A', fontSize: 14, lineHeight: 20 },

  skipButton: { alignItems: 'center', marginTop: 22, padding: 8 },
  skipText: { color: '#58745F', fontSize: 13, fontWeight: '700' },
  skipHint: { color: '#A2ACA5', fontSize: 10, marginTop: 4, textAlign: 'center' },

  errorCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#FCEFEC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3D8D2',
    padding: 14,
    marginTop: 20,
  },
  errorText: { flex: 1, color: '#B9574B', fontSize: 12, lineHeight: 18 },
});
