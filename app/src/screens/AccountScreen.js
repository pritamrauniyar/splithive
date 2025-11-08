import React, { useState } from 'react';
import { Linking, Alert, StyleSheet } from 'react-native';
import { Screen, Title, Subtitle, Input, PrimaryButton, Row, Chip, Card } from '../ui/components';
import { useTheme } from '../ui/theme';
import { useAuth } from '../context/AuthContext';

export default function AccountScreen({ navigation }) {
  const { mode, setMode, theme } = useTheme();
  const { user, login, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [notif, setNotif] = useState(true);

  async function doLogin() {
    if (!email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email');
      return;
    }
    try {
      await login(email.trim(), name.trim() || undefined);
      setEmail(''); setName('');
    } catch (e) {
      Alert.alert('Login failed', e.message);
    }
  }

  function contactUs() {
    const mail = `mailto:support@splithive.app?subject=SplitHive%20Support&body=Hello%20SplitHive%20team,`;
    Linking.openURL(mail).catch(() => Alert.alert('Error', 'Unable to open mail app'));
  }

  async function deleteAccount() {
    Alert.alert('Delete account', 'This will permanently delete your account if there are no linked expenses or settlements. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const { auth } = await import('../lib/api');
          await auth.deleteAccount();
          await logout();
        } catch (e) {
          Alert.alert('Cannot delete account', e.message || 'Please settle any pending balances and remove related expenses before deleting.');
        }
      }}
    ]);
  }

  return (
    <Screen>
      <Title>Account</Title>
      {user ? (
        <>
          <Card>
            <Subtitle>Signed in as</Subtitle>
            <Row style={{ justifyContent:'space-between' }}>
              <Subtitle>{user.name || 'User'}</Subtitle>
              <Subtitle>{user.email}</Subtitle>
            </Row>
          </Card>
          <Row style={{ flexWrap:'wrap', marginTop: 12 }}>
            <Chip onPress={() => navigation.navigate('ChangePassword')} icon="key-outline" style={{ marginRight: 8, marginBottom: 8 }}>Change Password</Chip>
            <Chip onPress={deleteAccount} icon="trash-outline" style={{ marginRight: 8, marginBottom: 8 }}>Delete Account</Chip>
            <Chip onPress={contactUs} icon="mail-outline" style={{ marginRight: 8, marginBottom: 8 }}>Contact Us</Chip>
            <Chip onPress={logout} icon="log-out-outline" style={{ marginRight: 8, marginBottom: 8 }}>Log Out</Chip>
          </Row>
        </>
      ) : (
        <>
          <Subtitle>Sign in with your email</Subtitle>
          <Input placeholder="Your email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Input placeholder="Your name (optional)" value={name} onChangeText={setName} />
          <PrimaryButton title="Sign In" icon="log-in-outline" onPress={doLogin} />
        </>
      )}

      <Title style={{ marginTop: 16 }}>Appearance</Title>
      <Row style={{ flexWrap:'wrap' }}>
        <Chip onPress={() => setMode('system')} active={mode === 'system'} icon="phone-portrait-outline" style={{ marginRight: 8, marginBottom: 8 }}>System</Chip>
        <Chip onPress={() => setMode('light')} active={mode === 'light'} icon="sunny-outline" style={{ marginRight: 8, marginBottom: 8 }}>Light</Chip>
        <Chip onPress={() => setMode('dark')} active={mode === 'dark'} icon="moon-outline" style={{ marginRight: 8, marginBottom: 8 }}>Dark</Chip>
      </Row>

      <Title style={{ marginTop: 16 }}>Notifications</Title>
      <Row style={{ flexWrap:'wrap' }}>
        <Chip onPress={() => setNotif(!notif)} active={notif} icon="notifications-outline">Enable Notifications</Chip>
      </Row>

      
    </Screen>
  );
}

const styles = StyleSheet.create({});
