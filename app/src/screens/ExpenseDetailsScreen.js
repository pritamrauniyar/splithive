import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { api } from '../lib/api';
import { Screen, Title, Card, Row, Chip, PrimaryButton, SectionTitle, Subtitle, Avatar } from '../ui/components';
import { useTheme } from '../ui/theme';
import { on } from '../realtime/bus';

export default function ExpenseDetailsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { group, expenseId } = route.params;
  const [exp, setExp] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const e = await api.expenses.get(expenseId);
      setExp(e);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [expenseId]);

  useEffect(() => {
    const offU = on('expenses:updated', (p) => { if (p && Number(p.id) === Number(expenseId)) load(); });
    const offD = on('expenses:deleted', (p) => { if (p && Number(p.id) === Number(expenseId)) navigation.goBack(); });
    return () => { offU(); offD(); };
  }, [expenseId]);

  async function onDelete() {
    Alert.alert('Delete expense', 'Are you sure you want to delete this expense?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.expenses.delete(expenseId);
          navigation.goBack();
        } catch (e) {
          Alert.alert('Error', e.message);
        }
      }}
    ]);
  }

  function onEdit() {
    if (!exp) return;
    const prefill = {
      id: exp.id,
      group_id: exp.group_id,
      description: exp.description,
      amount: String(exp.amount),
      category: exp.category,
      payer_id: exp.payer_id,
      // Map splits to an "exact" style prefill using share amounts
      participants: (exp.splits || []).map(s => s.user_id),
      exact: Object.fromEntries((exp.splits || []).map(s => [s.user_id, String(s.share_amount)]))
    };
    navigation.navigate('AddExpense', { group, prefillExpense: prefill, mode: 'edit' });
  }

  if (!exp) return <Screen><Subtitle>{loading ? 'Loading…' : 'Not found'}</Subtitle></Screen>;

  return (
    <Screen>
      <Title>{exp.description}</Title>
      <Subtitle>{exp.category || 'General'} • {new Date(exp.created_at).toLocaleDateString()}</Subtitle>
      <Card>
        <Row style={{ justifyContent:'space-between' }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Amount</Text>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Rs. {exp.amount}</Text>
        </Row>
        <Row style={{ justifyContent:'space-between', marginTop: 8 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Payer</Text>
          <Text style={{ color: theme.colors.text }}>{exp.payer_name || `User ${exp.payer_id}`}</Text>
        </Row>
        <Row style={{ justifyContent:'space-between', marginTop: 8 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Added by</Text>
          <Text style={{ color: theme.colors.text }}>{exp.creator_name || 'Unknown'}</Text>
        </Row>
      </Card>

      <SectionTitle>Split</SectionTitle>
      {(exp.splits || []).map(s => (
        <Card key={s.user_id} style={{ marginBottom: 8 }}>
          <Row style={{ justifyContent:'space-between' }}>
            <Row gap={10}>
              <Avatar name={s.user_name || `User ${s.user_id}`} />
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{s.user_name || `User ${s.user_id}`}</Text>
            </Row>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>Rs. {s.share_amount}</Text>
          </Row>
        </Card>
      ))}

      <View style={{ height: 12 }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <PrimaryButton title="Edit" icon="create-outline" onPress={onEdit} style={{ flex: 1, marginRight: 8 }} />
        <PrimaryButton title="Delete" icon="trash-outline" onPress={onDelete} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
