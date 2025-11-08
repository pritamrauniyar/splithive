import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { api, API_BASE } from '../lib/api';
import { Screen, Title, Subtitle, Card, PrimaryButton, Input, Row, Chip, KeyboardDismissBar } from '../ui/components';
import { useTheme } from '../ui/theme';
import { on } from '../realtime/bus';
import { toast } from '../ui/toast';

export default function HomeScreen({ navigation }) {
  const { theme } = useTheme();
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [connOk, setConnOk] = useState(null);

  async function load() {
    try {
      const data = await api.groups.list();
      setGroups(data);
    } catch (e) {
      console.warn(e.message);
    }
  }

  useEffect(() => {
    const onFocus = async () => {
      await ping();
      await load();
    };
    const unsubscribe = navigation.addListener('focus', onFocus);
    const off1 = on('groups:refresh', () => load());
    const off2 = on('groups:added', () => { load(); toast('You were added to a group'); });
    return () => { unsubscribe(); off1(); off2(); };
  }, [navigation]);

  async function createGroup() {
    if (!name.trim()) return;
    await api.groups.create({ name: name.trim() });
    setName('');
    load();
  }

  async function ping() {
    try {
      await api.health();
      setConnOk(true);
    } catch (e) {
      setConnOk(false);
    }
  }

  return (
    <Screen>
      {/* <Card style={{ padding: 10, marginBottom: 12, backgroundColor: connOk ? '#0f2d27' : '#2d0f12', borderColor: connOk ? '#14532d' : '#7f1d1d' }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.text, fontSize: 12 }}>API: {API_BASE} - {connOk === null ? 'Checking...' : connOk ? 'Connected' : 'Not reachable'}</Text>
          <Chip onPress={ping} icon="refresh">Retry</Chip>
        </Row>
      </Card> */}

      <Row style={{ justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
        <Title>Your Groups</Title>
      </Row>
      <Row style={{ marginBottom: 20 }}>
        <Input placeholder="New group name" value={name} onChangeText={setName} style={{ flex: 1 }} />
        <View style={{ width: 10 }} />
        <PrimaryButton title="Add" onPress={createGroup} />
      </Row>

      <FlatList
        data={groups}
        keyExtractor={(item) => String(item.id)}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <Card onPress={() => navigation.navigate('GroupDetails', { group: item })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>{item.name}</Text>
              </View>
              <Chip icon="chevron-forward-outline" onPress={() => navigation.navigate('GroupDetails', { group: item })}></Chip>
            </Row>
          </Card>
        )}
        ListEmptyComponent={<Subtitle>No groups yet - create your first one!</Subtitle>}
      />
      <KeyboardDismissBar />
    </Screen>
  );
}

const styles = StyleSheet.create({});
