import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../lib/api';
import { Screen, Title, Card, Input, Row, Chip, PrimaryButton, SectionTitle, Subtitle, KeyboardDismissBar } from '../ui/components';
import { useTheme } from '../ui/theme';

export default function AddExpenseScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { group } = route.params;
  const [users, setUsers] = useState([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [payerId, setPayerId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [splitType, setSplitType] = useState('equal'); // equal | exact | percent | shares
  const [customAmounts, setCustomAmounts] = useState({}); // for exact
  const [percentages, setPercentages] = useState({}); // for percent
  const [shares, setShares] = useState({}); // for shares
  const [category, setCategory] = useState('General');
  const [activeTab, setActiveTab] = useState('split_participants');
  const [multiPayer, setMultiPayer] = useState(false);
  const [contribs, setContribs] = useState({}); // payerId -> amount string
  const [expenseDate, setExpenseDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const scrollRef = useRef(null);
  const partLayouts = useRef({});
  const contribLayouts = useRef({});

  useEffect(() => {
    (async () => {
      const members = await api.groups.members(group.id);
      setUsers(members);
      if (members.length) {
        setPayerId(members[0].id);
        setSelected(new Set(members.map(m => m.id)));
      }
    })();
  }, [group.id]);

  // Open the date picker automatically when Date tab is active
  useEffect(() => {
    setShowDatePicker(activeTab === 'date');
  }, [activeTab]);

  function toggle(userId) {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    setSelected(next);
    // if deselected, clear inputs
    setCustomAmounts((prev) => {
      const p = { ...prev };
      if (!next.has(userId)) delete p[userId];
      return p;
    });
    setPercentages((prev) => {
      const p = { ...prev };
      if (!next.has(userId)) delete p[userId];
      return p;
    });
    setShares((prev) => {
      const p = { ...prev };
      if (!next.has(userId)) delete p[userId];
      return p;
    });
  }

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || !description.trim() || !payerId || selected.size === 0) return;
    const payload = {
      group_id: group.id,
      payer_id: payerId,
      amount: amt,
      description: description.trim(),
      participants: Array.from(selected),
      category
    };
    if (splitType === 'exact') {
      const splits = payload.participants.map((uid) => ({ user_id: uid, amount: parseFloat(customAmounts[uid] || '0') || 0 }));
      const total = Number(splits.reduce((s, x) => s + x.amount, 0).toFixed(2));
      if (Math.abs(total - amt) > 0.01) {
        Alert.alert('Invalid split', 'Exact amounts must sum to the total');
        return;
      }
      payload.split_type = 'exact';
      payload.splits = splits;
    } else if (splitType === 'percent') {
      const splits = payload.participants.map((uid) => ({ user_id: uid, percent: parseFloat(percentages[uid] || '0') || 0 }));
      const totalPct = Number(splits.reduce((s, x) => s + x.percent, 0).toFixed(2));
      if (Math.abs(totalPct - 100) > 0.01) {
        Alert.alert('Invalid split', 'Percentages must total 100');
        return;
      }
      payload.split_type = 'percent';
      payload.splits = splits;
    } else if (splitType === 'shares') {
      const splits = payload.participants.map((uid) => ({ user_id: uid, shares: parseInt(shares[uid] || '0', 10) || 0 }));
      const totalShares = splits.reduce((s, x) => s + (x.shares || 0), 0);
      if (totalShares <= 0) {
        Alert.alert('Invalid split', 'Total shares must be greater than 0');
        return;
      }
      payload.split_type = 'shares';
      payload.splits = splits;
    }
    // Handle multi-payer: choose a primary payer and record settlements to reflect contributions
    let primaryPayer = payerId;
    let settlements = [];
    if (multiPayer) {
      // Build numeric contributions map
      const entries = Object.entries(contribs)
        .map(([uid, v]) => [Number(uid), parseFloat(v || '0') || 0])
        .filter(([, v]) => v > 0);
      const totalContrib = Number(entries.reduce((s, [, v]) => s + v, 0).toFixed(2));
      if (entries.length > 0) {
        if (Math.abs(totalContrib - amt) > 0.01) {
          Alert.alert('Invalid payer contributions', 'Sum of contributions must equal the total amount');
          return;
        }
        // Pick primary as the one with the largest contribution, fallback to selected payerId
        entries.sort((a, b) => b[1] - a[1]);
        primaryPayer = entries[0][0] || payerId;
        payload.payer_id = primaryPayer;
        settlements = entries
          .filter(([uid]) => uid !== primaryPayer)
          .map(([uid, v]) => ({ from_user_id: primaryPayer, to_user_id: uid, amount: v }));
      }
    }

    // Include chosen date as YYYY-MM-DD to avoid timezone shifts
    try {
      const y = expenseDate.getFullYear();
      const m = String(expenseDate.getMonth() + 1).padStart(2, '0');
      const d = String(expenseDate.getDate()).padStart(2, '0');
      payload.created_at = `${y}-${m}-${d}`;
    } catch (_) {}
    await api.expenses.create(payload);
    // Post-create settlements to normalize multi-payer contributions
    for (const st of settlements) {
      try { await api.expenses.settle(group.id, st); } catch (_) {}
    }
    navigation.goBack();
  }

  const tabs = [
    { key: 'split_participants', label: 'Split Up' },
    { key: 'date', label: 'Date' },
    { key: 'payer', label: 'Payer' },
    { key: 'category', label: 'Category' }
  ];

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        ref={scrollRef}
        data={[]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View>
      <View style={{ alignItems:'center', marginBottom: 12 }}>
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="Enter a Description"
          onFocus={() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true })}
          style={{ width: '80%', textAlign:'center', marginTop:6, height: 52, paddingVertical: 12 }}
        />
        <Input
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          placeholder="Amount"
          onFocus={() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true })}
          style={{ width: '60%', textAlign:'center', marginTop:6, height: 52, paddingVertical: 12 }}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
        <Row>
          {tabs.map(t => (
            <Chip key={t.key} active={activeTab === t.key} onPress={() => setActiveTab(t.key)} style={{ marginRight: 8 }}>{t.label}</Chip>
          ))}
        </Row>
      </ScrollView>

      {activeTab === 'split_participants' && (
        <View>
          <SectionTitle>Split Type</SectionTitle>
          <Row style={{ flexWrap:'wrap', marginBottom:8 }}>
            {[
              {key:'equal', label:'Equal', icon:'people-outline'},
              {key:'exact', label:'Exact', icon:'calculator-outline'},
              {key:'percent', label:'Percent', icon:'pie-chart-outline'},
              {key:'shares', label:'Shares', icon:'git-network-outline'}
            ].map(opt => (
              <Chip key={opt.key} onPress={() => setSplitType(opt.key)} active={splitType === opt.key} icon={opt.icon} style={{ marginRight: 8, marginBottom: 8 }}>{opt.label}</Chip>
            ))}
          </Row>
          <SectionTitle>Participants</SectionTitle>
          <FlatList
            data={users}
            keyExtractor={i => String(i.id)}
            scrollEnabled={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Card onLayout={(e)=>{ partLayouts.current[item.id]=e.nativeEvent.layout.y; }} style={[{ padding: 10, borderColor: selected.has(item.id) ? theme.colors.primary : theme.colors.border, marginBottom: 8 }]}>
                <Row style={{ justifyContent:'space-between' }}>
                  <TouchableOpacity onPress={() => toggle(item.id)} style={{flex:1}}>
                    <Text style={{ color: theme.colors.text }}>{item.name || `User ${item.id}`}</Text>
                  </TouchableOpacity>
                  {splitType === 'exact' && selected.has(item.id) && (
                    <Input onFocus={()=>{ const y=partLayouts.current[item.id]||0; scrollRef.current?.scrollToOffset({ offset: Math.max(0, y-140), animated: true }); }} style={{ width: 120, marginBottom:0, height: 44, paddingVertical: 10 }} keyboardType="decimal-pad" placeholder="0" value={String(customAmounts[item.id] ?? '')} onChangeText={(t)=> setCustomAmounts((prev)=> ({...prev, [item.id]: t}))} />
                  )}
                  {splitType === 'percent' && selected.has(item.id) && (
                    <Input onFocus={()=>{ const y=partLayouts.current[item.id]||0; scrollRef.current?.scrollToOffset({ offset: Math.max(0, y-140), animated: true }); }} style={{ width: 120, marginBottom:0, height: 44, paddingVertical: 10 }} keyboardType="decimal-pad" placeholder="%" value={String(percentages[item.id] ?? '')} onChangeText={(t)=> setPercentages((prev)=> ({...prev, [item.id]: t}))} />
                  )}
                  {splitType === 'shares' && selected.has(item.id) && (
                    <Input onFocus={()=>{ const y=partLayouts.current[item.id]||0; scrollRef.current?.scrollToOffset({ offset: Math.max(0, y-140), animated: true }); }} style={{ width: 120, marginBottom:0, height: 44, paddingVertical: 10 }} keyboardType="number-pad" placeholder="shares" value={String(shares[item.id] ?? '')} onChangeText={(t)=> setShares((prev)=> ({...prev, [item.id]: t}))} />
                  )}
                </Row>
              </Card>
            )}
          />
        </View>
      )}

      {activeTab === 'date' && (
        <View>
          <SectionTitle>Expense Date</SectionTitle>
          <Subtitle>Pick the date of this expense.</Subtitle>
          {showDatePicker && (
            <DateTimePicker
              value={expenseDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(event, selected) => {
                // Selecting a date immediately applies it; no extra Done button
                if (selected) setExpenseDate(selected);
                if (Platform.OS === 'android') setShowDatePicker(false);
              }}
              maximumDate={new Date()}
            />
          )}
        </View>
      )}

      {activeTab === 'payer' && (
        <View>
          <SectionTitle>Payer</SectionTitle>
          <Row style={{ marginBottom: 8 }}>
            <Chip active={multiPayer} onPress={() => setMultiPayer(!multiPayer)} icon="git-branch-outline">Multiple payers</Chip>
          </Row>
          {!multiPayer ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <Row>
                {users.map(item => (
                  <Chip key={item.id} onPress={() => setPayerId(item.id)} active={payerId === item.id} style={{ marginRight: 8 }}>
                    {item.name || `User ${item.id}`}
                  </Chip>
                ))}
              </Row>
            </ScrollView>
          ) : (
            <FlatList
              data={users}
              keyExtractor={i => String(i.id)}
              scrollEnabled={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Card onLayout={(e)=>{ contribLayouts.current[item.id]=e.nativeEvent.layout.y; }} style={{ marginBottom: 8, padding: 10 }}>
                  <Row style={{ justifyContent:'space-between' }}>
                    <Text style={{ color: theme.colors.text, flex: 1 }}>{item.name || `User ${item.id}`}</Text>
                    <Input
                      style={{ width: 120, marginBottom:0 }}
                      keyboardType="decimal-pad"
                      placeholder="Contribution"
                      onFocus={()=>{ const y=contribLayouts.current[item.id]||0; scrollRef.current?.scrollToOffset({ offset: Math.max(0, y-140), animated: true }); }}
                      value={String(contribs[item.id] ?? '')}
                      onChangeText={(t)=> setContribs(prev => ({ ...prev, [item.id]: t }))}
                    />
                  </Row>
                </Card>
              )}
            />
          )}
        </View>
      )}

      {activeTab === 'category' && (
        <View>
          <SectionTitle>Category</SectionTitle>
          <Row style={{ flexWrap:'wrap', marginBottom:12 }}>
            {[
              { key: 'General', icon: 'apps-outline' },
              { key: 'Food', icon: 'restaurant-outline' },
              { key: 'Travel', icon: 'airplane-outline' },
              { key: 'Shopping', icon: 'bag-outline' },
              { key: 'Utilities', icon: 'flash-outline' },
              { key: 'Rent', icon: 'home-outline' },
              { key: 'Other', icon: 'ellipsis-horizontal-circle-outline' }
            ].map(cat => (
              <Chip key={cat.key} onPress={() => setCategory(cat.key)} active={category === cat.key} icon={cat.icon} style={{ marginRight: 8, marginBottom: 8 }}>{cat.key}</Chip>
            ))}
          </Row>
        </View>
      )}

      <View style={{ height: 12 }} />
      <PrimaryButton title="Save" icon="save-outline" onPress={save} />
      <KeyboardDismissBar />
      </View>
        }
      />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({});
