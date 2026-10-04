import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { fixedStudyGames, type StudyGameSet } from '@/data/fixedStudyGames';
import { awardGamePoints, loadGamePoints } from '@/services/games';
import { generateStudyGameSet } from '@/services/agent';
import ExpandableCard from '@/components/ExpandableCard';
import { loadPersonalizedGamePack, savePersonalizedGamePack } from '@/services/gamePacks';
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

function formatElapsed(totalSeconds: number) {
  totalSeconds = Math.floor(totalSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function GamesScreen() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const { user, personalInfo } = useAuth();
  const [customGameSet, setCustomGameSet] = useState<StudyGameSet | null>(null);
  const [gamePackOwnerUid, setGamePackOwnerUid] = useState<string | null>(null);
  const [gamePackExpiresAt, setGamePackExpiresAt] = useState<number | null>(null);
  const [gameMaterial, setGameMaterial] = useState('');
  const [isBuildingGames, setIsBuildingGames] = useState(false);
  const [gameBuildError, setGameBuildError] = useState('');
  const activeCustomGameSet = gamePackOwnerUid === user?.uid ? customGameSet : null;
  const gameSet: StudyGameSet = activeCustomGameSet ?? fixedStudyGames;
  const bossQuestions = gameSet.questions.slice(0, 20);
  const [points, setPoints] = useState(0);
  const [scoreError, setScoreError] = useState('');
  const [mode, setMode] = useState<Mode | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [readingCardIndex, setReadingCardIndex] = useState<number | null>(null);
  const [selectedForMatch, setSelectedForMatch] = useState<number[]>([]);
  const [awaitingGotIt, setAwaitingGotIt] = useState(false);
  const [matchedPairs, setMatchedPairs] = useState<number[]>([]);
  const [memoryStreak, setMemoryStreak] = useState(0);
  const [memoryEarned, setMemoryEarned] = useState(0);
  const [memoryStartedAt, setMemoryStartedAt] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [bossHealth, setBossHealth] = useState(100);
  const [hearts, setHearts] = useState(3);
  const [battleStreak, setBattleStreak] = useState(0);
  const [battleEarned, setBattleEarned] = useState(0);
  const [battleStartedAt, setBattleStartedAt] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showTimer, setShowTimer] = useState(true);
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

  useEffect(() => {
    let active = true;
    if (!user) return () => { active = false; };
    void loadPersonalizedGamePack(user.uid).then((saved) => {
      if (!active) return;
      setCustomGameSet(saved?.gameSet ?? null);
      setGamePackExpiresAt(saved?.expiresAt ?? null);
      setGamePackOwnerUid(user.uid);
    });
    return () => { active = false; };
  }, [user]);

  const buildPersonalizedGames = async () => {
    if (!gameMaterial.trim() || isBuildingGames) return;
    setIsBuildingGames(true);
    setGameBuildError('');
    try {
      const generated = await generateStudyGameSet(gameMaterial, {
        educationLevel: personalInfo?.educationLevel,
        gradeLevel: personalInfo?.gradeLevel,
        takesAdvancedClasses: personalInfo?.takesAdvancedClasses,
      });
      if (!user) throw new Error('Sign in to save your personalized games on this device.');
      const saved = await savePersonalizedGamePack(user.uid, generated);
      setCustomGameSet(saved.gameSet);
      setGamePackExpiresAt(saved.expiresAt);
      setGamePackOwnerUid(user.uid);
    } catch (error) {
      setGameBuildError(error instanceof Error ? error.message : 'Could not build games from that material.');
    } finally {
      setIsBuildingGames(false);
    }
  };

  const resetRun = () => {
    setMode(null);
    setCards([]);
    setReadingCardIndex(null);
    setSelectedForMatch([]);
    setAwaitingGotIt(false);
    setMatchedPairs([]);
    setMemoryStreak(0);
    setMemoryEarned(0);
    setMemoryStartedAt(0);
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
    setElapsedSeconds(0);
    setMemoryStartedAt(Date.now());
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

  const chooseMemoryCard = (index: number) => {
    if (readingCardIndex != null || awaitingGotIt || selectedForMatch.includes(index) || matchedPairs.includes(cards[index].pair)) return;
    setReadingCardIndex(index);
  };

  const confirmMemoryCardRead = (index: number) => {
    setReadingCardIndex(null);
    if (selectedForMatch.length === 0) {
      setSelectedForMatch([index]);
      return;
    }

    const first = cards[selectedForMatch[0]];
    const second = cards[index];
    if (first.pair === second.pair && first.kind !== second.kind) {
      const streak = memoryStreak + 1;
      const earned = 5 + Math.min(10, (streak - 1) * 2);
      const matched = [...matchedPairs, first.pair];
      const nextScore = memoryEarned + earned;
      setMemoryStreak(streak);
      setMemoryEarned(nextScore);
      setMatchedPairs(matched);
      setSelectedForMatch([]);
      if (matched.length === gameSet?.key_terms.length) {
        const seconds = elapsedSeconds;
        const speedBonus = seconds <= 60 ? 100 : seconds <= 120 ? 60 : seconds <= 180 ? 30 : 0;
        const total = nextScore + speedBonus;
        setMemoryEarned(total);
        void completeRun(total, true);
      }
    } else {
      setMemoryStreak(0);
      setSelectedForMatch([selectedForMatch[0], index]);
      setAwaitingGotIt(true);
    }
  };

  const dismissMismatch = () => {
    setSelectedForMatch([]);
    setAwaitingGotIt(false);
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
      if (streak % 3 === 0) setHearts((current) => Math.min(5, current + 1));
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

  useEffect(() => {
    if (mode !== 'memory' || finished || memoryStartedAt === 0) return undefined;
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - memoryStartedAt) / 1000)), 250);
    return () => clearInterval(timer);
  }, [mode, finished, memoryStartedAt]);

  const nextQuestion = () => {
    if (!gameSet) return;
    if (questionIndex + 1 >= bossQuestions.length) {
      void completeRun(battleEarned, bossHealth === 0);
      return;
    }
    setQuestionIndex((index) => index + 1);
    setAnswered(false);
    setElapsedSeconds(0);
    setBattleStartedAt(Date.now());
  };

  const currentQuestion = bossQuestions[questionIndex];
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
                <Text style={styles.gameHint}>Read each card and tap “I read it” to return. The first card stays face up while you choose the second.</Text>
                <View style={styles.timerRow}>
                  {showTimer ? <Text style={styles.timerLine}>TIME  {formatElapsed(elapsedSeconds)}</Text> : <View />}
                  <Pressable accessibilityRole="button" onPress={() => setShowTimer((shown) => !shown)}>
                    <Text style={styles.timerToggle}>{showTimer ? 'Hide timer' : 'Show timer'}</Text>
                  </Pressable>
                </View>
                <Text style={styles.gameHint}>Pairs in a row: {memoryStreak}. A mismatch resets the streak.</Text>
                <View style={styles.scoreLine}><Text style={styles.scoreLabel}>ROUND POINTS</Text><Text style={styles.scoreValue}>{memoryEarned}</Text></View>
                <View style={styles.cardGrid}>
                  {cards.map((card, index) => {
                    const faceUp = readingCardIndex === index || selectedForMatch.includes(index) || matchedPairs.includes(card.pair);
                    return (
                      <ExpandableCard
                        key={`${card.pair}-${card.kind}`}
                        label={`${card.kind} card`}
                        expandButtonOnly
                        showExpandButton={false}
                        autoExpand={readingCardIndex === index}
                        confirmLabel="I read it"
                        onConfirm={() => confirmMemoryCardRead(index)}
                        backgroundColor={faceUp ? theme.accentSoft : theme.memoryFill}
                        borderColor={faceUp ? theme.borderStrong : theme.memoryFill}
                        textColor={theme.accentText}
                        style={styles.memoryCardShell}
                        expandedContent={<Text style={styles.expandedMemoryText}>{card.face}</Text>}
                        contentLength={card.face.length}
                      >
                        <Pressable
                          onPress={() => chooseMemoryCard(index)}
                          disabled={readingCardIndex != null || awaitingGotIt || selectedForMatch.includes(index) || matchedPairs.includes(card.pair)}
                          style={[styles.memoryCard, faceUp && styles.memoryCardOpen, matchedPairs.includes(card.pair) && styles.memoryCardMatched]}
                        >
                          <Text numberOfLines={4} style={[styles.memoryCardText, !faceUp && styles.cardBackText]}>{faceUp ? card.face : '?'}</Text>
                        </Pressable>
                      </ExpandableCard>
                    );
                  })}
                </View>
                {awaitingGotIt ? (
                  <View style={styles.mismatchReview}>
                    <Text style={styles.gameHint}>These cards do not match. Review them, then flip them back.</Text>
                    <Pressable accessibilityRole="button" onPress={dismissMismatch} style={styles.primaryButton}>
                      <Text style={styles.primaryText}>Got It!</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : currentQuestion ? (
              <>
                <Text style={styles.gameTitle}>Boss battle</Text>
                <View style={styles.bossRow}><Text style={styles.bossEmoji}>🐉</Text><View style={styles.bossCopy}><Text style={styles.bossName}>Knowledge dragon</Text><Text style={styles.gameHint}>Health {bossHealth}/100</Text><View style={styles.healthTrack}><View style={[styles.healthFill, { width: `${bossHealth}%` }]} /></View></View></View>
                <View style={styles.heartsRow}><Text style={styles.gameHint}>Your shields</Text><Text style={styles.hearts}>{'♥ '.repeat(hearts)}</Text><Text style={styles.gameHint}>Streak {battleStreak}</Text></View>
                <Text style={styles.gameHint}>Every 3 correct answers in a row earns +1 shield (maximum 5).</Text>
                <View style={styles.timerRow}>
                  {showTimer ? <Text style={styles.timerLine}>TIME  {formatElapsed(elapsedSeconds)}</Text> : <View />}
                  <Pressable accessibilityRole="button" onPress={() => setShowTimer((shown) => !shown)}>
                    <Text style={styles.timerToggle}>{showTimer ? 'Hide timer' : 'Show timer'}</Text>
                  </Pressable>
                </View>
                <Text style={styles.questionCount}>QUESTION {questionIndex + 1} / {bossQuestions.length}</Text>
                <ExpandableCard
                  label="Expand game question"
                  backgroundColor={theme.page}
                  borderColor={theme.border}
                  textColor={theme.accentText}
                  contentLength={currentQuestion.question.length}
                >
                  <Text style={styles.questionText}>{currentQuestion.question}</Text>
                </ExpandableCard>
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
            <View style={styles.personalizeCard}>
              <Text style={styles.personalizeTitle}>Make games from what you are studying</Text>
              <Text style={styles.gameHint}>Personalized packs save on this device for offline play and expire after 14 days.</Text>
              <TextInput
                multiline
                value={gameMaterial}
                onChangeText={setGameMaterial}
                placeholder="Enter a topic or paste your notes…"
                placeholderTextColor={theme.textMuted}
                style={styles.personalizeInput}
                textAlignVertical="top"
                accessibilityLabel="Topic or notes for personalized games"
              />
              {gameBuildError ? <Text style={styles.scoreError}>{gameBuildError}</Text> : null}
              <Pressable
                disabled={!gameMaterial.trim() || isBuildingGames}
                onPress={() => void buildPersonalizedGames()}
                style={[styles.primaryButton, (!gameMaterial.trim() || isBuildingGames) && styles.disabledButton]}
              >
                {isBuildingGames ? <ActivityIndicator color={theme.onAccent} /> : <Text style={styles.primaryText}>Build my games</Text>}
              </Pressable>
              {activeCustomGameSet ? (
                <>
                  {gamePackExpiresAt ? <Text style={styles.gameHint}>Saved for offline play · expires {new Date(gamePackExpiresAt).toLocaleDateString()}</Text> : null}
                  <Pressable onPress={() => { setCustomGameSet(null); setGamePackExpiresAt(null); setGamePackOwnerUid(user?.uid ?? null); }} accessibilityRole="button">
                    <Text style={styles.useBuiltInText}>Use the built-in anatomy pack</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
            <View style={styles.topicCard}>
              <View style={styles.topicIcon}><Ionicons name="sparkles" size={18} color={theme.accentText} /></View>
              <View style={styles.topicCopy}><Text style={styles.topicLabel}>{activeCustomGameSet ? 'PERSONALIZED STUDY PACK' : 'BUILT-IN STUDY PACK'}</Text><Text numberOfLines={3} style={styles.topicText}>{gameSet.title}{activeCustomGameSet ? ' · generated from your material' : ' · ready to play offline'}</Text></View>
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
  personalizeCard: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 17, padding: 14, gap: 10 },
  personalizeTitle: { color: theme.accentText, fontSize: 15, fontWeight: '800' },
  personalizeInput: { minHeight: 88, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 11, color: theme.textPrimary, backgroundColor: theme.page, fontSize: 13, lineHeight: 18 },
  disabledButton: { opacity: 0.55 },
  useBuiltInText: { color: theme.accentText, textAlign: 'center', fontSize: 12, fontWeight: '700', padding: 4 },
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
  timerLine: { color: theme.accentText, fontSize: 12, fontWeight: '800', letterSpacing: 0.7 },
  timerRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timerToggle: { color: theme.accentText, fontSize: 12, fontWeight: '700', paddingVertical: 6, paddingHorizontal: 8 },
  scoreLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.page, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11 },
  scoreLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  scoreValue: { color: theme.textMuted, fontSize: 16, fontWeight: '800' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  mismatchReview: { gap: 10, alignItems: 'stretch' },
  memoryCardShell: { width: '31%', minHeight: 83, padding: 0, borderRadius: 12, overflow: 'hidden' },
  memoryCard: { width: '100%', minHeight: 83, borderRadius: 12, backgroundColor: theme.memoryFill, alignItems: 'center', justifyContent: 'center', padding: 7 },
  memoryCardOpen: { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.borderStrong },
  memoryCardMatched: { backgroundColor: theme.accentSoft, borderColor: theme.borderStrong },
  memoryCardText: { color: theme.accentText, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 14 },
  expandedMemoryText: { color: theme.accentText, fontSize: 22, lineHeight: 30, fontWeight: '700', textAlign: 'center' },
  cardBackText: {
    color: theme.onAccent,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
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
