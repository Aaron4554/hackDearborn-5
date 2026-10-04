import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

type StreakRecord = { days: number; lastActive: string };
const streakKey = (uid: string) => `studyathon:streak:${uid}`;
export const STREAK_CHANGED_EVENT = 'studyathon:streak-changed';

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function loadStreak(uid: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(streakKey(uid));
    if (!raw) return 0;
    const record = JSON.parse(raw) as StreakRecord;
    const today = dayKey(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (record.lastActive !== today && record.lastActive !== dayKey(yesterday)) return 0;
    return record.days;
  } catch {
    return 0;
  }
}

/** Mark a day active and continue the streak only on consecutive local dates. */
export async function recordStreakActivity(uid: string): Promise<number> {
  const today = dayKey(new Date());
  let record: StreakRecord = { days: 0, lastActive: '' };
  try {
    const raw = await AsyncStorage.getItem(streakKey(uid));
    if (raw) record = JSON.parse(raw) as StreakRecord;
  } catch {
    // A damaged local record starts a new streak.
  }
  if (record.lastActive !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    record = {
      days: record.lastActive === dayKey(yesterday) ? record.days + 1 : 1,
      lastActive: today,
    };
    await AsyncStorage.setItem(streakKey(uid), JSON.stringify(record));
  }
  DeviceEventEmitter.emit(STREAK_CHANGED_EVENT, record.days);
  return record.days;
}
