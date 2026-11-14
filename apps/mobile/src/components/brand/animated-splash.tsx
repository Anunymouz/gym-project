import { useEffect, useId } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { brand } from '@bgym/shared';
import { colors, fonts } from '@/theme';
import {
  MARK_ASPECT,
  MARK_ORIGIN,
  MARK_VIEWBOX,
  MarkBells,
  MarkBody,
  ORBIT,
  WORDMARK_ASPECT,
  WORDMARK_LETTERS,
  WORDMARK_VIEWBOX,
} from './generated';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Approximate length of half the orbit ellipse (Ramanujan), used to "draw" each half. */
const HALF_RING = (Math.PI * (3 * (ORBIT.rx + ORBIT.ry) - Math.sqrt((3 * ORBIT.rx + ORBIT.ry) * (ORBIT.rx + 3 * ORBIT.ry)))) / 2 + 4;
const ease = Easing.bezier(0.2, 0.9, 0.25, 1.12);
const out = Easing.out(Easing.cubic);

/**
 * The BGYM opening animation (design/splash). About 2.5 s:
 * dot pops in, athlete rises, orbit draws while the dot laps it, dumbbells lift,
 * B·G·Y·M rise in, tagline fades, then the overlay fades out and calls onFinish.
 */
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const id = useId().replace(/:/g, '');
  const markW = Math.min(width * 0.62, 260);
  const markH = markW / MARK_ASPECT;
  const wordH = Math.min(46, markW * 0.2);

  const glow = useSharedValue(0);
  const dotScale = useSharedValue(0);
  const angle = useSharedValue(ORBIT.restAngle - 2 * Math.PI);
  const athlete = useSharedValue(0);
  const lift = useSharedValue(0);
  const ring = useSharedValue(0);
  const ringFront = useSharedValue(0);
  const tagline = useSharedValue(0);
  const exit = useSharedValue(1);
  const l0 = useSharedValue(0);
  const l1 = useSharedValue(0);
  const l2 = useSharedValue(0);
  const l3 = useSharedValue(0);
  const letters = [l0, l1, l2, l3];

  useEffect(() => {
    if (reduceMotion) {
      for (const v of [glow, dotScale, athlete, ring, ringFront, tagline, ...letters]) v.value = 1;
      angle.value = ORBIT.restAngle;
      exit.value = withDelay(700, withTiming(0, { duration: 250 }, (done) => done && scheduleOnRN(onFinish)));
      return;
    }
    glow.value = withTiming(1, { duration: 900, easing: out });
    dotScale.value = withSequence(withTiming(1.25, { duration: 140 }), withTiming(1, { duration: 120 }));
    athlete.value = withDelay(250, withTiming(1, { duration: 600, easing: ease }));
    ring.value = withDelay(620, withTiming(1, { duration: 550, easing: Easing.inOut(Easing.cubic) }));
    ringFront.value = withDelay(780, withTiming(1, { duration: 550, easing: Easing.inOut(Easing.cubic) }));
    angle.value = withDelay(620, withTiming(ORBIT.restAngle, { duration: 850, easing: Easing.inOut(Easing.cubic) }));
    lift.value = withDelay(720, withSequence(withTiming(1, { duration: 230 }), withTiming(0, { duration: 190 })));
    letters.forEach((v, i) => {
      v.value = withDelay(1220 + i * 70, withTiming(1, { duration: 420, easing: ease }));
    });
    tagline.value = withDelay(1600, withTiming(1, { duration: 450, easing: out }));
    exit.value = withDelay(2550, withTiming(0, { duration: 450 }, (done) => done && scheduleOnRN(onFinish)));
    // Shared values are stable; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: exit.value, transform: [{ scale: 1 + (1 - exit.value) * 0.06 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.6 + glow.value * 0.4 }] }));
  const athleteStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, athlete.value * 1.6),
    transform: [{ translateY: (1 - athlete.value) * markH * 0.16 }, { scale: 0.84 + athlete.value * 0.16 }],
  }));
  const bellsStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, athlete.value * 1.6),
    transform: [{ translateY: (1 - athlete.value) * markH * 0.16 - lift.value * 9 }, { scale: 0.84 + athlete.value * 0.16 }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: tagline.value, transform: [{ translateY: (1 - tagline.value) * 8 }] }));

  const backRingProps = useAnimatedProps(() => ({ strokeDashoffset: HALF_RING * (1 - ring.value), opacity: ring.value > 0.01 ? 1 : 0 }));
  const frontRingProps = useAnimatedProps(() => ({ strokeDashoffset: HALF_RING * (1 - ringFront.value), opacity: ringFront.value > 0.01 ? 1 : 0 }));
  // The dot is drawn twice: behind the athlete on the back half of the orbit, in front on the front half.
  const backDot = useAnimatedProps(() => dotAt(angle.value, dotScale.value, false));
  const frontDot = useAnimatedProps(() => dotAt(angle.value, dotScale.value, true));

  const layer = (children: React.ReactNode) => (
    <Svg width={markW} height={markH} viewBox={MARK_VIEWBOX} style={StyleSheet.absoluteFill}>
      <G transform={MARK_ORIGIN}>{children}</G>
    </Svg>
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} accessibilityLabel={`${brand.name}. ${brand.tagline}`} accessible>
      <LinearGradient colors={[colors.indigo, colors.midnight, colors.midnight]} locations={[0, 0.62, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.glow, { width: markW * 1.9, height: markW * 1.9 }, glowStyle]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={`${id}-glow`} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={colors.flare} stopOpacity={0.34} />
              <Stop offset="0.55" stopColor={colors.flare} stopOpacity={0.1} />
              <Stop offset="1" stopColor={colors.flare} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill={`url(#${id}-glow)`} />
        </Svg>
      </Animated.View>

      <View style={{ width: markW, height: markH }}>
        {layer(
          <>
            <AnimatedPath animatedProps={backRingProps} transform={ORBIT.transform} d={ORBIT.backD} fill="none" stroke={colors.white} strokeWidth={ORBIT.strokeWidth} strokeLinecap="round" strokeDasharray={[HALF_RING, HALF_RING]} />
            <AnimatedCircle animatedProps={backDot} transform={ORBIT.transform} fill={colors.flare} />
          </>,
        )}
        <Animated.View style={[StyleSheet.absoluteFill, athleteStyle]}>{layer(<MarkBody ink={colors.white} id={id} />)}</Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, bellsStyle]}>{layer(<MarkBells accent={colors.flare} />)}</Animated.View>
        {layer(
          <>
            <AnimatedPath animatedProps={frontRingProps} transform={ORBIT.transform} d={ORBIT.frontD} fill="none" stroke={colors.white} strokeWidth={ORBIT.strokeWidth} strokeLinecap="round" strokeDasharray={[HALF_RING, HALF_RING]} />
            <AnimatedCircle animatedProps={frontDot} transform={ORBIT.transform} fill={colors.flare} />
          </>,
        )}
      </View>

      <View style={{ width: wordH * WORDMARK_ASPECT, height: wordH, marginTop: wordH * 0.6 }}>
        {WORDMARK_LETTERS.map((l, i) => (
          <Letter key={i} d={l.d} fill={l.accent ? colors.flare : colors.white} progress={letters[i]!} height={wordH} />
        ))}
      </View>
      <Animated.Text style={[styles.tagline, taglineStyle]}>{brand.tagline}</Animated.Text>
    </Animated.View>
  );
}

function dotAt(theta: number, scale: number, front: boolean) {
  'worklet';
  const s = Math.sin(theta);
  return {
    cx: ORBIT.cx + ORBIT.rx * Math.cos(theta),
    cy: ORBIT.cy + ORBIT.ry * s,
    r: ORBIT.dotR * scale,
    opacity: (front ? s >= 0 : s < 0) ? 1 : 0,
  };
}

function Letter({ d, fill, progress, height }: { d: string; fill: string; progress: SharedValue<number>; height: number }) {
  const style = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * height * 0.4 }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg width={height * WORDMARK_ASPECT} height={height} viewBox={WORDMARK_VIEWBOX}>
        <Path d={d} fill={fill} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', zIndex: 100, backgroundColor: colors.midnight },
  glow: { position: 'absolute', top: '16%' },
  tagline: { marginTop: 14, fontFamily: fonts.medium, fontSize: 16, color: colors.onDarkMuted },
});
