import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Screen, Title, Input, PrimaryButton, Subtitle, KeyboardDismissBar } from '../../ui/components';
import { auth } from '../../lib/api';

export default function ResetPasswordScreen({ route, navigation }) {
  const presetEmail = route.params?.email || '';
  const [email, setEmail] = useState(presetEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.includes('@') || code.length < 4 || password.length < 6) {
      Alert.alert('Invalid', 'Check email, code and new password (6+ chars)');
      return;
    }
    setLoading(true);
    try {
      await auth.resetPassword(email.trim(), code.trim(), password);
      Alert.alert('Password updated', 'You can now sign in', [
        { text: 'OK', onPress: () => navigation.navigate('Login') }
      ]);
    } catch (e) {
      Alert.alert('Reset failed', e.message || 'Please check code and try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Title>Reset password</Title>
      <Subtitle>Enter the 6-digit code you received and your new password.</Subtitle>
      <Input placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Input placeholder="6-digit code" keyboardType="number-pad" autoCapitalize="none" maxLength={6} value={code} onChangeText={setCode} />
      <Input placeholder="New password" secureTextEntry value={password} onChangeText={setPassword} />
      <PrimaryButton title={loading ? 'Updating…' : 'Update password'} icon="key-outline" onPress={submit} disabled={loading} />
      <KeyboardDismissBar />
    </Screen>
  );
}

const styles = StyleSheet.create({});
