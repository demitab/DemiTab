import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { signInWithPhoneNumber } from '@react-native-firebase/auth';
import { auth } from '../services/firebase';

export const AuthScreen = ({ isDarkMode }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (phoneNumber.length !== 10) return alert("Enter a valid 10-digit number.");
    setLoading(true);
    try {
      const confirmation = await signInWithPhoneNumber(auth, `+91${phoneNumber}`);
      setConfirm(confirmation);
    } catch (error) {
      console.error(error);
      alert('Failed to send code: ' + error.message);
    }
    setLoading(false);
  };

  const handleVerifyCode = async (otpString = code) => {
    if (otpString.length !== 6) return alert("Enter the 6-digit OTP.");
    setLoading(true);
    try {
      await confirm.confirm(otpString);
    } catch (error) {
      console.error(error);
      alert('Invalid OTP. Please try again.');
    }
    setLoading(false);
  };

  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  return (
    <KeyboardAvoidingView style={[styles.container, themeStyles.background]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={[styles.title, themeStyles.text]}>DemiTab</Text>
        
        {!confirm ? (
          <>
            <Text style={styles.label}>Enter Phone Number</Text>
            <View style={[styles.compositeInput, themeStyles.inputBorder]}>
              <Text style={[styles.prefix, themeStyles.text]}>+91</Text>
              <TextInput style={[styles.input, themeStyles.text]} keyboardType="phone-pad" maxLength={10} value={phoneNumber} onChangeText={setPhoneNumber} placeholder="9999999999" placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'} />
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSendCode} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send OTP</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Enter OTP</Text>
            <TextInput style={[styles.inputSingle, themeStyles.inputBorder, themeStyles.text]} keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} placeholder="123456" placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} textContentType="oneTimeCode" autoComplete="sms-otp" />
            <TouchableOpacity style={styles.primaryBtn} onPress={() => handleVerifyCode(code)} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify & Login</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const lightTheme = { background: { backgroundColor: '#F4F5F4' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, inputBorder: { borderColor: '#D1D5DB', backgroundColor: '#fff' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, inputBorder: { borderColor: '#374151', backgroundColor: '#1F2937' } };

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 40, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 8, marginTop: 30 },
  compositeInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, height: 60, marginBottom: 20 },
  prefix: { fontSize: 18, fontWeight: 'bold', marginRight: 10, borderRightWidth: 1, borderRightColor: '#D1D5DB', paddingRight: 10 },
  input: { flex: 1, fontSize: 18, fontWeight: '700' },
  inputSingle: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, height: 60, fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center', letterSpacing: 8 },
  primaryBtn: { backgroundColor: '#111827', height: 60, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' }
});