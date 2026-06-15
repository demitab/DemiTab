import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert, Linking, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FontAwesome } from '@expo/vector-icons';
import { PulseButton } from '../components/PulseButton';
import { registerForPushNotificationsAsync } from '../services/notifications';

export const YourShareScreen = ({ eventData, profile, isDarkMode, onUpdateData, onNext }) => {
  const [detailsModal, setDetailsModal] = useState({ visible: false, member: null });
  const [settleModal, setSettleModal] = useState({ visible: false, member: null });
  const [settleMethod, setSettleMethod] = useState('UPI'); 
  const [paidById, setPaidById] = useState(null); 
  
  // Premium Centered Victory Overlay State
  const [showVictoryOverlay, setShowVictoryOverlay] = useState(false);
  const [victoryMessage, setVictoryMessage] = useState('');
  const [victoryColor, setVictoryColor] = useState('#ffffff');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [expoPushToken, setExpoPushToken] = useState('');

  const { paymentStrategy, mainPayerId } = eventData;
  const settlements = eventData.settlements || {}; 
  const isHost = profile?.id === eventData.hostId || eventData.hostId === 'USER_ME';

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => setExpoPushToken(token));
  }, []);

  const memberShares = useMemo(() => {
    const scRate = eventData.taxes?.serviceChargeRate || 0;
    const cgstRate = eventData.taxes?.cgstRate || 0;
    const sgstRate = eventData.taxes?.sgstRate || 0;
    const vatRate = eventData.taxes?.vatRate || 0;
    const individualFee = (Math.floor((eventData.actualTotal || 0) / 1000) * 10) / (eventData.members.length || 1);

    return eventData.members.map(member => {
      let foodBase = 0, drinkBase = 0;
      const itemized = [];
      
      (eventData.items || []).forEach(item => {
        if (item.type === 'food' && item.assignedTo?.includes(member.id)) {
          const splitCount = Math.max(1, item.assignedTo.length); 
          const share = (item.price * item.qty) / splitCount;
          foodBase += share; 
          itemized.push({ name: `${item.name} (${item.qty}/${splitCount})`, share, type: 'food' });
        } else if (item.type === 'drink' && item.drinkCounts?.[member.id] > 0) {
          const share = item.price * item.drinkCounts[member.id];
          drinkBase += share; 
          itemized.push({ name: `${item.name} (${item.drinkCounts[member.id]}/${item.qty})`, share, type: 'drink' });
        }
      });
      
      const fSC = foodBase * (scRate / 100);
      const dSC = drinkBase * (scRate / 100);
      const cgst = (foodBase + fSC) * (cgstRate / 100);
      const sgst = (foodBase + fSC) * (sgstRate / 100);
      const vat = (drinkBase + dSC) * (vatRate / 100);
      const roundedTotal = Math.round(foodBase + drinkBase + fSC + dSC + cgst + sgst + vat);

      return { id: member.id, name: member.name, taxes: { sc: fSC + dSC, cgst, sgst, vat }, fees: { convenience: individualFee, discount: individualFee }, itemized, roundedTotal };
    });
  }, [eventData]);

  const handleStrategyChange = (strategy) => {
    if (strategy === paymentStrategy) return;
    const hasSettlements = Object.keys(settlements).length > 0;

    const executeChange = () => {
      Haptics.selectionAsync();
      const updates = { paymentStrategy: strategy };
      if (strategy === 'one_person' && !mainPayerId) updates.mainPayerId = profile?.id || eventData.hostId || 'USER_ME';
      if (hasSettlements) updates.settlements = {};
      onUpdateData(updates);
    };

    if (hasSettlements) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Reset Settlements?', 'Switching the payment method will reset all currently settled payments. Do you want to continue?', [ { text: 'Cancel', style: 'cancel' }, { text: 'Yes, Reset', style: 'destructive', onPress: executeChange } ]);
    } else { executeChange(); }
  };
  
  const handlePayerChange = (id) => {
    Haptics.selectionAsync();
    onUpdateData({ mainPayerId: id });
  };

  const handleSaveSettlement = () => {
    if (settleMethod === 'OTHER' && !paidById) return Alert.alert('Select Payer', 'Please select who paid for this person.');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    const newSettlements = { ...settlements, [settleModal.member.id]: { amount: settleModal.member.roundedTotal, method: settleMethod, paidBy: settleMethod === 'OTHER' ? paidById : settleModal.member.id } };
    onUpdateData({ settlements: newSettlements });
    
    setSettleModal({ visible: false, member: null });

    const messages = ["Friendships saved! 🤝", "Debt-free! 🎉", "Universe balanced. 🌌", "Paid like a boss! 🏆"];
    const colors = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#F472B6'];
    
    setVictoryMessage(messages[Math.floor(Math.random() * messages.length)]);
    setVictoryColor(colors[Math.floor(Math.random() * colors.length)]);
    setShowVictoryOverlay(true);
    
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true })
    ]).start(() => {
      setShowVictoryOverlay(false);
    });
  };

  const handleUndoSettlement = (memberId) => {
    Alert.alert('Undo Settlement', 'Are you sure you want to mark this as unpaid?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo', style: 'destructive', onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          const newSettlements = { ...settlements };
          delete newSettlements[memberId];
          onUpdateData({ settlements: newSettlements });
      }}
    ]);
  };

  const sendIndividualBill = (member) => {
    let msg = `*DemiTab Receipt : ${eventData.eventName}*\n\n`;
    msg += `Hey ${member.name.split(' ')[0]}, your share is *₹${member.roundedTotal}*.\n\n`;
    msg += `🧾 *Itemized Breakdown:*\n`;
    let hasFoodIcon = false, hasDrinkIcon = false;
    member.itemized.forEach(i => { 
      let iconStr = '';
      if (i.type === 'drink' && !hasDrinkIcon) { iconStr = '🍹 '; hasDrinkIcon = true; } 
      else if (i.type === 'food' && !hasFoodIcon) { iconStr = '🍔 '; hasFoodIcon = true; }
      msg += `- ${iconStr}${i.name}: ₹${i.share.toFixed(2)}\n`; 
    });
    
    const totalTaxes = member.taxes.sc + member.taxes.cgst + member.taxes.sgst + member.taxes.vat + member.fees.convenience;
    if (totalTaxes > 0) {
      msg += `\n💸 *Taxes & Fees:*\n`;
      if (member.taxes.sc > 0) msg += `- Service Charge: ₹${member.taxes.sc.toFixed(2)}\n`;
      if (member.taxes.cgst > 0) msg += `- CGST: ₹${member.taxes.cgst.toFixed(2)}\n`;
      if (member.taxes.sgst > 0) msg += `- SGST: ₹${member.taxes.sgst.toFixed(2)}\n`;
      if (member.taxes.vat > 0) msg += `- VAT: ₹${member.taxes.vat.toFixed(2)}\n`;
      if (member.fees.convenience > 0) msg += `- Platform Fee: ₹${member.fees.convenience.toFixed(2)}\n`;
      if (member.fees.discount > 0) msg += `- Discount: -₹${member.fees.discount.toFixed(2)}\n`;
    }
    
    msg += `\n💰 *Grand Total: ₹${member.roundedTotal}*\n\n`;
    msg += `_Split instantly with Demitab_`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`);
  };

  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  return (
    <View style={[styles.container, themeStyles.background]}>
      
      <View style={[styles.strategyCard, themeStyles.card]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>How is the bill being paid?</Text>
        <View style={styles.strategyRow}>
          <TouchableOpacity disabled={!isHost} style={[styles.strategyBtn, paymentStrategy === 'everyone' ? styles.strategyActive : themeStyles.input, !isHost && {opacity: 0.5}]} onPress={() => handleStrategyChange('everyone')}>
            <Text style={[styles.strategyText, paymentStrategy === 'everyone' ? styles.strategyTextActive : themeStyles.text]}>Everyone Pays</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={!isHost} style={[styles.strategyBtn, paymentStrategy === 'one_person' ? styles.strategyActive : themeStyles.input, !isHost && {opacity: 0.5}]} onPress={() => handleStrategyChange('one_person')}>
            <Text style={[styles.strategyText, paymentStrategy === 'one_person' ? styles.strategyTextActive : themeStyles.text]}>One Person Pays</Text>
          </TouchableOpacity>
        </View>
        {paymentStrategy === 'one_person' && (
          <View style={styles.payerSelectContainer}>
            <Text style={themeStyles.subText}>Who paid the restaurant?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop: 10}}>
              {eventData.members.map(m => (
                <TouchableOpacity disabled={!isHost} key={m.id} style={[styles.payerPill, mainPayerId === m.id ? styles.payerPillActive : themeStyles.pillBase, !isHost && {opacity: 0.5}]} onPress={() => handlePayerChange(m.id)}>
                  <Text style={[styles.payerPillText, mainPayerId === m.id ? styles.payerPillTextActive : themeStyles.text]}>{m.name.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollList}>
        {memberShares.map(member => {
          const isMainPayer = paymentStrategy === 'one_person' && member.id === mainPayerId;
          const isSettled = !!settlements[member.id];
          
          const canEdit = isHost || profile?.id === member.id || profile?.uid === member.id || (profile?.name && member?.name && profile.name === member.name) || (profile?.phone && member?.phone && profile.phone === member.phone);
          
          return (
            <View key={member.id} style={[styles.memberCard, themeStyles.card, (isSettled || isMainPayer) && styles.settledCard]}>
              <View style={styles.memberCardHeader}>
                <View>
                  <Text style={[styles.memberName, themeStyles.text]}>{member.name}</Text>
                  {isMainPayer ? <Text style={styles.settledBadge}>⭐ PAID RESTAURANT</Text> : isSettled ? <Text style={styles.settledBadge}>✓ SETTLED</Text> : null}
                </View>
                <Text style={[styles.memberTotal, themeStyles.text]}>₹{member.roundedTotal}</Text>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.actionBtn, themeStyles.input, {flexDirection: 'row', justifyContent: 'center', gap: 6}]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); sendIndividualBill(member); }}>
                  <FontAwesome name="whatsapp" size={16} color="#25D366" />
                  <Text style={[styles.actionBtnText, themeStyles.text]}>Bill</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.actionBtn, themeStyles.input]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDetailsModal({ visible: true, member }); }}>
                  <Text style={[styles.actionBtnText, themeStyles.text]}>📄 Details</Text>
                </TouchableOpacity>
                
                {isMainPayer ? (
                  <View style={styles.lockedContainer}>
                    <Text style={styles.lockedText}>Auto-Settled</Text>
                  </View>
                ) : isSettled ? (
                   <TouchableOpacity disabled={!canEdit} style={[styles.actionBtn, {backgroundColor: '#FEF2F2', borderColor: '#EF4444'}, !canEdit && {opacity: 0.5}]} onPress={() => handleUndoSettlement(member.id)}>
                     <Text style={[styles.actionBtnText, {color: '#EF4444'}]}>↩️ Undo</Text>
                   </TouchableOpacity>
                ) : (
                  <TouchableOpacity disabled={!canEdit} style={[styles.actionBtn, canEdit ? themeStyles.primaryBtn : themeStyles.input, !canEdit && {opacity: 0.5}]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSettleMethod('UPI'); setPaidById(null); setSettleModal({ visible: true, member }); }}>
                    <Text style={[styles.actionBtnText, canEdit ? themeStyles.primaryBtnText : themeStyles.subText]}>💸 Settle</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* 🚀 FIX: Formatted explicitly to prevent stray string spaces from crashing the Modal */}
      {detailsModal.visible && detailsModal.member ? (
        <Modal transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, themeStyles.card]}>
              <Text style={[styles.modalTitle, themeStyles.text]}>{detailsModal.member.name}'s Share</Text>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <View style={[styles.ticketContainer, themeStyles.ticketBg]}>
                  
                  {detailsModal.member.itemized.filter(i => i.type === 'food').length > 0 ? (
                    <View style={styles.categoryBlock}>
                      <Text style={[styles.receiptSectionTitle, themeStyles.subText]}>🍲 FOOD ITEMS</Text>
                      {detailsModal.member.itemized.filter(i => i.type === 'food').map((item, idx) => (
                        <View key={`food-${idx}`} style={styles.receiptRow}>
                          <Text style={[styles.receiptItemName, themeStyles.text]}>{item.name}</Text>
                          <Text style={[styles.receiptItemAmount, themeStyles.text]}>₹{item.share.toFixed(2)}</Text>
                        </View>
                      ))}
                      <View style={[styles.ticketDashedDivider, themeStyles.dashedBorder]} />
                    </View>
                  ) : null}

                  {detailsModal.member.itemized.filter(i => i.type === 'drink').length > 0 ? (
                    <View style={styles.categoryBlock}>
                      <Text style={[styles.receiptSectionTitle, themeStyles.subText]}>🍹 DRINKS (ALCOHOL)</Text>
                      {detailsModal.member.itemized.filter(i => i.type === 'drink').map((item, idx) => (
                        <View key={`drink-${idx}`} style={styles.receiptRow}>
                          <Text style={[styles.receiptItemName, themeStyles.text]}>{item.name}</Text>
                          <Text style={[styles.receiptItemAmount, themeStyles.text]}>₹{item.share.toFixed(2)}</Text>
                        </View>
                      ))}
                      <View style={[styles.ticketDashedDivider, themeStyles.dashedBorder]} />
                    </View>
                  ) : null}

                  <Text style={[styles.receiptSectionTitle, themeStyles.subText]}>TAXES & FEES</Text>
                  
                  {detailsModal.member.taxes.sc > 0.01 ? (
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptItemName, themeStyles.text]}>Service Charge</Text>
                      <Text style={[styles.receiptItemAmount, themeStyles.text]}>₹{detailsModal.member.taxes.sc.toFixed(2)}</Text>
                    </View>
                  ) : null}

                  {detailsModal.member.taxes.cgst > 0.01 ? (
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptItemName, themeStyles.text]}>CGST</Text>
                      <Text style={[styles.receiptItemAmount, themeStyles.text]}>₹{detailsModal.member.taxes.cgst.toFixed(2)}</Text>
                    </View>
                  ) : null}

                  {detailsModal.member.taxes.sgst > 0.01 ? (
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptItemName, themeStyles.text]}>SGST</Text>
                      <Text style={[styles.receiptItemAmount, themeStyles.text]}>₹{detailsModal.member.taxes.sgst.toFixed(2)}</Text>
                    </View>
                  ) : null}

                  {detailsModal.member.taxes.vat > 0.01 ? (
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptItemName, themeStyles.text]}>VAT</Text>
                      <Text style={[styles.receiptItemAmount, themeStyles.text]}>₹{detailsModal.member.taxes.vat.toFixed(2)}</Text>
                    </View>
                  ) : null}

                  {detailsModal.member.fees.convenience > 0 ? (
                    <View>
                      <View style={styles.receiptRow}>
                        <Text style={[styles.receiptItemName, themeStyles.text]}>Platform Fee</Text>
                        <Text style={[styles.receiptItemAmount, themeStyles.text]}>₹{detailsModal.member.fees.convenience.toFixed(2)}</Text>
                      </View>
                      <View style={styles.receiptRow}>
                        <Text style={[styles.receiptItemName, styles.discountText]}>Trial Offer</Text>
                        <Text style={[styles.receiptItemAmount, styles.discountText]}>-₹{detailsModal.member.fees.discount.toFixed(2)}</Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={[styles.ticketDashedDivider, themeStyles.dashedBorder]} />
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptTotalLabel, themeStyles.text]}>GRAND TOTAL</Text>
                    <Text style={[styles.receiptTotalAmount, themeStyles.text, { color: '#10B981' }]}>₹{detailsModal.member.roundedTotal}</Text>
                  </View>
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtnCancel, themeStyles.input]} onPress={() => setDetailsModal({visible: false, member: null})}>
                  <Text style={[styles.modalBtnText, themeStyles.text]}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {settleModal.visible && settleModal.member ? (
        <Modal transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, themeStyles.card]}>
              <Text style={[styles.modalTitle, themeStyles.text]}>Settle {settleModal.member.name}'s Share</Text>
              <Text style={[styles.settleAmountHuge, themeStyles.text]}>₹{settleModal.member.roundedTotal}</Text>
              
              <Text style={[styles.sectionTitle, themeStyles.text, {marginTop: 20}]}>Payment Method</Text>
              <View style={styles.methodGrid}>
                {['UPI', 'CASH', 'CARD', 'OTHER'].map(method => (
                  <TouchableOpacity key={method} style={[styles.methodBtn, settleMethod === method ? styles.methodBtnActive : themeStyles.input]} onPress={() => { Haptics.selectionAsync(); setSettleMethod(method); }}>
                    <Text style={[styles.methodBtnText, settleMethod === method ? styles.textWhite : themeStyles.text]}>{method === 'OTHER' ? 'Paid by Other' : method}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {settleMethod === 'OTHER' ? (
                <View style={{marginTop: 20}}>
                  <Text style={[styles.sectionTitle, themeStyles.text]}>Who paid for {settleModal.member.name.split(' ')[0]}?</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {eventData.members.filter(m => m.id !== settleModal.member.id).map(m => (
                      <TouchableOpacity key={m.id} style={[styles.payerPill, paidById === m.id ? styles.payerPillActive : themeStyles.pillBase]} onPress={() => { Haptics.selectionAsync(); setPaidById(m.id); }}>
                        <Text style={[styles.payerPillText, paidById === m.id ? styles.payerPillTextActive : themeStyles.text]}>{m.name.split(' ')[0]}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View style={[styles.modalActions, {marginTop: 30}]}>
                <TouchableOpacity style={[styles.modalBtnCancel, themeStyles.input]} onPress={() => setSettleModal({visible: false, member: null})}>
                  <Text style={[styles.modalBtnText, themeStyles.text]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnSave} onPress={handleSaveSettlement}>
                  <Text style={styles.textWhite}>Save Payment</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      <View style={styles.footer}>
        <PulseButton onPress={() => onNext({ paymentStrategy, mainPayerId, memberShares, settlements })} style={styles.finishBtn}>
          <Text style={styles.finishBtnText}>Finish & View Ledger</Text>
        </PulseButton>
      </View>

      {/* Centered, Boxed Victory Message with dynamic borders */}
      {showVictoryOverlay ? (
        <Animated.View style={[styles.victoryOverlayContainer, { opacity: fadeAnim }]} pointerEvents="none">
           <View style={[styles.victoryMessageCard, themeStyles.card, { borderColor: victoryColor }]}>
              <Text style={[styles.victoryText, { color: victoryColor }]}>{victoryMessage}</Text>
           </View>
        </Animated.View>
      ) : null}

    </View>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, divider: { backgroundColor: '#E5E7EB' }, input: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }, primaryBtn: { backgroundColor: '#111827' }, primaryBtnText: { color: '#fff' }, pillBase: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }, ticketBg: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' }, dashedBorder: { borderBottomColor: '#D1D5DB' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, divider: { backgroundColor: '#374151' }, input: { backgroundColor: '#374151', borderColor: '#4B5563' }, primaryBtn: { backgroundColor: '#F9FAFB' }, primaryBtnText: { color: '#111827' }, pillBase: { backgroundColor: '#374151', borderColor: '#4B5563' }, ticketBg: { backgroundColor: '#374151', borderColor: '#4B5563' }, dashedBorder: { borderBottomColor: '#6B7280' } };

const styles = StyleSheet.create({ 
  container: { flex: 1 }, 
  scrollList: { padding: 20, paddingBottom: 100 }, 
  strategyCard: { padding: 20, borderBottomWidth: 1 }, 
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }, 
  strategyRow: { flexDirection: 'row', gap: 10 }, 
  strategyBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' }, 
  strategyActive: { backgroundColor: '#5BC5A7', borderColor: '#5BC5A7' }, 
  strategyText: { fontWeight: '700', fontSize: 14 }, 
  strategyTextActive: { color: '#fff', fontWeight: '900' }, 
  payerSelectContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' }, 
  payerPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 }, 
  payerPillActive: { backgroundColor: '#111827', borderColor: '#111827' }, 
  payerPillText: { fontWeight: '600', fontSize: 14 }, 
  payerPillTextActive: { color: '#fff', fontWeight: '800' }, 
  memberCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 }, 
  settledCard: { borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.05)' }, 
  memberCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, 
  memberName: { fontSize: 18, fontWeight: '800' }, 
  settledBadge: { color: '#10B981', fontSize: 10, fontWeight: '900', marginTop: 2, letterSpacing: 1 }, 
  memberTotal: { fontSize: 24, fontWeight: '900' }, 
  actionRow: { flexDirection: 'row', gap: 10 }, 
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' }, 
  actionBtnText: { fontWeight: '800', fontSize: 14 }, 
  textWhite: { color: '#fff', fontWeight: '800' }, 
  discountText: { color: '#10B981', fontWeight: '800' }, 
  lockedContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }, 
  lockedText: { color: '#10B981', fontWeight: '800', fontSize: 14, marginRight: 10 }, 
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }, 
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' }, 
  modalTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 20 }, 
  modalScroll: { marginBottom: 20 }, 
  ticketContainer: { padding: 24, borderRadius: 16, borderWidth: 1, marginBottom: 20 }, 
  categoryBlock: { marginBottom: 10 },
  ticketDashedDivider: { height: 0, borderBottomWidth: 1, borderStyle: 'dashed', marginVertical: 16 }, 
  receiptSectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 12, marginTop: 4 }, 
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }, 
  receiptItemName: { fontSize: 15, fontWeight: '600', flex: 1, paddingRight: 15 }, 
  receiptItemAmount: { fontSize: 15, fontWeight: '800' }, 
  receiptTotalLabel: { fontSize: 16, fontWeight: '900' }, 
  receiptTotalAmount: { fontSize: 32, fontWeight: '900' }, 
  settleAmountHuge: { fontSize: 48, fontWeight: '900', textAlign: 'center', marginVertical: 10 }, 
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, 
  methodBtn: { flexBasis: '48%', paddingVertical: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center' }, 
  methodBtnActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }, 
  methodBtnText: { fontWeight: '800', fontSize: 14 }, 
  paidByContainer: { marginTop: 20 }, 
  modalActions: { flexDirection: 'row', gap: 12 }, 
  modalBtnCancel: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1 }, 
  modalBtnText: { fontWeight: '800', fontSize: 16 }, 
  modalBtnSave: { flex: 1, backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12, alignItems: 'center' }, 
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'transparent' }, 
  finishBtn: { backgroundColor: '#5BC5A7', padding: 18 }, 
  finishBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  victoryOverlayContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 999, padding: 20 },
  victoryMessageCard: { padding: 30, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center', width: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  victoryText: { fontSize: 26, fontWeight: '900', textAlign: 'center', lineHeight: 36 }
});