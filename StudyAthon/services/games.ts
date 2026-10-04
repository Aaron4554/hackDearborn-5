import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';

import { db } from '@/firebase';

const userRef = (uid: string) => doc(db, 'users', uid);

export async function loadGamePoints(uid: string): Promise<number> {
  const profile = await getDoc(userRef(uid));
  return typeof profile.data()?.points === 'number' ? profile.data()!.points : 0;
}

/** Update the profile and add a unique award record in one Firestore transaction. */
export async function awardGamePoints(uid: string, runId: string, earned: number) {
  const pointsToAdd = Math.min(200, Math.max(0, Math.floor(earned)));
  const profileRef = userRef(uid);
  const awardRef = doc(profileRef, 'pointAwards', runId);

  return runTransaction(db, async (transaction) => {
    const [profile, existingAward] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(awardRef),
    ]);
    if (!profile.exists()) throw new Error('Your StudyAthon profile could not be found.');
    const currentPoints = typeof profile.data().points === 'number' ? profile.data().points : 0;
    if (existingAward.exists() || pointsToAdd === 0) return currentPoints;

    transaction.set(awardRef, { points: pointsToAdd, createdAt: serverTimestamp() });
    transaction.update(profileRef, {
      points: currentPoints + pointsToAdd,
      lastPointAwardId: runId,
    });
    return currentPoints + pointsToAdd;
  });
}
