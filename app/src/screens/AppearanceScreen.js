import React from 'react';
import { StyleSheet } from 'react-native';
import { Screen, Title, Subtitle, Row, Chip } from '../ui/components';
import { useTheme } from '../ui/theme';

export default function AppearanceScreen() {
  const { mode, setMode } = useTheme();
  return (
    <Screen>
      <Title>Appearance</Title>
      <Subtitle>Choose how SplitHive matches your device theme.</Subtitle>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip onPress={() => setMode('system')} active={mode === 'system'} icon="phone-portrait-outline" style={{ marginRight: 8, marginBottom: 8 }}>System</Chip>
        <Chip onPress={() => setMode('light')} active={mode === 'light'} icon="sunny-outline" style={{ marginRight: 8, marginBottom: 8 }}>Light</Chip>
        <Chip onPress={() => setMode('dark')} active={mode === 'dark'} icon="moon-outline" style={{ marginRight: 8, marginBottom: 8 }}>Dark</Chip>
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({});

