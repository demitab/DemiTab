import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, onSnapshot } from 'firebase/firestore'; 
import { auth, db, onAuthStateChanged } from './src/services/firebase'; 
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { getAnalytics, logEvent, setUserId as setAnalyticsUserId } from '@react-native-firebase/analytics';
import { getCrashlytics, log, setUserId as setCrashlyticsUserId, recordError } from '@react-native-firebase/crashlytics';

import { AuthScreen } from './src/screens/AuthScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { EventWorkspace } from './src/screens/EventWorkspace';

const DEV_BYPASS_AUTH = false; 

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

export const navigationRef = createNavigationContainerRef();

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSplash, setIsSplash] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const routeNameRef = useRef();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const userId = user.phoneNumber || user.uid;
          await Promise.all([
            setCrashlyticsUserId(getCrashlytics(), userId),
            setAnalyticsUserId(getAnalytics(), userId)
          ]);
        } catch (error) {
          console.error("Tracking binding error:", error);
        }
      }
    });

    const bootApp = async () => {
      try {
        const savedProfile = await AsyncStorage.getItem('demitab_profile');
        if (savedProfile) setProfile(JSON.parse(savedProfile));
        const savedTheme = await AsyncStorage.getItem('demitab_theme');
        if (savedTheme === 'dark') setIsDarkMode(true);
        log(getCrashlytics(), 'App successfully booted.');
      } catch (e) { 
        console.error(e); 
      } finally {
        setIsLoading(false);
        setTimeout(() => setIsSplash(false), 2000);
      }
    };
    bootApp();

    return unsubscribe;
  }, []);

  // 🚀 LIVE BACKEND SYNC: Listens to Firestore changes (like manual credit modifications or sales)
  useEffect(() => {
    if (!firebaseUser) {
      return;
    }
    const digitsOnly = firebaseUser.phoneNumber 
      ? firebaseUser.phoneNumber.replace('+91', '').replace(/\D/g, '').slice(-10) 
      : null;
    
    if (!digitsOnly) return;

    const userRef = doc(db, 'users', `USER_${digitsOnly}`);
    const unsubscribeLiveProfile = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const cloudProfile = docSnap.data();
        setProfile(cloudProfile);
        AsyncStorage.setItem('demitab_profile', JSON.stringify(cloudProfile));
      }
    }, (err) => {
      console.log("Live synchronization error:", err);
    });

    return () => unsubscribeLiveProfile();
  }, [firebaseUser]);

  const toggleTheme = async () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    await AsyncStorage.setItem('demitab_theme', newTheme ? 'dark' : 'light');
  };

  if (isSplash || isLoading) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar hidden={true} translucent={true} />
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>DemiTab</Text>
        </View>
        <Text style={styles.tagline}>Split Bills, Stay Friends.</Text>
        {isLoading ? <ActivityIndicator size="small" color="#5BC5A7" style={{marginTop: 20}} /> : null}
      </View>
    );
  }

  const MainTabs = () => (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDarkMode ? '#1F2937' : '#ffffff',
          borderTopColor: isDarkMode ? '#374151' : '#E5E7EB',
          paddingBottom: 5,
          paddingTop: 5,
          height: 60
        },
        tabBarActiveTintColor: '#5BC5A7',
        tabBarInactiveTintColor: isDarkMode ? '#9CA3AF' : '#6B7280',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' }
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        options={{ tabBarIcon: () => <Text style={{fontSize: 20}}>🏠</Text> }}
      >
        {props => (
          <DashboardScreen
            {...props}
            profile={profile}
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
            onCreateEvent={async (name) => {
              const newEventId = Date.now().toString();
              const hostId = profile?.id || 'USER_ME';
              
              const newEvent = {
                id: newEventId,
                eventName: name,
                eventDate: new Date().toLocaleDateString('en-GB'),
                hostId: hostId,
                memberIds: [hostId], 
                members: [{ id: hostId, name: profile?.name ? profile.name.split(' ')[0] : 'Me' }],
                items: [], taxes: {}, actualTotal: 0,
                paymentStrategy: 'everyone', mainPayerId: hostId, settlements: {}
              };

              try {
                await setDoc(doc(db, 'events', newEventId), newEvent);
                await logEvent(getAnalytics(), 'create_event', { event_name: name });
                props.navigation.navigate('EventWorkspace', { activeEvent: newEvent });
              } catch (error) {
                recordError(getCrashlytics(), error);
                console.error("Error creating event in cloud", error);
              }
            }}
            onOpenEvent={(evt) => {
              props.navigation.navigate('EventWorkspace', { activeEvent: evt });
            }}
          />
        )}
      </Tab.Screen>

      <Tab.Screen 
        name="Global Ledger" 
        options={{ tabBarIcon: () => <Text style={{fontSize: 20}}>🤝</Text> }}
      >
        {() => (
          <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' }]}>
            <Text style={{fontSize: 60, marginBottom: 20}}>📊</Text>
            <Text style={{color: isDarkMode ? '#fff' : '#111827', fontSize: 20, fontWeight: '900'}}>Global Ledger</Text>
            <Text style={{color: '#6B7280', marginTop: 10, fontWeight: '600'}}>Coming right up! 🚀</Text>
          </View>
        )}
      </Tab.Screen>

      <Tab.Screen 
        name="Account" 
        options={{ tabBarIcon: () => <Text style={{fontSize: 20}}>👤</Text> }}
      >
        {props => (
          <ProfileScreen 
            existingProfile={profile} 
            isDarkMode={isDarkMode} 
            onComplete={(p) => { setProfile(p); props.navigation.navigate('Dashboard'); }} 
            onCancel={() => props.navigation.navigate('Dashboard')} 
            onLogout={() => setProfile(null)} 
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );

  const safeAreaBg = isDarkMode ? '#111827' : '#F4F5F4';

  return (
    <SafeAreaProvider>
      <View style={[styles.container, { backgroundColor: safeAreaBg }]}>
        <StatusBar hidden={true} translucent={true} />
        <NavigationContainer
          ref={navigationRef}
          onReady={() => {
            routeNameRef.current = navigationRef.getCurrentRoute()?.name;
          }}
          onStateChange={async () => {
            const previousRouteName = routeNameRef.current;
            const currentRouteName = navigationRef.getCurrentRoute()?.name;

            if (previousRouteName !== currentRouteName) {
              await logEvent(getAnalytics(), 'screen_view', {
                screen_name: currentRouteName,
                screen_class: currentRouteName,
              });
            }
            routeNameRef.current = currentRouteName;
          }}
        >
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            
            {(!firebaseUser && !DEV_BYPASS_AUTH) ? (
              <Stack.Screen name="Auth">
                {props => <AuthScreen {...props} isDarkMode={isDarkMode} />}
              </Stack.Screen>
            ) : !profile ? (
              <Stack.Screen name="SetupProfile">
                {props => <ProfileScreen {...props} onComplete={(p) => setProfile(p)} isDarkMode={isDarkMode} />}
              </Stack.Screen>
            ) : (
              <>
                <Stack.Screen name="MainTabs" component={MainTabs} />
                
                <Stack.Screen name="EventWorkspace" options={{ animation: 'slide_from_bottom' }}>
                  {props => (
                    <EventWorkspace
                      {...props}
                      activeEvent={props.route.params?.activeEvent}
                      profile={profile}
                      isDarkMode={isDarkMode}
                      toggleTheme={toggleTheme}
                      onExit={() => props.navigation.goBack()}
                    />
                  )}
                </Stack.Screen>
              </>
            )}

          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ 
  container: { flex: 1 }, 
  splashContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' }, 
  logoBox: { backgroundColor: '#5BC5A7', padding: 20, borderRadius: 16, marginBottom: 15 }, 
  logoText: { fontSize: 36, fontWeight: '900', color: '#111827', letterSpacing: 2 }, 
  tagline: { fontSize: 16, color: '#9CA3AF', fontWeight: '600' } 
});