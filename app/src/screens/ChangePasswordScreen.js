import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Screen, Title, Input, PrimaryButton, Subtitle, KeyboardDismissBar } from '../ui/components';
import { auth } from '../lib/api';

export default function ChangePasswordScreen({ navigation }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (newPw.length < 6) {
      Alert.alert('New password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await auth.changePassword(oldPw, newPw);
      setOldPw('');
      setNewPw('');
      Alert.alert('Password changed', 'Your password has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not change password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Title>Change Password</Title>
      <Subtitle>Enter your current password and a new password.</Subtitle>
      <Input placeholder="Current password" secureTextEntry value={oldPw} onChangeText={setOldPw} />
      <Input placeholder="New password" secureTextEntry value={newPw} onChangeText={setNewPw} />
      <PrimaryButton title={loading ? 'Updating…' : 'Update Password'} icon="key-outline" onPress={submit} disabled={loading} />
      <KeyboardDismissBar />
    </Screen>
  );
}

const styles = StyleSheet.create({});
