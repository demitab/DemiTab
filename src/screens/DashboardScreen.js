import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Alert, TextInput, Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PulseButton } from '../components/PulseButton';

import { InsightsSection } from '../components/InsightsSection';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion, or, deleteDoc, arrayRemove, getDoc, increment } from 'firebase/firestore';
import { db } from '../services/firebase';

export const DashboardScreen = ({ profile, isDarkMode, toggleTheme, onOpenEvent, onCreateEvent, navigation }) => {
  const [events, setEvents] = useState([]);
  const [newEventName, setNewEventName] = useState('');
  
  const [dashboardTab, setDashboardTab] = useState('EVENTS'); 
  
  const themeStyles = isDarkMode ? darkTheme : lightTheme;
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [localName, setLocalName] = useState(profile?.name || '');

  useEffect(() => {
    if (!profile?.id) return;
    let q;
    if (profile.phone) {
      const myPhone10 = profile.phone.replace(/\D/g, '').slice(-10);
      q = query(collection(db, 'events'), or(where('memberIds', 'array-contains', profile.id), where('memberPhones', 'array-contains', myPhone10)));
    } else {
      q = query(collection(db, 'events'), where('memberIds', 'array-contains', profile.id));
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveEvents = [];
      snapshot.forEach((docSnap) => liveEvents.push({ id: docSnap.id, ...docSnap.data() }));
      liveEvents.sort((a, b) => b.id.localeCompare(a.id));
      setEvents(liveEvents);
    });
    return () => unsubscribe();
  }, [profile?.id, profile?.phone]);

  const openScanner = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!permission?.granted) {
      const { status } = await requestPermission();
      if (status !== 'granted') return Alert.alert('Camera Required', 'DemiTab needs camera access to scan QR codes.');
    }
    setIsScanning(true);
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    setIsScanning(false);
    
    if (profile?.hostCredits !== undefined && profile.hostCredits <= 0) {
      return Alert.alert("Limit Reached", "You have used all your free capabilities! Ask a friend for their referral code to get 5 more credits.");
    }

    if (data.startsWith('demitab:event:')) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const eventId = data.replace('demitab:event:', '');
      const eventRef = doc(db, 'events', eventId);
      try {
        const docSnap = await getDoc(eventRef);
        if (docSnap.exists()) {
          const evData = docSnap.data();
          const existingMembers = evData.members || [];
          const myPhone10 = profile?.phone ? profile.phone.replace(/\D/g, '').slice(-10) : '';
          const existingIndex = existingMembers.findIndex(m => m.phone && m.phone.replace(/\D/g, '').slice(-10) === myPhone10);
          
          let updatedMembers = [...existingMembers];
          let isNewMember = false;

          if (existingIndex >= 0) {
            updatedMembers[existingIndex].id = profile.id;
            updatedMembers[existingIndex].name = localName || updatedMembers[existingIndex].name;
            updatedMembers[existingIndex].phone = profile?.phone || updatedMembers[existingIndex].phone;
          } else {
            updatedMembers.push({ id: profile.id, name: localName || 'Friend', phone: profile?.phone || '' });
            isNewMember = true;
          }

          await updateDoc(eventRef, { memberIds: arrayUnion(profile.id), memberPhones: myPhone10 ? arrayUnion(myPhone10) : arrayUnion(), members: updatedMembers });
          
          if (isNewMember && profile?.id) {
            await updateDoc(doc(db, 'users', profile.id), { 
              hostCredits: increment(-1),
              creditHistory: arrayUnion({
                id: Date.now().toString(),
                title: `Joined: ${evData.eventName}`, // Includes Event Name
                amount: -1,
                date: new Date().toLocaleDateString('en-GB')
              })
            });
          }

          Alert.alert("Success!", "You have joined the live event.");
        } else Alert.alert("Error", "Event not found in the database.");
      } catch (error) { Alert.alert("Error", "Could not join the cloud event."); }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Invalid QR", "Please scan a valid DemiTab Event QR.");
    }
  };

  const handleCreateEvent = async () => {
    if (!newEventName.trim()) return Alert.alert("Name Required", "Please add the name of the event first.");
    
    if (profile?.hostCredits !== undefined && profile.hostCredits <= 0) {
      return Alert.alert(
        "Limit Reached", 
        "You have used all 5 of your free Capabilities! Ask a friend for their referral code so you both receive 5 more credits."
      );
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    if (profile?.id) {
      try { 
        await updateDoc(doc(db, 'users', profile.id), { 
          hostCredits: increment(-1),
          creditHistory: arrayUnion({
            id: Date.now().toString(),
            title: `Created: ${newEventName.trim()}`, // Includes Event Name
            amount: -1,
            date: new Date().toLocaleDateString('en-GB')
          })
        }); 
      } 
      catch (e) { console.error(e); }
    }

    if (onCreateEvent) onCreateEvent(newEventName.trim());
    else onOpenEvent(null);
    setNewEventName('');
  };

  const handleDeleteEvent = (event) => {
    Alert.alert("Remove Event?", "Are you sure you want to remove this event from your dashboard?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
          try {
            if (event.hostId === profile?.id) await deleteDoc(doc(db, 'events', event.id));
            else {
              const myPhone10 = profile?.phone ? profile.phone.replace(/\D/g, '').slice(-10) : '';
              await updateDoc(doc(db, 'events', event.id), { memberIds: arrayRemove(profile.id), memberPhones: arrayRemove(myPhone10) });
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) { Alert.alert("Error", "Could not remove event."); }
        }
      }
    ]);
  };

  const handleShareApp = async () => {
    Haptics.selectionAsync();
    try {
      const configSnap = await getDoc(doc(db, 'app_config', 'global'));
      let adminUrl = "https://demitab-admin.vercel.app";
      if (configSnap.exists() && configSnap.data().adminAppUrl) {
        adminUrl = configSnap.data().adminAppUrl;
      }
      
      const inviteLink = `${adminUrl}/invite?ref=${profile?.referralCode || ''}`;
      const referralMsg = profile?.referralCode ? ` Use my code ${profile.referralCode} to get 5 free bonus capabilities!` : '';
      
      await Share.share({ message: `Hey! I use DemiTab to scan receipts and split bills effortlessly.${referralMsg} Tap here to download: ${inviteLink}` });
    } catch(e) { console.log(e); }
  };

  return (
    <View style={[styles.container, themeStyles.background]}>
      <View style={[styles.header, themeStyles.card]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.greeting, themeStyles.text]}>Hello, {localName ? localName.split(' ')[0] : 'User'} 👋</Text>
          <Text style={[styles.creditsSubtext, themeStyles.subText]}>🪙 {profile?.hostCredits ?? 0} Credits Remaining</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={[styles.actionIconBtn, themeStyles.iconBtnBg]} onPress={handleShareApp}>
            <Text style={{ fontSize: 18 }}>📤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionIconBtn, themeStyles.iconBtnBg]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleTheme(); }}>
            <Text style={{ fontSize: 18 }}>{isDarkMode ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={dashboardTab === 'EVENTS' ? events : []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" 
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
            
            <View style={[styles.tabToggleContainer, themeStyles.input]}>
              <TouchableOpacity style={[styles.tabToggleBtn, dashboardTab === 'EVENTS' && styles.tabToggleActive]} onPress={() => { Haptics.selectionAsync(); setDashboardTab('EVENTS'); }}>
                <Text style={[styles.tabToggleText, dashboardTab === 'EVENTS' ? styles.tabToggleTextActive : themeStyles.subText]}>Past Events</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tabToggleBtn, dashboardTab === 'INSIGHTS' && styles.tabToggleActive]} onPress={() => { Haptics.selectionAsync(); setDashboardTab('INSIGHTS'); }}>
                <Text style={[styles.tabToggleText, dashboardTab === 'INSIGHTS' ? styles.tabToggleTextActive : themeStyles.subText]}>My Insights</Text>
              </TouchableOpacity>
            </View>

            {dashboardTab === 'INSIGHTS' ? (
              <InsightsSection events={events} profile={profile} isDarkMode={isDarkMode} />
            ) : null}

            {dashboardTab === 'EVENTS' ? (
              <View style={styles.pastEventsHeader}>
                <Text style={[styles.sectionTitle, themeStyles.text]}>Past Events</Text>
                <Text style={[styles.longPressHint, themeStyles.subText]}>(Hold an event to delete)</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          dashboardTab === 'EVENTS' ? (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 60, marginBottom: 20 }}>🍽️</Text>
              <Text style={[styles.emptyText, themeStyles.text]}>No events yet.</Text>
              <Text style={themeStyles.subText}>Your recent bills will appear here.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.eventCard, themeStyles.card]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onOpenEvent(item); }} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); handleDeleteEvent(item); }}>
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
            <TouchableOpacity onPress={() => setIsScanning(false)} style={styles.cancelScanBtn}><Text style={styles.cancelScanText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const lightTheme = { 
  background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, 
  card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, input: { backgroundColor: '#F3F4F6' },
  iconBtnBg: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }
};

