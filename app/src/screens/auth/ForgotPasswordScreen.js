import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Screen, Title, Input, PrimaryButton, Subtitle, Chip, Row, Card, KeyboardDismissBar } from '../../ui/components';
import { auth } from '../../lib/api';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [countHour, setCountHour] = useState(null);
  const [maxPerHour, setMaxPerHour] = useState(5);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  async function submit() {
    if (!email.includes('@')) { Alert.alert('Enter a valid email'); return; }
    setLoading(true);
    try {
      const res = await auth.forgotPassword(email.trim());
      if (res && typeof res.count_hour === 'number') setCountHour(res.count_hour);
      if (res && typeof res.max_per_hour === 'number') setMaxPerHour(res.max_per_hour);
      navigation.navigate('ResetPassword', { email: email.trim() });
    } catch (e) {
      try {
        const data = JSON.parse(e.message || '{}');
        if (data.retry_after) setSecondsLeft(Number(data.retry_after));
        if (typeof data.count_hour === 'number') setCountHour(data.count_hour);
        if (typeof data.max_per_hour === 'number') setMaxPerHour(data.max_per_hour);
      } catch {}
      // Show a gentle hint; stay on this screen so user can see countdown
      Alert.alert('Please wait', 'You have requested a code recently. Try again after the countdown.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Title>Forgot password</Title>
      <Subtitle>Enter your email to receive a 6-digit reset code.</Subtitle>
      <Input placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      {secondsLeft > 0 ? (
        <Card style={{ padding: 10, marginBottom: 8 }}>
          <Text style={{ color: '#bbb' }}>You can request another code in {secondsLeft}s.</Text>
        </Card>
      ) : null}
      <PrimaryButton title={loading ? 'Sending…' : 'Send code'} icon="send-outline" onPress={submit} disabled={loading || secondsLeft > 0} />
      <Row style={{ marginTop: 12 }}>
        <Subtitle>{`Up to ${maxPerHour} codes per hour${countHour !== null ? ` — you’ve requested ${countHour} in the last hour` : ''}.`}</Subtitle>
      </Row>
      <KeyboardDismissBar />
    </Screen>
  );
}

const styles = StyleSheet.create({});
