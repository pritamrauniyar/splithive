import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Screen, Title, Input, PrimaryButton, Row, Chip, Subtitle, KeyboardDismissBar } from '../../ui/components';
import { toast } from '../../ui/toast';
import { useAuth } from '../../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      const msg = (e && e.message) ? String(e.message) : '';
      if (/not found/i.test(msg)) {
        // Inform and delay redirect for smoother UX
        toast('User not found. Redirecting to sign up...');
        setTimeout(() => {
          navigation.navigate('Signup', { email: email.trim() });
        }, 2200);
        return;
      } else {
        Alert.alert('Login failed', msg || 'Invalid credentials');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Title>Welcome back</Title>
      <Subtitle>Sign in to continue</Subtitle>
      <Input placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <PrimaryButton title={loading ? 'Signing in…' : 'Sign In'} icon="log-in-outline" onPress={submit} disabled={loading} />
      <Row style={{ marginTop: 12, flexWrap:'wrap' }}>
        <Chip onPress={() => navigation.navigate('Signup')} icon="person-add-outline" style={{ marginRight:8, marginBottom:8 }}>Create an account</Chip>
        <Chip onPress={() => navigation.navigate('ForgotPassword')} icon="key-outline" style={{ marginRight:8, marginBottom:8 }}>Forgot password</Chip>
      </Row>
      <KeyboardDismissBar />
    </Screen>
  );
}

const styles = StyleSheet.create({});
