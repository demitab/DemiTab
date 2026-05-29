import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

import { AddMembersScreen } from './AddMembersScreen';
import { AddItemsScreen } from './AddItemsScreen';
import { SummaryScreen } from './SummaryScreen';
import { YourShareScreen } from './YourShareScreen';
import { LedgerScreen } from './LedgerScreen';

export const EventWorkspace = ({ activeEvent, profile, isDarkMode, toggleTheme, onExit }) => {
  const [activeTab, setActiveTab] = useState('GROUP');
  const [eventData, setEventData] = useState({
    id: activeEvent?.id || Date.now().toString(),
    eventName: activeEvent?.eventName || 'New Event',
    eventDate: activeEvent?.eventDate || new Date().toLocaleDateString('en-GB'),
    hostId: activeEvent?.hostId || profile?.id || 'USER_ME', 
    members: activeEvent?.members || [], 
    items: activeEvent?.items || [], 
    taxes: activeEvent?.taxes || {}, 
    actualTotal: activeEvent?.actualTotal || 0,
    paymentStrategy: activeEvent?.paymentStrategy || 'everyone', 
    mainPayerId: activeEvent?.mainPayerId || profile?.id || 'USER_ME', 
    settlements: activeEvent?.settlements || {}, 
    ledgerData: activeEvent?.ledgerData || null
  });

  const tabs = ['GROUP', 'SPLIT BILL', 'SUMMARY', 'YOUR SHARE', 'LEDGER'];
  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  // ☁️ ENGINE 1: The Cloud Auto-Saver (Pushes to Firestore)
  useEffect(() => {
    const saveChanges = async () => {
      try {
        const stored = await AsyncStorage.getItem('demitab_events');
        let pastEvents = stored ? JSON.parse(stored) : [];
        const index = pastEvents.findIndex(e => e.id === eventData.id);
        
        if (index > -1) pastEvents[index] = eventData;
        else pastEvents = [eventData, ...pastEvents];

        await AsyncStorage.setItem('demitab_events', JSON.stringify(pastEvents));

        // Push live copy to Firebase!
        await setDoc(doc(db, 'events', eventData.id), eventData);
      } catch (e) { console.error('Cloud auto-save failed', e); }
    };
    saveChanges();
  }, [eventData]);

  // ☁️ ENGINE 2: The Multiplayer Listener (Pulls from Firestore)
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'events', eventData.id), (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        // Prevent infinite loops: only update if data actually changed
        if (JSON.stringify(cloudData) !== JSON.stringify(eventData)) {
          setEventData(cloudData);
        }
      }
    });
    return () => unsubscribe();
  }, [eventData.id]);

  const renderContent = () => {
    switch (activeTab) {
      case 'GROUP':
        return <AddMembersScreen eventData={eventData} profile={profile} isDarkMode={isDarkMode} onSaveMembers={(members) => {
          const userAsMember = { id: profile?.id || 'USER_ME', name: profile?.name?.split(' ')[0] || 'You' };
          const finalMembers = members.some(m => m.id === userAsMember.id) ? members : [userAsMember, ...members];
          setEventData({ ...eventData, members: finalMembers, mainPayerId: finalMembers[0].id });
          setActiveTab('SPLIT BILL');
        }}/>;
      case 'SPLIT BILL':
        return <AddItemsScreen eventData={eventData} profile={profile} isDarkMode={isDarkMode} onSaveItems={(items) => {
          setEventData({ ...eventData, items }); setActiveTab('SUMMARY');
        }}/>;
      case 'SUMMARY':
        return <SummaryScreen eventData={eventData} isDarkMode={isDarkMode} onFinish={(taxData) => {
          setEventData({ ...eventData, taxes: taxData, actualTotal: taxData.actualTotal }); setActiveTab('YOUR SHARE');
        }}/>;
      case 'YOUR SHARE':
        return <YourShareScreen eventData={eventData} profile={profile} isDarkMode={isDarkMode} 
          onUpdateData={(updates) => setEventData({ ...eventData, ...updates })} 
          onNext={(ledgerData) => { setEventData({ ...eventData, ledgerData }); setActiveTab('LEDGER'); }} 
        />;
      case 'LEDGER':
        return <LedgerScreen eventData={eventData} isDarkMode={isDarkMode} onExit={onExit} />;
      default: return null;
    }
  };

  return (
    <View style={[styles.container, themeStyles.background]}>
      <View style={[styles.header, themeStyles.card]}>
        <TouchableOpacity onPress={onExit} style={styles.backBtn}><Text style={themeStyles.subText}>← Dashboard</Text></TouchableOpacity>
        <Text style={[styles.headerTitle, themeStyles.text]}>{eventData.eventName}</Text>
        <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}><Text>{isDarkMode ? '☀️' : '🌙'}</Text></TouchableOpacity>
      </View>
      <View style={[styles.tabContainer, themeStyles.card]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {tabs.map(tab => (
            <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.activeTab]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText, activeTab === tab && themeStyles.text]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <View style={styles.contentContainer}>{renderContent()}</View>
    </View>
  );
};

const lightTheme = { background: { backgroundColor: '#F9FAFB' }, text: { color: '#111827' }, subText: { color: '#6B7280' }, card: { backgroundColor: '#fff', borderBottomColor: '#E5E7EB' } };
const darkTheme = { background: { backgroundColor: '#111827' }, text: { color: '#F9FAFB' }, subText: { color: '#9CA3AF' }, card: { backgroundColor: '#1F2937', borderBottomColor: '#374151' } };
const styles = StyleSheet.create({ container: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 }, backBtn: { flex: 1 }, headerTitle: { flex: 2, fontSize: 18, fontWeight: '800', textAlign: 'center' }, themeToggle: { flex: 1, alignItems: 'flex-end', padding: 5 }, tabContainer: { borderBottomWidth: 1 }, tabScroll: { paddingHorizontal: 10 }, tab: { paddingVertical: 15, paddingHorizontal: 15, borderBottomWidth: 3, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: '#5BC5A7' }, tabText: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1 }, activeTabText: { fontWeight: '900' }, contentContainer: { flex: 1 } });