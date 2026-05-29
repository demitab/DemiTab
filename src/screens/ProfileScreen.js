import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { PulseButton } from '../components/PulseButton';

const formatDate = (date) => {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

export const ProfileScreen = ({ existingProfile, isDarkMode, onComplete, onCancel }) => {
  const initialFormState = existingProfile || {
    name: '', phone: '', email: '', birthday: '', sex: 'Male', maritalStatus: 'Single', anniversary: '',
  };

  const [form, setForm] = useState(initialFormState);
  
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [tempBirthday, setTempBirthday] = useState(new Date());
  const [showAnniversaryPicker, setShowAnniversaryPicker] = useState(false);
  const [tempAnniversary, setTempAnniversary] = useState(new Date());

  const handleBirthdayChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowBirthdayPicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setTempBirthday(selectedDate);
      setForm({ ...form, birthday: formatDate(selectedDate) });
    }
  };

  const handleAnniversaryChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowAnniversaryPicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setTempAnniversary(selectedDate);
      setForm({ ...form, anniversary: formatDate(selectedDate) });
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      alert('Please enter your Name, Email ID, and Phone Number.');
      return;
    }
    try {
      const userProfile = { id: 'USER_ME', ...form };
      await AsyncStorage.setItem('demitab_profile', JSON.stringify(userProfile));
      onComplete(userProfile);
    } catch (error) {
      console.error('Failed to save profile', error);
    }
  };

  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  return (
    <ScrollView contentContainerStyle={[styles.scrollContainer, themeStyles.background]} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, themeStyles.card]}>
        <Text style={[styles.title, themeStyles.text]}>{existingProfile ? 'Edit Profile' : 'Welcome to DemiTab'}</Text>
        <Text style={themeStyles.subText}>{existingProfile ? 'Update your details below.' : 'Set up your profile to start splitting bills cleanly.'}</Text>

        <Text style={styles.label}>Full Name *</Text>
        <TextInput style={[styles.input, themeStyles.input]} placeholder="e.g. Rahul Sharma" placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />

        <Text style={styles.label}>Email ID *</Text>
        <TextInput style={[styles.input, themeStyles.input]} keyboardType="email-address" autoCapitalize="none" placeholder="e.g. name@example.com" placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} />

        <Text style={styles.label}>Phone Number *</Text>
        <TextInput style={[styles.input, themeStyles.input]} keyboardType="phone-pad" placeholder="e.g. +91 98765 43210" placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} />

        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>Birthday</Text>
            <TouchableOpacity style={[styles.dateBtn, themeStyles.input]} onPress={() => setShowBirthdayPicker(true)}>
              <Text style={form.birthday ? themeStyles.text : themeStyles.placeholderText}>{form.birthday || 'Select Date'}</Text>
            </TouchableOpacity>
            {showBirthdayPicker && (
              <DateTimePicker 
                value={tempBirthday} 
                mode="date" 
                display={Platform.OS === 'ios' ? 'spinner' : 'default'} 
                onChange={handleBirthdayChange} 
                themeVariant={isDarkMode ? "dark" : "light"}
              />
            )}
          </View>

          <View style={styles.flex1}>
            <Text style={styles.label}>Sex</Text>
            <View style={[styles.pickerWrap, themeStyles.input]}>
              <Picker selectedValue={form.sex} onValueChange={(v) => setForm({ ...form, sex: v })} style={themeStyles.pickerText} dropdownIconColor={isDarkMode ? '#fff' : '#000'}>
                <Picker.Item label="Male" value="Male" color={isDarkMode ? '#fff' : '#000'} />
                <Picker.Item label="Female" value="Female" color={isDarkMode ? '#fff' : '#000'} />
                <Picker.Item label="Other" value="Other" color={isDarkMode ? '#fff' : '#000'} />
              </Picker>
            </View>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>Marital Status</Text>
            <View style={[styles.pickerWrap, themeStyles.input]}>
              <Picker selectedValue={form.maritalStatus} onValueChange={(v) => setForm({ ...form, maritalStatus: v, anniversary: v === 'Single' ? '' : form.anniversary })} style={themeStyles.pickerText} dropdownIconColor={isDarkMode ? '#fff' : '#000'}>
                <Picker.Item label="Single" value="Single" color={isDarkMode ? '#fff' : '#000'} />
                <Picker.Item label="Married" value="Married" color={isDarkMode ? '#fff' : '#000'} />
              </Picker>
            </View>
          </View>

          {form.maritalStatus === 'Married' && (
            <View style={styles.flex1}>
              <Text style={styles.label}>Anniversary</Text>
              <TouchableOpacity style={[styles.dateBtn, themeStyles.input]} onPress={() => setShowAnniversaryPicker(true)}>
                <Text style={form.anniversary ? themeStyles.text : themeStyles.placeholderText}>{form.anniversary || 'Select Date'}</Text>
              </TouchableOpacity>
              {showAnniversaryPicker && (
                <DateTimePicker 
                  value={tempAnniversary} 
                  mode="date" 
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'} 
                  onChange={handleAnniversaryChange} 
                  themeVariant={isDarkMode ? "dark" : "light"}
                />
              )}
            </View>
          )}
        </View>

        <View style={styles.buttonRow}>
          {existingProfile && (
            <TouchableOpacity style={[styles.cancelBtn, themeStyles.input]} onPress={onCancel}><Text style={[styles.cancelBtnText, themeStyles.text]}>Cancel</Text></TouchableOpacity>
          )}
          <View style={{ flex: 2 }}>
            <PulseButton onPress={handleSave}><Text style={styles.btnText}>Save Profile</Text></PulseButton>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const lightTheme = { background: { backgroundColor: '#F4F5F4' }, text: { color: '#111827' }, subText: { color: '#6B7280', textAlign: 'center', marginBottom: 24 }, placeholderText: { color: '#9CA3AF' }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, input: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', color: '#111827' }, pickerText: { color: '#111827' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF', textAlign: 'center', marginBottom: 24 }, placeholderText: { color: '#6B7280' }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, input: { backgroundColor: '#374151', borderColor: '#4B5563', color: '#F9FAFB' }, pickerText: { color: '#F9FAFB' } };

const styles = StyleSheet.create({
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { padding: 24, borderRadius: 16, borderWidth: 1 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15 },
  row: { flexDirection: 'row', gap: 12 }, flex1: { flex: 1 },
  dateBtn: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 4, height: 55, justifyContent: 'center' },
  pickerWrap: { borderWidth: 1, borderRadius: 12, marginTop: 4, justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cancelBtnText: { fontWeight: '700', fontSize: 15 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 1 },
});