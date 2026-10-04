import AsyncStorage from '@react-native-async-storage/async-storage';

type GameScore = { points: number; awardedRuns: string[] };
const scoreKey = (uid: string) => `studyathon:game-score:${uid}`;

export async function loadGamePoints(uid: string): Promise<number> {
  const raw = await AsyncStorage.getItem(scoreKey(uid));
  if (!raw) return 0;
  try {
    return (JSON.parse(raw) as GameScore).points ?? 0;
  } catch {
    return 0;
  }
}

/** Award a completed run once, even if the user revisits the result screen. */
export async function awardGamePoints(uid: string, runId: string, earned: number) {
  const raw = await AsyncStorage.getItem(scoreKey(uid));
  let score: GameScore = { points: 0, awardedRuns: [] };
  try {
    if (raw) score = { ...score, ...(JSON.parse(raw) as GameScore) };
  } catch {
    // Start a clean score if local storage was malformed.
  }
  if (score.awardedRuns.includes(runId)) return score.points;
  score.points += Math.max(0, Math.floor(earned));
  score.awardedRuns = [...score.awardedRuns.slice(-199), runId];
  await AsyncStorage.setItem(scoreKey(uid), JSON.stringify(score));
  return score.points;
}
