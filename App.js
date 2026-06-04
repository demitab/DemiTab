import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// NEW: Firestore Imports
import { doc, setDoc } from 'firebase/firestore'; 
import { auth, db, onAuthStateChanged } from './src/services/firebase'; 

import { AuthScreen } from './src/screens/AuthScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { EventWorkspace } from './src/screens/EventWorkspace';

const DEV_BYPASS_AUTH = true; 

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSplash, setIsSplash] = useState(true);
  const [currentView, setCurrentView] = useState('Dashboard');
  
  const [activeEvent, setActiveEvent] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });

    const bootApp = async () => {
      try {
        const savedProfile = await AsyncStorage.getItem('demitab_profile');
        if (savedProfile) setProfile(JSON.parse(savedProfile));
        const savedTheme = await AsyncStorage.getItem('demitab_theme');
        if (savedTheme === 'dark') setIsDarkMode(true);
      } catch (e) { console.error(e); }
      finally {
        setIsLoading(false);
        setTimeout(() => setIsSplash(false), 2000);
      }
    };
    bootApp();

    return unsubscribe;
  }, []);

  const toggleTheme = async () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    await AsyncStorage.setItem('demitab_theme', newTheme ? 'dark' : 'light');
  };

  if (isSplash || isLoading) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar hidden={true} translucent={true} />
        <View style={styles.logoBox}><Text style={styles.logoText}>DemiTab</Text></View>
        <Text style={styles.tagline}>Split Bills, Stay Friends.</Text>
        {isLoading && <ActivityIndicator size="small" color="#5BC5A7" style={{marginTop: 20}} />}
      </View>
    );
  }

  const safeAreaBg = isDarkMode ? '#111827' : '#F4F5F4';

  return (
    <View style={[styles.container, { backgroundColor: safeAreaBg }]}>
      <StatusBar hidden={true} translucent={true} />

      {(!firebaseUser && !DEV_BYPASS_AUTH) ? (
        <AuthScreen isDarkMode={isDarkMode} />
      ) : !profile ? (
        <ProfileScreen onComplete={(p) => setProfile(p)} isDarkMode={isDarkMode} />
      ) : currentView === 'EditProfile' ? (
        <ProfileScreen existingProfile={profile} isDarkMode={isDarkMode} onComplete={(p) => { setProfile(p); setCurrentView('Dashboard'); }} onCancel={() => setCurrentView('Dashboard')} />
      ) : currentView === 'Dashboard' ? (
        <DashboardScreen
          profile={profile}
          isDarkMode={isDarkMode}
          toggleTheme={toggleTheme}
          onEditProfile={() => setCurrentView('EditProfile')}
          onCreateEvent={async (name) => {
            // NEW: FIREBASE CLOUD CREATION
            const newEventId = Date.now().toString();
            const hostId = profile?.id || 'USER_ME';
            
            const newEvent = {
              id: newEventId,
              eventName: name,
              eventDate: new Date().toLocaleDateString('en-GB'),
              hostId: hostId,
              memberIds: [hostId], // The flat array for fast Firebase querying
              members: [{ id: hostId, name: profile?.name ? profile.name.split(' ')[0] : 'Me' }],
              items: [], taxes: {}, actualTotal: 0,
              paymentStrategy: 'everyone', mainPayerId: hostId, settlements: {}
            };

            try {
              // Create document in Firestore
              await setDoc(doc(db, 'events', newEventId), newEvent);
              setActiveEvent(newEvent);
              setCurrentView('EventWorkspace');
            } catch (error) {
              console.error("Error creating event in cloud", error);
            }
          }}
          onOpenEvent={(evt) => {
            setActiveEvent(evt);
            setCurrentView('EventWorkspace');
          }}
        />
      ) : currentView === 'EventWorkspace' ? (
        <EventWorkspace
          activeEvent={activeEvent}
          profile={profile}
          isDarkMode={isDarkMode}
          toggleTheme={toggleTheme}
          onExit={() => setCurrentView('Dashboard')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 }, splashContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' }, logoBox: { backgroundColor: '#5BC5A7', padding: 20, borderRadius: 16, marginBottom: 15 }, logoText: { fontSize: 36, fontWeight: '900', color: '#111827', letterSpacing: 2 }, tagline: { fontSize: 16, color: '#9CA3AF', fontWeight: '600' } });