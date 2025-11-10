import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Alert } from 'react-native';
import { api } from '../lib/api';
import { Screen, Title, Card, Row, Subtitle, Chip } from '../ui/components';
import { useTheme } from '../ui/theme';
import { on } from '../realtime/bus';
import { useNavigation } from '@react-navigation/native';

function formatAction(action) {
  if (action === 'create') return 'added';
  if (action === 'update') return 'edited';
  if (action === 'delete') return 'deleted';
  if (action === 'restore') return 'restored';
  return action;
}

export default function ActivityScreen({ navigation }) {
  const { theme } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const reloadTimer = useRef(null);

  async function load() {
    try {
      setLoading(true);
      const rows = await api.activity.list();
      setItems(rows);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => { load(); }, []);

  // Reload whenever this screen gains focus (e.g., user switches to Activity tab)
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      load();
    });
    return unsub;
  }, [navigation]);

  // Realtime refresh on expense events
  useEffect(() => {
    function scheduleReload() {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => { load(); reloadTimer.current = null; }, 350);
    }
    const offC = on('expenses:created', scheduleReload);
    const offU = on('expenses:updated', scheduleReload);
    const offD = on('expenses:deleted', scheduleReload);
    return () => { offC(); offU(); offD(); };
  }, []);

  function onPress(item) {
    const params = { group: { id: item.group_id, name: item.group_name } };
    if (item.expense_id) {
      params.expenseId = item.expense_id;
    } else {
      // Deleted entries may have NULL expense_id due to FK; pass audit snapshot for read-only + restore
      params.audit = { id: item.id, action: item.action, snapshot: item.snapshot, created_at: item.created_at, actor_name: item.actor_name };
    }
    navigation.navigate('ExpenseDetails', params);
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
        <Title>Activity</Title>
      </Row>
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          let snapshot = {};
          try { snapshot = item.snapshot ? JSON.parse(item.snapshot) : {}; } catch (_) {}
          const when = new Date(item.created_at);
          const subtitle = `${item.actor_name || 'Someone'} ${formatAction(item.action)} an expense in ${item.group_name}`;
          const right = (snapshot.amount != null && isFinite(Number(snapshot.amount)))
            ? `Rs. ${Number(snapshot.amount).toFixed(2)}`
            : '';
          return (
            <Card onPress={() => onPress(item)}>
              <Row style={{ justifyContent:'space-between' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{snapshot.description || 'Expense'}</Text>
                  <Subtitle>{subtitle}</Subtitle>
                  <Text style={{ color: theme.colors.subtext }}>{when.toLocaleString()}</Text>
                </View>
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{right}</Text>
              </Row>
            </Card>
          );
        }}
        ListEmptyComponent={<Subtitle>{loading ? 'Loading…' : 'No activity yet.'}</Subtitle>}
      />
    </Screen>
  );
}
