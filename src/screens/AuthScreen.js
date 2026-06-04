import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { PulseButton } from '../components/PulseButton';
import { auth, firebaseConfig, PhoneAuthProvider, signInWithCredential } from '../services/firebase';

export const AuthScreen = ({ isDarkMode }) => {
  // Now we only store the 10 digits
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationId, setVerificationId] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  
  const recaptchaVerifier = useRef(null);

  const sendOTP = async () => {
    // Validate for exactly 10 digits
    if (!phoneNumber.trim() || phoneNumber.length !== 10) {
      return Alert.alert('Invalid Phone', 'Please enter a valid 10-digit phone number.');
    }

    setLoading(true);
    try {
      // Hardcode the +91 prefix under the hood before sending to Firebase
      const formattedPhone = `+91${phoneNumber}`;

      const phoneProvider = new PhoneAuthProvider(auth);
      const vId = await phoneProvider.verifyPhoneNumber(
        formattedPhone,
        recaptchaVerifier.current
      );
      
      setVerificationId(vId);
    } catch (error) {
      Alert.alert('Error Sending OTP', error.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmOTP = async () => {
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      return Alert.alert('Invalid Code', 'Please enter the 6-digit OTP.');
    }

    setLoading(true);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, verificationCode);
      await signInWithCredential(auth, credential);
    } catch (error) {
      Alert.alert('Invalid OTP', 'The code you entered is incorrect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  return (
    <KeyboardAvoidingView style={[styles.container, themeStyles.background]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      <View style={[styles.card, themeStyles.card]}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>DemiTab</Text>
        </View>
        <Text style={[styles.title, themeStyles.text]}>Sign In</Text>
        <Text style={themeStyles.subText}>
          {verificationId ? 'Enter the 6-digit code sent to your phone.' : 'Enter your phone number to get an OTP.'}
        </Text>

        {!verificationId ? (
          <>
            <Text style={styles.label}>Phone Number</Text>
            
            {/* The New Composite Input for +91 */}
            <View style={[styles.phoneInputContainer, themeStyles.inputWrapper]}>
              <View style={[styles.prefixBox, themeStyles.prefixBorder]}>
                <Text style={[styles.prefixText, themeStyles.text]}>+91</Text>
              </View>
              <TextInput
                style={[styles.phoneInputField, themeStyles.inputText]}
                placeholder="9876543210"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                keyboardType="phone-pad"
                maxLength={10}
                value={phoneNumber}
                // Automatically strip out spaces or dashes if they paste a number
                onChangeText={(text) => setPhoneNumber(text.replace(/[^0-9]/g, ''))}
              />
            </View>

            <PulseButton style={styles.authBtn} onPress={sendOTP}>
              <Text style={styles.authBtnText}>{loading ? 'Sending...' : 'Get OTP'}</Text>
            </PulseButton>
          </>
        ) : (
          <>
            <Text style={styles.label}>Verification Code</Text>
            <TextInput
              style={[styles.input, themeStyles.inputWrapper, styles.otpInput, themeStyles.inputText]}
              placeholder="------"
              placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              keyboardType="number-pad"
              maxLength={6}
              value={verificationCode}
              onChangeText={setVerificationCode}
            />

            <PulseButton style={styles.authBtn} onPress={confirmOTP}>
              <Text style={styles.authBtnText}>{loading ? 'Verifying...' : 'Confirm OTP'}</Text>
            </PulseButton>

            <TouchableOpacity style={styles.toggleBtn} onPress={() => { setVerificationId(null); setVerificationCode(''); }}>
              <Text style={[styles.toggleText, themeStyles.text]}>
                Wrong number? <Text style={styles.toggleTextBold}>Go back</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

// Updated Theme Configurations to handle the new input wrapper borders
const lightTheme = { 
  background: { backgroundColor: '#F4F5F4' }, 
  text: { color: '#111827' }, 
  subText: { color: '#6B7280', textAlign: 'center', marginBottom: 24 }, 
  card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, 
  inputWrapper: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' }, 
  inputText: { color: '#111827' },
  prefixBorder: { borderRightColor: '#E5E7EB' }
};

const darkTheme = { 
  background: { backgroundColor: '#111827' }, 
  text: { color: '#F9FAFB' }, 
  subText: { color: '#9CA3AF', textAlign: 'center', marginBottom: 24 }, 
  card: { backgroundColor: '#1F2937', borderColor: '#374151' }, 
  inputWrapper: { backgroundColor: '#374151', borderColor: '#4B5563' }, 
  inputText: { color: '#F9FAFB' },
  prefixBorder: { borderRightColor: '#4B5563' }
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { padding: 24, borderRadius: 16, borderWidth: 1 },
  logoBox: { backgroundColor: '#5BC5A7', padding: 15, borderRadius: 16, alignSelf: 'center', marginBottom: 20 },
  logoText: { fontSize: 24, fontWeight: '900', color: '#111827', letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', marginBottom: 6, marginTop: 16 },
  
  // Standard input styling for the OTP box
  input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16 },
  otpInput: { letterSpacing: 8, textAlign: 'center', fontSize: 24, fontWeight: '900' },
  
  // New Composite Input Styling for Phone Number
  phoneInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  prefixBox: { paddingHorizontal: 16, paddingVertical: 16, borderRightWidth: 1 },
  prefixText: { fontSize: 16, fontWeight: '800' },
  phoneInputField: { flex: 1, paddingVertical: 16, paddingHorizontal: 12, fontSize: 16, letterSpacing: 1, fontWeight: '600' },
  
  authBtn: { backgroundColor: '#111827', marginTop: 24, padding: 18 },
  authBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  toggleBtn: { marginTop: 20, alignItems: 'center' },
  toggleText: { fontSize: 14 },
  toggleTextBold: { fontWeight: '900', color: '#5BC5A7' }
});