import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, Share, Linking, Modal, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import * as Clipboard from 'expo-clipboard';
import { PulseButton } from '../components/PulseButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { doc, setDoc, deleteDoc, collection, query, where, getDocs, updateDoc, increment, getDoc, arrayUnion } from 'firebase/firestore'; 
import { auth, db } from '../services/firebase';

const formatDate = (date) => {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

const ProfileEditorModal = ({ existingProfile, isDarkMode, onComplete, onCancel }) => {
  const currentUserPhone = auth?.currentUser?.phoneNumber ? auth.currentUser.phoneNumber.replace('+91', '') : '';
  const initialFormState = existingProfile || { name: '', phone: currentUserPhone, email: '', birthday: '', sex: 'Male', maritalStatus: 'Single', anniversary: '' };
  
  const [form, setForm] = useState(initialFormState);
  const [enteredReferralCode, setEnteredReferralCode] = useState('');
  
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [tempBirthday, setTempBirthday] = useState(new Date());
  const [showAnniversaryPicker, setShowAnniversaryPicker] = useState(false);
  const [tempAnniversary, setTempAnniversary] = useState(new Date());

  const themeStyles = isDarkMode ? darkTheme : lightTheme;
  const pickerItemColor = isDarkMode ? '#F9FAFB' : '#111827'; 

  useEffect(() => {
    if (!existingProfile) {
      const checkClipboardForCode = async () => {
        try {
          const text = await Clipboard.getStringAsync();
          if (text && text.length >= 6 && text.length <= 15 && /^[A-Z0-9]+$/.test(text.toUpperCase())) {
            setEnteredReferralCode(text.toUpperCase());
          }
        } catch (e) { console.log('Clipboard read failed'); }
      };
      checkClipboardForCode();
    }
  }, [existingProfile]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) return alert('Please enter your Name, Email ID, and Phone Number.');
    const digitsOnly = form.phone.replace(/\D/g, ''); 
    if (digitsOnly.length !== 10) return alert('Please enter a valid 10-digit phone number without country codes.');

    try {
      const uniqueId = `USER_${digitsOnly}`;
      let startingCredits = 5; 
      let myReferralCode = form.name.split(' ')[0].toUpperCase() + digitsOnly.slice(-4);
      let referrerName = 'Someone';
      let referralApplied = false;

      if (!existingProfile && enteredReferralCode.trim()) {
        const q = query(collection(db, 'users'), where('referralCode', '==', enteredReferralCode.trim().toUpperCase()));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const referrerDoc = snap.docs[0];
          referrerName = referrerDoc.data().name?.split(' ')[0] || 'A Friend';
          startingCredits += 5; 
          referralApplied = true;
          
          await updateDoc(doc(db, 'users', referrerDoc.id), { 
            hostCredits: increment(5),
            creditHistory: arrayUnion({
              id: Date.now().toString(),
              title: `Referral Bonus (${form.name.split(' ')[0]})`,
              amount: 5,
              date: new Date().toLocaleDateString('en-GB')
            })
          });
          Alert.alert("Referral Applied!", `Welcome! You start with ${startingCredits} free Capabilities!`);
        } else {
          Alert.alert("Invalid Code", `That referral code doesn't exist. Proceeding with standard ${startingCredits} credits.`);
        }
      }

      const initialHistory = [{
        id: Date.now().toString(),
        title: 'Welcome Bonus',
        amount: 5,
        date: new Date().toLocaleDateString('en-GB')
      }];

      if (referralApplied) {
        initialHistory.push({
          id: (Date.now() + 1).toString(),
          title: `Referred by ${referrerName}`,
          amount: 5,
          date: new Date().toLocaleDateString('en-GB')
        });
      }

      const userProfile = { 
        id: uniqueId, ...form, phone: digitsOnly,
        referralCode: existingProfile?.referralCode || myReferralCode,
        hostCredits: existingProfile?.hostCredits ?? startingCredits,
        creditHistory: existingProfile?.creditHistory || initialHistory
      };
      
      await AsyncStorage.setItem('demitab_profile', JSON.stringify(userProfile));
      await setDoc(doc(db, 'users', uniqueId), { ...userProfile, lastUpdated: new Date().toISOString() }, { merge: true });

      onComplete(userProfile);
    } catch (error) { alert('Failed to sync profile to the cloud. Please try again.'); }
  };

  return (
    <ScrollView contentContainerStyle={[styles.scrollContainer, themeStyles.background]} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, themeStyles.card]}>
        <Text style={[styles.title, themeStyles.text]}>{existingProfile ? 'Edit Profile' : 'Welcome to DemiTab'}</Text>
        <Text style={themeStyles.subText}>{existingProfile ? 'Update your details below.' : 'Set up your profile to start splitting bills cleanly.'}</Text>

        <Text style={styles.label}>Full Name *</Text>
        <TextInput style={[styles.input, themeStyles.input]} placeholder="e.g. Rahul Sharma" placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />

        <Text style={styles.label}>Email ID *</Text>
        <TextInput style={[styles.input, themeStyles.input]} keyboardType="email-address" autoCapitalize="none" placeholder="e.g. name@example.com" placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} />

        <Text style={styles.label}>Phone Number (Verified) *</Text>
        <TextInput style={[styles.input, themeStyles.input, { opacity: 0.6 }]} keyboardType="phone-pad" value={form.phone} editable={false} />

        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>Birthday</Text>
            <TouchableOpacity style={[styles.dateBtn, themeStyles.input]} onPress={() => setShowBirthdayPicker(true)}>
              <Text style={form.birthday ? themeStyles.text : themeStyles.placeholderText}>{form.birthday || 'Select Date'}</Text>
            </TouchableOpacity>
            {showBirthdayPicker && (
              <DateTimePicker value={tempBirthday} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(e, d) => { if (Platform.OS === 'android') setShowBirthdayPicker(false); if (e.type !== 'dismissed' && d) { setTempBirthday(d); setForm({ ...form, birthday: formatDate(d) }); } }} themeVariant={isDarkMode ? "dark" : "light"} />
            )}
          </View>

          <View style={styles.flex1}>
            <Text style={styles.label}>Sex</Text>
            <View style={[styles.pickerWrap, themeStyles.input]}>
              <Picker selectedValue={form.sex} onValueChange={(v) => setForm({ ...form, sex: v })} style={themeStyles.pickerText} dropdownIconColor={isDarkMode ? '#fff' : '#000'}>
                <Picker.Item label="Male" value="Male" color={pickerItemColor} />
                <Picker.Item label="Female" value="Female" color={pickerItemColor} />
                <Picker.Item label="Other" value="Other" color={pickerItemColor} />
              </Picker>
            </View>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>Marital Status</Text>
            <View style={[styles.pickerWrap, themeStyles.input]}>
              <Picker selectedValue={form.maritalStatus} onValueChange={(v) => setForm({ ...form, maritalStatus: v, anniversary: v === 'Single' ? '' : form.anniversary })} style={themeStyles.pickerText} dropdownIconColor={isDarkMode ? '#fff' : '#000'}>
                <Picker.Item label="Single" value="Single" color={pickerItemColor} />
                <Picker.Item label="Married" value="Married" color={pickerItemColor} />
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
                <DateTimePicker value={tempAnniversary} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(e, d) => { if (Platform.OS === 'android') setShowAnniversaryPicker(false); if (e.type !== 'dismissed' && d) { setTempAnniversary(d); setForm({ ...form, anniversary: formatDate(d) }); } }} themeVariant={isDarkMode ? "dark" : "light"} />
              )}
            </View>
          )}
        </View>

        {!existingProfile && (
          <>
             <Text style={styles.label}>Referral Code (Optional)</Text>
             <TextInput style={[styles.input, themeStyles.input, enteredReferralCode ? {borderColor: '#5BC5A7', borderWidth: 2} : {}]} autoCapitalize="characters" placeholder="e.g. RAHUL1234" placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'} value={enteredReferralCode} onChangeText={setEnteredReferralCode} />
             {enteredReferralCode ? <Text style={{color: '#5BC5A7', fontSize: 12, marginTop: 4, fontWeight: 'bold'}}>Code Auto-Filled!</Text> : null}
          </>
        )}

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