const darkTheme = { 
  background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, 
  card: { backgroundColor: '#1F2937', borderColor: '#374151' }, input: { backgroundColor: '#374151' },
  iconBtnBg: { backgroundColor: '#374151', borderColor: '#4B5563' }
};

const styles = StyleSheet.create({ 
  container: { flex: 1 }, 
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 60, borderBottomWidth: 1, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }, 
  headerLeft: { flex: 1 }, 
  greeting: { fontSize: 24, fontWeight: '900'}, 
  creditsSubtext: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  headerRight: { flexDirection: 'row', gap: 10 },
  actionIconBtn: { padding: 10, borderRadius: 20, borderWidth: 1 }, 
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 150 }, 
  topLayoutGroup: { marginBottom: 10 }, 
  input: { padding: 18, borderRadius: 16, borderWidth: 1, marginBottom: 16, fontSize: 16, fontWeight: '600' }, 
  createBtn: { width: '100%', marginBottom: 16 }, 
  createText: { color: '#fff', fontWeight: '900', fontSize: 16 }, 
  scanJoinBtn: { width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 24 }, 
  scanJoinText: { fontWeight: '800', fontSize: 16 }, 
  tabToggleContainer: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 20 },
  tabToggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabToggleActive: { backgroundColor: '#5BC5A7', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabToggleText: { fontSize: 14, fontWeight: '700' },
  tabToggleTextActive: { color: '#fff', fontSize: 14, fontWeight: '900' },
  pastEventsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '900', }, 
  longPressHint: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 }, 
  emptyText: { fontSize: 20, fontWeight: '800', marginBottom: 8 }, 
  eventCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 16, marginBottom: 12, borderWidth: 1 }, 
  eventLeft: { flex: 1 }, 
  eventTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 }, 
  eventDate: { fontSize: 12, fontWeight: '600' }, 
  eventRight: { alignItems: 'flex-end' }, 
  eventTotal: { fontSize: 20, fontWeight: '900', marginBottom: 4 }, 
  viewText: { color: '#5BC5A7', fontWeight: '800', fontSize: 12 }, 
  scannerOverlay: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center' }, 
  scannerInstruction: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 30, textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10 }, 
  cancelScanBtn: { backgroundColor: '#EF4444', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 20 }, 
  cancelScanText: { color: '#fff', fontWeight: '900', fontSize: 16 } 
});