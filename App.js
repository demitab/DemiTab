import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { auth, onAuthStateChanged } from './src/services/firebase'; 
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
  
  // NEW: Store the full active event instead of just the name
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
        <Text style={styles.tagline}>Split bills, stay friends.</Text>
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
            // Creates the master object immediately and saves it!
            const newEvent = {
              id: Date.now().toString(),
              eventName: name,
              eventDate: new Date().toLocaleDateString('en-GB'),
              hostId: profile.id || 'USER_ME',
              members: [{ id: profile.id || 'USER_ME', name: profile.name.split(' ')[0] }],
              items: [], taxes: {}, actualTotal: 0,
              paymentStrategy: 'everyone', mainPayerId: profile.id || 'USER_ME', settlements: {}
            };
            
            const stored = await AsyncStorage.getItem('demitab_events');
            const pastEvents = stored ? JSON.parse(stored) : [];
            await AsyncStorage.setItem('demitab_events', JSON.stringify([newEvent, ...pastEvents]));
            
            setActiveEvent(newEvent); 
            setCurrentView('EventWorkspace'); 
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