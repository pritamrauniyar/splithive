import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text } from 'react-native';
import { useTheme } from './theme';
import { on } from '../realtime/bus';

export function toast(message) {
  // Unified in-app toast for both iOS and Android for consistent UX
  window.__toastQueue = window.__toastQueue || [];
  window.__toastQueue.push(message);
  if (window.__emitToast) window.__emitToast(message);
}

export function ToastHost() {
  const { theme } = useTheme();
  const [msg, setMsg] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    function handle(message) {
      setMsg(message);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => {
        setTimeout(() => {
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        }, 2000);
      });
    }
    window.__emitToast = handle;
    const off = on('toast', handle);
    return () => { off(); if (window.__emitToast === handle) window.__emitToast = null; };
  }, [opacity]);

  if (!msg) return null;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        opacity,
        justifyContent: 'center',
        alignItems: 'center'
      }}
      pointerEvents="none"
    >
      <View
        style={{
          backgroundColor: theme.colors.card,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          maxWidth: '80%'
        }}
      >
        <Text style={{ color: theme.colors.text, fontWeight: '600', textAlign: 'center' }}>{msg}</Text>
      </View>
    </Animated.View>
  );
}
