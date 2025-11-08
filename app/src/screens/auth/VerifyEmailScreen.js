import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Screen, Title, Input, PrimaryButton, Subtitle, Row, Chip, KeyboardDismissBar } from '../../ui/components';
import { useAuth } from '../../context/AuthContext';

export default function VerifyEmailScreen({ route, navigation }) {
  const { verifyEmail, requestVerification } = useAuth();
  const presetToken = route.params?.token || '';
  const presetEmail = route.params?.email || '';
  const [token, setToken] = useState(presetToken);
  const [email, setEmail] = useState(presetEmail);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!token.trim()) return;
    setLoading(true);
    try {
      await verifyEmail(token.trim());
      // AuthProvider sets token & user; stack will switch automatically
    } catch (e) {
      Alert.alert('Verification failed', e.message || 'Invalid token');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (!email.includes('@')) {
      Alert.alert('Enter your email to resend token');
      return;
    }
    try {
      const res = await requestVerification(email.trim());
      Alert.alert('Verification token', `Dev-only token: ${res.verify_token}`);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not resend');
    }
  }

  return (
    <Screen>
      <Title>Verify your email</Title>
      <Subtitle>Enter the 6-digit code sent to your email.</Subtitle>
      <Input placeholder="6-digit code" value={token} onChangeText={setToken} keyboardType="number-pad" autoCapitalize="none" maxLength={6} />
      <PrimaryButton title={loading ? 'Verifying…' : 'Verify'} icon="checkmark-done-outline" onPress={submit} disabled={loading} />
      <Subtitle style={{ marginTop: 12 }}>Didn’t get a code? Resend:</Subtitle>
      <Input placeholder="Your email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Row><Chip onPress={resend} icon="mail-outline">Resend</Chip></Row>
      <KeyboardDismissBar />
    </Screen>
  );
}

const styles = StyleSheet.create({});
