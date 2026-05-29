import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share } from 'react-native';
// THE FIX: Pointing to the legacy API path as required by the new Expo SDK
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { PulseButton } from '../components/PulseButton';

export const LedgerScreen = ({ eventData, isDarkMode, onExit }) => {
  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  if (!eventData.ledgerData) {
    return (
      <View style={[styles.emptyContainer, themeStyles.background]}>
        <Text style={[styles.emptyEmoji]}>📊</Text>
        <Text style={[styles.emptyTitle, themeStyles.text]}>Ledger not ready yet</Text>
        <Text style={[styles.emptySub, themeStyles.subText]}>
          Please finish validating the Summary and calculating individual shares.
        </Text>
      </View>
    );
  }

  const { paymentStrategy, mainPayerId, memberShares } = eventData.ledgerData;
  const settlements = eventData.ledgerData?.settlements || {};

  const ledgerStats = useMemo(() => {
    let totalBill = 0, settledAmount = 0;
    const settledList = [], pendingList = [];
    const payerName = eventData.members.find(m => m.id === mainPayerId)?.name || 'Someone';

    memberShares.forEach(member => {
      totalBill += member.roundedTotal;
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

    const pendingAmount = paymentStrategy === 'one_person' ? (totalBill - (memberShares.find(m=>m.id===mainPayerId)?.roundedTotal||0)) - settledAmount : totalBill - settledAmount;
    return { totalBill, settledAmount, pendingAmount, settledList, pendingList, payerName };
  }, [eventData.ledgerData]);

  // --- NATIVE TEXT SHARING (WhatsApp/SMS) ---
  const handleWhatsAppLedger = async () => {
    try {
      let report = `🧾 *${eventData.eventName} - Bill Summary*\n`;
      report += `📅 Date: ${eventData.eventDate}\n`;
      report += `💰 Grand Total: ₹${ledgerStats.totalBill}\n\n`;

      if (ledgerStats.pendingList.length > 0) {
        report += `⏳ *PENDING PAYMENTS*\n`;
        ledgerStats.pendingList.forEach(m => {
          const owesName = paymentStrategy === 'one_person' ? ledgerStats.payerName.split(' ')[0] : 'Restaurant';
          report += `- ${m.name} owes ₹${m.roundedTotal} (to ${owesName})\n`;
        });
        report += `\n`;
      }

      if (ledgerStats.settledList.length > 0) {
        report += `✅ *SETTLED*\n`;
        ledgerStats.settledList.forEach(m => {
          report += `- ${m.name} paid ₹${m.amount} (${m.displayMethod})\n`;
        });
      }

      await Share.share({
        message: report,
        title: `${eventData.eventName} Ledger`
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share report.');
    }
  };

  // --- NATIVE CSV EXPORT ---
  const handleExportCSV = async () => {
    try {
      let csvContent = 'Name,Status,Amount,Payment Method,Owes Who\n';
      
      const owesName = paymentStrategy === 'one_person' ? ledgerStats.payerName : 'Restaurant';

      ledgerStats.pendingList.forEach(m => {
        csvContent += `${m.name},Pending,${m.roundedTotal},N/A,${owesName}\n`;
      });

      ledgerStats.settledList.forEach(m => {
        csvContent += `${m.name},Settled,${m.amount},${m.displayMethod},N/A\n`;
      });

      const safeEventName = (eventData.eventName || 'Event').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${safeEventName}_Ledger.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;
      
      await FileSystem.writeAsStringAsync(fileUri, csvContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Ledger CSV',
          UTI: 'public.comma-separated-values' 
        });
      } else {
        Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device.');
      }
    } catch (error) {
      Alert.alert('Error Generating CSV', error.message || 'An unknown error occurred.');
    }
  };

  return (
    <View style={[styles.container, themeStyles.background]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={[styles.summaryCard, themeStyles.card]}>
          <Text style={[styles.strategyText, themeStyles.subText]}>
            {paymentStrategy === 'one_person' ? `💳 ${ledgerStats.payerName} paid the restaurant` : `🧾 Everyone pays directly`}
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

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.exportBtnWhatsapp} onPress={handleWhatsAppLedger}>
            <Text style={styles.exportBtnText}>💬 WhatsApp Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportBtnCsv, themeStyles.input]} onPress={handleExportCSV}>
            <Text style={[styles.exportBtnTextCsv, themeStyles.text]}>📊 Export CSV</Text>
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

        {ledgerStats.pendingAmount === 0 && (
          <View style={styles.allClearedBox}>
            <Text style={styles.allClearedText}>🎉 All dues are cleared!</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <PulseButton onPress={onExit} style={styles.dashboardBtn}>
          <Text style={styles.dashboardBtnText}>Save Event & Go Home</Text>
        </PulseButton>
      </View>
    </View>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, input: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, input: { backgroundColor: '#374151', borderColor: '#4B5563' } };

const styles = StyleSheet.create({ container: { flex: 1 }, scrollContent: { padding: 20, paddingBottom: 100 }, emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }, emptyEmoji: { fontSize: 64, marginBottom: 20 }, emptyTitle: { fontSize: 24, fontWeight: '900', marginBottom: 10 }, emptySub: { fontSize: 16, textAlign: 'center', lineHeight: 24 }, summaryCard: { padding: 24, borderRadius: 20, borderWidth: 1, alignItems: 'center', marginBottom: 20 }, strategyText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }, grandTotal: { fontSize: 48, fontWeight: '900' }, grandTotalLabel: { fontSize: 16, fontWeight: '600', marginBottom: 20 }, progressRow: { flexDirection: 'row', width: '100%', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 20 }, progressBox: { flex: 1, alignItems: 'center' }, progressLabel: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 }, progressAmount: { fontSize: 20, fontWeight: '900' }, textSuccess: { color: '#10B981' }, textError: { color: '#EF4444' }, actionRow: { flexDirection: 'row', gap: 12, marginBottom: 30 }, exportBtnWhatsapp: { flex: 1, backgroundColor: '#25D366', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }, exportBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 }, exportBtnCsv: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 }, exportBtnTextCsv: { fontWeight: '800', fontSize: 14 }, section: { marginBottom: 24 }, sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 12 }, paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 8 }, memberName: { fontSize: 16, fontWeight: '800', marginBottom: 4 }, pendingAmount: { fontSize: 18, fontWeight: '900' }, settledAmount: { fontSize: 18, fontWeight: '900' }, settledMethod: { fontSize: 12, fontWeight: '700' }, allClearedBox: { backgroundColor: '#ECFDF5', padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#10B981', marginTop: 10 }, allClearedText: { color: '#047857', fontSize: 18, fontWeight: '900' }, footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'transparent' }, dashboardBtn: { backgroundColor: '#111827', padding: 18, borderRadius: 16 }, dashboardBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' }, });