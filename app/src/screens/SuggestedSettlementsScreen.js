import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, ScrollView } from 'react-native';
import { api } from '../lib/api';
import { Screen, Title, Card, Row, PrimaryButton, Subtitle, Chip, Input, SectionTitle } from '../ui/components';
import { emit } from '../realtime/bus';
import { useTheme } from '../ui/theme';

export default function SuggestedSettlementsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { group } = route.params;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [fromUser, setFromUser] = useState(null);
  const [toUser, setToUser] = useState(null);
  const [amount, setAmount] = useState('');

  async function load() {
    try {
      const res = await api.groups.suggestedSettlements(group.id);
      setItems(res);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
      try { setMembers(await api.groups.members(group.id)); } catch (_) {}
    })();
  }, []);

  async function record(item) {
    try {
      setLoading(true);
      await api.expenses.settle(group.id, {
        from_user_id: item.from_user_id,
        to_user_id: item.to_user_id,
        amount: item.amount
      });
      // Optimistic: update suggestions list locally (remove this item)
      setItems((prev) => prev.filter((x) => !(x.from_user_id === item.from_user_id && x.to_user_id === item.to_user_id && Number(x.amount) === Number(item.amount))));
      // Optimistic: notify balances adjustment
      emit('balances:optimistic', { group_id: group.id, from_user_id: item.from_user_id, to_user_id: item.to_user_id, amount: item.amount });
      Alert.alert('Recorded', 'Settlement recorded');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  function getMemberLabel(id) {
    const m = members.find((x) => Number(x.id) === Number(id));
    return m ? (m.name || m.email || `User ${id}`) : `User ${id}`;
  }

  function confirmRecord(item) {
    const fromName = getMemberLabel(item.from_user_id);
    const toName = getMemberLabel(item.to_user_id);
    Alert.alert(
      'Confirm settlement',
      `${fromName} → ${toName}\nAmount: ${item.amount}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Record', onPress: () => record(item) }
      ]
    );
  }

  return (
    <Screen>
      <Title>Suggested Settlements</Title>
      <Subtitle>Minimal transfers to clear debts, or record a custom transfer.</Subtitle>

      <FlatList
        data={items}
        keyExtractor={(_, idx) => String(idx)}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          return (
            <Card>
              <Row style={{ justifyContent:'space-between' }}>
                <Text style={{ color: theme.colors.text }}>{getMemberLabel(item.from_user_id)} → {getMemberLabel(item.to_user_id)}</Text>
                <Text style={{ color: theme.colors.text, fontWeight:'700' }}>{item.amount}</Text>
              </Row>
              <View style={{ height: 8 }} />
              <PrimaryButton title="Record" icon="checkmark-done-outline" onPress={() => confirmRecord(item)} disabled={loading} />
            </Card>
          );
        }}
        ListEmptyComponent={<Subtitle>No transfers suggested.</Subtitle>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({});
