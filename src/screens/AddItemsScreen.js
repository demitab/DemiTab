import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, Alert, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PulseButton } from '../components/PulseButton';
import { processReceiptImage } from '../services/gemini';
import { db } from '../services/firebase'; 
import { doc, updateDoc } from 'firebase/firestore';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

export const AddItemsScreen = ({ eventData, profile, isDarkMode, onSaveItems }) => {
  const [items, setItems] = useState(eventData.items || []);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState(''); 
  const [itemType, setItemType] = useState('food');
  const [isScanning, setIsScanning] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const isHost = profile.id === eventData.hostId || eventData.hostId === 'USER_ME';
  const themeStyles = isDarkMode ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();

  const syncItemsToDB = async (updatedItems) => {
    setItems(updatedItems); 
    if (eventData.id) {
      try {
        const eventRef = doc(db, 'events', eventData.id);
        await updateDoc(eventRef, { items: updatedItems });
      } catch (error) {
        console.error("Live sync failed:", error);
      }
    }
  };

  useEffect(() => {
    if (eventData.items && eventData.items.length !== items.length) {
      setItems(eventData.items);
    }
  }, [eventData.items]);

  const pickImage = async (useCamera) => {
    if (!isHost) return Alert.alert('Access Denied', 'Only the Host can scan bills.');
    const permission = useCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Permission required', 'We need access to scan the receipt.');

    // 🚀 FIX: Compression entirely removed. Bill uploads at 100% original quality.
    const options = { base64: true };
    
    const result = useCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    
    if (!result.canceled) {
      setIsScanning(true);
      try {
        const text = await processReceiptImage(result.assets[0].base64, 'receipt');
        const lines = text.split('\n');
        const newItems = lines.map(line => {
          const [name, qty, price] = line.split('|');
          return { id: Math.random().toString(), name: name?.trim(), qty: parseInt(qty) || 1, price: parseFloat(price) || 0, type: 'food', assignedTo: eventData.members.map(m => m.id), drinkCounts: {} };
        }).filter(i => i.name);
        
        await logEvent(getAnalytics(), 'receipt_scanned', { item_count: newItems.length });

        if (eventData.id) {
          await updateDoc(doc(db, 'events', eventData.id), { items: [...items, ...newItems] });
        }
        
        setItems([...items, ...newItems]);
        Alert.alert('Scan Successful', 'Receipt items added to the list.');

      } catch (e) { 
        Alert.alert('Gemini Diagnostics', String(e.message));
      } finally { 
        setIsScanning(false); 
      }
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

  useEffect(() => {
    let needsUpdate = false;
    const patchedItems = items.map(item => {
      if (!item.assignedTo) { needsUpdate = true; return { ...item, assignedTo: eventData.members.map(m => m.id), drinkCounts: {} }; }
      return item;
    });
    if (needsUpdate) syncItemsToDB(patchedItems);
  }, [items, eventData.members]);

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
    }
    setItemName(''); setQuantity('1'); setAmount(''); setItemType('food');
  };

  const editItem = (item) => {
    setItemName(item.name); setQuantity(item.qty.toString()); setAmount((item.price * item.qty).toString()); setItemType(item.type); setEditingId(item.id);
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

  return (
    <KeyboardAvoidingView style={[styles.container, themeStyles.background, { paddingBottom: insets.bottom + 20 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      {isHost && (
        <>
          <View style={styles.scanWrapper}>
            <PulseButton style={[styles.largeScanBtn, themeStyles.primaryBtn]} onPress={() => pickImage(true)}>
              <Text style={[styles.largeScanText, themeStyles.primaryBtnText]}>{isScanning ? '⏳ Scanning Receipt...' : '📷 Scan Bill'}</Text>
            </PulseButton>
            <TouchableOpacity style={styles.galleryBtn} onPress={() => pickImage(false)}><Text style={[styles.galleryText, themeStyles.linkText]}>or upload from Gallery</Text></TouchableOpacity>
          </View>

          <Text style={styles.sectionDivider}>OR ADD MANUALLY</Text>

          <View style={styles.manualEntryContainer}>
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, themeStyles.input, {flex: 3}]} placeholder="Item Name" value={itemName} onChangeText={setItemName} placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} />
              <TextInput style={[styles.input, themeStyles.input, {flex: 1.2}]} placeholder="Qty" keyboardType="numeric" value={quantity} onChangeText={setQuantity} placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} />
              <TextInput style={[styles.input, themeStyles.input, {flex: 2}]} placeholder="Total Amt" keyboardType="numeric" value={amount} onChangeText={setAmount} placeholderTextColor={isDarkMode?'#9CA3AF':'#6B7280'} />
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
        </>
      )}

      <FlatList 
        data={items} 
        contentContainerStyle={{paddingBottom: 20}} 
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
              
              {isHost && (
                <View style={[styles.itemFooter, themeStyles.divider]}>
                  <TouchableOpacity onPress={() => editItem(item)} style={styles.actionBtn}><Text style={styles.editText}>✏️ Edit Item</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteItem(item.id)} style={styles.actionBtn}><Text style={styles.deleteText}>🗑️ Delete</Text></TouchableOpacity>
                </View>
              )}
            </View>
          )
        }}
      />
      <PulseButton onPress={handleSaveItems} style={styles.finishBtn}><Text style={styles.finishBtnText}>Validate & Continue</Text></PulseButton>
    </KeyboardAvoidingView>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, card: { backgroundColor: '#fff', borderColor: '#E5E7EB' }, input: { backgroundColor: '#fff', borderColor: '#E5E7EB', color: '#111827' }, primaryBtn: { backgroundColor: '#111827' }, primaryBtnText: { color: '#fff' }, linkText: { color: '#4B5563' }, divider: { borderTopColor: '#F3F4F6' }, pillBase: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, card: { backgroundColor: '#1F2937', borderColor: '#374151' }, input: { backgroundColor: '#374151', borderColor: '#4B5563', color: '#F9FAFB' }, primaryBtn: { backgroundColor: '#5BC5A7' }, primaryBtnText: { color: '#111827' }, linkText: { color: '#9CA3AF' }, divider: { borderTopColor: '#374151' }, pillBase: { backgroundColor: '#374151', borderColor: '#4B5563' } };

