import { useEffect, useRef } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function useFadeIn(duration = 350, delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [delay, duration, opacity]);
  return opacity;
}

export function withEase() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

