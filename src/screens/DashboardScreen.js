import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Alert, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PulseButton } from '../components/PulseButton';
import { ProfileScreen } from './ProfileScreen';

// FIX: Added 'getDoc' here to read the event before updating it
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion, or, deleteDoc, arrayRemove, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

export const DashboardScreen = ({ profile, isDarkMode, toggleTheme, onOpenEvent, onCreateEvent }) => {
  const [events, setEvents] = useState([]);
  const [newEventName, setNewEventName] = useState('');
  const themeStyles = isDarkMode ? darkTheme : lightTheme;
  
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const [showFullProfile, setShowFullProfile] = useState(false);
  const [localName, setLocalName] = useState(profile?.name || '');

  useEffect(() => {
    if (!profile?.id) return;

    let q;
    if (profile.phone) {
      const myPhone10 = profile.phone.replace(/\D/g, '').slice(-10);
      q = query(
        collection(db, 'events'), 
        or(
          where('memberIds', 'array-contains', profile.id),
          where('memberPhones', 'array-contains', myPhone10)
        )
      );
    } else {
      q = query(collection(db, 'events'), where('memberIds', 'array-contains', profile.id));
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveEvents = [];
      snapshot.forEach((docSnap) => {
        liveEvents.push({ id: docSnap.id, ...docSnap.data() });
      });
      
      liveEvents.sort((a, b) => b.id.localeCompare(a.id));
      setEvents(liveEvents);
    }, (error) => {
      console.error("Firebase Listener Error:", error);
    });

    return () => unsubscribe();
  }, [profile?.id, profile?.phone]);

  const openScanner = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!permission?.granted) {
      const { status } = await requestPermission();
      if (status !== 'granted') {
        Alert.alert('Camera Required', 'DemiTab needs camera access to scan QR codes.');
        return;
      }
    }
    setIsScanning(true);
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    setIsScanning(false);
    if (data.startsWith('demitab:event:')) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const eventId = data.replace('demitab:event:', '');
      const eventRef = doc(db, 'events', eventId);

      try {
        // FIX: Verify the phone number against existing members before duplicating
        const docSnap = await getDoc(eventRef);
        if (docSnap.exists()) {
          const evData = docSnap.data();
          const existingMembers = evData.members || [];
          const myPhone10 = profile?.phone ? profile.phone.replace(/\D/g, '').slice(-10) : '';

          // Look for 10-digit phone match in the current event members
          const existingIndex = existingMembers.findIndex(m => m.phone && m.phone.replace(/\D/g, '').slice(-10) === myPhone10);
          
          let updatedMembers = [...existingMembers];

          if (existingIndex >= 0) {
            // Member found! Merge the real ID and Name into the existing spot (No duplicates)
            updatedMembers[existingIndex].id = profile.id;
            updatedMembers[existingIndex].name = localName || updatedMembers[existingIndex].name;
            updatedMembers[existingIndex].phone = profile?.phone || updatedMembers[existingIndex].phone;
          } else {
            // Brand new user! Push to array with all details so the Host can see them
            updatedMembers.push({ id: profile.id, name: localName || 'Friend', phone: profile?.phone || '' });
          }

          await updateDoc(eventRef, {
            memberIds: arrayUnion(profile.id),
            memberPhones: myPhone10 ? arrayUnion(myPhone10) : arrayUnion(),
            members: updatedMembers // Pushing the cleanly merged array
          });
          
          Alert.alert("Success!", "You have joined the live event.");
        } else {
          Alert.alert("Error", "Event not found in the database.");
        }
      } catch (error) {
        Alert.alert("Error", "Could not join the cloud event.");
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Invalid QR", "Please scan a valid DemiTab Event QR.");
    }
  };

  const handleCreateEvent = async () => {
    if (!newEventName.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Name Required", "Please add the name of the event first.");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const finalName = newEventName.trim();
    if (onCreateEvent) onCreateEvent(finalName);
    else onOpenEvent(null);
    setNewEventName('');
  };

  const handleDeleteEvent = (event) => {
    Alert.alert(
      "Remove Event?",
      "Are you sure you want to remove this event from your dashboard?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive", 
          onPress: async () => {
            try {
              if (event.hostId === profile?.id) {
                await deleteDoc(doc(db, 'events', event.id));
              } else {
                const myPhone10 = profile?.phone ? profile.phone.replace(/\D/g, '').slice(-10) : '';
                await updateDoc(doc(db, 'events', event.id), {
                  memberIds: arrayRemove(profile.id),
                  memberPhones: arrayRemove(myPhone10)
                });
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {
              Alert.alert("Error", "Could not remove event.");
            }
          }
        }
      ]
    );
  };

  if (showFullProfile) {
    return (
      <ProfileScreen 
        existingProfile={profile} 
        isDarkMode={isDarkMode} 
        onComplete={(updatedProfile) => { setLocalName(updatedProfile.name); setShowFullProfile(false); }}
        onCancel={() => setShowFullProfile(false)}
      />
    );
  }

  return (
    <View style={[styles.container, themeStyles.background]}>
      <View style={[styles.header, themeStyles.card]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.greeting, themeStyles.text]}>Hello, {localName ? localName.split(' ')[0] : 'User'} 👋</Text>
          <TouchableOpacity style={styles.profileBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowFullProfile(true); }}>
            <Text style={[styles.subText, themeStyles.subText]}>Profile & Settings ⚙️</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.themeToggle} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleTheme(); }}>
          <Text style={{ fontSize: 24 }}>{isDarkMode ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.topLayoutGroup}>
            <TextInput 
              style={[styles.input, themeStyles.card, themeStyles.text]}
              placeholder="Enter New Event Name..."
              placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              value={newEventName}
              onChangeText={setNewEventName}
            />
            <PulseButton style={styles.createBtn} onPress={handleCreateEvent}>
              <Text style={styles.createText}>+ Add Event</Text>
            </PulseButton>
            <TouchableOpacity style={[styles.scanJoinBtn, themeStyles.card]} onPress={openScanner}>
              <Text style={[styles.scanJoinText, themeStyles.text]}>📷 Scan QR to Join Event</Text>
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            <View style={styles.pastEventsHeader}>
              <Text style={[styles.sectionTitle, themeStyles.text]}>Past Events</Text>
              <Text style={[styles.longPressHint, themeStyles.subText]}>(Hold an event to delete)</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 60, marginBottom: 20 }}>🍽️</Text>
            <Text style={[styles.emptyText, themeStyles.text]}>No events yet.</Text>
            <Text style={themeStyles.subText}>Your recent bills will appear here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[styles.eventCard, themeStyles.card]} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onOpenEvent(item); }}
            onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); handleDeleteEvent(item); }}
          >
            <View style={styles.eventLeft}>
              <Text style={[styles.eventTitle, themeStyles.text]}>{item.eventName}</Text>
              <Text style={[styles.eventDate, themeStyles.subText]}>{item.eventDate} • {item.members?.length || 0} People</Text>
            </View>
            <View style={styles.eventRight}>
              <Text style={[styles.eventTotal, themeStyles.text]}>₹{item.actualTotal || 0}</Text>
              <Text style={styles.viewText}>View →</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal visible={isScanning} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={handleBarCodeScanned} />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerInstruction}>Point camera at Host's QR Code</Text>
            <TouchableOpacity onPress={() => setIsScanning(false)} style={styles.cancelScanBtn}>
              <Text style={styles.cancelScanText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// Expanded Styles
const lightTheme = { 
  background: { backgroundColor: '#F9FAFB' }, 
  text: { color: '#111827' }, 
  subText: { color: '#6B7280' }, 
  card: { backgroundColor: '#fff', borderColor: '#E5E7EB' } 
};

const darkTheme = { 
  background: { backgroundColor: '#111827' }, 
  text: { color: '#F9FAFB' }, 
  subText: { color: '#9CA3AF' }, 
  card: { backgroundColor: '#1F2937', borderColor: '#374151' } 
};

const styles = StyleSheet.create({ 
  container: { 
    flex: 1 
  }, 
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 24, 
    paddingTop: 60, 
    borderBottomWidth: 1, 
    borderBottomLeftRadius: 24, 
    borderBottomRightRadius: 24 
  }, 
  headerLeft: { 
    flex: 1 
  }, 
  greeting: { 
    fontSize: 24, 
    fontWeight: '900', 
    marginBottom: 4 
  }, 
  profileBtn: { 
    paddingVertical: 4 
  }, 
  themeToggle: { 
    padding: 10, 
    backgroundColor: 'rgba(0,0,0,0.05)', 
    borderRadius: 20 
  }, 
  listContent: { 
    paddingHorizontal: 20, 
    paddingTop: 20, 
    paddingBottom: 150 
  }, 
  topLayoutGroup: { 
    marginBottom: 10 
  }, 
  input: { 
    padding: 18, 
    borderRadius: 16, 
    borderWidth: 1, 
    marginBottom: 16, 
    fontSize: 16, 
    fontWeight: '600' 
  }, 
  createBtn: { 
    width: '100%', 
    marginBottom: 16 
  }, 
  createText: { 
    color: '#fff', 
    fontWeight: '900', 
    fontSize: 16 
  }, 
  scanJoinBtn: { 
    width: '100%', 
    paddingVertical: 18, 
    borderRadius: 16, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 1, 
    marginBottom: 24 
  }, 
  scanJoinText: { 
    fontWeight: '800', 
    fontSize: 16 
  }, 
  divider: { 
    height: 1, 
    backgroundColor: 'rgba(0,0,0,0.05)', 
    marginBottom: 24 
  }, 
  pastEventsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16
  },
  sectionTitle: { 
    fontSize: 20, 
    fontWeight: '900', 
  }, 
  longPressHint: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2
  },
  emptyContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 40 
  }, 
  emptyText: { 
    fontSize: 20, 
    fontWeight: '800', 
    marginBottom: 8 
  }, 
  eventCard: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    borderRadius: 16, 
    marginBottom: 12, 
    borderWidth: 1 
  }, 
  eventLeft: { 
    flex: 1 
  }, 
  eventTitle: { 
    fontSize: 16, 
    fontWeight: '800', 
    marginBottom: 4 
  }, 
  eventDate: { 
    fontSize: 12, 
    fontWeight: '600' 
  }, 
  eventRight: { 
    alignItems: 'flex-end' 
  }, 
  eventTotal: { 
    fontSize: 20, 
    fontWeight: '900', 
    marginBottom: 4 
  }, 
  viewText: { 
    color: '#5BC5A7', 
    fontWeight: '800', 
    fontSize: 12 
  }, 
  scannerOverlay: { 
    position: 'absolute', 
    bottom: 50, 
    left: 0, 
    right: 0, 
    alignItems: 'center' 
  }, 
  scannerInstruction: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: '800', 
    marginBottom: 30, 
    textShadowColor: 'rgba(0,0,0,0.75)', 
    textShadowOffset: {width: -1, height: 1}, 
    textShadowRadius: 10 
  }, 
  cancelScanBtn: { 
    backgroundColor: '#EF4444', 
    paddingVertical: 16, 
    paddingHorizontal: 40, 
    borderRadius: 20 
  }, 
  cancelScanText: { 
    color: '#fff', 
    fontWeight: '900', 
    fontSize: 16 
  } 
});