export const ProfileScreen = ({ existingProfile, isDarkMode, onComplete, onCancel, onLogout }) => {
  const insets = useSafeAreaInsets();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  if (!existingProfile) {
    return <ProfileEditorModal isDarkMode={isDarkMode} onComplete={onComplete} />;
  }

  const creditHistoryList = existingProfile.creditHistory ? [...existingProfile.creditHistory].reverse() : [];

  const handleShareReferral = async () => {
    try {
      const configSnap = await getDoc(doc(db, 'app_config', 'global'));
      let adminUrl = "https://demitab-admin.vercel.app";
      if (configSnap.exists()) { const data = configSnap.data(); adminUrl = data.adminAppUrl || data.webAppUrl || adminUrl; }
      const inviteLink = `${adminUrl}/invite?ref=${existingProfile.referralCode}`;
      const referralMsg = ` Use my code ${existingProfile.referralCode} to get 5 free bonus capabilities!`;
      await Share.share({ message: `Hey! I use DemiTab to split bills effortlessly.${referralMsg} Tap here to download: ${inviteLink}` });
    } catch(e) {}
  };

  const handleLogout = () => {
    Alert.alert("Lock Vault", "Are you sure you want to securely log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: async () => {
          try {
            await auth.signOut();
            await AsyncStorage.removeItem('demitab_profile');
            if (onLogout) onLogout();
          } catch (err) {}
        } 
      }
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert("Delete Account", "This action is permanent. All your profile data will be permanently erased. Proceed?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete Permanently", style: "destructive", onPress: async () => {
          try {
            if (existingProfile?.id) {
              await deleteDoc(doc(db, 'users', existingProfile.id));
            }
            await AsyncStorage.removeItem('demitab_profile');
            if (auth.currentUser) {
              await auth.currentUser.delete();
            }
            if (onLogout) onLogout();
          } catch (err) {
            if (err.code === 'auth/requires-recent-login') {
              Alert.alert("Security Verification", "Please log out and log back in to verify your identity before deleting your account.");
            } else {
              Alert.alert("Error", "Could not delete account backend profile completely.");
            }
          }
        } 
      }
    ]);
  };

  return (
    <ScrollView contentContainerStyle={[styles.hubContainer, themeStyles.background, { paddingBottom: Math.max(40, insets.bottom + 20) }]}>
      <Text style={[styles.hubHeaderTitle, themeStyles.text]}>Account</Text>

      <View style={styles.actionStack}>
        <TouchableOpacity style={[styles.actionBtn, themeStyles.card]} onPress={() => setIsEditingProfile(true)}>
          <Text style={[styles.actionBtnText, themeStyles.text]}>✏️  Edit Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, themeStyles.card]} onPress={() => setShowCreditModal(true)}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flex: 1}}>
            <Text style={[styles.actionBtnText, themeStyles.text]}>🪙  Current Credits</Text>
            <Text style={styles.creditsNumberSmall}>{existingProfile.hostCredits ?? 5}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, themeStyles.card]} onPress={() => setShowReferralModal(true)}>
          <Text style={[styles.actionBtnText, themeStyles.text]}>🎁  Refer & Earn</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, themeStyles.card]} onPress={() => Linking.openURL('market://details?id=')}>
          <Text style={[styles.actionBtnText, themeStyles.text]}>⭐  Rate DemiTab</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, themeStyles.card]} onPress={() => Linking.openURL('mailto:demi.tab001@gmail.com?subject=DemiTab Support')}>
          <Text style={[styles.actionBtnText, themeStyles.text]}>✉️  Contact Support</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, themeStyles.card]} onPress={handleLogout}>
          <Text style={[styles.actionBtnText, themeStyles.text]}>🔒  Log Out of Vault</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.deleteBtnBg]} onPress={handleDeleteAccount}>
          <Text style={styles.deleteBtnText}>⚠️  Delete Account</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={isEditingProfile} animationType="slide">
        <ProfileEditorModal 
          existingProfile={existingProfile} 
          isDarkMode={isDarkMode} 
          onComplete={(p) => { setIsEditingProfile(false); onComplete(p); }} 
          onCancel={() => setIsEditingProfile(false)} 
        />
      </Modal>

      <Modal visible={showCreditModal} animationType="slide">
        <View style={[styles.modalContainer, themeStyles.background, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={[styles.modalTitle, themeStyles.text]}>Credit Ledger</Text>
          <Text style={[styles.hintText, themeStyles.subText, {marginBottom: 20}]}>Your complete capability history.</Text>
          
          <FlatList 
            data={creditHistoryList}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={[styles.historyRow, themeStyles.card]}>
                <View style={styles.flex1}>
                  <Text style={[styles.historyTitle, themeStyles.text]}>{item.title}</Text>
                  <Text style={themeStyles.subText}>{item.date}</Text>
                </View>
                <Text style={[styles.historyAmount, item.amount > 0 ? styles.textSuccess : styles.textError]}>
                  {item.amount > 0 ? `+${item.amount}` : item.amount}
                </Text>
              </View>
            )}
            ListEmptyComponent={<Text style={[themeStyles.subText, {textAlign: 'center', marginTop: 40}]}>No credit history yet.</Text>}
          />
          <PulseButton onPress={() => setShowCreditModal(false)} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Close</Text>
          </PulseButton>
        </View>
      </Modal>

      <Modal visible={showReferralModal} animationType="slide">
        <View style={[styles.modalContainer, themeStyles.background, {justifyContent: 'center', paddingBottom: insets.bottom + 20}]}>
          <View style={[styles.referralCard, themeStyles.input]}>
            <Text style={[styles.accountSectionTitle, themeStyles.text, {textAlign: 'center'}]}>Refer & Earn</Text>
            <Text style={[styles.hintText, themeStyles.subText, {textAlign: 'center'}]}>
              Share your unique code. When a friend signs up, you BOTH get 5 free capabilities!
            </Text>
            <View style={[styles.codeBox, themeStyles.card]}>
              <Text style={[styles.codeText, themeStyles.text]}>{existingProfile.referralCode || 'N/A'}</Text>
            </View>
            <PulseButton onPress={handleShareReferral} style={styles.shareCodeBtn}>
              <Text style={styles.shareCodeBtnText}>Share Invite Link</Text>
            </PulseButton>
          </View>
          <TouchableOpacity onPress={() => setShowReferralModal(false)} style={{marginTop: 20}}>
            <Text style={[themeStyles.subText, {fontSize: 16, fontWeight: '700', textAlign: 'center'}]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </ScrollView>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, placeholderText: { color: '#9CA3AF' }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, input: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB', color: '#111827' }, pickerText: { color: '#111827' }, divider: { backgroundColor: '#E5E7EB' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, placeholderText: { color: '#6B7280' }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, input: { backgroundColor: '#374151', borderColor: '#4B5563', color: '#F9FAFB' }, pickerText: { color: '#F9FAFB' }, divider: { backgroundColor: '#4B5563' } };

const styles = StyleSheet.create({
  scrollContainer: { flexGrow: 1, padding: 20, paddingTop: 40, paddingBottom: 60 },
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
  
  hubContainer: { flexGrow: 1, padding: 20, paddingTop: 60, paddingBottom: 40 },
  hubHeaderTitle: { fontSize: 28, fontWeight: '900', marginBottom: 24, textAlign: 'center' },
  actionStack: { gap: 12 },
  actionBtn: { padding: 18, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  actionBtnText: { fontSize: 16, fontWeight: '700' },
  creditsNumberSmall: { fontSize: 18, fontWeight: '900', color: '#5BC5A7' },
  deleteBtnBg: { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
  deleteBtnText: { color: '#EF4444', fontSize: 16, fontWeight: '700' },

  modalContainer: { flex: 1, padding: 24, paddingTop: 60 },
  modalTitle: { fontSize: 28, fontWeight: '900', marginBottom: 4 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  historyTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  historyAmount: { fontSize: 20, fontWeight: '900' },
  textSuccess: { color: '#10B981' },
  textError: { color: '#EF4444' },
  closeBtn: { padding: 18, borderRadius: 16, marginTop: 20 },
  closeBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' },

  referralCard: { padding: 24, borderRadius: 16, borderWidth: 1 },
  accountSectionTitle: { fontSize: 22, fontWeight: '900', marginBottom: 12 },
  hintText: { fontSize: 14, fontWeight: '600', lineHeight: 22 },
  codeBox: { padding: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginVertical: 20 },
  codeText: { fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  shareCodeBtn: { padding: 18, borderRadius: 12 },
  shareCodeBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' }
});