import {
  collection,
  doc,
  getDoc,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type FirestoreError,
} from 'firebase/firestore';

import { db } from '@/firebase';

export type UserProfile = {
  uid: string;
  username: string;
  usernameLower: string;
  tag: string;
  points: number;
};

export type FriendRequest = {
  id: string;
  fromUid: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'declined';
};

export type FriendProfile = UserProfile;

export class SocialError extends Error {}

export function validateUsername(username: string) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

export function handleId(username: string, tag: string) {
  return `${username.toLowerCase()}#${tag}`;
}

export function profileFromData(data: Record<string, unknown>): UserProfile {
  return {
    uid: String(data.uid),
    username: String(data.username),
    usernameLower: String(data.usernameLower),
    tag: String(data.tag),
    points: typeof data.points === 'number' ? data.points : 0,
  };
}

export async function createUserProfile(uid: string, username: string): Promise<UserProfile> {
  const cleanUsername = username.trim();
  if (!validateUsername(cleanUsername)) {
    throw new SocialError('Use 3–20 letters, numbers, or underscores for your username.');
  }
  const usernameLower = cleanUsername.toLowerCase();
  const profileRef = doc(db, 'users', uid);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const tag = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
    const newHandleId = handleId(usernameLower, tag);
    const handleRef = doc(db, 'handles', newHandleId);

    const profile = await runTransaction(db, async (transaction) => {
      const [handleSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(handleRef),
        transaction.get(profileRef),
      ]);
      if (profileSnapshot.exists()) {
        throw new SocialError('Your StudyAthon profile is already set up.');
      }
      if (handleSnapshot.exists()) return null;

      const nextProfile: UserProfile = {
        uid,
        username: cleanUsername,
        usernameLower,
        tag,
        points: 0,
      };
      transaction.set(profileRef, { ...nextProfile, createdAt: serverTimestamp() });
      transaction.set(handleRef, { uid });
      return nextProfile;
    });

    if (profile) return profile;
  }

  throw new SocialError('Could not reserve a username tag. Please try again.');
}

export async function sendFriendRequest(uid: string, input: string) {
  const match = input.trim().match(/^([a-zA-Z0-9_]{3,20})#([0-9]{4})$/);
  if (!match) {
    throw new SocialError('Enter a username and four-digit tag, like studyfan#0427.');
  }

  const [, username, tag] = match;
  const targetHandle = handleId(username, tag);
  const lookupRef = doc(db, 'handles', targetHandle);
  const lookup = await getDoc(lookupRef);
  if (!lookup.exists()) throw new SocialError('We could not find that StudyAthon handle.');

  const targetUid = String(lookup.data().uid);
  if (targetUid === uid) throw new SocialError('That is your own handle.');

  const friendId = [uid, targetUid].sort().join('_');
  const friendshipRef = doc(db, 'friendships', friendId);
  const outgoingRef = doc(db, 'friendRequests', `${uid}_${targetUid}`);
  const incomingRef = doc(db, 'friendRequests', `${targetUid}_${uid}`);

  await runTransaction(db, async (transaction) => {
    const [friendship, outgoing, incoming] = await Promise.all([
      transaction.get(friendshipRef),
      transaction.get(outgoingRef),
      transaction.get(incomingRef),
    ]);

    if (friendship.exists()) throw new SocialError('You are already friends.');
    if (outgoing.exists() && outgoing.data().status === 'pending') {
      throw new SocialError('Your friend request is already pending.');
    }
    if (incoming.exists() && incoming.data().status === 'pending') {
      throw new SocialError('This person already sent you a request. Check incoming requests below.');
    }

    transaction.set(outgoingRef, {
      fromUid: uid,
      toUid: targetUid,
      targetHandle,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  });
}

export async function respondToFriendRequest(request: FriendRequest, accept: boolean) {
  const requestRef = doc(db, 'friendRequests', request.id);
  const friendId = [request.fromUid, request.toUid].sort().join('_');
  const friendshipRef = doc(db, 'friendships', friendId);

  await runTransaction(db, async (transaction) => {
    const currentRequest = await transaction.get(requestRef);
    if (!currentRequest.exists() || currentRequest.data().status !== 'pending') {
      throw new SocialError('This request has already been handled.');
    }
    if (currentRequest.data().toUid !== request.toUid) {
      throw new SocialError('This friend request is no longer available.');
    }

    if (accept) {
      const friendship = await transaction.get(friendshipRef);
      if (!friendship.exists()) {
        transaction.set(friendshipRef, {
          memberUids: [request.fromUid, request.toUid].sort(),
          requestId: request.id,
          createdAt: serverTimestamp(),
        });
      }
    }
    transaction.update(requestRef, {
      status: accept ? 'accepted' : 'declined',
      updatedAt: serverTimestamp(),
    });
  });
}

export function incomingRequestsQuery(uid: string) {
  return query(collection(db, 'friendRequests'), where('toUid', '==', uid));
}

export function friendsQuery(uid: string) {
  return query(collection(db, 'friendships'), where('memberUids', 'array-contains', uid));
}

export async function getFriendProfile(uid: string): Promise<FriendProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? profileFromData(snapshot.data()) : null;
}

export function describeSocialError(error: unknown) {
  if (error instanceof SocialError) return error.message;
  if ((error as FirestoreError)?.code === 'permission-denied') {
    return 'Firestore denied this action. Check that your database rules are deployed.';
  }
  if ((error as FirestoreError)?.code === 'unavailable') {
    return 'Could not reach Firestore. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
