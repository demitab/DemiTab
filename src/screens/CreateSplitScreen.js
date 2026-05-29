import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import { PulseButton } from '../components/PulseButton';

export const CreateSplitScreen = ({ onBack, onSave }) => {
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toLocaleDateString('en-GB'));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>New Split</Text>
      
      <Text style={styles.label}>Event Name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Goa Trip, Dinner"
        value={eventName}
        onChangeText={setEventName}
      />

      <Text style={styles.label}>Date</Text>
      <TextInput
        style={styles.input}
        placeholder="DD-MM-YYYY"
        value={eventDate}
        onChangeText={setEventDate}
      />

      <View style={styles.buttonRow}>
        <PulseButton style={styles.saveBtn} onPress={() => onSave({ eventName, eventDate })}>
          <Text style={styles.btnText}>Next: Add Items</Text>
        </PulseButton>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 5 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, marginBottom: 15 },
  buttonRow: { marginTop: 20 },
  saveBtn: { backgroundColor: '#5BC5A7' },
  btnText: { color: '#fff', fontWeight: 'bold' }
});