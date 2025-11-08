import React, { useState } from 'react';
import { StyleSheet, Alert } from 'react-native';
import { api } from '../lib/api';
import { Screen, Title, Input, PrimaryButton, Row, Chip, Subtitle, KeyboardDismissBar } from '../ui/components';

export default function JoinViaInviteScreen({ navigation }) {
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [info, setInfo] = useState(null);

  async function check() {
    try {
      const res = await api.invites.validate(token.trim());
      setInfo(res);
      Alert.alert('Valid', `Invite for group ${res.group_id}`);
    } catch (e) {
      setInfo(null);
      Alert.alert('Invalid', e.message);
    }
  }

  async function redeem() {
    if (!token.trim() || !name.trim()) return;
    try {
      const res = await api.invites.redeem({ token: token.trim(), name: name.trim(), email: email.trim() || undefined });
      Alert.alert('Joined', `Added to group ${res.group_id}`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  return (
    <Screen>
      <Title>Join via Invite</Title>
      <Input value={token} onChangeText={setToken} placeholder="Paste token" autoCapitalize="none" />
      <Row style={{ marginBottom: 8 }}>
        <Chip onPress={check} icon="search-outline">Check</Chip>
      </Row>
      <Subtitle>Enter your details:</Subtitle>
      <Input value={name} onChangeText={setName} placeholder="Full name" />
      <Input value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" />
      <PrimaryButton title="Join Group" icon="log-in-outline" onPress={redeem} />
      <KeyboardDismissBar />
    </Screen>
  );
}

const styles = StyleSheet.create({});
