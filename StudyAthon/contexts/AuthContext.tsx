import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { auth, db } from '@/firebase';
import { personalInfoFromData, profileFromData, type PersonalInfo, type UserProfile } from '@/services/social';

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  personalInfo: PersonalInfo | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    let unsubscribePersonalInfo: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribePersonalInfo?.();
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setPersonalInfo(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      let loadedDocuments = 0;
      const markLoaded = () => {
        loadedDocuments += 1;
        if (loadedDocuments === 2) setIsLoading(false);
      };
      unsubscribeProfile = onSnapshot(
        doc(db, 'users', nextUser.uid),
        (snapshot) => {
          setProfile(snapshot.exists() ? profileFromData(snapshot.data()) : null);
          markLoaded();
        },
        () => {
          setProfile(null);
          markLoaded();
        },
      );
      unsubscribePersonalInfo = onSnapshot(
        doc(db, 'userPrivate', nextUser.uid),
        (snapshot) => {
          setPersonalInfo(snapshot.exists() ? personalInfoFromData(snapshot.data()) : null);
          markLoaded();
        },
        () => {
          setPersonalInfo(null);
          markLoaded();
        },
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile?.();
      unsubscribePersonalInfo?.();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, personalInfo, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
