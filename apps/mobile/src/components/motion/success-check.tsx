import { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LENGTH = 26;

/** Green disc that springs in, then a checkmark that draws itself. */
export function SuccessCheck({ size = 56 }: { size?: number }) {
  const disc = useSharedValue(0);
  const tick = useSharedValue(0);
  useEffect(() => {
    disc.value = withSpring(1, { damping: 11, stiffness: 180 });
    tick.value = withDelay(140, withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }));
  }, [disc, tick]);

  const discStyle = useAnimatedStyle(() => ({ transform: [{ scale: disc.value }], opacity: Math.min(1, disc.value * 2) }));
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LENGTH * (1 - tick.value) }));

  return (
    <Animated.View style={discStyle} accessibilityLabel="Verified">
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Circle cx={20} cy={20} r={20} fill={colors.success} />
        <AnimatedPath
          animatedProps={tickProps}
          d="M12 20.5l5.5 5.5L28.5 15"
          fill="none"
          stroke={colors.white}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[CHECK_LENGTH, CHECK_LENGTH]}
        />
      </Svg>
    </Animated.View>
  );
}
