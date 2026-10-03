import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import * as FirebaseAuth from 'firebase/auth';

import { firebaseConfig } from './firebaseConfig';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
type AuthPersistence = NonNullable<Parameters<typeof FirebaseAuth.initializeAuth>[1]>['persistence'];
const getReactNativePersistence = (
  FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence: (storage: typeof AsyncStorage) => AuthPersistence;
  }
).getReactNativePersistence;

// Firebase auth survives app restarts using native AsyncStorage.
export const auth = (() => {
  try {
    return FirebaseAuth.initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/already-initialized') {
      return FirebaseAuth.getAuth(app);
    }
    throw error;
  }
})();

export const db = getFirestore(app);
