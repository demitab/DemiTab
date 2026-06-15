import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Share, Alert } from 'react-native';
import { doc, setDoc, onSnapshot, getDocs, collection, query, where, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { sendPushNotification } from '../services/notifications';

import { AddMembersScreen } from './AddMembersScreen';
import { AddItemsScreen } from './AddItemsScreen';
import { SummaryScreen } from './SummaryScreen';
import { YourShareScreen } from './YourShareScreen';
import { LedgerScreen } from './LedgerScreen';

export const EventWorkspace = ({ activeEvent, profile, isDarkMode, toggleTheme, onExit }) => {
  const [activeTab, setActiveTab] = useState(activeEvent?.items && activeEvent.items.length > 0 ? 'SPLIT BILL' : 'GROUP');
  
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
    } catch (e) { console.error('Cloud save failed', e); }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'events', eventData.id), (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        if (JSON.stringify(cloudData) !== JSON.stringify(eventData)) setEventData(cloudData);
      }
    });
    return () => unsubscribe();
  }, [eventData.id]);

  const renderContent = () => {
    switch (activeTab) {
      case 'GROUP':
        return (
          <AddMembersScreen 
            eventData={eventData} 
            profile={profile} 
            isDarkMode={isDarkMode} 
            onSaveMembers={async (finalMembers) => {
              const memberIds = finalMembers.map(m => m.id).filter(Boolean);
              const memberPhones = finalMembers.map(m => m.phone ? m.phone.replace(/\D/g, '').slice(-10) : '').filter(Boolean);
              
              const existingIds = (eventData.members || []).map(m => m.id);
              const newlyAdded = finalMembers.filter(m => !existingIds.includes(m.id) && m.id !== profile?.id);

              const updatedItems = (eventData.items || []).map(item => {
                let newItem = { ...item };
                if (newItem.splitAmong) newItem.splitAmong = newItem.splitAmong.filter(id => memberIds.includes(id));
                if (newItem.assignedTo) newItem.assignedTo = newItem.assignedTo.filter(id => memberIds.includes(id));
                if (newItem.drinksClaimed) {
                  const newClaimed = {};
                  Object.keys(newItem.drinksClaimed).forEach(k => { if (memberIds.includes(k)) newClaimed[k] = newItem.drinksClaimed[k]; });
                  newItem.drinksClaimed = newClaimed;
                }
                if (newItem.drinkCounts) {
                  const newCounts = {};
                  Object.keys(newItem.drinkCounts).forEach(k => { if (memberIds.includes(k)) newCounts[k] = newItem.drinkCounts[k]; });
                  newItem.drinkCounts = newCounts;
                }
                return newItem;
              });

              pushToCloud({ 
                members: finalMembers, 
                memberIds, 
                memberPhones, 
                items: updatedItems
              });

              // 🚀 FIX: Bulletproof SMS Invite logic for ALL unverified users
              if (newlyAdded.length > 0) {
                const hostName = profile?.name ? profile.name.split(' ')[0] : 'The Host';
                const eventName = eventData.eventName || 'an event';
                const nonAppUsers = [];

                for (const member of newlyAdded) {
                  let hasApp = false;

                  // 1. Try resolving via known USER_ ID
                  if (member.id && member.id.startsWith('USER_')) {
                    const userDoc = await getDoc(doc(db, 'users', member.id));
                    if (userDoc.exists() && userDoc.data().expoPushToken) {
                      hasApp = true;
                      sendPushNotification(userDoc.data().expoPushToken, "Added to Event! 🍽️", `${hostName} added you to an event (${eventName}).`);
                    }
                  }

                  // 2. Try resolving via Phone Number if ID check failed
                  if (!hasApp && member.phone) {
                    const phone10 = member.phone.replace(/\D/g, '').slice(-10);
                    if (phone10) {
                      const usersQuery = query(collection(db, 'users'), where('phone', '==', phone10));
                      const usersSnap = await getDocs(usersQuery);
                      usersSnap.forEach(docSnap => {
                        const ud = docSnap.data();
                        if (ud.expoPushToken) {
                          hasApp = true;
                          sendPushNotification(ud.expoPushToken, "Added to Event! 🍽️", `${hostName} added you to an event (${eventName}).`);
                        }
                      });
                    }
                  }

                  // 3. If neither worked, they definitely don't have the app installed
                  if (!hasApp) {
                    nonAppUsers.push(member);
                  }
                }

                if (nonAppUsers.length > 0) {
                  const names = nonAppUsers.map(m => m.name.split(' ')[0]).join(', ');
                  Alert.alert(
                    "Invite Friends",
                    `${names} isn't on DemiTab yet! Send an invite link so they can view the receipt?`,
                    [
                      { text: "Skip", style: "cancel" },
                      { 
                        text: "Send Invite", 
                        onPress: async () => {
                          try {
                            const configSnap = await getDoc(doc(db, 'app_config', 'global'));
                            let finalApkUrl = "https://firebasestorage.googleapis.com/v0/b/demitab-500b3.firebasestorage.app/o/DemiTab.apk?alt=media&token=73aba156-2027-42fb-9674-0544133b3f82";
                            if (configSnap.exists() && configSnap.data().apkUrl) finalApkUrl = configSnap.data().apkUrl;
                            await Share.share({ message: `Hey! I just added you to "${eventName}" on DemiTab. Download the app to check the receipt and settle up: ${finalApkUrl}` });
                          } catch(e) {}
                        }
                      }
                    ]
                  );
                }
              }
              setActiveTab('SPLIT BILL');
            }}
          />
        );
      case 'SPLIT BILL':
        return <AddItemsScreen eventData={eventData} profile={profile} isDarkMode={isDarkMode} onSaveItems={(items) => { pushToCloud({ items }); setActiveTab('SUMMARY'); }} />;
      case 'SUMMARY':
        return <SummaryScreen eventData={eventData} isDarkMode={isDarkMode} onFinish={(taxData) => { pushToCloud({ taxes: taxData, actualTotal: taxData.actualTotal }); setActiveTab('YOUR SHARE'); }} />;
      case 'YOUR SHARE':
        return <YourShareScreen eventData={eventData} profile={profile} isDarkMode={isDarkMode} onUpdateData={(updates) => pushToCloud(updates)} onNext={(ledgerData) => { pushToCloud({ ledgerData }); setActiveTab('LEDGER'); }} />;
      case 'LEDGER':
        return <LedgerScreen eventData={eventData} isDarkMode={isDarkMode} onExit={onExit} />;
      default: 
        return null;
    }
  };

  return (
    <View style={[styles.container, themeStyles.background]}>
      <View style={[styles.header, themeStyles.card]}>
        <TouchableOpacity onPress={onExit} style={styles.backBtn}><Text style={themeStyles.subText}>← Dashboard</Text></TouchableOpacity>
        <Text style={[styles.headerTitle, themeStyles.text]}>{eventData.eventName}</Text>
        <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}><Text style={{ fontSize: 18 }}>{isDarkMode ? '☀️' : '🌙'}</Text></TouchableOpacity>
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

const styles = StyleSheet.create({ 
  container: { flex: 1 }, 
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 }, 
  backBtn: { flex: 1 }, 
  headerTitle: { flex: 2, fontSize: 18, fontWeight: '800', textAlign: 'center' }, 
  themeToggle: { flex: 1, alignItems: 'flex-end', padding: 5 }, 
  tabContainer: { borderBottomWidth: 1 }, 
  tabScroll: { paddingHorizontal: 10 }, 
  tab: { paddingVertical: 15, paddingHorizontal: 15, borderBottomWidth: 3, borderBottomColor: 'transparent' }, 
  activeTab: { borderBottomColor: '#5BC5A7' }, 
  tabText: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1 }, 
  activeTabText: { fontWeight: '900' }, 
  contentContainer: { flex: 1 } 
});