import AsyncStorage from '@react-native-async-storage/async-storage';

import type { StudyGameSet } from '@/data/fixedStudyGames';

const VALID_FOR_MS = 14 * 24 * 60 * 60 * 1000;
const keyForUser = (uid: string) => `studyathon:personalized-games:${uid}`;

export type SavedGamePack = { gameSet: StudyGameSet; expiresAt: number };

function isGameSet(value: unknown): value is StudyGameSet {
  if (!value || typeof value !== 'object') return false;
  const set = value as Partial<StudyGameSet>;
  return typeof set.title === 'string'
    && Array.isArray(set.key_terms)
    && set.key_terms.length >= 2
    && Array.isArray(set.questions)
    && set.questions.length > 0;
}

export async function savePersonalizedGamePack(uid: string, gameSet: StudyGameSet): Promise<SavedGamePack> {
  const saved: SavedGamePack = { gameSet, expiresAt: Date.now() + VALID_FOR_MS };
  await AsyncStorage.setItem(keyForUser(uid), JSON.stringify(saved));
  return saved;
}

export async function loadPersonalizedGamePack(uid: string): Promise<SavedGamePack | null> {
  const key = keyForUser(uid);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedGamePack>;
    if (!isGameSet(parsed.gameSet) || typeof parsed.expiresAt !== 'number') {
      await AsyncStorage.removeItem(key);
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return parsed as SavedGamePack;
  } catch {
    return null;
  }
}
