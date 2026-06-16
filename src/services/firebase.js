import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Import Native Modular functions to kill the yellow warnings
import { getAuth, onAuthStateChanged as nativeOnAuthStateChanged } from '@react-native-firebase/auth';
import { getStorage } from '@react-native-firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAdYaTYZ84dGz1yLhd6-49P00-NlOVoQIE", 
  authDomain: "demitab-500b3.firebaseapp.com",
  projectId: "demitab-500b3",
  storageBucket: "demitab-500b3.firebasestorage.app",
  messagingSenderId: "480525536907",
  appId: "1:480525536907:web:be6f58b198817181c8ce8e"
};

// 1. Initialize Web SDK for Firestore (Keeps all your screens working)
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// 2. Initialize Native SDK for Auth & Storage (For SMS and Image Uploads)
export const auth = getAuth(); 
export const storage = getStorage();

// 3. Export a clean modular auth listener
export const onAuthStateChanged = (authInstance, callback) => nativeOnAuthStateChanged(authInstance, callback);