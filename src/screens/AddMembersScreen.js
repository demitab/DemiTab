import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, ActivityIndicator, Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { PulseButton } from '../components/PulseButton';

// FIX: Fetch frequent contacts directly from Cloud to replace dead local storage
import { collection, query, where, getDocs, or } from 'firebase/firestore';
import { db } from '../services/firebase';

const ContactRow = React.memo(({ item, isSelected, onToggle, isDarkMode }) => {
  const themeStyles = isDarkMode ? darkTheme : lightTheme;
  return (
    <TouchableOpacity style={[styles.contactRow, themeStyles.divider, isSelected && { backgroundColor: isDarkMode ? 'rgba(91, 197, 167, 0.15)' : 'rgba(91, 197, 167, 0.1)' }]} onPress={() => onToggle(item)} activeOpacity={0.7}>
      <View style={styles.contactAvatar}><Text style={styles.avatarText}>{item.name[0]}</Text></View>
      <View style={{flex: 1}}><Text style={[styles.contactName, themeStyles.text]}>{item.name}</Text><Text style={themeStyles.subText}>{item.label} • {item.phone}</Text></View>
      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>{isSelected && <Text style={styles.checkmark}>✓</Text>}</View>
    </TouchableOpacity>
  );
});

export const AddMembersScreen = ({ eventData, profile, isDarkMode, onSaveMembers }) => {
  const [members, setMembers] = useState(eventData.members.filter(m => m.id !== 'USER_ME' && m.id !== profile?.id) || []);
  const [name, setName] = useState('');
  
  const [showContacts, setShowContacts] = useState(false);
  const [phonebook, setPhonebook] = useState([]);
  const [filteredPhonebook, setFilteredPhonebook] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [showQRModal, setShowQRModal] = useState(false);
  const [frequentContacts, setFrequentContacts] = useState([]);
  const isHost = profile?.id === eventData.hostId || eventData.hostId === 'USER_ME';
  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  // FIX: Read frequent contacts from your actual database
  useEffect(() => {
    const fetchFrequentContacts = async () => {
      try {
        if (!profile?.id) return;
        let q;
        if (profile.phone) {
          const myPhone10 = profile.phone.replace(/\D/g, '').slice(-10);
          q = query(collection(db, 'events'), or(where('memberIds', 'array-contains', profile.id), where('memberPhones', 'array-contains', myPhone10)));
        } else {
          q = query(collection(db, 'events'), where('memberIds', 'array-contains', profile.id));
        }

        const snapshot = await getDocs(q);
        const frequencyMap = {};

        snapshot.forEach(docSnap => {
          const event = docSnap.data();
          (event.members || []).forEach(member => {
            if (member.id !== 'USER_ME' && member.id !== profile?.id) {
              const key = member.phone ? member.phone.replace(/\D/g, '').slice(-10) : member.name.toLowerCase();
              if (!frequencyMap[key]) frequencyMap[key] = { ...member, count: 0 };
              frequencyMap[key].count += 1;
            }
          });
        });

        const sortedContacts = Object.values(frequencyMap).sort((a, b) => b.count - a.count).slice(0, 10);
        setFrequentContacts(sortedContacts);
      } catch (e) { console.error('Error fetching frequent contacts', e); }
    };
    fetchFrequentContacts();
  }, [profile]);

  const handleAdd = (newMember) => {
    // FIX: Extract exactly the last 10 digits to catch duplicates perfectly regardless of +91
    const cleanPhone = (phoneStr) => phoneStr ? phoneStr.replace(/\D/g, '').slice(-10) : null;
    const newPhone10 = cleanPhone(newMember.phone);

    const isDuplicate = members.some(m => {
      const existingPhone10 = cleanPhone(m.phone);
      if (newPhone10 && existingPhone10 && newPhone10 === existingPhone10) return true;
      return m.name.toLowerCase() === newMember.name.toLowerCase();
    });

    if (isDuplicate) return false;
    
    const memberToAdd = { ...newMember, id: Date.now().toString() + Math.random() };
    setMembers(prev => [memberToAdd, ...prev]);
    return true;
  };

  const addManual = () => {
    if (!name.trim()) return;
    const added = handleAdd({ name: name.trim(), phone: '' }); 
    if (added) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName('');
    } else {
      // FIX: Updated alert text as requested
      Alert.alert('Duplicate Found', `Already added to the Group.`);
    }
  };

  const removeMember = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMembers(members.filter(m => m.id !== id));
  };

  const openPhonebook = async () => {
    setLoadingContacts(true); setShowContacts(true); setSelectedContacts(new Set()); 
    const { status } = await Contacts.requestPermissionsAsync();
    
    if (status === 'granted') {
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
      let flattenedContacts = [];
      data.forEach(contact => {
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          contact.phoneNumbers.forEach(num => {
            flattenedContacts.push({ id: `${contact.id}-${num.id}`, name: contact.name, phone: num.number.replace(/[^0-9+]/g, ''), label: num.label ? num.label.toUpperCase() : 'MOBILE' });
          });
        }
      });
      flattenedContacts.sort((a, b) => a.name.localeCompare(b.name));
      setPhonebook(flattenedContacts); setFilteredPhonebook(flattenedContacts);
    } else {
      Alert.alert('Permission Denied', 'DemiTab needs access to your contacts to add friends easily.');
      setShowContacts(false);
    }
    setLoadingContacts(false);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query) {
      const lowerQuery = query.toLowerCase();
      setFilteredPhonebook(phonebook.filter(c => c.name.toLowerCase().includes(lowerQuery) || c.phone.includes(query)));
    } else {
      setFilteredPhonebook(phonebook);
    }
  };

  const toggleContactSelection = useCallback((contact) => {
    Haptics.selectionAsync();
    setSelectedContacts(prev => { const newSet = new Set(prev); if (newSet.has(contact.id)) newSet.delete(contact.id); else newSet.add(contact.id); return newSet; });
  }, []);

  const submitSelectedContacts = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    let duplicates = 0;
    phonebook.forEach(contact => {
      if (selectedContacts.has(contact.id)) {
        const added = handleAdd({ name: contact.name, phone: contact.phone });
        if (!added) duplicates++;
      }
    });
    setShowContacts(false);
    if (duplicates > 0) Alert.alert('Contacts Added', `Added successfully. Skipped ${duplicates} duplicates.`);
  };

  const secureEventId = eventData.id || "TEMP_" + Date.now().toString();

  return (
    <View style={[styles.container, themeStyles.background]}>
      <PulseButton style={[styles.primaryActionBtn, themeStyles.primaryBtn]} onPress={openPhonebook}>
        <Text style={[styles.primaryActionText, themeStyles.primaryBtnText]}>📖 Add via Contacts</Text>
      </PulseButton>
      <Text style={styles.sectionDivider}>OR ADD MANUALLY</Text>

      <View style={styles.inputRow}>
        <TextInput style={[styles.input, themeStyles.input, themeStyles.text, { flex: 1 }]} placeholder="Friend's Name" value={name} onChangeText={setName} placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} />
        <TouchableOpacity style={[styles.addBtn, themeStyles.primaryBtn]} onPress={addManual}><Text style={[styles.addBtnText, themeStyles.primaryBtnText]}>+</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.qrBtnInline, themeStyles.primaryBtn]} onPress={() => setShowQRModal(true)}><Text style={[styles.qrBtnInlineText, themeStyles.primaryBtnText]}>🔲 QR</Text></TouchableOpacity>
      </View>

      {frequentContacts.length > 0 && (
        <View style={styles.quickContactsContainer}>
          <Text style={[styles.sectionLabel, themeStyles.subText]}>FREQUENT CONTACTS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {frequentContacts.map((contact, index) => (
              <TouchableOpacity key={index} style={[styles.quickContactPill, themeStyles.pill]} onPress={() => {
                const added = handleAdd(contact);
                if (!added) Alert.alert('Duplicate Found', `Already added to the Group.`);
              }}>
                <Text style={[styles.quickContactText, themeStyles.pillText]}>{contact.name.split(' ')[0]}</Text>
                <Text style={[styles.plusIcon, themeStyles.pillText]}>+</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <Text style={[styles.sectionLabel, themeStyles.subText, { marginTop: 15 }]}>CURRENT GROUP ({members.length + 1} People)</Text>
      <FlatList 
        data={members} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          <View style={[styles.memberRow, themeStyles.hostRow]}>
            <View><Text style={[styles.memberName, themeStyles.text]}>{profile?.name || 'You'} (Host)</Text>{profile?.phone ? <Text style={[styles.memberPhone, themeStyles.subText]}>{profile.phone}</Text> : null}</View>
            <View style={[styles.hostBadge, themeStyles.hostBadge]}><Text style={[styles.hostBadgeText, themeStyles.hostBadgeText]}>Host</Text></View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.memberRow, themeStyles.card]}>
            <View><Text style={[styles.memberName, themeStyles.text]}>{item.name}</Text>{item.phone ? <Text style={[styles.memberPhone, themeStyles.subText]}>{item.phone}</Text> : null}</View>
            <TouchableOpacity onPress={() => removeMember(item.id)} style={styles.removeBtn}><Text style={styles.removeText}>Remove</Text></TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={showQRModal} animationType="fade" transparent={true}>
        <View style={styles.qrModalOverlay}>
          <View style={[styles.qrModalContent, themeStyles.card]}>
            <Text style={[styles.qrModalTitle, themeStyles.text, {textAlign: 'center'}]}>Scan to Join {eventData?.eventName || 'Event'}</Text>
            <Text style={[themeStyles.subText, {marginBottom: 30}]}>Tell friends to scan this code.</Text>
            <View style={[styles.qrPlaceholder, themeStyles.qrBg]}>
              <QRCode value={`demitab:event:${secureEventId}`} size={200} color={isDarkMode ? '#F9FAFB' : '#111827'} backgroundColor="transparent" />
            </View>
            <TouchableOpacity style={[styles.qrCloseBtn, themeStyles.input]} onPress={() => setShowQRModal(false)}><Text style={[styles.qrCloseBtnText, themeStyles.text]}>Done</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showContacts} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, themeStyles.background]}>
          <View style={styles.modalHeader}><Text style={[styles.modalTitle, themeStyles.text]}>Select Contacts</Text><TouchableOpacity onPress={() => setShowContacts(false)}><Text style={styles.closeText}>Cancel</Text></TouchableOpacity></View>
          <TextInput style={[styles.searchInput, themeStyles.input, themeStyles.text]} placeholder="Search name or number..." placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} value={searchQuery} onChangeText={handleSearch} />
          {loadingContacts ? <ActivityIndicator size="large" color="#5BC5A7" style={{marginTop: 50}} /> : (
            <FlatList data={filteredPhonebook} keyExtractor={(item) => item.id} initialNumToRender={20} maxToRenderPerBatch={20} windowSize={10} renderItem={({ item }) => (
                <ContactRow item={item} isSelected={selectedContacts.has(item.id)} onToggle={toggleContactSelection} isDarkMode={isDarkMode} />
            )}/>
          )}
          {selectedContacts.size > 0 && (
            <View style={styles.multiSelectFooter}>
              <PulseButton onPress={submitSelectedContacts} style={styles.multiSelectBtn}><Text style={styles.multiSelectBtnText}>Add {selectedContacts.size} Friend{selectedContacts.size > 1 ? 's' : ''}</Text></PulseButton>
            </View>
          )}
        </View>
      </Modal>

      <PulseButton onPress={() => onSaveMembers(members)} style={styles.nextBtn}><Text style={styles.btnText}>Save Group & Continue</Text></PulseButton>
    </View>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, input: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', color: '#111827' }, primaryBtn: { backgroundColor: '#111827' }, primaryBtnText: { color: '#fff' }, pill: { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' }, pillText: { color: '#0369A1' }, hostRow: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }, hostBadge: { backgroundColor: '#E5E7EB' }, hostBadgeText: { color: '#4B5563' }, divider: { borderBottomColor: '#E5E7EB' }, qrBg: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, input: { backgroundColor: '#374151', borderColor: '#4B5563', color: '#F9FAFB' }, primaryBtn: { backgroundColor: '#5BC5A7' }, primaryBtnText: { color: '#111827' }, pill: { backgroundColor: '#374151', borderColor: '#4B5563' }, pillText: { color: '#F9FAFB' }, hostRow: { backgroundColor: '#374151', borderColor: '#4B5563' }, hostBadge: { backgroundColor: '#4B5563' }, hostBadgeText: { color: '#F9FAFB' }, divider: { borderBottomColor: '#374151' }, qrBg: { backgroundColor: '#1F2937', borderColor: '#374151' } };

