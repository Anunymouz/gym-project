import { useEffect } from 'react';
import type { DimensionValue, ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/** Shimmering placeholder block shown while content loads. */
export function Skeleton({ width = '100%', height, radius = 10, style }: { width?: DimensionValue; height: number; radius?: number; style?: ViewStyle }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(p);
  }, [p]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + p.value * 0.45 }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: '#E3E6EF' }, style, animated]} />;
}
