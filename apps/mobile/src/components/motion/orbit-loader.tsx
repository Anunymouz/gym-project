import { useEffect } from 'react';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { colors } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Brand loader: the orange dot orbiting a tilted ring, like the BGYM mark. */
export function OrbitLoader({ size = 44, color = colors.midnight }: { size?: number; color?: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);

  const dot = useAnimatedProps(() => {
    const a = t.value * Math.PI * 2;
    return { cx: 22 + 17 * Math.cos(a), cy: 22 + 6 * Math.sin(a), r: 3.2 + Math.sin(a) * 0.9 };
  });

  return (
    <Svg width={size} height={size} viewBox="0 0 44 44" accessibilityLabel="Loading">
      <Ellipse cx={22} cy={22} rx={17} ry={6} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={2} transform="rotate(-14 22 22)" />
      <AnimatedCircle animatedProps={dot} fill={colors.flare} transform="rotate(-14 22 22)" />
    </Svg>
  );
}
