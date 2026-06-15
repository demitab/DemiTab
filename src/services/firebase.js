import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import nativeAuth from '@react-native-firebase/auth';
import nativeStorage from '@react-native-firebase/storage'; // 🚀 NEW: Native Storage

const firebaseConfig = {
  apiKey: "AIzaSyAdYaTYZ84dGz1yLhd6-49P00-NlOVoQIE", 
  authDomain: "demitab-500b3.firebaseapp.com",
  projectId: "demitab-500b3",
  storageBucket: "demitab-500b3.firebasestorage.app",
  messagingSenderId: "480525536907",
  appId: "1:480525536907:web:be6f58b198817181c8ce8e"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = nativeAuth(); 
export const storage = nativeStorage(); // 🚀 Exporting Native Storage

export const onAuthStateChanged = (authInstance, callback) => authInstance.onAuthStateChanged(callback);