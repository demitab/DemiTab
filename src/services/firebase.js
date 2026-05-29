import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// ⚠️ REPLACE THIS OBJECT WITH YOUR ACTUAL FIREBASE KEYS
const firebaseConfig = {
  apiKey: "AIzaSyAdYaTYZ84dGz1yLhd6-49P00-NlOVoQIE",
  authDomain: "demitab-500b3.firebaseapp.com",
  projectId: "demitab-500b3",
  storageBucket: "demitab-500b3.firebasestorage.app",
  messagingSenderId: "480525536907",
  appId: "1:480525536907:web:be6f58b198817181c8ce8e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db, onAuthStateChanged };