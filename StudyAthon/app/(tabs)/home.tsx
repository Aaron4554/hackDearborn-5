import { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import StudyBuddyReply from '@/components/StudyBuddyReply';
import { chat, describeAgentError } from '@/services/agent';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

// Some suggestions are a real route rather than text to prefill: a quiz needs a
// session, a question count, and a timer, so sending it as a chat prompt would
// quietly drop everything the study loop asks the student to choose.
const suggestions = [
  'Photosynthesis',
  'Cellular Respiration',
  'Newtonian Mechanics',
  'Calculus Derivatives',
  'World War II Timeline',
];

function getTools(theme: Theme) {
  return [
  {
    icon: 'layers-outline' as const,
    title: 'Flashcards',
    detail: 'Turn key ideas into quick active recall reviews',
    color: theme.violetText,
    background: theme.violetSoft,
    to: '/flashcards' as const,
    badge: 'NEW',
  },
  {
    icon: 'calendar-outline' as const,
    title: 'Study planner',
    detail: 'Build a routine that works for you',
    color: theme.warmText,
    background: theme.warmSoft,
    to: null,
    badge: 'SOON',
  },
];
};

function getModes(theme: Theme) {
  return [
  {
    key: 'loop' as const,
    icon: 'repeat' as const,
    title: 'Study Loop',
    subtitle: 'Adaptive quiz & timer',
    color: theme.accentText,
    background: theme.surfaceSoft,
  },
  {
    key: 'flashcards' as const,
    icon: 'layers-outline' as const,
    title: 'Flashcards',
    subtitle: 'Active recall deck',
    color: theme.violetText,
    background: theme.violetSoft,
  },
  {
    key: 'notes' as const,
    icon: 'document-text-outline' as const,
    title: 'Short Notes',
    subtitle: 'Quick summary notes',
    color: theme.coolText,
    background: theme.surfaceSoft,
  },
  {
    key: 'games' as const,
    icon: 'game-controller-outline' as const,
    title: 'Study Games',
    subtitle: 'Memory match & battles',
    color: theme.warmText,
    background: theme.warmSoft,
  },
];
};

export default function HomeScreen() {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showModes, setShowModes] = useState(false);

  const submitPrompt = async () => {
    if (!prompt.trim()) {
      setMessage('Add a topic or question to get started.');
      return;
    }

    setIsLoading(true);
    setMessage('');
    setAnswer('');
    try {
      const submittedPrompt = prompt.trim();
      const reply = await chat(submittedPrompt);
      setAnswer(reply);
    } catch (error) {
      setMessage(describeAgentError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const launchMode = (mode: 'loop' | 'flashcards' | 'notes' | 'games') => {
    const trimmed = prompt.trim();
    if (mode === 'notes') {
      void submitPrompt();
      return;
    }
    if (mode === 'loop') {
      router.push({
        pathname: '/study/setup',
        params: trimmed ? { text: trimmed, topic: trimmed } : {},
      });
      return;
    }
    if (mode === 'flashcards') {
      router.push({
        pathname: '/flashcards',
        params: trimmed ? { topic: trimmed } : {},
      });
      return;
    }
    if (mode === 'games') {
      router.push('/(tabs)/games');
      return;
    }
  };

  const chooseSuggestion = (item: string) => {
    setPrompt(item);
    setMessage('');
  };

  const startLearning = () => {
    if (!prompt.trim()) {
      setMessage('Add a topic or question to get started.');
      return;
    }
    setMessage('');
    Keyboard.dismiss();
    setShowModes(true);
  };

  const closeModes = () => setShowModes(false);

  const renderModeTile = (mode: (ReturnType<typeof getModes>)[number]) => {
    const isNotes = mode.key === 'notes';
    const notesLoading = isNotes && isLoading;
    return (
      <Pressable
        key={mode.key}
        onPress={() => {
          setShowModes(false);
          launchMode(mode.key);
        }}
        disabled={notesLoading}
        accessibilityRole="button"
        style={({ pressed }) => [styles.modeTile, (pressed || notesLoading) && styles.pressed]}>
        <View style={[styles.modeTileIcon, { backgroundColor: mode.background }]}>
          <Ionicons name={mode.icon} size={18} color={mode.color} />
        </View>
        <View style={styles.modeTileCopy}>
          <Text style={styles.modeTileTitle}>{mode.title}</Text>
          <Text style={styles.modeTileSubtitle}>
            {notesLoading ? 'Generating notes…' : mode.subtitle}
          </Text>
        </View>
        {notesLoading ? (
          <ActivityIndicator size="small" color={mode.color} />
        ) : (
          <Feather name="arrow-up-right" size={15} color={mode.color} />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Ionicons name="book" size={18} color={theme.onAccent} />
            </View>
            <Text style={styles.brandName}>studyathon</Text>
          </View>
          <View style={styles.homeStreakSpacer} />
        </View>

        <View style={styles.greeting}>
          <Text style={styles.eyebrow}>YOUR STUDY SPACE</Text>
          <Text style={styles.heading}>What are we{ '\n' }learning today?</Text>
          <Text style={styles.subtitle}>Enter any topic, then choose how you want to learn.</Text>
        </View>

        <View style={styles.promptCard}>
          <View style={styles.promptTitleRow}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles" size={16} color={theme.accentText} />
            </View>
            <Text style={styles.promptTitle}>Ask your AI study buddy</Text>
          </View>
          <TextInput
            value={prompt}
            onChangeText={(value) => {
              setPrompt(value);
              setMessage('');
            }}
            placeholder="e.g. Cellular respiration, World War II, Calculus..."
            placeholderTextColor={theme.textMuted}
            multiline
            blurOnSubmit={true}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (prompt.trim()) {
                Keyboard.dismiss();
                setMessage('');
                setShowModes(true);
              }
            }}
            textAlignVertical="top"
            accessibilityLabel="Your study prompt"
            style={styles.input}
          />
          {message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}

          <View style={styles.promptFooter}>
            <Pressable
              onPress={submitPrompt}
              disabled={isLoading}
              accessibilityRole="button"
              style={({ pressed }) => [styles.secondaryButton, (pressed || isLoading) && styles.pressed]}>
              <Ionicons name="sparkles-outline" size={15} color={theme.accentText} />
              <Text style={styles.secondaryButtonText}>Ask</Text>
            </Pressable>
            <Pressable
              onPress={startLearning}
              accessibilityRole="button"
              style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}>
              <Text style={styles.sendButtonText}>Start learning</Text>
              <Feather name="arrow-up-right" size={18} color={theme.onAccent} />
            </Pressable>
          </View>
        </View>

        {answer ? (
          <View style={styles.answerCard}>
            <View style={styles.answerHeading}>
              <View style={styles.aiIcon}><Ionicons name="sparkles" size={16} color={theme.accentText} /></View>
              <Text style={styles.promptTitle}>Your study buddy notes</Text>
            </View>
            <StudyBuddyReply text={answer} />
          </View>
        ) : null}

        <View style={styles.suggestionsSection}>
          <Text style={styles.sectionLabel}>POPULAR STUDY TOPICS</Text>
          <View style={styles.chips}>
            {suggestions.map((item) => (
              <Pressable
                key={item}
                onPress={() => chooseSuggestion(item)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <Ionicons name="sparkles-outline" size={12} color={theme.accentText} />
                <Text style={styles.chipText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.toolsHeading}>
          <View>
            <Text style={styles.sectionTitle}>Your study toolkit</Text>
            <Text style={styles.toolsSubtitle}>A little structure goes a long way.</Text>
          </View>
        </View>

        {getTools(theme).map((tool) => (
          <Pressable
            key={tool.title}
            onPress={() => {
              if (tool.to) router.push(tool.to);
            }}
            disabled={!tool.to}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.toolCard,
              tool.to && pressed && styles.pressed,
              !tool.to && { opacity: 0.8 },
            ]}>
            <View style={[styles.toolIcon, { backgroundColor: tool.background }]}>
              <Ionicons name={tool.icon} size={21} color={tool.color} />
            </View>
            <View style={styles.toolCopy}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.toolTitle}>{tool.title}</Text>
                {tool.badge ? (
                  <View
                    style={[
                      styles.badgePill,
                      tool.badge === 'NEW' ? styles.badgeNew : styles.badgeSoon,
                    ]}>
                    <Text
                      style={[
                        styles.badgeText,
                        tool.badge === 'NEW' ? styles.badgeTextNew : styles.badgeTextSoon,
                      ]}>
                      {tool.badge}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.toolDetail}>{tool.detail}</Text>
            </View>
            <Feather
              name="arrow-up-right"
              size={17}
              color={tool.to ? theme.accentText : theme.textMuted}
            />
          </Pressable>
        ))}

        <View style={styles.footerNote}>
          <Ionicons name="leaf-outline" size={15} color={theme.textMuted} />
          <Text style={styles.footerText}>Progress, one session at a time.</Text>
        </View>
      </ScrollView>

      <Modal
        visible={showModes}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeModes}>
        <View style={styles.sheetBackdrop}>
          <Pressable
            onPress={closeModes}
            accessibilityRole="button"
            accessibilityLabel="Close study modes"
            style={styles.backdropFill}
          />
          <View style={[styles.sheet, { paddingBottom: 18 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeading}>
                <Text style={styles.sheetTitle}>Choose your study mode</Text>
                <Text numberOfLines={1} style={styles.sheetTopic}>
                  {prompt.trim()}
                </Text>
              </View>
              <Pressable
                onPress={closeModes}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}>
                <Feather name="x" size={17} color={theme.accentText} />
              </Pressable>
            </View>
            <View style={styles.modeGrid}>{getModes(theme).map(renderModeTile)}</View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  safeArea: { flex: 1, 
    backgroundColor: theme.page 
  },
  content: { 
    paddingHorizontal: 22, 
    paddingBottom: 124
  },
  topBar: { 
    height: 54, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between' 
  },
  brand: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 9 
  },
  brandMark: { 
    width: 31, 
    height: 31, 
    borderRadius: 10, 
    backgroundColor: theme.accentFill, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  brandName: { 
    color: theme.accentText, 
    fontSize: 17, 
    fontWeight: '800', 
    letterSpacing: -0.5 
  },
  homeStreakSpacer: { width: 68, height: 40 },
  greeting: { 
    marginTop: 26, 
    marginBottom: 23 
  },
  eyebrow: { 
    color: theme.accentText, 
    fontSize: 12, 
    fontWeight: '800', 
    letterSpacing: 1.7, 
    marginBottom: 11 
  },
  heading: { 
    color: theme.textPrimary, 
    fontSize: 34, 
    lineHeight: 39, 
    letterSpacing: -1.1, fontWeight: '800' },
  subtitle: { color: theme.textSecondary, fontSize: 14, marginTop: 10 },
  promptCard: { backgroundColor: theme.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: theme.border, shadowColor: '#26352B', shadowOpacity: 0.045, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  promptTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  aiIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: theme.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  promptTitle: { color: theme.accentText, fontSize: 14, fontWeight: '700' },
  input: { minHeight: 74, color: theme.textBody, fontSize: 14, lineHeight: 21, padding: 0 },
  error: { color: theme.dangerText, fontSize: 12, lineHeight: 17, marginTop: 8 },
  modeGrid: {
    gap: 8,
  },
  modeTile: {
    backgroundColor: theme.accentSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  modeTileIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTileCopy: {
    flex: 1,
  },
  modeTileTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.accentText,
  },
  modeTileSubtitle: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  answerCard: { backgroundColor: theme.accentSoft, borderRadius: 18, padding: 16, marginTop: 13 },
  answerHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  promptFooter: { borderTopWidth: 1, borderTopColor: theme.surfaceSoft, paddingTop: 14, marginTop: 13, flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  secondaryButton: { minHeight: 52, borderRadius: 16, paddingHorizontal: 22, backgroundColor: theme.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderColor: theme.surfaceSoft },
  secondaryButtonText: { color: theme.accentText, fontWeight: '800', fontSize: 15 },
  sendButton: { minHeight: 52, borderRadius: 16, paddingHorizontal: 22, backgroundColor: theme.accentFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  sendButtonText: { color: theme.onAccent, fontWeight: '800', fontSize: 15 },
  pressed: { opacity: 0.75 },
  suggestionsSection: { marginTop: 25 },
  sectionLabel: { color: theme.textMuted, fontSize: 11, letterSpacing: 1.4, fontWeight: '800', marginBottom: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: theme.accentSoft, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  chipText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
  toolsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, marginBottom: 13 },
  sectionTitle: { color: theme.accentText, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  toolsSubtitle: { color: theme.textMuted, fontSize: 13, marginTop: 4 },
  soonBadge: { backgroundColor: theme.dangerSoft, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  soonText: { color: theme.emberText, fontSize: 11, letterSpacing: 0.8, fontWeight: '800' },
  badgePill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeNew: { backgroundColor: theme.violetSoft },
  badgeSoon: { backgroundColor: theme.dangerSoft },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  badgeTextNew: { color: theme.violetText },
  badgeTextSoon: { color: theme.emberText },
  toolCard: { minHeight: 72, backgroundColor: theme.surface, borderRadius: 17, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  toolIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toolCopy: { flex: 1, marginLeft: 12 },
  toolTitle: { color: theme.accentText, fontSize: 13, fontWeight: '700' },
  toolDetail: { color: theme.textMuted, fontSize: 12, marginTop: 4 },
  footerNote: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, marginTop: 15 },
  footerText: { color: theme.textMuted, fontSize: 12 },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(28,40,32,0.45)', justifyContent: 'flex-end' },
  backdropFill: { flex: 1 },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.borderStrong,
    marginBottom: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sheetHeading: { flex: 1 },
  sheetTitle: { color: theme.accentText, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  sheetTopic: { color: theme.textMuted, fontSize: 12, marginTop: 3 },
  sheetClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: theme.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  });
}