const styles = StyleSheet.create({ 
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 20 }, 
  scanWrapper: { marginBottom: 15, alignItems: 'center' }, 
  largeScanBtn: { width: '100%', padding: 24, borderRadius: 16 }, 
  largeScanText: { fontWeight: '900', fontSize: 20, textAlign: 'center', letterSpacing: 1 }, 
  galleryBtn: { marginTop: 12, paddingVertical: 5 }, 
  galleryText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' }, 
  sectionDivider: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', textAlign: 'center', marginVertical: 10, letterSpacing: 1 }, 
  manualEntryContainer: { marginBottom: 20 }, 
  inputRow: { flexDirection: 'row', gap: 6, marginBottom: 8 }, 
  input: { padding: 12, borderRadius: 10, borderWidth: 1, fontSize: 14 }, 
  typeRow: { flexDirection: 'row', gap: 6 }, 
  typeSelectText: { fontWeight: '700' }, 
  typeFoodActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' }, 
  typeDrinkActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }, 
  typeTextActive: { color: '#fff', fontWeight: '800' }, 
  addBtn: { flex: 1.5, paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, 
  updateBtn: { backgroundColor: '#5BC5A7' }, 
  addBtnText: { fontWeight: '900', fontSize: 16 }, 
  itemCard: { borderRadius: 12, marginBottom: 16, borderWidth: 1, overflow: 'hidden' }, 
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 }, 
  itemText: { fontSize: 18, fontWeight: '800', marginBottom: 4 }, 
  itemAmount: { fontSize: 18, fontWeight: '900', marginBottom: 4 }, 
  inlineToggleWrapper: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, overflow: 'hidden', marginTop: 4, width: 150 },
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
  finishBtn: { backgroundColor: '#5BC5A7', marginTop: 10, padding: 18, borderRadius: 16 }, 
  finishBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' } 
});