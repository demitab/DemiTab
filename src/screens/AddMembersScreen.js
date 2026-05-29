import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, ActivityIndicator, Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { PulseButton } from '../components/PulseButton';

export const AddMembersScreen = ({ eventData, profile, isDarkMode, onSaveMembers }) => {
  const [members, setMembers] = useState(eventData.members.filter(m => m.id !== 'USER_ME' && m.id !== profile?.id) || []);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  
  const [showContacts, setShowContacts] = useState(false);
  const [phonebook, setPhonebook] = useState([]);
  const [filteredPhonebook, setFilteredPhonebook] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [frequentContacts, setFrequentContacts] = useState([]);

  const [showQR, setShowQR] = useState(false);
  const [isScanningQR, setIsScanningQR] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const isHost = profile?.id === eventData.hostId || eventData.hostId === 'USER_ME';

  useEffect(() => {
    const fetchFrequentContacts = async () => {
      try {
        const stored = await AsyncStorage.getItem('demitab_events');
        if (!stored) return;
        const pastEvents = JSON.parse(stored);
        const frequencyMap = {};
        pastEvents.forEach(event => {
          (event.members || []).forEach(member => {
            if (member.id !== 'USER_ME' && member.id !== profile?.id) {
              const key = member.phone ? member.phone : member.name.toLowerCase();
              if (!frequencyMap[key]) frequencyMap[key] = { ...member, count: 0 };
              frequencyMap[key].count += 1;
            }
          });
        });
        setFrequentContacts(Object.values(frequencyMap).sort((a, b) => b.count - a.count).slice(0, 10));
      } catch (e) { console.error(e); }
    };
    fetchFrequentContacts();
  }, []);

  const handleAdd = (newMember) => {
    const isDuplicate = members.some(m => (m.name.toLowerCase() === newMember.name.toLowerCase()) || (m.phone && newMember.phone && m.phone === newMember.phone));
    if (isDuplicate) return Alert.alert('Already Added', `${newMember.name} is already in the group!`);
    const memberToAdd = { ...newMember, id: Date.now().toString() + Math.random() };
    setMembers([memberToAdd, ...members]);
    setName(''); setPhone(''); setShowContacts(false); 
  };

  const addManual = () => {
    if (!name.trim()) return;
    handleAdd({ name: name.trim(), phone: phone.trim() });
  };

  const removeMember = (id) => setMembers(members.filter(m => m.id !== id));

  const openPhonebook = async () => {
    setLoadingContacts(true); setShowContacts(true);
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
      let flattenedContacts = [];
      data.forEach(contact => {
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          contact.phoneNumbers.forEach(num => {
            flattenedContacts.push({ id: `${contact.id}-${num.id}`, name: contact.name, phone: num.number.replace(/[^0-9+]/g, '') });
          });
        }
      });
      flattenedContacts.sort((a, b) => a.name.localeCompare(b.name));
      setPhonebook(flattenedContacts); setFilteredPhonebook(flattenedContacts);
    } else { Alert.alert('Permission Denied', 'Needs access to contacts.'); setShowContacts(false); }
    setLoadingContacts(false);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query) setFilteredPhonebook(phonebook.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query)));
    else setFilteredPhonebook(phonebook);
  };

  const handleQRAction = async () => {
    if (isHost) setShowQR(true);
    else {
      if (!cameraPermission?.granted) {
        const result = await requestCameraPermission();
        if (!result.granted) return Alert.alert('Permission Denied', 'Camera access needed.');
      }
      setIsScanningQR(true);
    }
  };

  // ☁️ FIREBASE JOIN LOGIC
  const handleBarcodeScanned = async ({ data }) => {
    setIsScanningQR(false); 
    
    if (data.startsWith('demitab-join:')) {
      const eventId = data.split(':')[1];
      
      try {
        const eventRef = doc(db, 'events', eventId);
        const snap = await getDoc(eventRef);
        
        if (snap.exists()) {
          const cloudEvent = snap.data();
          
          // Add this guest to the cloud event's member list automatically!
          const guestMember = { id: profile?.id || 'USER_ME', name: profile?.name?.split(' ')[0] || 'Guest' };
          const isAlreadyMember = cloudEvent.members.some(m => m.id === guestMember.id);
          
          if (!isAlreadyMember) {
            cloudEvent.members.push(guestMember);
            await updateDoc(eventRef, { members: cloudEvent.members });
          }

          // Save the cloud event to the Guest's local dashboard
          const stored = await AsyncStorage.getItem('demitab_events');
          let pastEvents = stored ? JSON.parse(stored) : [];
          pastEvents = pastEvents.filter(e => e.id !== cloudEvent.id);
          pastEvents.unshift(cloudEvent);
          await AsyncStorage.setItem('demitab_events', JSON.stringify(pastEvents));

          Alert.alert(
            'Successfully Joined! 🎉', 
            `You are now in "${cloudEvent.eventName}".\n\nTap the Dashboard back arrow, and open the event from your Event History to see the live data!`,
            [{ text: 'Got it!' }]
          );

        } else {
          Alert.alert('Error', 'Event not found. The host needs to open it while connected to the internet.');
        }
      } catch (error) {
        Alert.alert('Network Error', 'Could not connect to Firebase.');
        console.error(error);
      }
    } else {
      Alert.alert('Invalid QR Code', 'This is not a valid DemiTab event code.');
    }
  };

  const themeStyles = isDarkMode ? darkTheme : lightTheme;
  const qrPayload = `demitab-join:${eventData.id}`; 

  return (
    <View style={[styles.container, themeStyles.background]}>
      
      <PulseButton style={[styles.primaryActionBtn, themeStyles.primaryBtn]} onPress={openPhonebook}>
        <Text style={[styles.primaryActionText, themeStyles.primaryBtnText]}>📖 Add via Contacts</Text>
      </PulseButton>

      <TouchableOpacity style={[styles.secondaryActionBtn, themeStyles.card]} onPress={handleQRAction}>
        <Text style={[styles.secondaryActionText, themeStyles.text]}>
          {isHost ? '📱 Show QR Code to Join' : '📷 Scan QR Code to Join'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionDivider}>OR ADD MANUALLY</Text>

      <View style={styles.inputRow}>
        <TextInput style={[styles.input, themeStyles.input, { flex: 2 }]} placeholder="Friend's Name" value={name} onChangeText={setName} placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} />
        <TextInput style={[styles.input, themeStyles.input, { flex: 2 }]} placeholder="Phone (Opt)" keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} />
        <TouchableOpacity style={[styles.addBtn, themeStyles.primaryBtn]} onPress={addManual}>
          <Text style={[styles.addBtnText, themeStyles.primaryBtnText]}>+</Text>
        </TouchableOpacity>
      </View>

      {frequentContacts.length > 0 && (
        <View style={styles.quickContactsContainer}>
          <Text style={[styles.sectionLabel, themeStyles.subText]}>FREQUENT CONTACTS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {frequentContacts.map((contact, index) => (
              <TouchableOpacity key={index} style={[styles.quickContactPill, themeStyles.pill]} onPress={() => handleAdd(contact)}>
                <Text style={[styles.quickContactText, themeStyles.pillText]}>{contact.name.split(' ')[0]}</Text>
                <Text style={[styles.plusIcon, themeStyles.pillText]}>+</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <Text style={[styles.sectionLabel, themeStyles.subText, { marginTop: 15 }]}>CURRENT GROUP ({members.length + 1} People)</Text>
      <FlatList 
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          <View style={[styles.memberRow, themeStyles.hostRow]}>
            <View>
              <Text style={[styles.memberName, themeStyles.text]}>{profile?.name || 'You'} (Host)</Text>
              {profile?.phone ? <Text style={[styles.memberPhone, themeStyles.subText]}>{profile.phone}</Text> : null}
            </View>
            <View style={[styles.hostBadge, themeStyles.hostBadge]}><Text style={[styles.hostBadgeText, themeStyles.hostBadgeText]}>Host</Text></View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.memberRow, themeStyles.card]}>
            <View>
              <Text style={[styles.memberName, themeStyles.text]}>{item.name}</Text>
              {item.phone ? <Text style={[styles.memberPhone, themeStyles.subText]}>{item.phone}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => removeMember(item.id)} style={styles.removeBtn}><Text style={styles.removeText}>Remove</Text></TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={showQR} animationType="fade" transparent={true}>
        <View style={styles.qrOverlay}>
          <View style={[styles.qrContainer, themeStyles.card]}>
            <Text style={[styles.qrTitle, themeStyles.text]}>Scan to Join</Text>
            <Text style={[styles.qrSub, themeStyles.subText]}>{eventData.eventName}</Text>
            <View style={styles.qrCodeWrapper}>
              <QRCode value={qrPayload} size={220} color={isDarkMode ? '#F9FAFB' : '#111827'} backgroundColor={isDarkMode ? '#1F2937' : '#fff'} />
            </View>
            <TouchableOpacity style={[styles.closeQRBtn, themeStyles.input]} onPress={() => setShowQR(false)}>
              <Text style={[styles.closeQRText, themeStyles.text]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isScanningQR} animationType="slide">
        <View style={styles.cameraContainer}>
          <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={handleBarcodeScanned} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} />
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraPrompt}>Align QR code within the frame to join the split.</Text>
            <TouchableOpacity style={styles.closeCameraBtn} onPress={() => setIsScanningQR(false)}><Text style={styles.closeCameraText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showContacts} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, themeStyles.background]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, themeStyles.text]}>Select Contact</Text>
            <TouchableOpacity onPress={() => setShowContacts(false)}><Text style={styles.closeText}>Close</Text></TouchableOpacity>
          </View>
          <TextInput style={[styles.searchInput, themeStyles.input, themeStyles.text]} placeholder="Search name or number..." placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} value={searchQuery} onChangeText={handleSearch} />
          {loadingContacts ? <ActivityIndicator size="large" color="#5BC5A7" style={{marginTop: 50}} /> : (
            <FlatList data={filteredPhonebook} keyExtractor={(item) => item.id} initialNumToRender={20} renderItem={({ item }) => (
                <TouchableOpacity style={[styles.contactRow, themeStyles.divider]} onPress={() => handleAdd(item)}>
                  <View style={styles.contactAvatar}><Text style={styles.avatarText}>{item.name[0]}</Text></View>
                  <View style={{flex: 1}}><Text style={[styles.contactName, themeStyles.text]}>{item.name}</Text><Text style={themeStyles.subText}>{item.phone}</Text></View>
                  <Text style={styles.plusIcon}>+</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      <PulseButton onPress={() => onSaveMembers(members)} style={styles.nextBtn}>
        <Text style={styles.btnText}>Save Group & Continue</Text>
      </PulseButton>
    </View>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, input: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', color: '#111827' }, primaryBtn: { backgroundColor: '#111827' }, primaryBtnText: { color: '#fff' }, pill: { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' }, pillText: { color: '#0369A1' }, hostRow: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }, hostBadge: { backgroundColor: '#E5E7EB' }, hostBadgeText: { color: '#4B5563' }, divider: { borderBottomColor: '#E5E7EB' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, input: { backgroundColor: '#374151', borderColor: '#4B5563', color: '#F9FAFB' }, primaryBtn: { backgroundColor: '#5BC5A7' }, primaryBtnText: { color: '#111827' }, pill: { backgroundColor: '#374151', borderColor: '#4B5563' }, pillText: { color: '#F9FAFB' }, hostRow: { backgroundColor: '#374151', borderColor: '#4B5563' }, hostBadge: { backgroundColor: '#4B5563' }, hostBadgeText: { color: '#F9FAFB' }, divider: { borderBottomColor: '#374151' } };
const styles = StyleSheet.create({ container: { flex: 1, padding: 20 }, primaryActionBtn: { width: '100%', padding: 20, borderRadius: 16, marginBottom: 12 }, primaryActionText: { fontWeight: '900', fontSize: 18, textAlign: 'center', letterSpacing: 0.5 }, secondaryActionBtn: { width: '100%', padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center' }, secondaryActionText: { fontWeight: '700', fontSize: 16 }, sectionDivider: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', textAlign: 'center', marginVertical: 15, letterSpacing: 1 }, inputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 }, input: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 15 }, addBtn: { width: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, addBtnText: { fontWeight: '900', fontSize: 24 }, quickContactsContainer: { marginBottom: 10 }, sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 }, quickContactPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginRight: 10, borderWidth: 1 }, quickContactText: { fontWeight: '700', fontSize: 14, marginRight: 6 }, plusIcon: { fontWeight: '900', fontSize: 16, color: '#5BC5A7' }, listContainer: { paddingBottom: 20 }, memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1 }, memberName: { fontSize: 16, fontWeight: '700' }, memberPhone: { fontSize: 12, marginTop: 2 }, hostBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }, hostBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, removeBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }, removeText: { fontSize: 12, color: '#EF4444', fontWeight: '700' }, nextBtn: { backgroundColor: '#5BC5A7', marginTop: 10 }, btnText: { color: '#fff', fontWeight: '800', fontSize: 16 }, qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }, qrContainer: { padding: 30, borderRadius: 24, alignItems: 'center', width: '100%', borderWidth: 1 }, qrTitle: { fontSize: 24, fontWeight: '900', marginBottom: 4 }, qrSub: { fontSize: 16, marginBottom: 30 }, qrCodeWrapper: { padding: 20, backgroundColor: '#fff', borderRadius: 16 }, closeQRBtn: { marginTop: 30, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12, borderWidth: 1 }, closeQRText: { fontSize: 16, fontWeight: '800' }, cameraContainer: { flex: 1, backgroundColor: '#000' }, cameraOverlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 }, cameraPrompt: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 16, borderRadius: 12 }, closeCameraBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 12 }, closeCameraText: { color: '#fff', fontSize: 16, fontWeight: '800' }, modalContainer: { flex: 1, paddingTop: Platform.OS === 'ios' ? 20 : 0 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' }, modalTitle: { fontSize: 18, fontWeight: '800' }, closeText: { color: '#EF4444', fontWeight: '700', fontSize: 16 }, searchInput: { margin: 15, padding: 15 }, contactRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 }, contactAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginRight: 15 }, avatarText: { fontWeight: '900', color: '#6B7280' }, contactName: { fontSize: 16, fontWeight: '700', marginBottom: 2 } });