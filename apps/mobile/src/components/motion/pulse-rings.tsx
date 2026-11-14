import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

/** Soft rings radiating from an element ("signal sent"). */
export function PulseRings({ children, size, color, rings = 2 }: { children: ReactNode; size: number; color: string; rings?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: rings }, (_, i) => (
        <Ring key={i} size={size} color={color} delay={i * 900} />
      ))}
      {children}
    </View>
  );
}

function Ring({ size, color, delay }: { size: number; color: string; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(p);
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - p.value), transform: [{ scale: 1 + p.value * 0.9 }] }));
  return <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size * 0.32, borderWidth: 2, borderColor: color }, style]} />;
}
