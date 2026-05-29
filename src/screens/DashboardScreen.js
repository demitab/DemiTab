import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PulseButton } from '../components/PulseButton';

export const DashboardScreen = ({ profile, onEditProfile, onCreateEvent, onOpenEvent, isDarkMode, toggleTheme }) => {
  const [eventName, setEventName] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const stored = await AsyncStorage.getItem('demitab_events');
        if (stored) setHistory(JSON.parse(stored));
      } catch(e) { console.error(e); }
    };
    fetchHistory();
  }, []);

  const deleteEvent = (id) => {
    Alert.alert('Delete Event', 'Are you sure you want to delete this past event?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          const newHistory = history.filter(h => h.id !== id);
          setHistory(newHistory);
          await AsyncStorage.setItem('demitab_events', JSON.stringify(newHistory));
      }}
    ]);
  };

  const handleCreate = () => {
    if (!eventName.trim()) return Alert.alert('Missing Name', 'Please enter an event name before creating.');
    onCreateEvent(eventName.trim()); setEventName('');
  };

  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  return (
    <View style={[styles.container, themeStyles.background]}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, themeStyles.text]}>Dashboard</Text>
        <TouchableOpacity style={[styles.themeToggle, themeStyles.input]} onPress={toggleTheme}>
          <Text style={[styles.themeText, themeStyles.text]}>{isDarkMode ? '☀️ Light' : '🌙 Dark'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.profileCard, themeStyles.card]}>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, themeStyles.text]}>{profile.name}</Text>
          <Text style={[styles.profileEmail, themeStyles.subText]}>{profile.email || 'No email added'}</Text>
        </View>
        <TouchableOpacity style={[styles.editBtn, themeStyles.input]} onPress={onEditProfile}><Text style={[styles.editBtnText, themeStyles.text]}>Edit</Text></TouchableOpacity>
      </View>

      <View style={styles.createSection}>
        <TextInput style={[styles.eventInput, themeStyles.input]} placeholder="Enter Event Name (e.g. Saturday Dinner)" placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} value={eventName} onChangeText={setEventName} />
        <PulseButton style={styles.createBtn} onPress={handleCreate}><Text style={styles.createBtnText}>Create Event</Text></PulseButton>
      </View>

      <Text style={[styles.sectionTitle, themeStyles.text]}>Event History</Text>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={themeStyles.subText}>No past events saved yet.</Text>}
        renderItem={({ item }) => (
          // NEW: The entire row is now clickable to open the event
          <TouchableOpacity style={[styles.historyRow, themeStyles.card]} onPress={() => onOpenEvent(item)} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.historyName, themeStyles.text]}>{item.eventName}</Text>
              <Text style={[styles.historyDate, themeStyles.subText]}>{item.eventDate} • {item.members?.length || 1} Members</Text>
            </View>
            <TouchableOpacity onPress={() => deleteEvent(item.id)} style={styles.deleteBtnContainer}>
              <Text style={styles.deleteIcon}>🗑️</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const lightTheme = { background: { backgroundColor: '#F4F5F4' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, input: { backgroundColor: '#fff', borderColor: '#E5E7EB', color: '#111827' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, input: { backgroundColor: '#374151', borderColor: '#4B5563', color: '#F9FAFB' } };
const styles = StyleSheet.create({ container: { flex: 1, padding: 20 }, headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 }, headerTitle: { fontSize: 28, fontWeight: '900' }, themeToggle: { padding: 10, borderRadius: 20, borderWidth: 1 }, themeText: { fontSize: 12, fontWeight: 'bold' }, profileCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 24 }, profileName: { fontSize: 20, fontWeight: '800' }, profileEmail: { fontSize: 14, marginTop: 4 }, editBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 }, editBtnText: { fontWeight: '700' }, createSection: { marginBottom: 30 }, eventInput: { padding: 16, borderRadius: 12, borderWidth: 1, fontSize: 16, marginBottom: 12 }, createBtn: { backgroundColor: '#5BC5A7', padding: 20 }, createBtnText: { color: '#fff', fontWeight: '900', fontSize: 18, textAlign: 'center' }, sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 }, historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 10 }, historyName: { fontSize: 16, fontWeight: '700' }, historyDate: { fontSize: 12, marginTop: 4 }, deleteBtnContainer: { padding: 10 }, deleteIcon: { fontSize: 20 } });