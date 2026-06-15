import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PulseButton } from '../components/PulseButton';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

export const SummaryScreen = ({ eventData, isDarkMode, onFinish }) => {
  const [serviceCharge, setServiceCharge] = useState(eventData.taxes?.serviceChargeRate > 0 ? eventData.taxes.serviceChargeRate.toString() : '');
  const [cgst, setCgst] = useState(eventData.taxes?.cgstRate > 0 ? eventData.taxes.cgstRate.toString() : '');
  const [sgst, setSgst] = useState(eventData.taxes?.sgstRate > 0 ? eventData.taxes.sgstRate.toString() : '');
  const [vat, setVat] = useState(eventData.taxes?.vatRate > 0 ? eventData.taxes.vatRate.toString() : '');
  const [actualTotal, setActualTotal] = useState(eventData.actualTotal > 0 ? eventData.actualTotal.toString() : '');

  const insets = useSafeAreaInsets();
  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  const { foodSubtotal, drinkSubtotal, itemsTotal } = useMemo(() => {
    let fTotal = 0;
    let dTotal = 0;
    (eventData.items || []).forEach(item => {
      const amount = item.price * item.qty;
      if (item.type === 'food') fTotal += amount;
      if (item.type === 'drink') dTotal += amount;
    });
    return { foodSubtotal: fTotal, drinkSubtotal: dTotal, itemsTotal: fTotal + dTotal };
  }, [eventData.items]);

  const taxMath = useMemo(() => {
    const scRate = parseFloat(serviceCharge) || 0;
    const cgstRate = parseFloat(cgst) || 0;
    const sgstRate = parseFloat(sgst) || 0;
    const vatRate = parseFloat(vat) || 0;

    const foodSC = foodSubtotal * (scRate / 100);
    const drinkSC = drinkSubtotal * (scRate / 100);
    const totalSC = foodSC + drinkSC;

    const calcCgst = (foodSubtotal + foodSC) * (cgstRate / 100);
    const calcSgst = (foodSubtotal + foodSC) * (sgstRate / 100);
    const calcVat = (drinkSubtotal + drinkSC) * (vatRate / 100);

    const rawTotal = itemsTotal + totalSC + calcCgst + calcSgst + calcVat;
    const roundedTotal = Math.round(rawTotal);

    return { serviceChargeAmt: totalSC, cgstAmt: calcCgst, sgstAmt: calcSgst, vatAmt: calcVat, roundedTotal };
  }, [foodSubtotal, drinkSubtotal, itemsTotal, serviceCharge, cgst, sgst, vat]);

  const actualParsed = parseFloat(actualTotal) || 0;
  const actualRounded = Math.round(actualParsed); 
  const difference = Math.abs(taxMath.roundedTotal - actualRounded);
  const isMatch = actualParsed > 0 && difference <= 1; 

  useEffect(() => {
    if (!eventData.id) return;
    const pushTaxes = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'events', eventData.id), {
          taxes: {
            serviceChargeRate: parseFloat(serviceCharge) || 0,
            cgstRate: parseFloat(cgst) || 0,
            sgstRate: parseFloat(sgst) || 0,
            vatRate: parseFloat(vat) || 0,
            serviceChargeAmt: taxMath.serviceChargeAmt,
            cgstAmt: taxMath.cgstAmt,
            sgstAmt: taxMath.sgstAmt,
            vatAmt: taxMath.vatAmt
          },
          actualTotal: actualParsed,
          calculatedTotal: taxMath.roundedTotal
        });
      } catch (e) { 
        console.log("Failed to sync taxes live:", e); 
      }
    }, 1000);
    
    return () => clearTimeout(pushTaxes);
  }, [serviceCharge, cgst, sgst, vat, actualTotal, taxMath, eventData.id]);

  let statusMessage = '';
  if (actualParsed > 0) {
    if (difference === 0) statusMessage = '✅ Bill Matches Perfectly!';
    else if (difference === 1) statusMessage = '✅ Matches! (₹1 difference due to rounding)';
    else statusMessage = `❌ Mismatch by ₹${difference}`;
  }

  const handleNext = async () => {
    if (actualParsed === 0) {
      return Alert.alert('Missing Total', 'Please enter the actual total from the receipt to verify the math.');
    }
    if (!isMatch) {
      return Alert.alert(
        'Totals Do Not Match', 
        `Your entered total is ₹${actualRounded}, but the calculated total is ₹${taxMath.roundedTotal}. Please fix any errors before continuing.`
      );
    }

    try {
      await logEvent(getAnalytics(), 'math_verified', { total_amount: actualParsed });
    } catch (e) { console.log('Analytics Error', e); }

    onFinish({
      serviceChargeRate: parseFloat(serviceCharge) || 0,
      cgstRate: parseFloat(cgst) || 0,
      sgstRate: parseFloat(sgst) || 0,
      vatRate: parseFloat(vat) || 0,
      serviceChargeAmt: taxMath.serviceChargeAmt,
      cgstAmt: taxMath.cgstAmt,
      sgstAmt: taxMath.sgstAmt,
      vatAmt: taxMath.vatAmt,
      actualTotal: actualParsed,
      calculatedTotal: taxMath.roundedTotal
    });
  };

  return (
    <KeyboardAvoidingView style={[styles.container, themeStyles.background]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        <Text style={[styles.title, themeStyles.text]}>Bill Summary</Text>
        <Text style={themeStyles.subText}>Enter tax percentages to verify the grand total.</Text>

        <View style={[styles.card, themeStyles.card]}>
          <Text style={[styles.sectionTitle, themeStyles.text]}>Items Subtotal</Text>
          <View style={styles.row}>
            <Text style={[styles.label, themeStyles.text]}>🍲 Food Subtotal</Text>
            <Text style={[styles.value, themeStyles.text]}>₹{foodSubtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, themeStyles.text]}>🍺 Drink Subtotal</Text>
            <Text style={[styles.value, themeStyles.text]}>₹{drinkSubtotal.toFixed(2)}</Text>
          </View>
          <View style={[styles.divider, themeStyles.divider]} />
          <View style={styles.row}>
            <Text style={[styles.boldLabel, themeStyles.text]}>Total Items</Text>
            <Text style={[styles.boldValue, themeStyles.text]}>₹{itemsTotal.toFixed(2)}</Text>
          </View>
        </View>

        <View style={[styles.card, themeStyles.card]}>
          <Text style={[styles.sectionTitle, themeStyles.text]}>Taxes & Charges (%)</Text>
          
          <View style={styles.inputRow}>
            <View style={styles.inputLabelContainer}>
              <Text style={[styles.inputLabel, themeStyles.text]}>Service Charge</Text>
              <Text style={[styles.calcSubtext, themeStyles.subText]}>₹{taxMath.serviceChargeAmt.toFixed(2)}</Text>
            </View>
            <View style={[styles.inputContainer, themeStyles.inputBorder]}>
              <TextInput style={[styles.input, themeStyles.inputText]} placeholder="0" placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} keyboardType="numeric" value={serviceCharge} onChangeText={setServiceCharge} />
              <Text style={styles.percentSign}>%</Text>
            </View>
          </View>
          
          <View style={styles.inputRow}>
            <View style={styles.inputLabelContainer}>
              <Text style={[styles.inputLabel, themeStyles.text]}>CGST (Food)</Text>
              <Text style={[styles.calcSubtext, themeStyles.subText]}>₹{taxMath.cgstAmt.toFixed(2)}</Text>
            </View>
            <View style={[styles.inputContainer, themeStyles.inputBorder]}>
              <TextInput style={[styles.input, themeStyles.inputText]} placeholder="0" placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} keyboardType="numeric" value={cgst} onChangeText={setCgst} />
              <Text style={styles.percentSign}>%</Text>
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputLabelContainer}>
              <Text style={[styles.inputLabel, themeStyles.text]}>SGST (Food)</Text>
              <Text style={[styles.calcSubtext, themeStyles.subText]}>₹{taxMath.sgstAmt.toFixed(2)}</Text>
            </View>
            <View style={[styles.inputContainer, themeStyles.inputBorder]}>
              <TextInput style={[styles.input, themeStyles.inputText]} placeholder="0" placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} keyboardType="numeric" value={sgst} onChangeText={setSgst} />
              <Text style={styles.percentSign}>%</Text>
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputLabelContainer}>
              <Text style={[styles.inputLabel, themeStyles.text]}>VAT (Liquor)</Text>
              <Text style={[styles.calcSubtext, themeStyles.subText]}>₹{taxMath.vatAmt.toFixed(2)}</Text>
            </View>
            <View style={[styles.inputContainer, themeStyles.inputBorder]}>
              <TextInput style={[styles.input, themeStyles.inputText]} placeholder="0" placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} keyboardType="numeric" value={vat} onChangeText={setVat} />
              <Text style={styles.percentSign}>%</Text>
            </View>
          </View>
        </View>

        <View style={[styles.validationCard, isMatch ? styles.validationSuccess : (actualParsed > 0 ? styles.validationError : themeStyles.card)]}>
          <Text style={[styles.validationTitle, isMatch ? styles.textSuccess : (actualParsed > 0 ? styles.textError : themeStyles.text)]}>
            Please check that the Grand Total matches your Actual Bill Amount.
          </Text>
          <View style={styles.totalCompareRow}>
            <View style={[styles.totalBox, themeStyles.inputBorder]}>
              <Text style={[styles.totalBoxLabel, themeStyles.subText]}>Calculated</Text>
              <Text style={[styles.totalBoxValue, themeStyles.text]}>₹{taxMath.roundedTotal}</Text>
            </View>
            <Text style={styles.vsText}>VS</Text>
            <View style={[styles.totalBox, themeStyles.inputBorder]}>
              <Text style={[styles.totalBoxLabel, themeStyles.subText]}>Actual Receipt</Text>
              <TextInput 
                style={[styles.actualInput, themeStyles.text]} 
                placeholder="0" 
                placeholderTextColor={isDarkMode ? "#9CA3AF" : "#6B7280"} 
                keyboardType="numeric" 
                value={actualTotal} 
                onChangeText={setActualTotal} 
              />
            </View>
          </View>
          {actualParsed > 0 ? <Text style={[styles.statusMessage, isMatch ? styles.textSuccess : styles.textError]}>{statusMessage}</Text> : null}
        </View>

      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <PulseButton onPress={handleNext} style={[styles.finishBtn, !isMatch && actualParsed > 0 ? {backgroundColor: '#9CA3AF'} : {}]}>
          <Text style={styles.finishBtnText}>Calculate Individual Shares</Text>
        </PulseButton>
      </View>
    </KeyboardAvoidingView>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280', textAlign: 'center', marginBottom: 16 }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, divider: { backgroundColor: '#F3F4F6' }, inputBorder: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }, inputText: { color: '#111827' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF', textAlign: 'center', marginBottom: 16 }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, divider: { backgroundColor: '#374151' }, inputBorder: { backgroundColor: '#374151', borderColor: '#4B5563' }, inputText: { color: '#F9FAFB' } };

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 190 },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
  card: { padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 15, fontWeight: '500' },
  value: { fontSize: 15, fontWeight: '700' },
  divider: { height: 1, marginVertical: 6 },
  boldLabel: { fontSize: 16, fontWeight: '800' },
  boldValue: { fontSize: 16, fontWeight: '900' },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }, 
  inputLabelContainer: { flex: 1, paddingRight: 10 },
  inputLabel: { fontSize: 14, fontWeight: '700' },
  calcSubtext: { fontSize: 12, fontWeight: '600', textAlign: 'left', marginTop: 2, marginBottom: 0 },
  inputContainer: { flex: 0.4, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8 },
  percentSign: { fontSize: 16, fontWeight: '800', color: '#9CA3AF', marginLeft: 4 },
  input: { flex: 1, paddingVertical: 4, fontSize: 16, textAlign: 'right', fontWeight: '800' }, 
  validationCard: { padding: 16, borderRadius: 16, borderWidth: 2, marginBottom: 16 },
  validationSuccess: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  validationError: { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
  validationTitle: { fontSize: 13, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  textSuccess: { color: '#047857' },
  textError: { color: '#B91C1C' },
  totalCompareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalBox: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1 },
  totalBoxLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  totalBoxValue: { fontSize: 24, fontWeight: '900' },
  vsText: { fontSize: 14, fontWeight: '900', color: '#9CA3AF', marginHorizontal: 8 },
  actualInput: { fontSize: 24, fontWeight: '900', textAlign: 'center', width: '100%', padding: 0 },
  statusMessage: { textAlign: 'center', marginTop: 12, fontSize: 14, fontWeight: '900' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 16, backgroundColor: 'transparent' },
  finishBtn: { backgroundColor: '#5BC5A7', padding: 16, borderRadius: 16 },
  finishBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' }
});