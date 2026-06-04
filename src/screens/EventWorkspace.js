import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

// FIX: Added 'getDocs', 'collection', 'query', and 'where' to read users' tokens from DB
import { doc, setDoc, onSnapshot, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { sendPushNotification } from '../services/notifications';

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
    hostId: activeEvent?.hostId || profile?.id, 
    memberIds: activeEvent?.memberIds || [profile?.id].filter(Boolean), 
    memberPhones: activeEvent?.memberPhones || [], 
    members: activeEvent?.members || [], 
    items: activeEvent?.items || [], 
    taxes: activeEvent?.taxes || {}, 
    actualTotal: activeEvent?.actualTotal || 0,
    paymentStrategy: activeEvent?.paymentStrategy || 'everyone', 
    mainPayerId: activeEvent?.mainPayerId || profile?.id, 
    settlements: activeEvent?.settlements || {}, 
    ledgerData: activeEvent?.ledgerData || null
  });

  const tabs = ['GROUP', 'SPLIT BILL', 'SUMMARY', 'YOUR SHARE', 'LEDGER'];
  const themeStyles = isDarkMode ? darkTheme : lightTheme;

  const pushToCloud = async (updates) => {
    const updatedEvent = { ...eventData, ...updates };
    setEventData(updatedEvent); 
    try {
      await setDoc(doc(db, 'events', updatedEvent.id), updatedEvent);
    } catch (e) {
      console.error('Cloud save failed', e);
    }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'events', eventData.id), (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
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
        return <AddMembersScreen eventData={eventData} profile={profile} isDarkMode={isDarkMode} onSaveMembers={async (members) => {
          const userAsMember = { id: profile?.id, name: profile?.name?.split(' ')[0] || 'You', phone: profile?.phone };
          const finalMembers = members.some(m => m.id === userAsMember.id) ? members : [userAsMember, ...members];
          
          const memberIds = finalMembers.map(m => m.id).filter(Boolean);
          const memberPhones = finalMembers.map(m => m.phone ? m.phone.replace(/\D/g, '').slice(-10) : '').filter(Boolean);
          
          // Identify who is brand new to trigger the push notification
          const existingPhones = (eventData.members || []).map(m => m.phone ? m.phone.replace(/\D/g, '').slice(-10) : '');
          const newlyAdded = finalMembers.filter(m => {
            const mPhone = m.phone ? m.phone.replace(/\D/g, '').slice(-10) : '';
            return mPhone && !existingPhones.includes(mPhone) && m.id !== profile?.id;
          });

          // Save the group to the cloud immediately
          pushToCloud({ members: finalMembers, memberIds, memberPhones, mainPayerId: finalMembers[0].id });

          // NEW FIX: Fire push notifications to the new members
          if (newlyAdded.length > 0) {
            const hostName = profile?.name ? profile.name.split(' ')[0] : 'The Host';
            const eventName = eventData.eventName || 'an event';

            try {
              for (const member of newlyAdded) {
                const phone10 = member.phone.replace(/\D/g, '').slice(-10);
                // Look up the guest in the Users database to find their specific Push Token
                const usersQuery = query(collection(db, 'users'), where('phone', '==', phone10));
                const usersSnap = await getDocs(usersQuery);
                
                usersSnap.forEach(docSnap => {
                   const userData = docSnap.data();
                   if (userData.expoPushToken) {
                      sendPushNotification(
                        userData.expoPushToken,
                        "Added to Event! 🍽️",
                        `${hostName} added you to an event (${eventName}). Open the app to view.`
                      );
                   }
                });
              }
            } catch (err) {
              console.log("Could not fetch push tokens", err);
            }
          }

          setActiveTab('SPLIT BILL');
        }}/>;
      case 'SPLIT BILL':
        return <AddItemsScreen eventData={eventData} profile={profile} isDarkMode={isDarkMode} onSaveItems={(items) => { pushToCloud({ items }); setActiveTab('SUMMARY'); }}/>;
      case 'SUMMARY':
        return <SummaryScreen eventData={eventData} isDarkMode={isDarkMode} onFinish={(taxData) => { pushToCloud({ taxes: taxData, actualTotal: taxData.actualTotal }); setActiveTab('YOUR SHARE'); }}/>;
      case 'YOUR SHARE':
        return <YourShareScreen eventData={eventData} profile={profile} isDarkMode={isDarkMode} onUpdateData={(updates) => pushToCloud(updates)} onNext={(ledgerData) => { pushToCloud({ ledgerData }); setActiveTab('LEDGER'); }} />;
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