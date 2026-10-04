import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { doc, onSnapshot } from 'firebase/firestore';

import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase';
import {
  describeSocialError,
  friendsQuery,
  getFriendProfile,
  incomingRequestsQuery,
  loadProfilesByUid,
  respondToFriendRequest,
  sendFriendRequest,
  type FriendProfile,
  type FriendRequest,
} from '@/services/social';

type IncomingRequest = { request: FriendRequest; sender: FriendProfile | null };

export default function FriendsScreen() {
  const { user, profile } = useAuth();
  const [lookup, setLookup] = useState('');
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeRequest, setActiveRequest] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let profileUnsubscribes: (() => void)[] = [];
    const unsubscribeFriends = onSnapshot(
      friendsQuery(user.uid),
      (snapshot) => {
        profileUnsubscribes.forEach((unsubscribe) => unsubscribe());
        profileUnsubscribes = [];
        const friendIds = snapshot.docs.flatMap((friendship) => {
          const members = friendship.data().memberUids as string[];
          return members.filter((memberUid) => memberUid !== user.uid);
        });
        if (!friendIds.length) {
          setFriends([]);
          return;
        }

        const profiles = new Map<string, FriendProfile>();
        profileUnsubscribes = friendIds.map((friendUid) => onSnapshot(
          doc(db, 'users', friendUid),
          (friendSnapshot) => {
            if (friendSnapshot.exists()) {
              const data = friendSnapshot.data();
              profiles.set(friendUid, {
                uid: friendUid,
                username: String(data.username),
                usernameLower: String(data.usernameLower),
                tag: String(data.tag),
                points: typeof data.points === 'number' ? data.points : 0,
              });
            } else {
              profiles.delete(friendUid);
            }
            setFriends(Array.from(profiles.values()));
          },
          (snapshotError) => setError(describeSocialError(snapshotError)),
        ));
      },
      (snapshotError) => setError(describeSocialError(snapshotError)),
    );

    const unsubscribeRequests = onSnapshot(
      incomingRequestsQuery(user.uid),
      async (snapshot) => {
        const pending = snapshot.docs
          .map((item) => ({ ...item.data(), id: item.id }) as FriendRequest)
          .filter((request) => request.status === 'pending');
        try {
          const incoming = await Promise.all(pending.map(async (request) => ({
            request,
            sender: await getFriendProfile(request.fromUid),
          })));
          setRequests(incoming);
        } catch (snapshotError) {
          setError(describeSocialError(snapshotError));
        }
      },
      (snapshotError) => setError(describeSocialError(snapshotError)),
    );

    return () => {
      unsubscribeFriends();
      unsubscribeRequests();
      profileUnsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  /**
   * The live listeners above keep the board current while it is open, but they are
   * the only thing feeding it. A Firestore Listen stream that fails at the
   * transport layer is retried internally and never reaches `onSnapshot`'s error
   * callback, so the board can silently serve its cached value -- typically the
   * zeros from a cold start -- for the rest of the session. The games tab avoids
   * this by re-reading on focus, so a finished game always shows up there.
   * Re-read here too, or the leaderboard is the one screen that can disagree with
   * the points actually banked.
   */
  // Keyed on the roster so a newly accepted friend is picked up too. It settles
  // once the roster stops changing, so this cannot loop against setFriends.
  const rosterKey = useMemo(
    () => [...friends.map((friend) => friend.uid), user?.uid].sort().join(','),
    [friends, user],
  );

  const refreshPoints = useCallback(async () => {
    if (!user) return;
    try {
      const fresh = await loadProfilesByUid(rosterKey.split(','));
      setFriends(fresh.filter((person) => person.uid !== user.uid));
      setError('');
    } catch (refreshError) {
      setError(describeSocialError(refreshError));
    }
  }, [user, rosterKey]);

  useFocusEffect(useCallback(() => { void refreshPoints(); }, [refreshPoints]));

  const leaderboard = useMemo(
    () => [...(profile ? [profile] : []), ...friends].sort(
      (left, right) => right.points - left.points || left.usernameLower.localeCompare(right.usernameLower),
    ),
    [friends, profile],
  );

  const handleSendRequest = async () => {
    if (!user) return;
    setError('');
    setNotice('');
    setIsSending(true);
    try {
      await sendFriendRequest(user.uid, lookup);
      setLookup('');
      setNotice('Friend request sent.');
    } catch (requestError) {
      setError(describeSocialError(requestError));
    } finally {
      setIsSending(false);
    }
  };

  const handleRequest = async (request: FriendRequest, accept: boolean) => {
    setError('');
    setActiveRequest(request.id);
    try {
      await respondToFriendRequest(request, accept);
      setNotice(accept ? 'You’re friends now.' : 'Request declined.');
    } catch (requestError) {
      setError(describeSocialError(requestError));
    } finally {
      setActiveRequest(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>STUDY TOGETHER</Text>
        <Text style={styles.title}>Friends</Text>
        <Text style={styles.subtitle}>Find your people and keep each other moving.</Text>

        <View style={styles.addCard}>
          <View style={styles.cardHeading}>
            <View style={styles.addIcon}><Ionicons name="person-add" size={17} color="#477B5B" /></View>
            <View style={styles.cardHeadingCopy}>
              <Text style={styles.cardTitle}>Add a friend</Text>
              <Text style={styles.cardHint}>Search with their username and tag</Text>
            </View>
          </View>
          <View style={styles.searchRow}>
            <TextInput
              value={lookup}
              onChangeText={setLookup}
              placeholder="username#0427"
              placeholderTextColor="#A3ADA5"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Friend username and four digit tag"
              returnKeyType="send"
              onSubmitEditing={() => void handleSendRequest()}
              style={styles.searchInput}
            />
            <Pressable
              onPress={() => void handleSendRequest()}
              disabled={isSending || !lookup.trim()}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addButton, (pressed || isSending) && styles.pressed]}>
              {isSending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="arrow-up-right" size={19} color="#FFFFFF" />}
            </Pressable>
          </View>
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        </View>

        {requests.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Friend requests <Text style={styles.count}>{requests.length}</Text></Text>
            {requests.map(({ request, sender }) => (
              <View key={request.id} style={styles.requestCard}>
                <View style={styles.personAvatar}><Ionicons name="person" size={17} color="#B17956" /></View>
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{sender ? `${sender.username}#${sender.tag}` : 'StudyAthon learner'}</Text>
                  <Text style={styles.personDetail}>Wants to study with you</Text>
                </View>
                <View style={styles.requestActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Accept friend request"
                    disabled={activeRequest === request.id}
                    onPress={() => void handleRequest(request, true)}
                    style={styles.acceptButton}>
                    {activeRequest === request.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={16} color="#FFFFFF" />}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Decline friend request"
                    disabled={activeRequest === request.id}
                    onPress={() => void handleRequest(request, false)}
                    style={styles.declineButton}>
                    <Feather name="x" size={16} color="#8F9891" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.leaderboardHeader}>
            <View>
              <Text style={styles.sectionTitle}>Friends leaderboard</Text>
              <Text style={styles.sectionSubtitle}>A little friendly motivation.</Text>
            </View>
            <View style={styles.pointsPill}><Ionicons name="trophy" size={13} color="#B6813A" /><Text style={styles.pointsPillText}>POINTS</Text></View>
          </View>

          {leaderboard.map((person, index) => {
            const isCurrentUser = person.uid === user?.uid;
            return (
              <View key={person.uid} style={[styles.leaderRow, isCurrentUser && styles.currentUserRow]}>
                <Text style={[styles.rank, index === 0 && styles.topRank]}>{String(index + 1).padStart(2, '0')}</Text>
                <View style={[styles.leaderAvatar, isCurrentUser && styles.currentAvatar]}>
                  <Text style={[styles.avatarInitial, isCurrentUser && styles.currentAvatarInitial]}>{person.username.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{person.username}{isCurrentUser ? ' · You' : ''}</Text>
                  <Text style={styles.personDetail}>#{person.tag}</Text>
                </View>
                <Text style={styles.points}>{person.points.toLocaleString()}</Text>
              </View>
            );
          })}

          {friends.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Ionicons name="people-outline" size={22} color="#76927B" /></View>
              <Text style={styles.emptyTitle}>Your study crew starts here</Text>
              <Text style={styles.emptyText}>Add a friend with their username and four-digit tag. Their points will show here as you build your leaderboard.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8F5' },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 124 },
  eyebrow: { color: '#6D9176', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#26352B', fontSize: 32, fontWeight: '800', letterSpacing: -0.8, marginTop: 5 },
  subtitle: { color: '#879189', fontSize: 12, marginTop: 5, marginBottom: 19 },
  addCard: { backgroundColor: '#FFFFFF', borderRadius: 19, padding: 15, borderWidth: 1, borderColor: '#E9EDE8' },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF4EE' },
  cardHeadingCopy: { flex: 1 },
  cardTitle: { color: '#324137', fontSize: 13, fontWeight: '800' },
  cardHint: { color: '#98A199', fontSize: 10, marginTop: 3 },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  searchInput: { flex: 1, height: 45, borderRadius: 12, borderWidth: 1, borderColor: '#E5EAE5', backgroundColor: '#FBFCFA', paddingHorizontal: 12, color: '#34433A', fontSize: 13 },
  addButton: { width: 46, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#477B5B' },
  pressed: { opacity: 0.72 },
  error: { color: '#B9574B', fontSize: 11, lineHeight: 16, marginTop: 9 },
  notice: { color: '#477B5B', fontSize: 11, marginTop: 9 },
  section: { marginTop: 24 },
  sectionTitle: { color: '#2D3B32', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  count: { color: '#7F9B85', fontSize: 12 },
  sectionSubtitle: { color: '#98A199', fontSize: 10, marginTop: 4 },
  requestCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EDE8', borderRadius: 15, paddingHorizontal: 11, marginTop: 9 },
  personAvatar: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#FFF1E7', alignItems: 'center', justifyContent: 'center' },
  personCopy: { flex: 1, marginLeft: 10 },
  personName: { color: '#34433A', fontSize: 12, fontWeight: '700' },
  personDetail: { color: '#9AA39C', fontSize: 10, marginTop: 4 },
  requestActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  acceptButton: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#477B5B', alignItems: 'center', justifyContent: 'center' },
  declineButton: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#F2F4F1', alignItems: 'center', justifyContent: 'center' },
  leaderboardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  pointsPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F8F1E6', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9 },
  pointsPillText: { color: '#A17B45', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  leaderRow: { minHeight: 62, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9EDE8', borderRadius: 15, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  currentUserRow: { backgroundColor: '#F0F6F0', borderColor: '#DCE9DD' },
  rank: { width: 28, color: '#9CA69E', fontSize: 11, fontWeight: '800' },
  topRank: { color: '#B6813A' },
  leaderAvatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F0FF', alignItems: 'center', justifyContent: 'center' },
  currentAvatar: { backgroundColor: '#DCEBDD' },
  avatarInitial: { color: '#6B60B3', fontSize: 13, fontWeight: '800' },
  currentAvatarInitial: { color: '#477B5B' },
  points: { color: '#536B59', fontSize: 12, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 },
  emptyIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: '#EAF2EB', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle: { color: '#46574B', fontSize: 12, fontWeight: '800' },
  emptyText: { color: '#98A199', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 5 },
});
