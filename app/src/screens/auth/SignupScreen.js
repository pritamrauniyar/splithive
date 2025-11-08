import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Screen, Title, Input, PrimaryButton, Row, Chip, Subtitle, KeyboardDismissBar } from '../../ui/components';
import { useAuth } from '../../context/AuthContext';

export default function SignupScreen({ navigation, route }) {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const prefillEmail = route?.params?.email;
    if (prefillEmail && !email) setEmail(prefillEmail);
  }, [route]);

  async function submit() {
    if (!name.trim() || !email.includes('@') || password.length < 6) {
      Alert.alert('Invalid', 'Please fill name, valid email and a 6+ char password');
      return;
    }
    setLoading(true);
    try {
      const res = await signup(name.trim(), email.trim(), password);
      // Navigate to verify with the token (dev convenience)
      navigation.navigate('VerifyEmail', { email: email.trim(), token: res.verify_token });
    } catch (e) {
      Alert.alert('Sign up failed', e.message || 'Try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Title>Create your account</Title>
      <Input placeholder="Full name" value={name} onChangeText={setName} />
      <Input placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <PrimaryButton title={loading ? 'Creating…' : 'Sign Up'} icon="person-add-outline" onPress={submit} disabled={loading} />
      <Row style={{ marginTop: 12 }}>
        <Chip onPress={() => navigation.navigate('Login')} icon="log-in-outline">I have an account</Chip>
      </Row>
      <KeyboardDismissBar />
    </Screen>
  );
}

const styles = StyleSheet.create({});
