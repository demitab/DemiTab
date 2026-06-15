import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';

export const InsightsSection = ({ events, profile, isDarkMode }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [timeView, setTimeView] = useState('This Month');

  const { chartData, grandTotal, foodEvents, drinkEvents } = useMemo(() => {
    let fTotal = 0;
    let dTotal = 0;
    let fEvents = [];
    let dEvents = [];

    const now = new Date();

    const parseDate = (dateString) => {
      if (!dateString) return new Date();
      const cleanString = dateString.replace(/\//g, '-');
      const parts = cleanString.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      return new Date();
    };

    (events || []).forEach(event => {
      const eventDate = parseDate(event.eventDate);
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfEvent = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      
      const diffTime = startOfToday.getTime() - startOfEvent.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      let isIncluded = false;
      if (timeView === 'This Week' && diffDays <= 7 && diffDays >= 0) isIncluded = true;
      else if (timeView === 'This Month' && diffDays <= 30 && diffDays >= 0) isIncluded = true;
      else if (timeView === 'This Year' && diffDays <= 365 && diffDays >= 0) isIncluded = true;

      if (!isIncluded) return;

      // 🚀 FIX: Using the EXACT mathematical formula derived from your mathUtils.js file
      let myFood = 0;
      let myDrink = 0;
      const mLen = (event.members && event.members.length > 0) ? event.members.length : 1;

      (event.items || []).forEach(item => {
        if (item.type === 'food') {
          const splitAmong = item.splitAmong || item.assignedTo || [];
          if (splitAmong.length === 0) {
            myFood += (item.amount || (item.price * item.qty) || 0) / mLen;
          } else if (splitAmong.includes(profile.id)) {
            myFood += (item.amount || (item.price * item.qty) || 0) / splitAmong.length;
          }
        } else if (item.type === 'drinks' || item.type === 'drink') {
          const claimed = item.drinksClaimed || item.drinkCounts || {};
          if (claimed[profile.id] > 0) {
            myDrink += (claimed[profile.id] / (item.qty || 1)) * (item.amount || (item.price * item.qty) || 0);
          }
        }
      });

      const taxes = event.taxes || {};
      const cgstRate = (Number(taxes.cgstFood) || Number(taxes.cgstRate) || 0) / 100;
      const sgstRate = (Number(taxes.sgstFood) || Number(taxes.sgstRate) || 0) / 100;
      const vatRate = (Number(taxes.vatDrinks) || Number(taxes.vatRate) || 0) / 100;
      const scRate = (Number(taxes.serviceCharge) || Number(taxes.serviceChargeRate) || 0) / 100;

      // Exact mathematical translation including base taxes
      const exactFoodCost = myFood + (myFood * cgstRate) + (myFood * sgstRate) + (myFood * scRate);
      const exactDrinkCost = myDrink + (myDrink * vatRate) + (myDrink * scRate);

      if (exactFoodCost > 0) {
        fTotal += exactFoodCost;
        fEvents.push({ id: event.id + '-f', eventName: event.eventName, eventDate: event.eventDate, amount: exactFoodCost });
      }
      if (exactDrinkCost > 0) {
        dTotal += exactDrinkCost;
        dEvents.push({ id: event.id + '-d', eventName: event.eventName, eventDate: event.eventDate, amount: exactDrinkCost });
      }
    });

    const total = fTotal + dTotal;

    const data = [
      { 
        value: fTotal, 
        label: 'Food',
        focused: selectedCategory === 'Food',
        color: '#F59E0B',
        text: total > 0 ? `${((fTotal / total) * 100).toFixed(0)}%` : '0%'
      },
      { 
        value: dTotal, 
        label: 'Drinks',
        focused: selectedCategory === 'Drinks',
        color: '#8B5CF6',
        text: total > 0 ? `${((dTotal / total) * 100).toFixed(0)}%` : '0%'
      }
    ];

    return { chartData: data, grandTotal: total, foodEvents: fEvents, drinkEvents: dEvents };
  }, [events, profile.id, selectedCategory, timeView]);

  const theme = isDarkMode ? darkTheme : lightTheme;

  const handleSlicePress = (index) => {
    const category = index === 0 ? 'Food' : 'Drinks';
    setSelectedCategory(selectedCategory === category ? null : category);
  };

  const displayEvents = selectedCategory === 'Food' ? foodEvents : selectedCategory === 'Drinks' ? drinkEvents : [];

  return (
    <View style={[styles.container, theme.card]}>
      <View style={[styles.toggleContainer, theme.input]}>
        {['This Week', 'This Month', 'This Year'].map(view => (
          <TouchableOpacity 
            key={view} 
            style={[styles.toggleBtn, timeView === view && styles.toggleActive]} 
            onPress={() => setTimeView(view)}
          >
            <Text style={[styles.toggleText, timeView === view ? styles.toggleTextActive : theme.subText]}>
              {view}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {grandTotal === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, theme.text]}>No Spend Recorded</Text>
          <Text style={theme.subText}>You haven't spent any money {timeView.toLowerCase()}.</Text>
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={[styles.title, theme.text]}>Total Spent</Text>
            <Text style={[styles.totalAmount, theme.text]}>₹{grandTotal.toFixed(2)}</Text>
          </View>

          <View style={styles.chartWrapper}>
            <PieChart
              data={chartData.map(slice => ({ ...slice, strokeColor: theme.card.backgroundColor, strokeWidth: 2 }))}
              donut
              showText
              textColor="#ffffff"
              textSize={14}
              fontWeight="900"
              radius={80}
              innerRadius={45}
              innerCircleColor={isDarkMode ? '#1F2937' : '#ffffff'}
              onPress={(_, index) => handleSlicePress(index)}
              animationDuration={500}
            />
            
            <View style={styles.legendWrapper}>
              {chartData.map((slice, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  style={[styles.legendItem, selectedCategory === slice.label && styles.legendActive]} 
                  onPress={() => handleSlicePress(idx)}
                >
                  <View style={[styles.dot, { backgroundColor: slice.color }]} />
                  <Text style={[styles.legendLabel, theme.text]}>
                    {slice.label}: ₹{slice.value.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {selectedCategory && (
            <View style={[styles.drillDownWrapper, theme.divider]}>
              <Text style={[styles.drillDownTitle, theme.text]}>
                {selectedCategory} Tracker
              </Text>
              
              <FlatList
                data={displayEvents}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false} 
                renderItem={({ item }) => (
                  <View style={[styles.itemRow, theme.rowDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemName, theme.text]}>{item.eventName}</Text>
                      <Text style={[styles.itemSub, theme.subText]}>{item.eventDate}</Text>
                    </View>
                    <Text style={[styles.itemPrice, theme.text]}>
                      ₹{item.amount.toFixed(2)}
                    </Text>
                  </View>
                )}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
};

const lightTheme = { 
  card: { backgroundColor: '#ffffff', borderColor: '#E5E7EB' }, 
  text: { color: '#111827' }, 
  subText: { color: '#6B7280' }, 
  divider: { borderTopColor: 'rgba(0,0,0,0.08)' }, 
  rowDivider: { borderBottomColor: 'rgba(0,0,0,0.04)' },
  input: { backgroundColor: '#F3F4F6' }
};

const darkTheme = { 
  card: { backgroundColor: '#1F2937', borderColor: '#374151' }, 
  text: { color: '#F9FAFB' }, 
  subText: { color: '#9CA3AF' }, 
  divider: { borderTopColor: 'rgba(255,255,255,0.08)' }, 
  rowDivider: { borderBottomColor: 'rgba(255,255,255,0.04)' },
  input: { backgroundColor: '#374151' }
};

const styles = StyleSheet.create({
  container: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 24 },
  toggleContainer: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 20 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: '#5BC5A7' },
  toggleText: { fontSize: 13, fontWeight: '700' },
  toggleTextActive: { color: '#ffffff', fontWeight: '900' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '900', marginBottom: 6 },
  header: { alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  totalAmount: { fontSize: 32, fontWeight: '900' },
  chartWrapper: { alignItems: 'center', marginVertical: 20, gap: 20 },
  legendWrapper: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 },
  legendActive: { backgroundColor: 'rgba(91, 197, 167, 0.2)' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { fontSize: 14, fontWeight: '800' },
  drillDownWrapper: { marginTop: 10, borderTopWidth: 1, paddingTop: 20 },
  drillDownTitle: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  itemName: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  itemSub: { fontSize: 12, fontWeight: '600' },
  itemPrice: { fontSize: 18, fontWeight: '900' }
});