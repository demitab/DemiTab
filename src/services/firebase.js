import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, signInAnonymously, onAuthStateChanged as webOnAuthStateChanged, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getAuth, onAuthStateChanged as nativeOnAuthStateChanged } from '@react-native-firebase/auth';
import { getStorage } from '@react-native-firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY, 
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// 👇 FIXED: We are now explicitly telling Web Auth to use AsyncStorage
const webAuth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export const webAuthReady = new Promise((resolve) => {
  const unsubscribe = webOnAuthStateChanged(webAuth, (user) => {
    if (user) {
      unsubscribe();
      resolve(true);
    }
  });
  signInAnonymously(webAuth).catch((err) => console.log("Bridge Auth Error:", err));
});

export const auth = getAuth(); 
export const storage = getStorage();

export const onAuthStateChanged = (authInstance, callback) => nativeOnAuthStateChanged(authInstance, callback);