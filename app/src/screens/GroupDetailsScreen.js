import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, Share, ScrollView } from 'react-native';
import { api } from '../lib/api';
import { Screen, Title, Subtitle, Card, Row, Chip, PrimaryButton, Avatar } from '../ui/components';
import { useTheme } from '../ui/theme';
import { on } from '../realtime/bus';
import { useAuth } from '../context/AuthContext';

export default function GroupDetailsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { group } = route.params;
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [members, setMembers] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [activeTab, setActiveTab] = useState('expenses'); // expenses | invite | add_member | members | balances

  const myBalance = useMemo(() => {
    if (!user) return null;
    const b = balances.find((x) => Number(x.user_id) === Number(user.id));
    return b ? Number(b.net_balance) : null;
  }, [balances, user]);

  async function load() {
    try {
      const [e, b, m, st] = await Promise.all([
        api.expenses.listByGroup(group.id),
        api.groups.balances(group.id),
        api.groups.members(group.id),
        api.expenses.listSettlements(group.id)
      ]);
      const sorted = [...e].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setExpenses(sorted);
      setBalances(b);
      setMembers(m);
      setSettlements(st);
    } catch (e) {
      console.warn(e.message);
    }
  }

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setActiveTab('expenses');
      load();
    });
    const off1 = on('expenses:refresh', (p) => { if (p && Number(p.group_id) === Number(group.id)) load(); });
    const off2 = on('expenses:created', (p) => {
      if (p && Number(p.group_id) === Number(group.id) && p.expense) {
        setExpenses((prev) => {
          const next = [{ ...p.expense }, ...prev];
          next.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          return next;
        });
      }
    });
    const off3 = on('settlements:created', (p) => { if (p && Number(p.group_id) === Number(group.id)) load(); });
    const off4 = on('members:removed', (p) => { if (p && Number(p.group_id) === Number(group.id)) load(); });
    const off5 = on('balances:optimistic', (p) => {
      if (!p || Number(p.group_id) !== Number(group.id)) return;
      setBalances((prev) => prev.map((b) => {
        if (b.user_id === p.from_user_id) return { ...b, net_balance: Number((Number(b.net_balance) + Number(p.amount)).toFixed(2)) };
        if (b.user_id === p.to_user_id) return { ...b, net_balance: Number((Number(b.net_balance) - Number(p.amount)).toFixed(2)) };
        return b;
      }));
    });
    return () => { unsubscribe(); off1(); off2(); off3(); off4(); off5(); };
  }, [navigation]);

  async function removeMember(userId) {
    Alert.alert('Remove member', 'Are you sure you want to remove this member?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.groups.deleteMember(group.id, userId);
          await load();
        } catch (e) {
          Alert.alert('Cannot remove', e.message);
        }
      }}
    ]);
  }

  async function createInvite() {
    try {
      const { token } = await api.groups.createInvite(group.id);
      const link = `Invite token: ${token}`;
      await Share.share({ message: link });
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  // Combined timeline of expenses and settlements, newest first
  const timeline = useMemo(() => {
    const exp = (expenses || []).map((x) => ({ type: 'expense', ...x }));
    const sts = (settlements || []).map((x) => ({ type: 'settlement', ...x }));
    return [...exp, ...sts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [expenses, settlements]);

  // Disambiguate duplicate names: first occurrence keeps base name, next are suffixed (1), (2), ... based on join order
  const displayNameById = useMemo(() => {
    const map = new Map();
    const counts = new Map();
    for (const m of members) {
      const base = (m.name && m.name.trim()) ? m.name.trim() : `User ${m.id}`;
      const n = counts.get(base) || 0;
      counts.set(base, n + 1);
      const label = n === 0 ? base : `${base} (${n})`;
      map.set(m.id, label);
    }
    return map;
  }, [members]);

  function nameOf(userId, fallback) {
    return displayNameById.get(userId) || fallback || `User ${userId}`;
  }

  function renderTimelineItem({ item }) {
    const d = new Date(item.created_at);
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = String(d.getDate()).padStart(2, '0');
    if (item.type === 'settlement') {
      return (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={12} style={{ flex: 1 }}>
              <View style={{ width: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: theme.colors.subtext, fontSize: 12, fontWeight: '700' }}>{month}</Text>
                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>{day}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item.from_user_name || `User ${item.from_user_id}`} → {item.to_user_name || `User ${item.to_user_id}`}</Text>
                <Text style={{ color: theme.colors.subtext }}>Settlement</Text>
              </View>
            </Row>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item.amount}</Text>
          </Row>
        </Card>
      );
    }
    // Expense item
    return (
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={12} style={{ flex: 1 }}>
            <View style={{ width: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.colors.subtext, fontSize: 12, fontWeight: '700' }}>{month}</Text>
              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>{day}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item.description}</Text>
              <Text style={{ color: theme.colors.subtext }}>{item.category || 'General'}</Text>
            </View>
          </Row>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item.amount} {item.currency}</Text>
        </Row>
      </Card>
    );
  }

  return (
    <Screen>
      {/* Header row: group title + quick actions (icons) */}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexGrow: 0, flexShrink: 0 }}>
        <Title style={{ marginBottom: 0 }}>{group.name}</Title>
        <Row gap={6}>
          <Chip icon="cash-outline" onPress={() => { navigation.navigate('SuggestedSettlements', { group }); }} />
          <Chip icon="person-add-outline" onPress={() => { navigation.navigate('AddMember', { group }); }} />
        </Row>
      </Row>
      {myBalance !== null ? (
        <Subtitle style={{ marginBottom: 16 }}>
          You {myBalance >= 0 ? 'should receive' : 'owe'}{' '}
          <Text style={{ color: myBalance >= 0 ? theme.colors.success : theme.colors.danger, fontWeight: '700' }}>
            {Math.abs(myBalance)}
          </Text>
        </Subtitle>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8, marginTop: 0, flexGrow: 0, height: 40}} contentContainerStyle={{ paddingVertical: 0 }}>
        <Row>
          <Chip active={activeTab === 'expenses'} onPress={() => setActiveTab('expenses')} icon="receipt-outline" style={{ marginRight: 8 }}>Expenses</Chip>
          {null /* Invite/Suggest/Add Member removed from chip bar; quick actions in header */}
          <Chip active={activeTab === 'members'} onPress={() => setActiveTab('members')} icon="people-outline" style={{ marginRight: 8 }}>Members</Chip>
          <Chip active={activeTab === 'balances'} onPress={() => setActiveTab('balances')} icon="stats-chart-outline">Balances</Chip>
        </Row>
      </ScrollView>

      {activeTab === 'expenses' && (
        <FlatList
          data={timeline}
          keyExtractor={(item, idx) => `${item.type}-${item.id || idx}`}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingBottom: 72, paddingTop: 0 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={renderTimelineItem}
        />
      )}

      {activeTab === 'members' && (
        <FlatList
          data={members}
          keyExtractor={(item) => String(item.id)}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingBottom: 16, paddingTop: 0 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={12}>
                  <Avatar name={nameOf(item.id, item.name)} />
                  <View>
                    <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{nameOf(item.id, item.name)}</Text>
                  </View>
                </Row>
                <Chip onPress={() => removeMember(item.id)} style={{ backgroundColor: theme.colors.chip, borderColor: theme.colors.danger }} icon="trash-outline">Remove</Chip>
              </Row>
            </Card>
          )}
        />
      )}

      {activeTab === 'balances' && (
        <FlatList
          data={balances}
          keyExtractor={(item) => String(item.user_id)}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingBottom: 16, paddingTop: 0 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={12}>
                  <Avatar name={nameOf(item.user_id, item.user_name)} />
                  <View>
                    <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{nameOf(item.user_id, item.user_name)}</Text>
                  </View>
                </Row>
                <Text style={{ color: item.net_balance >= 0 ? theme.colors.success : theme.colors.danger, fontWeight: '700' }}>{item.net_balance}</Text>
              </Row>
            </Card>
          )}
        />
      )}

      {/* Floating Add Expense button only on Expenses tab */}
      {activeTab === 'expenses' && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center' }}>
          <PrimaryButton title="Add Expense" icon="add-circle-outline" onPress={() => navigation.navigate('AddExpense', { group })} style={{ width: 200 }} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({});
