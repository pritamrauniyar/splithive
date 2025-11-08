import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { Screen, Title, Input, PrimaryButton, KeyboardDismissBar } from '../ui/components';
import { toast } from '../ui/toast';

export default function AddMemberScreen({ route, navigation }) {
  const { group } = route.params;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!name.trim()) { Alert.alert('Full name required', 'Please enter the member\'s full name.'); return; }
    if (!email.trim() || !email.includes('@')) { Alert.alert('Valid email required', 'Please enter a valid email address.'); return; }
    setLoading(true);
    try {
      await api.groups.addMember(group.id, { name: name.trim(), email: email.trim() });
      toast('Invitation sent');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error adding member', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Title>Add Member to {group.name}</Title>
      <Input value={name} onChangeText={setName} placeholder="Full name" />
      <Input value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" />
      <PrimaryButton title={loading ? 'Saving...' : 'Save'} icon="person-add-outline" onPress={save} disabled={loading} />
      <KeyboardDismissBar />
    </Screen>
  );
}

const styles = StyleSheet.create({});
