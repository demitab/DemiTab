import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PulseButton } from '../components/PulseButton';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

export const SummaryScreen = ({ eventData, isDarkMode, onFinish }) => {
  const [cgst, setCgst] = useState(eventData.taxes?.cgstRate > 0 ? eventData.taxes.cgstRate.toString() : '');
  const [sgst, setSgst] = useState(eventData.taxes?.sgstRate > 0 ? eventData.taxes.sgstRate.toString() : '');
  const [vat, setVat] = useState(eventData.taxes?.vatRate > 0 ? eventData.taxes.vatRate.toString() : '');
  const [serviceCharge, setServiceCharge] = useState(eventData.taxes?.serviceChargeRate > 0 ? eventData.taxes.serviceChargeRate.toString() : '');
  const [discount, setDiscount] = useState(eventData.taxes?.discountAmt > 0 ? eventData.taxes.discountAmt.toString() : '');
  const [actualTotal, setActualTotal] = useState(eventData.actualTotal > 0 ? eventData.actualTotal.toString() : '');

  const insets = useSafeAreaInsets();
  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  const { foodSubtotal, drinkSubtotal, itemsTotal } = useMemo(() => {
    let fTotal = 0;
    let dTotal = 0;
    (eventData.items || []).forEach(item => {
      const amount = item.price * item.qty;
      const itemType = item.type ? item.type.toLowerCase() : 'uncategorized';
      if (itemType === 'drink' || itemType === 'drinks') dTotal += amount;
      else fTotal += amount;
    });
    return { foodSubtotal: fTotal, drinkSubtotal: dTotal, itemsTotal: fTotal + dTotal };
  }, [eventData.items]);

  const taxMath = useMemo(() => {
    const cgstRate = parseFloat(cgst) || 0;
    const sgstRate = parseFloat(sgst) || 0;
    const vatRate = parseFloat(vat) || 0;
    const scRate = parseFloat(serviceCharge) || 0;
    const discountAmt = parseFloat(discount) || 0;

    let effectiveFoodSubtotal = Math.max(0, foodSubtotal - discountAmt);
    let remainingDiscount = Math.max(0, discountAmt - foodSubtotal);
    let effectiveDrinkSubtotal = Math.max(0, drinkSubtotal - remainingDiscount);

    const foodSC = effectiveFoodSubtotal * (scRate / 100);
    const drinkSC = effectiveDrinkSubtotal * (scRate / 100);
    const totalSC = foodSC + drinkSC;

    const calcCgst = (effectiveFoodSubtotal + foodSC) * (cgstRate / 100);
    const calcSgst = (effectiveFoodSubtotal + foodSC) * (sgstRate / 100);
    const calcVat = (effectiveDrinkSubtotal + drinkSC) * (vatRate / 100);

    const rawTotal = effectiveFoodSubtotal + effectiveDrinkSubtotal + totalSC + calcCgst + calcSgst + calcVat;
    const roundedTotal = Math.round(rawTotal);

    return { discountAmt, serviceChargeAmt: totalSC, cgstAmt: calcCgst, sgstAmt: calcSgst, vatAmt: calcVat, roundedTotal, effectiveFoodSubtotal, effectiveDrinkSubtotal };
  }, [foodSubtotal, drinkSubtotal, cgst, sgst, vat, serviceCharge, discount]);

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
            cgstRate: parseFloat(cgst) || 0,
            sgstRate: parseFloat(sgst) || 0,
            vatRate: parseFloat(vat) || 0,
            serviceChargeRate: parseFloat(serviceCharge) || 0,
            discountAmt: parseFloat(discount) || 0,
            serviceChargeAmt: taxMath.serviceChargeAmt,
            cgstAmt: taxMath.cgstAmt,
            sgstAmt: taxMath.sgstAmt,
            vatAmt: taxMath.vatAmt
          },
          actualTotal: actualParsed,
          calculatedTotal: taxMath.roundedTotal
        });
      } catch (e) { console.log("Failed to sync taxes live:", e); }
    }, 1000);
    return () => clearTimeout(pushTaxes);
  }, [cgst, sgst, vat, serviceCharge, discount, actualTotal, taxMath, eventData.id]);

  let statusMessage = '';
  if (actualParsed > 0) {
    if (difference === 0) statusMessage = '✅ Bill Matches Perfectly!';
    else if (difference === 1) statusMessage = '✅ Matches! (₹1 difference due to rounding)';
    else statusMessage = `❌ Mismatch by ₹${difference}`;
  }

  const handleNext = async () => {
    if (actualParsed === 0) return Alert.alert('Missing Total', 'Please enter the actual total from the receipt to verify the math.');
    if (!isMatch) return Alert.alert('Totals Do Not Match', `Your entered total is ₹${actualRounded}, but the calculated total is ₹${taxMath.roundedTotal}. Please fix any errors before continuing.`);

    try { await logEvent(getAnalytics(), 'math_verified', { total_amount: actualParsed }); } catch (e) { }

    onFinish({
      cgstRate: parseFloat(cgst) || 0,
      sgstRate: parseFloat(sgst) || 0,
      vatRate: parseFloat(vat) || 0,
      serviceChargeRate: parseFloat(serviceCharge) || 0,
      discountAmt: parseFloat(discount) || 0,
      serviceChargeAmt: taxMath.serviceChargeAmt,
      cgstAmt: taxMath.cgstAmt,
      sgstAmt: taxMath.sgstAmt,
      vatAmt: taxMath.vatAmt,
      actualTotal: actualParsed,
      calculatedTotal: taxMath.roundedTotal
    });
  };

  const allReceipts = eventData.receiptUrls || (eventData.receiptUrl ? [eventData.receiptUrl] : []);

  return (
    <KeyboardAvoidingView style={[styles.container, themeStyles.background]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        keyboardShouldPersistTaps="handled" 
        showsVerticalScrollIndicator={false}
      >
        
        <Text style={[styles.title, themeStyles.text]}>Bill Summary</Text>
        <Text style={themeStyles.subText}>Enter tax parameters to verify the grand total.</Text>

        {allReceipts.length > 0 ? (
          <View style={styles.receiptsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 10 }}>
              {allReceipts.map((url, index) => (
                <TouchableOpacity key={index} style={[styles.receiptBtn, themeStyles.receiptBtnBg]} onPress={() => Linking.openURL(url)}>
                  <Text style={[styles.receiptBtnText, themeStyles.receiptBtnText]}>🧾 View Bill {index + 1}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={[styles.card, themeStyles.card]}>
          <Text style={[styles.sectionTitle, themeStyles.text]}>Items Subtotal</Text>
          <View style={styles.row}>
            <Text style={[styles.label, themeStyles.text]}>🍲 Food</Text>
            <Text style={[styles.value, themeStyles.text]}>₹{foodSubtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, themeStyles.text]}>🍺 Drink</Text>
            <Text style={[styles.value, themeStyles.text]}>₹{drinkSubtotal.toFixed(2)}</Text>
          </View>
          <View style={[styles.divider, themeStyles.divider]} />
          <View style={styles.row}>
            <Text style={[styles.boldLabel, themeStyles.text]}>Total Items</Text>
            <Text style={[styles.boldValue, themeStyles.text]}>₹{itemsTotal.toFixed(2)}</Text>
          </View>
        </View>

        <View style={[styles.card, themeStyles.card]}>
          <Text style={[styles.sectionTitle, themeStyles.text]}>Taxes & Charges</Text>
          
          <View style={styles.taxRow}>
            <Text style={[styles.taxLabel, themeStyles.text]}>CGST</Text>
            <Text style={[styles.calcSubtext, themeStyles.subText]}>₹{taxMath.cgstAmt.toFixed(2)}</Text>
            <View style={[styles.inputContainer, themeStyles.inputBorder]}>
              <TextInput style={[styles.input, themeStyles.inputText]} placeholder="0" placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} keyboardType="numeric" value={cgst} onChangeText={setCgst} />
              <Text style={styles.percentSign}>%</Text>
            </View>
          </View>

          <View style={styles.taxRow}>
            <Text style={[styles.taxLabel, themeStyles.text]}>SGST</Text>
            <Text style={[styles.calcSubtext, themeStyles.subText]}>₹{taxMath.sgstAmt.toFixed(2)}</Text>
            <View style={[styles.inputContainer, themeStyles.inputBorder]}>
              <TextInput style={[styles.input, themeStyles.inputText]} placeholder="0" placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} keyboardType="numeric" value={sgst} onChangeText={setSgst} />
              <Text style={styles.percentSign}>%</Text>
            </View>
          </View>

          <View style={styles.taxRow}>
            <Text style={[styles.taxLabel, themeStyles.text]}>VAT</Text>
            <Text style={[styles.calcSubtext, themeStyles.subText]}>₹{taxMath.vatAmt.toFixed(2)}</Text>
            <View style={[styles.inputContainer, themeStyles.inputBorder]}>
              <TextInput style={[styles.input, themeStyles.inputText]} placeholder="0" placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} keyboardType="numeric" value={vat} onChangeText={setVat} />
              <Text style={styles.percentSign}>%</Text>
            </View>
          </View>

          <View style={styles.taxRow}>
            <Text style={[styles.taxLabel, themeStyles.text]}>Service Charge</Text>
            <Text style={[styles.calcSubtext, themeStyles.subText]}>₹{taxMath.serviceChargeAmt.toFixed(2)}</Text>
            <View style={[styles.inputContainer, themeStyles.inputBorder]}>
              <TextInput style={[styles.input, themeStyles.inputText]} placeholder="0" placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} keyboardType="numeric" value={serviceCharge} onChangeText={setServiceCharge} />
              <Text style={styles.percentSign}>%</Text>
            </View>
          </View>

          <View style={[styles.divider, themeStyles.divider, {marginVertical: 12}]} />

          <View style={styles.taxRow}>
            <Text style={[styles.taxLabel, themeStyles.text]}>Discount</Text>
            <Text style={[styles.calcSubtext, themeStyles.subText, {color: '#10B981'}]}>- ₹{taxMath.discountAmt.toFixed(2)}</Text>
            <View style={[styles.inputContainer, themeStyles.inputBorder]}>
              <Text style={styles.percentSign}>₹</Text>
              <TextInput style={[styles.input, themeStyles.inputText, {textAlign: 'left', marginLeft: 4}]} placeholder="0" placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} keyboardType="numeric" value={discount} onChangeText={setDiscount} />
            </View>
          </View>
        </View>

        <View style={[styles.validationCard, isMatch ? styles.validationSuccess : (actualParsed > 0 ? styles.validationError : themeStyles.card)]}>
          <Text style={[styles.validationTitle, isMatch ? styles.textSuccess : (actualParsed > 0 ? styles.textError : themeStyles.text)]}>
            Verify Grand Total matches actual Bill Amount.
          </Text>
          <View style={styles.totalCompareRow}>
            <View style={[styles.totalBox, themeStyles.inputBorder]}>
              <Text style={[styles.totalBoxLabel, themeStyles.subText]}>Calculated</Text>
              <Text style={[styles.totalBoxValue, themeStyles.text]}>₹{taxMath.roundedTotal}</Text>
            </View>
            <Text style={styles.vsText}>VS</Text>
            <View style={[styles.totalBox, themeStyles.inputBorder]}>
              <Text style={[styles.totalBoxLabel, themeStyles.subText]}>Actual Receipt</Text>
              <TextInput style={[styles.actualInput, themeStyles.text]} placeholder="0" placeholderTextColor={isDarkMode ? "#9CA3AF" : "#6B7280"} keyboardType="numeric" value={actualTotal} onChangeText={setActualTotal} />
            </View>
          </View>
          {actualParsed > 0 ? <Text style={[styles.statusMessage, isMatch ? styles.textSuccess : styles.textError]}>{statusMessage}</Text> : null}
        </View>

      </ScrollView>
      
      <View style={[styles.footer, themeStyles.background, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <PulseButton onPress={handleNext} style={[styles.finishBtn, !isMatch && actualParsed > 0 ? {backgroundColor: '#9CA3AF'} : {}]}>
          <Text style={styles.finishBtnText}>Calculate Individual Shares</Text>
        </PulseButton>
      </View>
    </KeyboardAvoidingView>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280', textAlign: 'center', marginBottom: 16 }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, divider: { backgroundColor: '#F3F4F6' }, inputBorder: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }, inputText: { color: '#111827' }, receiptBtnBg: { backgroundColor: 'rgba(91, 197, 167, 0.15)', borderColor: 'rgba(91, 197, 167, 0.3)' }, receiptBtnText: { color: '#5BC5A7' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF', textAlign: 'center', marginBottom: 16 }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, divider: { backgroundColor: '#374151' }, inputBorder: { backgroundColor: '#374151', borderColor: '#4B5563' }, inputText: { color: '#F9FAFB' }, receiptBtnBg: { backgroundColor: '#1F2937', borderColor: '#5BC5A7' }, receiptBtnText: { color: '#5BC5A7' } };

const styles = StyleSheet.create({
  container: { flex: 1 },
  // THE KEYBOARD FIX: Padding bottom of 350 ensures the scroll view has massive empty space at the bottom.
  // When Android resizes the screen, you can scroll the inputs completely clear of the "Validate" button.
  scrollContent: { padding: 16, paddingBottom: 350 }, 
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
  receiptsContainer: { marginBottom: 16, width: '100%' },
  receiptBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, marginRight: 10 },
  receiptBtnText: { fontWeight: '800', fontSize: 13 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 15, fontWeight: '500' },
  value: { fontSize: 15, fontWeight: '700' },
  divider: { height: 1, marginVertical: 6 },
  boldLabel: { fontSize: 16, fontWeight: '800' },
  boldValue: { fontSize: 16, fontWeight: '900' },
  
  // ALIGNMENT FIX & TEXT RESTORATION
  taxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, height: 46 },
  taxLabel: { flex: 2, fontSize: 14, fontWeight: '700', includeFontPadding: false, textAlignVertical: 'center' },
  calcSubtext: { flex: 1.5, fontSize: 14, fontWeight: '800', textAlign: 'center', margin: 0, padding: 0, includeFontPadding: false, textAlignVertical: 'center' },
  inputContainer: { flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, height: 40 },
  percentSign: { fontSize: 16, fontWeight: '800', color: '#9CA3AF' },
  input: { flex: 1, fontSize: 16, textAlign: 'right', fontWeight: '800', height: '100%', padding: 0, margin: 0, includeFontPadding: false }, 
  
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
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  finishBtn: { backgroundColor: '#5BC5A7', padding: 16, borderRadius: 16 },
  finishBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' }
});