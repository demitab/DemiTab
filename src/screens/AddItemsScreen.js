import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Alert, TouchableOpacity, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PulseButton } from '../components/PulseButton';
import { processReceiptImage } from '../services/gemini';
import { db, storage } from '../services/firebase'; 
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

export const AddItemsScreen = ({ eventData, profile, isDarkMode, onSaveItems }) => {
  const [items, setItems] = useState(eventData.items || []);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState(''); 
  const [itemType, setItemType] = useState('food');
  
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false); 
  const [editingId, setEditingId] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false); 
  
  const isHost = profile.id === eventData.hostId || eventData.hostId === 'USER_ME';
  const themeStyles = isDarkMode ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);

  // SMART COLLAPSE LOGIC: Hides top menu if we have 2+ items or successfully scanned
  const showTopForm = isHost && items.length < 2 && !hasScanned;

  const syncItemsToDB = async (updatedItems) => {
    setItems(updatedItems); 
    if (eventData.id) {
      try { await updateDoc(doc(db, 'events', eventData.id), { items: updatedItems }); } 
      catch (error) { console.error("Live sync failed:", error); }
    }
  };

  useEffect(() => {
    if (eventData.items && eventData.items.length !== items.length) setItems(eventData.items);
  }, [eventData.items]);

  const pickImage = async (useCamera) => {
    if (!isHost) return Alert.alert('Access Denied', 'Only the Host can scan bills.');
    const permission = useCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Permission required', 'We need access to scan the receipt.');

    const options = { base64: true, quality: 0.4 }; 
    const result = useCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    
    if (!result.canceled) {
      setIsScanning(true);
      setIsModalVisible(false); // Close modal if open
      try {
        const text = await processReceiptImage(result.assets[0].base64, 'receipt');
        const lines = text.split('\n');
        
        const newItems = lines.map(line => {
          const [name, qty, price, aiType] = line.split('|');
          const finalType = aiType?.trim().toLowerCase() === 'drink' ? 'drink' : 'food';
          
          return { 
            id: Math.random().toString(), 
            name: name?.trim(), 
            qty: parseInt(qty) || 1, 
            price: parseFloat(price) || 0, 
            type: finalType, 
            assignedTo: finalType === 'food' ? eventData.members.map(m => m.id) : [], 
            drinkCounts: {} 
          };
        }).filter(i => i.name);
        
        await logEvent(getAnalytics(), 'receipt_scanned', { item_count: newItems.length });

        let downloadUrl = null;
        try {
          const fileName = `receipts/event_${eventData.id}_${Date.now()}.jpg`;
          const reference = storage.ref(fileName);
          
          await reference.putFile(result.assets[0].uri, { contentType: 'image/jpeg' });
          downloadUrl = await reference.getDownloadURL();
        } catch (uploadError) { 
          Alert.alert("Storage Error!", "Could not save image."); 
        }

        if (eventData.id) {
          const updatePayload = { items: [...items, ...newItems] };
          if (downloadUrl) updatePayload.receiptUrls = arrayUnion(downloadUrl);
          await updateDoc(doc(db, 'events', eventData.id), updatePayload);
        }
        
        const startingIndex = items.length;
        setItems([...items, ...newItems]);
        setHasScanned(true); // Triggers the Smart Collapse UI

        Alert.alert('Scan Successful', 'Receipt uploaded and categorized.');

        setTimeout(() => {
          if (listRef.current && startingIndex > 0) {
            try { listRef.current.scrollToIndex({ index: startingIndex, animated: true, viewPosition: 0 }); } catch (e) { }
          }
        }, 500);

      } catch (e) { Alert.alert('Diagnostic', String(e.message)); } 
      finally { setIsScanning(false); }
    }
  };

  const displayNames = useMemo(() => {
    const names = {}; const members = eventData.members || [];
    const desiredNames = members.map(m => {
      const parts = m.name.trim().split(' '); const first = parts[0]; const firstLower = first.toLowerCase();
      const isDup = members.filter(member => member.name.trim().split(' ')[0].toLowerCase() === firstLower).length > 1;
      if (isDup && parts.length > 1) return `${first} ${parts[parts.length - 1][0].toUpperCase()}.`;
      return first;
    });
    const desiredCounts = {}; desiredNames.forEach(n => { const lower = n.toLowerCase(); desiredCounts[lower] = (desiredCounts[lower] || 0) + 1; });
    const counters = {}; members.forEach((m, i) => {
      const baseName = desiredNames[i]; const baseLower = baseName.toLowerCase();
      if (desiredCounts[baseLower] > 1) { counters[baseLower] = (counters[baseLower] || 0) + 1; names[m.id] = `${baseName} ${counters[baseLower]}`; } 
      else names[m.id] = baseName;
    });
    return names;
  }, [eventData.members]);

  const addOrUpdateItem = () => {
    if (!itemName || !amount) return;
    const parsedQty = parseInt(quantity) || 1;
    const parsedAmount = parseFloat(amount);
    const calculatedPrice = parsedAmount / parsedQty; 

    if (editingId) {
      syncItemsToDB(items.map(item => item.id === editingId ? { 
        ...item, name: itemName, qty: parsedQty, price: calculatedPrice, type: itemType, assignedTo: itemType === 'food' ? eventData.members.map(m => m.id) : [], drinkCounts: {} 
      } : item));
      setEditingId(null);
    } else {
      syncItemsToDB([{ id: Date.now().toString(), name: itemName, qty: parsedQty, price: calculatedPrice, type: itemType, assignedTo: itemType === 'food' ? eventData.members.map(m => m.id) : [], drinkCounts: {} }, ...items]);
      setTimeout(() => { try { listRef.current?.scrollToIndex({ index: 0, animated: true }); } catch(e) {} }, 500);
    }
    
    setItemName(''); setQuantity('1'); setAmount(''); setItemType('food');
    setIsModalVisible(false);
  };

  const editItem = (item) => {
    setItemName(item.name); setQuantity(item.qty.toString()); setAmount((item.price * item.qty).toString()); setItemType(item.type); setEditingId(item.id);
    setIsModalVisible(true);
  };

  const openAddItemSheet = () => {
    setItemName(''); setQuantity('1'); setAmount(''); setItemType('food'); setEditingId(null);
    setIsModalVisible(true);
  };

  const deleteItem = (id) => syncItemsToDB(items.filter(item => item.id !== id));
  const toggleFoodMember = (itemId, memberId) => syncItemsToDB(items.map(item => { if (item.id !== itemId) return item; return { ...item, assignedTo: item.assignedTo.includes(memberId) ? item.assignedTo.filter(id => id !== memberId) : [...item.assignedTo, memberId] }; }));
  const toggleSelectAllFood = (itemId) => syncItemsToDB(items.map(item => { if (item.id !== itemId) return item; return { ...item, assignedTo: item.assignedTo?.length === eventData.members.length ? [] : eventData.members.map(m => m.id) }; }));
  const adjustDrinkCount = (itemId, memberId, delta, maxQty) => syncItemsToDB(items.map(item => { if (item.id !== itemId) return item; const currentCount = item.drinkCounts[memberId] || 0; const totalAssigned = Object.values(item.drinkCounts).reduce((a, b) => a + b, 0); if (delta > 0 && totalAssigned >= maxQty) return item; return { ...item, drinkCounts: { ...item.drinkCounts, [memberId]: Math.max(0, currentCount + delta) } }; }));
  const quickToggleType = (itemId, currentType) => {
    if (!isHost) return Alert.alert('Access Denied', 'Only the Host can change item types.');
    syncItemsToDB(items.map(item => item.id === itemId ? { ...item, type: currentType === 'food' ? 'drink' : 'food', assignedTo: currentType === 'food' ? [] : eventData.members.map(m => m.id), drinkCounts: {} } : item));
  };

  const handleSaveItems = () => {
    const invalidDrink = items.find(item => item.type === 'drink' && Object.values(item.drinkCounts || {}).reduce((a, b) => a + b, 0) !== item.qty);
    if (invalidDrink) return Alert.alert('Incomplete Split', `Please allocate exactly ${invalidDrink.qty} quantities for: "${invalidDrink.name}".`);
    onSaveItems(items);
  };

  // REUSABLE FORM COMPONENT WITH ORIGINAL TEXT
  const FormControls = () => (
    <View style={styles.manualEntryContainer}>
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, themeStyles.input, {flex: 3, fontSize: 15, fontWeight: '600'}]} placeholder="Item Name" value={itemName} onChangeText={setItemName} placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} />
        <TextInput style={[styles.input, themeStyles.input, {flex: 1.2, fontSize: 15, textAlign: 'center', fontWeight: '800'}]} placeholder="Qty" keyboardType="numeric" value={quantity} onChangeText={setQuantity} placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} />
        <TextInput style={[styles.input, themeStyles.input, {flex: 2, fontSize: 15, fontWeight: '800'}]} placeholder="Total Amt" keyboardType="numeric" value={amount} onChangeText={setAmount} placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} />
      </View>
      <View style={styles.typeRow}>
        <View style={[styles.manualToggleWrapper, themeStyles.input]}>
          <TouchableOpacity style={[styles.manualToggleBtn, itemType === 'food' && styles.typeFoodActive]} onPress={() => setItemType('food')}>
            <Text style={[styles.typeSelectText, itemType === 'food' ? styles.typeTextActive : themeStyles.text]}>🍲 Food</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.manualToggleBtn, itemType === 'drink' && styles.typeDrinkActive]} onPress={() => setItemType('drink')}>
            <Text style={[styles.typeSelectText, itemType === 'drink' ? styles.typeTextActive : themeStyles.text]}>🍺 Drink</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.addBtn, editingId ? styles.updateBtn : themeStyles.primaryBtn]} onPress={addOrUpdateItem}>
          <Text style={[styles.addBtnText, themeStyles.primaryBtnText]}>{editingId ? '✓ Update' : '+ Add'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={[styles.container, themeStyles.background]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      {showTopForm ? (
        <View style={{paddingHorizontal: 20, paddingTop: 20}}>
          <View style={styles.scanWrapper}>
            <PulseButton style={[styles.largeScanBtn, themeStyles.primaryBtn]} onPress={() => pickImage(true)}>
              <Text style={[styles.largeScanText, themeStyles.primaryBtnText]}>{isScanning ? '⏳ Scanning & Uploading...' : '📷 Scan Bill'}</Text>
            </PulseButton>
            <TouchableOpacity style={styles.galleryBtn} onPress={() => pickImage(false)}><Text style={[styles.galleryText, themeStyles.linkText]}>or upload from Gallery</Text></TouchableOpacity>
          </View>
          <Text style={styles.sectionDivider}>OR ADD MANUALLY</Text>
          <FormControls />
        </View>
      ) : null}

      <FlatList 
        ref={listRef} 
        data={items} 
        automaticallyAdjustKeyboardInsets={true} // 🚀 Ensure flatlist avoids keyboard natively
        contentContainerStyle={{ paddingBottom: 150, paddingTop: 15, paddingHorizontal: 20 }}
        keyExtractor={(item) => item.id} 
        renderItem={({ item }) => {
          const totalAssignedDrinks = Object.values(item.drinkCounts || {}).reduce((a, b) => a + b, 0);
          return (
            <View style={[styles.itemCard, themeStyles.card]}>
              <View style={styles.itemHeader}>
                <View style={{flex: 1}}>
                  <Text style={[styles.itemText, themeStyles.text]}>{item.name}</Text>
                  <Text style={themeStyles.subText}>Qty: {item.qty}   |   Price: ₹{item.price.toFixed(2)}</Text>
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  <Text style={[styles.itemAmount, themeStyles.text]}>₹{(item.price * item.qty).toFixed(2)}</Text>
                  <View style={[styles.inlineToggleWrapper, themeStyles.input]}>
                    <TouchableOpacity style={[styles.inlineToggleBtn, item.type === 'food' && styles.typeFoodActive]} onPress={() => item.type !== 'food' && quickToggleType(item.id, item.type)}>
                      <Text style={[styles.inlineToggleText, item.type === 'food' ? styles.typeTextActive : themeStyles.subText]}>🍲 Food</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.inlineToggleBtn, item.type === 'drink' && styles.typeDrinkActive]} onPress={() => item.type !== 'drink' && quickToggleType(item.id, item.type)}>
                      <Text style={[styles.inlineToggleText, item.type === 'drink' ? styles.typeTextActive : themeStyles.subText]}>🍺 Drink</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              
              <View style={[styles.assignmentSection, themeStyles.divider]}>
                {item.type === 'food' ? (
                  <View>
                    <View style={styles.assignmentHeader}>
                      <Text style={[styles.assignmentTitle, themeStyles.text]}>Who shared this?</Text>
                      <TouchableOpacity onPress={() => toggleSelectAllFood(item.id)}><Text style={styles.selectAllText}>{item.assignedTo?.length === eventData.members.length ? 'Deselect All' : 'Select All'}</Text></TouchableOpacity>
                    </View>
                    <View style={styles.pillContainer}>
                      {eventData.members.map(member => (
                          <TouchableOpacity key={member.id} onPress={() => toggleFoodMember(item.id, member.id)} style={[styles.memberPill, themeStyles.pillBase, item.assignedTo?.includes(member.id) && styles.memberPillActive]}>
                            <Text style={[styles.memberPillText, item.assignedTo?.includes(member.id) ? styles.memberPillTextActive : themeStyles.text]}>{displayNames[member.id]}</Text>
                          </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View>
                    <View style={styles.assignmentHeader}>
                      <Text style={[styles.assignmentTitle, themeStyles.text]}>Who had how many? ({totalAssignedDrinks}/{item.qty})</Text>
                      {totalAssignedDrinks !== item.qty && <Text style={styles.errorText}>Incomplete</Text>}
                    </View>
                    <View style={styles.drinkGridContainer}>
                      {eventData.members.map(member => (
                        <View key={member.id} style={styles.drinkGridItem}>
                          <Text numberOfLines={1} style={[styles.drinkMemberName, themeStyles.text]}>{displayNames[member.id]}</Text>
                          <View style={styles.stepperCompact}>
                            <TouchableOpacity style={[styles.stepBtnCompact, themeStyles.pillBase]} onPress={() => adjustDrinkCount(item.id, member.id, -1, item.qty)}><Text style={[styles.stepBtnTextCompact, themeStyles.text]}>-</Text></TouchableOpacity>
                            <Text style={[styles.stepCountCompact, themeStyles.text]}>{item.drinkCounts?.[member.id] || 0}</Text>
                            <TouchableOpacity style={[styles.stepBtnCompact, themeStyles.pillBase]} onPress={() => adjustDrinkCount(item.id, member.id, 1, item.qty)}><Text style={[styles.stepBtnTextCompact, themeStyles.text]}>+</Text></TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
              
              {isHost ? (
                <View style={[styles.itemFooter, themeStyles.divider]}>
                  <TouchableOpacity onPress={() => editItem(item)} style={styles.actionBtn}><Text style={styles.editText}>✏️ Edit Item</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteItem(item.id)} style={styles.actionBtn}><Text style={styles.deleteText}>🗑️ Delete</Text></TouchableOpacity>
                </View>
              ) : null}
            </View>
          )
        }}
      />

      {!showTopForm && isHost && (
        <TouchableOpacity style={[styles.fabBtn, themeStyles.primaryBtn]} activeOpacity={0.8} onPress={openAddItemSheet}>
          <Text style={[styles.fabBtnText, themeStyles.primaryBtnText]}>+</Text>
        </TouchableOpacity>
      )}

      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        {/* 🚀 BUG FIX: Transparent modals on Android ignore OS keyboard resize. We force padding behavior to push it up manually. */}
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={[styles.modalContent, themeStyles.card, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitleText, themeStyles.text]}>{editingId ? '✏️ Edit Item' : '📝 Add Item'}</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}><Text style={styles.closeModalCross}>✕</Text></TouchableOpacity>
            </View>

            {!editingId && (
              <>
                <View style={styles.scanWrapperModal}>
                  <PulseButton style={[styles.largeScanBtn, themeStyles.primaryBtn]} onPress={() => pickImage(true)}>
                    <Text style={[styles.largeScanText, themeStyles.primaryBtnText]}>{isScanning ? '⏳ Scanning & Uploading...' : '📷 Scan Bill'}</Text>
                  </PulseButton>
                  <TouchableOpacity style={styles.galleryBtn} onPress={() => pickImage(false)}><Text style={[styles.galleryText, themeStyles.linkText]}>or upload from Gallery</Text></TouchableOpacity>
                </View>
                <Text style={styles.sectionDivider}>OR ADD MANUALLY</Text>
              </>
            )}

            <FormControls />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={[styles.footer, themeStyles.background, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <PulseButton onPress={handleSaveItems} style={styles.finishBtn}>
          <Text style={styles.finishBtnText}>Validate & Continue</Text>
        </PulseButton>
      </View>
    </KeyboardAvoidingView>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, input: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB', color: '#111827' }, primaryBtn: { backgroundColor: '#111827' }, primaryBtnText: { color: '#fff' }, linkText: { color: '#4B5563' }, divider: { borderTopColor: '#F3F4F6' }, pillBase: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, input: { backgroundColor: '#374151', borderColor: '#4B5563', color: '#F9FAFB' }, primaryBtn: { backgroundColor: '#5BC5A7' }, primaryBtnText: { color: '#111827' }, linkText: { color: '#9CA3AF' }, divider: { borderTopColor: '#374151' }, pillBase: { backgroundColor: '#374151', borderColor: '#4B5563' } };

const styles = StyleSheet.create({ 
  container: { flex: 1 }, 
  scanWrapper: { marginBottom: 10, alignItems: 'center', width: '100%' }, 
  scanWrapperModal: { marginBottom: 5, alignItems: 'center', width: '100%' }, 
  largeScanBtn: { width: '100%', padding: 18, borderRadius: 12 }, 
  largeScanText: { fontWeight: '900', fontSize: 16, textAlign: 'center' }, 
  galleryBtn: { marginTop: 8, paddingVertical: 4 }, 
  galleryText: { fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }, 
  sectionDivider: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', textAlign: 'center', marginVertical: 12, letterSpacing: 1 }, 
  manualEntryContainer: { width: '100%' }, 
  inputRow: { flexDirection: 'row', gap: 6, marginBottom: 8 }, 
  input: { padding: 12, borderRadius: 10, borderWidth: 1, fontSize: 14 }, 
  typeRow: { flexDirection: 'row', gap: 6 }, 
  typeSelectText: { fontWeight: '700', fontSize: 13 }, 
  typeFoodActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' }, 
  typeDrinkActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }, 
  typeTextActive: { color: '#fff', fontWeight: '800' }, 
  addBtn: { flex: 1.2, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, 
  updateBtn: { backgroundColor: '#5BC5A7' }, 
  addBtnText: { fontWeight: '900', fontSize: 15 }, 
  itemCard: { borderRadius: 12, marginBottom: 16, borderWidth: 1, overflow: 'hidden' }, 
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 }, 
  itemText: { fontSize: 18, fontWeight: '800', marginBottom: 4 }, 
  itemAmount: { fontSize: 18, fontWeight: '900', marginBottom: 4 }, 
  inlineToggleWrapper: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, overflow: 'hidden', marginTop: 4, width: 140 },
  inlineToggleBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  inlineToggleText: { fontSize: 12, fontWeight: '700' },
  manualToggleWrapper: { flex: 2, flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  manualToggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  assignmentSection: { borderTopWidth: 1, padding: 16, backgroundColor: 'rgba(0,0,0,0.02)' }, 
  assignmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, 
  assignmentTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }, 
  selectAllText: { color: '#3B82F6', fontWeight: '700', fontSize: 13 }, 
  pillContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, 
  memberPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 }, 
  memberPillActive: { backgroundColor: '#5BC5A7', borderColor: '#5BC5A7' }, 
  memberPillText: { fontSize: 13, fontWeight: '600' }, 
  memberPillTextActive: { color: '#fff', fontWeight: '800' }, 
  drinkGridContainer: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }, 
  drinkGridItem: { width: '33.33%', paddingHorizontal: 4, alignItems: 'center', marginBottom: 14 }, 
  drinkMemberName: { fontSize: 13, fontWeight: '700', marginBottom: 6, textAlign: 'center' }, 
  stepperCompact: { flexDirection: 'row', alignItems: 'center', gap: 6 }, 
  stepBtnCompact: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, 
  stepBtnTextCompact: { fontSize: 16, fontWeight: '900' }, 
  stepCountCompact: { fontSize: 14, fontWeight: '800', width: 14, textAlign: 'center' }, 
  errorText: { color: '#EF4444', fontWeight: '800', fontSize: 12, backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }, 
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderTopWidth: 1 }, 
  actionBtn: { paddingHorizontal: 10, paddingVertical: 5 }, 
  editText: { color: '#3B82F6', fontWeight: '700', fontSize: 14 }, 
  deleteText: { color: '#EF4444', fontWeight: '700', fontSize: 14 }, 
  
  fabBtn: { position: 'absolute', bottom: 95, right: 20, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.27, shadowRadius: 4.65, zIndex: 99 },
  fabBtnText: { fontSize: 32, fontWeight: '400', lineHeight: 36, textAlign: 'center', paddingBottom: 2 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderWidth: 1, borderBottomWidth: 0 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitleText: { fontSize: 18, fontWeight: '900' },
  closeModalCross: { fontSize: 20, fontWeight: '700', color: '#EF4444', padding: 4 },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', zIndex: 10 }, 
  finishBtn: { backgroundColor: '#5BC5A7', padding: 18, borderRadius: 16 }, 
  finishBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' } 
});