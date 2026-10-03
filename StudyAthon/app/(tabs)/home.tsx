import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';

const suggestions = [
  'Explain a tough topic',
  'Quiz me on my notes',
  'Make a study plan',
];

const futureTools = [
  {
    icon: 'layers-outline' as const,
    title: 'Flashcards',
    detail: 'Turn key ideas into quick reviews',
    color: '#6759E8',
    background: '#F0EEFF',
  },
  {
    icon: 'calendar-outline' as const,
    title: 'Study planner',
    detail: 'Build a routine that works for you',
    color: '#D47732',
    background: '#FFF2E7',
  },
];

export default function HomeScreen() {
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submitPrompt = async () => {
    if (!prompt.trim()) {
      setMessage('Add a topic or question to get started.');
      return;
    }

    const apiUrl = process.env.EXPO_PUBLIC_AGENT_API_URL?.replace(/\/$/, '');
    if (!apiUrl) {
      setMessage('Set EXPO_PUBLIC_AGENT_API_URL in StudyAthon/.env to connect your agent.');
      return;
    }

    setIsLoading(true);
    setMessage('');
    setAnswer('');
    try {
      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'The study buddy could not respond.');
      }
      setAnswer(data.reply);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not reach the study buddy. Check your server URL.');
    } finally {
      setIsLoading(false);
    }
  };

  const chooseSuggestion = (suggestion: string) => {
    setPrompt(suggestion);
    setMessage('');
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
              <Ionicons name="book" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.brandName}>studyathon</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Notifications" style={styles.bellButton}>
            <Feather name="bell" size={20} color="#28332D" />
            <View style={styles.notificationDot} />
          </Pressable>
        </View>

        <View style={styles.greeting}>
          <Text style={styles.eyebrow}>YOUR STUDY SPACE</Text>
          <Text style={styles.heading}>What are we{ '\n' }learning today?</Text>
          <Text style={styles.subtitle}>Big goals start with one good question.</Text>
        </View>

        <View style={styles.promptCard}>
          <View style={styles.promptTitleRow}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles" size={16} color="#477B5B" />
            </View>
            <Text style={styles.promptTitle}>Ask your AI study buddy</Text>
          </View>
          <TextInput
            value={prompt}
            onChangeText={(value) => {
              setPrompt(value);
              setMessage('');
            }}
            placeholder="e.g. Help me understand cellular respiration..."
            placeholderTextColor="#9AA49D"
            multiline
            textAlignVertical="top"
            accessibilityLabel="Your study prompt"
            style={styles.input}
          />
          {message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}
          <View style={styles.promptFooter}>
            <Text style={styles.promptHint}>Ask anything. Learn at your pace.</Text>
            <Pressable
              onPress={() => void submitPrompt()}
              disabled={isLoading}
              accessibilityRole="button"
              style={({ pressed }) => [styles.sendButton, (pressed || isLoading) && styles.pressed]}>
              <Text style={styles.sendButtonText}>{isLoading ? 'Thinking…' : 'Start learning'}</Text>
              {!isLoading && <Feather name="arrow-up-right" size={16} color="#FFFFFF" />}
            </Pressable>
          </View>
        </View>

        {answer ? (
          <View style={styles.answerCard}>
            <View style={styles.answerHeading}>
              <View style={styles.aiIcon}><Ionicons name="sparkles" size={16} color="#477B5B" /></View>
              <Text style={styles.promptTitle}>Your study buddy</Text>
            </View>
            <Text accessibilityLiveRegion="polite" style={styles.answerText}>{answer}</Text>
          </View>
        ) : null}

        <View style={styles.suggestionsSection}>
          <Text style={styles.sectionLabel}>NOT SURE WHERE TO START?</Text>
          <View style={styles.chips}>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion}
                onPress={() => chooseSuggestion(suggestion)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <Text style={styles.chipText}>{suggestion}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.toolsHeading}>
          <View>
            <Text style={styles.sectionTitle}>Your study toolkit</Text>
            <Text style={styles.toolsSubtitle}>A little structure goes a long way.</Text>
          </View>
          <View style={styles.soonBadge}><Text style={styles.soonText}>MORE SOON</Text></View>
        </View>

        {futureTools.map((tool) => (
          <View key={tool.title} style={styles.toolCard}>
            <View style={[styles.toolIcon, { backgroundColor: tool.background }]}>
              <Ionicons name={tool.icon} size={21} color={tool.color} />
            </View>
            <View style={styles.toolCopy}>
              <Text style={styles.toolTitle}>{tool.title}</Text>
              <Text style={styles.toolDetail}>{tool.detail}</Text>
            </View>
            <Feather name="arrow-up-right" size={17} color="#A2ACA5" />
          </View>
        ))}

        <View style={styles.footerNote}>
          <Ionicons name="leaf-outline" size={15} color="#7A9A81" />
          <Text style={styles.footerText}>Progress, one session at a time.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, 
    backgroundColor: '#F7F8F5' 
  },
  content: { 
    paddingHorizontal: 22, 
    paddingBottom: 34 
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
    backgroundColor: '#477B5B', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  brandName: { 
    color: '#26352B', 
    fontSize: 17, 
    fontWeight: '800', 
    letterSpacing: -0.5 
  },
  bellButton: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: '#FFFFFF', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  notificationDot: { 
    position: 'absolute', 
    top: 9, 
    right: 10, 
    width: 7, 
    height: 7, 
    borderRadius: 4, 
    backgroundColor: '#E89769', 
    borderWidth: 1, 
    borderColor: '#FFFFFF' 
  },
  greeting: { 
    marginTop: 26, 
    marginBottom: 23 
  },
  eyebrow: { 
    color: '#6D9176', 
    fontSize: 10, 
    fontWeight: '800', 
    letterSpacing: 1.7, 
    marginBottom: 11 
  },
  heading: { 
    color: '#25342A', 
    fontSize: 34, 
    lineHeight: 39, 
    letterSpacing: -1.1, fontWeight: '800' },
  subtitle: { color: '#7D8880', fontSize: 14, marginTop: 10 },
  promptCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#E9EDE8', shadowColor: '#26352B', shadowOpacity: 0.045, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  promptTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  aiIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: '#EDF5EF', alignItems: 'center', justifyContent: 'center' },
  promptTitle: { color: '#29372D', fontSize: 14, fontWeight: '700' },
  input: { minHeight: 92, color: '#34433A', fontSize: 14, lineHeight: 21, padding: 0 },
  error: { color: '#B9574B', fontSize: 12, lineHeight: 17, marginTop: 8 },
  answerCard: { backgroundColor: '#EFF5EF', borderRadius: 18, padding: 16, marginTop: 13 },
  answerHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  answerText: { color: '#3C5142', fontSize: 14, lineHeight: 21 },
  promptFooter: { borderTopWidth: 1, borderTopColor: '#F0F2EF', paddingTop: 14, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  promptHint: { color: '#98A19A', fontSize: 11, flexShrink: 1 },
  sendButton: { minHeight: 42, borderRadius: 13, paddingHorizontal: 14, backgroundColor: '#477B5B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  pressed: { opacity: 0.75 },
  suggestionsSection: { marginTop: 25 },
  sectionLabel: { color: '#9AA39C', fontSize: 9, letterSpacing: 1.4, fontWeight: '800', marginBottom: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#EEF3EE', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  chipText: { color: '#58745F', fontSize: 11, fontWeight: '600' },
  toolsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, marginBottom: 13 },
  sectionTitle: { color: '#29372D', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  toolsSubtitle: { color: '#929B94', fontSize: 11, marginTop: 4 },
  soonBadge: { backgroundColor: '#F1F0E9', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  soonText: { color: '#89866B', fontSize: 8, letterSpacing: 0.8, fontWeight: '800' },
  toolCard: { minHeight: 72, backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: '#E9EDE8', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  toolIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toolCopy: { flex: 1, marginLeft: 12 },
  toolTitle: { color: '#334138', fontSize: 13, fontWeight: '700' },
  toolDetail: { color: '#9AA39C', fontSize: 10, marginTop: 4 },
  footerNote: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, marginTop: 15 },
  footerText: { color: '#92A095', fontSize: 10 },
});
