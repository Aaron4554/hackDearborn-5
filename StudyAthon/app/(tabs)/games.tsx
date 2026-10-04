import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { fixedStudyGames, type StudyGameSet } from '@/data/fixedStudyGames';
import { awardGamePoints, loadGamePoints } from '@/services/games';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

type Mode = 'memory' | 'boss';
type Card = { pair: number; face: string; kind: 'term' | 'definition' };

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeRunId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function GamesScreen() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const { user } = useAuth();
  const gameSet: StudyGameSet = fixedStudyGames;
  const [points, setPoints] = useState(0);
  const [scoreError, setScoreError] = useState('');
  const [mode, setMode] = useState<Mode | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [openCards, setOpenCards] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<number[]>([]);
  const [memoryStreak, setMemoryStreak] = useState(0);
  const [memoryEarned, setMemoryEarned] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [bossHealth, setBossHealth] = useState(100);
  const [hearts, setHearts] = useState(3);
  const [battleStreak, setBattleStreak] = useState(0);
  const [battleEarned, setBattleEarned] = useState(0);
  const [battleStartedAt, setBattleStartedAt] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [finished, setFinished] = useState(false);
  const [won, setWon] = useState(false);
  const [runId, setRunId] = useState(makeRunId);

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      setPoints(await loadGamePoints(user.uid));
      setScoreError('');
    } catch {
      setScoreError('Could not load your profile points. Check your connection.');
    }
  }, [user]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const resetRun = () => {
    setMode(null);
    setCards([]);
    setOpenCards([]);
    setMatchedPairs([]);
    setMemoryStreak(0);
    setMemoryEarned(0);
    setQuestionIndex(0);
    setBossHealth(100);
    setHearts(3);
    setBattleStartedAt(0);
    setBattleStreak(0);
    setBattleEarned(0);
    setAnswered(false);
    setFinished(false);
    setWon(false);
    setRunId(makeRunId());
  };

  const beginBossBattle = () => {
    resetRun();
    setElapsedSeconds(0);
    setBattleStartedAt(Date.now());
    setMode('boss');
  };

  const beginMemory = () => {
    if (!gameSet) return;
    const deck = gameSet.key_terms.flatMap((item, pair) => [
      { pair, face: item.term, kind: 'term' as const },
      { pair, face: item.definition, kind: 'definition' as const },
    ]);
    setCards(shuffled(deck));
    setMode('memory');
  };

  const completeRun = async (earned: number, victory: boolean) => {
    if (!user) return;
    setWon(victory);
    setFinished(true);
    try {
      const total = await awardGamePoints(user.uid, runId, earned);
      setPoints(total);
      setScoreError('');
    } catch {
      setScoreError('Your game finished, but points could not be saved. Check your connection and try another round.');
    }
  };

  const tapCard = (index: number) => {
    if (openCards.length === 2 || openCards.includes(index) || matchedPairs.includes(cards[index].pair)) return;
    const next = [...openCards, index];
    setOpenCards(next);
    if (next.length < 2) return;

    const first = cards[next[0]];
    const second = cards[next[1]];
    if (first.pair === second.pair && first.kind !== second.kind) {
      const streak = memoryStreak + 1;
      const earned = 5 + Math.min(10, (streak - 1) * 2);
      const matched = [...matchedPairs, first.pair];
      const nextScore = memoryEarned + earned;
      setMemoryStreak(streak);
      setMemoryEarned(nextScore);
      setMatchedPairs(matched);
      setOpenCards([]);
      if (matched.length === gameSet?.key_terms.length) void completeRun(nextScore, true);
    } else {
      setMemoryStreak(0);
      setTimeout(() => setOpenCards([]), 850);
    }
  };

  const chooseAnswer = (choice: number) => {
    if (!gameSet || answered || finished) return;
    const current = gameSet.questions[questionIndex];
    const correct = choice === current.correct_index;
    const seconds = elapsedSeconds;
    if (correct) {
      const streak = battleStreak + 1;
      const speedBonus = seconds <= 5 ? 8 : seconds <= 10 ? 4 : 0;
      const earned = 10 + speedBonus + Math.min(10, (streak - 1) * 2);
      const health = Math.max(0, bossHealth - 20);
      const total = battleEarned + earned;
      setBattleStreak(streak);
      setBattleEarned(total);
      setBossHealth(health);
      setAnswered(true);
      if (health === 0) void completeRun(total, true);
    } else {
      setBattleStreak(0);
      const remaining = hearts - 1;
      setHearts(remaining);
      setAnswered(true);
      if (remaining === 0) void completeRun(battleEarned, false);
    }
  };

  useEffect(() => {
    if (mode !== 'boss' || answered || finished || battleStartedAt === 0) return;
    const timer = setInterval(() => {
      setElapsedSeconds(Math.max(0, (Date.now() - battleStartedAt) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [mode, answered, finished, battleStartedAt]);

  const nextQuestion = () => {
    if (!gameSet) return;
    if (questionIndex + 1 >= gameSet.questions.length) {
      void completeRun(battleEarned, bossHealth === 0);
      return;
    }
    setQuestionIndex((index) => index + 1);
    setAnswered(false);
    setElapsedSeconds(0);
    setBattleStartedAt(Date.now());
  };

  const currentQuestion = gameSet?.questions[questionIndex];
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>LEARN BY PLAYING</Text>
            <Text style={styles.title}>Study games</Text>
          </View>
        </View>
        <View style={styles.totalPointsPill}>
          <Ionicons name="star" size={15} color={theme.emberText} />
          <Text style={styles.pointsText}>{points.toLocaleString()} game points</Text>
        </View>

        {mode ? (
          <View style={styles.gamePanel}>
            <Pressable onPress={resetRun} style={styles.backRow} accessibilityRole="button">
              <Feather name="arrow-left" size={17} color={theme.accentText} />
              <Text style={styles.backText}>All games</Text>
            </Pressable>
            {finished ? (
              <View style={styles.finishBox}>
                <Text style={styles.finishEmoji}>{won ? '🏆' : '🛡️'}</Text>
                <Text style={styles.finishTitle}>{won ? 'Victory!' : 'The boss got away'}</Text>
                <Text style={styles.finishCopy}>You earned {mode === 'memory' ? memoryEarned : battleEarned} game points.</Text>
                {scoreError ? <Text style={styles.scoreError}>{scoreError}</Text> : null}
                <Pressable onPress={resetRun} style={styles.primaryButton}><Text style={styles.primaryText}>Play again</Text></Pressable>
              </View>
            ) : mode === 'memory' ? (
              <>
                <Text style={styles.gameTitle}>Match the terms</Text>
                <Text style={styles.gameHint}>Find each key term and its meaning. Match streak: {memoryStreak}</Text>
                <View style={styles.scoreLine}><Text style={styles.scoreLabel}>ROUND POINTS</Text><Text style={styles.scoreValue}>{memoryEarned}</Text></View>
                <View style={styles.cardGrid}>
                  {cards.map((card, index) => {
                    const faceUp = openCards.includes(index) || matchedPairs.includes(card.pair);
                    return (
                      <Pressable key={`${card.pair}-${card.kind}`} onPress={() => tapCard(index)} style={[styles.memoryCard, faceUp && styles.memoryCardOpen, matchedPairs.includes(card.pair) && styles.memoryCardMatched]}>
                        <Text numberOfLines={4} style={[styles.memoryCardText, !faceUp && styles.cardBackText]}>{faceUp ? card.face : '?'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : currentQuestion ? (
              <>
                <Text style={styles.gameTitle}>Boss battle</Text>
                <View style={styles.bossRow}><Text style={styles.bossEmoji}>🐉</Text><View style={styles.bossCopy}><Text style={styles.bossName}>Knowledge dragon</Text><Text style={styles.gameHint}>Health {bossHealth}/100</Text><View style={styles.healthTrack}><View style={[styles.healthFill, { width: `${bossHealth}%` }]} /></View></View></View>
                <View style={styles.heartsRow}><Text style={styles.gameHint}>Your shields</Text><Text style={styles.hearts}>{'♥ '.repeat(hearts)}</Text><Text style={styles.gameHint}>Streak {battleStreak}</Text></View>
                <Text style={styles.questionCount}>QUESTION {questionIndex + 1} / {gameSet?.questions.length}</Text>
                <Text style={styles.questionText}>{currentQuestion.question}</Text>
                <View style={styles.answers}>
                  {currentQuestion.options.map((option, index) => {
                    const revealCorrect = answered && index === currentQuestion.correct_index;
                    const revealWrong = answered && index !== currentQuestion.correct_index;
                    return <Pressable key={`${questionIndex}-${index}`} onPress={() => chooseAnswer(index)} disabled={answered} style={[styles.answerButton, revealCorrect && styles.correctAnswer, revealWrong && styles.mutedAnswer]}><Text style={styles.answerText}>{option}</Text></Pressable>;
                  })}
                </View>
                {answered ? <><Text style={styles.explanation}>{currentQuestion.explanation}</Text>{!finished && <Pressable onPress={nextQuestion} style={styles.primaryButton}><Text style={styles.primaryText}>Next question</Text></Pressable>}</> : null}
                <Text style={styles.scoreLabel}>BATTLE POINTS  {battleEarned}</Text>
              </>
            ) : null}
          </View>
        ) : (
          <>
            <View style={styles.topicCard}>
              <View style={styles.topicIcon}><Ionicons name="sparkles" size={18} color={theme.accentText} /></View>
              <View style={styles.topicCopy}><Text style={styles.topicLabel}>BUILT-IN STUDY PACK</Text><Text numberOfLines={3} style={styles.topicText}>Anatomy basics · ready to play offline</Text></View>
            </View>
            <Text style={styles.sectionTitle}>{gameSet.title}</Text>
            <Text style={styles.sectionHint}>{gameSet.key_terms.length} key terms · {gameSet.questions.length} battle questions</Text>
            <Pressable onPress={beginMemory} style={styles.modeCard}>
              <View style={[styles.modeIcon, { backgroundColor: theme.coolSoft }]}><Ionicons name="albums" size={23} color={theme.coolText} /></View><View style={styles.modeCopy}><Text style={styles.modeTitle}>Memory match</Text><Text style={styles.modeDetail}>Pair each key term with its meaning. Earn points for matches and streaks.</Text></View><Feather name="chevron-right" size={19} color={theme.textMuted} />
            </Pressable>
            <Pressable onPress={beginBossBattle} style={styles.modeCard}>
              <View style={[styles.modeIcon, { backgroundColor: theme.warmSoft }]}><Ionicons name="flame" size={23} color={theme.emberText} /></View><View style={styles.modeCopy}><Text style={styles.modeTitle}>Knowledge dragon</Text><Text style={styles.modeDetail}>Answer quickly to deal more damage. Wrong answers cost a shield.</Text></View><Feather name="chevron-right" size={19} color={theme.textMuted} />
            </Pressable>
            {scoreError ? <Text style={styles.scoreError}>{scoreError}</Text> : null}
            <Text style={styles.pointsNote}>Points are added to your profile and Friends leaderboard. Fast answers and streaks earn bonuses.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.page },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 124, gap: 17 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  eyebrow: { color: theme.accentText, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 5 },
  title: { color: theme.textPrimary, fontSize: 29, fontWeight: '800', letterSpacing: -0.8 },
  totalPointsPill: { backgroundColor: theme.warmSoft, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: -6 },
  pointsText: { color: theme.dangerText, fontWeight: '800', fontSize: 12 },
  topicCard: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 17, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  topicIcon: { width: 33, height: 33, borderRadius: 11, backgroundColor: theme.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  topicCopy: { flex: 1, gap: 5 },
  topicLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  topicText: { color: theme.accentText, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  primaryButton: { backgroundColor: theme.accentFill, borderRadius: 13, minHeight: 48, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryText: { color: theme.onAccent, fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: theme.accentText, fontSize: 18, fontWeight: '800', marginTop: 3 },
  sectionHint: { color: theme.textMuted, fontSize: 12, marginTop: -12, marginBottom: 1 },
  modeCard: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modeCopy: { flex: 1, gap: 4 },
  modeTitle: { color: theme.accentText, fontSize: 14, fontWeight: '800' },
  modeDetail: { color: theme.textMuted, fontSize: 13, lineHeight: 16 },
  pointsNote: { color: theme.textMuted, fontSize: 12, lineHeight: 15, textAlign: 'center' },
  scoreError: { color: theme.dangerText, fontSize: 13, lineHeight: 16, textAlign: 'center' },
  gamePanel: { backgroundColor: theme.surface, borderRadius: 21, padding: 17, borderWidth: 1, borderColor: theme.border, gap: 14 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' },
  backText: { color: theme.accentText, fontSize: 12, fontWeight: '700' },
  gameTitle: { color: theme.accentText, fontSize: 21, fontWeight: '800' },
  gameHint: { color: theme.textMuted, fontSize: 13, lineHeight: 16 },
  scoreLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.page, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11 },
  scoreLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  scoreValue: { color: theme.textMuted, fontSize: 16, fontWeight: '800' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  memoryCard: { width: '31%', minHeight: 83, borderRadius: 12, backgroundColor: theme.memoryFill, alignItems: 'center', justifyContent: 'center', padding: 7 },
  memoryCardOpen: { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.borderStrong },
  memoryCardMatched: { backgroundColor: theme.accentSoft, borderColor: theme.borderStrong },
  memoryCardText: { color: theme.accentText, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 14 },
  cardBackText: { color: theme.onAccent, fontSize: 25, fontWeight: '500' },
  finishBox: { alignItems: 'center', paddingVertical: 23, gap: 11 },
  finishEmoji: { fontSize: 48 },
  finishTitle: { color: theme.accentText, fontSize: 23, fontWeight: '800' },
  finishCopy: { color: theme.textMuted, fontSize: 13, marginBottom: 8 },
  bossRow: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: theme.warmSoft, borderRadius: 15, padding: 12 },
  bossEmoji: { fontSize: 39 },
  bossCopy: { flex: 1, gap: 3 },
  bossName: { color: theme.dangerText, fontSize: 13, fontWeight: '800' },
  healthTrack: { height: 7, borderRadius: 5, backgroundColor: theme.dangerSoft, overflow: 'hidden', marginTop: 3 },
  healthFill: { height: '100%', backgroundColor: theme.dangerFill, borderRadius: 5 },
  heartsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hearts: { color: theme.warmText, fontSize: 16, fontWeight: '800' },
  questionCount: { color: theme.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 5 },
  questionText: { color: theme.accentText, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  answers: { gap: 8 },
  answerButton: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.accentSoft, borderRadius: 12, padding: 12, minHeight: 44, justifyContent: 'center' },
  correctAnswer: { backgroundColor: theme.accentSoft, borderColor: theme.borderStrong },
  mutedAnswer: { opacity: 0.48 },
  answerText: { color: theme.accentText, fontSize: 12, lineHeight: 17 },
  explanation: { color: theme.textMuted, backgroundColor: theme.accentSoft, borderRadius: 10, padding: 11, fontSize: 13, lineHeight: 17 },

  });
}
