import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Animated, Platform, Keyboard } from 'react-native';
import { useTheme } from '../ui/theme';
import { useFadeIn } from './AnimatedUtils';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function Screen({ children, style }) {
  const { theme } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing }, style]}>
      {children}
    </View>
  );
}

export function FormScreen({ children, style }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={[{ padding: theme.spacing, flex: 1 }, style]}>
        {children}
      </View>
    </View>
  );
}

export function Title({ children, style }) {
  const { theme } = useTheme();
  return <Text style={[{ fontSize: 24, fontWeight: '700', color: theme.colors.text, marginBottom: 8 }, style]}>{children}</Text>;
}

export function Subtitle({ children, style }) {
  const { theme } = useTheme();
  return <Text style={[{ fontSize: 14, color: theme.colors.subtext, marginBottom: 8 }, style]}>{children}</Text>;
}

export function Card({ children, style, onPress }) {
  const { theme } = useTheme();
  const opacity = useFadeIn(300);
  const base = (
    <Animated.View style={[{ opacity, backgroundColor: theme.colors.card, borderRadius: theme.radius, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing }, theme.shadow, style]}>
      {children}
    </Animated.View>
  );
  if (!onPress) return base;
  return (
    <Pressable android_ripple={{ color: '#0003' }} onPress={onPress} style={{ borderRadius: theme.radius }}>
      {base}
    </Pressable>
  );
}

export function PrimaryButton({ title, onPress, style, disabled, icon }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[{ borderRadius: 10, overflow: 'hidden' }, style]}>
      {disabled ? (
        <View style={{ backgroundColor: '#6b7280', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' }}>
          <Row gap={8}>
            {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
            <Text style={{ color: 'white', fontWeight: '700' }}>{title}</Text>
          </Row>
        </View>
      ) : (
        <LinearGradient colors={[theme.colors.primary, theme.colors.primaryAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' }}>
          <Row gap={8}>
            {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
            <Text style={{ color: 'white', fontWeight: '700' }}>{title}</Text>
          </Row>
        </LinearGradient>
      )}
    </Pressable>
  );
}

export function OutlineButton({ title, onPress, style }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} android_ripple={{ color: '#fff1' }} style={[{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' }, style]}>
      <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Input({ value, onChangeText, placeholder, keyboardType, style, multiline, ...rest }) {
  const { theme } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.subtext}
      keyboardType={keyboardType}
      multiline={multiline}
      {...rest}
      style={[{
        color: theme.colors.text,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12
      }, style]}
    />
  );
}

export function Chip({ children, active, onPress, style, icon, iconSize = 18 }) {
  const { theme } = useTheme();
  const isIconOnly = children === undefined || children === null;
  const content = (
    <Row gap={6}>
      {icon ? <Ionicons name={icon} size={iconSize} color={active ? '#fff' : theme.colors.text} /> : null}
      {!isIconOnly ? (
        <Text style={{ color: active ? 'white' : theme.colors.text, fontWeight: '600' }}>{children}</Text>
      ) : null}
    </Row>
  );
  return (
    <Pressable onPress={onPress} android_ripple={{ color: '#0003' }} style={[{
      paddingVertical: isIconOnly ? 8 : 6,
      paddingHorizontal: isIconOnly ? 8 : 10,
      minWidth: isIconOnly ? 36 : undefined,
      minHeight: isIconOnly ? 36 : undefined,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: isIconOnly ? 18 : 999,
      backgroundColor: active ? theme.colors.primary : theme.colors.chip,
      borderWidth: 1,
      borderColor: active ? theme.colors.primary : theme.colors.border
    }, style]}>
      {content}
    </Pressable>
  );
}

export function Row({ children, style, gap = 8 }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Avatar({ name, size = 36 }) {
  const { theme } = useTheme();
  const initials = (name || '?')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.chip, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

export function SectionTitle({ children }) {
  const { theme } = useTheme();
  return <Text style={{ color: theme.colors.subtext, fontWeight: '700', marginTop: 8, marginBottom: 6, letterSpacing: 0.4 }}>{children}</Text>;
}

export function KeyboardDismissBar() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const isIOS = Platform.OS === 'ios';

  useEffect(() => {
    if (!isIOS) return; // do nothing on Android
    const onShow = (e) => {
      setKbHeight(e?.endCoordinates?.height || 0);
      setVisible(true);
    };
    const onHide = () => {
      setVisible(false);
      setKbHeight(0);
    };
    const s1 = Keyboard.addListener('keyboardDidShow', onShow);
    const s2 = Keyboard.addListener('keyboardDidHide', onHide);
    return () => { s1.remove(); s2.remove(); };
  }, [isIOS]);

  // Only render on iOS when visible
  if (!isIOS || !visible) return null;
  // Position the button closer to the keyboard edge (avoid large gap)
  const bottomOffset = Math.max(4, kbHeight - 50);
  return (
    <View style={{ position: 'absolute', right: 12, bottom: bottomOffset }}>
      <Pressable onPress={() => Keyboard.dismiss()} style={{ borderRadius: 16, overflow: 'hidden' }}>
        <LinearGradient colors={[theme.colors.card, theme.colors.chip]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }}>
          <Ionicons name="chevron-down-outline" size={24} color={theme.colors.text} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}
