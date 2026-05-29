import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, ActivityIndicator, Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

  // NEW: Dynamic Frequent Contacts state
  const [frequentContacts, setFrequentContacts] = useState([]);

  const isHost = profile?.id === eventData.hostId || eventData.hostId === 'USER_ME';

  // SMART ENGINE: Fetch past events and rank contacts by frequency
  useEffect(() => {
    const fetchFrequentContacts = async () => {
      try {
        const stored = await AsyncStorage.getItem('demitab_events');
        if (!stored) return;
        
        const pastEvents = JSON.parse(stored);
        const frequencyMap = {};

        pastEvents.forEach(event => {
          (event.members || []).forEach(member => {
            // Ignore the host/user
            if (member.id !== 'USER_ME' && member.id !== profile?.id) {
              // Use phone as the unique identifier if it exists, otherwise use lowercase name
              const key = member.phone ? member.phone : member.name.toLowerCase();
              if (!frequencyMap[key]) {
                frequencyMap[key] = { ...member, count: 0 };
              }
              frequencyMap[key].count += 1;
            }
          });
        });

        // Sort by highest count and take the top 10
        const sortedContacts = Object.values(frequencyMap)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        setFrequentContacts(sortedContacts);
      } catch (e) {
        console.error('Error fetching frequent contacts', e);
      }
    };

    fetchFrequentContacts();
  }, []);

  const handleAdd = (newMember) => {
    const isDuplicate = members.some(m => (m.name.toLowerCase() === newMember.name.toLowerCase()) || (m.phone && newMember.phone && m.phone === newMember.phone));
    if (isDuplicate) return Alert.alert('Already Added', `${newMember.name} is already in the group!`);
    
    // Ensure we give them a unique ID for this specific event if they came from frequent contacts
    const memberToAdd = { ...newMember, id: Date.now().toString() + Math.random() };
    
    setMembers([memberToAdd, ...members]);
    setName(''); setPhone('');
    setShowContacts(false); 
  };

  const addManual = () => {
    if (!name.trim()) return;
    handleAdd({ name: name.trim(), phone: phone.trim() });
  };

  const removeMember = (id) => setMembers(members.filter(m => m.id !== id));

  const openPhonebook = async () => {
    setLoadingContacts(true);
    setShowContacts(true);
    const { status } = await Contacts.requestPermissionsAsync();
    
    if (status === 'granted') {
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
      let flattenedContacts = [];
      data.forEach(contact => {
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          contact.phoneNumbers.forEach(num => {
            flattenedContacts.push({
              id: `${contact.id}-${num.id}`,
              name: contact.name,
              phone: num.number.replace(/[^0-9+]/g, '') 
            });
          });
        }
      });
      flattenedContacts.sort((a, b) => a.name.localeCompare(b.name));
      setPhonebook(flattenedContacts);
      setFilteredPhonebook(flattenedContacts);
    } else {
      Alert.alert('Permission Denied', 'DemiTab needs access to your contacts to add friends easily.');
      setShowContacts(false);
    }
    setLoadingContacts(false);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query) {
      setFilteredPhonebook(phonebook.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query)));
    } else {
      setFilteredPhonebook(phonebook);
    }
  };

  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  return (
    <View style={[styles.container, themeStyles.background]}>
      
      <PulseButton style={[styles.primaryActionBtn, themeStyles.primaryBtn]} onPress={openPhonebook}>
        <Text style={[styles.primaryActionText, themeStyles.primaryBtnText]}>📖 Add via Contacts</Text>
      </PulseButton>

      <TouchableOpacity style={[styles.secondaryActionBtn, themeStyles.card]} onPress={() => Alert.alert('Coming Soon', 'QR generation connects in Phase 6.')}>
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

      {/* DYNAMIC FREQUENT CONTACTS */}
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

      <Modal visible={showContacts} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, themeStyles.background]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, themeStyles.text]}>Select Contact</Text>
            <TouchableOpacity onPress={() => setShowContacts(false)}><Text style={styles.closeText}>Close</Text></TouchableOpacity>
          </View>
          
          <TextInput 
            style={[styles.searchInput, themeStyles.input, themeStyles.text]} 
            placeholder="Search name or number..." 
            placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
            value={searchQuery}
            onChangeText={handleSearch}
          />

          {loadingContacts ? (
            <ActivityIndicator size="large" color="#5BC5A7" style={{marginTop: 50}} />
          ) : (
            <FlatList 
              data={filteredPhonebook}
              keyExtractor={(item) => item.id}
              initialNumToRender={20}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.contactRow, themeStyles.divider]} onPress={() => handleAdd(item)}>
                  <View style={styles.contactAvatar}><Text style={styles.avatarText}>{item.name[0]}</Text></View>
                  <View style={{flex: 1}}>
                    <Text style={[styles.contactName, themeStyles.text]}>{item.name}</Text>
                    <Text style={themeStyles.subText}>{item.phone}</Text>
                  </View>
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

const styles = StyleSheet.create({ container: { flex: 1, padding: 20 }, primaryActionBtn: { width: '100%', padding: 20, borderRadius: 16, marginBottom: 12 }, primaryActionText: { fontWeight: '900', fontSize: 18, textAlign: 'center', letterSpacing: 0.5 }, secondaryActionBtn: { width: '100%', padding: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center' }, secondaryActionText: { fontWeight: '700', fontSize: 16 }, sectionDivider: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', textAlign: 'center', marginVertical: 15, letterSpacing: 1 }, inputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 }, input: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 15 }, addBtn: { width: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, addBtnText: { fontWeight: '900', fontSize: 24 }, quickContactsContainer: { marginBottom: 10 }, sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 }, quickContactPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginRight: 10, borderWidth: 1 }, quickContactText: { fontWeight: '700', fontSize: 14, marginRight: 6 }, plusIcon: { fontWeight: '900', fontSize: 16, color: '#5BC5A7' }, listContainer: { paddingBottom: 20 }, memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1 }, memberName: { fontSize: 16, fontWeight: '700' }, memberPhone: { fontSize: 12, marginTop: 2 }, hostBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }, hostBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, removeBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }, removeText: { fontSize: 12, color: '#EF4444', fontWeight: '700' }, nextBtn: { backgroundColor: '#5BC5A7', marginTop: 10 }, btnText: { color: '#fff', fontWeight: '800', fontSize: 16 }, modalContainer: { flex: 1, paddingTop: Platform.OS === 'ios' ? 20 : 0 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' }, modalTitle: { fontSize: 18, fontWeight: '800' }, closeText: { color: '#EF4444', fontWeight: '700', fontSize: 16 }, searchInput: { margin: 15, padding: 15 }, contactRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 }, contactAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginRight: 15 }, avatarText: { fontWeight: '900', color: '#6B7280' }, contactName: { fontSize: 16, fontWeight: '700', marginBottom: 2 } });