const styles = StyleSheet.create({ container: { flex: 1, padding: 20 }, primaryActionBtn: { width: '100%', padding: 20, borderRadius: 16, marginBottom: 12 }, primaryActionText: { fontWeight: '900', fontSize: 18, textAlign: 'center', letterSpacing: 0.5 }, sectionDivider: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', textAlign: 'center', marginVertical: 15, letterSpacing: 1 }, inputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 }, input: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 15 }, addBtn: { width: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, addBtnText: { fontWeight: '900', fontSize: 24 }, qrBtnInline: { paddingHorizontal: 15, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, qrBtnInlineText: { fontWeight: '800', fontSize: 14 }, quickContactsContainer: { marginBottom: 10 }, sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 }, quickContactPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginRight: 10, borderWidth: 1 }, quickContactText: { fontWeight: '700', fontSize: 14, marginRight: 6 }, plusIcon: { fontWeight: '900', fontSize: 16, color: '#5BC5A7' }, listContainer: { paddingBottom: 20 }, memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1 }, memberName: { fontSize: 16, fontWeight: '700' }, memberPhone: { fontSize: 12, marginTop: 2 }, hostBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }, hostBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, removeBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }, removeText: { fontSize: 12, color: '#EF4444', fontWeight: '700' }, nextBtn: { backgroundColor: '#5BC5A7', marginTop: 10 }, btnText: { color: '#fff', fontWeight: '800', fontSize: 16 }, modalContainer: { flex: 1, paddingTop: Platform.OS === 'ios' ? 20 : 0 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' }, modalTitle: { fontSize: 18, fontWeight: '800' }, closeText: { color: '#EF4444', fontWeight: '700', fontSize: 16 }, searchInput: { margin: 15, padding: 15 }, contactRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 }, contactAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginRight: 15 }, avatarText: { fontWeight: '900', color: '#6B7280' }, contactName: { fontSize: 16, fontWeight: '700', marginBottom: 2 }, checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: '#5BC5A7', borderColor: '#5BC5A7' }, checkmark: { color: '#fff', fontWeight: '900', fontSize: 12 }, multiSelectFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'transparent' }, multiSelectBtn: { backgroundColor: '#111827', width: '100%' }, multiSelectBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' }, qrModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }, qrModalContent: { width: '100%', padding: 30, borderRadius: 24, alignItems: 'center', borderWidth: 1 }, qrModalTitle: { fontSize: 24, fontWeight: '900', marginBottom: 5 }, qrPlaceholder: { width: 240, height: 240, justifyContent: 'center', alignItems: 'center', marginBottom: 30, borderRadius: 24, borderWidth: 1 }, qrCloseBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1 }, qrCloseBtnText: { fontWeight: '800', fontSize: 16 } });