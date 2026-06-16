import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share, Dimensions } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import ConfettiCannon from 'react-native-confetti-cannon';
import { PulseButton } from '../components/PulseButton';
import { updateDoc, doc, increment, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../services/firebase';

export const LedgerScreen = ({ eventData, isDarkMode, onExit }) => {
  const themeStyles = isDarkMode ? darkTheme : lightTheme;
  const [showConfetti, setShowConfetti] = useState(false);

  const memberShares = useMemo(() => {
    if (!eventData.items || eventData.items.length === 0) return [];
    
    const shares = {};
    (eventData.members || []).forEach(m => {
      shares[m.id] = { id: m.id, name: m.name, foodTotal: 0, drinkTotal: 0 };
    });

    eventData.items.forEach(item => {
      const amount = item.price * item.qty;
      if (item.type === 'food') {
        const assigned = item.assignedTo || [];
        if (assigned.length > 0) {
          const split = amount / assigned.length;
          assigned.forEach(mId => { if (shares[mId]) shares[mId].foodTotal += split; });
        }
      } else {
        const counts = item.drinkCounts || {};
        const totalDrinks = Object.values(counts).reduce((a,b) => a + b, 0) || 1;
        const perDrink = amount / totalDrinks;
        Object.entries(counts).forEach(([mId, qty]) => {
          if (shares[mId]) shares[mId].drinkTotal += (qty * perDrink);
        });
      }
    });

    const taxes = eventData.taxes || {};
    const scRate = taxes.serviceChargeRate || 0;
    const cgstRate = taxes.cgstRate || 0;
    const sgstRate = taxes.sgstRate || 0;
    const vatRate = taxes.vatRate || 0;

    return Object.values(shares).map(member => {
      const foodSC = member.foodTotal * (scRate / 100);
      const drinkSC = member.drinkTotal * (scRate / 100);
      
      const cgst = (member.foodTotal + foodSC) * (cgstRate / 100);
      const sgst = (member.foodTotal + foodSC) * (sgstRate / 100);
      const vat = (member.drinkTotal + drinkSC) * (vatRate / 100);

      const rawTotal = member.foodTotal + member.drinkTotal + foodSC + drinkSC + cgst + sgst + vat;
      return { ...member, roundedTotal: Math.round(rawTotal) };
    });
  }, [eventData.items, eventData.members, eventData.taxes]);

  useEffect(() => {
    const processRefunds = async () => {
      if (eventData.refundsProcessed) return;

      const currentUserId = auth?.currentUser?.phoneNumber 
        ? `USER_${auth.currentUser.phoneNumber.replace(/\D/g, '').slice(-10)}` 
        : null;
        
      if (currentUserId !== eventData.hostId) return;

      const guestsWithZero = memberShares.filter(m => m.id !== eventData.hostId && m.roundedTotal === 0 && m.id.startsWith('USER_'));
      
      if (guestsWithZero.length > 0) {
        try {
          for (const guest of guestsWithZero) {
            await updateDoc(doc(db, 'users', guest.id), { 
              hostCredits: increment(1),
              creditHistory: arrayUnion({
                id: Date.now().toString(),
                title: 'Refund (₹0 Share)',
                amount: 1,
                date: new Date().toLocaleDateString('en-GB')
              })
            });
          }
        } catch(e) { console.error('Refund failed:', e); }
      }
      
      if (eventData.id) {
        try { await updateDoc(doc(db, 'events', eventData.id), { refundsProcessed: true }); } 
        catch(e) {}
      }
    };

    if (memberShares.length > 0) {
      processRefunds();
    }
  }, [memberShares, eventData.id, eventData.hostId, eventData.refundsProcessed]);

  const paymentStrategy = eventData.paymentStrategy || 'everyone';
  const mainPayerId = eventData.mainPayerId;
  const settlements = eventData.settlements || {};

  const ledgerStats = useMemo(() => {
    let totalBill = 0;
    let settledAmount = 0;
    const settledList = [];
    const pendingList = [];
    const payerName = eventData.members.find(m => m.id === mainPayerId)?.name || 'Someone';

    memberShares.forEach(member => {
      totalBill += member.roundedTotal;
    });

    const singlePayerShare = paymentStrategy === 'one_person' 
      ? (memberShares.find(m => m.id === mainPayerId)?.roundedTotal || 0)
      : 0;

    memberShares.forEach(member => {
      if (paymentStrategy === 'one_person' && member.id === mainPayerId) {
        return;
      }

      const settlement = settlements[member.id];
      if (settlement) {
        settledAmount += settlement.amount;
        let displayMethod = `Paid via ${settlement.method}`;
        if (settlement.method === 'OTHER') {
          const paidByObj = eventData.members.find(m => m.id === settlement.paidBy);
          displayMethod = `Paid by ${paidByObj ? paidByObj.name.split(' ')[0] : 'Someone'}`;
        }
        settledList.push({ ...member, settlement, displayMethod, amount: settlement.amount });
      } else {
        pendingList.push(member);
      }
    });

    const pendingAmount = totalBill - singlePayerShare - settledAmount;
      
    return { totalBill, settledAmount, pendingAmount: Math.max(0, pendingAmount), settledList, pendingList, payerName };
  }, [memberShares, eventData.members, settlements, mainPayerId, paymentStrategy]);

  useEffect(() => {
    if (ledgerStats.totalBill > 0 && ledgerStats.pendingAmount === 0) {
      setShowConfetti(true);
    } else {
      setShowConfetti(false);
    }
  }, [ledgerStats.pendingAmount, ledgerStats.totalBill]);

  const handleWhatsAppLedger = async () => {
    try {
      let report = `*DemiTab Ledger : ${eventData.eventName}*\n\n`;
      report += `📅 Date: ${eventData.eventDate}\n`;
      report += `💰 Grand Total: ₹${ledgerStats.totalBill}\n\n`;

      if (ledgerStats.pendingList.length > 0) {
        report += `⏳ *PENDING PAYMENTS*\n`;
        ledgerStats.pendingList.forEach(m => {
          const owesName = paymentStrategy === 'one_person' ? ledgerStats.payerName.split(' ')[0] : 'Restaurant';
          report += `- ${m.name} owes ₹${m.roundedTotal} (to ${owesName})\n`;
        });
        report += `\n🚨 *Kindly Clear the Bill ASAP*\n\n`;
      }

      if (ledgerStats.settledList.length > 0) {
        report += `✅ *SETTLED*\n`;
        ledgerStats.settledList.forEach(m => {
          report += `- ${m.name} paid ₹${m.amount} (${m.displayMethod})\n`;
        });
        report += `\n`;
      }

      report += `_Generated by DemiTab_`;

      await Share.share({ message: report, title: `${eventData.eventName} Ledger` });
    } catch (error) { Alert.alert('Error', 'Failed to share report.'); }
  };

  const handleExportCSV = async () => {
    try {
      let csvContent = 'Name,Status,Amount,Payment Method,Owes Who\n';
      const owesName = paymentStrategy === 'one_person' ? ledgerStats.payerName : 'Restaurant';

      ledgerStats.pendingList.forEach(m => csvContent += `${m.name},Pending,${m.roundedTotal},N/A,${owesName}\n`);
      ledgerStats.settledList.forEach(m => csvContent += `${m.name},Settled,${m.amount},${m.displayMethod},N/A\n`);

      const safeEventName = (eventData.eventName || 'Event').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${safeEventName}_Ledger.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;
      
      await FileSystem.writeAsStringAsync(fileUri, csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Ledger CSV', UTI: 'public.comma-separated-values' });
      } else { Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device.'); }
    } catch (error) { Alert.alert('Error Generating CSV', error.message || 'An unknown error occurred.'); }
  };

  const handleExportPDF = async () => {
    try {
      const owesName = paymentStrategy === 'one_person' ? ledgerStats.payerName : 'Restaurant';
      let htmlContent = `
       <html>
         <head>
           <style>
             body { font-family: Helvetica, sans-serif; padding: 20px; color: #111827; }
             h1 { text-align: center; color: #111827; margin-bottom: 5px; }
             .header-sub { text-align: center; color: #6B7280; margin-top: 0; margin-bottom: 30px; }
             h2 { color: #374151; margin-top: 30px; border-bottom: 2px solid #E5E7EB; padding-bottom: 5px; font-size: 18px; }
             .summary { background: #F3F4F6; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 30px; }
             .total { font-size: 32px; font-weight: bold; margin: 10px 0; color: #111827; }
             table { width: 100%; border-collapse: collapse; margin-top: 10px; }
             th, td { text-align: left; padding: 12px; border-bottom: 1px solid #E5E7EB; }
             th { background: #F9FAFB; font-weight: bold; color: #374151; }
             .pending { color: #EF4444; font-weight: bold; }
             .settled { color: #10B981; font-weight: bold; }
           </style>
         </head>
         <body>
           <h1>DemiTab Ledger</h1>
           <p class="header-sub">Event: ${eventData.eventName} &nbsp;|&nbsp; Date: ${eventData.eventDate}</p>
           <div class="summary">
             <p style="text-transform: uppercase; font-size: 12px; color: #6B7280; margin: 0;">Grand Total</p>
             <div class="total">₹${ledgerStats.totalBill}</div>
             <p style="margin: 0; color: #374151;">${paymentStrategy === 'one_person' ? `${ledgerStats.payerName} paid the entire bill` : `Everyone pays directly`}</p>
           </div>
      `;

      if (ledgerStats.pendingList.length > 0) {
        htmlContent += `
           <h2>Pending Payments ⏳</h2>
           <table>
             <tr><th>Name</th><th>Owes</th><th>Amount</th></tr>
             ${ledgerStats.pendingList.map(m => `<tr><td>${m.name}</td><td>${owesName}</td><td class="pending">₹${m.roundedTotal}</td></tr>`).join('')}
           </table>
        `;
      }

      if (ledgerStats.settledList.length > 0) {
        htmlContent += `
           <h2>Settled Payments ✅</h2>
           <table>
             <tr><th>Name</th><th>Payment Method</th><th>Amount</th></tr>
             ${ledgerStats.settledList.map(m => `<tr><td>${m.name}</td><td>${m.displayMethod}</td><td class="settled">₹${m.amount}</td></tr>`).join('')}
           </table>
        `;
      }

      htmlContent += `
           <p style="text-align: center; margin-top: 40px; color: #9CA3AF; font-size: 12px;">Generated securely by DemiTab</p>
         </body>
       </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Export Ledger PDF' });
      } else { Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device.'); }
    } catch (error) { Alert.alert('Error', 'Failed to generate PDF document.'); }
  };

  return (
    <View style={[styles.container, themeStyles.background]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={[styles.summaryCard, themeStyles.card]}>
          <Text style={[styles.strategyText, themeStyles.subText, { textAlign: 'center' }]}>
            {paymentStrategy === 'one_person' ? `💳 ${ledgerStats.payerName} paid the entire bill` : `🧾 Everyone pays directly`}
          </Text>
          <Text style={[styles.grandTotal, themeStyles.text]}>₹{ledgerStats.totalBill}</Text>
          <Text style={[styles.grandTotalLabel, themeStyles.subText]}>Grand Total</Text>

          <View style={styles.progressRow}>
            <View style={styles.progressBox}>
              <Text style={styles.progressLabel}>Settled</Text>
              <Text style={[styles.progressAmount, styles.textSuccess]}>₹{ledgerStats.settledAmount}</Text>
            </View>
            <View style={styles.progressBox}>
              <Text style={styles.progressLabel}>Remaining</Text>
              <Text style={[styles.progressAmount, ledgerStats.pendingAmount > 0 ? styles.textError : styles.textSuccess]}>₹{ledgerStats.pendingAmount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.exportBtnWhatsapp} onPress={handleWhatsAppLedger}>
              <Text style={styles.exportBtnText}>💬 WhatsApp Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.exportBtnCsv, themeStyles.input]} onPress={handleExportCSV}>
              <Text style={[styles.exportBtnTextCsv, themeStyles.text]}>📊 Export CSV</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.exportBtnPdf, themeStyles.input]} onPress={handleExportPDF}>
            <Text style={[styles.exportBtnTextCsv, themeStyles.text]}>📄 Export as PDF Document</Text>
          </TouchableOpacity>
        </View>

        {ledgerStats.pendingList.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, themeStyles.text]}>Waiting on Payment ⏳</Text>
            {ledgerStats.pendingList.map(member => (
              <View key={member.id} style={[styles.paymentRow, themeStyles.card]}>
                <View>
                  <Text style={[styles.memberName, themeStyles.text]}>{member.name}</Text>
                  <Text style={themeStyles.subText}>Owes {paymentStrategy === 'one_person' ? ledgerStats.payerName.split(' ')[0] : 'Restaurant'}</Text>
                </View>
                <Text style={[styles.pendingAmount, styles.textError]}>₹{member.roundedTotal}</Text>
              </View>
            ))}
          </View>
        )}

        {ledgerStats.settledList.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, themeStyles.text]}>Settled ✅</Text>
            {ledgerStats.settledList.map(member => (
              <View key={member.id} style={[styles.paymentRow, themeStyles.card]}>
                <View>
                  <Text style={[styles.memberName, themeStyles.text]}>{member.name}</Text>
                  <Text style={[styles.settledMethod, themeStyles.subText]}>{member.displayMethod}</Text>
                </View>
                <Text style={[styles.settledAmount, styles.textSuccess]}>₹{member.amount}</Text>
              </View>
            ))}
          </View>
        )}

        {ledgerStats.pendingAmount === 0 && ledgerStats.totalBill > 0 && (
          <View style={styles.allClearedBox}>
            <Text style={styles.allClearedText}>🎉 All dues are cleared!</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <PulseButton onPress={onExit} style={[styles.dashboardBtn, themeStyles.primaryBtn]}>
          <Text style={[styles.dashboardBtnText, themeStyles.primaryBtnText]}>Save Event & Go Home</Text>
        </PulseButton>
      </View>

      {showConfetti && (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <ConfettiCannon count={200} origin={{x: Dimensions.get('window').width / 2, y: -20}} fadeOut={true} fallSpeed={3000} />
        </View>
      )}
    </View>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, input: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }, primaryBtn: { backgroundColor: '#111827' }, primaryBtnText: { color: '#ffffff' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, input: { backgroundColor: '#374151', borderColor: '#4B5563' }, primaryBtn: { backgroundColor: '#5BC5A7' }, primaryBtnText: { color: '#111827' } };

const styles = StyleSheet.create({ 
  container: { flex: 1 }, 
  scrollContent: { padding: 20, paddingBottom: 100 }, 
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }, 
  emptyEmoji: { fontSize: 64, marginBottom: 20 }, 
  emptyTitle: { fontSize: 24, fontWeight: '900', marginBottom: 10 }, 
  emptySub: { fontSize: 16, textAlign: 'center', lineHeight: 24 }, 
  summaryCard: { padding: 24, borderRadius: 20, borderWidth: 1, alignItems: 'center', marginBottom: 20 }, 
  strategyText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }, 
  grandTotal: { fontSize: 48, fontWeight: '900' }, 
  grandTotalLabel: { fontSize: 16, fontWeight: '600', marginBottom: 20 }, 
  progressRow: { flexDirection: 'row', width: '100%', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 20 }, 
  progressBox: { flex: 1, alignItems: 'center' }, 
  progressLabel: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 }, 
  progressAmount: { fontSize: 20, fontWeight: '900' }, 
  textSuccess: { color: '#10B981' }, 
  textError: { color: '#EF4444' }, 
  actionsContainer: { marginBottom: 30, gap: 12 }, 
  actionRow: { flexDirection: 'row', gap: 12 }, 
  exportBtnWhatsapp: { flex: 1, backgroundColor: '#25D366', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }, 
  exportBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 }, 
  exportBtnCsv: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 }, 
  exportBtnTextCsv: { fontWeight: '800', fontSize: 14 }, 
  exportBtnPdf: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 }, 
  section: { marginBottom: 24 }, 
  sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 12 }, 
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 8 }, 
  memberName: { fontSize: 16, fontWeight: '800', marginBottom: 4 }, 
  pendingAmount: { fontSize: 18, fontWeight: '900' }, 
  settledAmount: { fontSize: 18, fontWeight: '900' }, 
  settledMethod: { fontSize: 12, fontWeight: '700' }, 
  allClearedBox: { backgroundColor: '#ECFDF5', padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#10B981', marginTop: 10 }, 
  allClearedText: { color: '#047857', fontSize: 18, fontWeight: '900' }, 
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'transparent' }, 
  dashboardBtn: { backgroundColor: '#111827', padding: 18, borderRadius: 16 }, 
  dashboardBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' }
});