import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import MathText from '@/components/MathText';
import {
  describeAgentError,
  generateFlashcards,
  type Flashcard,
  type FlashcardDeck,
} from '@/services/agent';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

const POPULAR_TOPICS = [
  'Photosynthesis & Cellular Respiration',
  'Newtonian Mechanics & Forces',
  'Cell Biology & Organelles',
  'Calculus: Derivatives & Integrals',
  'World War II Key Milestones',
  'Chemical Bonds & Reactions',
];

const CARD_COUNTS = [5, 8, 12, 15];

export default function FlashcardsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const params = useLocalSearchParams<{ topic?: string; notes?: string }>();
  const [topic, setTopic] = useState(params.topic || '');
  const [notes, setNotes] = useState(params.notes || '');
  const [selectedCount, setSelectedCount] = useState(8);
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(new Set());
  const [learningIds, setLearningIds] = useState<Set<string>>(new Set());
  const [isFinished, setIsFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Animated flip value (0 = front, 180 = back)
  const [flipAnimation] = useState(() => new Animated.Value(0));

  const flipCard = () => {
    if (isFlipped) {
      Animated.spring(flipAnimation, {
        toValue: 0,
        friction: 8,
        tension: 10,
        useNativeDriver: true,
      }).start();
      setIsFlipped(false);
    } else {
      Animated.spring(flipAnimation, {
        toValue: 180,
        friction: 8,
        tension: 10,
        useNativeDriver: true,
      }).start();
      setIsFlipped(true);
    }
  };

  const frontInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const frontAnimatedStyle = {
    transform: [{ rotateY: frontInterpolate }],
  };

  const backAnimatedStyle = {
    transform: [{ rotateY: backInterpolate }],
  };

  const handleGenerate = async (customTopic?: string) => {
    const targetTopic = customTopic || topic.trim();
    if (!targetTopic && !notes.trim()) {
      setErrorMessage('Please enter a topic or paste notes to generate flashcards.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      const generated = await generateFlashcards({
        topic: targetTopic || undefined,
        text: notes.trim() || undefined,
        count: selectedCount,
      });

      setDeck(generated);
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowHint(false);
      setMasteredIds(new Set());
      setLearningIds(new Set());
      setIsFinished(false);
      flipAnimation.setValue(0);
    } catch (err) {
      setErrorMessage(describeAgentError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const currentCard: Flashcard | null = deck ? deck.cards[currentIndex] : null;

  const handleMastered = () => {
    if (!currentCard || !deck) return;
    const newMastered = new Set(masteredIds);
    newMastered.add(currentCard.id);
    setMasteredIds(newMastered);

    advanceCard();
  };

  const handleStillLearning = () => {
    if (!currentCard || !deck) return;
    const newLearning = new Set(learningIds);
    newLearning.add(currentCard.id);
    setLearningIds(newLearning);

    advanceCard();
  };

  const advanceCard = () => {
    if (!deck) return;

    if (currentIndex + 1 < deck.cards.length) {
      Animated.timing(flipAnimation, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setIsFlipped(false);
        setShowHint(false);
        setCurrentIndex((prev) => prev + 1);
      });
    } else {
      setIsFinished(true);
    }
  };

  const restartDeck = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setMasteredIds(new Set());
    setLearningIds(new Set());
    setIsFinished(false);
    flipAnimation.setValue(0);
  };

  const reviewMissedOnly = () => {
    if (!deck) return;
    const missedCards = deck.cards.filter((c) => learningIds.has(c.id));
    if (missedCards.length === 0) {
      restartDeck();
      return;
    }
    setDeck({
      ...deck,
      cards: missedCards,
    });
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setMasteredIds(new Set());
    setLearningIds(new Set());
    setIsFinished(false);
    flipAnimation.setValue(0);
  };

  // Screen 1: Deck Setup / Creator
  if (!deck) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={() => router.back()}
            style={styles.backButton}>
            <Feather name="chevron-left" size={22} color={theme.accentText} />
          </Pressable>
          <Text style={styles.topBarEyebrow}>FLASHCARDS</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            <View style={styles.greeting}>
              <Text style={styles.eyebrow}>ACTIVE RECALL</Text>
              <Text style={styles.heading}>Master key ideas{'\n'}faster</Text>
              <Text style={styles.subtitle}>
                Generate focused, high-yield flashcard decks from any topic or study notes.
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}>
                  <Ionicons name="sparkles" size={16} color={theme.accentText} />
                </View>
                <Text style={styles.cardTitle}>What topic are you studying?</Text>
              </View>

              <TextInput
                value={topic}
                onChangeText={(val) => {
                  setTopic(val);
                  setErrorMessage('');
                }}
                placeholder="e.g. Cellular Respiration, Newton's Laws..."
                placeholderTextColor={theme.textMuted}
                style={styles.input}
              />

              <View style={styles.divider} />

              <View style={styles.cardHeadSecondary}>
                <View style={styles.cardIcon}>
                  <Ionicons name="document-text-outline" size={16} color={theme.accentText} />
                </View>
                <Text style={styles.cardTitle}>Or paste notes / summary (optional)</Text>
              </View>

              <TextInput
                value={notes}
                onChangeText={(val) => {
                  setNotes(val);
                  setErrorMessage('');
                }}
                placeholder="Paste key excerpts, equations, or lecture summary..."
                placeholderTextColor={theme.textMuted}
                multiline
                textAlignVertical="top"
                style={styles.textarea}
              />
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}>
                  <Ionicons name="layers-outline" size={16} color={theme.accentText} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>Deck size</Text>
                  <Text style={styles.cardHint}>Number of flashcards to generate.</Text>
                </View>
              </View>

              <View style={styles.presetRow}>
                {CARD_COUNTS.map((cnt) => (
                  <Pressable
                    key={cnt}
                    onPress={() => setSelectedCount(cnt)}
                    style={[
                      styles.preset,
                      selectedCount === cnt && styles.presetActive,
                    ]}>
                    <Text
                      style={[
                        styles.presetText,
                        selectedCount === cnt && styles.presetTextActive,
                      ]}>
                      {cnt} cards
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {errorMessage ? (
              <View style={styles.errorCard}>
                <Feather name="alert-circle" size={16} color={theme.dangerText} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={isLoading || (!topic.trim() && !notes.trim())}
              onPress={() => void handleGenerate()}
              style={({ pressed }) => [
                styles.startButton,
                (!topic.trim() && !notes.trim() && !isLoading) && styles.startButtonDisabled,
                pressed && styles.startButtonPressed,
              ]}>
              {isLoading ? (
                <View style={styles.buttonRow}>
                  <ActivityIndicator size="small" color={theme.onAccent} />
                  <Text style={styles.startButtonText}>Building your deck…</Text>
                </View>
              ) : (
                <View style={styles.buttonRow}>
                  <Text style={styles.startButtonText}>Generate flashcards</Text>
                  <Feather name="arrow-up-right" size={16} color={theme.onAccent} />
                </View>
              )}
            </Pressable>

            <View style={styles.suggestionsSection}>
              <Text style={styles.sectionLabel}>POPULAR TOPICS</Text>
              <View style={styles.chips}>
                {POPULAR_TOPICS.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => {
                      setTopic(item);
                      void handleGenerate(item);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.chip,
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons name="sparkles-outline" size={13} color={theme.accentText} />
                    <Text style={styles.chipText}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.footerNote}>
              <Ionicons name="leaf-outline" size={15} color={theme.textMuted} />
              <Text style={styles.footerText}>Progress, one session at a time.</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Screen 2: Finished Summary
  if (isFinished) {
    const totalCount = deck.cards.length;
    const masteredCount = masteredIds.size;
    const percentage = Math.round((masteredCount / totalCount) * 100);

    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Deck"
            hitSlop={10}
            onPress={() => setDeck(null)}
            style={styles.backButton}>
            <Feather name="x" size={20} color={theme.accentText} />
          </Pressable>
          <Text style={styles.topBarEyebrow}>DECK COMPLETE</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.eyebrow}>SESSION RECAP</Text>
          <Text style={styles.title}>
            {percentage === 100
              ? 'Flawless recall'
              : percentage >= 70
              ? 'Great work'
              : 'Here is the recap'}
          </Text>
          <Text style={styles.subtitle}>{deck.topic}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.accentText }]}>{masteredCount}</Text>
              <Text style={styles.statLabel}>Mastered</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: theme.warmText }]}>{learningIds.size}</Text>
              <Text style={styles.statLabel}>Still learning</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{percentage}%</Text>
              <Text style={styles.statLabel}>Accuracy</Text>
            </View>
          </View>

          <View style={styles.footerActions}>
            {learningIds.size > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={reviewMissedOnly}
                style={({ pressed }) => [
                  styles.startButton,
                  pressed && styles.startButtonPressed,
                ]}>
                <Ionicons name="repeat" size={17} color={theme.onAccent} />
                <Text style={styles.startButtonText}>
                  Review missed ({learningIds.size})
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={restartDeck}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}>
              <Ionicons name="refresh" size={16} color={theme.accentText} />
              <Text style={styles.secondaryButtonText}>Restart full deck</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setDeck(null)}
              style={({ pressed }) => [
                styles.ghostButton,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.ghostButtonText}>Study another topic</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Screen 3: Interactive Study Mode
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.studyHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End Deck"
          hitSlop={10}
          onPress={() => setDeck(null)}
          style={styles.backButton}>
          <Feather name="x" size={20} color={theme.accentText} />
        </Pressable>

        <View style={styles.iterationPill}>
          <Text style={styles.iterationText}>
            CARD {currentIndex + 1} OF {deck.cards.length}
          </Text>
        </View>

        <View style={styles.topicPill}>
          <Text numberOfLines={1} style={styles.topicPillText}>
            {deck.topic}
          </Text>
        </View>
      </View>

      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${((currentIndex + 1) / deck.cards.length) * 100}%`,
            },
          ]}
        />
      </View>

      <View style={styles.cardContainer}>
        <Pressable
          onPress={flipCard}
          style={styles.cardTouchable}
          accessibilityRole="button"
          accessibilityLabel="Tap to flip card">
          {/* Front of Card */}
          <Animated.View
            style={[
              styles.studyCard,
              styles.studyCardFront,
              frontAnimatedStyle,
              isFlipped && styles.hiddenSide,
            ]}>
            <View style={styles.cardBadgeRow}>
              <View style={styles.badgePill}>
                <Ionicons name="help-circle" size={13} color={theme.accentText} />
                <Text style={styles.badgePillText}>QUESTION</Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={styles.cardScroll}
              showsVerticalScrollIndicator={false}>
              <MathText style={styles.cardFrontText}>
                {currentCard?.front ?? ''}
              </MathText>
            </ScrollView>

            {currentCard?.hint ? (
              <View style={styles.hintContainer}>
                {showHint ? (
                  <View style={styles.hintBox}>
                    <MathText style={styles.hintText}>
                      {`💡 ${currentCard.hint}`}
                    </MathText>
                  </View>
                ) : (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      setShowHint(true);
                    }}
                    style={styles.hintButton}>
                    <Ionicons name="bulb-outline" size={14} color={theme.textMuted} />
                    <Text style={styles.hintButtonText}>Need a hint?</Text>
                  </Pressable>
                )}
              </View>
            ) : null}

            <View style={styles.cardFooter}>
              <Ionicons name="swap-horizontal" size={14} color={theme.textMuted} />
              <Text style={styles.tapToFlipText}>Tap anywhere to flip</Text>
            </View>
          </Animated.View>

          {/* Back of Card */}
          <Animated.View
            style={[
              styles.studyCard,
              styles.studyCardBack,
              backAnimatedStyle,
              !isFlipped && styles.hiddenSide,
            ]}>
            <View style={styles.cardBadgeRow}>
              <View style={[styles.badgePill, styles.badgePillAnswer]}>
                <Ionicons name="checkmark-circle" size={13} color={theme.accentText} />
                <Text style={[styles.badgePillText, { color: theme.accentText }]}>
                  ANSWER & EXPLANATION
                </Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={styles.cardScroll}
              showsVerticalScrollIndicator={false}>
              <MathText style={styles.cardBackText}>
                {currentCard?.back ?? ''}
              </MathText>
            </ScrollView>

            <View style={styles.cardFooter}>
              <Ionicons name="swap-horizontal" size={14} color={theme.textMuted} />
              <Text style={styles.tapToFlipText}>Tap to flip back</Text>
            </View>
          </Animated.View>
        </Pressable>
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          onPress={handleStillLearning}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.learningBtn,
            pressed && styles.pressed,
          ]}>
          <Ionicons name="refresh-outline" size={18} color={theme.warmText} />
          <Text style={styles.learningBtnText}>Still learning</Text>
        </Pressable>

        <Pressable
          onPress={handleMastered}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.masteredBtn,
            pressed && styles.pressed,
          ]}>
          <Ionicons name="checkmark" size={18} color={theme.onAccent} />
          <Text style={styles.masteredBtnText}>Got it</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.page,
  },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 40,
  },
  topBar: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.7,
    color: theme.accentText,
  },
  topBarSpacer: {
    width: 36,
  },
  greeting: {
    marginTop: 18,
    marginBottom: 20,
  },
  eyebrow: {
    color: theme.accentText,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.7,
    marginBottom: 8,
  },
  heading: {
    color: theme.textPrimary,
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -1.1,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.textSecondary,
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: '#26352B',
    shadowOpacity: 0.045,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
    marginBottom: 14,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  cardHeadSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
    marginBottom: 10,
  },
  cardIcon: {
    width: 29,
    height: 29,
    borderRadius: 10,
    backgroundColor: theme.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: theme.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
  cardHint: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  flex: {
    flex: 1,
  },
  input: {
    backgroundColor: theme.accentSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: theme.accentText,
  },
  textarea: {
    backgroundColor: theme.accentSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 76,
    fontSize: 14,
    color: theme.accentText,
  },
  divider: {
    height: 1,
    backgroundColor: theme.accentSoft,
    marginVertical: 4,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  preset: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: {
    backgroundColor: theme.surfaceSoft,
    borderColor: theme.borderStrong,
  },
  presetText: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  presetTextActive: {
    color: theme.accentText,
    fontWeight: '700',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: theme.dangerSoft,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  errorText: {
    color: theme.dangerText,
    fontSize: 12,
    flex: 1,
  },
  startButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: theme.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonPressed: {
    backgroundColor: theme.deepFill,
  },
  startButtonText: {
    color: theme.onAccent,
    fontWeight: '700',
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  suggestionsSection: {
    marginTop: 26,
  },
  sectionLabel: {
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '800',
    marginBottom: 11,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.accentSoft,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  footerNote: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 24,
  },
  footerText: {
    color: theme.textMuted,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.75,
  },

  // Interactive study screen styles
  studyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    height: 54,
  },
  iterationPill: {
    borderRadius: 12,
    backgroundColor: theme.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  iterationText: {
    color: theme.accentText,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  topicPill: {
    maxWidth: 120,
  },
  topicPillText: {
    fontSize: 12,
    color: theme.textMuted,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: theme.accentSoft,
    marginHorizontal: 22,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.accentFill,
    borderRadius: 2,
  },
  cardContainer: {
    flex: 1,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  cardTouchable: {
    flex: 1,
  },
  studyCard: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: '#26352B',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
    backfaceVisibility: 'hidden',
    justifyContent: 'space-between',
  },
  studyCardFront: {
    backgroundColor: theme.surface,
  },
  studyCardBack: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.borderStrong,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  hiddenSide: {
    opacity: 0,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.surfaceSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgePillAnswer: {
    backgroundColor: theme.accentSoft,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.accentText,
    letterSpacing: 0.8,
  },
  cardScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 18,
  },
  cardFrontText: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.textPrimary,
    lineHeight: 28,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  cardBackText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.accentText,
    lineHeight: 25,
    textAlign: 'center',
  },
  hintContainer: {
    alignItems: 'center',
    marginVertical: 4,
  },
  hintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.surfaceSoft,
    borderRadius: 10,
  },
  hintButtonText: {
    fontSize: 13,
    color: theme.textMuted,
    fontWeight: '700',
  },
  hintBox: {
    backgroundColor: theme.warmSoft,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  hintText: {
    fontSize: 12,
    color: theme.dangerText,
    fontWeight: '500',
    textAlign: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 6,
  },
  tapToFlipText: {
    fontSize: 13,
    color: theme.textMuted,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 22,
  },
  learningBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: theme.warmSoft,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  learningBtnText: {
    color: theme.warmText,
    fontWeight: '700',
    fontSize: 13,
  },
  masteredBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: theme.accentFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  masteredBtnText: {
    color: theme.onAccent,
    fontWeight: '700',
    fontSize: 13,
  },

  // Summary screen styles
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.textPrimary,
    letterSpacing: -0.8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 18,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 4,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footerActions: {
    gap: 10,
    marginTop: 8,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: theme.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
  ghostButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: theme.accentText,
    fontSize: 13,
    fontWeight: '700',
  },

  });
}
